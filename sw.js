/*
  Ducky Management Pro - Service Worker
  Phase 4D CSS bundle hotfix:
  - Avoid background revalidating every static file on each page open.
  - Do not serve stale HTML while developing on localhost/127.0.0.1.
  - Remove old ducky caches from earlier service worker versions.
  - GAS / Apps Script requests stay network-only.
*/

const DUCKY_SW_VERSION = 'phase4d-css-bundle-v2026-05-21-01';
const STATIC_CACHE = `ducky-static-${DUCKY_SW_VERSION}`;
const HTML_CACHE = `ducky-html-${DUCKY_SW_VERSION}`;
const RUNTIME_CACHE = `ducky-runtime-${DUCKY_SW_VERSION}`;

const STATIC_EXT_RE = /\.(?:js|css|png|jpg|jpeg|webp|gif|svg|ico|json|woff2?|ttf|otf)$/i;
const API_HOST_RE = /(?:script\.google\.com|script\.googleusercontent\.com)$/i;

function isApiUrl(url) {
  return API_HOST_RE.test(url.hostname);
}

function isHttp(url) {
  return url.protocol === 'http:' || url.protocol === 'https:';
}

function isSameOrigin(url) {
  return url.origin === self.location.origin;
}

function isLocalDev() {
  return self.location.hostname === 'localhost' || self.location.hostname === '127.0.0.1';
}

function isStaticAsset(request, url) {
  if (request.method !== 'GET') return false;
  if (request.destination && ['script', 'style', 'image', 'font', 'manifest'].includes(request.destination)) return true;
  return STATIC_EXT_RE.test(url.pathname);
}

async function cacheFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  if (cached) return cached;

  const response = await fetch(request);
  if (response && (response.ok || response.type === 'opaque')) {
    try { await cache.put(request, response.clone()); } catch (_) {}
  }
  return response;
}

async function networkFirstHtml(request) {
  // In local development, always use the latest HTML. This prevents old, cached
  // HTML from still referencing unbundled JS after running the bundle rewrite.
  if (isLocalDev()) {
    return fetch(request, { cache: 'no-store' });
  }

  const cache = await caches.open(HTML_CACHE);
  try {
    const response = await fetch(request, { cache: 'no-cache' });
    if (response && response.ok) {
      try { await cache.put(request, response.clone()); } catch (_) {}
    }
    return response;
  } catch (error) {
    const cached = await cache.match(request);
    if (cached) return cached;
    throw error;
  }
}

self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(Promise.all([
    caches.open(STATIC_CACHE),
    caches.open(HTML_CACHE),
    caches.open(RUNTIME_CACHE)
  ]));
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const names = await caches.keys();
    await Promise.all(
      names
        .filter((name) => name.startsWith('ducky-') && ![STATIC_CACHE, HTML_CACHE, RUNTIME_CACHE].includes(name))
        .map((name) => caches.delete(name))
    );
    await self.clients.claim();
  })());
});

self.addEventListener('message', (event) => {
  const data = event.data || {};
  if (data.type === 'SKIP_WAITING') {
    self.skipWaiting();
    return;
  }
  if (data.type === 'CLEAR_DUCKY_CACHE') {
    event.waitUntil((async () => {
      const names = await caches.keys();
      await Promise.all(names.filter((name) => name.startsWith('ducky-')).map((name) => caches.delete(name)));
    })());
  }
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (!request || request.method !== 'GET') return;

  let url;
  try { url = new URL(request.url); } catch (_) { return; }
  if (!isHttp(url)) return;

  // Apps Script/API must never be cached by service worker.
  if (isApiUrl(url)) return;

  if (request.mode === 'navigate' || /\.html$/i.test(url.pathname)) {
    event.respondWith(networkFirstHtml(request));
    return;
  }

  if (isStaticAsset(request, url)) {
    event.respondWith(cacheFirst(request, isSameOrigin(url) ? STATIC_CACHE : RUNTIME_CACHE));
  }
});
