// QA da 1.6.3: casos adversariais da linha "Você não registra leitura há N dias" (fusos, meia-noite,
// audiolivro só com minutos, voltar para Quero ler, vários livros, escalas, acentos, deslocamento do
// layout, rolagem com título recolhido) e regressão do alvo de toque de "+ Trecho".
// Uso: node tests/e2e/qa-v163.mjs   (capturas em tests/e2e/screens/qa-v163-*.png)

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

const ACCENTS = ['terracota', 'oliva', 'petroleo', 'vinho', 'grafite'];
const TS = '2026-01-01T00:00:00.000Z';
const entry = (date, from, to, extra = {}) => ({ date, from, to, unit: 'page', note: '', ...extra });
const reading = (id, title, updatedAt, journal, extra = {}) => ({
  id, title, authors: `Autor de ${title}`, status: 'lendo', format: 'fisico', pages: 300, currentPage: journal.length ? journal[journal.length - 1].to : 0,
  startDate: '2026-09-01', createdAt: TS, updatedAt, journal, ...extra,
});
const base = { version: 2, goals: { 2026: 12 }, defaultGoal: 12, customGenres: [], lastBackupAt: '2026-11-01T10:00:00.000Z', upNext: [], pageGoals: {} };

const browser = await playwright.chromium.launch();
const baseOptions = { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, locale: 'pt-BR' };
const errors = [];
const step = (msg) => console.log(`• ${msg}`);

// now: instante absoluto (Date); tz: fuso do aparelho. O relógio fica parado nesse instante.
async function newPage({ scheme = 'dark', accent = 'terracota', data, width = 390, now = new Date('2026-11-05T12:00:00-03:00'), tz = 'America/Sao_Paulo', hash = '#/inicio' } = {}) {
  const context = await browser.newContext({ ...baseOptions, viewport: { width, height: 844 }, colorScheme: scheme, timezoneId: tz });
  const page = await context.newPage();
  await page.clock.install({ time: new Date(now.getTime() - 5000) });
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errors.push(`console: ${m.text()}`); });
  await page.route(/^https:\/\//, (r) => r.abort());
  await page.goto(`${BASE}#/inicio`);
  await page.waitForSelector('#app[data-page]');
  await page.evaluate(async ([d, s, a]) => {
    await (await import('/js/db.js')).setItem('state', d);
    localStorage.setItem('leituras:tema', s === 'light' ? 'claro' : 'escuro');
    localStorage.setItem('leituras:acento', a);
  }, [data, scheme, accent]);
  await page.reload();
  await page.clock.pauseAt(now);
  await page.waitForSelector('#app[data-page="inicio"] .greet');
  if (hash !== '#/inicio') {
    await page.evaluate((h) => { location.hash = h; }, hash);
    await page.clock.runFor(700);
  }
  return { context, page };
}
const idle = (page) => page.locator('.greet-idle');
const idleCount = (page) => idle(page).count();
const streakTexts = async (page) => (await page.locator('.greet-streak').allTextContents()).map((t) => t.trim());
const settle = (page) => page.clock.runFor(700);
const shot = (page, name, h = 340) => page.screenshot({ path: join(SHOTS, `qa-v163-${name}.png`), clip: { x: 0, y: 0, width: page.viewportSize().width, height: h }, animations: 'disabled' });
const setScale = (page, v) => page.evaluate((s) => {
  const st = document.documentElement.style;
  st.setProperty('--type-scale', String(s));
  st.setProperty('--type-scale-ui', String(Math.min(s, 1.3)));
  st.setProperty('--type-scale-nav', String(Math.min(s, 1.2)));
  st.setProperty('--type-scale-lg', String(1 + (s - 1) * 0.5));
}, v);
const oneBook = (last, extra = {}) => ({ ...base, books: [reading('r1', 'Livro Um', '2026-10-01T10:00:00.000Z', last ? [entry(last, 0, 30)] : [], extra)] });
const goHome = async (page) => {
  await page.evaluate(() => { location.hash = '#/inicio'; });
  await page.waitForSelector('#app[data-page="inicio"] .greet');
};

try {
  step('fuso de São Paulo: 3 dias exatos na virada da meia-noite local');
  for (const [now, last, expected] of [
    ['2026-11-05T23:59:00-03:00', '2026-11-02', 3], ['2026-11-05T23:59:00-03:00', '2026-11-03', 0],
    ['2026-11-06T00:01:00-03:00', '2026-11-03', 3], ['2026-11-06T00:01:00-03:00', '2026-11-04', 0],
    ['2026-11-05T01:00:00-03:00', '2026-11-02', 3],
  ]) {
    const { context, page } = await newPage({ data: oneBook(last), now: new Date(now) });
    const t = await streakTexts(page);
    assert.deepEqual(t, expected ? [`Você não registra leitura há ${expected} dias`] : [], `${now} último ${last}: ${t}`);
    await context.close();
  }

  step('fusos extremos UTC+14 e UTC-11: vale o dia do aparelho, não o de UTC');
  for (const [tz, offset] of [['Pacific/Kiritimati', '+14:00'], ['Pacific/Pago_Pago', '-11:00']]) {
    for (const [last, expected] of [['2026-11-02', 3], ['2026-11-03', 0]]) {
      const { context, page } = await newPage({ tz, data: oneBook(last), now: new Date(`2026-11-05T00:30:00${offset}`) });
      const t = await streakTexts(page);
      assert.deepEqual(t, expected ? [`Você não registra leitura há ${expected} dias`] : [], `${tz} ${last}: ${t}`);
      await context.close();
    }
    const { context, page } = await newPage({ tz, data: oneBook('2026-11-02'), now: new Date(`2026-11-05T23:50:00${offset}`) });
    assert.deepEqual(await streakTexts(page), ['Você não registra leitura há 3 dias'], `${tz} fim do dia`);
    await context.close();
  }

  step('horário de verão (Nova York) e virada de ano: dias de calendário');
  {
    const a = await newPage({ tz: 'America/New_York', data: oneBook('2026-10-31'), now: new Date('2026-11-03T08:00:00-05:00') });
    assert.deepEqual(await streakTexts(a.page), ['Você não registra leitura há 3 dias']);
    await a.context.close();
    const b = await newPage({ tz: 'America/New_York', data: oneBook('2026-03-07'), now: new Date('2026-03-10T08:00:00-04:00') });
    assert.deepEqual(await streakTexts(b.page), ['Você não registra leitura há 3 dias']);
    await b.context.close();
    const c = await newPage({ data: oneBook('2026-12-30'), now: new Date('2027-01-02T10:00:00-03:00') });
    assert.deepEqual(await streakTexts(c.page), ['Você não registra leitura há 3 dias']);
    await c.context.close();
  }

  step('relógio correndo: passada a meia-noite, voltar ao Início mostra o novo número');
  {
    const { context, page } = await newPage({ data: oneBook('2026-11-03'), now: new Date('2026-11-05T23:59:30-03:00') });
    assert.equal(await idleCount(page), 0, '2 dias: sem linha antes da meia-noite');
    await page.clock.runFor(90 * 1000);
    await page.evaluate(() => { location.hash = '#/estante'; });
    await page.waitForSelector('#app[data-page="estante"]');
    await goHome(page);
    assert.deepEqual(await streakTexts(page), ['Você não registra leitura há 3 dias']);
    await context.close();
  }

  step('só minutos (audiolivro / cronômetro): contam como atividade');
  {
    const audio = (last, mins) => ({ ...base, books: [reading('a1', 'Audio Um', '2026-10-01T10:00:00.000Z', [{ date: last, from: 30, to: 30, unit: 'minutes', note: '', minutes: mins }], { format: 'audiolivro', pages: null, audioMinutes: 600, currentMinutes: 30 })] });
    const a = await newPage({ data: audio('2026-11-04', 25) });
    assert.equal(await idleCount(a.page), 0, 'ouviu ontem com cronômetro: sem linha');
    await a.context.close();
    const b = await newPage({ data: audio('2026-10-30', 25) });
    assert.deepEqual(await streakTexts(b.page), ['Você não registra leitura há 6 dias']);
    await idle(b.page).tap();
    await b.page.waitForSelector('.sheet-progress .psheet-title');
    await b.context.close();
    const phys = { ...base, books: [reading('p1', 'Fisico', TS, [entry('2026-10-01', 0, 20), entry('2026-11-04', 20, 20, { minutes: 15 })])] };
    const d = await newPage({ data: phys });
    assert.equal(await idleCount(d.page), 0, 'cronômetro ontem num físico: sem linha');
    await d.context.close();
  }

  step('Voltar para Quero ler (diário limpo), Lido e vários livros');
  {
    const data = { ...base, books: [reading('r1', 'Unico', '2026-10-20T10:00:00.000Z', [entry('2026-10-20', 0, 30)])] };
    const { context, page } = await newPage({ data, hash: '#/livro/r1' });
    await page.waitForSelector('[data-action="pause-reading"]');
    await page.click('[data-action="pause-reading"]');
    await settle(page);
    await goHome(page);
    assert.equal(await page.locator('.greet-streak').count(), 0, 'sem diário e sem livro: sem linha');
    await context.close();

    const two = { ...base, books: [reading('r1', 'Um', '2026-10-20T10:00:00.000Z', [entry('2026-10-20', 0, 30)]), reading('r2', 'Dois', '2026-10-21T10:00:00.000Z', [])] };
    const t = await newPage({ data: two, hash: '#/livro/r1' });
    await t.page.waitForSelector('[data-action="pause-reading"]');
    await t.page.click('[data-action="pause-reading"]');
    await settle(t.page);
    await goHome(t.page);
    assert.equal(await t.page.locator('.greet-streak').count(), 0, 'o diário do pausado foi limpo');
    await t.context.close();

    const lido = { ...base, books: [{ ...reading('r1', 'Acabou', TS, [entry('2026-10-20', 0, 300)]), status: 'lido', endDate: '2026-10-20' }, reading('r2', 'Novo', TS, [])] };
    const l = await newPage({ data: lido });
    assert.deepEqual(await streakTexts(l.page), ['Você não registra leitura há 16 dias'], 'o diário de um Lido conta se há outro em leitura');
    await l.context.close();
    const only = { ...base, books: [{ ...reading('r1', 'Acabou', TS, [entry('2026-10-20', 0, 300)]), status: 'lido', endDate: '2026-10-20' }] };
    const o = await newPage({ data: only });
    assert.equal(await o.page.locator('.greet-streak').count(), 0, 'nenhum Lendo: sem linha');
    await o.context.close();
  }

  step('instalação nova, sem updatedAt, vários em leitura (o mais recente)');
  {
    const fresh = await newPage({ data: { ...base, books: [] } });
    assert.equal(await fresh.page.locator('.greet-streak').count(), 0);
    await fresh.context.close();
    const noUpd = { ...base, books: [reading('a', 'A', undefined, [entry('2026-10-20', 0, 5)]), reading('b', 'B', undefined, [])] };
    const n = await newPage({ data: noUpd });
    assert.equal(await idleCount(n.page), 1);
    await n.context.close();
    const multi = { ...base, books: [reading('a', 'A', '2026-10-01T00:00:00.000Z', [entry('2026-10-20', 0, 5)]), reading('b', 'B', '2026-10-25T00:00:00.000Z', []), reading('c', 'C', '2026-10-10T00:00:00.000Z', [])] };
    const m = await newPage({ data: multi });
    assert.equal(await idle(m.page).getAttribute('data-id'), 'b');
    await m.context.close();
  }

  step('rótulo do VoiceOver inclui os dias; sem linha em Estante, Resumo e na ficha');
  {
    const { context, page } = await newPage({ data: oneBook('2026-10-20') });
    assert.equal(await idle(page).getAttribute('aria-label'), 'Você não registra leitura há 16 dias. Registrar leitura de Livro Um');
    for (const hash of ['#/estante', '#/resumo', '#/livro/r1']) {
      await page.evaluate((h) => { location.hash = h; }, hash);
      await settle(page);
      assert.equal(await idleCount(page), 0, hash);
    }
    await context.close();
  }

  step('deslocamento do bento: com linha, sem linha e com sequência; título recolhido sem a linha na barra');
  {
    const info = {};
    for (const [key, data] of [['idle', oneBook('2026-10-20')], ['none', oneBook(null)], ['streak', oneBook('2026-11-05')]]) {
      const filler = Array.from({ length: 14 }, (_, i) => ({ id: `f${i}`, title: `Fila ${i}`, authors: 'X', pages: 100, status: 'quero', format: 'fisico', createdAt: TS }));
      const { context, page } = await newPage({ data: { ...data, books: [...data.books, ...filler] } });
      info[key] = await page.evaluate(() => { const g = document.querySelector('.greet'); return { h: g.getBoundingClientRect().height, next: g.nextElementSibling ? g.nextElementSibling.getBoundingClientRect().top : 0 }; });
      if (key === 'idle') {
        await page.evaluate(() => window.scrollTo(0, 400));
        await page.dispatchEvent('body', 'scroll');
        await page.evaluate(() => window.dispatchEvent(new Event('scroll')));
        await settle(page);
        const r = await page.evaluate(() => ({ idleInBar: !!document.querySelector('[data-cbar] .greet-idle'), scrolled: document.documentElement.classList.contains('is-scrolled') }));
        assert.ok(r.scrolled, 'rolou');
        assert.equal(r.idleInBar, false);
        await shot(page, 'rolado', 200);
      }
      await context.close();
    }
    console.log('   cabeçalho:', JSON.stringify(info));
    assert.ok(Math.abs(info.idle.h - info.streak.h) <= 24, `linha ociosa ${info.idle.h} vs sequência ${info.streak.h}`);
    assert.ok(info.idle.h - info.none.h <= 44, `cresce no máximo 44px (${info.idle.h - info.none.h})`);
  }

  step('toque abre o registro do livro mais recente; ao registrar a linha some');
  {
    const { context, page } = await newPage({ data: { ...base, books: [reading('a', 'A', '2026-10-01T00:00:00.000Z', [entry('2026-10-20', 0, 5)]), reading('b', 'B', '2026-10-25T00:00:00.000Z', [])] } });
    await idle(page).tap();
    await page.waitForSelector('.sheet-progress .psheet-title');
    await page.clock.runFor(600);
    assert.match(await page.textContent('.psheet-title'), /^B/);
    await page.fill('#progress-input', '10');
    await page.click('.psheet-actions .btn-primary');
    await page.clock.runFor(800);
    await page.waitForSelector('.sheet-progress', { state: 'detached' });
    assert.equal(await idleCount(page), 0);
    assert.deepEqual(await streakTexts(page), ['Leitura registrada hoje']);
    await context.close();
  }

  step('escalas 0,85/1/1,3/1,6 x larguras, claro/escuro x 5 acentos (contraste AA)');
  for (const scheme of ['light', 'dark']) {
    for (const accent of ACCENTS) {
      const widths = accent === 'terracota' ? [320, 390, 430] : [390];
      for (const width of widths) {
        const long = oneBook('2026-01-02', { title: 'Um Título Bem Comprido Para Testar Quebra de Linha no Registro' });
        const { context, page } = await newPage({ scheme, accent, width, data: long });
        for (const scale of [0.85, 1, 1.3, 1.6]) {
          await setScale(page, scale);
          assert.ok(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth) <= 0, `${scheme} ${accent} ${width} x${scale}: rolagem lateral`);
          const b = await idle(page).boundingBox();
          assert.ok(b.x >= 0 && b.x + b.width <= width + 0.5 && b.height >= 44, `${width} x${scale}: caixa ${JSON.stringify(b)}`);
          const c = await page.evaluate(() => {
            const el = document.querySelector('.greet-idle');
            const lum = (col) => { const [r, g, bl] = col.match(/[\d.]+/g).slice(0, 3).map(Number).map((v) => v / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)); return 0.2126 * r + 0.7152 * g + 0.0722 * bl; };
            const a = lum(getComputedStyle(el).color);
            const bg = lum(getComputedStyle(document.body).backgroundColor);
            return (Math.max(a, bg) + 0.05) / (Math.min(a, bg) + 0.05);
          });
          assert.ok(c >= 4.5, `${scheme} ${accent}: contraste ${c.toFixed(2)}`);
        }
        if (width === 320) { await setScale(page, 1.6); await shot(page, `${accent}-${scheme}-320-x1.6`, 380); }
        if (accent === 'vinho' && scheme === 'light') { await setScale(page, 1); await shot(page, `${accent}-${scheme}-390`); }
        await context.close();
      }
    }
  }

  step('regressão: "+ Trecho" com alvo >= 44px (vazio e com trechos; 320/390/430 x 1/1,3/1,6; claro/escuro)');
  {
    const withQuote = { ...base, books: [
      { id: 'w', title: 'Quero', authors: 'X', pages: 100, status: 'quero', format: 'fisico', createdAt: TS },
      reading('q', 'Com trecho', TS, [entry('2026-10-01', 0, 10)], { quotes: [{ id: 'z', text: 'Frase.', page: 3, percent: null, note: '', createdAt: TS }] }),
    ] };
    for (const scheme of ['light', 'dark']) {
      const { context, page } = await newPage({ scheme, data: withQuote });
      for (const id of ['w', 'q']) {
        await page.evaluate((i) => { location.hash = `#/livro/${i}/editar?aba=trechos`; }, id);
        await page.waitForSelector('[data-action="quote-new"]');
        for (const width of [320, 390, 430]) {
          await page.setViewportSize({ width, height: 800 });
          for (const scale of [1, 1.3, 1.6]) {
            await setScale(page, scale);
            const wh = await page.locator('[data-action="quote-new"]').evaluate((el) => { const r = el.getBoundingClientRect(); return [r.width, r.height]; });
            assert.ok(wh[0] >= 44 && wh[1] >= 44, `${scheme} ${id} ${width} x${scale}: ${wh}`);
          }
        }
      }
      await context.close();
    }
    const { context, page } = await newPage({ data: oneBook('2026-10-01'), hash: '#/livro/r1' });
    const row = await page.locator('a.ficha-row', { hasText: 'Guardar um trecho' }).boundingBox();
    assert.ok(row && row.height >= 44, `linha Guardar um trecho ${row && row.height}`);
    await context.close();
  }

  assert.deepEqual(errors, [], `erros no console:\n${errors.join('\n')}`);
  console.log('OK: QA 1.6.3');
} finally {
  await browser.close();
  server.close();
}
