// Teste exploratório (QA) das abas Diário e Trechos e da tela Trechos salvos:
// casos de borda que o diario-trechos.mjs não cobre (fuso do Brasil, livro que trocou de
// formato, limite de trechos, textos enormes, rascunho de Dados, todos os status, larguras).
// Uso: node tests/e2e/qa-diario-trechos.mjs   (precisa do Playwright, como o smoke.mjs)

import { execSync } from 'node:child_process';
import { createServer } from 'node:http';
import { mkdirSync, readFileSync, existsSync } from 'node:fs';
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
const BASE = `http://localhost:${server.address().port}/`;

const XSS = '<img src=x onerror="window.__xss=1">';
const LONG_WORD = 'a'.repeat(5000);
const LONG_TEXT = 'Era uma vez um leitor que lia devagar, ' .repeat(130).slice(0, 5000);
const many = (n, prefix) => Array.from({ length: n }, (_, i) => ({
  id: `${prefix}${i}`, text: `${LONG_TEXT.slice(0, 4900)} nº ${i} coração`, page: i % 300, percent: null, note: `nota ${i}`,
  createdAt: new Date(Date.UTC(2026, 0, 1) + i * 3600000).toISOString(),
}));

const seed = {
  version: 2, goals: {}, defaultGoal: 12, customGenres: [], lastBackupAt: '2026-10-10T10:00:00.000Z', upNext: [], pageGoals: {},
  books: [
    { id: 'want', title: 'Quero Ler Isto', authors: 'Autora Um', pages: 200, status: 'quero', format: 'fisico', createdAt: '2026-01-01T00:00:00.000Z' },
    {
      id: 'read', title: 'Lido Antes', authors: 'Autor Dois', pages: 300, status: 'lido', format: 'fisico', startDate: '2026-09-01', endDate: '2026-09-20',
      rating: 4, createdAt: '2026-09-01T00:00:00.000Z',
      journal: [{ date: '2026-09-01', from: 0, to: 150, unit: 'page', note: '' }, { date: '2026-09-20', from: 150, to: 300, unit: 'page', note: '' }],
      quotes: [{ id: 'rq', text: 'Trecho da primeira leitura.', page: 10, percent: null, note: '', createdAt: '2026-09-02T00:00:00.000Z' }],
    },
    {
      id: 'reread', title: 'Lido Antes', authors: 'Autor Dois', pages: 300, status: 'lendo', format: 'fisico', startDate: '2026-10-10', currentPage: 40,
      reread: true, createdAt: '2026-10-10T00:00:00.000Z', journal: [{ date: '2026-10-12', from: 0, to: 40, unit: 'page', note: '' }],
    },
    {
      id: 'drop', title: 'Abandonado', authors: 'Autor Três', pages: 500, status: 'abandonado', format: 'fisico', startDate: '2026-05-01', endDate: '2026-06-01',
      currentPage: 90, dropReason: 'Chato.', createdAt: '2026-05-01T00:00:00.000Z', journal: [{ date: '2026-05-10', from: 0, to: 90, unit: 'page', note: '' }],
    },
    {
      id: 'knp', title: 'Kindle Sem Páginas', authors: 'Autor Quatro', pages: null, status: 'lendo', format: 'kindle', startDate: '2026-10-01', currentPercent: 30,
      createdAt: '2026-10-01T00:00:00.000Z', journal: [{ date: '2026-10-05', from: 0, to: 10, unit: 'percent', note: '' }, { date: '2026-10-15', from: 10, to: 30, unit: 'percent', note: '' }],
    },
    {
      // Era físico (trecho com página) e passou para o Kindle.
      id: 'switched', title: 'Mudou de Formato', authors: 'Autor Cinco', pages: 400, status: 'lendo', format: 'kindle', startDate: '2026-10-01', currentPercent: 20,
      createdAt: '2026-10-01T00:00:00.000Z', quotes: [{ id: 'sq', text: 'Marcado no papel.', page: 63, percent: null, note: '', createdAt: '2026-10-02T12:00:00.000Z' }],
    },
    {
      id: 'xss', title: XSS, authors: XSS, pages: 100, status: 'lendo', format: 'fisico', startDate: '2026-10-01', currentPage: 10, createdAt: '2026-10-01T00:00:00.000Z',
      journal: [{ date: '2026-10-14', from: 0, to: 10, unit: 'page', note: XSS }],
      quotes: [{ id: 'xq', text: XSS, page: 5, percent: null, note: XSS, createdAt: '2026-10-03T00:00:00.000Z' }],
    },
    {
      id: 'full', title: 'Cheio de Trechos', authors: 'Autor Seis', pages: 900, status: 'lendo', format: 'fisico', startDate: '2026-01-01', currentPage: 5,
      createdAt: '2026-01-01T00:00:00.000Z', quotes: many(500, 'm'),
    },
    {
      id: 'long', title: 'Um Título Muito Comprido Que Não Cabe Na Barra de Cima do Aplicativo de Jeito Nenhum', authors: 'Autor Sete',
      pages: 250, status: 'lendo', format: 'fisico', startDate: '2026-10-01', currentPage: 100, createdAt: '2026-10-01T00:00:00.000Z',
      journal: [{ date: '2026-10-15', from: 50, to: 100, unit: 'page', note: '' }],
      quotes: [
        { id: 'lw', text: LONG_WORD, page: 1, percent: null, note: '', createdAt: '2026-10-04T00:00:00.000Z' },
        { id: 'emo', text: '📚'.repeat(80), page: 2, percent: null, note: '', createdAt: '2026-10-05T00:00:00.000Z' },
        { id: 'lt', text: LONG_TEXT, page: 3, percent: null, note: '', createdAt: '2026-10-06T00:00:00.000Z' },
      ],
    },
  ],
};

const browser = await playwright.chromium.launch();
const context = await browser.newContext({
  viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, locale: 'pt-BR',
  timezoneId: 'America/Sao_Paulo', acceptDownloads: true,
});
const page = await context.newPage();
// 22h30 em São Paulo: já é o dia seguinte em UTC.
await page.clock.setFixedTime(new Date('2026-10-16T22:30:00-03:00'));

const STATE_KEY = 'state';
const readState = (p = page) => p.evaluate(async (key) => (await import('/js/db.js')).getItem(key), STATE_KEY);
const writeState = (data, p = page) => p.evaluate(async ([key, d]) => (await import('/js/db.js')).setItem(key, d), [STATE_KEY, data]);
async function waitState(predicate, p = page) {
  let last;
  for (let i = 0; i < 50; i += 1) {
    last = await readState(p);
    if (last && predicate(last)) return last;
    await p.waitForTimeout(100);
  }
  throw new Error(`Estado salvo não chegou ao esperado: ${JSON.stringify(last)?.slice(0, 300)}`);
}
const bookIn = (s, id) => s.books.find((b) => b.id === id);

const errors = [];
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errors.push(`console: ${m.text()}`); });
page.on('dialog', (d) => d.accept());
await page.route(/^https:\/\//, (r) => r.abort());

const shot = (name, fullPage = false) => page.screenshot({ path: join(SHOTS, `qa-diario-trechos-${name}.png`), fullPage });
const step = (msg) => console.log(`• ${msg}`);
const onPage = (name) => page.waitForFunction((n) => document.getElementById('app').dataset.page === n, name);
const toastHas = (re) => page.waitForFunction((src) => new RegExp(src).test(document.getElementById('toast').textContent), re.source);
const openBook = async (id, tab = '') => {
  await page.goto(`${BASE}#/inicio`);
  await onPage('inicio');
  await page.goto(`${BASE}#/livro/${id}/editar${tab ? `?aba=${tab}` : ''}`);
  await onPage('livro');
};
// Diário agrupado por semana (v1.4): abre todas antes de tocar num dia antigo.
async function openAllWeeks() {
  while (await page.locator('.diary-week-head[aria-expanded="false"]').count()) {
    await page.click('.diary-week-head[aria-expanded="false"] >> nth=0');
  }
}
async function layoutProblems(label, { targets = true } = {}) {
  const out = [];
  for (const width of [320, 375, 390, 430]) {
    await page.setViewportSize({ width, height: 800 });
    const r = await page.evaluate(() => ({
      overflow: document.documentElement.scrollWidth - window.innerWidth,
      small: [...document.querySelectorAll('input, select, textarea')]
        .filter((el) => el.offsetParent && parseFloat(getComputedStyle(el).fontSize) < 16).map((el) => el.id || el.name),
      targets: [...document.querySelectorAll('#app button, #app a')]
        .filter((el) => el.offsetParent && el.getBoundingClientRect().height < 44).map((el) => el.outerHTML.slice(0, 70)),
      wide: [...document.querySelectorAll('#app *')].filter((el) => el.getBoundingClientRect().right > window.innerWidth + 1)
        .map((el) => el.className || el.tagName).slice(0, 5),
    }));
    if (r.overflow > 0) out.push(`${label} @${width}: ${r.overflow}px de rolagem lateral (${r.wide.join(', ')})`);
    if (r.small.length) out.push(`${label} @${width}: campos < 16px: ${r.small.join(', ')}`);
    if (targets && r.targets.length) out.push(`${label} @${width}: alvos < 44px: ${r.targets.join(' | ')}`);
  }
  await page.setViewportSize({ width: 390, height: 844 });
  return out;
}

const problems = [];
try {
  step('dados de exemplo');
  await page.goto(BASE);
  await page.waitForSelector('.hero');
  await writeState(seed);
  await page.reload();
  await page.waitForSelector('.hero');

  step('todos os status: as três abas abrem, sem erro e sem estourar a largura');
  for (const id of ['want', 'read', 'reread', 'drop', 'knp', 'switched', 'xss', 'long']) {
    // Ficha do livro (v1.4) do mesmo livro.
    await page.goto(`${BASE}#/livro/${id}`);
    await page.waitForSelector('.ficha-hero');
    problems.push(...await layoutProblems(`${id}/ficha`));
    await openBook(id);
    for (const tab of ['dados', 'diario', 'trechos']) {
      await page.click(`[data-tab="${tab}"]`);
      await page.waitForSelector(`.book-tab.is-on[data-tab="${tab}"]`);
      problems.push(...await layoutProblems(`${id}/${tab}`, { targets: tab !== 'dados' }));
      if (tab !== 'dados') {
        // Formulários abertos também.
        const opener = tab === 'diario' ? '[data-action="diary-edit"]' : '[data-action="quote-new"]';
        if (await page.locator(opener).count()) {
          await page.locator(opener).first().click();
          await page.waitForSelector('.notes-form');
          problems.push(...await layoutProblems(`${id}/${tab} (formulário)`));
          await page.click(tab === 'diario' ? '[data-action="diary-cancel"]' : '[data-action="quote-cancel"]');
        }
      }
    }
  }
  await openBook('long', 'trechos');
  await page.setViewportSize({ width: 320, height: 800 });
  await shot('01-titulo-longo-320');
  await page.setViewportSize({ width: 390, height: 844 });
  assert.equal(await page.evaluate(() => window.__xss), undefined, 'XSS');

  step('XSS: título, autor, nota e trecho aparecem como texto');
  await openBook('xss', 'trechos');
  assert.equal(await page.textContent('.book-tabs-title'), XSS);
  assert.equal(await page.textContent('.quote-text'), XSS);
  assert.equal(await page.textContent('.quote-note'), XSS);
  await page.click('[data-tab="diario"]');
  assert.equal(await page.textContent('.diary-note'), XSS);
  await page.goto(`${BASE}#/trechos`);
  await onPage('trechos');
  await page.fill('#quotes-q', 'onerror');
  assert.equal(await page.locator('.quote-link').count(), 1);
  assert.equal(await page.textContent('.quote-book'), XSS);
  await page.fill('#quotes-q', '');
  assert.equal(await page.evaluate(() => window.__xss), undefined, 'XSS');

  step('trecho salvo às 22h30 mostra a data daqui, não a de Greenwich');
  await openBook('reread', 'trechos');
  await page.click('[data-action="quote-new"]');
  await page.fill('#q-text', 'Salvo à noite.');
  await page.fill('#q-pos', '12');
  await page.press('#q-pos', 'Enter');
  await page.waitForSelector('[data-quote-form]', { state: 'detached' });
  const night = bookIn(await waitState((s) => bookIn(s, 'reread').quotes.length === 1), 'reread').quotes[0];
  assert.equal(night.page, 12, 'Enter na página salva o trecho');
  const meta = await page.textContent('.quote-meta');
  if (!/16 out 2026/.test(meta)) problems.push(`BUG data do trecho: "${meta.trim()}" (salvo em 16/10 às 22h30)`);

  step('releitura: trechos da primeira leitura continuam no registro antigo');
  await openBook('read', 'trechos');
  assert.equal(await page.locator('.quote-card').count(), 1);

  step('livro que mudou de físico para Kindle: posição mostrada é a que a pessoa acabou de informar');
  await openBook('switched', 'trechos');
  await page.click('[data-action="quote-edit"][data-id="sq"]');
  assert.equal(await page.inputValue('#q-pos'), '');
  await page.fill('#q-pos', '30');
  await page.click('[data-quote-form] button[type="submit"]');
  await waitState((s) => bookIn(s, 'switched').quotes[0].percent === 30);
  const swMeta = await page.textContent('.quote-meta');
  if (!/30%/.test(swMeta)) problems.push(`BUG posição do trecho no Kindle: mostra "${swMeta.trim()}" depois de informar 30%`);

  step('Kindle sem total de páginas: resumo em %');
  await openBook('knp', 'diario');
  const knpTiles = (await page.locator('.diary-summary .tile').allInnerTexts()).map((t) => t.replace(/\s+/g, ' '));
  assert.deepEqual(knpTiles, ['2 dias de leitura', '30% registrados', '15% por dia de leitura']);
  await openAllWeeks();
  await page.click('[data-action=\"diary-edit\"][data-date="2026-10-15"]');
  await page.fill('#d-to', '35.5');
  await page.press('#d-note', 'Enter');
  const knp = bookIn(await waitState((s) => bookIn(s, 'knp').journal[1].to === 36), 'knp');
  assert.equal(knp.currentPercent, 36, '% atual acompanha a correção do último dia');

  step('limite de 500 trechos por livro: o 501º não some calado');
  await openBook('full', 'trechos');
  let t0 = Date.now();
  await page.click('[data-action="quote-new"]');
  await page.fill('#q-text', 'O quingentésimo primeiro.');
  await page.click('[data-quote-form] button[type="submit"]');
  await page.waitForTimeout(600);
  const fullNow = bookIn(await readState(), 'full');
  const toastText = await page.textContent('#toast');
  if (fullNow.quotes.length === 500 && !fullNow.quotes.some((q) => q.text === 'O quingentésimo primeiro.') && /Trecho salvo/.test(toastText)) {
    problems.push(`BUG 501º trecho descartado em silêncio (aviso: "${toastText.trim()}")`);
  }
  console.log(`   abrir formulário + salvar com 500 trechos: ${Date.now() - t0} ms`);

  step('desempenho: 500 trechos longos na aba e na busca');
  t0 = Date.now();
  await openBook('full', 'trechos');
  await page.waitForSelector('.quote-card');
  console.log(`   aba Trechos com 500 trechos: ${Date.now() - t0} ms`);
  await page.goto(`${BASE}#/trechos`);
  await onPage('trechos');
  const typing = await page.evaluate(async () => {
    const input = document.getElementById('quotes-q');
    const t = performance.now();
    for (const ch of 'coracao 49') {
      input.value += ch;
      input.dispatchEvent(new Event('input', { bubbles: true }));
    }
    return (performance.now() - t) / 10;
  });
  console.log(`   busca: ${typing.toFixed(1)} ms por letra`);
  if (typing > 150) problems.push(`LENTO busca de trechos: ${typing.toFixed(0)} ms por letra`);
  await page.fill('#quotes-q', '');

  step('imagem: palavra enorme (5000 letras) e emojis');
  await openBook('long', 'trechos');
  for (const id of ['lw', 'emo', 'lt']) {
    t0 = Date.now();
    try {
      const [file] = await Promise.all([
        page.waitForEvent('download', { timeout: 15000 }),
        page.click(`[data-action="quote-share"][data-id="${id}"]`, { timeout: 15000 }),
      ]);
      await file.saveAs(join(SHOTS, `qa-diario-trechos-imagem-${id}.png`));
    } catch {
      problems.push(`BUG imagem do trecho ${id}: não ficou pronta em 15 s (tela travada)`);
      break;
    }
    const ms = Date.now() - t0;
    console.log(`   imagem ${id}: ${ms} ms`);
    if (ms > 4000) problems.push(`LENTO imagem do trecho ${id}: ${ms} ms`);
    await page.waitForTimeout(300);
  }

  step('rascunho de Dados + correção do diário + Salvar pela aba');
  await openBook('long');
  await page.fill('#f-current', '120');
  await page.fill('#f-title', 'Título Novo');
  await page.click('[data-tab="diario"]');
  await page.waitForSelector('[data-action="book-save"]');
  await openAllWeeks();
  await page.click('[data-action=\"diary-edit\"][data-date="2026-10-15"]');
  await page.fill('#d-to', '110');
  await page.click('[data-diary-form] button[type="submit"]');
  await waitState((s) => bookIn(s, 'long').journal[0].to === 110);
  assert.equal(bookIn(await readState(), 'long').currentPage, 110);
  assert.equal(bookIn(await readState(), 'long').title, seed.books.find((b) => b.id === 'long').title, 'Dados só grava no Salvar');
  await page.click('[data-tab="dados"]');
  assert.equal(await page.inputValue('#f-current'), '120', 'rascunho de Dados continua');
  assert.equal(await page.inputValue('#f-title'), 'Título Novo');
  await page.click('[data-tab="trechos"]');
  await page.click('[data-action="book-save"]');
  await onPage('inicio');
  const saved = bookIn(await waitState((s) => bookIn(s, 'long').title === 'Título Novo'), 'long');
  assert.equal(saved.currentPage, 120);
  assert.deepEqual(saved.journal.map((x) => [x.date, x.from, x.to]), [['2026-10-15', 50, 110], ['2026-10-16', 110, 120]]);
  assert.equal(saved.quotes.length, 3);

  step('Voltar com rascunho descarta Dados mas mantém o trecho salvo');
  await openBook('drop');
  await page.fill('#f-title', 'Não salvar');
  await page.click('[data-tab="trechos"]');
  await page.click('[data-action="quote-new"]');
  await page.fill('#q-text', 'Fica.');
  await page.click('[data-quote-form] button[type="submit"]');
  await waitState((s) => bookIn(s, 'drop').quotes.length === 1);
  await page.click('.form-top a:has-text("Voltar")');
  await onPage('inicio');
  assert.equal(bookIn(await readState(), 'drop').title, 'Abandonado');

  step('desfazer exclusão de trecho do meio volta na mesma posição');
  await openBook('long', 'trechos');
  const before = bookIn(await readState(), 'long').quotes.map((q) => q.id);
  await page.click('[data-action="quote-delete"][data-id="lw"]');
  await waitState((s) => bookIn(s, 'long').quotes.length === before.length - 1);
  await page.click('[data-tab="diario"]');
  await page.click('.toast button:has-text("Desfazer")');
  const restored = bookIn(await waitState((s) => bookIn(s, 'long').quotes.length === before.length), 'long');
  assert.deepEqual(restored.quotes.map((q) => q.id), before);

  step('sem mudança em Dados, salvar no diário/trechos não faz aparecer o Salvar');
  await openBook('read', 'diario');
  await openAllWeeks();
  await page.click('[data-action=\"diary-edit\"][data-date="2026-09-20"]');
  await page.fill('#d-note', 'Terminei no parque.');
  await page.click('[data-diary-form] button[type="submit"]');
  await waitState((s) => bookIn(s, 'read').journal[1].note === 'Terminei no parque.');
  assert.equal(await page.locator('[data-action="book-save"]').count(), 0);
  await page.click('[data-tab="trechos"]');
  await page.click('[data-action="quote-delete"][data-id="rq"]');
  await waitState((s) => bookIn(s, 'read').quotes.length === 0);
  assert.equal(await page.locator('[data-action="book-save"]').count(), 0);

  step('Desfazer depois de abrir outro livro devolve o trecho ao livro certo');
  await openBook('want', 'trechos');
  await page.click('.toast button:has-text("Desfazer")');
  const undone = await waitState((s) => bookIn(s, 'read').quotes.length === 1);
  assert.equal(bookIn(undone, 'want').quotes.length, 0);
  assert.equal(await page.locator('.quote-card').count(), 0, 'a tela do outro livro não ganha o trecho');

  step('Concluir leitura passando pelas abas');
  await page.goto(`${BASE}#/inicio`);
  await onPage('inicio');
  await page.goto(`${BASE}#/livro/reread?concluir=1`);
  await onPage('livro');
  await page.click('[data-tab="diario"]');
  await page.waitForSelector('[data-action="book-save"]');
  await openAllWeeks();
  await page.click('[data-action=\"diary-edit\"][data-date="2026-10-12"]');
  await page.fill('#d-to', '45');
  await page.click('[data-diary-form] button[type="submit"]');
  await waitState((s) => bookIn(s, 'reread').journal[0].to === 45);
  await page.click('[data-action="book-save"]');
  await onPage('inicio');
  const done = bookIn(await waitState((s) => bookIn(s, 'reread').status === 'lido'), 'reread');
  assert.deepEqual(done.journal.map((x) => [x.date, x.from, x.to]), [['2026-10-12', 0, 45], ['2026-10-16', 45, 300]]);
  assert.equal(done.quotes.length, 1);

  step('diário: corrigir com Enter e com data de outro ano');
  await openBook('drop', 'diario');
  await openAllWeeks();
  await page.click('[data-action=\"diary-edit\"][data-date="2026-05-10"]');
  await page.fill('#d-date', '2025-12-31');
  await page.press('#d-to', 'Enter');
  await waitState((s) => bookIn(s, 'drop').journal[0].date === '2025-12-31');
  assert.match((await page.innerText('.diary-row')).replace(/\s+/g, ' '), /31 DEZ 2025/);
  await shot('02-diario-outro-ano');

  if (problems.length) console.log(`\nPROBLEMAS (${problems.length}):\n${problems.map((p) => `  - ${p}`).join('\n')}`);
  assert.deepEqual(problems, []);
  assert.deepEqual(errors, []);
  console.log('\nQA: tudo certo. Capturas em tests/e2e/screens/qa-diario-trechos-*.png');
} catch (err) {
  await shot('falha').catch(() => {});
  console.error('\nFALHOU:', err.message);
  if (errors.length) console.error(errors.join('\n'));
  process.exitCode = 1;
} finally {
  await browser.close();
  server.close();
}
