const express = require('express');
const router = express.Router();
const { pool } = require('../config/database');

// Ranking de artilheiros (público)
router.get('/', async (req, res) => {
  try {
    const { modalidade_id } = req.query;
    let query = `
      SELECT g.jogador, g.time_id,
             t.nome as time_nome, t.sigla as time_sigla, t.cor as time_cor, t.logo as time_logo,
             COUNT(*) as total_gols
      FROM gols g
      JOIN times t ON g.time_id = t.id
      JOIN jogos j ON g.jogo_id = j.id
      WHERE 1=1
    `;
    const params = [];
    if (modalidade_id) { query += ' AND j.modalidade_id = ?'; params.push(modalidade_id); }
    query += ' GROUP BY g.jogador, g.time_id ORDER BY total_gols DESC, g.jogador ASC';

    const [rows] = await pool.query(query, params);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ erro: 'Erro ao buscar artilheiros' });
  }
});

module.exports = router;
