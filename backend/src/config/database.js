const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
  // Railway e a maioria dos provedores exigem SSL
  ssl: process.env.DB_SSL === 'false' ? false : { rejectUnauthorized: false },
});

pool.on('error', (err) => {
  console.error('[db] Erro inesperado no pool:', err.message);
});

const query = (text, params) => pool.query(text, params);

module.exports = { query, pool };
