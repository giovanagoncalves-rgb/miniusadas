const errorHandler = (err, req, res, next) => {
  console.error(`[error] ${req.method} ${req.path}:`, err.message);

  // Erros de validação Zod
  if (err.name === 'ZodError') {
    return res.status(422).json({
      error: 'Dados inválidos.',
      details: err.errors.map(e => ({ field: e.path.join('.'), message: e.message })),
    });
  }

  // Erros de banco (constraint)
  if (err.code === '23505') {
    return res.status(409).json({ error: 'Registro duplicado.' });
  }

  const status = err.status || err.statusCode || 500;
  res.status(status).json({
    error: status === 500 ? 'Erro interno do servidor.' : err.message,
  });
};

module.exports = { errorHandler };
