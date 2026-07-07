const { z }    = require('zod');
const db       = require('../config/database');
const emailSvc = require('../services/email/emailService');

const leadSchema = z.object({
  name:    z.string().min(2),
  email:   z.string().email(),
  phone:   z.string().optional(),
  message: z.string().optional(),
});

const create = async (req, res) => {
  const { listing_id } = req.params;
  const data = leadSchema.parse(req.body);

  // Busca o anúncio e a concessionária
  const { rows } = await db.query(
    `SELECT l.*, d.email AS dealer_email, d.name AS dealer_name, d.id AS dealer_id
     FROM listings l JOIN dealers d ON d.id = l.dealer_id
     WHERE l.id = $1 AND l.status = 'published'`,
    [listing_id]
  );
  const listing = rows[0];
  if (!listing) return res.status(404).json({ error: 'Anúncio não encontrado.' });

  // Salva o lead no banco
  const { rows: lead } = await db.query(
    `INSERT INTO leads (listing_id, dealer_id, name, email, phone, message)
     VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
    [listing_id, listing.dealer_id, data.name, data.email, data.phone, data.message]
  );

  const dealer = { id: listing.dealer_id, email: listing.dealer_email, name: listing.dealer_name };

  // Ação 1 — E-mail para a concessionária (YANMAR em cópia)
  emailSvc.notifyDealerNewLead({ lead: lead[0], listing, dealer }).catch(console.error);

  // Ação 2 — Webhook Make → Pipedrive
  if (process.env.MAKE_WEBHOOK_URL) {
    fetch(process.env.MAKE_WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        lead_name:      data.name,
        lead_email:     data.email,
        lead_phone:     data.phone,
        lead_message:   data.message,
        listing_title:  listing.title,
        listing_id:     listing.id,
        listing_price:  listing.price,
        dealer_name:    dealer.name,
        dealer_email:   dealer.email,
        source:         'miniusadas_portal',
      }),
    })
    .then(() => db.query('UPDATE leads SET make_sent = true WHERE id = $1', [lead[0].id]))
    .catch(console.error);
  }

  res.status(201).json({ message: 'Interesse registrado com sucesso!' });
};

module.exports = { create };
