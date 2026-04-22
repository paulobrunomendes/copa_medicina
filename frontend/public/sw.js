/* Service Worker — Copa Universitária */
const CACHE = 'copa-medicina-v1';

// Recebe push notification do servidor
self.addEventListener('push', (event) => {
  let data = { title: '⚽ Copa Universitária', body: 'Atualização do jogo!' };
  try {
    if (event.data) data = event.data.json();
  } catch (_) {}

  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: data.icon || '/public/favicon.png',
      badge: '/public/favicon.png',
      vibrate: [200, 100, 200, 100, 200],
      tag: data.tag || 'copa-medicina',
      renotify: true,
      data: { url: data.url || '/' },
    })
  );
});

// Clique na notificação → abre o jogo
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = event.notification.data?.url || '/';
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
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
