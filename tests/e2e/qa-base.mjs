// Teste exploratório da versão 1.3 (armazenamento, diário, meia estrela, busca).
// Cada cenário roda num navegador limpo, com tela de celular; falhas não param os outros.
// Uso: node tests/e2e/qa-base.mjs   (precisa do Playwright instalado globalmente ou no projeto)

import { execSync } from 'node:child_process';
import { createServer } from 'node:http';
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { extname, join, normalize } from 'node:path';
import { createRequire } from 'node:module';
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
  viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, locale: 'pt-BR',
  acceptDownloads: true,
};

// ---------- Ajudantes ----------

const STATE_KEY = 'state';
const readState = (p) => p.evaluate(async (key) => (await import('/js/db.js')).getItem(key), STATE_KEY);
const writeState = (p, data) => p.evaluate(async ([key, d]) => (await import('/js/db.js')).setItem(key, d), [STATE_KEY, data]);
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
const toastText = (p) => p.textContent('#toast');
const waitToast = (p, re) => p.waitForFunction((src) => new RegExp(src).test(document.getElementById('toast').textContent), re.source);

function book(id, extra = {}) {
  return {
    id, title: `Livro ${id}`, authors: 'Autor', pages: 300, status: 'lido', startDate: '2026-01-01', endDate: '2026-02-01',
    format: 'fisico', rating: 4, genre: 'Ficção', favorite: false, notes: '', cover: null, isbn: '',
    createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z', ...extra,
  };
}
function stateWith(books, extra = {}) {
  return { version: 2, books, goals: {}, defaultGoal: 12, customGenres: [], lastBackupAt: '2026-10-10T10:00:00.000Z', upNext: [], pageGoals: {}, ...extra };
}
// Capa "tirada pelo celular": data URL de ~50 KB.
function fakeCover(i) {
  const body = Buffer.alloc(37000, i).toString('base64');
  return `data:image/jpeg;base64,${body}`;
}

const results = [];
let currentErrors = [];

async function newPage(ctx, { mocks = true } = {}) {
  const p = await ctx.newPage();
  await p.clock.setFixedTime(new Date(NOW));
  p.on('pageerror', (e) => currentErrors.push(`pageerror: ${e.message}`));
  p.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) currentErrors.push(`console: ${m.text()}`); });
  p.on('dialog', (d) => d.accept());
  if (mocks) {
    await p.route('https://www.googleapis.com/**', (r) => r.fulfill({ status: 429, json: { error: { code: 429 } } }));
    await p.route('https://openlibrary.org/**', (r) => r.fulfill({ json: { docs: [] } }));
    await p.route('https://brasilapi.com.br/**', (r) => r.fulfill({ status: 404, json: { message: 'ISBN não encontrado' } }));
    await p.route('https://covers.openlibrary.org/**', (r) => r.abort());
  }
  return p;
}

/** Abre o app já com estes dados no IndexedDB. */
async function openWith(p, data) {
  await p.goto(`${BASE}manifest.webmanifest`);
  if (data) await writeState(p, data);
  await p.goto(BASE);
  await p.waitForSelector('.hero');
}

async function scenario(name, fn, { allowErrors = false } = {}) {
  // QA_ONLY='trecho do nome' roda só os cenários que combinam.
  if (process.env.QA_ONLY && !new RegExp(process.env.QA_ONLY, 'i').test(name)) return;
  currentErrors = [];
  const ctx = await browser.newContext(contextOptions);
  const started = Date.now();
  try {
    await fn(ctx);
    if (!allowErrors) assert.deepEqual(currentErrors, [], 'erros no console');
    results.push({ name, ok: true, ms: Date.now() - started });
    console.log(`✓ ${name}`);
  } catch (err) {
    results.push({ name, ok: false, error: err.message });
    console.log(`✗ ${name}\n    ${err.message.split('\n').join('\n    ')}`);
    if (currentErrors.length) console.log(`    erros: ${currentErrors.join(' | ')}`);
    const pages = ctx.pages();
    if (pages.length) await pages[0].screenshot({ path: join(SHOTS, `qa-falha-${name.replace(/[^a-z0-9]+/gi, '-')}.png`), fullPage: true }).catch(() => {});
  } finally {
    await ctx.close();
  }
}

// ---------- Armazenamento ----------

await scenario('migração: 30 livros com capas (data URL ~50 KB) do localStorage para o IndexedDB', async (ctx) => {
  const legacy = stateWith(Array.from({ length: 30 }, (_, i) => book(`m${i}`, { cover: fakeCover(i), rating: (i % 5) + 1 })), { version: 1 });
  delete legacy.upNext;
  delete legacy.pageGoals;
  const p = await newPage(ctx);
  await p.goto(`${BASE}manifest.webmanifest`);
  await p.evaluate((d) => localStorage.setItem('leituras:v1', JSON.stringify(d)), legacy);
  await p.goto(`${BASE}#/estante?aba=lido`);
  await p.waitForSelector('.book-row');
  assert.equal(await p.locator('.book-row').count(), 30);
  assert.equal(await p.evaluate(() => localStorage.getItem('leituras:v1')), null, 'chave antiga removida');
  assert.equal(await p.evaluate(() => localStorage.getItem('leituras:indexeddb')), '1', 'marca do IndexedDB');
  assert.deepEqual(await readState(p), legacy, 'cópia idêntica');
  await p.reload();
  await p.waitForSelector('.book-row');
  assert.equal(await p.locator('.book-row').count(), 30, 'segunda abertura lê do IndexedDB');
});

const BREAK_IDB = `
  if (localStorage.getItem('qa:idb') === 'throw') {
    IDBFactory.prototype.open = function () { throw new Error('IndexedDB quebrado (teste)'); };
  } else if (localStorage.getItem('qa:idb') === 'hang') {
    IDBFactory.prototype.open = function () { return {}; };
  } else if (localStorage.getItem('qa:idb') === 'mismatch') {
    const put = IDBObjectStore.prototype.put;
    IDBObjectStore.prototype.put = function (value, key) {
      return put.call(this, value && value.books ? { ...value, books: value.books.slice(1) } : value, key);
    };
  }
`;

await scenario('IndexedDB quebrado na primeira abertura: segue no localStorage sem perder dados', async (ctx) => {
  await ctx.addInitScript(BREAK_IDB);
  const p = await newPage(ctx);
  await p.goto(`${BASE}manifest.webmanifest`);
  const legacy = stateWith([book('a'), book('b', { status: 'lendo', endDate: null, rating: null, currentPage: 10 })], { version: 1 });
  await p.evaluate((d) => { localStorage.setItem('qa:idb', 'throw'); localStorage.setItem('leituras:v1', JSON.stringify(d)); }, legacy);
  await p.goto(BASE);
  await p.waitForSelector('.hero');
  assert.match(await p.textContent('.ring-center'), /1\s*de 12/);
  await p.click('[data-action="update-page"]');
  await p.fill('#progress-input', '50');
  await p.press('#progress-input', 'Enter');
  await p.waitForFunction(() => JSON.parse(localStorage.getItem('leituras:v1')).books.find((b) => b.id === 'b').currentPage === 50);
  // IndexedDB volta a funcionar: migra com a alteração feita.
  await p.evaluate(() => localStorage.removeItem('qa:idb'));
  await p.reload();
  await p.waitForSelector('.hero');
  assert.equal(await p.evaluate(() => localStorage.getItem('leituras:v1')), null);
  const st = await readState(p);
  assert.equal(st.books.find((b) => b.id === 'b').currentPage, 50);
});

await scenario('IndexedDB quebrado depois da migração: avisa e não grava por cima', async (ctx) => {
  await ctx.addInitScript(BREAK_IDB);
  const p = await newPage(ctx);
  await openWith(p, stateWith([book('a'), book('b')]));
  await p.evaluate(() => localStorage.setItem('qa:idb', 'throw'));
  await p.reload();
  await p.waitForSelector('.hero');
  await waitToast(p, /Não foi possível abrir seus dados/);
  assert.match(await p.textContent('.ring-center'), /0\s*de 12/);
  // Mexer no app sem dados não pode apagar nada.
  await p.click('.nav-add');
  await onPage(p, 'novo');
  await p.fill('#f-title', 'Novo');
  // O aviso fixo cobre o botão de baixo: usa o Salvar do topo.
  await p.click('.form-top [type="submit"]');
  await onPage(p, 'inicio');
  assert.equal(await p.evaluate(() => localStorage.getItem('leituras:v1')), null, 'nada vai para o localStorage');
  await p.evaluate(() => localStorage.removeItem('qa:idb'));
  await p.reload();
  await p.waitForSelector('.hero');
  assert.match(await p.textContent('.ring-center'), /2\s*de 12/);
}, { allowErrors: false });

await scenario('IndexedDB que não responde (Safari): desiste em 5 s e usa o localStorage', async (ctx) => {
  await ctx.addInitScript(BREAK_IDB);
  const p = await newPage(ctx);
  await p.goto(`${BASE}manifest.webmanifest`);
  await p.evaluate((d) => { localStorage.setItem('qa:idb', 'hang'); localStorage.setItem('leituras:v1', JSON.stringify(d)); }, stateWith([book('a')], { version: 1 }));
  await p.goto(BASE);
  await p.waitForSelector('.hero', { timeout: 15000 });
  assert.match(await p.textContent('.ring-center'), /1\s*de 12/);
});

await scenario('migração interrompida (cópia diferente): chave antiga fica e é a fonte da verdade', async (ctx) => {
  await ctx.addInitScript(BREAK_IDB);
  const p = await newPage(ctx);
  await p.goto(`${BASE}manifest.webmanifest`);
  const legacy = stateWith([book('a'), book('b'), book('c')], { version: 1 });
  await p.evaluate((d) => { localStorage.setItem('qa:idb', 'mismatch'); localStorage.setItem('leituras:v1', JSON.stringify(d)); }, legacy);
  await p.goto(BASE);
  await p.waitForSelector('.hero');
  assert.match(await p.textContent('.ring-center'), /3\s*de 12/);
  assert.ok(await p.evaluate(() => localStorage.getItem('leituras:v1')), 'chave antiga mantida');
  assert.equal(await p.evaluate(async () => (await import('/js/db.js')).getItem('state')), null, 'cópia incompleta apagada');
  // Alteração vai para o localStorage.
  await p.click('.grid-book >> nth=0');
  await onPage(p, 'livro');
  await p.click('[data-action="set-rating"][data-value="2.5"]');
  await p.click('.btn-primary');
  await onPage(p, 'inicio');
  await p.waitForFunction(() => JSON.parse(localStorage.getItem('leituras:v1')).books.some((b) => b.rating === 2.5));
  await p.evaluate(() => localStorage.removeItem('qa:idb'));
  await p.reload();
  await p.waitForSelector('.hero');
  const st = await waitState(p, (s) => s.books.length === 3);
  assert.ok(st.books.some((b) => b.rating === 2.5));
  assert.equal(await p.evaluate(() => localStorage.getItem('leituras:v1')), null);
});

await scenario('gravações rápidas seguidas e recarregar: fica o último valor', async (ctx) => {
  const p = await newPage(ctx);
  // Muitas capas por foto: cada gravação leva mais tempo (como num iPhone com o app cheio).
  const covers = Array.from({ length: 60 }, (_, i) => book(`c${i}`, { cover: fakeCover(i) }));
  await openWith(p, stateWith([book('r', { status: 'lendo', endDate: null, rating: null, pages: 500, currentPage: 0 }), ...covers]));
  for (const v of [10, 20, 30, 40, 55]) {
    await p.click('[data-action="update-page"]');
    await p.fill('#progress-input', String(v));
    await p.press('#progress-input', 'Enter');
  }
  await p.reload();
  await p.waitForSelector('.hero');
  const st = await readState(p);
  const r = st.books.find((b) => b.id === 'r');
  assert.equal(r.currentPage, 55);
  assert.deepEqual(r.journal, [{ date: '2026-10-16', from: 0, to: 55, unit: 'page', note: '' }]);
});

await scenario('fechar o app logo depois de salvar duas vezes: a última alteração fica', async (ctx) => {
  const p = await newPage(ctx);
  const covers = Array.from({ length: 60 }, (_, i) => book(`c${i}`, { cover: fakeCover(i) }));
  await openWith(p, stateWith([book('r', { status: 'lendo', endDate: null, rating: null, pages: 500, currentPage: 0 }), ...covers]));
  for (let round = 0; round < 3; round += 1) {
    await p.click('[data-action="update-page"]');
    await p.evaluate((n) => {
      const submit = (v) => {
        if (!document.getElementById('progress-input')) document.querySelector('[data-action="update-page"]').click();
        const input = document.getElementById('progress-input');
        input.value = String(v);
        input.form.requestSubmit();
      };
      // A primeira gravação ainda está em andamento quando vem a segunda; o app fecha logo depois.
      // (Fechar no mesmo instante perde até a primeira: o navegador cancela a gravação em andamento.)
      submit(n * 10 + 1);
      submit(n * 10 + 2);
      setTimeout(() => location.reload(), 400);
    }, round + 1);
    await p.waitForEvent('load');
    await p.waitForSelector('.hero');
    const st = await readState(p);
    assert.equal(st.books.find((b) => b.id === 'r').currentPage, (round + 1) * 10 + 2, `rodada ${round + 1}`);
  }
});

await scenario('várias gravações no mesmo instante (sem esperar a tela)', async (ctx) => {
  const p = await newPage(ctx);
  await openWith(p, stateWith([book('r', { status: 'lendo', endDate: null, rating: null, pages: 500, currentPage: 0 })]));
  // Dispara 5 envios no mesmo tick e recarrega logo em seguida.
  await p.click('[data-action="update-page"]');
  await p.evaluate(() => {
    for (const v of [11, 22, 33, 44, 66]) {
      const input = document.getElementById('progress-input') || (() => {
        document.querySelector('[data-action="update-page"]').click();
        return document.getElementById('progress-input');
      })();
      input.value = String(v);
      input.form.requestSubmit();
    }
  });
  await waitState(p, (s) => s.books[0].currentPage === 66);
  await p.reload();
  await p.waitForSelector('.hero');
  assert.equal((await readState(p)).books[0].currentPage, 66);
});

await scenario('duas abas: sincronizam pelo BroadcastChannel sem ficar em loop', async (ctx) => {
  await ctx.addInitScript(() => {
    window.__posts = 0;
    const post = BroadcastChannel.prototype.postMessage;
    BroadcastChannel.prototype.postMessage = function (...a) { window.__posts += 1; return post.apply(this, a); };
  });
  const a = await newPage(ctx);
  await openWith(a, stateWith([book('x'), book('r', { status: 'lendo', endDate: null, rating: null, currentPage: 5 })]));
  const b = await newPage(ctx);
  await b.goto(BASE);
  await b.waitForSelector('.hero');
  await a.click('[data-action="update-page"]');
  await a.fill('#progress-input', '77');
  await a.press('#progress-input', 'Enter');
  await b.waitForFunction(() => /pág\. 77/.test(document.body.textContent));
  // B altera; A recebe.
  await b.click('[data-action="update-page"]');
  await b.fill('#progress-input', '88');
  await b.press('#progress-input', 'Enter');
  await a.waitForFunction(() => /pág\. 88/.test(document.body.textContent));
  await a.waitForTimeout(500);
  const postsA = await a.evaluate(() => window.__posts);
  const postsB = await b.evaluate(() => window.__posts);
  assert.equal(postsA, 1, `aba A enviou ${postsA} avisos`);
  assert.equal(postsB, 1, `aba B enviou ${postsB} avisos`);
  const st = await readState(a);
  assert.equal(st.books.find((x) => x.id === 'r').currentPage, 88);
  assert.deepEqual(st.books.find((x) => x.id === 'r').journal, [{ date: '2026-10-16', from: 5, to: 88, unit: 'page', note: '' }]);
});

await scenario('duas abas: aviso chega durante gravação local não desfaz a alteração local', async (ctx) => {
  const a = await newPage(ctx);
  await openWith(a, stateWith([book('r', { status: 'lendo', endDate: null, rating: null, currentPage: 5 }), book('s', { status: 'lendo', endDate: null, rating: null, currentPage: 1, title: 'Outro' })]));
  const b = await newPage(ctx);
  await b.goto(BASE);
  await b.waitForSelector('.hero');
  // Deixa a leitura do IndexedDB lenta na aba B, para o aviso chegar no meio de uma ação dela.
  await b.evaluate(() => {
    const get = IDBObjectStore.prototype.get;
    IDBObjectStore.prototype.get = function (...args) {
      const req = get.apply(this, args);
      const t0 = performance.now();
      while (performance.now() - t0 < 1) { /* nada */ }
      return req;
    };
    window.__slowLoad = true;
  });
  await a.click('[data-action="update-page"] >> nth=0');
  await a.fill('#progress-input', '40');
  await a.press('#progress-input', 'Enter');
  // B, ao mesmo tempo, atualiza o outro livro.
  await b.click('[data-action="update-page"] >> nth=1');
  await b.fill('#progress-input', '9');
  await b.press('#progress-input', 'Enter');
  await b.waitForTimeout(800);
  const st = await readState(b);
  const s = st.books.find((x) => x.id === 's');
  assert.equal(s.currentPage, 9, 'alteração da aba B gravada');
  assert.match(await b.textContent('body'), /pág\. 9/);
});

await scenario('duas abas: ação local enquanto a outra aba recarrega os dados não some', async (ctx) => {
  const a = await newPage(ctx);
  await openWith(a, stateWith([
    book('r', { status: 'lendo', endDate: null, rating: null, currentPage: 5, title: 'Primeiro' }),
    book('s', { status: 'lendo', endDate: null, rating: null, currentPage: 1, title: 'Segundo' }),
  ]));
  const b = await newPage(ctx);
  await b.goto(BASE);
  await b.waitForSelector('.hero');
  // B já está com o campo aberto; quando o aviso de A chegar (e B começar a recarregar), B salva.
  await b.locator('.reading:has-text("Segundo") [data-action="update-page"]').click();
  await b.fill('#progress-input', '9');
  await b.evaluate(() => {
    const ch = new BroadcastChannel('leituras');
    ch.onmessage = () => {
      ch.close();
      document.querySelector('[data-progress-form]').requestSubmit();
    };
  });
  await a.locator('.reading:has-text("Primeiro") [data-action="update-page"]').click();
  await a.fill('#progress-input', '40');
  await a.press('#progress-input', 'Enter');
  await b.waitForTimeout(800);
  const st = await readState(b);
  assert.equal(st.books.find((x) => x.id === 's').currentPage, 9, 'alteração da aba B gravada');
  assert.match(await b.textContent('.reading:has-text("Segundo")'), /pág\. 9/, 'tela da aba B mostra o que ela gravou');
  // A tela de B e o que está gravado precisam bater.
  const shown = await b.textContent('.reading:has-text("Primeiro")');
  const saved = st.books.find((x) => x.id === 'r').currentPage;
  assert.match(shown, new RegExp(`pág\\. ${saved}\\b`), `tela mostra "${shown.trim().replace(/\s+/g, ' ')}", gravado ${saved}`);
});

await scenario('localStorage cheio na migração: marca do IndexedDB é gravada depois de liberar espaço', async (ctx) => {
  await ctx.addInitScript(BREAK_IDB);
  const p = await newPage(ctx);
  await p.goto(`${BASE}manifest.webmanifest`);
  const legacy = stateWith(Array.from({ length: 20 }, (_, i) => book(`c${i}`, { cover: fakeCover(i) })), { version: 1 });
  // Enche o localStorage até não caber nem a marca (como no 1.2 com muitas capas por foto).
  const filled = await p.evaluate((d) => {
    localStorage.setItem('leituras:v1', JSON.stringify(d));
    let size = 4 * 1024 * 1024;
    let filler = '';
    while (size >= 1) {
      try {
        localStorage.setItem('qa:filler', filler + 'x'.repeat(size));
        filler += 'x'.repeat(size);
      } catch {
        size = Math.floor(size / 2);
      }
    }
    try {
      localStorage.setItem('leituras:indexeddb', '1');
      localStorage.removeItem('leituras:indexeddb');
      return false;
    } catch {
      return true;
    }
  }, legacy);
  assert.ok(filled, 'não conseguiu encher o localStorage');
  await p.goto(BASE);
  await p.waitForSelector('.hero');
  assert.match(await p.textContent('.ring-center'), /20\s*de 12/);
  assert.equal(await p.evaluate(() => localStorage.getItem('leituras:v1')), null, 'migrou');
  await p.evaluate(() => localStorage.removeItem('qa:filler'));
  // Fecha sem salvar nada. Na abertura seguinte o IndexedDB falha:
  // sem a marca, o app abriria vazio e gravaria por cima no localStorage.
  assert.equal(await p.evaluate(() => localStorage.getItem('leituras:indexeddb')), '1', 'marca gravada');
  await p.evaluate(() => localStorage.setItem('qa:idb', 'throw'));
  await p.reload();
  await p.waitForSelector('.hero');
  await p.click('.nav-add');
  await onPage(p, 'novo');
  await p.fill('#f-title', 'Novo');
  await p.click('.form-top [type="submit"]');
  await onPage(p, 'inicio');
  await p.evaluate(() => localStorage.removeItem('qa:idb'));
  await p.reload();
  await p.waitForSelector('.hero');
  const st = await readState(p);
  assert.ok(st.books.length >= 20, `sobraram ${st.books.length} livros`);
});

// ---------- Diário ----------

await scenario('diário: vários dias, mesmo dia, correção para trás, concluir', async (ctx) => {
  const p = await newPage(ctx);
  await openWith(p, stateWith([book('j', { status: 'lendo', endDate: null, rating: null, pages: 200, currentPage: 10, startDate: '2026-10-01' })]));
  const setPage = async (v) => {
    await p.click('[data-action="update-page"]');
    await p.fill('#progress-input', String(v));
    await p.press('#progress-input', 'Enter');
    await p.waitForSelector('#progress-input', { state: 'detached' }).catch(() => {});
  };
  await setPage(30);
  await setPage(45); // mesmo dia
  await p.clock.setFixedTime(new Date('2026-10-17T21:00:00'));
  await setPage(80);
  await p.clock.setFixedTime(new Date('2026-10-18T08:00:00'));
  await setPage(70); // correção
  await p.clock.setFixedTime(new Date('2026-10-18T22:00:00'));
  await setPage(90);
  let st = await waitState(p, (s) => s.books[0].currentPage === 90);
  assert.deepEqual(st.books[0].journal, [
    { date: '2026-10-16', from: 10, to: 45, unit: 'page', note: '' },
    { date: '2026-10-17', from: 45, to: 80, unit: 'page', note: '' },
    { date: '2026-10-18', from: 80, to: 90, unit: 'page', note: '' },
  ]);
  // Página = total: abre o Concluir.
  await p.clock.setFixedTime(new Date('2026-10-19T10:00:00'));
  await p.click('[data-action="update-page"]');
  await p.fill('#progress-input', '200');
  await p.press('#progress-input', 'Enter');
  await onPage(p, 'livro');
  await p.click('.btn-primary');
  await onPage(p, 'inicio');
  st = await waitState(p, (s) => s.books[0].status === 'lido');
  assert.deepEqual(st.books[0].journal.at(-1), { date: '2026-10-19', from: 90, to: 200, unit: 'page', note: '' });
  assert.equal(st.books[0].endDate, '2026-10-19');
});

await scenario('diário: lendo → lido pelo formulário com término no passado', async (ctx) => {
  const p = await newPage(ctx);
  await openWith(p, stateWith([book('j', {
    status: 'lendo', endDate: null, rating: null, pages: 200, currentPage: 50, startDate: '2026-10-01',
    journal: [{ date: '2026-10-05', from: 0, to: 50, unit: 'page', note: '' }],
  })]));
  await p.goto(`${BASE}#/livro/j`);
  await onPage(p, 'livro');
  await p.click('[data-action="set-status"][data-value="lido"]');
  await p.fill('#f-end', '2026-10-10');
  await p.click('.btn-primary');
  await onPage(p, 'inicio');
  const st = await waitState(p, (s) => s.books[0].status === 'lido');
  assert.deepEqual(st.books[0].journal, [
    { date: '2026-10-05', from: 0, to: 50, unit: 'page', note: '' },
    { date: '2026-10-10', from: 50, to: 200, unit: 'page', note: '' },
  ]);
});

await scenario('diário: "Quero ler" marcado direto como Lido não inventa um dia de leitura', async (ctx) => {
  const p = await newPage(ctx);
  await openWith(p, stateWith([book('q', { status: 'quero', startDate: null, endDate: null, rating: null, pages: 350 })]));
  await p.goto(`${BASE}#/livro/q`);
  await onPage(p, 'livro');
  await p.click('[data-action="set-status"][data-value="lido"]');
  await p.fill('#f-start', '2026-09-01');
  await p.fill('#f-end', '2026-09-20');
  await p.click('.btn-primary');
  await onPage(p, 'inicio');
  const st = await waitState(p, (s) => s.books[0].status === 'lido');
  assert.deepEqual(st.books[0].journal, [], `diário: ${JSON.stringify(st.books[0].journal)}`);
});

await scenario('diário: trocar o formato (físico → Kindle) não conta como leitura do dia', async (ctx) => {
  const p = await newPage(ctx);
  await openWith(p, stateWith([book('f', {
    status: 'lendo', endDate: null, rating: null, pages: 300, currentPage: 100, startDate: '2026-10-01',
    journal: [{ date: '2026-10-10', from: 0, to: 100, unit: 'page', note: '' }],
  })]));
  await p.goto(`${BASE}#/livro/f`);
  await onPage(p, 'livro');
  await p.click('[data-action="set-format"][data-value="kindle"]');
  await p.fill('#f-current', '33');
  await p.click('.btn-primary');
  await onPage(p, 'inicio');
  const st = await waitState(p, (s) => s.books[0].format === 'kindle');
  assert.equal(st.books[0].currentPercent, 33);
  assert.deepEqual(st.books[0].journal, [{ date: '2026-10-10', from: 0, to: 100, unit: 'page', note: '' }], `diário: ${JSON.stringify(st.books[0].journal)}`);
  // Daí em diante, a % registra normalmente a partir de 33.
  await p.click('[data-action="update-page"]');
  await p.fill('#progress-input', '40');
  await p.press('#progress-input', 'Enter');
  const st2 = await waitState(p, (s) => s.books[0].currentPercent === 40);
  assert.deepEqual(st2.books[0].journal.at(-1), { date: '2026-10-16', from: 33, to: 40, unit: 'percent', note: '' });
});

await scenario('diário: Kindle %, releitura e abandono', async (ctx) => {
  const p = await newPage(ctx);
  await openWith(p, stateWith([
    book('k', { status: 'lendo', format: 'kindle', endDate: null, rating: null, pages: 400, currentPercent: 10, startDate: '2026-10-01' }),
    book('d', { status: 'lendo', endDate: null, rating: null, pages: 300, currentPage: 20, startDate: '2026-10-01', title: 'Chato' }),
    book('l', { title: 'Já lido', journal: [{ date: '2026-01-10', from: 0, to: 300, unit: 'page', note: '' }] }),
  ]));
  const kCard = p.locator('.reading:has-text("Livro k")');
  await kCard.locator('[data-action="update-page"]').click();
  await p.fill('#progress-input', '25.4');
  await p.press('#progress-input', 'Enter');
  let st = await waitState(p, (s) => s.books[0].currentPercent === 25);
  assert.deepEqual(st.books[0].journal, [{ date: '2026-10-16', from: 10, to: 25, unit: 'percent', note: '' }]);
  // 99,6% arredonda para 100: abre o Concluir.
  await kCard.locator('[data-action="update-page"]').click();
  await p.fill('#progress-input', '99.6');
  await p.press('#progress-input', 'Enter');
  await onPage(p, 'livro');
  await p.click('.btn-primary');
  await onPage(p, 'inicio');
  st = await waitState(p, (s) => s.books[0].status === 'lido');
  assert.deepEqual(st.books[0].journal, [{ date: '2026-10-16', from: 10, to: 100, unit: 'percent', note: '' }]);
  // Abandono com página nova.
  await p.goto(`${BASE}#/livro/d`);
  await onPage(p, 'livro');
  await p.click('[data-action="set-status"][data-value="abandonado"]');
  await p.fill('#f-current', '60');
  await p.fill('#f-drop', 'Não gostei');
  await p.click('.btn-primary');
  await onPage(p, 'inicio');
  st = await waitState(p, (s) => s.books.find((b) => b.id === 'd').status === 'abandonado');
  assert.deepEqual(st.books.find((b) => b.id === 'd').journal, [{ date: '2026-10-16', from: 20, to: 60, unit: 'page', note: '' }]);
  // Releitura: diário novo vazio, o antigo continua no original.
  await p.goto(`${BASE}#/livro/l`);
  await onPage(p, 'livro');
  await p.click('[data-action="reread"]');
  await onPage(p, 'inicio');
  st = await waitState(p, (s) => s.books.length === 4);
  const re = st.books.find((b) => b.reread);
  assert.deepEqual(re.journal, []);
  assert.equal(st.books.find((b) => b.id === 'l').journal.length, 1);
});

// ---------- Meia estrela ----------

await scenario('meia estrela: 0,5, 4,5, apagar; filtro; resumo; backup v2 ida e volta', async (ctx) => {
  const p = await newPage(ctx);
  await openWith(p, stateWith([book('a', { rating: 4 }), book('b', { rating: 5 }), book('c', { rating: 3 })]));
  await p.goto(`${BASE}#/livro/c`);
  await onPage(p, 'livro');
  await p.click('[data-action="set-rating"][data-value="0.5"]');
  assert.equal(await p.locator('.star-row .star-half').count(), 1);
  assert.equal(await p.locator('.star-row .star-on').count(), 0);
  assert.equal(await p.textContent('.star-value'), '0,5');
  assert.equal(await p.getAttribute('[data-value="0.5"]', 'aria-label'), '0,5 estrela');
  await p.click('[data-action="set-rating"][data-value="0.5"]'); // apaga
  assert.equal(await p.locator('.star-row .star-on, .star-row .star-half').count(), 0);
  assert.equal(await p.textContent('.star-value'), '');
  await p.click('[data-action="set-rating"][data-value="4.5"]');
  // Teclado: o foco fica no botão tocado depois de redesenhar? (acessibilidade)
  await p.click('.btn-primary');
  await onPage(p, 'inicio');
  await waitState(p, (s) => s.books.find((b) => b.id === 'c').rating === 4.5);
  assert.match(await p.textContent('.book-grid'), /4,5/);
  assert.doesNotMatch(await p.textContent('.book-grid'), /4\.5/);
  // Nota média com meia estrela: (4 + 5 + 4,5) / 3 = 4,5
  assert.match(await p.textContent('.tiles'), /4,5/);
  await p.goto(`${BASE}#/buscar`);
  await onPage(p, 'buscar');
  await p.selectOption('[data-filter="minRating"]', '4.5');
  assert.equal(await p.locator('#search-results .book-row').count(), 2);
  assert.match(await p.getAttribute('#search-results .book-row:has-text("Livro c") .stars', 'aria-label'), /Nota 4,5 de 5/);
  await p.goto(`${BASE}#/resumo/2026`);
  await onPage(p, 'resumo');
  assert.match(await p.textContent('#app'), /4,5/);
  // Backup v2 ida e volta.
  await p.goto(`${BASE}#/ajustes`);
  await onPage(p, 'ajustes');
  const dl = p.waitForEvent('download');
  await p.click('[data-action="export-backup"]');
  const file = join(SHOTS, 'qa-backup-v2.json');
  await (await dl).saveAs(file);
  const parsed = JSON.parse(readFileSync(file, 'utf8'));
  assert.equal(parsed.schemaVersion, 2);
  assert.equal(parsed.data.books.find((b) => b.id === 'c').rating, 4.5);
  await p.click('[data-action="wipe-data"]');
  await waitState(p, (s) => s.books.length === 0);
  await p.goto(`${BASE}#/ajustes`);
  await onPage(p, 'ajustes');
  await p.setInputFiles('[data-import]', file);
  const st = await waitState(p, (s) => s.books.length === 3);
  assert.equal(st.books.find((b) => b.id === 'c').rating, 4.5);
});

await scenario('backup v1 (estrelas inteiras, sem campos novos) importa', async (ctx) => {
  const p = await newPage(ctx);
  await openWith(p, stateWith([]));
  const v1 = {
    app: 'leituras', schemaVersion: 1, exportedAt: '2025-12-01T00:00:00.000Z',
    data: {
      version: 1, goals: { 2025: 20 }, defaultGoal: 10, customGenres: ['Poesia'], lastBackupAt: null,
      books: [
        { id: 'v1a', title: 'Antigo <b>negrito</b>', authors: 'A', pages: 100, status: 'lido', startDate: '2025-01-01', endDate: '2025-02-01', rating: 5, format: 'fisico' },
        { id: 'v1b', title: 'Kindle', authors: 'B', status: 'lendo', startDate: '2026-10-01', format: 'kindle', currentPercent: 30 },
      ],
    },
  };
  const file = join(SHOTS, 'qa-backup-v1.json');
  writeFileSync(file, JSON.stringify(v1));
  await p.goto(`${BASE}#/ajustes`);
  await onPage(p, 'ajustes');
  await p.setInputFiles('[data-import]', file);
  const st = await waitState(p, (s) => s.books.length === 2);
  assert.equal(st.books[0].rating, 5);
  assert.deepEqual(st.books[0].journal, []);
  assert.deepEqual(st.upNext, []);
  await p.goto(`${BASE}#/estante?aba=lido`);
  await onPage(p, 'estante');
  assert.equal(await p.locator('#app b').count(), 0, 'título escapado');
  assert.match(await p.textContent('#app'), /Antigo <b>negrito<\/b>/);
  // Backup de versão mais nova é recusado.
  writeFileSync(file, JSON.stringify({ ...v1, schemaVersion: 3 }));
  await p.goto(`${BASE}#/ajustes`);
  await onPage(p, 'ajustes');
  await p.setInputFiles('[data-import]', file);
  await waitToast(p, /versão mais nova/);
  assert.equal((await readState(p)).books.length, 2);
});

await scenario('meia estrela: alvos de toque e tela de 320 px', async (ctx) => {
  const p = await newPage(ctx);
  await openWith(p, stateWith([book('a')]));
  for (const width of [320, 375, 390, 430]) {
    await p.setViewportSize({ width, height: 800 });
    await p.goto(`${BASE}#/livro/a`);
    await onPage(p, 'livro');
    const overflow = await p.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    assert.ok(overflow <= 0, `${width}px: ${overflow}px sobrando`);
    const boxes = await p.locator('.star-hit').evaluateAll((els) => els.map((e) => e.getBoundingClientRect()).map((r) => ({ w: r.width, h: r.height })));
    assert.equal(boxes.length, 10);
    assert.ok(boxes.every((b) => b.h >= 44), `${width}px: altura < 44`);
    // Cada metade fica estreita (≈ 22-24 px), mas a estrela inteira tem 44-48 px.
    assert.ok(boxes.every((b) => b.w >= 20), `${width}px: metade com ${Math.min(...boxes.map((b) => b.w))}px`);
    await p.goto(`${BASE}#/inicio`);
    await onPage(p, 'inicio');
  }
  await p.setViewportSize({ width: 390, height: 844 });
  // Teclado: Tab chega nas 10 metades, com nome acessível.
  await p.goto(`${BASE}#/livro/a`);
  await onPage(p, 'livro');
  const names = await p.locator('.star-hit').evaluateAll((els) => els.map((e) => e.getAttribute('aria-label')));
  assert.deepEqual(names, ['0,5 estrela', '1 estrela', '1,5 estrela', '2 estrelas', '2,5 estrelas', '3 estrelas', '3,5 estrelas', '4 estrelas', '4,5 estrelas', '5 estrelas']);
  await p.focus('[data-value="3.5"]');
  await p.keyboard.press('Enter');
  assert.equal(await p.getAttribute('[data-value="3.5"]', 'aria-pressed'), 'true');
  const focused = await p.evaluate(() => document.activeElement?.dataset?.value ?? document.activeElement?.tagName);
  assert.equal(focused, '3.5', `foco foi para ${focused} depois de escolher a nota pelo teclado`);
});

// ---------- Busca de livros ----------

function apiMocks(p, { brasil = {}, ol = {}, google = null, log = [] } = {}) {
  return Promise.all([
    p.route('https://brasilapi.com.br/**', async (r) => {
      log.push(`brasil ${r.request().url()}`);
      const isbn = r.request().url().split('/').pop();
      const hit = brasil[isbn];
      if (hit === 'abort') return r.abort();
      if (hit === 'slow') return new Promise((res) => setTimeout(() => res(r.fulfill({ status: 404, json: {} }).catch(() => {})), 9500));
      return hit ? r.fulfill({ json: hit }) : r.fulfill({ status: 404, json: { message: 'ISBN não encontrado' } });
    }),
    p.route('https://openlibrary.org/**', async (r) => {
      log.push(`ol ${r.request().url()}`);
      if (ol.mode === 'abort') return r.abort();
      if (ol.mode === 'slow') return new Promise((res) => setTimeout(() => res(r.fulfill({ json: { docs: [] } }).catch(() => {})), 9500));
      return r.fulfill({ json: { docs: ol.docs || [] } });
    }),
    p.route('https://www.googleapis.com/**', async (r) => {
      log.push(`google ${r.request().url()}`);
      return google ? r.fulfill({ json: google }) : r.fulfill({ status: 429, json: {} });
    }),
    p.route('https://covers.openlibrary.org/**', (r) => r.abort()),
  ]);
}

await scenario('busca: ISBN com hífens, ISBN-10, dígito errado, cache', async (ctx) => {
  const p = await newPage(ctx, { mocks: false });
  const log = [];
  await apiMocks(p, {
    log,
    brasil: { 9788535914849: { isbn: '9788535914849', title: 'O Alienista', authors: ['Machado de Assis'], page_count: 96, provider: 'cbl' } },
    ol: { docs: [{ key: '/works/X', title: 'Outro <img src=x onerror=alert(1)>', author_name: ['Fulano'] }] },
  });
  await openWith(p, stateWith([]));
  await p.click('.nav-add');
  await onPage(p, 'novo');
  await p.fill('#lookup', '978-85-359-1484-9');
  await p.waitForSelector('.result');
  assert.match(await p.textContent('#lookup-results'), /O Alienista/);
  assert.equal(await p.locator('#lookup-results img[src="x"]').count(), 0, 'título da API escapado');
  // ISBN-10 do mesmo livro (85-359-1484-X não é válido; usa 8535914846?)
  const isbn10 = '8535914846';
  await p.fill('#lookup', isbn10);
  await p.waitForFunction(() => !/Buscando/.test(document.getElementById('lookup-results').textContent));
  await p.waitForSelector('.result');
  assert.ok(log.some((l) => l.endsWith('/9788535914849')), 'ISBN-10 convertido para 13');
  // Dígito verificador errado: vira busca por texto.
  log.length = 0;
  await p.fill('#lookup', '9788535914840');
  for (let i = 0; i < 30 && !log.some((l) => l.startsWith('ol')); i += 1) await p.waitForTimeout(100);
  assert.ok(!log.some((l) => l.startsWith('brasil')), 'não consulta a BrasilAPI');
  assert.ok(log.some((l) => l.startsWith('ol') && l.includes('q=9788535914840')), 'busca por texto');
  // Cache: repetir não vai à rede.
  log.length = 0;
  await p.fill('#lookup', '978 85 359 1484 9');
  await p.waitForSelector('.result');
  await p.waitForTimeout(600);
  assert.deepEqual(log, [], 'repetida sai da memória');
  assert.ok(!log.some((l) => l.startsWith('google')), 'sem chave, sem Google');
});

await scenario('busca: sem internet e fonte lenta (> 8 s)', async (ctx) => {
  const p = await newPage(ctx, { mocks: false });
  await apiMocks(p, { brasil: { 9788535914849: 'abort' }, ol: { mode: 'abort' } });
  await openWith(p, stateWith([]));
  await p.click('.nav-add');
  await onPage(p, 'novo');
  await p.fill('#lookup', '9788535914849');
  await p.waitForSelector('.lookup-status:has-text("Não encontrei")');
  await p.fill('#f-title', 'Manual');
  await p.click('.btn-primary');
  await onPage(p, 'inicio');
  const st = await waitState(p, (s) => s.books.length === 1);
  assert.equal(st.books[0].isbn, '9788535914849');
  // Fonte lenta: a resposta sai em ~8 s mesmo sem a fonte responder.
  await p.unroute('https://openlibrary.org/**');
  await p.route('https://openlibrary.org/**', () => {});
  await p.click('.nav-add');
  await onPage(p, 'novo');
  const t0 = Date.now();
  await p.fill('#lookup', 'algum livro');
  await p.waitForSelector('.lookup-status:has-text("Não encontrei")', { timeout: 15000 });
  const took = Date.now() - t0;
  assert.ok(took < 10500 && took > 7000, `demorou ${took} ms`);
});

await scenario('busca: com chave do Google consulta o Google; resultado parcial não fica na memória', async (ctx) => {
  const p = await newPage(ctx, { mocks: false });
  const log = [];
  await apiMocks(p, {
    log,
    ol: { docs: [{ key: '/works/A', title: 'Duna', author_name: ['Frank Herbert'] }] },
    google: { items: [{ id: 'g1', volumeInfo: { title: 'Duna (Google)', authors: ['Frank Herbert'], pageCount: 680 } }] },
  });
  await p.goto(`${BASE}manifest.webmanifest`);
  await p.evaluate(() => localStorage.setItem('leituras:googleBooksKey', 'CHAVE-TESTE'));
  await openWith(p, stateWith([]));
  await p.click('.nav-add');
  await onPage(p, 'novo');
  await p.fill('#lookup', 'duna');
  await p.waitForSelector('.result');
  assert.ok(log.some((l) => l.startsWith('google') && l.includes('key=CHAVE-TESTE')));
  assert.equal(await p.locator('.result').count(), 2);
  // Chave nunca vai para o backup.
  await p.click('[data-action="pick-result"] >> nth=1');
  await p.click('.btn-primary');
  await onPage(p, 'inicio');
  const st = await waitState(p, (s) => s.books.length === 1);
  assert.ok(!JSON.stringify(st).includes('CHAVE-TESTE'));
  // Parcial: o Google falha (429) numa busca nova, a Open Library responde.
  await p.unroute('https://www.googleapis.com/**');
  await p.route('https://www.googleapis.com/**', (r) => { log.push('google2'); return r.fulfill({ status: 503, json: {} }); });
  await p.click('.nav-add');
  await onPage(p, 'novo');
  await p.fill('#lookup', 'duna messias');
  await p.waitForSelector('.result');
  log.length = 0;
  await p.click('a.btn-text:has-text("Cancelar")');
  await onPage(p, 'inicio');
  await p.click('.nav-add');
  await onPage(p, 'novo');
  await p.fill('#lookup', 'duna messias');
  await p.waitForSelector('.result');
  await p.waitForTimeout(300);
  assert.ok(log.includes('google2'), 'busca com fonte que falhou é refeita (não fica presa na memória)');
});

// ---------- Fluxos gerais ----------

await scenario('excluir e desfazer; app vazio; datas futuras', async (ctx) => {
  const p = await newPage(ctx);
  await openWith(p, stateWith([book('a'), book('b'), book('c')]));
  await p.goto(`${BASE}#/livro/b`);
  await onPage(p, 'livro');
  await p.click('[data-action="delete-book"]');
  await onPage(p, 'inicio');
  await waitState(p, (s) => s.books.length === 2);
  await p.click('.toast button:has-text("Desfazer")');
  const st = await waitState(p, (s) => s.books.length === 3);
  assert.deepEqual(st.books.map((b) => b.id), ['a', 'b', 'c'], 'mesma posição');
  await p.reload();
  await p.waitForSelector('.hero');
  assert.match(await p.textContent('.ring-center'), /3\s*de 12/);
  // Data futura.
  await p.goto(`${BASE}#/livro/a`);
  await onPage(p, 'livro');
  await p.fill('#f-end', '2026-12-01');
  await p.click('.btn-primary');
  assert.match(await p.textContent('.form-errors'), /não pode estar no futuro/);
});

await scenario('excluir e desfazer um livro da lista "Próximos"', async (ctx) => {
  const p = await newPage(ctx);
  const want = (id) => book(id, { status: 'quero', startDate: null, endDate: null, rating: null });
  await openWith(p, stateWith([want('w1'), want('w2'), want('w3')], { upNext: ['w3', 'w2', 'w1'] }));
  await p.goto(`${BASE}#/livro/w2`);
  await onPage(p, 'livro');
  await p.click('[data-action="delete-book"]');
  await waitState(p, (s) => s.books.length === 2 && s.upNext.length === 2);
  await p.click('.toast button:has-text("Desfazer")');
  const st = await waitState(p, (s) => s.books.length === 3);
  assert.deepEqual(st.upNext, ['w3', 'w2', 'w1']);
});

await scenario('app vazio em todas as telas e larguras', async (ctx) => {
  const p = await newPage(ctx);
  await p.goto(BASE);
  await p.waitForSelector('.hero');
  for (const width of [320, 375, 390, 430]) {
    await p.setViewportSize({ width, height: 800 });
    for (const route of ['inicio', 'estante', 'buscar', 'resumo/2026', 'resumo/todos', 'retro/2026', 'ajustes', 'novo']) {
      await p.goto(`${BASE}#/${route}`);
      await p.waitForTimeout(50);
      const overflow = await p.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      assert.ok(overflow <= 0, `${route} em ${width}px: ${overflow}px sobrando`);
      const small = await p.evaluate(() => [...document.querySelectorAll('input, select, textarea')]
        .filter((el) => parseFloat(getComputedStyle(el).fontSize) < 16).map((el) => el.outerHTML.slice(0, 60)));
      assert.deepEqual(small, [], `${route}: campo com letra < 16px`);
    }
  }
});

await scenario('300 livros: tela inicial, estante e busca rápidas', async (ctx) => {
  const p = await newPage(ctx);
  const many = Array.from({ length: 300 }, (_, i) => book(`n${i}`, {
    title: `Livro número ${i}`, endDate: `${2020 + (i % 7)}-0${1 + (i % 9)}-15`, startDate: `${2020 + (i % 7)}-01-01`,
    rating: ((i % 10) + 1) / 2, status: i % 10 === 0 ? 'lendo' : 'lido', currentPage: i % 10 === 0 ? 5 : null,
    journal: [{ date: '2026-10-01', from: 0, to: 10, unit: 'page', note: '' }],
  }));
  await p.goto(`${BASE}manifest.webmanifest`);
  await writeState(p, stateWith(many));
  const t0 = Date.now();
  await p.goto(BASE);
  await p.waitForSelector('.hero');
  const bootMs = Date.now() - t0;
  const times = {};
  for (const route of ['estante?aba=lido', 'buscar', 'resumo/2026', 'resumo/todos', 'inicio']) {
    times[route] = await p.evaluate(async (r) => {
      const app = document.getElementById('app');
      const before = app.innerHTML.length;
      const t = performance.now();
      location.hash = `#/${r}`;
      // Espera a tela nova ser montada (hashchange → render) e pintada.
      await new Promise((res) => window.addEventListener('hashchange', () => res(), { once: true }));
      await new Promise((res) => requestAnimationFrame(() => res()));
      return before === app.innerHTML.length && r !== 'inicio' ? -1 : performance.now() - t;
    }, route);
  }
  await p.goto(`${BASE}#/buscar`);
  await onPage(p, 'buscar');
  const tFilter = await p.evaluate(() => {
    const input = document.getElementById('q');
    const t = performance.now();
    input.value = 'número 1';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    return performance.now() - t;
  });
  assert.ok(tFilter < 300, `filtro levou ${tFilter} ms`);
  assert.match(await p.textContent('#search-results'), /livros encontrados/);
  console.log(`    abrir: ${bootMs} ms; telas: ${JSON.stringify(Object.fromEntries(Object.entries(times).map(([k, v]) => [k, Math.round(v)])))}; filtro: ${Math.round(tFilter)} ms`);
  assert.ok(bootMs < 2000, `abrir levou ${bootMs} ms`);
  for (const [r, ms] of Object.entries(times)) assert.ok(ms >= 0 && ms < 1000, `${r} levou ${ms} ms (-1: tela não mudou)`);
  // Gravar com 300 livros.
  await p.goto(`${BASE}#/inicio`);
  await p.click('[data-action="update-page"] >> nth=0');
  await p.fill('#progress-input', '42');
  await p.press('#progress-input', 'Enter');
  await waitState(p, (s) => s.books.some((b) => b.currentPage === 42));
});

await scenario('backup com id malicioso não executa código', async (ctx) => {
  const p = await newPage(ctx);
  await openWith(p, stateWith([]));
  const evil = {
    app: 'leituras', schemaVersion: 2, exportedAt: '2026-10-01T00:00:00.000Z',
    data: stateWith([
      book('"><img src=x onerror="window.__xss=1">', { status: 'quero', startDate: null, endDate: null, rating: null, title: '<img src=x onerror="window.__xss=2">' }),
      book('k"><b>', { title: 'Outro', cover: 'javascript:alert(1)', genre: '<i>g</i>', authors: '"><svg onload=alert(1)>' }),
    ]),
  };
  const file = join(SHOTS, 'qa-backup-evil.json');
  writeFileSync(file, JSON.stringify(evil));
  await p.goto(`${BASE}#/ajustes`);
  await onPage(p, 'ajustes');
  await p.setInputFiles('[data-import]', file);
  await waitState(p, (s) => s.books.length === 2);
  for (const route of ['inicio', 'estante?aba=quero', 'estante?aba=lido', 'buscar', 'resumo/2026', 'resumo/todos', 'retro/2026', 'livro/k%22%3E%3Cb%3E']) {
    await p.goto(`${BASE}#/${route}`);
    await p.waitForTimeout(100);
    assert.equal(await p.evaluate(() => window.__xss), undefined, `código executado em ${route}`);
    assert.equal(await p.locator('#app img[src="x"], #app b, #app i:not(.icon)').count(), 0, `HTML injetado em ${route}`);
  }
  // O botão "Começar" do livro com id estranho funciona.
  await p.goto(`${BASE}#/estante?aba=quero`);
  await onPage(p, 'estante');
  await p.click('[data-action="start-reading"]');
  await waitState(p, (s) => s.books.some((b) => b.status === 'lendo'));
});

await scenario('campos com letra >= 16 px (iPhone não dá zoom) nos editores', async (ctx) => {
  const p = await newPage(ctx);
  await openWith(p, stateWith([book('r', { status: 'lendo', endDate: null, rating: null, currentPage: 5 }), book('a')]));
  const small = () => p.evaluate(() => [...document.querySelectorAll('input:not([type=file]), select, textarea')]
    .filter((el) => parseFloat(getComputedStyle(el).fontSize) < 16).map((el) => el.outerHTML.slice(0, 80)));
  await p.click('[data-action="update-page"]');
  assert.deepEqual(await small(), [], 'editor de página');
  await p.goto(`${BASE}#/livro/r`);
  await onPage(p, 'livro');
  await p.click('[data-action="open-genre"]');
  assert.deepEqual(await small(), [], 'formulário lendo');
  await p.click('[data-action="set-status"][data-value="abandonado"]');
  await p.click('[data-action="set-format"][data-value="kindle"]');
  assert.deepEqual(await small(), [], 'formulário abandonado/kindle');
});

// ---------- Resultado ----------

await browser.close();
server.close();
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length} de ${results.length} cenários passaram.`);
if (failed.length) {
  for (const f of failed) console.log(`  ✗ ${f.name}: ${f.error.split('\n')[0]}`);
  process.exitCode = 1;
}
