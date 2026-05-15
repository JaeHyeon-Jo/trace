const CACHE = 'dday-v2';
const ASSETS = [
  './',
  './index.html',
  './styles.css',
  './manifest.webmanifest',
  './icon.svg',
  './modules/app.js',
  './modules/state.js',
  './modules/helpers.js',
  './modules/topbar.js',
  './modules/modal.js',
  './modules/toast.js',
  './modules/ai.js',
  './modules/views/dashboard.js',
  './modules/views/list.js',
  './modules/views/tagged.js',
  './modules/views/timeline.js',
  './modules/views/calendar.js',
  'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap',
];

// sync.js and firebase-config.js are intentionally not preloaded — they are
// optional. If present they get cached on first fetch (stale-while-revalidate);
// if absent the app still installs cleanly.

// Firebase realtime endpoints must hit the network — never serve from cache.
const FIREBASE_HOSTS = [
  'firestore.googleapis.com',
  'identitytoolkit.googleapis.com',
  'securetoken.googleapis.com',
  'firebaseinstallations.googleapis.com',
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(ASSETS)));
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// Stale-while-revalidate: serve cached immediately, refresh cache in background.
// Future deploys propagate on the next visit without manual cache busting.
self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  if (FIREBASE_HOSTS.some((host) => url.hostname.endsWith(host))) return;
  event.respondWith(
    caches.open(CACHE).then(async (cache) => {
      const cached = await cache.match(event.request);
      const network = fetch(event.request)
        .then((response) => {
          if (response && response.ok) cache.put(event.request, response.clone());
          return response;
        })
        .catch(() => cached);
      return cached || network;
    })
  );
});
