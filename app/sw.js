// Service worker: guarda o app no celular para abrir rápido e funcionar offline.
// Ao publicar uma versão nova, aumente VERSION para os aparelhos baixarem os arquivos novos.

const VERSION = 'v1.4.1';
const CACHE = `leituras-${VERSION}`;

// Capas dos livros (Google Books, Open Library, BrasilAPI...): ficam num cache próprio, que
// NÃO é apagado na troca de versão. Capa que apareceu uma vez continua aparecendo offline,
// com a rede lenta ou com o Google fora do ar. O cache do navegador não serve para isso:
// no app instalado no iPhone ele é pequeno e o sistema o esvazia quando quer.
const COVERS = 'leituras-capas';
// Limite de capas guardadas (todos os livros de muitos anos). Uma miniatura tem 5–20 KB,
// mas a resposta de um site que não deixa ler a imagem (sem CORS, "opaca") conta bem mais
// na cota do app: o Chrome (Android) soma em média ~7 MB por resposta opaca e o Safari
// também acrescenta uma folga própria. Por isso, além do limite de quantidade, as capas
// nunca passam de QUOTA_SHARE da cota (veja trimCovers): os livros sempre têm espaço.
const MAX_COVERS = 400;
const QUOTA_SHARE = 0.4;
// Depois de o espaço apertar, quantas capas couberam vale por uma semana (sem baixar de novo à toa).
const FIT_TTL_MS = 7 * 24 * 3600 * 1000;
// Se um site deixa ou não ler a imagem é conferido de novo depois de 30 dias.
const HOST_RECHECK_MS = 30 * 24 * 3600 * 1000;
// Pré-carga das capas: poucas por vez, para não disputar a rede com a tela.
const WARM_CONCURRENCY = 3;
const WARM_TIMEOUT_MS = 15000;
// Tantas falhas seguidas: a rede caiu; a pré-carga para e recomeça na próxima vez.
const WARM_MAX_FAILURES = 6;
// Sites que costumam permitir ler a imagem (CORS). Os outros são testados na primeira capa
// (downloadCover); o Google, até onde se sabe, só dá resposta opaca.
const CORS_HOSTS = ['covers.openlibrary.org', 'archive.org'];
// Hosts de capa conhecidos, para o caso de o navegador não dizer que o pedido é de imagem.
const COVER_HOSTS = ['books.google.com', 'googleusercontent.com', 'covers.openlibrary.org', 'archive.org'];
// Anotações do cache de capas (veja loadMeta), guardadas nele mesmo com este endereço.
const META_KEY = new URL('__capas-em-uso__', self.location.href).href;

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
  './js/cover-cache.js',
  './js/cover-url.js',
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
      // Só os arquivos de versões antigas; as capas ficam.
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('leituras-') && k !== CACHE && k !== COVERS).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('message', (event) => {
  const data = event.data;
  if (data?.type === 'versao') {
    // O app pergunta a versão para saber se a tela aberta ficou para trás (main.js).
    event.source?.postMessage({ type: 'versao', version: VERSION });
  } else if (data?.type === 'capas' && Array.isArray(data.urls)) {
    // Capas de todos os livros (cover-cache.js): baixa as que ainda não estão guardadas.
    event.waitUntil(warmCovers(data.urls, data.keep).then((result) => {
      event.source?.postMessage({ type: 'capas-prontas', ...result });
    }));
  } else if (data?.type === 'capa-falhou' && typeof data.url === 'string') {
    // A tela não conseguiu mostrar a capa: se ela veio do cache, a cópia guardada não presta.
    event.waitUntil(dropBadCover(data.url));
  }
});

// Arquivos do app: responde do cache e atualiza em segundo plano.
// Capas: do cache das capas; a que ainda não está lá vem da rede e fica guardada.
// Busca de livros (APIs): sempre pela rede.
self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (isCoverRequest(request, url)) {
    event.respondWith(coverResponse(request, url, event));
    return;
  }
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

// ---------- Capas ----------

function hostIn(hostname, list) {
  return list.some((h) => hostname === h || hostname.endsWith(`.${h}`));
}

/** Pedido de capa: imagem de outro site (as fotos do celular são data: e nem passam por aqui). */
function isCoverRequest(request, url) {
  if (request.method !== 'GET' || request.mode === 'navigate') return false;
  if (url.protocol !== 'https:' || url.origin === self.location.origin) return false;
  return request.destination === 'image' || hostIn(url.hostname, COVER_HOSTS) || /^books\.google\.[a-z.]+$/.test(url.hostname);
}

/** Resposta que a página consegue ler (mesmo site ou CORS). A opaca só serve para <img>. */
function isReadable(response) {
  return response.type === 'basic' || response.type === 'cors';
}

/**
 * Vale guardar? A opaca (status 0) não deixa ver se é erro: fica, e se a tela não conseguir
 * mostrá-la avisa (capa-falhou) e ela sai. A legível, só se for uma imagem de verdade.
 */
function isStorable(response) {
  if (!response) return false;
  if (response.type === 'opaque') return true;
  if (!isReadable(response) || !response.ok) return false;
  return !/^(text\/|application\/json)/i.test(response.headers.get('content-type') || '');
}

/**
 * Quais capas apagar para ficar em 'max'. 'urls' na ordem em que foram guardadas (a mais
 * antiga primeiro); 'keep' são as capas dos livros do app, da mais importante para a menos
 * (livros em leitura primeiro). Saem primeiro as que não são de nenhum livro (livro
 * excluído, capa trocada), da mais antiga para a mais nova; só se ainda faltar espaço, as
 * dos livros, da menos importante para a mais.
 */
function coversToEvict(urls, keep, max) {
  const excess = urls.length - max;
  if (excess <= 0) return [];
  const rank = new Map(keep.map((u, i) => [u, i]));
  const loose = urls.filter((u) => !rank.has(u));
  const kept = urls.filter((u) => rank.has(u)).sort((a, b) => rank.get(b) - rank.get(a));
  return loose.concat(kept).slice(0, excess);
}

/** Lista recebida da tela: só endereços https de outros sites, sem repetição, com limite. */
function cleanCoverList(list, limit = MAX_COVERS * 2) {
  if (!Array.isArray(list)) return [];
  const out = new Set();
  for (const value of list) {
    if (out.size >= limit) break;
    if (typeof value !== 'string') continue;
    try {
      const url = new URL(value);
      if (url.protocol === 'https:' && url.origin !== self.location.origin) out.add(url.href);
    } catch {
      // Endereço inválido: fica de fora.
    }
  }
  return [...out];
}

// Anotações guardadas junto das capas (sobrevivem ao service worker ser encerrado):
// - keep: capas dos livros do app, em ordem de importância (para liberar espaço);
// - hosts: se cada site deixa ler a imagem (CORS) ou não, descoberto na primeira capa dele;
// - fit: quantas capas couberam da última vez que o espaço do aparelho apertou.
let meta = null;

async function loadMeta(cache) {
  if (meta) return meta;
  meta = { keep: [], hosts: {}, fit: null };
  try {
    const stored = await (await cache.match(META_KEY))?.json();
    if (stored && typeof stored === 'object') {
      meta.keep = cleanCoverList(stored.keep);
      if (stored.hosts && typeof stored.hosts === 'object') meta.hosts = stored.hosts;
      if (stored.fit && Number.isFinite(stored.fit.n)) meta.fit = stored.fit;
    }
  } catch {
    // Anotação ilegível: começa do zero (só custa algumas consultas a mais).
  }
  return meta;
}

async function saveMeta(cache) {
  try {
    await cache.put(META_KEY, new Response(JSON.stringify(meta), { headers: { 'Content-Type': 'application/json' } }));
  } catch {
    // Sem espaço: as anotações ficam só na memória até a próxima vez.
  }
}

/**
 * Quantas capas guardar. Normalmente MAX_COVERS; se o espaço do aparelho apertou há pouco,
 * só as que couberam, para a pré-carga não baixar de novo as que acabaram de sair.
 */
function coverLimit(now = Date.now()) {
  const fit = meta?.fit;
  return fit && now - fit.at < FIT_TTL_MS ? Math.max(0, Math.min(MAX_COVERS, fit.n)) : MAX_COVERS;
}

/** O app já ocupa mais que a sua parte do espaço do aparelho? (Inclui a folga das opacas.) */
async function overQuota() {
  try {
    const { usage, quota } = await self.navigator.storage.estimate();
    return quota > 0 && usage > quota * QUOTA_SHARE;
  } catch {
    return false;
  }
}

// Uma limpeza por vez (várias capas chegando juntas pediriam várias).
let trimming = Promise.resolve();

/**
 * Deixa o cache no limite de capas e, se o app passou da sua parte do espaço, apaga mais
 * (um décimo por vez) até voltar: os livros (IndexedDB) nunca podem ficar sem espaço por causa das capas.
 */
function trimCovers(max = MAX_COVERS) {
  trimming = trimming.then(async () => {
    const cache = await caches.open(COVERS);
    const { keep } = await loadMeta(cache);
    let urls = (await cache.keys()).map((r) => r.url).filter((u) => u !== META_KEY);
    const evict = async (n) => {
      const gone = coversToEvict(urls, keep, n);
      for (const url of gone) await cache.delete(url);
      urls = urls.filter((u) => !gone.includes(u));
    };
    await evict(Math.min(max, coverLimit()));
    let squeezed = false;
    for (let round = 0; urls.length && round < 12 && await overQuota(); round += 1) {
      squeezed = true;
      await evict(urls.length - Math.max(5, Math.ceil(urls.length / 10)));
    }
    if (squeezed) {
      meta.fit = { n: urls.length, at: Date.now() };
      await saveMeta(cache);
    }
  }).catch(() => {});
  return trimming;
}

/** Guarda a capa; sem espaço no aparelho, libera metade e segue sem ela. */
async function putCover(cache, url, response, { trim = true } = {}) {
  try {
    await cache.put(url, response);
  } catch {
    await trimCovers(Math.floor(coverLimit() / 2));
    return false;
  }
  if (trim) await trimCovers();
  return true;
}

function plainRequest(url, mode, signal) {
  return new Request(url, { mode, credentials: 'omit', referrerPolicy: 'no-referrer', signal });
}

/** O site deixa ler a imagem? 'cors', 'no-cors' ou null (ainda não sabe, ou faz tempo que viu). */
function hostMode(hostname, now = Date.now()) {
  const seen = meta?.hosts?.[hostname];
  if (seen && now - seen.at < HOST_RECHECK_MS && (seen.mode === 'cors' || seen.mode === 'no-cors')) return seen.mode;
  return hostIn(hostname, CORS_HOSTS) ? 'cors' : null;
}

async function noteHost(cache, hostname, mode) {
  if (meta.hosts[hostname]?.mode === mode && Date.now() - meta.hosts[hostname].at < HOST_RECHECK_MS) return;
  meta.hosts[hostname] = { mode, at: Date.now() };
  await saveMeta(cache);
}

/**
 * Baixa a capa. Prefere a versão legível (CORS): ela ocupa só o próprio tamanho (a opaca
 * conta ~7 MB no Chrome/Android), serve para a cor do cartão e mostra se é erro. O site que
 * não permite (Google, até prova em contrário) recebe o pedido comum de imagem, que sempre
 * serve para <img>; o resultado fica anotado por site para não perguntar de novo a cada capa.
 */
async function downloadCover(cache, url, fallback, signal) {
  const { hostname } = new URL(url);
  const mode = hostMode(hostname);
  if (mode !== 'no-cors') {
    try {
      const response = await fetch(plainRequest(url, 'cors', signal));
      await noteHost(cache, hostname, 'cors');
      return response;
    } catch (err) {
      if (signal?.aborted) throw err;
    }
  }
  const response = await fetch(fallback || plainRequest(url, 'no-cors', signal));
  // Site novo: CORS falhou e o pedido comum funcionou, então ele não deixa ler (não é falta
  // de rede). Site que já deixava não muda de anotação por uma capa só (ex.: a Open Library
  // redireciona algumas capas para outro servidor).
  if (mode === null) await noteHost(cache, hostname, 'no-cors');
  return response;
}

async function coverResponse(request, url, event) {
  let cache = null;
  try {
    cache = await caches.open(COVERS);
    await loadMeta(cache);
    const cached = await cache.match(url.href, { ignoreVary: true });
    // Pedido com CORS (cor da capa) precisa ler os pixels: a opaca não serve para ele.
    if (cached && (request.mode !== 'cors' || isReadable(cached))) return cached;
  } catch {
    // Cache indisponível: segue pela rede.
  }
  let response;
  try {
    response = request.mode === 'cors' || !cache ? await fetch(request) : await downloadCover(cache, url.href, request);
  } catch {
    return Response.error();
  }
  if (cache && isStorable(response)) event.waitUntil(putCover(cache, url.href, response.clone()));
  return response;
}

// Pré-carga: uma de cada vez (um pedido novo espera o anterior terminar).
let warming = Promise.resolve();

function warmCovers(list, keepList) {
  const run = warming.then(() => warmNow(cleanCoverList(list), cleanCoverList(keepList ?? list)));
  warming = run.catch(() => {});
  return run.catch(() => ({ fetched: 0, rejected: 0, failed: 1, cached: 0 }));
}

async function warmNow(urls, keep) {
  const cache = await caches.open(COVERS);
  await loadMeta(cache);
  meta.keep = keep;
  await saveMeta(cache);
  const have = new Set((await cache.keys()).map((r) => r.url));
  // Mais livros que o limite: só as primeiras (a tela manda as mais importantes antes).
  const missing = urls.slice(0, coverLimit()).filter((u) => !have.has(u));
  let next = 0;
  let fetched = 0;
  let rejected = 0; // respondeu, mas não é imagem (sem capa, erro do site)
  let failed = 0; // sem resposta (rede)
  let failuresInRow = 0;
  const worker = async () => {
    while (next < missing.length && failuresInRow < WARM_MAX_FAILURES) {
      const url = missing[next];
      next += 1;
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), WARM_TIMEOUT_MS);
      try {
        const response = await downloadCover(cache, url, null, controller.signal);
        failuresInRow = 0;
        // A limpeza fica para o fim da pré-carga (uma vez só).
        if (isStorable(response) && await putCover(cache, url, response, { trim: false })) fetched += 1;
        else rejected += 1;
      } catch {
        failed += 1;
        failuresInRow += 1;
      } finally {
        clearTimeout(timer);
      }
    }
  };
  await Promise.all(Array.from({ length: WARM_CONCURRENCY }, worker));
  await trimCovers();
  const cached = (await cache.keys()).filter((r) => r.url !== META_KEY).length;
  return { fetched, rejected, failed: failed + (missing.length - next), cached };
}

async function dropBadCover(raw) {
  const [url] = cleanCoverList([raw]);
  if (!url) return;
  try {
    const cache = await caches.open(COVERS);
    const cached = await cache.match(url, { ignoreVary: true });
    if (cached && (cached.type === 'opaque' || !isStorable(cached))) await cache.delete(url);
  } catch {
    // Sem cache: nada a apagar.
  }
}
