const express = require('express');
const router = express.Router();
const webpush = require('web-push');
const { pool } = require('../config/database');

webpush.setVapidDetails(
  process.env.VAPID_SUBJECT || 'mailto:admin@copamedicina.com',
  process.env.VAPID_PUBLIC_KEY,
  process.env.VAPID_PRIVATE_KEY
);

// Retorna a chave pública VAPID para o frontend
router.get('/vapid-public-key', (req, res) => {
  res.json({ publicKey: process.env.VAPID_PUBLIC_KEY });
});

// Salvar subscription do dispositivo
router.post('/subscribe', async (req, res) => {
  const { endpoint, keys } = req.body;
  if (!endpoint || !keys?.p256dh || !keys?.auth) {
    return res.status(400).json({ erro: 'Dados de subscription inválidos' });
  }
  try {
    await pool.query(
      `INSERT INTO push_subscriptions (endpoint, p256dh, auth) VALUES (?, ?, ?)
       ON DUPLICATE KEY UPDATE p256dh=VALUES(p256dh), auth=VALUES(auth)`,
      [endpoint, keys.p256dh, keys.auth]
    );
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ erro: 'Erro ao salvar subscription' });
  }
});

// Remover subscription (quando usuário nega permissão)
router.post('/unsubscribe', async (req, res) => {
  const { endpoint } = req.body;
  if (!endpoint) return res.status(400).json({ erro: 'Endpoint obrigatório' });
  try {
    await pool.query('DELETE FROM push_subscriptions WHERE endpoint=?', [endpoint]);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ erro: 'Erro ao remover subscription' });
  }
});

module.exports = router;
module.exports.sendToAll = async function sendToAll(payload) {
  try {
    const [subs] = await pool.query('SELECT * FROM push_subscriptions');
    if (subs.length === 0) return;

    const msg = JSON.stringify(payload);
    const results = await Promise.allSettled(subs.map(sub => {
      const subscription = { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } };
      return webpush.sendNotification(subscription, msg).catch(async err => {
        // 410 Gone = subscription expirada, remover do banco
        if (err.statusCode === 410 || err.statusCode === 404) {
          await pool.query('DELETE FROM push_subscriptions WHERE endpoint=?', [sub.endpoint]);
        }
      });
    }));

    const falhas = results.filter(r => r.status === 'rejected').length;
    if (falhas > 0) console.warn(`Push: ${falhas} notificações falharam`);
  } catch (err) {
    console.error('Erro ao enviar push notifications:', err.message);
  }
};
