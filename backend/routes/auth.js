const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { pool } = require('../config/database');
const authMiddleware = require('../middleware/auth');

// Login
router.post('/login', async (req, res) => {
  const { email, senha } = req.body;
  if (!email || !senha) {
    return res.status(400).json({ erro: 'Email e senha são obrigatórios' });
  }

  try {
    const [rows] = await pool.query('SELECT * FROM admins WHERE email = ?', [email]);
    if (rows.length === 0) {
      return res.status(401).json({ erro: 'Credenciais inválidas' });
    }

    const admin = rows[0];
    const senhaOk = await bcrypt.compare(senha, admin.senha);
    if (!senhaOk) {
      return res.status(401).json({ erro: 'Credenciais inválidas' });
    }

    const token = jwt.sign(
      { id: admin.id, email: admin.email, nome: admin.nome },
      process.env.JWT_SECRET,
      { expiresIn: '12h' }
    );

    res.json({ token, admin: { id: admin.id, nome: admin.nome, email: admin.email } });
  } catch (err) {
    res.status(500).json({ erro: 'Erro interno do servidor' });
  }
});

// Registrar admin (rota protegida - só admins existentes podem criar novos)
router.post('/registrar', authMiddleware, async (req, res) => {
  const { nome, email, senha } = req.body;
  if (!nome || !email || !senha) {
    return res.status(400).json({ erro: 'Todos os campos são obrigatórios' });
  }

  try {
    const hash = await bcrypt.hash(senha, 10);
    await pool.query('INSERT INTO admins (nome, email, senha) VALUES (?, ?, ?)', [nome, email, hash]);
    res.json({ mensagem: 'Admin criado com sucesso' });
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') {
      return res.status(400).json({ erro: 'Email já cadastrado' });
    }
    res.status(500).json({ erro: 'Erro interno do servidor' });
  }
});

// Criar primeiro admin (só funciona se não houver nenhum admin)
router.post('/setup', async (req, res) => {
  const { nome, email, senha } = req.body;
  if (!nome || !email || !senha) {
    return res.status(400).json({ erro: 'Todos os campos são obrigatórios' });
  }

  try {
    const [rows] = await pool.query('SELECT COUNT(*) as total FROM admins');
    if (rows[0].total > 0) {
      return res.status(403).json({ erro: 'Setup já realizado. Use o login.' });
    }
    const hash = await bcrypt.hash(senha, 10);
    await pool.query('INSERT INTO admins (nome, email, senha) VALUES (?, ?, ?)', [nome, email, hash]);
    res.json({ mensagem: 'Admin principal criado com sucesso! Faça login.' });
  } catch (err) {
    res.status(500).json({ erro: 'Erro interno do servidor' });
  }
});

// Verificar se setup já foi feito
router.get('/setup-status', async (req, res) => {
  const [rows] = await pool.query('SELECT COUNT(*) as total FROM admins');
  res.json({ precisaSetup: rows[0].total === 0 });
});

// Listar admins (protegido)
router.get('/admins', authMiddleware, async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT id, nome, email, criado_em FROM admins ORDER BY criado_em');
    res.json(rows);
  } catch (err) {
    res.status(500).json({ erro: 'Erro ao buscar admins' });
  }
});

// Criar novo admin (protegido)
router.post('/admins', authMiddleware, async (req, res) => {
  const { nome, email, senha } = req.body;
  if (!nome || !email || !senha) return res.status(400).json({ erro: 'Todos os campos são obrigatórios' });
  if (senha.length < 6) return res.status(400).json({ erro: 'Senha deve ter pelo menos 6 caracteres' });
  try {
    const hash = await bcrypt.hash(senha, 10);
    const [result] = await pool.query('INSERT INTO admins (nome, email, senha) VALUES (?, ?, ?)', [nome, email, hash]);
    res.status(201).json({ id: result.insertId, nome, email });
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') return res.status(400).json({ erro: 'Email já cadastrado' });
    res.status(500).json({ erro: 'Erro ao criar admin' });
  }
});

// Remover admin (protegido — não pode remover a si mesmo)
router.delete('/admins/:id', authMiddleware, async (req, res) => {
  if (String(req.admin.id) === String(req.params.id)) {
    return res.status(400).json({ erro: 'Você não pode remover sua própria conta' });
  }
  try {
    const [rows] = await pool.query('SELECT COUNT(*) as total FROM admins');
    if (rows[0].total <= 1) return res.status(400).json({ erro: 'Deve existir pelo menos 1 administrador' });
    await pool.query('DELETE FROM admins WHERE id = ?', [req.params.id]);
    res.json({ mensagem: 'Admin removido' });
  } catch (err) {
    res.status(500).json({ erro: 'Erro ao remover admin' });
  }
});

module.exports = router;
