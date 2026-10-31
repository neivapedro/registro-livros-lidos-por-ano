// Teste de ponta a ponta da 1.6.2 (visual): capa pequena do "Lendo agora" só com iniciais e anel de %
// que não cobre texto; Início com dois tratamentos de cartão (destaque × linha de lista); "Quero ler" com
// ícone em caixa de 44px; cartão de páginas enxuto; capas desenhadas com ornamentos variados
// (320/390/430, claro/escuro, 3 cores de destaque, escala 1 e 1,3).
// Uso: node tests/e2e/v162-inicio.mjs   (capturas em tests/e2e/screens/v162-inicio-*.png)

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
  upNext: ["w1", "w2"], pageGoals: { 2026: 5000 },
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
    {
      ...base, id: 'r4', title: 'Duna (audiolivro)', authors: 'Frank Herbert', status: 'lendo', format: 'audio', durationMin: 1260, currentMin: 400,
      startDate: '2026-10-05', journal: [],
    },
    {
      ...base, id: 'r5', title: 'Extraordinariamente Incompreensivelmente', authors: '', status: 'lendo', pages: 500, currentPage: 160,
      startDate: '2026-10-06', journal: [],
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
  await page.screenshot({ path: join(SHOTS, `v162-inicio-${name}.png`), fullPage: full });
};

const SESSION = JSON.stringify({ bookId: 'r1', startedAt: new Date(NIGHT).getTime() - 600000, pausedAt: null, pausedMs: 0 });

// Seis livros sem imagem, com títulos em sequência: a grade do Início tem de mostrar ornamentos variados.
const seqSeed = {
  ...seed,
  books: [
    ...Array.from({ length: 6 }, (_, i) => read(`s${i}`, `Leitura ${i + 3}`, 'Autora Comum', `2026-0${i + 1}-15`)),
    ...seed.books.filter((b) => b.status !== 'lido'),
  ],
};

const setScale = (page, s) => page.evaluate((v) => {
  const st = document.documentElement.style;
  st.setProperty('--type-scale', String(v));
  st.setProperty('--type-scale-ui', String(Math.min(v, 1.3)));
  st.setProperty('--type-scale-nav', String(Math.min(v, 1.2)));
  st.setProperty('--type-scale-lg', String(1 + (v - 1) * 0.5));
}, s);

const boxOf = (page, sel) => page.evaluate((s) => {
  const el = document.querySelector(s);
  if (!el) return null;
  const r = el.getBoundingClientRect();
  return { x: r.x, y: r.y, w: r.width, h: r.height, r: r.right, b: r.bottom };
}, sel);
const hit = (a, b) => a.x < b.r && b.x < a.r && a.y < b.b && b.y < a.b;

try {
  // ---------- 1. Capa pequena do "Lendo agora": só iniciais; o anel nunca cobre texto ----------
  step('Lendo agora: capa só com iniciais, anel de % ≥ 36px fora das iniciais (320/390/430, claro/escuro, escala 1,3)');
  for (const scheme of ['dark', 'light']) {
    for (const width of [320, 390, 430]) {
      for (const scale of [1, 1.3]) {
        const { context, page } = await newPage({ scheme, width, reducedMotion: 'reduce', dsf: 1 });
        await setScale(page, scale);
        await page.waitForTimeout(250);
        const cards = await page.$$eval('#app .card.reading', (els) => els.map((c) => c.dataset.id));
        assert.deepEqual(cards, ['r1', 'r2', 'r3', 'r4', 'r5']);
        for (const id of cards) {
          const sel = `#app .reading[data-id="${id}"]`;
          const info = await page.evaluate((s) => {
            const c = document.querySelector(s);
            const cv = c.querySelector('.rn-cover .cover');
            return {
              text: cv.querySelectorAll('.cover-title, .cover-author').length,
              ini: cv.querySelector('.cover-ini')?.textContent || '',
              ring: c.querySelector('.cov-ring')?.textContent.replace(/\s/g, '') || '',
            };
          }, sel);
          assert.equal(info.text, 0, `${id}: capa pequena sem título/autor`);
          assert.ok(info.ini.length >= 1 && info.ini.length <= 2, `${id}: iniciais "${info.ini}"`);
          if (id === 'r2') {
            assert.equal(info.ring, '', 'sem total de páginas, sem anel');
            continue;
          }
          assert.match(info.ring, /^\d+%$/, `${id}: anel com a unidade %`);
          const ring = await boxOf(page, `${sel} .cov-ring`);
          const ini = await boxOf(page, `${sel} .cover-ini`);
          const card = await boxOf(page, sel);
          assert.ok(ring.w >= 36 && ring.h >= 36, `${id}: anel ${ring.w}×${ring.h}`);
          assert.ok(!hit(ring, ini), `${id}: o anel cobre as iniciais em ${width}px`);
          assert.ok(ring.r <= card.r && ring.b <= card.b + 0.5, `${id}: anel cortado pelo cartão`);
        }
        assert.ok((await overflow(page)) <= 0, `Início sobrando em ${width}px`);
        if (width === 390 && scale === 1) {
          await page.evaluate(() => document.querySelector('#app .reading[data-id="r4"]').scrollIntoView({ block: 'center' }));
          await shotTo(page, `lendo-${scheme}-390`);
        }
        if (width === 320 && scale === 1.3 && scheme === 'light') {
          await page.evaluate(() => document.querySelector('#app .reading[data-id="r5"]').scrollIntoView({ block: 'center' }));
          await shotTo(page, 'lendo-320-1.3');
        }
        await context.close();
      }
    }
  }

  // ---------- 2 e 3. Dois tratamentos de cartão; Quero ler com ícone ----------
  step('Início: cartão de destaque × linha de lista (borda contínua), aviso do cronômetro sem contorno colorido, ícones de 44px');
  for (const [scheme, accent] of [['dark', 'terracota'], ['light', 'petroleo'], ['dark', 'vinho']]) {
    for (const width of [320, 390, 430]) {
      const { context, page } = await newPage({ scheme, accent, width, reducedMotion: 'reduce', dsf: 1 });
      await page.evaluate((s) => localStorage.setItem('leituras:sessao', s), SESSION);
      await page.reload();
      await page.waitForSelector('#app[data-page="inicio"] .timer-banner');
      await page.waitForTimeout(300);
      const look = (sel) => page.evaluate((s) => {
        const cs = getComputedStyle(document.querySelector(s));
        return { style: cs.borderTopStyle, w: cs.borderTopWidth, color: cs.borderTopColor, radius: cs.borderTopLeftRadius, bg: cs.backgroundColor };
      }, sel);
      const hero = [await look('.bento-ring'), await look('.bento .tile:not(.bento-ring)'), await look('.card.reading')];
      for (const h of hero) {
        assert.equal(h.style, 'solid');
        assert.equal(h.w, '1px');
        assert.equal(h.radius, '24px');
        assert.equal(h.color, hero[0].color, 'mesma borda nos cartões de destaque');
      }
      const rows = [await look('.timer-banner'), await look('.teaser:not(.sug-teaser)'), await look('.sug-teaser')];
      for (const r of rows) {
        assert.equal(r.style, 'solid', 'linha de lista sem tracejado');
        assert.equal(r.w, '1px');
        assert.equal(r.color, rows[0].color, 'mesma borda nas linhas');
        assert.equal(r.radius, rows[0].radius);
        assert.equal(r.bg, rows[0].bg);
      }
      assert.equal(rows[0].color, hero[0].color, 'linha e cartão com a mesma cor de borda (nada de contorno colorido)');
      // Aviso do cronômetro: bolinha de destaque + "Voltar".
      assert.ok(await boxOf(page, '.timer-banner .timer-dot'));
      assert.equal((await page.textContent('.timer-banner-go')).trim(), 'Voltar');
      const go = await boxOf(page, '.timer-banner-go');
      assert.ok(go.h >= 44 - 0.5, `"Voltar" com ${go.h}px de altura`);
      // Quero ler e "O que ler a seguir": mesma caixa de ícone de 44px, sem pilha de capas.
      const q = await boxOf(page, '.teaser:not(.sug-teaser) .teaser-plus');
      const s = await boxOf(page, '.sug-teaser .teaser-plus');
      assert.deepEqual([q.w, q.h, s.w, s.h], [44, 44, 44, 44]);
      assert.equal(await page.locator('.teaser .cover, .teaser .stack').count(), 0, 'sem iniciais ilegíveis na linha Quero ler');
      assert.equal(await page.locator('.teaser:not(.sug-teaser) .teaser-plus svg').count(), 1);
      assert.match(await page.textContent('.teaser:not(.sug-teaser) .teaser-text'), /Quero ler\s*3 livros na fila/);
      for (const sel of ['.timer-banner', '.teaser:not(.sug-teaser)', '.sug-teaser']) {
        assert.ok((await boxOf(page, sel)).h >= 44, `${sel} com menos de 44px`);
      }
      assert.ok((await overflow(page)) <= 0);
      if (width !== 430) {
        await page.evaluate(() => scrollTo(0, 0));
        await shotTo(page, `topo-${accent}-${scheme}-${width}`);
        await page.evaluate(() => scrollTo(0, document.body.scrollHeight));
        await shotTo(page, `pe-${accent}-${scheme}-${width}`);
      }
      await context.close();
    }
  }

  // ---------- 4. Cartão de páginas: valor + legenda + barra (+ uma linha discreta) ----------
  step('Números: cada bloco com valor e uma legenda; páginas sem "ritmo" dentro da barra, numa única linha final');
  for (const width of [320, 390, 430]) {
    const { context, page } = await newPage({ scheme: 'dark', width, reducedMotion: 'reduce', dsf: 1 });
    const parts = await page.$$eval('.bento-pages > *', (els) => els.map((e) => e.className));
    assert.deepEqual(parts, ['tile-value', 'tile-label', 'hero-pages', 'bento-note']);
    assert.equal(await page.locator('.bento-pages .hero-pages-text').count(), 0);
    assert.match(await page.textContent('.bento-pages .tile-label'), /^de 5\.000 págs\.$/);
    assert.match(await page.textContent('.bento-pages .bento-note'), /^ritmo ~[\d.]+$|^ritmo ~[\d.]+\s*·?\s*[\d,]+ h ouvidas$/);
    for (const sel of ['.bento .tile:nth-child(3)', '.bento .tile:nth-child(4)']) {
      assert.deepEqual(await page.$$eval(`${sel} > *`, (els) => els.map((e) => e.className.split(' ')[0])), ['tile-value', 'tile-label']);
    }
    const tiles = await page.$$eval('.bento > .tile:not(.bento-ring)', (els) => els.map((e) => e.getBoundingClientRect().width));
    assert.ok(tiles.every((w) => Math.abs(w - tiles[0]) < 1), 'tiles da coluna com a mesma largura');
    if (width === 320) {
      await setScale(page, 1.3);
      await page.waitForTimeout(250);
      assert.ok((await overflow(page)) <= 0);
      await page.evaluate(() => scrollTo(0, 0));
      await shotTo(page, 'numeros-320-1.3');
    }
    await context.close();
  }

  // ---------- 5. Capas desenhadas variadas ----------
  step('Capas desenhadas: títulos em sequência não repetem o mesmo ornamento (grade do Início)');
  for (const scheme of ['dark', 'light']) {
    const { context, page } = await newPage({ scheme, data: seqSeed, reducedMotion: 'reduce', dsf: 2 });
    const decos = await page.$$eval('#app .book-grid .cover', (els) => els.map((e) => (e.className.match(/cover-d(\d)/) || [])[1]));
    assert.equal(decos.length, 6);
    assert.ok(new Set(decos).size >= 4, `ornamentos ${decos}`);
    const again = await page.$$eval('#app .book-grid .cover', (els) => els.map((e) => (e.className.match(/cover-d(\d)/) || [])[1]));
    assert.deepEqual(again, decos, 'determinístico');
    await page.evaluate(() => document.querySelector('#app .book-grid').scrollIntoView({ block: 'center' }));
    await shotTo(page, `capas-${scheme}`);
    await context.close();
  }

  assert.deepEqual(errors, [], `erros no console:\n${errors.join('\n')}`);
  console.log('\nTudo certo. Capturas em tests/e2e/screens/v162-inicio-*.png');
} catch (err) {
  console.error(`\nFALHOU: ${err.message}`);
  if (errors.length) console.error(errors.join('\n'));
  process.exitCode = 1;
} finally {
  await browser.close();
  server.close();
}
