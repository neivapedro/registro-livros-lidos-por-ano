// Teste de ponta a ponta da Retrospectiva 2.0 e dos Marcos.
// Uso: node tests/e2e/retro-marcos.mjs   (precisa do Playwright, como o smoke.mjs)
// Capturas em tests/e2e/screens/retro-marcos-*.png

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

// Um ano inteiro (2025) com tudo o que a retrospectiva mostra; 2024 para o histórico;
// 2026 com só 2 livros lidos (retrospectiva bloqueada) e 1 em andamento.
const lidos = [
  ['O Pequeno Príncipe', 'Antoine de Saint-Exupéry', 96, '2024-02-01', '2024-02-03', 5, 'Ficção', 'fisico'],
  ['Mindset', 'Carol S. Dweck', 312, '2024-03-01', '2024-03-25', 4, 'Desenvolvimento pessoal', 'fisico'],
  ['Cem Anos de Solidão', 'Gabriel García Márquez', 448, '2024-05-01', '2024-06-10', 5, 'Ficção', 'fisico'],
  ['A Arte da Guerra', 'Sun Tzu', 160, '2024-07-01', '2024-07-08', 3, 'Filosofia', 'kindle'],
  ['Comece pelo Porquê', 'Simon Sinek', 256, '2024-09-01', '2024-09-20', 4, 'Gestão', 'kindle'],
  ['O Nome do Vento', 'Patrick Rothfuss', 656, '2024-10-01', '2024-12-20', 5, 'Ficção', 'fisico'],
  ['Duna', 'Frank Herbert', 680, '2025-01-02', '2025-01-25', 5, 'Ficção', 'fisico'],
  ['O Hobbit', 'J. R. R. Tolkien', 310, '2025-01-26', '2025-02-08', 4, 'Ficção', 'kindle'],
  ['Sapiens', 'Yuval Noah Harari', 464, '2025-02-10', '2025-02-27', 5, 'História', 'fisico'],
  ['Essencialismo', 'Greg McKeown', 272, '2025-03-01', '2025-03-06', 4, 'Gestão', 'fisico'],
  ['A Revolução dos Bichos', 'George Orwell', 152, '2025-03-07', '2025-03-09', 4, 'Ficção', 'kindle'],
  ['O Alienista', 'Machado de Assis', 96, '2025-03-12', '2025-03-12', 4, 'Ficção', 'fisico'],
  ['1984', 'George Orwell', 416, '2025-03-13', '2025-03-30', 5, 'Ficção', 'kindle'],
  ['Meditações', 'Marco Aurélio', 254, '2025-04-02', '2025-04-20', 4, 'Filosofia', 'fisico'],
  ['Steve Jobs', 'Walter Isaacson', 624, '2025-05-01', '2025-05-30', 4, 'Biografia', 'fisico'],
  ['O Poder do Hábito', 'Charles Duhigg', 408, '2025-06-02', '2025-06-25', 4, 'Desenvolvimento pessoal', 'fisico'],
  ['Rápido e Devagar', 'Daniel Kahneman', 608, '2025-07-01', '2025-07-31', 5, 'Desenvolvimento pessoal', 'fisico'],
  ['Dom Casmurro', 'Machado de Assis', 256, '2025-08-03', '2025-08-20', 4, 'Ficção', 'fisico'],
  ['A Meta', 'Eliyahu M. Goldratt', 384, '2025-09-01', '2025-09-21', 5, 'Gestão', 'fisico'],
  ['Memórias Póstumas de Brás Cubas', 'Machado de Assis', 368, '2025-10-01', '2025-10-19', 4, 'Ficção', 'fisico'],
  ['O Modelo Toyota', 'Jeffrey K. Liker', 320, '2025-11-02', '2025-11-24', 4, 'Gestão', 'fisico'],
  ['Uma Breve História do Tempo', 'Stephen Hawking', 256, '2025-12-01', '2025-12-15', 4, 'Ciência', 'kindle'],
  ['Hábitos Atômicos', 'James Clear', 320, '2026-02-01', '2026-02-20', 5, 'Desenvolvimento pessoal', 'kindle'],
  ['Fora de Série', 'Malcolm Gladwell', 304, '2026-05-01', '2026-05-22', 4, 'Gestão', 'fisico'],
];
// Diário: 5 dias seguidos lendo 1984 no Kindle (a maior sequência de 2025).
const journal1984 = [
  ['2025-03-13', 0, 20], ['2025-03-14', 20, 45], ['2025-03-15', 45, 60], ['2025-03-16', 60, 80], ['2025-03-17', 80, 100],
].map(([date, from, to]) => ({ date, from, to, unit: 'percent', note: '' }));

const seed = {
  version: 2,
  goals: { 2024: 6, 2025: 12, 2026: 12 },
  defaultGoal: 12,
  customGenres: ['Ciência'],
  lastBackupAt: '2026-10-10T10:00:00.000Z',
  upNext: [],
  pageGoals: {},
  books: lidos.map(([title, authors, pages, startDate, endDate, rating, genre, format], i) => ({
    id: `b${i}`, title, authors, pages, startDate, endDate, rating, genre, format,
    status: 'lido', favorite: title === 'A Meta', notes: title === 'A Meta' ? 'A restrição dita o ritmo do sistema inteiro.' : '',
    cover: null, isbn: '', journal: title === '1984' ? journal1984 : [],
    createdAt: '2024-01-01T00:00:00.000Z', updatedAt: `2024-01-01T00:00:${String(i).padStart(2, '0')}.000Z`,
  })).concat([
    // Abandonado enorme: não pode aparecer como "o mais longo".
    {
      id: 'ab1', title: 'Guerra e Paz', authors: 'Liev Tolstói', pages: 1200, status: 'abandonado', dropReason: 'Longo demais.',
      startDate: '2025-04-01', endDate: '2025-04-15', format: 'fisico', genre: 'Ficção', createdAt: '2025-04-01T00:00:00.000Z',
    },
    {
      id: 'r1', title: 'Antifrágil', authors: 'Nassim Nicholas Taleb', pages: 480, status: 'lendo', currentPage: 300,
      startDate: '2026-09-20', format: 'fisico', genre: 'Filosofia', createdAt: '2026-09-20T00:00:00.000Z',
    },
  ]),
};

const browser = await playwright.chromium.launch();
const context = await browser.newContext({
  viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, locale: 'pt-BR',
  acceptDownloads: true,
});
const page = await context.newPage();
await page.clock.setFixedTime(new Date('2026-10-16T12:00:00'));

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
await page.route('https://**', (r) => r.abort());

const shot = (name, full = true) => page.screenshot({ path: join(SHOTS, `retro-marcos-${name}.png`), fullPage: full });
const step = (msg) => console.log(`• ${msg}`);
const onPage = (name) => page.waitForFunction((n) => document.getElementById('app').dataset.page === n, name);
// Texto visível, com as quebras de linha viradas em espaço.
const text = (sel) => page.innerText(sel).then((t) => t.replace(/\s+/g, ' ').trim());
// O slide entra com animação de 0,35 s: espera antes da captura.
const settle = () => page.waitForTimeout(450);

async function overflow() {
  return page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
}

/** Tamanho de um PNG baixado, medido carregando a imagem na própria página. */
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
  step('dados de exemplo');
  await page.goto(BASE);
  await page.waitForSelector('.hero');
  await writeState(seed);
  await page.reload();
  await page.waitForSelector('.hero');

  step('retrospectiva bloqueada com menos de 3 livros no ano');
  await page.goto(`${BASE}#/retro/2026`);
  await onPage('retro');
  assert.match(await text('.retro-stage'), /Termine 3 livros para ver sua retrospectiva de 2026/);
  assert.match(await text('.retro-stage'), /Falta 1\./);
  assert.equal(await page.locator('.retro .icon-btn[aria-label="Fechar"]').count(), 1, 'botão de fechar');
  assert.equal(await page.locator('[data-action="retro-save"]').count(), 0, 'sem imagem enquanto bloqueada');
  await settle();
  await shot('00-bloqueada');

  step('Marcos em Todos os anos');
  await page.goto(`${BASE}#/resumo/todos`);
  await page.waitForSelector('.milestones');
  const marcos = await text('.milestones');
  for (const m of ['10º livro', '1º livro', '1.000 páginas', 'Primeiro livro de 500+ páginas', 'Livro lido em um só dia', 'Novo gênero: Ciência']) {
    assert.ok(marcos.includes(m), `marco "${m}" na seção`);
  }
  assert.match(marcos, /O Alienista · 12 mar 2025/);
  assert.match(marcos, /Próximos/i);
  assert.match(marcos, /Falta 1 livro para o 25º/);
  assert.match(marcos, /Faltam [\d.]+ páginas para 10\.000/);
  assert.match(marcos, /E mais 4 gêneros descobertos/, 'só os 3 gêneros mais recentes aparecem');
  assert.equal(await page.locator('.mile.is-next').count(), 2);
  assert.equal(await page.locator('.mile-icon svg').count(), await page.locator('.mile').count(), 'cada marco com ícone');
  await page.locator('.milestones').scrollIntoViewIfNeeded();
  await page.locator('.milestones').screenshot({ path: join(SHOTS, 'retro-marcos-01-marcos.png') });
  for (const width of [320, 430]) {
    await page.setViewportSize({ width, height: 844 });
    assert.ok(await overflow() <= 0, `Todos os anos sobrando à direita em ${width}px`);
  }
  await page.setViewportSize({ width: 390, height: 844 });

  step('números do Resumo de 2025');
  await page.goto(`${BASE}#/resumo/2025`);
  await page.waitForSelector('.bars');
  const tiles = await page.locator('.tiles .tile .tile-value').allTextContents();
  const resumoCount = tiles[0].replace(/\s+/g, ' ').match(/^(\d+)/)[1];
  const resumoPages = tiles[1].trim();
  assert.equal(resumoCount, '16');

  step('retrospectiva de 2025: todos os slides');
  await page.goto(`${BASE}#/retro/2025`);
  await onPage('retro');
  await page.waitForSelector('.retro-mosaic');
  const total = await page.locator('.segments .seg').count();
  assert.equal(total, 10, 'os 10 slides têm dados neste ano');
  const slides = [];
  for (let i = 0; i < total; i += 1) {
    await settle();
    slides.push(await text('.retro-stage .slide'));
    await shot(`slide-${String(i + 1).padStart(2, '0')}`, false);
    assert.ok(await overflow() <= 0, `slide ${i + 1} sobrando à direita`);
    // Todos os slides com a mesma largura (a tela toda) e sem rolagem.
    assert.deepEqual(await page.evaluate(() => [Math.round(document.querySelector('.retro').getBoundingClientRect().width), document.documentElement.scrollHeight]), [390, 844], `largura/altura do slide ${i + 1}`);
    if (i < total - 1) await page.click('.tap-next');
  }
  const [mosaic, count, pages, extremes, month, streak, taste, miles, profile, book] = slides;
  assert.match(mosaic, /Seu 2025 em livros/i);
  assert.match(count, new RegExp(`^Em 2025 você leu ${resumoCount} livros\\.`, 'i'));
  assert.match(count, /Meta cumprida\./i);
  assert.ok(pages.includes(resumoPages), `páginas da retrospectiva (${pages}) = Resumo (${resumoPages})`);
  assert.match(pages, /Sua pilha de livros teria \d+ cm de altura/i);
  assert.match(extremes, /O mais longo Duna 680 páginas/i);
  assert.match(extremes, /O mais curto O Alienista 96 páginas/i);
  assert.doesNotMatch(extremes, /Guerra e Paz/i, 'abandonado não entra');
  assert.match(month, /Seu mês mais forte março 4 livros terminados/i);
  assert.match(streak, /Maior sequência de leitura 5 dias seguidos/i);
  assert.match(taste, /Gênero favorito Ficção/i);
  assert.match(taste, /Autor mais lido (George Orwell|Machado de Assis)/i);
  assert.match(miles, /Marcos de 2025/i);
  assert.match(miles, /10º livro/i);
  assert.match(miles, /Livro lido em um só dia/i);
  assert.match(miles, /gêneros novos/i);
  assert.match(profile, /Seu perfil de leitor Maratonista 3 livros com 500 páginas ou mais\./i);
  assert.match(profile, /Regra:/i);
  assert.match(book, /Livro do ano A Meta/i);
  assert.equal(await page.locator('.retro-mosaic').count(), 0);

  step('mosaico com 12 capas');
  await page.click('.tap-prev');
  for (let i = 0; i < total; i += 1) await page.click('.tap-prev');
  assert.equal(await page.locator('.retro-mosaic .cover').count(), 12);

  step('slides em 320px');
  await page.setViewportSize({ width: 320, height: 640 });
  for (let i = 0; i < total; i += 1) {
    assert.ok(await overflow() <= 0, `slide ${i + 1} sobrando à direita em 320px`);
    if (i === 6) {
      await settle();
      await shot('320-gostos', false);
    }
    await page.click('.tap-next');
  }
  await page.setViewportSize({ width: 390, height: 844 });

  step('imagem: Story e Quadrado');
  assert.equal(await page.getAttribute('[data-action="retro-format"][data-value="story"]', 'aria-pressed'), 'true');
  await page.click('[data-action="retro-format"][data-value="square"]');
  assert.equal(await page.getAttribute('[data-action="retro-format"][data-value="square"]', 'aria-pressed'), 'true');
  await settle();
  await shot('formato-quadrado', false);
  let download = page.waitForEvent('download');
  await page.click('[data-action="retro-save"]');
  let file = await download;
  assert.equal(file.suggestedFilename(), 'leituras-2025-quadrado.png');
  const squarePath = join(SHOTS, 'retro-marcos-imagem-quadrado.png');
  await file.saveAs(squarePath);
  assert.deepEqual(await pngSize(squarePath), [1080, 1080]);

  await page.click('[data-action="retro-format"][data-value="story"]');
  download = page.waitForEvent('download');
  await page.click('[data-action="retro-save"]');
  file = await download;
  assert.equal(file.suggestedFilename(), 'leituras-2025.png');
  const storyPath = join(SHOTS, 'retro-marcos-imagem-story.png');
  await file.saveAs(storyPath);
  assert.deepEqual(await pngSize(storyPath), [1080, 1920]);

  step('concluir pelo cartão: aviso de marco');
  await page.goto(`${BASE}#/inicio`);
  await page.waitForSelector('.reading');
  await page.click('.reading .btn-outline');
  await onPage('livro');
  await page.click('.btn-primary');
  await onPage('inicio');
  await page.waitForFunction(() => document.getElementById('toast').classList.contains('show'));
  assert.equal(await text('#toast'), 'Marco alcançado: 25º livro');
  await shot('toast-marco', false);
  await waitState((s) => s.books.some((b) => b.id === 'r1' && b.status === 'lido'));

  step('editar um livro já lido não repete o aviso');
  await page.waitForFunction(() => !document.getElementById('toast').classList.contains('show'), null, { timeout: 8000 });
  await page.goto(`${BASE}#/livro/r1/editar`);
  await onPage('livro');
  await page.click('.btn-primary');
  await onPage('inicio');
  assert.equal(await text('#toast'), 'Alterações salvas.');

  step('marco alcançado aparece em Todos os anos; 2026 liberado');
  await page.goto(`${BASE}#/resumo/todos`);
  await page.waitForSelector('.milestones');
  assert.match(await text('.milestones'), /25º livro Antifrágil · 16 out 2026/);
  assert.match(await text('.milestones'), /Faltam 25 livros para o 50º/);
  await page.goto(`${BASE}#/retro/2026`);
  await page.waitForSelector('.retro-mosaic');
  assert.equal(await page.locator('.retro-mosaic .cover').count(), 3);
  await settle();
  await shot('2026-abertura', false);

  assert.deepEqual(errors, []);
  console.log('\nTudo certo. Capturas em tests/e2e/screens/retro-marcos-*.png');
} catch (err) {
  await shot('falha').catch(() => {});
  console.error('\nFALHOU:', err.message);
  if (errors.length) console.error(errors.join('\n'));
  process.exitCode = 1;
} finally {
  await browser.close();
  server.close();
}
