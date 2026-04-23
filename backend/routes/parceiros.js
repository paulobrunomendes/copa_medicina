const express = require('express');
const router = express.Router();
const path = require('path');
const multer = require('multer');
const { pool } = require('../config/database');
const authMiddleware = require('../middleware/auth');

const storage = multer.diskStorage({
  destination: path.join(__dirname, '../../frontend/public/parceiros'),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, `parceiro_${Date.now()}${ext}`);
  }
});
const upload = multer({ storage, limits: { fileSize: 2 * 1024 * 1024 } });

// Listar parceiros ativos (público)
router.get('/', async (req, res) => {
  try {
    const [rows] = await pool.query(
      'SELECT * FROM parceiros WHERE ativo=1 ORDER BY ordem ASC, nome ASC'
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ erro: 'Erro ao buscar parceiros' });
  }
});

// Listar todos (admin)
router.get('/todos', authMiddleware, async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT * FROM parceiros ORDER BY ordem ASC, nome ASC');
    res.json(rows);
  } catch (err) {
    res.status(500).json({ erro: 'Erro ao buscar parceiros' });
  }
});

// Criar parceiro (admin)
router.post('/', authMiddleware, async (req, res) => {
  const { nome, categoria, beneficio, descricao, contato, whatsapp, site, ordem } = req.body;
  if (!nome) return res.status(400).json({ erro: 'Nome é obrigatório' });
  try {
    const [result] = await pool.query(
      'INSERT INTO parceiros (nome, categoria, beneficio, descricao, contato, whatsapp, site, ordem) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      [nome, categoria || '', beneficio || '', descricao || '', contato || '', whatsapp || '', site || '', ordem || 0]
    );
    res.status(201).json({ id: result.insertId, nome });
  } catch (err) {
    res.status(500).json({ erro: 'Erro ao criar parceiro' });
  }
});

// Editar parceiro (admin)
router.put('/:id', authMiddleware, async (req, res) => {
  const { nome, categoria, beneficio, descricao, contato, whatsapp, site, ativo, ordem } = req.body;
  try {
    await pool.query(
      'UPDATE parceiros SET nome=?, categoria=?, beneficio=?, descricao=?, contato=?, whatsapp=?, site=?, ativo=?, ordem=? WHERE id=?',
      [nome, categoria || '', beneficio || '', descricao || '', contato || '', whatsapp || '', site || '', ativo ?? 1, ordem || 0, req.params.id]
    );
    res.json({ mensagem: 'Parceiro atualizado' });
  } catch (err) {
    res.status(500).json({ erro: 'Erro ao atualizar parceiro' });
  }
});

// Upload logo (admin)
router.post('/:id/logo', authMiddleware, upload.single('logo'), async (req, res) => {
  if (!req.file) return res.status(400).json({ erro: 'Arquivo não enviado' });
  const logoUrl = `/public/parceiros/${req.file.filename}`;
  try {
    await pool.query('UPDATE parceiros SET logo=? WHERE id=?', [logoUrl, req.params.id]);
    res.json({ logo: logoUrl });
  } catch (err) {
    res.status(500).json({ erro: 'Erro ao salvar logo' });
  }
});

// Deletar parceiro (admin)
router.delete('/:id', authMiddleware, async (req, res) => {
  try {
    await pool.query('DELETE FROM parceiros WHERE id=?', [req.params.id]);
    res.json({ mensagem: 'Parceiro removido' });
  } catch (err) {
    res.status(500).json({ erro: 'Erro ao remover parceiro' });
  }
});

module.exports = router;
