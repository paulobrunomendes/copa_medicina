/* Service Worker — Copa Med Horus */
const CACHE_NAME = 'copa-horus-v2';

const SHELL = [
  '/',
  '/placares.html',
  '/noticias.html',
  '/regulamento.html',
  '/parceiros.html',
  '/loja.html',
  '/public/css/style.css',
  '/public/js/app.js',
  '/public/manifest.json',
  '/public/favicon-192.png',
  '/public/favicon-512.png',
  '/public/logo-icon.png',
];

// Instala e cacheia o shell do app
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(SHELL))
  );
  self.skipWaiting();
});

// Remove caches antigos
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// Estratégia: API = network-first | Estáticos = cache-first
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Ignora requisições não-GET e de outras origens
  if (event.request.method !== 'GET' || url.origin !== self.location.origin) return;

  // API: sempre tenta rede, cai no cache se offline
  if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/socket.io/')) {
    event.respondWith(
      fetch(event.request).catch(() => caches.match(event.request))
    );
    return;
  }

  // Estáticos: cache-first, atualiza cache em background
  event.respondWith(
    caches.match(event.request).then(cached => {
      const fetchPromise = fetch(event.request).then(response => {
        if (response && response.status === 200) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
        }
        return response;
      });
      return cached || fetchPromise;
    })
  );
});

// Push notifications
self.addEventListener('push', (event) => {
  let data = { title: '🏆 Copa Med Horus', body: 'Atualização do jogo!' };
  try { if (event.data) data = event.data.json(); } catch (_) {}
  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: data.icon || '/public/favicon-192.png',
      badge: '/public/favicon.png',
      vibrate: [200, 100, 200, 100, 200],
      tag: data.tag || 'copa-horus',
      renotify: true,
      data: { url: data.url || '/placares.html' },
    })
  );
});

// Clique na notificação
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = event.notification.data?.url || '/placares.html';
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
      for (const client of list) {
        if (client.url.includes(self.location.origin) && 'focus' in client) {
          client.navigate(url);
          return client.focus();
        }
      }
      return clients.openWindow(url);
    })
  );
});
