// Teste de ponta a ponta: abre o app num Chromium com tela de celular,
// usa as telas como uma pessoa usaria e salva capturas em tests/e2e/screens/.
// Uso: npm run e2e   (precisa do Playwright instalado globalmente ou no projeto)

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

const googleFixture = {
  items: [{
    id: 'meta1',
    volumeInfo: {
      title: 'A Meta', authors: ['Eliyahu M. Goldratt', 'Jeff Cox'], pageCount: 384, publishedDate: '2014',
      industryIdentifiers: [{ type: 'ISBN_13', identifier: '9788521315316' }],
    },
  }],
};
const olFixture = { docs: [{ key: '/works/OL1W', title: 'Necessário, Mas Não Suficiente', author_name: ['Eliyahu M. Goldratt'], number_of_pages_median: 248 }] };

const seed = {
  version: 1,
  goals: { 2026: 12 },
  defaultGoal: 12,
  customGenres: [],
  lastBackupAt: '2026-10-10T10:00:00.000Z',
  books: [
    ['Sapiens', 'Yuval Noah Harari', 464, '2026-08-01', '2026-08-28', 5, 'História', 'fisico'],
    ['O Modelo Toyota', 'Jeffrey K. Liker', 320, '2026-07-02', '2026-07-30', 4, 'Gestão', 'fisico'],
    ['1984', 'George Orwell', 416, '2026-06-01', '2026-06-20', 4, 'Ficção', 'kindle'],
    ['Hábitos Atômicos', 'James Clear', 320, '2026-05-03', '2026-05-25', 5, 'Desenvolvimento pessoal', 'kindle'],
    ['Dom Casmurro', 'Machado de Assis', 256, '2026-04-02', '2026-04-22', 4, 'Ficção', 'fisico'],
    ['A Revolução dos Bichos', 'George Orwell', 152, '2026-03-20', '2026-03-28', 4, 'Ficção', 'kindle'],
    ['Essencialismo', 'Greg McKeown', 272, '2026-03-01', '2026-03-15', 4, 'Gestão', 'fisico'],
    ['O Poder do Hábito', 'Charles Duhigg', 408, '2026-02-01', '2026-02-26', 4, 'Desenvolvimento pessoal', 'fisico'],
    ['A Mentalidade Enxuta nas Empresas', 'James P. Womack, Daniel T. Jones', 448, '2026-01-04', '2026-01-30', 4, 'Gestão', 'fisico'],
    ['Rápido e Devagar', 'Daniel Kahneman', 608, '2025-11-01', '2025-12-20', 5, 'Desenvolvimento pessoal', 'fisico'],
  ].map(([title, authors, pages, startDate, endDate, rating, genre, format], i) => ({
    id: `seed${i}`, title, authors, pages, startDate, endDate, rating, genre, format,
    status: 'lido', favorite: false, notes: '', cover: null, isbn: '',
    createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z',
  })).concat([
    { id: 'r1', title: 'Fora de Série', authors: 'Malcolm Gladwell', status: 'lendo', startDate: '2026-10-02', format: 'kindle', createdAt: '2026-10-02T00:00:00.000Z' },
    { id: 'w1', title: 'O Gerente Minuto', authors: 'Ken Blanchard', status: 'quero', createdAt: '2026-09-01T00:00:00.000Z' },
    { id: 'w2', title: 'Pai Rico, Pai Pobre', authors: 'Robert Kiyosaki', status: 'quero', createdAt: '2026-09-02T00:00:00.000Z' },
  ]),
};

const browser = await playwright.chromium.launch();
const context = await browser.newContext({
  viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, locale: 'pt-BR',
  acceptDownloads: true,
});
const page = await context.newPage();
await page.clock.setFixedTime(new Date('2026-10-16T12:00:00'));
const errors = [];
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errors.push(`console: ${m.text()}`); });
page.on('dialog', (d) => d.accept());
await page.route('https://www.googleapis.com/**', (r) => r.fulfill({ json: googleFixture }));
await page.route('https://openlibrary.org/**', (r) => r.fulfill({ json: olFixture }));
await page.route('https://covers.openlibrary.org/**', (r) => r.abort());

const shot = (name) => page.screenshot({ path: join(SHOTS, `${name}.png`), fullPage: true });
const step = (msg) => console.log(`• ${msg}`);
const onPage = (name) => page.waitForFunction((n) => document.getElementById('app').dataset.page === n, name);

try {
  step('app vazio');
  await page.goto(BASE);
  await page.waitForSelector('.hero');
  assert.match(await page.textContent('.ring-center'), /0\s*de 12 livros/);
  await shot('01-inicio-vazio');

  step('cadastro pela busca');
  await page.click('.nav-add');
  await onPage('novo');
  await page.fill('#lookup', 'a meta');
  await page.waitForSelector('.result');
  assert.equal(await page.locator('.result').count(), 2);
  await shot('02-busca');
  await page.click('.result >> nth=0');
  assert.equal(await page.inputValue('#f-title'), 'A Meta');
  assert.equal(await page.inputValue('#f-pages'), '384');
  await page.fill('#f-start', '2026-09-03');
  await page.locator('#f-start').dispatchEvent('change');
  await page.fill('#f-end', '2026-09-21');
  await page.locator('#f-end').dispatchEvent('change');
  await page.click('[data-action="set-genre"][data-value="Gestão"]');
  await page.click('[data-action="set-rating"][data-value="5"]');
  await page.click('[data-action="toggle-fav"]');
  await page.fill('#f-notes', 'A restrição dita o ritmo do sistema inteiro.');
  assert.match(await page.textContent('.form'), /Lido em 19 dias/);
  await shot('03-formulario');
  await page.click('.btn-primary');
  await page.waitForSelector('.hero');
  assert.match(await page.textContent('.ring-center'), /1\s*de 12/);
  assert.equal(await page.locator('.grid-book').count(), 1);

  step('validação');
  await page.click('.nav-add');
  await onPage('novo');
  await page.click('.btn-primary');
  assert.match(await page.textContent('.form-errors'), /título/);
  await page.click('text=Cancelar');

  step('dados de exemplo');
  const existing = await page.evaluate(() => JSON.parse(localStorage.getItem('leituras:v1')));
  await page.evaluate((data) => localStorage.setItem('leituras:v1', JSON.stringify(data)), {
    ...seed, books: [...existing.books, ...seed.books],
  });
  await page.reload();
  await page.waitForSelector('.hero');
  assert.match(await page.textContent('.ring-center'), /10\s*de 12/);
  assert.match(await page.textContent('.hero'), /10 meses seguidos/);
  await shot('04-inicio');
  assert.equal(await page.locator('.banner').count(), 0, 'sem aviso de backup na tela inicial');
  for (const width of [390, 375, 320]) {
    await page.setViewportSize({ width, height: 844 });
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    assert.ok(overflow <= 0, `tela de ${width}px com ${overflow}px sobrando à direita`);
  }
  await page.setViewportSize({ width: 390, height: 844 });
  const smallFields = await page.evaluate(() => [...document.querySelectorAll('input, select, textarea')]
    .filter((el) => parseFloat(getComputedStyle(el).fontSize) < 16).map((el) => el.outerHTML.slice(0, 60)));
  assert.deepEqual(smallFields, [], 'campos com letra < 16px fazem o iPhone dar zoom');

  step('concluir leitura em andamento');
  await page.click('.reading .btn-outline');
  await onPage('livro');
  assert.equal(await page.locator('.seg-btn.is-on').first().textContent(), 'Lido');
  await page.click('[data-action="set-rating"][data-value="4"]');
  await page.click('.btn-primary');
  await page.waitForSelector('.hero');
  assert.match(await page.textContent('.ring-center'), /11\s*de 12/);
  assert.match(await page.textContent('.hero'), /11 meses seguidos/);

  step('estante');
  await page.click('[data-nav="estante"]');
  await onPage('estante');
  assert.equal(await page.locator('.book-row').count(), 2);
  await page.click('[data-action="start-reading"] >> nth=0');
  await page.waitForFunction(() => document.querySelectorAll('.book-row').length === 1);
  assert.equal(await page.locator('.book-row').count(), 1);
  await shot('05-estante');
  await page.click('a.seg-btn:has-text("Lidos")');
  await page.waitForSelector('.year-head');
  assert.ok(await page.isVisible('text=2025'));

  step('busca');
  await page.click('[data-nav="buscar"]');
  await onPage('buscar');
  await page.fill('#q', 'orwell');
  assert.equal(await page.locator('#search-results .book-row').count(), 2);
  await page.selectOption('[data-filter="format"]', 'kindle');
  await page.fill('#q', '');
  await page.locator('#q').dispatchEvent('input');
  assert.match(await page.textContent('#search-results'), /livros encontrados/);
  await shot('06-busca');

  step('resumo');
  await page.click('[data-nav="resumo"]');
  await onPage('resumo');
  await page.waitForSelector('.bars');
  assert.match(await page.textContent('.favorite'), /A Meta/);
  assert.match(await page.textContent('body'), /George Orwell/);
  await shot('07-resumo');
  await page.selectOption('[data-change="summary-year"]', '2025');
  await page.waitForURL(/resumo\/2025/);
  assert.match(await page.textContent('.tiles'), /1\s*\/ 12/);
  await page.selectOption('[data-change="summary-year"]', '2026');
  await page.waitForURL(/resumo\/2026/);

  step('retrospectiva');
  await page.click('text=Ver retrospectiva');
  await onPage('retro');
  await page.waitForSelector('.retro');
  assert.match(await page.textContent('.retro-huge'), /11/);
  await shot('08-retro-1');
  for (let i = 0; i < 3; i += 1) await page.click('.tap-next');
  assert.match(await page.textContent('.slide'), /Livro do ano/);
  assert.match(await page.textContent('.slide'), /A Meta/);
  await shot('08-retro-4');
  const imgDownload = page.waitForEvent('download');
  await page.click('[data-action="retro-save"]');
  const img = await imgDownload;
  assert.equal(img.suggestedFilename(), 'leituras-2026.png');
  await img.saveAs(join(SHOTS, '09-imagem-compartilhar.png'));

  step('ajustes, meta e backup');
  await page.goto(`${BASE}#/ajustes`);
  await page.click('[data-action="goal-year"][data-delta="1"]');
  assert.equal((await page.textContent('.step-value')).trim(), '13');
  const backupDownload = page.waitForEvent('download');
  await page.click('[data-action="export-backup"]');
  const backup = await backupDownload;
  const backupPath = join(SHOTS, 'backup.json');
  await backup.saveAs(backupPath);
  const parsed = JSON.parse(readFileSync(backupPath, 'utf8'));
  assert.equal(parsed.app, 'leituras');
  assert.equal(parsed.data.books.length, 14);
  await shot('10-ajustes');

  step('apagar e restaurar backup');
  await page.click('[data-action="wipe-data"]');
  await page.waitForSelector('.hero');
  assert.match(await page.textContent('.ring-center'), /0\s*de 12/);
  await page.goto(`${BASE}#/ajustes`);
  await page.setInputFiles('[data-import]', backupPath);
  await page.waitForFunction(() => JSON.parse(localStorage.getItem('leituras:v1')).books.length === 14);
  await page.goto(`${BASE}#/inicio`);
  assert.match(await page.textContent('.ring-center'), /11\s*de 13/);

  step('editar e excluir');
  await page.click('.grid-book >> nth=0');
  await onPage('livro');
  await page.click('[data-action="delete-book"]');
  await page.waitForSelector('.hero');
  assert.match(await page.textContent('.ring-center'), /10\s*de 13/);

  step('funciona offline depois da primeira visita');
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.reload();
  await context.setOffline(true);
  await page.reload();
  await page.waitForSelector('.hero');
  await context.setOffline(false);

  assert.deepEqual(errors, []);
  console.log('\nTudo certo. Capturas em tests/e2e/screens/');
} catch (err) {
  await shot('falha').catch(() => {});
  console.error('\nFALHOU:', err.message);
  if (errors.length) console.error(errors.join('\n'));
  process.exitCode = 1;
} finally {
  await browser.close();
  server.close();
}
