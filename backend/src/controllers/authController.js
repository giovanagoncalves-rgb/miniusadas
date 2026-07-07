const bcrypt = require('bcryptjs');
const jwt    = require('jsonwebtoken');
const { z }  = require('zod');
const db     = require('../config/database');

const loginSchema = z.object({
  email:    z.string().email(),
  password: z.string().min(6),
});

const login = async (req, res) => {
  const { email, password } = loginSchema.parse(req.body);

  const { rows } = await db.query(
    `SELECT u.*, d.name AS dealer_name, d.id AS dealer_id
     FROM users u
     LEFT JOIN dealers d ON d.id = u.dealer_id
     WHERE u.email = $1 AND u.active = true`,
    [email.toLowerCase()]
  );

  const user = rows[0];
  if (!user) return res.status(401).json({ error: 'Credenciais inválidas.' });

  const valid = await bcrypt.compare(password, user.password);
  if (!valid)  return res.status(401).json({ error: 'Credenciais inválidas.' });

  const token = jwt.sign(
    {
      id:        user.id,
      role:      user.role,
      dealer_id: user.dealer_id,
      name:      user.name,
      email:     user.email,
    },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
  );

  res.json({
    token,
    user: {
      id:          user.id,
      name:        user.name,
      email:       user.email,
      role:        user.role,
      dealer_id:   user.dealer_id,
      dealer_name: user.dealer_name,
    },
  });
};

module.exports = { login };
