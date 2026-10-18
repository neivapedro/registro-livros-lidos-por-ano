// Teste de ponta a ponta do cronômetro de leitura: iniciar, pausar, fechar e abrir
// o app no meio da sessão, parar e salvar a página, minutos no diário.
// Uso: node tests/e2e/cronometro.mjs   (precisa do Playwright)

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

const TODAY = '2026-10-16';
const seed = {
  version: 1,
  goals: { 2026: 12 },
  defaultGoal: 12,
  customGenres: [],
  lastBackupAt: '2026-10-10T10:00:00.000Z',
  books: [
    { id: 'duna', title: 'Duna', authors: 'Frank Herbert', pages: 600, status: 'lendo', startDate: '2026-10-01', format: 'fisico', currentPage: 100, createdAt: '2026-10-01T00:00:00.000Z' },
    { id: 'fora', title: 'Fora de Série', authors: 'Malcolm Gladwell', pages: 300, status: 'lendo', startDate: '2026-10-02', format: 'kindle', currentPercent: 20, createdAt: '2026-10-02T00:00:00.000Z' },
  ],
};

const browser = await playwright.chromium.launch();
const context = await browser.newContext({
  viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, locale: 'pt-BR',
});
// Wake Lock de mentira: conta os pedidos e quantas travas estão ativas.
await context.addInitScript(() => {
  window.__wake = { requests: 0, active: 0 };
  Object.defineProperty(navigator, 'wakeLock', {
    configurable: true,
    value: {
      async request(type) {
        window.__wake.requests += 1;
        window.__wake.active += 1;
        const lock = new EventTarget();
        lock.type = type;
        lock.released = false;
        lock.release = async () => {
          if (lock.released) return;
          lock.released = true;
          window.__wake.active -= 1;
          lock.dispatchEvent(new Event('release'));
        };
        return lock;
      },
    },
  });
});
const page = await context.newPage();
await page.clock.install({ time: new Date(`${TODAY}T09:00:00`) });

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
  throw new Error(`Estado salvo não chegou ao esperado: ${JSON.stringify(last)?.slice(0, 400)}`);
}
const errors = [];
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errors.push(`console: ${m.text()}`); });
const dialogs = [];
page.on('dialog', (d) => {
  dialogs.push(d.message());
  d.accept();
});

const shot = (name, fullPage = false) => page.screenshot({ path: join(SHOTS, `cronometro-${name}.png`), fullPage });
const step = (msg) => console.log(`• ${msg}`);
const onPage = (name) => page.waitForFunction((n) => document.getElementById('app').dataset.page === n, name);
const clockText = () => page.textContent('.timer-clock');
const waitClock = (text) => page.waitForFunction((t) => document.querySelector('.timer-clock')?.textContent === t, text);
const wake = () => page.evaluate(() => window.__wake.active);
const session = () => page.evaluate(() => JSON.parse(localStorage.getItem('leituras:sessao')));
const toastText = () => page.waitForSelector('.toast.show').then((el) => el.textContent());
const book = (st, id) => st.books.find((b) => b.id === id);
async function noOverflow(label) {
  for (const width of [390, 375, 320]) {
    await page.setViewportSize({ width, height: 844 });
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    assert.ok(overflow <= 0, `${label}: tela de ${width}px com ${overflow}px sobrando à direita`);
    if (width === 320) await shot(`320-${label.replace(/\W+/g, '-')}`);
  }
  await page.setViewportSize({ width: 390, height: 844 });
}

try {
  step('cartão "Lendo agora" com o botão Ler agora');
  await page.goto(BASE);
  await page.waitForSelector('.hero');
  await writeState(seed);
  await page.reload();
  await page.waitForSelector('.reading');
  assert.equal(await page.locator('.reading .btn-timer').count(), 2);
  assert.match(await page.textContent('.reading:has-text("Duna") .btn-timer'), /Ler agora/);
  assert.equal(await page.locator('.timer-banner').count(), 0, 'sem sessão, sem aviso');
  await shot('01-inicio', true);

  step('iniciar: tela cheia, tempo zerado e tela acesa');
  await page.click('.reading:has-text("Duna") .btn-timer');
  await onPage('ler');
  assert.equal(new URL(page.url()).hash, '#/ler/duna');
  assert.match(await clockText(), /^00:0\d$/);
  assert.match(await page.textContent('.timer'), /Duna/);
  assert.equal(await page.isVisible('#nav'), false, 'sem barra de navegação');
  await page.waitForFunction(() => window.__wake.active === 1);
  const started = await session();
  assert.equal(started.bookId, 'duna');
  assert.equal(started.pausedAt, null);

  step('o tempo vem do relógio (5 min depois)');
  await page.clock.fastForward('05:00');
  await waitClock('05:00');

  step('pausar e continuar');
  await page.click('[data-action="timer-toggle"]');
  assert.equal(await page.textContent('[data-action="timer-toggle"]'), 'Continuar');
  assert.match(await page.textContent('.timer-state'), /Pausado/);
  await page.waitForFunction(() => window.__wake.active === 0);
  await page.clock.fastForward('10:00');
  await page.waitForTimeout(100);
  assert.equal(await clockText(), '05:00', 'pausado não conta');
  assert.ok((await session()).pausedAt, 'pausa gravada');
  await shot('02-pausado');
  await page.click('[data-action="timer-toggle"]');
  await page.waitForFunction(() => window.__wake.active === 1);
  await page.clock.fastForward('07:00');
  await waitClock('12:00');
  await shot('03-cronometro');
  await noOverflow('cronômetro');

  step('fechar e abrir o app no meio da leitura');
  await page.goto(`${BASE}#/inicio`);
  await page.reload();
  await page.waitForSelector('.timer-banner');
  assert.match(await page.textContent('.timer-banner'), /Leitura em andamento:\s*12 min/);
  assert.match(await page.textContent('.timer-banner'), /Voltar/);
  assert.equal(await page.locator('.reading:has-text("Duna") .btn-timer.is-running').count(), 1);
  assert.equal(await wake(), 0, 'fora do cronômetro, a tela pode apagar');
  await shot('04-aviso-inicio');
  await noOverflow('Início com aviso');
  // Só uma sessão por vez: Ler agora em outro livro leva à sessão aberta.
  await page.click('.reading:has-text("Fora de Série") .btn-timer');
  await onPage('ler');
  assert.equal(new URL(page.url()).hash, '#/ler/duna');
  assert.match(await toastText(), /Já há uma leitura em andamento: Duna/);
  await page.click('.top .icon-btn');
  await onPage('inicio');
  await page.click('.timer-banner');
  await onPage('ler');
  assert.match(await clockText(), /^12:0\d$/);
  // Recarregar já na tela do cronômetro volta para ela, com o tempo certo.
  await page.clock.fastForward('03:00');
  await page.reload();
  await onPage('ler');
  assert.match(await clockText(), /^15:0\d$/, 'tempo certo depois de recarregar');
  await page.waitForFunction(() => window.__wake.active === 1);

  step('parar e salvar a página');
  await page.click('[data-action="timer-stop"]');
  await page.waitForSelector('[data-timer-form]');
  assert.equal(await wake(), 0);
  assert.match(await page.textContent('.timer-stop-label'), /Em que página você parou\?/);
  assert.match(await page.textContent('.timer-stop'), /de 600/);
  assert.equal(await page.inputValue('#timer-input'), '100');
  const frozen = await clockText();
  await page.clock.fastForward('05:00');
  await page.waitForTimeout(100);
  assert.equal(await clockText(), frozen, 'o tempo congela ao parar');
  await shot('05-parar');
  await noOverflow('formulário do Parar');
  // Valor inválido: mensagem e a sessão continua.
  await page.fill('#timer-input', '900');
  await page.click('.timer-stop .btn-primary');
  assert.match(await toastText(), /entre 0 e 600/);
  assert.ok(await session(), 'sessão continua depois do erro');
  await page.fill('#timer-input', '130');
  await page.click('.timer-stop .btn-primary');
  await onPage('inicio');
  assert.equal(await page.textContent('.toast.show span'), '15 min · 30 págs. · 120 págs./hora');
  assert.equal(await session(), null);
  assert.equal(await page.locator('.timer-banner').count(), 0);
  let st = await waitState((s) => book(s, 'duna').journal?.some((e) => e.minutes));
  assert.equal(book(st, 'duna').currentPage, 130);
  assert.deepEqual(book(st, 'duna').journal, [{ date: TODAY, from: 100, to: 130, unit: 'page', note: '', minutes: 15 }]);
  await shot('06-resumo');

  step('segunda sessão no mesmo dia soma os minutos (sem avanço)');
  await page.click('.reading:has-text("Duna") .btn-timer');
  await onPage('ler');
  assert.match(await clockText(), /^00:0\d$/, 'sessão nova começa do zero');
  await page.clock.fastForward('10:00');
  await waitClock('10:00');
  await page.click('[data-action="timer-stop"]');
  await page.click('[data-action="timer-back"]');
  assert.equal(await page.locator('[data-timer-form]').count(), 0);
  assert.equal((await session()).pausedAt, null, 'voltar ao cronômetro continua contando');
  await page.click('[data-action="timer-stop"]');
  await page.click('.timer-stop .btn-primary');
  await onPage('inicio');
  assert.equal(await page.textContent('.toast.show span'), '10 min');
  st = await waitState((s) => book(s, 'duna').journal[0].minutes === 25);
  assert.equal(book(st, 'duna').journal.length, 1);
  assert.equal(book(st, 'duna').journal[0].to, 130);

  step('Kindle: porcentagem');
  await page.click('.reading:has-text("Fora de Série") .btn-timer');
  await onPage('ler');
  await page.clock.fastForward('32:00');
  await waitClock('32:00');
  await page.click('[data-action="timer-stop"]');
  assert.match(await page.textContent('.timer-stop-label'), /Quantos % o Kindle mostra\?/);
  assert.equal(await page.inputValue('#timer-input'), '20');
  await page.fill('#timer-input', '26');
  await page.click('.timer-stop .btn-primary');
  await onPage('inicio');
  assert.equal(await page.textContent('.toast.show span'), '32 min · 6%');
  st = await waitState((s) => book(s, 'fora').journal?.length === 1);
  assert.deepEqual(book(st, 'fora').journal, [{ date: TODAY, from: 20, to: 26, unit: 'percent', note: '', minutes: 32 }]);

  step('sessão curta e cancelar sessão');
  await page.click('.reading:has-text("Fora de Série") .btn-timer');
  await onPage('ler');
  await page.clock.fastForward('00:40');
  await page.click('[data-action="timer-stop"]');
  await page.fill('#timer-input', '27');
  await page.click('.timer-stop .btn-primary');
  await onPage('inicio');
  assert.equal(await page.textContent('.toast.show span'), 'menos de 1 min · 1%');
  st = await waitState((s) => book(s, 'fora').currentPercent === 27);
  assert.equal(book(st, 'fora').journal[0].minutes, 32, 'menos de 1 minuto não soma');
  await page.click('.reading:has-text("Duna") .btn-timer');
  await onPage('ler');
  await page.clock.fastForward('08:00');
  await page.click('[data-action="timer-cancel"]');
  await onPage('inicio');
  assert.match(dialogs.at(-1), /Descartar esta sessão/);
  assert.equal(await page.textContent('.toast.show span'), 'Sessão descartada.');
  assert.equal(await session(), null);
  st = await readState();
  assert.equal(book(st, 'duna').journal[0].minutes, 25, 'sessão descartada não soma');
  // Endereço do cronômetro sem sessão volta ao Início.
  await page.goto(`${BASE}#/ler/duna`);
  await onPage('inicio');

  step('chegar ao fim abre o Concluir, com os minutos no diário');
  await page.click('.reading:has-text("Duna") .btn-timer');
  await onPage('ler');
  await page.clock.fastForward('05:00');
  await page.click('[data-action="timer-stop"]');
  await page.fill('#timer-input', '600');
  await page.click('.timer-stop .btn-primary');
  await onPage('livro');
  assert.match(new URL(page.url()).hash, /concluir=1/);
  assert.equal(await page.locator('.seg-btn.is-on').first().textContent(), 'Lido');
  assert.equal(await session(), null);
  assert.equal(await wake(), 0);
  await page.click('[data-submit="save-book"] .btn-primary, .btn-primary >> text=Salvar');
  st = await waitState((s) => book(s, 'duna').status === 'lido');
  assert.deepEqual(book(st, 'duna').journal, [{ date: TODAY, from: 100, to: 600, unit: 'page', note: '', minutes: 30 }]);

  assert.deepEqual(errors, []);
  console.log('\nTudo certo. Capturas em tests/e2e/screens/cronometro-*.png');
} catch (err) {
  await shot('falha', true).catch(() => {});
  console.error('\nFALHOU:', err.message);
  if (errors.length) console.error(errors.join('\n'));
  process.exitCode = 1;
} finally {
  await browser.close();
  server.close();
}
