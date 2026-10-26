// Teste de ponta a ponta do Resumo 1.4: abas (Visão geral · Ritmo · Gostos), indicadores com
// variação sobre o ano anterior, curva S da meta, gráficos mais limpos, marcos como medalhas
// e o movimento de entrada (só sem "Reduzir movimento"). Tira telas em 320, 390 e 430 px.
// Uso: node tests/e2e/resumo-v14.mjs   (precisa do Playwright instalado globalmente ou no projeto)

import { execSync } from 'node:child_process';
import { createServer } from 'node:http';
import { mkdirSync, readFileSync, existsSync } from 'node:fs';
import { extname, join, normalize } from 'node:path';
import { createRequire } from 'node:module';
import assert from 'node:assert/strict';
import { getGoal } from '../../app/js/store.js';
import { yearStats } from '../../app/js/stats.js';

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
// 127.0.0.1 (e não localhost): sem service worker, cada cenário usa o código atual.
const BASE = `http://127.0.0.1:${server.address().port}/`;
const TODAY = '2026-10-26';

// ---------- Dados: 2026 com 11 lidos (meta 15, meta de páginas 5.000) e 2025 com 9 ----------

let seq = 0;
function book(title, extra = {}) {
  seq += 1;
  return {
    id: `b${seq}`, title, authors: `Autor ${seq}`, pages: 320, status: 'lido', startDate: null, endDate: null,
    format: 'fisico', rating: null, genre: 'Ficção', favorite: false, notes: '', cover: null, isbn: '',
    currentPage: null, currentPercent: null, dropReason: '', reread: false, series: '', seriesNumber: null,
    tags: [], targetDate: null, quotes: [], journal: [],
    createdAt: '2025-01-01T00:00:00.000Z', updatedAt: `2026-01-01T00:00:${String(seq % 60).padStart(2, '0')}.000Z`, ...extra,
  };
}
/** Diário: um avanço por dia, de start (inclusive) por n dias, `per` páginas por dia. */
function daily(start, n, per, from = 0) {
  const out = [];
  for (let i = 0; i < n; i += 1) {
    const d = new Date(Date.UTC(Number(start.slice(0, 4)), Number(start.slice(5, 7)) - 1, Number(start.slice(8, 10)) + i));
    out.push({ date: d.toISOString().slice(0, 10), from: from + i * per, to: from + (i + 1) * per, unit: 'page', note: '' });
  }
  return out;
}
const G = ['Biografia', 'Desenvolvimento pessoal', 'Filosofia', 'Gestão', 'História', 'Ficção'];
const books = [];
const r26 = [4, 4.5, 5, 4, 3.5, 4.5, 4, 5, 4.5, 4, 4.5];
const end26 = ['2026-01-20', '2026-02-18', '2026-03-12', '2026-03-30', '2026-04-25', '2026-05-28', '2026-06-30', '2026-07-29', '2026-08-27', '2026-09-10', '2026-10-01'];
end26.forEach((end, i) => {
  const start = `${end.slice(0, 8)}01`;
  books.push(book(i === 4 ? 'Hábitos Atômicos' : `Leitura ${i + 1}`, {
    endDate: end, startDate: start, rating: r26[i], genre: G[i % G.length], pages: [180, 240, 300, 380, 420, 260, 510, 330, 290, 350, 210][i],
    favorite: i === 4, format: i % 5 === 3 ? 'kindle' : 'fisico', tags: i % 3 ? ['Clássico'] : ['Indicação'],
    journal: i >= 8 ? daily(start, 10, Math.floor([180, 240, 300, 380, 420, 260, 510, 330, 290, 350, 210][i] / 10)) : [],
  }));
});
books.push(book('Lendo agora', { status: 'lendo', startDate: '2026-10-10', endDate: null, pages: 420, currentPage: 160, journal: daily('2026-10-10', 16, 10) }));
books.push(book('Livro chato', { status: 'abandonado', startDate: '2026-06-01', endDate: '2026-06-20', dropReason: 'Não prendeu.' }));
const end25 = ['2025-01-25', '2025-02-28', '2025-04-20', '2025-05-25', '2025-06-25', '2025-08-10', '2025-09-25', '2025-11-15', '2025-12-20'];
end25.forEach((end, i) => books.push(book(`Antigo ${i + 1}`, {
  endDate: end, startDate: `${end.slice(0, 8)}01`, rating: 4, genre: G[(i + 2) % G.length], pages: 300 + i * 20,
})));
const seed = {
  version: 2, books, goals: { 2026: 15, 2025: 12 }, defaultGoal: 12, customGenres: [], lastBackupAt: '2026-10-20T10:00:00.000Z',
  upNext: [], pageGoals: { 2026: 5000 },
};
const S26 = yearStats(books, 2026, getGoal(seed, 2026), TODAY);
const fmt = (n) => n.toLocaleString('pt-BR');

// ---------- Navegador ----------

const browser = await playwright.chromium.launch();
const errors = [];
async function newPage({ width = 390, motion = 'reduce' } = {}) {
  const context = await browser.newContext({
    viewport: { width, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, locale: 'pt-BR', reducedMotion: motion,
  });
  const page = await context.newPage();
  await page.clock.setFixedTime(new Date(`${TODAY}T12:00:00`));
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errors.push(`console: ${m.text()}`); });
  await page.goto(BASE);
  await page.evaluate(async (d) => (await import('/js/db.js')).setItem('state', d), seed);
  return page;
}
const step = (msg) => console.log(`• ${msg}`);
const onPage = (page, name) => page.waitForFunction((n) => document.getElementById('app').dataset.page === n, name);
async function open(page, hash) {
  await page.goto(`${BASE}${hash}`);
  await page.reload();
  await onPage(page, 'resumo');
}
const text = (page, sel) => page.$eval(sel, (el) => el.textContent.replace(/\s+/g, ' ').trim());
async function tab(page, name) {
  await page.click(`.rs-tab[data-tab="${name}"]`);
  await page.waitForSelector(`.rs-panel[data-tab="${name}"]`);
}

/** Sem rolagem lateral, campos ≥ 16px e alvos de toque ≥ 44px (abas, alternadores, medalhas, barras). */
async function checkLayout(page, label) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  assert.ok(overflow <= 0, `${label}: ${overflow}px sobrando à direita`);
  const wide = await page.evaluate(() => [...document.querySelectorAll('#app *')]
    .filter((el) => !el.closest('.medals') && el.getBoundingClientRect().right > window.innerWidth + 0.5 && getComputedStyle(el).visibility !== 'hidden')
    .map((el) => el.className?.baseVal ?? el.className).slice(0, 5));
  assert.deepEqual(wide, [], `${label}: elementos passando da tela`);
  const small = await page.evaluate(() => [...document.querySelectorAll('input, select, textarea')]
    .filter((el) => parseFloat(getComputedStyle(el).fontSize) < 16).map((el) => el.outerHTML.slice(0, 60)));
  assert.deepEqual(small, [], `${label}: campos com letra < 16px`);
  const tiny = await page.evaluate(() => [...document.querySelectorAll('.rs-tab, .seg-btn, .medal-item, .fmt-label, .hbar-btn')]
    .map((el) => ({ el, r: el.getBoundingClientRect() }))
    .filter(({ r }) => r.width && (r.height < 44 || r.width < 44))
    .map(({ el, r }) => `${el.className} ${Math.round(r.width)}×${Math.round(r.height)}`));
  assert.deepEqual(tiny, [], `${label}: alvos de toque menores que 44px`);
  // Textos do SVG da curva dentro do desenho.
  const outside = await page.evaluate(() => [...document.querySelectorAll('.sc-svg text')].filter((t) => {
    const b = t.getBBox();
    const vb = t.ownerSVGElement.viewBox.baseVal;
    return b.x < vb.x - 0.5 || b.y < vb.y - 0.5 || b.x + b.width > vb.x + vb.width + 0.5 || b.y + b.height > vb.y + vb.height + 0.5;
  }).map((t) => t.textContent));
  assert.deepEqual(outside, [], `${label}: rótulos fora do desenho da curva`);
}

const GUILT = /atrasad|devendo|fracass|falhou|culpa|ruim/i;

try {
  const page = await newPage();

  step('Visão geral: abas, indicadores, variação até a mesma data de 2025');
  await open(page, '#/resumo/2026');
  assert.equal(await page.locator('.rs-tab').count(), 3);
  assert.equal(await page.getAttribute('.rs-tab.is-on', 'aria-selected'), 'true');
  assert.equal(await text(page, '.rs-tab.is-on'), 'Visão geral');
  const kpis = await page.$$eval('.kpi', (els) => els.map((e) => e.querySelector('.kpi-num').textContent.trim()));
  assert.deepEqual(kpis, ['11', fmt(S26.pages), S26.avgRating.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 }), String(Math.round(S26.avgDays))]);
  assert.match(await text(page, '.kpi >> nth=0'), /\/ 15/);
  // 2025 até 26 out: 7 livros → ▲ 4 livros.
  assert.match(await text(page, '.kpi >> nth=0'), /▲ 4 livros/);
  assert.match(await text(page, '.kpi-caption'), /^Comparado a 2025 até 26 out$/);
  assert.equal(await page.locator('.kpi-spark').count(), 4, 'mini-gráfico nos 4 indicadores');
  assert.equal(await page.locator('.kpi-delta.is-good').count() + await page.locator('.kpi-delta.is-calm').count() + await page.locator('.kpi-delta:not(.is-good):not(.is-calm)').count(), 4);

  step('curva S: previsto × realizado, hoje e projeção, texto neutro');
  const aria = await page.getAttribute('.sc-svg', 'aria-label');
  assert.match(aria, /^Curva S de 2026: 11 de 15 livros\./);
  assert.equal(await page.getAttribute('.sc-svg', 'role'), 'img');
  assert.equal(await page.locator('.sc-planned').count(), 1);
  assert.equal(await page.locator('.sc-proj').count(), 1);
  assert.equal(await page.locator('.sc-today').count(), 1);
  const headline = await text(page, '.sc-headline');
  const detail = await text(page, '.sc-text .muted');
  assert.equal(headline, '1,3 livro abaixo do previsto');
  assert.match(detail, /^Para fechar 15: 1,9 por mês · no ritmo atual, ~13 em dezembro$/);
  assert.doesNotMatch(`${headline} ${detail}`, GUILT);
  assert.match(await text(page, '.favorite'), /Hábitos Atômicos/);
  assert.equal(await page.locator('text=Ver retrospectiva').count(), 1);
  await page.screenshot({ path: join(SHOTS, 'resumo-v14-390-geral.png'), fullPage: true });

  step('curva S: tocar num mês mostra os números');
  // No meio da tela: a barra de navegação fixa cobre o rodapé.
  await page.locator('.sc-svg').evaluate((el) => el.scrollIntoView({ block: 'center' }));
  const svg = await page.locator('.sc-svg').boundingBox();
  const left = Number(await page.getAttribute('.sc-svg', 'data-left'));
  const right = Number(await page.getAttribute('.sc-svg', 'data-right'));
  const scale = svg.width / 300;
  const xMarch = svg.x + (left + (2.5 / 12) * (right - left)) * scale;
  await page.mouse.click(xMarch, svg.y + svg.height / 2);
  await page.waitForSelector('.sc-readout.is-on');
  assert.equal(await text(page, '.sc-readout'), 'Março · realizado 4 · previsto 3,8');
  await page.locator('.sc-card').screenshot({ path: join(SHOTS, 'resumo-v14-curva-marco.png') });
  await page.mouse.click(xMarch, svg.y + svg.height / 2);
  await page.waitForSelector('.sc-readout:not(.is-on)');

  step('curva S em páginas (há meta de páginas)');
  await page.click('[data-action="curve-mode"][data-mode="paginas"]');
  await page.waitForFunction(() => /páginas/.test(document.querySelector('.sc-svg').getAttribute('aria-label')));
  assert.match(await page.getAttribute('.sc-svg', 'aria-label'), new RegExp(`${fmt(S26.pages).replace('.', '\\.')} de 5\\.000 páginas`));
  assert.match(await text(page, '.sc-text'), /págs\.|Meta de 5\.000/);
  assert.doesNotMatch(await text(page, '.sc-text'), GUILT);
  await page.locator('.sc-card').screenshot({ path: join(SHOTS, 'resumo-v14-curva-paginas.png') });
  await page.click('[data-action="curve-mode"][data-mode="livros"]');

  step('Ritmo: link direto, calendário, meses, páginas por dia');
  await tab(page, 'ritmo');
  assert.match(page.url(), /#\/resumo\/2026\?aba=ritmo$/);
  assert.equal(await page.locator('.heatmap').count(), 1);
  assert.match(await text(page, '.rs-panel'), /Livros por mês/);
  assert.match(await text(page, '.rs-panel'), /Páginas por dia/);
  assert.match(await text(page, '.ppd'), /melhor dia/);
  await page.screenshot({ path: join(SHOTS, 'resumo-v14-390-ritmo.png'), fullPage: true });
  // Barra do mês continua abrindo a Buscar filtrada.
  await page.click('.bars button.bar-col[data-value="2"]');
  await onPage(page, 'buscar');
  assert.match(await text(page, '.filter-chip'), /março de 2026/);
  await page.goBack();
  await onPage(page, 'resumo');
  assert.equal(await text(page, '.rs-tab.is-on'), 'Ritmo', 'a aba fica lembrada');

  step('Gostos: notas só na faixa usada, formato numa barra, autores sem repetição');
  await tab(page, 'gostos');
  const ratings = await page.$$eval('.bars-rating .bar-label', (els) => els.map((e) => e.textContent.trim()));
  assert.deepEqual(ratings, ['3', '3,5', '4', '4,5', '5']);
  assert.equal(await page.locator('.fmt-bar').count(), 1);
  assert.match(await text(page, '.fmt-labels'), /Físico \d+% \d+ livros · [\d.]+ págs\. Kindle \d+% 2 livros/);
  assert.match(await text(page, '.rs-panel'), /Nenhum autor repetido em 2026/);
  assert.equal(await page.locator('h2:text("Autores mais lidos")').count(), 0);
  assert.equal(await page.locator('h2:text("Comparativo entre anos")').count(), 0, 'comparativo fica só em Todos os anos');
  await page.screenshot({ path: join(SHOTS, 'resumo-v14-390-gostos.png'), fullPage: true });
  await page.click('[data-action="chart-filter"][data-kind="rating"][data-value="5"]');
  await onPage(page, 'buscar');
  assert.match(await text(page, '.filter-chip'), /nota 5 em 2026/);
  await page.click('[data-action="chart-filter"], [data-action="clear-chart-filter"]');

  step('aba lembrada ao voltar pelo menu; link direto abre a aba');
  await page.click('[data-nav="inicio"]');
  await onPage(page, 'inicio');
  await page.click('[data-nav="resumo"]');
  await onPage(page, 'resumo');
  assert.equal(await text(page, '.rs-tab.is-on'), 'Gostos');
  const fresh = await newPage();
  await open(fresh, '#/resumo/2026?aba=ritmo');
  assert.equal(await text(fresh, '.rs-tab.is-on'), 'Ritmo');
  await fresh.keyboard.press('Tab');
  await fresh.focus('.rs-tab.is-on');
  await fresh.keyboard.press('ArrowRight');
  await fresh.waitForSelector('.rs-panel[data-tab="gostos"]');
  assert.equal(await fresh.evaluate(() => document.activeElement.dataset.tab), 'gostos', 'setas trocam de aba e o foco acompanha');
  await fresh.context().close();

  step('ano passado: curva inteira, sem projeção nem "hoje"; variação sobre o ano anterior inteiro');
  await tab(page, 'geral');
  await page.selectOption('[data-change="summary-year"]', '2025');
  await page.waitForURL(/resumo\/2025/);
  await page.waitForSelector('.sc-svg');
  assert.equal(await page.locator('.sc-proj').count(), 0);
  assert.equal(await page.locator('.sc-today').count(), 0);
  assert.equal(await text(page, '.sc-headline'), '9 de 12 · 3 livros abaixo da meta');
  assert.equal(await page.locator('.kpi-delta').count(), 0, '2024 sem dados: sem variação');
  assert.equal(await page.locator('.kpi-caption').count(), 0);
  await page.locator('.sc-card').screenshot({ path: join(SHOTS, 'resumo-v14-curva-2025.png') });

  step('Todos os anos: medalhas, detalhe ao tocar e próximos pontilhados');
  await page.selectOption('[data-change="summary-year"]', 'todos');
  await page.waitForSelector('.medals');
  const medals = await page.locator('.milestones .medals >> nth=0').locator('.medal-item').count();
  assert.ok(medals >= 5, `medalhas: ${medals}`);
  assert.equal(await page.locator('.medal.is-off').count(), await page.locator('.medal-item.is-next').count());
  assert.match(await text(page, '.medal-item.is-next >> nth=0'), /25º livro faltam 5/);
  await page.locator('.medal-item:has-text("10º livro")').click();
  await page.waitForSelector('.medal-detail.is-on');
  assert.match(await text(page, '.medal-detail'), /^10º livro Leitura 1 · 20 jan 2026 Ver livro$/);
  assert.equal(await page.getAttribute('.medal-item:has-text("10º livro")', 'aria-pressed'), 'true');
  const rowScroll = await page.$eval('.medals', (el) => el.scrollWidth > el.clientWidth);
  assert.ok(rowScroll, 'a fileira desliza dentro do cartão');
  assert.equal(await page.locator('.cmp2').count(), 1, 'Comparar anos continua');
  assert.match(await text(page, '#app'), /Melhor ano: 2026 · 11 livros/);
  assert.equal(await page.locator('a[href="#/trechos"]').count(), 1);
  await page.screenshot({ path: join(SHOTS, 'resumo-v14-390-todos.png'), fullPage: true });
  await page.context().close();

  step('larguras 320, 390 e 430: telas e conferência de layout');
  for (const width of [320, 390, 430]) {
    const p = await newPage({ width });
    await open(p, '#/resumo/2026');
    await checkLayout(p, `${width} geral`);
    await p.screenshot({ path: join(SHOTS, `resumo-v14-${width}-geral.png`), fullPage: true });
    for (const t of ['ritmo', 'gostos']) {
      await tab(p, t);
      await checkLayout(p, `${width} ${t}`);
      await p.screenshot({ path: join(SHOTS, `resumo-v14-${width}-${t}.png`), fullPage: true });
    }
    await tab(p, 'geral');
    await p.click('[data-action="curve-mode"][data-mode="paginas"]');
    await p.waitForFunction(() => /páginas/.test(document.querySelector('.sc-svg').getAttribute('aria-label')));
    await checkLayout(p, `${width} curva páginas`);
    await open(p, '#/resumo/todos');
    await p.waitForSelector('.medals');
    await checkLayout(p, `${width} todos`);
    await p.screenshot({ path: join(SHOTS, `resumo-v14-${width}-todos.png`), fullPage: true });
    await p.context().close();
  }

  step('movimento: números contam e a curva se desenha só na primeira visita (e só sem Reduzir movimento)');
  const moving = await newPage({ motion: 'no-preference' });
  await moving.goto(`${BASE}#/resumo/2026`);
  await moving.reload();
  await onPage(moving, 'resumo');
  assert.equal(await moving.locator('.sc-svg.is-intro').count(), 1);
  assert.ok(await moving.locator('.kpi-num.is-counting').count() >= 1, 'números contando');
  // O texto real já é o final durante a contagem (leitor de tela e testes veem o número certo).
  assert.equal(await moving.$eval('.kpi-num', (el) => el.textContent), '11');
  await moving.waitForFunction(() => !document.querySelector('.kpi-num.is-counting'), null, { timeout: 3000 });
  await moving.click('[data-action="curve-mode"][data-mode="paginas"]');
  await moving.waitForFunction(() => /páginas/.test(document.querySelector('.sc-svg').getAttribute('aria-label')));
  assert.equal(await moving.locator('.sc-svg.is-intro').count(), 0, 'sem repetir a entrada ao redesenhar');
  await moving.context().close();
  const still = await newPage({ motion: 'reduce' });
  await open(still, '#/resumo/2026');
  assert.equal(await still.locator('.sc-svg.is-intro, .kpi-num.is-counting').count(), 0, 'Reduzir movimento: nada anima');
  await still.context().close();

  assert.deepEqual(errors, [], 'sem erros no console');
  console.log('\nOK: Resumo 1.4 (abas, curva S, variação, medalhas, movimento, 320–430px)');
} catch (err) {
  console.error('\nFALHOU:', err.message);
  if (errors.length) console.error(errors.join('\n'));
  process.exitCode = 1;
} finally {
  await browser.close();
  server.close();
}
