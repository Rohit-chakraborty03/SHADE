"""
Reliable OpenStreetMap downloads for S.H.A.D.E. (shared by run_full_pipeline.py and compute_coverage.py).

Why: one giant Overpass request for all of Kolkata times out. This downloads ward by ward, retries,
switches between public Overpass servers, and saves every finished piece in pipeline/osm_cache/,
so if it stops you just run it again and it continues where it left off.
"""
import os, time
import geopandas as gpd
import pandas as pd
import osmnx as ox
import networkx as nx

CACHE = os.path.join("pipeline", "osm_cache")
ENDPOINTS = [
    "https://overpass-api.de/api",
    "https://overpass.kumi.systems/api",
    "https://maps.mail.ru/osm/tools/overpass/api",
]
ox.settings.requests_timeout = 300
ox.settings.use_cache = True
ox.settings.cache_folder = os.path.join(CACHE, "http")
ox.settings.log_console = False
os.makedirs(CACHE, exist_ok=True)


def _set_endpoint(base):
    if hasattr(ox.settings, "overpass_url"):        # osmnx 2.x
        ox.settings.overpass_url = base + "/interpreter"
    else:                                           # osmnx 1.x
        ox.settings.overpass_endpoint = base


def _retry(fn, label, tries=6):
    last = None
    for i in range(tries):
        _set_endpoint(ENDPOINTS[i % len(ENDPOINTS)])
        try:
            return fn()
        except Exception as e:
            msg = str(e)
            if "InsufficientResponseError" in type(e).__name__ or "No matching features" in msg:
                return None                          # nothing mapped here: not an error
            last = e
            wait = min(60, 8 * (i + 1))
            print(f"      {label}: {type(e).__name__}, retry {i + 1}/{tries} in {wait}s (next server)")
            time.sleep(wait)
    raise RuntimeError(f"{label} failed after {tries} tries: {last}")


def features_by_ward(wards, ward_col, tags, name, keep=("geometry",), margin_deg=0.0005):
    """OSM features for every ward polygon (+ a small margin), cached per ward. Returns EPSG:4326 GeoDataFrame."""
    parts = []
    n = len(wards)
    for k, (wno, geom) in enumerate(zip(wards[ward_col], wards.geometry), 1):
        path = os.path.join(CACHE, f"{name}_{wno}.gpkg")
        if os.path.exists(path + ".empty"):
            g, tag = gpd.GeoDataFrame({"geometry": []}, geometry="geometry", crs=4326), "cached (none)"
        elif os.path.exists(path):
            g = gpd.read_file(path)
            tag = "cached"
        else:
            g = _retry(lambda: ox.features_from_polygon(geom.buffer(margin_deg), tags), f"{name} ward {wno}")
            if g is None or g.empty:
                g = gpd.GeoDataFrame({"geometry": []}, geometry="geometry", crs=4326)
                open(path + ".empty", "w").close()
            else:
                cols = [c for c in keep if c in g.columns]
                g = g[cols].reset_index(drop=True)
                g.to_file(path, driver="GPKG")
            tag = f"{len(g)} found"
            time.sleep(1.0)                          # be polite to the public servers
        print(f"   {name}: ward {wno} ({k}/{n}) {tag}")
        if not g.empty:
            parts.append(g)
    if not parts:
        return gpd.GeoDataFrame({"geometry": []}, geometry="geometry", crs=4326)
    out = pd.concat(parts, ignore_index=True)
    return gpd.GeoDataFrame(out, geometry="geometry", crs=4326)


def walk_graph_by_ward(wards, ward_col, margin_deg=0.006):
    """Walkable street network for the whole city, downloaded ward by ward (+~600 m margin) and merged."""
    graphs = []
    n = len(wards)
    for k, (wno, geom) in enumerate(zip(wards[ward_col], wards.geometry), 1):
        path = os.path.join(CACHE, f"walk_{wno}.graphml")
        if os.path.exists(path):
            g, tag = ox.load_graphml(path), "cached"
        else:
            g = _retry(lambda: ox.graph_from_polygon(geom.buffer(margin_deg), network_type="walk"), f"streets ward {wno}")
            if g is None:
                continue
            ox.save_graphml(g, path)
            tag = f"{len(g)} nodes"
            time.sleep(1.0)
        print(f"   streets: ward {wno} ({k}/{n}) {tag}")
        graphs.append(g)
    if not graphs:
        raise RuntimeError("No street network could be downloaded.")
    return nx.compose_all(graphs)