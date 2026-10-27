// Teste de ponta a ponta do redesenho 1.4 (Início, Estante, Buscar e navegação):
// mosaico do Início com animação de abertura, folha "Registrar leitura" (página, Kindle em %,
// 100% → Concluir, validação, foco), menu rápido ao tocar e segurar, deslizar na fila,
// Lista | Capas, filtros em chips e a barra de vidro sem cobrir o conteúdo, em 320, 390 e 430px.
// Uso: node tests/e2e/inicio-v14.mjs   (precisa do Playwright; capturas em tests/e2e/screens/v14-*.png)

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

// ---------- Dados ----------

const TS = '2026-01-01T00:00:00.000Z';
const read = (id, title, endDate, extra = {}) => ({
  id, title, authors: `Autor de ${title}`, status: 'lido', startDate: endDate.replace(/-\d\d$/, '-01'), endDate, pages: 300, format: 'fisico',
  rating: 4, genre: 'Ficção', createdAt: TS, updatedAt: TS, ...extra,
});
const want = (id, title, extra = {}) => ({ id, title, authors: `Autor de ${title}`, status: 'quero', format: 'fisico', genre: 'Gestão', createdAt: `2026-09-0${id.slice(1)}T00:00:00.000Z`, updatedAt: TS, ...extra });
const seed = {
  version: 2, goals: { 2026: 12 }, defaultGoal: 12, customGenres: [], lastBackupAt: '2026-01-01T10:00:00.000Z',
  upNext: ['w1', 'w2'], pageGoals: { 2026: 3000 },
  books: [
    read('a1', 'Duna', '2026-03-20', { rating: 4.5, series: 'Duna', seriesNumber: 1, tags: ['clássico'], favorite: true }),
    read('a2', 'Sapiens', '2026-05-20', { genre: 'História', tags: ['presente'] }),
    read('a3', 'Torto Arado', '2026-07-12', { rating: 5 }),
    read('a4', 'Dom Casmurro', '2026-09-02', { format: 'kindle', rating: 3.5 }),
    read('a5', 'Meditações', '2025-06-10', { genre: 'Filosofia' }),
    {
      id: 'r1', title: 'Fora de Série', authors: 'Malcolm Gladwell', status: 'lendo', format: 'fisico', pages: 300, currentPage: 120,
      startDate: '2026-10-01', targetDate: '2026-11-15', createdAt: TS, updatedAt: TS,
      journal: [{ date: '2026-10-13', from: 36, to: 64, unit: 'page', note: '' }, { date: '2026-10-14', from: 64, to: 92, unit: 'page', note: '' }, { date: '2026-10-15', from: 92, to: 120, unit: 'page', note: '' }],
    },
    {
      id: 'r2', title: 'Livro no Kindle', authors: 'Alguém', status: 'lendo', format: 'kindle', currentPercent: 40,
      startDate: '2026-10-05', createdAt: TS, updatedAt: TS, journal: [{ date: '2026-10-14', from: 22, to: 28, unit: 'percent', note: '' }, { date: '2026-10-15', from: 28, to: 34, unit: 'percent', note: '' }, { date: '2026-10-16', from: 34, to: 40, unit: 'percent', note: '' }],
    },
    {
      id: 'r3', title: 'Quase no fim', authors: 'Fulana', status: 'lendo', format: 'fisico', pages: 200, currentPage: 200,
      startDate: '2026-10-02', createdAt: TS, updatedAt: TS, journal: [],
    },
    want('w1', 'O Gerente Minuto'),
    want('w2', 'Pai Rico, Pai Pobre'),
    want('w3', 'Neuromancer', { genre: 'Ficção', format: 'kindle' }),
    want('w4', 'Essencialismo'),
    { id: 'd1', title: 'Livro chato', authors: 'Ninguém', status: 'abandonado', format: 'fisico', startDate: '2026-04-01', endDate: '2026-04-10', dropReason: 'Não prendeu.', createdAt: TS, updatedAt: TS },
  ],
};

// ---------- Navegador ----------

const browser = await playwright.chromium.launch();
const options = { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, locale: 'pt-BR' };
const context = await browser.newContext(options);
const page = await context.newPage();
await page.clock.setFixedTime(new Date('2026-10-16T12:00:00'));

const errors = [];
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errors.push(`console: ${m.text()}`); });
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
  throw new Error(`Estado salvo não chegou ao esperado: ${JSON.stringify(last)?.slice(0, 300)}`);
}
const book = (s, id) => s.books.find((b) => b.id === id);
const step = (msg) => console.log(`• ${msg}`);
const onPage = (name) => page.waitForFunction((n) => document.getElementById('app').dataset.page === n, name);
const toastHas = (re) => page.waitForFunction((src) => new RegExp(src).test(document.getElementById('toast').textContent), re.source);
const openSheet = '.sheet-layer.is-open';
const sheetGone = (why = '') => page.waitForSelector('.sheet-layer', { state: 'detached', timeout: 5000 }).catch(() => { throw new Error(`a folha não fechou ${why}`); });
const shot = async (name, full = false) => {
  await page.waitForTimeout(300);
  await page.screenshot({ path: join(SHOTS, `v14-${name}.png`), fullPage: full });
};
const overflow = () => page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
const smallInputs = () => page.evaluate(() => [...document.querySelectorAll('input, select, textarea')]
  .filter((el) => el.offsetParent && parseFloat(getComputedStyle(el).fontSize) < 16).map((el) => el.outerHTML.slice(0, 60)));
/** Botões e links visíveis com área de toque menor que 40px (a meta é 44; 40 é o mínimo aceito em linhas compactas). */
const smallTargets = (scope) => page.evaluate((sel) => [...document.querySelectorAll(`${sel} button, ${sel} a[href]`)]
  // O título do cartão é um link que cobre o cartão inteiro (::after): a área de toque é o cartão.
  .filter((el) => el.offsetParent && !el.closest('.swipe-actions') && !el.matches('.reading-link') && getComputedStyle(el).visibility !== 'hidden')
  .map((el) => [el, el.getBoundingClientRect()])
  .filter(([, r]) => r.width && (r.height < 40 || r.width < 36))
  .map(([el, r]) => `${el.className || el.tagName} ${Math.round(r.width)}×${Math.round(r.height)}`), scope);

/** Gestos de toque com eventos de ponteiro (o Playwright só tem o toque simples). */
async function touch(selector, moves = [], holdMs = 0) {
  await page.evaluate(async ([sel, mv, hold]) => {
    const el = document.querySelector(sel);
    const r = el.getBoundingClientRect();
    const x0 = r.left + r.width / 2;
    const y0 = r.top + r.height / 2;
    const fire = (type, x, y, target = el) => target.dispatchEvent(new PointerEvent(type, {
      bubbles: true, cancelable: true, composed: true, pointerType: 'touch', isPrimary: true, button: 0, clientX: x, clientY: y, pointerId: 7,
    }));
    fire('pointerdown', x0, y0);
    let [x, y] = [x0, y0];
    for (const [dx, dy] of mv) {
      const steps = 6;
      for (let i = 1; i <= steps; i += 1) {
        fire('pointermove', x + (dx * i) / steps, y + (dy * i) / steps);
        await new Promise((res) => setTimeout(res, 16));
      }
      x += dx;
      y += dy;
    }
    if (hold) await new Promise((res) => setTimeout(res, hold));
    fire('pointerup', x, y);
    // O clique que o navegador manda depois de um toque parado (não depois de arrastar).
    if (Math.hypot(x - x0, y - y0) < 10) el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, clientX: x, clientY: y }));
  }, [selector, moves, holdMs]);
}

async function seedAndOpen(data, hash = '#/inicio') {
  await page.goto(`${BASE}${hash}`);
  await page.waitForSelector('#app[data-page]');
  await writeState(data);
  await page.reload();
  await page.waitForSelector('#app[data-page]');
}

/** A barra de vidro não cobre o fim da tela: rolando até o fim, o último bloco fica acima dela. */
async function navClearsContent(label) {
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  await page.waitForTimeout(100);
  const { last, nav } = await page.evaluate(() => ({
    last: document.getElementById('app').lastElementChild.getBoundingClientRect().bottom,
    nav: document.getElementById('nav').getBoundingClientRect().top,
  }));
  assert.ok(last <= nav - 8, `${label}: o fim do conteúdo (${Math.round(last)}) fica atrás da barra (${Math.round(nav)})`);
  await page.evaluate(() => window.scrollTo(0, 0));
}

try {
  step('abertura do Início: anel enche e números contam (com movimento)');
  await seedAndOpen(seed);
  await page.waitForSelector('.bento');
  assert.equal(await page.locator('.bento.is-intro').count(), 1, 'animação de abertura marcada');
  await page.waitForFunction(() => document.querySelector('.ring-count').textContent === '4', null, { timeout: 3000 });
  await page.waitForTimeout(900);
  assert.equal(await page.textContent('.bento-pages .tile-value'), (await page.evaluate(() => document.querySelector('.bento-pages [data-count]').dataset.count)).replace(/\B(?=(\d{3})+(?!\d))/g, '.'));
  // Voltar ao Início na mesma sessão não repete a animação.
  await page.click('[data-nav="estante"]');
  await onPage('estante');
  await page.click('[data-nav="inicio"]');
  await onPage('inicio');
  assert.equal(await page.locator('.bento.is-intro').count(), 0, 'só na primeira abertura');

  step('sem movimento (prefers-reduced-motion): tudo pronto na hora');
  {
    const ctx = await browser.newContext({ ...options, reducedMotion: 'reduce' });
    const p = await ctx.newPage();
    await p.clock.setFixedTime(new Date('2026-10-16T12:00:00'));
    await p.goto(`${BASE}#/inicio`);
    await p.waitForSelector('#app[data-page]');
    await p.evaluate(async (d) => (await import('/js/db.js')).setItem('state', d), seed);
    await p.reload();
    await p.waitForSelector('.bento');
    assert.equal(await p.textContent('.ring-count'), '4');
    assert.equal(await p.locator('.bento.is-intro').count(), 0);
    // Folha abre sem transição.
    await p.click('.reading:has-text("Fora de Série") [data-action="update-page"]');
    assert.equal(await p.evaluate(() => getComputedStyle(document.querySelector('.sheet')).transitionDuration), '0s');
    await ctx.close();
  }

  step('mosaico, cartão "Lendo agora" e barra de vidro em 320, 390 e 430px');
  const card = page.locator('.reading:has-text("Fora de Série")');
  assert.equal(await card.locator('.rn-progress').textContent(), 'pág. 120 de 300 · termina ~23 out');
  assert.equal(await card.locator('.pace-line').textContent(), 'Para terminar até 15 nov: 6 págs./dia');
  assert.equal(await card.locator('.cov-ring').getAttribute('aria-label'), '40% lido');
  assert.equal(await card.locator('.rn-main').textContent(), 'Registrar leitura');
  assert.equal(await card.getAttribute('data-tint-title'), 'Fora de Série');
  assert.match(await card.evaluate((el) => el.style.getPropertyValue('--tint')), /^\d+ \d+ \d+$/, 'cartão tingido pela cor da capa');
  // 100%: "Concluir" vira o botão principal.
  const done = page.locator('.reading:has-text("Quase no fim")');
  assert.equal((await done.locator('.rn-main').textContent()).trim(), 'Concluir');
  assert.match(await done.locator('.rn-main').getAttribute('href'), /#\/livro\/r3\/editar\?concluir=1$/);
  assert.match(await page.textContent('.bento-pages'), /de 3\.000 págs\./);
  assert.doesNotMatch(await page.textContent('#app'), /backup|atrasad/i, 'sem aviso de backup nem cobrança no Início');
  const navStyle = await page.evaluate(() => {
    const cs = getComputedStyle(document.getElementById('nav'));
    return { filter: cs.backdropFilter || cs.webkitBackdropFilter, radius: parseFloat(cs.borderTopLeftRadius) };
  });
  assert.match(navStyle.filter, /blur/, 'barra de vidro com desfoque');
  assert.ok(navStyle.radius >= 30, 'barra em forma de cápsula');
  for (const width of [320, 390, 430]) {
    await page.setViewportSize({ width, height: width === 320 ? 568 : 844 });
    assert.ok(await overflow() <= 0, `Início ${width}px: rolagem horizontal`);
    // O anel ocupa a coluna da esquerda, da altura dos três números.
    const [ring, pages, days] = await Promise.all(['.bento-ring', '.bento-pages', '.bento .tile:last-child'].map((s) => page.locator(s).boundingBox()));
    assert.ok(Math.abs(ring.y - pages.y) < 1 && Math.abs((ring.y + ring.height) - (days.y + days.height)) < 1, `${width}px: mosaico desalinhado`);
    assert.ok(ring.x < pages.x, `${width}px: anel à esquerda`);
    // Cartão: botões numa linha, abaixo do texto; rótulo do principal sem quebrar.
    const [main, play, more, target] = await Promise.all(['.rn-main', '.btn-timer', '.rn-more', '.pace-line'].map((s) => card.locator(s).boundingBox()));
    assert.ok(Math.abs(main.y - play.y) < 2 && Math.abs(play.y - more.y) < 2, `${width}px: ações do cartão fora de linha`);
    assert.ok(target.y + target.height <= main.y, `${width}px: botão sobre o texto`);
    assert.ok(main.height <= 50, `${width}px: "Registrar leitura" quebrou em duas linhas`);
    assert.deepEqual(await smallTargets('.reading'), [], `${width}px: alvos de toque pequenos no cartão`);
    const nav = await page.locator('#nav').boundingBox();
    assert.ok(nav.x >= 8 && nav.x + nav.width <= width - 8, `${width}px: barra encostada nas bordas`);
    await shot(`inicio-${width}`);
    await navClearsContent(`Início ${width}px`);
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await shot('inicio-390-inteiro', true);

  step('folha "Registrar leitura": página, atalhos, régua, foco e validação');
  await card.locator('[data-action="update-page"]').click();
  await page.waitForSelector(`${openSheet} .psheet`);
  const dialog = page.locator('.sheet[role="dialog"]');
  assert.equal(await dialog.getAttribute('aria-modal'), 'true');
  assert.equal(await dialog.getAttribute('aria-label'), 'Registrar leitura: Fora de Série');
  assert.equal(await page.evaluate(() => document.activeElement.id), 'progress-input');
  assert.equal(await page.getAttribute('#progress-input', 'inputmode'), 'numeric');
  assert.equal(await page.evaluate(() => document.getElementById('app').inert), true, 'resto da tela inerte');
  assert.match(await page.textContent('.psheet-head'), /Ritmo: 28 págs\.\/dia/);
  await page.click('[data-action="progress-add"][data-delta="20"]');
  assert.equal(await page.inputValue('#progress-input'), '140');
  assert.equal(await page.inputValue('#progress-range'), '140');
  await page.fill('#progress-range', '200');
  assert.equal(await page.inputValue('#progress-input'), '200');
  await page.click('[data-action="progress-add"][data-delta="50"]');
  assert.equal(await page.inputValue('#progress-input'), '250');
  assert.deepEqual(await smallInputs(), []);
  for (const width of [320, 390, 430]) {
    await page.setViewportSize({ width, height: width === 320 ? 568 : 844 });
    assert.ok(await overflow() <= 0, `folha ${width}px: rolagem horizontal`);
    const sheet = await page.locator('.sheet').boundingBox();
    assert.ok(sheet.y >= 0 && sheet.y + sheet.height <= (width === 320 ? 568 : 844), `${width}px: folha fora da tela`);
    assert.deepEqual(await smallTargets('.sheet'), [], `${width}px: alvos de toque pequenos na folha`);
    await shot(`folha-pagina-${width}`);
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.fill('#progress-input', '999');
  await page.press('#progress-input', 'Enter');
  await toastHas(/Informe uma página entre 0 e 300\./);
  assert.equal(await page.locator(`${openSheet} .psheet`).count(), 1, 'valor inválido: a folha continua aberta');
  await shot('folha-erro');
  await page.fill('#progress-input', '180');
  await page.click(`${openSheet} button[type="submit"]`);
  await toastHas(/Página atualizada/);
  await sheetGone();
  const saved = await waitState((s) => book(s, 'r1').currentPage === 180);
  assert.deepEqual(book(saved, 'r1').journal.at(-1), { date: '2026-10-16', from: 120, to: 180, unit: 'page', note: '' });
  assert.equal(await page.evaluate(() => document.activeElement?.dataset.action), 'update-page', 'foco volta ao botão');
  assert.equal(await page.evaluate(() => document.getElementById('app').inert), false);
  assert.match(await card.locator('.rn-progress').textContent(), /^pág\. 180 de 300/);

  step('fechar: Esc, toque fora, puxar para baixo e o ✕');
  await card.locator('[data-action="update-page"]').click();
  await page.waitForSelector(`${openSheet} .psheet`);
  await page.keyboard.press('Escape');
  await sheetGone('com Esc');
  await card.locator('[data-action="update-page"]').click();
  await page.waitForSelector(`${openSheet} .psheet`);
  await page.mouse.click(195, 220);
  await sheetGone('com toque fora');
  await card.locator('[data-action="update-page"]').click();
  await page.waitForSelector(`${openSheet} .psheet`);
  await touch(`${openSheet} [data-sheet-grab]`, [[0, 220]]);
  await sheetGone('puxando para baixo');
  await card.locator('[data-action="update-page"]').click();
  await page.waitForSelector(`${openSheet} .psheet`);
  await touch(`${openSheet} [data-sheet-grab]`, [[0, 20]]);
  await page.waitForTimeout(300);
  assert.equal(await page.locator(`${openSheet} .psheet`).count(), 1, 'puxar pouco não fecha');
  await page.click(`${openSheet} [data-action="cancel-progress"]`);
  await sheetGone('com o ✕');
  assert.equal((await readState()).books.find((b) => b.id === 'r1').currentPage, 180, 'fechar não grava nada');

  step('Kindle: +5%, régua e 100% abre o Concluir');
  const kindle = page.locator('.reading:has-text("Livro no Kindle")');
  await kindle.locator('[data-action="update-page"]').click();
  await page.waitForSelector(`${openSheet} .psheet`);
  assert.match(await page.textContent('.progress-edit-label'), /Quantos % o Kindle mostra/);
  assert.deepEqual(await page.locator(`${openSheet} [data-action="progress-add"]`).allTextContents(), ['+5%', '+10%']);
  await page.click('[data-action="progress-add"][data-delta="5"]');
  assert.equal(await page.inputValue('#progress-input'), '45');
  await shot('folha-kindle');
  await page.fill('#progress-input', '150');
  await page.press('#progress-input', 'Enter');
  await toastHas(/entre 0 e 100/);
  await page.fill('#progress-input', '52');
  await page.press('#progress-input', 'Enter');
  await toastHas(/Progresso atualizado/);
  await waitState((s) => book(s, 'r2').currentPercent === 52);
  await kindle.locator('[data-action="update-page"]').click();
  await page.waitForSelector(`${openSheet} .psheet`);
  await page.fill('#progress-range', '100');
  assert.equal(await page.inputValue('#progress-input'), '100');
  await page.press('#progress-input', 'Enter');
  await onPage('livro');
  assert.match(page.url(), /#\/livro\/r2\/editar\?concluir=1$/);
  assert.equal(await page.locator('.sheet-layer.is-open').count(), 0, 'trocar de tela fecha a folha');
  await sheetGone('ao trocar de tela');
  assert.equal(book(await readState(), 'r2').currentPercent, 52, '100% não grava: vai para o Concluir');

  step('"Terminei o livro" leva ao Concluir');
  await page.goto(`${BASE}#/inicio`);
  await onPage('inicio');
  await card.locator('[data-action="update-page"]').click();
  await page.click(`${openSheet} [data-action="progress-finish"]`);
  await onPage('livro');
  assert.match(page.url(), /#\/livro\/r1\/editar\?concluir=1$/);

  step('menu rápido: tocar e segurar no cartão');
  await page.goto(`${BASE}#/inicio`);
  await onPage('inicio');
  // Arrastar o dedo cancela: nada abre.
  await touch('.reading[data-id="r1"] .rn-cover', [[0, 40]], 600);
  await page.waitForTimeout(150);
  assert.equal(await page.locator('.sheet-layer').count(), 0, 'arrastar não abre o menu');
  assert.equal(await page.evaluate(() => document.getElementById('app').dataset.page), 'inicio');
  // Segurando aparece o retorno de toque (escala) e, depois de ~450 ms, o menu.
  const pressing = page.evaluate(() => new Promise((res) => {
    const el = document.querySelector('.reading[data-id="r1"]');
    new MutationObserver(() => { if (el.classList.contains('is-pressing')) res(true); }).observe(el, { attributes: true });
    setTimeout(() => res(false), 1500);
  }));
  await touch('.reading[data-id="r1"] .rn-cover', [], 600);
  assert.equal(await pressing, true, 'retorno de toque ao segurar');
  await page.waitForSelector(`${openSheet} .qm`);
  assert.equal(await page.evaluate(() => document.getElementById('app').dataset.page), 'inicio', 'segurar não abre o livro');
  assert.deepEqual((await page.locator(`${openSheet} .qm-item`).allTextContents()).map((t) => t.trim()),
    ['Abrir livro', 'Registrar leitura', 'Ler agora', 'Concluir']);
  assert.equal(await page.evaluate(() => getComputedStyle(document.querySelector('.reading')).userSelect), 'none', 'sem seleção de texto ao segurar');
  await shot('menu-lendo');
  // Registrar leitura a partir do menu: a folha troca.
  await page.click(`${openSheet} [data-action="update-page"]`);
  await page.waitForSelector(`${openSheet} .psheet`);
  assert.equal(await page.locator('.sheet-layer .qm').count(), 0);
  await page.keyboard.press('Escape');
  await sheetGone();
  // Toque normal continua abrindo o livro.
  // (o link do título cobre o cartão inteiro, então o toque na capa cai nele)
  const coverBox = await page.locator('.reading[data-id="r1"] .rn-cover').boundingBox();
  await page.mouse.click(coverBox.x + coverBox.width / 2, coverBox.y + coverBox.height / 2);
  await onPage('livro');
  assert.match(page.url(), /#\/livro\/r1$/);

  step('Estante: linhas compactas, Próximas com ↑↓ e o menu da fila');
  await page.goto(`${BASE}#/estante?aba=quero`);
  await onPage('estante');
  assert.match(await page.textContent('.list-head'), /Próximas\s*2 de 5/);
  assert.deepEqual(await page.locator('.book-row:has(.next-pos) .book-row-title').allTextContents(), ['O Gerente Minuto', 'Pai Rico, Pai Pobre']);
  const rowH = await page.locator('.book-row[data-id="w3"]').boundingBox();
  assert.ok(rowH.height >= 52 && rowH.height <= 64, `linha compacta com ${Math.round(rowH.height)}px`);
  await page.click('[data-action="quick-menu"][data-id="w3"]');
  await page.waitForSelector(`${openSheet} .qm`);
  assert.deepEqual((await page.locator(`${openSheet} .qm-item`).allTextContents()).map((t) => t.trim()),
    ['Abrir livro', 'Começar a ler', 'Marcar como próxima']);
  await shot('menu-quero');
  await page.click(`${openSheet} [data-action="toggle-next"]`);
  await waitState((s) => s.upNext.join() === 'w1,w2,w3');
  await sheetGone();
  assert.equal(await page.evaluate(() => document.activeElement?.dataset.id), 'w3', 'foco volta para a linha');
  await page.click('[data-action="move-next"][data-delta="-1"][data-id="w3"]');
  await waitState((s) => s.upNext.join() === 'w1,w3,w2');
  for (const width of [320, 390, 430]) {
    await page.setViewportSize({ width, height: 844 });
    assert.ok(await overflow() <= 0, `Estante ${width}px: rolagem horizontal`);
    assert.deepEqual(await smallTargets('.shelf-list'), [], `${width}px: alvos pequenos na Estante`);
    const title = await page.locator('.book-row[data-id="w3"] .li-title').boundingBox();
    assert.ok(title.width >= 70, `${width}px: título espremido (${Math.round(title.width)}px)`);
    await shot(`estante-quero-${width}`);
    await navClearsContent(`Estante ${width}px`);
  }
  await page.setViewportSize({ width: 390, height: 844 });

  step('deslizar para a esquerda: Começar e Próxima (só com o dedo)');
  // Gesto vertical não abre a linha.
  await touch('.book-row[data-id="w4"] .li-link', [[-10, 60]]);
  assert.equal(await page.locator('.book-row[data-id="w4"].is-open').count(), 0, 'rolagem não abre a linha');
  await touch('.book-row[data-id="w4"] .li-link', [[-150, 4]]);
  await page.waitForSelector('.book-row[data-id="w4"].is-open');
  assert.equal(await page.evaluate(() => document.getElementById('app').dataset.page), 'estante', 'arrastar não abre o livro');
  await page.waitForTimeout(300);
  const actions = await page.locator('.book-row[data-id="w4"] .swipe-actions').boundingBox();
  const content = await page.locator('.book-row[data-id="w4"] .swipe-content').boundingBox();
  assert.ok(content.x + content.width <= actions.x + 1, 'botões à mostra');
  await shot('estante-deslizar');
  // Tocar na linha aberta só fecha.
  await page.locator('.book-row[data-id="w4"] .swipe-content').click({ position: { x: content.width - 40, y: 20 } });
  await page.waitForSelector('.book-row[data-id="w4"]:not(.is-open)');
  assert.equal(await page.evaluate(() => document.getElementById('app').dataset.page), 'estante');
  await touch('.book-row[data-id="w4"] .li-link', [[-150, 0]]);
  await page.waitForSelector('.book-row[data-id="w4"].is-open');
  await page.waitForTimeout(300);
  await page.click('.book-row[data-id="w4"] .swipe-next');
  await waitState((s) => s.upNext.includes('w4'));
  await touch('.book-row[data-id="w4"] .li-link', [[-150, 0]]);
  await page.waitForSelector('.book-row[data-id="w4"].is-open');
  await page.waitForTimeout(300);
  await page.click('.book-row[data-id="w4"] .swipe-start');
  const started = await waitState((s) => book(s, 'w4').status === 'lendo');
  assert.equal(book(started, 'w4').startDate, '2026-10-16');
  assert.ok(!started.upNext.includes('w4'), 'quem começou sai das próximas');
  // Botões escondidos ficam fora do Tab e do leitor de tela (o menu tem as mesmas ações).
  assert.equal(await page.getAttribute('.book-row[data-id="w1"] .swipe-actions', 'aria-hidden'), 'true');
  assert.equal(await page.getAttribute('.book-row[data-id="w1"] .swipe-start', 'tabindex'), '-1');

  step('Lista | Capas, lembrado na sessão');
  await page.goto(`${BASE}#/estante?aba=lido`);
  await onPage('estante');
  assert.deepEqual(await page.locator('.year-head').allTextContents(), ['2026 4 livros', '2025 1 livro']);
  assert.equal(await page.textContent('.book-row[data-id="a1"] .li-sub'), 'Autor de Duna · 20 mar');
  assert.equal(await page.textContent('.book-row[data-id="a1"] .li-extra'), 'Duna · nº 1 · clássico');
  assert.equal(await page.getAttribute('.book-row[data-id="a1"] .li-rating', 'aria-label'), 'Nota 4,5 de 5');
  await shot('estante-lidos');
  // Cabeçalho do ano fica preso no topo ao rolar.
  await page.setViewportSize({ width: 390, height: 500 });
  await page.evaluate(() => window.scrollTo(0, 360));
  await page.waitForTimeout(100);
  // Preso logo abaixo da barra compacta de vidro (V18), que aparece quando o título grande some.
  const stuck = await page.locator('.year-head').first().boundingBox();
  const bar = await page.evaluate(() => {
    const el = document.querySelector('.cbar');
    return { on: el.classList.contains('is-on'), bottom: el.getBoundingClientRect().bottom };
  });
  assert.ok(bar.on, 'barra compacta à vista ao rolar a Estante');
  assert.ok(Math.abs(stuck.y - bar.bottom) < 2, `cabeçalho do ano não ficou preso sob a barra (${stuck.y} vs ${bar.bottom})`);
  await shot('estante-cabecalho-preso');
  await page.setViewportSize({ width: 390, height: 844 });
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.click('[data-action="shelf-mode"][data-value="capas"]');
  await page.waitForSelector('.cover-grid');
  assert.equal(await page.getAttribute('[data-action="shelf-mode"][data-value="capas"]', 'aria-pressed'), 'true');
  const cols = await page.evaluate(() => getComputedStyle(document.querySelector('.cover-grid')).gridTemplateColumns.split(' ').length);
  assert.equal(cols, 4);
  await page.reload();
  await page.waitForSelector('.cover-grid');
  for (const width of [320, 430]) {
    await page.setViewportSize({ width, height: 844 });
    assert.ok(await overflow() <= 0, `Capas ${width}px`);
    await shot(`estante-capas-${width}`);
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`${BASE}#/estante?aba=quero`);
  await page.waitForSelector('.cover-grid .next-pos');
  assert.deepEqual(await page.locator('.cover-grid .next-pos').allTextContents(), ['1º', '2º', '3º']);
  await shot('estante-quero-capas');
  await page.click('[data-action="shelf-mode"][data-value="lista"]');
  await page.waitForSelector('.group');
  await page.click('[data-action="draw-open"]');
  await page.waitForSelector('.draw-panel');

  step('Abandonei: o porquê na linha');
  await page.goto(`${BASE}#/estante?aba=abandonado`);
  assert.match(await page.textContent('.book-row[data-id="d1"] .drop-reason'), /Não prendeu/);

  step('Buscar: filtros em chips, ativo em caramelo com ✕');
  await page.goto(`${BASE}#/buscar`);
  await onPage('buscar');
  assert.match(await page.textContent('.results-count'), /Todos os 13 livros/);
  assert.deepEqual(await page.locator('.fchip .fchip-text').allTextContents(), ['Status', 'Ano', 'Gênero', 'Formato', 'Nota', 'Etiqueta']);
  await page.selectOption('[data-filter="status"]', 'lido');
  await page.waitForSelector('.fchip.is-on');
  assert.equal(await page.textContent('.fchip.is-on .fchip-text'), 'Lido');
  await page.selectOption('[data-filter="minRating"]', '4.5');
  await page.waitForFunction(() => document.querySelectorAll('.fchip.is-on').length === 2);
  assert.match(await page.textContent('.results-count'), /2 livros encontrados/);
  assert.equal(await page.textContent('.book-row[data-id="a1"] .li-sub'), 'Autor de Duna · 20 mar 2026');
  for (const width of [320, 390, 430]) {
    await page.setViewportSize({ width, height: 844 });
    assert.ok(await overflow() <= 0, `Buscar ${width}px: rolagem horizontal`);
    assert.deepEqual(await smallInputs(), []);
    await shot(`buscar-${width}`);
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.click('[data-action="clear-filter"][data-key="minRating"]');
  await page.waitForFunction(() => document.querySelectorAll('.fchip.is-on').length === 1);
  assert.match(await page.textContent('.results-count'), /5 livros encontrados/);
  await page.click('[data-action="clear-filters"]');
  await page.waitForFunction(() => !document.querySelector('.fchip.is-on'));
  // Filtro lá no fim da fileira: ao voltar para a Buscar, o chip ativo está à vista.
  const tagValue = await page.$eval('[data-filter="tag"] option:nth-child(2)', (o) => o.value);
  await page.selectOption('[data-filter="tag"]', tagValue);
  await page.waitForSelector('.fchip.is-on');
  const chipInView = () => page.evaluate(() => {
    const row = document.querySelector('.fchips').getBoundingClientRect();
    const chip = document.querySelector('.fchip.is-on').getBoundingClientRect();
    return chip.left >= row.left - 1 && chip.right <= row.right + 1;
  });
  assert.ok(await chipInView(), 'chip escolhido continua à vista depois de redesenhar');
  await page.goto(`${BASE}#/inicio`);
  await onPage('inicio');
  await page.goto(`${BASE}#/buscar`);
  await onPage('buscar');
  assert.ok(await chipInView(), 'ao voltar, o filtro ativo (Etiqueta) aparece na fileira');
  await page.click('[data-action="clear-filter"][data-key="tag"]');
  await page.waitForFunction(() => !document.querySelector('.fchip.is-on'));
  // Filtro vindo de um gráfico do Resumo continua com o seu chip.
  await page.goto(`${BASE}#/resumo/2026?aba=gostos`);
  await onPage('resumo');
  await page.click('[data-action="chart-filter"][data-kind="format"][data-value="kindle"]');
  await onPage('buscar');
  await page.waitForSelector('.filter-chip');
  assert.ok((await page.locator('.fchip.is-on .fchip-text').allTextContents()).includes('Kindle'), 'chip do formato ativo');
  await shot('buscar-grafico');
  await navClearsContent('Buscar');

  assert.deepEqual(errors, []);
  console.log('\nTudo certo. Capturas em tests/e2e/screens/v14-*.png');
} catch (err) {
  await page.screenshot({ path: join(SHOTS, 'v14-falha.png'), fullPage: true }).catch(() => {});
  console.error('\nFALHOU:', err.message);
  if (errors.length) console.error(errors.join('\n'));
  process.exitCode = 1;
} finally {
  await browser.close();
  server.close();
}
