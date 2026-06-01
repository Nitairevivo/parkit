const CACHE = 'parkit-v1';
const ASSETS = [
  '/parkit/',
  '/parkit/index.html',
  '/parkit/style.css',
  '/parkit/app.js',
  '/parkit/data.js',
  '/parkit/manifest.json',
  '/parkit/icon-192.png',
  '/parkit/icon-512.png',
  'https://fonts.googleapis.com/css2?family=Heebo:wght@300;400;500;600;700;800;900&display=swap',
  'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css',
  'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js'
];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  // Map tiles — network first (always fresh)
  if (e.request.url.includes('tile.openstreetmap') || e.request.url.includes('cartocdn')) {
    e.respondWith(
      fetch(e.request).catch(() => caches.match(e.request))
    );
    return;
  }
  // Everything else — cache first
  e.respondWith(
    caches.match(e.request).then(cached => cached || fetch(e.request))
  );
});
