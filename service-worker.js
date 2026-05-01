/* ============================================================
   SUNAFIL Inspector PWA — Service Worker
   Cache-First para assets estáticos · Network-First para API
   ============================================================ */

const CACHE_NAME = 'sunafil-rgi-v1.2';
const OFFLINE_URL = './index.html';

const STATIC_ASSETS = [
  './index.html',
  './manifest.json',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon.svg',
];

/* ── INSTALL: pre-cachear todos los assets ── */
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      return cache.addAll(STATIC_ASSETS);
    }).then(() => self.skipWaiting())
  );
});

/* ── ACTIVATE: limpiar caches antiguas ── */
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

/* ── FETCH: Cache-First para HTML/CSS/JS/imágenes ── */
self.addEventListener('fetch', event => {
  const { request } = event;
  const url = new URL(request.url);

  // No interceptar peticiones a la Anthropic API (necesitan red)
  if (url.hostname === 'api.anthropic.com') {
    event.respondWith(
      fetch(request).catch(() => new Response(
        JSON.stringify({ error: 'Sin conexión. Conecte a internet para analizar observaciones.' }),
        { headers: { 'Content-Type': 'application/json' } }
      ))
    );
    return;
  }

  // Para assets estáticos: Cache-First con fallback a red
  if (request.method === 'GET') {
    event.respondWith(
      caches.match(request).then(cached => {
        if (cached) return cached;
        return fetch(request).then(response => {
          // Cachear respuestas válidas
          if (response && response.status === 200 && response.type === 'basic') {
            const clone = response.clone();
            caches.open(CACHE_NAME).then(cache => cache.put(request, clone));
          }
          return response;
        }).catch(() => {
          // Si falla red y es navegación, devolver offline page
          if (request.mode === 'navigate') {
            return caches.match(OFFLINE_URL);
          }
        });
      })
    );
  }
});

/* ── SYNC: cuando vuelve la conexión, notificar al cliente ── */
self.addEventListener('sync', event => {
  if (event.tag === 'sync-observations') {
    self.clients.matchAll().then(clients =>
      clients.forEach(c => c.postMessage({ type: 'ONLINE' }))
    );
  }
});

/* ── MENSAJE desde el cliente ── */
self.addEventListener('message', event => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
