// 瑜的工作台 Service Worker —— 离线缓存 App Shell（已去除 Tailwind CDN 依赖）
const CACHE = 'yu-workbench-v19';
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

  // 每日数据 daily.json / 历史归档 history/ 分日文件 / 真实爆款 archive.json：纯透传（不缓存，避免返回旧版导致每天内容看起来没更新）
  // 离线时这些文件拿不到，但页面有内联 daily.json + localStorage yu_daily 兜底
  if (url.includes('daily.json') || url.includes('/history/') || url.includes('archive.json')) {
    e.respondWith(fetch(req));
    return;
  }

  // 同源静态资源（app.js 内联在 index.html 中，这里兜底处理任何同源 GET）：网络优先，断网时回退缓存
  if (url.startsWith(self.location.origin)) {
    e.respondWith(
      fetch(req)
        .then((res) => {
          if (res && (res.ok || res.type === 'opaqueredirect')) {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {});
          }
          return res;
        })
        .catch(() => caches.match(req, { ignoreSearch: true }))
    );
    return;
  }

  // 跨域资源（如第三方字体/图标）：缓存优先，缺失则网络并写入缓存
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
          if (req.url.includes('icon.svg')) {
            return new Response('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><rect width="32" height="32" rx="8" fill="#ec4899"/><text x="16" y="22" font-size="18" text-anchor="middle" fill="#fff" font-family="sans-serif">瑜</text></svg>', { headers: { 'Content-Type': 'image/svg+xml' } });
          }
        });
    })
  );
});
