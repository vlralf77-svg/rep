/* 서비스워커: 앱이 닫혀 있어도 푸시(전화 알림)를 받아 벨(알림)을 띄운다. */
'use strict';

self.addEventListener('install', (e) => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));

self.addEventListener('push', (event) => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch (e) {}
  if (data.type !== 'incoming-call') return;

  const from = data.from || '알 수 없음';
  const title = '📞 ' + from + ' 님의 영상전화';
  const options = {
    body: '전화가 왔어요 — 눌러서 받기',
    icon: 'icon-192.png',
    badge: 'icon-192.png',
    tag: 'incoming-call',
    renotify: true,
    requireInteraction: true, // 사용자가 반응할 때까지 유지
    vibrate: [600, 300, 600, 300, 600],
    data: { from: from },
    actions: [
      { action: 'accept', title: '받기' },
      { action: 'decline', title: '거절' },
    ],
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  if (event.action === 'decline') return;

  const from = (event.notification.data && event.notification.data.from) || '';
  const url = 'phone.html?answer=' + encodeURIComponent(from);
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      // 이미 열린 창이 있으면 그쪽으로 신호 보내고 포커스
      for (const client of list) {
        if ('focus' in client) {
          client.postMessage({ type: 'answer-call', from: from });
          return client.focus();
        }
      }
      // 없으면 새 창 열기
      if (self.clients.openWindow) return self.clients.openWindow(url);
    })
  );
});
