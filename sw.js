// PARTECH — service worker: يستقبل إشعارات push ويعرضها حتى لو المتصفح مسكّر بالكامل
self.addEventListener('install', () => { self.skipWaiting(); });
self.addEventListener('activate', (event) => { event.waitUntil(self.clients.claim()); });

self.addEventListener('push', (event) => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch (e) {}
  const title = data.title || 'بارتك';
  const body = data.body || 'في شي جديد يحتاج انتباهك';
  event.waitUntil(
    self.registration.showNotification(title, {
      body: body,
      icon: 'icon-192.png',
      badge: 'icon-192.png',
      dir: 'rtl',
      lang: 'ar'
    })
  );
});

// الضغط على الإشعار ياخذ المستخدم لسجل الإشعارات نفسه — تبويب مفتوح أصلًا يستقبل رسالة تفتحه
// فورًا بدون إعادة تحميل، وتبويب جديد يفتح بـ?notif=1 (الصفحة نفسها بتفتح السجل بعد تسجيل الدخول)
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients) => {
      for (const client of windowClients) {
        if ('focus' in client) {
          client.postMessage({ type: 'open-activity-log' });
          return client.focus();
        }
      }
      if (self.clients.openWindow) return self.clients.openWindow('./?notif=1');
    })
  );
});
