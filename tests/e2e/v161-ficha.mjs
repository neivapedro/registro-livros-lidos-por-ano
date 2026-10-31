// 1.6.1: ficha com o topo mais leve (critérios recolhidos, humor abaixo da sinopse, empréstimo só
// uma vez) e cronômetro (capa sem título repetido, sons numa fileira, volume com trilha preenchida),
// em 320/390/430, claro e escuro, dois acentos e texto 1,3×. Capturas: tests/e2e/screens/v161-ficha-*.png
// Uso: node tests/e2e/v161-ficha.mjs   (precisa do Playwright, como o smoke.mjs)

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

const TS = '2026-01-01T00:00:00.000Z';
const base = { authors: 'Autor', format: 'fisico', genre: 'Ficção', tags: [], quotes: [], journal: [], createdAt: TS, updatedAt: TS, favorite: false, notes: '', isbn: '' };
const seed = {
  version: 2, goals: { 2026: 12 }, defaultGoal: 12, customGenres: [], lastBackupAt: '2026-10-10T10:00:00.000Z', pageGoals: {}, upNext: [],
  books: [
    { ...base, id: 'c1', title: 'Hábitos Atômicos', authors: 'James Clear', pages: 320, status: 'lido', startDate: '2026-01-22', endDate: '2026-02-10', rating: 4.5, favorite: true,
      criteria: { personagens: 5, enredo: 4.5, escrita: 5, emocao: 4 }, moods: ['reflexivo', 'inspirador'], pace: 'medio',
      description: 'Pequenas mudanças, resultados notáveis: um método prático para criar bons hábitos e largar os maus, com ciência e exemplos do dia a dia.',
      loan: { to: 'Ana', since: '2026-03-01' }, notes: 'Sistemas > metas.' },
    { ...base, id: 'c2', title: 'Sem sinopse', pages: 200, status: 'lido', startDate: '2026-03-01', endDate: '2026-03-12', rating: 3, moods: ['leve'] },
    { ...base, id: 'c3', title: 'Livro simples', pages: 200, status: 'lido', startDate: '2026-04-01', endDate: '2026-04-12', rating: 4 },
    { ...base, id: 'a1', title: 'Duna (audiolivro)', authors: 'Frank Herbert', format: 'audiolivro', durationMin: 1260, status: 'lendo', startDate: '2026-10-05', currentMin: 300 },
  ],
};

const browser = await playwright.chromium.launch();
const errors = [];
const step = (msg) => console.log(`• ${msg}`);
const shot = (page, name) => page.screenshot({ path: join(SHOTS, `v161-ficha-${name}.png`) });

async function newPage({ width = 390, scheme = 'dark', accent = null, scale = 1, session = null, sound = null }) {
  const context = await browser.newContext({
    viewport: { width, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, locale: 'pt-BR', reducedMotion: 'reduce', colorScheme: scheme,
  });
  const page = await context.newPage();
  await page.clock.setFixedTime(new Date('2026-10-16T12:00:00'));
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errors.push(`console: ${m.text()}`); });
  await page.route(/^https:\/\//, (r) => r.abort());
  await page.goto(BASE);
  await page.waitForFunction(() => document.getElementById('app').dataset.page);
  await page.evaluate(async ({ d, a, s, snd }) => {
    await (await import('/js/db.js')).setItem('state', d);
    if (a) localStorage.setItem('leituras:acento', a); else localStorage.removeItem('leituras:acento');
    if (s) localStorage.setItem('leituras:sessao', JSON.stringify(s)); else localStorage.removeItem('leituras:sessao');
    if (snd) localStorage.setItem('leituras:som', JSON.stringify(snd)); else localStorage.removeItem('leituras:som');
  }, { d: seed, a: accent, s: session, snd: sound });
  page.__scale = scale;
  return page;
}
async function open(page, hash, name) {
  await page.evaluate((h) => history.replaceState(null, '', h), hash);
  await page.reload();
  await page.waitForFunction((n) => document.getElementById('app').dataset.page === n, name);
  if (page.__scale !== 1) {
    await page.evaluate((s) => {
      document.documentElement.style.setProperty('--type-scale', String(s));
      document.documentElement.style.setProperty('--type-scale-lg', String(s));
    }, page.__scale);
  }
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(80);
}
const noOverflow = async (page, label) => {
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth) <= 0, true, `${label}: rolagem horizontal`);
  const small = await page.evaluate(() => [...document.querySelectorAll('#app button, #app a, #app summary')]
    .filter((el) => el.offsetParent && el.getBoundingClientRect().height < 43.5).map((el) => el.outerHTML.slice(0, 80)));
  assert.deepEqual(small, [], `${label}: alvos < 44px`);
};
const order = (page, selectors) => page.evaluate((sels) => sels.map((s) => document.querySelector(s)?.getBoundingClientRect().top ?? null), selectors);

const combos = [
  { width: 320, scheme: 'light', accent: 'terracota', scale: 1 },
  { width: 390, scheme: 'dark', accent: 'petroleo', scale: 1 },
  { width: 430, scheme: 'light', accent: 'vinho', scale: 1 },
  { width: 320, scheme: 'dark', accent: 'terracota', scale: 1.3 },
  { width: 390, scheme: 'light', accent: 'petroleo', scale: 1.3 },
];

try {
  for (const combo of combos) {
    const tag = `${combo.width}-${combo.scheme}-${combo.accent}-${combo.scale}`;
    step(`ficha ${tag}`);
    const page = await newPage(combo);
    await open(page, '#/livro/c1', 'livro');

    // Topo enxuto: nada de humor nem selo de empréstimo antes da sinopse; critérios recolhidos.
    assert.equal(await page.locator('.ficha-hero .ficha-moods, .ficha-hero .ficha-loan').count(), 0);
    assert.equal(await page.locator('.ficha-loan').count(), 0, 'sem selo de empréstimo no topo');
    assert.equal(await page.locator('.ficha-loan-card').count(), 1, 'empréstimo só uma vez (cartão com Devolvido)');
    const wrap = page.locator('.ficha-crit-wrap');
    assert.equal(await wrap.count(), 1);
    assert.equal(await wrap.evaluate((el) => el.open), false, 'critérios recolhidos');
    assert.equal(await page.locator('.ficha-crit').isVisible(), false);
    assert.equal(await page.locator('.ficha-crit-toggle').innerText(), 'Ver critérios');
    const [rate, summary, stats, syn, mood, loan] = await order(page, ['.ficha-rate', '.ficha-crit-toggle', '.ficha-stats', '.ficha-syn', '.ficha-mood-section', '.ficha-loan-card']);
    assert.ok(rate <= summary && summary < stats && stats < syn && syn < mood && mood < loan, `ordem: ${[rate, summary, stats, syn, mood, loan]}`);
    await noOverflow(page, `ficha ${tag}`);
    await shot(page, `${tag}-fechada`);

    await page.click('.ficha-crit-toggle');
    assert.equal(await wrap.evaluate((el) => el.open), true);
    assert.equal(await page.locator('.ficha-crit-toggle').innerText(), 'Ocultar critérios');
    assert.deepEqual(await page.locator('.ficha-crit dt').allInnerTexts(), ['Personagens', 'Enredo', 'Escrita', 'Emoção']);
    // Tocar no coração redesenha a ficha: os critérios continuam abertos.
    await page.click('.ficha-fav');
    await page.waitForTimeout(200);
    assert.equal(await page.locator('.ficha-crit-wrap').evaluate((el) => el.open), true, 'continua aberto após redesenhar');
    await noOverflow(page, `ficha aberta ${tag}`);
    await shot(page, `${tag}-aberta`);
    await page.click('.ficha-crit-toggle');
    assert.equal(await page.locator('.ficha-crit').isVisible(), false);

    // Sem sinopse: humor abaixo dos números; sem critérios: nada de "Ver critérios".
    await open(page, '#/livro/c2', 'livro');
    assert.equal(await page.locator('.ficha-crit-wrap').count(), 0);
    assert.equal(await page.locator('.ficha-mood-section .ficha-chip').count(), 1);
    const [st, md] = await order(page, ['.ficha-stats', '.ficha-mood-section']);
    assert.ok(md > st, 'humor abaixo dos números');
    await open(page, '#/livro/c3', 'livro');
    assert.equal(await page.locator('.ficha-mood-section, .ficha-crit-wrap').count(), 0);

    step(`cronômetro ${tag}`);
    const session = { bookId: 'a1', startedAt: Date.now() - 600000, pausedAt: null, pausedMs: 0 };
    const timer = await newPage({ ...combo, session, sound: { sound: 'chuva', volume: 0 } });
    await open(timer, '#/ler/a1', 'ler');
    assert.equal(await timer.locator('.timer .cover .cover-title').count(), 0, 'capa sem o título repetido');
    assert.equal(await timer.locator('.timer-book .serif-title').innerText(), 'Duna (audiolivro)');
    const chips = timer.locator('.amb-chip');
    assert.equal(await chips.count(), 5);
    const tops = await chips.evaluateAll((els) => els.map((e) => Math.round(e.getBoundingClientRect().top)));
    assert.equal(new Set(tops).size, 1, 'sons numa fileira só');
    assert.equal(await timer.locator('.amb-chip[data-value="marrom"]').getAttribute('aria-label'), 'Ruído marrom');
    const heights = await chips.evaluateAll((els) => els.map((e) => e.getBoundingClientRect().height));
    assert.ok(heights.every((h) => h >= 44), 'chips ≥ 44px');
    // Volume no mínimo: o botão (28px) é conferido nas capturas; o preenchimento acompanha o arrastar.
    const range = timer.locator('[data-ambient-volume]');
    assert.equal(await range.evaluate((el) => el.style.getPropertyValue('--p')), '0');
    await range.evaluate((el) => { el.value = '80'; el.dispatchEvent(new Event('input', { bubbles: true })); });
    assert.equal(await range.evaluate((el) => el.style.getPropertyValue('--p')), '0.8');
    await range.evaluate((el) => { el.value = '0'; el.dispatchEvent(new Event('input', { bubbles: true })); });
    await noOverflow(timer, `cronômetro ${tag}`);
    await shot(timer, `cronometro-${tag}`);
    // Tudo alcançável rolando a fileira.
    await timer.locator('.amb-chip[data-value="marrom"]').scrollIntoViewIfNeeded();
    assert.equal(await timer.locator('.amb-chip[data-value="marrom"]').isVisible(), true);
    await page.context().close();
    await timer.context().close();
  }
  assert.deepEqual(errors, []);
  console.log('OK v161-ficha');
} finally {
  await browser.close();
  server.close();
}
