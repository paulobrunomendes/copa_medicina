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

    // Auto-log auditoria
    const gc = gols_casa ?? jogoAnterior.gols_casa;
    const gv = gols_visitante ?? jogoAnterior.gols_visitante;
    await pool.query(
      'INSERT INTO auditoria_jogos (jogo_id, admin_nome, acao, detalhe) VALUES (?, ?, ?, ?)',
      [jogoId, req.admin?.nome || 'Admin', 'Placar atualizado', `Casa ${gc} × ${gv} Visitante${status ? ' — ' + status : ''}`]
    ).catch(() => {});

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
  const { jogador, time_id, minuto, periodo } = req.body;
  if (!jogador || !time_id) return res.status(400).json({ erro: 'Jogador e time são obrigatórios' });
  try {
    // Auto-detectar período atual do jogo se não informado
    let periodoFinal = periodo != null ? periodo : null;
    if (periodoFinal == null) {
      const [[j]] = await pool.query('SELECT periodo_atual FROM jogos WHERE id=?', [req.params.id]);
      if (j && j.periodo_atual > 0) periodoFinal = j.periodo_atual;
    }
    const [result] = await pool.query(
      'INSERT INTO gols (jogo_id, time_id, jogador, minuto, periodo) VALUES (?, ?, ?, ?, ?)',
      [req.params.id, time_id, jogador.trim(), minuto || null, periodoFinal]
    );
    const [allGols] = await pool.query(`
      SELECT g.*, t.nome as time_nome, t.sigla as time_sigla, t.cor as time_cor
      FROM gols g JOIN times t ON g.time_id = t.id
      WHERE g.jogo_id = ?
      ORDER BY g.periodo ASC, g.minuto ASC, g.criado_em ASC
    `, [req.params.id]);
    const io = req.app.get('io');
    if (io) io.emit('gols_atualizados', { jogo_id: Number(req.params.id), gols: allGols });

    // Auto-log auditoria
    const [timeSigla] = await pool.query('SELECT sigla FROM times WHERE id = ?', [time_id]);
    const sigla = timeSigla.length > 0 ? timeSigla[0].sigla : '';
    await pool.query(
      'INSERT INTO auditoria_jogos (jogo_id, admin_nome, acao, detalhe) VALUES (?, ?, ?, ?)',
      [req.params.id, req.admin?.nome || 'Admin', 'Gol registrado', `${jogador} (${sigla})`]
    ).catch(() => {});

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
      const minStr = gol?.minuto ? ` (${gol.periodo ? gol.periodo + 'T ' : ''}${gol.minuto}')` : '';
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
    await pool.query(
      'INSERT INTO auditoria_jogos (jogo_id, admin_nome, acao, detalhe) VALUES (?, ?, ?, ?)',
      [req.params.id, req.admin?.nome || 'Admin', 'Gol removido', `ID ${req.params.golId}`]
    ).catch(() => {});
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
  const { jogador, time_id, tipo, minuto, periodo } = req.body;
  if (!jogador || !time_id || !tipo) return res.status(400).json({ erro: 'Jogador, time e tipo são obrigatórios' });
  try {
    let periodoFinal = periodo != null ? periodo : null;
    if (periodoFinal == null) {
      const [[j]] = await pool.query('SELECT periodo_atual FROM jogos WHERE id=?', [req.params.id]);
      if (j && j.periodo_atual > 0) periodoFinal = j.periodo_atual;
    }
    const [result] = await pool.query(
      'INSERT INTO cartoes (jogo_id, time_id, jogador, tipo, minuto, periodo) VALUES (?, ?, ?, ?, ?, ?)',
      [req.params.id, time_id, jogador.trim(), tipo, minuto || null, periodoFinal]
    );
    const [allCartoes] = await pool.query(`
      SELECT c.*, t.nome as time_nome, t.sigla as time_sigla, t.cor as time_cor
      FROM cartoes c JOIN times t ON c.time_id = t.id
      WHERE c.jogo_id = ?
      ORDER BY c.periodo ASC, c.minuto ASC, c.criado_em ASC
    `, [req.params.id]);
    const io = req.app.get('io');
    if (io) io.emit('cartoes_atualizados', { jogo_id: Number(req.params.id), cartoes: allCartoes });

    // Auto-log auditoria
    await pool.query(
      'INSERT INTO auditoria_jogos (jogo_id, admin_nome, acao, detalhe) VALUES (?, ?, ?, ?)',
      [req.params.id, req.admin?.nome || 'Admin', 'Cartão registrado', `${tipo} — ${jogador}`]
    ).catch(() => {});

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

// ===== MVP =====
router.put('/:id/mvp', authMiddleware, async (req, res) => {
  const { mvp_jogador, mvp_time_id } = req.body;
  try {
    await pool.query('UPDATE jogos SET mvp_jogador=?, mvp_time_id=? WHERE id=?',
      [mvp_jogador || null, mvp_time_id || null, req.params.id]);
    const io = req.app.get('io');
    if (io) io.emit('mvp_atualizado', { jogo_id: Number(req.params.id), mvp_jogador, mvp_time_id });
    res.json({ mensagem: 'MVP atualizado' });
  } catch (err) {
    res.status(500).json({ erro: 'Erro ao atualizar MVP' });
  }
});

// ===== SÚMULA HTML (para impressão/PDF) =====
router.get('/:id/sumula', async (req, res) => {
  try {
    const [[jogo]] = await pool.query(`
      SELECT j.*,
        tc.nome as time_casa_nome, tc.sigla as time_casa_sigla, tc.cor as time_casa_cor, tc.logo as time_casa_logo,
        tv.nome as time_visitante_nome, tv.sigla as time_visitante_sigla, tv.cor as time_visitante_cor, tv.logo as time_visitante_logo,
        m.nome as modalidade_nome, m.icone as modalidade_icone,
        mvt.nome as mvp_time_nome, mvt.sigla as mvp_time_sigla
      FROM jogos j
      JOIN times tc ON j.time_casa_id = tc.id
      JOIN times tv ON j.time_visitante_id = tv.id
      JOIN modalidades m ON j.modalidade_id = m.id
      LEFT JOIN times mvt ON j.mvp_time_id = mvt.id
      WHERE j.id = ?`, [req.params.id]);

    if (!jogo) return res.status(404).send('<p>Jogo não encontrado</p>');

    const [gols]    = await pool.query(`SELECT g.*, t.nome as time_nome, t.sigla FROM gols g JOIN times t ON g.time_id=t.id WHERE g.jogo_id=? ORDER BY g.periodo ASC, g.minuto ASC`, [req.params.id]);
    const [cartoes] = await pool.query(`SELECT c.*, t.nome as time_nome, t.sigla FROM cartoes c JOIN times t ON c.time_id=t.id WHERE c.jogo_id=? ORDER BY c.periodo ASC, c.minuto ASC`, [req.params.id]);
    const [parciais]= await pool.query(`SELECT * FROM parciais WHERE jogo_id=? ORDER BY numero ASC`, [req.params.id]);

    const dataStr = jogo.data_jogo ? new Date(jogo.data_jogo).toLocaleString('pt-BR') : 'A definir';
    const faseMap = { grupos:'Grupos', oitavas:'Oitavas de Final', quartas:'Quartas de Final', semifinal:'Semifinal', terceiro_lugar:'3º Lugar', final:'Final' };
    const statusMap = { agendado:'Agendado', ao_vivo:'Ao Vivo', encerrado:'Encerrado' };

    const golsHtml = gols.map(g => {
      const t = g.minuto ? `${g.periodo ? g.periodo+'T ' : ''}${g.minuto}'` : (g.periodo ? g.periodo+'T' : '—');
      return `<tr><td>${g.jogador}</td><td>${g.sigla}</td><td>${t}</td></tr>`;
    }).join('') || '<tr><td colspan="3" style="color:#888">Nenhum gol registrado</td></tr>';

    const cartoesHtml = cartoes.map(c => {
      const t = c.minuto ? `${c.periodo ? c.periodo+'T ' : ''}${c.minuto}'` : '—';
      const cor = c.tipo === 'vermelho' ? '#dc2626' : '#f59e0b';
      return `<tr><td>${c.jogador}</td><td>${c.sigla}</td><td><span style="background:${cor};color:white;padding:1px 7px;border-radius:3px;font-size:11px">${c.tipo}</span></td><td>${t}</td></tr>`;
    }).join('') || '<tr><td colspan="4" style="color:#888">Nenhum cartão registrado</td></tr>';

    const parciaisHtml = parciais.length ? `
      <h3>Parciais</h3>
      <table><thead><tr><th>Período</th><th>${jogo.time_casa_sigla}</th><th>${jogo.time_visitante_sigla}</th></tr></thead>
      <tbody>${parciais.map(p => `<tr><td>${p.label || p.numero+'º'}</td><td>${p.gols_casa}</td><td>${p.gols_visitante}</td></tr>`).join('')}</tbody></table>` : '';

    const mvpHtml = jogo.mvp_jogador ? `<p><strong>🏅 MVP:</strong> ${jogo.mvp_jogador}${jogo.mvp_time_nome ? ` (${jogo.mvp_time_nome})` : ''}</p>` : '';

    const html = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<title>Súmula — ${jogo.time_casa_sigla} × ${jogo.time_visitante_sigla}</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: Arial, sans-serif; font-size: 13px; color: #111; padding: 24px; max-width: 720px; margin: 0 auto; }
  h1 { font-size: 20px; text-align: center; margin-bottom: 4px; }
  h2 { font-size: 14px; color: #555; text-align: center; margin-bottom: 16px; font-weight: normal; }
  h3 { font-size: 13px; font-weight: 700; margin: 16px 0 6px; border-bottom: 1px solid #ccc; padding-bottom: 3px; text-transform: uppercase; letter-spacing: 0.5px; }
  .placar { text-align: center; font-size: 36px; font-weight: 900; margin: 12px 0; letter-spacing: -1px; }
  .meta { display: flex; gap: 16px; justify-content: center; font-size: 12px; color: #555; margin-bottom: 16px; flex-wrap: wrap; }
  .meta span { background: #f1f5f9; padding: 3px 10px; border-radius: 100px; }
  table { width: 100%; border-collapse: collapse; margin-bottom: 8px; }
  th { background: #f1f5f9; font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px; padding: 5px 8px; text-align: left; }
  td { padding: 5px 8px; border-bottom: 1px solid #f1f5f9; }
  .footer { margin-top: 24px; text-align: center; font-size: 11px; color: #aaa; border-top: 1px solid #eee; padding-top: 12px; }
  @media print { body { padding: 0; } }
</style>
</head>
<body>
<h1>${jogo.modalidade_icone} ${jogo.modalidade_nome} — ${faseMap[jogo.fase] || jogo.fase}</h1>
<h2>Copa Med Horus · ${dataStr}${jogo.local_jogo ? ' · ' + jogo.local_jogo : ''}</h2>
<div class="placar">${jogo.time_casa_sigla} ${jogo.gols_casa} × ${jogo.gols_visitante} ${jogo.time_visitante_sigla}</div>
<div class="meta">
  <span>${jogo.time_casa_nome}</span>
  <span>×</span>
  <span>${jogo.time_visitante_nome}</span>
</div>
<div class="meta">
  <span>Status: ${statusMap[jogo.status] || jogo.status}</span>
  ${jogo.gols_prorrogacao_casa || jogo.gols_prorrogacao_visitante ? `<span>Prorrogação: ${jogo.gols_prorrogacao_casa}×${jogo.gols_prorrogacao_visitante}</span>` : ''}
  ${jogo.gols_penaltis_casa || jogo.gols_penaltis_visitante ? `<span>Pênaltis: ${jogo.gols_penaltis_casa}×${jogo.gols_penaltis_visitante}</span>` : ''}
</div>
${mvpHtml}
${parciaisHtml}
<h3>Gols</h3>
<table><thead><tr><th>Jogador</th><th>Time</th><th>Tempo</th></tr></thead><tbody>${golsHtml}</tbody></table>
<h3>Cartões</h3>
<table><thead><tr><th>Jogador</th><th>Time</th><th>Tipo</th><th>Tempo</th></tr></thead><tbody>${cartoesHtml}</tbody></table>
${jogo.observacoes ? `<h3>Observações</h3><p>${jogo.observacoes}</p>` : ''}
<div class="footer">Gerado em ${new Date().toLocaleString('pt-BR')} · Copa Med Horus</div>
<script>window.onload = () => window.print();</script>
</body></html>`;

    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(html);
  } catch (err) {
    console.error(err);
    res.status(500).send('<p>Erro ao gerar súmula</p>');
  }
});

// ===== PARCIAIS =====

// Listar parciais (público)
router.get('/:id/parciais', async (req, res) => {
  try {
    const [rows] = await pool.query(
      'SELECT * FROM parciais WHERE jogo_id = ? ORDER BY numero ASC',
      [req.params.id]
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ erro: 'Erro ao buscar parciais' });
  }
});

// Adicionar parcial (admin)
router.post('/:id/parciais', authMiddleware, async (req, res) => {
  const { numero, label, gols_casa, gols_visitante } = req.body;
  try {
    const [result] = await pool.query(
      'INSERT INTO parciais (jogo_id, numero, label, gols_casa, gols_visitante) VALUES (?, ?, ?, ?, ?)',
      [req.params.id, numero, label || null, gols_casa || 0, gols_visitante || 0]
    );
    const [all] = await pool.query('SELECT * FROM parciais WHERE jogo_id = ? ORDER BY numero ASC', [req.params.id]);
    const io = req.app.get('io');
    if (io) io.emit('parciais_atualizados', { jogo_id: Number(req.params.id), parciais: all });
    const [[novo]] = await pool.query('SELECT * FROM parciais WHERE id = ?', [result.insertId]);
    res.status(201).json(novo);
  } catch (err) {
    res.status(500).json({ erro: 'Erro ao adicionar parcial' });
  }
});

// Remover parcial (admin)
router.delete('/:id/parciais/:pid', authMiddleware, async (req, res) => {
  try {
    await pool.query('DELETE FROM parciais WHERE id = ? AND jogo_id = ?', [req.params.pid, req.params.id]);
    const [all] = await pool.query('SELECT * FROM parciais WHERE jogo_id = ? ORDER BY numero ASC', [req.params.id]);
    const io = req.app.get('io');
    if (io) io.emit('parciais_atualizados', { jogo_id: Number(req.params.id), parciais: all });
    res.json({ mensagem: 'Parcial removido' });
  } catch (err) {
    res.status(500).json({ erro: 'Erro ao remover parcial' });
  }
});

// ===== HISTÓRICO =====

// Listar histórico (público)
router.get('/:id/historico', async (req, res) => {
  try {
    const [rows] = await pool.query(
      'SELECT * FROM auditoria_jogos WHERE jogo_id = ? ORDER BY criado_em DESC LIMIT 50',
      [req.params.id]
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ erro: 'Erro ao buscar histórico' });
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

  // Busca o tipo da modalidade do grupo
  const [[grupo]] = await pool.query(
    `SELECT m.tipo FROM grupos g JOIN modalidades m ON g.modalidade_id = m.id WHERE g.id = ?`,
    [grupoId]
  );
  const isBasquete = grupo && grupo.tipo === 'basquete';

  // Busca todos os jogos encerrados do grupo
  const [jogosGrupo] = await pool.query(
    `SELECT * FROM jogos WHERE grupo_id=? AND status='encerrado' AND fase='grupos'`,
    [grupoId]
  );

  for (const jogo of jogosGrupo) {
    const gc = jogo.gols_casa, gv = jogo.gols_visitante;
    const casaVenceu = gc > gv, visVenceu = gv > gc, empate = gc === gv;

    // Basquete: vitória=2pts, derrota=1pt, sem empate
    // Demais: vitória=3pts, empate=1pt, derrota=0pts
    const ptsCasa = isBasquete
      ? (casaVenceu ? 2 : 1)
      : (casaVenceu ? 3 : empate ? 1 : 0);
    const ptsVis = isBasquete
      ? (visVenceu ? 2 : 1)
      : (visVenceu ? 3 : empate ? 1 : 0);
    const empateCasa = isBasquete ? 0 : (empate ? 1 : 0);
    const empateVis = isBasquete ? 0 : (empate ? 1 : 0);

    await pool.query(`
      INSERT INTO grupos_times (grupo_id, time_id, pontos, jogos, vitorias, empates, derrotas, gols_pro, gols_contra, saldo_gols)
      VALUES (?, ?, ?, 1, ?, ?, ?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE
        pontos=pontos+VALUES(pontos), jogos=jogos+1,
        vitorias=vitorias+VALUES(vitorias), empates=empates+VALUES(empates), derrotas=derrotas+VALUES(derrotas),
        gols_pro=gols_pro+VALUES(gols_pro), gols_contra=gols_contra+VALUES(gols_contra), saldo_gols=saldo_gols+VALUES(saldo_gols)
    `, [grupoId, jogo.time_casa_id,
      ptsCasa, casaVenceu ? 1 : 0, empateCasa, visVenceu ? 1 : 0,
      gc, gv, gc - gv]);

    await pool.query(`
      INSERT INTO grupos_times (grupo_id, time_id, pontos, jogos, vitorias, empates, derrotas, gols_pro, gols_contra, saldo_gols)
      VALUES (?, ?, ?, 1, ?, ?, ?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE
        pontos=pontos+VALUES(pontos), jogos=jogos+1,
        vitorias=vitorias+VALUES(vitorias), empates=empates+VALUES(empates), derrotas=derrotas+VALUES(derrotas),
        gols_pro=gols_pro+VALUES(gols_pro), gols_contra=gols_contra+VALUES(gols_contra), saldo_gols=saldo_gols+VALUES(saldo_gols)
    `, [grupoId, jogo.time_visitante_id,
      ptsVis, visVenceu ? 1 : 0, empateVis, casaVenceu ? 1 : 0,
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
