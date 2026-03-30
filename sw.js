const CACHE_NAME = 'treat-all-trips-v1';
const STATIC_ASSETS = [
  '/treat-all-trips/',
  '/treat-all-trips/index.html',
  '/treat-all-trips/css/main.css',
  '/treat-all-trips/js/supabase-client.js',
  '/treat-all-trips/js/auth.js',
  '/treat-all-trips/icons/icon-192.png',
  '/treat-all-trips/icons/icon-512.png'
];

// 安裝 Service Worker
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(STATIC_ASSETS))
      .then(() => self.skipWaiting())
  );
});

// 啟動時清除舊快取
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys
          .filter(key => key !== CACHE_NAME)
          .map(key => caches.delete(key))
      )
    ).then(() => self.clients.claim())
  );
});

// 攔截網路請求
self.addEventListener('fetch', event => {
  // Supabase API 請求不快取
  if (event.request.url.includes('supabase.co')) {
    return;
  }

  event.respondWith(
    caches.match(event.request)
      .then(cached => {
        if (cached) return cached;
        
        return fetch(event.request)
          .then(response => {
            // 只快取成功的 GET 請求
            if (
              event.request.method === 'GET' &&
              response.status === 200
            ) {
              const clone = response.clone();
              caches.open(CACHE_NAME)
                .then(cache => cache.put(event.request, clone));
            }
            return response;
          })
          .catch(() => {
            // 離線時返回首頁
            if (event.request.mode === 'navigate') {
              return caches.match('/treat-all-trips/index.html');
            }
          });
      })
  );
});
