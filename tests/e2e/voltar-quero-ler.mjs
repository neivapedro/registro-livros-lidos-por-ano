// Teste de ponta a ponta de "Voltar para Quero ler": tira um livro de Lendo sem marcar como
// abandonado. Pela ficha e pelo menu rápido do Início; Desfazer devolve página, início e diário;
// "Começar a ler" depois recomeça do zero; o cronômetro aberto do livro não sobra.
// Capturas em tests/e2e/screens/voltar-quero-ler-*.png (claro e escuro, 390 px).
// Uso: node tests/e2e/voltar-quero-ler.mjs   (precisa do Playwright, como o smoke.mjs)

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

// ---------- Dados ----------

const TS = '2026-01-01T00:00:00.000Z';
const base = { authors: 'Autor', format: 'fisico', genre: 'Ficção', tags: [], quotes: [], journal: [], createdAt: TS, updatedAt: TS, favorite: false, notes: '', isbn: '' };
const r1Journal = [
  { date: '2026-10-13', from: 36, to: 64, unit: 'page', note: 'No metrô.', minutes: 30 },
  { date: '2026-10-14', from: 64, to: 92, unit: 'page', note: '' },
  { date: '2026-10-15', from: 92, to: 120, unit: 'page', note: '' },
];
const seed = {
  version: 2, goals: { 2026: 12 }, defaultGoal: 12, customGenres: [], lastBackupAt: '2026-10-10T10:00:00.000Z', pageGoals: {},
  upNext: ['w1'],
  books: [
    { ...base, id: 'r1', title: 'Fora de Série', authors: 'Malcolm Gladwell', status: 'lendo', pages: 300, currentPage: 120,
      startDate: '2026-10-01', targetDate: '2026-11-15', journal: r1Journal, tags: ['clube'], notes: 'Capítulo 3 é o melhor.',
      quotes: [{ id: 'q1', text: 'Dez mil horas.', page: 40, percent: null, note: '', createdAt: '2026-10-13T10:00:00.000Z' }] },
    { ...base, id: 'r2', title: 'Livro no Kindle', authors: 'Alguém', status: 'lendo', format: 'kindle', currentPercent: 40, startDate: '2026-10-05',
      journal: [{ date: '2026-10-15', from: 28, to: 40, unit: 'percent', note: '' }] },
    { ...base, id: 'w1', title: 'O Gerente Minuto', status: 'quero', pages: 120 },
    { ...base, id: 'a1', title: 'Duna', status: 'lido', pages: 680, startDate: '2026-03-01', endDate: '2026-04-20', rating: 5 },
  ],
};

// ---------- Navegador ----------

const browser = await playwright.chromium.launch();
const options = { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, locale: 'pt-BR', reducedMotion: 'reduce' };
const context = await browser.newContext(options);
const page = await context.newPage();
await page.clock.setFixedTime(new Date('2026-10-16T12:00:00'));
await page.route(/^https:\/\//, (r) => r.abort());

const errors = [];
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errors.push(`console: ${m.text()}`); });
page.on('dialog', (d) => d.accept());

const readState = () => page.evaluate(async () => (await import('/js/db.js')).getItem('state'));
const writeState = (data) => page.evaluate(async (d) => (await import('/js/db.js')).setItem('state', d), data);
async function waitState(predicate) {
  let last;
  for (let i = 0; i < 50; i += 1) {
    last = await readState();
    if (last && predicate(last)) return last;
    await page.waitForTimeout(100);
  }
  throw new Error(`Estado salvo não chegou ao esperado: ${JSON.stringify(last)?.slice(0, 300)}`);
}
const book = (s, id) => s.books.find((b) => b.id === id);
const step = (msg) => console.log(`• ${msg}`);
const onPage = (name) => page.waitForFunction((n) => document.getElementById('app').dataset.page === n, name);
const onDetail = (id) => page.waitForFunction((i) => location.hash === `#/livro/${i}` && document.querySelector(`.ficha-hero[data-id="${i}"]`), id);
const toastHas = (re) => page.waitForFunction((src) => new RegExp(src).test(document.getElementById('toast').textContent), re.source);
const openSheet = '.sheet-layer.is-open';
const sheetGone = () => page.waitForSelector('.sheet-layer', { state: 'detached', timeout: 5000 });
const savedSession = () => page.evaluate(() => localStorage.getItem('leituras:sessao'));
const pauseBtn = '.ficha-card [data-action="pause-reading"]';

async function touch(selector, holdMs) {
  await page.evaluate(async ([sel, hold]) => {
    const el = document.querySelector(sel);
    const r = el.getBoundingClientRect();
    const x = r.left + r.width / 2;
    const y = r.top + r.height / 2;
    const fire = (type) => el.dispatchEvent(new PointerEvent(type, {
      bubbles: true, cancelable: true, composed: true, pointerType: 'touch', isPrimary: true, button: 0, clientX: x, clientY: y, pointerId: 7,
    }));
    fire('pointerdown');
    await new Promise((res) => setTimeout(res, hold));
    fire('pointerup');
    el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, clientX: x, clientY: y }));
  }, [selector, holdMs]);
}

async function shotsOfFicha(id, name) {
  for (const scheme of ['light', 'dark']) {
    await page.emulateMedia({ colorScheme: scheme });
    await page.waitForFunction((s) => document.documentElement.dataset.theme === s, scheme);
    await page.waitForTimeout(250);
    await page.locator(pauseBtn).scrollIntoViewIfNeeded();
    await page.screenshot({ path: join(SHOTS, `voltar-quero-ler-${name}-${scheme === 'light' ? 'claro' : 'escuro'}.png`) });
  }
  await page.emulateMedia({ colorScheme: 'light' });
}

async function layoutOk(label) {
  const problems = await page.evaluate(() => {
    const out = [];
    const over = document.documentElement.scrollWidth - window.innerWidth;
    if (over > 0) out.push(`${over}px sobrando à direita`);
    const btn = document.querySelector('.ficha-card [data-action="pause-reading"]');
    if (btn) {
      const r = btn.getBoundingClientRect();
      if (r.height < 44) out.push(`botão com ${Math.round(r.height)}px de altura`);
      const card = btn.closest('.ficha-card').getBoundingClientRect();
      if (r.left < card.left || r.right > card.right + 0.5) out.push('botão fora do cartão');
      if (btn.scrollWidth > btn.clientWidth + 1) out.push('texto do botão cortado');
    }
    return out;
  });
  assert.deepEqual(problems, [], label);
}

try {
  step('dados de exemplo');
  await page.goto(BASE);
  await page.waitForSelector('.hero');
  await writeState(seed);
  await page.reload();
  await page.waitForSelector('.reading[data-id="r1"]');

  step('ficha de um livro em leitura: botão discreto "Voltar para Quero ler"');
  await page.goto(`${BASE}#/livro/r1`);
  await onDetail('r1');
  assert.match(await page.textContent(pauseBtn), /Voltar para Quero ler/);
  for (const width of [320, 390, 430]) {
    await page.setViewportSize({ width, height: 844 });
    await page.waitForTimeout(100);
    await layoutOk(`${width}px`);
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await shotsOfFicha('r1', 'ficha');

  step('cronômetro aberto deste livro');
  await page.click('.ficha-card [data-action="start-timer"]');
  await page.waitForFunction(() => location.hash === '#/ler/r1');
  assert.ok(await savedSession(), 'sessão gravada');
  await page.goto(`${BASE}#/livro/r1`);
  await onDetail('r1');

  step('ficha → Voltar para Quero ler');
  await page.click(pauseBtn);
  await toastHas(/"Fora de Série" voltou para Quero ler\./);
  let s = await waitState((st) => book(st, 'r1').status === 'quero');
  assert.equal(book(s, 'r1').startDate, null);
  assert.equal(book(s, 'r1').currentPage, null);
  assert.equal(book(s, 'r1').targetDate, null);
  assert.deepEqual(book(s, 'r1').journal, []);
  assert.equal(book(s, 'r1').quotes.length, 1, 'trechos ficam');
  assert.deepEqual(book(s, 'r1').tags, ['clube'], 'etiquetas ficam');
  assert.equal(book(s, 'r1').notes, 'Capítulo 3 é o melhor.', 'anotações ficam');
  assert.equal(await savedSession(), null, 'a sessão do cronômetro acaba junto');
  await page.waitForSelector('.ficha-card [data-action="start-reading"]');
  assert.match(await page.textContent('.ficha-card [data-action="start-reading"]'), /Começar a ler/);
  assert.equal(await page.locator(pauseBtn).count(), 0);
  assert.equal(await page.locator('.ficha-card .ficha-progress').count(), 0, 'sem progresso na ficha');
  await page.waitForTimeout(300);
  await page.screenshot({ path: join(SHOTS, 'voltar-quero-ler-depois.png') });

  step('Desfazer devolve página, início, data alvo, diário e o cronômetro');
  await page.click('#toast [data-action="undo-pause"]');
  s = await waitState((st) => book(st, 'r1').status === 'lendo');
  assert.equal(book(s, 'r1').startDate, '2026-10-01');
  assert.equal(book(s, 'r1').currentPage, 120);
  assert.equal(book(s, 'r1').targetDate, '2026-11-15');
  assert.deepEqual(book(s, 'r1').journal, r1Journal);
  assert.ok(await savedSession(), 'a sessão volta com o Desfazer');
  await page.waitForSelector(pauseBtn);
  assert.equal(await page.locator('.ficha-card .btn-timer.is-running').count(), 1);
  await page.goto(`${BASE}#/inicio`);
  await onPage('inicio');
  assert.equal(await page.locator('.timer-banner').count(), 1, 'aviso do cronômetro de volta');

  step('Início → segurar o cartão → menu → Voltar para Quero ler');
  await touch('.reading[data-id="r1"] .rn-cover', 650);
  await page.waitForSelector(`${openSheet} .qm`);
  await page.click(`${openSheet} [data-action="pause-reading"]`);
  await sheetGone();
  await toastHas(/voltou para Quero ler/);
  s = await waitState((st) => book(st, 'r1').status === 'quero');
  assert.equal(await page.locator('.reading[data-id="r1"]').count(), 0, 'não aparece mais em Lendo');
  assert.equal(await page.locator('.reading[data-id="r2"]').count(), 1, 'o outro livro continua');
  assert.equal(await page.locator('.timer-banner').count(), 0, 'sem aviso de cronômetro');
  assert.equal(await savedSession(), null);
  assert.equal(await page.evaluate(() => document.getElementById('app').inert), false, 'tela livre depois do menu');

  step('Estante → Quero ler contém o livro; dá para marcar como próxima');
  await page.goto(`${BASE}#/estante?aba=quero`);
  await onPage('estante');
  await page.waitForSelector('.book-row[data-id="r1"]');
  await page.click('[data-action="quick-menu"][data-id="r1"]');
  await page.waitForSelector(`${openSheet} .qm`);
  assert.deepEqual((await page.locator(`${openSheet} .qm-item`).allTextContents()).map((t) => t.trim()),
    ['Abrir livro', 'Começar a ler', 'Marcar como próxima']);
  await page.click(`${openSheet} [data-action="toggle-next"]`);
  await waitState((st) => st.upNext.join() === 'w1,r1');
  await sheetGone();

  step('Começar a ler: do zero, sem % nem diário antigos, sem cronômetro de antes');
  await page.goto(`${BASE}#/livro/r1`);
  await onDetail('r1');
  await page.click('.ficha-card [data-action="start-reading"]');
  s = await waitState((st) => book(st, 'r1').status === 'lendo');
  assert.equal(book(s, 'r1').startDate, '2026-10-16');
  assert.equal(book(s, 'r1').currentPage, null);
  assert.deepEqual(book(s, 'r1').journal, []);
  assert.deepEqual(s.upNext, ['w1'], 'saiu de Próximas');
  await page.waitForSelector(pauseBtn);
  assert.equal(await page.locator('.ficha-card .ficha-progress').count(), 0, 'sem % antigo');
  assert.match(await page.textContent('.ficha-card'), /Registre a página em que você está/);
  assert.equal(await page.locator('.ficha-card .btn-timer.is-running').count(), 0, 'cronômetro não volta');
  assert.equal(await page.locator('.rchart:not(.is-empty)').count(), 0, 'sem ritmo antigo');
  await page.goto(`${BASE}#/inicio`);
  await onPage('inicio');
  assert.equal(await page.locator('.timer-banner').count(), 0);
  assert.doesNotMatch(await page.textContent('.reading[data-id="r1"]'), /40%|pág\. 120/);

  step('Desfazer depois de começar de novo não faz nada; toque duplo não quebra');
  await page.goto(`${BASE}#/livro/r1`);
  await onDetail('r1');
  await page.evaluate(() => {
    const b = document.querySelector('.ficha-card [data-action="pause-reading"]');
    b.click();
    b.click();
  });
  await toastHas(/voltou para Quero ler/);
  await waitState((st) => book(st, 'r1').status === 'quero');
  await page.click('.ficha-card [data-action="start-reading"]');
  await waitState((st) => book(st, 'r1').status === 'lendo' && st.books.find((b) => b.id === 'r1').startDate === '2026-10-16');
  // O toast agora é o "Boa leitura!": o Desfazer antigo não existe mais.
  assert.equal(await page.locator('#toast [data-action="undo-pause"]').count(), 0);

  assert.deepEqual(errors, []);
  console.log('\nTudo certo. Capturas em tests/e2e/screens/voltar-quero-ler-*.png');
} catch (err) {
  await page.screenshot({ path: join(SHOTS, 'voltar-quero-ler-falha.png'), fullPage: true }).catch(() => {});
  console.error('\nFALHOU:', err.message);
  if (errors.length) console.error(errors.join('\n'));
  process.exitCode = 1;
} finally {
  await browser.close();
  server.close();
}
