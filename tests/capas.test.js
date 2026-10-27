// Capas guardadas no aparelho: endereço único de cada capa, lista para a pré-carga e as
// regras do cache de capas do service worker (rodando o próprio sw.js num contexto simulado).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { isGoogleCoverHost, normalizeCoverUrl } from '../app/js/cover-url.js';
import { coverUrlsFor } from '../app/js/cover-cache.js';
import { largeCoverUrl } from '../app/js/ui.js';

const G = 'https://books.google.com/books/content?id=abc&printsec=frontcover&img=1&zoom=1&source=gbs_api';

test('normalizeCoverUrl: mesma capa, mesmo endereço', () => {
  // Já no formato certo: volta o mesmo texto (é o que está salvo nos livros).
  assert.equal(normalizeCoverUrl(G), G);
  assert.equal(normalizeCoverUrl('https://covers.openlibrary.org/b/id/1-M.jpg'), 'https://covers.openlibrary.org/b/id/1-M.jpg');
  assert.equal(
    normalizeCoverUrl('https://covers.openlibrary.org/b/isbn/9788535914849-M.jpg?default=false'),
    'https://covers.openlibrary.org/b/isbn/9788535914849-M.jpg?default=false',
  );
  // http, dobra de página e outros zooms do Google viram a mesma miniatura.
  assert.equal(normalizeCoverUrl(G.replace('https:', 'http:')), G);
  assert.equal(normalizeCoverUrl(`${G.replace('&source', '&edge=curl&source')}`), G);
  assert.equal(normalizeCoverUrl(G.replace('zoom=1', 'zoom=5')), G);
  assert.equal(
    new URL(normalizeCoverUrl('http://books.google.com.br/books/content?id=x&printsec=frontcover&img=1')).searchParams.get('zoom'),
    '1',
  );
  assert.equal(normalizeCoverUrl('https://books.googleusercontent.com/books/content?id=x&zoom=1&edge=curl'),
    'https://books.googleusercontent.com/books/content?id=x&zoom=1');
  // A versão grande (fife) não ganha zoom.
  assert.equal(normalizeCoverUrl('https://books.google.com/books/content?id=x&img=1&fife=w800'),
    'https://books.google.com/books/content?id=x&img=1&fife=w800');
  // Outros sites: só o https.
  assert.equal(normalizeCoverUrl('http://exemplo.com/capa.jpg'), 'https://exemplo.com/capa.jpg');
  assert.equal(normalizeCoverUrl('  https://exemplo.com/capa.jpg '), 'https://exemplo.com/capa.jpg');
  // Foto do celular fica igual; o que não é capa vira null.
  assert.equal(normalizeCoverUrl('data:image/jpeg;base64,AAAA'), 'data:image/jpeg;base64,AAAA');
  for (const bad of [null, undefined, '', '   ', 'javascript:alert(1)', 'nada', 42, 'ftp://x.com/a.jpg']) {
    assert.equal(normalizeCoverUrl(bad), null, String(bad));
  }
  assert.ok(isGoogleCoverHost('books.google.com.br'));
  assert.ok(!isGoogleCoverHost('books.google.evil.com.example'.replace(/\.example$/, '.x1')));
});

test('largeCoverUrl parte do endereço normalizado (a capa grande também é sempre a mesma)', () => {
  const big = largeCoverUrl(`${G.replace('https:', 'http:').replace('&source', '&edge=curl&source')}`);
  assert.equal(big, largeCoverUrl(G));
  const u = new URL(big);
  assert.equal(u.protocol, 'https:');
  assert.equal(u.searchParams.get('fife'), 'w800');
  assert.equal(u.searchParams.has('zoom'), false);
  assert.equal(u.searchParams.has('edge'), false);
});

test('coverUrlsFor: livros em leitura primeiro (com a capa grande), sem repetir e sem fotos', () => {
  const books = [
    { id: 'a', status: 'lido', cover: 'https://covers.openlibrary.org/b/id/1-M.jpg' },
    { id: 'b', status: 'lendo', cover: G.replace('https:', 'http:') },
    { id: 'c', status: 'quero', cover: 'data:image/jpeg;base64,AAAA' },
    { id: 'd', status: 'lido', cover: 'https://covers.openlibrary.org/b/id/1-M.jpg' },
    { id: 'e', status: 'lido', cover: null },
    { id: 'f', status: 'lido', cover: 'javascript:alert(1)' },
    null,
  ];
  assert.deepEqual(coverUrlsFor(books), [G, largeCoverUrl(G), 'https://covers.openlibrary.org/b/id/1-M.jpg']);
  assert.deepEqual(coverUrlsFor(undefined), []);
});

// ---------- sw.js num contexto simulado ----------

class FakeCache {
  constructor() { this.entries = new Map(); }
  async put(key, response) {
    const url = typeof key === 'string' ? key : key.url;
    if (this.full) throw new DOMException('cheio', 'QuotaExceededError');
    if (this.putError) throw this.putError(url);
    this.entries.delete(url); // como no Cache API: a regravada vai para o fim
    this.entries.set(url, response);
  }
  async match(key) { return this.entries.get(typeof key === 'string' ? key : key.url); }
  async keys() { return [...this.entries.keys()].map((url) => ({ url })); }
  async delete(key) { return this.entries.delete(typeof key === 'string' ? key : key.url); }
}

function fakeResponse(type, { status = type === 'opaque' ? 0 : 200, contentType = 'image/jpeg' } = {}) {
  const r = {
    type, status, ok: status >= 200 && status < 300,
    headers: new Headers(type === 'opaque' ? {} : { 'content-type': contentType }),
    clone: () => r,
  };
  return r;
}

function loadSw({ fetchImpl, estimate } = {}) {
  const listeners = {};
  const stores = new Map();
  const caches = {
    async open(name) {
      if (!stores.has(name)) stores.set(name, new FakeCache());
      return stores.get(name);
    },
    async keys() { return [...stores.keys()]; },
    async delete(name) { return stores.delete(name); },
  };
  const self = {
    location: new URL('https://app.test/sw.js'),
    addEventListener: (type, fn) => { listeners[type] = fn; },
    clients: { claim: async () => {} },
    skipWaiting: () => {},
    navigator: estimate ? { storage: { estimate: () => estimate(stores) } } : {},
  };
  const context = vm.createContext({
    self, caches, URL, Headers, Request, Response, AbortController, DOMException, setTimeout, clearTimeout, console, Date,
    fetch: fetchImpl || (async () => { throw new TypeError('offline'); }),
  });
  vm.runInContext(readFileSync(new URL('../app/sw.js', import.meta.url), 'utf8'), context);
  return { ctx: context, listeners, stores, caches, get: (expr) => vm.runInContext(expr, context) };
}

const META = 'https://app.test/__capas-em-uso__';
const coverKeys = (store) => [...store.entries.keys()].filter((u) => u !== META);

/** Rede de mentira: o Google não deixa ler a imagem (CORS), os outros sites deixam. */
function fakeNetwork({ online = () => true, log = [], delay = 0 } = {}) {
  return async (req) => {
    log.push(`${req.mode}:${req.url}`);
    if (delay) await new Promise((r) => setTimeout(r, delay));
    if (!online()) throw new TypeError('offline');
    const google = /google/.test(new URL(req.url).hostname);
    if (req.mode === 'cors' && google) throw new TypeError('CORS');
    return fakeResponse(req.mode === 'cors' ? 'cors' : 'opaque');
  };
}

test('sw: regra para liberar espaço (capas de livros que saíram do app primeiro, depois as menos importantes)', () => {
  const { get } = loadSw();
  const evict = (...args) => [...get('coversToEvict')(...args)];
  const urls = ['a', 'b', 'c', 'd', 'e'];
  assert.deepEqual(evict(urls, [], 5), []);
  assert.deepEqual(evict(urls, [], 3), ['a', 'b']);
  // 'b' e 'd' não são de nenhum livro: saem antes das que são.
  assert.deepEqual(evict(urls, ['a', 'c', 'e'], 3), ['b', 'd']);
  // Entre as dos livros, sai a menos importante (fim da lista), mesmo sendo a mais nova.
  assert.deepEqual(evict(urls, ['a', 'c', 'e'], 2), ['b', 'd', 'e']);
  assert.deepEqual(evict(urls, ['e', 'a', 'c'], 1), ['b', 'd', 'c', 'a']);
  assert.ok(get('MAX_COVERS') >= 200 && get('MAX_COVERS') <= 1000);
  assert.ok(get('QUOTA_SHARE') > 0 && get('QUOTA_SHARE') <= 0.5);
});

test('sw: o que é pedido de capa e o que vale guardar', () => {
  const { get } = loadSw();
  const isCover = (url, init = {}) => get('isCoverRequest')({ method: 'GET', mode: 'no-cors', destination: 'image', ...init }, new URL(url));
  assert.ok(isCover(G));
  assert.ok(isCover('https://qualquer-site.com.br/capa.jpg'));
  assert.ok(isCover('https://covers.openlibrary.org/b/id/1-M.jpg', { destination: '' }));
  assert.ok(isCover('https://books.google.com.br/books/content?id=1', { destination: '' }));
  assert.ok(!isCover('https://app.test/icons/icon-192.png'), 'arquivo do app');
  assert.ok(!isCover('https://openlibrary.org/search.json?q=x', { destination: '', mode: 'cors' }), 'busca de livros');
  assert.ok(!isCover('http://exemplo.com/capa.jpg'));
  assert.ok(!isCover(G, { method: 'POST' }));
  assert.ok(!isCover(G, { mode: 'navigate', destination: 'document' }));

  const storable = get('isStorable');
  assert.ok(storable(fakeResponse('opaque')), 'opaca: não dá para ver o status, fica');
  assert.ok(storable(fakeResponse('cors')));
  assert.ok(!storable(fakeResponse('cors', { status: 404 })));
  assert.ok(!storable(fakeResponse('cors', { status: 503 })));
  assert.ok(!storable(fakeResponse('cors', { contentType: 'text/html' })), 'página de erro com status 200');
  assert.ok(!storable(fakeResponse('error')));
  assert.ok(!storable(null));
});

test('sw: troca de versão apaga os arquivos antigos, mas não as capas', async () => {
  const { listeners, caches } = loadSw();
  await caches.open('leituras-v1.0.0');
  await caches.open('leituras-capas');
  await caches.open('outra-coisa');
  let done;
  listeners.activate({ waitUntil: (p) => { done = p; } });
  await done;
  assert.deepEqual((await caches.keys()).sort(), ['leituras-capas', 'outra-coisa']);
});

async function respond(sw, request) {
  const waits = [];
  let responsePromise;
  sw.listeners.fetch({ request, respondWith: (p) => { responsePromise = p; }, waitUntil: (p) => waits.push(p) });
  const response = await responsePromise;
  await Promise.all(waits);
  return response;
}

const imgRequest = (url, mode = 'no-cors') => ({ url, method: 'GET', mode, destination: 'image' });

function message(sw, data) {
  const replies = [];
  let done = Promise.resolve();
  sw.listeners.message({ data, source: { postMessage: (m) => replies.push(m) }, waitUntil: (p) => { done = p; } });
  return done.then(() => replies);
}

test('sw: capa guardada responde sem rede; a nova vem da rede e fica guardada', async () => {
  let online = true;
  const log = [];
  const sw = loadSw({ fetchImpl: fakeNetwork({ online: () => online, log }) });
  const first = await respond(sw, imgRequest(G));
  assert.equal(first.type, 'opaque');
  const store = sw.stores.get('leituras-capas');
  assert.ok(store.entries.has(G));
  // O Google não deixou ler (CORS) da primeira vez: fica anotado e não se pergunta de novo.
  log.length = 0;
  const g2 = 'https://books.google.com/books/content?id=g2&zoom=1';
  await respond(sw, imgRequest(g2));
  assert.deepEqual(log, [`no-cors:${g2}`]);
  online = false;
  assert.equal(await respond(sw, imgRequest(G)), store.entries.get(G), 'offline: do cache');
  // Sem rede e sem cópia: erro (a tela tenta de novo depois).
  assert.equal((await respond(sw, imgRequest('https://books.google.com/books/content?id=zzz&zoom=1'))).type, 'error');
  // A cor da capa pede com CORS: a opaca do Google não serve para isso.
  assert.equal((await respond(sw, imgRequest(G, 'cors'))).type, 'error');
  // Open Library (e qualquer site que permita): guardada legível, a cor sai também offline.
  online = true;
  const ol = 'https://covers.openlibrary.org/b/id/7-M.jpg';
  const other = 'https://capas.editora.com.br/livro.jpg';
  await respond(sw, imgRequest(ol));
  await respond(sw, imgRequest(other));
  assert.equal(store.entries.get(ol).type, 'cors');
  assert.equal(store.entries.get(other).type, 'cors');
  online = false;
  assert.equal((await respond(sw, imgRequest(ol, 'cors'))).type, 'cors');
  // As anotações sobrevivem ao service worker ser encerrado (ficam no cache).
  const meta = await store.entries.get(META).json();
  assert.equal(meta.hosts['books.google.com'].mode, 'no-cors');
  assert.equal(meta.hosts['capas.editora.com.br'].mode, 'cors');
});

test('sw: erro do site não é guardado; capa ruim avisada pela tela sai do cache', async () => {
  const sw = loadSw({ fetchImpl: async () => fakeResponse('cors', { status: 404 }) });
  const ol = 'https://covers.openlibrary.org/b/isbn/9788535914849-M.jpg?default=false';
  const res = await respond(sw, imgRequest(ol));
  assert.equal(res.status, 404);
  const store = await sw.caches.open('leituras-capas');
  assert.deepEqual(coverKeys(store), []);

  await store.put(G, fakeResponse('opaque'));
  await store.put(ol, fakeResponse('cors'));
  await message(sw, { type: 'capa-falhou', url: G });
  await message(sw, { type: 'capa-falhou', url: ol });
  assert.deepEqual(coverKeys(store), [ol], 'só a opaca (que pode ser erro) sai; a imagem legível e boa fica');
});

test('sw: pré-carga baixa só o que falta, poucas por vez, e respeita o limite', async () => {
  let active = 0;
  let peak = 0;
  const log = [];
  const net = fakeNetwork({ log });
  const sw = loadSw({
    fetchImpl: async (req) => {
      active += 1;
      peak = Math.max(peak, active);
      await new Promise((r) => setTimeout(r, 2));
      active -= 1;
      return net(req);
    },
  });
  const max = sw.get('MAX_COVERS');
  const store = await sw.caches.open('leituras-capas');
  await store.put(G, fakeResponse('opaque'));
  const books = Array.from({ length: 30 }, (_, i) => `https://books.google.com/books/content?id=b${i}&zoom=1`);
  const replies = await message(sw, { type: 'capas', urls: [G, ...books, 'javascript:alert(1)', 'https://app.test/js/main.js'] });
  const got = log.filter((l) => l.startsWith('no-cors:'));
  assert.equal(got.length, 30, 'a que já estava guardada não é baixada de novo; endereços inválidos ficam de fora');
  assert.ok(peak <= sw.get('WARM_CONCURRENCY'), `no máximo ${sw.get('WARM_CONCURRENCY')} ao mesmo tempo (foram ${peak})`);
  assert.deepEqual({ ...replies.at(-1) }, { type: 'capas-prontas', fetched: 30, rejected: 0, failed: 0, cached: 31 });

  // Muitas capas de livros que já saíram do app: o cache não passa do limite e as dos livros ficam.
  for (let i = 0; i < max + 50; i += 1) await store.put(`https://outro.site/capa-${i}.jpg`, fakeResponse('opaque'));
  await message(sw, { type: 'capas', urls: [G, ...books] });
  const keys = coverKeys(store);
  assert.equal(keys.length, max);
  for (const url of [G, ...books]) assert.ok(keys.includes(url), url);
});

test('sw: pré-carga para quando a rede cai e avisa o que faltou', async () => {
  let calls = 0;
  const sw = loadSw({ fetchImpl: async () => { calls += 1; throw new TypeError('offline'); } });
  const urls = Array.from({ length: 40 }, (_, i) => `https://books.google.com/books/content?id=x${i}&zoom=1`);
  const replies = await message(sw, { type: 'capas', urls });
  assert.ok(calls < 30, `desistiu cedo (${calls} pedidos)`);
  assert.equal(replies[0].fetched, 0);
  assert.equal(replies[0].failed, 40);
  // Offline não conta como "o Google não deixa ler": nada anotado.
  const meta = await sw.stores.get('leituras-capas').entries.get(META).json();
  assert.deepEqual(meta.hosts, {});
});

test('sw: espaço do aparelho apertado (opacas do Chrome/Android) — as capas cedem lugar e não voltam a ser baixadas', async () => {
  // Cada capa opaca "pesa" 7 MB na cota, como no Chrome; a cota toda é de 700 MB.
  const MB = 1024 * 1024;
  const quota = 700 * MB;
  const log = [];
  const sw = loadSw({
    fetchImpl: fakeNetwork({ log }),
    estimate: async (stores) => ({ quota, usage: 20 * MB + 7 * MB * (stores.get('leituras-capas')?.entries.size || 0) }),
  });
  const books = Array.from({ length: 80 }, (_, i) => `https://books.google.com/books/content?id=q${i}&zoom=1`);
  const [reply] = await message(sw, { type: 'capas', urls: books });
  const store = sw.stores.get('leituras-capas');
  const keys = coverKeys(store);
  const usage = 20 * MB + 7 * MB * store.entries.size;
  assert.ok(usage <= quota * sw.get('QUOTA_SHARE'), `uso ${usage / MB} MB de ${quota / MB} MB`);
  assert.ok(keys.length >= 20, `ficaram ${keys.length}`);
  assert.equal(reply.cached, keys.length);
  // Ficam as mais importantes (começo da lista).
  assert.deepEqual(keys.slice().sort(), books.slice(0, keys.length).sort());
  // Na próxima abertura, a pré-carga não baixa de novo as que não couberam.
  log.length = 0;
  await message(sw, { type: 'capas', urls: books });
  assert.deepEqual(log, []);
});

test('sw: rede caindo no meio da imagem não apaga capas (só falta de espaço libera metade)', async () => {
  const sw = loadSw({ fetchImpl: fakeNetwork() });
  const store = await sw.caches.open('leituras-capas');
  for (let i = 0; i < 300; i += 1) await store.put(`https://outro.site/capa-${i}.jpg`, fakeResponse('opaque'));
  // O corpo da imagem falha enquanto é gravado (conexão caiu, pré-carga desistiu por tempo).
  store.putError = (url) => (url.includes('corta') ? new TypeError('network error') : null);
  const cut = 'https://capas.editora.com.br/corta.jpg';
  const res = await respond(sw, imgRequest(cut));
  assert.equal(res.type, 'cors', 'a tela recebe a resposta mesmo assim');
  assert.equal(coverKeys(store).length, 300, 'nenhuma capa apagada');
  // Na pré-carga, o corte conta como falha de rede (a tela manda a lista de novo depois).
  const [reply] = await message(sw, { type: 'capas', urls: ['https://capas.editora.com.br/corta-2.jpg'] });
  assert.equal(reply.failed, 1);
  assert.equal(reply.fetched, 0);
  assert.equal(coverKeys(store).length, 300);
  // Falta de espaço de verdade continua liberando metade.
  store.putError = (url) => (url.includes('cheia') ? new DOMException('cheio', 'QuotaExceededError') : null);
  await respond(sw, imgRequest('https://capas.editora.com.br/cheia.jpg'));
  assert.equal(coverKeys(store).length, Math.floor(sw.get('MAX_COVERS') / 2));
});

test('sw: capas pedidas juntas ao acordar usam as anotações guardadas (sem perguntar CORS de novo)', async () => {
  const log = [];
  const sw = loadSw({ fetchImpl: fakeNetwork({ log, delay: 5 }) });
  const store = await sw.caches.open('leituras-capas');
  await store.put(META, new Response(JSON.stringify({ keep: [], hosts: { 'books.google.com': { mode: 'no-cors', at: Date.now() } }, fit: null })));
  const urls = [1, 2, 3, 4].map((i) => `https://books.google.com/books/content?id=w${i}&zoom=1`);
  await Promise.all(urls.map((u) => respond(sw, imgRequest(u))));
  assert.deepEqual(log.sort(), urls.map((u) => `no-cors:${u}`).sort());
});

test('sw: sem Cache Storage (modo privado do Safari) as capas vêm da rede e a pré-carga responde', async () => {
  const sw = loadSw({ fetchImpl: fakeNetwork() });
  sw.caches.open = async () => { throw new DOMException('negado', 'SecurityError'); };
  const res = await respond(sw, imgRequest(G));
  assert.equal(res.type, 'opaque');
  const [reply] = await message(sw, { type: 'capas', urls: [G] });
  assert.equal(reply.type, 'capas-prontas');
  assert.equal(reply.fetched, 0);
  assert.ok(reply.failed > 0, 'a tela tenta de novo depois');
  await message(sw, { type: 'capa-falhou', url: G });
});

test('normalizeCoverUrl é estável (normalizar de novo não muda) e não mexe em fotos', () => {
  const samples = [
    G, `${G}&edge=curl`, G.replace('zoom=1', 'zoom=5').replace('https:', 'http:'),
    'http://books.google.com.br/books/content?id=a%20b+c&printsec=frontcover&img=1&edge=curl&source=gbs_api',
    'https://books.google.com/books/publisher/content/images/frontcover/X1?fife=w400-h600&source=gbs_api',
    'https://covers.openlibrary.org/b/isbn/9788535914849-M.jpg?default=false',
    'http://covers.openlibrary.org/b/id/123-M.jpg',
    'https://exemplo.com.br/capas/livro%201.jpg?v=2#frente',
    'data:image/jpeg;base64,/9j/AAAA',
  ];
  for (const raw of samples) {
    const once = normalizeCoverUrl(raw);
    assert.equal(normalizeCoverUrl(once), once, raw);
  }
  assert.equal(normalizeCoverUrl('data:image/jpeg;base64,/9j/AAAA'), 'data:image/jpeg;base64,/9j/AAAA');
  assert.equal(largeCoverUrl('https://covers.openlibrary.org/b/isbn/9788535914849-M.jpg?default=false'),
    'https://covers.openlibrary.org/b/isbn/9788535914849-L.jpg?default=false');
});
