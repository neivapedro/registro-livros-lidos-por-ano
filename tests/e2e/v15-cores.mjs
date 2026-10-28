// Teste de ponta a ponta da 1.5: cores de destaque, abas com a marca que desliza e telas vazias.
// - Ajustes → Aparência → Cor de destaque: cinco opções (Terracota, Oliva, Petróleo, Vinho,
//   Grafite) no claro e no escuro, guardadas só no aparelho ('leituras:acento'), aplicadas pelo
//   index.html antes do CSS (sem piscar); contraste AA em Início, Ajustes, Estante e Resumo.
// - Abas e seletores: a marca começa na opção anterior e desliza até a nova, alinhada ao botão
//   marcado em 320, 390 e 430 px; com "Reduzir movimento" vai direto.
// - Telas vazias ilustradas (Estante, Buscar, Trechos, Diário, Resumo): desenho, título, dica,
//   sem rolagem lateral e com contraste AA.
// Tira as telas em tests/e2e/screens/v15-cores-*.png.
// Uso: node tests/e2e/v15-cores.mjs   (Playwright instalado globalmente ou no projeto)

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
const shot = (name) => `${SHOTS}v15-cores-${name}.png`;

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

// ---------- Dados ----------

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
    out.push({ date: d.toISOString().slice(0, 10), from: from + i * per, to: from + (i + 1) * per, unit: 'page', note: '' });
  }
  return out;
}
const quote = (id, text, page) => ({ id, text, page, percent: null, note: '', createdAt: '2026-03-02T10:00:00.000Z' });
const G = ['Ficção', 'Biografia', 'Filosofia', 'História', 'Gestão'];
const books = [
  book('Hábitos Atômicos', {
    id: 'lido', endDate: '2026-03-20', startDate: '2026-03-01', rating: 4.5, favorite: true, genre: 'Desenvolvimento pessoal',
    tags: ['Indicação'], quotes: [quote('q1', 'Você não sobe ao nível dos seus objetivos. Você cai ao nível dos seus sistemas.', 27)],
    journal: daily('2026-03-01', 20, 16),
  }),
  book('Duna', { id: 'lendo', status: 'lendo', startDate: '2026-10-10', pages: 680, currentPage: 210, journal: daily('2026-10-10', 16, 14) }),
  book('Torto Arado', { id: 'quero', status: 'quero' }),
  book('Ulysses', { id: 'aband', status: 'abandonado', startDate: '2026-05-01', endDate: '2026-05-20', dropReason: 'Não prendeu.', currentPage: 90, pages: 900 }),
];
const ends = ['2026-01-18', '2026-02-12', '2026-04-08', '2026-05-30', '2026-06-21', '2026-07-15', '2026-08-30', '2026-09-22', '2026-10-05'];
ends.forEach((end, i) => books.push(book(`Leitura ${i + 1}`, {
  endDate: end, startDate: `${end.slice(0, 8)}01`, rating: [4, 3.5, 5, 4, 4.5, 3, 4, 5, 4][i], genre: G[i % G.length],
  pages: 180 + i * 40, format: i % 4 === 1 ? 'kindle' : 'fisico',
})));
['2025-02-10', '2025-07-01'].forEach((end, i) => books.push(book(`Antigo ${i + 1}`, { endDate: end, startDate: `${end.slice(0, 8)}01`, rating: 4 })));
const FULL = {
  version: 2, books, goals: { 2026: 15 }, defaultGoal: 12, customGenres: [], lastBackupAt: '2026-10-20T10:00:00.000Z',
  upNext: ['quero'], pageGoals: { 2026: 5000 },
};
// Sem nenhum livro: todas as telas vazias da Estante, Buscar, Trechos e Resumo.
const EMPTY = { version: 2, books: [], goals: {}, defaultGoal: 12, customGenres: [], lastBackupAt: null, upNext: [], pageGoals: {} };
// Um livro só, na fila, sem diário nem trechos: abas Diário e Trechos vazias.
const ONE = { ...EMPTY, books: [book('O Avesso da Pele', { id: 'solo', status: 'quero' })] };

// ---------- Contraste (o mesmo de tema-v14.mjs) ----------

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

const ACCENTS = {
  terracota: { dark: '#D08C4F', light: '#97531E' },
  oliva: { dark: '#A9B26A', light: '#5C6A26' },
  petroleo: { dark: '#5FAFBA', light: '#1D6273' },
  vinho: { dark: '#DB8597', light: '#9A2F48' },
  grafite: { dark: '#B4BAC2', light: '#454B54' },
};
const rgb = (hex) => `rgb(${[1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)).join(', ')})`;

const browser = await playwright.chromium.launch();
const errors = [];
async function newPage({ width = 390, height = 844, scheme = 'dark', motion = 'reduce', theme = null, accent = null, seed = FULL } = {}) {
  const context = await browser.newContext({
    viewport: { width, height }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, locale: 'pt-BR',
    reducedMotion: motion, colorScheme: scheme,
  });
  const page = await context.newPage();
  await page.clock.setFixedTime(new Date(`${TODAY}T12:00:00`));
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errors.push(`console: ${m.text()}`); });
  await page.goto(BASE);
  // Espera o app abrir antes de gravar os dados (senão a gravação dele pode vir depois da nossa).
  await page.waitForFunction(() => document.getElementById('app').dataset.page);
  await page.evaluate(async ({ d, t, a }) => {
    await (await import('/js/db.js')).setItem('state', d);
    if (t) localStorage.setItem('leituras:tema', t); else localStorage.removeItem('leituras:tema');
    if (a) localStorage.setItem('leituras:acento', a); else localStorage.removeItem('leituras:acento');
  }, { d: seed, t: theme, a: accent });
  return page;
}
const step = (msg) => console.log(`• ${msg}`);
const onPage = (page, name) => page.waitForFunction((n) => document.getElementById('app').dataset.page === n, name);
async function open(page, hash, name) {
  // Troca o endereço sem o evento hashchange (o app ainda tem os dados antigos na memória:
  // um livro "não encontrado" mandaria para o Início) e abre de novo, lendo os dados gravados.
  await page.evaluate((h) => history.replaceState(null, '', h), hash);
  await page.reload();
  await onPage(page, name);
  await page.evaluate(() => document.fonts.ready);
}
const failures = [];
async function check(page, label, { file = null, full = true } = {}) {
  const bad = await page.evaluate(auditContrast);
  const overflow = await page.evaluate(() => document.scrollingElement.scrollWidth - innerWidth);
  if (bad.length) failures.push(`${label}:\n    ${bad.join('\n    ')}`);
  if (overflow > 0) failures.push(`${label}: rolagem lateral de ${overflow}px`);
  if (file) await page.screenshot({ path: shot(file), fullPage: full });
}
/** Cor de --accent como o navegador a pinta (num elemento de prova). */
const accentColor = (page, sel = 'html') => page.evaluate((s) => {
  const probe = document.createElement('span');
  probe.style.color = 'var(--accent)';
  document.querySelector(s).append(probe);
  const c = getComputedStyle(probe).color;
  probe.remove();
  return c;
}, sel);

try {
  step('cada cor de destaque no claro e no escuro: Início e Ajustes (telas), Estante e Resumo (contraste)');
  for (const [id, hex] of Object.entries(ACCENTS)) {
    for (const scheme of ['light', 'dark']) {
      const page = await newPage({ scheme, accent: id === 'terracota' ? null : id });
      await open(page, '#/inicio', 'inicio');
      assert.equal(await page.getAttribute('html', 'data-accent'), id);
      assert.equal(await page.getAttribute('html', 'data-theme'), scheme);
      assert.equal(await accentColor(page), rgb(hex[scheme]), `${id}/${scheme}: --accent`);
      // A barra de navegação marca o Início com a cor escolhida.
      assert.equal(await page.$eval('.nav a.is-on', (a) => getComputedStyle(a).color), rgb(hex[scheme]));
      await check(page, `${id}-${scheme}-inicio`, { file: `${id}-${scheme}-inicio`, full: false });
      await open(page, '#/ajustes', 'ajustes');
      await page.locator('.accent-pick').scrollIntoViewIfNeeded();
      await check(page, `${id}-${scheme}-ajustes`);
      await page.screenshot({ path: shot(`${id}-${scheme}-ajustes`) });
      assert.equal(await page.getAttribute('.accent-sw[aria-pressed="true"]', 'data-value'), id);
      for (const [hash, name, label] of [['#/estante?aba=lido', 'estante', 'estante'], ['#/resumo/2026', 'resumo', 'resumo'], ['#/resumo/2026?aba=ritmo', 'resumo', 'ritmo']]) {
        await open(page, hash, name);
        await check(page, `${id}-${scheme}-${label}`);
      }
      // A retrospectiva (sempre escura) usa a versão escura da mesma cor.
      await open(page, '#/retro/2026', 'retro');
      assert.equal(await accentColor(page, '.retro'), rgb(hex.dark), `${id}/${scheme}: retrospectiva`);
      await page.context().close();
    }
  }

  step('Ajustes: escolher a cor guarda só no aparelho, vale ao reabrir e é aplicada antes do CSS');
  {
    const page = await newPage({ scheme: 'dark' });
    await open(page, '#/ajustes', 'ajustes');
    const pressed = () => page.$$eval('.accent-sw', (els) => els.map((e) => `${e.dataset.value}:${e.getAttribute('aria-pressed')}`).join(' '));
    assert.equal(await pressed(), 'terracota:true oliva:false petroleo:false vinho:false grafite:false');
    const sizes = await page.$$eval('.accent-sw', (els) => els.map((e) => [e.getBoundingClientRect().width, e.getBoundingClientRect().height]));
    assert.ok(sizes.every(([w, h]) => w >= 44 && h >= 44), `toque de 44px (${JSON.stringify(sizes)})`);
    const names = await page.$$eval('.accent-sw', (els) => els.map((e) => [e.querySelector('.accent-name').textContent, getComputedStyle(e.querySelector('.accent-name')).opacity]));
    assert.deepEqual(names.map((n) => n[0]), ['Terracota', 'Oliva', 'Petróleo', 'Vinho', 'Grafite']);
    assert.deepEqual(names.map((n) => n[1]), ['1', '0', '0', '0', '0'], 'só o nome da escolhida aparece');
    await page.click('.accent-sw[data-value="petroleo"]');
    assert.equal(await page.getAttribute('html', 'data-accent'), 'petroleo');
    assert.equal(await page.evaluate(() => localStorage.getItem('leituras:acento')), 'petroleo');
    assert.equal(await pressed(), 'terracota:false oliva:false petroleo:true vinho:false grafite:false');
    assert.equal(await accentColor(page), rgb(ACCENTS.petroleo.dark));
    // Não entra nos dados (nem no backup).
    const stored = await page.evaluate(async () => JSON.stringify(await (await import('/js/db.js')).getItem('state')));
    assert.doesNotMatch(stored, /acento|petroleo|accent/i);
    // Reabrir: a cor já está no <html> quando o CSS chega (sem piscar o terracota).
    let atCss = null;
    await page.route('**/css/app.css', async (route) => {
      atCss = await page.evaluate(() => document.documentElement.getAttribute('data-accent'));
      await route.continue();
    });
    await page.reload();
    await onPage(page, 'ajustes');
    assert.equal(atCss, 'petroleo', 'data-accent definido antes do CSS');
    await page.unroute('**/css/app.css');
    // Mesmo sem o JavaScript do app, o primeiro desenho já tem a cor certa.
    await page.route('**/js/main.js', (route) => route.abort());
    await page.reload();
    assert.equal(await page.getAttribute('html', 'data-accent'), 'petroleo');
    assert.equal(await accentColor(page), rgb(ACCENTS.petroleo.dark));
    await page.unroute('**/js/main.js');
    // Valor estranho guardado: volta ao padrão.
    await page.evaluate(() => localStorage.setItem('leituras:acento', 'roxo<script>'));
    await page.reload();
    await onPage(page, 'ajustes');
    assert.equal(await page.getAttribute('html', 'data-accent'), 'terracota');
    await page.click('.accent-sw[data-value="vinho"]');
    await page.click('.accent-sw[data-value="terracota"]');
    assert.equal(await page.evaluate(() => localStorage.getItem('leituras:acento')), null, 'o padrão apaga a chave');
    assert.equal(await page.getAttribute('html', 'data-accent'), 'terracota');
    await page.context().close();
  }

  step('abas: a marca começa na opção anterior e desliza até a nova (320, 390 e 430 px)');
  const indState = (page, ctrlSel) => page.evaluate((sel) => {
    const ctrl = document.querySelector(sel);
    const ind = ctrl.querySelector(':scope > .tab-ind');
    const on = ctrl.querySelector(':scope > .is-on');
    const a = ind.getBoundingClientRect();
    const b = on.getBoundingClientRect();
    return { transform: getComputedStyle(ind).transform, ind: [a.left, a.width], btn: [b.left, b.width], has: ctrl.classList.contains('has-ind') };
  }, ctrlSel);
  /** Toca a opção e lê a marca logo depois do redesenho (antes da transição andar). */
  const tapAndRead = (page, ctrlSel, optSel) => page.evaluate(({ c, o }) => new Promise((resolve) => {
    const app = document.getElementById('app');
    const mo = new MutationObserver(() => {
      const ind = document.querySelector(c)?.querySelector(':scope > .tab-ind');
      if (!ind) return;
      mo.disconnect();
      resolve(getComputedStyle(ind).transform);
    });
    mo.observe(app, { childList: true });
    document.querySelector(o).click();
  }), { c: ctrlSel, o: optSel });
  const aligned = (s, label) => {
    // Sublinhados: a marca é a faixa do botão; nos outros, o próprio botão.
    assert.ok(Math.abs(s.ind[0] - s.btn[0]) < 1.5 && Math.abs(s.ind[1] - s.btn[1]) < 1.5, `${label}: marca alinhada (${s.ind} × ${s.btn})`);
  };
  const CONTROLS = [
    ['estante-status', '#/estante?aba=lido', 'estante', '.shelf-tabs', '.shelf-tabs a[href$="aba=lendo"]'],
    ['estante-modo', '#/estante?aba=lido', 'estante', '.mini-seg', '.mini-seg-btn[data-value="capas"]'],
    ['resumo', '#/resumo/2026', 'resumo', '.rs-tabs', '.rs-tab[data-tab="gostos"]'],
    ['form-status', '#/livro/lido/editar', 'livro', '.segmented[aria-label="Status"]', '.segmented[aria-label="Status"] .seg-btn[data-value="abandonado"]'],
    ['livro-abas', '#/livro/lido/editar', 'livro', '.book-tabs', '.book-tab[data-tab="trechos"]'],
    ['aparencia', '#/ajustes', 'ajustes', '.theme-seg', '.theme-seg .seg-btn[data-value="claro"]'],
  ];
  for (const width of [320, 390, 430]) {
    const page = await newPage({ width, height: 800, motion: 'no-preference', scheme: width === 390 ? 'light' : 'dark' });
    for (const [label, hash, name, ctrl, opt] of CONTROLS) {
      await open(page, hash, name);
      await page.waitForSelector(`${ctrl}.has-ind > .tab-ind`);
      const before = await indState(page, ctrl);
      aligned(before, `${width}/${label} antes`);
      const start = await tapAndRead(page, ctrl, opt);
      assert.equal(start, before.transform, `${width}/${label}: começa onde estava`);
      await page.waitForTimeout(500);
      const after = await indState(page, ctrl);
      assert.notEqual(after.transform, before.transform, `${width}/${label}: a marca andou`);
      aligned(after, `${width}/${label} depois`);
      if (width === 390 && ['estante-status', 'form-status', 'resumo'].includes(label)) {
        await page.locator(ctrl).scrollIntoViewIfNeeded();
        await page.screenshot({ path: shot(`abas-${label}`) });
      }
    }
    // Girar/redimensionar: a marca acompanha (sem esperar novo toque).
    await open(page, '#/estante?aba=quero', 'estante');
    await page.setViewportSize({ width: width + 40, height: 800 });
    await page.waitForTimeout(400);
    aligned(await indState(page, '.shelf-tabs'), `${width}: depois de redimensionar`);
    await page.context().close();
  }
  {
    // Com "Reduzir movimento" a marca vai direto para a nova opção.
    const page = await newPage({ motion: 'reduce' });
    await open(page, '#/resumo/2026', 'resumo');
    await page.waitForSelector('.rs-tabs.has-ind');
    assert.equal(await page.$eval('.rs-tabs > .tab-ind', (i) => getComputedStyle(i).transitionDuration.split(',').every((d) => parseFloat(d) === 0)), true);
    await tapAndRead(page, '.rs-tabs', '.rs-tab[data-tab="ritmo"]');
    aligned(await indState(page, '.rs-tabs'), 'reduzir movimento');
    await page.context().close();
  }

  step('telas vazias ilustradas: Estante, Buscar, Trechos, Diário e Resumo (320 e 390 px, claro e escuro)');
  const EMPTIES = [
    ['estante-quero', EMPTY, '#/estante?aba=quero', 'estante', 'quero'],
    ['estante-lendo', EMPTY, '#/estante?aba=lendo', 'estante', 'lendo'],
    ['estante-lido', EMPTY, '#/estante?aba=lido', 'estante', 'lido'],
    ['estante-abandonado', EMPTY, '#/estante?aba=abandonado', 'estante', 'abandonado'],
    ['buscar', EMPTY, '#/buscar', 'buscar', 'busca'],
    ['trechos', EMPTY, '#/trechos', 'trechos', 'trechos'],
    ['todos-os-anos', EMPTY, '#/resumo/todos', 'resumo', 'resumo'],
    ['resumo-gostos', EMPTY, '#/resumo/2026?aba=gostos', 'resumo', 'resumo'],
    ['livro-diario', ONE, '#/livro/solo?aba=diario', 'livro', 'diario'],
    ['livro-trechos', ONE, '#/livro/solo?aba=trechos', 'livro', 'trechos'],
  ];
  for (const scheme of ['dark', 'light']) {
    for (const width of [390, 320]) {
      let page = null;
      let seed = null;
      for (const [label, data, hash, name, art] of EMPTIES) {
        if (seed !== data) {
          await page?.context().close();
          page = await newPage({ scheme, width, height: 760, seed: data, accent: scheme === 'light' ? 'oliva' : null });
          seed = data;
        }
        await open(page, hash, name);
        await page.waitForSelector(`.empty.has-art[data-empty="${art}"] svg.empty-art`);
        const geo = await page.$eval('.empty.has-art', (el) => {
          const svg = el.querySelector('svg').getBoundingClientRect();
          const box = el.getBoundingClientRect();
          return { svgW: svg.width, inside: svg.left >= box.left && svg.right <= box.right, title: el.querySelector('.empty-title').textContent };
        });
        assert.ok(geo.svgW >= 100 && geo.inside, `${label}: desenho de ${geo.svgW}px dentro do cartão`);
        assert.ok(geo.title.length > 3);
        await check(page, `vazio-${scheme}-${width}-${label}`, { file: width === 390 ? `vazio-${scheme}-${label}` : null, full: false });
      }
      await page.context().close();
    }
  }
  {
    // Buscar sem resultados (com filtro: oferece limpar os filtros).
    const page = await newPage({ scheme: 'dark' });
    await open(page, '#/buscar', 'buscar');
    await page.fill('#q', 'zzzzzz');
    await page.waitForSelector('.empty.has-art[data-empty="nada"]');
    assert.equal(await page.locator('.empty [data-action="clear-filters"]').count(), 0);
    await page.selectOption('[data-filter="status"]', 'lido');
    await page.waitForSelector('.empty [data-action="clear-filters"]');
    await check(page, 'buscar-sem-resultado', { file: 'vazio-dark-buscar-sem-resultado', full: false });
    await page.click('.empty [data-action="clear-filters"]');
    await page.waitForSelector('.fchip.is-on', { state: 'detached' });
    await page.context().close();
  }

  if (failures.length) throw new Error(`contraste/overflow:\n  ${failures.join('\n  ')}`);
  assert.deepEqual(errors, []);
  console.log('ok: cores, abas e telas vazias');
} finally {
  await browser.close();
  server.close();
}
