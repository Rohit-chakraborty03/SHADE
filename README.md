<div align="center">

# 🌿 S.H.A.D.E. — Kolkata
### **S**ystem for **H**eat **A**llocation & **D**istribution **E**quity

*A heat map only shows where it is hottest. S.H.A.D.E. shows where a limited municipal budget protects the most vulnerable people first.*

[![Status](https://img.shields.io/badge/Status-Active_Prototype-1a4a38?style=for-the-badge)]()
[![Scope](https://img.shields.io/badge/Coverage-Kolkata_Wards-0369a1?style=for-the-badge)]()
</div>

---

## 📖 Overview

When extreme pre-monsoon heatwaves hit Kolkata, municipal planners face a hard trade-off: **where should a limited heat-adaptation budget go first?** 

Targeting strictly by surface temperature ("Hottest-First") often funds empty industrial roofs or low-density zones while crowded *bustees* (slums) with tin/asbestos roofs, elderly residents, and young children bake a few wards away. 

**S.H.A.D.E.** is a decision-support and spatial optimization engine built for Kolkata. It combines **Landsat-8/9 thermal satellite rasters**, **ward-level socio-demographic vulnerability**, **real-time Open-Meteo heat indices**, and **OpenStreetMap pedestrian street networks** to allocate municipal budgets across two distinct pools:
1. **Structural Cooling (Capital Spend):** Long-term interventions (*Cool Roofs, Urban Trees*) that lower ward temperatures for years.
2. **Seasonal Relief (Operational Spend):** Immediate summer protection (*Water Points, Cool Rooms, Mobile Relief Units, School ORS Supply*) placed along walkable street graphs.

---

## ⚡ The 30-Second Proof ("Compare to Heatmap")

S.H.A.D.E. includes an interactive, synchronized dual-map **Compare to Heatmap** mode that runs a live side-by-side audit on the exact same cooling budget:
* **Left Map ("A heat map would fund these wards"):** Simulates a naive *Hottest-First* baseline that spends the budget strictly on the highest Land Surface Temperature (LST) wards.
* **Right Map ("S.H.A.D.E. funds these wards"):** Shows the equity-optimized allocation that balances thermal gain (ΔT), population density, and vulnerability.
* **Live Impact Delta:** Automatically computes the **extra vulnerable residents reached**, **extra seniors (60+) & young children (<6) protected**, and **percentage gain in person-degrees averted** using the exact same rupee outlay.

---

## ✨ Key Architectural Features

* **🌡️ Live Heat-Index Split Advisor:** Queries real-time air temperature and relative humidity for Kolkata via Open-Meteo, computes the NOAA Rothfusz Heat Index, and dynamically recommends a budget split between long-term cooling and immediate summer relief (with a *Severe Heatwave 43.8°C* simulator).
* **🧠 50-Model Physics-Constrained Ensemble:** Estimates sub-ward cooling gains across 960 raster cells using a 50-bootstrap ensemble with monotonic physics constraints:
  * Vegetation `NDVI` (-1), Surface `Albedo` (-1), `Building Density` (+1), `Distance to Water` (+1).
  * Supports **Expected Mode** (ensemble mean μ) and **Conservative Mode** (10th percentile P₁₀ cautious planning), displaying per-ward confidence/stability badges.
* **🚶 Street-Network Isochrone Coverage (Not Euclidean Circles):** Evaluates seasonal relief reach along real OpenStreetMap pedestrian street routes (300 m walk for water points, 1 km walk for cool rooms) and audits how much straight-line circles overstate coverage.
* **⚖️ Equity Floor & Trade-off Curve:** Lets planners reserve 0%–50% of the budget exclusively for the most vulnerable quintile of wards and plots the exact "price of fairness" curve against total person-degrees averted.
* **🌳 RAG "Ask the Tree" Plan Explainer:** An interactive SVG botanical assistant (`shade-bot.js`) that intercepts the live `/api/plan` and `/api/weather` state and explains *why* specific wards were chosen or why a particular ward was skipped.
* **📄 Formal Client-Side PDF Dossier (`report.js`):** Generates a multi-page, watermarked A4 executive report with `jsPDF` containing the live parameters, ward tables, equity audit, and methodology notes.
* **🌐 Bilingual UI & Tactile Desktop Chrome:** Instant English / বাংলা (`bn`) toggle, interactive 28-step guided tour, procedural SVG forest generation (`Mulberry32` PRNG) with scroll-spring physics, and zero-dependency Web Audio API tactile click synthesis.

---

## 🛠️ Tech Stack

<table>
  <tr>
    <td width="33%" valign="top">
      <h3>🖥️ Frontend & Mapping</h3>
      <p>
        <img src="https://img.shields.io/badge/MapLibre_GL_JS-4.7-396CB2?style=flat-square&logo=maplibre&logoColor=white" alt="MapLibre" />
        <img src="https://img.shields.io/badge/Chart.js-4.4-FF6384?style=flat-square&logo=chartdotjs&logoColor=white" alt="Chart.js" />
        <img src="https://img.shields.io/badge/jsPDF-2.5-E34F26?style=flat-square" alt="jsPDF" />
        <img src="https://img.shields.io/badge/Vanilla_JS-ES6+-F7DF1E?style=flat-square&logo=javascript&logoColor=black" alt="JavaScript" />
        <img src="https://img.shields.io/badge/HTML5_%26_CSS3-Custom_UI-1a4a38?style=flat-square&logo=html5&logoColor=white" alt="HTML/CSS" />
      </p>
      <ul>
        <li><b>MapLibre GL JS:</b> Synchronized dual-canvas vector ward rendering & custom HTML markers.</li>
        <li><b>Chart.js:</b> Strategy benchmark bar charts & equity trade-off curves.</li>
        <li><b>jsPDF:</b> Client-side A4 executive report generation.</li>
        <li><b>Web Audio API:</b> Synthesized tactile UI feedback.</li>
      </ul>
    </td>
    <td width="33%" valign="top">
      <h3>⚙️ Backend & Database</h3>
      <p>
        <img src="https://img.shields.io/badge/Node.js-Runtime-339933?style=flat-square&logo=nodedotjs&logoColor=white" alt="Node.js" />
        <img src="https://img.shields.io/badge/Express.js-REST_API-000000?style=flat-square&logo=express&logoColor=white" alt="Express" />
        <img src="https://img.shields.io/badge/PostgreSQL-Database-4169E1?style=flat-square&logo=postgresql&logoColor=white" alt="PostgreSQL" />
        <img src="https://img.shields.io/badge/Neon_DB-Serverless_PG-00E599?style=flat-square&logoColor=black" alt="Neon DB" />
        <img src="https://img.shields.io/badge/RAG_Explainer-/api/explain-15803d?style=flat-square" alt="RAG" />
      </p>
      <ul>
        <li><b>Node.js & Express:</b> Serves geospatial endpoints (<code>/api/wards</code>, <code>/api/plan</code>, <code>/api/brief/:ward</code>, <code>/api/explain</code>).</li>
        <li><b>Neon Serverless PostgreSQL:</b> Stores Kolkata ward telemetry, precomputed ensemble matrices, and saved user scenarios.</li>
      </ul>
    </td>
    <td width="34%" valign="top">
      <h3>🛰️ Geospatial & ML Pipeline</h3>
      <p>
        <img src="https://img.shields.io/badge/Python-3.10+-3776AB?style=flat-square&logo=python&logoColor=white" alt="Python" />
        <img src="https://img.shields.io/badge/GeoPandas-%26_Shapely-139C5A?style=flat-square" alt="GeoPandas" />
        <img src="https://img.shields.io/badge/PySTAC-Planetary_Computer-0078D4?style=flat-square" alt="Planetary Computer" />
        <img src="https://img.shields.io/badge/Landsat_8/9-C2_L2_LST-b91c1c?style=flat-square" alt="Landsat" />
        <img src="https://img.shields.io/badge/OpenStreetMap-Street_Graphs-7EBC6F?style=flat-square&logo=openstreetmap&logoColor=white" alt="OSM" />
      </p>
      <ul>
        <li><b>Planetary Computer & PySTAC:</b> Fetches Landsat Collection 2 Level-2 surface temperature (<code>ST_B10</code>) & NDVI rasters.</li>
        <li><b>GeoPandas & Shapely:</b> Sub-ward zonal statistics & KMC ward polygon processing.</li>
        <li><b>Spatial & Temporal Block CV:</b> Validated across 960 sub-ward cells.</li>
      </ul>
    </td>
  </tr>
</table>

---

## 📐 Core Mathematical Formulation

### 1. Composite Ward Vulnerability Index (V_i)
Users can dynamically weight five normalized census and morphological risk factors (weights `w` from `0` to `2`):

```text
V_i = Norm( w_60   · Z(Elderly_60+) 
          + w_u6   · Z(Children_<6) 
          + w_slum · Z(SlumShare) 
          + w_bldg · Z(BldgDensity) 
          + w_roof · Z(PoorRoof) )
```
*Where `Z(...)` is the standard score across all wards and `Norm(...)` scales the final index between `0` and `1`.*

### 2. Structural Cooling Optimization Objective
Given a structural cooling budget `B_cool = α · B_total` and an optional equity floor `φ` (`0%` to `50%`) reserved for the top vulnerability quintile (`Q_5`):

```text
Maximize:   ∑ ( ΔT_{i,m} × Pop_i × V_i )   across all chosen wards (i) and cooling measures (m)

Subject to: 
  1. Budget Cap:    ∑ Cost_{i,m} ≤ B_cool
  2. Equity Floor:  ∑ Cost_{i,m} (for wards in top quintile Q_5) ≥ φ · B_cool
```
*Where `ΔT_{i,m}` is either the ensemble average `μ(ΔT)` (**Expected Mode**) or the cautious 10th percentile `P_10(ΔT)` (**Conservative Mode**) across 50 monotonic GBDT models.*

### 3. NOAA / Rothfusz Heat Index (HI)
Used with live air temperature (`T`) and relative humidity (`RH`) to trigger IMD-aligned heatwave budget split recommendations:

```text
HI = -8.7847 + 1.6114·T + 2.3385·RH - 0.1461·T·RH - 0.0123·T² - 0.0164·RH² + ...
```

### 4. Pedestrian Street-Network Relief Coverage
Rather than assuming straight-line Euclidean circles (`π · d_max²`), seasonal relief coverage for water points (`d_max = 300 m`) and cool rooms (`d_max = 1000 m`) is discounted by the real OpenStreetMap pedestrian street-network isochrone area:

```text
CoveredPop(i, r) = VulnerablePop(i) × [ IsochroneArea(OSM_Graph, d_max) / (π · d_max²) ]
```

---

## 📂 Project Structure

```text
shade-kolkata/
├── public/ (or root static files)
│   ├── index.html        # Main workspace UI, SVG tree library, dual-map stage & intro loader
│   ├── style.css         # Core botanical theme tokens, layout grid, tour & modal rules
│   ├── human.css         # Clean crisp card surfaces, Yanone Kaffeesatz proof banner & dual-map styles
│   ├── app.js            # MapLibre dual-map controller, optimizer client, ward inspector & proof engine
│   ├── desktop.js        # Window chrome (min/max/close), NCRB intro stage, PRNG forest & Web Audio clicks
│   ├── human.js          # Plain-language split interpreter & contextual '?' tooltip popovers
│   ├── shade-bot.js      # "Ask the Tree" RAG chat widget & state interceptor
│   ├── shade-bot.css     # Animated growing tree button & chat window styles
│   └── report.js         # Client-side A4 PDF report builder (jsPDF)
├── server.js             # Express API server (/api/wards, /api/plan, /api/weather, /api/explain, etc.)
├── seed.js               # Database seeder for Kolkata wards, facilities & ensemble predictions
└── .env                  # Neon PostgreSQL connection string (DATABASE_URL) & API keys
```

---

## 🚀 Getting Started Locally

### 1. Prerequisites
* **Node.js** (v18+ recommended)
* A **PostgreSQL** database (local or [Neon Serverless Postgres](https://neon.tech/))

### 2. Clone & Install Dependencies
```bash
git clone [https://github.com/Rohit-chakraborty03/shade-kolkata.git](https://github.com/Rohit-chakraborty03/shade-kolkata.git)
cd shade-kolkata
npm install
```

### 3. Configure Environment Variables
Create a `.env` file in the project root:
```env
PORT=3000
DATABASE_URL=postgresql://<user>:<password>@<your-neon-host>/<dbname>?sslmode=require
GEMINI_API_KEY=your_optional_key_for_tree_explainer
```

### 4. Seed the Kolkata Ward Database & Start Server
```bash
node seed.js
node server.js
```
Open **`http://localhost:3000`** in your browser *(do not open `index.html` via `file://` or Live Server, as the frontend requires the Express API endpoints)*.

---

## 📚 Data Sources & Scientific Credits

* **Satellite Thermal & Vegetation Data:** USGS / NASA Landsat 8 & 9 Collection 2 Level-2 Science Products (`ST_B10` & Surface Reflectance) accessed via the [Microsoft Planetary Computer STAC API](https://planetarycomputer.microsoft.com/dataset/landsat-c2-l2).
* **Ward Boundaries & Demographics:** Kolkata Municipal Corporation (KMC) ward boundaries and housing/roof-material tables from the [Census of India](https://censusindia.gov.in/) and the [DataMeet Kolkata Municipal Spatial Repository](https://github.com/datameet/Municipal_Spatial_Data/tree/master/Kolkata).
* **Street Networks & Health Facilities:** Pedestrian routing graphs, water bodies, and hospital locations from [OpenStreetMap Contributors](https://www.openstreetmap.org/).
* **Live Meteorology & Heat Thresholds:** Real-time weather via the [Open-Meteo API](https://open-meteo.com/) and heatwave alert thresholds aligned with the [India Meteorological Department (IMD)](https://mausam.imd.gov.in/) and [NDMA Guidelines](https://ndma.gov.in/).
* **Historical Mortality Context:** Official heat/sunstroke fatality records from [NCRB Accidental Deaths & Suicides in India (ADSI) Reports](https://ncrb.gov.in/).

> **Scientific Caution:** Cooling values (ΔT) are correlational model estimates derived from pre-monsoon Landsat Land Surface Temperature (LST) rasters, not clinical air-temperature randomized trials. S.H.A.D.E. is a decision-support tool designed to complement—not replace—on-site municipal engineering surveys.

---

## 👤 Author

Designed by **Rohit Chakravorty**  
[![LinkedIn](https://img.shields.io/badge/LinkedIn-Rohit_Chakravorty-0A66C2?style=flat-square&logo=linkedin&logoColor=white)](https://www.linkedin.com/in/rohit-chakravorty-8b947438b/)
[![X](https://img.shields.io/badge/X-@Rohitchakr27069-000000?style=flat-square&logo=x&logoColor=white)](https://x.com/Rohitchakr27069)
[![GitHub](https://img.shields.io/badge/GitHub-Rohit--chakraborty03-181717?style=flat-square&logo=github&logoColor=white)](https://github.com/Rohit-chakraborty03)
