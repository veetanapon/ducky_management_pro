const CACHE_NAME = 'ducky-20260813-095048';

/* Ducky Management Pro service worker
   Strategy:
   - HTML / JS / CSS: network-first to avoid stale UI after deploy
   - images/assets/fonts: cache-first for fast repeat loads
   - GAS/API requests are never cached
*/
const SW_VERSION = 'ducky-v26-dynamic-line-bot-20260611-01';
const STATIC_CACHE = `${SW_VERSION}:static`;
const RUNTIME_CACHE = `${SW_VERSION}:runtime`;
const SAME_ORIGIN = self.location.origin;

self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(caches.open(STATIC_CACHE));
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(
      keys
        .filter((key) => key.startsWith('ducky-sw-') && !key.startsWith(SW_VERSION))
        .map((key) => caches.delete(key))
    );
    await self.clients.claim();
  })());
});

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') self.skipWaiting();
  if (event.data && event.data.type === 'CLEAR_CACHES') {
    event.waitUntil((async () => {
      const keys = await caches.keys();
      await Promise.all(keys.map((key) => caches.delete(key)));
    })());
  }
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  if (url.origin !== SAME_ORIGIN) return;
  if (url.pathname.includes('/exec') || url.hostname.includes('script.google.com')) return;

  if (isHtmlRequest(req, url) || isUiAsset(url)) {
    event.respondWith(networkFirst(req));
    return;
  }

  if (isStaticAsset(url)) {
    event.respondWith(cacheFirst(req));
  }
});

function isHtmlRequest(req, url) {
  return req.mode === 'navigate' || url.pathname.endsWith('.html') || url.pathname === '/' || url.pathname === '';
}

function isUiAsset(url) {
  return url.pathname.endsWith('.js') || url.pathname.endsWith('.css') || url.pathname.endsWith('.json');
}

function isStaticAsset(url) {
  return /\.(png|jpg|jpeg|webp|gif|svg|ico|woff2?|ttf|otf)$/i.test(url.pathname);
}

async function networkFirst(req) {
  const cache = await caches.open(RUNTIME_CACHE);
  try {
    const fresh = await fetch(req, { cache: 'no-store' });
    if (fresh && fresh.ok) await cache.put(req, fresh.clone());
    return fresh;
  } catch (error) {
    const cached = await cache.match(req);
    if (cached) return cached;
    throw error;
  }
}

async function cacheFirst(req) {
  const cache = await caches.open(STATIC_CACHE);
  const cached = await cache.match(req);
  if (cached) return cached;
  const fresh = await fetch(req);
  if (fresh && fresh.ok) await cache.put(req, fresh.clone());
  return fresh;
}
