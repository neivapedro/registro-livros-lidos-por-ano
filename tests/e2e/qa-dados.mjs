// QA de segurança dos dados da 1.3: atualização a partir da 1.2.4, backups v1/v2,
// duas abas, toque duplo em Salvar, gravação interrompida e todas as telas em 375/320 px.
// Cada cenário roda num navegador limpo; falhas não param os outros.
// Uso: node tests/e2e/qa-dados.mjs   (precisa do Playwright instalado globalmente ou no projeto)

import { execSync } from 'node:child_process';
import { createServer } from 'node:http';
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { extname, join, normalize } from 'node:path';
import { createRequire } from 'node:module';
import assert from 'node:assert/strict';
import { normalizeState } from '../../app/js/store.js';

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

const server = createServer((req, res) => {
  const path = normalize(decodeURIComponent(new URL(req.url, 'http://x').pathname)).replace(/^\/+/, '');
  const file = join(APP, path || 'index.html');
  if (!file.startsWith(APP) || !existsSync(file)) {
    res.writeHead(404).end();
    return;
  }
  res.writeHead(200, { 'Content-Type': TYPES[extname(file)] || 'application/octet-stream' });
  res.end(readFileSync(file));
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
// 127.0.0.1 (e não localhost): sem service worker, cada cenário usa o código atual.
const BASE = `http://127.0.0.1:${server.address().port}/`;

const NOW = '2026-10-16T12:00:00';
const browser = await playwright.chromium.launch();
const contextOptions = {
  viewport: { width: 375, height: 812 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, locale: 'pt-BR',
  acceptDownloads: true,
};

// ---------- Ajudantes ----------

const readState = (p) => p.evaluate(async () => (await import('/js/db.js')).getItem('state'));
const writeState = (p, data) => p.evaluate(async (d) => (await import('/js/db.js')).setItem('state', d), data);
async function waitState(p, predicate, what = '') {
  let last;
  for (let i = 0; i < 50; i += 1) {
    last = await readState(p);
    if (last && predicate(last)) return last;
    await p.waitForTimeout(100);
  }
  throw new Error(`Estado salvo não chegou ao esperado ${what}: ${JSON.stringify(last)?.slice(0, 300)}`);
}
const onPage = (p, name) => p.waitForFunction((n) => document.getElementById('app').dataset.page === n, name);
const waitToast = (p, re) => p.waitForFunction((src) => new RegExp(src).test(document.getElementById('toast').textContent), re.source);

// Capa "tirada pelo celular" na 1.2: data URL de ~50 KB.
function photoCover(i) {
  return `data:image/jpeg;base64,${Buffer.alloc(37000, i).toString('base64')}`;
}

const GOOGLE_KEY = 'AIzaSyTESTE_chave_que_nao_vai_pro_backup';

// Estado como a 1.2.4 grava em 'leituras:v1' (esquema 1, nota inteira, sem diário).
const V1 = {
  version: 1,
  goals: { 2025: 15, 2026: 18 },
  defaultGoal: 14,
  customGenres: ['Poesia', 'Mangá'],
  lastBackupAt: '2026-09-30T21:15:00.000Z',
  books: [
    {
      id: 'l1', title: 'Sapiens', authors: 'Yuval Noah Harari', pages: 464, cover: photoCover(1), isbn: '9788525432186',
      status: 'lido', startDate: '2026-08-01', endDate: '2026-08-28', currentPage: null, currentPercent: null, format: 'fisico',
      genre: 'História', rating: 5, favorite: true, notes: 'Releitura obrigatória.\nCap. 3 é o melhor.', dropReason: '', reread: false,
      createdAt: '2026-08-01T10:00:00.000Z', updatedAt: '2026-08-28T22:00:00.000Z',
    },
    {
      id: 'l2', title: 'Poemas', authors: 'Fernando Pessoa', pages: 200, cover: 'https://covers.openlibrary.org/b/id/1-M.jpg', isbn: '',
      status: 'lido', startDate: '2025-03-01', endDate: '2025-03-20', currentPage: null, currentPercent: null, format: 'fisico',
      genre: 'Poesia', rating: 3, favorite: false, notes: '', dropReason: '', reread: false,
      createdAt: '2025-03-01T10:00:00.000Z', updatedAt: '2025-03-20T10:00:00.000Z',
    },
    {
      id: 'r1', title: 'Fora de Série', authors: 'Malcolm Gladwell', pages: 304, cover: photoCover(2), isbn: '',
      status: 'lendo', startDate: '2026-10-02', endDate: null, currentPage: 120, currentPercent: null, format: 'fisico',
      genre: 'Desenvolvimento pessoal', rating: null, favorite: false, notes: 'Regra das 10 mil horas.', dropReason: '', reread: false,
      createdAt: '2026-10-02T10:00:00.000Z', updatedAt: '2026-10-10T10:00:00.000Z',
    },
    {
      id: 'k1', title: 'Duna', authors: 'Frank Herbert', pages: 680, cover: null, isbn: '',
      status: 'lendo', startDate: '2026-09-20', endDate: null, currentPage: null, currentPercent: 37, format: 'kindle',
      genre: 'Ficção', rating: null, favorite: false, notes: '', dropReason: '', reread: false,
      createdAt: '2026-09-20T10:00:00.000Z', updatedAt: '2026-10-12T10:00:00.000Z',
    },
    {
      id: 'w1', title: 'O Gerente Minuto', authors: 'Ken Blanchard', pages: null, cover: null, isbn: '',
      status: 'quero', startDate: null, endDate: null, currentPage: null, currentPercent: null, format: 'fisico',
      genre: 'Gestão', rating: null, favorite: false, notes: '', dropReason: '', reread: false,
      createdAt: '2026-09-01T10:00:00.000Z', updatedAt: '2026-09-01T10:00:00.000Z',
    },
    {
      id: 'd1', title: 'Livro Chato', authors: 'Alguém', pages: 300, cover: photoCover(3), isbn: '',
      status: 'abandonado', startDate: '2026-06-01', endDate: '2026-06-10', currentPage: 80, currentPercent: null, format: 'fisico',
      genre: 'Mangá', rating: null, favorite: false, notes: 'Obs.', dropReason: 'Não prendeu a atenção.', reread: false,
      createdAt: '2026-06-01T10:00:00.000Z', updatedAt: '2026-06-10T10:00:00.000Z',
    },
    {
      id: 'l3', title: 'Sapiens', authors: 'Yuval Noah Harari', pages: 464, cover: photoCover(1), isbn: '9788525432186',
      status: 'lendo', startDate: '2026-10-14', endDate: null, currentPage: 10, currentPercent: null, format: 'fisico',
      genre: 'História', rating: null, favorite: false, notes: '', dropReason: '', reread: true,
      createdAt: '2026-10-14T10:00:00.000Z', updatedAt: '2026-10-14T10:00:00.000Z',
    },
  ],
};

// Estado v2 com todos os campos novos.
const V2 = normalizeState({
  ...V1,
  version: 2,
  upNext: ['w1', 'w2'],
  pageGoals: { 2026: 6000 },
  books: [
    ...V1.books.map((b) => (b.id === 'r1' ? {
      ...b, series: 'Gladwell', seriesNumber: 2.5, tags: ['emprestado', 'clube'], targetDate: '2026-11-30',
      quotes: [{ id: 'q1', text: 'A prática leva à perfeição.', page: 42, percent: null, note: 'Ver cap. 2', createdAt: '2026-10-05T10:00:00.000Z' }],
      journal: [
        { date: '2026-10-05', from: 0, to: 60, unit: 'page', note: 'Começo lento' },
        { date: '2026-10-10', from: 60, to: 120, unit: 'page', note: '', minutes: 45 },
      ],
    } : b)).map((b) => (b.id === 'l2' ? { ...b, rating: 3.5, tags: ['poesia'] } : b))
      .map((b) => (b.id === 'k1' ? { ...b, journal: [{ date: '2026-10-12', from: 30, to: 37, unit: 'percent', note: '', minutes: 20 }] } : b)),
    { id: 'w2', title: 'Pai Rico', authors: 'Kiyosaki', status: 'quero', series: 'Pai Rico', seriesNumber: 1, tags: ['finanças'], createdAt: '2026-09-02T10:00:00.000Z', updatedAt: '2026-09-02T10:00:00.000Z' },
  ],
});

const results = [];
let currentErrors = [];

async function newPage(ctx) {
  const p = await ctx.newPage();
  await p.clock.setFixedTime(new Date(NOW));
  p.on('pageerror', (e) => currentErrors.push(`pageerror: ${e.message}`));
  p.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) currentErrors.push(`console: ${m.text()}`); });
  p.on('dialog', (d) => d.accept());
  await p.route('https://www.googleapis.com/**', (r) => r.fulfill({ status: 429, json: { error: { code: 429 } } }));
  await p.route('https://openlibrary.org/**', (r) => r.fulfill({ json: { docs: [] } }));
  await p.route('https://brasilapi.com.br/**', (r) => r.fulfill({ status: 404, json: { message: 'ISBN não encontrado' } }));
  await p.route('https://covers.openlibrary.org/**', (r) => r.abort());
  return p;
}

async function openWith(p, data) {
  await p.goto(`${BASE}manifest.webmanifest`);
  if (data) await writeState(p, data);
  await p.goto(BASE);
  await p.waitForSelector('.hero');
}

async function exportBackup(p, name) {
  await p.goto(`${BASE}#/ajustes`);
  await onPage(p, 'ajustes');
  const dl = p.waitForEvent('download');
  await p.click('[data-action="export-backup"]');
  const file = join(SHOTS, name);
  await (await dl).saveAs(file);
  return file;
}

async function scenario(name, fn) {
  if (process.env.QA_ONLY && !new RegExp(process.env.QA_ONLY, 'i').test(name)) return;
  currentErrors = [];
  const ctx = await browser.newContext(contextOptions);
  try {
    await fn(ctx);
    assert.deepEqual(currentErrors, [], 'erros no console');
    results.push({ name, ok: true });
    console.log(`✓ ${name}`);
  } catch (err) {
    results.push({ name, ok: false });
    console.log(`✗ ${name}\n    ${err.message.split('\n').join('\n    ')}`);
    if (currentErrors.length) console.log(`    erros: ${currentErrors.join(' | ')}`);
    const pages = ctx.pages();
    if (pages.length) await pages[0].screenshot({ path: join(SHOTS, `qa-dados-falha-${name.replace(/[^a-z0-9]+/gi, '-')}.png`), fullPage: true }).catch(() => {});
  } finally {
    await ctx.close();
  }
}

/** Sem a data de atualização (muda a cada gravação). */
const withoutStamp = (books) => books.map(({ updatedAt, ...b }) => b);

// ---------- Atualização a partir da 1.2.4 ----------

await scenario('1.2.4 → 1.3: migra tudo, apaga a chave antiga só depois de conferir, recarregar não duplica', async (ctx) => {
  const p = await newPage(ctx);
  await p.goto(`${BASE}manifest.webmanifest`);
  await p.evaluate(([data, key]) => {
    localStorage.setItem('leituras:v1', JSON.stringify(data));
    localStorage.setItem('leituras:googleBooksKey', key);
  }, [V1, GOOGLE_KEY]);
  // Registra a ordem: a chave antiga só pode sair depois de a cópia ser lida de volta.
  await p.addInitScript(() => {
    window.__log = [];
    const get = IDBObjectStore.prototype.get;
    IDBObjectStore.prototype.get = function (...a) { window.__log.push('idb-get'); return get.apply(this, a); };
    const put = IDBObjectStore.prototype.put;
    IDBObjectStore.prototype.put = function (...a) { window.__log.push('idb-put'); return put.apply(this, a); };
    const remove = Storage.prototype.removeItem;
    Storage.prototype.removeItem = function (k) { window.__log.push(`ls-remove:${k}`); return remove.call(this, k); };
  });
  await p.goto(BASE);
  await p.waitForSelector('.hero');
  const log = await p.evaluate(() => window.__log);
  const removeAt = log.indexOf('ls-remove:leituras:v1');
  assert.ok(removeAt > log.indexOf('idb-put') && removeAt > log.indexOf('idb-get') && log.indexOf('idb-get') > log.indexOf('idb-put'), `ordem: ${log.join(', ')}`);
  assert.equal(await p.evaluate(() => localStorage.getItem('leituras:v1')), null);
  assert.equal(await p.evaluate(() => localStorage.getItem('leituras:indexeddb')), '1');
  assert.deepEqual(await readState(p), V1, 'cópia idêntica no IndexedDB');
  assert.match(await p.textContent('.ring-center'), /1\s*de 18 livros/);
  assert.equal(await p.locator('.reading').count(), 3);
  for (let i = 0; i < 2; i += 1) {
    await p.reload();
    await p.waitForSelector('.hero');
  }
  assert.deepEqual(await readState(p), V1, 'recarregar não muda nada');
  assert.equal(await p.locator('.reading').count(), 3);

  // Primeira gravação na 1.3 (progresso no cartão): os outros livros ficam intactos.
  await p.click('.reading:has-text("Fora de Série") [data-action="update-page"]');
  await p.fill('#progress-input', '150');
  await p.press('#progress-input', 'Enter');
  const after = await waitState(p, (s) => s.version === 2 && s.books.find((b) => b.id === 'r1').currentPage === 150);
  assert.equal(after.books.length, V1.books.length, 'sem duplicar');
  const expected = normalizeState(V1);
  for (const b of expected.books) {
    const got = after.books.find((x) => x.id === b.id);
    if (b.id === 'r1') {
      assert.deepEqual(got.journal, [{ date: '2026-10-16', from: 120, to: 150, unit: 'page', note: '' }]);
      continue;
    }
    assert.deepEqual(got, b, `livro ${b.id} intacto`);
  }
  assert.equal(after.books.find((b) => b.id === 'l1').cover, V1.books[0].cover, 'capa da foto');
  assert.equal(after.books.find((b) => b.id === 'k1').currentPercent, 37);
  assert.equal(after.books.find((b) => b.id === 'd1').dropReason, 'Não prendeu a atenção.');
  assert.deepEqual(after.goals, V1.goals);
  assert.equal(after.defaultGoal, 14);
  assert.deepEqual(after.customGenres, V1.customGenres);
  assert.equal(after.lastBackupAt, V1.lastBackupAt);
  assert.equal(await p.evaluate(() => localStorage.getItem('leituras:v1')), null, 'nada volta para a chave antiga');

  // Backup: tudo dentro, menos a chave do Google.
  const file = await exportBackup(p, 'qa-dados-backup-migrado.json');
  const text = readFileSync(file, 'utf8');
  assert.doesNotMatch(text, /AIza|googleBooksKey/, 'chave do Google fora do backup');
  const parsed = JSON.parse(text);
  assert.equal(parsed.schemaVersion, 2);
  assert.equal(parsed.data.books.length, V1.books.length);
  assert.equal(await p.evaluate(() => localStorage.getItem('leituras:googleBooksKey')), GOOGLE_KEY, 'chave continua no aparelho');
});

await scenario('backup v1 da 1.2.4 (capas, Kindle, abandonado) importa num app novo', async (ctx) => {
  const p = await newPage(ctx);
  await openWith(p, null);
  const file = join(SHOTS, 'qa-dados-backup-v1.json');
  writeFileSync(file, JSON.stringify({ app: 'leituras', schemaVersion: 1, exportedAt: '2026-09-30T21:15:00.000Z', data: V1 }, null, 2));
  await p.goto(`${BASE}#/ajustes`);
  await onPage(p, 'ajustes');
  await p.setInputFiles('[data-import]', file);
  await waitToast(p, /Backup importado/);
  const st = await waitState(p, (s) => s.books.length === V1.books.length);
  assert.deepEqual(st.books, normalizeState(V1).books);
  assert.deepEqual(st.goals, V1.goals);
  assert.deepEqual(st.customGenres, V1.customGenres);
  assert.equal(st.lastBackupAt, V1.lastBackupAt);
});

await scenario('backup v2 ida e volta (exportar → apagar → importar) preserva todos os campos novos', async (ctx) => {
  const p = await newPage(ctx);
  await p.goto(`${BASE}manifest.webmanifest`);
  await p.evaluate((key) => localStorage.setItem('leituras:googleBooksKey', key), GOOGLE_KEY);
  await openWith(p, V2);
  const file = await exportBackup(p, 'qa-dados-backup-v2.json');
  const text = readFileSync(file, 'utf8');
  assert.doesNotMatch(text, /AIza|googleBooksKey/, 'chave do Google fora do backup');
  const exported = JSON.parse(text).data;
  const before = await readState(p);
  // O arquivo tem exatamente o que está salvo (a data do último backup muda depois de exportar).
  assert.deepEqual(exported, { ...before, lastBackupAt: V2.lastBackupAt });
  assert.notEqual(before.lastBackupAt, V2.lastBackupAt);
  assert.deepEqual(withoutStamp(before.books), withoutStamp(V2.books));
  await p.click('[data-action="wipe-data"]');
  await waitState(p, (s) => s.books.length === 0);
  await p.goto(`${BASE}#/ajustes`);
  await onPage(p, 'ajustes');
  await p.setInputFiles('[data-import]', file);
  await waitToast(p, /Backup importado/);
  const st = await waitState(p, (s) => s.books.length === V2.books.length);
  assert.deepEqual(st, exported);
  const r1 = st.books.find((b) => b.id === 'r1');
  assert.deepEqual(r1.tags, ['emprestado', 'clube']);
  assert.equal(r1.series, 'Gladwell');
  assert.equal(r1.seriesNumber, 2.5);
  assert.equal(r1.targetDate, '2026-11-30');
  assert.equal(r1.quotes[0].text, 'A prática leva à perfeição.');
  assert.equal(r1.journal[1].minutes, 45);
  assert.equal(st.books.find((b) => b.id === 'l2').rating, 3.5);
  assert.deepEqual(st.upNext, ['w1', 'w2']);
  assert.deepEqual(st.pageGoals, { 2026: 6000 });
});

// ---------- Ajustes: redesenho assíncrono (causa da falha intermitente do smoke) ----------

await scenario('Ajustes: importar logo ao abrir a tela funciona (espaço usado chega depois)', async (ctx) => {
  const p = await newPage(ctx);
  await openWith(p, { version: 2, books: [] });
  const file = join(SHOTS, 'qa-dados-backup-v1.json');
  writeFileSync(file, JSON.stringify({ app: 'leituras', schemaVersion: 1, data: { books: [{ id: 'x', title: 'X', status: 'quero' }] } }));
  for (let delay = 0; delay < 16; delay += 1) {
    await p.evaluate((d) => {
      const s = navigator.storage;
      s.__estimate ||= s.estimate.bind(s);
      s.estimate = () => new Promise((r) => { setTimeout(() => r(s.__estimate()), d); });
    }, delay);
    await writeState(p, { version: 2, books: [] });
    await p.goto(`${BASE}#/inicio`);
    await p.reload();
    await p.waitForSelector('.hero');
    await p.goto(`${BASE}#/ajustes`);
    await p.setInputFiles('[data-import]', file);
    await waitState(p, (s) => s.books.length === 1, `(atraso de ${delay} ms)`);
  }
  // O que está sendo digitado não some quando a informação do espaço chega.
  await p.evaluate(() => {
    const s = navigator.storage;
    s.__estimate ||= s.estimate.bind(s);
    s.estimate = () => new Promise((r) => { setTimeout(() => r(s.__estimate()), 400); });
  });
  await p.goto(`${BASE}#/inicio`);
  await p.goto(`${BASE}#/ajustes`);
  await p.fill('#gb-key', 'AIza-digitando');
  await p.waitForTimeout(700);
  assert.equal(await p.inputValue('#gb-key'), 'AIza-digitando');
  assert.match(await p.textContent('.storage-info'), /Espaço usado/);
  assert.equal(await p.locator('.storage-info').count(), 1);
});

// ---------- Duas abas ----------

await scenario('duas abas: aviso perdido (aba parada) — ao voltar, relê antes de gravar por cima', async (ctx) => {
  const a = await newPage(ctx);
  await openWith(a, V2);
  const b = await newPage(ctx);
  await b.goto(BASE);
  await b.waitForSelector('.hero');
  // A grava direto no aparelho, sem aviso (como se B estivesse congelada e perdesse a mensagem).
  const changed = await readState(a);
  changed.books = changed.books.map((x) => (x.id === 'w1' ? { ...x, title: 'O Gerente Minuto (editado em A)' } : x));
  await writeState(a, changed);
  // B volta para a frente.
  await b.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'visible' });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await b.waitForTimeout(300);
  await b.goto(`${BASE}#/estante?aba=quero`);
  await onPage(b, 'estante');
  assert.match(await b.textContent('#app'), /editado em A/, 'B releu os dados ao voltar');
  await b.goto(`${BASE}#/inicio`);
  await onPage(b, 'inicio');
  // B altera outro livro: a edição de A continua lá.
  await b.click('.reading:has-text("Duna") [data-action="update-page"]');
  await b.fill('#progress-input', '40');
  await b.press('#progress-input', 'Enter');
  const st = await waitState(b, (s) => s.books.find((x) => x.id === 'k1').currentPercent === 40);
  assert.equal(st.books.find((x) => x.id === 'w1').title, 'O Gerente Minuto (editado em A)');
  // E A recebe o aviso de B.
  await a.waitForFunction(() => /40% · no Kindle/.test(document.body.textContent));
});

await scenario('duas abas: falha ao reler (IndexedDB fechou) não esvazia a tela nem bloqueia gravações', async (ctx) => {
  const a = await newPage(ctx);
  await openWith(a, V2);
  const b = await newPage(ctx);
  await b.goto(BASE);
  await b.waitForSelector('.hero');
  await b.evaluate(() => {
    window.__get = IDBObjectStore.prototype.get;
    IDBObjectStore.prototype.get = function () { throw new DOMException('fechou', 'InvalidStateError'); };
  });
  await a.click('.reading:has-text("Duna") [data-action="update-page"]');
  await a.fill('#progress-input', '41');
  await a.press('#progress-input', 'Enter');
  await waitState(a, (s) => s.books.find((x) => x.id === 'k1').currentPercent === 41);
  await b.waitForTimeout(300);
  assert.equal(await b.locator('.reading').count(), 3, 'B continua com os livros na tela');
  await b.evaluate(() => { IDBObjectStore.prototype.get = window.__get; });
  await b.click('.reading:has-text("Fora de Série") [data-action="update-page"]');
  await b.fill('#progress-input', '130');
  await b.press('#progress-input', 'Enter');
  await waitState(b, (s) => s.books.find((x) => x.id === 'r1').currentPage === 130);
});

// ---------- Toque duplo ----------

await scenario('toque duplo em Salvar não cria o livro duas vezes (nem duas releituras)', async (ctx) => {
  const p = await newPage(ctx);
  await openWith(p, V2);
  await p.click('.nav-add');
  await onPage(p, 'novo');
  await p.fill('#f-title', 'Livro do toque duplo');
  await p.evaluate(() => {
    const btn = document.querySelector('#book-form .btn-primary');
    btn.click();
    btn.click();
    document.querySelector('.form-top [type="submit"]')?.click();
  });
  await onPage(p, 'inicio');
  await p.waitForTimeout(300);
  const st = await readState(p);
  assert.equal(st.books.filter((b) => b.title === 'Livro do toque duplo').length, 1);
  assert.equal(st.books.length, V2.books.length + 1);

  await p.goto(`${BASE}#/livro/l2/editar`);
  await onPage(p, 'livro');
  await p.evaluate(() => {
    const btn = document.querySelector('[data-action="reread"]');
    btn.click();
    btn.click();
  });
  await onPage(p, 'inicio');
  await p.waitForTimeout(300);
  const st2 = await readState(p);
  assert.equal(st2.books.filter((b) => b.title === 'Poemas').length, 2, 'original + uma releitura');
});

// ---------- Gravação interrompida ----------

await scenario('gravação que falha: cópia de resgate é aplicada na próxima abertura', async (ctx) => {
  const p = await newPage(ctx);
  await openWith(p, V2);
  await p.evaluate(() => {
    IDBObjectStore.prototype.put = function () { throw new DOMException('Sem espaço', 'QuotaExceededError'); };
  });
  await p.click('.reading:has-text("Duna") [data-action="update-page"]');
  await p.fill('#progress-input', '55');
  await p.press('#progress-input', 'Enter');
  await waitToast(p, /Não foi possível salvar/);
  const rescue = JSON.parse(await p.evaluate(() => localStorage.getItem('leituras:pendente')));
  assert.deepEqual(rescue.changed.map((b) => b.id), ['k1'], 'só o livro alterado vai para a cópia');
  assert.equal((await readState(p)).books.find((b) => b.id === 'k1').currentPercent, 37, 'não gravou');
  await p.close();
  const q = await newPage(ctx);
  await q.goto(BASE);
  await q.waitForSelector('.hero');
  await q.waitForFunction(() => /55% · no Kindle/.test(document.body.textContent));
  const st = await waitState(q, (s) => s.books.find((b) => b.id === 'k1').currentPercent === 55);
  assert.equal(st.books.length, V2.books.length);
  assert.deepEqual(withoutStamp(st.books.filter((b) => b.id !== 'k1')), withoutStamp(V2.books.filter((b) => b.id !== 'k1')));
  await q.waitForFunction(() => localStorage.getItem('leituras:pendente') === null);
});

await scenario('app sai da tela no meio da gravação: cópia guardada e apagada quando a gravação termina', async (ctx) => {
  const p = await newPage(ctx);
  await openWith(p, V2);
  await p.click('.reading:has-text("Duna") [data-action="update-page"]');
  await p.fill('#progress-input', '60');
  const saw = await p.evaluate(() => {
    document.querySelector('.progress-edit button[type="submit"]').click();
    window.dispatchEvent(new PageTransitionEvent('pagehide', { persisted: false }));
    return localStorage.getItem('leituras:pendente');
  });
  assert.ok(saw && JSON.parse(saw).changed[0].currentPercent === 60, 'cópia guardada durante a gravação');
  await p.waitForFunction(() => localStorage.getItem('leituras:pendente') === null);
  assert.equal((await readState(p)).books.find((b) => b.id === 'k1').currentPercent, 60);
  // Sem gravação em andamento, sair da tela não escreve nada no localStorage.
  await p.evaluate(() => window.dispatchEvent(new PageTransitionEvent('pagehide', { persisted: false })));
  assert.equal(await p.evaluate(() => localStorage.getItem('leituras:pendente')), null);
});

// ---------- Todas as telas em 375 e 320 px ----------

await scenario('todas as telas em 375 e 320 px: sem erro, sem sobra à direita, campos >= 16 px', async (ctx) => {
  const p = await newPage(ctx);
  const extra = ['Hábitos Atômicos', 'Dom Casmurro', '1984', 'Essencialismo', 'O Poder do Hábito', 'A Meta'].map((title, i) => ({
    id: `x${i}`, title, authors: `Autor ${i}`, pages: 200 + i * 40, status: 'lido', format: i % 2 ? 'kindle' : 'fisico',
    startDate: `2026-0${i + 1}-02`, endDate: `2026-0${i + 1}-20`, rating: 3 + (i % 3) * 0.5 + 0.5, genre: ['Ficção', 'Gestão', 'História'][i % 3],
    tags: i % 2 ? ['clube'] : [], favorite: i === 5, createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z',
  }));
  await openWith(p, { ...V2, books: [...V2.books, ...extra] });
  const problems = [];
  async function check(label) {
    const width = p.viewportSize().width;
    const overflow = await p.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    if (overflow > 0) problems.push(`${label} @${width}: ${overflow}px sobrando`);
    const small = await p.evaluate(() => [...document.querySelectorAll('input:not([type=file]):not(.sr-only), select, textarea')]
      .filter((el) => el.offsetParent && parseFloat(getComputedStyle(el).fontSize) < 16).map((el) => el.id || el.outerHTML.slice(0, 50)));
    if (small.length) problems.push(`${label} @${width}: letra < 16px em ${small.join(', ')}`);
    await p.screenshot({ path: join(SHOTS, `qa-dados-${width}-${label.replace(/[^a-z0-9]+/gi, '-')}.png`), fullPage: true });
  }
  async function visit(hash, page, label = hash) {
    await p.goto(`${BASE}#/${hash}`);
    await onPage(p, page);
    await p.waitForTimeout(80);
    await check(label);
  }
  for (const width of [375, 320]) {
    await p.setViewportSize({ width, height: 740 });
    await visit('inicio', 'inicio');
    await p.click('.reading:has-text("Fora de Série") [data-action="update-page"]');
    await check('inicio-editando-pagina');
    for (const aba of ['quero', 'lendo', 'lido', 'abandonado']) await visit(`estante?aba=${aba}`, 'estante', `estante-${aba}`);
    await visit('buscar', 'buscar');
    await p.fill('#q', 'sapiens');
    await check('buscar-sapiens');
    await visit('resumo/2026', 'resumo');
    await visit('resumo/todos', 'resumo', 'resumo-todos');
    await visit('ajustes', 'ajustes');
    await visit('novo', 'novo');
    await visit('novo?status=lendo', 'novo', 'novo-lendo');
    for (const aba of ['dados', 'diario', 'trechos']) await visit(`livro/r1?aba=${aba}`, 'livro', `livro-${aba}`);
    await p.click('[data-action="quote-new"]');
    await check('livro-trechos-novo');
    // Ficha do livro (v1.4) e edição, por status.
    await visit('livro/r1', 'livro', 'ficha-lido');
    await visit('livro/k1', 'livro', 'ficha-kindle');
    await visit('livro/d1', 'livro', 'ficha-abandonado');
    await visit('livro/k1/editar', 'livro', 'livro-kindle');
    await visit('livro/d1/editar', 'livro', 'livro-abandonado');
    await visit('trechos', 'trechos');
    await visit('retro/2026', 'retro', 'retro-1');
    for (let i = 0; i < 4; i += 1) await p.click('.tap-next');
    await check('retro-5');
    await visit('inicio', 'inicio', 'inicio-de-novo');
    await p.click('.reading:has-text("Fora de Série") [data-action="start-timer"]');
    await onPage(p, 'ler');
    await check('ler');
    await p.click('[data-action="timer-stop"]');
    await check('ler-parar');
    await p.click('[data-action="timer-back"]');
    await p.click('[data-action="timer-cancel"]');
    await onPage(p, 'inicio');
  }
  assert.deepEqual(problems, []);
});

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length} de ${results.length} cenários passaram.`);
if (failed.length) process.exitCode = 1;
await browser.close();
server.close();
