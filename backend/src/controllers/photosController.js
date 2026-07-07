const multer    = require('multer');
const db        = require('../config/database');
const storageSvc = require('../services/storage/storageService');

// Multer em memória — o StorageService decide onde salvar
const upload = multer({
  storage: multer.memoryStorage(),
  limits:  { fileSize: 8 * 1024 * 1024 }, // 8 MB por foto
  fileFilter: (_, file, cb) => {
    if (!file.mimetype.startsWith('image/')) {
      return cb(new Error('Apenas imagens são permitidas.'));
    }
    cb(null, true);
  },
}).array('photos', 20);

const uploadMiddleware = (req, res, next) => {
  upload(req, res, (err) => {
    if (err) return res.status(400).json({ error: err.message });
    next();
  });
};

const addPhotos = async (req, res) => {
  const { listing_id } = req.params;
  const { dealer_id } = req.user;

  // Garante que o anúncio pertence à concessionária (ou é admin)
  const { rows } = await db.query(
    'SELECT id FROM listings WHERE id = $1 AND (dealer_id = $2 OR $3 = TRUE)',
    [listing_id, dealer_id, req.user.role === 'admin']
  );
  if (!rows[0]) return res.status(404).json({ error: 'Anúncio não encontrado.' });

  if (!req.files?.length) return res.status(400).json({ error: 'Nenhuma foto enviada.' });

  const { rows: existing } = await db.query(
    'SELECT COUNT(*) FROM listing_photos WHERE listing_id = $1',
    [listing_id]
  );
  let orderStart = parseInt(existing[0].count);

  const urls = [];
  for (const file of req.files) {
    const url = await storageSvc.upload(file.buffer, file.originalname, 'listings');
    await db.query(
      'INSERT INTO listing_photos (listing_id, url, order_index) VALUES ($1, $2, $3)',
      [listing_id, url, orderStart++]
    );
    urls.push(url);
  }

  res.status(201).json({ uploaded: urls.length, urls });
};

const deletePhoto = async (req, res) => {
  const { photo_id } = req.params;
  const { rows } = await db.query(
    `DELETE FROM listing_photos lp
     USING listings l
     WHERE lp.id = $1 AND lp.listing_id = l.id AND l.dealer_id = $2
     RETURNING lp.url`,
    [photo_id, req.user.dealer_id]
  );
  if (!rows[0]) return res.status(404).json({ error: 'Foto não encontrada.' });

  await storageSvc.delete(rows[0].url).catch(console.error);
  res.json({ message: 'Foto removida.' });
};

module.exports = { uploadMiddleware, addPhotos, deletePhoto };
