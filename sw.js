// PARTECH — service worker: (1) يستقبل إشعارات push ويعرضها حتى لو المتصفح مسكّر بالكامل،
// (2) يحفظ نسخة من هيكل التطبيق (app shell) ليفتح فورًا بدل شاشة فاضية لما الشبكة تعلّق.
//
// ليش الجزء الثاني: الآيفون بيقتل عملية الويب لأي PWA مثبّتة وهي بالخلفية (ضغط ذاكرة)، ولما
// المستخدم يرجع يفتحها بيعيد التنقّل للرابط من جديد. لو هالطلب علّق (الراديو لسه نايم / شبكة
// ضعيفة) — وهذا بالضبط وضع الجهاز لحظة الرجوع — الآيفون ما بيعرض أي صفحة خطأ، بيعرض شاشة
// فاضية تمامًا بلا شريط عنوان ولا زر تحديث، فالمستخدم عالق لحد ما يطلّع التطبيق من قائمة
// التطبيقات المفتوحة ويفتحه من جديد. مع هالملف، أي تنقّل بياخذ النسخة المحفوظة خلال ثوانٍ
// معدودة بدل ما يضل معلّق — فالتطبيق يفتح دايمًا.
//
// الاستراتيجية: الشبكة أولًا (network-first) — مو الكاش أولًا. يعني المستخدم المتصل عادي
// بياخذ دايمًا آخر نسخة منشورة، والكاش مجرد شبكة أمان لما الشبكة تفشل أو تتأخر. هذا مهم لأن
// النشر متكرر والتحديث لازم يوصل بدون أي خطوة من المستخدم.

const SHELL_CACHE = 'partech-shell-v1';
const SHELL_URLS = [
  './',
  './index.html',
  './manifest.json',
  './icon-192-v2.png',
  './icon-512-v2.png',
  './logo.png'
];
// مهلة انتظار الشبكة قبل ما نرجع للنسخة المحفوظة. لازم تكون أطول من تحميل الصفحة على شبكة
// جوال بطيئة (الملف ~150KB مضغوط) وبنفس الوقت أقصر بكتير من صبر المستخدم على شاشة فاضية.
const NETWORK_TIMEOUT_MS = 6000;

self.addEventListener('install', (event) => {
  self.skipWaiting();
  // فشل أي ملف من القائمة ما لازم يفشّل التنصيب كله — addAll ذرّية (كلها أو ولا وحدة)،
  // فمنحفظ كل واحد لحاله ومنتجاهل يلي يفشل.
  event.waitUntil(
    caches.open(SHELL_CACHE).then((cache) =>
      Promise.all(SHELL_URLS.map((url) => cache.add(url).catch(() => {})))
    )
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => k !== SHELL_CACHE).map((k) => caches.delete(k)));
    await self.clients.claim();
  })());
});

function fetchWithTimeout(request, ms) {
  return new Promise((resolve, reject) => {
    const controller = new AbortController();
    const timer = setTimeout(() => { controller.abort(); reject(new Error('timeout')); }, ms);
    // cache:'no-store' حتى ما ياخذ نسخة قديمة من كاش المتصفح نفسه بدل ما يسأل الخادم فعليًا
    fetch(request, { signal: controller.signal, cache: 'no-store' })
      .then((res) => { clearTimeout(timer); resolve(res); })
      .catch((err) => { clearTimeout(timer); reject(err); });
  });
}

// صفحة أخيرة لما ما يكون في لا شبكة ولا نسخة محفوظة — أي شي أفضل من شاشة فاضية بلا أي تفسير
function offlineFallbackResponse() {
  return new Response(
    '<!DOCTYPE html><html lang="ar" dir="rtl"><head><meta charset="UTF-8">' +
    '<meta name="viewport" content="width=device-width,initial-scale=1">' +
    '<title>تتبع القطع · بارتك</title></head>' +
    '<body style="margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;' +
    'background:#0E1210;color:#EEF1ED;font-family:system-ui,sans-serif;padding:20px;text-align:center;">' +
    '<div><div style="font-size:40px;margin-bottom:14px;">📶</div>' +
    '<div style="font-size:17px;font-weight:800;margin-bottom:10px;">تعذر تحميل التطبيق</div>' +
    '<div style="color:#9CA89F;font-size:13px;line-height:1.7;margin-bottom:18px;">تحقق من اتصال الإنترنت وحاول مرة ثانية.</div>' +
    '<button onclick="location.reload()" style="background:#22D07A;color:#06170F;border:0;border-radius:10px;' +
    'padding:12px 22px;font-size:15px;font-weight:700;">إعادة المحاولة</button></div></body></html>',
    { status: 200, headers: { 'Content-Type': 'text/html; charset=utf-8' } }
  );
}

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;

  let url;
  try { url = new URL(request.url); } catch (e) { return; }

  // أي شي خارج نطاق الموقع نفسه (Supabase، jsdelivr، خطوط جوجل) ما نلمسه إطلاقًا — نتركه
  // يمر عادي للمتصفح. اعتراض نداءات Supabase تحديدًا خطر: بيانات حيّة ما يجوز تُخدم من كاش.
  if (url.origin !== self.location.origin) return;
  // ملف الـservice worker نفسه لازم يوصل من الشبكة دايمًا حتى يقدر يتحدّث
  if (url.pathname.endsWith('/sw.js')) return;

  event.respondWith(handleSameOriginGet(request));
});

async function handleSameOriginGet(request) {
  const cache = await caches.open(SHELL_CACHE);

  try {
    const fresh = await fetchWithTimeout(request, NETWORK_TIMEOUT_MS);
    // 200 عادي بس (مو 206 جزئي ولا رد من نطاق تاني) — غير هيك الكاش بيتخزّن فيه رد ناقص
    if (fresh && fresh.status === 200 && fresh.type === 'basic') {
      cache.put(request, fresh.clone()).catch(() => {});
    }
    return fresh;
  } catch (e) {
    // الشبكة فشلت أو تأخرت — نخدم النسخة المحفوظة فورًا، وبنفس الوقت نكمّل طلب الشبكة
    // بالخلفية بلا مهلة حتى تنحدّث النسخة المحفوظة وتكون الفتحة الجاية بآخر إصدار.
    revalidateInBackground(request, cache);

    const cached = await cache.match(request);
    if (cached) return cached;

    // تنقّل لصفحة (فتح التطبيق) — أي رابط داخل النطاق بيرجع لنفس الصفحة الوحيدة
    if (request.mode === 'navigate') {
      const shell = (await cache.match('./index.html')) || (await cache.match('./'));
      if (shell) return shell;
      return offlineFallbackResponse();
    }

    return Response.error();
  }
}

function revalidateInBackground(request, cache) {
  fetch(request, { cache: 'no-store' })
    .then((res) => {
      if (res && res.status === 200 && res.type === 'basic') cache.put(request, res.clone()).catch(() => {});
    })
    .catch(() => {});
}

self.addEventListener('push', (event) => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch (e) {}
  const title = data.title || 'بارتك';
  const body = data.body || 'في شي جديد يحتاج انتباهك';
  event.waitUntil(
    self.registration.showNotification(title, {
      body: body,
      icon: 'icon-192-v2.png',
      badge: 'icon-192-v2.png',
      dir: 'rtl',
      lang: 'ar',
      vibrate: [200, 100, 200, 100, 200], // بدون هذا بعض أجهزة أندرويد تعرض الإشعار بصمت تام بلا رنة ولا اهتزاز
      requireInteraction: false
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
