require('dotenv').config();
const { Pool } = require('pg');

// Create a connection pool to Neon PostgreSQL
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  // Verify the server certificate. Neon uses a public CA, so this works as is.
  // Only for a local test database without a valid certificate: set DB_SSL_INSECURE=1
  ssl: process.env.DB_SSL_INSECURE === '1' ? { rejectUnauthorized: false } : true,
  max: 5,                          // small pool: free tiers have few connections
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 20000   // never hang forever if the database is waking up
});

// Neon closes idle connections; without this handler an idle drop would crash the server
pool.on('error', (err) => console.error('[DB pool error]', err.message));

// In-memory cache so live requests run quickly
const cache = {
  loaded: false,
  wards: [],
  interventions: [],
  reliefOptions: [],
  facilities: [],
  // Placeholder only. The real model card (scores, sources, limitations) is read from the
  // model_metadata table that seed.js fills from pipeline/ml_output.json.
  modelCard: {
    model_type: "Model card not loaded (run node seed.js)",
    spatial_cv_r2: null,
    spatial_cv_rmse_c: null,
    temporal_cv_r2: null,
    temporal_cv_rmse_c: null,
    monotonic_constraints: {},
    feature_importances: []
  }
};

async function loadCacheFromDB() {
  try {
    const wardsRes = await pool.query(`
      SELECT id, ward_no, name, ST_AsGeoJSON(geom)::json AS geometry,
             mean_temp_c, mean_ndvi, building_density, population,
             pct_60plus, pct_under6, pct_slum, pct_poor_roof,
             dist_water_m, night_heat_proxy, vulnerability
      FROM wards ORDER BY ward_no ASC;
    `);
    const intRes = await pool.query(`SELECT * FROM interventions ORDER BY id ASC;`);
    const relRes = await pool.query(`SELECT * FROM relief_options ORDER BY id ASC;`);
    const facRes = await pool.query(`
      SELECT id, type, name, ST_AsGeoJSON(geom)::json AS geometry
      FROM facilities ORDER BY id ASC;
    `);

    const mcRes = await pool.query(`SELECT model_card FROM model_metadata ORDER BY id DESC LIMIT 1;`);
    if (mcRes.rows.length) cache.modelCard = mcRes.rows[0].model_card;

    cache.wards = wardsRes.rows;
    cache.interventions = intRes.rows;
    cache.reliefOptions = relRes.rows;
    cache.facilities = facRes.rows;
    cache.loaded = true;
    console.log(`[DB Cache] Loaded ${cache.wards.length} wards, ${cache.interventions.length} cooling options, ${cache.reliefOptions.length} relief options.`);
  } catch (err) {
    console.error("[DB Cache Error] Could not load tables. Have you run 'node seed.js' yet?", err.message);
  }
}

module.exports = { pool, cache, loadCacheFromDB };