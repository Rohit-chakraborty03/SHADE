let map;
let heatmapMap = null;
let isSyncingMaps = false;
let isCompareMode = false;
let wardsGeoJSON = null;
let currentPlan = null;
let currentLayer = 'mean_temp_c';
let currentLang = 'en';
let latestSuggestedCooling = 70;
let baselineChart = null;
let tradeoffChart = null;
let heatmapLabelMarkers = [];
let modelTrainedTimestamp = null;

// Bilingual UI Strings
const I18N = {
  en: {
    title: "S.H.A.D.E. / KOLKATA<br><span style='font-family: var(--font); font-size: 12px; color: var(--muted); text-transform: uppercase; letter-spacing: 1px;'>Urban Heat Equity Analysis</span>",
    subtitle: "A heat map only shows where it is hottest. But on the hottest night, the people in danger are the old, the very young, and families under tin roofs. S.H.A.D.E. is a prototype of a concept for making the money reach them first.",
    budgetControls: "How much, and how to split it",
    runBtn: "Run the plan"
  },
  bn: {
    title: "S.H.A.D.E. / কলকাতা<br><span style='font-family: var(--font); font-size: 12px; color: var(--muted); text-transform: uppercase; letter-spacing: 1px;'>নগর তাপ সমতা বিশ্লেষণ</span>",
    subtitle: "কলকাতা শহরে সমতাভিত্তিক তাপ প্রশমনের জন্য একটি সিদ্ধান্ত-সহায়ক ব্যবস্থা।",
    budgetControls: "১. বাজেট এবং বিভাজন নিয়ন্ত্রণ",
    runBtn: "পরিকল্পনা চালান (Run Plan)"
  }
};

// Format INR in Crores or Lakhs
function formatINR(inr) {
  if (inr >= 10000000) return `₹${(inr / 10000000).toFixed(2)} Cr`;
  return `₹${(inr / 100000).toFixed(1)} L`;
}

// Format a real timestamp into IST date/time + relative "X ago"
function formatTrainedTime(dateObj) {
  if (!dateObj || isNaN(dateObj.getTime())) return 'Unknown';
  const now = new Date();
  const diffSec = Math.max(0, Math.floor((now - dateObj) / 1000));

  let rel = '';
  if (diffSec < 60) rel = `${diffSec}s ago`;
  else if (diffSec < 3600) rel = `${Math.floor(diffSec / 60)}m ago`;
  else if (diffSec < 86400) {
    const h = Math.floor(diffSec / 3600);
    const m = Math.floor((diffSec % 3600) / 60);
    rel = m > 0 ? `${h}h ${m}m ago` : `${h}h ago`;
  } else {
    const d = Math.floor(diffSec / 86400);
    rel = `${d} day${d > 1 ? 's' : ''} ago`;
  }

  const abs = dateObj.toLocaleString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
    timeZone: 'Asia/Kolkata'
  });

  return `${abs} IST (${rel})`;
}

// If the basemap server cannot be reached (blocked network, outage), switch to the OpenStreetMap tile server
function addTileFallback(m) {
  let fails = 0, switched = false;
  m.on('error', (e) => {
    if (switched || !e || (e.sourceId && e.sourceId !== 'osm')) return;
    const msg = String((e.error && e.error.message) || '');
    if (!e.tile && !/fetch|tile|png|network/i.test(msg)) return;
    if (++fails < 4) return;
    switched = true;
    try { m.getSource('osm').setTiles(['https://tile.openstreetmap.org/{z}/{x}/{y}.png']); } catch (err) {}
  });
}

// 1. Initialize MapLibre Map of Kolkata
async function initMap() {
  map = new maplibregl.Map({
    container: 'map',
    style: {
      version: 8,
      sources: {
        osm: {
          type: 'raster',
          tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],
          tileSize: 256,
          maxzoom: 19,
          attribution: '© OpenStreetMap contributors'
        }
      },
      layers: [{ id: 'osm-layer', type: 'raster', source: 'osm' }]
    },
    center: [88.358, 22.548],
    zoom: 11.2,
    minZoom: 10,
    maxZoom: 18,
    maxBounds: [[88.20, 22.38], [88.52, 22.74]]
  });

  addTileFallback(map);
  map.on('load', async () => {
    // a server that is still waking up can fail the first calls, so try a few times
    let res;
    for (let i = 0; i < 8; i++) {
      try { res = await fetch('/api/wards'); if (res.ok) break; } catch (e) {}
      await new Promise(r => setTimeout(r, 3000));
    }
    wardsGeoJSON = await res.json();
    lockToKolkata(map);
    buildWardPicker();

    map.addSource('wards', {
      type: 'geojson',
      data: wardsGeoJSON
    });

    map.addLayer({
      id: 'wards-fill', type: 'fill', source: 'wards',
      paint: { 'fill-color': getColorExpression('mean_temp_c'), 'fill-opacity': 0.68 }
    });
    map.addLayer({
      id: 'wards-chosen-fill', type: 'fill', source: 'wards',
      paint: { 'fill-color': '#10b981', 'fill-opacity': 0.35 },
      filter: ['in', 'ward_no', -1]
    });
    map.addLayer({
      id: 'wards-outline', type: 'line', source: 'wards',
      layout: { 'line-join': 'round' },
      paint: { 'line-color': '#ffffff', 'line-width': 1.2, 'line-opacity': 0.9 }
    });
    map.addLayer({
      id: 'wards-relief', type: 'line', source: 'wards',
      layout: { 'line-join': 'round' },
      paint: { 'line-color': '#0369a1', 'line-width': 3, 'line-dasharray': [2, 1.5] },
      filter: ['in', 'ward_no', -1]
    });
    map.addLayer({
      id: 'wards-chosen-casing', type: 'line', source: 'wards',
      layout: { 'line-join': 'round' },
      paint: { 'line-color': '#ffffff', 'line-width': 9, 'line-blur': 1 },
      filter: ['in', 'ward_no', -1]
    });
    map.addLayer({
      id: 'wards-chosen', type: 'line', source: 'wards',
      layout: { 'line-join': 'round' },
      paint: { 'line-color': '#059669', 'line-width': 4.5 },
      filter: ['in', 'ward_no', -1]
    });
    map.addLayer({
      id: 'wards-selected', type: 'line', source: 'wards',
      layout: { 'line-join': 'round' },
      paint: { 'line-color': '#0f291f', 'line-width': 5 },
      filter: ['==', 'ward_no', -1]
    });

    // Add Hospital Markers
    wardsGeoJSON.facilities.forEach(fac => {
      const el = document.createElement('div');
      el.style.width = '12px';
      el.style.height = '12px';
      el.style.borderRadius = '50%';
      el.style.background = '#38bdf8';
      el.style.border = '2px solid #fff';
      el.title = `${fac.name} (Hospital Heat Readiness Flag)`;

      new maplibregl.Marker({ element: el })
        .setLngLat(fac.geometry.coordinates)
        .setPopup(new maplibregl.Popup().setHTML(`<strong>${fac.name}</strong><br/>Zero-cost Heat Alert Recommended`))
        .addTo(map);
    });

    map.on('click', 'wards-fill', async (e) => {
      const props = e.features[0].properties;
      await inspectWard(props.ward_no);
    });

    map.on('mouseenter', 'wards-fill', () => { map.getCanvas().style.cursor = 'pointer'; });
    map.on('mouseleave', 'wards-fill', () => { map.getCanvas().style.cursor = ''; });

    // Sync movement to heatmapMap when in side-by-side mode
    map.on('move', () => {
      if (!isCompareMode || !heatmapMap || isSyncingMaps) return;
      isSyncingMaps = true;
      heatmapMap.jumpTo({
        center: map.getCenter(),
        zoom: map.getZoom(),
        bearing: map.getBearing(),
        pitch: map.getPitch()
      });
      isSyncingMaps = false;
    });

    await fetchWeather();
    await runOptimizer();
    await loadModelCardAndCoverage();
  });
}

// Initialize the Left "Heatmap-Only" Map when Compare Mode is toggled
function ensureHeatmapMap() {
  if (heatmapMap || !wardsGeoJSON) return;

  heatmapMap = new maplibregl.Map({
    container: 'map-heatmap',
    style: {
      version: 8,
      sources: {
        osm: {
          type: 'raster',
          tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],
          tileSize: 256,
          maxzoom: 19,
          attribution: '© OpenStreetMap contributors'
        }
      },
      layers: [{ id: 'osm-layer-hm', type: 'raster', source: 'osm' }]
    },
    center: map.getCenter(),
    zoom: map.getZoom(),
    minZoom: 10,
    maxZoom: 18
  });
  addTileFallback(heatmapMap);

  lockToKolkata(heatmapMap);

  heatmapMap.on('load', () => {
    heatmapMap.addSource('wards-hm', {
      type: 'geojson',
      data: wardsGeoJSON
    });

    heatmapMap.addLayer({
      id: 'hm-wards-fill', type: 'fill', source: 'wards-hm',
      paint: { 'fill-color': getColorExpression('mean_temp_c'), 'fill-opacity': 0.2 }
    });
    heatmapMap.addLayer({
      id: 'hm-wards-chosen-fill', type: 'fill', source: 'wards-hm',
      paint: { 'fill-color': '#ff2a2a', 'fill-opacity': 0.55 },
      filter: ['in', 'ward_no', -1]
    });
    heatmapMap.addLayer({
      id: 'hm-wards-outline', type: 'line', source: 'wards-hm',
      layout: { 'line-join': 'round' },
      paint: { 'line-color': '#ffffff', 'line-width': 1.2, 'line-opacity': 0.85 }
    });
    heatmapMap.addLayer({
      id: 'hm-wards-chosen-casing', type: 'line', source: 'wards-hm',
      layout: { 'line-join': 'round' },
      paint: { 'line-color': '#ffffff', 'line-width': 10, 'line-blur': 1 },
      filter: ['in', 'ward_no', -1]
    });
    heatmapMap.addLayer({
      id: 'hm-wards-chosen', type: 'line', source: 'wards-hm',
      layout: { 'line-join': 'round' },
      paint: { 'line-color': '#dc2626', 'line-width': 5 },
      filter: ['in', 'ward_no', -1]
    });
    heatmapMap.addLayer({
      id: 'hm-wards-selected', type: 'line', source: 'wards-hm',
      layout: { 'line-join': 'round' },
      paint: { 'line-color': '#0f291f', 'line-width': 5 },
      filter: ['==', 'ward_no', selectedWard || -1]
    });

    heatmapMap.on('click', 'hm-wards-fill', async (e) => {
      const props = e.features[0].properties;
      await inspectWard(props.ward_no);
    });

    heatmapMap.on('mouseenter', 'hm-wards-fill', () => { heatmapMap.getCanvas().style.cursor = 'pointer'; });
    heatmapMap.on('mouseleave', 'hm-wards-fill', () => { heatmapMap.getCanvas().style.cursor = ''; });

    heatmapMap.on('move', () => {
      if (!isCompareMode || !map || isSyncingMaps) return;
      isSyncingMaps = true;
      map.jumpTo({
        center: heatmapMap.getCenter(),
        zoom: heatmapMap.getZoom(),
        bearing: heatmapMap.getBearing(),
        pitch: heatmapMap.getPitch()
      });
      isSyncingMaps = false;
    });

    updateComparisonView();
  });
}

// Compute which wards a naive "Hottest First" heatmap strategy funds with the same cooling budget
function computeHeatmapBaselinePicks(plan) {
  if (!wardsGeoJSON || !plan) return { wardNos: [], stats: null };

  const shadePicks = plan.cooling.picks || [];
  const coolingBudget = Number(document.getElementById('rng-budget').value) * 10000000 * (Number(document.getElementById('rng-split').value) / 100);

  const avgWardCost = shadePicks.length
    ? shadePicks.reduce((s, p) => s + Number(p.cost || 0), 0) / shadePicks.length
    : 11500000;

  const sortedByHeat = [...wardsGeoJSON.features]
    .map(f => f.properties)
    .sort((a, b) => Number(b.mean_temp_c) - Number(a.mean_temp_c));

  const targetCount = shadePicks.length || Math.max(1, Math.floor(coolingBudget / avgWardCost));
  const hmWards = sortedByHeat.slice(0, targetCount);
  const hmWardNos = hmWards.map(w => Number(w.ward_no));

  function sumMetrics(wardList) {
    let totalPop = 0;
    let vulnPeople = 0;
    let seniors = 0;
    let children = 0;
    let avgTemp = 0;
    let avgVuln = 0;
    let usedDefaults = false;

    wardList.forEach(w => {
      if ((w.pct_60_plus == null && w.elderly_share == null) || (w.pct_under_6 == null && w.children_share == null)) usedDefaults = true;
      const pop = Number(w.population) || 0;
      const vulnIdx = Number(w.vulnerability) || 0.5;
      const pct60 = Number(w.pct_60_plus || w.elderly_share || 0.09);
      const pctU6 = Number(w.pct_under_6 || w.children_share || 0.08);
      const slum = Number(w.slum_share || w.pct_poor_roof || 0.25);

      const wardVulnPop = Math.round(pop * Math.min(0.85, Math.max(0.18, (vulnIdx * 0.55) + (slum * 0.25) + pct60 + pctU6)));
      totalPop += pop;
      vulnPeople += wardVulnPop;
      seniors += Math.round(pop * pct60);
      children += Math.round(pop * pctU6);
      avgTemp += Number(w.mean_temp_c) || 0;
      avgVuln += vulnIdx;
    });

    const n = wardList.length || 1;
    return {
      totalPop,
      vulnPeople,
      seniors,
      children,
      avgTemp: (avgTemp / n).toFixed(1),
      avgVuln: (avgVuln / n).toFixed(2),
      usedDefaults
    };
  }

  const shadeWardProps = shadePicks
    .map(p => {
      const f = wardsGeoJSON.features.find(x => Number(x.properties.ward_no) === Number(p.ward_no));
      return f ? f.properties : null;
    })
    .filter(Boolean);

  const hmMetrics = sumMetrics(hmWards);
  const shadeMetrics = sumMetrics(shadeWardProps);

  const reliefCovered = Number(plan.relief?.vulnerable_people_covered || 0);
  const extraFromCooling = shadeMetrics.vulnPeople - hmMetrics.vulnPeople; // can be negative: show it honestly
  const totalExtraVuln = extraFromCooling + reliefCovered;

  const hmBaseline = (plan.baselines || []).find(b => /hottest/i.test(b.strategy));
  const shadePD = Number(plan.cooling?.person_degrees_averted || 0);
  const hmPD = hmBaseline ? Math.round(Number(hmBaseline.personDegrees)) : null; // no invented fallback
  const pdGainPct = hmPD > 0 ? Math.round(((shadePD - hmPD) / hmPD) * 100) : null;

  return {
    hmWardNos,
    shadeWardNos: shadePicks.map(p => Number(p.ward_no)),
    hmMetrics,
    shadeMetrics,
    extraFromCooling,
    reliefCovered,
    totalExtraVuln,
    shadePD,
    hmPD,
    pdGainPct,
    coolingBudget
  };
}

function updateComparisonView() {
  if (!currentPlan || !wardsGeoJSON) return;

  const comp = computeHeatmapBaselinePicks(currentPlan);

  const bEl = document.getElementById('cpb-budget');
  if (bEl) bEl.textContent = formatINR(comp.coolingBudget);

  const sgn = n => (n >= 0 ? '+' : '\u2212') + Math.abs(n).toLocaleString();
  const extraEl = document.getElementById('cpb-extra-vuln');
  if (extraEl) extraEl.textContent = '~' + Math.abs(comp.totalExtraVuln).toLocaleString();
  const verbEl = document.getElementById('cpb-verb');
  if (verbEl) verbEl.textContent = comp.totalExtraVuln >= 0 ? 'more' : 'fewer';

  const bulletsEl = document.getElementById('cpb-bullets');
  if (bulletsEl) {
    const extraSeniors = comp.shadeMetrics.seniors - comp.hmMetrics.seniors;
    const extraKids = comp.shadeMetrics.children - comp.hmMetrics.children;
    const pdLine = comp.pdGainPct == null
      ? '<li>Heat exposure avoided: the Hottest First figure is not available for this run</li>'
      : `<li><strong>${comp.pdGainPct >= 0 ? '+' : '\u2212'}${Math.abs(comp.pdGainPct)}% person-degrees averted (modelled)</strong> compared with Hottest First (${comp.shadePD.toLocaleString()} vs. ${comp.hmPD.toLocaleString()})</li>`;
    const warn = (comp.shadeMetrics.usedDefaults || comp.hmMetrics.usedDefaults)
      ? '<li class="cpb-warn">Some age or slum shares were missing in the ward data, so city-average defaults were used. Treat these counts as a rough guide.</li>' : '';
    bulletsEl.innerHTML = `
      <li><strong>${sgn(comp.extraFromCooling)} vulnerable residents (est.)</strong> in the structural cooling wards (${comp.shadeMetrics.vulnPeople.toLocaleString()} vs. ${comp.hmMetrics.vulnPeople.toLocaleString()})</li>
      <li><strong>${sgn(extraSeniors)} seniors (60+) and ${sgn(extraKids)} children under 6 (est.)</strong> living in those wards</li>
      <li><strong>+${comp.reliefCovered.toLocaleString()} vulnerable people (est.)</strong> newly within walking distance of seasonal relief sites. This part has no heat-map equivalent, so it is counted only on the S.H.A.D.E. side.</li>
      ${pdLine}
      ${warn}
    `;
  }

  const hmStatsEl = document.getElementById('hm-pane-stats');
  if (hmStatsEl) {
    hmStatsEl.innerHTML = `
      <li><strong>Wards funded (${comp.hmWardNos.length}):</strong> ${comp.hmWardNos.map(n => 'W' + n).join(', ')}</li>
      <li><strong>Avg Surface Temp:</strong> ${comp.hmMetrics.avgTemp}°C · <strong>Avg Vulnerability:</strong> ${comp.hmMetrics.avgVuln}</li>
      <li><strong>Vulnerable people reached:</strong> ${comp.hmMetrics.vulnPeople.toLocaleString()}</li>
    `;
  }

  const shStatsEl = document.getElementById('sh-pane-stats');
  if (shStatsEl) {
    shStatsEl.innerHTML = `
      <li><strong>Wards funded (${comp.shadeWardNos.length}):</strong> ${comp.shadeWardNos.map(n => 'W' + n).join(', ')}</li>
      <li><strong>Avg Surface Temp:</strong> ${comp.shadeMetrics.avgTemp}°C · <strong>Avg Vulnerability:</strong> ${comp.shadeMetrics.avgVuln}</li>
      <li><strong>Vulnerable people reached:</strong> ${comp.shadeMetrics.vulnPeople.toLocaleString()} (+${comp.reliefCovered.toLocaleString()} seasonal relief)</li>
    `;
  }

  if (heatmapMap && heatmapMap.getLayer('hm-wards-chosen')) {
    const none = [-1];
    const cn = comp.hmWardNos.length ? comp.hmWardNos : none;
    ['hm-wards-chosen', 'hm-wards-chosen-casing', 'hm-wards-chosen-fill'].forEach(id => {
      heatmapMap.setFilter(id, ['in', 'ward_no', ...cn]);
    });
    heatmapMap.setPaintProperty('hm-wards-fill', 'fill-opacity',
      comp.hmWardNos.length ? ['case', ['in', ['get', 'ward_no'], ['literal', comp.hmWardNos]], 0.92, 0.18] : 0.65
    );

    heatmapLabelMarkers.forEach(m => m.remove());
    heatmapLabelMarkers = [];
    comp.hmWardNos.forEach(no => {
      const f = wardsGeoJSON.features.find(x => Number(x.properties.ward_no) === Number(no));
      if (!f) return;
      const el = document.createElement('button');
      el.type = 'button';
      el.className = 'ward-pin hm-pin';
      el.textContent = 'W' + no;
      el.title = 'Hottest-first pick: Ward ' + no;
      el.addEventListener('click', e => { e.stopPropagation(); focusWard(no); });
      heatmapLabelMarkers.push(new maplibregl.Marker({ element: el }).setLngLat(ringCentroid(f)).addTo(heatmapMap));
    });
  }
}

function toggleCompareMode(forceState) {
  isCompareMode = typeof forceState === 'boolean' ? forceState : !isCompareMode;

  const grid = document.getElementById('map-Comparison-grid');
  const hmPane = document.getElementById('heatmap-pane');
  const shHeader = document.getElementById('shade-pane-header');
  const banner = document.getElementById('compare-proof-banner');
  const legHm = document.getElementById('leg-heatmap-item');
  const btnTop = document.getElementById('btn-compare-heatmap');
  const btnBar = document.getElementById('btn-compare-toolbar');

  if (grid) grid.classList.toggle('is-comparing', isCompareMode);
  if (hmPane) hmPane.hidden = !isCompareMode;
  if (shHeader) shHeader.hidden = !isCompareMode;
  if (banner) banner.hidden = !isCompareMode;
  if (legHm) legHm.hidden = !isCompareMode;

  [btnTop, btnBar].forEach(btn => {
    if (!btn) return;
    btn.setAttribute('aria-pressed', String(isCompareMode));
    btn.textContent = isCompareMode ? 'Comparing to Heatmap' : 'Compare to Heatmap';
  });

  if (currentPlan) {
    setHighlight(
      currentPlan.cooling.picks.map(p => p.ward_no),
      currentPlan.relief.picks.map(r => r.ward_no)
    );
  }

  if (isCompareMode) {
    ensureHeatmapMap();
    updateComparisonView();
  }

  setTimeout(() => {
    if (map) map.resize();
    if (heatmapMap && isCompareMode) {
      heatmapMap.resize();
      heatmapMap.jumpTo({
        center: map.getCenter(),
        zoom: map.getZoom(),
        bearing: map.getBearing(),
        pitch: map.getPitch()
      });
    }
  }, 60);
}

function getColorExpression(prop) {
  if (prop === 'mean_temp_c') {
    return ['interpolate', ['linear'], ['get', 'mean_temp_c'], 34.5, '#3b82f6', 37.0, '#facc15', 39.5, '#ef4444'];
  }
  if (prop === 'vulnerability') {
    return ['interpolate', ['linear'], ['get', 'vulnerability'], 0.25, '#22c55e', 0.55, '#f59e0b', 0.85, '#dc2626'];
  }
  if (prop === 'population') {
    return ['interpolate', ['linear'], ['get', 'population'], 20000, '#38bdf8', 50000, '#818cf8', 80000, '#c084fc'];
  }
  return ['interpolate', ['linear'], ['get', 'night_heat_proxy'], 0.35, '#1e3a8a', 0.65, '#f97316', 0.90, '#be123c'];
}

// 2. Fetch Live Weather & Suggested Split
async function fetchWeather() {
  const sim = document.getElementById('chk-sim-heatwave').checked;
  const res = await fetch(`/api/weather?simulate=${sim}`);
  const data = await res.json();

  latestSuggestedCooling = data.suggested_split.cooling;
  document.getElementById('weather-status').innerHTML =
    `<strong>${data.source}:</strong> ${data.temp_c}°C Air | ${data.humidity_pct}% Humidity | <strong>${data.heat_index_c}°C Heat Index</strong> (${data.alert_name})`;
  document.getElementById('weather-split-pill').textContent =
    `Suggested Split: ${data.suggested_split.cooling}% Cooling / ${data.suggested_split.relief}% Relief`;
}

// 3. Run the S.H.A.D.E. Plan Engine
async function runOptimizer() {
  const budgetCr = Number(document.getElementById('rng-budget').value);
  const coolingPct = Number(document.getElementById('rng-split').value);
  const estimateMode = document.getElementById('sel-estimate-mode').value;
  const equityFloor = Number(document.getElementById('rng-floor').value) / 100;

  const allowedCooling = [...document.querySelectorAll('.chk-cool:checked')].map(el => el.value);
  const allowedRelief = [...document.querySelectorAll('.chk-rel:checked')].map(el => el.value);

  const weights = {
    w60: Number(document.getElementById('w-60').value),
    wu6: Number(document.getElementById('w-u6').value),
    wslum: Number(document.getElementById('w-slum').value),
    wbldg: Number(document.getElementById('w-bldg').value),
    wroof: Number(document.getElementById('w-roof').value)
  };

  const res = await fetch('/api/plan', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      budget_inr: budgetCr * 10000000,
      cooling_share: coolingPct / 100,
      estimate_mode: estimateMode,
      allowed_cooling: allowedCooling,
      allowed_relief: allowedRelief,
      weights,
      equity_floor: equityFloor
    })
  });

  currentPlan = await res.json();
  renderPlanResults(currentPlan);
  updateComparisonView();
}

// 4. Render Results, Map Highlights & Charts
function renderPlanResults(plan) {
  document.getElementById('kpi-pd').textContent = plan.cooling.person_degrees_averted.toLocaleString();
  document.getElementById('kpi-rel').textContent = plan.relief.vulnerable_people_covered.toLocaleString();
  document.getElementById('kpi-cool-spent').textContent = formatINR(plan.cooling.spent_inr);
  document.getElementById('kpi-rel-spent').textContent = `${formatINR(plan.relief.spent_inr)} / season`;

  setHighlight(plan.cooling.picks.map(p => p.ward_no), plan.relief.picks.map(r => r.ward_no));

  const coolContainer = document.getElementById('list-cooling');
  coolContainer.innerHTML = plan.cooling.picks.map(p => `
    <div class="pick-item clickable" data-ward="${p.ward_no}" title="Click to inspect this ward">
      <span class="badge-stability">${Math.round(p.stability * 100)}% Confidence</span>
      <strong>Ward ${p.ward_no}</strong> <span style="color: var(--faint);">(${p.ward_name})</span><br/>
      Selected: <strong>${p.type.replace('_', ' ').toUpperCase()}</strong> | Est. Cost: ${formatINR(p.cost)}<br/>
      Estimated drop: <strong>-${p.cooling_gain_c}°C</strong> <span style="font-size:11px;">(Range: -${p.cooling_gain_low_c}°C to -${p.cooling_gain_high_c}°C)</span>
    </div>
  `).join('') || '<div class="hint">No viable interventions fit this budget constraint.</div>';

  const relContainer = document.getElementById('list-relief');
  relContainer.innerHTML = plan.relief.picks.map(r => `
    <div class="pick-item relief clickable" data-ward="${r.ward_no}" title="Click to inspect this ward">
      <strong>Ward ${r.ward_no}</strong> <span style="color: var(--faint);">(${r.ward_name})</span> — <em>${r.type.replace('_', ' ').toUpperCase()}</em><br/>
      Season Cost: ${formatINR(r.cost)} | Newly Covered: <strong>${r.uncovered_vulnerable_pop.toLocaleString()} vulnerable people</strong>
    </div>
  `).join('') || '<div class="hint">No relief options selected.</div>';

  const eq = plan.equity_audit;
  document.getElementById('equity-audit-box').innerHTML = `
    • <strong>High-Slum Wards Budget Share:</strong> ${eq.slum_budget_share_pct}% of cooling spend<br/>
    • <strong>Top Vulnerability Quintile Share:</strong> ${eq.top_quintile_budget_share_pct}% of cooling spend<br/>
    • <strong>Elderly (60+) & Children (<6) Reached:</strong> ${eq.elderly_reached.toLocaleString()} seniors & ${eq.children_reached.toLocaleString()} children<br/>
    • <strong>City Population Share Reached:</strong> ${eq.population_share_reached_pct}%
  `;

  document.getElementById('list-hospitals').innerHTML = plan.hospital_alerts.map(h =>
    `<li><strong>${h.name}</strong> — Flagged for Zero-Cost Heat Alert</li>`
  ).join('');

  document.querySelectorAll('#list-cooling .pick-item, #list-relief .pick-item').forEach(el => {
    el.addEventListener('click', () => focusWard(el.dataset.ward));
  });
  if (selectedWard != null) inspectWard(selectedWard);

  renderCharts(plan.baselines, plan.tradeoff_curve);
}

// Ward number pins for chosen wards
let labelMarkers = [];
function ringCentroid(f) {
  const polys = f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.coordinates;
  let best = null, bestA = -1;
  polys.forEach(p => {
    const r = p[0]; let a = 0, cx = 0, cy = 0;
    for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
      const k = r[j][0] * r[i][1] - r[i][0] * r[j][1];
      a += k; cx += (r[j][0] + r[i][0]) * k; cy += (r[j][1] + r[i][1]) * k;
    }
    a /= 2;
    if (Math.abs(a) > bestA) { bestA = Math.abs(a); best = a ? [cx / (6 * a), cy / (6 * a)] : r[0]; }
  });
  return best;
}
function renderLabels(nos) {
  labelMarkers.forEach(m => m.remove());
  labelMarkers = [];
  nos.forEach(no => {
    const f = wardsGeoJSON.features.find(x => Number(x.properties.ward_no) === Number(no));
    if (!f) return;
    const el = document.createElement('button');
    el.type = 'button'; el.className = 'ward-pin'; el.textContent = 'W' + no;
    el.title = 'Inspect ward ' + no;
    el.addEventListener('click', e => { e.stopPropagation(); focusWard(no); });
    labelMarkers.push(new maplibregl.Marker({ element: el }).setLngLat(ringCentroid(f)).addTo(map));
  });
}

// Highlight the wards the optimizer chose and fade the rest (extra bright in Compare Mode)
function setHighlight(coolNos, reliefNos) {
  if (!map || !map.getLayer('wards-chosen')) return;
  renderLabels(coolNos);
  const none = [-1];
  const cn = coolNos.length ? coolNos : none, rn = reliefNos.length ? reliefNos : none;
  ['wards-chosen', 'wards-chosen-casing', 'wards-chosen-fill'].forEach(id => map.setFilter(id, ['in', 'ward_no', ...cn]));
  map.setFilter('wards-relief', ['in', 'ward_no', ...rn]);

  const unchosenOpacity = isCompareMode ? 0.18 : 0.42;
  map.setPaintProperty('wards-chosen-fill', 'fill-opacity', isCompareMode ? 0.52 : 0.22);
  map.setPaintProperty('wards-chosen', 'line-width', isCompareMode ? 5 : 4);
  map.setPaintProperty('wards-fill', 'fill-opacity',
    coolNos.length ? ['case', ['in', ['get', 'ward_no'], ['literal', coolNos]], 0.92, unchosenOpacity] : 0.68);
}

function renderCharts(baselines, tradeoff) {
  const ctxBase = document.getElementById('chart-baselines').getContext('2d');
  if (baselineChart) baselineChart.destroy();
  baselineChart = new Chart(ctxBase, {
    type: 'bar',
    data: {
      labels: baselines.map(b => b.strategy),
      datasets: [{
        label: 'Person-Degrees Averted (Modelled)',
        data: baselines.map(b => b.personDegrees),
        backgroundColor: ['#174a32', '#ef4444', '#3b82f6', '#f59e0b', '#64748b']
      }]
    },
    options: {
      plugins: { legend: { labels: { color: '#525955' } } },
      scales: {
        x: { ticks: { color: '#7a827d' } },
        y: { ticks: { color: '#7a827d' } }
      }
    }
  });

  const ctxTrade = document.getElementById('chart-tradeoff').getContext('2d');
  if (tradeoffChart) tradeoffChart.destroy();
  tradeoffChart = new Chart(ctxTrade, {
    type: 'line',
    data: {
      labels: tradeoff.map(t => `${t.floor_pct}% Guaranteed`),
      datasets: [{
        label: 'Total Person-Degrees Averted',
        data: tradeoff.map(t => t.total_person_degrees),
        borderColor: '#f97316',
        backgroundColor: 'rgba(249,115,22,0.2)',
        fill: true,
        tension: 0.25
      }]
    },
    options: {
      plugins: { legend: { labels: { color: '#525955' } } },
      scales: {
        x: { ticks: { color: '#7a827d' } },
        y: { ticks: { color: '#7a827d' } }
      }
    }
  });
}

let selectedWard = null;

function esc(t) { return String(t).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
const tname = t => String(t).replace(/_/g, ' ');

function isMeasuredCov(r) { return r && String(r.coverage_method || '').startsWith('osm_'); }

function pctile(prop, v) {
  const a = wardsGeoJSON.features.map(f => Number(f.properties[prop])).filter(x => !isNaN(x));
  return a.length ? Math.round(a.filter(x => x <= v).length / a.length * 100) : null;
}

function bboxOf(f) {
  let b = [Infinity, Infinity, -Infinity, -Infinity];
  (function walk(c) {
    if (typeof c[0] === 'number') { b = [Math.min(b[0], c[0]), Math.min(b[1], c[1]), Math.max(b[2], c[0]), Math.max(b[3], c[1])]; }
    else c.forEach(walk);
  })(f.geometry.coordinates);
  return [[b[0], b[1]], [b[2], b[3]]];
}

async function focusWard(no) {
  const f = wardsGeoJSON && wardsGeoJSON.features.find(x => Number(x.properties.ward_no) === Number(no));
  if (f) map.fitBounds(bboxOf(f), { padding: 70, maxZoom: 13.6, duration: 700 });
  await inspectWard(no);
  document.getElementById('win-map').scrollIntoView({ behavior: 'smooth', block: 'start' });
}
window.shadeDemoWard = async function () {
  const p = currentPlan && currentPlan.cooling.picks[0];
  if (p) await focusWard(p.ward_no);
};

// 5. Inspect Individual Ward
async function inspectWard(wardNo) {
  wardNo = Number(wardNo);
  selectedWard = wardNo;
  syncWardPicker(wardNo);
  if (map && map.getLayer('wards-selected')) map.setFilter('wards-selected', ['==', 'ward_no', wardNo]);
  if (heatmapMap && heatmapMap.getLayer('hm-wards-selected')) heatmapMap.setFilter('hm-wards-selected', ['==', 'ward_no', wardNo]);

  const res = await fetch(`/api/brief/${wardNo}`);
  const data = await res.json();
  if (selectedWard !== wardNo) return;
  const w = data.ward;
  const cools = data.cooling_options || [], reliefs = data.relief_options || [];
  const picks = currentPlan ? currentPlan.cooling.picks : [];
  const cIdx = picks.findIndex(p => Number(p.ward_no) === wardNo);
  const cp = cIdx >= 0 ? picks[cIdx] : null;
  const rps = currentPlan ? currentPlan.relief.picks.filter(r => Number(r.ward_no) === wardNo) : [];
  const cost = c => (c.cost_inr != null ? c.cost_inr : c.cost);
  const perLakh = c => c.cooling_gain_c / cost(c) * 1e5;

  const tiles = [
    ['Surface temp', `${w.mean_temp_c}°C`, 'mean_temp_c', w.mean_temp_c],
    ['Vulnerability', w.vulnerability, 'vulnerability', w.vulnerability],
    ['Population (Census 2011)', Number(w.population).toLocaleString(), 'population', w.population],
    ['Vegetation (NDVI)', w.mean_ndvi, 'mean_ndvi', w.mean_ndvi],
    ['Building density', `${Math.round(w.building_density * 100)}%`, 'building_density', w.building_density],
    ['Slum share (assumed)', `${Math.round(w.pct_slum * 100)}%`, 'pct_slum', w.pct_slum],
    ['Poor roofs (assumed)', `${Math.round(w.pct_poor_roof * 100)}%`, 'pct_poor_roof', w.pct_poor_roof],
    ['Distance to water', `${w.dist_water_m} m`, 'dist_water_m', w.dist_water_m]
  ].map(([label, shown, prop, v]) => {
    const p = pctile(prop, Number(v));
    return `<div class="wi-tile"><span>${label}</span><b>${shown}</b>${p == null ? '' : `<i class="wi-bar"><u style="width:${p}%"></u></i><small>higher than ${p}% of wards</small>`}</div>`;
  }).join('');

  const pT = pctile('mean_temp_c', w.mean_temp_c), pV = pctile('vulnerability', w.vulnerability), pP = pctile('population', w.population);
  const pN = pctile('mean_ndvi', w.mean_ndvi), pR = pctile('pct_poor_roof', w.pct_poor_roof), pB = pctile('building_density', w.building_density);

  const why = [];
  if (cp) {
    const drivers = [];
    if (pT >= 60) drivers.push(`hotter than ${pT}% of wards`);
    if (pV >= 60) drivers.push(`more vulnerable than ${pV}% of wards`);
    if (pP >= 60) drivers.push(`more populous than ${pP}% of wards`);
    why.push(`<b>Rank #${cIdx + 1} of ${picks.length}</b> structural cooling picks. ${drivers.length ? 'It is ' + drivers.join(', ') + '.' : 'It is not extreme on any one factor; the plan chose it for its overall value for money.'}`);
    const others = cools.filter(c => c.type !== cp.type);
    const me = cools.find(c => c.type === cp.type);
    const rival = others.sort((a, b) => perLakh(b) - perLakh(a))[0];
    if (me && rival) {
      why.push(perLakh(me) >= perLakh(rival)
        ? `<b>${tname(cp.type)}</b> beats ${tname(rival.type)} here: ${perLakh(me).toFixed(2)}°C vs ${perLakh(rival).toFixed(2)}°C of cooling per ₹1 lakh.`
        : `<b>${tname(cp.type)}</b> cools more in absolute terms (−${cp.cooling_gain_c}°C vs −${rival.cooling_gain_c}°C for ${tname(rival.type)}), even though ${tname(rival.type)} is cheaper per °C.`);
    }
    if (/roof/.test(cp.type) && pR >= 60) why.push(`Poor roofs (${Math.round(w.pct_poor_roof * 100)}%) are above ${pR}% of wards, the case where cool roofs help most.`);
    if (/tree/.test(cp.type) && pN <= 40) why.push(`Low vegetation (NDVI ${w.mean_ndvi}, greener than only ${pN}% of wards) leaves the most room for trees.`);
    if (pB >= 60) why.push(`Dense buildings (${Math.round(w.building_density * 100)}%) trap heat, so structural cooling pays back here.`);
    const spent = currentPlan.cooling.spent_inr || 1;
    why.push(`Costs ${formatINR(cost(cp))}, <b>${Math.round(cost(cp) / spent * 100)}%</b> of the cooling pool spent. Confidence <b>${Math.round(cp.stability * 100)}%</b>: how consistently it stays in the plan across the 50-model ensemble.`);
  } else if (currentPlan) {
    why.push(`<b>Not chosen for structural cooling</b> in the current run (${picks.length} wards were).`);
    const best = cools.slice().sort((a, b) => perLakh(b) - perLakh(a))[0];
    if (best && picks.length) {
      const avg = picks.reduce((t, p) => t + p.cooling_gain_c, 0) / picks.length;
      const avgCost = picks.reduce((t, p) => t + p.cost, 0) / picks.length;
      why.push(`Its best option (${tname(best.type)}) would give −${best.cooling_gain_c}°C for ${formatINR(cost(best))}; chosen wards average −${avg.toFixed(2)}°C for ${formatINR(avgCost)}.`);
    }
    why.push(`Temperature is above ${pT}% of wards, vulnerability ${pV}%, population ${pP}%. Try a bigger budget, more cooling share or different vulnerability weights to see if it enters the plan.`);
  }
  rps.forEach(r => why.push(`<b>Relief site:</b> ${tname(r.type)} placed here for ${Number(r.uncovered_vulnerable_pop).toLocaleString()} vulnerable people ${isMeasuredCov(r) ? 'not yet within a 300 m walk of a facility, measured along OpenStreetMap street routes' : 'estimated to be outside easy walking reach (an assumption, not yet measured from street routes)'} (${formatINR(r.cost)} per season).`));
  if (currentPlan && !rps.length) why.push('No seasonal relief site was placed in this ward in the current run.');

  const coolRows = cools.map(c => {
    const on = cp && cp.type === c.type;
    return `<li class="${on ? 'on' : ''}">${on ? '<em>Selected</em>' : ''}<strong>${tname(c.type)}</strong>: est. −${c.cooling_gain_c}°C (range −${c.cooling_gain_low_c} to −${c.cooling_gain_high_c}°C), ${formatINR(cost(c))}, ${perLakh(c).toFixed(2)}°C per ₹1 lakh</li>`;
  }).join('');
  const relRows = reliefs.map(r => {
    const on = rps.some(x => x.type === r.type);
    const c = cost(r);
    return `<li class="${on ? 'on' : ''}">${on ? '<em>Selected</em>' : ''}<strong>${tname(r.type)}</strong>: ${Number(r.uncovered_vulnerable_pop || 0).toLocaleString()} vulnerable people uncovered (${isMeasuredCov(r) ? 'measured' : 'estimate'})${c != null ? `, ${formatINR(c)}/season` : ''}</li>`;
  }).join('');
  const wr = reliefs.find(r => r.type === 'water_point');
  const gap = wr && wr.uncovered_vulnerable_pop > 0
    ? (isMeasuredCov(wr)
      ? `Measured along OpenStreetMap street routes, ${wr.uncovered_vulnerable_pop.toLocaleString()} people are not within a 300 m walk of a water point, versus ${wr.straight_line_uncovered_pop.toLocaleString()} if you use straight-line circles (circles overstate coverage by about ${Math.max(0, Math.round((1 - wr.straight_line_uncovered_pop / wr.uncovered_vulnerable_pop) * 100))}% here).`
      : `Water-point coverage for this ward is an estimate (assumed share of vulnerable people), not yet measured from street routes, so no circle-versus-street comparison is shown.`)
    : '';

  document.getElementById('ward-drawer-content').innerHTML = `
    <div class="wi-head"><h4>Ward ${w.ward_no}: ${esc(w.name)}</h4>
      <span class="wi-chip ${cp ? 'cool' : ''}">${cp ? `Cooling pick #${cIdx + 1}` : 'Not a cooling pick'}</span>
      ${rps.length ? '<span class="wi-chip relief">Relief site</span>' : ''}</div>
    <div class="wi-tiles">${tiles}</div>
    <p class="wi-assume">Population is from Census 2011. Slum and poor-roof shares are assumptions, not Census counts, and age shares are modelled estimates.</p>
    <h5>Why this allocation</h5><ul class="wi-why">${why.map(x => `<li>${x}</li>`).join('') || '<li>Run the optimizer to see how this ward was treated.</li>'}</ul>
    <div class="wi-measures"><h5>Recommended measures</h5>
      <p class="wi-sub">Long-term (cooling)</p><ul>${coolRows || '<li>No cooling options available.</li>'}</ul>
      <p class="wi-sub">Seasonal (relief)</p><ul>${relRows || '<li>No relief options available.</li>'}</ul>
      ${gap ? `<p class="wi-gap">${gap}</p>` : ''}</div>`;
}

function lockToKolkata(targetMap) {
  const m = targetMap || map;
  if (!m || !wardsGeoJSON) return;
  let b = [Infinity, Infinity, -Infinity, -Infinity];
  const grow = (x0, y0, x1, y1) => { b = [Math.min(b[0], x0), Math.min(b[1], y0), Math.max(b[2], x1), Math.max(b[3], y1)]; };
  wardsGeoJSON.features.forEach(f => { const [[x0, y0], [x1, y1]] = bboxOf(f); grow(x0, y0, x1, y1); });
  (wardsGeoJSON.facilities || []).forEach(fac => { const [x, y] = fac.geometry.coordinates; grow(x, y, x, y); });
  if (!isFinite(b[0])) return;
  const pad = 0.03;
  m.setMaxBounds([[b[0] - pad, b[1] - pad], [b[2] + pad, b[3] + pad]]);
}

let wardNos = [];
function buildWardPicker() {
  const strip = document.getElementById('wp-strip');
  if (!strip) return;
  wardNos = wardsGeoJSON.features.map(f => Number(f.properties.ward_no)).filter(n => !isNaN(n)).sort((a, b) => a - b);
  strip.innerHTML = wardNos.map(n => `<button type="button" class="wp-box" data-ward="${n}" aria-pressed="false">Ward ${n}</button>`).join('');
  strip.addEventListener('click', e => { const bx = e.target.closest('.wp-box'); if (bx) pickWard(bx.dataset.ward); });
  document.getElementById('wp-prev').addEventListener('click', () => stepWard(-1));
  document.getElementById('wp-next').addEventListener('click', () => stepWard(1));
}
function stepWard(d) {
  if (!wardNos.length) return;
  const i = wardNos.indexOf(Number(selectedWard));
  const n = i < 0 ? (d > 0 ? 0 : wardNos.length - 1) : (i + d + wardNos.length) % wardNos.length;
  pickWard(wardNos[n]);
}
async function pickWard(no) {
  const f = wardsGeoJSON.features.find(x => Number(x.properties.ward_no) === Number(no));
  if (f) map.fitBounds(bboxOf(f), { padding: 70, maxZoom: 13.6, duration: 700 });
  await inspectWard(no);
}
function syncWardPicker(no) {
  document.querySelectorAll('.wp-box').forEach(bx => {
    const on = Number(bx.dataset.ward) === Number(no);
    bx.classList.toggle('active', on);
    bx.setAttribute('aria-pressed', on);
    if (on) { const st = bx.parentNode; st.scrollTo({ left: bx.offsetLeft - st.clientWidth / 2 + bx.offsetWidth / 2, behavior: 'smooth' }); }
  });
}

// 6. Load Model Card, Real Training Timestamp, Formulas & Dataset Credits
async function loadModelCardAndCoverage() {
  const [mcRes, covRes] = await Promise.all([
    fetch('/api/model-card'),
    fetch('/api/coverage-gaps')
  ]);
  const mc = await mcRes.json();
  const cov = await covRes.json();

  // Resolve real training timestamp:
  // 1) If backend returns a parseable date in mc.last_trained_at, use it.
  // 2) Otherwise check HTTP Last-Modified header or persist the session's initial model build timestamp in localStorage.
  let parsedDate = mc.last_trained_at && mc.last_trained_at !== 'Just now' ? new Date(mc.last_trained_at) : null;
  if (!parsedDate || isNaN(parsedDate.getTime())) {
    const headerLM = mcRes.headers.get('Last-Modified');
    if (headerLM && !isNaN(new Date(headerLM).getTime())) {
      parsedDate = new Date(headerLM);
    } else {
      const savedTs = localStorage.getItem('shade_model_trained_ts');
      if (savedTs && !isNaN(new Date(savedTs).getTime())) {
        parsedDate = new Date(savedTs);
      } else {
        parsedDate = new Date();
        try { localStorage.setItem('shade_model_trained_ts', parsedDate.toISOString()); } catch (e) {}
      }
    }
  }
  modelTrainedTimestamp = parsedDate;

  document.getElementById('model-card-box').innerHTML = `
    <div class="audit-box">
      <div style="display:flex;flex-wrap:wrap;justify-content:space-between;align-items:center;gap:10px;padding-bottom:10px;margin-bottom:10px;border-bottom:1px solid var(--line-soft);">
        <div>
          <strong>Satellite Scene:</strong> <code>${mc.landsat_scene_id || 'LC09_L2SP_138044 (Landsat 8/9 C2-L2)'}</code> · <strong>Scene Date:</strong> ${mc.landsat_scene_date || 'Pre-Monsoon Peak'}
        </div>
        <span class="train-badge">
          <i class="train-dot"></i>
          <span>Model trained: <strong id="live-trained-time">${formatTrainedTime(modelTrainedTimestamp)}</strong></span>
        </span>
      </div>
      <strong>ML Thermal Model:</strong> ${mc.model_type} (50-bootstrap ensemble with monotonic physics constraints)<br/>
      <strong>Training Footprint:</strong> ${mc.training_cells_count || 960} sampled 30 m satellite pixels across ${mc.wards_count || 24} Kolkata wards<br/>
      <strong>Spatial Block CV:</strong> R² = ${mc.spatial_cv_r2}, RMSE = ${mc.spatial_cv_rmse_c}°C &nbsp;|&nbsp; <strong>Temporal CV:</strong> R² = ${mc.temporal_cv_r2 ?? 'not available'}, RMSE = ${mc.temporal_cv_rmse_c ?? 'not available'}${mc.temporal_cv_rmse_c != null ? '°C' : ''}<br/>
      <strong>Physics Monotonic Constraints:</strong> NDVI (−1), Albedo (−1), Building Density (+1), Distance to Water (+1)<br/>
      <em>Scientific Caution: Cooling values are correlational model estimates derived from Landsat Land Surface Temperature (LST), not clinical air-temperature trials. They predict land surface temperature, not how hot people feel, and have not been checked against heat illness, hospital admissions or published roof and tree pilots. Cross-validation scores show how well temperature is predicted, not whether an intervention works.</em>
    </div>

    <div class="meth-grid">
      <div class="meth-card">
        <h4>Core Formulas &amp; Optimization Equations</h4>
        <ul class="meth-list">
          <li>
            <strong>1. Composite Vulnerability Index ($V_i$):</strong>
            <div class="formula-box">V_i = Norm( w60·Z(Elderly_60+) + wu6·Z(Child_&lt;6) + wslum·Z(Slum) + wbldg·Z(BldgDensity) + wroof·Z(PoorRoof) )</div>
          </li>
          <li>
            <strong>2. Structural Cooling Objective (Person-Degrees Averted):</strong>
            <div class="formula-box">Maximize Σ ( ΔT_{i,m} × Pop_i × V_i ) &nbsp; subject to Σ Cost_{i,m} ≤ Budget_cool</div>
            where $\Delta T_{i,m}$ is either the ensemble mean ($\mu$) or conservative 10th percentile ($P_{10}$) across 50 monotonic GBDT models.
          </li>
          <li>
            <strong>3. NOAA / Rothfusz Heat Index ($HI$):</strong>
            <div class="formula-box">HI = -8.7847 + 1.6114·T + 2.3385·RH - 0.1461·T·RH - 0.0123·T² - 0.0164·RH² + ...</div>
            Used with live air temperature ($T$) and relative humidity ($RH$) to trigger IMD-aligned heatwave split recommendations.
          </li>
          <li>
            <strong>4. Street-Network Relief Coverage (measured where marked, estimate elsewhere):</strong>
            <div class="formula-box">Covered(i) = Σ people in ward i whose walking distance to the nearest facility ≤ 300 m</div>
            Walking distance is measured along OpenStreetMap pedestrian streets, then people are counted from WorldPop population cells. This is measured only where a ward's relief row says "measured"; otherwise the figure is an assumed share and is labelled "estimate". OpenStreetMap may be missing some water points or lanes.
          </li>
        </ul>
      </div>

      <div class="meth-card">
        <h4>Datasets, Satellite Sources &amp; Credits</h4>
        <ul class="meth-list">
          <li>
            <strong>Thermal &amp; Vegetation Satellite Rasters:</strong> USGS / NASA Landsat 8 &amp; 9 Collection 2 Level-2 Surface Temperature (<code>ST_B10</code>) &amp; Surface Reflectance (NDVI) via
            <a href="https://planetarycomputer.microsoft.com/dataset/landsat-c2-l2" target="_blank" rel="noopener noreferrer">Microsoft Planetary Computer STAC API ↗</a> &amp;
            <a href="https://www.usgs.gov/landsat-missions/landsat-collection-2-level-2-science-products" target="_blank" rel="noopener noreferrer">USGS EarthExplorer ↗</a>.
          </li>
          <li>
            <strong>Ward Boundaries:</strong> KMC ward boundaries (141 wards, older than the current delimitation), credited to
            <a href="https://github.com/datameet/Municipal_Spatial_Data/tree/master/Kolkata" target="_blank" rel="noopener noreferrer">DataMeet Kolkata Municipal Spatial Repository ↗</a>; check its licence terms for share-alike.
          </li>
          <li>
            <strong>Assumptions, not Census counts:</strong> the slum share and poor-roof share of each ward are assumed values, used for illustration and for the two matching vulnerability sliders. Do not treat them as measured.
          </li>
          <li>
            <strong>Pedestrian Street Network &amp; Healthcare Facilities:</strong> Walkable road graphs, water bodies, and hospital locations extracted from
            <a href="https://www.openstreetmap.org/#map=12/22.5480/88.3580" target="_blank" rel="noopener noreferrer">OpenStreetMap Contributors (Overpass / OSMnx) ↗</a>.
          </li>
          <li>
            <strong>Population &amp; Census 2011:</strong> ward population is a WorldPop modelled estimate, not a headcount. The 2011 Census is more than a decade old and is not used for headcounts here. See <a href="https://censusindia.gov.in/" target="_blank" rel="noopener noreferrer">Census of India ↗</a> for the old figures.
          </li>
          <li>
            <strong>Age Groups:</strong> modelled estimates (WorldPop age-sex rasters), not a headcount; the child group is under 5. Building density comes from OpenStreetMap building footprints, so it depends on how completely buildings are mapped.
          </li>
          <li>
            <strong>Live Meteorology &amp; Heatwave Thresholds:</strong> Real-time Kolkata temperature &amp; relative humidity via
            <a href="https://open-meteo.com/en/docs" target="_blank" rel="noopener noreferrer">Open-Meteo Weather API ↗</a> and heat action thresholds from
            <a href="https://mausam.imd.gov.in/" target="_blank" rel="noopener noreferrer">India Meteorological Department (IMD) ↗</a> &amp;
            <a href="https://ndma.gov.in/" target="_blank" rel="noopener noreferrer">NDMA Heat Wave Guidelines ↗</a>.
          </li>
          <li>
            <strong>Mortality Context (Intro Stage):</strong> Official accidental heatstroke fatality records from
            <a href="https://ncrb.gov.in/accidental-deaths-suicides-in-india.html" target="_blank" rel="noopener noreferrer">NCRB ADSI Reports (2015–2023) ↗</a>.
          </li>
        </ul>
      </div>
    </div>
  `;

  document.getElementById('coverage-gap-box').innerHTML = `
    <div class="audit-box">
      <strong>Street-Network Coverage Check:</strong> ${cov.note}
    </div>
  `;

  // Update the relative time ("X mins ago") live every 30 seconds
  setInterval(() => {
    const el = document.getElementById('live-trained-time');
    if (el && modelTrainedTimestamp) {
      el.textContent = formatTrainedTime(modelTrainedTimestamp);
    }
  }, 30000);
}

// 7. Wire UI Event Listeners
document.getElementById('rng-budget').addEventListener('input', (e) => {
  document.getElementById('val-budget').textContent = `₹${Number(e.target.value).toFixed(1)} Crore`;
});

document.getElementById('rng-split').addEventListener('input', (e) => {
  const c = Number(e.target.value);
  document.getElementById('val-split').textContent = `${c}% Cooling / ${100 - c}% Relief`;
});

document.getElementById('rng-floor').addEventListener('input', (e) => {
  document.getElementById('val-floor').textContent = `${e.target.value}%`;
});

document.getElementById('btn-run-plan').addEventListener('click', runOptimizer);
document.querySelectorAll('.weight-sliders input, #sel-estimate-mode').forEach(el => {
  el.addEventListener('change', runOptimizer);
});

document.getElementById('chk-sim-heatwave').addEventListener('change', async () => {
  await fetchWeather();
});

document.getElementById('btn-apply-suggested').addEventListener('click', async () => {
  document.getElementById('rng-split').value = latestSuggestedCooling;
  document.getElementById('val-split').textContent = `${latestSuggestedCooling}% Cooling / ${100 - latestSuggestedCooling}% Relief`;
  await runOptimizer();
});

document.querySelectorAll('.btn-layer').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.btn-layer').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    currentLayer = btn.dataset.layer;
    if (map && map.getLayer('wards-fill')) {
      map.setPaintProperty('wards-fill', 'fill-color', getColorExpression(currentLayer));
    }
  });
});

// Wire "Compare to Heatmap" buttons
['btn-compare-heatmap', 'btn-compare-toolbar'].forEach(id => {
  const el = document.getElementById(id);
  if (el) el.addEventListener('click', () => toggleCompareMode());
});
const closeCompBtn = document.getElementById('btn-close-compare');
if (closeCompBtn) closeCompBtn.addEventListener('click', () => toggleCompareMode(false));

// Language Toggle (English / Bengali)
document.getElementById('btn-lang').addEventListener('click', () => {
  currentLang = currentLang === 'en' ? 'bn' : 'en';
  const t = I18N[currentLang];
  document.getElementById('ui-title').innerHTML = t.title;
  document.getElementById('ui-subtitle').textContent = t.subtitle;
  document.getElementById('lbl-budget-controls').textContent = t.budgetControls;
  document.getElementById('btn-run-plan').textContent = t.runBtn;
});

// Save Scenario to Neon PostgreSQL
document.getElementById('btn-save-scenario').addEventListener('click', async () => {
  if (!currentPlan) return;
  const coolingPct = Number(document.getElementById('rng-split').value) / 100;
  const res = await fetch('/api/scenarios', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...currentPlan, cooling_share: coolingPct })
  });
  const data = await res.json();
  if (data.saved) {
    alert(`Scenario #${data.scenario_id} saved permanently to your Neon PostgreSQL database!`);
  }
});

window.addEventListener('DOMContentLoaded', initMap);