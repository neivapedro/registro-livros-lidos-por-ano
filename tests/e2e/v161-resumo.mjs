// Teste de ponta a ponta do Resumo 1.6.1 (aba Gostos): barras ranqueadas (líder no destaque, top 3 e
// "Ver todos (N)" num <details> nativo), Autores e Etiquetas lado a lado, Abandonados como linha
// discreta e os três níveis de cartão. Larguras 320/390/430, claro e escuro, dois acentos, texto 1,3.
// Uso: node tests/e2e/v161-resumo.mjs   (precisa do Playwright instalado globalmente ou no projeto)

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
const TODAY = '2026-10-26';

// ---------- Dados: 2026 com 12 lidos (6 gêneros, empate no topo), autores repetidos, etiquetas, humores ----------

let seq = 0;
function book(title, extra = {}) {
  seq += 1;
  return {
    id: `b${seq}`, title, authors: `Autor ${seq}`, pages: 320, status: 'lido', startDate: null, endDate: null,
    format: 'fisico', rating: null, genre: 'Ficção', favorite: false, notes: '', cover: null, isbn: '',
    currentPage: null, currentPercent: null, dropReason: '', reread: false, series: '', seriesNumber: null,
    tags: [], targetDate: null, quotes: [], journal: [], moods: [],
    createdAt: '2025-01-01T00:00:00.000Z', updatedAt: `2026-01-01T00:00:${String(seq % 60).padStart(2, '0')}.000Z`, ...extra,
  };
}
// Gêneros: Ficção 3, Filosofia 3 (empate no topo), História 2, Gestão 2, Biografia 1, Poesia 1.
const genres = ['Ficção', 'Filosofia', 'Ficção', 'História', 'Filosofia', 'Gestão', 'Ficção', 'Filosofia', 'História', 'Gestão', 'Biografia', 'Poesia'];
const pages = [150, 240, 300, 380, 420, 260, 510, 330, 290, 350, 210, 120];
const moods = [['tenso'], ['reflexivo'], ['emocionante'], ['leve'], ['reflexivo', 'tenso'], ['inspirador'], ['emocionante'], ['reflexivo'], ['tenso'], ['leve'], ['inspirador'], []];
const books = genres.map((genre, i) => book(`Leitura ${i + 1}`, {
  genre, pages: pages[i], rating: [4, 4.5, 5, 4, 3.5, 4.5, 4, 5, 4.5, 4, 4.5, 4][i], moods: moods[i],
  startDate: `2026-${String(i + 1).padStart(2, '0')}-02`, endDate: `2026-${String(i + 1).padStart(2, '0')}-20`,
  authors: i < 3 ? 'Clarice Lispector' : i < 5 ? 'Machado de Assis' : `Autor ${i + 1}`,
  tags: i % 3 ? ['Clássico'] : ['Indicação', 'Presente'], format: i % 5 === 3 ? 'kindle' : 'fisico',
}));
books.push(book('Livro chato', { status: 'abandonado', startDate: '2026-06-01', endDate: '2026-06-20', dropReason: 'Não prendeu.' }));
const seed = { version: 2, books, goals: { 2026: 15 }, defaultGoal: 12, customGenres: [], lastBackupAt: '2026-10-20T10:00:00.000Z', upNext: [] };

// Ano com poucos gêneros (≤ 3) e sem autor repetido.
const few = [
  book('Um', { genre: 'Ficção', endDate: '2025-02-10', startDate: '2025-02-01', authors: 'A' }),
  book('Dois', { genre: 'Ficção', endDate: '2025-03-10', startDate: '2025-03-01', authors: 'B' }),
  book('Três', { genre: 'História', endDate: '2025-04-10', startDate: '2025-04-01', authors: 'C', tags: ['Clássico'] }),
];
const seedFew = { ...seed, books: [...few], goals: { 2025: 12 } };

const browser = await playwright.chromium.launch();
const errors = [];
async function newPage({ width = 390, scheme = 'dark', accent = null, data = seed } = {}) {
  const context = await browser.newContext({
    viewport: { width, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, locale: 'pt-BR',
    reducedMotion: 'reduce', colorScheme: scheme,
  });
  const page = await context.newPage();
  await page.clock.setFixedTime(new Date(`${TODAY}T12:00:00`));
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errors.push(`console: ${m.text()}`); });
  await page.goto(BASE);
  await page.evaluate(async ({ d, a }) => {
    await (await import('/js/db.js')).setItem('state', d);
    if (a) localStorage.setItem('leituras:acento', a);
  }, { d: data, a: accent });
  return page;
}
const step = (msg) => console.log(`• ${msg}`);
async function open(page, hash) {
  await page.goto(`${BASE}${hash}`);
  await page.reload();
  await page.waitForFunction(() => document.getElementById('app').dataset.page === 'resumo');
  await page.waitForSelector('.rs-panel[data-tab="gostos"]');
}
const text = (page, sel) => page.$eval(sel, (el) => el.textContent.replace(/\s+/g, ' ').trim());
const readState = (page) => page.evaluate(async () => (await import('/js/db.js')).getItem('state'));

/** Sem rolagem lateral e alvos de toque ≥ 44px nas linhas e no "Ver todos". */
async function checkLayout(page, label) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  assert.ok(overflow <= 0, `${label}: ${overflow}px sobrando à direita`);
  const wide = await page.evaluate(() => [...document.querySelectorAll('.rs-panel *')]
    .filter((el) => el.getBoundingClientRect().right > window.innerWidth + 0.5 && getComputedStyle(el).visibility !== 'hidden')
    .map((el) => el.className?.baseVal ?? el.className).slice(0, 5));
  assert.deepEqual(wide, [], `${label}: elementos passando da tela`);
  const tiny = await page.evaluate(() => [...document.querySelectorAll('.rb-row, .rb-toggle, .hbar-btn')]
    .filter((el) => el.checkVisibility())
    .map((el) => ({ el, r: el.getBoundingClientRect() }))
    .filter(({ r }) => r.width && (r.height < 44 || r.width < 44))
    .map(({ el, r }) => `${el.className} ${Math.round(r.width)}×${Math.round(r.height)}`));
  assert.deepEqual(tiny, [], `${label}: alvos de toque menores que 44px`);
  // Texto de cartão nunca vaza do cartão.
  const spill = await page.evaluate(() => [...document.querySelectorAll('.rs-panel .card')].flatMap((c) => {
    const cr = c.getBoundingClientRect();
    return [...c.querySelectorAll('.rank-name, .tag-count, .rb-label, .rb-count')]
      .filter((el) => { const r = el.getBoundingClientRect(); return r.width && (r.right > cr.right + 0.5 || r.left < cr.left - 0.5); })
      .map((el) => el.className);
  }));
  assert.deepEqual(spill, [], `${label}: texto vazando do cartão`);
}

/** Cartão por título. */
const card = (page, title) => page.locator('.rs-panel .card', { has: page.locator(`h2:text-is("${title}")`) });

try {
  let page = await newPage();

  step('Gêneros: líder e empate no destaque, resto neutro; 3 à mostra e "Ver todos (6)"');
  await open(page, '#/resumo/2026?aba=gostos');
  const gen = card(page, 'Gêneros mais lidos');
  assert.equal(await gen.locator('.rb-row').count(), 6);
  assert.equal(await gen.locator('.rb-row.is-lead').count(), 2, 'Ficção e Filosofia empatam em 3 livros');
  const leadColors = await gen.locator('.rb-row.is-lead .hbar-fill').evaluateAll((els) => els.map((e) => getComputedStyle(e).backgroundColor));
  const rest = await gen.locator('.rb-row:not(.is-lead) .hbar-fill').evaluateAll((els) => els.map((e) => getComputedStyle(e).backgroundColor));
  assert.equal(new Set(leadColors).size, 1);
  assert.equal(new Set(rest).size, 1);
  assert.notEqual(leadColors[0], rest[0], 'destaque ≠ neutro');
  const accent = await page.evaluate(() => { const p = document.createElement('i'); p.style.color = 'var(--accent)'; document.body.append(p); const c = getComputedStyle(p).color; p.remove(); return c; });
  assert.equal(leadColors[0], accent, 'o destaque é a cor de acento');
  // Só três linhas visíveis antes de abrir.
  const visible = () => gen.locator('.rb-row').evaluateAll((els) => els.filter((e) => e.checkVisibility()).length);
  assert.equal(await visible(), 3);
  assert.equal(await text(page, '.rs-panel .card:has(h2:text-is("Gêneros mais lidos")) .rb-toggle .rb-open'), 'Ver todos (6)');
  assert.match(await gen.locator('.rb-row').first().innerText(), /3 livros · 25%/);
  step('"Ver todos" abre sem JavaScript nem ação nova; "Mostrar menos" fecha');
  const before = JSON.stringify(await readState(page));
  assert.equal(await gen.locator('[data-action="rb-more"], .rb-more[data-action]').count(), 0);
  await gen.locator('.rb-toggle').click();
  assert.equal(await gen.locator('.rb-more').evaluate((d) => d.open), true);
  assert.equal(await visible(), 6);
  assert.equal(await gen.locator('.rb-toggle').innerText(), 'Mostrar menos');
  await page.screenshot({ path: join(SHOTS, 'v161-resumo-390-escuro-aberto.png'), fullPage: true });
  await gen.locator('.rb-toggle').click();
  assert.equal(await visible(), 3);
  assert.equal(JSON.stringify(await readState(page)), before, 'abrir/fechar não muda nada guardado');
  // Toque numa linha ainda leva à busca filtrada.
  await gen.locator('.rb-row').first().click();
  await page.waitForFunction(() => document.getElementById('app').dataset.page === 'buscar');

  step('Perfil de leitor e Tamanho dos livros usam o mesmo desenho');
  await open(page, '#/resumo/2026?aba=gostos');
  const prof = card(page, 'Seu perfil de leitor');
  assert.ok(await prof.locator('.rb-row').count() >= 4);
  assert.equal(await prof.locator('.rb-more').count(), 1);
  assert.ok(await prof.locator('.rb-row.is-lead').count() >= 1);
  const len = card(page, 'Tamanho dos livros');
  assert.equal(await len.locator('.rb-row').count(), 4);
  assert.equal(await len.locator('.rb-more').count(), 0, 'as quatro faixas ficam todas à mostra');
  assert.equal(await len.locator('.rb-row.is-lead').count(), 1);
  const heights = await page.$$eval('.rb-row', (els) => els.filter((e) => e.checkVisibility()).map((e) => Math.round(e.getBoundingClientRect().height)));
  assert.ok(Math.max(...heights) - Math.min(...heights) <= 2, `altura das linhas consistente: ${heights}`);
  assert.match(await text(page, '.rs-panel .card:has(h2:text-is("Tamanho dos livros")) .rb-row .rb-count'), /\d+ livros? · \d+%/);

  step('Autores e Etiquetas lado a lado (390), Abandonados por último como linha discreta');
  const pair = page.locator('.rs-pair');
  assert.equal(await pair.count(), 1);
  const boxes = await pair.locator('.card').evaluateAll((els) => els.map((e) => { const r = e.getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width }; }));
  assert.equal(boxes.length, 2);
  assert.ok(Math.abs(boxes[0].y - boxes[1].y) < 1 && boxes[1].x > boxes[0].x, 'duas colunas');
  const order = await page.$$eval('.rs-panel > *', (els) => els.map((e) => e.querySelector('h2')?.textContent || e.className));
  assert.equal(order[order.length - 1], 'Abandonados');
  assert.equal(await page.locator('.rs-dropped.info-row').count(), 1);
  assert.equal(await page.evaluate(() => getComputedStyle(document.querySelector('.rs-dropped')).borderStyle), 'dashed');
  await checkLayout(page, 'gostos 390 escuro');
  await page.screenshot({ path: join(SHOTS, 'v161-resumo-390-escuro.png'), fullPage: true });

  step('três níveis de cartão: raio, borda e respiro vêm dos mesmos tokens');
  const tokens = await page.evaluate(() => {
    const cs = getComputedStyle(document.documentElement);
    return { radius: cs.getPropertyValue('--card-radius').trim(), pad: cs.getPropertyValue('--card-pad').trim(), border: cs.getPropertyValue('--card-border').trim() };
  });
  assert.ok(tokens.radius && tokens.pad && tokens.border);
  const std = await page.$$eval('.rs-panel > .card:not(.info-row)', (els) => els.map((e) => { const c = getComputedStyle(e); return `${c.borderTopLeftRadius}|${c.borderTopWidth}|${c.borderTopStyle}`; }));
  assert.equal(new Set(std).size, 1, `cartões padrão iguais: ${[...new Set(std)]}`);
  await page.context().close();

  step('largura 320 e 430: pares empilham/lado a lado sem vazar');
  for (const width of [320, 430]) {
    page = await newPage({ width });
    await open(page, '#/resumo/2026?aba=gostos');
    const b = await page.locator('.rs-pair .card').evaluateAll((els) => els.map((e) => { const r = e.getBoundingClientRect(); return { x: r.x, y: r.y }; }));
    if (width < 390) assert.ok(b[1].y > b[0].y + 5 && Math.abs(b[1].x - b[0].x) < 1, '320: empilhados');
    else assert.ok(Math.abs(b[1].y - b[0].y) < 1, '430: lado a lado');
    await page.locator('.rb-toggle').first().click();
    await checkLayout(page, `gostos ${width}`);
    await page.screenshot({ path: join(SHOTS, `v161-resumo-${width}-escuro.png`), fullPage: true });
    await page.context().close();
  }

  step('claro e escuro, dois acentos');
  for (const [scheme, accentName] of [['light', 'terracota'], ['light', 'petroleo'], ['dark', 'oliva'], ['dark', 'vinho']]) {
    page = await newPage({ scheme, accent: accentName });
    await open(page, '#/resumo/2026?aba=gostos');
    const g = card(page, 'Gêneros mais lidos');
    const lead = await g.locator('.rb-row.is-lead .hbar-fill').first().evaluate((e) => getComputedStyle(e).backgroundColor);
    const neutral = await g.locator('.rb-row:not(.is-lead) .hbar-fill').first().evaluate((e) => getComputedStyle(e).backgroundColor);
    assert.notEqual(lead, neutral, `${scheme} ${accentName}: líder distinto`);
    await checkLayout(page, `gostos ${scheme} ${accentName}`);
    await page.screenshot({ path: join(SHOTS, `v161-resumo-390-${scheme}-${accentName}.png`), fullPage: true });
    await page.context().close();
  }

  step('texto ampliado (1,3): o par empilha e nada vaza');
  page = await newPage({ width: 390 });
  await open(page, '#/resumo/2026?aba=gostos');
  await page.evaluate(() => {
    document.documentElement.style.setProperty('--type-scale', '1.3');
    document.documentElement.style.setProperty('--type-scale-lg', '1.15');
    document.documentElement.dataset.textSize = 'grande';
  });
  await page.locator('.rb-toggle').first().click();
  const stacked = await page.locator('.rs-pair .card').evaluateAll((els) => els.map((e) => e.getBoundingClientRect().y));
  assert.ok(stacked[1] > stacked[0] + 5, 'empilhados com texto grande');
  await checkLayout(page, 'gostos texto 1,3');
  await page.screenshot({ path: join(SHOTS, 'v161-resumo-390-texto13.png'), fullPage: true });
  await page.context().close();

  step('ano com ≤ 3 gêneros: tudo à mostra, sem "Ver todos"; sem autor repetido não há par');
  page = await newPage({ data: seedFew });
  await open(page, '#/resumo/2025?aba=gostos');
  assert.equal(await page.locator('.rb-more').count(), 0);
  assert.equal(await page.locator('.rs-pair').count(), 0);
  assert.match(await text(page, '.rs-hint'), /Nenhum autor repetido/);
  assert.equal(await page.locator('.rs-panel .card:has(h2:text-is("Etiquetas mais usadas"))').count(), 1);
  await checkLayout(page, 'gostos poucos gêneros');
  await page.context().close();

  assert.deepEqual(errors, [], `erros no console: ${errors.join(' | ')}`);
  console.log('\nOK: Resumo 1.6.1 (Gostos: barras ranqueadas, Ver todos, pares, cartões em três níveis)');
} finally {
  await browser.close();
  server.close();
}
