// Conferência final da 1.3: algumas semanas de uso real, num iPhone (390×844 @3x),
// partindo dos dados da 1.2.4 (localStorage, esquema 1). Os números precisam bater
// entre as telas, e nada pode ficar cortado nas larguras de iPhone (375 a 430; 320 também).
// Uso: node tests/e2e/qa-final.mjs   (precisa do Playwright instalado globalmente ou no projeto)

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
// 127.0.0.1 (e não localhost): sem service worker, o teste usa o código atual.
const BASE = `http://127.0.0.1:${server.address().port}/`;

const browser = await playwright.chromium.launch();
const context = await browser.newContext({
  viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true, locale: 'pt-BR',
  acceptDownloads: true, reducedMotion: 'reduce',
});
const page = await context.newPage();
const p = page;
const errors = [];
p.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
p.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errors.push(`console: ${m.text()}`); });
p.on('dialog', (d) => d.accept());
await p.route('https://www.googleapis.com/**', (r) => r.fulfill({ status: 429, json: {} }));
await p.route('https://openlibrary.org/**', (r) => r.fulfill({ json: { docs: [] } }));
await p.route('https://brasilapi.com.br/**', (r) => r.fulfill({ status: 404, json: {} }));
await p.route('https://covers.openlibrary.org/**', (r) => r.abort());

const shot = (name, fullPage = true) => p.screenshot({ path: join(SHOTS, `final-${name}.png`), fullPage });
const step = (msg) => console.log(`• ${msg}`);
const noErrors = (where) => assert.deepEqual(errors, [], `erros no console em ${where}`);
const onPage = (name) => p.waitForFunction((n) => document.getElementById('app').dataset.page === n, name);
const readState = () => p.evaluate(async () => (await import('/js/db.js')).getItem('state'));
const text = (sel) => p.innerText(sel).then((t) => t.replace(/\s+/g, ' ').trim());
const toast = () => p.waitForSelector('#toast.show').then((el) => el.textContent());
const waitToast = (re) => p.waitForFunction((src) => document.querySelector('#toast.show') && new RegExp(src).test(document.getElementById('toast').textContent), re.source);
async function day(iso, hh = '21:30') {
  await p.clock.setSystemTime(new Date(`${iso}T${hh}:00`));
  await p.reload();
  await p.waitForFunction(() => document.getElementById('app').dataset.page);
}
async function go(hash) {
  await p.evaluate((h) => { location.hash = h; }, hash);
  await p.waitForTimeout(120);
}
async function updateCard(title, value, re) {
  await p.click(`.reading:has-text("${title}") [data-action="update-page"]`);
  await p.fill('#progress-input', String(value));
  await p.press('#progress-input', 'Enter');
  if (re) await waitToast(re);
}
/** Seletores cujo texto escolhido não cabe (o iPhone corta com "…"). */
function cutSelects() {
  // Seletor invisível por cima de um chip (Buscar): quem aparece é o texto do chip, conferido à parte.
  return p.evaluate(() => [...document.querySelectorAll('#app select')].filter((el) => el.offsetParent && getComputedStyle(el).opacity !== '0').flatMap((el) => {
    const cs = getComputedStyle(el);
    const ctx = document.createElement('canvas').getContext('2d');
    ctx.font = `${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
    const label = el.selectedOptions[0]?.text || '';
    const avail = el.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
    return ctx.measureText(label).width > avail + 0.5 ? [`${el.dataset.change || el.dataset.filter}: "${label}"`] : [];
  }).concat([...document.querySelectorAll('#app .fchip-text')].filter((el) => el.scrollWidth > el.clientWidth + 0.5).map((el) => `chip: "${el.textContent}"`)));
}
/** Ação do menu rápido de um livro (botão "Mais ações" da linha ou do cartão). */
async function fromMenu(scope, action) {
  await p.click(`${scope} [data-action="quick-menu"]`);
  await p.click(`.sheet-layer.is-open [data-action="${action}"], .sheet-layer.is-open a:has-text("${action}")`);
}
/** Palavras que não cabem na linha (quebram no meio) dentro dos elementos indicados. */
function brokenWords(selector) {
  return p.evaluate((sel) => [...document.querySelectorAll(sel)].flatMap((el) => {
    const cs = getComputedStyle(el);
    const ctx = document.createElement('canvas').getContext('2d');
    ctx.font = `${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
    return el.textContent.split(/\s+/).filter((w) => w && ctx.measureText(w).width > el.clientWidth + 0.5);
  }), selector);
}
const scrolls = () => p.evaluate(() => document.documentElement.scrollHeight - window.innerHeight);

// ---------- Dados da 1.2.4 ----------
const TS = '2026-01-01T00:00:00.000Z';
const v1 = (id, o) => ({
  id, title: '', authors: '', pages: null, cover: null, isbn: '', status: 'lido', startDate: null, endDate: null,
  currentPage: null, currentPercent: null, format: 'fisico', genre: null, rating: null, favorite: false, notes: '',
  dropReason: '', reread: false, createdAt: TS, updatedAt: TS, ...o,
});
const legacy = {
  version: 1,
  books: [
    v1('nome-vento', { title: 'O Nome do Vento', authors: 'Patrick Rothfuss', pages: 656, startDate: '2025-01-05', endDate: '2025-02-10', rating: 5, genre: 'Ficção', favorite: true }),
    v1('sapiens', { title: 'Sapiens: Uma Breve História da Humanidade', authors: 'Yuval Noah Harari', pages: 464, startDate: '2025-02-15', endDate: '2025-03-20', format: 'kindle', rating: 4, genre: 'História' }),
    v1('habitos', { title: 'Hábitos Atômicos', authors: 'James Clear', pages: 320, startDate: '2025-04-01', endDate: '2025-04-20', format: 'kindle', rating: 4, genre: 'Desenvolvimento pessoal' }),
    v1('casmurro', { title: 'Dom Casmurro', authors: 'Machado de Assis', pages: 256, startDate: '2025-05-02', endDate: '2025-05-15', rating: 5, genre: 'Ficção' }),
    v1('bichos', { title: 'A Revolução dos Bichos', authors: 'George Orwell', pages: 152, startDate: '2025-06-01', endDate: '2025-06-01', rating: 4, genre: 'Ficção' }),
    v1('meditacoes', { title: 'Meditações', authors: 'Marco Aurélio', pages: 254, startDate: '2025-08-10', endDate: '2025-09-12', rating: 3, genre: 'Filosofia' }),
    v1('jobs', { title: 'Steve Jobs', authors: 'Walter Isaacson', pages: 624, status: 'abandonado', startDate: '2025-10-01', endDate: '2025-11-03', format: 'kindle', currentPercent: 38, genre: 'Biografia', dropReason: 'Longo demais para o momento.' }),
    v1('gerente', { title: 'O Gerente Minuto', authors: 'Ken Blanchard, Spencer Johnson', pages: 112, startDate: '2025-11-20', endDate: '2025-11-28', rating: 3, genre: 'Gestão' }),
    v1('duna', { title: 'Duna', authors: 'Frank Herbert', pages: 680, startDate: '2026-01-03', endDate: '2026-02-14', rating: 5, genre: 'Ficção', favorite: true }),
    v1('messias', { title: 'O Messias de Duna', authors: 'Frank Herbert', pages: 288, startDate: '2026-02-20', endDate: '2026-03-10', rating: 4, genre: 'Ficção' }),
    v1('casmurro-2', { title: 'Dom Casmurro', authors: 'Machado de Assis', pages: 256, startDate: '2026-04-01', endDate: '2026-04-18', rating: 5, genre: 'Ficção', reread: true }),
    v1('pai-rico', { title: 'Pai Rico, Pai Pobre', authors: 'Robert T. Kiyosaki', pages: 336, startDate: '2026-05-05', endDate: '2026-05-25', format: 'kindle', rating: 2, genre: 'Desenvolvimento pessoal' }),
    v1('torto', { title: 'Torto Arado', authors: 'Itamar Vieira Junior', pages: 264, startDate: '2026-06-10', endDate: '2026-07-02', rating: 5, genre: 'Ficção' }),
    v1('clean', { title: 'Código Limpo', authors: 'Robert C. Martin', pages: 425, startDate: '2026-08-01', endDate: '2026-09-05', format: 'kindle', rating: 4, genre: 'Técnico' }),
    v1('rapido', { title: 'Rápido e Devagar', authors: 'Daniel Kahneman', pages: 608, status: 'abandonado', startDate: '2026-03-12', endDate: '2026-03-30', format: 'kindle', currentPercent: 15, genre: 'Desenvolvimento pessoal', dropReason: 'Denso demais.' }),
    v1('1984', { title: '1984', authors: 'George Orwell', pages: 416, status: 'lendo', startDate: '2026-09-20', currentPage: 120 }),
    v1('poder', { title: 'O Poder do Hábito', authors: 'Charles Duhigg', pages: 408, status: 'lendo', startDate: '2026-09-25', format: 'kindle', currentPercent: 22, genre: 'Desenvolvimento pessoal' }),
    v1('cem-anos', { title: 'Cem Anos de Solidão', authors: 'Gabriel García Márquez', pages: 448, status: 'quero', genre: 'Ficção' }),
    v1('arte-guerra', { title: 'A Arte da Guerra', authors: 'Sun Tzu', pages: 112, status: 'quero', format: 'kindle', genre: 'Filosofia' }),
    v1('mindset', { title: 'Mindset', authors: 'Carol S. Dweck', pages: 312, status: 'quero', genre: 'Desenvolvimento pessoal' }),
    v1('karamazov', { title: 'Os Irmãos Karamázov', authors: 'Fiódor Dostoiévski', pages: 1024, status: 'quero', genre: 'Ficção' }),
  ],
  goals: { 2025: 10, 2026: 12 },
  defaultGoal: 12,
  customGenres: [],
  lastBackupAt: '2026-08-01T22:10:00.000Z',
};

try {
  step('primeira abertura da 1.3 com os dados da 1.2.4');
  await p.clock.install({ time: new Date('2026-09-28T21:30:00') });
  await p.goto(`${BASE}manifest.webmanifest`);
  await p.evaluate((d) => localStorage.setItem('leituras:v1', JSON.stringify(d)), legacy);
  await p.goto(BASE);
  await p.waitForSelector('.hero');
  assert.equal(await p.evaluate(() => localStorage.getItem('leituras:v1')), null, 'migrou para o IndexedDB');
  assert.equal(await text('.ring-count'), '6');
  assert.equal(await p.locator('.reading').count(), 2);
  noErrors('abertura');

  step('duas semanas atualizando a página pelo cartão do Início');
  await updateCard('1984', 160, /Página atualizada/);
  await updateCard('Poder do Hábito', 30, /Progresso atualizado/);
  for (const [d, pg, pct] of [['2026-09-29', 205, 34], ['2026-09-30', 240, null], ['2026-10-01', 268, 41], ['2026-10-02', null, 47], ['2026-10-04', 300, 55], ['2026-10-05', 340, 58]]) {
    await day(d);
    if (pg) await updateCard('1984', pg, /Página atualizada/);
    if (pct) await updateCard('Poder do Hábito', pct, /Progresso atualizado/);
  }
  assert.match(await text('.reading:has-text("1984") .rn-progress'), /^pág\. 340 de \d+ · termina ~\d+ out$/);
  noErrors('cartão');

  step('cronômetro: 25 minutos no 1984');
  await day('2026-10-06', '20:00');
  await p.click('.reading:has-text("1984") .btn-timer');
  await onPage('ler');
  await p.clock.fastForward('25:00');
  await p.click('[data-action="timer-stop"]');
  await p.fill('#timer-input', '372');
  await p.click('.timer-stop button[type="submit"]');
  await onPage('inicio');
  assert.equal(await toast(), '25 min · 32 págs. · 77 págs./hora');

  step('Concluir: título da tela, meia estrela, gênero novo e o aviso do marco');
  await day('2026-10-07', '22:40');
  await fromMenu('.reading:has-text("1984")', 'Concluir');
  await onPage('livro');
  assert.equal(await text('.form-title'), 'Concluir leitura');
  await p.click('.star-slot:nth-child(5) .star-hit.left');
  await p.click('[data-action="open-genre"]');
  await p.fill('#new-genre', 'Distopia');
  await p.press('#new-genre', 'Enter');
  await p.click('.form-top button[type="submit"]');
  await onPage('inicio');
  // Sem dois-pontos duplos ("Marco alcançado: Novo gênero: Distopia").
  assert.equal(await toast(), 'Marco alcançado: primeiro livro de Distopia');
  assert.equal(await text('.ring-count'), '7');
  const b1984 = (await readState()).books.find((b) => b.id === '1984');
  assert.equal(b1984.rating, 4.5);
  assert.equal(b1984.journal.length, 8, 'um registro por dia de leitura');
  assert.equal(b1984.journal.find((e) => e.date === '2026-10-06').minutes, 25);
  noErrors('concluir');

  step('etiquetas, série, trechos, próximas e meta de páginas');
  await go('#/livro/duna');
  await onPage('livro');
  assert.equal(await text('.form-title'), 'Editar livro');
  await p.fill('#f-series', 'Duna');
  await p.fill('#f-series-n', '1');
  await p.fill('#f-tag', 'ficção científica, clássico,');
  await p.click('.form-top button[type="submit"]');
  await waitToast(/Alterações salvas/);
  await go('#/livro/poder?aba=trechos');
  await p.waitForSelector('[data-action="quote-new"]');
  await p.click('[data-action="quote-new"]');
  await p.fill('#q-text', 'A mudança pode não ser rápida e nem sempre fácil.');
  await p.fill('#q-pos', '58');
  await p.click('.quote-form button[type="submit"]');
  await waitToast(/Trecho salvo/);
  await go('#/estante?aba=quero');
  for (const t of ['Cem Anos', 'Mindset', 'Karamázov']) await fromMenu(`.book-row:has-text("${t}")`, 'toggle-next');
  await p.click('.book-row:has-text("Karamázov") [data-action="move-next"][data-delta="-1"]');
  await p.click('.book-row:has-text("Karamázov") [data-action="move-next"][data-delta="-1"]');
  assert.deepEqual((await readState()).upNext, ['karamazov', 'cem-anos', 'mindset']);
  await go('#/ajustes');
  await p.fill('#page-goal-input', '6000');
  await p.press('#page-goal-input', 'Enter');
  await waitToast(/Meta de páginas salva/);
  noErrors('organização');

  step('os números batem entre Início, Resumo, Estante, Todos os anos e Retrospectiva');
  await day('2026-10-18', '10:00');
  await go('#/inicio');
  await onPage('inicio');
  const count = await text('.ring-count');
  const homeTiles = await p.$$eval('.bento .tile:not(.hero) .tile-value', (els) => els.map((e) => e.textContent.trim()));
  await p.click('#nav [data-nav="resumo"]');
  await onPage('resumo');
  const kpis = await p.$$eval('.tiles-2 .tile-value', (els) => els.map((e) => e.textContent.trim()));
  assert.deepEqual([kpis[0].split(' ')[0], ...kpis.slice(1)], [count, ...homeTiles]);
  await go('#/estante?aba=lido');
  assert.match(await text('.year-head:has-text("2026")'), new RegExp(`^2026 ${count} livros$`));
  await go('#/resumo/todos');
  assert.ok((await p.$$eval('.cmp-row', (els) => els.map((e) => e.innerText.replace(/\s+/g, ' ')))).includes(`2026 ${count}`));
  await go('#/retro/2026');
  await onPage('retro');
  await p.click('[data-action="retro-next"]');
  // Frase nova com maiúscula, como na imagem: "7 livros. Meta: 12." (antes: "livros. de 12 da meta.").
  assert.equal(await text('.slide .retro-line'), 'livros. Meta: 12.');
  assert.equal(await text('.slide .retro-huge'), count);
  noErrors('números');

  step('toque num gráfico abre a Buscar filtrada');
  await go('#/resumo/2026');
  await p.click('.bars-rating [data-action="chart-filter"]');
  await onPage('buscar');
  assert.equal(await text('.filter-chip-text'), 'Filtro: nota 2 em 2026');
  assert.equal(await text('#search-results > .muted'), '1 livro encontrado');
  await p.click('[data-action="clear-chart-filter"]');

  step('livro do ano com título longo e anotação (slide mais alto da retrospectiva)');
  await go('#/livro/duna');
  await onPage('livro');
  await p.fill('#f-title', 'Duna: edição especial de colecionador com ilustrações e notas do tradutor');
  await p.fill('#f-notes', 'Uma saga sobre poder, religião e ecologia que continua atual depois de sessenta anos; cada releitura mostra uma camada nova da história.');
  await p.click('.form-top button[type="submit"]');
  await waitToast(/Alterações salvas/);

  step('nada cortado nas larguras de iPhone (e em 320)');
  for (const [w, h] of [[430, 932], [390, 844], [390, 664], [375, 667], [320, 568]]) {
    await p.setViewportSize({ width: w, height: h });
    await go('#/buscar');
    await p.selectOption('[data-filter="status"]', 'lido');
    assert.deepEqual(await cutSelects(), [], `filtros da Buscar em ${w}px`);
    await p.click('[data-action="clear-filters"]');
    await go('#/resumo/todos');
    await p.selectOption('[data-change="compare-b"]', '2025');
    assert.deepEqual(await cutSelects(), [], `anos de Comparar anos em ${w}px`);
    await go('#/livro/poder?aba=diario');
    await p.waitForSelector('.diary-summary');
    assert.deepEqual(await brokenWords('.diary-summary .tile-label'), [], `resumo do diário em ${w}px`);
    await go('#/inicio');
    await go('#/retro/2026');
    // Mosaico de 7 capas (3 linhas), livro do ano com título longo: cada slide cabe na tela, sem rolar.
    const slides = await p.locator('.segments .seg').count();
    for (let i = 0; i < slides; i += 1) {
      assert.ok(await scrolls() <= 0, `slide ${i + 1} da retrospectiva rola em ${w}×${h}: ${await text('.slide')}`);
      if (w === 375 && (i === 0 || i === slides - 1)) await shot(`retro-${i}-375x667`, false);
      await p.click('[data-action="retro-next"]');
    }
  }
  await p.setViewportSize({ width: 390, height: 844 });
  noErrors('larguras');

  step('backup e planilha, apagar tudo (anel vazio sem ponto) e importar');
  await go('#/ajustes');
  await onPage('ajustes');
  const before = await readState();
  const dl = p.waitForEvent('download');
  await p.click('[data-action="export-backup"]');
  const backupPath = join(SHOTS, 'final-backup.json');
  await (await dl).saveAs(backupPath);
  const csvDl = p.waitForEvent('download');
  await p.click('[data-action="export-csv"]');
  assert.match((await csvDl).suggestedFilename(), /\.csv$/);
  await p.click('[data-action="wipe-data"]');
  await onPage('inicio');
  assert.equal(await text('.ring-count'), '0');
  assert.equal(await p.locator('.ring-progress').count(), 0, 'sem livros, sem o arco (que virava um ponto)');
  await go('#/ajustes');
  await p.setInputFiles('[data-import]', backupPath);
  await waitToast(/Backup importado/);
  const after = await readState();
  assert.deepEqual({ ...after, lastBackupAt: null }, { ...before, lastBackupAt: null }, 'o backup devolve tudo');
  await go('#/inicio');
  assert.equal(await text('.ring-count'), count);
  noErrors('backup');

  console.log('\nConferência final: tudo certo.');
} catch (err) {
  console.error(`\n✗ ${err.message}`);
  if (errors.length) console.error(`  erros: ${errors.join(' | ')}`);
  await shot('falha').catch(() => {});
  process.exitCode = 1;
} finally {
  await browser.close();
  server.close();
}
