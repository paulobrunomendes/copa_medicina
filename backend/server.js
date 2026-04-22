require('dotenv').config({ path: require('path').join(__dirname, '.env') });
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const path = require('path');
const { initDB } = require('./config/database');

const app = express();
const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: process.env.FRONTEND_URL || '*',
    methods: ['GET', 'POST']
  }
});

// Guardar io na app para usar nas rotas
app.set('io', io);

// Middlewares
app.use(cors({ origin: process.env.FRONTEND_URL || '*' }));
app.use(express.json());

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

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Rotas conhecidas do frontend
const frontendRoutes = ['/', '/login.html', '/jogo.html', '/admin', '/admin/'];
app.get('*', (req, res) => {
  const p = req.path;
  if (frontendRoutes.includes(p) || p.startsWith('/admin/') || p.startsWith('/public/')) {
    res.sendFile(path.join(__dirname, '../frontend/index.html'));
  } else {
    res.status(404).sendFile(path.join(__dirname, '../frontend/404.html'));
  }
});

// Socket.IO
io.on('connection', (socket) => {
  console.log(`🔌 Cliente conectado: ${socket.id}`);

  socket.on('entrar_sala', (jogoId) => {
    socket.join(`jogo_${jogoId}`);
  });

  socket.on('sair_sala', (jogoId) => {
    socket.leave(`jogo_${jogoId}`);
  });

  socket.on('disconnect', () => {
    console.log(`❌ Cliente desconectado: ${socket.id}`);
  });
});

// Inicializar banco e subir servidor
const PORT = process.env.PORT || 3001;

initDB().then(() => {
  server.listen(PORT, () => {
    console.log(`\n🏆 Copa Medicina — Servidor rodando!`);
    console.log(`📡 API:      http://localhost:${PORT}/api`);
    console.log(`🌐 Frontend: http://localhost:${PORT}`);
    console.log(`\n⚡ Pressione Ctrl+C para parar\n`);
  });
}).catch(err => {
  console.error('Falha ao iniciar:', err.message);
  process.exit(1);
});
