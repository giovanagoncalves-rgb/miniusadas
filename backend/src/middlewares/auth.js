const jwt = require('jsonwebtoken');

const authenticate = (req, res, next) => {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Token não fornecido.' });
  }

  try {
    const token   = header.split(' ')[1];
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    req.user      = payload;
    next();
  } catch {
    return res.status(401).json({ error: 'Token inválido ou expirado.' });
  }
};

const requireAdmin = (req, res, next) => {
  if (req.user?.role !== 'admin') {
    return res.status(403).json({ error: 'Acesso restrito ao administrador YANMAR.' });
  }
  next();
};

const requireDealer = (req, res, next) => {
  if (!['admin', 'dealer'].includes(req.user?.role)) {
    return res.status(403).json({ error: 'Acesso restrito a concessionárias.' });
  }
  next();
};

module.exports = { authenticate, requireAdmin, requireDealer };
