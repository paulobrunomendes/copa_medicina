const express = require('express');
const router = express.Router();
const { pool } = require('../config/database');
const authMiddleware = require('../middleware/auth');

// Listar modalidades (público)
router.get('/', async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT * FROM modalidades ORDER BY nome');
    res.json(rows);
  } catch (err) {
    res.status(500).json({ erro: 'Erro ao buscar modalidades' });
  }
});

// Criar modalidade (admin)
router.post('/', authMiddleware, async (req, res) => {
  const { nome, icone } = req.body;
  if (!nome) return res.status(400).json({ erro: 'Nome é obrigatório' });
  try {
    const [result] = await pool.query(
      'INSERT INTO modalidades (nome, icone) VALUES (?, ?)',
      [nome, icone || '🏆']
    );
    res.status(201).json({ id: result.insertId, nome, icone });
  } catch (err) {
    res.status(500).json({ erro: 'Erro ao criar modalidade' });
  }
});

// Editar modalidade (admin)
router.put('/:id', authMiddleware, async (req, res) => {
  const { nome, icone } = req.body;
  if (!nome) return res.status(400).json({ erro: 'Nome é obrigatório' });
  try {
    await pool.query('UPDATE modalidades SET nome=?, icone=? WHERE id=?', [nome, icone || '🏆', req.params.id]);
    res.json({ id: Number(req.params.id), nome, icone });
  } catch (err) {
    res.status(500).json({ erro: 'Erro ao editar modalidade' });
  }
});

// Deletar modalidade (admin)
router.delete('/:id', authMiddleware, async (req, res) => {
  try {
    await pool.query('DELETE FROM modalidades WHERE id = ?', [req.params.id]);
    res.json({ mensagem: 'Modalidade removida' });
  } catch (err) {
    res.status(500).json({ erro: 'Erro ao remover modalidade' });
  }
});

module.exports = router;
