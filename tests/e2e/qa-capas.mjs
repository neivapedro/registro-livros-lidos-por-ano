// QA do cache de capas (sw.js "leituras-capas" + cover-cache.js):
// - atualização a partir do app publicado (1.4.1, service worker antigo): uma recarga só,
//   arquivos antigos apagados, cache das capas criado, livros intactos;
// - pedidos que não são capa (busca de livros, POST) passam direto, sem cache;
// - capa nunca vista, sem rede: a capa desenhada aparece logo (sem pedido pendurado);
// - rede caindo no meio de uma imagem não apaga as outras capas guardadas;
// - muitas trocas de tela com uma capa quebrada não multiplicam as novas tentativas;
// - duas abas pedindo a pré-carga juntas não baixam a mesma capa duas vezes.
// Os sites das capas são um servidor HTTPS local (como em capas.mjs).
// Uso: node tests/e2e/qa-capas.mjs

import { execSync } from 'node:child_process';
import { createServer } from 'node:http';
import { createServer as createHttpsServer } from 'node:https';
import { readFileSync, existsSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { extname, join, normalize } from 'node:path';
import { createRequire } from 'node:module';
import { deflateSync } from 'node:zlib';
import assert from 'node:assert/strict';

const require = createRequire(import.meta.url);
let playwright;
try {
  playwright = require('playwright');
} catch {
  playwright = require(join(execSync('npm root -g').toString().trim(), 'playwright'));
}

const ROOT = new URL('../../', import.meta.url).pathname;
const APP = join(ROOT, 'app/');
const SHOTS = new URL('./screens/', import.meta.url).pathname;
mkdirSync(SHOTS, { recursive: true });
const TYPES = {
  '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json',
  '.webmanifest': 'application/manifest+json', '.svg': 'image/svg+xml', '.png': 'image/png', '.woff2': 'font/woff2',
};

// O app publicado (1.4.1, antes do cache de capas), tirado do git.
const LIVE_COMMIT = '0b3e50f';
const oldDir = mkdtempSync(join(tmpdir(), 'leituras-141-'));
execSync(`git archive ${LIVE_COMMIT} app | tar -x -C ${oldDir}`, { cwd: ROOT });
const OLD_APP = join(oldDir, 'app/');

// 'old': o app publicado; 'new': o app atual como versão 1.4.2 (sw.js e Ajustes).
let serving = 'old';
const server = createServer((req, res) => {
  const dir = serving === 'old' ? OLD_APP : APP;
  const path = normalize(decodeURIComponent(new URL(req.url, 'http://x').pathname)).replace(/^\/+/, '');
  const file = join(dir, path || 'index.html');
  if (!file.startsWith(dir) || !existsSync(file)) {
    res.writeHead(404).end();
    return;
  }
  let body = readFileSync(file);
  if (serving === 'new' && path === 'sw.js') body = body.toString().replace(/const VERSION = '[^']+'/, "const VERSION = 'v1.4.2'");
  if (serving === 'new' && path === 'js/views/settings.js') body = body.toString().replace(/APP_VERSION = '[^']+'/, "APP_VERSION = '1.4.2'");
  res.writeHead(200, { 'Content-Type': TYPES[extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
  res.end(body);
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const BASE = `http://localhost:${server.address().port}/`;

// ---------- Imagens de mentira ----------

const CRC = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
function crc32(buf) {
  let c = 0xffffffff;
  for (const b of buf) c = CRC[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const out = Buffer.alloc(12 + data.length);
  out.writeUInt32BE(data.length, 0);
  out.write(type, 4, 'ascii');
  data.copy(out, 8);
  out.writeUInt32BE(crc32(out.subarray(4, 8 + data.length)), 8 + data.length);
  return out;
}
function png([r, g, b], w = 32, h = 48) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  const row = Buffer.concat([Buffer.from([0]), Buffer.from(Array.from({ length: w }, () => [r, g, b]).flat())]);
  const raw = Buffer.concat(Array.from({ length: h }, () => row));
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0)),
  ]);
}
const PNG = png([200, 120, 30]);
// Imagem "grande" (sem compressão boa) para cortar no meio.
const BIG = png([1, 2, 3], 300, 400);

// ---------- Sites das capas e uma "API de busca" (HTTPS local) ----------

const certDir = mkdtempSync(join(tmpdir(), 'leituras-qa-capas-'));
execSync(
  'openssl req -x509 -newkey rsa:2048 -nodes -keyout key.pem -out cert.pem -days 2 -subj /CN=capas.localhost'
  + ' -addext subjectAltName=DNS:capas-google.localhost,DNS:capas-ol.localhost,DNS:capas-extra.localhost',
  { cwd: certDir, stdio: 'ignore' },
);
const hits = new Map();
const failing = new Set();
const covers = createHttpsServer({ key: readFileSync(join(certDir, 'key.pem')), cert: readFileSync(join(certDir, 'cert.pem')) }, (req, res) => {
  const host = String(req.headers.host || '').split(':')[0];
  const url = `https://${req.headers.host}${req.url}`;
  hits.set(url, (hits.get(url) || 0) + 1);
  if ([...failing].some((f) => url.includes(f))) {
    req.socket.destroy();
    return;
  }
  const cors = host === 'capas-google.localhost' ? {} : { 'Access-Control-Allow-Origin': '*' };
  if (req.url.startsWith('/api/')) {
    // "Busca de livros": JSON com CORS, nunca guardado pelo service worker.
    let body = '';
    req.on('data', (d) => { body += d; });
    req.on('end', () => {
      res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...cors });
      res.end(JSON.stringify({ method: req.method, n: hits.get(url), body }));
    });
    return;
  }
  if (req.url.includes('corta')) {
    // A rede cai no meio da imagem: metade do corpo e a conexão fecha.
    res.writeHead(200, { 'Content-Type': 'image/png', 'Content-Length': BIG.length, ...cors });
    res.write(BIG.subarray(0, Math.floor(BIG.length / 2)));
    setTimeout(() => req.socket.destroy(), 50);
    return;
  }
  res.writeHead(200, { 'Content-Type': 'image/png', ...cors });
  res.end(PNG);
});
await new Promise((r) => covers.listen(0, '127.0.0.1', r));
const PORT = covers.address().port;
const GOOGLE = `https://capas-google.localhost:${PORT}`;
const OL = `https://capas-ol.localhost:${PORT}`;
const EXTRA = `https://capas-extra.localhost:${PORT}`;

// ---------- Livros ----------

const gUrl = (id) => `${GOOGLE}/books/content?id=${id}&printsec=frontcover&img=1&zoom=1&source=gbs_api`;
const base = { authors: 'Autor', pages: 200, format: 'fisico', notes: '', isbn: '', createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z' };
const read = (i, cover) => ({
  ...base, id: `l${i}`, title: `Livro lido ${i}`, status: 'lido', startDate: '2026-01-01', endDate: `2026-0${(i % 9) + 1}-10`, rating: 4, cover,
});
const seed = {
  version: 2,
  goals: { 2026: 12 },
  defaultGoal: 12,
  customGenres: [],
  lastBackupAt: '2026-10-10T10:00:00.000Z',
  books: [
    { ...base, id: 'r1', title: 'Lendo Agora', status: 'lendo', startDate: '2026-10-01', currentPage: 50, cover: gUrl('lendo1') },
    ...Array.from({ length: 8 }, (_, i) => read(i, gUrl(`g${i}`))),
    read(10, `${OL}/b/id/10-M.jpg`),
  ],
};
const withReading = (cover) => ({
  ...seed,
  books: [{ ...base, id: 'r9', title: 'Capa Problema', status: 'lendo', startDate: '2026-10-05', currentPage: 10, cover }, ...seed.books],
});

// ---------- Navegador ----------

const browser = await playwright.chromium.launch({ args: ['--ignore-certificate-errors', '--no-proxy-server'] });
const context = await browser.newContext({
  viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, locale: 'pt-BR',
  reducedMotion: 'reduce', serviceWorkers: 'allow', ignoreHTTPSErrors: true,
});
await context.route(/^https:\/\/(?!capas-[a-z]+\.localhost)/, (r) => r.abort());
// Temporizadores de cover-cache.js ainda pendentes (com a pilha de quem os criou).
await context.addInitScript(() => {
  const pending = new Map();
  window.__coverTimers = pending;
  const st = window.setTimeout;
  const ct = window.clearTimeout;
  window.setTimeout = function patched(fn, ms, ...args) {
    const stack = new Error().stack || '';
    if (!/cover-cache\.js/.test(stack)) return st(fn, ms, ...args);
    const id = st(() => {
      pending.delete(id);
      if (typeof fn === 'function') fn(...args);
    }, ms);
    pending.set(id, stack);
    return id;
  };
  window.clearTimeout = function patchedClear(id) {
    pending.delete(id);
    return ct(id);
  };
});

const page = await context.newPage();
const errors = [];
const watchErrors = (p) => {
  p.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  p.on('console', (m) => {
    if (m.type() === 'error' && !/Failed to load resource|net::|CORS/.test(m.text())) errors.push(`console: ${m.text()}`);
  });
};
watchErrors(page);

const step = (msg) => console.log(`• ${msg}`);
const writeState = (p, data) => p.evaluate(async (d) => (await import('/js/db.js')).setItem('state', d), data);
const readState = (p) => p.evaluate(async () => (await import('/js/db.js')).getItem('state'));
async function until(fn, what, timeout = 15000) {
  const end = Date.now() + timeout;
  let last;
  while (Date.now() < end) {
    last = await fn().catch((e) => `erro: ${e.message}`);
    if (last && !String(last).startsWith('erro: ')) return last;
    await page.waitForTimeout(150);
  }
  throw new Error(`Esperando: ${what} (último: ${JSON.stringify(last)})`);
}
const coverCount = () => page.evaluate(async () => {
  if (!(await caches.has('leituras-capas'))) return 0;
  return (await (await caches.open('leituras-capas')).keys()).filter((r) => !r.url.includes('__capas-em-uso__')).length;
});
const cachedUrls = () => page.evaluate(async () => {
  if (!(await caches.has('leituras-capas'))) return [];
  return (await (await caches.open('leituras-capas')).keys()).map((r) => r.url);
});
const readingCover = (id) => page.evaluate((bookId) => {
  const img = document.querySelector(`.reading[data-id="${bookId}"] .rn-cover img.cover-img`);
  if (!img) return 'sem img';
  if (img.classList.contains('is-broken')) return 'quebrada';
  return img.complete && img.naturalWidth > 0 ? 'ok' : 'carregando';
}, id);
const warm = (p, urls, keep) => p.evaluate(([u, k]) => new Promise((resolve) => {
  const onMsg = (e) => {
    if (e.data?.type !== 'capas-prontas') return;
    navigator.serviceWorker.removeEventListener('message', onMsg);
    resolve(e.data);
  };
  navigator.serviceWorker.addEventListener('message', onMsg);
  navigator.serviceWorker.controller.postMessage({ type: 'capas', urls: u, keep: k });
}), [urls, keep]);

try {
  step('app publicado (1.4.1) com livros, service worker antigo no controle');
  await page.goto(BASE);
  await page.waitForSelector('.hero');
  await page.evaluate(() => navigator.serviceWorker.ready);
  await writeState(page, seed);
  await page.reload();
  await page.waitForSelector('.reading');
  await until(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller)), 'service worker antigo no controle');
  assert.deepEqual(await page.evaluate(() => caches.keys()), ['leituras-v1.4.1']);

  step('atualiza para a versão com o cache de capas: recarrega uma vez só');
  serving = 'new';
  let loads = 0;
  page.on('load', () => { loads += 1; });
  await page.evaluate(async () => (await navigator.serviceWorker.getRegistration()).update());
  await until(async () => loads >= 1 || null, 'recarga da atualização', 20000);
  await page.waitForSelector('.reading');
  await until(() => page.evaluate(async () => {
    const keys = (await caches.keys()).sort();
    return JSON.stringify(keys) === JSON.stringify(['leituras-capas', 'leituras-v1.4.2']);
  }), 'caches: só a versão nova e as capas');
  await page.waitForTimeout(3000);
  assert.equal(loads, 1, `recargas depois da atualização: ${loads}`);
  assert.equal(await page.evaluate(async () => (await import('/js/views/settings.js')).APP_VERSION), '1.4.2');
  const stored = await readState(page);
  assert.deepEqual(stored.books.map((b) => [b.id, b.cover]), seed.books.map((b) => [b.id, b.cover]), 'livros intactos (endereço da capa salvo não muda)');
  // Pré-carga do primeiro uso: a capa do livro em leitura fica guardada.
  await until(async () => (await cachedUrls()).includes(gUrl('lendo1')), 'capa do livro em leitura guardada');
  assert.equal(await readingCover('r1'), 'ok');

  step('pedidos que não são capa: busca (GET e POST) vai sempre à rede e não é guardada');
  const api = `${EXTRA}/api/search.json?q=x`;
  const r1 = await page.evaluate((u) => fetch(u).then((r) => r.json()), api);
  const r2 = await page.evaluate((u) => fetch(u).then((r) => r.json()), api);
  const r3 = await page.evaluate((u) => fetch(u, { method: 'POST', body: 'oi' }).then((r) => r.json()), api);
  assert.deepEqual([r1.n, r2.n, r3.method, r3.body], [1, 2, 'POST', 'oi']);
  assert.ok(!(await cachedUrls()).some((u) => u.includes('/api/')), 'nada da busca no cache das capas');

  step('capa nunca vista, sem rede: a capa desenhada aparece logo');
  const neverSeen = `${EXTRA}/nunca-vista.png`;
  await writeState(page, withReading(neverSeen));
  // setOffline não vale para os pedidos do service worker: o site da capa recusa a conexão.
  failing.add('nunca-vista');
  await context.setOffline(true);
  await page.reload();
  await page.waitForSelector('.reading[data-id="r9"]');
  const t0 = Date.now();
  await until(async () => (await readingCover('r9')) === 'quebrada', 'capa sem rede marcada como quebrada', 4000);
  console.log(`  quebrada em ${Date.now() - t0} ms`);
  await context.setOffline(false);
  failing.delete('nunca-vista');

  step('rede cai no meio de uma imagem: as capas guardadas ficam');
  const extras = Array.from({ length: 300 }, (_, i) => `${EXTRA}/capa-${i}.png`);
  const keep = await page.evaluate(async () => {
    const { coverUrlsFor } = await import('/js/cover-cache.js');
    const { getItem } = await import('/js/db.js');
    return coverUrlsFor((await getItem('state')).books);
  });
  const reply = await warm(page, extras, keep);
  assert.equal(reply.failed, 0, JSON.stringify(reply));
  const before = await coverCount();
  assert.ok(before >= 300, `capas guardadas: ${before}`);
  await writeState(page, withReading(`${EXTRA}/corta.png`));
  await page.reload();
  await page.waitForSelector('.reading[data-id="r9"]');
  await until(async () => (await readingCover('r9')) === 'quebrada', 'capa cortada marcada como quebrada');
  await page.waitForTimeout(1500);
  const after = await coverCount();
  console.log(`  capas antes ${before}, depois ${after}`);
  assert.ok(after >= before, `nenhuma capa apagada (antes ${before}, depois ${after})`);
  // A pré-carga também: corte no meio conta como falha de rede, não como "sem espaço".
  const cut = await warm(page, [`${EXTRA}/corta.png?pre`], keep);
  assert.equal(cut.failed, 1, JSON.stringify(cut));
  assert.ok((await coverCount()) >= before, 'pré-carga com corte não apaga capas');

  step('muitas trocas de tela com uma capa sempre quebrada: uma nova tentativa por vez');
  failing.add('sempre-quebrada');
  const broken = `${EXTRA}/sempre-quebrada.png`;
  await writeState(page, withReading(broken));
  await page.reload();
  await page.waitForSelector('.reading[data-id="r9"]');
  await until(async () => (await readingCover('r9')) === 'quebrada', 'capa sempre quebrada');
  for (let i = 0; i < 15; i += 1) {
    await page.evaluate(() => { location.hash = '#/estante'; });
    await page.waitForSelector('.reading', { state: 'detached' });
    await page.evaluate(() => { location.hash = '#/inicio'; });
    await page.waitForSelector('.reading[data-id="r9"]');
  }
  await until(async () => (await readingCover('r9')) === 'quebrada', 'quebrada depois das trocas');
  const timers = await page.evaluate(() => [...window.__coverTimers.values()].filter((s) => s.includes('scheduleRetry')).length);
  assert.ok(timers <= 1, `temporizadores de nova tentativa pendentes: ${timers}`);
  // Passada a pré-carga da abertura (1,5 s), só as novas tentativas pedem a capa: no
  // máximo duas em 8 s (2 s e 5 s depois), cada uma com até dois pedidos (CORS e o comum).
  await page.waitForTimeout(2500);
  const hitsBefore = hits.get(broken) || 0;
  await page.waitForTimeout(8000);
  const quietHits = (hits.get(broken) || 0) - hitsBefore;
  console.log(`  pedidos da capa quebrada em 8 s parado: ${quietHits}`);
  assert.ok(quietHits <= 4, `novas tentativas sem multiplicar: ${quietHits}`);
  failing.delete('sempre-quebrada');

  step('duas abas pedem a pré-carga ao mesmo tempo: cada capa baixada uma vez');
  const page2 = await context.newPage();
  watchErrors(page2);
  await page2.goto(BASE);
  await page2.waitForSelector('.reading');
  const both = Array.from({ length: 20 }, (_, i) => `${EXTRA}/dupla-${i}.png`);
  const [a, b] = await Promise.all([warm(page, both, keep), warm(page2, both, keep)]);
  assert.equal(a.failed + b.failed, 0);
  assert.equal(a.fetched + b.fetched, 20, `baixadas: ${a.fetched} + ${b.fetched}`);
  const perUrl = both.map((u) => hits.get(u) || 0);
  assert.ok(perUrl.every((n) => n === 1), `pedidos por capa: ${perUrl}`);
  await page2.close();

  assert.deepEqual(errors, []);
  console.log('\nOK: QA do cache de capas.');
} catch (err) {
  console.error(err);
  await page.screenshot({ path: join(SHOTS, 'qa-capas-erro.png') }).catch(() => {});
  process.exitCode = 1;
} finally {
  await browser.close();
  server.close();
  covers.close();
  rmSync(certDir, { recursive: true, force: true });
  rmSync(oldDir, { recursive: true, force: true });
}
