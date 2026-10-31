// Teste de ponta a ponta das estatísticas: calendário (ano e mês), gráficos tocáveis
// que abrem a Buscar filtrada, comparação entre anos e meta de páginas.
// Uso: node tests/e2e/estatisticas.mjs   (precisa do Playwright instalado globalmente ou no projeto)

import { execSync } from 'node:child_process';
import { createServer } from 'node:http';
import { mkdirSync, readFileSync, existsSync } from 'node:fs';
import { extname, join, normalize } from 'node:path';
import { createRequire } from 'node:module';
import assert from 'node:assert/strict';
import { pagesReadInYear } from '../../app/js/journal.js';

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

// ---------- Dados: diário espalhado pelos meses de 2026 ----------

function addDays(iso, n) {
  const d = new Date(Date.UTC(Number(iso.slice(0, 4)), Number(iso.slice(5, 7)) - 1, Number(iso.slice(8, 10)) + n));
  return d.toISOString().slice(0, 10);
}

/** Entradas de 'start' a 'end' a cada 'every' dias, avançando de 'from' até 'to' (a última cai em 'end'). */
function spread(start, end, from, to, { every = 1, unit = 'page' } = {}) {
  const dates = [];
  for (let d = start; d < end; d = addDays(d, every)) dates.push(d);
  dates.push(end);
  const step = (to - from) / dates.length;
  return dates.map((date, i) => ({
    date, unit, note: '',
    from: Math.round(from + step * i),
    to: i === dates.length - 1 ? to : Math.round(from + step * (i + 1)),
  }));
}

const TS = '2026-01-01T00:00:00.000Z';
const base = (id, title, extra) => ({
  id, title, authors: 'Autor', pages: null, cover: null, isbn: '', format: 'fisico', genre: null, rating: null,
  favorite: false, notes: '', startDate: null, endDate: null, currentPage: null, currentPercent: null,
  dropReason: '', reread: false, series: '', seriesNumber: null, tags: [], targetDate: null, quotes: [], journal: [],
  createdAt: TS, updatedAt: TS, ...extra,
});

const seed = {
  version: 2,
  goals: { 2026: 12 },
  defaultGoal: 12,
  customGenres: [],
  lastBackupAt: '2026-10-10T10:00:00.000Z',
  upNext: [],
  pageGoals: {},
  books: [
    base('b1', 'Sapiens', { status: 'lido', pages: 464, startDate: '2026-01-05', endDate: '2026-02-10', rating: 5, genre: 'História',
      journal: spread('2026-01-05', '2026-02-10', 0, 464, { every: 2 }) }),
    base('b2', 'Duna', { status: 'lido', pages: 680, startDate: '2026-02-12', endDate: '2026-03-14', rating: 4.5, genre: 'Ficção',
      journal: spread('2026-02-12', '2026-03-14', 0, 680) }),
    base('b3', '1984', { status: 'lido', format: 'kindle', pages: 416, startDate: '2026-04-01', endDate: '2026-04-20', rating: 4, genre: 'Ficção',
      journal: spread('2026-04-01', '2026-04-20', 0, 100, { unit: 'percent' }) }),
    base('b4', 'Kindle sem páginas', { status: 'lido', format: 'kindle', startDate: '2026-05-02', endDate: '2026-05-30', rating: 3.5,
      journal: spread('2026-05-02', '2026-05-30', 0, 100, { every: 4, unit: 'percent' }) }),
    base('b5', 'Dom Casmurro', { status: 'lido', pages: 256, startDate: '2026-06-01', endDate: '2026-06-22', rating: 4, genre: 'Ficção' }),
    base('b6', 'O Hobbit', { status: 'lido', pages: 310, startDate: '2026-08-10', endDate: '2026-09-05', rating: 5, genre: 'Ficção',
      journal: spread('2026-08-10', '2026-09-05', 0, 310, { every: 3 }) }),
    base('b7', 'Larguei', { status: 'abandonado', pages: 400, startDate: '2026-07-01', endDate: '2026-07-10', currentPage: 80, dropReason: 'Não prendeu.',
      journal: spread('2026-07-01', '2026-07-10', 0, 80) }),
    base('b8', 'Lendo agora', { status: 'lendo', pages: 500, startDate: '2026-10-01', currentPage: 120,
      journal: spread('2026-10-01', '2026-10-15', 0, 120) }),
    base('b9', 'Contos', { status: 'lendo', format: 'kindle', pages: 200, startDate: '2026-10-14', currentPercent: 20,
      journal: [{ date: '2026-10-14', from: 10, to: 20, unit: 'percent', note: '' }] }),
    base('b10', 'Rápido e Devagar', { status: 'lido', pages: 608, startDate: '2025-11-01', endDate: '2025-12-20', rating: 5 }),
  ],
};
const PAGES_2026 = pagesReadInYear(seed.books, 2026);
const fmt = (n) => n.toLocaleString('pt-BR');

// ---------- Navegador ----------

const browser = await playwright.chromium.launch();
const context = await browser.newContext({
  viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, locale: 'pt-BR',
  // Sem a animação de abertura do Início (os números contariam a partir de 0).
  reducedMotion: 'reduce',
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
const errors = [];
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errors.push(`console: ${m.text()}`); });
page.on('dialog', (d) => d.accept());

const shot = (name) => page.screenshot({ path: join(SHOTS, `estatisticas-${name}.png`), fullPage: true });
const shotEl = (sel, name) => page.locator(sel).screenshot({ path: join(SHOTS, `estatisticas-${name}.png`) });
const step = (msg) => console.log(`• ${msg}`);
const onPage = (name) => page.waitForFunction((n) => document.getElementById('app').dataset.page === n, name);

/** Sem rolagem horizontal em 320px e campos com letra ≥ 16px (o iPhone dá zoom abaixo disso). */
async function checkNarrow(label) {
  await page.setViewportSize({ width: 320, height: 844 });
  await page.waitForTimeout(50);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  assert.ok(overflow <= 0, `${label}: ${overflow}px sobrando à direita em 320px`);
  const wide = await page.evaluate(() => [...document.querySelectorAll('#app *')]
    // Medalhas e chips da Buscar deslizam dentro da própria fileira (overflow-x), não na página.
    .filter((el) => !el.closest('.medals') && !el.closest('.fchips') && el.getBoundingClientRect().right > window.innerWidth + 0.5 && getComputedStyle(el).visibility !== 'hidden')
    .map((el) => el.className?.baseVal ?? el.className).slice(0, 5));
  assert.deepEqual(wide, [], `${label}: elementos passando da tela em 320px`);
  const small = await page.evaluate(() => [...document.querySelectorAll('input, select, textarea')]
    .filter((el) => parseFloat(getComputedStyle(el).fontSize) < 16).map((el) => el.outerHTML.slice(0, 60)));
  assert.deepEqual(small, [], `${label}: campos com letra < 16px`);
  await page.setViewportSize({ width: 390, height: 844 });
}

/** Toca no centro do quadradinho do dia no mapa do ano. */
async function tapHeatDay(date) {
  // No meio da tela: a barra de navegação fixa cobre o rodapé.
  await page.locator(`rect[data-date="${date}"]`).evaluate((el) => el.scrollIntoView({ block: 'center' }));
  const box = await page.locator(`rect[data-date="${date}"]`).boundingBox();
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
}

try {
  step('páginas do ano pela regra do diário (Início)');
  await page.goto(BASE);
  await page.waitForSelector('.hero');
  await writeState(seed);
  await page.reload();
  await page.waitForSelector('.hero');
  assert.match(await page.textContent('.bento-pages'), new RegExp(`${fmt(PAGES_2026).replace('.', '\\.')}\\s*páginas`));
  assert.equal(await page.locator('.hero-pages').count(), 0, 'sem meta de páginas, sem linha extra');

  step('resumo: indicador de páginas (Visão geral) e mapa do ano (Ritmo)');
  await page.goto(`${BASE}#/resumo/2026`);
  await onPage('resumo');
  assert.match(await page.textContent('.kpi >> nth=1'), new RegExp(fmt(PAGES_2026).replace('.', '\\.')));
  await page.goto(`${BASE}#/resumo/2026?aba=ritmo`);
  await page.waitForSelector('.heatmap');
  assert.equal(await page.locator('.hm-svg').count(), 2);
  assert.equal(await page.locator('rect[data-date]').count(), 365);
  assert.ok(await page.locator('rect.hm-l4').count() > 0, 'há dias no tom mais forte');
  assert.ok(await page.locator('rect.hm-l1').count() > 0, 'há dias no tom mais claro');
  assert.equal(await page.locator('.hm-dot').count(), 6, 'um ponto por dia com livro concluído');
  assert.match(await page.textContent('.cal-foot'), /dias\s*com leitura em 2026/);
  assert.match(await page.textContent('.cal-foot'), /Maior sequência:\s*\d+ dias/);
  // Os 31 dias seguidos de Duna (12/02 a 14/03) são a maior sequência.
  assert.match(await page.textContent('.cal-foot'), /Maior sequência:\s*31 dias/);
  const box390 = await page.locator('.hm-svg >> nth=0').boundingBox();
  assert.ok(box390.width > 280, `mapa estreito demais: ${box390.width}px`);

  step('toque num dia mostra o que foi lido');
  await tapHeatDay('2026-10-14');
  await page.waitForSelector('.cal-detail .strong-ish');
  assert.equal((await page.textContent('.cal-detail .strong-ish')).trim(), '14 de out · 28 págs. — Lendo agora (8), Contos (20)');
  assert.equal(await page.locator('rect.hm-sel').count(), 1);
  await shotEl('.calendar', 'calendario-ano');
  await tapHeatDay('2026-05-10');
  await page.waitForFunction(() => /10 de mai/.test(document.querySelector('.cal-detail').textContent));
  assert.match(await page.textContent('.cal-detail'), /10 de mai · Leitura registrada — Kindle sem páginas/);
  await tapHeatDay('2026-03-14');
  await page.waitForFunction(() => /14 de mar/.test(document.querySelector('.cal-detail').textContent));
  assert.match(await page.textContent('.cal-detail'), /Concluído: Duna/);
  await shot('resumo');

  step('mês: capas nos dias de término e marca de abandono');
  await page.click('[data-action="cal-mode"][data-mode="mes"]');
  await page.waitForSelector('.cal-grid');
  assert.match(await page.textContent('.cal-month-name'), /Outubro/);
  assert.ok(await page.locator('.cal-cell.has-read').count() >= 15);
  await page.click('[data-action="cal-month"][data-delta="-1"]');
  await page.waitForFunction(() => /Setembro/.test(document.querySelector('.cal-month-name').textContent));
  assert.equal(await page.locator('.cal-cell[data-date="2026-09-05"] .cal-cover .cover').count(), 1);
  await page.click('.cal-cell[data-date="2026-09-05"]');
  await page.waitForFunction(() => /5 de set/.test(document.querySelector('.cal-detail').textContent));
  assert.match(await page.textContent('.cal-detail'), /Concluído: O Hobbit/);
  await shotEl('.calendar', 'calendario-mes');
  await page.click('[data-action="cal-month"][data-delta="-1"]');
  await page.click('[data-action="cal-month"][data-delta="-1"]');
  await page.waitForFunction(() => /Julho/.test(document.querySelector('.cal-month-name').textContent));
  assert.equal(await page.locator('.cal-cell[data-date="2026-07-10"] .cal-drop').count(), 1);
  await checkNarrow('resumo (mês)');
  await page.click('[data-action="cal-mode"][data-mode="ano"]');
  await page.waitForSelector('.heatmap');
  await checkNarrow('resumo (ano)');

  step('gráfico mensal em páginas');
  await page.click('[data-action="month-chart-mode"][data-mode="paginas"]');
  await page.waitForFunction(() => /Páginas por mês/.test(document.body.textContent));
  const values = await page.$$eval('.card:has(h2:text("Páginas por mês")) .bar-value', (els) => els.map((e) => e.textContent.trim()));
  assert.equal(values.length, 12);
  assert.ok(values[1] !== '' && values[2] !== '', 'fevereiro e março com páginas');
  await shotEl('.card:has(h2:text("Páginas por mês"))', 'paginas-por-mes');

  step('toque no mês abre a busca filtrada');
  await page.click('.card:has(h2:text("Páginas por mês")) button.bar-col[data-value="2"]');
  await onPage('buscar');
  assert.equal((await page.textContent('.filter-chip-text')).trim(), 'Filtro: Lidos em março de 2026');
  assert.deepEqual(await page.$$eval('#search-results .book-row-title', (els) => els.map((e) => e.textContent.trim())), ['Duna']);
  await shot('busca-filtrada');
  await checkNarrow('buscar com filtro');
  await page.click('[data-action="clear-chart-filter"]');
  await page.waitForFunction(() => !document.querySelector('.filter-chip'));
  assert.equal(await page.locator('#search-results .book-row').count(), seed.books.length);

  step('faixa de tamanho, nota, formato e gênero (aba Gostos)');
  await page.goto(`${BASE}#/resumo/2026?aba=gostos`);
  await onPage('resumo');
  await page.click('[data-action="chart-filter"][data-kind="length"][data-value="500+"]');
  await onPage('buscar');
  assert.equal((await page.textContent('.filter-chip-text')).trim(), 'Filtro: 500+ págs. em 2026');
  assert.deepEqual(await page.$$eval('#search-results .book-row-title', (els) => els.map((e) => e.textContent.trim())), ['Duna']);

  await page.goto(`${BASE}#/resumo/2026?aba=gostos`);
  await onPage('resumo');
  await page.waitForSelector('.bars-rating');
  await shotEl('.card:has(.bars-rating)', 'notas');
  await page.click('[data-action="chart-filter"][data-kind="rating"][data-value="4.5"]');
  await onPage('buscar');
  assert.equal((await page.textContent('.filter-chip-text')).trim(), 'Filtro: nota 4,5 em 2026');
  assert.deepEqual(await page.$$eval('#search-results .book-row-title', (els) => els.map((e) => e.textContent.trim())), ['Duna']);

  await page.goto(`${BASE}#/resumo/2026?aba=gostos`);
  await onPage('resumo');
  assert.match(await page.textContent('.split-legend-tap'), /Kindle\s*\d+%\s*2 livros/);
  await shotEl('.fmt-card', 'formato');
  await page.click('[data-action="chart-filter"][data-kind="format"][data-value="kindle"]');
  await onPage('buscar');
  assert.equal((await page.textContent('.filter-chip-text')).trim(), 'Filtro: Kindle em 2026');
  assert.deepEqual((await page.$$eval('#search-results .book-row-title', (els) => els.map((e) => e.textContent.trim()))).sort(), ['1984', 'Kindle sem páginas']);
  assert.equal(await page.inputValue('[data-filter="format"]'), 'kindle');

  await page.goto(`${BASE}#/resumo/2026?aba=gostos`);
  await onPage('resumo');
  await shotEl('.card:has(h2:text("Tamanho dos livros"))', 'tamanho');
  await page.click('[data-action="chart-filter"][data-kind="genre"][data-value="Ficção"]');
  await onPage('buscar');
  assert.equal(await page.locator('#search-results .book-row').count(), 4);

  step('todos os anos: dois anos lado a lado');
  await page.goto(`${BASE}#/resumo/todos`);
  await page.waitForSelector('.cmp2');
  assert.equal(await page.inputValue('[data-change="compare-a"]'), '2026');
  assert.equal(await page.inputValue('[data-change="compare-b"]'), '2025');
  const cells = await page.$$eval('.cmp2-row:not(.cmp2-head)', (rows) => rows.map((r) => [...r.querySelectorAll('.cmp2-value')].map((v) => v.textContent.trim())));
  assert.deepEqual(cells[0], ['6', '1']);
  assert.deepEqual(cells[1], [fmt(PAGES_2026), '608']);
  assert.deepEqual(cells[2], ['4,3', '5,0']);
  await page.selectOption('[data-change="compare-a"]', '2025');
  await page.waitForFunction(() => document.querySelector('.cmp2-row:not(.cmp2-head) .cmp2-value').textContent.trim() === '1');
  await page.selectOption('[data-change="compare-a"]', '2026');
  await page.waitForFunction(() => document.querySelector('.cmp2-row:not(.cmp2-head) .cmp2-value').textContent.trim() === '6');
  assert.match(await page.textContent('.kpis'), new RegExp(fmt(PAGES_2026 + 608).replace('.', '\\.')), 'páginas de todos os anos pela mesma regra');
  await shotEl('.cmp2', 'comparar-anos');
  await shot('todos-os-anos');
  await checkNarrow('todos os anos');

  step('meta de páginas nos Ajustes e no Início');
  await page.goto(`${BASE}#/ajustes`);
  await page.waitForSelector('[data-page-goal-form]');
  assert.match(await page.textContent('.page-goal'), /Meta de páginas em 2026/);
  await page.fill('#page-goal-input', '6000');
  await page.press('#page-goal-input', 'Enter');
  await waitState((s) => s.pageGoals?.['2026'] === 6000);
  await page.waitForSelector('[data-action="page-goal-remove"]');
  await shot('ajustes');
  await checkNarrow('ajustes');
  await page.goto(`${BASE}#/inicio`);
  await page.waitForSelector('.hero-pages');
  const projection = Math.round((PAGES_2026 / 289) * 365 / 100) * 100;
  assert.equal(await page.getAttribute('.hero-pages-track', 'aria-label'), `${fmt(PAGES_2026)} de 6.000 págs. · no ritmo de ~${fmt(projection)}`);
  assert.match(await page.textContent('.bento-pages'), new RegExp(`de 6\\.000 págs\\.\\s*ritmo ~${fmt(projection).replace('.', '\\.')}`));
  assert.doesNotMatch(await page.textContent('.bento'), /atrasad/i);
  await shot('inicio-meta-paginas');
  await checkNarrow('início com meta de páginas');
  // Gráfico mensal em páginas ganha a linha da meta mensal.
  await page.goto(`${BASE}#/resumo/2026?aba=ritmo`);
  await onPage('resumo');
  assert.match(await page.textContent('.card:has(h2:text("Páginas por mês"))'), /500\/mês/);
  await page.goto(`${BASE}#/ajustes`);
  await page.click('[data-action="page-goal-remove"]');
  await waitState((s) => !s.pageGoals?.['2026']);
  await page.goto(`${BASE}#/inicio`);
  await page.waitForSelector('.hero');
  assert.equal(await page.locator('.hero-pages').count(), 0);

  step('antes do diário: só os dias de término e o aviso');
  await writeState({ ...seed, books: seed.books.map((b) => ({ ...b, journal: [] })) });
  await page.goto(`${BASE}#/resumo/2026?aba=ritmo`);
  await page.reload();
  await page.waitForSelector('.calendar');
  assert.match(await page.textContent('.cal-note'), /O calendário fica completo conforme você atualiza a página dos livros\./);
  assert.equal(await page.locator('.cal-foot').count(), 0);
  assert.equal(await page.locator('rect.hm-l1, rect.hm-l2, rect.hm-l3, rect.hm-l4').count(), 0);
  assert.equal(await page.locator('.hm-dot').count(), 6);
  await shotEl('.calendar', 'calendario-sem-diario');

  assert.deepEqual(errors, []);
  console.log('\nTudo certo. Capturas em tests/e2e/screens/estatisticas-*.png');
} catch (err) {
  await shot('falha').catch(() => {});
  console.error('\nFALHOU:', err.message);
  if (errors.length) console.error(errors.join('\n'));
  process.exitCode = 1;
} finally {
  await browser.close();
  server.close();
}
