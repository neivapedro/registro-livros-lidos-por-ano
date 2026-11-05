// Teste de ponta a ponta da 1.6.3: no Início, a linha discreta "Você não registra leitura há N dias"
// (N >= 3, só com livro em leitura e diário não vazio), no lugar da sequência quebrada; toque abre
// "Registrar leitura" do livro mais recente; some ao registrar. Relógio congelado (pauseAt).
// 320/390/430, claro/escuro, 2 cores de destaque, escala 1,3.
// Uso: node tests/e2e/v163-inicio.mjs   (capturas em tests/e2e/screens/v163-inicio-*.png)


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

const TODAY = '2026-11-05';
const TS = '2026-01-01T00:00:00.000Z';
const entry = (date, from, to) => ({ date, from, to, unit: 'page', note: '' });
const reading = (id, title, updatedAt, journal, extra = {}) => ({
  id, title, authors: `Autor de ${title}`, status: 'lendo', format: 'fisico', pages: 300, currentPage: journal.length ? journal[journal.length - 1].to : 0,
  startDate: '2026-09-01', createdAt: TS, updatedAt, journal, ...extra,
});
const base = { version: 2, goals: { 2026: 12 }, defaultGoal: 12, customGenres: [], lastBackupAt: '2026-11-01T10:00:00.000Z', upNext: [], pageGoals: {} };
const withLast = (last, extraBooks = []) => ({
  ...base,
  books: [
    reading('r1', 'Fora de Série', '2026-10-01T10:00:00.000Z', [entry(last, 40, 70)]),
    reading('r2', 'O Nome do Vento, edição comentada e muito longa', '2026-10-20T10:00:00.000Z', []),
    ...extraBooks,
  ],
});
const daysAgo = (n) => { const d = new Date(`${TODAY}T00:00:00Z`); d.setUTCDate(d.getUTCDate() - n); return d.toISOString().slice(0, 10); };

const browser = await playwright.chromium.launch();
const baseOptions = { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, locale: 'pt-BR' };
const errors = [];
const step = (msg) => console.log(`• ${msg}`);
const NOON = new Date(`${TODAY}T12:00:00`);

async function newPage({ scheme = 'dark', accent = 'terracota', data, width = 390 } = {}) {
  const context = await browser.newContext({ ...baseOptions, viewport: { width, height: 844 }, colorScheme: scheme === 'light' ? 'light' : 'dark' });
  const page = await context.newPage();
  // Relógio congelado: instala um pouco antes e pausa em NOON (sem relógio correndo).
  await page.clock.install({ time: new Date(NOON.getTime() - 5000) });
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errors.push(`console: ${m.text()}`); });
  await page.goto(`${BASE}#/inicio`);
  await page.waitForSelector('#app[data-page]');
  await page.evaluate(async ([d, s, a]) => {
    await (await import('/js/db.js')).setItem('state', d);
    localStorage.setItem('leituras:tema', s === 'light' ? 'claro' : 'escuro');
    localStorage.setItem('leituras:acento', a);
  }, [data, scheme, accent]);
  await page.reload();
  await page.clock.pauseAt(NOON);
  await page.waitForSelector('#app[data-page="inicio"] .greet');
  return { context, page };
}

const overflow = (page) => page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
const idleLine = (page) => page.locator('.greet-idle');
const lineText = async (page) => (await page.locator('.greet-streak').allTextContents()).map((t) => t.trim());
const shot = async (page, name) => {
  await page.screenshot({ path: join(SHOTS, `v163-inicio-${name}.png`), clip: { x: 0, y: 0, width: page.viewportSize().width, height: 330 }, animations: 'disabled' });
};
const setScale = (page, v) => page.evaluate((s) => {
  const st = document.documentElement.style;
  st.setProperty('--type-scale', String(s));
  st.setProperty('--type-scale-ui', String(Math.min(s, 1.3)));
  st.setProperty('--type-scale-nav', String(Math.min(s, 1.2)));
  st.setProperty('--type-scale-lg', String(1 + (s - 1) * 0.5));
}, v);

try {
  step('2 dias: sem linha; 3 dias: com linha; 40 dias; 400 dias');
  for (const [n, expected] of [[2, null], [3, 'Você não registra leitura há 3 dias'], [40, 'Você não registra leitura há 40 dias'], [400, 'Você não registra leitura há 400 dias']]) {
    const { context, page } = await newPage({ data: withLast(daysAgo(n)) });
    assert.equal(await page.locator('.greet-streak').count(), expected ? 1 : 0, `${n} dias`);
    if (expected) assert.equal((await lineText(page))[0], expected);
    await context.close();
  }

  step('sem diário, sem livro em leitura: sem linha');
  {
    const noDiary = { ...base, books: [reading('r1', 'Livro novo', TS, [])] };
    const { context, page } = await newPage({ data: noDiary });
    assert.equal(await page.locator('.greet-streak').count(), 0, 'sem diário');
    await context.close();
    const finished = withLast(daysAgo(10), []);
    finished.books = finished.books.map((b) => ({ ...b, status: 'lido', endDate: '2026-10-20' }));
    const other = await newPage({ data: finished });
    assert.equal(await other.page.locator('.greet-streak').count(), 0, 'sem livro em leitura');
    await other.context.close();
  }

  step('sequência atual (hoje ou ontem): só o texto da sequência');
  for (const [last, expected] of [[0, 'Leitura registrada hoje'], [1, 'Última leitura ontem']]) {
    const { context, page } = await newPage({ data: withLast(daysAgo(last)) });
    assert.deepEqual(await lineText(page), [expected]);
    assert.equal(await idleLine(page).count(), 0);
    await context.close();
  }

  step('o último dia vale para todos os livros; o toque abre o registro do livro mais recente');
  {
    // r3 tem diário recente (2 dias atrás): não há linha.
    const recent = withLast(daysAgo(30), [reading('r3', 'Outro', '2026-09-01T10:00:00.000Z', [entry(daysAgo(2), 0, 10)])]);
    const a = await newPage({ data: recent });
    assert.equal(await a.page.locator('.greet-streak').count(), 0, 'diário de outro livro conta');
    await a.context.close();

    const { context, page } = await newPage({ data: withLast(daysAgo(7)) });
    const btn = idleLine(page);
    assert.equal(await btn.count(), 1);
    assert.equal(await btn.getAttribute('aria-label'), 'Você não registra leitura há 7 dias. Registrar leitura de O Nome do Vento, edição comentada e muito longa');
    const box = await btn.boundingBox();
    assert.ok(box.height >= 44, `área de toque (${box.height})`);
    await btn.tap();
    await page.waitForSelector('.sheet-progress .psheet-title');
    await page.clock.runFor(600);
    assert.match(await page.textContent('.psheet-title'), /^O Nome do Vento/);

    step('registrar leitura: a linha some');
    await page.clock.runFor(600);
    await page.fill('#progress-input', '30');
    await page.click('.psheet-actions .btn-primary');
    await page.clock.runFor(800);
    await page.waitForSelector('.sheet-progress', { state: 'detached' });
    assert.equal(await idleLine(page).count(), 0, 'sem linha ociosa');
    assert.deepEqual(await lineText(page), ['Leitura registrada hoje']);
    await context.close();
  }

  step('visual: 320/390/430, claro/escuro, 2 destaques, escala 1,3 (sem rolagem horizontal)');
  for (const [scheme, accent] of [['dark', 'terracota'], ['light', 'petroleo']]) {
    for (const width of [320, 390, 430]) {
      const { context, page } = await newPage({ scheme, accent, width, data: withLast(daysAgo(12)) });
      for (const scale of [1, 1.3, 1.6]) {
        await setScale(page, scale);
        assert.ok(await overflow(page) <= 0, `${scheme} ${accent} ${width}px x${scale}: rolagem horizontal`);
        const b = await idleLine(page).boundingBox();
        assert.ok(b.x >= 0 && b.x + b.width <= width, `${width}px x${scale}: linha vaza`);
        assert.ok(b.height >= 44);
        const fs = await idleLine(page).evaluate((el) => parseFloat(getComputedStyle(el).fontSize));
        assert.ok(Math.abs(fs - 13 * scale) < 0.6, `fonte escala (${fs})`);
        const contrast = await page.evaluate(() => {
          const el = document.querySelector('.greet-idle');
          const lum = (c) => { const [r, g, b] = c.match(/[\d.]+/g).slice(0, 3).map(Number).map((v) => v / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
          const bg = getComputedStyle(document.body).backgroundColor;
          const [a, b2] = [lum(getComputedStyle(el).color), lum(bg)];
          return (Math.max(a, b2) + 0.05) / (Math.min(a, b2) + 0.05);
        });
        assert.ok(contrast >= 4.5, `${scheme} ${accent}: contraste ${contrast.toFixed(2)}`);
        if (scale === 1 || scale === 1.3) await shot(page, `${accent}-${scheme}-${width}${scale === 1 ? '' : '-x1.3'}`);
      }
      await context.close();
    }
  }

  assert.deepEqual(errors, [], `erros no console:\n${errors.join('\n')}`);
  console.log('OK: Início 1.6.3 (dias sem ler)');
} finally {
  await browser.close();
  server.close();
}
