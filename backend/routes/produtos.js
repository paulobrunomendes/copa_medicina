const express = require('express');
const router = express.Router();
const path = require('path');
const multer = require('multer');
const { pool } = require('../config/database');
const authMiddleware = require('../middleware/auth');

const storage = multer.diskStorage({
  destination: path.join(__dirname, '../../frontend/public/produtos'),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, `produto_${Date.now()}${ext}`);
  }
});
const upload = multer({ storage, limits: { fileSize: 5 * 1024 * 1024 } });

// Listar produtos ativos (público)
router.get('/', async (req, res) => {
  try {
    const [rows] = await pool.query(
      'SELECT * FROM produtos WHERE ativo=1 ORDER BY ordem ASC, nome ASC'
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ erro: 'Erro ao buscar produtos' });
  }
});

// Listar todos (admin)
router.get('/todos', authMiddleware, async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT * FROM produtos ORDER BY ordem ASC, nome ASC');
    res.json(rows);
  } catch (err) {
    res.status(500).json({ erro: 'Erro ao buscar produtos' });
  }
});

// Criar produto (admin)
router.post('/', authMiddleware, async (req, res) => {
  const { nome, descricao, preco, whatsapp_msg, whatsapp, ordem } = req.body;
  if (!nome) return res.status(400).json({ erro: 'Nome é obrigatório' });
  try {
    const [result] = await pool.query(
      'INSERT INTO produtos (nome, descricao, preco, whatsapp_msg, whatsapp, ordem) VALUES (?, ?, ?, ?, ?, ?)',
      [nome, descricao || '', preco || null, whatsapp_msg || '', whatsapp || '', ordem || 0]
    );
    res.status(201).json({ id: result.insertId, nome });
  } catch (err) {
    res.status(500).json({ erro: 'Erro ao criar produto' });
  }
});

// Editar produto (admin)
router.put('/:id', authMiddleware, async (req, res) => {
  const { nome, descricao, preco, whatsapp_msg, whatsapp, ativo, ordem } = req.body;
  try {
    await pool.query(
      'UPDATE produtos SET nome=?, descricao=?, preco=?, whatsapp_msg=?, whatsapp=?, ativo=?, ordem=? WHERE id=?',
      [nome, descricao || '', preco || null, whatsapp_msg || '', whatsapp || '', ativo ?? 1, ordem || 0, req.params.id]
    );
    res.json({ mensagem: 'Produto atualizado' });
  } catch (err) {
    res.status(500).json({ erro: 'Erro ao atualizar produto' });
  }
});

// Upload foto (admin)
router.post('/:id/foto', authMiddleware, upload.single('foto'), async (req, res) => {
  if (!req.file) return res.status(400).json({ erro: 'Arquivo não enviado' });
  const fotoUrl = `/public/produtos/${req.file.filename}`;
  try {
    await pool.query('UPDATE produtos SET foto=? WHERE id=?', [fotoUrl, req.params.id]);
    res.json({ foto: fotoUrl });
  } catch (err) {
    res.status(500).json({ erro: 'Erro ao salvar foto' });
  }
});

// Deletar produto (admin)
router.delete('/:id', authMiddleware, async (req, res) => {
  try {
    await pool.query('DELETE FROM produtos WHERE id=?', [req.params.id]);
    res.json({ mensagem: 'Produto removido' });
  } catch (err) {
    res.status(500).json({ erro: 'Erro ao remover produto' });
  }
});

module.exports = router;
