const bcrypt = require('bcryptjs');
const db = require('./database');

// Cria o schema do banco (idempotente — só cria o que ainda não existe).
const SCHEMA = `
CREATE TABLE IF NOT EXISTS dealers (
  id          BIGSERIAL PRIMARY KEY,
  name        TEXT NOT NULL,
  email       TEXT,
  phone       TEXT,
  city        TEXT,
  state       TEXT,
  region      TEXT,
  logo_url    TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS users (
  id          BIGSERIAL PRIMARY KEY,
  name        TEXT NOT NULL,
  email       TEXT NOT NULL UNIQUE,
  password    TEXT NOT NULL,
  role        TEXT NOT NULL DEFAULT 'dealer' CHECK (role IN ('admin','dealer')),
  dealer_id   BIGINT REFERENCES dealers(id) ON DELETE SET NULL,
  active      BOOLEAN NOT NULL DEFAULT TRUE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS listings (
  id               BIGSERIAL PRIMARY KEY,
  dealer_id        BIGINT NOT NULL REFERENCES dealers(id) ON DELETE CASCADE,
  title            TEXT NOT NULL,
  category         TEXT NOT NULL CHECK (category IN ('mini_escavadeira','mini_pa_carregadeira','mini_retroescavadeira')),
  model            TEXT,
  year             INTEGER,
  hours_used       INTEGER,
  price            NUMERIC(12,2) NOT NULL,
  description      TEXT,
  specs            JSONB NOT NULL DEFAULT '{}'::jsonb,
  status           TEXT NOT NULL DEFAULT 'draft'
                   CHECK (status IN ('draft','pending_approval','published','paused','sold','deleted')),
  rejection_reason TEXT,
  approved_by      BIGINT REFERENCES users(id) ON DELETE SET NULL,
  approved_at      TIMESTAMPTZ,
  published_at     TIMESTAMPTZ,
  sold_at          TIMESTAMPTZ,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS listing_photos (
  id           BIGSERIAL PRIMARY KEY,
  listing_id   BIGINT NOT NULL REFERENCES listings(id) ON DELETE CASCADE,
  url          TEXT NOT NULL,
  order_index  INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS leads (
  id           BIGSERIAL PRIMARY KEY,
  listing_id   BIGINT REFERENCES listings(id) ON DELETE SET NULL,
  dealer_id    BIGINT REFERENCES dealers(id) ON DELETE SET NULL,
  name         TEXT NOT NULL,
  email        TEXT NOT NULL,
  phone        TEXT,
  message      TEXT,
  make_sent    BOOLEAN NOT NULL DEFAULT FALSE,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_listings_status   ON listings(status);
CREATE INDEX IF NOT EXISTS idx_listings_dealer   ON listings(dealer_id);
CREATE INDEX IF NOT EXISTS idx_listings_category ON listings(category);
CREATE INDEX IF NOT EXISTS idx_photos_listing    ON listing_photos(listing_id);
`;

async function initSchema() {
  await db.query(SCHEMA);
  console.log('[db] Schema verificado/criado com sucesso.');
}

// Cria usuários iniciais a partir de variáveis de ambiente (idempotente).
// Nada é criado se as variáveis não estiverem definidas.
async function ensureSeedUsers() {
  // ── Admin YANMAR ──
  const adminEmail = process.env.SEED_ADMIN_EMAIL;
  const adminPass  = process.env.SEED_ADMIN_PASSWORD;
  if (adminEmail && adminPass) {
    const hash = await bcrypt.hash(adminPass, 10);
    const { rowCount } = await db.query(
      `INSERT INTO users (name, email, password, role, active)
       VALUES ($1, $2, $3, 'admin', TRUE)
       ON CONFLICT (email) DO NOTHING`,
      [process.env.SEED_ADMIN_NAME || 'Administrador YANMAR', adminEmail.toLowerCase(), hash]
    );
    console.log(rowCount ? `[db] Admin criado: ${adminEmail}` : `[db] Admin já existente: ${adminEmail}`);
  }

  // ── Concessionária de demonstração + usuário ──
  const dealerEmail = process.env.SEED_DEALER_EMAIL;
  const dealerPass  = process.env.SEED_DEALER_PASSWORD;
  if (dealerEmail && dealerPass) {
    const dealerName = process.env.SEED_DEALER_NAME || 'Concessionária Demo';
    // Cria a concessionária se ainda não existir (por nome)
    let { rows } = await db.query('SELECT id FROM dealers WHERE name = $1', [dealerName]);
    let dealerId = rows[0]?.id;
    if (!dealerId) {
      const ins = await db.query(
        `INSERT INTO dealers (name, email, phone, city, state, region)
         VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
        [dealerName, dealerEmail.toLowerCase(), process.env.SEED_DEALER_PHONE || '(19) 3333-4444',
         process.env.SEED_DEALER_CITY || 'Campinas', process.env.SEED_DEALER_STATE || 'SP',
         process.env.SEED_DEALER_REGION || 'Sudeste']
      );
      dealerId = ins.rows[0].id;
    }
    const hash = await bcrypt.hash(dealerPass, 10);
    const { rowCount } = await db.query(
      `INSERT INTO users (name, email, password, role, dealer_id, active)
       VALUES ($1, $2, $3, 'dealer', $4, TRUE)
       ON CONFLICT (email) DO NOTHING`,
      [process.env.SEED_DEALER_USER_NAME || dealerName, dealerEmail.toLowerCase(), hash, dealerId]
    );
    console.log(rowCount ? `[db] Concessionária criada: ${dealerEmail}` : `[db] Concessionária já existente: ${dealerEmail}`);
  }
}

// Anúncios de exemplo (com fotos) para demonstração visual.
// Só roda se SEED_SAMPLE_LISTINGS=true e se a concessionária demo ainda não
// tiver anúncios (idempotente — não duplica a cada deploy).
const SAMPLE_LISTINGS = [
  { title: 'Mini escavadeira YANMAR ViO17', category: 'mini_escavadeira', model: 'ViO17', year: 2022, hours_used: 320, price: 148000, status: 'published',
    specs: { 'Potência do motor': '14,5 CV', 'Peso operacional': '1.720 kg', 'Profundidade de escavação': '2.300 mm', 'Tipo de motor': 'Diesel 3 cilindros' }, photos: ['/img/maq-1.jpg', '/img/hero.jpg'] },
  { title: 'Mini pá carregadeira YANMAR V8', category: 'mini_pa_carregadeira', model: 'V8', year: 2021, hours_used: 1100, price: 132000, status: 'published',
    specs: { 'Potência do motor': '26 CV', 'Peso operacional': '2.100 kg', 'Capacidade de carga': '600 kg', 'Tração': '4x4' }, photos: ['/img/maq-2.jpg', '/img/hero.jpg'] },
  { title: 'Mini retroescavadeira YANMAR CBL40', category: 'mini_retroescavadeira', model: 'CBL40', year: 2019, hours_used: 2400, price: 98000, status: 'published',
    specs: { 'Potência do motor': '40 CV', 'Peso operacional': '2.800 kg', 'Profundidade de escavação': '2.600 mm', 'Tração': '4x2' }, photos: ['/img/maq-3.jpg'] },
  { title: 'Mini escavadeira YANMAR ViO55', category: 'mini_escavadeira', model: 'ViO55', year: 2023, hours_used: 180, price: 210000, status: 'published',
    specs: { 'Potência do motor': '39 CV', 'Peso operacional': '5.000 kg', 'Profundidade de escavação': '3.800 mm', 'Tipo de motor': 'Diesel 4 cilindros' }, photos: ['/img/maq-4.jpg', '/img/cta-comprador.jpg'] },
  { title: 'Mini pá carregadeira YANMAR V4', category: 'mini_pa_carregadeira', model: 'V4', year: 2020, hours_used: 950, price: 89000, status: 'published',
    specs: { 'Potência do motor': '18 CV', 'Peso operacional': '1.450 kg', 'Capacidade de carga': '400 kg', 'Tração': '4x4' }, photos: ['/img/maq-5.jpg'] },
  { title: 'Mini escavadeira YANMAR ViO35', category: 'mini_escavadeira', model: 'ViO35', year: 2021, hours_used: 640, price: 165000, status: 'pending_approval',
    specs: { 'Potência do motor': '27 CV', 'Peso operacional': '3.400 kg', 'Profundidade de escavação': '3.200 mm', 'Tipo de motor': 'Diesel 3 cilindros' }, photos: ['/img/maq-6.jpg'] },
]

async function ensureSampleListings() {
  if (process.env.SEED_SAMPLE_LISTINGS !== 'true') return;

  const dealerName = process.env.SEED_DEALER_NAME || 'Concessionária Demo';
  const { rows: dRows } = await db.query('SELECT id FROM dealers WHERE name = $1', [dealerName]);
  const dealerId = dRows[0]?.id;
  if (!dealerId) {
    console.log('[db] Anúncios de exemplo: concessionária demo não encontrada — defina SEED_DEALER_* primeiro.');
    return;
  }

  const { rows: cnt } = await db.query('SELECT COUNT(*) FROM listings WHERE dealer_id = $1', [dealerId]);
  if (parseInt(cnt[0].count) > 0) {
    console.log('[db] Anúncios de exemplo já existem — nada a fazer.');
    return;
  }

  for (const m of SAMPLE_LISTINGS) {
    const publishedAt = m.status === 'published' ? 'NOW()' : 'NULL';
    const { rows } = await db.query(
      `INSERT INTO listings (dealer_id, title, category, model, year, hours_used, price, description, specs, status, published_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,${publishedAt})
       RETURNING id`,
      [dealerId, m.title, m.category, m.model, m.year, m.hours_used, m.price,
       `${m.title} em excelente estado, revisada e com procedência garantida pela rede autorizada YANMAR.`,
       JSON.stringify(m.specs), m.status]
    );
    const listingId = rows[0].id;
    let order = 0;
    for (const url of m.photos) {
      await db.query(
        'INSERT INTO listing_photos (listing_id, url, order_index) VALUES ($1, $2, $3)',
        [listingId, url, order++]
      );
    }
  }
  console.log(`[db] ${SAMPLE_LISTINGS.length} anúncios de exemplo criados.`);
}

module.exports = { initSchema, ensureSeedUsers, ensureSampleListings };
