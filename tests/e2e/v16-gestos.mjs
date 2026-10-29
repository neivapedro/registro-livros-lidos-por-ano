// Teste de ponta a ponta da 1.6 (gestos nativos), com toques de verdade do Chromium
// (Input.dispatchTouchEvent), como no iPhone:
// - voltar deslizando da borda: leva a tela junto (com a anterior por baixo), navega ao passar
//   de 35% ou num gesto rápido, volta ao lugar se soltar antes; não começa no meio da tela, na
//   vertical, nas abas principais nem com uma folha aberta; vale na ficha, edição e Ajustes;
// - barra de baixo que encolhe ao rolar para baixo e volta ao subir (alvos ≥ 44px);
// - menu com prévia ao segurar um livro (cartões do Início, linhas e capas da Estante,
//   lombadas, resultados da Buscar e "Mais ações"): capa levantada, ações, toque fora, Esc,
//   foco preso; folha comum na tela baixa (celular deitado);
// - folhas em dois tamanhos (média e grande) puxando a alça;
// - capturas em 320, 390 e 430 px, claro e escuro, inclusive no meio dos gestos.
// Uso: node tests/e2e/v16-gestos.mjs   (precisa do Playwright; capturas em tests/e2e/screens/v16-gestos-*.png)

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

const TS = '2026-01-01T10:00:00.000Z';
const base = { authors: 'Autora Exemplo', format: 'fisico', pages: 240, createdAt: TS, updatedAt: TS, journal: [], tags: [], quotes: [] };
const TITLES = ['Duna', 'Sapiens', 'Torto Arado', 'Dom Casmurro', 'Meditações', 'O Hobbit', 'Neve', 'Ensaio sobre a Cegueira',
  'A Hora da Estrela', 'Vidas Secas', 'Grande Sertão', 'O Cortiço', 'Iracema', 'Capitães da Areia', 'Memórias Póstumas',
  'Quincas Borba', 'O Alienista', 'Macunaíma', 'Sagarana', 'Laços de Família', 'Mar Morto', 'Gabriela', 'Fogo Morto', 'O Quinze'];
const seed = {
  version: 2, goals: { 2026: 24 }, defaultGoal: 24, customGenres: [], lastBackupAt: TS, upNext: ['w1'],
  books: [
    { ...base, id: 'r1', title: 'Fora de Série', authors: 'Malcolm Gladwell', status: 'lendo', pages: 300, currentPage: 120, startDate: '2026-10-01', targetDate: '2026-11-15',
      journal: [{ date: '2026-10-15', from: 92, to: 120, unit: 'page', note: '' }] },
    { ...base, id: 'r2', title: 'Livro no Kindle', authors: 'Alguém', status: 'lendo', format: 'kindle', pages: null, currentPercent: 40, startDate: '2026-10-05' },
    { ...base, id: 'w1', title: 'O Gerente Minuto', status: 'quero', pages: 120 },
    { ...base, id: 'w2', title: 'Pai Rico, Pai Pobre', status: 'quero' },
    { ...base, id: 'w3', title: 'Neuromancer', status: 'quero', format: 'kindle' },
    ...TITLES.map((title, i) => ({
      ...base, id: `a${i + 1}`, title, status: 'lido', rating: (i % 5) + 1,
      startDate: `2026-${String((i % 9) + 1).padStart(2, '0')}-01`, endDate: `2026-${String((i % 9) + 1).padStart(2, '0')}-20`,
    })),
  ],
};

// ---------- Navegador ----------

const browser = await playwright.chromium.launch();
const options = { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, locale: 'pt-BR' };
let context;
let page;
let cdp;
const errors = [];

async function newPage(extra = {}) {
  context = await browser.newContext({ ...options, ...extra });
  page = await context.newPage();
  await page.clock.setFixedTime(new Date('2026-10-16T12:00:00'));
  await page.route(/^https:\/\//, (r) => r.abort());
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errors.push(`console: ${m.text()}`); });
  page.on('dialog', (d) => d.accept());
  cdp = await context.newCDPSession(page);
  await page.goto(`${BASE}#/inicio`);
  await page.waitForSelector('#app[data-page]');
  await page.evaluate(async (d) => (await import('/js/db.js')).setItem('state', d), seed);
  await page.reload();
  await page.waitForSelector('.bento');
}

const step = (msg) => console.log(`• ${msg}`);
const readState = () => page.evaluate(async () => (await import('/js/db.js')).getItem('state'));
async function waitState(predicate) {
  let last;
  for (let i = 0; i < 50; i += 1) {
    last = await readState();
    if (last && predicate(last)) return last;
    await page.waitForTimeout(100);
  }
  throw new Error(`Estado salvo não chegou ao esperado: ${JSON.stringify(last)?.slice(0, 300)}`);
}
const onPage = (name) => page.waitForFunction((n) => document.getElementById('app').dataset.page === n, name);
const onDetail = (id) => page.waitForFunction((i) => location.hash === `#/livro/${i}` && document.querySelector(`.ficha-hero[data-id="${i}"]`), id);
const ctxOpen = '.sheet-layer.is-ctx.is-open';
const sheetGone = (why = '') => page.waitForSelector('.sheet-layer', { state: 'detached', timeout: 5000 }).catch(() => { throw new Error(`a folha não fechou ${why}`); });
const width = () => page.viewportSize().width;
const shot = async (name) => {
  await page.screenshot({ path: join(SHOTS, `v16-gestos-${name}.png`) });
};

// ---------- Toques de verdade ----------

const touchAt = (type, x, y) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x, y, id: 1 }] });
const frame = () => page.evaluate(() => new Promise((r) => requestAnimationFrame(() => r())));

/** Arrasta de (x0, y0) a (x1, y1) em `steps` passos; end: false deixa o dedo na tela. */
async function drag(x0, y0, x1, y1, { steps = 14, stepMs = 16, end = true, holdMs = 0 } = {}) {
  await touchAt('touchStart', x0, y0);
  for (let i = 1; i <= steps; i += 1) {
    await touchAt('touchMove', x0 + ((x1 - x0) * i) / steps, y0 + ((y1 - y0) * i) / steps);
    await page.waitForTimeout(stepMs);
  }
  if (holdMs) {
    // Parado no lugar (a velocidade cai a zero).
    for (let t = 0; t < holdMs; t += 40) {
      await touchAt('touchMove', x1, y1);
      await page.waitForTimeout(40);
    }
  }
  if (end) await touchAt('touchEnd', x1, y1);
}

/**
 * Um toque parado no título da tela. Os arrastos por toque do CDP deixam um "embalo" de rolagem
 * pendente no Chromium, que volta a mexer na página quando o compositor muda (o transform do
 * gesto, por exemplo); um toque simples o encerra, como um toque novo encerra o embalo no iPhone.
 */
async function calm() {
  const b = await page.locator('#app h1').first().boundingBox();
  await touchAt('touchStart', b.x + 4, b.y + b.height / 2);
  await touchAt('touchEnd', b.x + 4, b.y + b.height / 2);
  await page.waitForTimeout(120);
}

/** Gesto rápido (~60 ms) com eventos de toque criados na página, de x0 a x1 na altura y. */
async function flick(x0, y, x1) {
  await page.evaluate(async ([a, yy, b]) => {
    const target = document.elementFromPoint(a, yy) || document.body;
    const send = (type, x) => {
      const t = new Touch({ identifier: 9, target, clientX: x, clientY: yy, pageX: x, pageY: yy + scrollY });
      target.dispatchEvent(new TouchEvent(type, {
        bubbles: true, cancelable: true, composed: true,
        touches: type === 'touchend' ? [] : [t], targetTouches: type === 'touchend' ? [] : [t], changedTouches: [t],
      }));
    };
    send('touchstart', a);
    for (let i = 1; i <= 6; i += 1) {
      await new Promise((r) => setTimeout(r, 10));
      send('touchmove', a + ((b - a) * i) / 6);
    }
    send('touchend', b);
  }, [x0, y, x1]);
}

/** Segurar o dedo num elemento (toque longo de verdade). */
async function hold(selector, ms = 700) {
  const loc = page.locator(selector).first();
  await loc.scrollIntoViewIfNeeded();
  const b = await loc.boundingBox();
  const x = b.x + Math.min(b.width / 2, 60);
  const y = b.y + b.height / 2;
  await touchAt('touchStart', x, y);
  await page.waitForTimeout(ms);
  await touchAt('touchEnd', x, y);
  await page.waitForTimeout(80);
}

/** Abre a ficha tocando no link (como a pessoa faz), para o histórico ter a tela de antes. */
async function openBookFrom(listHash, id) {
  await page.goto(`${BASE}${listHash}`);
  await page.waitForFunction(() => document.getElementById('app').dataset.page);
  await page.waitForTimeout(150);
  await page.evaluate((i) => document.querySelector(`a[href="#/livro/${i}"]`).click(), id);
  await onDetail(id);
  await page.waitForTimeout(350);
}

const appShift = () => page.evaluate(() => {
  const t = getComputedStyle(document.getElementById('app')).transform;
  return t === 'none' ? 0 : new DOMMatrix(t).m41;
});

/** Estado limpo depois do gesto: sem transform, sem fundo, sem classe. */
async function settled() {
  await page.waitForFunction(() => !document.body.classList.contains('edge-back') && !document.querySelector('.edge-under')
    && !document.getElementById('app').style.transform, null, { timeout: 3000 });
}

/** Alvos de toque visíveis menores que 44px numa área. */
const smallTargets = (scope) => page.evaluate((sel) => [...document.querySelectorAll(`${sel} button, ${sel} a[href]`)]
  .filter((el) => el.offsetParent && getComputedStyle(el).visibility !== 'hidden' && getComputedStyle(el).display !== 'none')
  .map((el) => [el, el.getBoundingClientRect()])
  .filter(([, r]) => r.width && (r.height < 44 || r.width < 44))
  .map(([el, r]) => `${el.className || el.tagName} ${Math.round(r.width)}×${Math.round(r.height)}`), scope);

/** Retângulo dentro da tela? */
const inside = (r, w, h) => r.x >= 0 && r.y >= 0 && r.x + r.width <= w + 0.5 && r.y + r.height <= h + 0.5;

try {
  await newPage();

  // ---------- Voltar deslizando da borda ----------

  step('voltar da borda: a tela acompanha o dedo, a anterior aparece por baixo e o app volta');
  await openBookFrom('#/inicio', 'a9');
  const histBefore = await page.evaluate(() => history.length);
  await drag(6, 400, 120, 404, { end: false });
  await frame();
  const mid = await appShift();
  assert.ok(mid > 90 && mid < 125, `a tela segue o dedo (${mid}px)`);
  assert.equal(await page.locator('.edge-under .edge-under-page .bento').count(), 1, 'o Início aparece por baixo');
  assert.equal(await page.locator('.edge-under [id]').count(), 0, 'a imagem do Início não repete ids');
  assert.equal(await page.evaluate(() => document.querySelector('.edge-under').inert), true);
  await shot('voltar-meio');
  for (let x = 140; x <= 260; x += 20) {
    await touchAt('touchMove', x, 404);
    await page.waitForTimeout(16);
  }
  await touchAt('touchEnd', 260, 404);
  await onPage('inicio');
  assert.equal(await page.evaluate(() => location.hash), '#/inicio');
  await settled();
  assert.equal(await page.evaluate(() => history.length), histBefore, 'voltou pelo histórico (não empilhou o Início)');

  step('voltar da borda: soltar antes de 35% (parado) devolve a tela');
  await openBookFrom('#/inicio', 'a18');
  await drag(8, 420, 110, 420, { holdMs: 200 });
  await page.waitForTimeout(450);
  await settled();
  assert.equal(await page.evaluate(() => location.hash), '#/livro/a18', 'continua na ficha');
  assert.equal(await appShift(), 0);

  step('voltar da borda: gesto rápido e curto também volta');
  // (os toques do CDP chegam a cada ~60 ms; um "peteleco" de verdade precisa de eventos mais juntos)
  await flick(4, 420, 100);
  await onPage('inicio');
  await settled();

  step('meio da tela, vertical na borda e para a esquerda: nada acontece');
  await openBookFrom('#/inicio', 'a8');
  await drag(150, 400, 360, 400);
  await page.waitForTimeout(300);
  assert.equal(await page.evaluate(() => location.hash), '#/livro/a8', 'do meio da tela não volta');
  assert.equal(await page.locator('.edge-under').count(), 0);

  step('rolado: a tela vai junto sem pular e a barra compacta fica no lugar (Todos os anos)');
  await page.goto(`${BASE}#/resumo/todos`);
  await onPage('resumo');
  await page.waitForTimeout(200);
  await calm();
  await page.evaluate(() => window.scrollTo(0, 500));
  await page.waitForFunction(() => document.querySelector('#app .cbar.is-on'));
  await page.waitForTimeout(300);
  const scrolled = await page.evaluate(() => window.scrollY);
  assert.ok(scrolled > 300, `a tela rolou (${scrolled})`);
  const barBefore = await page.locator('#app .cbar').boundingBox();
  await drag(6, 400, 110, 400, { end: false });
  await frame();
  const barNow = await page.locator('#app .cbar').boundingBox();
  assert.ok(Math.abs(barNow.y - barBefore.y) < 1, `barra compacta no lugar (${barBefore.y} → ${barNow.y})`);
  assert.ok(barNow.x > barBefore.x + 80, 'e anda junto com a tela');
  await shot('voltar-rolado');
  for (let t = 0; t < 200; t += 40) {
    await touchAt('touchMove', 110, 400);
    await page.waitForTimeout(40);
  }
  await touchAt('touchEnd', 110, 400);
  await page.waitForTimeout(450);
  await settled();
  assert.equal(await page.evaluate(() => location.hash), '#/resumo/todos', 'soltou antes de 35%: fica');
  const scrolledAfter = await page.evaluate(() => window.scrollY);
  assert.ok(Math.abs(scrolledAfter - scrolled) < 2, `a rolagem não mudou (${scrolled} → ${scrolledAfter})`);
  await drag(6, 400, 300, 400);
  await onPage('inicio');
  await settled();
  await page.goto(`${BASE}#/ajustes`);
  await onPage('ajustes');

  step('Ajustes, edição e livro novo voltam pelo mesmo caminho do Voltar/Cancelar');
  await drag(6, 400, 300, 400);
  await onPage('inicio');
  await settled();
  await openBookFrom('#/inicio', 'a17');
  await page.click('a:has-text("Editar")');
  await page.waitForFunction(() => /\/editar$/.test(location.hash));
  await page.waitForTimeout(250);
  await drag(6, 500, 300, 500);
  await onDetail('a17');
  await settled();
  await drag(6, 500, 300, 500);
  await onPage('inicio');
  await settled();

  step('abas principais e folha aberta: o gesto não existe');
  for (const hash of ['#/inicio', '#/estante', '#/buscar', '#/resumo/2026']) {
    await page.goto(`${BASE}${hash}`);
    await page.waitForTimeout(250);
    await drag(6, 420, 300, 420);
    await page.waitForTimeout(250);
    assert.equal(await page.evaluate(() => location.hash), hash, `${hash}: aba principal não volta`);
    assert.equal(await page.locator('.edge-under').count(), 0);
  }
  await openBookFrom('#/inicio', 'r1');
  await page.click('.ficha-card [data-action="update-page"], [data-action="update-page"]');
  await page.waitForSelector('.sheet-layer.is-open .psheet');
  await page.waitForTimeout(300);
  await drag(6, 200, 300, 200);
  await page.waitForTimeout(300);
  assert.equal(await page.evaluate(() => location.hash), '#/livro/r1', 'com folha aberta, não volta');
  assert.equal(await page.locator('.sheet-layer.is-open .psheet').count(), 1, 'a folha continua aberta');
  await page.keyboard.press('Escape');
  await sheetGone();

  step('vertical começando na borda: a página rola normalmente');
  // Por último e numa página nova: o "embalo" que o Chromium deixa depois de uma rolagem por
  // toque do CDP continua mexendo na página nos gestos seguintes (no iPhone, um toque novo o para).
  await page.goto(`${BASE}#/ajustes`);
  await onPage('ajustes');
  await page.waitForTimeout(200);
  await drag(10, 600, 14, 300, { steps: 12 });
  await page.waitForTimeout(500);
  assert.ok(await page.evaluate(() => window.scrollY) > 50, 'na vertical, a página rola');
  assert.equal(await page.evaluate(() => location.hash), '#/ajustes');
  assert.equal(await page.locator('.edge-under').count(), 0);
  assert.equal(await page.evaluate(() => document.body.classList.contains('edge-back')), false);
  await context.close();
  await newPage();

  // ---------- Barra de baixo que encolhe ----------

  step('barra de baixo: encolhe rolando para baixo, volta ao subir e no fim');
  await page.goto(`${BASE}#/estante?aba=lido`);
  await onPage('estante');
  await page.waitForTimeout(300);
  const navFull = await page.locator('#nav').boundingBox();
  const compact = () => page.evaluate(() => document.body.classList.contains('nav-compact'));
  for (let y = 0; y <= 700; y += 70) {
    await page.evaluate((v) => window.scrollTo(0, v), y);
    await frame();
  }
  assert.equal(await compact(), true, `rolando para baixo encolhe ${await page.evaluate(() => JSON.stringify([document.body.className, scrollY, document.documentElement.scrollHeight, innerHeight]))}`);
  await page.waitForTimeout(450);
  const navSmall = await page.locator('#nav').boundingBox();
  assert.ok(navSmall.height < navFull.height - 6, `mais baixa (${navFull.height} → ${navSmall.height})`);
  assert.ok(Math.abs((navSmall.y + navSmall.height) - (navFull.y + navFull.height)) < 4, 'continua presa embaixo (área segura)');
  assert.equal(await page.evaluate(() => getComputedStyle(document.querySelector('.nav-label')).opacity), '0', 'nomes somem');
  assert.deepEqual(await smallTargets('#nav'), [], 'compacta: alvos ainda com 44px');
  assert.equal(await page.evaluate(() => getComputedStyle(document.getElementById('nav')).transitionProperty.includes('scale')), true, 'só transform');
  await shot('barra-compacta');
  await page.evaluate(() => window.scrollBy(0, -10));
  await frame();
  assert.equal(await compact(), true, 'um tremido para cima não abre');
  await page.evaluate(() => window.scrollBy(0, -40));
  await frame();
  assert.equal(await compact(), false, 'rolando para cima volta');
  await page.evaluate(() => window.scrollBy(0, 200));
  await frame();
  assert.equal(await compact(), true);
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  await frame();
  await frame();
  assert.equal(await compact(), false, 'no fim da página volta');
  // Tocar num item da barra compacta funciona (troca de tela e a barra volta inteira).
  await page.evaluate(() => window.scrollTo(0, 300));
  await frame();
  await page.evaluate(() => window.scrollTo(0, 700));
  await frame();
  assert.equal(await compact(), true);
  await page.click('#nav [data-nav="buscar"]');
  await onPage('buscar');
  assert.equal(await compact(), false, 'tela nova: barra inteira');

  // ---------- Menu com prévia ----------

  step('menu com prévia: segurar o cartão do Início');
  await page.goto(`${BASE}#/inicio`);
  await onPage('inicio');
  await page.waitForTimeout(300);
  await hold('.reading[data-id="r1"] .rn-cover');
  await page.waitForSelector(ctxOpen);
  assert.equal(await page.evaluate(() => document.getElementById('app').dataset.page), 'inicio', 'segurar não abre o livro');
  assert.deepEqual((await page.locator(`${ctxOpen} .qm-item`).allTextContents()).map((t) => t.trim()),
    ['Abrir livro', 'Registrar leitura', 'Ler agora', 'Concluir', 'Voltar para Quero ler'], 'mesmas ações do menu rápido');
  assert.equal(await page.locator(`${ctxOpen} .ctx-preview .cover`).count(), 1, 'capa levantada');
  assert.equal(await page.evaluate(() => document.querySelector('.reading[data-id="r1"] .rn-cover').style.visibility), 'hidden', 'a capa sai do lugar');
  assert.equal(await page.getAttribute(`${ctxOpen} .sheet`, 'role'), 'dialog');
  assert.equal(await page.getAttribute(`${ctxOpen} .sheet`, 'aria-modal'), 'true');
  assert.equal(await page.evaluate(() => document.getElementById('app').inert), true, 'resto da tela inerte');
  assert.equal(await page.evaluate(() => getComputedStyle(document.querySelector('.sheet-layer.is-ctx .sheet-backdrop')).backdropFilter.includes('blur')), true, 'fundo desfocado');
  await page.waitForTimeout(500);
  {
    const vw = width();
    const vh = page.viewportSize().height;
    assert.ok(inside(await page.locator(`${ctxOpen} .sheet`).boundingBox(), vw, vh), 'menu dentro da tela');
    assert.ok(inside(await page.locator(`${ctxOpen} .ctx-preview .cover`).boundingBox(), vw, vh), 'capa dentro da tela');
  }
  assert.equal(await page.evaluate(() => document.activeElement?.textContent.trim()), 'Abrir livro', 'foco no primeiro item');
  // Foco preso: Shift+Tab do primeiro vai ao último.
  await page.keyboard.press('Shift+Tab');
  assert.equal(await page.evaluate(() => document.activeElement?.textContent.trim()), 'Voltar para Quero ler');
  await page.keyboard.press('Tab');
  assert.equal(await page.evaluate(() => document.activeElement?.textContent.trim()), 'Abrir livro');
  // Toque fora fecha e a capa volta para o lugar.
  await page.mouse.click(width() - 12, page.viewportSize().height - 160);
  await sheetGone('com toque fora');
  assert.equal(await page.evaluate(() => document.querySelector('.reading[data-id="r1"] .rn-cover').style.visibility), '', 'a capa volta');
  assert.equal(await page.evaluate(() => document.getElementById('app').inert), false);

  step('menu com prévia: Registrar leitura troca para a folha; Esc fecha');
  await hold('.reading[data-id="r1"] .rn-cover');
  await page.waitForSelector(ctxOpen);
  await page.click(`${ctxOpen} [data-action="update-page"]`);
  await page.waitForSelector('.sheet-layer.is-open .psheet');
  assert.equal(await page.locator('.sheet-layer.is-ctx').count(), 0);
  assert.equal(await page.evaluate(() => document.querySelector('.reading[data-id="r1"] .rn-cover').style.visibility), '');
  await page.keyboard.press('Escape');
  await sheetGone();

  step('menu com prévia: "Mais ações" também levanta a capa; Esc fecha e devolve o foco');
  await page.click('.reading[data-id="r1"] [data-action="quick-menu"]');
  await page.waitForSelector(ctxOpen);
  await page.keyboard.press('Escape');
  await sheetGone('com Esc');
  assert.equal(await page.evaluate(() => document.activeElement?.dataset.action), 'quick-menu', 'foco volta ao botão');

  step('menu com prévia: linhas da Estante (Quero ler) e a ação Marcar como próxima');
  await page.goto(`${BASE}#/estante?aba=quero`);
  await onPage('estante');
  await page.waitForTimeout(250);
  await hold('.book-row[data-id="w2"] .li-link');
  await page.waitForSelector(ctxOpen);
  assert.deepEqual((await page.locator(`${ctxOpen} .qm-item`).allTextContents()).map((t) => t.trim()), ['Abrir livro', 'Começar a ler', 'Marcar como próxima']);
  await page.click(`${ctxOpen} [data-action="toggle-next"]`);
  await waitState((s) => s.upNext.includes('w2'));
  await sheetGone();

  step('menu com prévia: capas (modo Capas) e "Abrir livro"');
  await page.goto(`${BASE}#/estante?aba=lendo`);
  await onPage('estante');
  await page.click('[data-action="shelf-mode"][data-value="capas"]');
  await page.waitForSelector('.cg-link');
  await hold('.cg-link[data-id="r1"]');
  await page.waitForSelector(ctxOpen);
  assert.equal(page.url().endsWith('#/estante?aba=lendo'), true, 'segurar a capa não abre a ficha');
  await page.click(`${ctxOpen} a:has-text("Abrir livro")`);
  await onDetail('r1');
  await page.waitForFunction(() => !document.querySelector('.sheet-layer'));

  step('menu com prévia: lombadas');
  await page.goto(`${BASE}#/estante?aba=lendo`);
  await onPage('estante');
  await page.click('[data-action="shelf-mode"][data-value="lombadas"]');
  await page.waitForSelector('.spine');
  await hold('.spine[data-id="r2"]');
  await page.waitForSelector(ctxOpen);
  assert.match(await page.textContent(`${ctxOpen} .qm-title`), /Livro no Kindle/);
  await page.waitForTimeout(450);
  await shot('menu-lombada');
  await page.keyboard.press('Escape');
  await sheetGone();
  await page.click('[data-action="shelf-mode"][data-value="lista"]');

  step('menu com prévia: resultados da Buscar e Começar a ler');
  await page.goto(`${BASE}#/buscar`);
  await onPage('buscar');
  await page.fill('#q', 'Neuromancer');
  await page.waitForSelector('.book-row[data-id="w3"]');
  await hold('.book-row[data-id="w3"] .li-link');
  await page.waitForSelector(ctxOpen);
  await page.click(`${ctxOpen} [data-action="start-reading"]`);
  await waitState((s) => s.books.find((b) => b.id === 'w3').status === 'lendo');
  await sheetGone();

  step('menu com prévia: tela baixa (celular deitado) usa a folha de baixo');
  await page.setViewportSize({ width: 740, height: 380 });
  await page.goto(`${BASE}#/estante?aba=quero`);
  await onPage('estante');
  await page.click('[data-action="quick-menu"][data-id="w1"]');
  await page.waitForSelector('.sheet-layer.is-open .qm');
  assert.equal(await page.locator('.sheet-layer.is-ctx').count(), 0, 'folha comum');
  await page.keyboard.press('Escape');
  await sheetGone();
  await page.setViewportSize({ width: 390, height: 844 });

  // ---------- Folhas em dois tamanhos ----------

  step('folhas: Registrar leitura cabe inteira no 390×844 (um tamanho só)');
  await page.goto(`${BASE}#/inicio`);
  await onPage('inicio');
  await page.click('.reading[data-id="r1"] [data-action="update-page"]');
  await page.waitForSelector('.sheet-layer.is-open .psheet');
  assert.equal(await page.locator('.sheet.has-detents').count(), 0);
  await page.keyboard.press('Escape');
  await sheetGone();

  step('folhas: no 320×568 abre na média; a alça leva à grande, de volta à média e fecha');
  await page.setViewportSize({ width: 320, height: 568 });
  await page.waitForTimeout(200);
  await page.click('.reading[data-id="r1"] [data-action="update-page"]');
  await page.waitForSelector('.sheet-layer.is-open .psheet');
  await page.waitForTimeout(400);
  const sheet = '.sheet-layer.is-open .sheet';
  const sheetInfo = () => page.evaluate((sel) => {
    const p = document.querySelector(sel);
    const r = p.getBoundingClientRect();
    return { detent: p.dataset.detent, h: Math.round(r.height), top: Math.round(r.top), bottom: Math.round(r.bottom), overflow: getComputedStyle(p.querySelector('.sheet-body')).overflowY };
  }, sheet);
  let info = await sheetInfo();
  assert.equal(info.detent, 'medium');
  assert.ok(Math.abs(info.h - Math.round(568 * 0.55)) <= 2, `média com ${info.h}px`);
  assert.equal(info.overflow, 'hidden', 'na média o conteúdo não rola');
  const save = await page.locator(`${sheet} button[type="submit"]`).boundingBox();
  assert.ok(save.y >= info.top && save.y + save.height <= info.bottom + 0.5, 'Salvar à vista na média');
  await shot('folha-media-320');
  const grab = await page.locator(`${sheet} [data-sheet-grab]`).boundingBox();
  const gx = grab.x + grab.width / 2;
  const gy = grab.y + grab.height / 2;
  // Puxando para cima (dedo ainda na tela): a folha cresce junto.
  await drag(gx, gy, gx, gy - 70, { end: false });
  await frame();
  const growing = await sheetInfo();
  assert.ok(growing.h > info.h + 40, `cresce com o dedo (${info.h} → ${growing.h})`);
  await shot('folha-puxando-320');
  await touchAt('touchMove', gx, gy - 140);
  await touchAt('touchEnd', gx, gy - 140);
  await page.waitForTimeout(500);
  info = await sheetInfo();
  assert.equal(info.detent, 'large', 'subiu: grande');
  assert.equal(info.overflow, 'auto', 'na grande o conteúdo rola');
  assert.ok(info.top >= 0, 'grande dentro da tela');
  await shot('folha-grande-320');
  const grab2 = await page.locator(`${sheet} [data-sheet-grab]`).boundingBox();
  await drag(gx, grab2.y + 10, gx, grab2.y + 90, { holdMs: 120 });
  await page.waitForTimeout(500);
  info = await sheetInfo();
  assert.equal(info.detent, 'medium', 'desceu um pouco: média');
  await page.click('[data-action="progress-add"][data-delta="20"]');
  assert.equal(await page.inputValue('#progress-input'), '140', 'botões da média funcionam');
  const grab3 = await page.locator(`${sheet} [data-sheet-grab]`).boundingBox();
  await drag(gx, grab3.y + 10, gx, grab3.y + 220);
  await sheetGone('puxando para baixo da média');
  assert.equal((await readState()).books.find((b) => b.id === 'r1').currentPage, 120, 'fechar não grava');
  // Na média, arrastar o próprio conteúdo (fora dos botões) também abre a grande.
  await page.click('.reading[data-id="r1"] [data-action="update-page"]');
  await page.waitForSelector('.sheet-layer.is-open .psheet');
  await page.waitForTimeout(400);
  const label = await page.locator(`${sheet} .progress-edit-label`).boundingBox();
  await drag(label.x + label.width / 2, label.y + 6, label.x + label.width / 2, label.y - 140);
  await page.waitForTimeout(500);
  assert.equal((await sheetInfo()).detent, 'large', 'arrastar o conteúdo na média abre a grande');
  await page.keyboard.press('Escape');
  await sheetGone();
  await page.setViewportSize({ width: 390, height: 844 });

  // ---------- Sem movimento ----------

  step('Reduzir movimento: menu aparece sem animação, barra não encolhe, voltar sem deslizar sozinho');
  await context.close();
  await newPage({ reducedMotion: 'reduce' });
  await hold('.reading[data-id="r1"] .rn-cover');
  await page.waitForSelector(ctxOpen);
  assert.equal(await page.evaluate(() => document.querySelector('.sheet-layer').getAnimations({ subtree: true }).length), 0, 'sem animação');
  await page.keyboard.press('Escape');
  await sheetGone();
  await page.goto(`${BASE}#/estante?aba=lido`);
  await onPage('estante');
  for (let y = 0; y <= 700; y += 70) {
    await page.evaluate((v) => window.scrollTo(0, v), y);
    await frame();
  }
  assert.equal(await page.evaluate(() => document.body.classList.contains('nav-compact')), false);
  await openBookFrom('#/inicio', 'a9');
  await drag(6, 400, 300, 400);
  await onPage('inicio');
  await settled();
  await context.close();

  // ---------- Capturas: 320, 390 e 430 px, claro e escuro ----------

  for (const scheme of ['light', 'dark']) {
    await newPage({ colorScheme: scheme });
    for (const w of [320, 390, 430]) {
      const h = w === 320 ? 568 : w === 390 ? 844 : 932;
      const tag = `${w}-${scheme === 'light' ? 'claro' : 'escuro'}`;
      step(`capturas ${tag}`);
      await page.setViewportSize({ width: w, height: h });
      // Menu com prévia no Início.
      await page.goto(`${BASE}#/inicio`);
      await onPage('inicio');
      await page.waitForTimeout(300);
      await hold('.reading[data-id="r1"] .rn-cover');
      await page.waitForSelector(ctxOpen);
      await page.waitForTimeout(500);
      assert.ok(inside(await page.locator(`${ctxOpen} .sheet`).boundingBox(), w, h), `${tag}: menu fora da tela`);
      assert.ok(inside(await page.locator(`${ctxOpen} .ctx-preview .cover`).boundingBox(), w, h), `${tag}: capa fora da tela`);
      assert.deepEqual(await smallTargets(`${ctxOpen} .sheet`), [], `${tag}: alvos pequenos no menu`);
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth) <= 0, `${tag}: rolagem para o lado`);
      await shot(`menu-${tag}`);
      // No meio da animação (a capa saindo do lugar).
      await page.keyboard.press('Escape');
      await sheetGone();
      await page.click('.reading[data-id="r2"] [data-action="quick-menu"]');
      await page.waitForTimeout(120);
      await shot(`menu-abrindo-${tag}`);
      await page.keyboard.press('Escape');
      await sheetGone();
      // Voltar da borda no meio do gesto.
      await openBookFrom('#/inicio', 'a9');
      await drag(6, h / 2, w * 0.45, h / 2, { end: false });
      await frame();
      await shot(`voltar-${tag}`);
      await touchAt('touchEnd', w * 0.45, h / 2);
      await onPage('inicio');
      await settled();
      // Barra compacta.
      await page.goto(`${BASE}#/estante?aba=lido`);
      await onPage('estante');
      for (let y = 0; y <= 700; y += 70) {
        await page.evaluate((v) => window.scrollTo(0, v), y);
        await frame();
      }
      await page.waitForTimeout(450);
      assert.deepEqual(await smallTargets('#nav'), [], `${tag}: alvos da barra compacta`);
      const nb = await page.locator('#nav').boundingBox();
      assert.ok(nb.x >= 8 && nb.x + nb.width <= w - 8 && nb.y + nb.height <= h, `${tag}: barra compacta na tela`);
      await shot(`barra-${tag}`);
      // Folha em dois tamanhos (altura baixa o bastante para o conteúdo não caber na média).
      await page.setViewportSize({ width: w, height: Math.min(h, 600) });
      await page.goto(`${BASE}#/inicio`);
      await onPage('inicio');
      await page.click('.reading[data-id="r1"] [data-action="update-page"]');
      await page.waitForSelector('.sheet-layer.is-open .psheet');
      await page.waitForTimeout(450);
      assert.equal(await page.getAttribute('.sheet-layer.is-open .sheet', 'data-detent'), 'medium', `${tag}: folha na média`);
      await shot(`folha-${tag}`);
      await page.keyboard.press('Escape');
      await sheetGone();
    }
    await context.close();
  }

  assert.deepEqual(errors, []);
  console.log('\nTudo certo. Capturas em tests/e2e/screens/v16-gestos-*.png');
} catch (err) {
  console.error(`\nFALHOU: ${err.message}`);
  try {
    await page?.screenshot({ path: join(SHOTS, 'v16-gestos-falha.png') });
  } catch { /* página já fechada */ }
  process.exitCode = 1;
} finally {
  await browser.close();
  server.close();
}
