// 瑜的工作台 Service Worker —— 离线缓存 App Shell（已去除 Tailwind CDN 依赖）
const CACHE = 'yu-workbench-v3';
const ASSETS = [
  './',
  './index.html',
  './manifest.webmanifest',
  './icon.svg'
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE).then((c) => c.addAll(ASSETS)).catch(() => {})
  );
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = req.url;

  // 导航请求：永远优先网络（保证 index.html 永远是最新版，按钮逻辑不被旧缓存卡住），失败回退缓存首页
  if (req.mode === 'navigate') {
    e.respondWith(
      fetch(req).then((res) => {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put('./index.html', copy)).catch(() => {});
        return res;
      }).catch(() => caches.match('./index.html'))
    );
    return;
  }

  // 每日数据 daily.json：网络优先（保证每天自动刷新生效），失败才用缓存兜底
  if (url.includes('daily.json')) {
    e.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {});
          return res;
        })
        .catch(() => caches.match(req))
    );
    return;
  }

  // 历史归档 history.json / 真实爆款 archive.json：网络优先（保证每天新增的历史与爆款立即生效），失败才回退缓存
  if (url.includes('history.json') || url.includes('archive.json')) {
    e.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {});
          return res;
        })
        .catch(() => caches.match(req))
    );
    return;
  }

  // 静态资源（icon / manifest）：缓存优先，缺失则网络并写入缓存
  e.respondWith(
    caches.match(req).then((hit) => {
      if (hit) return hit;
      return fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {});
          return res;
        })
        .catch(() => {
          // 图标离线兜底
          if (req.url.includes('icon.svg')) {
            return new Response('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><rect width="32" height="32" rx="8" fill="#ec4899"/><text x="16" y="22" font-size="18" text-anchor="middle" fill="#fff" font-family="sans-serif">瑜</text></svg>', { headers: { 'Content-Type': 'image/svg+xml' } });
          }
        });
    })
  );
});
