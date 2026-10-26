// Teste de ponta a ponta do formulário enxuto da versão 1.4: essencial primeiro,
// "Mais detalhes" recolhível (abre sozinho com valor ou erro lá dentro), seletor de gênero,
// barra de salvar fixa (e fora do caminho com o teclado aberto), Kindle %, "Concluir"
// e as ações discretas no fim. Capturas em 320, 390 e 430px em tests/e2e/screens/.
// Uso: node tests/e2e/formulario-v14.mjs   (precisa do Playwright, como o smoke.mjs)

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

const olFixture = {
  docs: [
    {
      key: '/works/OL1W', title: 'The Goal', author_name: ['Eliyahu M. Goldratt', 'Jeff Cox'], first_publish_year: 1984,
      editions: { docs: [{ key: '/books/OL1M', title: 'A Meta', language: ['por'], isbn: ['9788521315315'], number_of_pages_median: 384 }] },
    },
  ],
};

const TS = '2026-01-01T00:00:00.000Z';
const book = (id, title, extra = {}) => ({
  id, title, authors: 'Autor', pages: 300, status: 'lido', startDate: '2026-09-01', endDate: '2026-09-20', format: 'fisico',
  genre: null, rating: 4, favorite: false, notes: '', cover: null, isbn: '', currentPage: null, currentPercent: null,
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
    book('plain', 'Livro Simples', { genre: null }),
    book('full', 'Duna <b>', { genre: 'Ficção', series: 'Duna', seriesNumber: 1, tags: ['clássico'], notes: 'Muito bom.' }),
    book('lendo', 'Lendo Agora', { status: 'lendo', endDate: null, rating: null, startDate: '2026-10-01', currentPage: 40 }),
    book('alvo', 'Com Data Alvo', { status: 'lendo', endDate: null, rating: null, startDate: '2026-10-01', targetDate: '2026-11-15' }),
  ],
};

const browser = await playwright.chromium.launch();
const context = await browser.newContext({
  viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, locale: 'pt-BR',
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
await page.route('https://www.googleapis.com/**', (r) => r.fulfill({ status: 429, json: { error: { code: 429 } } }));
await page.route('https://openlibrary.org/**', (r) => r.fulfill({ json: r.request().url().includes('isbn=') ? { docs: [] } : olFixture }));
await page.route('https://brasilapi.com.br/**', (r) => r.fulfill({ status: 404, json: {} }));
await page.route('https://covers.openlibrary.org/**', (r) => r.abort());

const step = (msg) => console.log(`• ${msg}`);
const onPage = (name) => page.waitForFunction((n) => document.getElementById('app').dataset.page === n, name);
const isOpen = () => page.getAttribute('[data-action="toggle-more"]', 'aria-expanded').then((v) => v === 'true');
const saveBtn = '.form-actions .btn-primary';

/** Capturas da tela inteira em 320, 390 e 430px, conferindo sobra horizontal e letra dos campos. */
async function shots(name) {
  for (const width of [320, 390, 430]) {
    await page.setViewportSize({ width, height: 844 });
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    assert.ok(overflow <= 0, `${name}: tela de ${width}px com ${overflow}px sobrando à direita`);
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({ path: join(SHOTS, `formulario-v14-${name}-${width}.png`), fullPage: true });
  }
  const small = await page.evaluate(() => [...document.querySelectorAll('input, select, textarea')]
    .filter((el) => parseFloat(getComputedStyle(el).fontSize) < 16).map((el) => el.outerHTML.slice(0, 60)));
  assert.deepEqual(small, [], `${name}: campos com letra < 16px fazem o iPhone dar zoom`);
  await page.setViewportSize({ width: 390, height: 844 });
}

/** Alvos de toque do formulário com pelo menos 44px (as meias estrelas são metade de 48px, de propósito). */
async function tapTargets(label) {
  const small = await page.evaluate(() => [...document.querySelectorAll('#book-form button, #book-form select, #book-form .file-btn, .form-top .btn-text')]
    .filter((el) => el.offsetParent && !el.classList.contains('star-hit'))
    .filter((el) => getComputedStyle(el).visibility === 'visible')
    .map((el) => ({ el, r: el.getBoundingClientRect() }))
    .filter(({ r }) => r.height < 40 || r.width < 40)
    .map(({ el, r }) => `${el.outerHTML.slice(0, 70)} ${Math.round(r.width)}×${Math.round(r.height)}`));
  assert.deepEqual(small, [], `${label}: alvos de toque pequenos`);
}

async function seedAndOpen(hash) {
  await page.goto(`${BASE}#/inicio`);
  await page.waitForSelector('#app[data-page]');
  await writeState(seed);
  await page.goto(`${BASE}${hash}`);
  await page.reload();
  await page.waitForSelector('#app[data-page]');
}

try {
  await seedAndOpen('#/novo');

  step('livro novo: só o essencial à mostra, "Mais detalhes" fechado');
  await onPage('novo');
  assert.equal(await isOpen(), false);
  for (const sel of ['#lookup', '#f-title', '#f-authors', '#f-pages', '#f-start', '#f-end', '.star-row', '[data-action="set-format"]']) {
    assert.ok(await page.isVisible(sel), `${sel} visível`);
  }
  for (const sel of ['#f-genre', '#f-series', '#f-tag', '#f-notes', '[data-action="toggle-fav"]']) {
    assert.equal(await page.isVisible(sel), false, `${sel} recolhido`);
  }
  assert.match(await page.textContent('.more-summary'), /Gênero, série, etiquetas, favorito e anotações/);
  assert.equal(await page.getAttribute('.more-toggle', 'aria-controls'), 'more-details');
  await tapTargets('novo');
  await shots('novo');

  step('barra de salvar fixa embaixo, acima da área segura; sai do caminho com o teclado');
  await page.evaluate(() => window.scrollTo(0, 0));
  const bar = await page.evaluate(() => {
    const el = document.querySelector('.form-actions');
    return { pos: getComputedStyle(el).position, bottom: el.getBoundingClientRect().bottom, h: window.innerHeight };
  });
  assert.equal(bar.pos, 'sticky');
  assert.ok(Math.abs(bar.bottom - bar.h) <= 1, `barra no pé da tela (${bar.bottom} de ${bar.h})`);
  await page.screenshot({ path: join(SHOTS, 'formulario-v14-barra-390.png') });
  // Teclado aberto: a área visível encolhe e o campo em foco não pode ficar sob a barra.
  await page.setViewportSize({ width: 390, height: 460 });
  await page.focus('#f-pages');
  await page.locator('#f-pages').scrollIntoViewIfNeeded();
  const kb = await page.evaluate(() => {
    const field = document.getElementById('f-pages').closest('.field').getBoundingClientRect();
    const b = document.querySelector('.form-actions');
    const r = b.getBoundingClientRect();
    return { pos: getComputedStyle(b).position, overlap: r.top < field.bottom && r.bottom > field.top };
  });
  assert.equal(kb.pos, 'relative', 'com campo de texto em foco a barra volta para o fim do formulário');
  assert.equal(kb.overlap, false, 'a barra não cobre o campo em foco');
  await page.screenshot({ path: join(SHOTS, 'formulario-v14-teclado-390.png') });
  await page.evaluate(() => document.activeElement.blur());
  await page.setViewportSize({ width: 390, height: 844 });

  step('validação: sem título, a mensagem aparece e "Mais detalhes" continua fechado');
  await page.click(saveBtn);
  assert.match(await page.textContent('.form-errors'), /título/);
  assert.equal(await isOpen(), false);
  const errBox = await page.evaluate(() => {
    const r = document.querySelector('.form-errors').getBoundingClientRect();
    return r.top >= 0 && r.bottom <= window.innerHeight;
  });
  assert.ok(errBox, 'a tela rola até a mensagem de erro');

  step('erro dentro de "Mais detalhes" (nº da série) abre a seção sozinho');
  await page.fill('#f-title', 'Livro Manual');
  await page.click('[data-action="toggle-more"]');
  await page.fill('#f-series', 'Coleção');
  await page.fill('#f-series-n', '0');
  await page.click('[data-action="toggle-more"]');
  assert.equal(await isOpen(), false);
  assert.match(await page.textContent('.more-summary'), /Coleção nº 0/);
  await page.click(saveBtn);
  await page.waitForSelector('.form-errors');
  assert.match(await page.textContent('.form-errors'), /número na série/);
  assert.equal(await isOpen(), true, 'abriu para mostrar o campo com erro');
  assert.ok(await page.isVisible('#f-series-n'));
  await shots('erro-detalhes');

  step('gênero: seletor compacto com "Novo gênero" e gênero próprio');
  await page.fill('#f-series-n', '1');
  const genres = await page.$$eval('#f-genre option', (els) => els.map((e) => e.textContent));
  assert.equal(genres[0], 'Sem gênero');
  assert.equal(genres.at(-1), '+ Novo gênero…');
  assert.ok(genres.includes('Gestão'));
  await page.selectOption('#f-genre', 'Gestão');
  await page.selectOption('#f-genre', { label: '+ Novo gênero…' });
  await page.waitForSelector('#new-genre');
  assert.equal(await page.evaluate(() => document.activeElement.id), 'new-genre');
  assert.equal(await page.inputValue('#f-genre'), 'Gestão', 'o seletor não fica em "Novo gênero"');
  await tapTargets('novo gênero');
  await page.fill('#new-genre', 'Distopia');
  await page.press('#new-genre', 'Enter');
  await page.waitForFunction(() => !document.getElementById('new-genre'));
  assert.equal(await page.inputValue('#f-genre'), 'Distopia');
  assert.equal(await isOpen(), true, 'a seção fica aberta (escolha lembrada) depois de redesenhar');
  await page.locator('#f-tag').pressSequentially('nacional,');
  assert.equal(await page.locator('.tag-chip').count(), 1);
  await shots('novo-detalhes');
  await page.click(saveBtn);
  await page.waitForSelector('.hero');
  const manual = (await waitState((s) => s.books.some((b) => b.title === 'Livro Manual'))).books.find((b) => b.title === 'Livro Manual');
  assert.equal(manual.genre, 'Distopia');
  assert.equal(manual.series, 'Coleção');
  assert.equal(manual.seriesNumber, 1);
  assert.deepEqual(manual.tags, ['nacional']);

  step('livro novo pela busca: resultado preenche os dados');
  await page.goto(`${BASE}#/novo?status=quero`);
  await onPage('novo');
  assert.equal(await page.isVisible('#f-period'), false, '"Quero ler" não tem datas');
  assert.equal(await page.isVisible('.star-row'), false);
  await page.fill('#lookup', 'a meta');
  await page.waitForSelector('.result');
  await page.click('.result >> nth=0');
  await page.waitForSelector('.picked');
  assert.equal(await page.inputValue('#f-title'), 'A Meta');
  assert.equal(await page.inputValue('#f-pages'), '384');
  await shots('busca');
  await page.click(saveBtn);
  await page.waitForSelector('.hero');
  await waitState((s) => s.books.some((b) => b.title === 'A Meta' && b.status === 'quero' && b.pages === 384));

  step('editar: com dados em "Mais detalhes" a seção já abre; o resumo mostra o que há quando fechada');
  await page.goto(`${BASE}#/livro/full`);
  await onPage('livro');
  assert.equal(await isOpen(), true);
  assert.equal(await page.inputValue('#f-genre'), 'Ficção');
  await page.click('[data-action="toggle-more"]');
  assert.equal(await page.textContent('.more-summary'), 'Ficção · Duna nº 1 · 1 etiqueta · com anotações');
  await page.click('[data-action="set-rating"][data-value="5"]');
  assert.equal(await isOpen(), false, 'fechada continua fechada depois de redesenhar');
  assert.match(await page.textContent('.form-title'), /Editar livro/);
  assert.equal(await page.locator('[data-action="reread"]').count(), 1);
  assert.equal(await page.locator('[data-action="delete-book"]').count(), 1);
  // Ações raras e destrutivas ficam depois do Salvar, longe dele.
  const order = await page.evaluate(() => {
    const save = document.querySelector('.form-actions').getBoundingClientRect();
    const del = document.querySelector('[data-action="delete-book"]').getBoundingClientRect();
    return del.top - save.bottom;
  });
  assert.ok(order > 50, 'Excluir fica abaixo do Salvar, separado');
  await tapTargets('editar');
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await shots('editar-lido');

  step('aberta sozinha, continua aberta ao limpar o último campo preenchido');
  await page.goto(`${BASE}#/livro/alvo`);
  await onPage('livro');
  assert.equal(await isOpen(), true);
  await page.click('[data-action="clear-target-date"]');
  assert.equal(await page.inputValue('#f-target'), '');
  assert.equal(await isOpen(), true);

  step('editar com cada status');
  await page.goto(`${BASE}#/livro/plain`);
  await onPage('livro');
  assert.equal(await isOpen(), false, 'sem nada nos detalhes, a seção começa fechada');
  await page.click('[data-action="set-status"][data-value="quero"]');
  assert.equal(await page.isVisible('#f-period'), false);
  assert.equal(await page.isVisible('.star-row'), false);
  await page.click('[data-action="set-status"][data-value="lendo"]');
  assert.match(await page.textContent('label[for="f-current"]'), /Página atual \(de 300\)/);
  assert.equal(await page.locator('#f-end').count(), 0);
  await page.click('[data-action="toggle-more"]');
  assert.ok(await page.isVisible('#f-target'), 'data alvo em "Mais detalhes" enquanto lê');
  assert.equal(await page.locator('[data-action="toggle-fav"]').count(), 0);
  await page.fill('#f-target', '2026-08-01');
  await page.click('[data-action="toggle-more"]');
  await page.click(saveBtn);
  await page.waitForSelector('.form-errors');
  assert.match(await page.textContent('.form-errors'), /anterior à de início/);
  assert.equal(await isOpen(), true, 'erro na data alvo abre "Mais detalhes"');
  await page.click('[data-action="clear-target-date"]');
  await shots('editar-lendo');

  step('Kindle: progresso em porcentagem');
  await page.click('[data-action="set-format"][data-value="kindle"]');
  assert.match(await page.textContent('label[for="f-current"]'), /Progresso no Kindle \(%\)/);
  await page.fill('#f-current', '150');
  await page.click(saveBtn);
  await page.waitForSelector('.form-errors');
  assert.match(await page.textContent('.form-errors'), /porcentagem vai de 0 a 100/);
  await page.fill('#f-current', '40');
  assert.match(await page.textContent('#reading-summary'), /40%/);

  await page.click('[data-action="set-status"][data-value="abandonado"]');
  assert.match(await page.textContent('label[for="f-end"]'), /Parei em/);
  assert.match(await page.textContent('label[for="f-current"]'), /Parei em \(%\)/);
  assert.ok(await page.isVisible('#f-drop'), '"Por que abandonei" fica à mostra');
  assert.match(await page.textContent('label[for="f-notes"]'), /Observações/);
  await page.fill('#f-drop', 'Não era o momento.');
  await shots('editar-abandonado');
  await page.click(saveBtn);
  await page.waitForSelector('.hero');
  const dropped = bookIn(await waitState((s) => bookIn(s, 'plain').status === 'abandonado'), 'plain');
  assert.equal(dropped.format, 'kindle');
  assert.equal(dropped.currentPercent, 40);
  assert.equal(dropped.dropReason, 'Não era o momento.');

  step('"Concluir": status Lido, término de hoje e nota à vista');
  await page.goto(`${BASE}#/livro/lendo?concluir=1`);
  await onPage('livro');
  assert.match(await page.textContent('.form-title'), /Concluir leitura/);
  assert.equal(await page.textContent('[data-action="set-status"].is-on'), 'Lido');
  assert.equal(await page.inputValue('#f-end'), '2026-10-16');
  const visible = await page.evaluate(() => {
    const r = document.querySelector('.star-row').getBoundingClientRect();
    const end = document.getElementById('f-end').getBoundingClientRect();
    const head = document.querySelector('.form-top').getBoundingClientRect();
    return r.bottom <= window.innerHeight && end.top >= head.bottom;
  });
  assert.ok(visible, 'término e nota cabem na tela ao abrir');
  assert.equal(await page.locator('[data-action="reread"]').count(), 0, 'livro que não estava lido não tem "Ler de novo"');
  await page.screenshot({ path: join(SHOTS, 'formulario-v14-concluir-390.png') });
  await page.click('[data-action="set-rating"][data-value="4.5"]');
  await page.click(saveBtn);
  await page.waitForSelector('.hero');
  const done = bookIn(await waitState((s) => bookIn(s, 'lendo').status === 'lido'), 'lendo');
  assert.equal(done.rating, 4.5);
  assert.equal(done.endDate, '2026-10-16');

  step('movimento reduzido: abre sem animação');
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto(`${BASE}#/novo`);
  await onPage('novo');
  assert.equal(await page.evaluate(() => getComputedStyle(document.querySelector('.more-body')).transitionDuration), '0s');
  await page.click('[data-action="toggle-more"]');
  assert.ok(await page.isVisible('#f-notes'));
  await page.emulateMedia({ reducedMotion: null });

  step('Ajustes em grupos');
  await page.goto(`${BASE}#/ajustes`);
  await page.waitForSelector('.set-group');
  assert.deepEqual(await page.$$eval('.set-head', (els) => els.map((e) => e.textContent)),
    ['Meta de leitura', 'Backup dos dados', 'Busca de livros', 'Instalar no celular', 'Sobre']);
  await shots('ajustes');

  assert.deepEqual(errors, [], 'sem erros no console');
  console.log('\nOK: formulário v1.4');
} catch (err) {
  await page.screenshot({ path: join(SHOTS, 'formulario-v14-falha.png'), fullPage: true }).catch(() => {});
  console.error('\nFALHOU:', err.message);
  if (errors.length) console.error(errors.join('\n'));
  process.exitCode = 1;
} finally {
  await browser.close();
  server.close();
}
