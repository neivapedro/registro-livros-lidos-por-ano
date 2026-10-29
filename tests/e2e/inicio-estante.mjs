// Teste de ponta a ponta da versão 1.3: ritmo e previsão, próximas leituras e sorteio,
// etiquetas, série, planilha (CSV) e chave do Google Books.
// Uso: node tests/e2e/inicio-estante.mjs   (precisa do Playwright, como o smoke.mjs)

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
const read = (id, title, endDate, extra = {}) => ({
  id, title, authors: 'Autor', status: 'lido', startDate: endDate.replace(/-\d\d$/, '-01'), endDate, pages: 300, format: 'fisico',
  rating: 4, createdAt: TS, updatedAt: TS, ...extra,
});
const want = (id, title, extra = {}) => ({ id, title, authors: `Autor ${title}`, status: 'quero', format: 'fisico', createdAt: `2026-09-0${id.slice(1)}T00:00:00.000Z`, updatedAt: TS, ...extra });
const seed = {
  version: 2,
  goals: { 2026: 12 },
  defaultGoal: 12,
  customGenres: [],
  lastBackupAt: '2026-10-10T10:00:00.000Z',
  upNext: [],
  pageGoals: {},
  books: [
    read('d1', 'Duna', '2026-03-20', { series: 'Duna', seriesNumber: 1, tags: ['clássico', 'ficção científica'], genre: 'Ficção', rating: 4.5 }),
    read('d2', 'O Messias de Duna', '2026-05-20', { series: 'Duna', seriesNumber: 2, tags: ['clássico'], genre: 'Ficção' }),
    want('w9', 'Os Filhos de Duna', { series: 'Duna', seriesNumber: 3, genre: 'Ficção', createdAt: '2026-09-09T00:00:00.000Z' }),
    read('s1', 'Sapiens; uma breve história', '2026-08-28', { tags: ['presente'], genre: 'História', notes: 'Muito bom.\nRelido "trechos".' }),
    {
      id: 'r1', title: 'Fora de Série', authors: 'Malcolm Gladwell', status: 'lendo', format: 'fisico', pages: 300, currentPage: 120,
      startDate: '2026-10-01', targetDate: '2026-11-15', createdAt: TS, updatedAt: TS,
      journal: [
        { date: '2026-10-13', from: 36, to: 64, unit: 'page', note: '' }, { date: '2026-10-14', from: 64, to: 92, unit: 'page', note: '' },
        { date: '2026-10-15', from: 92, to: 120, unit: 'page', note: '' },
      ],
    },
    {
      id: 'r2', title: 'Livro no Kindle', authors: 'Alguém', status: 'lendo', format: 'kindle', currentPercent: 40,
      startDate: '2026-10-05', createdAt: TS, updatedAt: TS,
      journal: [{ date: '2026-10-14', from: 22, to: 28, unit: 'percent', note: '' }, { date: '2026-10-15', from: 28, to: 34, unit: 'percent', note: '' }, { date: '2026-10-16', from: 34, to: 40, unit: 'percent', note: '' }],
    },
    want('w1', 'O Gerente Minuto', { genre: 'Gestão' }),
    want('w2', 'Pai Rico, Pai Pobre', { genre: 'Gestão' }),
    want('w3', 'Neuromancer', { genre: 'Ficção', format: 'kindle' }),
    want('w4', 'A Estrada', { genre: 'Ficção' }),
    want('w5', 'Torto Arado', { genre: 'Ficção' }),
    want('w6', 'Essencialismo', { genre: 'Gestão' }),
  ],
};

const browser = await playwright.chromium.launch();
const context = await browser.newContext({
  viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, locale: 'pt-BR', acceptDownloads: true,
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
const googleRequests = [];
await page.route('https://www.googleapis.com/**', (r) => {
  googleRequests.push(r.request().url());
  return r.fulfill({ json: { items: [] } });
});
await page.route('https://openlibrary.org/**', (r) => r.fulfill({ json: { docs: [] } }));
await page.route('https://brasilapi.com.br/**', (r) => r.fulfill({ status: 404, json: {} }));
await page.route('https://covers.openlibrary.org/**', (r) => r.abort());

const shot = (name) => page.screenshot({ path: join(SHOTS, `inicio-estante-${name}.png`), fullPage: true });
const step = (msg) => console.log(`• ${msg}`);
const onPage = (name) => page.waitForFunction((n) => document.getElementById('app').dataset.page === n, name);
const toastHas = (re) => page.waitForFunction((src) => new RegExp(src).test(document.getElementById('toast').textContent), re.source);

// v1.4: gênero, série, etiquetas, data alvo, favorito e anotações ficam em "Mais detalhes".
async function openMore(p = page) {
  const toggle = p.locator('[data-action="toggle-more"]');
  if (await toggle.getAttribute('aria-expanded') === 'false') await toggle.click();
}

async function noOverflow(label) {
  for (const width of [430, 375, 320]) {
    await page.setViewportSize({ width, height: 844 });
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    assert.ok(overflow <= 0, `${label}: tela de ${width}px com ${overflow}px sobrando à direita`);
  }
  const small = await page.evaluate(() => [...document.querySelectorAll('input, select, textarea')]
    .filter((el) => parseFloat(getComputedStyle(el).fontSize) < 16).map((el) => el.outerHTML.slice(0, 60)));
  assert.deepEqual(small, [], `${label}: campos com letra < 16px fazem o iPhone dar zoom`);
  await page.setViewportSize({ width: 390, height: 844 });
}

/** Ações da fila ficam no menu rápido (botão "Mais ações"); deslizar a linha é só para o dedo. */
async function fromMenu(id, action) {
  await page.click(`[data-action="quick-menu"][data-id="${id}"]`);
  await page.click(`.sheet-layer.is-open [data-action="${action}"]`);
}

async function seedAndOpen(data, hash = '#/inicio') {
  await page.goto(`${BASE}${hash}`);
  await page.waitForSelector('#app[data-page]');
  await writeState(data);
  await page.reload();
  await page.waitForSelector('#app[data-page]');
}

try {
  step('ritmo e previsão no cartão "Lendo agora"');
  await seedAndOpen(seed);
  await page.waitForSelector('.hero');
  const physicalCard = page.locator('.reading:has-text("Fora de Série")');
  assert.equal(await physicalCard.locator('.rn-progress').textContent(), 'pág. 120 de 300 · termina ~23 out');
  assert.equal(await physicalCard.locator('.pace-line span').nth(0).textContent(), 'Para terminar até 15 nov: 6 págs./dia');
  const kindleCard = page.locator('.reading:has-text("Livro no Kindle")');
  assert.equal(await kindleCard.locator('.rn-progress').textContent(), '40% no Kindle · termina ~26 out');
  assert.equal(await kindleCard.locator('.pace-line').count(), 0, 'sem data-alvo, sem a linha');
  // O ritmo por dia aparece na folha "Registrar leitura".
  await physicalCard.locator('[data-action="update-page"]').click();
  await page.waitForSelector('.sheet-layer.is-open .psheet');
  assert.match(await page.textContent('.psheet-head'), /Ritmo: 28 págs\.\/dia/);
  await page.keyboard.press('Escape');
  await page.waitForSelector('.psheet', { state: 'detached' });
  assert.doesNotMatch(await page.textContent('#app'), /atrasad/i);
  assert.equal(await page.locator('.next-up').count(), 0, 'com leitura em andamento não sugere a próxima');
  await shot('01-inicio-ritmo');
  await noOverflow('Início');

  step('"Quero terminar até" no formulário');
  // Tocar no livro abre a ficha (v1.4); a data aparece no ritmo e se edita em "Editar".
  await physicalCard.locator('.reading-link').click();
  await page.waitForSelector('.ficha-hero');
  assert.match(await page.textContent('.ficha-pace'), /Para terminar até 15 nov: 6 págs\.\/dia/);
  await page.click('.ficha-top >> text=Editar');
  await page.waitForSelector('#f-target');
  assert.equal(await page.inputValue('#f-target'), '2026-11-15');
  await page.click('[data-action="clear-target-date"]');
  assert.equal(await page.inputValue('#f-target'), '');
  await page.fill('#f-target', '2026-10-25');
  await page.locator('#f-target').scrollIntoViewIfNeeded();
  await page.screenshot({ path: join(SHOTS, 'inicio-estante-02-form-data-alvo.png') });
  await page.click('.btn-primary:has-text("Salvar livro")');
  // Salvar volta para a ficha, já com a data nova; o Voltar da ficha leva ao Início.
  await page.waitForSelector('.ficha-hero');
  assert.match(await page.textContent('.ficha-pace'), /Para terminar até 25 out: 18 págs\.\/dia/);
  await page.click('.ficha-back');
  await onPage('inicio');
  assert.equal(await physicalCard.locator('.pace-line span').nth(0).textContent(), 'Para terminar até 25 out: 18 págs./dia');
  assert.equal((await waitState((s) => s.books.find((b) => b.id === 'r1').targetDate === '2026-10-25')).books.length, seed.books.length);
  // Data passada: fica neutro.
  const past = await readState();
  past.books.find((b) => b.id === 'r1').targetDate = '2026-10-10';
  await writeState(past);
  await page.reload();
  await page.waitForSelector('.pace-line');
  assert.equal(await physicalCard.locator('.pace-line span').nth(0).textContent(), 'Meta de data: 10 out');

  step('próximas leituras: marcar, ordenar e limite de 5');
  await page.goto(`${BASE}#/estante?aba=quero`);
  await page.waitForSelector('.book-row');
  await fromMenu('w1', 'toggle-next');
  await fromMenu('w2', 'toggle-next');
  await page.waitForSelector('.list-head:has-text("Próximas")');
  assert.match(await page.textContent('.list-head'), /Próximas\s*2 de 5/);
  assert.equal(await page.getAttribute('[data-action="move-next"][data-delta="-1"][data-id="w2"]', 'aria-label'), 'Subir Pai Rico, Pai Pobre na lista');
  assert.equal(await page.locator('[data-action="move-next"][data-delta="-1"][data-id="w1"]').isDisabled(), true, 'o primeiro não sobe');
  await page.click('[data-action="move-next"][data-delta="-1"][data-id="w2"]');
  assert.deepEqual((await waitState((s) => s.upNext[0] === 'w2')).upNext, ['w2', 'w1']);
  const order = await page.locator('.book-row:has(.next-pos) .book-row-title').allTextContents();
  assert.deepEqual(order, ['Pai Rico, Pai Pobre', 'O Gerente Minuto']);
  assert.equal(await page.evaluate(() => document.activeElement?.dataset.action), 'move-next', 'o foco continua nos botões de ordem');
  for (const id of ['w4', 'w5', 'w9']) await fromMenu(id, 'toggle-next');
  await waitState((s) => s.upNext.length === 5);
  await fromMenu('w6', 'toggle-next');
  await toastHas(/Limite de 5 próximas/);
  assert.equal((await readState()).upNext.length, 5);
  await fromMenu('w9', 'toggle-next');
  await waitState((s) => s.upNext.length === 4 && !s.upNext.includes('w9'));
  await shot('03-estante-proximas');
  await noOverflow('Estante (próximas)');

  step('sorteio com filtros');
  await page.click('[data-action="draw-open"]');
  await page.waitForSelector('.draw-panel .draw-result');
  await page.selectOption('[data-draw="format"]', 'kindle');
  await page.waitForFunction(() => /Neuromancer/.test(document.querySelector('.draw-result')?.textContent || ''));
  assert.equal(await page.locator('[data-action="draw-again"]').isDisabled(), true, 'só um livro Kindle na fila');
  await page.selectOption('[data-draw="format"]', '');
  await page.selectOption('[data-draw="genre"]', 'Gestão');
  const drawn = new Set();
  for (let i = 0; i < 6; i += 1) {
    drawn.add(await page.textContent('.draw-result .serif-title'));
    await page.click('[data-action="draw-again"]');
  }
  for (const title of drawn) assert.ok(['O Gerente Minuto', 'Pai Rico, Pai Pobre', 'Essencialismo'].includes(title), `sorteou fora do filtro: ${title}`);
  assert.ok(drawn.size >= 2, 'sortear de novo troca o livro');
  // Gêneros do filtro: só os que existem na fila.
  assert.deepEqual(await page.locator('[data-draw="genre"] option').allTextContents(), ['Gênero', 'Ficção', 'Gestão']);
  await page.selectOption('[data-draw="format"]', 'kindle');
  await page.waitForSelector('.draw-panel:has-text("Nenhum livro da fila")');
  await page.selectOption('[data-draw="genre"]', 'Ficção');
  await page.selectOption('[data-draw="format"]', 'kindle');
  await page.waitForFunction(() => /Neuromancer/.test(document.querySelector('.draw-result')?.textContent || ''));
  await shot('04-sorteio');
  await noOverflow('Sorteio');
  await page.click('[data-action="draw-start"]');
  const started = (await waitState((s) => s.books.find((b) => b.id === 'w3').status === 'lendo')).books.find((b) => b.id === 'w3');
  assert.equal(started.startDate, '2026-10-16');
  assert.equal(await page.locator('.draw-panel').count(), 0);

  step('Início sem leitura em andamento: próxima leitura');
  const idle = await readState();
  idle.books = idle.books.filter((b) => b.status !== 'lendo');
  await writeState(idle);
  await page.goto(`${BASE}#/inicio`);
  await page.reload();
  await page.waitForSelector('.next-up');
  assert.match(await page.textContent('.next-up'), /Pai Rico, Pai Pobre/);
  assert.match(await page.textContent('.next-up'), /Autor Pai Rico/);
  await shot('05-inicio-proxima');
  await noOverflow('Início (próxima)');
  await page.click('.next-up [data-action="start-reading"]');
  await page.waitForSelector('.reading:has-text("Pai Rico")');
  const afterStart = await waitState((s) => s.books.find((b) => b.id === 'w2').status === 'lendo');
  assert.ok(!afterStart.upNext.includes('w2'), 'quem começou sai das próximas');
  assert.equal(await page.locator('.next-up').count(), 0);

  step('etiquetas no formulário');
  await page.goto(`${BASE}#/livro/w9/editar`);
  await onPage('livro');
  assert.match(await page.textContent('.form'), /Usadas antes/);
  await page.locator('#f-tag').pressSequentially('presente,');
  await page.waitForSelector('.tag-chip:has-text("presente")');
  assert.equal(await page.evaluate(() => document.activeElement.id), 'f-tag', 'continua digitando');
  await page.fill('#f-tag', 'fantasia');
  await page.press('#f-tag', 'Enter');
  await page.waitForSelector('.tag-chip:has-text("fantasia")');
  assert.equal(await page.evaluate(() => document.getElementById('app').dataset.page), 'livro', 'Enter não salva o formulário');
  await page.click('[data-action="add-tag"][data-value="clássico"]');
  await page.waitForSelector('.tag-chip:has-text("clássico")');
  await page.click('[aria-label="Remover etiqueta fantasia"]');
  await page.waitForFunction(() => !/fantasia/.test(document.querySelector('.form .chips-wrap')?.textContent || ''));
  await page.fill('#f-tag', 'pendente');
  await page.locator('.tag-input').scrollIntoViewIfNeeded();
  await page.screenshot({ path: join(SHOTS, 'inicio-estante-06-form-etiquetas-serie.png') });
  await noOverflow('Formulário (etiquetas)');
  await page.click('.btn-primary:has-text("Salvar livro")');
  const tagged = (await waitState((s) => s.books.find((b) => b.id === 'w9').tags.length === 3)).books.find((b) => b.id === 'w9');
  assert.deepEqual(tagged.tags, ['presente', 'clássico', 'pendente'], 'texto não confirmado também é salvo');

  step('etiquetas e série nas listas e na busca');
  await page.goto(`${BASE}#/estante?aba=quero`);
  await page.waitForSelector('.book-row');
  const w9row = page.locator('.book-row:has-text("Os Filhos de Duna")');
  assert.equal(await w9row.locator('.li-extra').textContent(), 'Duna · nº 3 · presente · clássico · pendente');
  await page.click('[data-nav="buscar"]');
  await onPage('buscar');
  await page.selectOption('[data-filter="tag"]', 'clássico');
  await page.waitForFunction(() => document.querySelectorAll('#search-results .book-row').length === 3);
  assert.match(await page.textContent('#search-results'), /3 livros encontrados/);
  await shot('07-busca-etiqueta');
  await noOverflow('Buscar');
  await page.click('[data-action="clear-filters"]');

  step('resumo: etiquetas mais usadas');
  await page.goto(`${BASE}#/resumo/2026?aba=gostos`);
  await page.waitForSelector('.tag-count');
  const tagCard = page.locator('.card:has(h2:has-text("Etiquetas mais usadas"))');
  assert.deepEqual(await tagCard.locator('.tag-count-name').allTextContents(), ['clássico', 'ficção científica', 'presente']);
  assert.deepEqual(await tagCard.locator('.tag-count-n').allTextContents(), ['2', '1', '1']);
  await tagCard.scrollIntoViewIfNeeded();
  await page.screenshot({ path: join(SHOTS, 'inicio-estante-08-resumo-etiquetas.png') });
  await noOverflow('Resumo');

  step('série: próximo volume, resumo e agrupamento');
  await page.goto(`${BASE}#/livro/d1/editar`);
  await onPage('livro');
  assert.match(await page.textContent('.series-info'), /Próximo da série: nº 2 — O Messias de Duna/);
  assert.match(await page.textContent('.series-info'), /Você leu 2 de 3 cadastrados nesta série/);
  assert.equal(await page.inputValue('#f-series'), 'Duna');
  await page.locator('.series-info').scrollIntoViewIfNeeded();
  await page.screenshot({ path: join(SHOTS, 'inicio-estante-09-form-serie.png') });
  // O próximo volume abre a ficha dele, com o chip da série e o link para o seguinte.
  await page.click('.series-info a');
  await page.waitForURL(/#\/livro\/d2$/);
  await page.waitForFunction(() => document.querySelector('.ficha-title')?.textContent === 'O Messias de Duna');
  assert.match(await page.textContent('.ficha-series .ficha-chip'), /Duna · nº 2/);
  assert.match(await page.textContent('.ficha-next'), /Próximo: nº 3 · Os Filhos de Duna/);
  await page.click('.ficha-back');
  await page.goto(`${BASE}#/novo?status=lido`);
  await onPage('novo');
  assert.deepEqual(await page.locator('#series-names option').evaluateAll((els) => els.map((e) => e.value)), ['Duna']);
  await page.fill('#f-title', 'Duna: contos');
  await openMore();
  await page.fill('#f-series', 'Duna');
  await page.fill('#f-series-n', '2,5');
  await page.click('.btn-primary:has-text("Salvar livro")');
  const contos = (await waitState((s) => s.books.some((b) => b.title === 'Duna: contos'))).books.find((b) => b.title === 'Duna: contos');
  assert.equal(contos.seriesNumber, 2.5);
  await page.goto(`${BASE}#/estante?aba=lido`);
  await page.waitForSelector('[data-action="toggle-group-series"]');
  await page.click('[data-action="toggle-group-series"]');
  await page.waitForSelector('.year-head:has-text("Fora de séries")');
  const heads = await page.locator('.year-head').allTextContents();
  assert.match(heads[0], /^Duna\s+3 livros/);
  const duna = await page.locator('.year-head').first().evaluate((h) => {
    const out = [];
    for (const el of h.nextElementSibling.querySelectorAll('.book-row')) out.push(el.querySelector('.book-row-title').textContent);
    return out;
  });
  assert.deepEqual(duna, ['Duna', 'O Messias de Duna', 'Duna: contos'], 'em ordem de número na série');
  await shot('10-estante-series');
  await noOverflow('Estante (séries)');

  step('planilha CSV');
  await page.goto(`${BASE}#/ajustes`);
  await page.waitForSelector('[data-action="export-csv"]');
  const csvDownload = page.waitForEvent('download');
  await page.click('[data-action="export-csv"]');
  const csvFile = await csvDownload;
  assert.equal(csvFile.suggestedFilename(), 'leituras-planilha-2026-10-16.csv');
  const csvPath = join(SHOTS, 'inicio-estante-planilha.csv');
  await csvFile.saveAs(csvPath);
  const csv = readFileSync(csvPath, 'utf8');
  assert.ok(csv.startsWith('﻿'), 'BOM para o Excel reconhecer os acentos');
  const lines = csv.slice(1).split('\r\n');
  assert.equal(lines[0], 'Título;Autor(es);Status;Formato;Gênero;Etiquetas;Série;Nº;Páginas;Duração;Início;Término;Nota;Favorito;Releitura;Abandonado por;ISBN;Anotações');
  assert.ok(csv.includes('Duna;Autor;Lido;Físico;Ficção;clássico, ficção científica;Duna;1;300;01/03/2026;20/03/2026;4,5;;;;;'));
  assert.ok(csv.includes('"Sapiens; uma breve história";'));
  assert.ok(csv.includes('"Muito bom.\nRelido ""trechos""."'));
  assert.ok(csv.includes('Duna: contos;;Lido;Físico;;;Duna;2,5;'));

  step('chave do Google Books');
  assert.match(await page.textContent('.gkey-status'), /Sem chave — usando BrasilAPI e Open Library/);
  assert.equal(await page.getAttribute('#gb-key', 'type'), 'password');
  await page.fill('#gb-key', '  chave-estranha  ');
  await page.click('[data-action="save-gkey"]');
  await toastHas(/não parece uma chave do Google/);
  assert.match(await page.textContent('.gkey-status'), /Chave configurada/);
  assert.equal(await page.evaluate(() => localStorage.getItem('leituras:googleBooksKey')), 'chave-estranha');
  await page.click('[data-action="remove-gkey"]');
  await page.waitForFunction(() => /Sem chave/.test(document.querySelector('.gkey-status').textContent));
  assert.equal(await page.evaluate(() => localStorage.getItem('leituras:googleBooksKey')), null);
  const goodKey = `AIza${'B'.repeat(35)}`;
  await page.fill('#gb-key', goodKey);
  await page.press('#gb-key', 'Enter');
  await toastHas(/Chave salva\. A busca/);
  await shot('11-ajustes');
  await noOverflow('Ajustes');
  const backupDownload = page.waitForEvent('download');
  await page.click('[data-action="export-backup"]');
  const backupPath = join(SHOTS, 'inicio-estante-backup.json');
  await (await backupDownload).saveAs(backupPath);
  assert.ok(!readFileSync(backupPath, 'utf8').includes(goodKey), 'a chave não vai para o backup');
  await page.goto(`${BASE}#/novo`);
  await onPage('novo');
  await page.fill('#lookup', 'duna');
  await page.waitForSelector('.lookup-status:has-text("Não encontrei")');
  assert.ok(googleRequests.some((u) => new URL(u).searchParams.get('key') === goodKey), 'a busca usa a chave salva');

  assert.deepEqual(errors, []);
  console.log('\nTudo certo. Capturas em tests/e2e/screens/inicio-estante-*.png');
} catch (err) {
  await shot('falha').catch(() => {});
  console.error('\nFALHOU:', err.message);
  if (errors.length) console.error(errors.join('\n'));
  process.exitCode = 1;
} finally {
  await browser.close();
  server.close();
}
