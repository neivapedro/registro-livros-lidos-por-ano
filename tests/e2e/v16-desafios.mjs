// Teste de ponta a ponta da 1.6: desafios de leitura (Visão geral do Resumo) e velocidade de
// leitura (aba Ritmo e ficha de um livro da fila). Cria, edita, exclui (com Desfazer), marca
// livros num desafio "eu escolho", o aviso de desafio concluído, troca de ano, horário das
// sessões do cronômetro. Telas em 320, 390 e 430 px, claro e escuro.
// Uso: node tests/e2e/v16-desafios.mjs   (precisa do Playwright instalado globalmente ou no projeto)

import { execSync } from 'node:child_process';
import { createServer } from 'node:http';
import { mkdirSync, readFileSync, existsSync } from 'node:fs';
import { extname, join, normalize } from 'node:path';
import { createRequire } from 'node:module';
import assert from 'node:assert/strict';
import { normalizeState } from '../../app/js/store.js';
import { challengeProgress } from '../../app/js/challenges.js';
import { formatDuration, hourDistribution, queueForecast, speedStats } from '../../app/js/speed.js';

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
const TODAY = '2026-10-26';

// ---------- Dados ----------

function book(id, title, extra = {}) {
  return {
    id, title, authors: `Autor de ${title}`, pages: 300, status: 'lido', startDate: null, endDate: null,
    format: 'fisico', rating: 4, genre: 'Ficção', favorite: false, notes: '', cover: null, isbn: '',
    currentPage: null, currentPercent: null, dropReason: '', reread: false, series: '', seriesNumber: null,
    tags: [], targetDate: null, quotes: [], journal: [],
    createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z', ...extra,
  };
}
const iso = (start, i) => {
  const d = new Date(Date.UTC(Number(start.slice(0, 4)), Number(start.slice(5, 7)) - 1, Number(start.slice(8, 10)) + i));
  return d.toISOString().slice(0, 10);
};
/** Diário com cronômetro: n dias seguidos, `per` páginas e `min` minutos por dia, no horário `hours(i)`. */
function timed(start, n, per, min, hours, from = 0) {
  return Array.from({ length: n }, (_, i) => ({
    date: iso(start, i), from: from + i * per, to: from + (i + 1) * per, unit: 'page', note: '', minutes: min, hours: hours(i),
  }));
}
const night = (i) => (i % 3 === 2 ? { 7: 40 } : { 21: 30, 22: 10 });
const books = [
  book('guerra', 'Guerra e Paz', { pages: 1200, tags: ['Clássico'], endDate: '2026-02-10', startDate: '2026-01-05', authors: 'Liev Tolstói' }),
  book('dom', 'Dom Casmurro', { pages: 256, tags: ['Clássico'], endDate: '2026-03-15', startDate: '2026-03-01', reread: true, authors: 'Machado de Assis' }),
  book('jobs', 'Steve Jobs', { pages: 600, genre: 'Biografia', endDate: '2026-04-20', format: 'kindle', authors: 'Walter Isaacson' }),
  book('sapiens', 'Sapiens', { pages: 460, genre: 'História', endDate: '2026-05-30', format: 'kindle', authors: 'Yuval Noah Harari' }),
  book('duna1', 'Duna', { pages: 680, genre: 'Ficção científica', endDate: '2026-06-20', series: 'Duna', seriesNumber: 1, authors: 'Frank Herbert' }),
  book('duna2', 'O Messias de Duna', { pages: 270, genre: 'Ficção científica', endDate: '2026-07-25', series: 'Duna', seriesNumber: 2, authors: 'Frank Herbert' }),
  book('medit', 'Meditações', { pages: 200, genre: 'Filosofia', endDate: '2026-08-30', startDate: '2026-08-21', authors: 'Marco Aurélio', journal: timed('2026-08-21', 10, 20, 30, () => ({ 6: 30 })) }),
  book('arte', 'A Arte da Guerra', { pages: 160, genre: 'Filosofia', endDate: '2026-10-05', startDate: '2026-09-28', authors: 'Sun Tzu', journal: timed('2026-09-28', 8, 20, 40, night) }),
  book('miser', 'Os Miseráveis', {
    status: 'lendo', pages: 900, tags: ['Clássico'], startDate: '2026-10-12', endDate: null, rating: null, currentPage: 280,
    authors: 'Victor Hugo', journal: timed('2026-10-12', 14, 20, 40, night),
  }),
  book('monte', 'O Conde de Monte Cristo', { status: 'quero', pages: 1100, endDate: null, rating: null, authors: 'Alexandre Dumas' }),
  book('ulisses', 'Ulisses', { status: 'quero', pages: 730, endDate: null, rating: null, authors: 'James Joyce' }),
  book('semp', 'Livro sem páginas', { status: 'quero', pages: null, endDate: null, rating: null }),
  book('antigo', 'Antigo', { endDate: '2025-05-01', authors: 'Alguém' }),
];
const seed = {
  version: 2, books, goals: { 2026: 12 }, defaultGoal: 12, customGenres: [], lastBackupAt: '2026-10-20T10:00:00.000Z',
  upNext: ['monte'], pageGoals: {},
  challenges: [
    { id: 'c1', year: 2026, title: 'Ler 3 clássicos', target: 3, rule: { type: 'tag', value: 'Clássico' }, books: [] },
    { id: 'c2', year: 2026, title: '', target: 1, rule: { type: 'pages', value: 500 }, books: [] },
    { id: 'c3', year: 2026, title: 'Livros do clube', target: 2, rule: { type: 'manual', value: null }, books: ['dom'] },
    { id: 'c4', year: 2026, title: '', target: 1, rule: { type: 'seriesDone', value: null }, books: [] },
    { id: 'c5', year: 2025, title: '', target: 1, rule: { type: 'reread', value: null }, books: [] },
  ],
};
const S = normalizeState(seed);
const progress = (id) => challengeProgress(S.challenges.find((c) => c.id === id), S.books);
const fmt = (n) => n.toLocaleString('pt-BR');

// ---------- Navegador ----------

const browser = await playwright.chromium.launch();
const errors = [];
async function newPage({ width = 390, theme = 'escuro', at = '12:00:00' } = {}) {
  const context = await browser.newContext({
    viewport: { width, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, locale: 'pt-BR', reducedMotion: 'reduce',
  });
  await context.addInitScript((t) => { localStorage.setItem('leituras:tema', t); }, theme);
  const page = await context.newPage();
  await page.clock.setFixedTime(new Date(`${TODAY}T${at}`));
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errors.push(`console: ${m.text()}`); });
  await page.goto(BASE);
  await page.evaluate(async (d) => (await import('/js/db.js')).setItem('state', d), seed);
  return page;
}
const step = (msg) => console.log(`• ${msg}`);
async function onPage(page, name) {
  try {
    await page.waitForFunction((n) => document.getElementById('app').dataset.page === n, name, { timeout: 10000 });
  } catch (err) {
    const where = await page.evaluate(() => `${location.hash} página=${document.getElementById('app').dataset.page} ${document.getElementById('app').innerHTML.slice(0, 200)}`).catch(() => '?');
    throw new Error(`esperava a tela "${name}": ${where}`);
  }
}
async function open(page, hash, name = 'resumo') {
  await page.goto(`${BASE}${hash}`);
  await page.reload();
  await onPage(page, name);
}
const text = (page, sel) => page.$eval(sel, (el) => el.textContent.replace(/\s+/g, ' ').trim());
const readState = (page) => page.evaluate(async () => (await import('/js/db.js')).getItem('state'));
async function waitState(page, predicate) {
  let last;
  for (let i = 0; i < 50; i += 1) {
    last = await readState(page);
    if (last && predicate(last)) return last;
    await page.waitForTimeout(100);
  }
  throw new Error(`Estado salvo não chegou ao esperado: ${JSON.stringify(last)?.slice(0, 300)}`);
}
/** Espera o aviso com este texto (um aviso anterior pode ainda estar na tela). */
async function toastText(page, re) {
  await page.waitForFunction((src) => new RegExp(src).test(document.querySelector('.toast.show')?.textContent || ''), re.source, { timeout: 9000 });
  return page.textContent('.toast.show');
}
async function sheetOpen(page) {
  await page.waitForSelector('.sheet-layer.is-open');
  await page.waitForTimeout(50);
}
async function sheetClosed(page) {
  await page.waitForFunction(() => !document.querySelector('.sheet-layer'));
}
async function tab(page, name) {
  await page.click(`.rs-tab[data-tab="${name}"]`);
  await page.waitForSelector(`.rs-panel[data-tab="${name}"]`);
}

/** Sem rolagem lateral, campos ≥ 16px e alvos de toque ≥ 44px. */
async function checkLayout(page, label) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  assert.ok(overflow <= 0, `${label}: ${overflow}px sobrando à direita`);
  const wide = await page.evaluate(() => [...document.querySelectorAll('#app *, .sheet *')]
    .filter((el) => el.getBoundingClientRect().right > window.innerWidth + 0.5 && getComputedStyle(el).visibility !== 'hidden')
    .map((el) => el.className?.baseVal ?? el.className).slice(0, 5));
  assert.deepEqual(wide, [], `${label}: elementos passando da tela`);
  const small = await page.evaluate(() => [...document.querySelectorAll('input, select, textarea')]
    .filter((el) => el.getClientRects().length && parseFloat(getComputedStyle(el).fontSize) < 16).map((el) => el.outerHTML.slice(0, 60)));
  assert.deepEqual(small, [], `${label}: campos com letra < 16px`);
  const tiny = await page.evaluate(() => [...document.querySelectorAll('.ch-item, .ch-add, .ch-chip, .chs-tpl, .chs-step, .chs-book, .chs .psheet-close, .chs-actions button, .ch-new-wide')]
    .map((el) => ({ el, r: el.getBoundingClientRect() }))
    .filter(({ r }) => r.width && (r.height < 44 || r.width < 44))
    .map(({ el, r }) => `${el.className} ${Math.round(r.width)}×${Math.round(r.height)}`));
  assert.deepEqual(tiny, [], `${label}: alvos de toque menores que 44px`);
}

try {
  const page = await newPage();

  step('Visão geral: cartão Desafios do ano, com anéis e capas dos livros que contam');
  await open(page, '#/resumo/2026');
  await page.waitForSelector('.ch-card');
  assert.equal(await page.locator('.ch-item').count(), 4, 'só os desafios de 2026');
  assert.match(await text(page, '#ch-head'), /^Desafios 2 de 4$/);
  const p1 = progress('c1');
  assert.equal(p1.count, 2);
  assert.equal(await text(page, '.ch-item[data-id="c1"] .ch-ring-n'), '2/3');
  assert.match(await text(page, '.ch-item[data-id="c1"] .ch-sub'), /^Etiqueta “Clássico” · falta 1 · 1 em leitura$/);
  assert.equal(await page.locator('.ch-item[data-id="c1"] .ch-cover').count(), 2);
  assert.match(await text(page, '.ch-item[data-id="c2"] .ch-title'), /^Ler 1 livro com mais de 500 páginas$/, 'título automático');
  assert.match(await text(page, '.ch-item[data-id="c2"] .ch-sub'), /^Concluído em 10 fev · 3 livros$/);
  assert.equal(await page.locator('.ch-item[data-id="c2"].is-done .ch-ring-check').count(), 1);
  assert.match(await text(page, '.ch-item[data-id="c4"]'), /Terminar uma série.*Concluído em 25 jul/);
  // O cartão fica logo depois da meta acumulada.
  assert.equal(await page.evaluate(() => document.querySelector('.sc-card').nextElementSibling.classList.contains('ch-card')), true);
  await page.locator('.ch-card').screenshot({ path: join(SHOTS, 'v16-desafios-390-cartao.png') });

  step('detalhe: livros que contam (links para a ficha), editar, excluir');
  await page.click('.ch-item[data-id="c1"]');
  await sheetOpen(page);
  assert.match(await text(page, '.chs-progress-text'), /^2 de 3 livros · falta 1$/);
  assert.deepEqual(await page.$$eval('.chs-book-title', (els) => els.map((e) => e.textContent)), ['Guerra e Paz', 'Dom Casmurro']);
  assert.match(await text(page, '.chs-detail'), /1 livro em leitura vai contar quando terminar/);
  await checkLayout(page, '390 detalhe');
  await page.locator('.sheet').screenshot({ path: join(SHOTS, 'v16-desafios-390-detalhe.png') });
  await page.click('.chs-book[href="#/livro/guerra"]');
  await onPage(page, 'livro');
  await sheetClosed(page);
  await page.goBack();
  await onPage(page, 'resumo');

  step('nova sugestão: um toque cria; a mesma sugestão aparece como já adicionada');
  await page.click('[data-action="challenge-new"]');
  await sheetOpen(page);
  assert.equal(await page.locator('.chs-tpl').count(), 8);
  assert.equal(await page.locator('.chs-tpl.is-used').count(), 3, 'mais de 500 páginas, série e clássicos já existem');
  await checkLayout(page, '390 sugestões');
  await page.locator('.sheet').screenshot({ path: join(SHOTS, 'v16-desafios-390-sugestoes.png') });
  await page.click('.chs-tpl[data-key="autores"]');
  await sheetClosed(page);
  await toastText(page, /Desafio criado: Ler 5 autores diferentes/);
  let st = await waitState(page, (s) => s.challenges.length === 6);
  const autores = st.challenges[5];
  assert.deepEqual({ year: autores.year, target: autores.target, rule: autores.rule }, { year: 2026, target: 5, rule: { type: 'authors', value: null } });
  assert.match(await text(page, `.ch-item[data-id="${autores.id}"] .ch-sub`), /^Concluído em 20 jun · 7 autores$/);
  assert.equal(await page.locator(`.ch-item[data-id="${autores.id}"].is-done`).count(), 1, '7 autores no ano: já cumprido');
  await page.click('[data-action="challenge-new"]');
  await sheetOpen(page);
  assert.equal(await page.locator('.chs-tpl.is-used').count(), 4);

  step('criar do meu jeito: tipo, valor, meta com +/−, nome sugerido');
  await page.click('[data-action="challenge-custom"]');
  await page.waitForSelector('[data-challenge-form]');
  assert.equal(await page.inputValue('#ch-type'), 'genre');
  await page.selectOption('#ch-type', 'pages');
  await page.waitForSelector('#ch-value[type="number"]');
  await page.fill('#ch-value', '400');
  await page.click('[data-action="challenge-step"][data-delta="-1"]');
  assert.equal(await page.inputValue('#ch-target'), '2');
  assert.equal(await page.getAttribute('#ch-title', 'placeholder'), 'Ler 2 livros com mais de 400 páginas');
  await page.selectOption('#ch-type', 'authors');
  assert.equal(await text(page, '[data-ch-unit]'), 'autores');
  await page.selectOption('#ch-type', 'tag');
  await page.fill('#ch-value', '');
  await page.click('.chs-form .btn-primary');
  assert.equal(await text(page, '.chs-error'), 'Informe a etiqueta.');
  await page.selectOption('#ch-type', 'genre');
  await page.selectOption('#ch-value', 'Filosofia');
  await page.fill('#ch-title', 'Filosofia em 2026');
  await checkLayout(page, '390 formulário');
  await page.locator('.sheet').screenshot({ path: join(SHOTS, 'v16-desafios-390-formulario.png') });
  await page.click('.chs-form .btn-primary');
  await sheetClosed(page);
  st = await waitState(page, (s) => s.challenges.length === 7);
  const filo = st.challenges[6];
  assert.deepEqual({ title: filo.title, target: filo.target, rule: filo.rule }, { title: 'Filosofia em 2026', target: 2, rule: { type: 'genre', value: 'Filosofia' } });
  assert.equal(await page.locator(`.ch-item[data-id="${filo.id}"].is-done`).count(), 1, 'Meditações + A Arte da Guerra');

  step('editar a meta e excluir com Desfazer');
  await page.click(`.ch-item[data-id="${filo.id}"]`);
  await sheetOpen(page);
  await page.click('[data-action="challenge-edit"]');
  await page.waitForSelector('[data-challenge-form]');
  assert.equal(await page.inputValue('#ch-value'), 'Filosofia');
  await page.fill('#ch-target', '4');
  await page.click('.chs-form .btn-primary');
  await sheetClosed(page);
  await waitState(page, (s) => s.challenges.find((c) => c.id === filo.id).target === 4);
  assert.equal(await text(page, `.ch-item[data-id="${filo.id}"] .ch-ring-n`), '2/4');
  await page.click(`.ch-item[data-id="${filo.id}"]`);
  await sheetOpen(page);
  await page.click('.chs-detail [data-action="challenge-delete"]');
  await sheetClosed(page);
  await toastText(page, /Desafio "Filosofia em 2026" excluído\.Desfazer/);
  await waitState(page, (s) => s.challenges.length === 6);
  assert.equal(await page.locator(`.ch-item[data-id="${filo.id}"]`).count(), 0);
  await page.click('.toast [data-action="undo-challenge-delete"]');
  st = await waitState(page, (s) => s.challenges.length === 7);
  assert.equal(st.challenges[6].id, filo.id, 'volta na mesma posição');
  assert.equal(await page.locator(`.ch-item[data-id="${filo.id}"]`).count(), 1);

  step('"eu escolho os livros": marcar completa o desafio e avisa uma vez');
  await page.click('.ch-item[data-id="c3"]');
  await sheetOpen(page);
  assert.equal(await page.locator('.chs-book.is-pick').count(), 8, 'os 8 lidos em 2026');
  assert.equal(await page.getAttribute('.chs-book[data-book="dom"]', 'aria-pressed'), 'true');
  await page.click('.chs-book[data-book="guerra"]');
  await toastText(page, /Desafio concluído: Livros do clube\. Parabéns!/);
  await page.waitForSelector('.chs-book[data-book="guerra"][aria-pressed="true"]');
  assert.match(await text(page, '.chs-progress-text'), /^Concluído em 15 mar · 2 de 2 livros$/);
  assert.equal(await page.locator('.ch-item[data-id="c3"].is-done').count(), 1, 'o cartão atrás já mostra concluído');
  await page.locator('.sheet').screenshot({ path: join(SHOTS, 'v16-desafios-390-escolher.png') });
  st = await waitState(page, (s) => s.challenges.find((c) => c.id === 'c3').books.includes('guerra'));
  await page.keyboard.press('Escape');
  await sheetClosed(page);

  step('terminar um livro completa "Ler 3 clássicos": aviso de parabéns');
  await page.goto(`${BASE}#/livro/miser/editar?concluir=1`);
  await onPage(page, 'livro');
  await page.click('.form-actions .btn-primary');
  await page.waitForFunction(() => /Desafio concluído: Ler 3 clássicos/.test(document.querySelector('.toast.show')?.textContent || ''), null, { timeout: 9000 });
  await open(page, '#/resumo/2026');
  assert.equal(await page.locator('.ch-item[data-id="c1"].is-done').count(), 1);
  await page.screenshot({ path: join(SHOTS, 'v16-desafios-390-geral.png'), fullPage: true });

  step('troca de ano: 2025 tem os seus desafios; ano sem desafios mostra sugestões');
  await page.selectOption('[data-change="summary-year"]', '2025');
  await page.waitForURL(/resumo\/2025/);
  await page.waitForSelector('.ch-card');
  assert.equal(await page.locator('.ch-item').count(), 1);
  assert.match(await text(page, '.ch-item'), /Ler 1 releitura/);
  await page.evaluate(async () => {
    const db = await import('/js/db.js');
    const s = await db.getItem('state');
    await db.setItem('state', { ...s, challenges: s.challenges.filter((c) => c.year !== 2025) });
  });
  await open(page, '#/resumo/2025');
  await page.waitForSelector('.ch-card.is-empty');
  assert.equal(await page.locator('.ch-chip').count(), 3);
  await page.locator('.ch-card').screenshot({ path: join(SHOTS, 'v16-desafios-390-vazio.png') });
  await page.click('.ch-chip[data-key="releituras"]');
  await page.waitForSelector('.ch-item');
  st = await waitState(page, (s) => s.challenges.some((c) => c.year === 2025));
  assert.equal(await text(page, '.ch-item .ch-ring-n'), '0/2');
  await page.context().close();

  step('Ritmo: páginas por hora, horário em que mais lê e previsão da fila');
  const rp = await newPage();
  await open(rp, '#/resumo/2026?aba=ritmo');
  await rp.waitForSelector('.sp-card');
  const sp = speedStats(S.books, 2026);
  assert.ok(sp.enough);
  assert.equal(await text(rp, '.sp-num'), String(sp.pagesPerHour));
  assert.equal(sp.pagesPerHour, 33, '640 págs. em 1.180 min de cronômetro em 2026');
  const hd = hourDistribution(S.books, 2026);
  assert.equal(hd.peak, 21);
  assert.match(await text(rp, '.sp-hours-head'), /^Você lê mais à noite pico às 21h$/);
  assert.equal(await rp.locator('.hr-bar').count(), 24);
  assert.equal(await rp.locator('.hr-bar.is-peak').count(), 1);
  const fq = queueForecast(S, TODAY);
  assert.ok(fq.pace);
  const rows = await rp.$$eval('.sp-q-row', (els) => els.map((e) => e.textContent.replace(/\s+/g, ' ').trim()));
  assert.equal(rows.length, 2);
  assert.match(rows[0], new RegExp(`^Próximas 1 livro · ${fmt(1100).replace('.', '\\.')} págs\\. ${formatDuration(fq.next.days)}$`));
  assert.match(rows[1], /^Toda a lista Quero ler 3 livros · 1\.830 págs\. · 1 sem nº de págs\. ~/);
  assert.match(await text(rp, '.rs-panel'), /Ritmo dos últimos 30 dias: [\d,]+ págs\. por dia, contando os dias sem leitura\./);
  await checkLayout(rp, '390 ritmo');
  await rp.locator('.sp-card >> nth=1').evaluate((el) => el.scrollIntoView({ block: 'center' }));
  await rp.locator('.sp-card >> nth=0').screenshot({ path: join(SHOTS, 'v16-desafios-390-velocidade.png') });
  await rp.locator('.sp-card >> nth=1').screenshot({ path: join(SHOTS, 'v16-desafios-390-fila.png') });

  step('ano passado: sem cronômetro, explica o que falta; sem previsão da fila');
  await rp.selectOption('[data-change="summary-year"]', '2025');
  await rp.waitForURL(/resumo\/2025\?aba=ritmo/);
  await rp.waitForSelector('.sp-card');
  assert.match(await text(rp, '.sp-card'), /Use o cronômetro \(Ler agora\) ao ler: com algumas sessões em 2025/);
  assert.equal(await rp.locator('h2:text("Previsão da fila")').count(), 0);

  step('ficha de um livro da fila: "Você leva ~N dias"');
  await open(rp, '#/livro/ulisses', 'livro');
  const est = await text(rp, '.ficha-estimate');
  assert.match(est, /^Você leva ~\d+ (dias|semanas) · ~\d+ h( \d+ min)? de leitura$/);
  await rp.locator('.ficha-card').screenshot({ path: join(SHOTS, 'v16-desafios-390-ficha.png') });
  await open(rp, '#/livro/semp', 'livro');
  assert.equal(await rp.locator('.ficha-estimate').count(), 0, 'sem nº de páginas, sem estimativa');
  await rp.context().close();

  step('cronômetro guarda o horário da sessão (21h40 + 30 min → 21h: 20, 22h: 10)');
  // Sessão aberta às 21h40 e parada às 22h10 (o relógio do teste fica nas 22h10).
  const tp = await newPage({ at: '22:10:00' });
  await tp.evaluate(([start, end]) => localStorage.setItem('leituras:sessao', JSON.stringify({ bookId: 'miser', startedAt: start, pausedAt: end, pausedMs: 0 })),
    [new Date(`${TODAY}T21:40:00`).getTime(), new Date(`${TODAY}T22:10:00`).getTime()]);
  // Recarrega antes de ir para #/ler: a página aberta ainda não conhecia a sessão e, ao ver
  // #/ler sem sessão, voltaria ao Início (apagando a sessão gravada).
  await tp.reload();
  await onPage(tp, 'inicio');
  await open(tp, '#/ler/miser', 'ler');
  assert.equal(await tp.textContent('.timer-clock'), '30:00');
  await tp.click('[data-action="timer-stop"]');
  await tp.waitForSelector('[data-timer-form]');
  await tp.fill('#timer-input', '300');
  await tp.click('.timer-stop .btn-primary');
  await onPage(tp, 'inicio');
  const ts = await waitState(tp, (s) => s.books.find((b) => b.id === 'miser').journal.some((e) => e.date === TODAY && e.minutes));
  const entry = ts.books.find((b) => b.id === 'miser').journal.find((e) => e.date === TODAY);
  assert.deepEqual({ minutes: entry.minutes, hours: entry.hours, from: entry.from, to: entry.to }, { minutes: 30, hours: { 21: 20, 22: 10 }, from: 280, to: 300 });
  await tp.context().close();

  step('larguras 320, 390 e 430 · claro e escuro');
  for (const theme of ['escuro', 'claro']) {
    for (const width of [320, 390, 430]) {
      const p = await newPage({ width, theme });
      const tag = `${width}-${theme === 'claro' ? 'claro' : 'escuro'}`;
      await open(p, '#/resumo/2026');
      await p.waitForSelector('.ch-card');
      await checkLayout(p, `${tag} geral`);
      await p.locator('.ch-card').screenshot({ path: join(SHOTS, `v16-desafios-${tag}-cartao.png`) });
      await p.click('.ch-item[data-id="c1"]');
      await sheetOpen(p);
      await checkLayout(p, `${tag} detalhe`);
      await p.screenshot({ path: join(SHOTS, `v16-desafios-${tag}-detalhe.png`) });
      await p.click('[data-action="challenge-edit"]');
      await p.waitForSelector('[data-challenge-form]');
      await checkLayout(p, `${tag} formulário`);
      await p.screenshot({ path: join(SHOTS, `v16-desafios-${tag}-formulario.png`) });
      await p.keyboard.press('Escape');
      await sheetClosed(p);
      await tab(p, 'ritmo');
      await p.waitForSelector('.sp-card');
      await checkLayout(p, `${tag} ritmo`);
      await p.locator('.sp-card >> nth=0').scrollIntoViewIfNeeded();
      await p.screenshot({ path: join(SHOTS, `v16-desafios-${tag}-ritmo.png`) });
      await p.context().close();
    }
  }

  assert.deepEqual(errors, [], 'sem erros no console');
  console.log('\nOK: 1.6 desafios e velocidade (cartão, folhas, Desfazer, aviso, ano, ritmo, fila, ficha, cronômetro, 320–430px)');
} catch (err) {
  console.error('\nFALHOU:', err.message);
  if (errors.length) console.error(errors.join('\n'));
  process.exitCode = 1;
} finally {
  await browser.close();
  server.close();
}
