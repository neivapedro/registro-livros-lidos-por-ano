// QA da 1.5: o que as quatro partes fazem juntas. Cada cor de destaque × tema (Início,
// Estante em Lombadas, ficha com a capa desfocada, Ajustes com as cores) em 390px; contraste do
// texto no botão tonal, no véu da capa, no link do total de páginas e na marca das abas; a festa
// ao concluir em cada cor (confete com cores que valem também sem color-mix, iOS 16.0/16.1);
// alternativas sem color-mix; lombadas com 0, 1 e 200 livros; marca das abas depois de trocas
// rápidas e de girar o celular; nada sobrando nas larguras de iPhone (320, 375, 390, 430).
// Uso: node tests/e2e/qa-v15.mjs   (capturas em tests/e2e/screens/qa-v15-*.png)

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

try {
  // ---------- Varredura: cada cor × tema ----------
  step('cada cor × tema: Início, Lombadas, ficha com a capa desfocada e Ajustes; contraste do texto');
  const low = [];
  const need = (value, min, what) => {
    if (!(value >= min)) low.push(`${what}: ${value.toFixed(2)} (mín. ${min})`);
  };
  for (const scheme of ['dark', 'light']) {
    for (const accent of ACCENTS) {
      const { context, page } = await newPage({ scheme, accent, reducedMotion: 'reduce', dsf: 1 });
      const tag = `${accent}-${scheme === 'dark' ? 'escuro' : 'claro'}`;
      assert.equal(await page.evaluate(() => document.documentElement.dataset.accent), accent);
      await page.waitForFunction(() => document.querySelectorAll('#app .card.reading[data-tint-src="capa"]').length === 2);
      await page.waitForTimeout(700); // o véu da capa entra em 0,6 s
      await shot(page, `inicio-${tag}`);
      need(await textContrast(page, '.greet-name'), 3, `${tag} nome na saudação`);
      need(await textContrast(page, '#app .reading:nth-of-type(1) .rn-main'), 4.5, `${tag} botão cheio`);
      for (const id of ['r2', 'r3']) need(await textContrast(page, `#app .reading[data-id="${id}"] .rn-main`), 4.5, `${tag} botão tonal (${id})`);
      need(await textContrast(page, '#app .reading[data-id="r2"] .pages-ask'), 4.5, `${tag} link do total de páginas`);
      await page.evaluate(() => document.querySelector('#app .reading[data-id="r2"]').scrollIntoView({ block: 'center' }));
      await shot(page, `inicio-cartoes-${tag}`);

      await go(page, '#/estante?aba=quero', 'estante');
      await page.click('[data-action="shelf-mode"][data-value="lombadas"]');
      await page.waitForSelector('.spine-shelf .next-pos');
      need(await textContrast(page, '.spine-shelf .next-pos'), 4.5, `${tag} posição na fila (lombada)`);
      need(await textContrast(page, '.shelf-modes .mini-seg-btn.is-on .mini-seg-label'), 4.5, `${tag} modo marcado`);
      await go(page, '#/estante?aba=lido', 'estante');
      await page.waitForSelector('.spine-shelf');
      await shot(page, `lombadas-${tag}`);
      // Título e iniciais de toda lombada legíveis (a cor vem da capa, não do destaque).
      const spines = await page.$$eval('.spine', (els) => els.map((el) => el.dataset.id));
      for (const id of spines) need(await textContrast(page, `.spine[data-id="${id}"] .sp-title`), 4.5, `${tag} lombada ${id}`);

      for (const id of ['a6', 'a5', 'a3']) {
        await go(page, `#/livro/${id}`, 'livro');
        await page.waitForSelector('.ficha-backdrop-img.is-loaded');
        await page.waitForTimeout(500); // o fundo aparece em 0,45 s
        if (id === 'a6') await shot(page, `ficha-${tag}`);
        need(await textContrast(page, '.ficha-hero .ficha-status'), 4.5, `${tag} selo da ficha (${id})`);
        need(await textContrast(page, '.ficha-hero .ficha-author'), 4.5, `${tag} autor na ficha (${id})`);
        need(await textContrast(page, '.ficha-top .btn-text.accent'), 4.5, `${tag} Editar (${id})`);
      }
      await go(page, '#/livro/a6', 'livro');
      need(await textContrast(page, '.ficha-quote .quote-page'), 4.5, `${tag} página do trecho`);

      await go(page, '#/ajustes', 'ajustes');
      await page.evaluate(() => document.querySelector('.accent-pick').scrollIntoView({ block: 'center' }));
      need(await textContrast(page, '.theme-seg .seg-btn.is-on'), 4.5, `${tag} tema marcado`);
      need(await textContrast(page, '.accent-sw.is-on .accent-name'), 4.5, `${tag} nome da cor`);
      await shot(page, `ajustes-${tag}`);
      await context.close();
    }
  }
  assert.deepEqual(low, [], `contraste baixo:\n${low.join('\n')}`);

  // ---------- Grão de papel x vidro e capa desfocada ----------
  step('claro: o ano preso no alto da Estante e o pé da ficha não fazem faixa lisa no grão');
  {
    const many = { ...seed, books: [...seed.books, ...Array.from({ length: 14 }, (_, i) => read(`x${i}`, `Livro ${i}`, 'Autor', `2025-0${(i % 9) + 1}-10`))] };
    const { context, page } = await newPage({ scheme: 'light', data: many, reducedMotion: 'reduce' });
    await go(page, '#/estante?aba=lido', 'estante');
    // Rola até o cabeçalho de 2025 ficar preso, com a lista dele passando por baixo.
    await page.evaluate(() => scrollTo(0, document.querySelectorAll('.group-head')[1].getBoundingClientRect().top + scrollY + 240));
    await page.waitForTimeout(300);
    // O cabeçalho que está de fato preso (no "top" dele), não o que está saindo empurrado.
    const head = await page.evaluate(() => [...document.querySelectorAll('.group-head')]
      .map((h) => ({ r: h.getBoundingClientRect().toJSON(), top: parseFloat(getComputedStyle(h).top) }))
      .find(({ r, top }) => Math.abs(r.top - top) < 1 && r.bottom > 0 && r.top < 200)?.r);
    assert.ok(head, 'um cabeçalho de ano preso no alto');
    await shot(page, 'grao-ano-preso-claro');
    // Faixa à direita do cabeçalho (sem texto) e o fundo logo abaixo, na margem (sem cartões).
    const inside = await strip(page, { x: 300, y: Math.round(head.top + 4), width: 80, height: Math.round(head.height - 8) });
    const outside = await strip(page, { x: 2, y: Math.round(head.bottom + 4), width: 12, height: 120 });
    assert.ok(Math.abs(inside.mean - outside.mean) < 4, `tom do cabeçalho preso ${inside.mean.toFixed(1)} x fundo ${outside.mean.toFixed(1)}`);
    assert.ok(inside.sd > outside.sd * 0.5, `cabeçalho preso sem grão: desvio ${inside.sd.toFixed(2)} x ${outside.sd.toFixed(2)}`);

    await go(page, '#/livro/a6', 'livro');
    await page.waitForSelector('.ficha-backdrop-img.is-loaded');
    await page.waitForTimeout(600);
    const bottom = await page.evaluate(() => document.querySelector('.ficha-hero').getBoundingClientRect().bottom);
    const above = await strip(page, { x: 1, y: Math.round(bottom - 14), width: 10, height: 12 });
    const below = await strip(page, { x: 1, y: Math.round(bottom + 2), width: 10, height: 12 });
    assert.ok(Math.abs(above.mean - below.mean) < 4, `pé da ficha: tom ${above.mean.toFixed(1)} x ${below.mean.toFixed(1)}`);
    assert.ok(above.sd > below.sd * 0.5, `pé da ficha sem grão (emenda): desvio ${above.sd.toFixed(2)} x ${below.sd.toFixed(2)}`);
    await context.close();
  }

  // ---------- iOS 16.0/16.1: sem color-mix() ----------
  step('sem color-mix (iOS 16.0/16.1): bolinhas das cores, cartões, botão tonal, ficha e mapa continuam visíveis');
  for (const scheme of ['light', 'dark']) {
    const { context, page } = await newPage({ scheme, accent: 'oliva', reducedMotion: 'reduce', dsf: 1 });
    await withoutColorMix(page);
    assert.equal(await page.evaluate(() => CSS.supports('color', 'color-mixx(in srgb, red, red)')), false);
    const tag = scheme === 'light' ? 'claro' : 'escuro';
    await page.waitForTimeout(400);
    const home = await page.evaluate(() => {
      const cs = (sel) => getComputedStyle(document.querySelector(sel));
      return {
        tonal: cs('#app .reading[data-id="r2"] .btn-tonal').backgroundColor,
        nav: cs('#nav').backgroundColor,
        card: cs('#app .reading[data-id="r2"]').backgroundImage,
        heat: ['--heat-1', '--heat-2', '--heat-3', '--surface-warm', '--bar-partial', '--skel'].map((v) => getComputedStyle(document.documentElement).getPropertyValue(v)),
      };
    });
    assert.ok(!transparent(home.tonal), `botão tonal sem fundo (${home.tonal})`);
    assert.ok(!transparent(home.nav), `barra de baixo transparente sobre o texto (${home.nav})`);
    assert.notEqual(home.card, 'none', 'cartão "Lendo agora" sem fundo');
    for (const v of home.heat) assert.doesNotMatch(v, /color-mix/, `token ainda com color-mix: ${v}`);
    await shot(page, `sem-color-mix-inicio-${tag}`);
    await go(page, '#/livro/a6', 'livro');
    assert.equal(await page.evaluate(() => getComputedStyle(document.querySelector('.ficha-backdrop')).display), 'none', 'sem o véu, a capa desfocada não aparece');
    await shot(page, `sem-color-mix-ficha-${tag}`);
    await go(page, '#/ajustes', 'ajustes');
    await page.evaluate(() => document.querySelector('.accent-pick').scrollIntoView({ block: 'center' }));
    const dots = await page.$$eval('.accent-dot', (els) => els.map((el) => getComputedStyle(el).backgroundColor));
    for (const c of dots) assert.ok(!transparent(c), `bolinha de cor vazia (${c})`);
    assert.equal(new Set(dots).size, 5, 'cinco cores diferentes');
    await shot(page, `sem-color-mix-ajustes-${tag}`);
    await context.close();
  }

  // ---------- Festa ao concluir, em cada cor ----------
  step('festa ao concluir em cada cor: confete com cores simples (rgb, sem color-mix), uma vez só');
  for (const [i, accent] of ACCENTS.entries()) {
    const scheme = i % 2 ? 'light' : 'dark';
    const { context, page } = await newPage({ scheme, accent });
    await page.waitForFunction(() => document.querySelector('.ring-count')?.textContent === '8');
    await go(page, '#/livro/r1/editar?concluir=1', 'livro');
    await page.waitForSelector('.form-actions .btn-primary');
    await page.click('.form-actions .btn-primary');
    await onPage(page, 'inicio');
    await page.waitForSelector('.confetti i', { timeout: 4000 });
    await page.waitForTimeout(150);
    await page.evaluate(() => document.getAnimations().forEach((a) => a.pause()));
    await shot(page, `festa-${accent}-${scheme === 'dark' ? 'escuro' : 'claro'}`);
    const bits = await page.$$eval('.confetti i', (els) => els.map((el) => ({ inline: el.style.background, color: getComputedStyle(el).backgroundColor })));
    await page.evaluate(() => document.getAnimations().forEach((a) => a.play()));
    const accentRgb = await page.evaluate(() => {
      const ctx = document.createElement('canvas').getContext('2d');
      ctx.fillStyle = getComputedStyle(document.getElementById('app')).getPropertyValue('--accent').trim();
      ctx.fillRect(0, 0, 1, 1);
      const [r, g, b] = ctx.getImageData(0, 0, 1, 1).data;
      return `rgb(${r}, ${g}, ${b})`;
    });
    assert.ok(bits.length >= 16);
    for (const b of bits) {
      assert.doesNotMatch(b.inline, /color-mix/, 'confete sem color-mix (iOS 16.0/16.1)');
      assert.ok(!transparent(b.color), `peça de confete sem cor (${b.inline})`);
    }
    assert.equal(bits[0].color, accentRgb, 'a primeira cor do confete é o destaque escolhido');
    await page.waitForSelector('.confetti', { state: 'detached', timeout: 4000 });
    assert.equal(await page.textContent('.ring-count'), '9');
    await context.close();
  }

  step('festa: sair do Início no meio dela não deixa nada para trás nem dá erro');
  {
    const { context, page } = await newPage({ accent: 'vinho' });
    await page.waitForFunction(() => document.querySelector('.ring-count')?.textContent === '8');
    await go(page, '#/livro/r1/editar?concluir=1', 'livro');
    await page.waitForSelector('.form-actions .btn-primary');
    await page.click('.form-actions .btn-primary');
    await onPage(page, 'inicio');
    await page.waitForSelector('.grid-cover.is-celebrated', { timeout: 3000 });
    await page.click('[data-nav="estante"]');
    await onPage(page, 'estante');
    await page.waitForTimeout(2600);
    assert.equal(await page.locator('.confetti, .is-celebrated').count(), 0);
    await page.click('[data-nav="inicio"]');
    await onPage(page, 'inicio');
    await page.waitForTimeout(1200);
    assert.equal(await page.locator('.confetti, .is-celebrated').count(), 0, 'a festa não volta');
    await context.close();
  }

  // ---------- Telas vazias ----------
  step('telas vazias ilustradas nas cores; a busca sem resultado não pisca o desenho a cada letra');
  {
    const { context, page } = await newPage({ scheme: 'light', accent: 'petroleo' });
    await go(page, '#/estante?aba=abandonado', 'estante');
    await page.waitForSelector('.empty.has-art[data-empty="abandonado"]');
    await shot(page, 'vazio-abandonei-petroleo-claro');
    await go(page, '#/buscar', 'buscar');
    const box = page.locator('[data-filter="q"]');
    await box.click();
    await box.pressSequentially('zzq', { delay: 60 });
    await page.waitForSelector('.empty.has-art[data-empty="nada"]');
    await box.pressSequentially('x', { delay: 30 });
    const steady = await page.evaluate(() => {
      const el = document.querySelector('.empty.has-art[data-empty="nada"]');
      return { cls: el.classList.contains('is-steady'), anims: el.getAnimations().length, focus: document.activeElement?.dataset.filter };
    });
    assert.equal(steady.cls, true, 'a mesma tela vazia continua parada');
    assert.equal(steady.anims, 0, 'sem refazer a animação de entrada');
    assert.equal(steady.focus, 'q', 'o campo continua com o foco');
    await page.waitForTimeout(500);
    await shot(page, 'vazio-busca-petroleo-claro');
    await context.close();
  }
  {
    const { context, page } = await newPage({ scheme: 'dark', accent: 'vinho' });
    await go(page, '#/livro/w1?aba=trechos', 'livro');
    await page.waitForSelector('.empty.has-art[data-empty="trechos"]');
    await page.evaluate(() => document.querySelector('.empty.has-art').scrollIntoView({ block: 'center' }));
    await shot(page, 'vazio-trechos-vinho-escuro');
    await context.close();
  }

  // ---------- Lombadas: 0, 1 e 200 livros; larguras ----------
  step('Lombadas com 0, 1 e 200 livros; cores das capas só perto da tela; nada sobrando de 320 a 430px');
  {
    const one = { ...seed, upNext: [], books: [read('u1', 'Um livro só com um título bem comprido que não cabe na lombada inteira', '', '2026-05-05', { pages: 20 })] };
    const { context, page } = await newPage({ data: one, accent: 'grafite', hash: '#/estante?aba=lido' });
    await onPage(page, 'estante');
    await page.click('[data-action="shelf-mode"][data-value="lombadas"]');
    await page.waitForSelector('.spine-shelf .spine');
    assert.equal(await page.locator('.spine').count(), 1);
    await go(page, '#/estante?aba=abandonado', 'estante');
    assert.equal(await page.locator('.spine-shelf').count(), 0, 'sem livros, sem prateleira vazia');
    assert.equal(await page.locator('.empty.has-art').count(), 1);
    for (const width of [320, 375, 390, 430]) {
      await page.setViewportSize({ width, height: 844 });
      await go(page, '#/estante?aba=lido', 'estante');
      assert.ok(await overflow(page) <= 0, `Lombadas sobrando em ${width}px`);
      const title = await page.evaluate(() => {
        const t = document.querySelector('.sp-title');
        const s = document.querySelector('.spine').getBoundingClientRect();
        const r = t.getBoundingClientRect();
        return { inside: r.top >= s.top - 1 && r.bottom <= s.bottom + 1 && r.left >= s.left - 1 && r.right <= s.right + 1 };
      });
      assert.ok(title.inside, `título fora da lombada em ${width}px`);
    }
    await context.close();
  }
  {
    // 200 lidos, cada um com uma capa de cor própria.
    const books = Array.from({ length: 200 }, (_, i) => read(`b${i}`, `Livro número ${i + 1}`, `Autor ${i}`, `2026-${String((i % 9) + 1).padStart(2, '0')}-${String((i % 27) + 1).padStart(2, '0')}`, {
      pages: 80 + ((i * 37) % 900), cover: pngCover([(i * 53) % 256, (i * 97) % 256, (i * 151) % 256], [40, 40, 40], 8, 12),
    }));
    const { context, page } = await newPage({ data: { ...seed, upNext: [], books }, hash: '#/estante?aba=lido' });
    await onPage(page, 'estante');
    const t0 = Date.now();
    await page.click('[data-action="shelf-mode"][data-value="lombadas"]');
    await page.waitForSelector('.spine-shelf .spine');
    const took = Date.now() - t0;
    assert.equal(await page.locator('.spine').count(), 200);
    assert.ok(took < 3000, `200 lombadas em ${took} ms`);
    await page.waitForTimeout(800);
    const look = await page.evaluate(() => {
      const all = [...document.querySelectorAll('.spine[data-spine]')];
      const first = all[0];
      const last = all[all.length - 1];
      return {
        firstPainted: first.style.getPropertyValue('--sp-bg'),
        lastBefore: last.style.getPropertyValue('--sp-bg'),
        lastId: last.dataset.id,
        lastTop: last.getBoundingClientRect().top - innerHeight,
      };
    });
    assert.ok(look.lastTop > 1500, 'a última lombada está bem abaixo da tela');
    const initial = await page.evaluate(async (id) => {
      const { spineLook } = await import('/js/spines.js');
      return { last: spineLook((await (await import('/js/db.js')).getItem('state')).books.find((b) => b.id === id)).bg };
    }, look.lastId);
    assert.equal(look.lastBefore, initial.last, 'longe da tela, a lombada ainda não leu a capa');
    await page.evaluate((id) => document.querySelector(`.spine[data-id="${id}"]`).scrollIntoView({ block: 'center' }), look.lastId);
    await page.waitForFunction(([id, before]) => document.querySelector(`.spine[data-id="${id}"]`).style.getPropertyValue('--sp-bg') !== before, [look.lastId, look.lastBefore], { timeout: 4000 });
    await shot(page, 'lombadas-200-escuro');
    assert.ok(await overflow(page) <= 0);
    await context.close();
  }

  step('Lombadas: tocar e segurar numa lombada abre o menu rápido (e não abre o livro)');
  {
    const { context, page } = await newPage({ accent: 'vinho', hash: '#/estante?aba=quero' });
    await onPage(page, 'estante');
    await page.click('[data-action="shelf-mode"][data-value="lombadas"]');
    const box = await page.locator('.spine[data-id="w3"]').boundingBox();
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.waitForTimeout(650);
    await page.mouse.up();
    await page.waitForSelector('.sheet-layer.is-open .qm-list');
    assert.match(await page.textContent('.sheet-layer.is-open'), /Karamázov/);
    assert.equal(await page.evaluate(() => document.getElementById('app').dataset.page), 'estante', 'segurar não abre o livro');
    await shot(page, 'lombadas-menu-vinho-escuro');
    await context.close();
  }

  // ---------- Marca das abas ----------
  step('marca das abas: certa depois de trocas rápidas e de girar o celular');
  {
    const { context, page } = await newPage({ accent: 'oliva', hash: '#/estante?aba=quero' });
    await onPage(page, 'estante');
    const tabs = ['lendo', 'lido', 'abandonado', 'quero', 'lido'];
    for (const t of tabs) await page.click(`.shelf-tabs a[href="#/estante?aba=${t}"]`);
    for (const m of ['capas', 'lombadas', 'lista', 'lombadas']) await page.click(`[data-action="shelf-mode"][data-value="${m}"]`);
    const settle = () => page.waitForFunction(() => document.querySelectorAll('.tab-ind').length >= 2
      && document.getAnimations().filter((a) => a.effect?.target?.classList?.contains('tab-ind')).every((a) => a.playState !== 'running'));
    const aligned = () => page.evaluate(() => [...document.querySelectorAll('.has-ind')].map((ctrl) => {
      const ind = ctrl.querySelector(':scope > .tab-ind').getBoundingClientRect();
      const on = ctrl.querySelector(':scope > .is-on').getBoundingClientRect();
      return Math.max(Math.abs(ind.left - on.left), Math.abs(ind.width - on.width), Math.abs(ind.top - on.top));
    }));
    await settle();
    await page.waitForTimeout(450);
    for (const d of await aligned()) assert.ok(d < 1.5, `marca fora do lugar (${d}px)`);
    assert.equal(await page.textContent('.shelf-tabs .is-on'), (await page.textContent('.shelf-tabs a[href="#/estante?aba=lido"]')));
    await page.setViewportSize({ width: 844, height: 390 });
    await page.waitForTimeout(500);
    for (const d of await aligned()) assert.ok(d < 1.5, `marca fora do lugar depois de girar (${d}px)`);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.waitForTimeout(500);
    for (const d of await aligned()) assert.ok(d < 1.5, `marca fora do lugar ao voltar (${d}px)`);
    await shot(page, 'abas-oliva-escuro');
    await context.close();
  }

  // ---------- Nada correndo sem parar ----------
  step('nada animando sem parar nas telas paradas (Início, Estante, ficha, formulário)');
  {
    const { context, page } = await newPage({ accent: 'petroleo' });
    for (const [hash, name] of [['#/inicio', 'inicio'], ['#/estante?aba=lido', 'estante'], ['#/livro/a6', 'livro'], ['#/livro/a6/editar', 'livro']]) {
      await go(page, hash, name);
      await page.waitForTimeout(2500);
      const running = await page.evaluate(() => document.getAnimations()
        .filter((a) => a.playState === 'running')
        .map((a) => `${a.animationName || a.constructor.name} em ${a.effect?.target?.className?.baseVal ?? a.effect?.target?.className}`));
      assert.deepEqual(running, [], `animação sem fim em ${hash}`);
    }
    await context.close();
  }

  // ---------- Cor guardada, nome e larguras ----------
  step('cor guardada inválida vira Terracota antes do CSS; a escolha vale depois de reabrir; fora do backup');
  {
    const { context, page } = await newPage({ accent: 'vinho' });
    await page.evaluate(() => localStorage.setItem('leituras:acento', '"><img src=x onerror=alert(1)>'));
    await page.reload();
    await page.waitForSelector('#app[data-page="inicio"]');
    assert.equal(await page.evaluate(() => document.documentElement.dataset.accent), 'terracota');
    await go(page, '#/ajustes', 'ajustes');
    await page.click('.accent-sw[data-value="grafite"]');
    await page.reload();
    await page.waitForSelector('#app[data-page]');
    assert.equal(await page.evaluate(() => document.documentElement.dataset.accent), 'grafite');
    const backup = await page.evaluate(async () => (await import('/js/store.js')).serializeBackup((await (await import('/js/db.js')).getItem('state'))));
    assert.doesNotMatch(String(backup), /grafite|leituras:acento|Karoline/, 'cor e nome fora do backup');
    await context.close();
  }

  step('nome com emoji de várias partes (👩‍💻) fica inteiro na saudação');
  {
    const { context, page } = await newPage({ name: null, hash: '#/ajustes' });
    await onPage(page, 'ajustes');
    await page.fill('#set-name', 'Ana 👩‍💻');
    await page.locator('#set-name').press('Enter');
    await go(page, '#/inicio', 'inicio');
    assert.equal(await page.textContent('.greet-name'), 'Ana 👩‍💻');
    await context.close();
  }

  step('nada sobrando de lado em 320, 375, 390 e 430px (Início, Lombadas da fila, ficha, Ajustes)');
  for (const width of [320, 375, 390, 430]) {
    const { context, page } = await newPage({ width, scheme: width % 2 ? 'light' : 'dark', accent: ACCENTS[width % 5], name: 'Maria Eduarda Albuquerque' });
    const pages = [['#/inicio', 'inicio'], ['#/estante?aba=quero', 'estante'], ['#/livro/a5', 'livro'], ['#/ajustes', 'ajustes']];
    for (const [hash, name] of pages) {
      await go(page, hash, name);
      if (name === 'estante') {
        await page.click('[data-action="shelf-mode"][data-value="lombadas"]');
        await page.waitForSelector('.spine-shelf');
        // Os três modos e o Sortear cabem numa linha só.
        const row = await page.evaluate(() => {
          const modes = document.querySelector('.shelf-modes').getBoundingClientRect();
          const draw = document.querySelector('.draw-open')?.getBoundingClientRect();
          return { same: !draw || Math.abs(draw.top - modes.top) < 12, right: Math.max(modes.right, draw?.right || 0) };
        });
        if (!(row.same && row.right <= width)) await shot(page, `debug-modos-${width}`);
        assert.ok(row.same && row.right <= width, `modos e Sortear em ${width}px: ${JSON.stringify(row)}`);
      }
      assert.ok(await overflow(page) <= 0, `${hash} sobrando em ${width}px`);
    }
    if (width === 320) {
      await go(page, '#/inicio', 'inicio');
      await shot(page, 'inicio-320');
      await go(page, '#/estante?aba=quero', 'estante');
      await shot(page, 'lombadas-fila-320');
    }
    await context.close();
  }

  assert.deepEqual(errors, [], `erros no console:\n${errors.join('\n')}`);
  console.log('\nTudo certo. Capturas em tests/e2e/screens/qa-v15-*.png');
} catch (err) {
  console.error(`\nFALHOU: ${err.message}`);
  if (errors.length) console.error(errors.join('\n'));
  process.exitCode = 1;
} finally {
  await browser.close();
  server.close();
}
