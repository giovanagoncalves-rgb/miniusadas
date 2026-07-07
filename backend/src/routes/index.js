const router = require('express').Router();

const { login }  = require('../controllers/authController');
const listings   = require('../controllers/listingsController');
const leads      = require('../controllers/leadsController');
const photos     = require('../controllers/photosController');
const { authenticate, requireAdmin, requireDealer } = require('../middlewares/auth');

// ── Auth ─────────────────────────────────────
router.post('/auth/login', login);

// ── Público ──────────────────────────────────
router.get('/listings',     listings.getPublic);
router.get('/listings/:id', listings.getById);
router.post('/listings/:listing_id/leads', leads.create);

// ── Concessionária ───────────────────────────
router.use('/dealer', authenticate, requireDealer);
router.get ('/dealer/listings',                   listings.dealerList);
router.post('/dealer/listings',                   listings.create);
router.patch('/dealer/listings/:id/submit',       listings.submit);
router.patch('/dealer/listings/:id/pause',        listings.pause);
router.patch('/dealer/listings/:id/sold',         listings.markSold);
router.delete('/dealer/listings/:id',             listings.remove);
router.post('/dealer/listings/:listing_id/photos',photos.uploadMiddleware, photos.addPhotos);
router.delete('/dealer/photos/:photo_id',         photos.deletePhoto);

// ── Admin YANMAR ─────────────────────────────
router.use('/admin', authenticate, requireAdmin);
router.get ('/admin/listings',                listings.adminList);
router.patch('/admin/listings/:id/approve',   listings.approve);
router.patch('/admin/listings/:id/reject',    listings.reject);

module.exports = router;
