// Teste de ponta a ponta da 1.6: tamanho do texto, contraste aumentado e telas largas.
// - Tamanho do texto: --type-scale em 0,85 / 1 / 1,3 / 1,6 nas larguras 320, 390 e 430 (Início,
//   Estante, ficha, formulário, Resumo e Ajustes): sem rolagem lateral, nenhum texto cortado
//   (fora do que já é reticências de propósito), barra de baixo inteira. Ajustes → Aparência →
//   Tamanho do texto (Sistema/Menor/Padrão/Maior), guardado só no aparelho e aplicado antes do CSS.
// - Aumentar contraste (prefers-contrast: more), claro e escuro, cada cor de destaque: texto
//   comum com 7:1, secundário com 4,5:1; cartões e botões com borda.
// - iPad (820×1180 e 1180×820) e celular deitado (844×390): duas colunas onde ajuda, barra
//   lateral, folhas centralizadas; tira as telas em tests/e2e/screens/v16-a11y-*.png.
// Uso: node tests/e2e/v16-acessibilidade.mjs   (Playwright instalado globalmente ou no projeto)

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

/* Roda na página. Devolve os textos visíveis abaixo do mínimo: 4,5:1 (< 18 px) ou 3:1 (≥ 18 px);
   com "Aumentar contraste", 7:1 e 4,5:1 (AAA). Ignora capas (arte do livro), controles
   desativados e texto só para leitor de tela. (Mesma auditoria de tema-v14.mjs.) */
function auditContrast({ small = 4.5, large = 3 } = {}) {
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
    const need = size >= 18 ? large : small;
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

// ---------- Texto cortado ou fora do lugar ----------

/* Roda na página. Devolve elementos com texto que transbordam a própria caixa (texto cortado
   ou por cima do vizinho) ou que passam da largura da tela. Reticências e limite de linhas
   (text-overflow / line-clamp) são cortes de propósito; capas e gráficos ficam de fora. */
function auditClip() {
  const skip = '.cover, .spine, .sp-item, svg, .sr-only, option, [inert], .sheet-layer:not(.is-open), .tab-ind, .cal-grid, .heatmap, .bars, .rchart';
  const out = [];
  const vw = document.documentElement.clientWidth;
  for (const el of document.querySelectorAll('body *')) {
    if (el.closest(skip)) continue;
    if (![...el.childNodes].some((c) => c.nodeType === 3 && c.textContent.trim())) continue;
    if (!el.checkVisibility({ visibilityProperty: true })) continue;
    const cs = getComputedStyle(el);
    const r = el.getBoundingClientRect();
    if (r.width <= 1 || r.height <= 1) continue;
    const label = () => `${el.tagName.toLowerCase()}.${String(el.className.baseVal ?? el.className).split(' ').filter(Boolean).join('.')} "${el.textContent.replace(/\s+/g, ' ').trim().slice(0, 30)}"`;
    // Passa da tela (sem estar num trilho que rola de lado).
    let scroller = false;
    for (let n = el.parentElement; n && n !== document.body; n = n.parentElement) {
      const ox = getComputedStyle(n).overflowX;
      if (ox === 'auto' || ox === 'scroll') { scroller = true; break; }
    }
    if (!scroller && (r.right > vw + 1 || r.left < -1)) out.push(`${label()} sai da tela (${Math.round(r.left)}–${Math.round(r.right)} de ${vw})`);
    if (cs.display === 'inline' || cs.display === 'contents') continue;
    if (cs.textOverflow === 'ellipsis' || cs.webkitLineClamp !== 'none' || el.matches('input, select, textarea')) continue;
    const dx = el.scrollWidth - el.clientWidth;
    const dy = el.scrollHeight - el.clientHeight;
    // Altura: tolera 3 px ou 30% da letra (títulos com line-height < 1 passam um pouco da linha).
    if (dx > 1) out.push(`${label()} transborda ${dx}px na largura`);
    else if (dy > Math.max(3, parseFloat(cs.fontSize) * 0.3) && !el.closest('[aria-hidden="true"]') && cs.overflowY !== 'auto' && cs.overflowY !== 'scroll') out.push(`${label()} transborda ${dy}px na altura`);
  }
  return out;
}

// ---------- Navegador ----------

const browser = await playwright.chromium.launch();
const errors = [];
/**
 * Simula o "Tamanho do Texto" do iPhone: o Chromium não conhece a fonte -apple-system-body, então
 * a medida que o app faz (index.html e js/text-scale.js: um elemento de teste com font-size
 * 1234px) passa a devolver 17 px × scale, como o Safari faria. Todo o caminho do app roda.
 */
function fakeSystemText(px) {
  const real = window.getComputedStyle;
  window.getComputedStyle = function getComputedStyle(el, pseudo) {
    const cs = real.call(window, el, pseudo);
    if (!el?.style || el.style.fontSize !== '1234px') return cs;
    return new Proxy(cs, { get: (t, k) => (k === 'fontSize' ? `${px}px` : (typeof t[k] === 'function' ? t[k].bind(t) : t[k])) });
  };
}
async function newPage({ width = 390, height = 844, scheme = 'dark', contrast = 'no-preference', accent = null, textPref = null, scale = null } = {}) {
  const context = await browser.newContext({
    viewport: { width, height }, deviceScaleFactor: 2, isMobile: width < 700, hasTouch: true, locale: 'pt-BR',
    reducedMotion: 'reduce', colorScheme: scheme, contrast,
  });
  if (scale !== null) await context.addInitScript(fakeSystemText, 17 * scale);
  const page = await context.newPage();
  await page.clock.setFixedTime(new Date(`${TODAY}T12:00:00`));
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errors.push(`console: ${m.text()}`); });
  await page.goto(BASE);
  await page.evaluate(async ({ d, a, t }) => {
    await (await import('/js/db.js')).setItem('state', d);
    if (a) localStorage.setItem('leituras:acento', a);
    if (t) localStorage.setItem('leituras:texto', t);
  }, { d: seed, a: accent, t: textPref });
  return page;
}
const step = (msg) => console.log(`• ${msg}`);
const onPage = (page, name) => page.waitForFunction((n) => document.getElementById('app').dataset.page === n, name);
async function open(page, hash, name) {
  await page.goto(`${BASE}${hash}`);
  await page.reload();
  await onPage(page, name);
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(60);
}
const failures = [];
async function checkLayout(page, label) {
  const overflow = await page.evaluate(() => document.scrollingElement.scrollWidth - innerWidth);
  if (overflow > 0) failures.push(`${label}: rolagem lateral de ${overflow}px`);
  const clip = await page.evaluate(auditClip);
  if (clip.length) failures.push(`${label}:\n    ${clip.join('\n    ')}`);
}
async function checkContrast(page, label, min) {
  const bad = await page.evaluate(auditContrast, min);
  if (bad.length) failures.push(`${label} (contraste):\n    ${bad.join('\n    ')}`);
}
const shot = (page, name, full = true) => page.screenshot({ path: `${SHOTS}v16-a11y-${name}.png`, fullPage: full });

const SCREENS = [
  ['inicio', '#/inicio', 'inicio'],
  ['estante', '#/estante?aba=lido', 'estante'],
  ['ficha', '#/livro/lendo', 'livro'],
  ['ficha-lido', '#/livro/lido', 'livro'],
  ['form', '#/livro/lido/editar', 'livro'],
  ['resumo', '#/resumo/2026', 'resumo'],
  ['resumo-ritmo', '#/resumo/2026?aba=ritmo', 'resumo'],
  ['ajustes', '#/ajustes', 'ajustes'],
];
const ONLY = process.env.V16_ONLY || '';

try {
  if (!ONLY || ONLY === 'escala') {
    for (const scale of [0.85, 1, 1.3, 1.6]) {
      for (const width of [320, 390, 430]) {
        step(`texto ${scale}× em ${width} px`);
        const page = await newPage({ width, height: width === 320 ? 640 : 900, scale });
        for (const [label, hash, name] of SCREENS) {
          await open(page, hash, name);
          assert.equal(await page.evaluate(() => document.documentElement.style.getPropertyValue('--type-scale')), String(scale));
          await checkLayout(page, `${label} ${scale}× ${width}px`);
          if ((scale === 1.6 && width !== 430) || (scale === 0.85 && width === 390)) await shot(page, `escala-${scale}-${width}-${label}`);
        }
        await page.context().close();
      }
    }
  }

  if (!ONLY || ONLY === 'ajustes') {
    step('Ajustes → Aparência → Tamanho do texto: Sistema segue o iPhone; Maior/Menor fixos, só no aparelho, sem piscar');
    const page = await newPage({ scale: 1.3 });
    await open(page, '#/ajustes', 'ajustes');
    const scaleNow = () => page.evaluate(() => [
      document.documentElement.style.getPropertyValue('--type-scale'),
      document.documentElement.dataset.textSize,
      parseFloat(getComputedStyle(document.body).fontSize),
    ]);
    const pressed = () => page.$$eval('[data-action="set-text-size"]', (els) => els.map((e) => `${e.dataset.value}:${e.getAttribute('aria-pressed')}`).join(' '));
    assert.equal(await pressed(), 'sistema:true menor:false padrao:false maior:false');
    assert.deepEqual(await scaleNow(), ['1.3', 'grande', 19.5], 'Sistema: 1,3× do iPhone (corpo 15 px → 19,5 px)');
    const heights = await page.$$eval('[data-action="set-text-size"]', (els) => els.map((e) => e.getBoundingClientRect().height));
    assert.ok(heights.every((h) => h >= 44), 'botões de 44px');
    await page.click('[data-action="set-text-size"][data-value="menor"]');
    assert.deepEqual(await scaleNow(), ['0.9', 'pequeno', 13.5]);
    assert.equal(await page.evaluate(() => localStorage.getItem('leituras:texto')), 'menor');
    assert.equal(await pressed(), 'sistema:false menor:true padrao:false maior:false');
    const stored = await page.evaluate(async () => JSON.stringify(await (await import('/js/db.js')).getItem('state')));
    assert.doesNotMatch(stored, /leituras:texto|"menor"/, 'fora dos dados e do backup');
    await page.click('[data-action="set-text-size"][data-value="maior"]');
    assert.deepEqual(await scaleNow(), ['1.25', 'grande', 18.75]);
    // Ao abrir de novo, o fator já está no <html> antes do CSS chegar.
    let atCss = null;
    await page.route('**/css/app.css', async (route) => {
      atCss = await page.evaluate(() => document.documentElement.style.getPropertyValue('--type-scale'));
      await route.continue();
    });
    await page.reload();
    await onPage(page, 'ajustes');
    assert.equal(atCss, '1.25', '--type-scale antes do CSS');
    await page.unroute('**/css/app.css');
    await page.click('[data-action="set-text-size"][data-value="padrao"]');
    assert.deepEqual(await scaleNow(), ['1', 'padrao', 15]);
    await page.click('[data-action="set-text-size"][data-value="sistema"]');
    assert.deepEqual(await scaleNow(), ['1.3', 'grande', 19.5]);
    assert.equal(await page.evaluate(() => localStorage.getItem('leituras:texto')), null);
    await shot(page, 'ajustes-tamanho-do-texto');
    await page.context().close();

    step('barra de baixo com letra 1,6×: rótulos no teto de 1,2×, inteiros e sem encostar');
    for (const width of [320, 390]) {
      const p2 = await newPage({ width, scale: 1.6 });
      await open(p2, '#/inicio', 'inicio');
      const nav = await p2.evaluate(() => {
        const links = [...document.querySelectorAll('.nav a[data-nav]')];
        const rects = links.map((a) => a.getBoundingClientRect());
        return {
          size: parseFloat(getComputedStyle(links[0]).fontSize),
          fits: links.every((a) => a.scrollWidth <= a.clientWidth + 1),
          apart: rects.every((r, i) => !i || r.left >= rects[i - 1].right - 0.5),
          body: parseFloat(getComputedStyle(document.body).fontSize),
        };
      });
      assert.equal(nav.body, 24, 'corpo 15 px × 1,6');
      assert.ok(Math.abs(nav.size - 12.6) < 0.01, `rótulo 10,5 × 1,2 (${nav.size})`);
      assert.ok(nav.fits && nav.apart, `${width}px: ${JSON.stringify(nav)}`);
      await p2.context().close();
    }
  }

  if (!ONLY || ONLY === 'contraste') {
    // Aumentar Contraste: texto comum 7:1 e título 4,5:1 (AAA), em cada cor e nos dois temas.
    const AAA = { small: 7, large: 4.5 };
    for (const scheme of ['light', 'dark']) {
      for (const accent of ['terracota', 'oliva', 'petroleo', 'vinho', 'grafite']) {
        step(`contraste aumentado: ${scheme === 'light' ? 'claro' : 'escuro'}, ${accent}`);
        const page = await newPage({ scheme, contrast: 'more', accent });
        const list = accent === 'terracota' ? [...SCREENS, ['buscar', '#/buscar', 'buscar'], ['estante-quero', '#/estante?aba=quero', 'estante'], ['resumo-gostos', '#/resumo/2026?aba=gostos', 'resumo']] : SCREENS;
        for (const [label, hash, name] of list) {
          await open(page, hash, name);
          await checkContrast(page, `${label} ${scheme} ${accent}`, AAA);
          if (accent === 'terracota' || label === 'inicio') await shot(page, `contraste-${scheme}-${accent}-${label}`);
        }
        if (accent === 'terracota') {
          await open(page, '#/inicio', 'inicio');
          const look = await page.evaluate(() => {
            const solid = (c) => !/rgba\(.*, 0(\.\d+)?\)$/.test(c) && c !== 'transparent';
            const nav = getComputedStyle(document.querySelector('.nav'));
            const tile = getComputedStyle(document.querySelector('.bento .tile:not(.bento-ring)'));
            const btn = getComputedStyle(document.querySelector('.rn-more'));
            return {
              navBg: nav.backgroundColor, navOpaque: solid(nav.backgroundColor), navBorder: parseFloat(nav.borderTopWidth),
              tileBorder: parseFloat(tile.borderTopWidth), tileBorderColor: tile.borderTopColor,
              btnBorder: parseFloat(btn.borderTopWidth),
            };
          });
          assert.ok(look.navOpaque, `barra de baixo opaca (${look.navBg})`);
          assert.ok(look.tileBorder >= 1 && look.btnBorder >= 1, `bordas em cartões e botões: ${JSON.stringify(look)}`);
          // Anel de foco mais grosso.
          await page.keyboard.press('Tab');
          const ring = await page.evaluate(() => parseFloat(getComputedStyle(document.activeElement).outlineWidth));
          assert.ok(ring >= 3, `anel de foco ${ring}px`);
          // Folha "Registrar leitura": opaca e com contraste.
          await page.click('.reading:has-text("Duna") [data-action="update-page"]');
          await page.waitForSelector('.sheet-layer.is-open .psheet');
          await checkContrast(page, `folha ${scheme}`, AAA);
          await page.keyboard.press('Escape');
          await page.waitForSelector('.sheet-layer', { state: 'detached' });
        }
        await page.context().close();
      }
    }
    step('sem contraste aumentado nada muda (bordas dos cartões continuam discretas)');
    {
      const page = await newPage({ scheme: 'dark' });
      await open(page, '#/inicio', 'inicio');
      const bg = await page.$eval('.nav', (n) => getComputedStyle(n).backgroundColor);
      assert.match(bg, /rgba|color\(/, 'vidro translúcido no normal');
      await page.context().close();
    }
  }

  if (!ONLY || ONLY === 'largas') {
    const WIDE = [
      ['ipad', 820, 1180],
      ['ipad-deitado', 1180, 820],
      ['celular-deitado', 844, 390],
    ];
    const WIDE_SCREENS = [
      ...SCREENS,
      ['estante-capas', '#/estante?aba=lido', 'estante'],
      ['buscar', '#/buscar', 'buscar'],
      ['novo', '#/novo', 'novo'],
      ['resumo-gostos', '#/resumo/2026?aba=gostos', 'resumo'],
    ];
    for (const [device, width, height] of WIDE) {
      for (const scheme of device === 'ipad' ? ['dark', 'light'] : ['dark']) {
        step(`${device} ${width}×${height} (${scheme})`);
        const page = await newPage({ width, height, scheme });
        for (const [label, hash, name] of WIDE_SCREENS) {
          await open(page, hash, name);
          if (label === 'estante-capas') {
            await page.click('[data-action="shelf-mode"][data-value="capas"]');
            await page.waitForSelector('.cover-grid');
          }
          await checkLayout(page, `${label} ${device}`);
          // Duas colunas onde ajudam: Início (lendo | números e lidos), ficha (capa | resto).
          const cols = await page.evaluate((l) => {
            const box = (sel) => document.querySelector(sel)?.getBoundingClientRect();
            if (l === 'inicio') {
              const [a, b] = [box('.app > .section:has(.card.reading)'), box('.app > .bento')];
              return { side: b.left >= a.right, top: Math.abs(a.top - b.top) < 2 };
            }
            if (l === 'ficha' || l === 'ficha-lido') {
              const [a, b] = [box('.ficha-hero'), box('.ficha-hero ~ section, .ficha-hero ~ .card')];
              return { side: b.left >= a.right, top: Math.abs(a.top - b.top) < 2 };
            }
            if (l === 'resumo') return { side: getComputedStyle(document.querySelector('.rs-panel')).columnCount === '2', top: true };
            return null;
          }, label);
          if (cols) assert.ok(cols.side && cols.top, `${label} ${device}: duas colunas ${JSON.stringify(cols)}`);
          await shot(page, `${device}${scheme === 'light' ? '-claro' : ''}-${label}`);
          if (label === 'estante-capas') await page.click('[data-action="shelf-mode"][data-value="lista"]');
        }
        await open(page, '#/inicio', 'inicio');
        const nav = await page.$eval('.nav', (n) => { const r = n.getBoundingClientRect(); return { w: r.width, h: r.height, l: r.left, b: innerHeight - r.bottom }; });
        const app = await page.$eval('.app', (a) => a.getBoundingClientRect().left);
        if (device === 'celular-deitado') assert.ok(nav.h > nav.w && nav.l < app, `trilho à esquerda: ${JSON.stringify(nav)}`);
        else assert.ok(nav.w > nav.h && nav.b < 40, `cápsula embaixo: ${JSON.stringify(nav)}`);
        await page.click('.reading:has-text("Duna") [data-action="update-page"]');
        await page.waitForSelector('.sheet-layer.is-open .psheet');
        await page.waitForTimeout(300);
        await shot(page, `${device}${scheme === 'light' ? '-claro' : ''}-folha`, false);
        const sheet = await page.$eval('.sheet', (s) => { const r = s.getBoundingClientRect(); return { l: r.left, r: innerWidth - r.right, t: r.top, b: innerHeight - r.bottom, w: r.width }; });
        assert.ok(Math.abs(sheet.l - sheet.r) < 2 && sheet.w <= 520, `folha centralizada: ${JSON.stringify(sheet)}`);
        await page.keyboard.press('Escape');
        await page.waitForSelector('.sheet-layer', { state: 'detached' });
        await page.context().close();
      }
    }
  }
} finally {
  await browser.close();
  server.close();
}

if (errors.length) failures.push(`erros na página:\n    ${[...new Set(errors)].join('\n    ')}`);
if (failures.length) {
  console.error(`\n${failures.length} problema(s):\n- ${failures.join('\n- ')}`);
  process.exit(1);
}
console.log('ok: v16 acessibilidade');
