// Teste de ponta a ponta da 1.5 (ficha, trechos e busca):
// 1. topo da ficha com a própria capa ampliada e desfocada (sem capa: a cor de sempre);
// 2. "Ritmo da leitura" sem diário vira uma linha tracejada discreta;
// 3. trechos como citação tipográfica (aba Trechos, ficha e "Trechos salvos"), com as ações;
// 4. cartões "esqueleto" enquanto a busca roda (e um na busca com IA), sem brilho com
//    "Reduzir movimento";
// 5. "Não encontrei" e a dica do ISBN somem enquanto a IA procura ou depois que ela acha.
// Em 320, 390 e 430 px, claro e escuro; capturas em tests/e2e/screens/v15-ficha-*.png.
// Uso: node tests/e2e/v15-ficha.mjs   (precisa do Playwright, como o smoke.mjs)

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

const GEMINI_KEY = 'AQ.Ab8RN6KtestetestetestetestetestetesteXYZ';
const ISBN = '9788555325007';
const step = (msg) => console.log(`• ${msg}`);

// ---------- Rede simulada (busca comum e Gemini, como em busca-ia.mjs) ----------

const OK = 'URL_RETRIEVAL_STATUS_SUCCESS';
const reply = (obj) => ({
  candidates: [{
    content: { role: 'model', parts: [{ text: `Encontrei:\n\`\`\`json\n${JSON.stringify(obj)}\n\`\`\`` }] },
    finishReason: 'STOP',
    urlContextMetadata: { urlMetadata: [{ retrievedUrl: 'https://html.duckduckgo.com/html/?q=x', urlRetrievalStatus: OK }] },
  }],
});
const apiError = (code, status, message) => ({ error: { code, status, message, details: [] } });

function promptQuery(prompt) {
  const m = prompt.match(/https:\/\/(?:html|lite)\.duckduckgo\.com\/(?:html|lite)\/\?q=(\S+)/);
  return { q: m ? decodeURIComponent(m[1].replace(/\+/g, ' ')).toLowerCase() : '', confirm: /Copie, só do texto dos resultados/.test(prompt) };
}

// A busca comum e a IA podem ser seguradas (para ver o carregando) e soltas depois.
const held = { search: null, ai: null };
const hold = (name) => {
  let release;
  const gate = new Promise((r) => { release = r; });
  held[name] = { gate, release };
};
const release = (name) => {
  held[name]?.release();
  held[name] = null;
};

async function mockNetwork(context) {
  // A última rota registrada vale primeiro: o resto da internet (registrado antes) fica fora.
  await context.route(/^https:\/\//, (r) => r.abort());
  const regular = async (route, body) => {
    const gate = held.search?.gate;
    if (gate) await gate;
    await route.fulfill({ json: body }).catch(() => {});
  };
  await context.route('https://www.googleapis.com/**', (r) => regular(r, { items: [] }));
  await context.route('https://openlibrary.org/**', (r) => {
    const q = new URL(r.request().url()).searchParams.get('q') || '';
    const docs = /^duna( |$)/i.test(q) ? [
      { key: '/works/1', title: 'Duna', author_name: ['Frank Herbert'], number_of_pages_median: 680, first_publish_year: 1965 },
      { key: '/works/2', title: 'O Messias de Duna', author_name: ['Frank Herbert'], number_of_pages_median: 256, first_publish_year: 1969 },
    ] : [];
    return regular(r, { docs });
  });
  await context.route('https://brasilapi.com.br/**', (r) => (r.request().url().endsWith(ISBN)
    ? r.fulfill({ json: { isbn: ISBN, title: 'Cara Debbie', subtitle: null, authors: ['Freida McFadden'], page_count: 368, year: 2026, provider: 'cbl', cover_url: null } })
    : r.fulfill({ status: 404, json: { message: 'ISBN não encontrado' } })));
  await context.route('https://covers.openlibrary.org/**', (r) => r.fulfill({ status: 404, body: '' }));
  await context.route('https://generativelanguage.googleapis.com/**', async (route) => {
    const body = JSON.parse(route.request().postData() || '{}');
    const { q, confirm } = promptQuery(body.contents?.[0]?.parts?.[0]?.text || '');
    const gate = held.ai?.gate;
    if (gate) await gate;
    let status = 200;
    let json = reply({ encontrado: false });
    if (confirm) json = reply({ encontrado: false });
    else if (q.includes('cara debbie')) {
      json = reply({ encontrado: true, livros: [{ titulo: 'Cara Debbie', autores: ['Freida McFadden'], paginas: 350, ano: 2026, isbn13: ISBN, editora: 'Arqueiro', fontes: ['https://www.amazon.com.br/x'] }] });
    } else if (q.includes('cota')) {
      status = 429;
      json = apiError(429, 'RESOURCE_EXHAUSTED', 'You exceeded your current quota. Quota exceeded for metric: generate_content_free_tier_requests, limit: 15');
    }
    await route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(json) }).catch(() => {});
  });
}

// ---------- Dados de exemplo ----------

const TS = '2026-01-01T00:00:00.000Z';
const journal = Array.from({ length: 12 }, (_, k) => ({
  date: `2026-09-${String(2 + k * 2).padStart(2, '0')}`, from: k * 24, to: (k + 1) * 24, unit: 'page', note: '', ...(k % 3 ? {} : { minutes: 35 }),
}));

function seedWith(covers) {
  const base = { authors: 'Autor', format: 'fisico', genre: 'Ficção', tags: [], quotes: [], journal: [], createdAt: TS, updatedAt: TS, favorite: false, notes: '', isbn: '', rating: null };
  return {
    version: 2, goals: { 2026: 12 }, defaultGoal: 12, customGenres: [], lastBackupAt: '2026-10-20T10:00:00.000Z', pageGoals: {},
    upNext: [],
    books: [
      { ...base, id: 'a1', title: 'A Biblioteca da Meia-Noite', authors: 'Matt Haig', pages: 288, status: 'lido', startDate: '2026-09-02', endDate: '2026-09-26',
        rating: 4.5, cover: covers.vivid, journal, genre: 'Romance',
        quotes: [
          { id: 'q1', text: 'Entre a vida e a morte existe uma biblioteca.', page: 31, percent: null, note: '', createdAt: '2026-09-04T10:00:00.000Z' },
          { id: 'q2', text: 'Você não precisa entender a vida. Só precisa vivê-la.', page: 212, percent: null, note: 'Para reler nos dias difíceis.', createdAt: '2026-09-20T10:00:00.000Z' },
        ] },
      { ...base, id: 'b1', title: 'O Sol Também Se Levanta', authors: 'Ernest Hemingway', pages: 256, status: 'lendo', startDate: '2026-10-20', currentPage: null,
        cover: covers.bright },
      { ...base, id: 'c1', title: 'Memórias Póstumas de Brás Cubas', authors: 'Machado de Assis', pages: 208, status: 'lido', startDate: '2026-03-01', endDate: '2026-03-15', rating: 5,
        quotes: [{ id: 'q3', text: 'Não tive filhos, não transmiti a nenhuma criatura o legado da nossa miséria.', page: null, percent: null, note: '', createdAt: '2026-03-15T10:00:00.000Z' }] },
      { ...base, id: 'k1', title: 'Fora de Série', authors: 'Malcolm Gladwell', pages: null, status: 'lendo', format: 'kindle', startDate: '2026-10-01', currentPercent: 45,
        cover: covers.dark, journal: [{ date: '2026-10-12', from: 20, to: 45, unit: 'percent', note: '' }],
        quotes: [{ id: 'q4', text: 'A prática não é o que você faz quando já é bom. É o que faz você ficar bom.', page: null, percent: 38, note: '', createdAt: '2026-10-12T10:00:00.000Z' }] },
    ],
  };
}

const browser = await playwright.chromium.launch();
const context = await browser.newContext({
  viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, locale: 'pt-BR',
});
await context.addInitScript(() => {
  window.__vt = 0;
  window.__vtActive = 0;
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
await mockNetwork(context);
const page = await context.newPage();
await page.clock.setFixedTime(new Date('2026-10-27T12:00:00'));

const errors = [];
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errors.push(`console: ${m.text()}`); });
page.on('dialog', (d) => d.accept());

const readState = () => page.evaluate(async () => (await import('/js/db.js')).getItem('state'));
const writeState = (data) => page.evaluate(async (d) => (await import('/js/db.js')).setItem('state', d), data);
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
const onPage = (name) => page.waitForFunction((n) => document.getElementById('app').dataset.page === n && !window.__vtActive, name);
const onDetail = (id) => page.waitForFunction((i) => location.hash === `#/livro/${i}` && document.querySelector(`.ficha-hero[data-id="${i}"]`) && !window.__vtActive, id);
const toastHas = (re) => page.waitForFunction((src) => new RegExp(src).test(document.getElementById('toast').textContent), re.source);
const text = async (sel) => (await page.textContent(sel)).replace(/\s+/g, ' ').trim();
const backdropShown = () => page.waitForFunction(() => {
  const el = document.querySelector('.ficha-backdrop');
  return el && el.querySelector('.is-loaded') && getComputedStyle(el).opacity === '1';
});

async function setTheme(scheme) {
  await page.emulateMedia({ colorScheme: scheme });
  await page.waitForFunction((s) => document.documentElement.dataset.theme === s, scheme);
}

/** Sobra à direita e alvos de toque pequenos na tela atual. */
async function layoutProblems(label) {
  return page.evaluate((lbl) => {
    const out = [];
    const overflow = document.documentElement.scrollWidth - window.innerWidth;
    if (overflow > 0) out.push(`${lbl}: ${overflow}px sobrando à direita`);
    const small = [...document.querySelectorAll('#app button, #app a')]
      .filter((el) => el.offsetParent && el.getBoundingClientRect().height < 44).map((el) => el.outerHTML.slice(0, 70));
    if (small.length) out.push(`${lbl}: alvos < 44px: ${small.join(' | ')}`);
    return out;
  }, label);
}

/**
 * Capturas em 320, 390 e 430 px, claro e escuro. prepare() roda depois de cada troca
 * (rolar até o trecho que interessa); a tela não deve sobrar para os lados em nenhuma.
 */
async function shots(name, prepare = async () => {}, { fullPage = false } = {}) {
  await page.evaluate(() => document.getElementById('toast').classList.remove('show'));
  const problems = [];
  for (const width of [320, 390, 430]) {
    await page.setViewportSize({ width, height: 844 });
    for (const scheme of ['light', 'dark']) {
      await setTheme(scheme);
      await prepare();
      await page.waitForTimeout(80);
      problems.push(...await layoutProblems(`${name} ${width} ${scheme}`));
      await page.screenshot({ path: join(SHOTS, `v15-ficha-${name}-${scheme === 'light' ? 'claro' : 'escuro'}-${width}.png`), fullPage });
    }
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await setTheme('dark');
  assert.deepEqual(problems, [], 'layout');
}

const scrollTo = (sel, offset = 80) => page.evaluate(([s, o]) => {
  window.scrollTo(0, 0);
  const el = document.querySelector(s);
  if (el) window.scrollTo(0, el.getBoundingClientRect().top + window.scrollY - o);
}, [sel, offset]);

try {
  step('dados de exemplo (capas de verdade, como data URL)');
  await page.goto(`${BASE}manifest.webmanifest`);
  const covers = await page.evaluate(() => {
    const make = (paint) => {
      const c = document.createElement('canvas');
      c.width = 300;
      c.height = 450;
      paint(c.getContext('2d'));
      return c.toDataURL('image/jpeg', 0.85);
    };
    return {
      // Azul-noite com um sol laranja: cores fortes para o desfoque.
      vivid: make((x) => {
        const g = x.createLinearGradient(0, 0, 0, 450);
        g.addColorStop(0, '#0B1E4A');
        g.addColorStop(1, '#2C5AA0');
        x.fillStyle = g;
        x.fillRect(0, 0, 300, 450);
        x.fillStyle = '#F2994A';
        x.beginPath();
        x.arc(150, 250, 90, 0, Math.PI * 2);
        x.fill();
        x.fillStyle = '#F7E9C8';
        x.font = 'bold 28px Georgia';
        x.fillText('A BIBLIOTECA', 50, 80);
        x.fillText('DA MEIA-NOITE', 40, 116);
      }),
      // Capa clara (creme e amarelo): o caso difícil no tema escuro.
      bright: make((x) => {
        x.fillStyle = '#FBF3D5';
        x.fillRect(0, 0, 300, 450);
        x.fillStyle = '#F5C518';
        x.beginPath();
        x.arc(150, 170, 80, 0, Math.PI * 2);
        x.fill();
        x.fillStyle = '#1A1A1A';
        x.font = 'bold 30px Georgia';
        x.fillText('O SOL', 105, 330);
        x.font = '18px Georgia';
        x.fillText('HEMINGWAY', 95, 380);
      }),
      // Capa escura (preto e vermelho): o caso difícil no tema claro.
      dark: make((x) => {
        x.fillStyle = '#111111';
        x.fillRect(0, 0, 300, 450);
        x.fillStyle = '#C0392B';
        x.fillRect(0, 300, 300, 150);
        x.fillStyle = '#FFFFFF';
        x.font = 'bold 34px Georgia';
        x.fillText('FORA DE', 70, 150);
        x.fillText('SÉRIE', 95, 192);
      }),
    };
  });
  await page.goto(BASE);
  await page.waitForSelector('#app[data-page]');
  await writeState(seedWith(covers));
  await page.reload();
  await page.waitForSelector('.hero');
  await setTheme('dark');

  // ---------- 1. Fundo desfocado ----------
  step('Início → capa → ficha: a transição da capa continua; o topo ganha a capa desfocada');
  await page.click('.grid-book:has(img) >> nth=0');
  await page.waitForFunction(() => document.querySelector('.ficha-hero') && !window.__vtActive);
  assert.ok(await page.evaluate(() => window.__vt) >= 1, 'abriu com View Transition');
  assert.equal(await page.evaluate(() => getComputedStyle(document.querySelector('.ficha-cover .cover')).viewTransitionName), 'book-cover');
  await page.goto(`${BASE}#/livro/a1`);
  await onDetail('a1');
  await backdropShown();
  const bd = await page.evaluate(() => {
    const hero = document.querySelector('.ficha-hero');
    const box = hero.querySelector('.ficha-backdrop');
    const img = box.querySelector('img');
    const blurred = [...document.querySelectorAll('#app *')].filter((el) => /blur/.test(getComputedStyle(el).filter));
    const glass = [...hero.querySelectorAll('*')].filter((el) => {
      const s = getComputedStyle(el);
      return /blur/.test(s.backdropFilter || '') || /blur/.test(s.webkitBackdropFilter || '');
    });
    const heroBox = hero.getBoundingClientRect();
    const boxRect = box.getBoundingClientRect();
    return {
      id: hero.dataset.id,
      cls: hero.className,
      ariaHidden: box.getAttribute('aria-hidden'),
      position: getComputedStyle(box).position,
      zIndex: getComputedStyle(box).zIndex,
      filter: getComputedStyle(img).filter,
      sameSrc: img.getAttribute('src') === document.querySelector('.ficha-cover .cover-img').getAttribute('src'),
      blurred: blurred.length,
      glass: glass.length,
      fits: Math.abs(boxRect.top - heroBox.top) < 1 && Math.abs(boxRect.height - heroBox.height) < 1,
      heroH: heroBox.height,
    };
  });
  assert.equal(bd.id, 'a1', 'data-id do topo continua');
  assert.match(bd.cls, /has-backdrop/);
  assert.equal(bd.ariaHidden, 'true');
  assert.equal(bd.position, 'absolute', 'fundo fora do fluxo: nada se mexe quando a imagem chega');
  assert.match(bd.filter, /blur\(40px\)/);
  assert.ok(bd.sameSrc, 'mesma imagem da capa (nada a mais pela rede)');
  assert.equal(bd.blurred, 1, 'um único elemento desfocado');
  assert.equal(bd.glass, 0, 'sem backdrop-filter no topo');
  assert.ok(bd.fits, 'o fundo cobre o topo inteiro');
  // Sem o fundo, o topo tem a mesma altura (sem salto de layout).
  const heroWithout = await page.evaluate(() => {
    const hero = document.querySelector('.ficha-hero');
    const box = hero.querySelector('.ficha-backdrop');
    box.style.display = 'none';
    const h = hero.getBoundingClientRect().height;
    box.style.display = '';
    return h;
  });
  assert.equal(heroWithout, bd.heroH);
  // A cor da capa continua por baixo, para quando a imagem não abre.
  await page.waitForFunction(() => getComputedStyle(document.querySelector('.ficha-hero')).getPropertyValue('--tint').trim().split(' ').length === 3);

  step('redesenho (favorito): o fundo já carregado aparece direto, sem piscar');
  await page.click('.ficha-fav');
  await waitState((s) => bookIn(s, 'a1').favorite === true);
  assert.equal(await page.evaluate(() => document.querySelector('.ficha-backdrop-img').classList.contains('is-loaded')), true);
  await page.click('.ficha-fav');
  await waitState((s) => bookIn(s, 'a1').favorite === false);
  await shots('topo', async () => { await page.evaluate(() => window.scrollTo(0, 0)); });
  await page.setViewportSize({ width: 390, height: 844 });
  await setTheme('light');
  await page.screenshot({ path: join(SHOTS, 'v15-ficha-pagina-claro-390.png'), fullPage: true });
  await setTheme('dark');
  await page.screenshot({ path: join(SHOTS, 'v15-ficha-pagina-escuro-390.png'), fullPage: true });

  step('capa que não abre: o fundo fica invisível e vale a cor da capa');
  await page.evaluate(() => {
    const img = document.querySelector('.ficha-backdrop-img');
    img.classList.remove('is-loaded');
    img.src = 'https://capa.invalida.example/x.jpg';
  });
  await page.waitForFunction(() => getComputedStyle(document.querySelector('.ficha-backdrop')).opacity === '0');

  step('capa clara no escuro e capa escura no claro: topo legível');
  await page.goto(`${BASE}#/livro/b1`);
  await onDetail('b1');
  await backdropShown();
  await shots('capa-clara', async () => { await page.evaluate(() => window.scrollTo(0, 0)); });
  await page.goto(`${BASE}#/livro/k1`);
  await onDetail('k1');
  await backdropShown();
  await shots('capa-escura', async () => { await page.evaluate(() => window.scrollTo(0, 0)); });

  step('sem capa: nada de fundo desfocado, fica o degradê da cor da capa desenhada');
  await page.goto(`${BASE}#/livro/c1`);
  await onDetail('c1');
  assert.equal(await page.locator('.ficha-backdrop').count(), 0);
  assert.doesNotMatch(await page.getAttribute('.ficha-hero', 'class'), /has-backdrop/);
  await page.waitForFunction(() => getComputedStyle(document.querySelector('.ficha-hero')).getPropertyValue('--tint').trim().split(' ').length === 3);
  assert.match(await page.evaluate(() => getComputedStyle(document.querySelector('.ficha-hero')).backgroundImage), /radial-gradient/);

  // ---------- 2. Ritmo sem diário ----------
  step('lido sem diário: linha discreta, sem cartão');
  assert.equal(await page.locator('.rchart').count(), 0);
  assert.equal(await text('.ficha-rhythm-empty'), 'Ritmo da leitura · este livro foi registrado sem o diário');
  const row = await page.evaluate(() => {
    const el = document.querySelector('.ficha-rhythm-empty');
    const s = getComputedStyle(el);
    return { h: el.getBoundingClientRect().height, border: s.borderTopStyle, icon: Boolean(el.querySelector('svg')), tag: el.tagName };
  });
  assert.equal(row.border, 'dashed');
  assert.ok(row.icon, 'com ícone');
  assert.ok(row.h <= 64, `linha compacta (${row.h}px)`);
  assert.equal(row.tag, 'P', 'só informa (nada para tocar)');
  await shots('sem-capa', async () => { await page.evaluate(() => window.scrollTo(0, 0)); });

  step('lendo sem diário: "aparece quando você registrar a leitura"; registrar troca pela barra do gráfico');
  await page.goto(`${BASE}#/livro/b1`);
  await onDetail('b1');
  assert.equal(await text('.ficha-rhythm-empty'), 'Ritmo da leitura · aparece quando você registrar a leitura');
  await shots('ritmo-vazio', () => scrollTo('.ficha-card', 120));
  await page.click('[data-action="update-page"]');
  await page.waitForSelector('#progress-input');
  await page.fill('#progress-input', '40');
  await page.press('#progress-input', 'Enter');
  await toastHas(/Página atualizada/);
  await page.waitForSelector('.rchart[data-rchart]');
  assert.equal(await page.locator('.ficha-rhythm-empty').count(), 0);
  assert.equal(bookIn(await waitState((s) => bookIn(s, 'b1').currentPage === 40), 'b1').journal.length, 1);

  // ---------- 3. Trechos ----------
  step('ficha: trecho mais recente como citação (aspa, serifa, selo da página)');
  await page.goto(`${BASE}#/livro/a1`);
  await onDetail('a1');
  assert.equal(await text('.ficha-quote blockquote'), 'Você não precisa entender a vida. Só precisa vivê-la.');
  assert.equal(await text('.ficha-quote .quote-page'), 'p. 212');
  assert.equal(await page.locator('.ficha-quote .quote-mark[aria-hidden="true"]').count(), 1);
  assert.match(await page.evaluate(() => getComputedStyle(document.querySelector('.ficha-quote blockquote')).fontFamily), /Instrument Serif/);
  await shots('ficha-trecho', () => scrollTo('.ficha-quote', 160));

  step('aba Trechos: aspa em caramelo, texto serifado, página em versalete, data apagada');
  await page.click('.ficha-section:has(.ficha-quote) .section-head .link');
  await page.waitForSelector('.book-tab.is-on[data-tab="trechos"]');
  const look = await page.evaluate(() => {
    const card = document.querySelector('.quote-card');
    const accent = getComputedStyle(document.documentElement).getPropertyValue('--accent').trim();
    const probe = document.createElement('span');
    probe.style.color = accent;
    document.body.append(probe);
    const accentRgb = getComputedStyle(probe).color;
    probe.remove();
    const mark = card.querySelector('.quote-mark');
    const textEl = card.querySelector('.quote-text');
    const pageEl = card.querySelector('.quote-page');
    return {
      marks: document.querySelectorAll('.quote-card .quote-mark').length,
      cards: document.querySelectorAll('.quote-card').length,
      markColor: getComputedStyle(mark).color,
      accentRgb,
      markSize: parseFloat(getComputedStyle(mark).fontSize),
      textFont: getComputedStyle(textEl).fontFamily,
      textSize: parseFloat(getComputedStyle(textEl).fontSize),
      lineHeight: parseFloat(getComputedStyle(textEl).lineHeight) / parseFloat(getComputedStyle(textEl).fontSize),
      page: pageEl.textContent,
      pageCase: getComputedStyle(pageEl).textTransform,
      date: card.querySelector('.quote-date').textContent,
      dateColor: getComputedStyle(card.querySelector('.quote-date')).color,
      muted: getComputedStyle(card.querySelector('.quote-meta')).color,
    };
  });
  assert.equal(look.marks, look.cards, 'uma aspa por trecho');
  assert.equal(look.markColor, look.accentRgb, 'aspa na cor de destaque');
  assert.ok(look.markSize >= 60, 'aspa grande');
  assert.match(look.textFont, /Instrument Serif/);
  assert.ok(look.textSize >= 20 && look.lineHeight >= 1.3, 'tamanho e entrelinha confortáveis');
  assert.equal(look.page, 'p. 212');
  assert.equal(look.pageCase, 'uppercase');
  assert.equal(look.date, 'salvo em 20 set 2026');
  assert.equal(look.dateColor, look.muted);
  assert.equal(await text('.quote-card >> nth=0 >> .quote-text'), 'Você não precisa entender a vida. Só precisa vivê-la.', 'a aspa não entra no texto');
  await shots('aba-trechos', () => scrollTo('.quote-list', 140));

  step('ações dos trechos continuam: compartilhar, corrigir, excluir e desfazer');
  const download = page.waitForEvent('download');
  await page.click('[data-action="quote-share"][data-id="q2"]');
  assert.match((await download).suggestedFilename(), /\.png$/);
  await page.click('[data-action="quote-edit"][data-id="q1"]');
  await page.waitForSelector('[data-quote-form][data-id="q1"]');
  await page.fill('#q-pos', '32');
  await page.click('[data-quote-form] button[type="submit"]');
  await waitState((s) => bookIn(s, 'a1').quotes.find((q) => q.id === 'q1').page === 32);
  await page.waitForSelector('[data-quote-form]', { state: 'detached' });
  assert.equal(await text('.quote-card >> nth=1 >> .quote-page'), 'p. 32');
  await page.click('[data-action="quote-delete"][data-id="q1"]');
  await waitState((s) => bookIn(s, 'a1').quotes.length === 1);
  await page.click('.toast button:has-text("Desfazer")');
  await waitState((s) => bookIn(s, 'a1').quotes.length === 2);
  assert.equal(await page.locator('.quote-card').count(), 2);

  step('Kindle: posição em % no selo');
  await page.goto(`${BASE}#/livro/k1/editar?aba=trechos`);
  await page.waitForSelector('.quote-card');
  assert.equal(await text('.quote-page'), '38%');

  step('"Trechos salvos": citação com o livro assinando (travessão), autor e selo');
  await page.goto(`${BASE}#/trechos`);
  await onPage('trechos');
  assert.equal(await page.locator('.quote-link').count(), 4);
  assert.equal(await page.locator('.quote-link .quote-mark').count(), 4);
  const first = page.locator('.quote-link').first();
  assert.equal(await first.locator('.quote-book').textContent(), 'Fora de Série');
  assert.equal(await first.locator('.quote-author').textContent(), 'Malcolm Gladwell');
  assert.equal(await first.locator('.quote-page').textContent(), '38%');
  assert.equal(await page.locator('.quote-link:has-text("Brás Cubas") .quote-page').count(), 0, 'sem posição, sem selo');
  await page.fill('#quotes-q', 'entender');
  await page.waitForFunction(() => document.querySelectorAll('.quote-link').length === 1);
  await page.fill('#quotes-q', '');
  await page.waitForFunction(() => document.querySelectorAll('.quote-link').length === 4);
  await shots('todos-trechos', () => scrollTo('#quotes-results', 120));
  await page.click('.quote-link:has-text("Fora de Série")');
  await page.waitForSelector('.book-tab.is-on[data-tab="trechos"]');

  // ---------- 4. Esqueleto da busca ----------
  step('busca segurada: três cartões esqueleto no formato do resultado, "Buscando…" só para o leitor de tela');
  await page.goto(`${BASE}#/inicio`);
  await onPage('inicio');
  await page.goto(`${BASE}#/novo`);
  await onPage('novo');
  hold('search');
  await page.fill('#lookup', 'duna');
  await page.press('#lookup', 'Enter');
  await page.waitForSelector('#lookup-results .result-skel');
  const skel = await page.evaluate(() => {
    const status = document.querySelector('#lookup-results [role="status"]');
    const cards = [...document.querySelectorAll('#lookup-results .result-skel')];
    const after = getComputedStyle(cards[0], '::after');
    return {
      count: cards.length,
      hidden: cards.every((c) => c.getAttribute('aria-hidden') === 'true'),
      status: status?.textContent,
      statusW: status?.getBoundingClientRect().width,
      covers: cards.every((c) => c.querySelector('.skel-cover')),
      bars: cards.map((c) => c.querySelectorAll('.skel-line').length),
      anim: after.animationName,
      height: cards[0].getBoundingClientRect().height,
      visibleText: [...document.querySelectorAll('#lookup-results *')].filter((el) => el.offsetParent && el.children.length === 0 && el.textContent.trim() && el.getBoundingClientRect().width > 1).length,
    };
  });
  assert.equal(skel.count, 3);
  assert.ok(skel.hidden, 'esqueletos escondidos do leitor de tela');
  assert.equal(skel.status, 'Buscando…');
  assert.ok(skel.statusW <= 1, '"Buscando…" só para o leitor de tela');
  assert.ok(skel.covers);
  assert.ok(skel.bars.every((n) => n >= 2 && n <= 3), 'duas ou três linhas');
  assert.equal(skel.anim, 'skel-sheen', 'brilho passando');
  assert.equal(skel.visibleText, 0, 'nenhum texto à vista');
  await page.emulateMedia({ reducedMotion: 'reduce' });
  assert.equal(await page.evaluate(() => getComputedStyle(document.querySelector('.result-skel'), '::after').content), 'none', 'Reduzir movimento: esqueleto parado');
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  // Cada fonte desiste em 8 s: uma busca nova (segurada) por captura.
  let again = 0;
  await shots('busca-esqueleto', async () => {
    again += 1;
    await page.fill('#lookup', `duna ${again}`);
    await page.press('#lookup', 'Enter');
    await page.waitForSelector('#lookup-results .result-skel');
    await scrollTo('.search-box', 140);
  });
  release('search');
  await page.fill('#lookup', 'duna');
  await page.press('#lookup', 'Enter');
  await page.waitForSelector('#lookup-results .result[data-action="pick-result"]');
  assert.equal(await page.locator('.result-skel').count(), 0);
  const realH = await page.evaluate(() => document.querySelector('#lookup-results .result').getBoundingClientRect().height);
  assert.ok(Math.abs(realH - skel.height) <= 2, `esqueleto com a altura do resultado (${skel.height} × ${realH})`);

  // ---------- 5. IA: sem mensagem contraditória ----------
  step('com chave do Gemini: "Não encontrei" some enquanto a IA procura e quando ela acha');
  await page.evaluate((k) => localStorage.setItem('leituras:geminiKey', k), GEMINI_KEY);
  await page.goto(`${BASE}#/inicio`);
  await page.reload();
  await onPage('inicio');
  await page.goto(`${BASE}#/novo`);
  await onPage('novo');
  const searchFor = async (q) => {
    await page.fill('#lookup', q);
    await page.press('#lookup', 'Enter');
    await page.waitForSelector('#lookup-results [data-action="ai-search"]');
  };
  await searchFor('cara debbie');
  assert.match(await text('#lookup-results'), /Não encontrei — preencha os dados abaixo\./);
  assert.equal(await page.locator('.lookup-tip').count(), 1);
  hold('ai');
  await page.click('[data-action="ai-search"]');
  await page.waitForSelector('.ai-box[aria-busy="true"]');
  assert.match(await text('.ai-status'), /Procurando na internet…/);
  assert.equal(await page.locator('.ai-box .result-skel').count(), 1, 'um esqueleto sob o progresso');
  assert.doesNotMatch(await text('#lookup-results'), /Não encontrei/);
  assert.equal(await page.locator('.lookup-tip').count(), 0);
  await shots('ia-carregando', () => scrollTo('.search-box', 140));
  release('ai');
  await page.waitForSelector('.ai-result');
  assert.doesNotMatch(await text('#lookup-results'), /Não encontrei|Não achou\?/);
  assert.match(await text('.ai-label'), /Encontrado pela IA/);
  await shots('ia-achou', () => scrollTo('.search-box', 140));

  step('IA não achou ou deu erro: "Não encontrei" e a dica voltam');
  await searchFor('livro inexistente');
  await page.click('[data-action="ai-search"]');
  await page.waitForFunction(() => /A IA não encontrou/.test(document.getElementById('lookup-results').textContent));
  assert.match(await text('#lookup-results'), /Não encontrei — preencha os dados abaixo\.[\s\S]*Não achou\? Digite o ISBN[\s\S]*A IA não encontrou esse livro/);
  await searchFor('cota estourada');
  await page.click('[data-action="ai-search"]');
  await page.waitForSelector('.ai-error');
  assert.match(await text('#lookup-results'), /Não encontrei[\s\S]*Não achou\?/);
  await shots('ia-erro', () => scrollTo('.search-box', 140));

  step('nada quebrou');
  assert.deepEqual(errors, []);
  console.log('ok — v15-ficha');
} finally {
  await browser.close();
  server.close();
}
