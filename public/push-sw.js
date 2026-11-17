// Notificações do lembrete diário. Carregado pelo service worker gerado pelo vite-plugin-pwa
// (workbox.importScripts em vite.config.ts).

self.addEventListener('push', (event) => {
  let data = {}
  try {
    data = event.data ? event.data.json() : {}
  } catch {
    data = { body: event.data ? event.data.text() : '' }
  }
  event.waitUntil(
    self.registration.showNotification(data.title || 'Carteira', {
      body: data.body || '',
      icon: 'pwa-192.png',
      badge: 'pwa-192.png',
      tag: 'carteira-lembrete',
      data: { url: data.url || self.registration.scope },
    }),
  )
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const url = (event.notification.data && event.notification.data.url) || self.registration.scope
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      for (const client of list) {
        if (client.url.startsWith(self.registration.scope) && 'focus' in client) return client.focus()
      }
      return self.clients.openWindow(url)
    }),
  )
})
