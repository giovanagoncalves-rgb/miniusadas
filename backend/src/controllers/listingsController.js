const { z }      = require('zod');
const db         = require('../config/database');
const emailSvc   = require('../services/email/emailService');
const storageSvc = require('../services/storage/storageService');

// ── Schemas de validação ─────────────────────
const createSchema = z.object({
  title:       z.string().min(3),
  category:    z.enum(['mini_escavadeira', 'mini_pa_carregadeira', 'mini_retroescavadeira']),
  model:       z.string().optional(),
  year:        z.number().int().min(1990).max(new Date().getFullYear()).optional(),
  hours_used:  z.number().int().min(0).optional(),
  price:       z.number().positive(),
  description: z.string().optional(),
  specs:       z.record(z.any()).optional(),
});

// ── Helpers ──────────────────────────────────
const getDealer = async (dealerId) => {
  const { rows } = await db.query('SELECT * FROM dealers WHERE id = $1', [dealerId]);
  return rows[0];
};

// ── Controllers ──────────────────────────────

/** GET /api/listings — listagem pública com filtros */
const getPublic = async (req, res) => {
  const { category, region, price_min, price_max, page = 1, limit = 12 } = req.query;
  const offset = (page - 1) * limit;

  let where = ["l.status = 'published'"];
  const params = [];
  let p = 1;

  if (category) { where.push(`l.category = $${p++}`); params.push(category); }
  if (region)   { where.push(`d.region ILIKE $${p++}`); params.push(`%${region}%`); }
  if (price_min){ where.push(`l.price >= $${p++}`); params.push(price_min); }
  if (price_max){ where.push(`l.price <= $${p++}`); params.push(price_max); }

  const sql = `
    SELECT l.id, l.title, l.category, l.model, l.year, l.hours_used,
           l.price, l.published_at,
           d.name AS dealer_name, d.city, d.state, d.region,
           (SELECT url FROM listing_photos WHERE listing_id = l.id ORDER BY order_index LIMIT 1) AS cover_url
    FROM listings l
    JOIN dealers d ON d.id = l.dealer_id
    WHERE ${where.join(' AND ')}
    ORDER BY l.published_at DESC
    LIMIT $${p++} OFFSET $${p++}
  `;
  params.push(limit, offset);

  const { rows } = await db.query(sql, params);
  const { rows: count } = await db.query(
    `SELECT COUNT(*) FROM listings l JOIN dealers d ON d.id = l.dealer_id WHERE ${where.join(' AND ')}`,
    params.slice(0, -2)
  );

  res.json({ data: rows, total: parseInt(count[0].count), page: +page, limit: +limit });
};

/** GET /api/listings/:id — detalhe público */
const getById = async (req, res) => {
  const { rows } = await db.query(
    `SELECT l.*, d.name AS dealer_name, d.email AS dealer_email,
            d.phone AS dealer_phone, d.city, d.state, d.logo_url AS dealer_logo
     FROM listings l
     JOIN dealers d ON d.id = l.dealer_id
     WHERE l.id = $1 AND l.status = 'published'`,
    [req.params.id]
  );
  if (!rows[0]) return res.status(404).json({ error: 'Anúncio não encontrado.' });

  const { rows: photos } = await db.query(
    'SELECT url, order_index FROM listing_photos WHERE listing_id = $1 ORDER BY order_index',
    [req.params.id]
  );

  // Máquinas relacionadas (mesma categoria, exceto a atual)
  const { rows: related } = await db.query(
    `SELECT l.id, l.title, l.price, l.year,
            (SELECT url FROM listing_photos WHERE listing_id = l.id ORDER BY order_index LIMIT 1) AS cover_url
     FROM listings l
     WHERE l.category = $1 AND l.id != $2 AND l.status = 'published'
     LIMIT 4`,
    [rows[0].category, req.params.id]
  );

  res.json({ ...rows[0], photos, related });
};

/** POST /api/dealer/listings — concessionária cria anúncio */
const create = async (req, res) => {
  const data = createSchema.parse(req.body);
  const { dealer_id } = req.user;

  const { rows } = await db.query(
    `INSERT INTO listings (dealer_id, title, category, model, year, hours_used, price, description, specs, status)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'draft')
     RETURNING *`,
    [dealer_id, data.title, data.category, data.model, data.year,
     data.hours_used, data.price, data.description, JSON.stringify(data.specs || {})]
  );

  res.status(201).json(rows[0]);
};

/** PATCH /api/dealer/listings/:id/submit — envia para aprovação */
const submit = async (req, res) => {
  const { id } = req.params;
  const { dealer_id } = req.user;

  const { rows } = await db.query(
    `UPDATE listings SET status = 'pending_approval'
     WHERE id = $1 AND dealer_id = $2 AND status IN ('draft','paused')
     RETURNING *`,
    [id, dealer_id]
  );
  if (!rows[0]) return res.status(404).json({ error: 'Anúncio não encontrado ou não pode ser enviado.' });

  const dealer = await getDealer(dealer_id);
  await emailSvc.notifyAdminNewListing({ listing: rows[0], dealer }).catch(console.error);

  res.json(rows[0]);
};

/** PATCH /api/dealer/listings/:id/pause */
const pause = async (req, res) => {
  const { rows } = await db.query(
    `UPDATE listings SET status = 'paused'
     WHERE id = $1 AND dealer_id = $2 AND status = 'published'
     RETURNING *`,
    [req.params.id, req.user.dealer_id]
  );
  if (!rows[0]) return res.status(404).json({ error: 'Anúncio não encontrado.' });
  res.json(rows[0]);
};

/** PATCH /api/dealer/listings/:id/sold */
const markSold = async (req, res) => {
  const { rows } = await db.query(
    `UPDATE listings SET status = 'sold', sold_at = NOW()
     WHERE id = $1 AND dealer_id = $2 AND status = 'published'
     RETURNING *`,
    [req.params.id, req.user.dealer_id]
  );
  if (!rows[0]) return res.status(404).json({ error: 'Anúncio não encontrado.' });
  res.json(rows[0]);
};

/** DELETE /api/dealer/listings/:id */
const remove = async (req, res) => {
  const { rows } = await db.query(
    `UPDATE listings SET status = 'deleted'
     WHERE id = $1 AND dealer_id = $2
     RETURNING id`,
    [req.params.id, req.user.dealer_id]
  );
  if (!rows[0]) return res.status(404).json({ error: 'Anúncio não encontrado.' });
  res.json({ message: 'Anúncio removido.' });
};

/** PATCH /api/admin/listings/:id/approve — admin aprova */
const approve = async (req, res) => {
  const { rows } = await db.query(
    `UPDATE listings
     SET status = 'published', approved_by = $1, approved_at = NOW(), published_at = NOW()
     WHERE id = $2 AND status = 'pending_approval'
     RETURNING *`,
    [req.user.id, req.params.id]
  );
  if (!rows[0]) return res.status(404).json({ error: 'Anúncio não encontrado.' });

  const dealer = await getDealer(rows[0].dealer_id);
  await emailSvc.notifyDealerApproved({ listing: rows[0], dealer }).catch(console.error);

  res.json(rows[0]);
};

/** PATCH /api/admin/listings/:id/reject — admin recusa */
const reject = async (req, res) => {
  const { reason } = z.object({ reason: z.string().min(10) }).parse(req.body);

  const { rows } = await db.query(
    `UPDATE listings SET status = 'draft', rejection_reason = $1
     WHERE id = $2 AND status = 'pending_approval'
     RETURNING *`,
    [reason, req.params.id]
  );
  if (!rows[0]) return res.status(404).json({ error: 'Anúncio não encontrado.' });

  const dealer = await getDealer(rows[0].dealer_id);
  await emailSvc.notifyDealerRejected({ listing: rows[0], dealer, reason }).catch(console.error);

  res.json(rows[0]);
};

/** GET /api/admin/listings — todos os anúncios (admin) */
const adminList = async (req, res) => {
  const { status, dealer_id, page = 1, limit = 20 } = req.query;
  const offset = (page - 1) * limit;
  let where = ['1=1'];
  const params = [];
  let p = 1;

  if (status)    { where.push(`l.status = $${p++}`);    params.push(status); }
  if (dealer_id) { where.push(`l.dealer_id = $${p++}`); params.push(dealer_id); }

  const { rows } = await db.query(
    `SELECT l.*, d.name AS dealer_name
     FROM listings l JOIN dealers d ON d.id = l.dealer_id
     WHERE ${where.join(' AND ')}
     ORDER BY l.created_at DESC
     LIMIT $${p++} OFFSET $${p++}`,
    [...params, limit, offset]
  );
  res.json(rows);
};

/** GET /api/dealer/listings — anúncios da própria concessionária */
const dealerList = async (req, res) => {
  const { rows } = await db.query(
    `SELECT l.*,
            (SELECT url FROM listing_photos WHERE listing_id = l.id ORDER BY order_index LIMIT 1) AS cover_url
     FROM listings l
     WHERE l.dealer_id = $1 AND l.status != 'deleted'
     ORDER BY l.created_at DESC`,
    [req.user.dealer_id]
  );
  res.json(rows);
};

module.exports = { getPublic, getById, create, submit, pause, markSold, remove, approve, reject, adminList, dealerList };
