require('dotenv').config({ path: require('path').join(__dirname, '.env') });
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const { initDB, pool } = require('./config/database');

const app = express();
const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: process.env.FRONTEND_URL || '*',
    methods: ['GET', 'POST']
  }
});

// ===== ERROR LOG =====
const logDir = path.join(__dirname, 'logs');
if (!fs.existsSync(logDir)) fs.mkdirSync(logDir);
const logFile = path.join(logDir, 'errors.log');

function logErro(context, err) {
  const line = `[${new Date().toISOString()}] ${context}: ${err?.message || err}\n`;
  fs.appendFile(logFile, line, () => {});
}

const _origError = console.error.bind(console);
console.error = (...args) => {
  _origError(...args);
  const msg = args.map(a => (a instanceof Error ? a.stack : String(a))).join(' ');
  fs.appendFile(logFile, `[${new Date().toISOString()}] ${msg}\n`, () => {});
};

// Guardar io na app para usar nas rotas
app.set('io', io);

// Middlewares
app.use(cors({ origin: process.env.FRONTEND_URL || '*' }));
app.use(express.json());

// ===== OG TAGS DINÂMICAS para jogo.html =====
app.get('/jogo.html', async (req, res) => {
  const id = req.query.id;
  let html = fs.readFileSync(path.join(__dirname, '../frontend/jogo.html'), 'utf8');

  if (id) {
    try {
      const [[j]] = await pool.query(`
        SELECT j.gols_casa, j.gols_visitante, j.status,
               tc.nome as cn, tc.sigla as cs,
               tv.nome as vn, tv.sigla as vs,
               m.nome as mn, m.icone as mi
        FROM jogos j
        JOIN times tc ON j.time_casa_id=tc.id
        JOIN times tv ON j.time_visitante_id=tv.id
        JOIN modalidades m ON j.modalidade_id=m.id
        WHERE j.id=?`, [id]);

      if (j) {
        const placar = j.status === 'agendado' ? 'Agendado' : `${j.gols_casa} × ${j.gols_visitante}`;
        const title  = `${j.cs} ${placar} ${j.vs} — ${j.mi} ${j.mn} | Copa Med Horus`;
        const desc   = j.status === 'agendado'
          ? `${j.cn} × ${j.vn} — ${j.mn} | Copa Med Horus`
          : `${j.cn} ${j.gols_casa} × ${j.gols_visitante} ${j.vn} — ${j.mn} | Copa Med Horus`;
        const url    = `${process.env.FRONTEND_URL || 'http://localhost:3001'}/jogo.html?id=${id}`;

        const ogTags = `
  <meta property="og:type" content="website">
  <meta property="og:title" content="${title}">
  <meta property="og:description" content="${desc}">
  <meta property="og:url" content="${url}">
  <meta property="og:image" content="${process.env.FRONTEND_URL || 'http://localhost:3001'}/public/logo-copa.png">
  <meta property="og:site_name" content="Copa Med Horus">
  <meta name="twitter:card" content="summary">
  <meta name="twitter:title" content="${title}">
  <meta name="twitter:description" content="${desc}">`;

        html = html.replace('<meta name="theme-color"', ogTags + '\n  <meta name="theme-color"');
        html = html.replace(/<title>.*?<\/title>/, `<title>${title}</title>`);
      }
    } catch(e) { logErro('OG tags', e); }
  }

  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.send(html);
});

// Servir frontend estático
app.use(express.static(path.join(__dirname, '../frontend')));

// Rotas da API
app.use('/api/auth', require('./routes/auth'));
app.use('/api/times', require('./routes/times'));
app.use('/api/grupos', require('./routes/grupos'));
app.use('/api/jogos', require('./routes/jogos'));
app.use('/api/modalidades', require('./routes/modalidades'));
app.use('/api/artilheiros', require('./routes/artilheiros'));
app.use('/api/push', require('./routes/push'));
app.use('/api/stats', require('./routes/stats'));
app.use('/api/exportar', require('./routes/exportar'));
app.use('/api/parceiros', require('./routes/parceiros'));
app.use('/api/produtos', require('./routes/produtos'));
app.use('/api/noticias', require('./routes/noticias'));
app.use('/api/config', require('./routes/config'));

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// SPA fallback
app.get('*', (req, res) => {
  const p = req.path;
  if (p === '/admin' || p.startsWith('/admin/')) {
    return res.sendFile(path.join(__dirname, '../frontend/admin/index.html'));
  }
  res.status(404).sendFile(path.join(__dirname, '../frontend/404.html'));
});

// Express error handler
app.use((err, req, res, next) => {
  logErro(`${req.method} ${req.path}`, err);
  res.status(500).json({ erro: 'Erro interno do servidor' });
});

// Socket.IO
io.on('connection', (socket) => {
  console.log(`🔌 Cliente conectado: ${socket.id}`);
  socket.on('entrar_sala', (jogoId) => socket.join(`jogo_${jogoId}`));
  socket.on('sair_sala',   (jogoId) => socket.leave(`jogo_${jogoId}`));
  socket.on('disconnect', () => console.log(`❌ Cliente desconectado: ${socket.id}`));
});

// Inicializar banco e subir servidor
const PORT = process.env.PORT || 3001;

initDB().then(() => {
  server.listen(PORT, () => {
    console.log(`\n🏆 Copa Medicina — Servidor rodando!`);
    console.log(`📡 API:      http://localhost:${PORT}/api`);
    console.log(`🌐 Frontend: http://localhost:${PORT}`);
    console.log(`📋 Logs:     ${logFile}`);
    console.log(`\n⚡ Pressione Ctrl+C para parar\n`);
  });
}).catch(err => {
  console.error('Falha ao iniciar:', err.message);
  process.exit(1);
});
