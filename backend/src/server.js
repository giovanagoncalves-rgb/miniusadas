require('dotenv').config();
require('express-async-errors');

const express = require('express');
const helmet  = require('helmet');
const cors    = require('cors');
const path    = require('path');

const { errorHandler } = require('./middlewares/errorHandler');
const routes           = require('./routes');

const app  = express();
const PORT = process.env.PORT || 4000;

// ── Segurança ────────────────────────────────
// crossOrigin resource policy liberada para permitir que o front (outro domínio)
// exiba as imagens servidas por /uploads.
app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));

// ── Arquivos enviados (fotos das máquinas) ───
const UPLOADS_DIR = process.env.STORAGE_LOCAL_PATH || '/app/uploads';
app.use('/uploads', express.static(UPLOADS_DIR));

const allowedOrigins = (process.env.APP_URL || 'http://localhost')
  .split(',')
  .map(s => s.trim())

app.use(cors({
  origin: (origin, cb) => {
    // Permite chamadas sem origin (mobile, Postman, server-to-server)
    if (!origin) return cb(null, true)
    if (allowedOrigins.includes(origin)) return cb(null, true)
    cb(new Error(`CORS bloqueado: ${origin}`))
  },
  credentials: true,
}));

// ── Body parsing ─────────────────────────────
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// ── Rotas ────────────────────────────────────
app.use('/api', routes);

// ── Health check ─────────────────────────────
app.get('/api/health', (_, res) => res.json({ status: 'ok', ts: new Date() }));

// ── Error handler global ─────────────────────
app.use(errorHandler);

// ── Inicialização do banco (idempotente) ─────
const { initSchema, ensureSeedUsers, ensureSampleListings } = require('./config/initDb');

async function start() {
  try {
    await initSchema();
    await ensureSeedUsers();
    await ensureSampleListings();
  } catch (err) {
    // Não derruba a API se o banco estiver indisponível — apenas registra.
    console.error('[db] Falha ao inicializar o banco:', err.message);
  }
  app.listen(PORT, () => {
    console.log(`[miniusadas] API rodando na porta ${PORT}`);
  });
}

start();
