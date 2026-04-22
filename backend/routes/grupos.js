const express = require('express');
const router = express.Router();
const { pool } = require('../config/database');
const authMiddleware = require('../middleware/auth');

// Listar grupos com classificação (público)
router.get('/', async (req, res) => {
  const { modalidade_id } = req.query;
  try {
    let query = `
      SELECT g.*, m.nome as modalidade_nome, m.icone as modalidade_icone
      FROM grupos g
      JOIN modalidades m ON g.modalidade_id = m.id
    `;
    const params = [];
    if (modalidade_id) {
      query += ' WHERE g.modalidade_id = ?';
      params.push(modalidade_id);
    }
    query += ' ORDER BY m.nome, g.nome';
    const [grupos] = await pool.query(query, params);

    // Para cada grupo, buscar classificação
    for (const grupo of grupos) {
      const [classificacao] = await pool.query(`
        SELECT gt.*, t.nome, t.sigla, t.cor, t.curso
        FROM grupos_times gt
        JOIN times t ON gt.time_id = t.id
        WHERE gt.grupo_id = ?
        ORDER BY gt.pontos DESC, gt.vitorias DESC, gt.saldo_gols DESC, gt.gols_pro DESC
      `, [grupo.id]);
      grupo.classificacao = classificacao;
    }

    res.json(grupos);
  } catch (err) {
    res.status(500).json({ erro: 'Erro ao buscar grupos' });
  }
});

// Criar grupo (admin)
router.post('/', authMiddleware, async (req, res) => {
  const { nome, modalidade_id } = req.body;
  if (!nome || !modalidade_id) {
    return res.status(400).json({ erro: 'Nome e modalidade são obrigatórios' });
  }
  try {
    const [result] = await pool.query(
      'INSERT INTO grupos (nome, modalidade_id) VALUES (?, ?)',
      [nome, modalidade_id]
    );
    res.status(201).json({ id: result.insertId, nome, modalidade_id });
  } catch (err) {
    res.status(500).json({ erro: 'Erro ao criar grupo' });
  }
});

// Editar grupo (admin)
router.put('/:id', authMiddleware, async (req, res) => {
  const { nome } = req.body;
  if (!nome) return res.status(400).json({ erro: 'Nome é obrigatório' });
  try {
    await pool.query('UPDATE grupos SET nome=? WHERE id=?', [nome, req.params.id]);
    res.json({ mensagem: 'Grupo atualizado' });
  } catch (err) {
    res.status(500).json({ erro: 'Erro ao atualizar grupo' });
  }
});

// Resetar classificação do grupo (admin)
router.post('/:id/resetar', authMiddleware, async (req, res) => {
  try {
    await pool.query(
      'UPDATE grupos_times SET pontos=0, jogos=0, vitorias=0, empates=0, derrotas=0, gols_pro=0, gols_contra=0, saldo_gols=0 WHERE grupo_id=?',
      [req.params.id]
    );
    res.json({ mensagem: 'Classificação resetada' });
  } catch (err) {
    res.status(500).json({ erro: 'Erro ao resetar classificação' });
  }
});

// Adicionar time ao grupo (admin)
router.post('/:id/times', authMiddleware, async (req, res) => {
  const { time_id } = req.body;
  try {
    await pool.query(
      'INSERT IGNORE INTO grupos_times (grupo_id, time_id) VALUES (?, ?)',
      [req.params.id, time_id]
    );
    res.json({ mensagem: 'Time adicionado ao grupo' });
  } catch (err) {
    res.status(500).json({ erro: 'Erro ao adicionar time ao grupo' });
  }
});

// Remover time do grupo (admin)
router.delete('/:id/times/:time_id', authMiddleware, async (req, res) => {
  try {
    await pool.query(
      'DELETE FROM grupos_times WHERE grupo_id = ? AND time_id = ?',
      [req.params.id, req.params.time_id]
    );
    res.json({ mensagem: 'Time removido do grupo' });
  } catch (err) {
    res.status(500).json({ erro: 'Erro ao remover time do grupo' });
  }
});

// Deletar grupo (admin)
router.delete('/:id', authMiddleware, async (req, res) => {
  try {
    await pool.query('DELETE FROM grupos WHERE id = ?', [req.params.id]);
    res.json({ mensagem: 'Grupo removido' });
  } catch (err) {
    res.status(500).json({ erro: 'Erro ao remover grupo' });
  }
});

// Retorna 1º e 2º de cada grupo (para gerar mata-mata)
router.get('/classificados', authMiddleware, async (req, res) => {
  const { modalidade_id } = req.query;
  try {
    let q = `SELECT g.id as grupo_id, g.nome as grupo_nome, m.id as modalidade_id, m.nome as modalidade_nome
             FROM grupos g JOIN modalidades m ON g.modalidade_id = m.id`;
    const params = [];
    if (modalidade_id) { q += ' WHERE g.modalidade_id = ?'; params.push(modalidade_id); }
    q += ' ORDER BY m.nome, g.nome';
    const [grupos] = await pool.query(q, params);

    const resultado = [];
    for (const g of grupos) {
      const [times] = await pool.query(
        `SELECT gt.*, t.nome, t.sigla, t.cor, t.logo
         FROM grupos_times gt JOIN times t ON gt.time_id = t.id
         WHERE gt.grupo_id = ?
         ORDER BY gt.pontos DESC, gt.vitorias DESC, gt.saldo_gols DESC, gt.gols_pro DESC
         LIMIT 2`, [g.grupo_id]
      );
      resultado.push({ ...g, classificados: times });
    }
    res.json(resultado);
  } catch (err) {
    res.status(500).json({ erro: 'Erro ao buscar classificados' });
  }
});

module.exports = router;
