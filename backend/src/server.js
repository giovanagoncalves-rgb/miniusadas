require('dotenv').config();
require('express-async-errors');

const express = require('express');
const helmet  = require('helmet');
const cors    = require('cors');

const { errorHandler } = require('./middlewares/errorHandler');
const routes           = require('./routes');

const app  = express();
const PORT = process.env.PORT || 4000;

// ── Segurança ────────────────────────────────
app.use(helmet());
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

app.listen(PORT, () => {
  console.log(`[miniusadas] API rodando na porta ${PORT}`);
});
