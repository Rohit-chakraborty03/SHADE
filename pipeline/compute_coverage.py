"""
Real walking-distance coverage per ward, from OpenStreetMap streets + a population raster.

For every ward it answers: what share of (vulnerable) people can walk to an existing
facility (water point, hospital, clinic...) within R metres along real streets?
It also computes the straight-line "circle" version, so the gap between the two is measured, not assumed.

Install:   pip install osmnx geopandas rasterio numpy pandas scipy shapely
Run:
    python compute_coverage.py --wards wards.geojson --ward-field WARD \
        --pop "worldpop/*.tif" \
        [--vuln-share vuln_share.csv] [--radii 200 300 500]

Inputs
  --wards       GeoJSON/shapefile with the 141 ward polygons (any CRS).
  --ward-field  column that identifies the ward (ward number or name).
  --pop         population raster, e.g. WorldPop 100 m "ppp" (people per cell), EPSG:4326.
  --vuln-share  optional CSV with columns: ward, share  (share of residents who are 60+ or under 6,
                0..1). If omitted, ALL residents are counted and the output says so.

Outputs: coverage_by_ward.csv and coverage_by_ward.json (one row per ward and radius).
"""
import argparse, glob, json, sys
import numpy as np, pandas as pd, geopandas as gpd
import osmnx as ox, networkx as nx, rasterio
from rasterio.windows import from_bounds
from scipy.spatial import cKDTree

GROUPS = {
    "water": {"amenity": ["drinking_water"]},
    "health": {"amenity": ["hospital", "clinic", "doctors"]},
    "all": {"amenity": ["drinking_water", "hospital", "clinic", "doctors"]},
}
# NOTE: OSM has no tag for "cool rooms" or ORS stalls. Add your own points with --extra-facilities if you have them.


def load_population(paths, bounds):
    """Sum one or more same-grid rasters (e.g. all WorldPop age files, or one total file).
    Returns a GeoDataFrame of raster cell centres (EPSG:4326) with a 'pop' column."""
    total = tf = crs = None
    for path in paths:
        with rasterio.open(path) as src:
            win = from_bounds(*bounds, transform=src.transform)
            arr = src.read(1, window=win, masked=True).filled(0).astype(float)
            arr[arr < 0] = 0
            if total is None:
                total, tf, crs = arr, src.window_transform(win), src.crs
            elif arr.shape != total.shape:
                sys.exit(f"{path} is not on the same grid as the first raster.")
            else:
                total += arr
    rows, cols = np.where(total > 0)
    xs, ys = rasterio.transform.xy(tf, rows, cols)
    return gpd.GeoDataFrame({"pop": total[rows, cols]}, geometry=gpd.points_from_xy(xs, ys), crs=crs)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--wards", required=True)
    ap.add_argument("--ward-field", default="WARD")
    ap.add_argument("--pop", required=True, nargs="+",
                    help="one total-population raster, OR several same-grid rasters that are summed (wildcards like worldpop/*.tif work)")
    ap.add_argument("--vuln-share")
    ap.add_argument("--facilities", choices=list(GROUPS), default="all",
                    help="which OSM facility group counts (use 'water' for coverage_water_point.json)")
    ap.add_argument("--extra-facilities", help="optional CSV with lat,lon columns of extra facilities")
    ap.add_argument("--radii", type=int, nargs="+", default=[200, 300, 500])
    ap.add_argument("--out", default="coverage_by_ward")
    a = ap.parse_args()
    rmax = max(a.radii)

    wards = gpd.read_file(a.wards).to_crs(4326)
    wards["ward"] = wards[a.ward_field].astype(str)
    from osm_fetch import walk_graph_by_ward, features_by_ward

    print("Downloading walking network from OpenStreetMap (can take several minutes)...")
    G = ox.project_graph(walk_graph_by_ward(wards, "ward"))
    crs = G.graph["crs"]

    print("Downloading facilities...")
    feats = features_by_ward(wards, "ward", GROUPS[a.facilities], "fac_" + a.facilities, margin_deg=0.006)
    fac = gpd.GeoDataFrame(geometry=feats.geometry.representative_point(), crs=4326)
    fac = fac[~fac.geometry.duplicated()]
    if a.extra_facilities:
        ex = pd.read_csv(a.extra_facilities)
        fac = pd.concat([fac, gpd.GeoDataFrame(geometry=gpd.points_from_xy(ex.lon, ex.lat), crs=4326)])
    fac = fac.to_crs(crs).reset_index(drop=True)
    print(f"  {len(fac)} facilities found")
    if fac.empty:
        sys.exit("No facilities found, nothing to compute.")

    print("Loading population...")
    pop_files = []
    for p in a.pop:
        pop_files += sorted(glob.glob(p)) or [p]
    print(f"  summing {len(pop_files)} population raster(s)")
    pts = load_population(pop_files, wards.total_bounds)
    pts = gpd.sjoin(pts, wards[["ward", "geometry"]], predicate="within").drop(columns="index_right")
    pts = pts.to_crs(crs)
    print(f"  {len(pts)} populated cells, {pts['pop'].sum():,.0f} people")

    # vulnerable people = cell population x ward vulnerable share
    if a.vuln_share:
        vs = pd.read_csv(a.vuln_share)
        vs["ward"] = vs["ward"].astype(str)
        pts = pts.merge(vs.rename(columns={"share": "vshare"}), on="ward", how="left")
        pts["vshare"] = pts["vshare"].fillna(1.0)
        basis = "vulnerable people (population x ward share you supplied)"
    else:
        pts["vshare"] = 1.0
        basis = "ALL residents (no vulnerable share supplied)"
    pts["vpop"] = pts["pop"] * pts["vshare"]

    # --- street-network distance: one multi-source Dijkstra from all facilities ---
    fx, fy = fac.geometry.x.values, fac.geometry.y.values
    f_nodes, f_snap = ox.distance.nearest_nodes(G, fx, fy, return_dist=True)
    # drop facilities that are far from any walkable street (bad tags / outside network)
    sources = {int(n): float(d) for n, d in zip(f_nodes, f_snap) if d <= 100}
    # start each source at its snap distance so the walk from the facility to the street counts too
    G.add_node("S")
    for n, d in sources.items():
        G.add_edge("S", n, length=d)
    dist = nx.single_source_dijkstra_path_length(G, "S", cutoff=rmax, weight="length")
    dist.pop("S", None)

    # each home walks to its nearest street node (snap) and then along the network
    px, py = pts.geometry.x.values, pts.geometry.y.values
    h_nodes, h_snap = ox.distance.nearest_nodes(G, px, py, return_dist=True)
    net = np.array([dist.get(int(n), np.inf) for n in h_nodes]) + np.asarray(h_snap)

    # --- straight-line circle: distance to nearest facility ---
    circ, _ = cKDTree(np.c_[fx, fy]).query(np.c_[px, py])

    rows = []
    for r in a.radii:
        pts["net_ok"] = net <= r
        pts["circ_ok"] = circ <= r
        for w, g in pts.groupby("ward"):
            tot = g["vpop"].sum()
            n_cov, c_cov = g.loc[g.net_ok, "vpop"].sum(), g.loc[g.circ_ok, "vpop"].sum()
            rows.append({
                "ward": w, "radius_m": r, "people_counted": round(tot),
                "covered_street": round(n_cov), "covered_circle": round(c_cov),
                "coverage_street": round(n_cov / tot, 4) if tot else None,
                "coverage_circle": round(c_cov / tot, 4) if tot else None,
                "circle_overstates_pct": round(100 * (c_cov - n_cov) / n_cov, 1) if n_cov else None,
                "uncovered_street": round(tot - n_cov),
                "basis": basis,
            })
    out = pd.DataFrame(rows)
    out.to_csv(a.out + ".csv", index=False)
    json.dump(rows, open(a.out + ".json", "w"), indent=1)
    print(out[out.radius_m == 300].describe().T[["mean", "min", "max"]])
    print(f"Wrote {a.out}.csv and {a.out}.json")


if __name__ == "__main__":
    main()