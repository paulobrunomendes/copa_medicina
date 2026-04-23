const express = require('express');
const router = express.Router();
const path = require('path');
const multer = require('multer');
const { pool } = require('../config/database');
const authMiddleware = require('../middleware/auth');

const storage = multer.diskStorage({
  destination: path.join(__dirname, '../../frontend/public/noticias'),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, `noticia_${Date.now()}${ext}`);
  }
});
const upload = multer({ storage, limits: { fileSize: 3 * 1024 * 1024 } });

// Listar notícias ativas (público)
router.get('/', async (req, res) => {
  try {
    const [rows] = await pool.query(
      'SELECT * FROM noticias WHERE ativo=1 ORDER BY fixado DESC, criado_em DESC'
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ erro: 'Erro ao buscar notícias' });
  }
});

// Listar todas (admin)
router.get('/todas', authMiddleware, async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT * FROM noticias ORDER BY criado_em DESC');
    res.json(rows);
  } catch (err) {
    res.status(500).json({ erro: 'Erro ao buscar notícias' });
  }
});

// Criar notícia (admin)
router.post('/', authMiddleware, async (req, res) => {
  const { titulo, conteudo, tag, fixado } = req.body;
  if (!titulo) return res.status(400).json({ erro: 'Título é obrigatório' });
  try {
    const [result] = await pool.query(
      'INSERT INTO noticias (titulo, conteudo, tag, fixado) VALUES (?, ?, ?, ?)',
      [titulo, conteudo || '', tag || '', fixado ? 1 : 0]
    );
    res.status(201).json({ id: result.insertId, titulo });
  } catch (err) {
    res.status(500).json({ erro: 'Erro ao criar notícia' });
  }
});

// Editar notícia (admin)
router.put('/:id', authMiddleware, async (req, res) => {
  const { titulo, conteudo, tag, fixado, ativo } = req.body;
  try {
    await pool.query(
      'UPDATE noticias SET titulo=?, conteudo=?, tag=?, fixado=?, ativo=? WHERE id=?',
      [titulo, conteudo || '', tag || '', fixado ? 1 : 0, ativo ?? 1, req.params.id]
    );
    res.json({ mensagem: 'Notícia atualizada' });
  } catch (err) {
    res.status(500).json({ erro: 'Erro ao atualizar notícia' });
  }
});

// Upload imagem (admin)
router.post('/:id/imagem', authMiddleware, upload.single('imagem'), async (req, res) => {
  if (!req.file) return res.status(400).json({ erro: 'Arquivo não enviado' });
  const url = `/public/noticias/${req.file.filename}`;
  try {
    await pool.query('UPDATE noticias SET imagem=? WHERE id=?', [url, req.params.id]);
    res.json({ imagem: url });
  } catch (err) {
    res.status(500).json({ erro: 'Erro ao salvar imagem' });
  }
});

// Deletar notícia (admin)
router.delete('/:id', authMiddleware, async (req, res) => {
  try {
    await pool.query('DELETE FROM noticias WHERE id=?', [req.params.id]);
    res.json({ mensagem: 'Notícia removida' });
  } catch (err) {
    res.status(500).json({ erro: 'Erro ao remover notícia' });
  }
});

module.exports = router;
