// QA do formulário enxuto (v1.4): salvar sem mexer em "Mais detalhes" não perde nem muda
// nada do livro (todos os status, Kindle, releitura, capa, diário, trechos), troca de status,
// gênero (nulo, próprio, digitado sem OK), duplo toque em Salvar, foco e teclado na seção
// recolhida, alvos de toque e telas de 320 a 430px (capturas em tests/e2e/screens/qa-form-*).
// Uso: node tests/e2e/qa-formulario.mjs   (precisa do Playwright, como o smoke.mjs)

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
const COVER = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
const book = (id, title, extra = {}) => ({
  id, title, authors: 'Autora Um, Autor Dois', pages: 320, status: 'lido', startDate: '2026-09-01', endDate: '2026-09-20',
  format: 'fisico', genre: null, rating: null, favorite: false, notes: '', cover: null, isbn: '', currentPage: null,
  currentPercent: null, dropReason: '', reread: false, series: '', seriesNumber: null, tags: [], targetDate: null,
  quotes: [], journal: [], createdAt: TS, updatedAt: TS, ...extra,
});
const quotes = [{ id: 'q1', text: 'Uma frase.', page: 12, percent: null, note: 'nota', createdAt: TS }];
const journalPages = [{ date: '2026-10-01', from: 0, to: 40, unit: 'page', note: '' }, { date: '2026-10-02', from: 40, to: 80, unit: 'page', note: 'bom', minutes: 30 }];
const journalPct = [{ date: '2026-10-01', from: 0, to: 25, unit: 'percent', note: '' }];
const seed = {
  version: 2, goals: { 2026: 12 }, defaultGoal: 12, customGenres: ['Distopia'], lastBackupAt: '2026-10-10T10:00:00.000Z',
  upNext: ['quero-full'], pageGoals: {},
  books: [
    book('lido-full', 'Lido Completo', {
      genre: 'Ficção', rating: 4.5, favorite: true, notes: 'Anotações longas.', cover: COVER, isbn: '9788535914849',
      series: 'Saga', seriesNumber: 2.5, tags: ['clássico', 'nacional'], quotes, journal: journalPages,
    }),
    book('lido-bare', 'Lido Sem Nada', { rating: 3 }),
    book('lido-custom', 'Gênero Próprio', { genre: 'Ensaio Raro', rating: null }),
    book('lido-reread', 'Relido', { reread: true, genre: 'História', rating: 5 }),
    book('lendo-pg', 'Lendo Página', { status: 'lendo', endDate: null, currentPage: 80, targetDate: '2026-11-30', tags: ['clube'], journal: journalPages, quotes }),
    book('lendo-kindle', 'Lendo Kindle', { status: 'lendo', endDate: null, format: 'kindle', currentPercent: 25, journal: journalPct, genre: 'Distopia' }),
    book('quero-full', 'Quero Completo', { status: 'quero', startDate: null, endDate: null, series: 'Saga', seriesNumber: 3, notes: 'Indicação.', tags: ['presente'] }),
    book('aband', 'Abandonado', { status: 'abandonado', endDate: '2026-10-05', currentPage: 50, dropReason: 'Não prendeu.', notes: 'obs', genre: 'Gestão' }),
    book('aband-kindle', 'Abandonado Kindle', { status: 'abandonado', format: 'kindle', endDate: '2026-10-05', currentPercent: 10 }),
    book('fav-other', 'Outro Favorito', { favorite: false, rating: 4, endDate: '2026-08-01', startDate: '2026-07-01' }),
  ],
};

const browser = await playwright.chromium.launch();
const context = await browser.newContext({
  viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, locale: 'pt-BR',
});
const page = await context.newPage();
await page.clock.setFixedTime(new Date('2026-10-16T12:00:00'));

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
/** Estado depois de a gravação terminar (o relógio é fixo: updatedAt não muda entre salvamentos). */
async function settled() {
  await page.waitForTimeout(400);
  return readState();
}
const bookIn = (s, id) => s.books.find((b) => b.id === id);
const errors = [];
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errors.push(`console: ${m.text()}`); });
page.on('dialog', (d) => d.accept());
await page.route('https://**', (r) => r.abort());

const step = (msg) => console.log(`• ${msg}`);
const onPage = (name) => page.waitForFunction((n) => document.getElementById('app').dataset.page === n, name);
const isOpen = () => page.getAttribute('[data-action="toggle-more"]', 'aria-expanded').then((v) => v === 'true');
const saveBtn = '.form-actions .btn-primary';
const strip = (b) => ({ ...b, updatedAt: null });

async function seedAndOpen(hash) {
  await page.goto(`${BASE}#/inicio`);
  await page.waitForSelector('#app[data-page]');
  await writeState(seed);
  await page.goto(`${BASE}${hash}`);
  await page.reload();
  await page.waitForSelector('#app[data-page]');
}

async function openBook(id, query = '') {
  await page.goto(`${BASE}#/inicio`);
  await onPage('inicio');
  await page.goto(`${BASE}#/livro/${id}${query}`);
  await onPage('livro');
}

/** Capturas da tela (só a parte visível, como no celular) rolando de cima a baixo. */
async function shots(name, widths = [320, 390, 430]) {
  for (const width of widths) {
    await page.setViewportSize({ width, height: 844 });
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    assert.ok(overflow <= 0, `${name}: ${width}px com ${overflow}px sobrando à direita`);
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({ path: join(SHOTS, `qa-form-${name}-${width}-a.png`) });
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
    await page.screenshot({ path: join(SHOTS, `qa-form-${name}-${width}-b.png`) });
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.evaluate(() => window.scrollTo(0, 0));
}

/** Alvos de toque visíveis do formulário com pelo menos 44px (as meias estrelas são metade de 48px, de propósito). */
async function tapTargets(label) {
  const small = await page.evaluate(() => [...document.querySelectorAll('#book-form button, #book-form select, #book-form .file-btn, #book-form a, .form-top .btn-text')]
    // Link dentro de uma frase (próximo da série) é exceção aceita para alvo de toque.
    .filter((el) => el.offsetParent && !el.classList.contains('star-hit') && !(el.tagName === 'A' && el.closest('p')))
    .filter((el) => getComputedStyle(el).visibility === 'visible')
    .map((el) => ({ el, r: el.getBoundingClientRect() }))
    .filter(({ r }) => r.height < 44 || r.width < 44)
    .map(({ el, r }) => `${el.outerHTML.slice(0, 80)} ${Math.round(r.width)}×${Math.round(r.height)}`));
  assert.deepEqual(small, [], `${label}: alvos de toque pequenos`);
}

let passed = 0;
async function scenario(name, fn) {
  step(name);
  await fn();
  passed += 1;
}

try {
  await seedAndOpen('#/inicio');
  const before = await readState();

  await scenario('salvar sem mexer não muda nada (cada livro, botão de baixo e do topo)', async () => {
    for (const [i, b] of before.books.entries()) {
      await openBook(b.id);
      if (b.id === 'lendo-pg' || b.id === 'aband') {
        assert.equal(await isOpen(), true, `${b.id}: detalhes preenchidos abrem a seção`);
      }
      await page.click(i % 2 ? saveBtn : '.form-top button[type="submit"]');
      await onPage('inicio');
      const after = await waitState((s) => bookIn(s, b.id).updatedAt !== b.updatedAt);
      assert.deepEqual(strip(bookIn(after, b.id)), strip(b), `${b.id} mudou ao salvar sem mexer`);
    }
    const after = await readState();
    assert.deepEqual(after.customGenres, before.customGenres.concat('Ensaio Raro').filter((g, i, a) => a.indexOf(g) === i));
    assert.deepEqual(after.upNext, before.upNext);
    assert.equal(bookIn(after, 'lido-full').favorite, true);
  });

  await scenario('lido → lendo → lido no rascunho: nota, favorito e detalhes voltam intactos', async () => {
    await openBook('lido-full');
    await page.click('[data-action="set-status"][data-value="lendo"]');
    await page.click('[data-action="set-status"][data-value="quero"]');
    await page.click('[data-action="set-status"][data-value="abandonado"]');
    await page.click('[data-action="set-status"][data-value="lido"]');
    assert.equal(await page.getAttribute('[data-action="set-rating"][data-value="4.5"]', 'aria-pressed'), 'true');
    assert.equal(await page.getAttribute('[data-action="toggle-fav"]', 'aria-pressed'), 'true');
    const stored = bookIn(await readState(), 'lido-full');
    await page.click(saveBtn);
    await onPage('inicio');
    const after = bookIn(await settled(), 'lido-full');
    assert.deepEqual(strip(after), strip(stored));
  });

  await scenario('lido → lendo salvo: nota e favorito saem, gênero/série/etiquetas/anotações ficam', async () => {
    await openBook('lido-full');
    await page.click('[data-action="set-status"][data-value="lendo"]');
    await page.click(saveBtn);
    await onPage('inicio');
    const after = bookIn(await waitState((s) => bookIn(s, 'lido-full').status === 'lendo'), 'lido-full');
    assert.equal(after.rating, null);
    assert.equal(after.favorite, false);
    assert.equal(after.endDate, null);
    assert.equal(after.genre, 'Ficção');
    assert.equal(after.series, 'Saga');
    assert.equal(after.seriesNumber, 2.5);
    assert.deepEqual(after.tags, ['clássico', 'nacional']);
    assert.equal(after.notes, 'Anotações longas.');
    assert.equal(after.cover, COVER);
    assert.equal(after.quotes.length, 1);
  });

  await scenario('favorito: marcar outro do mesmo ano desmarca o anterior', async () => {
    await writeState(seed);
    await page.reload();
    await openBook('fav-other');
    await page.click('[data-action="toggle-more"]');
    await page.click('[data-action="toggle-fav"]');
    await page.click(saveBtn);
    await onPage('inicio');
    const s = await waitState((st) => bookIn(st, 'fav-other').favorite);
    assert.equal(bookIn(s, 'lido-full').favorite, false);
  });

  await scenario('gênero: "Sem gênero" grava null; gênero próprio aparece selecionado', async () => {
    await openBook('lido-custom');
    assert.equal(await isOpen(), true);
    assert.equal(await page.inputValue('#f-genre'), 'Ensaio Raro');
    await page.selectOption('#f-genre', { label: 'Sem gênero' });
    await page.click(saveBtn);
    await onPage('inicio');
    const s = await waitState((st) => bookIn(st, 'lido-custom').genre === null);
    assert.equal(bookIn(s, 'lido-custom').genre, null);
  });

  await scenario('gênero novo digitado sem tocar em OK também é salvo', async () => {
    await openBook('lido-bare');
    await page.click('[data-action="toggle-more"]');
    await page.selectOption('#f-genre', { label: '+ Novo gênero…' });
    await page.waitForSelector('#new-genre');
    await page.fill('#new-genre', 'Poesia');
    await page.click(saveBtn);
    await onPage('inicio');
    const s = await waitState((st) => bookIn(st, 'lido-bare').genre === 'Poesia');
    assert.ok(s.customGenres.includes('Poesia'));
    // E fica disponível no seletor dos outros livros.
    await openBook('lido-reread');
    const options = await page.$$eval('#f-genre option', (els) => els.map((e) => e.textContent));
    assert.ok(options.includes('Poesia'));
  });

  await scenario('"Cancelar" do novo gênero volta ao gênero de antes', async () => {
    await openBook('aband');
    await page.selectOption('#f-genre', { label: '+ Novo gênero…' });
    await page.fill('#new-genre', 'Descartado');
    await page.click('[data-action="close-genre"]');
    assert.equal(await page.locator('#new-genre').count(), 0);
    assert.equal(await page.inputValue('#f-genre'), 'Gestão');
    await page.click(saveBtn);
    await onPage('inicio');
    const s = await settled();
    assert.equal(bookIn(s, 'aband').genre, 'Gestão');
  });

  await scenario('etiqueta digitada (sem Enter) com a seção fechada entra no livro ao salvar', async () => {
    await openBook('lido-reread');
    assert.equal(await isOpen(), true, 'com gênero, a seção já abre');
    await page.fill('#f-tag', 'pendente');
    await page.click('[data-action="toggle-more"]');
    assert.equal(await isOpen(), false);
    await page.click(saveBtn);
    await onPage('inicio');
    const s = await waitState((st) => (bookIn(st, 'lido-reread').tags || []).length === 1);
    assert.deepEqual(bookIn(s, 'lido-reread').tags, ['pendente']);
  });

  await scenario('duplo toque em Salvar num livro novo grava um livro só', async () => {
    const count = (await readState()).books.length;
    await page.goto(`${BASE}#/novo?status=quero`);
    await onPage('novo');
    await page.fill('#f-title', 'Toque Duplo');
    await page.evaluate(() => {
      const b = document.querySelector('.form-actions .btn-primary');
      b.click();
      b.click();
    });
    await onPage('inicio');
    await page.waitForTimeout(300);
    const s = await readState();
    assert.equal(s.books.filter((b) => b.title === 'Toque Duplo').length, 1);
    assert.equal(s.books.length, count + 1);
  });

  await scenario('erro corrigido não fica na tela depois de redesenhar', async () => {
    await page.goto(`${BASE}#/novo?status=lendo`);
    await onPage('novo');
    await page.click(saveBtn);
    await page.waitForSelector('.form-errors');
    assert.match(await page.textContent('.form-errors'), /título/);
    await page.fill('#f-title', 'Agora Tem Título');
    await page.click('[data-action="set-format"][data-value="kindle"]');
    assert.equal(await page.locator('.form-errors').count(), 0, 'mensagem antiga sumiu');
    // Erro que continua (porcentagem > 100) segue à mostra.
    await page.fill('#f-current', '150');
    await page.click(saveBtn);
    await page.waitForSelector('.form-errors');
    await page.click('[data-action="set-format"][data-value="kindle"]');
    assert.match(await page.textContent('.form-errors'), /porcentagem/);
    await page.fill('#f-current', '15');
    await page.click(saveBtn);
    await onPage('inicio');
    await waitState((s) => s.books.some((b) => b.title === 'Agora Tem Título' && b.currentPercent === 15));
  });

  await scenario('seção fechada: nada lá dentro recebe foco pelo teclado', async () => {
    await page.goto(`${BASE}#/novo`);
    await onPage('novo');
    assert.equal(await isOpen(), false);
    await page.focus('[data-action="toggle-more"]');
    await page.keyboard.press('Tab');
    const inside = await page.evaluate(() => Boolean(document.activeElement.closest('.more-body')));
    assert.equal(inside, false, 'Tab saiu do botão e não entrou nos campos escondidos');
    // Abrir pelo teclado: o foco continua no botão e o próximo Tab entra no gênero.
    await page.focus('[data-action="toggle-more"]');
    await page.keyboard.press('Enter');
    assert.equal(await isOpen(), true);
    assert.equal(await page.evaluate(() => document.activeElement.dataset.action), 'toggle-more');
    await page.keyboard.press('Tab');
    assert.equal(await page.evaluate(() => document.activeElement.id), 'f-genre');
  });

  await scenario('alvos de toque e telas: livro novo, cada status, concluir, detalhes abertos com etiquetas', async () => {
    await openBook('lendo-pg');
    assert.equal(await isOpen(), true);
    await tapTargets('lendo com etiqueta e data alvo');
    await shots('editar-lendo');
    await openBook('lido-full');
    await tapTargets('lido completo');
    await shots('editar-lido');
    await openBook('quero-full');
    await shots('editar-quero');
    await openBook('aband-kindle');
    await page.click('[data-action="toggle-more"]');
    await tapTargets('abandonado kindle');
    await shots('editar-abandonado');
    await openBook('lendo-kindle', '?concluir=1');
    await tapTargets('concluir');
    await page.screenshot({ path: join(SHOTS, 'qa-form-concluir-390.png') });
    await page.goto(`${BASE}#/novo`);
    await onPage('novo');
    await tapTargets('novo');
    await shots('novo');
    await page.goto(`${BASE}#/ajustes`);
    await page.waitForSelector('.set-group');
    await shots('ajustes');
  });

  assert.deepEqual(errors, [], 'sem erros no console');
  console.log(`\n${passed} cenários passaram. Capturas em tests/e2e/screens/qa-form-*.png`);
} catch (err) {
  await page.screenshot({ path: join(SHOTS, 'qa-form-falha.png'), fullPage: true }).catch(() => {});
  console.error('\nFALHOU:', err.message);
  if (errors.length) console.error(errors.join('\n'));
  process.exitCode = 1;
} finally {
  await browser.close();
  server.close();
}
