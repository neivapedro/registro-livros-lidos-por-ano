// Teste de ponta a ponta da 1.6.1 (visual): "Lendo agora" com cartão neutro e só um brilho suave da cor
// da capa (contraste AA em cada cor de destaque × tema), engrenagem de Ajustes no Início e na barra
// compacta, barra de baixo de vidro que esconde o que passa por baixo (medido em pixels) com o fim
// de cada tela livre, e piso de 12 px × escala nos textos de apoio (320/390/430, escala 1 e 1,3).
// Uso: node tests/e2e/v161-inicio.mjs   (capturas em tests/e2e/screens/v161-inicio-*.png)

import { execSync } from 'node:child_process';
import { createServer } from 'node:http';
import { mkdirSync, readFileSync, existsSync } from 'node:fs';
import { extname, join, normalize } from 'node:path';
import { createRequire } from 'node:module';
import { deflateSync, inflateSync } from 'node:zlib';
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

// ---------- Capas de imagem (data: PNG com degradê e uma faixa clara) ----------

function crc32(buf) {
  let c = ~0;
  for (const byte of buf) {
    c ^= byte;
    for (let k = 0; k < 8; k += 1) c = (c >>> 1) ^ (0xEDB88320 & -(c & 1));
  }
  return ~c >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}
function pngCover([r, g, b], [r2, g2, b2] = [r, g, b], w = 60, h = 90) {
  const rows = [];
  for (let y = 0; y < h; y += 1) {
    const row = [0];
    const t = y / h;
    const band = y > h * 0.62 && y < h * 0.7;
    for (let x = 0; x < w; x += 1) {
      row.push(...(band ? [240, 232, 220] : [r + (r2 - r) * t, g + (g2 - g) * t, b + (b2 - b) * t].map(Math.round)));
    }
    rows.push(...row);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  const png = Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr), chunk('IDAT', deflateSync(Buffer.from(rows))), chunk('IEND', Buffer.alloc(0)),
  ]);
  return `data:image/png;base64,${png.toString('base64')}`;
}
const TEAL = pngCover([22, 110, 120], [10, 50, 70]);
const CRIMSON = pngCover([170, 40, 50], [90, 20, 30]);
const LEMON = pngCover([235, 225, 70], [250, 245, 200]);
const WHITE = pngCover([248, 246, 240], [230, 226, 220]);

// ---------- Dados ----------

const TODAY = '2026-10-28';
const TS = '2026-01-01T00:00:00.000Z';
const base = { format: 'fisico', genre: 'Ficção', tags: [], quotes: [], journal: [], createdAt: TS, updatedAt: TS, favorite: false, notes: '', isbn: '', rating: null };
const read = (id, title, authors, endDate, extra = {}) => ({
  ...base, id, title, authors, status: 'lido', startDate: endDate.replace(/-\d\d$/, '-01'), endDate, pages: 300, rating: 4, ...extra,
});
const entry = (date, from, to) => ({ date, from, to, unit: 'page', note: '' });
const seed = {
  version: 2, goals: { 2026: 12 }, defaultGoal: 12, customGenres: [], lastBackupAt: '2026-10-20T10:00:00.000Z',
  upNext: ['w1', 'w2'], pageGoals: {},
  books: [
    read('a1', 'Duna', 'Frank Herbert', '2026-02-20', { pages: 680, cover: CRIMSON, favorite: true }),
    read('a2', 'Sapiens', 'Yuval Noah Harari', '2026-03-20', { genre: 'História', pages: 460 }),
    read('a3', 'Torto Arado', 'Itamar Vieira Junior', '2026-04-12', { rating: 5, cover: TEAL }),
    read('a4', 'O Nome da Rosa', 'Umberto Eco', '2026-05-02', { pages: 560 }),
    read('a5', 'Memórias Póstumas de Brás Cubas: edição comentada com notas e estudo crítico completo', '', '2026-06-10', { pages: 80, cover: LEMON }),
    read('a6', '1984', 'George Orwell', '2026-07-15', { pages: 328, cover: WHITE,
      quotes: [{ id: 'q1', text: 'Quem controla o passado controla o futuro; quem controla o presente controla o passado.', page: 44, percent: null, note: '', createdAt: '2026-07-01T10:00:00.000Z' }] }),
    read('a7', 'Grande Sertão: Veredas', 'João Guimarães Rosa', '2026-08-30', { pages: 1200 }),
    read('a8', 'A Hora da Estrela', 'Clarice Lispector', '2026-09-30', { pages: 96 }),
    {
      ...base, id: 'r1', title: 'Fora de Série', authors: 'Malcolm Gladwell', status: 'lendo', pages: 300, currentPage: 120,
      startDate: '2026-10-01', cover: TEAL, journal: [entry('2026-10-26', 40, 70), entry('2026-10-27', 70, 96), entry('2026-10-28', 96, 120)],
    },
    {
      ...base, id: 'r2', title: 'Sem total de páginas', authors: 'Fulana de Tal', status: 'lendo', currentPage: 50,
      startDate: '2026-10-10', journal: [entry('2026-10-20', 0, 50)],
    },
    {
      ...base, id: 'r3', title: 'Quase no fim', authors: 'Beltrano', status: 'lendo', format: 'kindle', currentPercent: 64,
      startDate: '2026-10-02', cover: CRIMSON, journal: [],
    },
    { ...base, id: 'w1', title: 'Cem Anos de Solidão', authors: 'Gabriel García Márquez', status: 'quero', pages: 448 },
    { ...base, id: 'w2', title: 'Mindset', authors: 'Carol Dweck', status: 'quero', pages: 312, cover: LEMON },
    { ...base, id: 'w3', title: 'Os Irmãos Karamázov', authors: 'Fiódor Dostoiévski', status: 'quero', pages: 1024 },
  ],
};

export const ACCENTS = ['terracota', 'oliva', 'petroleo', 'vinho', 'grafite'];

// ---------- Navegador ----------

const browser = await playwright.chromium.launch();
const baseOptions = { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, locale: 'pt-BR' };
const NIGHT = `${TODAY}T21:00:00`;

const errors = [];
const step = (msg) => console.log(`• ${msg}`);

async function newPage({ scheme = 'dark', accent = 'terracota', reducedMotion = 'no-preference', data = seed, name = 'Karoline', width = 390, dsf = 2, hash = '#/inicio' } = {}) {
  const context = await browser.newContext({ ...baseOptions, viewport: { width, height: 844 }, deviceScaleFactor: dsf, colorScheme: scheme === 'light' ? 'light' : 'dark', reducedMotion });
  const page = await context.newPage();
  await page.clock.setFixedTime(new Date(NIGHT));
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errors.push(`console: ${m.text()}`); });
  page.on('dialog', (d) => d.accept());
  await page.goto(`${BASE}#/inicio`);
  await page.waitForSelector('#app[data-page]');
  await page.evaluate(async ([d, n, s, a]) => {
    await (await import('/js/db.js')).setItem('state', d);
    localStorage.setItem('leituras:tema', s === 'light' ? 'claro' : 'escuro');
    localStorage.setItem('leituras:acento', a);
    if (n) localStorage.setItem('leituras:nome', n);
  }, [data, name, scheme, accent]);
  await page.goto(`${BASE}${hash}`);
  await page.reload();
  await page.waitForSelector('#app[data-page]');
  return { context, page };
}


const onPage = (page, name) => page.waitForFunction((n) => document.getElementById('app').dataset.page === n, name);
const go = async (page, hash, name) => {
  await page.evaluate((h) => { location.hash = h; }, hash);
  await onPage(page, name);
};
const overflow = (page) => page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
const shot = async (page, name, full = false) => {
  await page.waitForTimeout(350);
  await page.screenshot({ path: join(SHOTS, `qa-v15-${name}.png`), fullPage: full });
};

// ---------- Pixels: PNG das capturas (8 bits, RGB/RGBA, sem entrelaçamento) ----------

function decodePng(buf) {
  let pos = 8;
  let w = 0;
  let h = 0;
  let ct = 2;
  const idat = [];
  while (pos < buf.length) {
    const len = buf.readUInt32BE(pos);
    const type = buf.toString('ascii', pos + 4, pos + 8);
    const data = buf.subarray(pos + 8, pos + 8 + len);
    if (type === 'IHDR') {
      w = data.readUInt32BE(0);
      h = data.readUInt32BE(4);
      ct = data[9];
    } else if (type === 'IDAT') idat.push(data);
    else if (type === 'IEND') break;
    pos += 12 + len;
  }
  const bpp = ct === 6 ? 4 : 3;
  const raw = inflateSync(Buffer.concat(idat));
  const stride = w * bpp;
  const out = Buffer.alloc(h * stride);
  let p = 0;
  for (let y = 0; y < h; y += 1) {
    const f = raw[p++];
    for (let x = 0; x < stride; x += 1) {
      const a = x >= bpp ? out[y * stride + x - bpp] : 0;
      const b = y ? out[(y - 1) * stride + x] : 0;
      const c = x >= bpp && y ? out[(y - 1) * stride + x - bpp] : 0;
      let v = raw[p++];
      if (f === 1) v += a;
      else if (f === 2) v += b;
      else if (f === 3) v += (a + b) >> 1;
      else if (f === 4) {
        const pp = a + b - c;
        const pa = Math.abs(pp - a);
        const pb = Math.abs(pp - b);
        const pc = Math.abs(pp - c);
        v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
      }
      out[y * stride + x] = v & 255;
    }
  }
  const pixels = [];
  for (let i = 0; i < out.length; i += bpp) pixels.push([out[i], out[i + 1], out[i + 2]]);
  return { w, h, pixels };
}

const lum = (rgb) => {
  const [r, g, b] = rgb.map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const ratio = (a, b) => {
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};
const gray = ([r, g, b]) => 0.299 * r + 0.587 * g + 0.114 * b;
function stats(values) {
  const mean = values.reduce((s, v) => s + v, 0) / values.length;
  const sd = Math.sqrt(values.reduce((s, v) => s + (v - mean) ** 2, 0) / values.length);
  return { mean, sd };
}

async function region(page, clip) {
  return decodePng(await page.screenshot({ clip, scale: 'css', animations: 'disabled' }));
}

/**
 * Contraste do texto de `selector` com o que está de fato atrás dele (o texto é escondido,
 * o fundo fotografado e cada pixel comparado com a cor do texto). Devolve o pior caso
 * (percentil 5, para não contar a borda antisserrilhada de outra coisa).
 */
async function textContrast(page, selector) {
  const info = await page.evaluate((sel) => {
    const el = document.querySelector(sel);
    if (!el) return null;
    el.scrollIntoView({ block: 'center' });
    const ctx = document.createElement('canvas').getContext('2d', { willReadFrequently: true });
    ctx.fillStyle = getComputedStyle(el).color;
    ctx.fillRect(0, 0, 1, 1);
    const [r, g, b, a] = ctx.getImageData(0, 0, 1, 1).data;
    let opacity = a / 255;
    for (let n = el; n && n !== document.body; n = n.parentElement) opacity *= Number(getComputedStyle(n).opacity);
    const range = document.createRange();
    range.selectNodeContents(el);
    // O texto cortado (reticências) mede além da caixa: só conta a parte visível.
    const tr = range.getBoundingClientRect();
    const box = el.getBoundingClientRect();
    const left = Math.max(tr.left, box.left);
    const top = Math.max(tr.top, box.top);
    const rect = { x: left, y: top, width: Math.min(tr.right, box.right) - left, height: Math.min(tr.bottom, box.bottom) - top };
    el.classList.add('qa-hide-text');
    if (!document.getElementById('qa-hide-style')) {
      const st = document.createElement('style');
      st.id = 'qa-hide-style';
      st.textContent = '.qa-hide-text, .qa-hide-text * { color: transparent !important; -webkit-text-fill-color: transparent !important; text-decoration-color: transparent !important; transition: none !important; }';
      document.head.append(st);
    }
    return { rgb: [r, g, b], opacity, rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height } };
  }, selector);
  assert.ok(info, `sem ${selector}`);
  const { rect } = info;
  const clip = { x: Math.max(0, Math.floor(rect.x)), y: Math.max(0, Math.floor(rect.y)), width: Math.max(1, Math.ceil(rect.width)), height: Math.max(1, Math.ceil(rect.height)) };
  const img = await region(page, clip);
  await page.evaluate((sel) => document.querySelector(sel).classList.remove('qa-hide-text'), selector);
  const values = img.pixels.map((bg) => {
    const fg = info.rgb.map((v, i) => v * info.opacity + bg[i] * (1 - info.opacity));
    return ratio(fg, bg);
  }).sort((x, y) => x - y);
  return values[Math.floor(values.length * 0.05)];
}

/** Desvio (textura do grão) e tom de uma faixa da tela. */
async function strip(page, clip) {
  const img = await region(page, clip);
  return stats(img.pixels.map(gray));
}

// Simula o iPhone com iOS 16.0/16.1: troca o app.css por uma cópia em que color-mix() não existe
// (como lá, cada regra com color-mix + var() vira "unset" e os @supports respondem "não").
async function withoutColorMix(page) {
  await page.evaluate(async () => {
    const link = document.querySelector('link[rel="stylesheet"][href*="app.css"]');
    const css = (await (await fetch(link.href)).text()).replaceAll("url('../", "url('").replaceAll('color-mix(', 'color-mixx(');
    const style = document.createElement('style');
    style.textContent = css;
    link.replaceWith(style);
  });
}

const transparent = (c) => c === 'rgba(0, 0, 0, 0)' || c === 'transparent';

const FLOOR_SKIP = [
  // Texto deliberadamente pequeno ou fixo: barra de baixo, capas e lombadas, gráficos e mapas
  // (eixos, células de calendário/mapa de calor), números dentro de selos e anéis; .sp-empty não escala (13,5 px fixos, já acima do piso).
  '.nav', '.cover', '.cover *', '.spine', '.spine *', '.sc-svg', '.sc-svg *', 'svg', 'svg *', '.cal-cell', '.cal-cell *', '.cal-wd',
  '.hm-months', '.hm-months *', '.bar-value', '.bar-label', '.book-tab-count', '.cov-ring-pct', '.cov-ring-pct *', '.cov-ring-unit',
  '.rchart-max', '.rchart-axis', '.rchart-axis *', '.fav-badge', '.fav-badge *', '.next-pos', '.sp-empty', '.retro', '.retro *', '.tab-count', '.seg-count',
];

/** Texto visível abaixo do piso (12 px × escala), fora das exceções acima. */
function belowFloor(page, scale) {
  return page.evaluate(([skip, sc]) => {
    const bad = [];
    const min = 12 * sc - 0.05;
    const walker = document.createTreeWalker(document.getElementById('app'), NodeFilter.SHOW_TEXT);
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      if (!n.nodeValue.trim()) continue;
      const el = n.parentElement;
      if (!el || skip.some((s) => el.closest(s))) continue;
      const cs = getComputedStyle(el);
      if (cs.visibility === 'hidden' || cs.display === 'none') continue;
      const r = el.getBoundingClientRect();
      if (r.width < 2 || r.height < 2 || el.closest('.sr-only')) continue;
      const size = parseFloat(cs.fontSize);
      if (size < min) bad.push(`${el.tagName.toLowerCase()}.${String(el.className).split(' ')[0]} "${n.nodeValue.trim().slice(0, 28)}" ${size.toFixed(1)}px`);
    }
    return [...new Set(bad)];
  }, [FLOOR_SKIP, scale]);
}

const surfaceOf = (page) => page.evaluate(() => {
  const c = document.createElement('canvas').getContext('2d', { willReadFrequently: true });
  c.fillStyle = getComputedStyle(document.documentElement).getPropertyValue('--surface').trim();
  c.fillRect(0, 0, 1, 1);
  return [...c.getImageData(0, 0, 1, 1).data].slice(0, 3);
});
const shotTo = async (page, name, full = false) => {
  await page.waitForTimeout(350);
  await page.screenshot({ path: join(SHOTS, `v161-inicio-${name}.png`), fullPage: full });
};

try {
  // ---------- 1. "Lendo agora": cartão neutro, brilho discreto ----------
  step('Lendo agora: superfície neutra, brilho suave perto da capa, texto AA em cada cor × tema');
  const low = [];
  const need = (value, min, what) => {
    if (!(value >= min)) low.push(`${what}: ${value.toFixed(2)} (mín. ${min})`);
  };
  for (const scheme of ['dark', 'light']) {
    for (const accent of ACCENTS) {
      const { context, page } = await newPage({ scheme, accent, reducedMotion: 'reduce', dsf: 1 });
      const tag = `${accent}-${scheme === 'dark' ? 'escuro' : 'claro'}`;
      await page.waitForFunction(() => document.querySelectorAll('#app .card.reading[data-tint-src="capa"]').length === 2);
      await page.waitForTimeout(300);
      const surface = await surfaceOf(page);
      for (const id of ['r1', 'r2', 'r3']) {
        const sel = `#app .reading[data-id="${id}"]`;
        const info = await page.evaluate((s) => {
          const el = document.querySelector(s);
          const cs = getComputedStyle(el);
          const bg = getComputedStyle(el, '::before').backgroundImage;
          const alphas = [...bg.matchAll(/rgba?\([^)]*\)/g)].map((m) => m[0]);
          return { bg: cs.backgroundColor, img: cs.backgroundImage, glow: bg, alphas, rect: el.getBoundingClientRect().toJSON(), bodyScroll: scrollY };
        }, sel);
        assert.equal(info.img, 'none', `${tag} ${id}: cartão sem degradê próprio`);
        assert.match(info.glow, /radial-gradient/, `${tag} ${id}: brilho redondo`);
        const peak = Math.max(...info.alphas.map((c) => Number((c.match(/,\s*([\d.]+)\)$/) || [0, 1])[1])));
        assert.ok(peak <= (scheme === 'dark' ? 0.2 : 0.16) + 0.001 && peak >= 0.1, `${tag} ${id}: opacidade do brilho ${peak}`);
        await page.evaluate((s) => document.querySelector(s).scrollIntoView({ block: 'center' }), sel);
        const rect = await page.evaluate((s) => document.querySelector(s).getBoundingClientRect().toJSON(), sel);
        // Coluna do texto (lado direito, vazio de texto) = superfície pura; perto da capa há matiz.
        const right = await region(page, { x: Math.floor(rect.right - 26), y: Math.floor(rect.top + 20), width: 14, height: 16 });
        const far = Math.max(...right.pixels.map((p) => Math.max(...p.map((v, i) => Math.abs(v - surface[i])))));
        assert.ok(far <= 3, `${tag} ${id}: lado do texto devia ser a superfície (diferença ${far})`);
        const near = await region(page, { x: Math.floor(rect.left + 3), y: Math.floor(rect.top + 56), width: 8, height: 8 });
        const glow = Math.max(...near.pixels.map((p) => Math.max(...p.map((v, i) => Math.abs(v - surface[i])))));
        assert.ok(glow >= 4, `${tag} ${id}: brilho invisível perto da capa (${glow})`);
        assert.ok(glow <= 60, `${tag} ${id}: brilho forte demais (${glow})`);
        need(await textContrast(page, `${sel} .serif-title`), 4.5, `${tag} título (${id})`);
        need(await textContrast(page, `${sel} .rn-author`), 4.5, `${tag} autor (${id})`);
        need(await textContrast(page, `${sel} .rn-progress`), 4.5, `${tag} progresso (${id})`);
        need(await textContrast(page, `${sel} .rn-main`), 4.5, `${tag} botão (${id})`);
      }
      need(await textContrast(page, '#app .reading[data-id="r2"] .pages-ask'), 4.5, `${tag} link do total de páginas`);
      // Primeiro cartão: botão cheio; os outros, tonais.
      assert.deepEqual(await page.$$eval('#app .reading .rn-main', (els) => els.map((e) => e.classList.contains('btn-primary'))), [true, false, false]);
      if (accent === 'terracota' || accent === 'petroleo') {
        await page.evaluate(() => scrollTo(0, 0));
        await page.evaluate(() => document.querySelector('#app .reading').scrollIntoView({ block: 'start' }));
        await shotTo(page, `cartoes-${tag}`);
      }
      await context.close();
    }
  }
  assert.deepEqual(low, [], `contraste baixo:\n${low.join('\n')}`);

  // ---------- 2. Engrenagem de Ajustes ----------
  step('Ajustes no Início é uma engrenagem (44 px, mesmo rótulo), também na barra compacta');
  {
    const { context, page } = await newPage({ reducedMotion: 'reduce' });
    const gear = await page.evaluate(() => {
      const a = document.querySelector('.greet-row a[aria-label="Ajustes"]');
      const r = a.getBoundingClientRect();
      return { w: r.width, h: r.height, href: a.getAttribute('href'), svg: a.querySelector('svg').innerHTML, size: a.querySelector('svg').getAttribute('width') };
    });
    assert.ok(gear.w >= 44 && gear.h >= 44, `alvo ${gear.w}x${gear.h}`);
    assert.equal(gear.href, '#/ajustes');
    assert.match(gear.svg, /<circle cx="12" cy="12" r="3"/, 'o miolo da engrenagem');
    assert.doesNotMatch(gear.svg, /r="2"/, 'não é mais o ícone de controles');
    const compact = await page.evaluate(() => document.querySelector('.cbar a[aria-label="Ajustes"] svg')?.innerHTML || '');
    assert.equal(compact, gear.svg, 'a barra compacta usa o mesmo ícone');
    await page.evaluate(() => document.querySelector('.greet-row').scrollIntoView());
    const clip = await page.evaluate(() => document.querySelector('.greet-row').getBoundingClientRect().toJSON());
    await page.screenshot({ path: join(SHOTS, 'v161-inicio-engrenagem.png'), clip: { x: 0, y: Math.max(0, clip.y - 8), width: 390, height: 120 } });
    await context.close();
  }

  // ---------- 3. Barra de baixo sobre o conteúdo ----------
  step('barra de baixo: o texto que passa por baixo não se lê, no claro e no escuro; o fim da tela fica livre');
  for (const scheme of ['dark', 'light']) {
    const { context, page } = await newPage({ scheme, reducedMotion: 'reduce', dsf: 1 });
    await page.waitForFunction(() => document.querySelectorAll('#app .card.reading[data-tint-src="capa"]').length === 2);
    // Põe o botão do segundo cartão bem atrás da cápsula.
    await page.evaluate(() => {
      const b = document.querySelector('#app .reading[data-id="r2"] .rn-main').getBoundingClientRect();
      const n = document.querySelector('.nav').getBoundingClientRect();
      scrollBy(0, b.top + b.height / 2 - (n.top + n.height / 2));
    });
    await page.waitForTimeout(400);
    const navRect = await page.evaluate(() => document.querySelector('.nav').getBoundingClientRect().toJSON());
    const css = await page.evaluate(() => {
      const nav = getComputedStyle(document.querySelector('.nav'));
      const after = getComputedStyle(document.body, '::after');
      return { blur: nav.backdropFilter || nav.webkitBackdropFilter, bg: nav.backgroundColor, afterPe: after.pointerEvents, afterBg: after.backgroundImage, afterH: parseFloat(after.height) };
    });
    const blurPx = Number((css.blur.match(/blur\((\d+)px\)/) || [0, 0])[1]);
    assert.ok(blurPx >= 28, `desfoque da barra ${css.blur}`);
    const alpha = Number((css.bg.match(/,\s*([\d.]+)\)$/) || [0, 1])[1]);
    assert.ok(alpha >= 0.84, `fundo da barra opaco o bastante: ${css.bg}`);
    assert.equal(css.afterPe, 'none');
    assert.match(css.afterBg, /linear-gradient/);
    assert.ok(css.afterH >= navRect.height + 40, `esmaecido (${css.afterH}px) cobre a barra`);
    // Faixa da cápsula entre ícones (sem os ícones e rótulos): com e sem a barra.
    const clip = { x: Math.floor(navRect.left + 20), y: Math.floor(navRect.top + 4), width: Math.floor(navRect.width - 40), height: Math.floor(navRect.height - 8) };
    await page.addStyleTag({ content: '.nav > * { visibility: hidden !important; }' });
    const withNav = stats((await region(page, clip)).pixels.map(gray));
    await page.addStyleTag({ content: '.nav, body::after { visibility: hidden !important; }' });
    const without = stats((await region(page, clip)).pixels.map(gray));
    assert.ok(without.sd > 8, `sem a barra o texto aparece no mesmo lugar (desvio ${without.sd.toFixed(1)})`);
    assert.ok(withNav.sd < without.sd * 0.3 && withNav.sd < 5, `${scheme}: texto atrás da barra ainda legível (desvio ${withNav.sd.toFixed(1)} contra ${without.sd.toFixed(1)})`);
    await page.reload();
    await page.waitForSelector('#app[data-page]');
    await page.evaluate(() => scrollTo(0, 400));
    await page.waitForTimeout(400);
    await shotTo(page, `barra-${scheme}`);
    await context.close();
  }
  step('o último elemento de cada tela fica acima da barra (320/390/430)');
  for (const width of [320, 390, 430]) {
    const { context, page } = await newPage({ width, reducedMotion: 'reduce', dsf: 1 });
    for (const [hash, name] of [['#/inicio', 'inicio'], ['#/estante?aba=lido', 'estante'], ['#/resumo', 'resumo'], ['#/buscar', 'buscar'], ['#/ajustes', 'ajustes']]) {
      await go(page, hash, name);
      await page.waitForTimeout(250);
      await page.evaluate(() => scrollTo(0, document.documentElement.scrollHeight));
      await page.waitForTimeout(250);
      const gap = await page.evaluate(() => {
        const nav = document.querySelector('.nav').getBoundingClientRect();
        const kids = [...document.getElementById('app').children].filter((c) => c.getBoundingClientRect().height > 0 && getComputedStyle(c).position !== 'fixed');
        const last = kids[kids.length - 1].getBoundingClientRect();
        return nav.top - last.bottom;
      });
      assert.ok(gap >= 8, `${name} em ${width}px: o fim fica ${gap.toFixed(0)}px da barra`);
      assert.ok(await overflow(page) <= 0, `${name} sobrando em ${width}px`);
    }
    await context.close();
  }
  step('barra compacta, celular deitado e contraste alto continuam certos');
  {
    const { context, page } = await newPage({ reducedMotion: 'reduce', dsf: 1 });
    await page.evaluate(() => scrollTo(0, 500));
    await page.waitForTimeout(500);
    await page.mouse.wheel(0, 300).catch(() => {});
    const compactScale = await page.evaluate(() => getComputedStyle(document.querySelector('.nav')).scale);
    assert.ok(compactScale === '0.86' || compactScale === 'none', `escala ${compactScale}`);
    await page.setViewportSize({ width: 844, height: 390 });
    await page.waitForTimeout(300);
    const rail = await page.evaluate(() => {
      const n = document.querySelector('.nav').getBoundingClientRect();
      return { w: n.width, left: n.left, after: getComputedStyle(document.body, '::after').display, pad: getComputedStyle(document.getElementById('app')).paddingBottom };
    });
    assert.ok(rail.w <= 80 && rail.left < 20, `trilho à esquerda ${JSON.stringify(rail)}`);
    assert.equal(rail.after, 'none');
    assert.ok(parseFloat(rail.pad) <= 32, `sem sobra embaixo no trilho: ${rail.pad}`);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.emulateMedia({ contrast: 'more' });
    await page.waitForTimeout(200);
    const solid = await page.evaluate(() => {
      const nav = getComputedStyle(document.querySelector('.nav'));
      return { f: nav.backdropFilter, bg: nav.backgroundColor };
    });
    assert.ok(solid.f === 'none' || solid.f === '', `contraste alto sem desfoque: ${solid.f}`);
    assert.ok(!/,\s*0\.\d+\)$/.test(solid.bg), `contraste alto com fundo opaco: ${solid.bg}`);
    await context.close();
  }

  // ---------- 4. Piso de tamanho dos textos de apoio ----------
  step('nenhum texto legível abaixo de 12 px × escala (320/390/430, escala 1 e 1,3)');
  for (const scale of [1, 1.3]) {
    for (const width of [320, 390, 430]) {
      const { context, page } = await newPage({ width, reducedMotion: 'reduce', dsf: 1 });
      await page.evaluate((s) => {
        const st = document.documentElement.style;
        st.setProperty('--type-scale', String(s));
        st.setProperty('--type-scale-ui', String(Math.min(s, 1.3)));
        st.setProperty('--type-scale-nav', String(Math.min(s, 1.2)));
        st.setProperty('--type-scale-lg', String(1 + (s - 1) * 0.5));
      }, scale);
      const bad = [];
      const visit = async (hash, name, prep) => {
        await go(page, hash, name);
        if (prep) await prep();
        await page.waitForTimeout(250);
        bad.push(...(await belowFloor(page, scale)).map((t) => `${hash}: ${t}`));
        const extra = await overflow(page);
        assert.ok(extra <= 0, `${hash} sobrando ${extra}px em ${width}px (escala ${scale})`);
      };
      await visit('#/inicio', 'inicio');
      await visit('#/estante?aba=lido', 'estante');
      await visit('#/estante?aba=quero', 'estante');
      await visit('#/resumo', 'resumo');
      for (const tab of ['ritmo', 'gostos']) {
        await visit('#/resumo', 'resumo', async () => {
          await page.click(`[data-action="summary-tab"][data-tab="${tab}"]`).catch(() => {});
        });
      }
      await visit('#/livro/a6', 'livro');
      await visit('#/livro/r1', 'livro');
      await visit('#/ajustes', 'ajustes');
      await visit('#/buscar', 'buscar');
      assert.deepEqual(bad, [], `abaixo do piso (${width}px, escala ${scale}):\n${bad.join('\n')}`);
      if (scale === 1.3 && width === 320) {
        await go(page, '#/livro/a6', 'livro');
        await page.waitForTimeout(400);
        await page.evaluate(() => scrollTo(0, 360));
        await shotTo(page, 'legendas-320-1.3');
      }
      await context.close();
    }
  }

  assert.deepEqual(errors, [], `erros no console:\n${errors.join('\n')}`);
  console.log('\nTudo certo. Capturas em tests/e2e/screens/v161-inicio-*.png');
} catch (err) {
  console.error(`\nFALHOU: ${err.message}`);
  if (errors.length) console.error(errors.join('\n'));
  process.exitCode = 1;
} finally {
  await browser.close();
  server.close();
}
