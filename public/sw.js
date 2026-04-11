// public/sw.js
// Service Worker - キャッシュなし（常に最新を取得）

// インストール時: 即座にアクティベート
self.addEventListener('install', () => self.skipWaiting());

// アクティベート時: 全キャッシュ削除して即座にクライアントを制御
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.map((k) => caches.delete(k))))
  );
  self.clients.claim();
});

// フェッチ時: 常にネットワークから取得（キャッシュ一切使わない）
self.addEventListener('fetch', (event) => {
  event.respondWith(fetch(event.request));
});
