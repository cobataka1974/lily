// public/sw.js
// Service Worker - 最小限のオフライン対応

const CACHE_NAME = 'lily-v1';
const OFFLINE_URL = '/';

// インストール時: オフライン用にルートページをキャッシュ
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll([OFFLINE_URL]);
    })
  );
  self.skipWaiting();
});

// アクティベート時: 古いキャッシュを削除
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key !== CACHE_NAME)
          .map((key) => caches.delete(key))
      )
    )
  );
  self.clients.claim();
});

// フェッチ時: ネットワーク優先、失敗したらキャッシュを返す
self.addEventListener('fetch', (event) => {
  // API リクエストはキャッシュしない
  if (event.request.url.includes('/api/')) return;

  event.respondWith(
    fetch(event.request).catch(() => {
      return caches.match(OFFLINE_URL);
    })
  );
});
