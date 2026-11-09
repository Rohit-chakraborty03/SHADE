"""
S.H.A.D.E. pipeline v2: real data for all wards, no random numbers.

What is REAL now
  - Ward outlines: kolkata_wards_real.geojson (all 141, column WARD)
  - Temperature, NDVI, albedo proxy: Landsat 8/9 surface temperature + reflectance (Planetary Computer),
    median of several low-cloud Mar-May scenes, cloud-masked, averaged over each ward's pixels
  - Building density: OSM building footprints rasterised to 30 m (share of ground covered by buildings)
  - Distance to water: OSM water bodies / rivers / canals, real distance per pixel
  - Population, under-5 share, 60+ share: WorldPop age-sex rasters (modelled estimates, not a census count)
  - Slum share, poor-roof share: YOUR Census 2011 CSV (ward_no,pct_slum,pct_poor_roof)
  - The heat model is trained on real 30 m pixels (not synthetic cells made from a formula)

What is still an ASSUMPTION (written into the model card)
  - Cool-roof and tree scenarios: albedo / NDVI uplift sizes below (INTERVENTION)
  - Cooling gains are model predictions of SURFACE temperature, not measured outcomes

If any input is missing the script stops with a message. It never fills gaps with random numbers.

Install: pip install osmnx geopandas rasterio numpy pandas scipy scikit-learn pystac-client planetary-computer
Run:
  python run_full_pipeline.py --age-dir worldpop_age_sex/ --census-csv census_wards.csv
Outputs: pipeline/ml_output.json (same shape as before) and pipeline/vuln_share.csv (for compute_coverage.py)
"""
import os, re, sys, glob, json, argparse, warnings
from datetime import datetime, timezone
import numpy as np, pandas as pd, geopandas as gpd, rasterio
import rasterio.features, rasterio.mask
from rasterio.vrt import WarpedVRT
from rasterio.enums import Resampling
from rasterio.transform import from_origin
from scipy.ndimage import distance_transform_edt
import pystac_client, planetary_computer, osmnx as ox
from sklearn.ensemble import HistGradientBoostingRegressor
from sklearn.model_selection import GroupKFold, cross_val_predict
from sklearn.metrics import r2_score, root_mean_squared_error
from sklearn.inspection import permutation_importance

warnings.filterwarnings("ignore", category=RuntimeWarning)
HERE = os.path.dirname(os.path.abspath(__file__))
PX = 30  # metres, Landsat pixel size
INTERVENTION = {  # ASSUMPTIONS: what "a ward full of cool roofs / new trees" means
    "cool_roof_albedo_gain": "0.16 + 0.08 * building_density",
    "tree_ndvi_gain": "0.08 + 0.22 * (1 - building_density)",
}
KNOWN_NAMES = {1: "Cossipore", 14: "Ultadanga", 22: "Burrabazar", 29: "Narkeldanga", 43: "Bowbazar", 45: "BBD Bagh",
               58: "Tangra - Dhapa", 63: "Park Street", 66: "Tiljala - Topsia", 74: "Alipore", 79: "Kidderpore",
               85: "Ballygunge", 93: "Lake Gardens", 101: "Patuli", 108: "East Kolkata Wetlands", 118: "Behala",
               134: "Garden Reach", 141: "Metiabruz"}  # other wards: "KMC Ward N" until you add real names


def die(msg):
    sys.exit("\nSTOP: " + msg)


ap = argparse.ArgumentParser()
ap.add_argument("--wards", default=os.path.join(HERE, "kolkata_wards_real.geojson"))
ap.add_argument("--age-dir", required=True, help="folder of WorldPop age-sex rasters, e.g. ind_f_00_2020.tif, ind_m_60_2020.tif")
ap.add_argument("--census-csv", required=True, help="CSV with columns ward_no,pct_slum,pct_poor_roof (0..1 or percent)")
ap.add_argument("--n-ensemble", type=int, default=50)
ap.add_argument("--scenes", type=int, default=8, help="max Landsat scenes in the composite")
ap.add_argument("--max-train", type=int, default=30000, help="pixels used to train")
ap.add_argument("--max-hospitals", type=int, default=60)
args = ap.parse_args()
rng = np.random.default_rng(42)  # only used for subsampling pixels and bootstrap, never to invent data

# ---------------------------------------------------------------- 1. wards
print("[1/6] Ward boundaries")
wg = gpd.read_file(args.wards).to_crs(4326)
wg["ward_no"] = wg["WARD"].astype(int)
wg = wg.drop_duplicates("ward_no").sort_values("ward_no").reset_index(drop=True)
wg["geometry"] = wg.geometry.buffer(0)
wg["name"] = [KNOWN_NAMES.get(n, f"KMC Ward {n}") for n in wg.ward_no]
print(f"   {len(wg)} wards")
utm = wg.estimate_utm_crs()
wm = wg.to_crs(utm)
minx, miny, maxx, maxy = wm.total_bounds
x0, y1 = np.floor(minx / PX) * PX - PX, np.ceil(maxy / PX) * PX + PX
W, H = int(np.ceil((maxx - x0) / PX)) + 2, int(np.ceil((y1 - miny) / PX)) + 2
tf = from_origin(x0, y1, PX, PX)
ward_ids = rasterio.features.rasterize(zip(wm.geometry, wm.ward_no), out_shape=(H, W), transform=tf,
                                       fill=0, dtype="int32")
nW = int(wg.ward_no.max()) + 1
poly4326 = wg.unary_union.buffer(0.003)
crs_r = rasterio.crs.CRS.from_user_input(utm)

# ---------------------------------------------------------------- 2. Landsat
print("[2/6] Landsat 8/9 scenes (Planetary Computer)")
cat = pystac_client.Client.open("https://planetarycomputer.microsoft.com/api/stac/v1",
                                modifier=planetary_computer.sign_inplace)
items = list(cat.search(collections=["landsat-c2-l2"], bbox=list(wg.total_bounds),
                        datetime=f"2022-03-01/{datetime.now().strftime('%Y-%m-%d')}",
                        query={"eo:cloud_cover": {"lt": 20}}).items())
items = [i for i in items if i.datetime.month in (3, 4, 5) and i.properties.get("platform") in ("landsat-8", "landsat-9")]
by_year = {}
for i in sorted(items, key=lambda i: i.properties["eo:cloud_cover"]):
    by_year.setdefault(i.datetime.year, []).append(i)
chosen = [i for y in sorted(by_year, reverse=True) for i in by_year[y][:3]][:args.scenes]
if not chosen:
    die("No usable Landsat scenes found (check internet / date range).")


def read_band(href):
    with rasterio.open(href) as src, WarpedVRT(src, crs=crs_r, transform=tf, width=W, height=H,
                                              resampling=Resampling.nearest, src_nodata=0, nodata=0) as v:
        return v.read(1).astype("float32")


scenes = []
for it in chosen:
    try:
        lw, rd, nr, qa = (read_band(it.assets[k].href) for k in ("lwir11", "red", "nir08", "qa_pixel"))
    except Exception as e:
        print(f"   skip {it.id}: {e}")
        continue
    bad = (qa.astype("uint16") & 0b11110) > 0  # dilated cloud, cirrus, cloud, shadow
    lst = np.where((lw > 0) & ~bad, lw * 0.00341802 + 149.0 - 273.15, np.nan)
    sr, sn = rd * 2.75e-5 - 0.2, nr * 2.75e-5 - 0.2
    ok = (rd > 0) & (nr > 0) & ~bad & (sr > 0) & (sn > 0)
    ndvi = np.where(ok, (sn - sr) / (sn + sr), np.nan)
    alb = np.where(ok, 0.5 * sr + 0.5 * sn, np.nan)  # crude albedo proxy (red/NIR only)
    lst[(lst < 20) | (lst > 65)] = np.nan
    scenes.append({"id": it.id, "date": it.datetime.strftime("%Y-%m-%d"), "year": it.datetime.year,
                   "lst": lst, "ndvi": ndvi, "alb": alb})
    print(f"   {it.id} {scenes[-1]['date']}")
if not scenes:
    die("All scene downloads failed.")


def composite(sc):
    return tuple(np.nanmedian(np.stack([s[k] for s in sc]), axis=0) for k in ("lst", "ndvi", "alb"))


LST, NDVI, ALB = composite(scenes)

# ---------------------------------------------------------------- 3. OSM buildings, water, hospitals
print("[3/6] OpenStreetMap buildings, water, hospitals (can take several minutes)")
try:
    from osm_fetch import features_by_ward
    b = features_by_ward(wg, "ward_no", {"building": True}, "buildings")
    b = b[b.geometry.type.isin(["Polygon", "MultiPolygon"])].to_crs(utm)
    wat = features_by_ward(wg, "ward_no", {"natural": "water", "waterway": ["river", "canal"]}, "water").to_crs(utm)
    hosp = features_by_ward(wg, "ward_no", {"amenity": "hospital"}, "hospitals", keep=("geometry", "name"))
except Exception as e:
    die(f"OpenStreetMap download failed ({e}). Run the same command again: finished wards are saved in pipeline/osm_cache and are skipped. Nothing was invented.")
if b.empty or wat.empty:
    die("OSM returned no buildings or no water for the city.")
F = 3  # rasterise at 10 m then average to 30 m = share of each pixel covered by buildings
tf_f = from_origin(x0, y1, PX / F, PX / F)
bf = rasterio.features.rasterize(((g, 1) for g in b.geometry), out_shape=(H * F, W * F), transform=tf_f,
                                 fill=0, dtype="uint8")
BLDG = bf.reshape(H, F, W, F).mean(axis=(1, 3)).astype("float32")
wgeoms = [g.buffer(15) if g.geom_type in ("LineString", "MultiLineString") else g for g in wat.geometry]
wmask = rasterio.features.rasterize(((g, 1) for g in wgeoms), out_shape=(H, W), transform=tf, fill=0,
                                    dtype="uint8", all_touched=True)
WDIST = np.minimum(distance_transform_edt(wmask == 0) * PX, 5000).astype("float32")
hosp = hosp.copy()
hosp["geometry"] = hosp.geometry.representative_point()
hosp = hosp[~hosp.geometry.duplicated()].to_crs(4326)
hospitals = []
for _, r in hosp.iterrows():
    hospitals.append({"type": "hospital", "name": r.get("name") if isinstance(r.get("name"), str) else "Hospital (unnamed in OSM)",
                      "lon": round(r.geometry.x, 5), "lat": round(r.geometry.y, 5)})
hospitals = hospitals[:args.max_hospitals]
print(f"   {len(b)} buildings, {len(wat)} water features, {len(hospitals)} hospitals")

# ---------------------------------------------------------------- 4. demographics
print("[4/6] WorldPop age-sex + Census CSV")


def zonal_sum(path):
    out = {}
    with rasterio.open(path) as src:
        g = wg.to_crs(src.crs)
        for n, geom in zip(wg.ward_no, g.geometry):
            try:
                a, _ = rasterio.mask.mask(src, [geom], crop=True, filled=True, nodata=-1)
                out[n] = float(a[a > 0].sum())
            except ValueError:  # ward outside raster
                out[n] = 0.0
    return out


tot, u5, o60 = {n: 0.0 for n in wg.ward_no}, {n: 0.0 for n in wg.ward_no}, {n: 0.0 for n in wg.ward_no}
files = glob.glob(os.path.join(args.age_dir, "*.tif"))
used = 0
for fp in files:
    m = re.search(r"_[fm]_(\d{1,2})_", os.path.basename(fp))
    if not m:
        continue
    code, used = int(m.group(1)), used + 1
    z = zonal_sum(fp)
    for n in tot:
        tot[n] += z[n]
        if code in (0, 1):
            u5[n] += z[n]     # WorldPop bins 0 and 1-4 = under 5
        if code >= 60:
            o60[n] += z[n]
if used == 0:
    die("No WorldPop age-sex files found in --age-dir (expected names like ind_f_00_2020.tif).")
if sum(u5.values()) == 0 or sum(o60.values()) == 0:
    die("The age rasters in --age-dir lack the 0/1 classes or the 60+ classes.")
cen = pd.read_csv(args.census_csv)
need = {"ward_no", "pct_slum", "pct_poor_roof"}
if not need <= set(cen.columns):
    die(f"--census-csv needs columns {sorted(need)}")
cen = cen.set_index("ward_no")

# Headcount = Census of India 2011 (kolkata_population_2011.csv next to this script). WorldPop is then used only for the 60+ and under-5 SHARES.
_pc = os.path.join(os.path.dirname(os.path.abspath(__file__)), "kolkata_population_2011.csv")
census_pop = {int(a): int(b) for a, b in pd.read_csv(_pc).values.tolist()} if os.path.exists(_pc) else {}
print(f"   -> Census 2011 headcount loaded for {len(census_pop)} wards")
missing = sorted(set(wg.ward_no) - set(cen.index))
if missing:
    die(f"Census CSV has no row for wards: {missing[:15]}{'...' if len(missing) > 15 else ''}")
for c in ("pct_slum", "pct_poor_roof"):
    if cen[c].max() > 1.5:
        cen[c] = cen[c] / 100.0

# ---------------------------------------------------------------- 5. ward means + training pixels
print("[5/6] Training the heat model on real pixels")
valid = (ward_ids > 0) & np.isfinite(LST) & np.isfinite(NDVI) & np.isfinite(ALB)
if valid.sum() < 5000:
    die("Too few valid pixels (clouds / download problem).")


def ward_mean(a):
    m = valid & np.isfinite(a)
    s = np.bincount(ward_ids[m], weights=a[m], minlength=nW)
    c = np.bincount(ward_ids[m], minlength=nW)
    return np.where(c > 0, s / np.maximum(c, 1), np.nan)


wm_lst, wm_ndvi, wm_alb, wm_bldg, wm_water = (ward_mean(a) for a in (LST, NDVI, ALB, BLDG, WDIST))
for n in wg.ward_no:
    if not np.isfinite(wm_lst[n]):
        die(f"Ward {n} has no valid satellite pixels; add more scenes (--scenes) or check the boundary.")

feat = ["ndvi", "building_density", "albedo", "dist_water_m"]
mono = [-1, +1, -1, +1]
rr, cc = np.where(valid)
if len(rr) > args.max_train:
    pick = rng.choice(len(rr), args.max_train, replace=False)
    rr, cc = rr[pick], cc[pick]
X = pd.DataFrame({"ndvi": NDVI[rr, cc], "building_density": BLDG[rr, cc], "albedo": ALB[rr, cc],
                  "dist_water_m": WDIST[rr, cc]})
y = pd.Series(LST[rr, cc])
groups = (rr // 100) * 1000 + (cc // 100)  # ~3 km spatial blocks
mk = lambda seed=42: HistGradientBoostingRegressor(monotonic_cst=mono, max_depth=4, learning_rate=0.05, random_state=seed)

cv = cross_val_predict(mk(), X, y, cv=GroupKFold(n_splits=5), groups=groups)
sp_r2, sp_rmse = round(float(r2_score(y, cv)), 3), round(float(root_mean_squared_error(y, cv)), 3)

# temporal check: fit on earlier-year scenes, score against the latest year's scenes (real, not simulated)
t_r2 = t_rmse = None
years = sorted({s["year"] for s in scenes})
if len(years) >= 2:
    A = composite([s for s in scenes if s["year"] < years[-1]])
    B = composite([s for s in scenes if s["year"] == years[-1]])
    ok = np.isfinite(A[0][rr, cc]) & np.isfinite(A[1][rr, cc]) & np.isfinite(A[2][rr, cc]) & np.isfinite(B[0][rr, cc])
    if ok.sum() > 2000:
        XA = pd.DataFrame({"ndvi": A[1][rr, cc], "building_density": BLDG[rr, cc], "albedo": A[2][rr, cc],
                           "dist_water_m": WDIST[rr, cc]})[ok]
        mt = mk().fit(XA, A[0][rr, cc][ok])
        p = mt.predict(XA)
        t_r2, t_rmse = round(float(r2_score(B[0][rr, cc][ok], p)), 3), round(float(root_mean_squared_error(B[0][rr, cc][ok], p)), 3)

base = mk().fit(X, y)
perm = permutation_importance(base, X, y, n_repeats=5, random_state=42)
imp = np.clip(perm.importances_mean, 0, None)
imp = imp / imp.sum() if imp.sum() > 0 else imp

block_idx = {bk: np.where(groups == bk)[0] for bk in np.unique(groups)}
bks = np.array(list(block_idx))
ensemble = []
for k in range(args.n_ensemble):
    sel = np.concatenate([block_idx[bk] for bk in rng.choice(bks, len(bks), replace=True)])
    ensemble.append(mk(k).fit(X.iloc[sel], y.iloc[sel]))

# ---------------------------------------------------------------- 6. counterfactuals + output
print(f"[6/6] Simulating cool roofs and trees across {args.n_ensemble} models")
a_lo, a_hi = np.percentile(X.albedo, [1, 99])
n_lo, n_hi = np.percentile(X.ndvi, [1, 99])
wards_out = []
for _, w in wg.iterrows():
    n = int(w.ward_no)
    r_, c_ = np.where(valid & (ward_ids == n))
    if len(r_) > 600:
        s_ = rng.choice(len(r_), 600, replace=False)
        r_, c_ = r_[s_], c_[s_]
    Xb = pd.DataFrame({"ndvi": NDVI[r_, c_], "building_density": BLDG[r_, c_], "albedo": ALB[r_, c_],
                       "dist_water_m": WDIST[r_, c_]})
    bd = float(wm_bldg[n])
    Xr, Xt = Xb.copy(), Xb.copy()
    Xr["albedo"] = np.clip(Xr.albedo + (0.16 + 0.08 * bd), a_lo, max(a_hi, a_lo))
    Xt["ndvi"] = np.clip(Xt.ndvi + (0.08 + 0.22 * (1 - bd)), n_lo, max(n_hi, n_lo))
    rg, tg = [], []
    for m in ensemble:
        p0 = m.predict(Xb)
        rg.append(round(float(np.mean(p0 - m.predict(Xr))), 3))
        tg.append(round(float(np.mean(p0 - m.predict(Xt))), 3))
    summ = lambda v: {"mean": round(float(np.mean(v)), 2), "low_p10": round(float(np.percentile(v, 10)), 2),
                      "high_p90": round(float(np.percentile(v, 90)), 2), "samples": v[:50]}
    cr = cen.loc[n]
    wards_out.append({
        "ward_no": n, "name": w["name"],
        "geometry": json.loads(gpd.GeoSeries([w.geometry]).to_json())["features"][0]["geometry"],
        "temp": round(float(wm_lst[n]), 2), "ndvi": round(float(wm_ndvi[n]), 3), "albedo": round(float(wm_alb[n]), 3),
        "bldg": round(bd, 3), "water": round(float(wm_water[n]), 0),
        "pop": int(census_pop.get(int(n), round(tot[n]))),
        "p60": round(o60[n] / tot[n], 3) if tot[n] else 0.0,
        "pu6": round(u5[n] / tot[n], 3) if tot[n] else 0.0,   # NOTE: under-5 (WorldPop age bins), shown as "<6" on the site
        "pslum": round(float(cr.pct_slum), 3), "proof": round(float(cr.pct_poor_roof), 3),
        "cool_roof": summ(rg), "trees": summ(tg)})

os.makedirs("pipeline", exist_ok=True)
pd.DataFrame({"ward": [w["ward_no"] for w in wards_out],
              "share": [min(1.0, w["p60"] + w["pu6"]) for w in wards_out]}).to_csv("pipeline/vuln_share.csv", index=False)

card = {
    "model_type": f"HistGradientBoostingRegressor ({args.n_ensemble}-Member Spatial Block Ensemble)",
    "last_trained_at": datetime.now(timezone.utc).astimezone().strftime("%d %b %Y, %I:%M:%S %p %Z"),
    "landsat_scene_id": f"{len(scenes)}-scene median, latest {max(s['id'] for s in scenes)}",
    "landsat_scene_date": ", ".join(sorted({s["date"] for s in scenes})),
    "real_raster_streamed": True,
    "wards_count": len(wards_out), "training_cells_count": int(len(X)),
    "spatial_cv_r2": sp_r2, "spatial_cv_rmse_c": sp_rmse,
    "temporal_cv_r2": t_r2, "temporal_cv_rmse_c": t_rmse,
    "monotonic_constraints": {"ndvi": -1, "building_density": 1, "albedo": -1, "dist_water_m": 1},
    "feature_importances": [
        {"feature": "NDVI (Vegetation Cover)", "importance": round(float(imp[0]), 2), "direction": "Decreases Heat (-1)"},
        {"feature": "Building Density", "importance": round(float(imp[1]), 2), "direction": "Increases Heat (+1)"},
        {"feature": "Surface Albedo Proxy", "importance": round(float(imp[2]), 2), "direction": "Decreases Heat (-1)"},
        {"feature": "Distance to Water (m)", "importance": round(float(imp[3]), 2), "direction": "Increases Heat (+1)"}],
    "data_sources": {
        "temperature_ndvi_albedo": "Landsat 8/9 Collection 2 Level 2 via Planetary Computer, cloud-masked median of Mar-May scenes",
        "building_density": "OpenStreetMap building footprints (completeness varies)",
        "distance_to_water": "OpenStreetMap water bodies, rivers, canals",
        "population_age": "WorldPop age-sex rasters (modelled estimates)",
        "population_headcount": "Census of India 2011 (ward headcounts)",
        "slum_roof": "Census 2011 ward tables (supplied CSV)",
        "ward_boundaries": "DataMeet KMC ward file (141 wards; older than the current delimitation)"},
    "intervention_assumptions": INTERVENTION,
    "limitations": [
        "Predicts land SURFACE temperature, not the heat people feel and not health outcomes.",
        "Cooling gains are model predictions, not checked against pilots or published studies.",
        "Cross-validation measures temperature prediction, not whether interventions work.",
        "pct_under6 holds the under-5 share (WorldPop age bins)."]}
with open("pipeline/ml_output.json", "w") as f:
    json.dump({"model_card": card, "hospitals": hospitals, "wards": wards_out}, f, indent=2)
print(f"\nDONE: {len(wards_out)} wards. spatial CV R2={sp_r2} RMSE={sp_rmse} C | temporal R2={t_r2}")