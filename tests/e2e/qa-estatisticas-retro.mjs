// QA das estatísticas e da retrospectiva com dados difíceis: livro que vira o ano,
// Kindle com e sem nº de páginas, abandonado e em andamento com diário, releitura,
// ano sem livros, títulos longos com acento. Confere que os números batem entre telas.
// Uso: node tests/e2e/qa-estatisticas-retro.mjs   (Playwright global, como o smoke.mjs)

import { execSync } from 'node:child_process';
import { createServer } from 'node:http';
import { mkdirSync, readFileSync, existsSync } from 'node:fs';
import { extname, join, normalize } from 'node:path';
import { createRequire } from 'node:module';
import assert from 'node:assert/strict';
import { pagesReadInYear } from '../../app/js/journal.js';
import { pagesAllTime } from '../../app/js/stats.js';

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
const base = (id, title, extra) => ({
  id, title, authors: 'Autora Exemplo', pages: null, cover: null, isbn: '', format: 'fisico', genre: null, rating: null,
  favorite: false, notes: '', startDate: null, endDate: null, currentPage: null, currentPercent: null,
  dropReason: '', reread: false, series: '', seriesNumber: null, tags: [], targetDate: null, quotes: [], journal: [],
  createdAt: TS, updatedAt: TS, ...extra,
});
const e = (date, from, to, unit = 'page') => ({ date, from, to, unit, note: '' });
const LONG = 'Memórias Póstumas de Brás Cubas: edição comentada e ilustrada com ensaios críticos';

const seed = {
  version: 2,
  goals: { 2026: 6, 2025: 4, 2023: 2 },
  defaultGoal: 6,
  customGenres: [],
  lastBackupAt: '2026-10-10T10:00:00.000Z',
  upNext: [],
  pageGoals: { 2026: 3000 },
  books: [
    base('old', 'Livro de 2023', { status: 'lido', pages: 200, startDate: '2023-03-01', endDate: '2023-03-20', rating: 4, genre: 'Ficção' }),
    base('a25', 'Ensaio sobre a Cegueira', { status: 'lido', pages: 312, startDate: '2025-05-01', endDate: '2025-05-30', rating: 4.5, genre: 'Ficção' }),
    // Começou em dezembro de 2025 e terminou em janeiro de 2026.
    base('virada', 'Virada de Ano', { status: 'lido', pages: 300, startDate: '2025-12-10', endDate: '2026-01-15', rating: 4, genre: 'História',
      journal: [e('2025-12-10', 0, 100), e('2025-12-20', 100, 150), e('2026-01-05', 150, 250), e('2026-01-15', 250, 300)] }),
    // Kindle com total: 20 dias de 5% (soma deve dar 416, não 420).
    base('k416', '1984', { status: 'lido', format: 'kindle', pages: 416, startDate: '2026-04-01', endDate: '2026-04-20', rating: 5, genre: 'Ficção',
      journal: Array.from({ length: 20 }, (_, i) => e(`2026-04-${String(i + 1).padStart(2, '0')}`, i * 5, i * 5 + 5, 'percent')) }),
    base('k0', 'Kindle sem total', { status: 'lido', format: 'kindle', startDate: '2026-05-01', endDate: '2026-05-10', rating: 3.5,
      journal: [e('2026-05-01', 0, 50, 'percent'), e('2026-05-10', 50, 100, 'percent')] }),
    base('nop', 'Sem número de páginas', { status: 'lido', startDate: '2026-06-01', endDate: '2026-06-10', rating: 3 }),
    base('long', LONG, { status: 'lido', pages: 520, startDate: '2026-07-01', endDate: '2026-08-12', rating: 5, favorite: true, genre: 'Ficção',
      notes: 'Ao verme que primeiro roeu as frias carnes do meu cadáver.' }),
    base('reread', 'Ensaio sobre a Cegueira', { status: 'lido', pages: 312, startDate: '2026-09-01', endDate: '2026-09-20', rating: 5, genre: 'Ficção', reread: true }),
    base('drop', 'Abandonado com diário', { status: 'abandonado', pages: 400, startDate: '2026-06-01', endDate: '2026-06-10', dropReason: 'Não prendeu.',
      journal: [e('2026-06-01', 0, 30), e('2026-06-02', 30, 50)] }),
    base('reading', 'Lendo agora', { status: 'lendo', pages: 500, startDate: '2026-10-01', currentPage: 120,
      journal: [e('2026-10-01', 0, 60), e('2026-10-02', 60, 120)] }),
    base('want', 'Quero ler', { status: 'quero', pages: 900 }),
  ],
};
const P = { 2025: pagesReadInYear(seed.books, 2025), 2026: pagesReadInYear(seed.books, 2026), all: pagesAllTime(seed.books) };
const fmt = (n) => n.toLocaleString('pt-BR');

// ---------- Navegador ----------

const browser = await playwright.chromium.launch();
const context = await browser.newContext({
  viewport: { width: 375, height: 812 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, locale: 'pt-BR', acceptDownloads: true,
  // Sem a animação de abertura do Início (os números contariam a partir de 0).
  reducedMotion: 'reduce',
});
const page = await context.newPage();
await page.clock.setFixedTime(new Date('2026-10-18T12:00:00'));
await page.route('https://**', (r) => r.abort());

const STATE_KEY = 'state';
const readState = () => page.evaluate(async (key) => (await import('/js/db.js')).getItem(key), STATE_KEY);
const writeState = (data) => page.evaluate(async ([key, d]) => (await import('/js/db.js')).setItem(key, d), [STATE_KEY, data]);
async function waitState(predicate) {
  let last;
  for (let i = 0; i < 50; i += 1) {
    last = await readState();
    if (last && predicate(last)) return last;
    await page.waitForTimeout(100);
  }
  throw new Error(`Estado salvo não chegou ao esperado: ${JSON.stringify(last)?.slice(0, 300)}`);
}
const errors = [];
page.on('pageerror', (err) => errors.push(`pageerror: ${err.message}`));
page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errors.push(`console: ${m.text()}`); });
page.on('dialog', (d) => d.accept());

const shot = (name, full = true) => page.screenshot({ path: join(SHOTS, `qa-${name}.png`), fullPage: full });
const step = (msg) => console.log(`• ${msg}`);
const onPage = (name) => page.waitForFunction((n) => document.getElementById('app').dataset.page === n, name);
const text = (sel) => page.innerText(sel).then((t) => t.replace(/\s+/g, ' ').trim());
const toastText = () => page.evaluate(() => (document.getElementById('toast').classList.contains('show') ? document.getElementById('toast').textContent.trim() : ''));

async function noOverflow(label) {
  for (const width of [320, 375, 430]) {
    await page.setViewportSize({ width, height: 812 });
    await page.waitForTimeout(30);
    const over = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    assert.ok(over <= 0, `${label}: ${over}px sobrando à direita em ${width}px`);
    const small = await page.evaluate(() => [...document.querySelectorAll('input, select, textarea')]
      .filter((el) => parseFloat(getComputedStyle(el).fontSize) < 16).map((el) => el.outerHTML.slice(0, 60)));
    assert.deepEqual(small, [], `${label}: campos com letra < 16px (zoom no iPhone)`);
  }
  await page.setViewportSize({ width: 375, height: 812 });
}

async function pngSize(path) {
  const b64 = readFileSync(path).toString('base64');
  return page.evaluate((data) => new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve([img.naturalWidth, img.naturalHeight]);
    img.onerror = () => reject(new Error('PNG inválido'));
    img.src = `data:image/png;base64,${data}`;
  }), b64);
}

try {
  await page.goto(BASE);
  await page.waitForSelector('.hero');
  await writeState(seed);
  await page.reload();
  await page.waitForSelector('.hero');
  // Regra das páginas: virada (150 em 2026), Kindle 416 (não 420), 520, releitura 312,
  // abandonado 50 e em andamento 120. Kindle sem total e livro sem nº não somam.
  assert.deepEqual(P, { 2025: 462, 2026: 1568, all: 2230 });

  step('Início: páginas e meta de páginas');
  assert.match(await text('.ring-center'), /^6 de 6$/);
  assert.equal(await page.getAttribute('.hero svg', 'aria-label'), '6 de 6 livros da meta');
  assert.equal(await text('.bento-pages'), `${fmt(P[2026])} de 3.000 págs. ritmo de ~2.000`);
  assert.equal(await page.getAttribute('.hero-pages-track', 'aria-label'), `${fmt(P[2026])} de 3.000 págs. · no ritmo de ~2.000`);
  assert.doesNotMatch(await text('.bento'), /atrasad/i);
  await shot('inicio');
  await noOverflow('início');

  step('Resumo 2026: tile, meses, formato e calendário batem');
  await page.goto(`${BASE}#/resumo/2026`);
  await onPage('resumo');
  assert.match(await text('.tiles-2 .tile >> nth=0'), /^6 \/ 6 livros lidos$/);
  assert.match(await text('.tiles-2 .tile >> nth=1'), new RegExp(`^${fmt(P[2026])} páginas \\(4 com nº de págs\\.\\)$`));
  assert.equal(await page.locator('rect.hm-future').count(), 74, 'dias depois de 18/10 marcados como futuros');
  assert.match(await text('.split-legend-tap'), /Físico 4 livros · 1\.152 págs\. Kindle 2 livros · 416 págs\./);
  await shot('resumo-2026');
  await page.click('[data-action="month-chart-mode"][data-mode="paginas"]');
  await page.waitForFunction(() => /Páginas por mês/.test(document.body.textContent));
  const months = await page.$$eval('.card:has(h2:text("Páginas por mês")) .bar-value', (els) => els.map((x) => Number(x.textContent.trim().replace('.', '')) || 0));
  assert.deepEqual(months, [150, 0, 0, 416, 0, 50, 0, 520, 312, 120, 0, 0]);
  assert.equal(months.reduce((a, b) => a + b, 0), P[2026], 'os meses somam o ano');
  await page.locator('.calendar').screenshot({ path: join(SHOTS, 'qa-calendario-ano.png') });
  await page.click('[data-action="cal-mode"][data-mode="mes"]');
  await page.waitForSelector('.cal-grid');
  await page.setViewportSize({ width: 320, height: 812 });
  await page.locator('.calendar').screenshot({ path: join(SHOTS, 'qa-calendario-mes-320.png') });
  await page.setViewportSize({ width: 375, height: 812 });
  await shot('resumo-2026-paginas');
  await noOverflow('resumo 2026');

  step('Resumo 2025 (livro que virou o ano) e ano sem livros');
  await page.goto(`${BASE}#/resumo/2025`);
  await onPage('resumo');
  assert.match(await text('.tiles-2 .tile >> nth=1'), new RegExp(`^${P[2025]} páginas$`));
  assert.equal(await page.locator('rect.hm-future').count(), 0);
  await page.goto(`${BASE}#/resumo/2024`);
  await onPage('resumo');
  assert.match(await text('.tiles-2'), /^0 \/ 6 livros lidos — páginas/);
  assert.equal(await page.locator('.bars-rating, .split-rows').count(), 0, 'sem gráficos num ano sem livros');
  assert.equal(await page.locator('a[href="#/retro/2024"]').count(), 0);
  await page.goto(`${BASE}#/retro/2024`);
  await onPage('retro');
  assert.match(await text('.retro-stage'), /Nenhum livro concluído ainda\./);

  step('Todos os anos: páginas e comparação');
  await page.goto(`${BASE}#/resumo/todos`);
  await page.waitForSelector('.milestones');
  assert.match(await text('.tiles-2 .tile >> nth=1'), new RegExp(`^${fmt(P.all)} páginas$`));
  const cmp = await page.$$eval('.cmp2-row:not(.cmp2-head)', (rows) => rows.map((r) => [...r.querySelectorAll('.cmp2-value')].map((v) => v.textContent.trim())));
  assert.deepEqual(cmp[1], [fmt(P[2026]), String(P[2025])]);
  assert.match(await text('.milestones'), /Faltam 7\.940 páginas para 10\.000, contando os livros concluídos/);
  await shot('todos');
  await noOverflow('todos os anos');

  step('Retrospectiva 2026: mesmos números; slides cabem na tela de 375×667');
  await page.goto(`${BASE}#/retro/2026`);
  await onPage('retro');
  const total = await page.locator('.segments .seg').count();
  const slides = [];
  for (let i = 0; i < total; i += 1) {
    await page.waitForTimeout(450);
    slides.push(await text('.retro-stage .slide'));
    await shot(`retro-${String(i + 1).padStart(2, '0')}`, false);
    for (const [w, h] of [[375, 667], [430, 932]]) {
      await page.setViewportSize({ width: w, height: h });
      const [dy, dx] = await page.evaluate(() => [document.documentElement.scrollHeight - innerHeight, document.documentElement.scrollWidth - innerWidth]);
      assert.ok(dx <= 0 && dy <= 0, `slide ${i + 1} passa da tela em ${w}×${h}: ${dx}px × ${dy}px`);
    }
    await page.setViewportSize({ width: 375, height: 812 });
    if (i < total - 1) await page.click('.tap-next');
  }
  assert.ok(slides.some((t) => /^EM 2026, ATÉ AGORA, VOCÊ LEU 6 livros\./i.test(t)));
  assert.ok(slides.some((t) => t.includes(`PÁGINAS VIRADAS ${fmt(P[2026])}`)), 'páginas da retrospectiva = Resumo');
  assert.ok(slides.some((t) => /LIVRO DO ANO Memórias Póstumas/.test(t)));

  step('imagem: Story e Quadrado com título longo');
  for (const format of ['story', 'square']) {
    await page.click(`[data-action="retro-format"][data-value="${format}"]`);
    const download = page.waitForEvent('download');
    await page.click('[data-action="retro-save"]');
    const file = await download;
    const path = join(SHOTS, `qa-imagem-${format}.png`);
    await file.saveAs(path);
    assert.deepEqual(await pngSize(path), format === 'square' ? [1080, 1080] : [1080, 1920]);
  }

  step('Buscar: filtro do gráfico + texto; limpar o chip mantém o texto');
  await page.goto(`${BASE}#/resumo/2026`);
  await onPage('resumo');
  await page.click('[data-action="chart-filter"][data-kind="rating"][data-value="5"]');
  await onPage('buscar');
  assert.equal(await text('.filter-chip-text'), 'Filtro: nota 5 em 2026');
  assert.equal(await page.locator('#search-results .book-row').count(), 3);
  await page.fill('#q', 'ensaio');
  await page.waitForFunction(() => document.querySelectorAll('#search-results .book-row').length === 2);
  await page.click('[data-action="clear-chart-filter"]');
  await page.waitForFunction(() => !document.querySelector('.filter-chip'));
  assert.equal(await page.inputValue('#q'), 'ensaio', 'o texto digitado fica');
  assert.equal(await page.locator('#search-results .book-row').count(), 3, 'as duas leituras de Ensaio sobre a Cegueira e o livro "com ensaios"');
  await page.goto(`${BASE}#/inicio`);
  await page.waitForSelector('.hero');
  await page.goto(`${BASE}#/buscar`);
  await onPage('buscar');
  assert.equal(await page.locator('.filter-chip').count(), 0);
  await noOverflow('buscar');

  step('marcos: só ao cruzar; editar e importar não avisam; excluir não quebra');
  const addRead = async (title) => {
    await page.goto(`${BASE}#/novo?status=lido`);
    await onPage('novo');
    await page.fill('#f-title', title);
    await page.locator('#f-title').dispatchEvent('input');
    await page.fill('#f-pages', '100');
    await page.locator('#f-pages').dispatchEvent('input');
    await page.click('#book-form button[type="submit"]');
    await page.waitForFunction(() => document.getElementById('app').dataset.page !== 'novo');
    return toastText();
  };
  assert.equal(await addRead('Nono livro'), 'Livro adicionado.', '9º livro não é marco');
  assert.equal(await addRead('Décimo livro'), 'Marco alcançado: 10º livro');
  const saved = await waitState((st) => st.books.some((b) => b.title === 'Décimo livro'));
  const tenth = saved.books.find((b) => b.title === 'Décimo livro');
  await page.goto(`${BASE}#/livro/${tenth.id}`);
  await onPage('livro');
  await page.click('#book-form button[type="submit"]');
  await page.waitForFunction(() => document.getElementById('app').dataset.page !== 'livro');
  assert.equal(await toastText(), 'Alterações salvas.', 'editar um livro lido não repete o aviso');
  // Backup com mais um livro (o 11º): importar não comemora.
  const backup = { app: 'leituras', schemaVersion: 2, exportedAt: TS, data: { ...saved, books: [...saved.books, base('imp', 'Importado', { status: 'lido', pages: 9000, startDate: '2026-10-01', endDate: '2026-10-01' })] } };
  const backupPath = join(SHOTS, 'qa-backup.json');
  (await import('node:fs')).writeFileSync(backupPath, JSON.stringify(backup));
  await page.goto(`${BASE}#/ajustes`);
  await page.waitForSelector('.storage-info'); // depois do redesenho com o espaço usado
  await page.setInputFiles('[data-import]', backupPath);
  await waitState((st) => st.books.some((b) => b.id === 'imp'));
  assert.equal(await toastText(), 'Backup importado com sucesso.');
  await page.goto(`${BASE}#/livro/imp`);
  await onPage('livro');
  await page.click('[data-action="delete-book"]');
  await page.waitForFunction(() => document.getElementById('app').dataset.page !== 'livro');
  await page.goto(`${BASE}#/resumo/todos`);
  await page.waitForSelector('.milestones');
  assert.match(await text('.milestones'), /10º livro Décimo livro/);
  assert.doesNotMatch(await text('.milestones'), /Importado/);

  assert.deepEqual(errors, []);
  console.log('\nTudo certo. Capturas em tests/e2e/screens/qa-*.png');
} catch (err) {
  await shot('falha').catch(() => {});
  console.error('\nFALHOU:', err.message);
  if (errors.length) console.error(errors.join('\n'));
  process.exitCode = 1;
} finally {
  await browser.close();
  server.close();
}
