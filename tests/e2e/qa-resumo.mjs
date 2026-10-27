// QA do Resumo 1.4 (fuso de São Paulo): começo do ano sem projeção absurda e com o número
// do realizado fora dos rótulos do eixo, ano futuro sem "abaixo da meta" nem quedas,
// trocar de ano mantém a aba no endereço, páginas por dia com casa decimal, formato só Kindle,
// variação de páginas que arredonda para 0% ("igual") e layout em 375 px.
// Uso: node tests/e2e/qa-resumo.mjs   (precisa do Playwright instalado globalmente ou no projeto)

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
const BASE = `http://127.0.0.1:${server.address().port}/`;

let seq = 0;
function book(title, extra = {}) {
  seq += 1;
  return {
    id: `q${seq}`, title, authors: `Autor ${seq}`, pages: 300, status: 'lido', startDate: null, endDate: null,
    format: 'kindle', rating: 4, genre: 'Ficção', favorite: false, notes: '', cover: null, isbn: '',
    currentPage: null, currentPercent: null, dropReason: '', reread: false, series: '', seriesNumber: null,
    tags: [], targetDate: null, quotes: [], journal: [],
    createdAt: '2025-01-01T00:00:00.000Z', updatedAt: `2026-01-01T00:00:${String(seq % 60).padStart(2, '0')}.000Z`, ...extra,
  };
}
// 2026: só Kindle, um livro terminado em 1º de janeiro (o primeiro dia do ano) e outro em 31 de março.
// 2025: páginas quase iguais às de 2026 até a mesma data (2.000 × 2.004 → 0%, "igual").
const books = [
  book('Primeiro do ano', { endDate: '2026-01-01', startDate: '2025-12-20', pages: 1000 }),
  book('Fim de março', { endDate: '2026-03-31', startDate: '2026-03-01', pages: 1000 }),
  book('Antigo A', { endDate: '2025-01-01', startDate: '2024-12-20', pages: 1002, format: 'fisico' }),
  book('Antigo B', { endDate: '2025-03-31', startDate: '2025-03-01', pages: 1002, format: 'fisico' }),
];
const seed = {
  version: 2, books, goals: { 2026: 12, 2027: 24 }, defaultGoal: 12, customGenres: [], lastBackupAt: '2026-10-20T10:00:00.000Z', upNext: [],
};

const browser = await playwright.chromium.launch();
const errors = [];
async function newPage(today, { width = 390 } = {}) {
  const context = await browser.newContext({
    viewport: { width, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, locale: 'pt-BR',
    reducedMotion: 'reduce', timezoneId: 'America/Sao_Paulo',
  });
  const page = await context.newPage();
  // 21h em São Paulo = meia-noite UTC do dia seguinte: o app tem que usar a data local.
  await page.clock.setFixedTime(new Date(`${today}T21:30:00-03:00`));
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errors.push(`console: ${m.text()}`); });
  await page.goto(BASE);
  await page.evaluate(async (d) => (await import('/js/db.js')).setItem('state', d), seed);
  return page;
}
const step = (msg) => console.log(`• ${msg}`);
const onPage = (page, name) => page.waitForFunction((n) => document.getElementById('app').dataset.page === n, name);
async function open(page, hash) {
  await page.goto(`${BASE}${hash}`);
  await page.reload();
  await onPage(page, 'resumo');
}
const text = (page, sel) => page.$eval(sel, (el) => el.textContent.replace(/\s+/g, ' ').trim());

try {
  step('1º de janeiro (21h30 em São Paulo): sem projeção, número do realizado longe do eixo y');
  let page = await newPage('2026-01-01');
  await open(page, '#/resumo/2026');
  assert.match(await text(page, '.sc-svg + .sc-legend, .sc-legend'), /Realizado/);
  assert.equal(await page.locator('.sc-proj').count(), 0, 'sem projeção no primeiro dia');
  assert.doesNotMatch(await text(page, '.sc-text'), /ritmo atual/);
  assert.match(await page.getAttribute('.sc-svg', 'aria-label'), /^Curva S de 2026: 1 de 12 livros\./);
  // O eixo y vai até a meta (não até uma projeção de 365).
  const yMax = await page.$$eval('.sc-ylab', (els) => Math.max(...els.map((e) => Number(e.textContent))));
  assert.ok(yMax <= 15, `eixo y até ${yMax}`);
  const overlap = await page.evaluate(() => {
    const val = document.querySelector('.sc-val').getBBox();
    return [...document.querySelectorAll('.sc-ylab')].some((t) => {
      const b = t.getBBox();
      return b.x < val.x + val.width && val.x < b.x + b.width && b.y < val.y + val.height && val.y < b.y + b.height;
    });
  });
  assert.equal(overlap, false, 'o número do realizado não cobre os rótulos do eixo');
  await page.locator('.sc-card').screenshot({ path: join(SHOTS, 'qa-resumo-1jan.png') });
  await page.context().close();

  step('26 out: variação de páginas que arredonda a 0% aparece como "igual"; trocar de ano mantém a aba no endereço');
  page = await newPage('2026-10-26');
  await open(page, '#/resumo/2026');
  const pagesTile = await text(page, '.kpi >> nth=1');
  assert.match(pagesTile, /2\.000/);
  assert.match(pagesTile, /= igual/);
  assert.doesNotMatch(pagesTile, /0%/);
  await page.click('.rs-tab[data-tab="gostos"]');
  await page.waitForSelector('.rs-panel[data-tab="gostos"]');
  // Só Kindle: a legenda fica à esquerda.
  const fmt = await page.evaluate(() => {
    const card = document.querySelector('.fmt-labels').getBoundingClientRect();
    const label = document.querySelector('.fmt-label').getBoundingClientRect();
    return { left: label.left - card.left };
  });
  assert.ok(fmt.left < 2, `legenda do formato a ${fmt.left}px da esquerda`);
  assert.match(await text(page, '.fmt-labels'), /Kindle 100%/);
  await page.selectOption('[data-change="summary-year"]', '2025');
  await page.waitForURL(/#\/resumo\/2025\?aba=gostos$/);
  assert.equal(await text(page, '.rs-tab.is-on'), 'Gostos');
  await page.goBack();
  await page.waitForURL(/#\/resumo\/2026\?aba=gostos$/);
  await page.waitForFunction(() => document.querySelector('[data-change="summary-year"]').value === '2026');
  assert.equal(await text(page, '.rs-tab.is-on'), 'Gostos');

  step('Ritmo: páginas por dia com uma casa quando o número é pequeno');
  await page.click('.rs-tab[data-tab="ritmo"]');
  await page.waitForSelector('.rs-panel[data-tab="ritmo"]');
  // 2.000 págs. em 299 dias = 6,7 por dia (antes: "7"); nunca "0" num ano com páginas.
  assert.match(await text(page, '.ppd'), /^6,7 ?média no ano/);
  await page.context().close();

  step('ano futuro (link direto): meta e previsto, sem "abaixo da meta" e sem quedas sobre o ano anterior');
  page = await newPage('2026-10-26');
  await open(page, '#/resumo/2027');
  assert.equal(await text(page, '.sc-headline'), 'Meta de 24 livros');
  assert.equal(await text(page, '.sc-text .muted'), 'Previsto: 2 por mês');
  assert.equal(await page.locator('.kpi-delta').count(), 0);
  assert.equal(await page.locator('.kpi-caption').count(), 0);
  await page.context().close();

  step('375 px (iPhone SE/13 mini): sem rolagem lateral em nenhuma aba nem em Todos os anos');
  page = await newPage('2026-10-26', { width: 375 });
  for (const hash of ['#/resumo/2026', '#/resumo/2026?aba=ritmo', '#/resumo/2026?aba=gostos', '#/resumo/todos']) {
    await open(page, hash);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    assert.ok(overflow <= 0, `${hash}: ${overflow}px sobrando`);
  }
  await page.screenshot({ path: join(SHOTS, 'qa-resumo-375-todos.png'), fullPage: true });
  await page.context().close();

  assert.deepEqual(errors, [], 'sem erros no console');
  console.log('\nOK: QA do Resumo 1.4');
} catch (err) {
  console.error('\nFALHOU:', err.message);
  if (errors.length) console.error(errors.join('\n'));
  process.exitCode = 1;
} finally {
  await browser.close();
  server.close();
}
