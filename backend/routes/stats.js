const express = require('express');
const router = express.Router();
const { pool } = require('../config/database');

// Estatísticas gerais por time (público)
router.get('/', async (req, res) => {
  const { modalidade_id } = req.query;
  try {
    const modFilter = modalidade_id ? 'AND j.modalidade_id = ?' : '';
    const modParams = modalidade_id ? [modalidade_id] : [];

    // Jogos disputados, vitórias, empates, derrotas, gols pró/contra por time
    const [jogosStats] = await pool.query(`
      SELECT
        t.id, t.nome, t.sigla, t.cor, t.logo,
        COUNT(DISTINCT j.id) as jogos,
        SUM(CASE
          WHEN j.time_casa_id = t.id AND j.gols_casa > j.gols_visitante THEN 1
          WHEN j.time_visitante_id = t.id AND j.gols_visitante > j.gols_casa THEN 1
          ELSE 0 END) as vitorias,
        SUM(CASE WHEN j.gols_casa = j.gols_visitante THEN 1 ELSE 0 END) as empates,
        SUM(CASE
          WHEN j.time_casa_id = t.id AND j.gols_casa < j.gols_visitante THEN 1
          WHEN j.time_visitante_id = t.id AND j.gols_visitante < j.gols_casa THEN 1
          ELSE 0 END) as derrotas,
        SUM(CASE WHEN j.time_casa_id = t.id THEN j.gols_casa ELSE j.gols_visitante END) as gols_pro,
        SUM(CASE WHEN j.time_casa_id = t.id THEN j.gols_visitante ELSE j.gols_casa END) as gols_contra
      FROM times t
      JOIN jogos j ON (j.time_casa_id = t.id OR j.time_visitante_id = t.id)
      WHERE j.status = 'encerrado' ${modFilter}
      GROUP BY t.id
      ORDER BY vitorias DESC, gols_pro DESC, t.nome ASC
    `, modParams);

    // Gols marcados por time (artilharia coletiva)
    const [golsStats] = await pool.query(`
      SELECT g.time_id, COUNT(*) as total_gols
      FROM gols g
      JOIN jogos j ON g.jogo_id = j.id
      WHERE 1=1 ${modFilter}
      GROUP BY g.time_id
    `, modParams);

    // Cartões por time
    const [cartoesStats] = await pool.query(`
      SELECT c.time_id,
        SUM(CASE WHEN c.tipo='amarelo' THEN 1 ELSE 0 END) as amarelos,
        SUM(CASE WHEN c.tipo='vermelho' THEN 1 ELSE 0 END) as vermelhos
      FROM cartoes c
      JOIN jogos j ON c.jogo_id = j.id
      WHERE 1=1 ${modFilter}
      GROUP BY c.time_id
    `, modParams);

    // Merge dos dados
    const golsMap = Object.fromEntries(golsStats.map(g => [g.time_id, g.total_gols]));
    const cartoesMap = Object.fromEntries(cartoesStats.map(c => [c.time_id, { amarelos: c.amarelos, vermelhos: c.vermelhos }]));

    const resultado = jogosStats.map(t => ({
      ...t,
      gols_marcados: golsMap[t.id] || 0,
      amarelos: cartoesMap[t.id]?.amarelos || 0,
      vermelhos: cartoesMap[t.id]?.vermelhos || 0,
      saldo_gols: (t.gols_pro - t.gols_contra),
    }));

    res.json(resultado);
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao buscar estatísticas' });
  }
});

// Campeão (jogo final encerrado)
router.get('/campeao', async (req, res) => {
  const { modalidade_id } = req.query;
  try {
    let q = `
      SELECT j.*,
        tc.nome as time_casa_nome, tc.sigla as time_casa_sigla, tc.cor as time_casa_cor, tc.logo as time_casa_logo,
        tv.nome as time_visitante_nome, tv.sigla as time_visitante_sigla, tv.cor as time_visitante_cor, tv.logo as time_visitante_logo,
        m.nome as modalidade_nome, m.icone as modalidade_icone
      FROM jogos j
      JOIN times tc ON j.time_casa_id = tc.id
      JOIN times tv ON j.time_visitante_id = tv.id
      JOIN modalidades m ON j.modalidade_id = m.id
      WHERE j.fase = 'final' AND j.status = 'encerrado'
    `;
    const params = [];
    if (modalidade_id) { q += ' AND j.modalidade_id = ?'; params.push(modalidade_id); }
    q += ' ORDER BY j.atualizado_em DESC';
    const [rows] = await pool.query(q, params);

    const campeoes = rows.map(j => {
      const casaVenceu = j.gols_casa > j.gols_visitante;
      return {
        modalidade_id: j.modalidade_id,
        modalidade_nome: j.modalidade_nome,
        modalidade_icone: j.modalidade_icone,
        jogo_id: j.id,
        placar: `${j.gols_casa} × ${j.gols_visitante}`,
        campeao_nome: casaVenceu ? j.time_casa_nome : j.time_visitante_nome,
        campeao_sigla: casaVenceu ? j.time_casa_sigla : j.time_visitante_sigla,
        campeao_cor: casaVenceu ? j.time_casa_cor : j.time_visitante_cor,
        campeao_logo: casaVenceu ? j.time_casa_logo : j.time_visitante_logo,
        vice_nome: casaVenceu ? j.time_visitante_nome : j.time_casa_nome,
        vice_sigla: casaVenceu ? j.time_visitante_sigla : j.time_casa_sigla,
      };
    });

    res.json(campeoes);
  } catch (err) {
    res.status(500).json({ erro: 'Erro ao buscar campeão' });
  }
});

module.exports = router;
