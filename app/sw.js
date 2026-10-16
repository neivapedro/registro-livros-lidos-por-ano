// Service worker: guarda o app no celular para abrir rápido e funcionar offline.
// Ao publicar uma versão nova, aumente VERSION para os aparelhos baixarem os arquivos novos.

const VERSION = 'v1.2.0';
const CACHE = `leituras-${VERSION}`;

const SHELL = [
  './',
  './index.html',
  './manifest.webmanifest',
  './css/app.css',
  './js/main.js',
  './js/books-api.js',
  './js/cover-photo.js',
  './js/dates.js',
  './js/share-image.js',
  './js/stats.js',
  './js/store.js',
  './js/ui.js',
  './js/views/alltime.js',
  './js/views/form.js',
  './js/views/home.js',
  './js/views/retro.js',
  './js/views/search.js',
  './js/views/settings.js',
  './js/views/shelf.js',
  './js/views/summary.js',
  './fonts/instrument-serif.woff2',
  './fonts/instrument-serif-italic.woff2',
  './fonts/manrope.woff2',
  './icons/favicon.svg',
  './icons/apple-touch-icon.png',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-512.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(SHELL.map((u) => new Request(u, { cache: 'reload' })))).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('leituras-') && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

// Arquivos do app: responde do cache e atualiza em segundo plano.
// Busca de livros e capas: sempre pela rede (o navegador já guarda as capas).
self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  event.respondWith(
    caches.open(CACHE).then(async (cache) => {
      const cached = await cache.match(request, { ignoreSearch: request.mode === 'navigate' });
      const network = fetch(request)
        .then((response) => {
          if (response.ok) cache.put(request, response.clone());
          return response;
        })
        .catch(() => null);
      if (cached) {
        event.waitUntil(network);
        return cached;
      }
      const response = await network;
      return response || (request.mode === 'navigate' ? cache.match('./index.html') : Response.error());
    }),
  );
});
