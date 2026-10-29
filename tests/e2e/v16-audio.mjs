// Teste de ponta a ponta da 1.6: formato Audiolivro.
// 1. cadastrar um audiolivro (formato, duração e tempo ouvido em h + min);
// 2. cartão do Início com os fones e "1h 5min de 10h 25min";
// 3. folha "Registrar leitura" em tempo: atalhos +15 min/+30 min/+1h, régua, validação e diário em minutos;
// 4. ficha e aba Diário em horas e minutos; "Ouvir agora" (cronômetro) com o Parar em h + min;
// 5. terminar o audiolivro (o diário fecha na duração);
// 6. Resumo: "Horas ouvidas", Audiolivro na barra de formatos e no Ritmo; Início com as horas;
// 7. "Voltar para Quero ler" zera o tempo ouvido.
// Em 320, 390 e 430 px, claro e escuro; capturas em tests/e2e/screens/v16-audio-*.png.
// Uso: node tests/e2e/v16-audio.mjs   (precisa do Playwright, como o smoke.mjs)

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
const step = (msg) => console.log(`• ${msg}`);

// ---------- Dados de exemplo ----------

const TS = '2026-01-01T00:00:00.000Z';
const base = { authors: 'Autor', format: 'fisico', genre: 'Ficção', tags: [], quotes: [], journal: [], createdAt: TS, updatedAt: TS, favorite: false, notes: '', isbn: '', rating: null, cover: null };
const m = (date, from, to, extra = {}) => ({ date, from, to, unit: 'minute', note: '', ...extra });
const SEED = {
  version: 2, goals: { 2026: 12 }, defaultGoal: 12, customGenres: [], lastBackupAt: '2026-10-20T10:00:00.000Z', pageGoals: {}, upNext: [],
  books: [
    { ...base, id: 'p1', title: 'Dom Casmurro', authors: 'Machado de Assis', pages: 256, status: 'lido', startDate: '2026-02-01', endDate: '2026-02-20', rating: 5 },
    { ...base, id: 'k1', title: 'Fora de Série', authors: 'Malcolm Gladwell', pages: 304, format: 'kindle', status: 'lido', startDate: '2026-04-01', endDate: '2026-04-18', rating: 4 },
    { ...base, id: 'a1', title: 'Sapiens', authors: 'Yuval Noah Harari', pages: 464, format: 'audio', durationMin: 930, status: 'lido', startDate: '2026-05-02', endDate: '2026-05-30', rating: 4.5, genre: 'História' },
    { ...base, id: 'a2', title: 'Torto Arado', authors: 'Itamar Vieira Junior', pages: null, format: 'audio', durationMin: 720, status: 'lendo', startDate: '2026-10-18', currentMin: 300,
      journal: [m('2026-10-20', 0, 90), m('2026-10-22', 90, 180, { minutes: 50 }), m('2026-10-24', 180, 240), m('2026-10-26', 240, 300)] },
  ],
};

const browser = await playwright.chromium.launch();
const context = await browser.newContext({
  viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, locale: 'pt-BR',
});
await context.route(/^https:\/\//, (r) => r.abort());
const page = await context.newPage();
const NOW = new Date('2026-10-27T12:00:00');
await page.clock.setFixedTime(NOW);

const errors = [];
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
page.on('console', (msg) => { if (msg.type() === 'error' && !/Failed to load resource/.test(msg.text())) errors.push(`console: ${msg.text()}`); });
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
  throw new Error(`Estado salvo não chegou ao esperado: ${JSON.stringify(last)?.slice(0, 400)}`);
}
const bookIn = (s, id) => s.books.find((b) => b.id === id);
const byTitle = (s, t) => s.books.find((b) => b.title === t);
const onPage = (name) => page.waitForFunction((n) => document.getElementById('app').dataset.page === n, name);
const toastHas = (re) => page.waitForFunction((src) => new RegExp(src).test(document.getElementById('toast').textContent), re.source);
const text = async (sel) => (await page.textContent(sel)).replace(/\s+/g, ' ').trim();
const openSheet = '.sheet-layer.is-open';
const sheetGone = () => page.waitForSelector('.sheet-layer', { state: 'detached', timeout: 5000 });

async function setTheme(scheme) {
  await page.emulateMedia({ colorScheme: scheme });
  await page.waitForFunction((s) => document.documentElement.dataset.theme === s, scheme);
}

/** Sobra à direita, campos com letra < 16px (zoom no iPhone) e alvos de toque pequenos no trecho. */
async function layoutProblems(label, scope) {
  return page.evaluate(([lbl, sel]) => {
    const out = [];
    const overflow = document.documentElement.scrollWidth - window.innerWidth;
    if (overflow > 0) out.push(`${lbl}: ${overflow}px sobrando à direita`);
    const root = sel ? document.querySelector(sel) : document;
    if (!root) return out;
    const small = [...root.querySelectorAll('input, select, textarea')]
      .filter((el) => el.offsetParent && el.type !== 'range' && parseFloat(getComputedStyle(el).fontSize) < 16).map((el) => el.outerHTML.slice(0, 60));
    if (small.length) out.push(`${lbl}: campos < 16px: ${small.join(' | ')}`);
    const tiny = [...root.querySelectorAll('button, [data-time-part]')]
      .filter((el) => el.offsetParent && el.getBoundingClientRect().height < 26).map((el) => el.outerHTML.slice(0, 60));
    if (tiny.length) out.push(`${lbl}: alvos pequenos: ${tiny.join(' | ')}`);
    // Nada do audiolivro pode passar da borda do próprio cartão.
    for (const el of root.querySelectorAll('.time-field, .chip-audio, .bento-heard, .fmt-label, .rn-progress')) {
      const r = el.getBoundingClientRect();
      if (r.width && (r.right > window.innerWidth + 0.5 || r.left < -0.5)) out.push(`${lbl}: ${el.className} fora da tela`);
    }
    return out;
  }, [label, scope]);
}

/** Capturas em 320, 390 e 430 px, claro e escuro (prepare() roda depois de cada troca). */
async function shots(name, prepare = async () => {}, { scope = null, fullPage = false } = {}) {
  await page.evaluate(() => document.getElementById('toast').classList.remove('show'));
  const problems = [];
  for (const width of [320, 390, 430]) {
    await page.setViewportSize({ width, height: width === 320 ? 640 : 844 });
    for (const scheme of ['light', 'dark']) {
      await setTheme(scheme);
      await prepare();
      await page.waitForTimeout(120);
      problems.push(...await layoutProblems(`${name} ${width} ${scheme}`, scope));
      await page.screenshot({ path: join(SHOTS, `v16-audio-${name}-${scheme === 'light' ? 'claro' : 'escuro'}-${width}.png`), fullPage });
    }
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await setTheme('dark');
  assert.deepEqual(problems, [], 'layout');
}

const scrollTo = (sel, offset = 80) => page.evaluate(([s, o]) => {
  window.scrollTo(0, 0);
  const el = document.querySelector(s);
  if (el) window.scrollTo(0, el.getBoundingClientRect().top + window.scrollY - o);
}, [sel, offset]);

const timeValue = (prefix) => page.evaluate((p) => [document.getElementById(p).value, document.getElementById(`${p}-min`).value], prefix);

try {
  await page.goto(BASE);
  await page.waitForSelector('#app[data-page]');
  await writeState(SEED);
  await page.reload();
  await page.waitForSelector('.reading');
  await setTheme('dark');

  // ---------- 1. Cadastro ----------
  step('cadastro: formato com três opções; Audiolivro mostra a duração e o tempo ouvido em h + min');
  await page.goto(`${BASE}#/novo?status=lendo`);
  await onPage('novo');
  const formats = await page.$$eval('[data-action="set-format"]', (els) => els.map((e) => e.textContent.trim()));
  assert.deepEqual(formats, ['Físico', 'Kindle', 'Audiolivro']);
  assert.equal(await page.locator('#f-duration').count(), 0, 'físico: sem duração');
  await page.fill('#f-title', 'O Hobbit');
  await page.locator('#f-title').dispatchEvent('input');
  await page.click('[data-action="set-format"][data-value="audio"]');
  await page.waitForSelector('#f-duration');
  assert.equal(await page.getAttribute('#f-duration', 'inputmode'), 'numeric');
  assert.equal(await page.getAttribute('#f-duration-min', 'inputmode'), 'numeric');
  assert.match(await text('label[for="f-current"]'), /Tempo ouvido/);
  await page.fill('#f-duration', '10');
  await page.fill('#f-duration-min', '25');
  await page.fill('#f-current', '1');
  await page.fill('#f-current-min', '5');
  assert.match(await text('#reading-summary'), /10%/);
  await shots('formulario', () => scrollTo('#f-status', 60), { scope: '#book-form' });
  await page.click('.form-actions .btn-primary');
  await onPage('inicio');
  let s = await waitState((st) => byTitle(st, 'O Hobbit'));
  const hobbit = byTitle(s, 'O Hobbit');
  assert.equal(hobbit.format, 'audio');
  assert.equal(hobbit.durationMin, 625);
  assert.equal(hobbit.currentMin, 65);
  assert.equal(hobbit.currentPage, null);
  assert.deepEqual(hobbit.journal, [], 'livro novo: a posição informada é o ponto de partida');

  // ---------- 2. Início ----------
  step('Início: fones de ouvido e "1h 5min de 10h 25min"; previsão do Torto Arado em minutos');
  const hobbitCard = page.locator('.reading:has-text("O Hobbit")');
  assert.equal(await hobbitCard.locator('.rn-progress .icon-audio').count(), 1);
  assert.match(await hobbitCard.locator('.rn-progress').textContent(), /1h 5min de 10h 25min/);
  assert.match(await hobbitCard.locator('.btn-timer .sr-only').textContent(), /Ouvir agora/);
  const arado = page.locator('.reading:has-text("Torto Arado")');
  // 300 min em 4 dias de escuta = 75 min/dia; faltam 420 → 6 dias.
  assert.match(await arado.locator('.rn-progress').textContent(), /5h de 12h · termina ~2 nov/);
  assert.match(await text('.bento-pages'), /h ouvidas/);
  await shots('inicio', () => scrollTo('.section .reading', 120), { scope: '#app' });

  // ---------- 3. Folha ----------
  step('folha "Registrar leitura": h + min, atalhos de tempo, régua e diário em minutos');
  await arado.locator('[data-action="update-page"]').click();
  await page.waitForSelector(`${openSheet} .psheet`);
  assert.equal(await page.evaluate(() => document.activeElement.id), 'progress-h');
  assert.match(await text('.psheet .progress-edit-label'), /Quanto você já ouviu\?/);
  assert.deepEqual(await page.$$eval('.psheet-chip', (els) => els.map((e) => e.textContent.trim())), ['+15 min', '+30 min', '+1h']);
  assert.match(await text('.psheet-head'), /Ritmo: 1h 15min\/dia/);
  assert.match(await text('.psheet-field'), /de 12h/);
  assert.deepEqual(await timeValue('progress-h'), ['5', '00']);
  await page.click('[data-action="progress-add"][data-delta="15"]');
  assert.deepEqual(await timeValue('progress-h'), ['5', '15']);
  await page.click('[data-action="progress-add"][data-delta="60"]');
  assert.deepEqual(await timeValue('progress-h'), ['6', '15']);
  assert.equal(await page.inputValue('#progress-range'), '375');
  await page.fill('#progress-range', '400');
  assert.deepEqual(await timeValue('progress-h'), ['6', '40']);
  await page.fill('#progress-h-min', '50');
  assert.equal(await page.inputValue('#progress-range'), '410');
  await shots('folha', async () => {}, { scope: '.sheet' });
  // Passa da duração: recusa e a folha continua aberta.
  await page.fill('#progress-h', '13');
  await page.press('#progress-h', 'Enter');
  await toastHas(/entre 0 e 12h/);
  assert.equal(await page.locator(`${openSheet} .psheet`).count(), 1);
  await page.fill('#progress-h', '6');
  await page.fill('#progress-h-min', '40');
  await page.press('#progress-h-min', 'Enter');
  await sheetGone();
  s = await waitState((st) => bookIn(st, 'a2').currentMin === 400);
  assert.deepEqual(bookIn(s, 'a2').journal.at(-1), { date: '2026-10-27', from: 300, to: 400, unit: 'minute', note: '' });
  assert.match(await arado.locator('.rn-progress').textContent(), /6h 40min de 12h/);

  // ---------- 4. Ficha, diário e cronômetro ----------
  step('ficha: progresso em tempo, ritmo em min/dia, chip Audiolivro com fones');
  await page.goto(`${BASE}#/livro/a2`);
  await page.waitForSelector('.ficha-hero[data-id="a2"]');
  assert.match(await text('.ficha-progress'), /56%\s*6h 40min de 12h/);
  assert.match(await text('.ficha-pace'), /min\/dia/);
  assert.match(await text('.ficha-author'), /Itamar Vieira Junior · 12h/);
  assert.equal(await page.locator('.ficha-chip.chip-audio .icon-audio').count(), 1);
  assert.match(await text('.ficha-card .btn-timer'), /Ouvir agora/);
  assert.match(await text('.rchart-range'), /min por dia/);
  await shots('ficha', () => scrollTo('.ficha-card', 70), { scope: '.ficha-card' });

  step('aba Diário: dias em tempo ouvido e correção em "1h 20min"');
  await page.goto(`${BASE}#/livro/a2/editar?aba=diario`);
  await page.waitForSelector('.diary-summary');
  assert.match(await text('.diary-summary'), /5\s*dias ouvindo\s*6h 40min\s*ouvidos\s*1h 20min\s*por dia ouvindo/);
  assert.match(await text('.diary-entry:first-child .diary-line'), /5h → 6h 40min\s*\+1h 40min/);
  await page.click('.diary-entry:first-child .diary-row');
  await page.waitForSelector('[data-diary-form]');
  assert.equal(await page.inputValue('#d-to'), '6h 40min');
  await page.fill('#d-to', '6:45');
  await page.click('[data-diary-form] button[type="submit"]');
  s = await waitState((st) => bookIn(st, 'a2').journal.at(-1).to === 405);
  assert.equal(bookIn(s, 'a2').currentMin, 405, 'corrigir o último dia acerta a posição');

  step('Ouvir agora: cronômetro com o Parar em h + min');
  await page.goto(`${BASE}#/inicio`);
  await onPage('inicio');
  await page.locator('.reading:has-text("Torto Arado") .btn-timer').click();
  await page.waitForSelector('.timer-clock');
  assert.match(await text('.top .eyebrow'), /Ouvindo agora/);
  await page.clock.setFixedTime(new Date(NOW.getTime() + 20 * 60000));
  await page.click('[data-action="timer-stop"]');
  await page.waitForSelector('[data-timer-form]');
  assert.match(await text('.timer-stop-label'), /Em que ponto do áudio você parou\?/);
  assert.deepEqual(await timeValue('timer-h'), ['6', '45']);
  assert.equal(await page.evaluate(() => document.activeElement.id), 'timer-h');
  await shots('cronometro', async () => {}, { scope: '.timer-controls' });
  await page.fill('#timer-h', '7');
  await page.fill('#timer-h-min', '15');
  await page.click('.timer-stop .btn-primary');
  await toastHas(/20 min · 30 min ouvidos/);
  s = await waitState((st) => bookIn(st, 'a2').currentMin === 435);
  const noHours = ({ hours, ...rest }) => rest;
  const sessionHoursOf = bookIn(s, 'a2').journal.at(-1).hours;
  assert.equal(Object.values(sessionHoursOf || {}).reduce((a, b) => a + b, 0), 20, 'as horas do dia somam os 20 min da sessão');
  assert.deepEqual(noHours(bookIn(s, 'a2').journal.at(-1)), { date: '2026-10-27', from: 300, to: 435, unit: 'minute', note: '', minutes: 20 });

  // ---------- 5. Terminar ----------
  step('Terminei o livro: o diário fecha na duração (12h)');
  await onPage('inicio');
  await page.locator('.reading:has-text("Torto Arado") [data-action="update-page"]').click();
  await page.waitForSelector(`${openSheet} .psheet`);
  await page.click('[data-action="progress-finish"]');
  await page.waitForFunction(() => /concluir=1/.test(location.hash) && document.querySelector('.form-title'));
  assert.equal(await text('.form-title'), 'Concluir leitura');
  await page.click('.form-actions .btn-primary');
  s = await waitState((st) => bookIn(st, 'a2').status === 'lido');
  assert.equal(bookIn(s, 'a2').currentMin, null);
  assert.equal(bookIn(s, 'a2').durationMin, 720);
  assert.deepEqual(noHours(bookIn(s, 'a2').journal.at(-1)), { date: '2026-10-27', from: 300, to: 720, unit: 'minute', note: '', minutes: 20 });

  // ---------- 6. Estatísticas ----------
  step('Início: horas ouvidas no bloco das páginas (930 + 720 min = 27,5 h)');
  await page.goto(`${BASE}#/inicio`);
  await onPage('inicio');
  assert.match(await text('.bento-heard'), /28 h ouvidas/);
  await shots('bento', () => scrollTo('.bento', 130), { scope: '.bento' });

  step('Todos os anos: horas ouvidas e Audiolivro no formato');
  await page.goto(`${BASE}#/resumo/todos`);
  await page.waitForSelector('.kpi.is-audio');
  assert.match(await text('.kpi.is-audio'), /Horas ouvidas 28\s*h 27h 30min de audiolivro/);
  assert.match(await text('.fmt-labels'), /Audiolivro 50% 2 livros/);

  step('Resumo: "Horas ouvidas", formato com Audiolivro e Ritmo com o tempo ouvido');
  await page.goto(`${BASE}#/resumo/2026`);
  await onPage('resumo');
  const heard = page.locator('.kpi.is-audio');
  assert.match(await heard.textContent(), /Horas ouvidas\s*28\s*h/);
  assert.match(await heard.textContent(), /27h 30min · 2 audiolivros lidos/);
  await shots('resumo', () => scrollTo('.kpis', 70), { scope: '.kpis' });
  await page.click('.rs-tab[data-tab="gostos"]');
  await page.waitForSelector('.rs-panel[data-tab="gostos"] .fmt-card');
  assert.equal(await page.locator('.fmt-bar .split-c').count(), 1);
  assert.match(await text('.fmt-labels'), /Físico 25% 1 livro · 256 págs\. Kindle 25% 1 livro · 304 págs\. Audiolivro 50% 2 livros · 27h 30min ouvidas/);
  assert.match(await page.getAttribute('.fmt-bar', 'aria-label'), /1 físicos, 1 no Kindle e 2 audiolivros/);
  await shots('formatos', () => scrollTo('.fmt-card', 90), { scope: '.fmt-card' });
  await page.click('.rs-tab[data-tab="ritmo"]');
  await page.waitForSelector('.rs-panel[data-tab="ritmo"] .listen-card');
  assert.match(await text('.listen-card'), /Horas ouvidas 27h30\s*no ano\s*2h24\s*por dia ouvindo\s*7h\s*melhor dia\s*27 out/);
  await shots('ritmo', () => scrollTo('.listen-card', 200), { scope: '.listen-card' });

  step('Retrospectiva: horas ouvidas junto das páginas e o audiolivro no formato');
  await page.goto(`${BASE}#/retro/2026`);
  await page.waitForSelector('.retro-mosaic');
  const total = await page.locator('.segments .seg').count();
  const slides = [];
  for (let i = 0; i < total; i += 1) {
    await page.waitForTimeout(250);
    const t = await text('.retro-stage .slide');
    slides.push(t);
    if (/Páginas viradas/.test(t)) await page.screenshot({ path: join(SHOTS, 'v16-audio-retro-paginas-escuro-390.png') });
    if (i < total - 1) await page.click('.tap-next');
  }
  const pagesSlide = slides.find((t) => /Páginas viradas/.test(t));
  assert.match(pagesSlide, /E mais 28 horas ouvindo audiolivros\./);
  assert.match(slides.find((t) => /Formato/.test(t)), /1 físico · 1 no Kindle · 2 audiolivros/);

  // ---------- 7. Voltar para Quero ler ----------
  step('Voltar para Quero ler: o tempo ouvido zera (a duração fica)');
  await page.goto(`${BASE}#/inicio`);
  await onPage('inicio');
  await page.locator('.reading:has-text("O Hobbit") [data-action="quick-menu"]').click();
  await page.waitForSelector(`${openSheet} .qm`);
  assert.match(await text('.qm-list'), /Ouvir agora/);
  await page.click('.qm-item[data-action="pause-reading"]');
  s = await waitState((st) => byTitle(st, 'O Hobbit').status === 'quero');
  assert.equal(byTitle(s, 'O Hobbit').currentMin, null);
  assert.equal(byTitle(s, 'O Hobbit').durationMin, 625);

  assert.deepEqual(errors, [], 'erros no console');
  console.log('OK: v16-audio');
} finally {
  await browser.close();
  server.close();
}
