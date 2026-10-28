// QA da ficha do livro (v1.4): navegação (Voltar, histórico, recarregar, excluir), números
// contra o diário, gráfico de ritmo (semanas, correções, 1 dia), transição da capa e
// layout em 320/375/390/430 px. Fuso de São Paulo, relógio às 22h30 (já é outro dia em UTC).
// Uso: node tests/e2e/qa-ficha.mjs   (precisa do Playwright, como o smoke.mjs)

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
const base = {
  authors: 'Autor', format: 'fisico', genre: 'Ficção', tags: [], quotes: [], journal: [], createdAt: TS, updatedAt: TS,
  favorite: false, notes: '', isbn: '', rating: null, cover: null,
};
const pg = (date, from, to, extra = {}) => ({ date, from, to, unit: 'page', note: '', ...extra });
const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

// Diário longo: 1 jan a 10 set 2026, um dia a cada quatro → gráfico por semana.
const longJournal = [];
for (let pos = 0, d = new Date(2026, 0, 1); d <= new Date(2026, 8, 10); d.setDate(d.getDate() + 4)) {
  longJournal.push(pg(iso(d), pos, pos + 10));
  pos += 10;
}

function seed(covers = []) {
  const many = Array.from({ length: 30 }, (_, i) => ({
    ...base, id: `m${i}`, title: `Livro da estante ${String(i + 1).padStart(2, '0')}`, pages: 100 + i, status: 'lido',
    startDate: '2026-02-01', endDate: `2026-03-${String(i + 1).padStart(2, '0')}`, cover: covers[i % (covers.length || 1)] || null,
  }));
  return {
    version: 2, goals: { 2026: 40 }, defaultGoal: 12, customGenres: [], lastBackupAt: '2026-10-10T10:00:00.000Z', pageGoals: {}, upNext: [],
    books: [
      ...many,
      // Lido atravessando o ano, com uma correção para trás no diário.
      { ...base, id: 'ny', title: 'Virada de ano', pages: 200, status: 'lido', startDate: '2025-12-20', endDate: '2026-01-05', rating: 4, favorite: true,
        journal: [pg('2025-12-20', 0, 50), pg('2025-12-22', 50, 120), pg('2025-12-23', 120, 90), pg('2026-01-05', 90, 200, { minutes: 95 })] },
      { ...base, id: 'fv', title: 'Outro do ano', pages: 150, status: 'lido', startDate: '2026-01-02', endDate: '2026-01-20', rating: 5 },
      { ...base, id: 'lg', title: 'Diário longo', pages: 700, status: 'lendo', startDate: '2026-01-01', currentPage: longJournal.at(-1).to, journal: longJournal },
      { ...base, id: 'one', title: 'Um dia só', pages: 90, status: 'lido', startDate: '2026-10-10', endDate: '2026-10-10', journal: [pg('2026-10-10', 0, 90)] },
      { ...base, id: 'kp', title: 'Kindle com total', format: 'kindle', pages: 400, status: 'lendo', startDate: '2026-10-01', currentPercent: 30,
        journal: [{ date: '2026-10-02', from: 0, to: 10, unit: 'percent', note: '' }, { date: '2026-10-05', from: 10, to: 30, unit: 'percent', note: '', minutes: 40 }] },
      { ...base, id: 'w5', title: 'Quero 5', pages: 100, status: 'quero' },
      { ...base, id: 'long', title: 'Um título realmente muito comprido, com subtítulo: e mais um pouco de texto para quebrar em várias linhas',
        authors: 'Fulana de Tal Sobrenome Comprido, Beltrano Outro Sobrenome e Mais Gente Ainda', pages: 1234, status: 'lido',
        startDate: '2026-05-01', endDate: '2026-06-30', series: 'Uma série com um nome bem grandinho também', seriesNumber: 12 },
    ],
  };
}

const browser = await playwright.chromium.launch();
const context = await browser.newContext({
  viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, locale: 'pt-BR', timezoneId: 'America/Sao_Paulo',
});
await context.addInitScript(() => {
  window.__vt = 0;
  window.__vtActive = 0;
  window.__renders = 0;
  const original = document.startViewTransition?.bind(document);
  if (original) {
    document.startViewTransition = (cb) => {
      window.__vt += 1;
      window.__vtActive += 1;
      const t = original(cb);
      t.finished.finally(() => { window.__vtActive -= 1; });
      return t;
    };
  }
});
const page = await context.newPage();
// 22h30 em São Paulo: em UTC já é dia 17 (new Date('AAAA-MM-DD') erraria o dia).
await page.clock.setFixedTime(new Date('2026-10-16T22:30:00-03:00'));
const errors = [];
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errors.push(`console: ${m.text()}`); });
page.on('dialog', (d) => d.accept());
await page.route(/^https:\/\//, (r) => r.abort());

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
const bookIn = (s, id) => s.books.find((b) => b.id === id);
const step = (msg) => console.log(`• ${msg}`);
const onPage = (name) => page.waitForFunction((n) => document.getElementById('app').dataset.page === n && !window.__vtActive, name);
const onDetail = (id) => page.waitForFunction((i) => location.hash === `#/livro/${i}` && document.querySelector(`.ficha-hero[data-id="${i}"]`) && !window.__vtActive, id);
const text = async (sel) => (await page.textContent(sel)).replace(/\s+/g, ' ').trim();

// Campos do livro salvo antes da ação, menos favorito/updatedAt (o app completa os campos que faltam).
const sameExcept = (after, before, skip) => {
  for (const key of Object.keys(before)) {
    if (!['favorite', 'updatedAt', ...skip].includes(key)) assert.deepEqual(after[key], before[key], `campo ${key} mudou`);
  }
};
const noTransitionNames = () => page.evaluate(() => [...document.querySelectorAll('[style*="view-transition-name"]')].filter((e) => e.style.viewTransitionName).length);

async function layoutProblems(label) {
  return page.evaluate((lbl) => {
    const out = [];
    const overflow = document.documentElement.scrollWidth - window.innerWidth;
    if (overflow > 0) out.push(`${lbl}: ${overflow}px sobrando à direita`);
    const small = [...document.querySelectorAll('#app button, #app a')]
      .filter((el) => el.offsetParent && el.getBoundingClientRect().height < 44).map((el) => el.outerHTML.slice(0, 70));
    if (small.length) out.push(`${lbl}: alvos < 44px: ${small.join(' | ')}`);
    // O fundo desfocado (1.5) é maior que o topo de propósito e fica recortado por ele (sem sobra lateral).
    for (const el of document.querySelectorAll('#app .ficha-hero *:not(.ficha-backdrop-img), #app .rchart, #app .ficha-card')) {
      const r = el.getBoundingClientRect();
      if (r.width && (r.left < -1 || r.right > window.innerWidth + 1)) out.push(`${lbl}: ${el.className || el.tagName} passa da tela`);
    }
    return [...new Set(out)];
  }, label);
}

try {
  step('dados de exemplo');
  await page.goto(`${BASE}manifest.webmanifest`);
  const covers = await page.evaluate(() => ['#2B4C7E', '#A0522D', '#1F5E4A'].map((bg) => {
    const c = document.createElement('canvas');
    c.width = 120;
    c.height = 180;
    const x = c.getContext('2d');
    x.fillStyle = bg;
    x.fillRect(0, 0, 120, 180);
    return c.toDataURL('image/jpeg', 0.8);
  }));
  await page.goto(BASE);
  await page.waitForSelector('.hero');
  await page.evaluate(async (d) => (await import('/js/db.js')).setItem('state', d), seed(covers));
  await page.reload();
  await page.waitForSelector('.hero');

  step('Estante: rolar até um livro lá embaixo, abrir a ficha e Voltar devolve o mesmo ponto da lista');
  await page.goto(`${BASE}#/estante?aba=lido`);
  await page.waitForSelector('.book-row');
  const target = page.locator('.book-row-link:has-text("Livro da estante 05")');
  await target.scrollIntoViewIfNeeded();
  const yBefore = await page.evaluate(() => window.scrollY);
  assert.ok(yBefore > 500, 'a lista rolou');
  await target.click();
  await onDetail('m4');
  assert.equal(await page.evaluate(() => window.scrollY), 0, 'a ficha abre no topo');
  await page.click('.ficha-back');
  await onPage('estante');
  assert.ok(Math.abs(await page.evaluate(() => window.scrollY) - yBefore) < 2, 'Voltar mantém a rolagem da Estante');
  assert.equal(await noTransitionNames(), 0, 'nenhum nome de transição preso');
  step('… também passando pela edição e com o voltar do navegador (gesto do iPhone)');
  await target.click();
  await onDetail('m4');
  await page.click('.ficha-top a:has-text("Editar")');
  await page.waitForSelector('#book-form');
  await page.goBack();
  await onDetail('m4');
  await page.goBack();
  await onPage('estante');
  assert.ok(Math.abs(await page.evaluate(() => window.scrollY) - yBefore) < 2);
  step('… mas trocar de aba pela barra de baixo começa no topo');
  await page.click('#nav [data-nav="buscar"]');
  await onPage('buscar');
  assert.equal(await page.evaluate(() => window.scrollY), 0);

  step('Buscar com texto e filtro → ficha → Voltar: filtros continuam');
  await page.fill('#q', 'virada');
  await page.selectOption('select[data-filter="year"]', '2026');
  await page.click('.book-row-link:has-text("Virada de ano")');
  await onDetail('ny');
  await page.click('.ficha-back');
  await onPage('buscar');
  assert.equal(await page.inputValue('#q'), 'virada');
  assert.equal(await page.inputValue('select[data-filter="year"]'), '2026');
  assert.equal(await page.locator('.book-row-link').count(), 1);

  step('lido atravessando o ano (fuso de São Paulo, 22h30): dias corridos x dias de leitura');
  await page.goto(`${BASE}#/livro/ny`);
  await onDetail('ny');
  assert.deepEqual((await page.locator('.ficha-stats > div').allInnerTexts()).map((t) => t.replace(/\s+/g, ' ')),
    ['17 dias corridos', '12 págs. por dia', '1h 35min no cronômetro']);
  assert.equal(await text('.ficha-period'), 'Lido em 17 dias · 20 dez 2025 → 5 jan 2026');
  // Gráfico: 20 dez a 5 jan, um traço por dia; a correção para trás (23 dez) não desenha barra negativa.
  assert.equal(await page.locator('.rchart-bar').count(), 17);
  assert.equal(await page.locator('.rchart-bar:not(.is-zero)').count(), 3);
  assert.match(await text('.rchart-readout'), /^3 dias de leitura · média/);
  assert.match(await page.getAttribute('.rchart-plot', 'aria-label'), /^Por dia, páginas de 20 dez 2025 → 5 jan: 3 dias de leitura/);
  await page.locator('.rchart-plot').scrollIntoViewIfNeeded();
  const correction = await page.locator('.rchart-bar').nth(3).boundingBox();
  const plot = await page.locator('.rchart-plot').boundingBox();
  assert.ok(correction.height >= 0 && correction.y + correction.height <= plot.y + plot.height + 1, 'barra da correção dentro do gráfico');
  await page.mouse.click(correction.x + correction.width / 2, plot.y + plot.height - 4);
  assert.equal(await text('.rchart-readout'), '23 dez 2025 · sem avanço', 'toque no dia da correção');

  step('favorito: marcar outro livro do mesmo ano tira o anterior e o aviso diz qual');
  await page.goto(`${BASE}#/livro/fv`);
  await onDetail('fv');
  const fvBefore = bookIn(await readState(), 'fv');
  await page.click('.ficha-fav');
  const sFav = await waitState((s) => bookIn(s, 'fv').favorite);
  assert.equal(bookIn(sFav, 'ny').favorite, false);
  assert.equal(sFav.books.filter((b) => b.favorite && b.endDate?.startsWith('2026')).length, 1);
  await page.waitForFunction(() => /no lugar de "Virada de ano"/.test(document.getElementById('toast').textContent));
  sameExcept(bookIn(sFav, 'fv'), fvBefore, []);

  step('diário de 253 dias: uma barra por semana');
  await page.goto(`${BASE}#/livro/lg`);
  await onDetail('lg');
  assert.equal(await page.locator('.rchart-bar').count(), 37);
  assert.equal(await text('.rchart-range'), 'págs. por semana');
  assert.equal(await text('.rchart-max'), '20 págs.');
  assert.match(await page.getAttribute('.rchart-plot', 'aria-label'),
    /^Por semana, páginas de 1 jan → 10 set: 64 dias de leitura · média 10 págs\.\/dia\. Máximo de 20 págs\. numa semana\.$/);

  step('lido num dia só: "um dia" e a data uma vez');
  await page.goto(`${BASE}#/livro/one`);
  await onDetail('one');
  assert.equal(await text('.ficha-period'), 'Lido em um dia · 10 out 2026');
  assert.equal(await page.locator('.rchart-bar').count(), 1);
  assert.equal(await text('.rchart-axis'), '10 out');

  step('Registrar leitura na ficha: um redesenho por baixo da folha não cria outro formulário');
  await page.goto(`${BASE}#/livro/lg`);
  await onDetail('lg');
  await page.click('[data-action="update-page"]');
  await page.waitForSelector('.sheet #progress-input');
  // Outra aba (ou o app aberto ao lado) grava: a ficha redesenha por baixo da folha.
  await page.evaluate(async () => {
    const db = await import('/js/db.js');
    const s = await db.getItem('state');
    s.goals['2027'] = 10;
    await db.setItem('state', s);
    new BroadcastChannel('leituras').postMessage({ type: 'saved' });
  });
  await page.waitForTimeout(400);
  assert.equal(await page.locator('#progress-input').count(), 1);
  assert.equal(await page.locator('#app [data-progress-form]').count(), 0);
  await page.fill('#progress-input', '650');
  await page.press('#progress-input', 'Enter');
  const sp = await waitState((s) => bookIn(s, 'lg').currentPage === 650);
  assert.deepEqual(bookIn(sp, 'lg').journal.at(-1), { date: '2026-10-16', from: 640, to: 650, unit: 'page', note: '' }, 'dia local (não o dia UTC)');
  assert.equal(sp.goals['2027'], 10, 'o que a outra aba gravou continua');
  await page.waitForFunction(() => !document.querySelector('.sheet-layer'));
  assert.equal(await page.locator('#app [data-progress-form]').count(), 0);
  step('página além do total não grava nada');
  await page.click('[data-action="update-page"]');
  await page.waitForSelector('.sheet #progress-input');
  await page.fill('#progress-input', '701');
  await page.press('#progress-input', 'Enter');
  await page.waitForFunction(() => /entre 0 e 700/.test(document.getElementById('toast').textContent));
  await page.keyboard.press('Escape');
  assert.deepEqual(bookIn(await readState(), 'lg'), bookIn(sp, 'lg'));

  step('Kindle com total: Registrar 100% abre o Concluir; Cancelar volta para a ficha sem mudar nada');
  await page.goto(`${BASE}#/livro/kp`);
  await onDetail('kp');
  const kBefore = bookIn(await readState(), 'kp');
  await page.click('[data-action="update-page"]');
  await page.waitForSelector('.sheet #progress-input');
  await page.fill('#progress-input', '100');
  await page.press('#progress-input', 'Enter');
  await page.waitForSelector('#book-form');
  assert.match(page.url(), /#\/livro\/kp\/editar\?concluir=1$/);
  await page.click('.form-top >> text=Cancelar');
  await onDetail('kp');
  assert.deepEqual(bookIn(await readState(), 'kp'), kBefore);

  step('recarregar na edição: Cancelar vai para a ficha, Voltar para o Início');
  await page.goto(`${BASE}#/livro/one/editar`);
  await page.reload();
  await page.waitForSelector('#book-form');
  await page.click('.form-top >> text=Cancelar');
  await onDetail('one');
  await page.click('.ficha-back');
  await onPage('inicio');

  step('edição de livro inexistente: aviso e Início');
  await page.goto(`${BASE}#/livro/nao-existe/editar`);
  await onPage('inicio');
  await page.waitForFunction(() => /Livro não encontrado/.test(document.getElementById('toast').textContent));

  step('Quero ler da fila: Começar a ler tira da fila e não muda mais nada no livro');
  await page.evaluate(async () => {
    const db = await import('/js/db.js');
    const s = await db.getItem('state');
    s.upNext = ['w5'];
    await db.setItem('state', s);
  });
  await page.goto(`${BASE}#/livro/w5`);
  await page.reload();
  await onDetail('w5');
  assert.equal(await text('.ficha-card [data-action="toggle-next"]'), 'É a próxima leitura');
  const wBefore = bookIn(await readState(), 'w5');
  await page.click('.ficha-card [data-action="start-reading"]');
  const sw = await waitState((s) => bookIn(s, 'w5').status === 'lendo');
  assert.deepEqual(sw.upNext, []);
  const wAfter = bookIn(sw, 'w5');
  assert.equal(wAfter.startDate, '2026-10-16');
  sameExcept(wAfter, wBefore, ['status', 'startDate']);
  assert.equal(wAfter.favorite, false);
  await page.waitForSelector('[data-action="update-page"]');

  step('excluir pela edição aberta da ficha (vinda da Busca) volta para a Busca');
  await page.goto(`${BASE}#/buscar`);
  await onPage('buscar');
  await page.fill('#q', 'quero 5');
  await page.click('.book-row-link:has-text("Quero 5")');
  await onDetail('w5');
  await page.click('.ficha-top a:has-text("Editar")');
  await page.click('[data-action="delete-book"]');
  await onPage('buscar');
  await page.click('.toast button:has-text("Desfazer")');
  await waitState((s) => Boolean(bookIn(s, 'w5')));

  step('toques rápidos em duas capas: vale o primeiro, sem nome de transição preso');
  await page.goto(`${BASE}#/inicio`);
  await page.waitForSelector('.grid-book');
  const firstHref = await page.getAttribute('.grid-book >> nth=0', 'href');
  await page.evaluate(() => {
    const links = document.querySelectorAll('.grid-book');
    links[0].click();
    links[1].click();
  });
  await page.waitForFunction((h) => location.hash === h && !window.__vtActive, firstHref);
  await page.waitForTimeout(200);
  assert.equal(await page.locator('.ficha-hero').count(), 1);
  assert.equal(await noTransitionNames(), 0);

  step('segurar a capa no modo Capas da Estante (Lendo) abre o menu, não a ficha');
  await page.goto(`${BASE}#/estante?aba=lendo`);
  await page.waitForSelector('.book-row');
  await page.click('[data-action="shelf-mode"][data-value="capas"]');
  await page.waitForSelector('.cg-link');
  const cg = await page.locator('.cg-link >> nth=0').boundingBox();
  await page.mouse.move(cg.x + cg.width / 2, cg.y + cg.height / 2);
  await page.mouse.down();
  await page.waitForTimeout(600);
  await page.mouse.up();
  await page.waitForTimeout(400);
  assert.match(page.url(), /#\/estante\?aba=lendo$/);
  assert.equal(await page.locator('.sheet-menu').count(), 1);
  assert.equal(await page.evaluate(() => window.__vtActive), 0);
  assert.equal(await noTransitionNames(), 0);
  await page.keyboard.press('Escape');
  await page.waitForFunction(() => !document.querySelector('.sheet-layer'));
  await page.click('[data-action="shelf-mode"][data-value="lista"]');

  step('layout das fichas em 320, 375, 390 e 430 px');
  await page.evaluate(() => document.getElementById('toast').classList.remove('show'));
  const problems = [];
  for (const width of [320, 375, 390, 430]) {
    await page.setViewportSize({ width, height: 800 });
    for (const id of ['long', 'ny', 'lg', 'kp', 'one', 'w5', 'm4']) {
      await page.goto(`${BASE}#/livro/${id}`);
      await onDetail(id);
      problems.push(...await layoutProblems(`${id} @${width}`));
      if (id === 'long' || width === 375) await page.screenshot({ path: join(SHOTS, `qa-ficha-${width}-${id}.png`), fullPage: true });
    }
  }
  await page.setViewportSize({ width: 390, height: 844 });
  if (problems.length) console.log(`\nPROBLEMAS (${problems.length}):\n${problems.map((p) => `  - ${p}`).join('\n')}`);
  assert.deepEqual(problems, []);
  assert.deepEqual(errors, []);
  console.log('\nTudo certo. Capturas em tests/e2e/screens/qa-ficha-*.png');
} catch (err) {
  await page.screenshot({ path: join(SHOTS, 'qa-ficha-falha.png'), fullPage: true }).catch(() => {});
  console.error('\nFALHOU:', err.message);
  if (errors.length) console.error(errors.join('\n'));
  process.exitCode = 1;
}
await browser.close();
server.close();
