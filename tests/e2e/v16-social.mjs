// 1.6: comparar com outra pessoa (sem servidor), importar do Goodreads e sons ambiente no cronômetro.
// - Comparar: dois celulares (dois contextos do navegador, cada um com os seus livros). A Karoline
//   envia o resumo (Compartilhar simulado), o dono cola o link em Ajustes e vê a comparação; abrir o
//   link direto; guardar para ver depois (fora dos livros); link inválido e link com HTML malicioso.
// - Goodreads: arquivo de exemplo (tests/fixtures), prévia com contagens e repetidos, importar,
//   Desfazer (volta ao estado de antes), Cancelar e arquivo de outro formato.
// - Sons: o AudioContext só nasce no toque; toca com o cronômetro correndo, para ao pausar, ao
//   abrir o Parar e ao sair da tela; volta no Continuar e pelo aviso do Início.
// Capturas em tests/e2e/screens/v16-social-*.png (claro e escuro; 320, 390 e 430 px).
// Uso: node tests/e2e/v16-social.mjs   (precisa do Playwright, como o smoke.mjs)

import { execSync } from 'node:child_process';
import { createServer } from 'node:http';
import { mkdirSync, readFileSync, existsSync } from 'node:fs';
import { extname, join, normalize } from 'node:path';
import { createRequire } from 'node:module';
import assert from 'node:assert/strict';
import { decodeSnapshot } from '../../app/js/compare.js';
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
const FIXTURE = new URL('../fixtures/goodreads_library_export.csv', import.meta.url).pathname;
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
const BASE = `http://127.0.0.1:${server.address().port}/`;

const step = (msg) => console.log(`• ${msg}`);
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');

// ---------- Dados dos dois celulares ----------

const ts = '2026-01-01T10:00:00.000Z';
const read = (id, title, authors, endDate, extra = {}) => ({
  id, title, authors, status: 'lido', format: 'fisico', startDate: endDate.slice(0, 8) + '01', endDate, pages: 300, rating: 4, genre: 'Ficção',
  cover: null, isbn: '', notes: 'Anotação PRIVADA que nunca vai no link', createdAt: ts, updatedAt: ts, ...extra,
});
const OWNER = {
  version: 2, goals: { 2026: 12 }, defaultGoal: 12, customGenres: [], lastBackupAt: null, upNext: [], pageGoals: {},
  books: [
    read('o1', 'Torto Arado', 'Itamar Vieira Junior', '2026-02-10', { rating: 5, favorite: true }),
    read('o2', 'Sapiens', 'Yuval Noah Harari', '2026-03-12', { isbn: '9788525432186', genre: 'História', rating: 4.5 }),
    read('o3', 'Duna', 'Frank Herbert', '2026-05-02', { rating: 4 }),
    read('o4', 'A Hora da Estrela', 'Clarice Lispector', '2026-07-20', { rating: 3.5 }),
    read('o5', 'Verity', 'Colleen Hoover', '2026-09-01', { rating: 3, genre: 'Suspense' }),
    {
      id: 'r1', title: 'Fora de Série', authors: 'Malcolm Gladwell', status: 'lendo', format: 'fisico', startDate: '2026-10-02',
      endDate: null, pages: 304, currentPage: 120, currentPercent: null, cover: null, isbn: '', genre: 'Desenvolvimento pessoal',
      rating: null, favorite: false, notes: '', createdAt: ts, updatedAt: ts,
    },
  ],
};
const KAROL = {
  version: 2, goals: { 2026: 20 }, defaultGoal: 20, customGenres: ['Romance de época'], lastBackupAt: null, upNext: [], pageGoals: {},
  books: [
    read('k1', 'Torto arado', 'Itamar Vieira Júnior', '2026-01-20', { rating: 4, genre: 'Romance' }),
    read('k2', 'Os Sete Maridos de Evelyn Hugo', 'Taylor Jenkins Reid', '2026-02-14', { rating: 5, genre: 'Romance', favorite: true }),
    read('k3', 'É Assim que Acaba', 'Colleen Hoover', '2026-03-03', { rating: 3.5, genre: 'Romance' }),
    read('k4', 'Duna (Crônicas de Duna, #1)', 'Frank Herbert', '2026-04-22', { rating: 5, genre: 'Ficção científica' }),
    read('k5', 'Orgulho e Preconceito', 'Jane Austen', '2026-04-30', { rating: 4.5, genre: 'Romance de época' }),
    read('k6', 'A Paciente Silenciosa', 'Alex Michaelides', '2026-06-11', { rating: 4, genre: 'Suspense' }),
    read('k7', 'Quarta Asa', 'Rebecca Yarros', '2026-08-08', { rating: 4, genre: 'Fantasia' }),
    read('k8', 'Daisy Jones & The Six', 'Taylor Jenkins Reid', '2026-10-05', { rating: 4.5, genre: 'Romance' }),
  ],
};

// ---------- Navegador ----------

const browser = await playwright.chromium.launch();
const contextOptions = {
  viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, locale: 'pt-BR',
  userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_7 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Mobile/15E148 Safari/604.1',
  serviceWorkers: 'block', reducedMotion: 'reduce',
};

async function phone(name) {
  const context = await browser.newContext(contextOptions);
  await context.addInitScript((n) => {
    window.__shared = null;
    navigator.share = async (data) => { window.__shared = data; };
    if (!localStorage.getItem('leituras:nome')) localStorage.setItem('leituras:nome', n);
    // Conta os AudioContext criados (o som só pode nascer de um toque).
    window.__audio = { made: 0, ctxs: [] };
    const Orig = window.AudioContext;
    window.AudioContext = class extends Orig {
      constructor(...args) {
        super(...args);
        window.__audio.made += 1;
        window.__audio.ctxs.push(this);
      }
    };
  }, name);
  await context.route('https://covers.openlibrary.org/**', (r) => r.fulfill({ contentType: 'image/png', body: PNG }));
  await context.route(/^https:\/\/(?!127\.0\.0\.1)/, (r) => r.fulfill({ status: 404, body: '' }));
  return context;
}

const errors = [];
const watch = (p) => {
  p.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  p.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errors.push(`console: ${m.text()}`); });
  p.on('dialog', (d) => d.accept());
};

const onPage = (p, name) => p.waitForFunction((n) => document.getElementById('app').dataset.page === n, name);
const toastHas = (p, re) => p.waitForFunction((src) => new RegExp(src).test(document.getElementById('toast').textContent), re.source);
const readState = (p) => p.evaluate(async () => (await import('/js/db.js')).getItem('state'));
const writeState = (p, d) => p.evaluate(async (s) => (await import('/js/db.js')).setItem('state', s), d);
async function waitState(p, predicate, what = '') {
  let last;
  for (let i = 0; i < 50; i += 1) {
    last = await readState(p);
    if (last && predicate(last)) return last;
    await p.waitForTimeout(100);
  }
  throw new Error(`estado salvo não chegou ao esperado ${what}`);
}

async function seeded(context, data) {
  const p = await context.newPage();
  watch(p);
  await p.clock.setFixedTime(new Date('2026-10-28T12:00:00'));
  await p.goto(`${BASE}#/inicio`);
  await onPage(p, 'inicio');
  await writeState(p, data);
  await p.reload();
  await onPage(p, 'inicio');
  return p;
}

async function noOverflow(p, label) {
  for (const width of [320, 390, 430]) {
    await p.setViewportSize({ width, height: 844 });
    const overflow = await p.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    assert.ok(overflow <= 0, `${label}: ${width}px com ${overflow}px sobrando à direita`);
  }
  await p.setViewportSize({ width: 390, height: 844 });
}

/** Capturas no claro e no escuro, em 320, 390 e 430 px, com o elemento no topo. */
async function shots(p, name, selector, { widths = [320, 390, 430], fullPage = false } = {}) {
  await p.evaluate(() => document.getElementById('toast').classList.remove('show'));
  for (const width of widths) {
    await p.setViewportSize({ width, height: 844 });
    for (const scheme of ['light', 'dark']) {
      await p.emulateMedia({ colorScheme: scheme });
      await p.waitForFunction((s) => document.documentElement.dataset.theme === s, scheme).catch(() => {});
      if (selector) {
        await p.$eval(selector, (el) => el.scrollIntoView({ block: 'start' }));
        await p.evaluate(() => window.scrollBy(0, -70));
      }
      await p.screenshot({ path: join(SHOTS, `v16-social-${name}-${scheme === 'light' ? 'claro' : 'escuro'}-${width}.png`), fullPage });
    }
  }
  await p.setViewportSize({ width: 390, height: 844 });
  await p.emulateMedia({ colorScheme: 'dark' });
}

async function tapTargets(p, selector, label) {
  const small = await p.$$eval(selector, (els) => els.filter((el) => el.offsetParent)
    .map((el) => ({ el, r: el.getBoundingClientRect() }))
    .filter(({ r }) => r.height < 44 || r.width < 44)
    .map(({ el, r }) => `${el.outerHTML.slice(0, 60)} ${Math.round(r.width)}×${Math.round(r.height)}`));
  assert.deepEqual(small, [], `${label}: alvos de toque pequenos`);
}

const ownerCtx = await phone('Pedro');
const karolCtx = await phone('Karoline');
let owner;

try {
  owner = await seeded(ownerCtx, OWNER);
  const karol = await seeded(karolCtx, KAROL);

  // ---------- Comparar ----------

  step('Karoline: Ajustes › Comparar com alguém › Enviar meu resumo (link compactado, só o resumo)');
  await karol.goto(`${BASE}#/ajustes`);
  await onPage(karol, 'ajustes');
  assert.match(await karol.textContent('#set-comparar + .vs-card'), /Mande um resumo do seu ano/);
  await tapTargets(karol, '.vs-card button, .vs-card select', 'cartão Comparar');
  await karol.click('[data-action="share-compare"]');
  await karol.waitForFunction(() => window.__shared);
  const shared = await karol.evaluate(() => window.__shared);
  assert.match(shared.url, /#\/comparar\?d=z\.[A-Za-z0-9_-]+$/, 'compactado com deflate-raw');
  assert.ok(shared.url.startsWith(BASE));
  assert.ok(shared.url.length < 1500, `link de ${shared.url.length} caracteres`);
  const snap = decodeSnapshot(shared.url);
  assert.equal(snap.n, 'Karoline');
  assert.equal(snap.c, 8);
  assert.equal(snap.g, 20);
  assert.equal(snap.b.length, 8);
  assert.ok(!JSON.stringify(snap).includes('PRIVADA'), 'anotações não vão no link');
  assert.ok(!JSON.stringify(snap).includes('k1'), 'ids não vão no link');
  // Sem a lista de livros: o link fica bem menor.
  await karol.click('[data-action="compare-books"]');
  assert.equal(await karol.getAttribute('[data-action="compare-books"]', 'aria-pressed'), 'false');
  await karol.evaluate(() => { window.__shared = null; });
  await karol.click('[data-action="share-compare"]');
  await karol.waitForFunction(() => window.__shared);
  const short = await karol.evaluate(() => window.__shared.url);
  assert.equal(decodeSnapshot(short).b, undefined);
  assert.ok(short.length < shared.url.length, `${short.length} vs ${shared.url.length}`);
  await noOverflow(karol, 'Ajustes (Comparar)');
  await shots(karol, 'ajustes-comparar', '#set-comparar', { widths: [390] });

  step('Dono (app na Tela de Início): cola o link em Ajustes e vê a comparação, sem mexer nos livros');
  const before = await readState(owner);
  await owner.goto(`${BASE}#/ajustes`);
  await onPage(owner, 'ajustes');
  await owner.fill('#compare-link', 'qualquer coisa');
  await owner.click('[data-action="paste-compare"]');
  await toastHas(owner, /Cole o link inteiro/);
  await owner.fill('#compare-link', `Compare as nossas leituras de 2026 no Leituras: ${shared.url}`);
  await owner.press('#compare-link', 'Enter');
  await onPage(owner, 'comparar');
  const text = await owner.textContent('#app');
  assert.match(text, /Pedro e Karoline/);
  assert.match(text, /Comparação de 2026/);
  assert.match(text, /Livros lidos[\s\S]*Pedro[\s\S]*5[\s\S]*Karoline[\s\S]*8/);
  assert.match(text, /Livros em comum\s*2/);
  assert.match(text, /Torto Arado[\s\S]*Duna/);
  assert.match(text, /Os Sete Maridos de Evelyn Hugo/, 'favorito da Karoline');
  assert.equal(await owner.$$eval('.vs-month', (els) => els.length), 12);
  assert.equal(await owner.evaluate(() => document.body.classList.contains('no-nav')), true, 'sem a barra de baixo');
  assert.deepEqual(await readState(owner), before, 'nada do link entra nos livros');
  await noOverflow(owner, 'Comparar');
  await shots(owner, 'comparar', null, { fullPage: true });

  step('Guardar para ver depois: chave própria, fora dos livros e do backup; volta depois de fechar o app');
  await owner.click('[data-action="compare-save"]');
  await toastHas(owner, /Guardada neste celular/);
  assert.match(await owner.textContent('.vs-actions'), /Guardada neste celular/);
  const stored = await owner.evaluate(() => JSON.parse(localStorage.getItem('leituras:comparacao')));
  assert.match(stored.d, /^z\./);
  assert.deepEqual(await readState(owner), before, 'guardar não mexe nos livros');
  const backupHasIt = await owner.evaluate(async () => {
    const { serializeBackup } = await import('/js/store.js');
    const s = (await import('/js/db.js')).getItem('state');
    return serializeBackup(await s).includes('Karoline');
  });
  assert.equal(backupHasIt, false, 'o backup não leva o resumo da outra pessoa');
  await owner.goto(`${BASE}#/inicio`);
  await owner.reload();
  await onPage(owner, 'inicio');
  await owner.goto(`${BASE}#/comparar`);
  await onPage(owner, 'comparar');
  assert.match(await owner.textContent('#app'), /Pedro e Karoline/);
  await owner.goto(`${BASE}#/ajustes`);
  await onPage(owner, 'ajustes');
  assert.match(await owner.textContent('.vs-saved'), /Karoline · 2026[\s\S]*Guardada em 28\/10\/2026/);
  await shots(owner, 'ajustes-guardada', '#set-comparar', { widths: [390] });
  await tapTargets(owner, '.vs-saved button', 'comparação guardada');
  await owner.click('[data-action="compare-open-saved"]');
  await onPage(owner, 'comparar');
  assert.match(await owner.textContent('.vs-actions'), /Guardada neste celular/);

  step('Abrir o link direto (Safari): mostra a comparação e tira o resumo do endereço');
  const direct = await ownerCtx.newPage();
  watch(direct);
  await direct.goto(shared.url);
  await onPage(direct, 'comparar');
  assert.equal(await direct.evaluate(() => location.hash), '#/comparar');
  assert.match(await direct.textContent('#app'), /Pedro e Karoline/);

  step('Link estragado: aviso e tela vazia; link com HTML: escapado, nada roda');
  await direct.evaluate(() => localStorage.removeItem('leituras:comparacao'));
  await direct.goto(`${BASE}#/inicio`);
  await direct.reload();
  await onPage(direct, 'inicio');
  await direct.goto(`${BASE}#/comparar?d=z.bGl4byBxdWFscXVlcg`);
  await toastHas(direct, /Esse link de comparação não abriu/);
  assert.match(await direct.textContent('#app'), /Nenhuma comparação aberta/);
  const evil = {
    v: 1, n: '<img src=x onerror="window.__xss=1">', y: 2026, c: 1, p: 10, g: 5, r: 4,
    m: [1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], t: [['<script>window.__xss=2</script>', 1]],
    f: ['"><svg onload="window.__xss=3">', 'x'], b: [['Torto Arado<img src=x onerror="window.__xss=4">', 'Itamar', 5]], s: '2026-10-28',
  };
  await direct.goto(`${BASE}#/inicio`);
  await direct.goto(`${BASE}#/comparar?d=j.${Buffer.from(JSON.stringify(evil)).toString('base64url')}`);
  await onPage(direct, 'comparar');
  await direct.waitForTimeout(300);
  assert.equal(await direct.evaluate(() => window.__xss), undefined);
  assert.equal(await direct.$('#app img[src="x"], #app svg[onload], #app script'), null);
  assert.match(await direct.textContent('#app'), /<img src=x onerror="window\.__x/, 'aparece como texto (cortado em 30)');
  await direct.close();
  await karol.close();

  // ---------- Goodreads ----------

  step('Goodreads: prévia (contagens por status, repetidos de fora, sem data, sem título)');
  await owner.goto(`${BASE}#/ajustes`);
  await onPage(owner, 'ajustes');
  const beforeImport = await readState(owner);
  assert.match(await owner.textContent('#set-backup + .set-card'), /Importar do Goodreads ou StoryGraph \(CSV\)/);
  await owner.setInputFiles('[data-import-csv]', FIXTURE);
  await owner.waitForSelector('.gr-import');
  const preview = await owner.textContent('.gr-import');
  assert.match(preview, /Importar do Goodreads\?/);
  assert.match(preview, /goodreads_library_export\.csv/);
  assert.match(preview, /3\s*Lidos[\s\S]*1\s*Quero ler[\s\S]*1\s*Abandonados/);
  assert.doesNotMatch(preview, /Lendo/, 'o Torto Arado (lendo no Goodreads) já está no app');
  assert.match(preview, /3 livros já estão no app[\s\S]*ficam de fora[\s\S]*Torto Arado[\s\S]*Sapiens: Uma breve história[\s\S]*Duna/);
  assert.match(preview, /1 livro lido está sem data de leitura/);
  assert.match(preview, /1 linha sem título foi ignorada/);
  assert.match(await owner.textContent('[data-action="gr-import"]'), /Importar 5 livros/);
  assert.deepEqual(await readState(owner), beforeImport, 'a prévia não grava nada');
  await tapTargets(owner, '.gr-import button, .gr-import summary', 'prévia da importação');
  await noOverflow(owner, 'prévia da importação');
  await shots(owner, 'goodreads-previa', '.gr-import');
  await owner.click('[data-action="gr-dups"]');
  assert.match(await owner.textContent('[data-action="gr-import"]'), /Importar 8 livros/);
  assert.match(await owner.textContent('.gr-dups'), /vão entrar repetidos/);
  await owner.click('[data-action="gr-dups"]');
  assert.match(await owner.textContent('[data-action="gr-import"]'), /Importar 5 livros/);

  step('Importar 5 livros; Desfazer volta exatamente ao estado de antes');
  await owner.click('[data-action="gr-import"]');
  await toastHas(owner, /5 livros importados/);
  const imported = await waitState(owner, (s) => s.books.length === beforeImport.books.length + 5, 'com os 5 livros');
  const dune = imported.books.find((b) => b.title === 'Dune');
  assert.equal(dune.status, 'lido');
  assert.equal(dune.endDate, '2026-03-14');
  assert.equal(dune.rating, 5);
  assert.equal(dune.series, 'Dune Chronicles');
  assert.equal(dune.cover, 'https://covers.openlibrary.org/b/isbn/9780441172719-M.jpg?default=false');
  assert.deepEqual(dune.tags, ['favoritos', 'ficção científica']);
  assert.equal(imported.books.filter((b) => /torto arado/i.test(b.title)).length, 1, 'repetido ficou de fora');
  // Os dados guardados antes vieram crus (sem normalizar); o app os normaliza ao abrir.
  const expected = normalizeState(beforeImport);
  for (const old of expected.books) assert.deepEqual(imported.books.find((b) => b.id === old.id), old, `livro ${old.id} intacto`);
  assert.match(await owner.textContent('.gr-import.is-done'), /5 livros importados/);
  await shots(owner, 'goodreads-importado', '.gr-import', { widths: [390] });
  await owner.click('.gr-import [data-action="gr-undo"]');
  await toastHas(owner, /Importação desfeita/);
  await waitState(owner, (s) => s.books.length === beforeImport.books.length, 'sem os importados');
  assert.deepEqual(await readState(owner), expected, 'Desfazer devolve o estado de antes');
  assert.equal(await owner.$('.gr-import'), null);

  step('Cancelar não grava; arquivo de outro formato é recusado');
  await owner.setInputFiles('[data-import-csv]', FIXTURE);
  await owner.waitForSelector('.gr-import');
  await owner.click('[data-action="gr-cancel"]');
  await toastHas(owner, /Nada foi importado/);
  await owner.setInputFiles('[data-import-csv]', { name: 'planilha.csv', mimeType: 'text/csv', buffer: Buffer.from('Título;Autor(es);Status\nX;Y;Lido\n') });
  await toastHas(owner, /não parece a planilha do Goodreads/);
  assert.equal(await owner.$('.gr-import'), null);
  await owner.waitForTimeout(300);
  assert.deepEqual(await readState(owner), expected, 'Cancelar e arquivo recusado não gravam nada');

  // ---------- Sons ambiente ----------

  step('Cronômetro: seletor de som; nenhum AudioContext antes do toque');
  await owner.goto(`${BASE}#/inicio`);
  await onPage(owner, 'inicio');
  await owner.click('[data-action="start-timer"][data-id="r1"]');
  await onPage(owner, 'ler');
  assert.equal(await owner.$$eval('.amb-chip', (els) => els.map((e) => e.textContent).join('|')), 'Desligado|Chuva|Café|Lareira|Ruído marrom');
  assert.equal(await owner.getAttribute('.amb-chip[data-value="off"]', 'aria-pressed'), 'true');
  assert.equal(await owner.evaluate(() => window.__audio.made), 0, 'sem som escolhido, nada de áudio');
  await tapTargets(owner, '.amb-chip', 'sons');

  step('Chuva: o som começa no toque (AudioContext rodando) e a escolha fica no aparelho');
  await owner.click('.amb-chip[data-value="chuva"]');
  await owner.waitForFunction(() => window.__audio.ctxs[0]?.state === 'running');
  assert.equal(await owner.evaluate(() => window.__audio.made), 1);
  assert.equal(await owner.getAttribute('.amb', 'data-ambient-playing'), 'true');
  assert.match(await owner.textContent('.amb'), /Sem som\? Confira o modo silencioso/);
  assert.deepEqual(await owner.evaluate(() => JSON.parse(localStorage.getItem('leituras:som'))), { sound: 'chuva', volume: 60 });
  await owner.$eval('[data-ambient-volume]', (el) => {
    el.value = '35';
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  });
  assert.equal(await owner.evaluate(() => JSON.parse(localStorage.getItem('leituras:som')).volume), 35);
  await noOverflow(owner, 'cronômetro com som');
  await shots(owner, 'cronometro-som', null);

  step('Pausar para o som (o contexto dorme); Continuar volta; outros sons trocam sem criar outro contexto');
  await owner.click('[data-action="timer-toggle"]');
  assert.equal(await owner.getAttribute('.amb', 'data-ambient-playing'), 'false');
  await owner.waitForFunction(() => window.__audio.ctxs[0].state === 'suspended');
  assert.match(await owner.textContent('.amb'), /O som volta quando você continuar/);
  await shots(owner, 'cronometro-pausado', null, { widths: [390] });
  await owner.click('[data-action="timer-toggle"]');
  await owner.waitForFunction(() => window.__audio.ctxs[0].state === 'running');
  assert.equal(await owner.getAttribute('.amb', 'data-ambient-playing'), 'true');
  for (const id of ['cafe', 'lareira', 'marrom']) {
    await owner.click(`.amb-chip[data-value="${id}"]`);
    assert.equal(await owner.getAttribute(`.amb-chip[data-value="${id}"]`, 'aria-pressed'), 'true');
    assert.equal(await owner.getAttribute('.amb', 'data-ambient-playing'), 'true');
    await owner.waitForTimeout(400);
  }
  assert.equal(await owner.evaluate(() => window.__audio.made), 1, 'um contexto só');

  step('Parar (formulário) para o som; Voltar ao cronômetro retoma; sair da tela para');
  await owner.click('[data-action="timer-stop"]');
  assert.equal(await owner.$('.amb'), null, 'sem o seletor no formulário do Parar');
  await owner.waitForFunction(() => window.__audio.ctxs[0].state === 'suspended');
  await owner.click('[data-action="timer-back"]');
  await owner.waitForFunction(() => window.__audio.ctxs[0].state === 'running');
  await owner.click('header a.icon-btn');
  await onPage(owner, 'inicio');
  await owner.waitForFunction(() => window.__audio.ctxs[0].state === 'suspended');

  step('Voltar pelo aviso do Início (um toque) retoma o som; depois de recarregar, espera um toque');
  await owner.click('.timer-banner');
  await onPage(owner, 'ler');
  await owner.waitForFunction(() => window.__audio.ctxs[0].state === 'running');
  assert.equal(await owner.getAttribute('.amb', 'data-ambient-playing'), 'true');
  await owner.reload();
  await onPage(owner, 'ler');
  await owner.waitForTimeout(300);
  assert.equal(await owner.evaluate(() => window.__audio.made), 0, 'recarregar não liga som sozinho');
  assert.match(await owner.textContent('.amb'), /Toque no som escolhido para tocar/);
  await owner.click('.amb-chip[data-value="marrom"]');
  await owner.waitForFunction(() => window.__audio.ctxs[0]?.state === 'running');

  step('Cancelar a sessão para o som; "Ler agora" com som escolhido toca já no toque');
  await owner.click('[data-action="timer-cancel"]');
  await onPage(owner, 'inicio');
  await owner.waitForFunction(() => window.__audio.ctxs[0].state === 'suspended');
  await owner.click('[data-action="start-timer"][data-id="r1"]');
  await onPage(owner, 'ler');
  await owner.waitForFunction(() => window.__audio.ctxs[0].state === 'running');
  assert.equal(await owner.getAttribute('.amb', 'data-ambient-playing'), 'true');
  await owner.click('.amb-chip[data-value="off"]');
  await owner.waitForFunction(() => window.__audio.ctxs[0].state === 'suspended');
  assert.equal(await owner.$('[data-ambient-volume]'), null);
  assert.deepEqual(await owner.evaluate(() => JSON.parse(localStorage.getItem('leituras:som')).sound), 'off');

  assert.deepEqual(errors, [], 'sem erros no console');
  console.log('\nOK: comparar, importar do Goodreads e sons ambiente');
} catch (err) {
  await owner?.screenshot({ path: join(SHOTS, 'v16-social-falha.png'), fullPage: true }).catch(() => {});
  console.error('\nFALHOU:', err.message);
  if (errors.length) console.error(errors.join('\n'));
  process.exitCode = 1;
} finally {
  await browser.close();
  server.close();
}
