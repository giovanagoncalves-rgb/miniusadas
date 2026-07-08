// Script manual de setup do banco.
// Cria o schema e os usuários iniciais definidos por variáveis de ambiente.
// Uso: node src/scripts/seed.js
require('dotenv').config();
const { initSchema, ensureSeedUsers, ensureSampleListings } = require('../config/initDb');
const { pool } = require('../config/database');

(async () => {
  try {
    await initSchema();
    await ensureSeedUsers();
    await ensureSampleListings();
    console.log('[seed] Concluído com sucesso.');
    process.exit(0);
  } catch (err) {
    console.error('[seed] Erro:', err.message);
    process.exit(1);
  } finally {
    await pool.end().catch(() => {});
  }
})();
