// Teste de ponta a ponta do tema claro (V14) e dos títulos grandes que se recolhem (V18).
// - Cada tela principal no claro e no escuro (390 px, e 320 px em algumas): nenhum texto visível
//   com contraste abaixo de 4,5:1 (3:1 a partir de 18 px), sem rolagem lateral; tira as telas.
// - Ajustes → Aparência: Automático / Claro / Escuro, guardado só no aparelho ('leituras:tema'),
//   aplicado antes do CSS (sem piscar), com a cor da barra do sistema (theme-color) certa.
// - Barra compacta: aparece quando o título grande sai, com as abas do Resumo e os anos da
//   Estante presos logo abaixo dela; sem animação com "Reduzir movimento".
// Uso: node tests/e2e/tema-v14.mjs   (Playwright instalado globalmente ou no projeto)

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
const SHOTS = new URL('./screens/tema-v14/', import.meta.url).pathname;
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

// ---------- Dados: um livro em cada status, com diário, trechos, etiquetas e série ----------

const TS = '2026-01-01T00:00:00.000Z';
let seq = 0;
function book(title, extra = {}) {
  seq += 1;
  return {
    id: `b${seq}`, title, authors: `Autora ${seq}`, pages: 320, status: 'lido', startDate: null, endDate: null,
    format: 'fisico', rating: null, genre: 'Ficção', favorite: false, notes: '', cover: null, isbn: '',
    currentPage: null, currentPercent: null, dropReason: '', reread: false, series: '', seriesNumber: null,
    tags: [], targetDate: null, quotes: [], journal: [], createdAt: TS, updatedAt: TS, ...extra,
  };
}
function daily(start, n, per, from = 0) {
  const out = [];
  for (let i = 0; i < n; i += 1) {
    const d = new Date(Date.UTC(Number(start.slice(0, 4)), Number(start.slice(5, 7)) - 1, Number(start.slice(8, 10)) + i));
    if (i % 4 === 3) continue;
    out.push({ date: d.toISOString().slice(0, 10), from: from + i * per, to: from + (i + 1) * per, unit: 'page', note: i === 1 ? 'Capítulo difícil, mas bonito.' : '' });
  }
  return out;
}
const quote = (id, text, page) => ({ id, text, page, percent: null, note: id === 'q1' ? 'Lembrar disso no trabalho.' : '', createdAt: '2026-03-02T10:00:00.000Z' });
const G = ['Ficção', 'Biografia', 'Filosofia', 'História', 'Gestão'];
const books = [
  book('Hábitos Atômicos', {
    id: 'lido', endDate: '2026-03-20', startDate: '2026-03-01', rating: 4.5, favorite: true, genre: 'Desenvolvimento pessoal', pages: 320,
    tags: ['Indicação', 'Trabalho'], notes: 'Releitura obrigatória.\nBoas ideias sobre sistemas.',
    quotes: [quote('q1', 'Você não sobe ao nível dos seus objetivos. Você cai ao nível dos seus sistemas.', 27), quote('q2', 'Todo hábito começa com uma deixa.', 61)],
    journal: daily('2026-03-01', 20, 16),
  }),
  book('Duna', {
    id: 'lendo', status: 'lendo', startDate: '2026-10-10', pages: 680, currentPage: 210, series: 'Duna', seriesNumber: 1,
    tags: ['Clássico'], journal: daily('2026-10-10', 16, 14), quotes: [quote('q3', 'O medo é o assassino da mente.', 12)],
  }),
  book('Torto Arado', { id: 'quero', status: 'quero', tags: ['Brasil'] }),
  book('Ulysses', { id: 'aband', status: 'abandonado', startDate: '2026-05-01', endDate: '2026-05-20', dropReason: 'Não prendeu. Talvez em outro momento.', currentPage: 90, pages: 900 }),
  book('Kindle em percentual', { id: 'kindle', status: 'lendo', format: 'kindle', startDate: '2026-10-01', currentPercent: 42, pages: null }),
];
const ends = ['2026-01-18', '2026-02-12', '2026-04-08', '2026-05-30', '2026-06-21', '2026-07-15', '2026-08-30', '2026-09-22', '2026-10-05'];
ends.forEach((end, i) => books.push(book(`Leitura ${i + 1}`, {
  endDate: end, startDate: `${end.slice(0, 8)}01`, rating: [4, 3.5, 5, 4, 4.5, 3, 4, 5, 4][i], genre: G[i % G.length],
  pages: 180 + i * 40, format: i % 4 === 1 ? 'kindle' : 'fisico', tags: i % 2 ? ['Clássico'] : [],
})));
['2025-02-10', '2025-04-12', '2025-07-01', '2025-09-09', '2025-11-30'].forEach((end, i) => books.push(book(`Antigo ${i + 1}`, {
  endDate: end, startDate: `${end.slice(0, 8)}01`, rating: 4, genre: G[(i + 2) % G.length], pages: 300 + i * 20,
})));
['Torto Arado', 'Fora de Série'].forEach((t, i) => books.push(book(`${t} ${i + 2}`, { status: 'quero' })));
const seed = {
  version: 2, books, goals: { 2026: 15, 2025: 12 }, defaultGoal: 12, customGenres: [], lastBackupAt: '2026-10-20T10:00:00.000Z',
  upNext: ['quero'], pageGoals: { 2026: 5000 },
};

// ---------- Contraste: cor do texto contra o fundo opaco mais próximo (com camadas translúcidas) ----------

/* Roda na página. Devolve os textos visíveis abaixo do mínimo: 4,5:1 (< 18 px) ou 3:1 (≥ 18 px).
   Ignora capas (arte do livro), controles desativados e texto só para leitor de tela. */
function auditContrast() {
  const parse = (str) => {
    const out = [];
    const re = /rgba?\(([^)]+)\)|color\(srgb ([^)]+)\)/g;
    let m;
    while ((m = re.exec(str))) {
      if (m[1]) {
        const p = m[1].split(/[\s,/]+/).filter(Boolean).map(Number);
        out.push([p[0], p[1], p[2], p.length > 3 ? p[3] : 1]);
      } else {
        const p = m[2].split(/[\s/]+/).filter(Boolean).map(Number);
        out.push([p[0] * 255, p[1] * 255, p[2] * 255, p.length > 3 ? p[3] : 1]);
      }
    }
    return out;
  };
  const over = (top, under) => {
    const a = top[3];
    return [0, 1, 2].map((i) => top[i] * a + under[i] * (1 - a)).concat(1);
  };
  const lum = (c) => {
    const [r, g, b] = c.slice(0, 3).map((v) => {
      const s = v / 255;
      return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  const ratio = (a, b) => {
    const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
    return (x + 0.05) / (y + 0.05);
  };
  const canvas = parse(getComputedStyle(document.body).backgroundColor)[0] || [255, 255, 255, 1];
  const isColor = (str) => /^(rgba?|color)\(/.test(str);
  function splitTop(str) {
    const parts = [];
    let depth = 0;
    let cur = '';
    for (const ch of str) {
      if (ch === '(') depth += 1;
      if (ch === ')') depth -= 1;
      if (ch === ',' && depth === 0) {
        parts.push(cur.trim());
        cur = '';
      } else cur += ch;
    }
    if (cur.trim()) parts.push(cur.trim());
    return parts;
  }
  /** Gradientes de um background-image calculado, do de cima para o de baixo. */
  function gradients(img) {
    const out = [];
    const re = /(?:repeating-)?(linear|radial|conic)-gradient\(/g;
    let m;
    while ((m = re.exec(img))) {
      let depth = 1;
      let j = m.index + m[0].length;
      while (depth && j < img.length) {
        if (img[j] === '(') depth += 1;
        else if (img[j] === ')') depth -= 1;
        j += 1;
      }
      out.push({ type: m[1], args: splitTop(img.slice(m.index + m[0].length, j - 1)) });
      re.lastIndex = j;
    }
    return out;
  }
  const len = (v, ref) => (String(v).endsWith('%') ? (parseFloat(v) / 100) * ref : parseFloat(v));
  /** Cor do gradiente no ponto (x, y) da caixa (w × h). Interpolação pré-multiplicada, como no navegador. */
  function sample(g, w, h, x, y) {
    const geom = isColor(g.args[0]) ? '' : g.args[0];
    const raw = isColor(g.args[0]) ? g.args : g.args.slice(1);
    let t;
    let L = h;
    if (g.type === 'linear') {
      let a = 180;
      const deg = geom.match(/(-?[\d.]+)deg/);
      if (deg) a = Number(deg[1]);
      else if (/to top/.test(geom)) a = 0;
      else if (/to right/.test(geom)) a = 90;
      else if (/to left/.test(geom)) a = 270;
      const r = (a * Math.PI) / 180;
      const [dx, dy] = [Math.sin(r), -Math.cos(r)];
      L = Math.abs(w * dx) + Math.abs(h * dy);
      t = ((x - w / 2) * dx + (y - h / 2) * dy) / L + 0.5;
    } else if (g.type === 'radial') {
      const at = geom.match(/at (\S+) (\S+)/);
      const cx = at ? len(at[1], w) : w / 2;
      const cy = at ? len(at[2], h) : h / 2;
      const size = geom.replace(/at .*/, '').replace(/circle|ellipse/, '').trim().split(/\s+/).filter(Boolean);
      const far = Math.max(cx, w - cx);
      const farY = Math.max(cy, h - cy);
      let rx;
      let ry;
      if (size.length >= 2 && /[\d]/.test(size[0])) [rx, ry] = [len(size[0], w), len(size[1], h)];
      else if (/circle/.test(geom)) rx = ry = Math.hypot(far, farY);
      else [rx, ry] = [far * Math.SQRT2, farY * Math.SQRT2];
      L = rx;
      t = Math.hypot((x - cx) / rx, (y - cy) / ry);
    } else return null;
    const stops = raw.map((str) => {
      const c = parse(str)[0];
      const rest = str.replace(/^(rgba?|color)\([^)]*\)/, '').trim();
      return { c, pos: rest ? (rest.endsWith('%') ? parseFloat(rest) / 100 : parseFloat(rest) / L) : null };
    }).filter((st) => st.c);
    if (!stops.length) return null;
    if (stops[0].pos === null) stops[0].pos = 0;
    if (stops.at(-1).pos === null) stops.at(-1).pos = 1;
    for (let i = 1; i < stops.length - 1; i += 1) {
      if (stops[i].pos !== null) continue;
      let k = i;
      while (stops[k].pos === null) k += 1;
      for (let n = i; n < k; n += 1) stops[n].pos = stops[i - 1].pos + ((stops[k].pos - stops[i - 1].pos) * (n - i + 1)) / (k - i + 1);
    }
    for (let i = 1; i < stops.length; i += 1) stops[i].pos = Math.max(stops[i].pos, stops[i - 1].pos);
    if (t <= stops[0].pos) return stops[0].c;
    if (t >= stops.at(-1).pos) return stops.at(-1).c;
    const i = stops.findIndex((st) => st.pos >= t);
    const [A, B] = [stops[i - 1], stops[i]];
    const f = B.pos === A.pos ? 1 : (t - A.pos) / (B.pos - A.pos);
    const alpha = A.c[3] + (B.c[3] - A.c[3]) * f;
    const rgb = [0, 1, 2].map((k) => (alpha ? (A.c[k] * A.c[3] + (B.c[k] * B.c[3] - A.c[k] * A.c[3]) * f) / alpha : 0));
    return [...rgb, alpha];
  }
  /** Fundo atrás do texto em três pontos (topo, meio e base do elemento), com as camadas translúcidas. */
  function backgrounds(el) {
    const r = el.getBoundingClientRect();
    const points = [[r.left + r.width / 2, r.top + 2], [r.left + r.width / 2, r.top + r.height / 2], [r.left + r.width / 2, r.bottom - 2]];
    const layers = [];
    for (let n = el; n && n.nodeType === 1; n = n.parentElement) {
      const cs = getComputedStyle(n);
      const color = parse(cs.backgroundColor)[0];
      // Gradiente de 1-2px (filete desenhado com background) não é fundo de texto.
      const thin = /(^|\s)[0-2](\.\d+)?px/.test(cs.backgroundSize);
      const grads = cs.backgroundImage !== 'none' && !thin ? gradients(cs.backgroundImage) : [];
      if (grads.length || (color && color[3] > 0)) layers.push({ n, color, grads });
      if (color && color[3] >= 1) break;
      // Aba marcada (1.5): o fundo é a marca que desliza (.tab-ind), irmã logo atrás do botão.
      const ind = n.classList.contains('is-on') && n.parentElement?.classList.contains('has-ind') ? n.parentElement.querySelector(':scope > .tab-ind') : null;
      if (ind) {
        const ics = getComputedStyle(ind);
        const icolor = parse(ics.backgroundColor)[0];
        const igrads = ics.backgroundImage !== 'none' ? gradients(ics.backgroundImage) : [];
        if (igrads.length || (icolor && icolor[3] > 0)) layers.push({ n: ind, color: icolor, grads: igrads });
        if (icolor && icolor[3] >= 1) break;
      }
    }
    return points.map(([px, py]) => {
      let c = over(canvas, [255, 255, 255, 1]);
      for (const layer of [...layers].reverse()) {
        if (layer.color && layer.color[3] > 0) c = over(layer.color, c);
        const box = layer.n.getBoundingClientRect();
        for (const g of [...layer.grads].reverse()) {
          const at = sample(g, box.width, box.height, px - box.left, py - box.top);
          if (at) c = over(at, c);
        }
      }
      return c;
    });
  }
  function opacityOf(el) {
    let o = 1;
    for (let n = el; n && n.nodeType === 1; n = n.parentElement) o *= Number(getComputedStyle(n).opacity);
    return o;
  }
  const skip = '.cover, [disabled], [aria-disabled="true"], .sr-only, option, [inert], .sheet-layer:not(.is-open)';
  const out = [];
  const els = [...document.querySelectorAll('body *')].filter((el) => {
    if (el.closest(skip)) return false;
    if (el.closest('svg') && el.tagName.toLowerCase() !== 'text') return false;
    if (['input', 'select', 'textarea'].includes(el.tagName.toLowerCase())) return Boolean(el.value) && el.type !== 'range' && el.type !== 'file';
    return [...el.childNodes].some((c) => c.nodeType === 3 && c.textContent.trim());
  });
  for (const el of els) {
    if (!el.checkVisibility({ opacityProperty: true, visibilityProperty: true })) continue;
    const rect = el.getBoundingClientRect();
    if (rect.width <= 1 || rect.height <= 1) continue;
    const cs = getComputedStyle(el);
    if (cs.color === 'rgba(0, 0, 0, 0)' || cs.webkitTextFillColor === 'rgba(0, 0, 0, 0)') continue;
    const isSvg = el.tagName.toLowerCase() === 'text';
    const fg = parse(isSvg ? cs.fill : cs.color)[0];
    if (!fg) continue;
    const alpha = fg[3] * opacityOf(el) * (isSvg ? Number(cs.fillOpacity) : 1);
    const size = parseFloat(cs.fontSize);
    const need = size >= 18 ? 3 : 4.5;
    const cands = backgrounds(el);
    const worst = Math.min(...cands.map((bg) => ratio(over([fg[0], fg[1], fg[2], alpha], bg), bg)));
    if (worst < need) {
      const text = (el.value || el.textContent).replace(/\s+/g, ' ').trim().slice(0, 40);
      const cls = typeof el.className === 'string' ? el.className : el.className.baseVal;
      out.push(`${el.tagName.toLowerCase()}.${String(cls).split(' ').join('.')} "${text}" ${worst.toFixed(2)} < ${need} (${size}px)`);
    }
  }
  return out;
}

// ---------- Navegador ----------

const browser = await playwright.chromium.launch();
const errors = [];
async function newPage({ width = 390, height = 844, scheme = 'dark', motion = 'reduce', pref = null } = {}) {
  const context = await browser.newContext({
    viewport: { width, height }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, locale: 'pt-BR',
    reducedMotion: motion, colorScheme: scheme,
  });
  const page = await context.newPage();
  await page.clock.setFixedTime(new Date(`${TODAY}T12:00:00`));
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errors.push(`console: ${m.text()}`); });
  await page.goto(BASE);
  await page.evaluate(async ({ d, p }) => {
    await (await import('/js/db.js')).setItem('state', d);
    if (p) localStorage.setItem('leituras:tema', p);
    else localStorage.removeItem('leituras:tema');
  }, { d: seed, p: pref });
  return page;
}
const step = (msg) => console.log(`• ${msg}`);
const onPage = (page, name) => page.waitForFunction((n) => document.getElementById('app').dataset.page === n, name);
async function open(page, hash, name) {
  await page.goto(`${BASE}${hash}`);
  await page.reload();
  await onPage(page, name);
  await page.evaluate(() => document.fonts.ready);
}
const failures = [];
async function check(page, label, { shot = true } = {}) {
  const bad = await page.evaluate(auditContrast);
  const overflow = await page.evaluate(() => document.scrollingElement.scrollWidth - innerWidth);
  if (bad.length) failures.push(`${label}:\n    ${bad.join('\n    ')}`);
  if (overflow > 0) failures.push(`${label}: rolagem lateral de ${overflow}px`);
  if (shot) await page.screenshot({ path: `${SHOTS}${label}.png`, fullPage: true });
}

const SCREENS = [
  ['inicio', '#/inicio', 'inicio'],
  ['estante-lido', '#/estante?aba=lido', 'estante'],
  ['estante-quero', '#/estante?aba=quero', 'estante'],
  ['estante-abandonado', '#/estante?aba=abandonado', 'estante'],
  ['buscar', '#/buscar', 'buscar'],
  ['ficha-lido', '#/livro/lido', 'livro'],
  ['ficha-lendo', '#/livro/lendo', 'livro'],
  ['ficha-quero', '#/livro/quero', 'livro'],
  ['ficha-abandonado', '#/livro/aband', 'livro'],
  ['ficha-kindle', '#/livro/kindle', 'livro'],
  ['editar', '#/livro/lido/editar', 'livro'],
  ['novo', '#/novo', 'novo'],
  ['resumo-geral', '#/resumo/2026', 'resumo'],
  ['resumo-ritmo', '#/resumo/2026?aba=ritmo', 'resumo'],
  ['resumo-gostos', '#/resumo/2026?aba=gostos', 'resumo'],
  ['todos-os-anos', '#/resumo/todos', 'resumo'],
  ['retro', '#/retro/2026', 'retro'],
  ['ajustes', '#/ajustes', 'ajustes'],
  ['trechos', '#/trechos', 'trechos'],
  ['cronometro', '#/ler/lendo', 'ler'],
];

try {
  for (const scheme of ['light', 'dark']) {
    step(`todas as telas no tema ${scheme === 'light' ? 'claro' : 'escuro'} (automático, seguindo o sistema), 390 px`);
    const page = await newPage({ scheme });
    for (const [label, hash, name] of SCREENS) {
      if (label === 'cronometro') {
        // O cronômetro abre pelo botão "Ler agora" do cartão.
        await open(page, '#/inicio', 'inicio');
        await page.click('.reading:has-text("Duna") [data-action="start-timer"]');
        await onPage(page, 'ler');
      } else {
        await open(page, hash, name);
      }
      assert.equal(await page.getAttribute('html', 'data-theme'), scheme, `${label}: data-theme`);
      if (label === 'retro') {
        // Retrospectiva: tela de "cinema", escura nos dois temas.
        assert.equal(await page.getAttribute('.retro', 'data-theme'), 'dark');
        assert.equal(await page.$eval('.retro', (el) => getComputedStyle(el).backgroundColor), 'rgb(20, 15, 12)');
      }
      await check(page, `${scheme}-${label}`);
    }

    step('Estante em capas, Buscar com filtro, folhas (Registrar leitura e menu rápido), capa ampliada');
    await open(page, '#/estante?aba=lido', 'estante');
    await page.click('[data-action="shelf-mode"][data-value="capas"]');
    await page.waitForSelector('.cover-grid');
    await check(page, `${scheme}-estante-capas`);
    await page.click('[data-action="shelf-mode"][data-value="lista"]');
    await open(page, '#/buscar', 'buscar');
    await page.fill('#q', 'a');
    await page.selectOption('[data-filter="status"]', 'lido');
    await page.waitForSelector('.fchip.is-on');
    await check(page, `${scheme}-buscar-filtro`);
    await open(page, '#/inicio', 'inicio');
    await page.click('.reading:has-text("Duna") [data-action="update-page"]');
    await page.waitForSelector('.sheet-layer.is-open .psheet');
    await check(page, `${scheme}-folha-registrar`, { shot: false });
    await page.screenshot({ path: `${SHOTS}${scheme}-folha-registrar.png` });
    await page.keyboard.press('Escape');
    await page.waitForSelector('.sheet-layer', { state: 'detached' });
    await page.click('[data-action="quick-menu"][data-id="lendo"]');
    await page.waitForSelector('.sheet-layer.is-open .qm');
    await check(page, `${scheme}-folha-menu`, { shot: false });
    await page.screenshot({ path: `${SHOTS}${scheme}-folha-menu.png` });
    await page.keyboard.press('Escape');
    await page.waitForSelector('.sheet-layer', { state: 'detached' });
    await page.context().close();
  }

  step('320 px: Início, Ficha, Resumo, Ajustes e Estante nos dois temas');
  for (const scheme of ['light', 'dark']) {
    const page = await newPage({ scheme, width: 320, height: 640 });
    for (const [label, hash, name] of SCREENS.filter(([l]) => ['inicio', 'ficha-lendo', 'resumo-geral', 'ajustes', 'estante-quero', 'editar'].includes(l))) {
      await open(page, hash, name);
      await check(page, `${scheme}-320-${label}`);
    }
    await page.context().close();
  }

  step('cores do tema claro: papel, superfícies brancas, texto escuro, caramelo mais fundo');
  {
    const page = await newPage({ scheme: 'light' });
    await open(page, '#/inicio', 'inicio');
    const colors = await page.evaluate(() => ({
      body: getComputedStyle(document.body).backgroundColor,
      text: getComputedStyle(document.body).color,
      card: getComputedStyle(document.querySelector('.tile:not(.bento-ring)')).backgroundColor,
      scheme: getComputedStyle(document.documentElement).colorScheme,
      meta: [...document.querySelectorAll('meta[name="theme-color"]')].map((m) => m.content),
      metaScheme: document.querySelector('meta[name="color-scheme"]').content,
    }));
    assert.equal(colors.body, 'rgb(246, 241, 235)');
    assert.equal(colors.text, 'rgb(30, 25, 21)');
    assert.equal(colors.card, 'rgb(255, 253, 250)');
    assert.equal(colors.scheme, 'light');
    assert.deepEqual(colors.meta, ['#F6F1EB', '#F6F1EB']);
    assert.equal(colors.metaScheme, 'light');
    await page.context().close();
  }

  step('Ajustes → Aparência: Claro/Escuro fixos, guardados só no aparelho, sem piscar ao abrir');
  {
    const page = await newPage({ scheme: 'dark' });
    await open(page, '#/ajustes', 'ajustes');
    const pressed = () => page.$$eval('[data-action="set-theme"]', (els) => els.map((e) => `${e.dataset.value}:${e.getAttribute('aria-pressed')}`).join(' '));
    assert.equal(await pressed(), 'auto:true claro:false escuro:false');
    const seg = await page.$$eval('[data-action="set-theme"]', (els) => els.map((e) => e.getBoundingClientRect().height));
    assert.ok(seg.every((h) => h >= 44), 'botões de 44px');
    await page.click('[data-action="set-theme"][data-value="claro"]');
    assert.equal(await page.getAttribute('html', 'data-theme'), 'light');
    assert.equal(await page.evaluate(() => localStorage.getItem('leituras:tema')), 'claro');
    assert.equal(await pressed(), 'auto:false claro:true escuro:false');
    assert.equal(await page.$eval('meta[name="theme-color"]', (m) => m.content), '#F6F1EB');
    // Não vai para os dados (nem para o backup).
    const stored = await page.evaluate(async () => JSON.stringify(await (await import('/js/db.js')).getItem('state')));
    assert.doesNotMatch(stored, /"(tema|theme|aparencia)"|"claro"|leituras:tema/i);

    // Ao abrir de novo, o tema já está no <html> antes do CSS chegar.
    let atCss = null;
    await page.route('**/css/app.css', async (route) => {
      atCss = await page.evaluate(() => document.documentElement.getAttribute('data-theme'));
      await route.continue();
    });
    await page.reload();
    await onPage(page, 'ajustes');
    assert.equal(atCss, 'light', 'data-theme definido antes do CSS');
    await page.unroute('**/css/app.css');
    const html = readFileSync(join(APP, 'index.html'), 'utf8');
    assert.ok(html.indexOf("localStorage.getItem('leituras:tema')") < html.indexOf('css/app.css'), 'script do tema antes do CSS');
    assert.equal(await page.$eval('body', (b) => getComputedStyle(b).backgroundColor), 'rgb(246, 241, 235)');

    await page.click('[data-action="set-theme"][data-value="escuro"]');
    assert.equal(await page.getAttribute('html', 'data-theme'), 'dark');
    await page.emulateMedia({ colorScheme: 'light' });
    assert.equal(await page.getAttribute('html', 'data-theme'), 'dark', 'Escuro fixo ignora o sistema');
    await page.click('[data-action="set-theme"][data-value="auto"]');
    assert.equal(await page.evaluate(() => localStorage.getItem('leituras:tema')), null);
    assert.equal(await page.getAttribute('html', 'data-theme'), 'light', 'Automático segue o sistema');
    await page.emulateMedia({ colorScheme: 'dark' });
    await page.waitForFunction(() => document.documentElement.dataset.theme === 'dark');
    assert.equal(await page.$eval('meta[name="theme-color"]', (m) => m.content), '#0E0C0B');
    await page.screenshot({ path: `${SHOTS}ajustes-aparencia.png` });
    await page.context().close();
  }

  step('barra compacta: título grande some, barra de vidro aparece (Início, Estante, Buscar, Resumo, Todos os anos)');
  for (const scheme of ['light', 'dark']) {
    const page = await newPage({ scheme });
    const state = () => page.evaluate(() => {
      const bar = document.querySelector('[data-cbar]');
      const cs = getComputedStyle(bar);
      return { on: bar.classList.contains('is-on'), opacity: cs.opacity, visibility: cs.visibility, title: bar.querySelector('.cbar-title').textContent };
    });
    for (const [hash, name, title] of [['#/inicio', 'inicio', 'Leituras'], ['#/estante?aba=lido', 'estante', 'Estante'], ['#/buscar', 'buscar', 'Buscar'], ['#/resumo/2026', 'resumo', 'Resumo de 2026'], ['#/resumo/todos', 'resumo', 'Todos os anos']]) {
      await open(page, hash, name);
      let s = await state();
      assert.equal(s.on, false, `${hash}: barra escondida no topo`);
      assert.equal(s.visibility, 'hidden', `${hash}: barra escondida não recebe toque`);
      assert.equal(s.title, title);
      await page.evaluate(() => scrollTo(0, 400));
      await page.waitForFunction(() => document.querySelector('[data-cbar]').classList.contains('is-on'));
      s = await state();
      assert.equal(s.opacity, '1', `${hash}: sem "Reduzir movimento" desligado, aparece na hora`);
      const geo = await page.evaluate(() => {
        const bar = document.querySelector('[data-cbar]').getBoundingClientRect();
        const big = document.querySelector('[data-large-title]').getBoundingClientRect();
        const btns = [...document.querySelectorAll('[data-cbar] a, [data-cbar] button')].map((b) => b.getBoundingClientRect());
        return { bar: { top: bar.top, bottom: bar.bottom, width: bar.width }, bigBottom: big.bottom, btns: btns.map((b) => [b.width, b.height]) };
      });
      assert.equal(geo.bar.top, 0);
      assert.equal(geo.bar.width, 390);
      assert.ok(geo.bigBottom <= geo.bar.bottom, 'o título grande já passou por baixo');
      assert.ok(geo.btns.every(([w, h]) => w >= 44 && h >= 44), 'botões da barra com 44px');
      if (name === 'resumo' && hash.endsWith('2026')) {
        // As abas do Resumo ficam presas logo abaixo da barra.
        await page.evaluate(() => scrollTo(0, 900));
        await page.waitForTimeout(50);
        const tabs = await page.$eval('.rs-tabs', (el) => el.getBoundingClientRect().top);
        assert.equal(Math.round(tabs), Math.round(geo.bar.bottom), 'abas sob a barra compacta');
        await page.screenshot({ path: `${SHOTS}${scheme}-cbar-resumo.png` });
        // Tocar numa aba com a barra aberta funciona.
        await page.click('.rs-tab[data-tab="ritmo"]');
        await page.waitForSelector('.rs-panel[data-tab="ritmo"]');
      }
      if (name === 'estante') {
        await page.evaluate(() => scrollTo(0, 700));
        await page.waitForTimeout(50);
        const heads = await page.$$eval('.group-head', (els) => els.map((e) => Math.round(e.getBoundingClientRect().top)));
        assert.ok(heads.includes(48), `um ano preso logo abaixo da barra (${heads.join(', ')})`);
        await page.screenshot({ path: `${SHOTS}${scheme}-cbar-estante.png` });
      }
      if (name === 'inicio') {
        await page.screenshot({ path: `${SHOTS}${scheme}-cbar-inicio.png` });
        await check(page, `${scheme}-cbar-inicio-visivel`, { shot: false });
        await page.click('[data-cbar] a[href="#/ajustes"]');
        await onPage(page, 'ajustes');
        await page.goBack();
        await onPage(page, 'inicio');
      }
      await page.evaluate(() => scrollTo(0, 0));
      await page.waitForFunction(() => !document.querySelector('[data-cbar]').classList.contains('is-on'));
    }
    // A ficha do livro e os Ajustes não têm barra compacta (têm o próprio topo).
    await open(page, '#/livro/lido', 'livro');
    assert.equal(await page.locator('[data-cbar]').count(), 0);
    await page.context().close();
  }

  step('barra compacta com movimento: esmaece (transição de opacidade)');
  {
    const page = await newPage({ motion: 'no-preference' });
    await open(page, '#/inicio', 'inicio');
    // Logo após abrir, a tela pode ser redesenhada (capas que chegam do cache, abertura animada):
    // espera a barra estável em vez de ler o estilo no primeiro instante.
    await page.waitForFunction(() => /opacity/.test(getComputedStyle(document.querySelector('[data-cbar]')).transitionProperty), null, { timeout: 5000 });
    await page.evaluate(() => scrollTo(0, 400));
    await page.waitForFunction(() => getComputedStyle(document.querySelector('[data-cbar]')).opacity === '1');
    await page.context().close();
  }
  {
    const page = await newPage({ motion: 'reduce' });
    await open(page, '#/inicio', 'inicio');
    const dur = await page.$eval('[data-cbar]', (b) => getComputedStyle(b).transitionDuration);
    assert.ok(dur.split(',').every((d) => parseFloat(d) === 0), `sem animação com Reduzir movimento (${dur})`);
    await page.context().close();
  }

  if (failures.length) throw new Error(`contraste/overflow:\n  ${failures.join('\n  ')}`);
  assert.deepEqual(errors, []);
  console.log(`\nOK: tema claro e títulos recolhíveis. Telas em ${SHOTS}`);
} catch (e) {
  console.error(`\nFALHOU: ${e.stack || e.message}`);
  if (errors.length) console.error(errors.join('\n'));
  process.exitCode = 1;
} finally {
  await browser.close();
  server.close();
}
