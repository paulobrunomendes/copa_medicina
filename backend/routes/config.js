const express = require('express');
const router = express.Router();
const { pool } = require('../config/database');
const authMiddleware = require('../middleware/auth');

// GET /api/config/regulamento — público
router.get('/regulamento', async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT valor FROM configuracoes WHERE chave = ?', ['regulamento']);
    res.json({ valor: rows.length > 0 ? rows[0].valor : '' });
  } catch (err) {
    res.status(500).json({ erro: 'Erro ao buscar regulamento' });
  }
});

// PUT /api/config/regulamento — admin
router.put('/regulamento', authMiddleware, async (req, res) => {
  const { valor } = req.body;
  try {
    await pool.query(
      'INSERT INTO configuracoes (chave, valor) VALUES (?, ?) ON DUPLICATE KEY UPDATE valor = VALUES(valor)',
      ['regulamento', valor || '']
    );
    res.json({ mensagem: 'Regulamento salvo' });
  } catch (err) {
    res.status(500).json({ erro: 'Erro ao salvar regulamento' });
  }
});

module.exports = router;
