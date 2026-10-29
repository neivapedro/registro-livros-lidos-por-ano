// Teste de ponta a ponta da IA 1.6 (Gemini gratuito simulado, como em busca-ia.mjs):
// - Trecho por foto: sem chave, o botão explica onde ativar (e lembra do Texto ao Vivo); com
//   chave, a foto (câmera ou galeria) é reduzida (lado maior ≤ 1600 px, JPEG) e vai como
//   inline_data, sem ferramentas; o texto entra no campo do trecho, a página no campo Página,
//   "Manter só a seleção" corta o trecho e nada é salvo antes do Salvar. Erro 429, cancelar,
//   texto malicioso, livro Kindle (sem foto) e o contador do mês.
// - O que ler a seguir (#/sugestoes, entrada no Início): "Da minha fila" ordena a fila com
//   motivos (só códigos que existem), "Novos livros" mostra só os livros achados na busca de
//   livros (Open Library simulada), com capa de lá; "Adicionar à fila" cria um Quero ler;
//   a última sugestão fica guardada (voltar à tela não gasta a cota).
// Capturas em tests/e2e/screens/v16-ia-*.png (320/390/430, claro e escuro).
// Uso: node tests/e2e/v16-ia.mjs   (precisa do Playwright, como o smoke.mjs)

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
const step = (msg) => console.log(`• ${msg}`);
const browser = await playwright.chromium.launch();

// ---------- Imagens: a foto da página (grande, 2400×3200) e capas ----------

async function render(html, width, height, scale = 1) {
  const p = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: scale });
  await p.setContent(html);
  const buf = await p.screenshot({ type: 'png' });
  await p.close();
  return buf;
}
const PAGE_PHOTO = await render(`<body style="margin:0;background:#efe6d6;font:26px/1.55 Georgia,serif;color:#222;padding:80px">
  <p style="text-indent:2em">Uma noite destas, vindo da cidade para o Engenho Novo, encontrei no trem da Central um rapaz aqui do bairro.</p>
  <p style="text-indent:2em">A viagem era curta, e os versos pode ser que não fossem inteiramente maus.</p>
  <p style="text-align:center">61</p></body>`, 1200, 1600, 2);
const coverPng = (bg, text) => render(`<body style="margin:0"><div style="width:120px;height:180px;background:${bg};color:#fff;font:700 16px Georgia;display:flex;align-items:center;justify-content:center;text-align:center;padding:10px;box-sizing:border-box">${text}</div></body>`, 120, 180);
const COVERS = { 101: await coverPng('#7b2d26', 'Quarto de despejo'), 102: await coverPng('#1f4e5f', 'O avesso da pele') };

/** Largura e altura de um JPEG (marcador SOF). */
function jpegSize(buf) {
  let i = 2;
  while (i < buf.length) {
    if (buf[i] !== 0xff) return null;
    const marker = buf[i + 1];
    const len = buf.readUInt16BE(i + 2);
    if (marker >= 0xc0 && marker <= 0xc3) return { h: buf.readUInt16BE(i + 5), w: buf.readUInt16BE(i + 7) };
    i += 2 + len;
  }
  return null;
}

// ---------- Gemini simulado ----------

const OCR_TEXT = 'Uma noite destas, vindo da cidade para o Engenho Novo, encontrei no trem da Central um rapaz aqui do bairro.\n\nA viagem era curta, e os versos pode ser que não fossem inteiramente maus.';
const reply = (obj) => ({ candidates: [{ content: { role: 'model', parts: [{ text: JSON.stringify(obj) }] }, finishReason: 'STOP' }] });
const apiError = (code, status, message) => ({ error: { code, status, message } });
const gemini = { ocr: 'ok', calls: [] };

function geminiBehavior(body) {
  const parts = body.contents?.[0]?.parts || [];
  const prompt = parts.find((p) => p.text)?.text || '';
  const image = parts.find((p) => p.inline_data)?.inline_data;
  if (image) {
    if (gemini.ocr === 'quota') return { status: 429, json: apiError(429, 'RESOURCE_EXHAUSTED', 'You exceeded your current quota.') };
    if (gemini.ocr === 'hang') return { hang: true };
    if (gemini.ocr === 'evil') return { json: reply({ texto: '<img src=x onerror="window.__xss=1">Trecho', pagina: '<b>9</b>' }) };
    return { delay: 700, json: reply({ texto: OCR_TEXT, pagina: 61 }) };
  }
  if (/fila "Quero ler"/.test(prompt)) {
    return { delay: 600, json: reply({ ranking: [
      { id: 'q99', motivo: 'código inventado' },
      { id: 'q2', motivo: 'Mesma prosa poética e brasileira de Torto Arado, que você amou.' },
      { id: 'q1', motivo: 'Realismo mágico como em Cem Anos, para quem gostou de Duna.' },
      { id: 'q3', motivo: '<img src=x onerror="window.__xss=2">Leitura leve entre dois livros densos.' },
    ] }) };
  }
  if (/Sugira/.test(prompt)) {
    return { delay: 600, json: reply({ livros: [
      { titulo: 'Quarto de Despejo', autor: 'Carolina Maria de Jesus', isbn13: null, motivo: 'Retrato real e duro do Brasil, como Torto Arado.' },
      { titulo: 'Livro que Não Existe', autor: 'Autor Inventado', isbn13: '9788535911664', motivo: 'alucinação' },
      { titulo: 'O Avesso da Pele', autor: 'Jeferson Tenório', isbn13: null, motivo: '<b>Romance</b> brasileiro premiado sobre família e memória.' },
      { titulo: 'Torto Arado', autor: 'Itamar Vieira Junior', motivo: 'já está na estante' },
    ] }) };
  }
  return { json: reply({}) };
}

// Busca de livros (Open Library): só dois dos livros sugeridos existem.
const OL = {
  'quarto de despejo': { title: 'Quarto de despejo', subtitle: 'diário de uma favelada', author_name: ['Carolina Maria de Jesus'], number_of_pages_median: 200, cover_i: 101, first_publish_year: 1960, isbn: ['9788508171279'] },
  'o avesso da pele': { title: 'O avesso da pele', author_name: ['Jeferson Tenório'], number_of_pages_median: 192, cover_i: 102, first_publish_year: 2020, isbn: ['9788535933253'] },
  'torto arado': { title: 'Torto arado', author_name: ['Itamar Vieira Junior'], cover_i: 0 },
};

async function mockNetwork(context) {
  await context.route('https://generativelanguage.googleapis.com/**', async (route) => {
    const req = route.request();
    const body = JSON.parse(req.postData() || '{}');
    gemini.calls.push({ url: req.url(), headers: req.headers(), body });
    const b = geminiBehavior(body);
    if (b.hang) return;
    if (b.delay) await new Promise((r) => setTimeout(r, b.delay));
    await route.fulfill({ status: b.status || 200, contentType: 'application/json', body: JSON.stringify(b.json) }).catch(() => {});
  });
  await context.route('https://openlibrary.org/**', (r) => {
    const q = (new URL(r.request().url()).searchParams.get('q') || '').toLowerCase();
    const docs = Object.entries(OL).filter(([k]) => q.startsWith(k)).map(([, d]) => d);
    return r.fulfill({ json: { docs } });
  });
  await context.route('https://brasilapi.com.br/**', (r) => r.fulfill({ status: 404, json: { message: 'ISBN não encontrado' } }));
  await context.route('https://www.googleapis.com/**', (r) => r.fulfill({ json: { items: [] } }));
  await context.route('https://covers.openlibrary.org/**', (r) => {
    const id = r.request().url().match(/\/b\/id\/(\d+)/)?.[1];
    return COVERS[id] ? r.fulfill({ contentType: 'image/png', headers: { 'Access-Control-Allow-Origin': '*' }, body: COVERS[id] }) : r.fulfill({ status: 404, body: '' });
  });
}

// ---------- Dados ----------

const TS = '2026-01-01T00:00:00.000Z';
const read = (id, title, authors, endDate, extra = {}) => ({
  id, title, authors, status: 'lido', startDate: endDate.replace(/-\d\d$/, '-01'), endDate, pages: 300, format: 'fisico',
  rating: 4, genre: 'Ficção', createdAt: TS, updatedAt: TS, ...extra,
});
const want = (id, title, authors, createdAt) => ({ id, title, authors, status: 'quero', format: 'fisico', pages: 320, createdAt, updatedAt: createdAt });
const SEED = {
  version: 2, goals: { 2026: 12 }, defaultGoal: 12, customGenres: [], lastBackupAt: '2026-10-01T10:00:00.000Z', upNext: [], pageGoals: {},
  books: [
    read('a1', 'Duna', 'Frank Herbert', '2026-03-20', { rating: 4.5 }),
    read('a2', 'Torto Arado', 'Itamar Vieira Junior', '2026-07-12', { rating: 5, favorite: true, pages: 264 }),
    read('k1', 'Livro no Kindle', 'Autora K', '2026-08-10', { format: 'kindle' }),
    want('w1', 'Cem Anos de Solidão', 'Gabriel García Márquez', '2026-01-02T00:00:00.000Z'),
    want('w2', 'Grande Sertão: Veredas', 'João Guimarães Rosa', '2026-01-03T00:00:00.000Z'),
    want('w3', 'O Pequeno Príncipe', 'Antoine de Saint-Exupéry', '2026-01-04T00:00:00.000Z'),
  ],
};

// ---------- Navegador ----------

const errors = [];
// Sem service worker: as capas simuladas abaixo só valem para pedidos da própria página.
const context = await browser.newContext({
  viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, locale: 'pt-BR', serviceWorkers: 'block',
  userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1',
});
await mockNetwork(context);
const page = await context.newPage();
await page.clock.setFixedTime(new Date('2026-10-28T12:00:00'));
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errors.push(`console: ${m.text()}`); });
page.on('dialog', (d) => d.accept());

const onPage = (name) => page.waitForFunction((n) => document.getElementById('app').dataset.page === n, name);
const toastHas = (re) => page.waitForFunction((src) => new RegExp(src).test(document.getElementById('toast').textContent), re.source);
const readState = () => page.evaluate(async () => (await import('/js/db.js')).getItem('state'));
const usage = () => page.evaluate(() => JSON.parse(localStorage.getItem('leituras:iaUso') || 'null'));

async function setTheme(scheme) {
  await page.emulateMedia({ colorScheme: scheme });
  await page.waitForFunction((s) => document.documentElement.dataset.theme === s, scheme).catch(() => {});
}

async function noOverflow(label) {
  for (const width of [320, 390, 430]) {
    await page.setViewportSize({ width, height: 844 });
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    assert.ok(overflow <= 0, `${label}: ${width}px com ${overflow}px sobrando à direita`);
  }
  await page.setViewportSize({ width: 390, height: 844 });
}

async function tapTargets(selector, label) {
  const small = await page.$$eval(selector, (els) => els.filter((el) => el.offsetParent)
    .map((el) => ({ el, r: el.getBoundingClientRect() }))
    .filter(({ r }) => r.height < 44 || r.width < 44)
    .map(({ el, r }) => `${el.outerHTML.slice(0, 70)} ${Math.round(r.width)}×${Math.round(r.height)}`));
  assert.deepEqual(small, [], `${label}: alvos de toque pequenos`);
}

/** Capturas: cada largura e tema, com o seletor no topo da tela. */
async function shots(name, selector, { widths = [320, 390, 430], schemes = ['light', 'dark'] } = {}) {
  await page.evaluate(() => document.getElementById('toast').classList.remove('show'));
  for (const scheme of schemes) {
    await setTheme(scheme);
    for (const width of widths) {
      await page.setViewportSize({ width, height: 844 });
      if (selector) await page.$eval(selector, (el) => el.scrollIntoView({ block: 'start' }));
      await page.evaluate(() => window.scrollBy(0, -90));
      await page.waitForTimeout(150);
      await page.screenshot({ path: join(SHOTS, `v16-ia-${name}-${scheme === 'light' ? 'claro' : 'escuro'}-${width}.png`) });
    }
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await setTheme('dark');
}

async function openQuoteForm(bookId) {
  await page.goto(`${BASE}#/livro/${bookId}/editar?aba=trechos`);
  await page.waitForSelector('[data-action="quote-new"]');
  await page.click('[data-action="quote-new"]');
  await page.waitForSelector('[data-quote-form]');
}

try {
  await page.goto(`${BASE}#/inicio`);
  await page.waitForSelector('#app[data-page]');
  await page.evaluate(async (d) => {
    await (await import('/js/db.js')).setItem('state', d);
    localStorage.removeItem('leituras:geminiKey');
    localStorage.removeItem('leituras:sugestoes');
    localStorage.removeItem('leituras:iaUso');
  }, SEED);
  await page.reload();
  await onPage('inicio');
  await setTheme('dark');

  // ---------- Trecho por foto ----------

  step('sem chave: "Fotografar página" explica onde ativar e lembra do Texto ao Vivo; nada vai ao Google');
  await openQuoteForm('a2');
  assert.match(await page.textContent('#quote-ocr'), /Texto ao Vivo da Câmera do iPhone/);
  assert.equal(await page.$('#quote-ocr input[type=file]'), null);
  await page.click('[data-action="ocr-nokey"]');
  await page.waitForSelector('#quote-ocr .ocr-note');
  assert.match(await page.textContent('#quote-ocr .ocr-note'), /Ajustes › Busca com IA \(gratuita\)/);
  assert.equal(await page.getAttribute('#quote-ocr .ocr-note a', 'href'), '#/ajustes');
  await shots('trecho-sem-chave', '[data-quote-form]', { widths: [390] });
  assert.equal(gemini.calls.length, 0);

  step('Kindle: sem foto (o trecho vem do próprio Kindle)');
  await openQuoteForm('k1');
  assert.equal(await page.$('#quote-ocr'), null);

  step('com chave: botões da câmera (capture) e da galeria, alvos ≥ 44px');
  await page.evaluate((k) => localStorage.setItem('leituras:geminiKey', k), GEMINI_KEY);
  await page.reload();
  await openQuoteForm('a2');
  assert.equal(await page.getAttribute('#quote-ocr input[capture]', 'capture'), 'environment');
  assert.equal(await page.$$eval('#quote-ocr input[type=file][accept="image/*"]', (els) => els.length), 2);
  await tapTargets('#quote-ocr .ocr-btn', 'botões da foto');
  await shots('trecho-botoes', '[data-quote-form]', { widths: [320, 390] });
  await page.fill('#q-note', 'nota escrita antes');

  step('foto grande → reduzida (≤ 1600 px, JPEG) e enviada como inline_data, sem ferramentas');
  await page.setInputFiles('#quote-ocr input[capture]', { name: 'pagina.png', mimeType: 'image/png', buffer: PAGE_PHOTO });
  await page.waitForSelector('#quote-ocr [aria-busy="true"]');
  assert.match(await page.textContent('#quote-ocr'), /Lendo a foto…/);
  await page.waitForSelector('#quote-ocr .ocr-done');
  const call = gemini.calls.at(-1);
  assert.equal(call.headers['x-goog-api-key'], GEMINI_KEY);
  assert.ok(!call.url.includes(GEMINI_KEY), 'a chave não vai no endereço');
  assert.equal(call.body.tools, undefined);
  assert.ok(!JSON.stringify(call.body).includes('google_search'));
  const img = call.body.contents[0].parts.find((p) => p.inline_data).inline_data;
  assert.equal(img.mime_type, 'image/jpeg');
  const size = jpegSize(Buffer.from(img.data, 'base64'));
  assert.ok(size && Math.max(size.w, size.h) <= 1600 && Math.max(size.w, size.h) >= 1500, `foto reduzida: ${JSON.stringify(size)}`);
  assert.equal(await page.inputValue('#q-text'), OCR_TEXT);
  assert.equal(await page.inputValue('#q-pos'), '61');
  assert.equal(await page.inputValue('#q-note'), 'nota escrita antes', 'o resto do formulário fica como estava');
  assert.match(await page.textContent('#quote-ocr .ocr-done'), /página 61[\s\S]*nada é salvo até você tocar em Salvar/);
  assert.deepEqual(await usage(), { mes: '2026-10', n: 1 });
  assert.equal((await readState()).books.find((b) => b.id === 'a2').quotes?.length || 0, 0, 'nada salvo sem confirmar');
  await tapTargets('#quote-ocr .ocr-keep, #quote-ocr .ocr-btn', 'depois da leitura');
  await shots('trecho-lido', '[data-quote-form]');
  await noOverflow('trecho lido');

  step('"Manter só a seleção": sem seleção, explica; com seleção, fica só o trecho');
  await page.click('[data-action="ocr-keep-selection"]');
  await toastHas(/Selecione o trecho no texto/);
  assert.equal(await page.inputValue('#q-text'), OCR_TEXT);
  await page.$eval('#q-text', (el) => {
    const start = el.value.indexOf('A viagem');
    el.focus();
    el.setSelectionRange(start, el.value.length);
    document.dispatchEvent(new Event('selectionchange'));
    el.blur();
  });
  await page.click('[data-action="ocr-keep-selection"]');
  assert.equal(await page.inputValue('#q-text'), 'A viagem era curta, e os versos pode ser que não fossem inteiramente maus.');
  await page.click('[data-quote-form] button[type="submit"]');
  await toastHas(/Trecho salvo/);
  const saved = (await readState()).books.find((b) => b.id === 'a2').quotes;
  assert.equal(saved.length, 1);
  assert.equal(saved[0].text, 'A viagem era curta, e os versos pode ser que não fossem inteiramente maus.');
  assert.equal(saved[0].page, 61);
  assert.equal(saved[0].note, 'nota escrita antes');

  step('limite gratuito (429) pela galeria: aviso, sem "Tentar de novo"; conta o uso');
  gemini.ocr = 'quota';
  await page.click('[data-action="quote-new"]');
  await page.setInputFiles('#quote-ocr input:not([capture])', { name: 'pagina.png', mimeType: 'image/png', buffer: PAGE_PHOTO });
  await page.waitForSelector('#quote-ocr .ai-error');
  assert.match(await page.textContent('#quote-ocr .ai-error'), /Limite gratuito do Google por agora — tente mais tarde/);
  assert.equal(await page.$('[data-action="ocr-retry"]'), null);
  assert.equal(await page.inputValue('#q-text'), '');
  assert.deepEqual(await usage(), { mes: '2026-10', n: 2 });
  await shots('trecho-erro', '[data-quote-form]', { widths: [390], schemes: ['dark'] });

  step('cancelar a leitura da foto');
  gemini.ocr = 'hang';
  await page.setInputFiles('#quote-ocr input[capture]', { name: 'pagina.png', mimeType: 'image/png', buffer: PAGE_PHOTO });
  await page.waitForSelector('[data-action="ocr-cancel"]');
  await page.click('[data-action="ocr-cancel"]');
  await page.waitForSelector('#quote-ocr input[capture]');
  assert.equal(await page.inputValue('#q-text'), '');

  step('texto malicioso da IA fica só como texto no campo (nada executa)');
  gemini.ocr = 'evil';
  await page.setInputFiles('#quote-ocr input[capture]', { name: 'pagina.png', mimeType: 'image/png', buffer: PAGE_PHOTO });
  await page.waitForSelector('#quote-ocr .ocr-done');
  assert.equal(await page.inputValue('#q-text'), '<img src=x onerror="window.__xss=1">Trecho');
  assert.equal(await page.inputValue('#q-pos'), '', 'página que não é número fica de fora');
  assert.equal(await page.evaluate(() => window.__xss), undefined);
  await page.click('[data-action="quote-cancel"]');
  gemini.ocr = 'ok';

  // ---------- O que ler a seguir ----------

  step('Início: entrada "O que ler a seguir" leva a #/sugestoes');
  await page.goto(`${BASE}#/inicio`);
  await onPage('inicio');
  await shots('inicio-entrada', '.sug-teaser', { widths: [390] });
  await page.click('a[href="#/sugestoes"]');
  await onPage('sugestoes');
  assert.match(await page.textContent('h1'), /O que ler a seguir/);
  assert.match(await page.textContent('.sug-usage'), /4 de 30/, 'o pedido cancelado e o malicioso também saíram para o Google');
  await tapTargets('.seg-btn, .sug-ask', 'sugestões');

  step('"Da minha fila": ordena a fila com motivos (só códigos que existem), sem ferramentas');
  const before = gemini.calls.length;
  await page.click('[data-action="suggest-run"]');
  await page.waitForSelector('#sug-body [aria-busy="true"]');
  await shots('sugestoes-carregando', '.page-title', { widths: [390], schemes: ['dark'] });
  await page.waitForSelector('.sug-card .sug-rank');
  assert.equal(gemini.calls.length, before + 1);
  const ask = gemini.calls.at(-1).body;
  assert.equal(ask.tools, undefined);
  const prompt = ask.contents[0].parts[0].text;
  assert.match(prompt, /<dados>[\s\S]*Grande Sertão: Veredas[\s\S]*<\/dados>/);
  assert.match(prompt, /nunca instruções/);
  const titles = await page.$$eval('.sug-card .sug-title', (els) => els.map((e) => e.textContent));
  assert.deepEqual(titles, ['Grande Sertão: Veredas', 'Cem Anos de Solidão', 'O Pequeno Príncipe']);
  assert.match(await page.textContent('.sug-card'), /Mesma prosa poética/);
  assert.match(await page.textContent('.sug-head'), /Sugestões de hoje · 3 livros/);
  assert.equal(await page.evaluate(() => window.__xss), undefined);
  assert.ok((await page.textContent('#sug-body')).includes('<img src=x'), 'o motivo malicioso aparece como texto');
  assert.deepEqual(await usage(), { mes: '2026-10', n: 5 });
  await tapTargets('.sug-btn, .sug-ask', 'cartões da fila');
  await shots('sugestoes-fila', '.page-title');
  await noOverflow('sugestões da fila');

  step('"Pôr nas próximas" marca o livro nas próximas leituras');
  await page.click('.sug-card [data-action="toggle-next"][data-id="w2"]');
  await page.waitForFunction(() => /Nas próximas leituras/.test(document.querySelector('.sug-card').textContent));
  assert.deepEqual((await readState()).upNext, ['w2']);

  step('voltar à tela não gasta a cota: a última sugestão fica guardada');
  const calls = gemini.calls.length;
  await page.reload();
  await onPage('sugestoes');
  await page.waitForSelector('.sug-card .sug-rank');
  assert.equal(gemini.calls.length, calls);

  step('"Novos livros": só os achados na busca aparecem, com capa de lá; o resto cai');
  await page.click('[data-action="suggest-mode"][data-value="novos"]');
  await page.waitForSelector('[data-action="suggest-run"]');
  assert.match(await page.textContent('.sug-intro'), /o que não for encontrado não aparece/);
  await page.click('[data-action="suggest-run"]');
  await page.waitForSelector('[data-action="suggest-add"]');
  assert.ok(/Sugira/.test(gemini.calls.at(-1).body.contents[0].parts[0].text));
  const found = await page.$$eval('.sug-card .sug-title', (els) => els.map((e) => e.textContent));
  assert.deepEqual(found, ['Quarto de despejo: diário de uma favelada', 'O avesso da pele']);
  const text = await page.textContent('#sug-body');
  assert.ok(!/Livro que Não Existe|alucinação/.test(text), 'livro inventado não aparece');
  assert.ok(!/já está na estante/.test(text), 'livro que a pessoa já tem não aparece');
  assert.ok(text.includes('<b>Romance</b>'), 'o motivo aparece como texto, sem virar HTML');
  await page.waitForFunction(() => [...document.querySelectorAll('.sug-card .cover-img')].every((i) => i.complete && i.naturalWidth > 0));
  const srcs = await page.$$eval('.sug-card .cover-img', (els) => els.map((e) => e.getAttribute('src')));
  assert.ok(srcs.length === 2 && srcs.every((s) => s.startsWith('https://covers.openlibrary.org/')), srcs.join(' '));
  assert.deepEqual(await usage(), { mes: '2026-10', n: 6 });
  await shots('sugestoes-novos', '.page-title');
  await shots('sugestoes-fim', '.sug-refresh', { widths: [390], schemes: ['dark'] });
  await noOverflow('livros novos');

  step('"Adicionar à fila" cria um Quero ler com os dados conferidos');
  await page.click('[data-action="suggest-add"][data-index="0"]');
  await toastHas(/entrou na fila Quero ler/);
  const added = (await readState()).books.find((b) => b.title === 'Quarto de despejo: diário de uma favelada');
  assert.equal(added.status, 'quero');
  assert.equal(added.authors, 'Carolina Maria de Jesus');
  assert.equal(added.isbn, '9788508171279');
  assert.equal(added.pages, 200);
  assert.equal(added.cover, 'https://covers.openlibrary.org/b/id/101-M.jpg');
  await page.waitForFunction(() => /Já está nos seus livros/.test(document.querySelector('.sug-card').textContent));
  await shots('sugestoes-adicionado', '.page-title', { widths: [390], schemes: ['light'] });

  step('sem chave: a tela explica onde ativar');
  await page.evaluate(() => localStorage.removeItem('leituras:geminiKey'));
  await page.reload();
  await onPage('sugestoes');
  assert.match(await page.textContent('.sug-nokey'), /Ajustes › Busca com IA \(gratuita\)/);
  await shots('sugestoes-sem-chave', '.page-title', { widths: [390], schemes: ['dark'] });

  assert.deepEqual(errors, []);
  console.log('ok: IA 1.6 (trecho por foto e sugestões)');
} catch (err) {
  console.error(err);
  console.error(errors.join('\n'));
  process.exitCode = 1;
} finally {
  await browser.close();
  server.close();
}
