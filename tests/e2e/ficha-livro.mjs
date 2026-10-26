// Teste de ponta a ponta da ficha do livro (v1.4): #/livro/:id mostra a ficha e a edição
// fica em #/livro/:id/editar. Cobre os quatro status, Voltar/Editar, Concluir, favorito,
// próxima leitura, gráfico de ritmo, semanas do Diário e a transição da capa,
// em 320, 390 e 430 px, com capturas em tests/e2e/screens/ficha-*.png.
// Uso: node tests/e2e/ficha-livro.mjs   (precisa do Playwright, como o smoke.mjs)

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

const TS = '2026-01-01T00:00:00.000Z';
const day = (d) => `2026-${d}`;
// Diário de "Hábitos Atômicos": 22 jan a 9 fev, com dois dias sem leitura e minutos em alguns dias.
const habitsJournal = [];
{
  let pos = 0;
  const dates = ['01-22', '01-23', '01-24', '01-25', '01-27', '01-28', '01-29', '01-30', '02-01', '02-02', '02-03', '02-04', '02-06', '02-07', '02-08', '02-09'];
  dates.forEach((d, i) => {
    const step = i % 4 === 3 ? 32 : 16;
    habitsJournal.push({ date: day(d), from: pos, to: Math.min(320, pos + step), unit: 'page', note: i === 2 ? 'No metrô.' : '', ...(i % 3 === 0 ? { minutes: 25 + i } : {}) });
    pos = Math.min(320, pos + step);
  });
}
const readingJournal = Array.from({ length: 10 }, (_, k) => ({
  date: `2026-10-${String(5 + k).padStart(2, '0')}`, from: k * 20, to: (k + 1) * 20, unit: 'page', note: '', ...(k % 2 ? { minutes: 30 } : {}),
}));

function seedWith(covers) {
  const base = { authors: 'Autor', format: 'fisico', genre: 'Ficção', tags: [], quotes: [], journal: [], createdAt: TS, updatedAt: TS, favorite: false, notes: '', isbn: '' };
  return {
    version: 2, goals: { 2026: 12 }, defaultGoal: 12, customGenres: [], lastBackupAt: '2026-10-10T10:00:00.000Z', pageGoals: {},
    upNext: ['w2'],
    books: [
      { ...base, id: 'h1', title: 'Hábitos Atômicos', authors: 'James Clear', pages: 320, status: 'lido', startDate: day('01-22'), endDate: day('02-10'),
        rating: 4.5, favorite: true, genre: 'Desenvolvimento pessoal', tags: ['indicação', 'trabalho'], isbn: '9788550807560', cover: covers[0],
        notes: 'Sistemas > metas.\nRever o capítulo 4.', journal: habitsJournal,
        quotes: [
          { id: 'q1', text: 'Todo hábito começa com uma deixa.', page: 61, percent: null, note: '', createdAt: '2026-01-30T10:00:00.000Z' },
          { id: 'q2', text: 'Você não sobe ao nível dos seus objetivos. Você cai ao nível dos seus sistemas.', page: 27, percent: null, note: '', createdAt: '2026-02-02T10:00:00.000Z' },
        ] },
      { ...base, id: 'd1', title: 'Duna', authors: 'Frank Herbert', pages: 680, status: 'lido', startDate: '2026-03-01', endDate: '2026-04-20', rating: 5,
        series: 'Duna', seriesNumber: 1, cover: covers[1], genre: 'Ficção científica' },
      { ...base, id: 'd2', title: 'O Messias de Duna', authors: 'Frank Herbert', pages: 256, status: 'lendo', startDate: '2026-10-05', currentPage: 200,
        series: 'Duna', seriesNumber: 2, cover: covers[2], journal: readingJournal, targetDate: '2026-10-30' },
      { ...base, id: 'w1', title: 'Os Filhos de Duna', authors: 'Frank Herbert', pages: 600, status: 'quero', series: 'Duna', seriesNumber: 3, cover: covers[3] },
      { ...base, id: 'w2', title: 'Cem Anos de Solidão', authors: 'Gabriel García Márquez', pages: 448, status: 'quero' },
      { ...base, id: 'x1', title: 'Livro que não prendeu e tinha um título enorme para testar quebras de linha', pages: 300, status: 'abandonado',
        startDate: '2026-04-01', endDate: '2026-04-10', currentPage: 80, dropReason: 'A primeira metade promete,\nmas a história se arrasta.', cover: covers[4] },
      { ...base, id: 'k1', title: 'Fora de Série', authors: 'Malcolm Gladwell', pages: null, status: 'lendo', format: 'kindle', startDate: '2026-10-01', currentPercent: 45,
        journal: [{ date: '2026-10-12', from: 20, to: 45, unit: 'percent', note: '' }] },
      { ...base, id: 'o1', title: 'Livro antigo sem diário', pages: 200, status: 'lido', startDate: '2025-02-01', endDate: '2025-02-20', rating: 3 },
    ],
  };
}

const browser = await playwright.chromium.launch();

async function newContext(extra = {}) {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, locale: 'pt-BR', ...extra,
  });
  // Conta as transições da capa (View Transitions) sem mudar o comportamento.
  await context.addInitScript(() => {
    window.__vt = 0;
    window.__vtActive = 0;
    const original = document.startViewTransition?.bind(document);
    if (original) {
      document.startViewTransition = (cb) => {
        window.__vt += 1;
        window.__vtActive += 1;
        const t = original(cb);
        t.finished.finally(() => { window.__vtActive -= 1; });
        return t;
      };
    }
  });
  return context;
}

const context = await newContext();
const page = await context.newPage();
await page.clock.setFixedTime(new Date('2026-10-16T12:00:00'));

const readState = (p = page) => p.evaluate(async () => (await import('/js/db.js')).getItem('state'));
const writeState = (data, p = page) => p.evaluate(async (d) => (await import('/js/db.js')).setItem('state', d), data);
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

const step = (msg) => console.log(`• ${msg}`);
// Espera também a transição da capa terminar (durante ela, os toques vão para a camada da transição).
const onPage = (name) => page.waitForFunction((n) => document.getElementById('app').dataset.page === n && !window.__vtActive, name);
const onDetail = (id) => page.waitForFunction((i) => location.hash === `#/livro/${i}` && document.querySelector('.ficha-hero') && !window.__vtActive, id);
const toastHas = (re) => page.waitForFunction((src) => new RegExp(src).test(document.getElementById('toast').textContent), re.source);
const text = async (sel) => (await page.textContent(sel)).replace(/\s+/g, ' ').trim();
async function layoutProblems(label) {
  return page.evaluate((lbl) => {
    const out = [];
    const overflow = document.documentElement.scrollWidth - window.innerWidth;
    if (overflow > 0) out.push(`${lbl}: ${overflow}px sobrando à direita`);
    const small = [...document.querySelectorAll('#app button, #app a')]
      .filter((el) => el.offsetParent && el.getBoundingClientRect().height < 44).map((el) => el.outerHTML.slice(0, 70));
    if (small.length) out.push(`${lbl}: alvos < 44px: ${small.join(' | ')}`);
    const fields = [...document.querySelectorAll('#app input, #app select, #app textarea')]
      .filter((el) => el.offsetParent && parseFloat(getComputedStyle(el).fontSize) < 16).map((el) => el.id);
    if (fields.length) out.push(`${lbl}: letra < 16px em ${fields.join(', ')}`);
    // Nada do topo cortado: título e autor inteiros dentro da largura.
    for (const sel of ['.ficha-title', '.ficha-author', '.ficha-stats', '.rchart']) {
      const el = document.querySelector(sel);
      if (!el) continue;
      const r = el.getBoundingClientRect();
      if (r.left < 0 || r.right > window.innerWidth) out.push(`${lbl}: ${sel} passa da tela`);
    }
    return out;
  }, label);
}

try {
  step('dados de exemplo (capas de verdade, como data URL)');
  await page.goto(`${BASE}manifest.webmanifest`);
  const covers = await page.evaluate(() => [['#2B4C7E', '#F2E8CF'], ['#A0522D', '#FAEBD7'], ['#7A2E2E', '#F7D9C4'], ['#1F5E4A', '#E8F1EA'], ['#8E5572', '#F7EFE5']].map(([bg, fg], i) => {
    const c = document.createElement('canvas');
    c.width = 240;
    c.height = 360;
    const x = c.getContext('2d');
    const g = x.createLinearGradient(0, 0, 240, 360);
    g.addColorStop(0, bg);
    g.addColorStop(1, '#000');
    x.fillStyle = g;
    x.fillRect(0, 0, 240, 360);
    x.fillStyle = fg;
    x.fillRect(20, 60, 200, 4);
    x.font = 'bold 30px Georgia';
    x.fillText(['LIVRO', 'OBRA', 'TEXTO', 'CAPA', 'TOMO'][i], 24, 140);
    return c.toDataURL('image/jpeg', 0.8);
  }));
  const seed = seedWith(covers);
  await page.goto(BASE);
  await page.waitForSelector('.hero');
  await writeState(seed);
  await page.reload();
  await page.waitForSelector('.hero');

  step('Início → capa → ficha (com a transição da capa) → Voltar');
  await page.click('.grid-book:has(img) >> nth=0');
  await page.waitForFunction(() => document.querySelector('.ficha-hero') && !window.__vtActive);
  assert.match(page.url(), /#\/livro\/[a-z0-9]+$/);
  assert.ok(await page.evaluate(() => window.__vt) >= 1, 'abriu com View Transition');
  assert.equal(await page.locator('#nav').isVisible(), false, 'ficha sem a barra de baixo');
  await page.click('.ficha-back');
  await onPage('inicio');

  step('Lido: capa, cor da capa, nota com meia estrela, favorito, números e período');
  await page.click('.grid-book:has-text("10 fev")');
  await onDetail('h1');
  assert.equal(await text('.ficha-title'), 'Hábitos Atômicos');
  assert.equal(await text('.ficha-author'), 'James Clear · 320 págs.');
  assert.equal(await text('.ficha-status'), 'Lido');
  assert.equal(await page.getAttribute('.ficha-stars', 'aria-label'), 'Nota 4,5 de 5');
  assert.equal(await page.locator('.ficha-stars .star-half').count(), 1);
  assert.equal(await page.getAttribute('.ficha-fav', 'aria-pressed'), 'true');
  assert.deepEqual((await page.locator('.ficha-stats > div').allInnerTexts()).map((t) => t.replace(/\s+/g, ' ')),
    ['20 dias corridos', '16 págs. por dia', '3h 15min no cronômetro']);
  assert.equal(await text('.ficha-period'), 'Lido em 20 dias · 22 jan → 10 fev 2026');
  // Cor predominante da capa no fundo do topo (cover-color.js).
  await page.waitForFunction(() => getComputedStyle(document.querySelector('.ficha-hero')).getPropertyValue('--tint').trim().split(' ').length === 3);
  assert.equal(await page.evaluate(() => getComputedStyle(document.querySelector('.ficha-cover .cover')).viewTransitionName), 'book-cover');

  step('Lido: ritmo da leitura (barras na escala do tempo) e toque numa barra');
  assert.equal(await page.locator('.rchart-bar').count(), 19, '22 jan a 9 fev, um traço por dia');
  assert.equal(await page.locator('.rchart-bar.is-zero').count(), 3, 'dias sem leitura');
  assert.equal(await text('.rchart-max'), '32 págs.');
  assert.match(await text('.rchart-readout'), /^16 dias de leitura · média 20 págs\.\/dia · 3h 15min cronometradas$/);
  const heights = await page.locator('.rchart-bar:not(.is-zero)').evaluateAll((els) => els.map((e) => e.getBoundingClientRect().height));
  assert.ok(Math.abs(Math.max(...heights) - 2 * Math.min(...heights)) < 1, 'barra de 32 págs. tem o dobro da de 16');
  await page.locator('.rchart-plot').scrollIntoViewIfNeeded();
  const plot = await page.locator('.rchart-plot').boundingBox();
  await page.mouse.click(plot.x + 3, plot.y + plot.height - 4);
  assert.match(await text('.rchart-readout'), /^22 jan · \+16 págs\. · 25 min$/);
  await page.mouse.click(plot.x + 3, plot.y + plot.height - 4);
  assert.match(await text('.rchart-readout'), /^16 dias de leitura/, 'segundo toque volta ao resumo');

  step('Lido: trecho mais recente, anotações, gênero, etiquetas e ISBN');
  assert.match(await text('.ficha-quote blockquote'), /^Você não sobe ao nível/);
  assert.equal(await page.evaluate(() => getComputedStyle(document.querySelector('.ficha-quote blockquote')).fontStyle), 'italic');
  assert.equal(await text('.ficha-section .section-head .link'), 'Ver todos (2)');
  assert.match(await page.innerText('.ficha-notes'), /Sistemas > metas\.\nRever o capítulo 4\./);
  assert.deepEqual(await page.locator('.ficha-chip').allTextContents(), ['Desenvolvimento pessoal', 'Físico', 'indicação', 'trabalho']);
  assert.equal(await text('.ficha-isbn'), 'ISBN 9788550807560');

  step('favorito: tocar no coração tira e põe de novo');
  await page.click('.ficha-fav');
  await waitState((s) => bookIn(s, 'h1').favorite === false);
  assert.equal(await page.getAttribute('.ficha-fav', 'aria-pressed'), 'false');
  await page.click('.ficha-fav');
  await waitState((s) => bookIn(s, 'h1').favorite === true);

  step('capa ampliada a partir da ficha');
  await page.click('.ficha-cover');
  await page.waitForSelector('.cover-viewer .cover-viewer-img');
  await page.click('.cover-viewer-close');
  assert.equal(await page.locator('.cover-viewer').count(), 0);

  step('Ver todos (2) → aba Trechos; Voltar → ficha');
  await page.click('.ficha-section .section-head .link');
  await page.waitForSelector('.book-tab.is-on[data-tab="trechos"]');
  assert.equal(await page.locator('.quote-card').count(), 2);
  await page.click('.form-top >> text=Voltar');
  await onDetail('h1');

  step('Ver diário → gráfico por dia e semanas recolhíveis; corrigir e desfazer continuam');
  await page.click('.ficha-more');
  await page.waitForSelector('.book-tab.is-on[data-tab="diario"]');
  assert.equal(await page.locator('.rchart.is-tall').count(), 1);
  assert.equal(await page.locator('.diary-summary .tile').count(), 3, 'os totais continuam');
  assert.deepEqual(await page.locator('.diary-week-title').allTextContents(), ['Semana de 9 fev', 'Semana de 2 fev', 'Semana de 26 jan', 'Semana de 19 jan']);
  assert.deepEqual((await page.locator('.diary-week-sum').allTextContents()), ['1 dia · 32 págs. · 40 min', '6 dias · 112 págs. · 1h 11min', '5 dias · 96 págs. · 31 min', '4 dias · 80 págs. · 53 min']);
  assert.equal(await page.locator('.diary-row:visible').count(), 1, 'só a semana mais recente aberta');
  await page.click('.diary-week-head:has-text("Semana de 26 jan")');
  assert.equal(await page.getAttribute('.diary-week-head:has-text("Semana de 26 jan")', 'aria-expanded'), 'true');
  assert.equal(await page.locator('.diary-row:visible').count(), 6);
  await page.screenshot({ path: join(SHOTS, 'ficha-diario-semanas.png'), fullPage: true });
  await page.click('[data-action="diary-edit"][data-date="2026-01-28"]');
  await page.waitForSelector('[data-diary-form]');
  await page.click('[data-action="diary-delete"]');
  await waitState((s) => bookIn(s, 'h1').journal.length === 15);
  assert.equal(await page.getAttribute('.diary-week-head:has-text("Semana de 26 jan")', 'aria-expanded'), 'true', 'a semana continua aberta');
  await page.click('.toast button:has-text("Desfazer")');
  await waitState((s) => bookIn(s, 'h1').journal.length === 16);
  await page.click('.diary-week-head:has-text("Semana de 26 jan")');
  assert.equal(await page.locator('.diary-row:visible').count(), 1);
  await page.click('.form-top >> text=Voltar');
  await onDetail('h1');

  step('Editar → formulário (nota) → Salvar volta para a ficha atualizada');
  await page.click('.ficha-top a:has-text("Editar")');
  await page.waitForSelector('#book-form');
  assert.match(page.url(), /#\/livro\/h1\/editar$/);
  assert.equal(await text('.form-title'), 'Editar livro');
  await page.click('[data-action="set-rating"][data-value="4"]');
  await page.click('.form-top button[type="submit"]');
  await onDetail('h1');
  await toastHas(/Alterações salvas/);
  assert.equal(await page.getAttribute('.ficha-stars', 'aria-label'), 'Nota 4 de 5');
  step('Editar → Cancelar volta para a ficha; Voltar da ficha continua indo ao Início');
  await page.click('.ficha-top a:has-text("Editar")');
  await page.click('.form-top >> text=Cancelar');
  await onDetail('h1');
  assert.equal(await page.getAttribute('.ficha-back', 'href'), '#/inicio');
  await page.click('.ficha-back');
  await onPage('inicio');

  step('série: chip "Duna · nº 1" e link para o próximo volume (ficha do outro livro)');
  await page.goto(`${BASE}#/estante?aba=lido`);
  await page.waitForSelector('.book-row');
  await page.click('.book-row-link:has-text("Duna")');
  await onDetail('d1');
  assert.equal(await text('.ficha-series .ficha-chip'), 'Duna · nº 1');
  assert.equal(await text('.ficha-next'), 'Próximo: nº 2 · O Messias de Duna');
  assert.equal(await page.locator('.rchart.is-empty').count(), 1, 'lido sem diário: aviso discreto');
  await page.click('.ficha-next');
  await onDetail('d2');
  assert.equal(await page.getAttribute('.ficha-back', 'href'), '#/estante?aba=lido', 'o Voltar segue para a lista de origem');

  step('Lendo: progresso, ritmo/previsão, Registrar leitura, Ler agora, Concluir');
  assert.equal(await text('.ficha-status'), 'Lendo');
  assert.equal(await text('.ficha-pct'), '78%');
  assert.equal(await text('.ficha-progress-label'), 'pág. 200 de 256');
  assert.match(await text('.ficha-pace'), /Ritmo: 20 págs\.\/dia · termina por volta de 19 out/);
  assert.match(await text('.ficha-pace'), /Para terminar até 30 out: 4 págs\.\/dia/);
  assert.doesNotMatch(await text('#app'), /atrasad/i);
  assert.equal(await page.locator('.ficha-card [data-action="start-timer"]').count(), 1);
  await page.click('[data-action="update-page"]');
  await page.waitForSelector('#progress-input');
  assert.equal(await page.evaluate(() => document.activeElement.id), 'progress-input');
  await page.fill('#progress-input', '230');
  await page.press('#progress-input', 'Enter');
  await toastHas(/Página atualizada/);
  await page.waitForFunction(() => document.querySelector('.ficha-pct')?.textContent === '90%');
  const afterUpdate = bookIn(await waitState((s) => bookIn(s, 'd2').currentPage === 230), 'd2');
  assert.deepEqual(afterUpdate.journal.at(-1), { date: '2026-10-16', from: 200, to: 230, unit: 'page', note: '' });
  assert.equal(await page.locator('.rchart-bar').count(), 12, 'o dia de hoje entra no gráfico');

  step('Lendo: Registrar a última página abre o Concluir; salvar volta à ficha já como Lido');
  await page.click('[data-action="update-page"]');
  await page.fill('#progress-input', '256');
  await page.press('#progress-input', 'Enter');
  await page.waitForSelector('#book-form');
  assert.match(page.url(), /#\/livro\/d2\/editar\?concluir=1$/);
  assert.equal(await text('.form-title'), 'Concluir leitura');
  await page.click('[data-action="set-rating"][data-value="4.5"]');
  await page.click('.form-top button[type="submit"]');
  await onDetail('d2');
  await toastHas(/Leitura concluída/);
  assert.equal(await text('.ficha-status'), 'Lido');
  assert.match(await text('.ficha-period'), /Lido em 12 dias · 5 out → 16 out 2026/);
  const done = bookIn(await readState(), 'd2');
  assert.equal(done.status, 'lido');
  assert.equal(done.endDate, '2026-10-16');

  step('Concluir pelo botão da ficha (Kindle sem total de páginas) e Cancelar');
  await page.goto(`${BASE}#/estante?aba=lendo`);
  await page.click('.book-row-link:has-text("Fora de Série")');
  await onDetail('k1');
  assert.equal(await text('.ficha-pct'), '45%');
  assert.equal(await text('.rchart-range'), '% por dia');
  await page.click('.ficha-card a:has-text("Concluir")');
  await page.waitForSelector('#book-form');
  assert.equal(await text('.form-title'), 'Concluir leitura');
  await page.click('.form-top >> text=Cancelar');
  await onDetail('k1');
  assert.equal(bookIn(await readState(), 'k1').status, 'lendo', 'cancelar não conclui');

  step('Ler agora: abre o cronômetro do livro');
  await page.click('.ficha-card [data-action="start-timer"]');
  await onPage('ler');
  await page.click('[data-action="timer-cancel"]');
  await onPage('inicio');

  step('Quero ler: Marcar como próxima e Começar a ler');
  await page.goto(`${BASE}#/estante?aba=quero`);
  await page.click('.book-row-link:has-text("Os Filhos de Duna")');
  await onDetail('w1');
  assert.equal(await text('.ficha-status'), 'Quero ler');
  assert.equal(await page.locator('.rchart').count(), 0, 'sem diário, sem gráfico');
  await page.click('.ficha-card [data-action="toggle-next"]');
  await waitState((s) => s.upNext.join() === 'w2,w1');
  assert.equal(await text('.ficha-card [data-action="toggle-next"]'), 'Próximas: 2º da fila');
  await page.click('.ficha-card [data-action="toggle-next"]');
  await waitState((s) => s.upNext.join() === 'w2');
  await page.click('.ficha-card [data-action="start-reading"]');
  await waitState((s) => bookIn(s, 'w1').status === 'lendo');
  await page.waitForSelector('[data-action="update-page"]');
  assert.equal(await text('.ficha-status'), 'Lendo');

  step('Abandonado: onde parou e por quê');
  await page.goto(`${BASE}#/livro/x1`);
  await onDetail('x1');
  assert.equal(await text('.ficha-status'), 'Abandonado');
  assert.equal(await text('.ficha-stop'), 'Parou na pág. 80 de 300 · 27%');
  assert.match(await page.innerText('.ficha-reason p'), /A primeira metade promete,\nmas a história se arrasta\./);

  step('excluir pela edição aberta da ficha volta para a lista (sem "Livro não encontrado")');
  await page.goto(`${BASE}#/estante?aba=quero`);
  await page.click('.book-row-link:has-text("Cem Anos")');
  await onDetail('w2');
  await page.click('.ficha-top a:has-text("Editar")');
  await page.click('[data-action="delete-book"]');
  await onPage('estante');
  await toastHas(/excluído/);
  await page.click('.toast button:has-text("Desfazer")');
  await waitState((s) => Boolean(bookIn(s, 'w2')));

  step('endereços antigos e livro inexistente');
  await page.goto(`${BASE}#/inicio`);
  await onPage('inicio');
  await page.goto(`${BASE}#/livro/k1?concluir=1`);
  await page.waitForSelector('#book-form');
  assert.equal(await text('.form-title'), 'Concluir leitura');
  await page.click('.form-top >> text=Cancelar');
  await onPage('inicio');
  await page.goto(`${BASE}#/livro/nao-existe`);
  await onPage('inicio');
  await toastHas(/Livro não encontrado/);

  step('todas as fichas e a aba Diário em 320, 390 e 430 px: sem sobra, alvos >= 44 px');
  await page.evaluate(() => document.getElementById('toast').classList.remove('show'));
  const problems = [];
  for (const width of [320, 390, 430]) {
    await page.setViewportSize({ width, height: 844 });
    for (const [id, label] of [['h1', 'lido'], ['d1', 'lido-serie'], ['k1', 'lendo-kindle'], ['w1', 'lendo'], ['w2', 'quero'], ['x1', 'abandonado'], ['o1', 'lido-sem-diario']]) {
      await page.goto(`${BASE}#/livro/${id}`);
      await onDetail(id);
      await page.waitForTimeout(150);
      problems.push(...await layoutProblems(`${label} @${width}`));
      await page.screenshot({ path: join(SHOTS, `ficha-${width}-${label}.png`), fullPage: true });
    }
    await page.goto(`${BASE}#/livro/w1`);
    await onDetail('w1');
    await page.click('[data-action="update-page"]');
    problems.push(...await layoutProblems(`registrando @${width}`));
    await page.screenshot({ path: join(SHOTS, `ficha-${width}-registrando.png`), fullPage: true });
    await page.goto(`${BASE}#/livro/h1/editar?aba=diario`);
    await page.waitForSelector('.diary-weeks');
    problems.push(...await layoutProblems(`diario @${width}`));
    await page.screenshot({ path: join(SHOTS, `ficha-${width}-diario.png`), fullPage: true });
  }
  await page.setViewportSize({ width: 390, height: 844 });
  if (problems.length) console.log(`\nPROBLEMAS (${problems.length}):\n${problems.map((p) => `  - ${p}`).join('\n')}`);
  assert.deepEqual(problems, []);
  assert.deepEqual(errors, []);
} catch (err) {
  await page.screenshot({ path: join(SHOTS, 'ficha-falha.png'), fullPage: true }).catch(() => {});
  console.error('\nFALHOU:', err.message);
  if (errors.length) console.error(errors.join('\n'));
  process.exitCode = 1;
}

// "Reduzir movimento" ligado: navegação normal, sem a transição da capa.
if (!process.exitCode) {
  try {
    step('Reduzir movimento: abre a ficha sem View Transition');
    const calm = await newContext({ reducedMotion: 'reduce' });
    const p2 = await calm.newPage();
    await p2.clock.setFixedTime(new Date('2026-10-16T12:00:00'));
    await p2.route(/^https:\/\//, (r) => r.abort());
    await p2.goto(BASE);
    await p2.waitForSelector('.hero');
    await p2.evaluate(async (d) => (await import('/js/db.js')).setItem('state', d), seedWith([null, null, null, null, null]));
    await p2.reload();
    await p2.waitForSelector('.grid-book');
    await p2.click('.grid-book >> nth=0');
    await p2.waitForSelector('.ficha-hero');
    assert.equal(await p2.evaluate(() => window.__vt), 0);
    await p2.click('.ficha-back');
    await p2.waitForSelector('.hero');
    assert.equal(await p2.evaluate(() => window.__vt), 0);
    await calm.close();
    console.log('\nTudo certo. Capturas em tests/e2e/screens/ficha-*.png');
  } catch (err) {
    console.error('\nFALHOU:', err.message);
    process.exitCode = 1;
  }
}
await browser.close();
server.close();
