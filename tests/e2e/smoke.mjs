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

// Busca por título: só a Open Library (o Google sem chave vive com a cota esgotada).
const olFixture = {
  docs: [
    {
      key: '/works/OL1W', title: 'The Goal', author_name: ['Eliyahu M. Goldratt', 'Jeff Cox'], first_publish_year: 1984,
      editions: { docs: [{ key: '/books/OL1M', title: 'A Meta', language: ['por'], isbn: ['9788521315315'], number_of_pages_median: 384 }] },
    },
    { key: '/works/OL2W', title: 'Necessário, Mas Não Suficiente', author_name: ['Eliyahu M. Goldratt'], number_of_pages_median: 248 },
  ],
};
// Busca por ISBN: a BrasilAPI conhece este; os outros ISBNs voltam 404.
const brasilApiFixture = {
  isbn: '9788535914849', title: 'O Alienista', authors: ['Machado de Assis'], year: 2014, page_count: 96,
  cover_url: null, provider: 'cbl',
};

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
const contextOptions = {
  viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, locale: 'pt-BR',
  acceptDownloads: true,
};
const context = await browser.newContext(contextOptions);
const page = await context.newPage();
await page.clock.setFixedTime(new Date('2026-10-16T12:00:00'));

// Os dados ficam no IndexedDB: lê e grava pelo próprio db.js do app.
const STATE_KEY = 'state';
const readState = (p = page) => p.evaluate(async (key) => (await import('/js/db.js')).getItem(key), STATE_KEY);
const writeState = (data, p = page) => p.evaluate(async ([key, d]) => (await import('/js/db.js')).setItem(key, d), [STATE_KEY, data]);
/** Espera a gravação (assíncrona) chegar ao aparelho. */
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
await page.route('https://www.googleapis.com/**', (r) => r.fulfill({ status: 429, json: { error: { code: 429 } } }));
await page.route('https://openlibrary.org/**', (r) => r.fulfill({
  json: r.request().url().includes('isbn=') ? { docs: [] } : olFixture,
}));
await page.route('https://brasilapi.com.br/**', (r) => (r.request().url().endsWith(`/${brasilApiFixture.isbn}`)
  ? r.fulfill({ json: brasilApiFixture })
  : r.fulfill({ status: 404, json: { message: 'ISBN não encontrado' } })));
await page.route('https://covers.openlibrary.org/**', (r) => r.abort());

const shot = (name) => page.screenshot({ path: join(SHOTS, `${name}.png`), fullPage: true });
const step = (msg) => console.log(`• ${msg}`);
const onPage = (name) => page.waitForFunction((n) => document.getElementById('app').dataset.page === n, name);

try {
  step('migração dos dados do localStorage (versão 1.2) para o IndexedDB');
  {
    const ctx = await browser.newContext(contextOptions);
    const p = await ctx.newPage();
    await p.clock.setFixedTime(new Date('2026-10-16T12:00:00'));
    p.on('pageerror', (e) => errors.push(`pageerror (migração): ${e.message}`));
    await p.goto(`${BASE}manifest.webmanifest`);
    await p.evaluate((data) => localStorage.setItem('leituras:v1', JSON.stringify(data)), seed);
    await p.goto(BASE);
    await p.waitForSelector('.hero');
    assert.match(await p.textContent('.ring-center'), /9\s*de 12 livros/);
    assert.equal(await p.locator('.grid-book').count(), 6);
    assert.equal(await p.evaluate(() => localStorage.getItem('leituras:v1')), null, 'chave antiga removida');
    const migrated = await readState(p);
    assert.deepEqual(migrated, seed, 'cópia idêntica no IndexedDB');
    await p.reload();
    await p.waitForSelector('.hero');
    assert.match(await p.textContent('.ring-center'), /9\s*de 12 livros/);
    await ctx.close();
  }

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

  step('busca por ISBN');
  await page.click('.nav-add');
  await onPage('novo');
  await page.fill('#lookup', '978-85-359-1484-9');
  await page.waitForSelector('.result');
  assert.equal(await page.locator('.result').count(), 1);
  assert.match(await page.textContent('.result'), /O Alienista/);
  await page.fill('#lookup', '9788521315315');
  await page.waitForSelector('.lookup-status:has-text("Não encontrei")');
  assert.match(await page.textContent('.lookup-status'), /Não encontrei — preencha os dados abaixo\./);
  assert.match(await page.textContent('.lookup-status'), /9788521315315/);
  await page.fill('#f-title', 'Livro sem cadastro');
  await page.locator('#f-title').dispatchEvent('input');
  await page.click('.btn-primary');
  await page.waitForSelector('.hero');
  await waitState((st) => st?.books.some((b) => b.title === 'Livro sem cadastro'));
  const saved = (await readState()).books.find((b) => b.title === 'Livro sem cadastro');
  assert.equal(saved.isbn, '9788521315315');
  const cleaned = await readState();
  cleaned.books = cleaned.books.filter((b) => b.title !== 'Livro sem cadastro');
  await writeState(cleaned);
  await page.reload();
  await page.waitForSelector('.hero');

  step('validação');
  await page.click('.nav-add');
  await onPage('novo');
  await page.click('.btn-primary');
  assert.match(await page.textContent('.form-errors'), /título/);
  await page.click('text=Cancelar');

  step('dados de exemplo');
  const existing = await waitState((s) => s.books.length === 1);
  assert.equal(existing.books[0].rating, 5);
  await writeState({ ...seed, books: [...existing.books, ...seed.books] });
  await page.reload();
  await page.waitForSelector('.hero');
  assert.match(await page.textContent('.ring-center'), /10\s*de 12/);
  assert.match(await page.textContent('.hero'), /10 meses seguidos/);
  await shot('04-inicio');
  assert.equal(await page.locator('.banner').count(), 0, 'sem aviso de backup na tela inicial');
  assert.doesNotMatch(await page.textContent('#app'), /Espaço usado|Proteção contra limpeza/, 'nada de armazenamento na tela inicial');
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
  // Meia estrela: metade esquerda da 5ª estrela = 4,5.
  await page.click('[data-action="set-rating"][data-value="4.5"]');
  assert.equal(await page.getAttribute('[data-action="set-rating"][data-value="4.5"]', 'aria-pressed'), 'true');
  assert.equal(await page.getAttribute('[data-action="set-rating"][data-value="4.5"]', 'aria-label'), '4,5 estrelas');
  assert.equal(await page.locator('.star-row .star-half').count(), 1);
  assert.equal(await page.locator('.star-row .star-on').count(), 4);
  await page.locator('.star-row').scrollIntoViewIfNeeded();
  await page.screenshot({ path: join(SHOTS, '03b-meia-estrela.png') });
  await page.setViewportSize({ width: 320, height: 844 });
  const formOverflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  assert.ok(formOverflow <= 0, `formulário com ${formOverflow}px sobrando à direita em 320px`);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.click('.btn-primary');
  await page.waitForSelector('.hero');
  assert.match(await page.textContent('.ring-center'), /11\s*de 12/);
  assert.match(await page.textContent('.grid-book >> nth=0'), /4,5/);
  const finished = (await waitState((s) => s.books.some((b) => b.id === 'r1' && b.status === 'lido'))).books.find((b) => b.id === 'r1');
  assert.equal(finished.rating, 4.5);
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
  await shot('08-retro-1');
  // 1º slide: mosaico de capas; 2º: a contagem. O livro do ano é o último.
  await page.click('.tap-next');
  assert.match(await page.textContent('.retro-huge'), /11/);
  for (let i = 0; i < 12; i += 1) await page.click('.tap-next');
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
  await page.waitForSelector('.storage-info');
  assert.match(await page.textContent('.storage-info'), /Espaço usado: .+ MB · Proteção contra limpeza automática: (ativa|não ativa)/);
  await page.click('[data-action="goal-year"][data-delta="1"]');
  assert.equal((await page.textContent('.step-value')).trim(), '13');
  const backupDownload = page.waitForEvent('download');
  await page.click('[data-action="export-backup"]');
  const backup = await backupDownload;
  const backupPath = join(SHOTS, 'backup.json');
  await backup.saveAs(backupPath);
  const parsed = JSON.parse(readFileSync(backupPath, 'utf8'));
  assert.equal(parsed.app, 'leituras');
  assert.equal(parsed.schemaVersion, 2);
  assert.equal(parsed.data.books.length, 14);
  await shot('10-ajustes');

  step('apagar e restaurar backup');
  await page.click('[data-action="wipe-data"]');
  await page.waitForSelector('.hero');
  assert.match(await page.textContent('.ring-center'), /0\s*de 12/);
  await page.goto(`${BASE}#/ajustes`);
  // A tela redesenha quando o espaço usado chega; antes disso o campo de arquivo seria trocado.
  await page.waitForSelector('.storage-info');
  await page.setInputFiles('[data-import]', backupPath);
  await waitState((s) => s.books.length === 14);
  await page.goto(`${BASE}#/inicio`);
  assert.match(await page.textContent('.ring-center'), /11\s*de 13/);

  step('excluir e desfazer');
  // Capa → ficha do livro → Editar (v1.4).
  await page.click('.grid-book >> nth=0');
  await page.waitForSelector('.ficha-hero');
  await page.click('.ficha-top a:has-text("Editar")');
  await page.click('[data-action="delete-book"]');
  await page.waitForSelector('.hero');
  assert.match(await page.textContent('.ring-center'), /10\s*de 13/);
  await page.click('.toast button:has-text("Desfazer")');
  await page.waitForFunction(() => /11\s*de 13/.test(document.querySelector('.ring-center').textContent));

  step('progresso da leitura');
  await page.click('[data-action="update-page"] >> nth=0');
  await page.waitForSelector('#progress-input');
  assert.equal(await page.evaluate(() => document.activeElement.id), 'progress-input');
  await page.fill('#progress-input', '120');
  await shot('11-inicio-informar-pagina');
  await page.click('.progress-edit button[type="submit"]');
  await page.waitForSelector('.reading .progress');
  assert.match(await page.textContent('.reading .progress'), /Na pág\. 120 · informe o total/);
  await shot('11-inicio-progresso');
  // Diário de leitura: registrado sozinho, sem nada na tela.
  const withJournal = await waitState((s) => s.books.some((b) => b.id === 'w1' && b.journal?.length));
  assert.deepEqual(withJournal.books.find((b) => b.id === 'w1').journal,
    [{ date: '2026-10-16', from: 0, to: 120, unit: 'page', note: '' }]);
  // O Kindle concluído antes fechou o dia em 100%.
  assert.deepEqual(withJournal.books.find((b) => b.id === 'r1').journal,
    [{ date: '2026-10-16', from: 0, to: 100, unit: 'percent', note: '' }]);

  step('capa pela foto');
  await page.click('.reading-link >> nth=0');
  await page.waitForSelector('.ficha-hero');
  await page.click('.ficha-top a:has-text("Editar")');
  await page.waitForSelector('#f-pages');
  await page.fill('#f-pages', '336');
  await page.setInputFiles('[data-cover-photo]', new URL('../../app/icons/icon-512.png', import.meta.url).pathname);
  await page.waitForFunction(() => document.querySelector('.cover-edit .cover-img')?.src.startsWith('data:image/jpeg'));
  assert.equal(await page.inputValue('#f-current'), '120');
  await shot('12-formulario-lendo');
  await page.click('[data-action="zoom-cover"]');
  await page.waitForSelector('.cover-viewer .cover-viewer-img');
  const box = await page.locator('.cover-viewer-img').boundingBox();
  assert.ok(box.width > 200, `capa ampliada pequena demais: ${box.width}px`);
  await page.waitForTimeout(400);
  await page.screenshot({ path: join(SHOTS, '12b-capa-ampliada.png') });
  await page.click('.cover-viewer-close');
  assert.equal(await page.locator('.cover-viewer').count(), 0);
  await page.click('.btn-primary');
  // Salvar volta para a ficha, já com a capa nova (tocar nela amplia).
  await page.waitForSelector('.ficha-hero');
  assert.match(await page.getAttribute('.ficha-cover .cover-img', 'src'), /^data:image\/jpeg/);
  assert.match(await page.textContent('.ficha-progress'), /36%/);
  await page.click('[data-action="zoom-book-cover"]');
  await page.waitForSelector('.cover-viewer .cover-viewer-img');
  await page.click('.cover-viewer-close');
  await page.click('.ficha-back');
  await onPage('inicio');
  assert.match(await page.getAttribute('.reading .cover-img', 'src'), /^data:image\/jpeg/);
  assert.match(await page.textContent('.reading .progress'), /36% · pág\. 120 de 336/);

  step('progresso em % no Kindle');
  await page.click('.nav-add');
  await onPage('novo');
  await page.fill('#f-title', 'Livro no Kindle');
  await page.click('[data-action="set-status"][data-value="lendo"]');
  await page.click('[data-action="set-format"][data-value="kindle"]');
  assert.match(await page.textContent('label[for="f-current"]'), /Progresso no Kindle \(%\)/);
  await page.fill('#f-current', '2');
  assert.match(await page.textContent('#reading-summary'), /2%/);
  await page.click('.btn-primary');
  await onPage('inicio');
  const kindleCard = page.locator('.reading:has-text("Livro no Kindle")');
  assert.match(await kindleCard.locator('.progress').textContent(), /2% · no Kindle/);
  await kindleCard.locator('[data-action="update-page"]').click();
  assert.match(await page.textContent('.progress-edit-label'), /Quantos % o Kindle mostra/);
  await page.fill('#progress-input', '150');
  await page.press('#progress-input', 'Enter');
  await page.waitForFunction(() => /entre 0 e 100/.test(document.getElementById('toast').textContent));
  await page.fill('#progress-input', '45');
  await shot('16-inicio-kindle-editando');
  await page.press('#progress-input', 'Enter');
  await page.waitForFunction(() => /45% · no Kindle/.test(document.body.textContent));
  assert.equal(await page.locator('.progress-edit').count(), 0);
  const kindleBook = (await waitState((s) => s.books.some((b) => b.title === 'Livro no Kindle' && b.currentPercent === 45)))
    .books.find((b) => b.title === 'Livro no Kindle');
  assert.deepEqual(kindleBook.journal, [{ date: '2026-10-16', from: 2, to: 45, unit: 'percent', note: '' }]);
  await shot('16-inicio-kindle');

  step('abandonei');
  await page.click('.nav-add');
  await onPage('novo');
  await page.fill('#f-title', 'Livro Chato');
  await page.click('[data-action="set-status"][data-value="abandonado"]');
  await page.fill('#f-current', '80');
  await page.fill('#f-drop', 'Não prendeu a atenção.');
  await shot('13-formulario-abandonei');
  await page.click('.btn-primary');
  await onPage('inicio');
  assert.match(await page.textContent('.ring-center'), /11\s*de 13/, 'abandonado não conta na meta');
  await page.click('[data-nav="estante"]');
  await onPage('estante');
  await page.click('a.seg-btn:has-text("Abandonei")');
  await page.waitForSelector('.drop-reason');
  assert.match(await page.textContent('.drop-reason'), /Não prendeu/);
  await shot('14-estante-abandonei');
  await page.click('[data-nav="resumo"]');
  await onPage('resumo');
  assert.match(await page.textContent('body'), /Abandonados/);

  step('todos os anos');
  await page.selectOption('[data-change="summary-year"]', 'todos');
  await page.waitForURL(/resumo\/todos/);
  await page.waitForSelector('.best-year');
  assert.match(await page.textContent('.tiles'), /12\s*livros lidos/);
  assert.match(await page.textContent('.best-year'), /2026/);
  await shot('15-todos-os-anos');

  step('ler de novo');
  await page.goto(`${BASE}#/estante?aba=lido`);
  await page.waitForSelector('.book-row');
  await page.click('.book-row-link:has-text("Sapiens")');
  await page.waitForSelector('.ficha-hero');
  await page.click('.ficha-top a:has-text("Editar")');
  await page.click('[data-action="reread"]');
  await onPage('inicio');
  assert.equal(await page.locator('.reading:has-text("Sapiens")').count(), 1);

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
