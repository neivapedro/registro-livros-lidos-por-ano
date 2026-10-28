// Teste de ponta a ponta das abas Diário e Trechos do livro e da tela Trechos salvos.
// Uso: node tests/e2e/diario-trechos.mjs   (precisa do Playwright, como o smoke.mjs)

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

const LONG = 'Tu és o mesmo homem que eu conheci? Eu sou o mesmo. A vida é que muda, e o tempo, que tudo come, '
  + 'também come a gente aos poucos, sem pressa e sem pedir licença, como quem tem toda a eternidade pela frente.';

const seed = {
  version: 2,
  goals: {},
  defaultGoal: 12,
  customGenres: [],
  lastBackupAt: '2026-10-10T10:00:00.000Z',
  upNext: [],
  pageGoals: {},
  books: [
    {
      id: 'b1', title: 'Dom Casmurro', authors: 'Machado de Assis', pages: 256, status: 'lendo', format: 'fisico',
      startDate: '2025-12-20', currentPage: 164, createdAt: '2025-12-20T00:00:00.000Z',
      journal: [
        { date: '2025-12-28', from: 0, to: 80, unit: 'page', note: '' },
        { date: '2026-10-10', from: 80, to: 120, unit: 'page', note: 'No metrô, ida e volta.' },
        { date: '2026-10-12', from: 120, to: 164, unit: 'page', note: '' },
      ],
      quotes: [
        { id: 'q1', text: 'Olhos de cigana oblíqua e dissimulada.', page: 63, percent: null, note: 'Capitu, sempre.', createdAt: '2026-10-10T20:00:00.000Z' },
        { id: 'q2', text: LONG, page: 120, percent: null, note: '', createdAt: '2026-10-12T21:00:00.000Z' },
      ],
    },
    {
      id: 'k1', title: 'Fora de Série', authors: 'Malcolm Gladwell', pages: 320, status: 'lendo', format: 'kindle',
      startDate: '2026-10-01', currentPercent: 45, createdAt: '2026-10-01T00:00:00.000Z',
      journal: [{ date: '2026-10-12', from: 20, to: 45, unit: 'percent', note: '' }],
      quotes: [{ id: 'q3', text: 'Dez mil horas de prática.', page: null, percent: 30, note: '', createdAt: '2026-10-11T00:00:00.000Z' }],
    },
    {
      id: 'r1', title: 'Sapiens', authors: 'Yuval Noah Harari', pages: 464, status: 'lido', format: 'fisico',
      startDate: '2026-08-01', endDate: '2026-08-28', rating: 5, createdAt: '2026-08-01T00:00:00.000Z',
    },
  ],
};

const browser = await playwright.chromium.launch();
const context = await browser.newContext({
  viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, locale: 'pt-BR',
  acceptDownloads: true,
});
const page = await context.newPage();
await page.clock.setFixedTime(new Date('2026-10-16T12:00:00'));

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

const shot = (name, fullPage = true) => page.screenshot({ path: join(SHOTS, `diario-trechos-${name}.png`), fullPage });
const step = (msg) => console.log(`• ${msg}`);
const onPage = (name) => page.waitForFunction((n) => document.getElementById('app').dataset.page === n, name);
const toastHas = (re) => page.waitForFunction((src) => new RegExp(src).test(document.getElementById('toast').textContent), re.source);
async function noOverflow(label) {
  for (const width of [320, 390]) {
    await page.setViewportSize({ width, height: 844 });
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    assert.ok(overflow <= 0, `${label}: ${overflow}px sobrando à direita em ${width}px`);
  }
}
// Diário agrupado por semana (v1.4): só a mais recente começa aberta.
async function openAllWeeks() {
  while (await page.locator('.diary-week-head[aria-expanded="false"]').count()) {
    await page.click('.diary-week-head[aria-expanded="false"] >> nth=0');
  }
}
async function smallFields() {
  return page.evaluate(() => [...document.querySelectorAll('input, select, textarea')]
    .filter((el) => parseFloat(getComputedStyle(el).fontSize) < 16).map((el) => el.outerHTML.slice(0, 60)));
}
async function smallTargets() {
  return page.evaluate(() => [...document.querySelectorAll('#app button, #app a')]
    .filter((el) => el.offsetParent && el.getBoundingClientRect().height < 44).map((el) => el.outerHTML.slice(0, 80)));
}

try {
  step('dados de exemplo');
  await page.goto(BASE);
  await page.waitForSelector('.hero');
  await writeState(seed);
  await page.reload();
  await page.waitForSelector('.hero');

  step('livro novo não tem abas');
  await page.goto(`${BASE}#/novo`);
  await onPage('novo');
  assert.equal(await page.locator('.book-tabs').count(), 0);

  step('aba Dados continua o formulário de antes');
  await page.goto(`${BASE}#/livro/b1/editar`);
  await onPage('livro');
  await page.waitForSelector('.book-tabs');
  const tabs = (await page.locator('.book-tab').allTextContents()).map((t) => t.replace(/\s+/g, ' ').trim());
  assert.deepEqual(tabs, ['Dados', 'Diário 3', 'Trechos 2']);
  assert.equal(await page.getAttribute('.book-tab.is-on', 'data-tab'), 'dados');
  assert.equal(await page.locator('.seg-btn.is-on').first().textContent(), 'Lendo');
  assert.equal(await page.inputValue('#f-title'), 'Dom Casmurro');
  await page.screenshot({ path: join(SHOTS, 'diario-trechos-01-dados.png') });
  await noOverflow('aba Dados');

  step('aba Diário: resumo e entradas, mais recentes primeiro');
  await page.click('[data-tab="diario"]');
  await page.waitForSelector('.diary-list');
  assert.equal(await page.locator('[data-action="book-save"]').count(), 0, 'sem mudanças em Dados, sem Salvar');
  // Semanas, da mais recente para a mais antiga; só a primeira aberta.
  const weeks = (await page.locator('.diary-week-title').allTextContents());
  assert.deepEqual(weeks, ['Semana de 12 out', 'Semana de 5 out', 'Semana de 22 dez 2025']);
  assert.deepEqual(await page.locator('.diary-week-head').evaluateAll((els) => els.map((e) => e.getAttribute('aria-expanded'))), ['true', 'false', 'false']);
  assert.equal(await page.locator('.diary-list:visible .diary-row').count(), 1);
  // Gráfico por semana (o diário passa de 90 dias): barras na escala do tempo.
  assert.match(await page.textContent('.rchart-range'), /págs\. por semana/);
  await openAllWeeks();
  const tiles = (await page.locator('.diary-summary .tile').allInnerTexts()).map((t) => t.replace(/\s+/g, ' '));
  assert.deepEqual(tiles, ['3 dias de leitura', '164 págs. registradas', '55 págs. por dia de leitura']);
  const rows = (await page.locator('.diary-row').allInnerTexts()).map((t) => t.replace(/\s+/g, ' ').trim());
  assert.match(rows[0], /^12 OUT p\. 120 → 164 \+44 págs\./);
  assert.match(rows[1], /No metrô/);
  assert.match(rows[2], /^28 DEZ 2025 p\. 0 → 80/);
  await shot('02-diario');
  await noOverflow('aba Diário');
  assert.deepEqual(await smallTargets(), [], 'alvos de toque menores que 44px');

  step('corrigir entrada: validações');
  await page.click('[data-action="diary-edit"][data-date="2026-10-12"]');
  await page.waitForSelector('[data-diary-form]');
  assert.equal(await page.evaluate(() => document.activeElement.id), 'd-to');
  assert.equal(await page.inputValue('#d-from'), '120');
  assert.deepEqual(await smallFields(), []);
  await page.fill('#d-to', '300');
  await page.click('[data-diary-form] button[type="submit"]');
  await toastHas(/não pode passar de 256/);
  await page.fill('#d-to', '160');
  await page.fill('#d-date', '2026-10-10');
  await page.press('#d-to', 'Enter');
  await toastHas(/Já existe um registro em 10 out/);
  await page.fill('#d-date', '2026-10-17');
  await page.click('[data-diary-form] button[type="submit"]');
  await toastHas(/não pode estar no futuro/);
  await page.fill('#d-date', '2026-10-13');
  await page.fill('#d-note', 'Fim do capítulo.');
  await page.locator('[data-diary-form]').scrollIntoViewIfNeeded();
  await shot('03-diario-corrigindo', false);
  await noOverflow('formulário do diário');
  await page.click('[data-diary-form] button[type="submit"]');
  await page.waitForSelector('[data-diary-form]', { state: 'detached' });
  const fixed = bookIn(await waitState((s) => bookIn(s, 'b1').journal.some((x) => x.date === '2026-10-13')), 'b1');
  assert.deepEqual(fixed.journal.at(-1), { date: '2026-10-13', from: 120, to: 160, unit: 'page', note: 'Fim do capítulo.' });
  assert.equal(fixed.journal.length, 3);
  assert.equal(fixed.currentPage, 160, 'a página atual acompanha a correção do último dia');
  assert.match(await page.innerText('.diary-row >> nth=0'), /13\s+OUT/);

  step('excluir entrada e desfazer');
  await openAllWeeks();
  await page.click('[data-action="diary-edit"][data-date="2025-12-28"]');
  await page.click('[data-action="diary-delete"]');
  await waitState((s) => bookIn(s, 'b1').journal.length === 2);
  assert.equal(await page.locator('.diary-row').count(), 2);
  assert.match(await page.textContent('.book-tab[data-tab="diario"]'), /Diário\s*2/);
  await page.click('.toast button:has-text("Desfazer")');
  await waitState((s) => bookIn(s, 'b1').journal.length === 3);
  assert.equal(await page.locator('.diary-row').count(), 3);

  step('aba Trechos');
  await page.click('[data-tab="trechos"]');
  await page.waitForSelector('.quote-card');
  assert.equal(await page.locator('.quote-card').count(), 2);
  assert.match(await page.textContent('.quote-card >> nth=0'), /p\. 120/);
  assert.match(await page.textContent('.quote-card >> nth=1'), /Capitu, sempre\./);
  assert.match(await page.evaluate(() => getComputedStyle(document.querySelector('.quote-text')).fontFamily), /Instrument Serif/);
  assert.equal(await page.locator('.quote-card .quote-mark').count(), 2, 'aspa decorativa (1.5)');
  await shot('04-trechos');
  await noOverflow('aba Trechos');
  await page.setViewportSize({ width: 320, height: 700 });
  await shot('04b-trechos-320', false);
  await page.setViewportSize({ width: 390, height: 844 });
  assert.deepEqual(await smallTargets(), [], 'alvos de toque menores que 44px');

  step('novo trecho');
  await page.click('[data-action="quote-new"]');
  await page.waitForSelector('[data-quote-form]');
  assert.equal(await page.evaluate(() => document.activeElement.id), 'q-text');
  assert.match(await page.textContent('.quote-hint'), /Texto ao Vivo da Câmera do iPhone/);
  assert.deepEqual(await smallFields(), []);
  await page.click('[data-quote-form] button[type="submit"]');
  await toastHas(/Escreva o trecho/);
  await page.fill('#q-text', 'Uma <b>frase</b> com "aspas" & acento: coração.');
  await page.fill('#q-pos', '300');
  await page.click('[data-quote-form] button[type="submit"]');
  await toastHas(/página entre 0 e 256/);
  await page.fill('#q-pos', '200');
  await page.fill('#q-note', 'Para reler.');
  await shot('05-trechos-novo', false);
  await noOverflow('formulário de trecho');
  await page.click('[data-quote-form] button[type="submit"]');
  await page.waitForSelector('[data-quote-form]', { state: 'detached' });
  const added = bookIn(await waitState((s) => bookIn(s, 'b1').quotes.length === 3), 'b1').quotes.at(-1);
  assert.equal(added.text, 'Uma <b>frase</b> com "aspas" & acento: coração.');
  assert.equal(added.page, 200);
  assert.equal(added.note, 'Para reler.');
  assert.match(added.createdAt, /^2026-10-16T/);
  assert.equal(await page.locator('.quote-card').count(), 3);
  assert.equal(await page.textContent('.quote-card >> nth=0 >> .quote-text'), added.text, 'texto escapado, sem virar HTML');

  step('corrigir trecho');
  await page.click(`[data-action="quote-edit"][data-id="${added.id}"]`);
  await page.waitForSelector('[data-quote-form]');
  assert.equal(await page.inputValue('#q-pos'), '200');
  await page.fill('#q-text', 'Frase corrigida.');
  await page.click('[data-quote-form] button[type="submit"]');
  await waitState((s) => bookIn(s, 'b1').quotes.some((q) => q.id === added.id && q.text === 'Frase corrigida.'));

  step('excluir trecho');
  await page.click(`[data-action="quote-delete"][data-id="${added.id}"]`);
  await waitState((s) => bookIn(s, 'b1').quotes.length === 2);
  assert.equal(await page.locator('.quote-card').count(), 2);
  await page.click('.toast button:has-text("Desfazer")');
  await waitState((s) => bookIn(s, 'b1').quotes.length === 3);
  await page.click(`[data-action="quote-delete"][data-id="${added.id}"]`);
  await waitState((s) => bookIn(s, 'b1').quotes.length === 2);

  step('compartilhar trecho como imagem');
  const download = page.waitForEvent('download');
  await page.click('[data-action="quote-share"][data-id="q2"]');
  const img = await download;
  assert.equal(img.suggestedFilename(), 'trecho-dom-casmurro.png');
  const imgPath = join(SHOTS, 'diario-trechos-imagem.png');
  await img.saveAs(imgPath);
  const png = readFileSync(imgPath);
  assert.deepEqual([png.readUInt32BE(16), png.readUInt32BE(20)], [1080, 1080]);
  const shortDownload = page.waitForEvent('download');
  await page.click('[data-action="quote-share"][data-id="q1"]');
  await (await shortDownload).saveAs(join(SHOTS, 'diario-trechos-imagem-curta.png'));

  step('Salvar de Dados não apaga diário nem trechos');
  await page.click('[data-tab="dados"]');
  await page.fill('#f-title', 'Dom Casmurro (ed. comentada)');
  await page.click('[data-tab="diario"]');
  await page.waitForSelector('[data-action="book-save"]');
  await page.click('[data-action="book-save"]');
  // Abriu a edição direto pelo endereço: salvar volta para a ficha do livro.
  await page.waitForSelector('.ficha-hero');
  assert.match(await page.textContent('.ficha-title'), /Dom Casmurro \(ed\. comentada\)/);
  const afterSave = bookIn(await waitState((s) => bookIn(s, 'b1').title === 'Dom Casmurro (ed. comentada)'), 'b1');
  assert.equal(afterSave.quotes.length, 2);
  assert.equal(afterSave.journal.length, 3);
  assert.equal(afterSave.currentPage, 160);

  step('Kindle: diário em %');
  await page.goto(`${BASE}#/livro/k1?aba=diario`);
  await page.waitForSelector('.diary-row');
  assert.equal(await page.getAttribute('.book-tab.is-on', 'data-tab'), 'diario');
  const kRow = (await page.innerText('.diary-row')).replace(/\s+/g, ' ');
  assert.match(kRow, /20% → 45%/);
  assert.match(kRow, /\+25%/);
  assert.match(kRow, /≈ 80 págs\./);
  await shot('06-diario-kindle');
  await page.click('[data-tab="trechos"]');
  await page.click('[data-action="quote-new"]');
  assert.match(await page.textContent('label[for="q-pos"]'), /Posição no Kindle \(%\)/);
  await page.click('[data-action="quote-cancel"]');

  step('diário vazio');
  await page.goto(`${BASE}#/livro/r1/editar`);
  await onPage('livro');
  await page.click('[data-tab="diario"]');
  assert.match(await page.textContent('.empty'), /se preenche sozinho/);
  await page.click('[data-tab="trechos"]');
  assert.match(await page.textContent('.empty'), /Nenhum trecho salvo/);

  step('Todos os anos → Trechos salvos');
  await page.goto(`${BASE}#/resumo/todos`);
  await page.waitForSelector('.quotes-link');
  assert.match(await page.textContent('.quotes-link'), /Trechos salvos \(3\)/);
  await page.click('.quotes-link');
  await onPage('trechos');
  assert.equal(await page.locator('.quote-link').count(), 3);
  assert.equal(await page.getAttribute('[data-nav="resumo"]', 'aria-current'), 'page');
  await shot('07-todos-os-trechos');
  await noOverflow('Trechos salvos');
  assert.deepEqual(await smallFields(), []);
  await page.fill('#quotes-q', 'obliqua');
  assert.equal(await page.locator('.quote-link').count(), 1);
  assert.equal(await page.evaluate(() => document.activeElement.id), 'quotes-q');
  await page.fill('#quotes-q', 'GLADWELL');
  assert.equal(await page.locator('.quote-link').count(), 1);
  assert.match(await page.textContent('.quote-link'), /Dez mil horas/);
  await page.fill('#quotes-q', 'capitu');
  assert.match(await page.textContent('.quote-link'), /Olhos de cigana/, 'busca na nota');
  await page.fill('#quotes-q', 'zzz');
  assert.match(await page.textContent('#quotes-results'), /Nenhum trecho encontrado/);
  await page.fill('#quotes-q', 'comentada');
  assert.equal(await page.locator('.quote-link').count(), 2, 'busca no título');
  await shot('08-trechos-busca');
  await page.click('.quote-link >> nth=0');
  await onPage('livro');
  assert.equal(await page.getAttribute('.book-tab.is-on', 'data-tab'), 'trechos');
  await page.click('text=Voltar');
  await onPage('trechos');
  assert.equal(await page.inputValue('#quotes-q'), 'comentada', 'a busca continua ao voltar');

  assert.deepEqual(errors, []);
  console.log('\nTudo certo. Capturas em tests/e2e/screens/diario-trechos-*.png');
} catch (err) {
  await shot('falha').catch(() => {});
  console.error('\nFALHOU:', err.message);
  if (errors.length) console.error(errors.join('\n'));
  process.exitCode = 1;
} finally {
  await browser.close();
  server.close();
}
