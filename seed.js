require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { pool } = require('./db');

async function seedDatabase() {
  const mlPath = path.join(__dirname, 'pipeline', 'ml_output.json');
  if (!fs.existsSync(mlPath)) {
    console.error("ERROR: pipeline/ml_output.json not found! Run 'python pipeline/run_full_pipeline.py' first.");
    process.exit(1);
  }

  const mlData = JSON.parse(fs.readFileSync(mlPath, 'utf-8'));
  const KOLKATA_WARDS = mlData.wards;
  const HOSPITALS = mlData.hospitals || [];
  const MODEL_CARD = mlData.model_card;

  // Real street-network coverage (from compute_coverage.py), one file per relief type, radius 300 m.
  // pipeline/coverage_water_point.json etc. Types without a file keep the old assumed share and are labelled 'assumed_share'.
  const COVERAGE_RADIUS = 300;
  const REAL = {};
  for (const t of ['water_point', 'cool_room', 'mobile_unit', 'school_ors']) {
    const f = path.join(__dirname, 'pipeline', `coverage_${t}.json`);
    if (!fs.existsSync(f)) continue;
    REAL[t] = {};
    for (const r of JSON.parse(fs.readFileSync(f, 'utf-8'))) {
      if (r.radius_m === COVERAGE_RADIUS) REAL[t][String(r.ward)] = r;
    }
    console.log(`Real coverage loaded for ${t}: ${Object.keys(REAL[t]).length} wards`);
  }

  console.log(`Connecting to Neon PostgreSQL to seed model trained at: ${MODEL_CARD.last_trained_at}...`);
  const client = await pool.connect();

  try {
    await client.query('BEGIN');
    await client.query(`CREATE EXTENSION IF NOT EXISTS postgis;`);

    await client.query(`
      DROP TABLE IF EXISTS model_metadata CASCADE;
      DROP TABLE IF EXISTS scenarios CASCADE;
      DROP TABLE IF EXISTS relief_options CASCADE;
      DROP TABLE IF EXISTS interventions CASCADE;
      DROP TABLE IF EXISTS facilities CASCADE;
      DROP TABLE IF EXISTS wards CASCADE;
    `);

    await client.query(`
      CREATE TABLE model_metadata (
        id SERIAL PRIMARY KEY,
        model_card JSONB,
        seeded_at TIMESTAMP DEFAULT now()
      );

      CREATE TABLE wards (
        id SERIAL PRIMARY KEY,
        ward_no INT UNIQUE,
        name TEXT,
        geom GEOMETRY(Geometry, 4326),
        mean_temp_c REAL,
        mean_ndvi REAL,
        building_density REAL,
        population INT,
        pct_60plus REAL,
        pct_under6 REAL,
        pct_slum REAL,
        pct_poor_roof REAL,
        dist_water_m REAL,
        night_heat_proxy REAL,
        vulnerability REAL
      );

      CREATE TABLE interventions (
        id SERIAL PRIMARY KEY,
        ward_id INT REFERENCES wards(id) ON DELETE CASCADE,
        type TEXT,
        cooling_gain_c REAL,
        cooling_gain_low_c REAL,
        cooling_gain_high_c REAL,
        gain_samples REAL[],
        cost_inr BIGINT
      );

      CREATE TABLE facilities (
        id SERIAL PRIMARY KEY,
        type TEXT,
        name TEXT,
        geom GEOMETRY(Point, 4326)
      );

      CREATE TABLE relief_options (
        id SERIAL PRIMARY KEY,
        ward_id INT REFERENCES wards(id) ON DELETE CASCADE,
        type TEXT,
        coverage_method TEXT,
        uncovered_vulnerable_pop INT,
        straight_line_uncovered_pop INT,
        heat_exposure REAL,
        unit_cost_inr_per_season BIGINT
      );

      CREATE TABLE scenarios (
        id SERIAL PRIMARY KEY,
        budget_inr BIGINT,
        cooling_share REAL,
        strategy TEXT,
        estimate_mode TEXT,
        chosen_cooling JSONB,
        chosen_relief JSONB,
        pick_stability JSONB,
        equity_audit JSONB,
        people_reached INT,
        person_degrees REAL,
        vulnerable_people_covered INT,
        created_at TIMESTAMP DEFAULT now()
      );
    `);

    // Save the Model Card & Last Trained Timestamp in Neon DB
    await client.query(`INSERT INTO model_metadata (model_card) VALUES ($1);`, [JSON.stringify(MODEL_CARD)]);

    const temps = KOLKATA_WARDS.map(w => w.temp);
    const minTemp = Math.min(...temps);
    const maxTemp = Math.max(...temps);

    for (const w of KOLKATA_WARDS) {
      const nightProxy = Number(((w.bldg * 0.65) + ((1 - w.ndvi) * 0.35)).toFixed(2));
      const vuln = Number(((w.p60 / 0.20 + w.pu6 / 0.15 + w.pslum / 0.75 + w.bldg + w.proof / 0.80) / 5).toFixed(2));

      const wardRes = await client.query(`
        INSERT INTO wards (
          ward_no, name, geom, mean_temp_c, mean_ndvi, building_density,
          population, pct_60plus, pct_under6, pct_slum, pct_poor_roof,
          dist_water_m, night_heat_proxy, vulnerability
        ) VALUES (
          $1, $2, ST_SetSRID(ST_GeomFromGeoJSON($3), 4326), $4, $5, $6,
          $7, $8, $9, $10, $11, $12, $13, $14
        ) RETURNING id;
      `, [
        w.ward_no, w.name, JSON.stringify(w.geometry), w.temp, w.ndvi, w.bldg,
        w.pop, w.p60, w.pu6, w.pslum, w.proof,
        w.water, nightProxy, vuln
      ]);

      const wardId = wardRes.rows[0].id;

      const roofCost = Math.round((w.bldg * 14000000) + 4500000);
      await client.query(`
        INSERT INTO interventions (ward_id, type, cooling_gain_c, cooling_gain_low_c, cooling_gain_high_c, gain_samples, cost_inr)
        VALUES ($1, 'cool_roof', $2, $3, $4, $5, $6);
      `, [wardId, w.cool_roof.mean, w.cool_roof.low_p10, w.cool_roof.high_p90, w.cool_roof.samples, roofCost]);

      const treeCost = Math.round(6500000 + (1 - w.ndvi) * 5500000);
      await client.query(`
        INSERT INTO interventions (ward_id, type, cooling_gain_c, cooling_gain_low_c, cooling_gain_high_c, gain_samples, cost_inr)
        VALUES ($1, 'trees', $2, $3, $4, $5, $6);
      `, [wardId, w.trees.mean, w.trees.low_p10, w.trees.high_p90, w.trees.samples, treeCost]);

      const heatExp = Number(((w.temp - minTemp) / ((maxTemp - minTemp) || 1)).toFixed(2));
      // vulnerable people = real 60+ and under-5 shares of the ward (not the 0..1 index)
      const vulnPop = Math.round(w.pop * Math.min(1, w.p60 + w.pu6));

      const reliefTypes = [
        { type: 'water_point', shareUncovered: 0.42, cost: 1200000 },
        { type: 'cool_room',   shareUncovered: 0.35, cost: 2800000 },
        { type: 'mobile_unit', shareUncovered: 0.48, cost: 3500000 },
        { type: 'school_ors',  shareUncovered: 0.25, cost: 900000 }
      ];

      for (const rt of reliefTypes) {
        const real = REAL[rt.type] && REAL[rt.type][String(w.ward_no)];
        let streetUncovered, straightLineUncovered, method;
        if (real) {
          streetUncovered = real.uncovered_street;
          straightLineUncovered = real.people_counted - real.covered_circle;
          method = `osm_street_network_${COVERAGE_RADIUS}m`;
        } else {
          // ASSUMPTION, not measured: fixed share of the vulnerable population
          streetUncovered = Math.round(vulnPop * rt.shareUncovered);
          straightLineUncovered = Math.round(streetUncovered * 0.76);
          method = 'assumed_share';
        }

        await client.query(`
          INSERT INTO relief_options (
            ward_id, type, coverage_method, uncovered_vulnerable_pop,
            straight_line_uncovered_pop, heat_exposure, unit_cost_inr_per_season
          ) VALUES ($1, $2, $3, $4, $5, $6, $7);
        `, [wardId, rt.type, method, streetUncovered, straightLineUncovered, heatExp, rt.cost]);
      }
    }

    for (const h of HOSPITALS) {
      await client.query(`
        INSERT INTO facilities (type, name, geom)
        VALUES ($1, $2, ST_SetSRID(ST_MakePoint($3, $4), 4326));
      `, [h.type, h.name, h.lon, h.lat]);
    }

    await client.query('COMMIT');
    console.log(`Neon PostgreSQL seeded! Model Timestamp: ${MODEL_CARD.last_trained_at} | Scene: ${MODEL_CARD.landsat_scene_id}`);
  } catch (err) {
    await client.query('ROLLBACK');
    console.error("Error seeding database:", err);
  } finally {
    client.release();
    process.exit(0);
  }
}

seedDatabase();