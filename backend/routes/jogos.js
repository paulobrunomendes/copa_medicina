const express = require('express');
const router = express.Router();
const { pool } = require('../config/database');
const authMiddleware = require('../middleware/auth');
const pushRoute = require('./push');

// Listar jogos (público)
router.get('/', async (req, res) => {
  const { modalidade_id, fase, status, grupo_id, time_id } = req.query;
  try {
    let query = `
      SELECT j.*,
        tc.nome as time_casa_nome, tc.sigla as time_casa_sigla, tc.cor as time_casa_cor, tc.logo as time_casa_logo,
        tv.nome as time_visitante_nome, tv.sigla as time_visitante_sigla, tv.cor as time_visitante_cor, tv.logo as time_visitante_logo,
        m.nome as modalidade_nome, m.icone as modalidade_icone,
        g.nome as grupo_nome
      FROM jogos j
      JOIN times tc ON j.time_casa_id = tc.id
      JOIN times tv ON j.time_visitante_id = tv.id
      JOIN modalidades m ON j.modalidade_id = m.id
      LEFT JOIN grupos g ON j.grupo_id = g.id
      WHERE 1=1
    `;
    const params = [];
    if (modalidade_id) { query += ' AND j.modalidade_id = ?'; params.push(modalidade_id); }
    if (fase) { query += ' AND j.fase = ?'; params.push(fase); }
    if (status) { query += ' AND j.status = ?'; params.push(status); }
    if (grupo_id) { query += ' AND j.grupo_id = ?'; params.push(grupo_id); }
    if (time_id)  { query += ' AND (j.time_casa_id = ? OR j.time_visitante_id = ?)'; params.push(time_id, time_id); }
    query += ' ORDER BY FIELD(j.status,"ao_vivo","agendado","encerrado"), j.data_jogo ASC';

    const [rows] = await pool.query(query, params);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ erro: 'Erro ao buscar jogos' });
  }
});

// Buscar jogo por ID (público)
router.get('/:id', async (req, res) => {
  try {
    const [rows] = await pool.query(`
      SELECT j.*,
        tc.nome as time_casa_nome, tc.sigla as time_casa_sigla, tc.cor as time_casa_cor, tc.logo as time_casa_logo,
        tv.nome as time_visitante_nome, tv.sigla as time_visitante_sigla, tv.cor as time_visitante_cor, tv.logo as time_visitante_logo,
        m.nome as modalidade_nome, m.icone as modalidade_icone,
        g.nome as grupo_nome
      FROM jogos j
      JOIN times tc ON j.time_casa_id = tc.id
      JOIN times tv ON j.time_visitante_id = tv.id
      JOIN modalidades m ON j.modalidade_id = m.id
      LEFT JOIN grupos g ON j.grupo_id = g.id
      WHERE j.id = ?
    `, [req.params.id]);
    if (rows.length === 0) return res.status(404).json({ erro: 'Jogo não encontrado' });
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ erro: 'Erro ao buscar jogo' });
  }
});

// Criar jogo (admin)
router.post('/', authMiddleware, async (req, res) => {
  const { modalidade_id, grupo_id, fase, time_casa_id, time_visitante_id, data_jogo, local_jogo, observacoes, duracao_periodo, num_periodos } = req.body;
  if (!modalidade_id || !time_casa_id || !time_visitante_id) {
    return res.status(400).json({ erro: 'Modalidade e times são obrigatórios' });
  }
  if (time_casa_id === time_visitante_id) {
    return res.status(400).json({ erro: 'Os times precisam ser diferentes' });
  }
  try {
    // Verificar quais colunas de timer existem
    const [colsCheck] = await pool.query(
      `SELECT COLUMN_NAME FROM information_schema.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'jogos' AND COLUMN_NAME IN ('duracao_periodo','num_periodos')`
    );
    const existingCols = colsCheck.map(c => c.COLUMN_NAME);

    const insertCols = ['modalidade_id','grupo_id','fase','time_casa_id','time_visitante_id','data_jogo','local_jogo','observacoes'];
    const insertVals = [modalidade_id, grupo_id || null, fase || 'grupos', time_casa_id, time_visitante_id, data_jogo || null, local_jogo || '', observacoes || ''];
    if (existingCols.includes('duracao_periodo')) { insertCols.push('duracao_periodo'); insertVals.push(duracao_periodo || 45); }
    if (existingCols.includes('num_periodos'))    { insertCols.push('num_periodos');    insertVals.push(num_periodos    || 2);  }

    const [result] = await pool.query(
      `INSERT INTO jogos (${insertCols.join(',')}) VALUES (${insertCols.map(() => '?').join(',')})`,
      insertVals
    );
    const [rows] = await pool.query(`
      SELECT j.*,
        tc.nome as time_casa_nome, tc.sigla as time_casa_sigla, tc.cor as time_casa_cor, tc.logo as time_casa_logo,
        tv.nome as time_visitante_nome, tv.sigla as time_visitante_sigla, tv.cor as time_visitante_cor, tv.logo as time_visitante_logo,
        m.nome as modalidade_nome, m.icone as modalidade_icone
      FROM jogos j
      JOIN times tc ON j.time_casa_id = tc.id
      JOIN times tv ON j.time_visitante_id = tv.id
      JOIN modalidades m ON j.modalidade_id = m.id
      WHERE j.id = ?
    `, [result.insertId]);
    res.status(201).json(rows[0]);
  } catch (err) {
    res.status(500).json({ erro: 'Erro ao criar jogo' });
  }
});

// Atualizar placar (admin) — emite evento socket
router.put('/:id/placar', authMiddleware, async (req, res) => {
  const { gols_casa, gols_visitante, status,
          gols_prorrogacao_casa, gols_prorrogacao_visitante,
          gols_penaltis_casa, gols_penaltis_visitante } = req.body;
  const jogoId = req.params.id;

  try {
    // Buscar estado anterior do jogo
    const [anterior] = await pool.query('SELECT * FROM jogos WHERE id = ?', [jogoId]);
    if (anterior.length === 0) return res.status(404).json({ erro: 'Jogo não encontrado' });

    const jogoAnterior = anterior[0];

    // Detectar quais colunas de pênalti existem
    const [penaltiCheck] = await pool.query(
      `SELECT COLUMN_NAME FROM information_schema.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'jogos'
       AND COLUMN_NAME IN ('gols_prorrogacao_casa','gols_prorrogacao_visitante','gols_penaltis_casa','gols_penaltis_visitante')`
    );
    const hasPenalti = penaltiCheck.length === 4;

    let updateSql = 'UPDATE jogos SET gols_casa=?, gols_visitante=?, status=?';
    const updateVals = [
      gols_casa ?? jogoAnterior.gols_casa,
      gols_visitante ?? jogoAnterior.gols_visitante,
      status || jogoAnterior.status,
    ];
    if (hasPenalti) {
      updateSql += ', gols_prorrogacao_casa=?, gols_prorrogacao_visitante=?, gols_penaltis_casa=?, gols_penaltis_visitante=?';
      updateVals.push(
        gols_prorrogacao_casa ?? jogoAnterior.gols_prorrogacao_casa ?? 0,
        gols_prorrogacao_visitante ?? jogoAnterior.gols_prorrogacao_visitante ?? 0,
        gols_penaltis_casa ?? jogoAnterior.gols_penaltis_casa ?? 0,
        gols_penaltis_visitante ?? jogoAnterior.gols_penaltis_visitante ?? 0,
      );
    }
    updateSql += ' WHERE id=?';
    updateVals.push(jogoId);

    await pool.query(updateSql, updateVals);

    // Push para ao_vivo
    if (status === 'ao_vivo' && jogoAnterior.status !== 'ao_vivo') {
      const [ji] = await pool.query(
        `SELECT tc.sigla as casa_sigla, tv.sigla as vis_sigla, m.nome as modalidade_nome
         FROM jogos j JOIN times tc ON j.time_casa_id=tc.id JOIN times tv ON j.time_visitante_id=tv.id
         JOIN modalidades m ON j.modalidade_id=m.id WHERE j.id=?`, [jogoId]
      );
      if (ji.length > 0) {
        pushRoute.sendToAll({
          title: `🔴 Jogo ao vivo!`,
          body: `${ji[0].casa_sigla} × ${ji[0].vis_sigla} — ${ji[0].modalidade_nome}`,
          url: `/jogo.html?id=${jogoId}`,
          tag: `aovivo-${jogoId}`,
          icon: '/public/favicon.png',
        });
      }
    }

    // Se o jogo está/ficou encerrado em grupos, recalcula do zero (evita duplicação por reaberturas)
    if (status === 'encerrado' && jogoAnterior.fase === 'grupos') {
      let grupoId = jogoAnterior.grupo_id;

      if (!grupoId) {
        const [grupoComum] = await pool.query(
          `SELECT gt1.grupo_id FROM grupos_times gt1
           JOIN grupos_times gt2 ON gt1.grupo_id = gt2.grupo_id
           WHERE gt1.time_id = ? AND gt2.time_id = ? LIMIT 1`,
          [jogoAnterior.time_casa_id, jogoAnterior.time_visitante_id]
        );
        if (grupoComum.length > 0) {
          grupoId = grupoComum[0].grupo_id;
          await pool.query('UPDATE jogos SET grupo_id=? WHERE id=?', [grupoId, jogoId]);
        }
      }

      if (grupoId) {
        await recalcularClassificacao(grupoId);
      }
    }

    const [jogoAtualizado] = await pool.query(`
      SELECT j.*,
        tc.nome as time_casa_nome, tc.sigla as time_casa_sigla, tc.cor as time_casa_cor, tc.logo as time_casa_logo,
        tv.nome as time_visitante_nome, tv.sigla as time_visitante_sigla, tv.cor as time_visitante_cor, tv.logo as time_visitante_logo,
        m.nome as modalidade_nome, m.icone as modalidade_icone,
        g.nome as grupo_nome
      FROM jogos j
      JOIN times tc ON j.time_casa_id = tc.id
      JOIN times tv ON j.time_visitante_id = tv.id
      JOIN modalidades m ON j.modalidade_id = m.id
      LEFT JOIN grupos g ON j.grupo_id = g.id
      WHERE j.id = ?
    `, [jogoId]);

    // Emitir via Socket.IO
    const io = req.app.get('io');
    if (io) {
      io.emit('placar_atualizado', jogoAtualizado[0]);
      io.emit('jogo_atualizado', jogoAtualizado[0]);
    }

    res.json(jogoAtualizado[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao atualizar placar' });
  }
});

// Garante que colunas de timer existem (roda automaticamente se necessário)
async function ensureTimerCols() {
  const cols = [
    { name: 'duracao_periodo', sql: 'ALTER TABLE jogos ADD COLUMN duracao_periodo INT DEFAULT 45' },
    { name: 'num_periodos',    sql: 'ALTER TABLE jogos ADD COLUMN num_periodos TINYINT DEFAULT 2' },
    { name: 'periodo_atual',   sql: 'ALTER TABLE jogos ADD COLUMN periodo_atual TINYINT DEFAULT 0' },
    { name: 'timer_inicio',    sql: 'ALTER TABLE jogos ADD COLUMN timer_inicio BIGINT NULL' },
    { name: 'timer_decorrido', sql: 'ALTER TABLE jogos ADD COLUMN timer_decorrido INT DEFAULT 0' },
    { name: 'timer_ativo',     sql: 'ALTER TABLE jogos ADD COLUMN timer_ativo TINYINT(1) DEFAULT 0' },
  ];
  for (const col of cols) {
    const [ex] = await pool.query(
      `SELECT COLUMN_NAME FROM information_schema.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'jogos' AND COLUMN_NAME = ?`, [col.name]);
    if (ex.length === 0) await pool.query(col.sql);
  }
}

// Controlar timer (admin) — deve vir ANTES de PUT /:id
router.put('/:id/timer', authMiddleware, async (req, res) => {
  const { acao } = req.body;
  const jogoId = req.params.id;

  try {
    // Garante colunas existem mesmo sem restart do servidor
    await ensureTimerCols();

    const [rows] = await pool.query('SELECT * FROM jogos WHERE id = ?', [jogoId]);
    if (rows.length === 0) return res.status(404).json({ erro: 'Jogo não encontrado' });
    const j = rows[0];

    let updates = {};

    if (acao === 'iniciar_periodo') {
      const periodo = parseInt(req.body.periodo) || 1;
      updates = { periodo_atual: periodo, timer_inicio: Date.now(), timer_decorrido: 0, timer_ativo: 1 };
    } else if (acao === 'pausar') {
      const decorrido = j.timer_ativo && j.timer_inicio
        ? (j.timer_decorrido || 0) + Math.floor((Date.now() - Number(j.timer_inicio)) / 1000)
        : (j.timer_decorrido || 0);
      updates = { timer_decorrido: decorrido, timer_inicio: null, timer_ativo: 0 };

      // Push se período chegou ao fim (pausado no tempo correto)
      const durSeg = (j.duracao_periodo || 45) * 60;
      if (decorrido >= durSeg && j.periodo_atual > 0) {
        const [jogoInfo] = await pool.query(
          `SELECT tc.sigla as casa_sigla, tv.sigla as vis_sigla
           FROM jogos j2 JOIN times tc ON j2.time_casa_id=tc.id JOIN times tv ON j2.time_visitante_id=tv.id
           WHERE j2.id=?`, [jogoId]
        );
        if (jogoInfo.length > 0) {
          pushRoute.sendToAll({
            title: `⏱ Fim do ${j.periodo_atual}º Tempo`,
            body: `${jogoInfo[0].casa_sigla} ${j.gols_casa} × ${j.gols_visitante} ${jogoInfo[0].vis_sigla}`,
            url: `/jogo.html?id=${jogoId}`,
            tag: `fimperiodo-${jogoId}`,
            icon: '/public/favicon.png',
          });
        }
      }
    } else if (acao === 'retomar') {
      updates = { timer_inicio: Date.now(), timer_ativo: 1 };
    } else if (acao === 'reiniciar') {
      updates = { periodo_atual: 0, timer_inicio: null, timer_decorrido: 0, timer_ativo: 0 };
    } else {
      return res.status(400).json({ erro: 'Ação inválida' });
    }

    const fields = Object.keys(updates).map(k => `${k}=?`).join(', ');
    const values = [...Object.values(updates), jogoId];
    await pool.query(`UPDATE jogos SET ${fields} WHERE id=?`, values);

    // Buscar dados atualizados com SELECT * para não depender de colunas específicas
    const [updated] = await pool.query('SELECT * FROM jogos WHERE id = ?', [jogoId]);
    const u = updated[0];
    const timerData = {
      id: Number(jogoId),
      duracao_periodo: u.duracao_periodo || 45,
      num_periodos:    u.num_periodos    || 2,
      periodo_atual:   u.periodo_atual   || 0,
      timer_inicio:    u.timer_inicio    || null,
      timer_decorrido: u.timer_decorrido || 0,
      timer_ativo:     u.timer_ativo     || 0,
    };

    const io = req.app.get('io');
    if (io) io.emit('timer_atualizado', timerData);

    res.json(timerData);
  } catch (err) {
    console.error('Erro timer:', err.message);
    res.status(500).json({ erro: 'Erro ao controlar timer: ' + err.message });
  }
});

// Atualizar dados gerais do jogo (admin)
router.put('/:id', authMiddleware, async (req, res) => {
  const { modalidade_id, fase, data_jogo, local_jogo, observacoes, grupo_id, time_casa_id, time_visitante_id, duracao_periodo, num_periodos } = req.body;
  if (time_casa_id && time_visitante_id && time_casa_id === time_visitante_id) {
    return res.status(400).json({ erro: 'Os times precisam ser diferentes' });
  }
  try {
    // Verificar quais colunas de timer existem antes de tentar atualizar
    const [colsCheck] = await pool.query(
      `SELECT COLUMN_NAME FROM information_schema.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'jogos' AND COLUMN_NAME IN ('duracao_periodo','num_periodos')`
    );
    const existingCols = colsCheck.map(c => c.COLUMN_NAME);

    let sql = 'UPDATE jogos SET modalidade_id=?, fase=?, data_jogo=?, local_jogo=?, observacoes=?, grupo_id=?, time_casa_id=?, time_visitante_id=?';
    const vals = [modalidade_id, fase, data_jogo || null, local_jogo, observacoes, grupo_id || null, time_casa_id, time_visitante_id];

    if (existingCols.includes('duracao_periodo')) { sql += ', duracao_periodo=?'; vals.push(duracao_periodo || 45); }
    if (existingCols.includes('num_periodos'))    { sql += ', num_periodos=?';    vals.push(num_periodos    || 2);  }

    sql += ' WHERE id=?';
    vals.push(req.params.id);

    await pool.query(sql, vals);
    res.json({ mensagem: 'Jogo atualizado' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao atualizar jogo' });
  }
});

// Deletar jogo (admin)
router.delete('/:id', authMiddleware, async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT * FROM jogos WHERE id = ?', [req.params.id]);
    if (rows.length === 0) return res.status(404).json({ erro: 'Jogo não encontrado' });
    const jogo = rows[0];

    await pool.query('DELETE FROM jogos WHERE id = ?', [req.params.id]);

    // Se estava encerrado em grupo, recalcula após deletar
    if (jogo.status === 'encerrado' && jogo.grupo_id && jogo.fase === 'grupos') {
      await recalcularClassificacao(jogo.grupo_id);
    }
    const io = req.app.get('io');
    if (io) io.emit('jogo_removido', { id: req.params.id });
    res.json({ mensagem: 'Jogo removido' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao remover jogo' });
  }
});

// Listar gols de um jogo (público)
router.get('/:id/gols', async (req, res) => {
  try {
    const [rows] = await pool.query(`
      SELECT g.*, t.nome as time_nome, t.sigla as time_sigla, t.cor as time_cor
      FROM gols g
      JOIN times t ON g.time_id = t.id
      WHERE g.jogo_id = ?
      ORDER BY g.minuto ASC, g.criado_em ASC
    `, [req.params.id]);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ erro: 'Erro ao buscar gols' });
  }
});

// Registrar gol (admin)
router.post('/:id/gols', authMiddleware, async (req, res) => {
  const { jogador, time_id, minuto } = req.body;
  if (!jogador || !time_id) return res.status(400).json({ erro: 'Jogador e time são obrigatórios' });
  try {
    const [result] = await pool.query(
      'INSERT INTO gols (jogo_id, time_id, jogador, minuto) VALUES (?, ?, ?, ?)',
      [req.params.id, time_id, jogador.trim(), minuto || null]
    );
    const [allGols] = await pool.query(`
      SELECT g.*, t.nome as time_nome, t.sigla as time_sigla, t.cor as time_cor
      FROM gols g JOIN times t ON g.time_id = t.id
      WHERE g.jogo_id = ?
      ORDER BY g.minuto ASC, g.criado_em ASC
    `, [req.params.id]);
    const io = req.app.get('io');
    if (io) io.emit('gols_atualizados', { jogo_id: Number(req.params.id), gols: allGols });

    // Buscar info do jogo para a notificação
    const [jogoInfo] = await pool.query(
      `SELECT j.gols_casa, j.gols_visitante,
              tc.sigla as casa_sigla, tv.sigla as vis_sigla
       FROM jogos j
       JOIN times tc ON j.time_casa_id = tc.id
       JOIN times tv ON j.time_visitante_id = tv.id
       WHERE j.id = ?`, [req.params.id]
    );
    if (jogoInfo.length > 0) {
      const ji = jogoInfo[0];
      const gol = allGols.find(g => g.id === result.insertId);
      const minStr = gol?.minuto ? ` (${gol.minuto}')` : '';
      pushRoute.sendToAll({
        title: `⚽ GOL! ${gol?.time_sigla || ''}${minStr}`,
        body: `${jogador} — ${ji.casa_sigla} ${ji.gols_casa} × ${ji.gols_visitante} ${ji.vis_sigla}`,
        url: `/jogo.html?id=${req.params.id}`,
        tag: `gol-${req.params.id}`,
        icon: '/public/favicon.png',
      });
    }

    res.status(201).json(allGols.find(g => g.id === result.insertId));
  } catch (err) {
    res.status(500).json({ erro: 'Erro ao registrar gol' });
  }
});

// Remover gol (admin)
router.delete('/:id/gols/:golId', authMiddleware, async (req, res) => {
  try {
    await pool.query('DELETE FROM gols WHERE id = ? AND jogo_id = ?', [req.params.golId, req.params.id]);
    const [allGols] = await pool.query(`
      SELECT g.*, t.nome as time_nome, t.sigla as time_sigla, t.cor as time_cor
      FROM gols g JOIN times t ON g.time_id = t.id
      WHERE g.jogo_id = ?
      ORDER BY g.minuto ASC, g.criado_em ASC
    `, [req.params.id]);
    const io = req.app.get('io');
    if (io) io.emit('gols_atualizados', { jogo_id: Number(req.params.id), gols: allGols });
    res.json({ mensagem: 'Gol removido' });
  } catch (err) {
    res.status(500).json({ erro: 'Erro ao remover gol' });
  }
});

// Listar cartões de um jogo (público)
router.get('/:id/cartoes', async (req, res) => {
  try {
    const [rows] = await pool.query(`
      SELECT c.*, t.nome as time_nome, t.sigla as time_sigla, t.cor as time_cor
      FROM cartoes c
      JOIN times t ON c.time_id = t.id
      WHERE c.jogo_id = ?
      ORDER BY c.minuto ASC, c.criado_em ASC
    `, [req.params.id]);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ erro: 'Erro ao buscar cartões' });
  }
});

// Registrar cartão (admin)
router.post('/:id/cartoes', authMiddleware, async (req, res) => {
  const { jogador, time_id, tipo, minuto } = req.body;
  if (!jogador || !time_id || !tipo) return res.status(400).json({ erro: 'Jogador, time e tipo são obrigatórios' });
  try {
    const [result] = await pool.query(
      'INSERT INTO cartoes (jogo_id, time_id, jogador, tipo, minuto) VALUES (?, ?, ?, ?, ?)',
      [req.params.id, time_id, jogador.trim(), tipo, minuto || null]
    );
    const [allCartoes] = await pool.query(`
      SELECT c.*, t.nome as time_nome, t.sigla as time_sigla, t.cor as time_cor
      FROM cartoes c JOIN times t ON c.time_id = t.id
      WHERE c.jogo_id = ?
      ORDER BY c.minuto ASC, c.criado_em ASC
    `, [req.params.id]);
    const io = req.app.get('io');
    if (io) io.emit('cartoes_atualizados', { jogo_id: Number(req.params.id), cartoes: allCartoes });

    // Push para cartão vermelho
    if (tipo === 'vermelho') {
      const [jogoInfo] = await pool.query(
        `SELECT tc.sigla as casa_sigla, tv.sigla as vis_sigla
         FROM jogos j JOIN times tc ON j.time_casa_id=tc.id JOIN times tv ON j.time_visitante_id=tv.id
         WHERE j.id=?`, [req.params.id]
      );
      if (jogoInfo.length > 0) {
        const cartaoNovo = allCartoes.find(c => c.id === result.insertId);
        const minStr = cartaoNovo?.minuto ? ` (${cartaoNovo.minuto}')` : '';
        pushRoute.sendToAll({
          title: `🟥 Cartão Vermelho${minStr}`,
          body: `${jogador} — ${jogoInfo[0].casa_sigla} × ${jogoInfo[0].vis_sigla}`,
          url: `/jogo.html?id=${req.params.id}`,
          tag: `vermelho-${req.params.id}`,
          icon: '/public/favicon.png',
        });
      }
    }

    res.status(201).json(allCartoes.find(c => c.id === result.insertId));
  } catch (err) {
    res.status(500).json({ erro: 'Erro ao registrar cartão' });
  }
});

// Remover cartão (admin)
router.delete('/:id/cartoes/:cartaoId', authMiddleware, async (req, res) => {
  try {
    await pool.query('DELETE FROM cartoes WHERE id = ? AND jogo_id = ?', [req.params.cartaoId, req.params.id]);
    const [allCartoes] = await pool.query(`
      SELECT c.*, t.nome as time_nome, t.sigla as time_sigla, t.cor as time_cor
      FROM cartoes c JOIN times t ON c.time_id = t.id
      WHERE c.jogo_id = ?
      ORDER BY c.minuto ASC, c.criado_em ASC
    `, [req.params.id]);
    const io = req.app.get('io');
    if (io) io.emit('cartoes_atualizados', { jogo_id: Number(req.params.id), cartoes: allCartoes });
    res.json({ mensagem: 'Cartão removido' });
  } catch (err) {
    res.status(500).json({ erro: 'Erro ao remover cartão' });
  }
});

// Função auxiliar para atualizar classificação no grupo
// Recalcula classificação do grupo do zero com base em todos os jogos encerrados
async function recalcularClassificacao(grupoId) {
  // Zera todos os times do grupo
  await pool.query(`
    UPDATE grupos_times SET
      pontos=0, jogos=0, vitorias=0, empates=0, derrotas=0,
      gols_pro=0, gols_contra=0, saldo_gols=0
    WHERE grupo_id=?
  `, [grupoId]);

  // Busca todos os jogos encerrados do grupo
  const [jogosGrupo] = await pool.query(
    `SELECT * FROM jogos WHERE grupo_id=? AND status='encerrado' AND fase='grupos'`,
    [grupoId]
  );

  for (const jogo of jogosGrupo) {
    const gc = jogo.gols_casa, gv = jogo.gols_visitante;
    const casaVenceu = gc > gv, visVenceu = gv > gc, empate = gc === gv;

    await pool.query(`
      INSERT INTO grupos_times (grupo_id, time_id, pontos, jogos, vitorias, empates, derrotas, gols_pro, gols_contra, saldo_gols)
      VALUES (?, ?, ?, 1, ?, ?, ?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE
        pontos=pontos+VALUES(pontos), jogos=jogos+1,
        vitorias=vitorias+VALUES(vitorias), empates=empates+VALUES(empates), derrotas=derrotas+VALUES(derrotas),
        gols_pro=gols_pro+VALUES(gols_pro), gols_contra=gols_contra+VALUES(gols_contra), saldo_gols=saldo_gols+VALUES(saldo_gols)
    `, [grupoId, jogo.time_casa_id,
      casaVenceu ? 3 : empate ? 1 : 0,
      casaVenceu ? 1 : 0, empate ? 1 : 0, visVenceu ? 1 : 0,
      gc, gv, gc - gv]);

    await pool.query(`
      INSERT INTO grupos_times (grupo_id, time_id, pontos, jogos, vitorias, empates, derrotas, gols_pro, gols_contra, saldo_gols)
      VALUES (?, ?, ?, 1, ?, ?, ?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE
        pontos=pontos+VALUES(pontos), jogos=jogos+1,
        vitorias=vitorias+VALUES(vitorias), empates=empates+VALUES(empates), derrotas=derrotas+VALUES(derrotas),
        gols_pro=gols_pro+VALUES(gols_pro), gols_contra=gols_contra+VALUES(gols_contra), saldo_gols=saldo_gols+VALUES(saldo_gols)
    `, [grupoId, jogo.time_visitante_id,
      visVenceu ? 3 : empate ? 1 : 0,
      visVenceu ? 1 : 0, empate ? 1 : 0, casaVenceu ? 1 : 0,
      gv, gc, gv - gc]);
  }
}

async function atualizarClassificacao(grupoId, casaId, visitanteId, golsCasaAnt, golsVisAnt, golsCasaNovo, golsVisNovo, statusAnterior) {
  // Se já estava encerrado, reverte os dados antigos antes de aplicar os novos
  if (statusAnterior === 'encerrado') {
    await reverterClassificacao(grupoId, casaId, visitanteId, golsCasaAnt, golsVisAnt);
  }

  // Aplicar novo resultado
  const casaVenceu = golsCasaNovo > golsVisNovo;
  const visitanteVenceu = golsVisNovo > golsCasaNovo;
  const empate = golsCasaNovo === golsVisNovo;

  // Time da casa
  await pool.query(`
    INSERT INTO grupos_times (grupo_id, time_id, pontos, jogos, vitorias, empates, derrotas, gols_pro, gols_contra, saldo_gols)
    VALUES (?, ?, ?, 1, ?, ?, ?, ?, ?, ?)
    ON DUPLICATE KEY UPDATE
      pontos = pontos + VALUES(pontos),
      jogos = jogos + 1,
      vitorias = vitorias + VALUES(vitorias),
      empates = empates + VALUES(empates),
      derrotas = derrotas + VALUES(derrotas),
      gols_pro = gols_pro + VALUES(gols_pro),
      gols_contra = gols_contra + VALUES(gols_contra),
      saldo_gols = saldo_gols + VALUES(saldo_gols)
  `, [grupoId, casaId,
    casaVenceu ? 3 : empate ? 1 : 0,
    casaVenceu ? 1 : 0, empate ? 1 : 0, visitanteVenceu ? 1 : 0,
    golsCasaNovo, golsVisNovo, golsCasaNovo - golsVisNovo]);

  // Time visitante
  await pool.query(`
    INSERT INTO grupos_times (grupo_id, time_id, pontos, jogos, vitorias, empates, derrotas, gols_pro, gols_contra, saldo_gols)
    VALUES (?, ?, ?, 1, ?, ?, ?, ?, ?, ?)
    ON DUPLICATE KEY UPDATE
      pontos = pontos + VALUES(pontos),
      jogos = jogos + 1,
      vitorias = vitorias + VALUES(vitorias),
      empates = empates + VALUES(empates),
      derrotas = derrotas + VALUES(derrotas),
      gols_pro = gols_pro + VALUES(gols_pro),
      gols_contra = gols_contra + VALUES(gols_contra),
      saldo_gols = saldo_gols + VALUES(saldo_gols)
  `, [grupoId, visitanteId,
    visitanteVenceu ? 3 : empate ? 1 : 0,
    visitanteVenceu ? 1 : 0, empate ? 1 : 0, casaVenceu ? 1 : 0,
    golsVisNovo, golsCasaNovo, golsVisNovo - golsCasaNovo]);
}

async function reverterClassificacao(grupoId, casaId, visitanteId, golsCasa, golsVis) {
  const casaVenceu = golsCasa > golsVis;
  const visitanteVenceu = golsVis > golsCasa;
  const empate = golsCasa === golsVis;

  await pool.query(`
    UPDATE grupos_times SET
      pontos = GREATEST(0, pontos - ?),
      jogos = GREATEST(0, jogos - 1),
      vitorias = GREATEST(0, vitorias - ?),
      empates = GREATEST(0, empates - ?),
      derrotas = GREATEST(0, derrotas - ?),
      gols_pro = GREATEST(0, gols_pro - ?),
      gols_contra = GREATEST(0, gols_contra - ?),
      saldo_gols = saldo_gols - ?
    WHERE grupo_id = ? AND time_id = ?
  `, [casaVenceu ? 3 : empate ? 1 : 0,
    casaVenceu ? 1 : 0, empate ? 1 : 0, visitanteVenceu ? 1 : 0,
    golsCasa, golsVis, golsCasa - golsVis, grupoId, casaId]);

  await pool.query(`
    UPDATE grupos_times SET
      pontos = GREATEST(0, pontos - ?),
      jogos = GREATEST(0, jogos - 1),
      vitorias = GREATEST(0, vitorias - ?),
      empates = GREATEST(0, empates - ?),
      derrotas = GREATEST(0, derrotas - ?),
      gols_pro = GREATEST(0, gols_pro - ?),
      gols_contra = GREATEST(0, gols_contra - ?),
      saldo_gols = saldo_gols - ?
    WHERE grupo_id = ? AND time_id = ?
  `, [visitanteVenceu ? 3 : empate ? 1 : 0,
    visitanteVenceu ? 1 : 0, empate ? 1 : 0, casaVenceu ? 1 : 0,
    golsVis, golsCasa, golsVis - golsCasa, grupoId, visitanteId]);
}

module.exports = router;
