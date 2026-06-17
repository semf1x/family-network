self.addEventListener('push', function (event) {
  if (!event.data) return
  const data = event.data.json()
  event.waitUntil(
    self.registration.showNotification(data.title || 'Семейная сеть', {
      body: data.body || 'Новое сообщение',
      data: { url: data.url || '/chats' },
      vibrate: [200, 100, 200],
    })
  )
})

self.addEventListener('notificationclick', function (event) {
  event.notification.close()
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function (list) {
      for (const client of list) {
        if ('focus' in client) return client.focus()
      }
      if (clients.openWindow) return clients.openWindow(event.notification.data?.url || '/chats')
    })
  )
})
