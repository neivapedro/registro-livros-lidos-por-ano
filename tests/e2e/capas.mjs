// Capas guardadas no aparelho (service worker, cache "leituras-capas"):
// - a pré-carga guarda as capas de todos os livros, inclusive as que não apareceram na tela;
// - sem rede (ou com o site da capa fora do ar) as capas continuam aparecendo, também na
//   ficha, e a cor do cartão sai da capa guardada (site com CORS);
// - capa que falhou volta sozinha, sem recarregar a tela (novas tentativas e evento online);
// - o cache das capas sobrevive à troca de versão do app;
// - o cache não passa do limite de capas e as dos livros ficam.
//
// Os "sites das capas" são um servidor HTTPS local (certificado gerado na hora com o openssl)
// em capas-google.localhost (sem CORS, como o Google: resposta opaca), capas-ol.localhost e
// capas-extra.localhost (com CORS, como a Open Library). Não dá para usar page.route aqui:
// os pedidos de capa agora saem do service worker, e a interceptação experimental do
// Playwright para service workers trava a troca de versão do service worker.
// Uso: node tests/e2e/capas.mjs

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

const APP = new URL('../../app/', import.meta.url).pathname;
const SHOTS = new URL('./screens/', import.meta.url).pathname;
mkdirSync(SHOTS, { recursive: true });
const TYPES = {
  '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json',
  '.webmanifest': 'application/manifest+json', '.svg': 'image/svg+xml', '.png': 'image/png', '.woff2': 'font/woff2',
};

// Troca de versão simulada: o sw.js servido passa a ter outro VERSION (o arquivo não muda).
let swVersion = null;
const server = createServer((req, res) => {
  const path = normalize(decodeURIComponent(new URL(req.url, 'http://x').pathname)).replace(/^\/+/, '');
  const file = join(APP, path || 'index.html');
  if (!file.startsWith(APP) || !existsSync(file)) {
    res.writeHead(404).end();
    return;
  }
  let body = readFileSync(file);
  if (path === 'sw.js' && swVersion) body = body.toString().replace(/const VERSION = '[^']+'/, `const VERSION = '${swVersion}'`);
  res.writeHead(200, { 'Content-Type': TYPES[extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
  res.end(body);
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const BASE = `http://localhost:${server.address().port}/`;

// ---------- Imagens de mentira (PNG de uma cor só) ----------

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
  ihdr[8] = 8; // bits por canal
  ihdr[9] = 2; // RGB
  const row = Buffer.concat([Buffer.from([0]), Buffer.from(Array.from({ length: w }, () => [r, g, b]).flat())]);
  const raw = Buffer.concat(Array.from({ length: h }, () => row));
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0)),
  ]);
}
const GOOGLE_PNG = png([180, 40, 40]);
const OL_COLOR = [40, 90, 200];
const OL_PNG = png(OL_COLOR);

// ---------- Sites das capas (HTTPS local) ----------

const certDir = mkdtempSync(join(tmpdir(), 'leituras-capas-'));
execSync(
  `openssl req -x509 -newkey rsa:2048 -nodes -keyout key.pem -out cert.pem -days 2 -subj /CN=capas.localhost`
  + ' -addext subjectAltName=DNS:capas-google.localhost,DNS:capas-ol.localhost,DNS:capas-extra.localhost',
  { cwd: certDir, stdio: 'ignore' },
);
// Pedidos recebidos por endereço; 'down' derruba todos; 'failing' derruba os que contêm o texto.
const hits = new Map();
let down = false;
const failing = new Set();
const covers = createHttpsServer({ key: readFileSync(join(certDir, 'key.pem')), cert: readFileSync(join(certDir, 'cert.pem')) }, (req, res) => {
  const host = String(req.headers.host || '').split(':')[0];
  const url = `https://${req.headers.host}${req.url}`;
  hits.set(url, (hits.get(url) || 0) + 1);
  if (down || [...failing].some((f) => url.includes(f))) {
    req.socket.destroy();
    return;
  }
  const google = host === 'capas-google.localhost';
  res.writeHead(200, { 'Content-Type': 'image/png', ...(google ? {} : { 'Access-Control-Allow-Origin': '*' }) });
  res.end(google ? GOOGLE_PNG : OL_PNG);
});
await new Promise((r) => covers.listen(0, '127.0.0.1', r));
const PORT = covers.address().port;
const GOOGLE = `https://capas-google.localhost:${PORT}`;
const OL = `https://capas-ol.localhost:${PORT}`;
const EXTRA = `https://capas-extra.localhost:${PORT}`;

// ---------- Livros ----------

const gUrl = (id) => `${GOOGLE}/books/content?id=${id}&printsec=frontcover&img=1&zoom=1&source=gbs_api`;
const olUrl = (n) => `${OL}/b/id/${n}-M.jpg`;
const PHOTO = `data:image/png;base64,${png([10, 160, 90], 4, 6).toString('base64')}`;
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
    ...Array.from({ length: 20 }, (_, i) => read(i, gUrl(`g${i}`))),
    ...Array.from({ length: 4 }, (_, i) => read(20 + i, olUrl(100 + i))),
    read(30, PHOTO),
    // Endereço antigo com http: guardado (e pedido pela tela) já com https.
    { ...base, id: 'w1', title: 'Quero Ler', status: 'quero', cover: `http://capas-ol.localhost:${PORT}/b/velho.jpg` },
  ],
};

// ---------- Navegador ----------

const browser = await playwright.chromium.launch({ args: ['--ignore-certificate-errors', '--no-proxy-server'] });
const context = await browser.newContext({
  viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, locale: 'pt-BR',
  reducedMotion: 'reduce', serviceWorkers: 'allow', ignoreHTTPSErrors: true,
});
// Busca de livros e qualquer outro site de verdade: fora do ar (não interessam aqui).
await context.route(/^https:\/\/(?!capas-[a-z]+\.localhost)/, (r) => r.abort());

const page = await context.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
page.on('console', (m) => {
  if (m.type() === 'error' && !/Failed to load resource|net::|CORS/.test(m.text())) errors.push(`console: ${m.text()}`);
});

const step = (msg) => console.log(`• ${msg}`);
const shot = (name) => page.screenshot({ path: join(SHOTS, `${name}.png`) });
const writeState = (data) => page.evaluate(async (d) => (await import('/js/db.js')).setItem('state', d), data);
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
/** Endereços no cache das capas (sem as anotações) e o tipo de cada resposta. */
const cachedCovers = () => page.evaluate(async () => {
  if (!(await caches.has('leituras-capas'))) return {};
  const cache = await caches.open('leituras-capas');
  const out = {};
  for (const req of await cache.keys()) {
    if (req.url.includes('__capas-em-uso__')) continue;
    out[req.url] = (await cache.match(req)).type;
  }
  return out;
});
const coverMeta = () => page.evaluate(async () => (await (await caches.open('leituras-capas')).match('/__capas-em-uso__')).json());
/** As capas que o app quer guardadas (a mesma conta da pré-carga). */
const wantedCovers = () => page.evaluate(async () => {
  const { coverUrlsFor } = await import('/js/cover-cache.js');
  const { getItem } = await import('/js/db.js');
  return coverUrlsFor((await getItem('state')).books);
});
/** Estado da capa do cartão "Lendo agora" do livro. */
const readingCover = (id) => page.evaluate((bookId) => {
  const img = document.querySelector(`.reading[data-id="${bookId}"] .rn-cover img.cover-img`);
  if (!img) return 'sem img';
  if (img.classList.contains('is-broken')) return 'quebrada';
  return img.complete && img.naturalWidth > 0 ? 'ok' : 'carregando';
}, id);
const brokenOnScreen = () => page.locator('img.cover-img.is-broken').count();

try {
  step('abre o app, grava os livros e espera o service worker assumir');
  await page.goto(BASE);
  await page.waitForSelector('.hero');
  await page.evaluate(() => navigator.serviceWorker.ready);
  await writeState(seed);
  await page.reload();
  await page.waitForSelector('.reading');
  await until(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller)), 'service worker no controle');

  step('pré-carga guarda as capas de todos os livros, inclusive as que não aparecem na tela');
  const wanted = await wantedCovers();
  assert.equal(wanted.length, 1 + 20 + 4 + 1, 'lendo + 20 "Google" + 4 "Open Library" + a do endereço antigo');
  assert.ok(wanted.includes(`${OL}/b/velho.jpg`), 'endereço antigo com https');
  assert.ok(!wanted.some((u) => u.startsWith('data:')), 'foto do celular fica de fora');
  const cached = await until(async () => {
    const c = await cachedCovers();
    return wanted.every((u) => u in c) && c;
  }, 'todas as capas no cache');
  assert.equal(cached[gUrl('g0')], 'opaque', 'site sem CORS: resposta opaca');
  assert.equal(cached[olUrl(100)], 'cors', 'site com CORS: guardada legível');
  const offscreen = await page.evaluate((urls) => urls.filter((u) => !document.querySelector(`img[src="${CSS.escape(u)}"]`)), wanted);
  assert.ok(offscreen.length >= 10, `capas guardadas sem terem aparecido na tela: ${offscreen.length}`);
  // Cada capa é pedida no máximo duas vezes (a pergunta de CORS e o pedido comum) e fica
  // anotado se o site deixa ler a imagem: as próximas capas dele vão direto.
  const perCover = [...hits].filter(([u]) => u.includes('id=g')).map(([, n]) => n);
  assert.ok(perCover.every((n) => n <= 2), `pedidos por capa: ${perCover}`);
  const meta = await coverMeta();
  assert.equal(meta.hosts['capas-google.localhost'].mode, 'no-cors');
  assert.equal(meta.hosts['capas-ol.localhost'].mode, 'cors');
  assert.equal(meta.keep.length, wanted.length);
  assert.equal(await readingCover('r1'), 'ok');
  await shot('capas-01-online');

  step('sem rede e com os sites das capas fora do ar: as capas continuam (Início)');
  down = true;
  await context.setOffline(true);
  await page.reload();
  await page.waitForSelector('.reading');
  await until(async () => (await readingCover('r1')) === 'ok', 'capa do "Lendo agora" offline');
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await page.waitForTimeout(800);
  const shown = await page.evaluate(() => [...document.querySelectorAll('img.cover-img')].map((img) => ({
    src: img.getAttribute('src'), ok: img.complete && img.naturalWidth > 0, broken: img.classList.contains('is-broken'),
  })));
  assert.ok(shown.length >= 5, `capas na tela: ${shown.length}`);
  assert.deepEqual(shown.filter((s) => s.broken), [], 'nenhuma capa quebrada offline');
  assert.ok(shown.filter((s) => s.ok).length >= 5, 'capas carregadas offline');
  await page.evaluate(() => window.scrollTo(0, 0));
  await shot('capas-02-offline');

  step('ficha offline: capa do livro e cor da capa (site com CORS) saem do cache');
  await page.goto(`${BASE}#/livro/l20`);
  await until(() => page.evaluate(() => {
    const img = document.querySelector('.ficha-cover img.cover-img');
    return img && img.complete && img.naturalWidth > 0 && !img.classList.contains('is-broken');
  }), 'capa da ficha offline');
  const expectedTint = await page.evaluate(async (rgb) => (await import('/js/cover-color.js')).tintFor(rgb), OL_COLOR);
  await until(() => page.evaluate((t) => document.querySelector('.ficha-hero')?.style.getPropertyValue('--tint') === t, expectedTint), 'cor da capa offline');

  step('capa nova com o site fora do ar: fica a capa desenhada e ela aparece sozinha quando volta');
  await context.setOffline(false);
  down = false;
  await page.goto(BASE);
  await page.waitForSelector('.reading');
  failing.add('id=novo1');
  const withNew = { ...seed, books: [{ ...base, id: 'r2', title: 'Novo Livro', status: 'lendo', startDate: '2026-10-05', currentPage: 10, cover: gUrl('novo1') }, ...seed.books] };
  await writeState(withNew);
  await page.reload();
  await page.waitForSelector('.reading[data-id="r2"]');
  await until(async () => (await readingCover('r2')) === 'quebrada', 'capa nova marcada como quebrada');
  await shot('capas-03-quebrada');
  failing.delete('id=novo1');
  // Sem recarregar e sem nenhum evento: a nova tentativa (2 s, 5 s...) traz a capa.
  await until(async () => (await readingCover('r2')) === 'ok', 'capa nova aparece sozinha', 12000);
  assert.equal(await brokenOnScreen(), 0);
  await until(async () => gUrl('novo1') in await cachedCovers(), 'capa nova guardada');
  await shot('capas-04-recuperada');

  step('rede volta (evento online): a capa que falhou aparece na hora');
  failing.add('id=novo2');
  await writeState({ ...withNew, books: [{ ...withNew.books[0], cover: gUrl('novo2') }, ...withNew.books.slice(1)] });
  await page.reload();
  await page.waitForSelector('.reading[data-id="r2"]');
  await until(async () => (await readingCover('r2')) === 'quebrada', 'capa novo2 quebrada');
  // Espera passar a primeira nova tentativa (2 s): a próxima seria só em 5 s.
  await page.waitForTimeout(2600);
  assert.equal(await readingCover('r2'), 'quebrada');
  await context.setOffline(true);
  failing.delete('id=novo2');
  await context.setOffline(false);
  const t0 = Date.now();
  await until(async () => (await readingCover('r2')) === 'ok', 'capa novo2 depois do online', 4000);
  console.log(`  apareceu ${Date.now() - t0} ms depois de a rede voltar`);

  step('nova versão do app: os arquivos antigos saem, as capas ficam');
  const before = await cachedCovers();
  swVersion = 'v9.9.9-teste';
  const reloaded = page.waitForEvent('load', { timeout: 20000 });
  await page.evaluate(async () => (await navigator.serviceWorker.getRegistration()).update());
  await reloaded; // o app recarrega sozinho com a versão nova (main.js)
  await until(() => page.evaluate(async () => {
    const keys = await caches.keys();
    return keys.includes('leituras-v9.9.9-teste') && !keys.includes('leituras-v1.4.1') && keys.includes('leituras-capas');
  }), 'cache da versão nova no lugar do antigo');
  const after = await cachedCovers();
  for (const url of Object.keys(before)) assert.ok(url in after, `capa mantida: ${url}`);
  down = true;
  await context.setOffline(true);
  await page.reload();
  await page.waitForSelector('.reading');
  await until(async () => (await readingCover('r1')) === 'ok' && (await readingCover('r2')) === 'ok', 'capas offline depois da troca de versão');
  await context.setOffline(false);
  down = false;

  step('limite do cache: muitas capas de fora não tiram as dos livros');
  const books = await wantedCovers();
  const extra = Array.from({ length: 450 }, (_, i) => `${EXTRA}/capa-${i}.jpg`);
  const reply = await page.evaluate(([urls, keep]) => new Promise((resolve) => {
    navigator.serviceWorker.addEventListener('message', (e) => { if (e.data?.type === 'capas-prontas') resolve(e.data); });
    navigator.serviceWorker.controller.postMessage({ type: 'capas', urls, keep });
  }), [extra, books]);
  const final = await cachedCovers();
  console.log(`  pré-carga: ${JSON.stringify(reply)}; no cache: ${Object.keys(final).length}`);
  assert.equal(Object.keys(final).length, 400, 'no limite');
  for (const url of books) assert.ok(url in final, `capa de livro mantida: ${url}`);
  const { usage, quota } = await page.evaluate(() => navigator.storage.estimate());
  console.log(`  uso ${(usage / 1048576).toFixed(0)} MB de ${(quota / 1048576).toFixed(0)} MB`);
  assert.ok(usage <= quota * 0.4, 'capas dentro da parte da cota');
  // A próxima abertura manda a lista dos livros de novo (as de fora passam a ser as primeiras a sair).
  await page.reload();
  await page.waitForSelector('.reading');
  await until(async () => (await coverMeta()).keep.length === books.length, 'lista das capas dos livros de volta');
  assert.equal(await readingCover('r1'), 'ok');

  assert.deepEqual(errors, []);
  console.log('\nOK: capas guardadas no aparelho.');
} catch (err) {
  console.error(err);
  await shot('capas-erro').catch(() => {});
  process.exitCode = 1;
} finally {
  await browser.close();
  server.close();
  covers.close();
  rmSync(certDir, { recursive: true, force: true });
}
