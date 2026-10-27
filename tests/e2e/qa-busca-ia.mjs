// QA da busca com IA e das chaves em outro celular (depois da primeira versão).
// Gemini simulado como em busca-ia.mjs. Confere: resposta com citação "[1]" antes do JSON,
// ISBN digitado que fica no livro, ISBN da IA de outro livro, faturamento num modelo só,
// resultado atrasado que não passa por cima de outro, título enorme sem estourar a tela,
// link de chaves estranho (outros parâmetros, valores que não são texto, espaços, enorme),
// confirmação obrigatória, endereço e histórico limpos, chave fora de console, avisos,
// backup e planilha, Compartilhar indisponível (cai no prompt), só uma das chaves e o limite
// de segurança de 30 buscas com IA por mês no aparelho.
// Uso: node tests/e2e/qa-busca-ia.mjs

import { execSync } from 'node:child_process';
import { createServer } from 'node:http';
import { readFileSync, existsSync } from 'node:fs';
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

const GEMINI_KEY = 'AQ.Qa8RN6KtestetestetestetestetestetesteQAQ';
const BOOKS_KEY = `AIza${'Q'.repeat(35)}`;
const ISBN_KNOWN = '9788555325007'; // a BrasilAPI simulada conhece (Cara Debbie)
const ISBN_TYPED = '9788535914849'; // ninguém conhece
const step = (msg) => console.log(`• ${msg}`);
const b64 = (obj) => Buffer.from(typeof obj === 'string' ? obj : JSON.stringify(obj)).toString('base64url');

const reply = (text) => ({
  candidates: [{
    content: { role: 'model', parts: [{ text }] },
    finishReason: 'STOP',
    groundingMetadata: { webSearchQueries: ['livro'], groundingChunks: [{ web: { uri: 'https://vertexaisearch.cloud.google.com/x', title: 'amazon.com.br' } }] },
  }],
});
const json = (obj) => reply(JSON.stringify(obj));
const billing = { status: 429, json: { error: { code: 429, status: 'RESOURCE_EXHAUSTED', message: 'Quota exceeded for metric: generate_content_free_tier_requests, limit: 0, model: x' } } };

const geminiCalls = [];
let slowCount = 0;
function behavior(prompt, model) {
  if (prompt.includes('citacao')) {
    return { json: reply('Encontrei o livro [1] na Amazon [2]: {"encontrado": true, "livros": [{"titulo": "Livro Citado", "autores": ["Ana"], "paginas": 210}]}') };
  }
  if (prompt.includes(ISBN_TYPED)) return { json: json({ livros: [{ titulo: 'Livro do ISBN', autores: ['Bia'], paginas: 150, isbn13: null }] }) };
  if (prompt.includes('isbn trocado')) {
    return { json: json({ livros: [{ titulo: 'Jardins Secretos', autores: ['Outra Pessoa'], paginas: 120, isbn13: ISBN_KNOWN }] }) };
  }
  if (prompt.includes('faturamento')) {
    if (prompt.includes('nenhum')) return billing;
    return model === 'gemini-3.5-flash-lite' ? billing : { json: json({ livros: [{ titulo: 'Achado sem faturamento', autores: ['C'] }] }) };
  }
  if (prompt.includes('lento')) {
    slowCount += 1;
    return { delay: slowCount === 1 ? 2500 : 100, json: json({ livros: [{ titulo: `Resposta ${slowCount}`, autores: ['D'] }] }) };
  }
  if (prompt.includes('rapido')) return { json: json({ livros: [{ titulo: 'Livro Rápido', autores: ['E'] }] }) };
  if (prompt.includes('enorme')) {
    return {
      json: json({
        livros: [{
          titulo: 'T'.repeat(400), subtitulo: 'S'.repeat(400), autores: Array.from({ length: 500 }, (_, i) => `Autor${i}${'x'.repeat(200)}`),
          editora: 'E'.repeat(500), paginas: 300, fontes: [`https://${'a'.repeat(60)}.${'b'.repeat(30)}.com.br/x`],
        }],
      }),
    };
  }
  return { json: json({ encontrado: false, livros: [] }) };
}

async function mockNetwork(context) {
  await context.route('https://generativelanguage.googleapis.com/**', async (route) => {
    const req = route.request();
    const body = JSON.parse(req.postData() || '{}');
    const prompt = (body.contents?.[0]?.parts?.[0]?.text || '').toLowerCase();
    const model = req.url().match(/models\/([^:]+):generateContent/)?.[1];
    geminiCalls.push({ url: req.url(), headers: await req.allHeaders(), model });
    const b = behavior(prompt, model);
    if (b.delay) await new Promise((r) => setTimeout(r, b.delay));
    await route.fulfill({ status: b.status || 200, contentType: 'application/json', body: JSON.stringify(b.json) }).catch(() => {});
  });
  await context.route('https://brasilapi.com.br/**', (r) => (r.request().url().endsWith(ISBN_KNOWN)
    ? r.fulfill({ json: { isbn: ISBN_KNOWN, title: 'Cara Debbie', subtitle: null, authors: ['Freida McFadden'], page_count: 368, year: 2026, provider: 'cbl', cover_url: null } })
    : r.fulfill({ status: 404, json: { message: 'ISBN não encontrado' } })));
  await context.route('https://openlibrary.org/**', (r) => r.fulfill({ json: { docs: [] } }));
  await context.route('https://www.googleapis.com/**', (r) => r.fulfill({ json: { items: [] } }));
  await context.route('https://covers.openlibrary.org/**', (r) => r.fulfill({ status: 404, body: '' }));
}

const browser = await playwright.chromium.launch();
const context = await browser.newContext({
  viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, locale: 'pt-BR', acceptDownloads: true,
  userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1',
});
// Tudo que aparece em avisos (toast), para conferir que a chave nunca vai parar lá.
await context.addInitScript(() => {
  window.__toasts = [];
  new MutationObserver(() => {
    const t = document.getElementById('toast')?.textContent;
    if (t) window.__toasts.push(t);
  }).observe(document, { subtree: true, childList: true, characterData: true });
});
await mockNetwork(context);
const page = await context.newPage();
await page.clock.setFixedTime(new Date('2026-10-27T12:00:00'));

const errors = [];
const consoleText = [];
const dialogs = [];
const otherRequests = [];
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
page.on('console', (m) => {
  consoleText.push(m.text());
  if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errors.push(`console: ${m.text()}`);
});
page.on('dialog', (d) => { dialogs.push({ message: d.message(), value: d.defaultValue() }); d.dismiss(); });
page.on('request', async (req) => {
  if (!req.url().startsWith('https://generativelanguage.googleapis.com/')) otherRequests.push({ url: req.url(), headers: await req.allHeaders().catch(() => ({})) });
});

const onPage = (n) => page.waitForFunction((x) => document.getElementById('app').dataset.page === x, n);
const toastHas = (re) => page.waitForFunction((src) => new RegExp(src).test(document.getElementById('toast').textContent), re.source);
const readState = () => page.evaluate(async () => (await import('/js/db.js')).getItem('state'));
const stored = () => page.evaluate(() => [localStorage.getItem('leituras:geminiKey'), localStorage.getItem('leituras:googleBooksKey')]);

async function newBook() {
  await page.goto(`${BASE}#/inicio`);
  await onPage('inicio');
  await page.goto(`${BASE}#/novo`);
  await onPage('novo');
}
async function searchFor(text) {
  if (!(await page.$('#lookup'))) await newBook();
  await page.fill('#lookup', text);
  await page.press('#lookup', 'Enter');
  await page.waitForFunction(() => !/Buscando…/.test(document.getElementById('lookup-results').textContent)
    && document.querySelector('#lookup-results .ai-box, #lookup-results .ai-hint'));
}
async function aiSearchFor(text) {
  await searchFor(text);
  await page.click('[data-action="ai-search"]');
  await page.waitForFunction(() => {
    const box = document.querySelector('#lookup-results .ai-box');
    return box && !box.hasAttribute('aria-busy') && !box.querySelector('[data-action="ai-search"]:only-child');
  }, null, { timeout: 30000 });
  return page.textContent('#lookup-results .ai-box');
}
async function saveAndFind(title) {
  await page.click('.form-actions .btn-primary');
  for (let i = 0; i < 50; i += 1) {
    const b = (await readState())?.books?.find((x) => x.title === title);
    if (b) return b;
    await page.waitForTimeout(100);
  }
  throw new Error(`livro "${title}" não foi salvo`);
}

try {
  await page.goto(`${BASE}#/inicio`);
  await page.waitForSelector('#app[data-page]');

  step('só a chave do Google Books: dica da IA, e o link leva só ela');
  await page.evaluate((k) => localStorage.setItem('leituras:googleBooksKey', k), BOOKS_KEY);
  await page.reload();
  await searchFor('qualquer livro');
  assert.ok(await page.$('.ai-hint'));
  await page.goto(`${BASE}#/ajustes`);
  await onPage('ajustes');
  // Sem Compartilhar e sem área de transferência (como alguns navegadores): cai no prompt.
  await page.evaluate(() => {
    navigator.share = async () => { throw new DOMException('não', 'NotAllowedError'); };
    Object.defineProperty(navigator, 'clipboard', { value: { writeText: async () => { throw new Error('negado'); } }, configurable: true });
  });
  await page.click('[data-action="share-keys"]');
  await page.waitForFunction(() => true);
  for (let i = 0; i < 20 && !dialogs.length; i += 1) await page.waitForTimeout(50);
  assert.equal(dialogs.length, 1, 'link oferecido num prompt para copiar');
  const onlyBooks = JSON.parse(Buffer.from(dialogs[0].value.split('chaves=')[1], 'base64url').toString());
  assert.deepEqual(onlyBooks, { googleBooksKey: BOOKS_KEY });

  step('só a chave do Gemini: a busca com IA funciona sem a do Google Books');
  await page.evaluate((k) => { localStorage.removeItem('leituras:googleBooksKey'); localStorage.setItem('leituras:geminiKey', k); }, GEMINI_KEY);
  await page.reload();
  await onPage('ajustes');

  step('resposta com citação "[1]" antes do JSON: o livro aparece');
  let text = await aiSearchFor('livro citacao');
  assert.match(text, /Livro Citado/);
  assert.ok(!/não encontrou/.test(text));

  step('ISBN digitado: escolher o livro da IA (sem ISBN) mantém o ISBN no livro salvo');
  await newBook();
  text = await aiSearchFor(ISBN_TYPED);
  assert.match(text, /Livro do ISBN/);
  await page.click('[data-action="pick-ai-result"]');
  await page.waitForSelector('.picked');
  let saved = await saveAndFind('Livro do ISBN');
  assert.equal(saved.isbn, ISBN_TYPED);
  assert.equal(saved.pages, 150);
  assert.ok(Array.isArray(saved.journal));

  step('ISBN da IA que é de outro livro: não vira "dados conferidos" nem vai para o livro');
  await newBook();
  text = await aiSearchFor('isbn trocado');
  assert.match(text, /Jardins Secretos/);
  assert.ok(!/Cara Debbie|Dados conferidos/.test(text), text);
  await page.click('[data-action="pick-ai-result"]');
  await page.waitForSelector('.picked');
  saved = await saveAndFind('Jardins Secretos');
  assert.equal(saved.isbn, '');

  step('sem faturamento no primeiro modelo: o segundo responde; em nenhum: aviso de faturamento');
  await newBook();
  const n0 = geminiCalls.length;
  text = await aiSearchFor('faturamento');
  assert.match(text, /Achado sem faturamento/);
  assert.deepEqual(geminiCalls.slice(n0).map((c) => c.model), ['gemini-3.5-flash-lite', 'gemini-3.8-flash']);
  text = await aiSearchFor('faturamento nenhum');
  assert.match(text, /exige o faturamento ativo[\s\S]*Google Cloud[\s\S]*5\.000 buscas do mês não são cobradas[\s\S]*alerta de orçamento/);
  assert.ok(!/gr[aá]tis|gratuit/i.test(text));

  step('resultado atrasado não passa por cima: cancelar e buscar de novo');
  await newBook();
  await searchFor('livro lento');
  await page.click('[data-action="ai-search"]');
  await page.waitForSelector('.ai-box[aria-busy="true"]');
  await page.click('[data-action="ai-cancel"]');
  await page.click('[data-action="ai-search"]');
  await page.waitForSelector('.ai-result');
  await page.waitForTimeout(3000); // a primeira resposta (2,5 s) chega agora
  text = await page.textContent('#lookup-results .ai-box');
  assert.match(text, /Resposta 2/);
  assert.ok(!/Resposta 1/.test(text));
  step('… e digitar outra busca enquanto a lenta corre');
  slowCount = 0;
  await searchFor('livro lento');
  await page.click('[data-action="ai-search"]');
  await page.waitForSelector('.ai-box[aria-busy="true"]');
  text = await aiSearchFor('livro rapido');
  assert.match(text, /Livro Rápido/);
  await page.waitForTimeout(3000);
  text = await page.textContent('#lookup-results .ai-box');
  assert.match(text, /Livro Rápido/);
  assert.ok(!/Resposta/.test(text));
  assert.equal(await page.$('.ai-box[aria-busy="true"]'), null, 'nada de carregando preso');

  step('título, autores e editora enormes: limitados, e a tela não estoura em 320–430 px');
  await newBook();
  await aiSearchFor('livro enorme');
  const card = await page.textContent('.ai-result');
  assert.ok(card.length < 1500, `cartão com ${card.length} caracteres`);
  assert.match(card, /e outros/);
  for (const width of [320, 390, 430]) {
    await page.setViewportSize({ width, height: 844 });
    for (const scheme of ['light', 'dark']) {
      await page.emulateMedia({ colorScheme: scheme });
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      assert.ok(overflow <= 0, `${width}px ${scheme}: ${overflow}px sobrando`);
    }
  }
  await page.setViewportSize({ width: 390, height: 844 });

  step('links de chaves estranhos: recusados, nada salvo, endereço limpo');
  await page.evaluate(() => localStorage.clear());
  const bad = [
    b64({ geminiKey: 12345678901234, googleBooksKey: { a: 1 } }),
    b64({ geminiKey: 'AQ.abc def\nghijklmnopqrstuvwxyz' }),
    b64({ geminiKey: `AQ.${'x'.repeat(3000)}` }),
    b64('não é json'),
    '%3Cscript%3Ealert(1)%3C%2Fscript%3E',
  ];
  for (const param of bad) {
    await page.goto(`${BASE}#/inicio`);
    await onPage('inicio');
    await page.goto(`${BASE}#/ajustes?chaves=${param}`);
    await toastHas(/Esse link não tem chaves válidas/);
    assert.equal(await page.$('.key-import'), null);
    assert.equal(await page.evaluate(() => location.hash), '#/ajustes');
    assert.deepEqual(await stored(), [null, null]);
  }

  step('link com outros parâmetros e campos extras: confirma antes, endereço e histórico sem as chaves');
  await page.goto(`${BASE}#/inicio`);
  await onPage('inicio');
  const len0 = await page.evaluate(() => history.length);
  const link = `${BASE}#/ajustes?x=1&chaves=${b64({ geminiKey: GEMINI_KEY, googleBooksKey: BOOKS_KEY, livros: [{ titulo: 'x' }], admin: true })}&y=2`;
  await page.goto(link);
  await page.waitForSelector('.key-import');
  assert.equal(await page.evaluate(() => location.hash), '#/ajustes');
  assert.ok(!(await page.content()).includes(GEMINI_KEY), 'a chave inteira não aparece na página');
  assert.deepEqual(await stored(), [null, null], 'nada salvo antes do toque');
  // Sair e voltar não salva nem mantém o pedido.
  await page.goBack();
  await onPage('inicio');
  assert.equal(await page.evaluate(() => location.hash), '#/inicio');
  await page.goForward();
  await onPage('ajustes');
  assert.equal(await page.evaluate(() => location.hash), '#/ajustes', 'o histórico guarda #/ajustes, sem as chaves');
  assert.equal(await page.$('.key-import'), null);
  assert.equal(await page.evaluate(() => history.length), len0 + 1);
  assert.deepEqual(await stored(), [null, null]);
  step('colar o link com outros parâmetros dentro do app');
  await page.fill('#keys-link', `Olha: ${link} 👍`);
  await page.press('#keys-link', 'Enter');
  await page.waitForSelector('.key-import');
  assert.deepEqual(await stored(), [null, null]);
  await page.click('[data-action="import-keys"]');
  await toastHas(/Chaves salvas neste celular \(Google Books e IA\)/);
  assert.deepEqual(await stored(), [GEMINI_KEY, BOOKS_KEY]);
  assert.equal(await page.inputValue('#keys-link'), '', 'o link colado não fica no campo');

  step('a chave não vai para o backup, a planilha, a cópia de segurança, o console nem os avisos');
  await newBook();
  await aiSearchFor('livro citacao');
  await page.click('[data-action="pick-ai-result"]');
  await page.waitForSelector('.picked');
  await saveAndFind('Livro Citado');
  await page.goto(`${BASE}#/ajustes`);
  await onPage('ajustes');
  for (const action of ['export-backup', 'export-csv']) {
    const [download] = await Promise.all([page.waitForEvent('download'), page.click(`[data-action="${action}"]`)]);
    const content = readFileSync(await download.path(), 'utf8');
    assert.ok(content.includes('Livro Citado'), `${action}: tem os livros`);
    assert.ok(!content.includes(GEMINI_KEY) && !content.includes(BOOKS_KEY), `${action}: sem as chaves`);
  }
  const otherStorage = await page.evaluate(() => Object.keys(localStorage)
    .filter((k) => !['leituras:geminiKey', 'leituras:googleBooksKey'].includes(k)).map((k) => localStorage.getItem(k)).join('\n'));
  assert.ok(!otherStorage.includes(GEMINI_KEY), 'nenhum outro item do aparelho guarda a chave');
  assert.ok(!JSON.stringify(await readState()).includes(GEMINI_KEY));
  const toasts = await page.evaluate(() => window.__toasts.join('\n'));
  assert.ok(toasts.length > 0);
  assert.ok(!toasts.includes(GEMINI_KEY) && !toasts.includes(BOOKS_KEY), 'avisos sem as chaves');
  assert.ok(!consoleText.join('\n').includes(GEMINI_KEY), 'console sem a chave');
  for (const r of otherRequests) {
    assert.ok(!r.url.includes(GEMINI_KEY) && !JSON.stringify(r.headers).includes(GEMINI_KEY), `chave do Gemini foi para ${r.url}`);
  }
  for (const c of geminiCalls) {
    assert.ok(!c.url.includes(GEMINI_KEY) && !c.url.includes('chaves='));
    assert.ok(!(c.headers.referer || '').includes('chaves'), 'o Referer não leva o link das chaves');
  }

  step('limite de segurança: 30 buscas com IA por mês neste celular (só conta o que sai de fato)');
  const usage = () => page.evaluate(() => JSON.parse(localStorage.getItem('leituras:iaUso') || 'null'));
  await page.evaluate(() => localStorage.setItem('leituras:iaUso', JSON.stringify({ mes: '2026-10', n: 28 })));
  await newBook();
  await searchFor('livro citacao');
  await context.setOffline(true);
  await page.click('[data-action="ai-search"]');
  await page.waitForSelector('.ai-error');
  await context.setOffline(false);
  assert.deepEqual(await usage(), { mes: '2026-10', n: 28 }, 'sem internet não conta');
  await aiSearchFor('faturamento'); // dois modelos tentados = uma busca
  assert.deepEqual(await usage(), { mes: '2026-10', n: 29 });
  await page.goto(`${BASE}#/ajustes`);
  await onPage('ajustes');
  assert.match(await page.textContent('#set-aikey + .set-card'), /Buscas com IA este mês: 29 de 30/);
  assert.match(await page.textContent('#set-aikey + .set-card .key-help'), /exige o faturamento ativo[\s\S]*5\.000 buscas do mês não são cobradas[\s\S]*alerta de orçamento/);
  await newBook();
  text = await aiSearchFor('livro citacao');
  assert.match(text, /Livro Citado/, 'a 30ª busca roda e o resultado continua escolhível');
  assert.deepEqual(await usage(), { mes: '2026-10', n: 30 });
  const calls = geminiCalls.length;
  await searchFor('livro rapido');
  assert.equal(await page.isDisabled('.ai-btn'), true);
  assert.match(await page.textContent('.ai-box'), /Limite de segurança do mês atingido \(30 buscas\)\. Volta no dia 1º\./);
  await page.click('.ai-btn', { force: true });
  await page.waitForTimeout(300);
  assert.equal(geminiCalls.length, calls, 'nada vai para o Google depois do limite');
  for (const width of [320, 430]) {
    await page.setViewportSize({ width, height: 844 });
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), `aviso do limite em ${width}px`);
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`${BASE}#/ajustes`);
  await onPage('ajustes');
  assert.match(await page.textContent('#set-aikey + .set-card'), /Limite de segurança do mês atingido/);
  step('… e no dia 1º volta');
  await page.clock.setFixedTime(new Date('2026-11-01T09:00:00'));
  await newBook();
  await searchFor('livro rapido');
  assert.equal(await page.isDisabled('[data-action="ai-search"]'), false);

  assert.deepEqual(errors, [], 'sem erros no console');
  console.log('\nOK: QA da busca com IA e das chaves');
} catch (err) {
  console.error('\nFALHOU:', err.message);
  if (errors.length) console.error(errors.join('\n'));
  process.exitCode = 1;
} finally {
  await browser.close();
  server.close();
}
