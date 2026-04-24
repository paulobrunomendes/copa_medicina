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
             j.modalidade_id, m.nome as modalidade_nome, m.icone as modalidade_icone,
             COUNT(*) as total_gols
      FROM gols g
      JOIN times t ON g.time_id = t.id
      JOIN jogos j ON g.jogo_id = j.id
      JOIN modalidades m ON j.modalidade_id = m.id
      WHERE 1=1
    `;
    const params = [];
    if (modalidade_id) { query += ' AND j.modalidade_id = ?'; params.push(modalidade_id); }
    query += ' GROUP BY g.jogador, g.time_id, j.modalidade_id ORDER BY j.modalidade_id ASC, total_gols DESC, g.jogador ASC';

    const [rows] = await pool.query(query, params);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ erro: 'Erro ao buscar artilheiros' });
  }
});

module.exports = router;
