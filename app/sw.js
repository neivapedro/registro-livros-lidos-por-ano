// Service worker: guarda o app no celular para abrir rápido e funcionar offline.
// Ao publicar uma versão nova, aumente VERSION para os aparelhos baixarem os arquivos novos.

const VERSION = 'v1.4.1';
const CACHE = `leituras-${VERSION}`;

const SHELL = [
  './',
  './index.html',
  './manifest.webmanifest',
  './css/app.css',
  './js/main.js',
  './js/csv.js',
  './js/pace.js',
  './js/prefs.js',
  './js/series.js',
  './js/tags.js',
  './js/upnext.js',
  './js/books-api.js',
  './js/cover-color.js',
  './js/sheet.js',
  './js/longpress.js',
  './js/swipe.js',
  './js/motion.js',
  './js/calendar.js',
  './js/charts.js',
  './js/cover-photo.js',
  './js/dates.js',
  './js/db.js',
  './js/diary.js',
  './js/journal.js',
  './js/quote-image.js',
  './js/quotes.js',
  './js/reading-days.js',
  './js/rescue.js',
  './js/timer.js',
  './js/timer-stats.js',
  './js/milestones.js',
  './js/retro-stats.js',
  './js/share-image.js',
  './js/stats.js',
  './js/trend.js',
  './js/store.js',
  './js/ui.js',
  './js/theme.js',
  './js/large-title.js',
  './js/views/all-quotes.js',
  './js/views/alltime.js',
  './js/views/kpi.js',
  './js/views/scurve.js',
  './js/views/book-detail.js',
  './js/views/book-tabs.js',
  './js/views/calendar.js',
  './js/views/charts.js',
  './js/views/form.js',
  './js/views/home.js',
  './js/views/marcos.js',
  './js/views/retro.js',
  './js/views/rhythm.js',
  './js/views/search.js',
  './js/views/settings.js',
  './js/views/sheets.js',
  './js/views/shelf.js',
  './js/views/summary.js',
  './js/views/timer.js',
  './fonts/instrument-serif.woff2',
  './fonts/instrument-serif-italic.woff2',
  './fonts/manrope.woff2',
  './icons/favicon.svg',
  './icons/apple-touch-icon.png',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-512.png',
  './icons/splash-claro-1125x2436.png',
  './icons/splash-claro-1170x2532.png',
  './icons/splash-claro-1179x2556.png',
  './icons/splash-claro-1206x2622.png',
  './icons/splash-claro-1242x2688.png',
  './icons/splash-claro-1260x2736.png',
  './icons/splash-claro-1284x2778.png',
  './icons/splash-claro-1290x2796.png',
  './icons/splash-claro-1320x2868.png',
  './icons/splash-claro-750x1334.png',
  './icons/splash-claro-828x1792.png',
  './icons/splash-escuro-1125x2436.png',
  './icons/splash-escuro-1170x2532.png',
  './icons/splash-escuro-1179x2556.png',
  './icons/splash-escuro-1206x2622.png',
  './icons/splash-escuro-1242x2688.png',
  './icons/splash-escuro-1260x2736.png',
  './icons/splash-escuro-1284x2778.png',
  './icons/splash-escuro-1290x2796.png',
  './icons/splash-escuro-1320x2868.png',
  './icons/splash-escuro-750x1334.png',
  './icons/splash-escuro-828x1792.png',
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

// O app pergunta a versão para saber se a tela aberta ficou para trás (main.js).
self.addEventListener('message', (event) => {
  if (event.data?.type === 'versao') event.source?.postMessage({ type: 'versao', version: VERSION });
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
