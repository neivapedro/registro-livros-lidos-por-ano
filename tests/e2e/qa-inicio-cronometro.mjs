// Teste de ponta a ponta (QA) do Início/Estante v1.3 junto com o cronômetro:
// cartão "Lendo agora" com ritmo e "Ler agora" em telas de 320 a 430px, etiquetas com
// maiúsculas diferentes, excluir e desfazer um livro das próximas, sortear e começar,
// série "2,5" e backup completo (etiquetas, série, data alvo, próximas e minutos do diário).
// Uso: node tests/e2e/qa-inicio-cronometro.mjs   (precisa do Playwright)

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

const TODAY = '2026-10-16';
const TS = '2026-01-01T00:00:00.000Z';
const seed = {
  version: 2,
  goals: { 2026: 12 },
  defaultGoal: 12,
  customGenres: [],
  lastBackupAt: '2026-10-10T10:00:00.000Z',
  upNext: ['w1', 'w2'],
  pageGoals: {},
  books: [
    {
      id: 'r1', title: 'A Guerra dos Tronos: As Crônicas de Gelo e Fogo', authors: 'George R. R. Martin', status: 'lendo', format: 'fisico',
      pages: 600, currentPage: 120, startDate: '2026-10-01', targetDate: '2026-11-15', series: 'Gelo e Fogo', seriesNumber: 1,
      tags: ['Fantasia'], createdAt: TS, updatedAt: TS,
      journal: [
        { date: '2026-10-14', from: 64, to: 92, unit: 'page', note: '' },
        { date: '2026-10-15', from: 92, to: 120, unit: 'page', note: '', minutes: 40 },
      ],
    },
    // Cadastrado hoje já na pág. 200: sem ritmo (não leu 200 págs. hoje).
    { id: 'r2', title: 'Começado hoje', authors: 'X', status: 'lendo', format: 'fisico', pages: 400, currentPage: 200, startDate: TODAY, createdAt: TS, updatedAt: TS },
    { id: 'w1', title: 'Próximo livro', authors: 'Y', status: 'quero', format: 'fisico', genre: 'Ficção', tags: ['fantasia'], createdAt: '2026-09-01T00:00:00.000Z', updatedAt: TS },
    { id: 'w2', title: 'Segundo da fila', authors: 'Y', status: 'quero', format: 'kindle', genre: 'Gestão', createdAt: '2026-09-02T00:00:00.000Z', updatedAt: TS },
    { id: 'w3', title: 'Terceiro', authors: 'Y', status: 'quero', format: 'fisico', genre: 'Gestão', createdAt: '2026-09-03T00:00:00.000Z', updatedAt: TS },
    {
      id: 'l1', title: 'Lido com etiquetas', authors: 'Z', status: 'lido', format: 'fisico', pages: 200, startDate: '2026-02-01', endDate: '2026-02-20',
      tags: ['FANTASIA', 'Clássico'], series: 'Gelo e Fogo', seriesNumber: 0.5, createdAt: TS, updatedAt: TS,
    },
  ],
};

const browser = await playwright.chromium.launch();
const context = await browser.newContext({
  viewport: { width: 375, height: 812 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true, locale: 'pt-BR', acceptDownloads: true,
  reducedMotion: 'reduce',
});
const page = await context.newPage();
await page.clock.install({ time: new Date(`${TODAY}T09:00:00`) });

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
  throw new Error(`Estado salvo não chegou ao esperado: ${JSON.stringify(last)?.slice(0, 400)}`);
}
const errors = [];
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errors.push(`console: ${m.text()}`); });
page.on('dialog', (d) => d.accept());

const shot = (name, fullPage = true) => page.screenshot({ path: join(SHOTS, `qa-${name}.png`), fullPage });
const step = (msg) => console.log(`• ${msg}`);
const onPage = (name) => page.waitForFunction((n) => document.getElementById('app').dataset.page === n, name);
const book = (st, id) => st.books.find((b) => b.id === id);
const overflow = () => page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
const smallInputs = () => page.$$eval('input, select, textarea', (els) => els
  .filter((e) => e.type !== 'file' && e.type !== 'hidden' && parseFloat(getComputedStyle(e).fontSize) < 16)
  .map((e) => e.id || e.outerHTML.slice(0, 60)));

try {
  step('"Lendo agora": ritmo e "Ler agora" juntos, de 320 a 430px');
  await page.goto(BASE);
  await page.waitForSelector('.hero');
  await writeState(seed);
  await page.reload();
  await page.waitForSelector('.reading');
  const card = page.locator('.reading:has-text("Guerra dos Tronos")');
  assert.equal(await card.locator('.btn-timer').count(), 1);
  assert.equal(await card.locator('.pace-line').count(), 1);
  assert.match(await card.locator('.rn-progress').textContent(), /termina ~3 nov$/);
  assert.match(await card.locator('.pace-line').textContent(), /Para terminar até 15 nov: 16 págs\.\/dia/);
  assert.doesNotMatch(await page.locator('.reading:has-text("Começado hoje") .rn-progress').textContent(), /termina/, 'livro começado hoje não tem previsão');
  // O ritmo por dia fica na folha "Registrar leitura".
  await card.locator('[data-action="update-page"]').click();
  await page.waitForSelector('.sheet-layer.is-open .psheet');
  assert.match(await page.textContent('.psheet-head'), /Ritmo: 28 págs\.\/dia/);
  await page.keyboard.press('Escape');
  await page.waitForSelector('.psheet', { state: 'detached' });
  for (const width of [320, 375, 430]) {
    await page.setViewportSize({ width, height: 812 });
    assert.ok(await overflow() <= 0, `${width}px: rolagem horizontal`);
    const title = await card.locator('.serif-title').boundingBox();
    assert.ok(title.width >= 110, `${width}px: título espremido (${Math.round(title.width)}px)`);
    const timerBtn = await card.locator('.btn-timer').boundingBox();
    const pace = await card.locator('.pace-line').boundingBox();
    assert.ok(pace.y + pace.height <= timerBtn.y, `${width}px: botão sobre a linha da data-alvo`);
    // A barra de navegação fica fixa embaixo: some só para a captura do cartão.
    await card.screenshot({ path: join(SHOTS, `qa-cartao-${width}.png`), mask: [], style: '#nav { display: none !important; }' });
  }
  await page.setViewportSize({ width: 375, height: 812 });
  const home = await page.textContent('#app');
  assert.doesNotMatch(home, /atrasad|backup/i, 'sem cobrança nem aviso de backup no Início');

  step('etiquetas com maiúsculas diferentes aparecem uma vez só');
  await page.goto(`${BASE}#/buscar`);
  await page.waitForSelector('select[data-filter="tag"]');
  const options = await page.$$eval('select[data-filter="tag"] option', (o) => o.map((x) => x.value).filter(Boolean));
  assert.equal(options.filter((t) => t.toLowerCase() === 'fantasia').length, 1, `opções: ${options}`);
  await page.selectOption('select[data-filter="tag"]', options.find((t) => t.toLowerCase() === 'fantasia'));
  await page.waitForFunction(() => /3 livros encontrados/.test(document.getElementById('search-results').textContent));
  assert.deepEqual(await smallInputs(), []);
  await page.click('[data-action="clear-filters"]');
  await page.waitForFunction(() => /Todos os 6 livros/.test(document.getElementById('search-results').textContent));
  await page.goto(`${BASE}#/resumo/2026`);
  await page.waitForSelector('.tag-count');
  const tagCounts = await page.$$eval('.tag-count', (els) => els.map((e) => e.textContent.trim()));
  assert.equal(tagCounts.filter((t) => /fantasia/i.test(t)).length, 1, `resumo: ${tagCounts}`);
  await page.goto(`${BASE}#/livro/w3`);
  await page.waitForSelector('#f-tag');
  const used = await page.$$eval('[data-action="add-tag"]', (els) => els.map((e) => e.dataset.value));
  assert.equal(used.filter((t) => t.toLowerCase() === 'fantasia').length, 1, `usadas antes: ${used}`);

  step('série "2,5" com vírgula');
  await page.fill('#f-series', 'gelo e fogo ');
  await page.fill('#f-series-n', '2,5');
  await page.click('.form .btn-primary[type="submit"]');
  await onPage('resumo');
  let st = await waitState((s) => book(s, 'w3').seriesNumber === 2.5);
  assert.equal(book(st, 'w3').series, 'gelo e fogo');
  await page.goto(`${BASE}#/livro/l1`);
  await page.waitForSelector('.series-info');
  assert.match(await page.textContent('.series-info'), /Próximo da série: nº 1 — A Guerra dos Tronos/);
  await page.goto(`${BASE}#/livro/r1`);
  await page.waitForSelector('.series-info');
  assert.match(await page.textContent('.series-info'), /Próximo da série: nº 2,5 — Terceiro/);
  assert.match(await page.textContent('.series-info'), /Você leu 1 de 3/);

  step('excluir um livro das próximas e desfazer: volta ao mesmo lugar da fila');
  await page.goto(`${BASE}#/estante?aba=quero`);
  await page.waitForSelector('.next-pos');
  await page.goto(`${BASE}#/livro/w1`);
  await page.waitForSelector('[data-action="delete-book"]');
  await page.click('[data-action="delete-book"]');
  await waitState((s) => !book(s, 'w1') && s.upNext.join() === 'w2');
  await page.click('.toast button:has-text("Desfazer")');
  st = await waitState((s) => Boolean(book(s, 'w1')));
  assert.deepEqual(st.upNext, ['w1', 'w2']);

  step('sortear com filtro e começar a ler');
  await page.goto(`${BASE}#/estante?aba=quero`);
  await page.waitForSelector('[data-action="draw-open"]');
  await page.click('[data-action="draw-open"]');
  await page.selectOption('select[data-draw="format"]', 'kindle');
  await page.waitForSelector('.draw-result:has-text("Segundo da fila")');
  assert.deepEqual(await smallInputs(), []);
  assert.ok(await overflow() <= 0);
  await shot('sorteio');
  await page.click('[data-action="draw-start"]');
  st = await waitState((s) => book(s, 'w2').status === 'lendo');
  assert.deepEqual(st.upNext, ['w1']);
  assert.equal(book(st, 'w2').startDate, TODAY);
  await page.goto(`${BASE}#/inicio`);
  await page.waitForSelector('.reading:has-text("Segundo da fila") .btn-timer');
  assert.equal(await page.locator('.reading:has-text("Segundo da fila") .pace-line').count(), 0);

  step('cronômetro: 25 min de leitura somam aos minutos do dia');
  await page.click('.reading:has-text("Guerra dos Tronos") .btn-timer');
  await onPage('ler');
  await page.clock.fastForward('25:00');
  await page.click('[data-action="timer-stop"]');
  await page.fill('#timer-input', '150');
  await page.click('.timer-stop button[type="submit"]');
  await onPage('inicio');
  st = await waitState((s) => book(s, 'r1').journal.some((e) => e.date === TODAY && e.minutes === 25));
  assert.deepEqual(book(st, 'r1').journal.at(-1), { date: TODAY, from: 120, to: 150, unit: 'page', note: '', minutes: 25 });
  await page.click('.reading:has-text("Guerra dos Tronos") [data-action="update-page"]');
  assert.match(await page.textContent('.sheet-layer.is-open .psheet-head'), /Ritmo: 29 págs\.\/dia/);
  await page.keyboard.press('Escape');
  await page.waitForSelector('.psheet', { state: 'detached' });

  step('backup → apagar → importar: nada se perde');
  // Sessão aberta antes de apagar: não pode voltar depois de importar.
  await page.click('.reading:has-text("Segundo da fila") .btn-timer');
  await onPage('ler');
  await page.goto(`${BASE}#/ajustes`);
  await page.waitForSelector('.storage-info');
  const before = await readState();
  const download = page.waitForEvent('download');
  await page.click('[data-action="export-backup"]');
  const backupPath = join(SHOTS, 'qa-backup.json');
  await (await download).saveAs(backupPath);
  const backup = JSON.parse(readFileSync(backupPath, 'utf8'));
  assert.equal(JSON.stringify(backup).includes('googleBooksKey'), false);
  const csvDownload = page.waitForEvent('download');
  await page.click('[data-action="export-csv"]');
  const csvPath = join(SHOTS, 'qa-planilha.csv');
  await (await csvDownload).saveAs(csvPath);
  const csv = readFileSync(csvPath, 'utf8');
  assert.ok(csv.startsWith('﻿Título;'), 'planilha com BOM');
  assert.match(csv, /\r\nTerceiro;Y;Quero ler;Físico;Gestão;;gelo e fogo;2,5;/);
  await page.click('[data-action="wipe-data"]');
  await page.waitForSelector('.hero');
  await waitState((s) => s.books.length === 0);
  assert.equal(await page.evaluate(() => localStorage.getItem('leituras:sessao')), null, 'apagar tudo encerra a sessão');
  await page.goto(`${BASE}#/ajustes`);
  await page.waitForSelector('.storage-info');
  await page.setInputFiles('[data-import]', backupPath);
  const after = await waitState((s) => s.books.length === before.books.length);
  for (const b of before.books) {
    const a = book(after, b.id);
    for (const key of ['tags', 'series', 'seriesNumber', 'targetDate', 'journal', 'status', 'currentPage']) {
      assert.deepEqual(a[key], b[key], `${b.id}.${key} mudou no backup`);
    }
  }
  assert.deepEqual(after.upNext, before.upNext);
  assert.equal(book(after, 'r1').targetDate, '2026-11-15');
  await page.goto(`${BASE}#/inicio`);
  await page.waitForSelector('.reading');
  assert.equal(await page.locator('.timer-banner').count(), 0, 'sessão antiga não volta com o backup');
  await shot('inicio-depois-do-backup');

  if (errors.length) throw new Error(errors.join('\n'));
  console.log('\nTudo certo. Capturas em tests/e2e/screens/qa-*.png');
} catch (err) {
  await shot('erro').catch(() => {});
  console.error(`\nFALHOU: ${err.message}`);
  if (errors.length) console.error(errors.join('\n'));
  process.exitCode = 1;
} finally {
  await browser.close();
  server.close();
}
