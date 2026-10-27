// QA do redesenho 1.4 (Início, Estante, Buscar, navegação) integrado à ficha do livro:
// gestos de verdade (o clique que o iPhone manda ao soltar depois de segurar cai onde o dedo
// está, com a folha já aberta), caminhos de gravação da folha "Registrar leitura", menu rápido,
// deslizar, sorteio, Voltar com a folha aberta, meta de páginas no começo do ano, Return no
// cadastro de livro novo e telas em 320, 375, 390 e 430px.
// Uso: node tests/e2e/qa-inicio-v14.mjs   (precisa do Playwright; capturas em tests/e2e/screens/qa14-*.png)

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
const want = (id, title, extra = {}) => ({ id, title, authors: `Autor de ${title}`, status: 'quero', format: 'fisico', genre: 'Gestão', createdAt: TS, updatedAt: TS, ...extra });
const LONG = 'As Crônicas Extraordinariamente Longas de um Título que Não Cabe em Lugar Nenhum';
const seed = () => ({
  version: 2, goals: { 2026: 12 }, defaultGoal: 12, customGenres: [], lastBackupAt: '2026-10-01T10:00:00.000Z',
  upNext: ['w1', 'w2'], pageGoals: { 2026: 3000 },
  books: [
    read('a1', 'Duna', '2026-03-20', { rating: 4.5, series: 'Duna', seriesNumber: 1, tags: ['clássico', 'ficção científica', 'presente do pai'], favorite: true }),
    read('a2', LONG, '2026-05-20', { authors: 'Fulano de Tal com Um Nome Muito Comprido, Outro Autor', series: 'Crônicas Longas', seriesNumber: 12, tags: ['etiqueta comprida demais'] }),
    read('a3', 'Torto Arado', '2025-07-12', { rating: 5 }),
    {
      id: 'r1', title: 'Fora de Série', authors: 'Malcolm Gladwell', status: 'lendo', format: 'fisico', pages: 300, currentPage: 120,
      startDate: '2026-10-01', createdAt: TS, updatedAt: TS,
      journal: [{ date: '2026-10-15', from: 92, to: 120, unit: 'page', note: '' }],
    },
    {
      id: 'r2', title: 'Livro no Kindle', authors: 'Alguém', status: 'lendo', format: 'kindle', currentPercent: 40,
      startDate: '2026-10-05', createdAt: TS, updatedAt: TS, journal: [{ date: '2026-10-15', from: 34, to: 40, unit: 'percent', note: '' }],
    },
    { id: 'r3', title: LONG, authors: 'Sem Total', status: 'lendo', format: 'fisico', currentPage: 50, startDate: '2026-10-02', createdAt: TS, updatedAt: TS, journal: [] },
    want('w1', 'O Gerente Minuto'),
    want('w2', 'Pai Rico, Pai Pobre'),
    want('w3', 'Neuromancer', { genre: 'Ficção', format: 'kindle' }),
    want('w4', 'Essencialismo'),
    want('w5', 'Hábitos Atômicos'),
    want('w6', 'Rápido e Devagar'),
    want('w7', 'Pequeno Manual Antirracista'),
    want('w8', 'O Poder do Hábito'),
    want('w9', 'Mindset'),
    want('w10', 'A Arte da Guerra'),
  ],
});

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
async function waitState(predicate, p = page) {
  let last;
  for (let i = 0; i < 50; i += 1) {
    last = await p.evaluate(async () => (await import('/js/db.js')).getItem('state'));
    if (last && predicate(last)) return last;
    await p.waitForTimeout(100);
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
  await page.screenshot({ path: join(SHOTS, `qa14-${name}.png`), fullPage: full });
};
const overflow = () => page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
const smallInputs = () => page.evaluate(() => [...document.querySelectorAll('input, select, textarea')]
  .filter((el) => el.offsetParent && parseFloat(getComputedStyle(el).fontSize) < 16).map((el) => el.outerHTML.slice(0, 60)));

/**
 * Tocar e segurar como no iPhone: pointerdown, espera, pointerup e o clique que o WebKit manda
 * ao soltar. O clique vai para o elemento que está sob o dedo NESSA hora (elementFromPoint),
 * não para o que foi tocado: com a folha aberta, é o fundo escurecido ou um item do menu.
 */
async function holdLikeIphone(selector, holdMs = 700, { dy = 0 } = {}) {
  return page.evaluate(async ([sel, hold, offsetY]) => {
    const el = document.querySelector(sel);
    el.scrollIntoView({ block: 'center' });
    await new Promise((res) => setTimeout(res, 150)); // o evento de rolagem cancelaria o gesto
    const r = el.getBoundingClientRect();
    const x = r.left + Math.min(40, r.width / 2);
    const y = r.top + r.height / 2 + offsetY;
    const opts = { bubbles: true, cancelable: true, composed: true, pointerType: 'touch', isPrimary: true, button: 0, clientX: x, clientY: y, pointerId: 9 };
    el.dispatchEvent(new PointerEvent('pointerdown', opts));
    await new Promise((res) => setTimeout(res, hold));
    const under = document.elementFromPoint(x, y) || document.body;
    under.dispatchEvent(new PointerEvent('pointerup', opts));
    under.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, clientX: x, clientY: y }));
    return under.className || under.tagName;
  }, [selector, holdMs, dy]);
}

async function seedAndOpen(data, hash = '#/inicio', p = page) {
  await p.goto(`${BASE}${hash}`);
  await p.waitForSelector('#app[data-page]');
  await p.evaluate(async (d) => (await import('/js/db.js')).setItem('state', d), data);
  await p.reload();
  await p.waitForSelector('#app[data-page]');
}

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
  step('tocar e segurar no iPhone: o clique ao soltar não fecha o menu nem aciona um item');
  await seedAndOpen(seed(), '#/estante?aba=quero');
  await onPage('estante');
  // Última linha da fila, perto do fim da tela: o menu sobe por baixo do dedo.
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  const under = await page.evaluate(() => {
    const row = document.querySelector('.book-row[data-id="w10"]');
    row.scrollIntoView({ block: 'end' });
    window.scrollBy(0, 120);
    return row.getBoundingClientRect().top;
  });
  assert.ok(under > 500, 'linha perto do fim da tela');
  await page.waitForTimeout(200); // o evento de rolagem chega depois e cancelaria o gesto
  await page.evaluate(() => {
    const opts = { bubbles: true, cancelable: true, composed: true, pointerType: 'touch', isPrimary: true, button: 0, pointerId: 9 };
    const row = document.querySelector('.book-row[data-id="w10"] .li-link');
    const r = row.getBoundingClientRect();
    window.__hold = { x: r.left + 40, y: r.top + r.height / 2 };
    row.dispatchEvent(new PointerEvent('pointerdown', { ...opts, clientX: window.__hold.x, clientY: window.__hold.y }));
  });
  await page.waitForSelector(`${openSheet} .qm`);
  await page.waitForTimeout(300); // a folha terminou de subir
  const hit = await page.evaluate(() => {
    const { x, y } = window.__hold;
    const el = document.elementFromPoint(x, y);
    el.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, pointerType: 'touch', isPrimary: true, clientX: x, clientY: y, pointerId: 9 }));
    el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, clientX: x, clientY: y }));
    return el.closest('[data-action]')?.dataset.action || el.className;
  });
  console.log(`   (o dedo soltou sobre: ${hit})`);
  await page.waitForTimeout(200);
  assert.equal(await page.locator(`${openSheet} .qm`).count(), 1, 'o menu continua aberto depois de soltar o dedo');
  let s = await readState();
  assert.equal(book(s, 'w10').status, 'quero', 'soltar o dedo não começou a leitura');
  assert.deepEqual(s.upNext, ['w1', 'w2'], 'soltar o dedo não mexeu na fila');
  // O próximo toque de verdade vale.
  await page.click(`${openSheet} [data-action="toggle-next"]`);
  await waitState((st) => st.upNext.join() === 'w1,w2,w10');
  await sheetGone();

  // No Início: o cartão fica no meio da tela; soltar cai no fundo escurecido.
  await page.goto(`${BASE}#/inicio`);
  await onPage('inicio');
  const landed = await holdLikeIphone('.reading[data-id="r1"] .rn-text', 800);
  console.log(`   (Início: o dedo soltou sobre: ${landed})`);
  await page.waitForTimeout(200);
  assert.equal(await page.locator(`${openSheet} .qm`).count(), 1, 'Início: o menu não fecha ao soltar o dedo');
  assert.equal(await page.evaluate(() => document.getElementById('app').dataset.page), 'inicio');
  // Depois disso, tocar fora fecha normalmente.
  await page.mouse.click(195, 60);
  await sheetGone('tocando fora depois do gesto');
  // Toque curto (sem segurar) continua abrindo o livro, com a capa do cartão "voando" para a ficha.
  await page.evaluate(() => {
    const original = document.startViewTransition.bind(document);
    window.__vt = [];
    document.startViewTransition = (cb) => {
      window.__vt.push(document.querySelector('.reading[data-id="r1"] .rn-cover .cover')?.style.viewTransitionName || '');
      return original(cb);
    };
  });
  await page.locator('.reading[data-id="r1"] .reading-link').click();
  await onPage('livro');
  assert.match(page.url(), /#\/livro\/r1$/);
  assert.deepEqual(await page.evaluate(() => window.__vt), ['book-cover'], 'a capa do cartão é a que voa para a ficha');


  step('toque de verdade (eventos de toque do Chromium): segurar, deslizar e rolar');
  {
    await seedAndOpen({ ...seed(), books: seed().books.map((b) => (b.id === 'r1' ? { ...b, currentPage: 300 } : b)) }, '#/estante?aba=quero');
    await onPage('estante');
    const cdp = await context.newCDPSession(page);
    const touchAt = (type, x, y) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x, y, id: 1 }] });
    const centerOf = async (sel) => {
      const b = await page.locator(sel).boundingBox();
      return [b.x + Math.min(60, b.width / 2), b.y + b.height / 2];
    };
    // Segurar ~0,9 s: o Chromium manda o clique ao soltar, já com o menu aberto.
    let [x, y] = await centerOf('.book-row[data-id="w3"] .li-link');
    await touchAt('touchStart', x, y);
    await page.waitForTimeout(900);
    await touchAt('touchEnd', x, y);
    await page.waitForTimeout(400);
    assert.equal(await page.locator(`${openSheet} .qm`).count(), 1, 'segurar de verdade: o menu fica aberto ao soltar');
    assert.equal(book(await readState(), 'w3').status, 'quero');
    await page.keyboard.press('Escape');
    await sheetGone();
    // Deslizar na horizontal abre a linha; na vertical, rola a tela.
    [x, y] = await centerOf('.book-row[data-id="w4"] .li-main');
    x += 200;
    await touchAt('touchStart', x, y);
    for (let i = 0; i < 12; i += 1) {
      x -= 14;
      await touchAt('touchMove', x, y);
      await page.waitForTimeout(16);
    }
    await touchAt('touchEnd', x, y);
    await page.waitForSelector('.book-row[data-id="w4"].is-open');
    assert.equal(await page.evaluate(() => document.getElementById('app').dataset.page), 'estante');
    assert.equal(await page.locator('.sheet-layer').count(), 0, 'deslizar não abre o menu');
    [x, y] = await centerOf('.book-row[data-id="w6"] .li-link');
    await touchAt('touchStart', x, y);
    for (let i = 0; i < 10; i += 1) {
      y -= 20;
      await touchAt('touchMove', x + 2, y);
      await page.waitForTimeout(16);
    }
    await touchAt('touchEnd', x, y);
    await page.waitForTimeout(600);
    assert.ok(await page.evaluate(() => window.scrollY) > 0, 'a tela rolou');
    assert.equal(await page.locator('.book-row[data-id="w6"].is-open').count(), 0, 'rolar não abre a linha');
    assert.equal(await page.locator('.sheet-layer').count(), 0, 'rolar não abre o menu');
    // Segurar o "Concluir" do cartão (livro no fim) não vira menu: é um botão do cartão.
    await page.goto(`${BASE}#/inicio`);
    await onPage('inicio');
    await page.locator('.reading[data-id="r1"] a.rn-main').scrollIntoViewIfNeeded();
    await page.waitForTimeout(200);
    [x, y] = await centerOf('.reading[data-id="r1"] a.rn-main');
    await touchAt('touchStart', x, y);
    await page.waitForTimeout(700);
    assert.equal(await page.locator('.sheet-layer').count(), 0, 'segurar o Concluir não abre o menu');
    await touchAt('touchEnd', x, y);
    await onPage('livro');
    assert.match(page.url(), /#\/livro\/r1\/editar\?concluir=1$/, 'soltar o Concluir abre o Concluir');
    await cdp.detach();
  }

  step('folha: livro sem total de páginas, valores inválidos e dois envios seguidos');
  await page.goto(`${BASE}#/inicio`);
  await onPage('inicio');
  const noTotal = page.locator('.reading[data-id="r3"]');
  await noTotal.locator('[data-action="update-page"]').click();
  await page.waitForSelector(`${openSheet} .psheet`);
  assert.equal(await page.locator(`${openSheet} #progress-range`).count(), 0, 'sem total, sem régua');
  assert.equal((await page.textContent(`${openSheet} .psheet-suffix`)).trim(), 'pág.');
  await page.click('[data-action="progress-add"][data-delta="50"]');
  assert.equal(await page.inputValue('#progress-input'), '100');
  for (const bad of ['', '-3', '12.5']) {
    await page.fill('#progress-input', bad);
    await page.press('#progress-input', 'Enter');
    await toastHas(bad === '' ? /Informe a página\./ : /Informe um número de página válido\./);
    assert.equal(await page.locator(`${openSheet} .psheet`).count(), 1, `"${bad}": a folha continua aberta`);
  }
  assert.equal(book(await readState(), 'r3').currentPage, 50, 'valor inválido não grava');
  await page.fill('#progress-input', '100');
  // Dois envios no mesmo instante (toque duplo em Salvar): um registro só no diário.
  await page.evaluate(() => {
    const form = document.querySelector('.sheet-layer.is-open [data-progress-form]');
    form.requestSubmit();
    form.requestSubmit();
  });
  s = await waitState((st) => book(st, 'r3').currentPage === 100);
  assert.deepEqual(book(s, 'r3').journal, [{ date: '2026-10-16', from: 50, to: 100, unit: 'page', note: '' }]);
  await sheetGone();

  step('folha: Kindle com vírgula/decimal e +10% passando de 100');
  const kindle = page.locator('.reading[data-id="r2"]');
  await kindle.locator('[data-action="update-page"]').click();
  await page.waitForSelector(`${openSheet} .psheet`);
  await page.fill('#progress-input', '95');
  await page.click('[data-action="progress-add"][data-delta="10"]');
  assert.equal(await page.inputValue('#progress-input'), '100', '+10% para em 100');
  await page.fill('#progress-input', '47.6');
  await page.press('#progress-input', 'Enter');
  s = await waitState((st) => book(st, 'r2').currentPercent === 48);
  assert.deepEqual(book(s, 'r2').journal.at(-1), { date: '2026-10-16', from: 40, to: 48, unit: 'percent', note: '' });
  await sheetGone();

  step('Voltar com a folha aberta: a troca de tela fecha a folha e devolve a tela');
  await page.goto(`${BASE}#/livro/r1`);
  await onPage('livro');
  await page.click('.ficha-card [data-action="update-page"]');
  await page.waitForSelector(`${openSheet} .psheet`);
  await page.evaluate(() => history.back());
  await onPage('inicio');
  await sheetGone('ao voltar');
  assert.equal(await page.evaluate(() => document.getElementById('app').inert), false, 'tela de volta, sem inert');
  assert.equal(await page.evaluate(() => document.body.classList.contains('sheet-open')), false);

  step('ficha: Registrar leitura usa a mesma folha; redesenho com ela aberta não cria um segundo formulário');
  await page.goto(`${BASE}#/livro/r1`);
  await onPage('livro');
  await page.click('.ficha-card [data-action="update-page"]');
  await page.waitForSelector(`${openSheet} .psheet`);
  // Outra aba (ou a volta do segundo plano) grava algo: a tela de trás é redesenhada.
  {
    const other = await context.newPage();
    await other.clock.setFixedTime(new Date('2026-10-16T12:00:00'));
    await other.goto(`${BASE}#/estante?aba=quero`);
    await other.waitForSelector('#app[data-page="estante"]');
    await other.click('[data-action="quick-menu"][data-id="w4"]');
    await other.click('.sheet-layer.is-open [data-action="toggle-next"]');
    await waitState((st) => st.upNext.includes('w4'), other);
    await other.close();
  }
  await page.waitForFunction(() => document.querySelectorAll('#progress-input').length >= 1);
  await page.waitForTimeout(300);
  assert.equal(await page.locator('#app [data-progress-form]').count(), 0, 'nenhum formulário de página na ficha por trás da folha');
  await page.fill(`${openSheet} #progress-input`, '130');
  await page.press(`${openSheet} #progress-input`, 'Enter');
  await waitState((st) => book(st, 'r1').currentPage === 130);
  await sheetGone();
  assert.equal(await page.locator('#app [data-progress-form]').count(), 0, 'depois de salvar, a ficha não mostra formulário');
  await page.waitForFunction(() => /pág\. 130 de 300/.test(document.querySelector('.ficha-progress-label')?.textContent || ''));


  step('menu rápido: fila cheia (5) avisa e não muda nada; Começar a ler tira da fila');
  await seedAndOpen({ ...seed(), upNext: ['w1', 'w2', 'w3', 'w4', 'w5'] }, '#/estante?aba=quero');
  await onPage('estante');
  await page.click('[data-action="quick-menu"][data-id="w6"]');
  await page.waitForSelector(`${openSheet} .qm`);
  await page.click(`${openSheet} [data-action="toggle-next"]`);
  await toastHas(/Limite de 5 próximas/);
  await sheetGone();
  assert.deepEqual((await readState()).upNext, ['w1', 'w2', 'w3', 'w4', 'w5']);
  // O aviso fica à vista (embaixo, acima da barra) depois que a folha fecha.
  const toastBox = await page.locator('#toast').boundingBox();
  const navBox = await page.locator('#nav').boundingBox();
  assert.ok(toastBox.y + toastBox.height <= navBox.y, 'aviso acima da barra');
  await page.click('[data-action="quick-menu"][data-id="w2"]');
  await page.click(`${openSheet} [data-action="start-reading"]`);
  s = await waitState((st) => book(st, 'w2').status === 'lendo');
  assert.equal(book(s, 'w2').startDate, '2026-10-16');
  assert.deepEqual(s.upNext, ['w1', 'w3', 'w4', 'w5']);
  await sheetGone();

  step('sorteio: Começar a ler grava a leitura e fecha o painel');
  await page.click('[data-action="draw-open"]');
  await page.waitForSelector('[data-action="draw-start"]');
  const drawn = await page.getAttribute('[data-action="draw-start"]', 'data-id');
  await page.click('[data-action="draw-start"]');
  s = await waitState((st) => book(st, drawn).status === 'lendo');
  assert.equal(book(s, drawn).startDate, '2026-10-16');
  assert.ok(!s.upNext.includes(drawn));
  assert.equal(await page.locator('.draw-panel').count(), 0);

  step('Início no começo do ano: sem "ritmo de ~X" absurdo na meta de páginas (igual ao Resumo)');
  {
    const ctx = await browser.newContext(options);
    const p = await ctx.newPage();
    await p.clock.setFixedTime(new Date('2027-01-03T12:00:00'));
    await seedAndOpen({
      ...seed(), goals: { 2027: 12 }, pageGoals: { 2027: 6000 },
      books: [read('j1', 'Primeiro de 2027', '2027-01-02', { startDate: '2026-12-20', pages: 320 })],
    }, '#/inicio', p);
    await p.waitForSelector('.bento-pages');
    const text = await p.textContent('.bento-pages');
    assert.doesNotMatch(text, /ritmo/, `3 de janeiro: ${text.replace(/\s+/g, ' ')}`);
    assert.doesNotMatch(await p.getAttribute('.hero-pages-track', 'aria-label'), /ritmo/);
    await ctx.close();
  }

  step('livro novo: Return nos campos não salva (nada de "Lido" sem querer)');
  await seedAndOpen(seed(), '#/novo');
  await onPage('novo');
  assert.equal(await page.getAttribute('#f-title', 'enterkeyhint'), 'next');
  await page.fill('#f-title', 'Livro Digitado');
  await page.press('#f-title', 'Enter');
  assert.equal(await page.evaluate(() => document.activeElement.id), 'f-authors', 'Return no título vai para o autor');
  await page.fill('#f-authors', 'Autora');
  await page.press('#f-authors', 'Enter');
  assert.equal(await page.evaluate(() => document.activeElement.id), 'f-pages');
  await page.fill('#f-pages', '200');
  await page.press('#f-pages', 'Enter');
  await page.press('#f-start', 'Enter').catch(() => {});
  await page.waitForTimeout(400);
  assert.equal(await page.evaluate(() => document.getElementById('app').dataset.page), 'novo', 'continua no cadastro');
  assert.equal((await readState()).books.some((b) => b.title === 'Livro Digitado'), false, 'nada foi salvo');
  // Salvar continua sendo pelo botão.
  await page.click('[data-action="set-status"][data-value="quero"]');
  await page.click('.form-actions button[type="submit"]');
  s = await waitState((st) => st.books.some((b) => b.title === 'Livro Digitado'));
  assert.equal(s.books.find((b) => b.title === 'Livro Digitado').status, 'quero');


  step('telas em 320, 375, 390 e 430px: títulos longos, séries, etiquetas, Capas, filtros e folhas');
  await seedAndOpen(seed());
  const smallTargets = (scope) => page.evaluate((sel) => [...document.querySelectorAll(`${sel} button, ${sel} a[href], ${sel} select`)]
    .filter((el) => el.offsetParent && !el.closest('.swipe-actions') && !el.matches('.reading-link, .li-link, .cg-link, .fchip-pick select'))
    .map((el) => [el, (el.closest('.fchip') || el).getBoundingClientRect()])
    .filter(([, r]) => r.width && (r.height < 40 || r.width < 36))
    .map(([el, r]) => `${el.className || el.tagName} ${Math.round(r.width)}×${Math.round(r.height)}`), scope);
  for (const width of [320, 375, 390, 430]) {
    const height = width === 320 ? 568 : width === 375 ? 667 : width === 430 ? 932 : 844;
    await page.setViewportSize({ width, height });
    await page.goto(`${BASE}#/inicio`);
    await onPage('inicio');
    assert.ok(await overflow() <= 0, `Início ${width}px: rolagem horizontal`);
    // Cartão com título enorme e sem total: o título corta em 2 linhas e os botões cabem.
    const longCard = page.locator('.reading[data-id="r3"]');
    const titleBox = await longCard.locator('.serif-title').boundingBox();
    const cardBox = await longCard.boundingBox();
    assert.ok(titleBox.x + titleBox.width <= cardBox.x + cardBox.width, `${width}px: título vaza do cartão`);
    assert.ok(titleBox.height <= 2 * 22 * 1.25 + 2, `${width}px: título com mais de 2 linhas (${Math.round(titleBox.height)}px)`);
    assert.deepEqual(await smallTargets('#app'), [], `Início ${width}px: alvos pequenos`);
    await shot(`inicio-${width}`);
    await navClearsContent(`Início ${width}px`);

    await page.goto(`${BASE}#/estante?aba=lido`);
    await onPage('estante');
    assert.ok(await overflow() <= 0, `Estante Lidos ${width}px: rolagem horizontal`);
    const row = page.locator('.book-row[data-id="a2"]');
    const rowBox = await row.boundingBox();
    assert.ok(rowBox.height <= 96, `${width}px: linha com série e etiquetas alta demais (${Math.round(rowBox.height)}px)`);
    const extra = await row.locator('.li-extra').boundingBox();
    assert.ok(extra.x + extra.width <= rowBox.x + rowBox.width, `${width}px: série/etiquetas vazam`);
    assert.deepEqual(await smallTargets('#app'), [], `Estante ${width}px: alvos pequenos`);
    await shot(`estante-lidos-${width}`);
    // Cabeçalho do ano preso no topo ao rolar.
    // (a página fica mais alta para dar o que rolar em qualquer largura)
    await page.evaluate(() => {
      document.getElementById('app').style.paddingBottom = '1200px';
      const head = document.querySelector('.year-head');
      window.scrollTo(0, head.getBoundingClientRect().top + window.scrollY + 60);
    });
    await page.waitForTimeout(100);
    const sticky = await page.evaluate(() => Math.round(document.querySelector('.year-head').getBoundingClientRect().top));
    assert.equal(sticky, 0, `${width}px: cabeçalho do ano não fica preso no topo`);
    await page.evaluate(() => { document.getElementById('app').style.paddingBottom = ''; });
    await page.click('[data-action="shelf-mode"][data-value="capas"]');
    await page.waitForSelector('.cover-grid');
    assert.ok(await overflow() <= 0, `Capas ${width}px: rolagem horizontal`);
    await shot(`estante-capas-${width}`);
    await page.click('[data-action="shelf-mode"][data-value="lista"]');

    await page.goto(`${BASE}#/estante?aba=quero`);
    await onPage('estante');
    assert.ok(await overflow() <= 0, `Quero ler ${width}px: rolagem horizontal`);
    assert.deepEqual(await smallTargets('#app'), [], `Quero ler ${width}px: alvos pequenos`);
    await shot(`estante-quero-${width}`);
    await navClearsContent(`Quero ler ${width}px`);

    await page.goto(`${BASE}#/buscar`);
    await onPage('buscar');
    await page.selectOption('[data-filter="status"]', 'lido');
    await page.selectOption('[data-filter="tag"]', 'clássico');
    await page.waitForFunction(() => document.querySelectorAll('.fchip.is-on').length === 2);
    assert.ok(await overflow() <= 0, `Buscar ${width}px: rolagem horizontal`);
    assert.deepEqual(await smallInputs(), [], `Buscar ${width}px: campo com fonte < 16px (zoom no iPhone)`);
    assert.deepEqual(await smallTargets('#app'), [], `Buscar ${width}px: alvos pequenos`);
    await shot(`buscar-${width}`);
    // "Limpar" tira todos os filtros, inclusive a etiqueta (o chip some e a lista volta inteira).
    await page.click('[data-action="clear-filters"]');
    await page.waitForFunction(() => !document.querySelector('.fchip.is-on'), null, { timeout: 3000 })
      .catch(() => { throw new Error(`Buscar ${width}px: "Limpar" deixou um filtro ativo`); });
    assert.equal(await page.locator('.fchip-clear').count(), 0);

    await page.goto(`${BASE}#/inicio`);
    await onPage('inicio');
    await page.click('.reading[data-id="r3"] [data-action="quick-menu"]');
    await page.waitForSelector(`${openSheet} .qm`);
    await page.waitForTimeout(300);
    const qm = await page.locator('.sheet').boundingBox();
    assert.ok(qm.y >= 0 && qm.y + qm.height <= height, `${width}px: menu fora da tela`);
    await shot(`menu-${width}`);
    await page.click(`${openSheet} [data-action="update-page"]`);
    await page.waitForSelector(`${openSheet} .psheet`);
    await page.waitForTimeout(300);
    const ps = await page.locator('.sheet').boundingBox();
    assert.ok(ps.y >= 0 && ps.y + ps.height <= height, `${width}px: folha fora da tela`);
    assert.ok(await overflow() <= 0, `folha ${width}px: rolagem horizontal`);
    assert.deepEqual(await smallTargets('.sheet'), [], `folha ${width}px: alvos pequenos`);
    await shot(`folha-${width}`);
    await page.keyboard.press('Escape');
    await sheetGone();
  }
  await page.setViewportSize({ width: 390, height: 844 });

  assert.deepEqual(errors, []);
  console.log('\nTudo certo. Capturas em tests/e2e/screens/qa14-*.png');
} catch (err) {
  await page.screenshot({ path: join(SHOTS, 'qa14-falha.png'), fullPage: true }).catch(() => {});
  console.error('\nFALHOU:', err.message);
  if (errors.length) console.error(errors.join('\n'));
  process.exitCode = 1;
} finally {
  await browser.close();
  server.close();
}
