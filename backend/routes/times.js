const express = require('express');
const router = express.Router();
const path = require('path');
const multer = require('multer');
const { pool } = require('../config/database');
const authMiddleware = require('../middleware/auth');

const TIPOS_PERMITIDOS = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml'];

const storage = multer.diskStorage({
  destination: path.join(__dirname, '../../frontend/public/logos'),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, `time_${req.params.id}${ext}`);
  }
});
const upload = multer({
  storage,
  limits: { fileSize: 2 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (TIPOS_PERMITIDOS.includes(file.mimetype)) cb(null, true);
    else cb(new Error('Apenas imagens são permitidas (JPEG, PNG, GIF, WebP, SVG)'));
  }
});

// Listar todos os times (público)
router.get('/', async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT * FROM times ORDER BY nome');
    res.json(rows);
  } catch (err) {
    res.status(500).json({ erro: 'Erro ao buscar times' });
  }
});

// Criar time (admin)
router.post('/', authMiddleware, async (req, res) => {
  const { nome, sigla, cor, curso } = req.body;
  if (!nome || !sigla) {
    return res.status(400).json({ erro: 'Nome e sigla são obrigatórios' });
  }
  try {
    const [result] = await pool.query(
      'INSERT INTO times (nome, sigla, cor, curso) VALUES (?, ?, ?, ?)',
      [nome, sigla.toUpperCase(), cor || '#1a73e8', curso || '']
    );
    const [rows] = await pool.query('SELECT * FROM times WHERE id = ?', [result.insertId]);
    res.status(201).json(rows[0]);
  } catch (err) {
    res.status(500).json({ erro: 'Erro ao criar time' });
  }
});

// Atualizar time (admin)
router.put('/:id', authMiddleware, async (req, res) => {
  const { nome, sigla, cor, curso } = req.body;
  try {
    await pool.query(
      'UPDATE times SET nome=?, sigla=?, cor=?, curso=? WHERE id=?',
      [nome, sigla?.toUpperCase(), cor, curso, req.params.id]
    );
    const [rows] = await pool.query('SELECT * FROM times WHERE id = ?', [req.params.id]);
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ erro: 'Erro ao atualizar time' });
  }
});

// Upload de logo (admin)
router.post('/:id/logo', authMiddleware, (req, res, next) => {
  upload.single('logo')(req, res, (err) => {
    if (err) return res.status(400).json({ erro: err.message });
    next();
  });
}, async (req, res) => {
  if (!req.file) return res.status(400).json({ erro: 'Nenhum arquivo enviado' });
  const logoUrl = `/public/logos/${req.file.filename}`;
  try {
    await pool.query('UPDATE times SET logo=? WHERE id=?', [logoUrl, req.params.id]);
    res.json({ logo: logoUrl });
  } catch (err) {
    res.status(500).json({ erro: 'Erro ao salvar logo' });
  }
});

// Deletar time (admin)
router.delete('/:id', authMiddleware, async (req, res) => {
  try {
    await pool.query('DELETE FROM times WHERE id = ?', [req.params.id]);
    res.json({ mensagem: 'Time removido' });
  } catch (err) {
    res.status(500).json({ erro: 'Erro ao remover time' });
  }
});

module.exports = router;
