// Recebe os avisos de contas mesmo com o app fechado (carregado pelo service worker do PWA).
self.addEventListener('push', event => {
  let d = {}
  try { d = event.data ? event.data.json() : {} } catch { d = { body: event.data ? event.data.text() : '' } }
  event.waitUntil(self.registration.showNotification(d.title || 'Grazi e Jonas', {
    body: d.body || '',
    icon: 'icon-192.png',
    badge: 'icon-192.png',
    tag: d.tag || 'avisos',
    data: { url: d.url || './#dinheiro' },
  }))
})

self.addEventListener('notificationclick', event => {
  event.notification.close()
  const url = new URL((event.notification.data && event.notification.data.url) || './', self.registration.scope).href
  event.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(janelas => {
    for (const j of janelas) {
      if ('focus' in j) { if ('navigate' in j) j.navigate(url); return j.focus() }
    }
    return self.clients.openWindow(url)
  }))
})
