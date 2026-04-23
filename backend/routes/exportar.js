const express = require('express');
const router = express.Router();
const { pool } = require('../config/database');
const authMiddleware = require('../middleware/auth');

function toCSV(headers, rows) {
  const escape = (v) => {
    if (v === null || v === undefined) return '';
    const s = String(v);
    if (s.includes(',') || s.includes('"') || s.includes('\n')) return `"${s.replace(/"/g, '""')}"`;
    return s;
  };
  const lines = [headers.join(',')];
  for (const row of rows) lines.push(row.map(escape).join(','));
  return '\uFEFF' + lines.join('\r\n'); // BOM para Excel reconhecer UTF-8
}

// Exportar classificação geral
router.get('/classificacao', authMiddleware, async (req, res) => {
  try {
    const { modalidade_id } = req.query;
    let q = `
      SELECT m.nome as modalidade, g.nome as grupo,
             t.nome as time, t.sigla, t.curso,
             gt.pontos, gt.jogos, gt.vitorias, gt.empates, gt.derrotas,
             gt.gols_pro, gt.gols_contra, gt.saldo_gols
      FROM grupos_times gt
      JOIN grupos g ON gt.grupo_id = g.id
      JOIN times t ON gt.time_id = t.id
      JOIN modalidades m ON g.modalidade_id = m.id
      WHERE 1=1
    `;
    const params = [];
    if (modalidade_id) { q += ' AND m.id = ?'; params.push(modalidade_id); }
    q += ' ORDER BY m.nome, g.nome, gt.pontos DESC, gt.vitorias DESC, gt.saldo_gols DESC';
    const [rows] = await pool.query(q, params);

    const headers = ['Modalidade','Grupo','Time','Sigla','Curso','Pontos','Jogos','Vitórias','Empates','Derrotas','Gols Pró','Gols Contra','Saldo'];
    const data = rows.map(r => [r.modalidade, r.grupo, r.time, r.sigla, r.curso || '',
      r.pontos, r.jogos, r.vitorias, r.empates, r.derrotas, r.gols_pro, r.gols_contra, r.saldo_gols]);

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="classificacao.csv"');
    res.send(toCSV(headers, data));
  } catch (err) {
    res.status(500).json({ erro: 'Erro ao exportar classificação' });
  }
});

// Exportar artilheiros
router.get('/artilheiros', authMiddleware, async (req, res) => {
  try {
    const { modalidade_id } = req.query;
    let q = `
      SELECT m.nome as modalidade, t.nome as time, t.sigla, g.jogador, COUNT(*) as gols
      FROM gols g
      JOIN times t ON g.time_id = t.id
      JOIN jogos j ON g.jogo_id = j.id
      JOIN modalidades m ON j.modalidade_id = m.id
      WHERE 1=1
    `;
    const params = [];
    if (modalidade_id) { q += ' AND j.modalidade_id = ?'; params.push(modalidade_id); }
    q += ' GROUP BY g.jogador, g.time_id, m.id ORDER BY gols DESC, g.jogador ASC';
    const [rows] = await pool.query(q, params);

    const headers = ['Modalidade','Time','Sigla','Jogador','Gols'];
    const data = rows.map(r => [r.modalidade, r.time, r.sigla, r.jogador, r.gols]);

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="artilheiros.csv"');
    res.send(toCSV(headers, data));
  } catch (err) {
    res.status(500).json({ erro: 'Erro ao exportar artilheiros' });
  }
});

// Exportar jogos
router.get('/jogos', authMiddleware, async (req, res) => {
  try {
    const { modalidade_id } = req.query;
    let q = `
      SELECT m.nome as modalidade, j.fase,
             tc.nome as casa, tc.sigla as casa_sigla,
             tv.nome as visitante, tv.sigla as vis_sigla,
             j.gols_casa, j.gols_visitante,
             COALESCE(j.gols_prorrogacao_casa, 0) as prorro_casa,
             COALESCE(j.gols_prorrogacao_visitante, 0) as prorro_vis,
             COALESCE(j.gols_penaltis_casa, 0) as pen_casa,
             COALESCE(j.gols_penaltis_visitante, 0) as pen_vis,
             j.status, j.data_jogo, j.local_jogo, j.observacoes
      FROM jogos j
      JOIN times tc ON j.time_casa_id = tc.id
      JOIN times tv ON j.time_visitante_id = tv.id
      JOIN modalidades m ON j.modalidade_id = m.id
      WHERE 1=1
    `;
    const params = [];
    if (modalidade_id) { q += ' AND j.modalidade_id = ?'; params.push(modalidade_id); }
    q += ' ORDER BY m.nome, j.data_jogo ASC';
    const [rows] = await pool.query(q, params);

    const headers = ['Modalidade','Fase','Casa','Sig.Casa','Visitante','Sig.Visit.',
                     'Gols Casa','Gols Visit.','Prorr.Casa','Prorr.Visit.','Pen.Casa','Pen.Visit.',
                     'Status','Data','Local','Observações'];
    const data = rows.map(r => [r.modalidade, r.fase, r.casa, r.casa_sigla, r.visitante, r.vis_sigla,
      r.gols_casa, r.gols_visitante, r.prorro_casa, r.prorro_vis, r.pen_casa, r.pen_vis,
      r.status, r.data_jogo ? new Date(r.data_jogo).toLocaleString('pt-BR') : '',
      r.local_jogo || '', r.observacoes || '']);

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="jogos.csv"');
    res.send(toCSV(headers, data));
  } catch (err) {
    res.status(500).json({ erro: 'Erro ao exportar jogos' });
  }
});

// Backup completo do banco em JSON
router.get('/backup', authMiddleware, async (req, res) => {
  try {
    const tabelas = ['modalidades', 'grupos', 'times', 'grupos_times', 'jogos', 'gols', 'artilheiros', 'noticias', 'parceiros', 'produtos', 'admins'];
    const backup = { gerado_em: new Date().toISOString(), tabelas: {} };
    for (const tabela of tabelas) {
      try {
        const [rows] = await pool.query(`SELECT * FROM ${tabela}`);
        // Remove senha dos admins
        if (tabela === 'admins') rows.forEach(r => delete r.senha);
        backup.tabelas[tabela] = rows;
      } catch (e) { backup.tabelas[tabela] = []; }
    }
    const json = JSON.stringify(backup, (_, v) => typeof v === 'bigint' ? v.toString() : v, 2);
    const filename = `backup_copa_${new Date().toISOString().slice(0,10)}.json`;
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(json);
  } catch (err) {
    res.status(500).json({ erro: 'Erro ao gerar backup' });
  }
});

module.exports = router;
