// 1.6.2: faixa da barra de status (sem cinza), títulos de seção da ficha padronizados, "Ver critérios"
// na linha da nota, "Instalar no celular" escondido no app instalado e legendas legíveis, em
// 320/390/430, claro e escuro, dois acentos e texto 1,3×. Capturas: tests/e2e/screens/v162-ficha-*.png
// Uso: node tests/e2e/v162-ficha.mjs   (precisa do Playwright, como o smoke.mjs)

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
const base = { authors: 'Autor', format: 'fisico', genre: 'Ficção', tags: [], quotes: [], journal: [], createdAt: TS, updatedAt: TS, favorite: false, notes: '', isbn: '' };
const seed = {
  version: 2, goals: { 2026: 12 }, defaultGoal: 12, customGenres: [], lastBackupAt: '2026-10-10T10:00:00.000Z', pageGoals: {}, upNext: [],
  books: [
    { ...base, id: 'c1', title: 'Hábitos Atômicos', authors: 'James Clear', pages: 320, status: 'lido', startDate: '2026-01-22', endDate: '2026-02-10', rating: 4.5, favorite: true,
      criteria: { personagens: 5, enredo: 4.5, escrita: 5, emocao: 4 }, moods: ['reflexivo', 'inspirador'], pace: 'medio',
      description: 'Pequenas mudanças, resultados notáveis: um método prático para criar bons hábitos e largar os maus, com ciência e exemplos do dia a dia.',
      notes: 'Sistemas > metas.', isbn: '9788550807560',
      journal: [
        { date: '2026-01-22', from: 0, to: 40, unit: 'page', note: '' },
        { date: '2026-01-25', from: 40, to: 90, unit: 'page', note: '' },
        { date: '2026-02-01', from: 90, to: 200, unit: 'page', note: '' },
      ],
      quotes: [{ id: 'q1', text: 'Você não sobe ao nível das suas metas.', page: 27, percent: null, note: '', createdAt: '2026-02-01T10:00:00.000Z' }] },
    { ...base, id: 'c3', title: 'Livro simples', pages: 200, status: 'lido', startDate: '2026-04-01', endDate: '2026-04-12', rating: 4 },
  ],
};

const browser = await playwright.chromium.launch();
const errors = [];
const step = (msg) => console.log(`• ${msg}`);
const shot = (page, name) => page.screenshot({ path: join(SHOTS, `v162-ficha-${name}.png`) });

async function newPage({ width = 390, scheme = 'dark', accent = null, scale = 1, standalone = false }) {
  const context = await browser.newContext({
    viewport: { width, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, locale: 'pt-BR', reducedMotion: 'reduce', colorScheme: scheme,
  });
  if (standalone) {
    await context.addInitScript(() => {
      Object.defineProperty(navigator, 'standalone', { get: () => true });
    });
  }
  const page = await context.newPage();
  await page.clock.setFixedTime(new Date('2026-10-16T12:00:00'));
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errors.push(`console: ${m.text()}`); });
  await page.route(/^https:\/\//, (r) => r.abort());
  await page.goto(BASE);
  await page.waitForFunction(() => document.getElementById('app').dataset.page);
  await page.evaluate(async ({ d, a }) => {
    await (await import('/js/db.js')).setItem('state', d);
    if (a) localStorage.setItem('leituras:acento', a); else localStorage.removeItem('leituras:acento');
  }, { d: seed, a: accent });
  page.__scale = scale;
  return page;
}
async function open(page, hash, name) {
  await page.evaluate((h) => history.replaceState(null, '', h), hash);
  await page.reload();
  await page.waitForFunction((n) => document.getElementById('app').dataset.page === n, name);
  if (page.__scale !== 1) {
    await page.evaluate((s) => {
      document.documentElement.style.setProperty('--type-scale', String(s));
      document.documentElement.style.setProperty('--type-scale-lg', String(s));
    }, page.__scale);
  }
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(80);
}
const noOverflow = async (page, label) => {
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth) <= 0, true, `${label}: rolagem horizontal`);
  const small = await page.evaluate(() => [...document.querySelectorAll('#app button, #app a, #app summary')]
    .filter((el) => el.offsetParent && el.getBoundingClientRect().height < 43.5).map((el) => el.outerHTML.slice(0, 80)));
  assert.deepEqual(small, [], `${label}: alvos < 44px`);
};

// Cor de pontos da captura (decodifica o PNG num canvas de outra página).
async function pixelsOf(buffer, points) {
  const p = await browser.newPage();
  const out = await p.evaluate(async ({ b64, pts }) => {
    const img = new Image();
    img.src = `data:image/png;base64,${b64}`;
    await img.decode();
    const c = document.createElement('canvas');
    c.width = img.width; c.height = img.height;
    const ctx = c.getContext('2d');
    ctx.drawImage(img, 0, 0);
    return pts.map(([x, y]) => [...ctx.getImageData(x, y, 1, 1).data].slice(0, 3));
  }, { b64: buffer.toString('base64'), pts: points });
  await p.close();
  return out;
}
const rgbOf = (css) => css.match(/[\d.]+/g).slice(0, 3).map(Number);
const lum = (rgb) => rgb.map((v) => { const s = v / 255; return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; }).reduce((a, v, i) => a + v * [0.2126, 0.7152, 0.0722][i], 0);
const contrast = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((m, n) => n - m); return (x + 0.05) / (y + 0.05); };

const combos = [
  { width: 320, scheme: 'light', accent: 'terracota', scale: 1 },
  { width: 390, scheme: 'dark', accent: 'petroleo', scale: 1 },
  { width: 430, scheme: 'light', accent: 'vinho', scale: 1 },
  { width: 320, scheme: 'dark', accent: 'terracota', scale: 1.3 },
  { width: 390, scheme: 'light', accent: 'petroleo', scale: 1.3 },
];

try {
  for (const combo of combos) {
    const tag = `${combo.width}-${combo.scheme}-${combo.accent}-${combo.scale}`;
    step(`ficha ${tag}`);
    const page = await newPage(combo);
    await open(page, '#/livro/c1', 'livro');

    // 2. Títulos de seção: todos fora do cartão, à esquerda, com o mesmo tamanho.
    const heads = await page.evaluate(() => ['Sinopse', 'Humor', 'Ritmo da leitura', 'Trechos', 'Anotações'].map((name) => {
      const h = [...document.querySelectorAll('#app section h2')].find((el) => el.textContent.trim() === name);
      if (!h) return { name, missing: true };
      const r = h.getBoundingClientRect();
      const card = h.closest('.rchart, .ficha-syn-card, .ficha-notes, .ficha-quote');
      return { name, left: Math.round(r.left), size: getComputedStyle(h).fontSize, weight: getComputedStyle(h).fontWeight, inCard: Boolean(card) };
    }));
    for (const h of heads) assert.ok(!h.missing, `título ${h.name} existe`);
    assert.ok(heads.every((h) => !h.inCard), 'nenhum título dentro de cartão');
    assert.equal(new Set(heads.map((h) => h.left)).size, 1, `títulos alinhados à esquerda: ${JSON.stringify(heads)}`);
    assert.equal(new Set(heads.map((h) => h.size)).size, 1, 'mesmo tamanho');
    assert.equal(new Set(heads.map((h) => h.weight)).size, 1, 'mesmo peso');
    assert.equal(await page.locator('.rchart-title').count(), 0, 'sem título dentro do cartão do ritmo');
    // "Ver diário" na linha do título, à direita, alvo ≥ 44px; "Ver todos" igual.
    const links = await page.evaluate(() => {
      const row = (txt) => [...document.querySelectorAll('.section-head')].find((s) => s.querySelector('h2')?.textContent.trim() === txt);
      return ['Ritmo da leitura', 'Trechos'].map((t) => {
        const s = row(t);
        const h = s.querySelector('h2').getBoundingClientRect();
        const a = s.querySelector('a.link').getBoundingClientRect();
        const sr = s.getBoundingClientRect();
        return { t, text: s.querySelector('a.link').textContent.trim(), right: Math.round(sr.right - a.right), h: a.height, after: a.left >= h.right - 1 };
      });
    });
    assert.equal(links[0].text, 'Ver diário (3)');
    assert.equal(links[1].text, 'Ver todos (1)');
    for (const l of links) {
      assert.ok(l.after && l.h >= 43.5, `${l.t}: link à direita e ≥44px`);
      assert.ok(l.right <= 10, `${l.t}: encostado à direita (${l.right})`);
    }
    assert.equal(await page.locator('.rchart .ficha-more').count(), 0, 'o link saiu do cartão');

    // 3. "Ver critérios": na linha das estrelas quando cabe, alvo ≥ 44px, recolhido.
    const wrap = page.locator('.ficha-crit-wrap');
    assert.equal(await wrap.evaluate((el) => el.open), false);
    assert.equal(await page.locator('.ficha-crit-toggle').innerText(), 'Ver critérios');
    const geo = await page.evaluate(() => {
      const t = document.querySelector('.ficha-crit-toggle').getBoundingClientRect();
      const s = document.querySelector('.ficha-stars').getBoundingClientRect();
      return { sameLine: Math.abs((t.top + t.height / 2) - (s.top + s.height / 2)) < 12, h: t.height, w: t.width };
    });
    assert.ok(geo.h >= 43.5 && geo.w >= 44, 'toggle ≥ 44px');
    if (combo.width >= 390 && combo.scale === 1) assert.ok(geo.sameLine, `Ver critérios na linha das estrelas (${tag})`);
    await noOverflow(page, `ficha ${tag}`);
    await shot(page, `${tag}-fechada`);
    await page.click('.ficha-crit-toggle');
    assert.equal(await wrap.evaluate((el) => el.open), true);
    assert.equal(await page.locator('.ficha-crit-toggle').innerText(), 'Ocultar critérios');
    assert.equal(await page.locator('.ficha-crit dt').count(), 4);
    assert.equal(await page.locator('.ficha-crit').isVisible(), true);
    await noOverflow(page, `ficha aberta ${tag}`);
    await shot(page, `${tag}-aberta`);
    await page.click('.ficha-crit-toggle');

    // 5. ISBN: muted, 12–13px (escalado), contraste AA.
    const isbn = await page.evaluate(() => {
      const cs = getComputedStyle(document.querySelector('.ficha-isbn'));
      return { size: parseFloat(cs.fontSize), color: cs.color, bg: getComputedStyle(document.body).backgroundColor };
    });
    assert.ok(isbn.size >= 12 * combo.scale - 0.6 && isbn.size <= 13.2 * combo.scale, `ISBN ${isbn.size}px`);
    assert.ok(contrast(rgbOf(isbn.color), rgbOf(isbn.bg)) >= 4.5, `ISBN contraste ${contrast(rgbOf(isbn.color), rgbOf(isbn.bg))}`);
    await page.locator('.ficha-isbn').scrollIntoViewIfNeeded();
    await shot(page, `${tag}-fim`);

    // Ficha sem diário: nada de bloco de ritmo.
    await open(page, '#/livro/c3', 'livro');
    assert.equal(await page.locator('.ficha-crit-wrap').count(), 0);
    assert.equal(await page.locator('.rchart').count(), 0);
    await page.context().close();
  }

  // 4. Ajustes: "Instalar no celular" aparece no navegador e some no app instalado.
  for (const combo of combos.slice(0, 4)) {
    const tag = `${combo.width}-${combo.scheme}-${combo.accent}-${combo.scale}`;
    step(`ajustes ${tag}`);
    const page = await newPage(combo);
    await open(page, '#/ajustes', 'ajustes');
    assert.equal(await page.locator('#set-instalar').textContent(), 'Instalar no celular');
    assert.deepEqual(await page.locator('.howto-chip').allInnerTexts(), ['iPhone · Safari', 'Android · Chrome']);
    assert.equal(await page.locator('.howto strong, .howto em').count(), 0, 'frases simples, sem negrito/itálico misturados');
    assert.equal(await page.locator('.howto-row').count(), 2);
    assert.match(await page.locator('.set-group:has(#set-instalar) .set-foot').innerText(), /funciona sem internet/);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth) <= 0, true, `ajustes ${tag}: rolagem horizontal`);
    await page.locator('#set-instalar').scrollIntoViewIfNeeded();
    await shot(page, `ajustes-${tag}`);
    await page.context().close();
  }
  step('ajustes instalado (navigator.standalone)');
  const standalone = await newPage({ width: 390, scheme: 'light', standalone: true });
  assert.equal(await standalone.evaluate(() => navigator.standalone), true);
  await open(standalone, '#/ajustes', 'ajustes');
  assert.equal(await standalone.locator('#set-instalar, .howto, .howto-chip').count(), 0, 'instalado: sem "Instalar no celular"');
  assert.equal(await standalone.getByText('funciona sem internet').count(), 0, 'nem a nota de rodapé');
  assert.ok(await standalone.locator('#set-backup').count() > 0, 'o resto de Ajustes continua');
  await standalone.context().close();

  step('ajustes instalado (display-mode: standalone)');
  const dm = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true });
  await dm.addInitScript(() => {
    const orig = window.matchMedia.bind(window);
    window.matchMedia = (q) => (/display-mode:\s*standalone/.test(q) ? { matches: true, media: q, addEventListener() {}, removeEventListener() {} } : orig(q));
  });
  const dmPage = await dm.newPage();
  await dmPage.route(/^https:\/\//, (r) => r.abort());
  await dmPage.goto(BASE);
  await dmPage.waitForFunction(() => document.getElementById('app').dataset.page);
  await dmPage.evaluate(() => history.replaceState(null, '', '#/ajustes'));
  await dmPage.reload();
  await dmPage.waitForFunction(() => document.getElementById('app').dataset.page === 'ajustes');
  assert.equal(await dmPage.locator('#set-instalar').count(), 0);
  await dm.close();

  // 1. Faixa da barra de status: com a área segura simulada (47px), a faixa é a cor do fundo.
  for (const scheme of ['light', 'dark']) {
    step(`faixa do topo ${scheme}`);
    const page = await newPage({ width: 390, scheme, accent: 'terracota' });
    await open(page, '#/ajustes', 'ajustes');
    await page.addStyleTag({ content: ':root,[data-theme]{--safe-t:47px !important}' });
    await page.waitForTimeout(100);
    const bg = rgbOf(await page.evaluate(() => getComputedStyle(document.body).backgroundColor));
    const near = (a, b, tol) => a.every((v, i) => Math.abs(v - b[i]) <= tol);
    // Capturas em 2×: a faixa vai de y=0 a 94.
    const band = async () => pixelsOf(await page.screenshot(), [[40, 30], [400, 30], [700, 60], [100, 90]]);
    let px = await band();
    for (const c of px) assert.ok(near(c, bg, 16), `${scheme}: faixa em repouso é o fundo ${bg} (veio ${c})`);
    assert.equal(await page.evaluate(() => getComputedStyle(document.documentElement, '::after').opacity), '0', 'sem degradê no alto da página');
    await shot(page, `faixa-${scheme}-repouso`);
    // Rolando: só um véu leve do fundo (nada de cinza pesado) e o degradê curto aparece.
    await page.evaluate(() => window.scrollTo(0, 500));
    await page.waitForFunction(() => document.documentElement.classList.contains('is-scrolled'));
    await page.waitForTimeout(150);
    assert.equal(await page.evaluate(() => getComputedStyle(document.documentElement, '::after').opacity), '1');
    assert.equal(await page.evaluate(() => getComputedStyle(document.documentElement, '::after').height), '24px');
    px = await band();
    for (const c of px) assert.ok(near(c, bg, 50), `${scheme}: faixa rolando perto do fundo ${bg} (veio ${c})`);
    await shot(page, `faixa-${scheme}-rolando`);
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.waitForFunction(() => !document.documentElement.classList.contains('is-scrolled'));
    // Metas da barra do sistema seguem o tema.
    const metas = await page.evaluate(() => [...document.querySelectorAll('meta[name="theme-color"]')].map((m) => m.content));
    assert.ok(metas.every((m) => m === (scheme === 'light' ? '#F6F1EB' : '#0E0C0B')), metas.join());
    await page.context().close();
  }

  assert.deepEqual(errors, []);
  console.log('OK v162-ficha');
} finally {
  await browser.close();
  server.close();
}
