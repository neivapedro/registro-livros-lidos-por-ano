// Busca com IA (Gemini + Busca Google) e chaves em outro celular.
// A API do Gemini é simulada (context.route em generativelanguage.googleapis.com): sucesso com
// ISBN (conferido na BrasilAPI), sem ISBN, não encontrado, 429, chave inválida (400/401/403),
// modelo fora do ar (passa ao próximo), tempo esgotado, sem internet, HTML malicioso, cancelar
// ao digitar. Ajustes: cartão da chave, link "Enviar chaves para outro celular" (iPhone → Android),
// confirmação antes de salvar, link colado e link inválido.
// Capturas em tests/e2e/screens/busca-ia-*.png (claro e escuro, 390px; sobras em 320 e 430).
// Uso: node tests/e2e/busca-ia.mjs   (precisa do Playwright, como o smoke.mjs)

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
const BOOKS_KEY = `AIza${'B'.repeat(35)}`;
const ISBN = '9788555325007';
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');

const step = (msg) => console.log(`• ${msg}`);

// ---------- Respostas simuladas do Gemini ----------

const chunks = (...domains) => domains.map((d, i) => ({ web: { uri: `https://vertexaisearch.cloud.google.com/grounding-api-redirect/${i}`, title: d } }));
const reply = (obj, grounding = chunks('amazon.com.br', 'skoob.com.br')) => ({
  candidates: [{
    content: { role: 'model', parts: [{ text: `Encontrei:\n\`\`\`json\n${JSON.stringify(obj)}\n\`\`\`` }] },
    finishReason: 'STOP',
    groundingMetadata: { webSearchQueries: ['livro'], groundingChunks: grounding },
  }],
});
const apiError = (code, status, message, reason) => ({ error: { code, status, message, details: reason ? [{ '@type': 'type.googleapis.com/google.rpc.ErrorInfo', reason }] : [] } });

/** Comportamento do Gemini simulado conforme a palavra buscada (o prompt leva o texto digitado). */
function geminiBehavior(prompt, model) {
  if (prompt.includes('cara debbie')) {
    return { json: reply({ encontrado: true, livros: [{ titulo: 'Cara Debbie (IA)', autores: ['Freida McFadden'], paginas: 350, ano: 2026, isbn13: ISBN, editora: 'Arqueiro', idioma: 'pt', capaUrl: null, fontes: [] }] }) };
  }
  if (prompt.includes('sem isbn')) {
    return {
      json: reply({
        encontrado: true,
        livros: [
          { titulo: 'O Lançamento', subtitulo: 'Uma história', autores: ['Ana Autora'], paginas: 280, ano: 2026, isbn13: null, editora: 'Editora Nova', capaUrl: 'https://capas.exemplo.com.br/lancamento.png', fontes: ['https://www.editoranova.com.br/lancamento'] },
          { titulo: 'O Lançamento (edição de bolso)', autores: ['Ana Autora'], paginas: 99999, ano: 3000, isbn13: '9788555325006', capaUrl: 'http://capas.exemplo.com.br/bolso.png', fontes: [] },
        ],
      }, chunks('editoranova.com.br', 'amazon.com.br')),
    };
  }
  if (prompt.includes('inexistente')) return { json: reply({ encontrado: false, livros: [] }) };
  if (prompt.includes('cota')) return { status: 429, json: apiError(429, 'RESOURCE_EXHAUSTED', 'You exceeded your current quota. limit: 500') };
  if (prompt.includes('chave ruim')) return { status: 400, json: apiError(400, 'INVALID_ARGUMENT', 'API key not valid. Please pass a valid API key.', 'API_KEY_INVALID') };
  if (prompt.includes('sem permissao')) return { status: 403, json: apiError(403, 'PERMISSION_DENIED', 'Requests from referer are blocked.', 'API_KEY_HTTP_REFERRER_BLOCKED') };
  if (prompt.includes('modelo velho')) {
    return model === 'gemini-3.8-flash'
      ? { status: 404, json: apiError(404, 'NOT_FOUND', 'models/gemini-3.8-flash is not found for API version v1beta') }
      : { json: reply({ livros: [{ titulo: 'Achado no segundo modelo', autores: ['X'] }] }) };
  }
  if (prompt.includes('malicioso')) {
    return {
      json: reply({
        livros: [{
          titulo: '<img src=x onerror="window.__xss=1">Livro',
          autores: ['<script>window.__xss=2</script>', '"><b id="injetado">negrito</b>'],
          editora: '<iframe src="javascript:alert(1)"></iframe>',
          paginas: '<b>12</b>',
          capaUrl: 'javascript:window.__xss=3',
          fontes: ['javascript:alert(1)', 'https://<b>x</b>'],
        }],
      }, [{ web: { uri: 'https://vertexaisearch.cloud.google.com/x', title: '<img src=x onerror="window.__xss=4">' } }]),
    };
  }
  if (prompt.includes('demora') || prompt.includes('cancela')) return { hang: true };
  return { json: reply({ encontrado: false, livros: [] }) };
}

const geminiCalls = [];

/** Rotas de rede simuladas para um contexto (iPhone ou Android). */
async function mockNetwork(context) {
  await context.route('https://generativelanguage.googleapis.com/**', async (route) => {
    const req = route.request();
    const body = JSON.parse(req.postData() || '{}');
    const prompt = (body.contents?.[0]?.parts?.[0]?.text || '').toLowerCase();
    const model = req.url().match(/models\/([^:]+):generateContent/)?.[1];
    geminiCalls.push({ url: req.url(), method: req.method(), headers: req.headers(), body, model });
    const b = geminiBehavior(prompt, model);
    if (b.hang) return; // nunca responde: tempo esgotado ou cancelamento
    await route.fulfill({ status: b.status || 200, contentType: 'application/json', body: JSON.stringify(b.json) });
  });
  await context.route('https://brasilapi.com.br/**', (r) => (r.request().url().endsWith(ISBN)
    ? r.fulfill({ json: { isbn: ISBN, title: 'Cara Debbie', subtitle: null, authors: ['Freida McFadden'], page_count: 368, year: 2026, provider: 'cbl', cover_url: null } })
    : r.fulfill({ status: 404, json: { message: 'ISBN não encontrado' } })));
  await context.route('https://openlibrary.org/**', (r) => r.fulfill({ json: { docs: [] } }));
  await context.route('https://www.googleapis.com/**', (r) => r.fulfill({ json: { items: [] } }));
  await context.route('https://covers.openlibrary.org/**', (r) => r.fulfill({ status: 404, body: '' }));
  await context.route('https://capas.exemplo.com.br/**', (r) => r.fulfill({ contentType: 'image/png', body: PNG }));
}

const browser = await playwright.chromium.launch();
const iphone = await browser.newContext({
  viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, locale: 'pt-BR',
  userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1',
});
// O Compartilhar do iPhone: guarda o que foi compartilhado para o teste conferir.
await iphone.addInitScript(() => {
  window.__shared = null;
  navigator.share = async (data) => { window.__shared = data; };
});
await mockNetwork(iphone);
const page = await iphone.newPage();
await page.clock.setFixedTime(new Date('2026-10-27T12:00:00'));

const errors = [];
const watch = (p) => {
  p.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  p.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errors.push(`console: ${m.text()}`); });
  p.on('dialog', (d) => d.accept());
};
watch(page);

const onPage = (p, name) => p.waitForFunction((n) => document.getElementById('app').dataset.page === n, name);
const toastHas = (p, re) => p.waitForFunction((src) => new RegExp(src).test(document.getElementById('toast').textContent), re.source);
const readState = (p) => p.evaluate(async () => (await import('/js/db.js')).getItem('state'));

async function noOverflow(p, label) {
  for (const width of [320, 390, 430]) {
    await p.setViewportSize({ width, height: 844 });
    const overflow = await p.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    assert.ok(overflow <= 0, `${label}: ${width}px com ${overflow}px sobrando à direita`);
  }
  await p.setViewportSize({ width: 390, height: 844 });
}

/** Captura em 390px, no tema claro e no escuro, com o elemento dado no topo da tela. */
async function shots(p, name, selector) {
  await p.evaluate(() => document.getElementById('toast').classList.remove('show'));
  for (const scheme of ['light', 'dark']) {
    await p.emulateMedia({ colorScheme: scheme });
    await p.waitForFunction((s) => document.documentElement.dataset.theme === s, scheme).catch(() => {});
    if (selector) await p.$eval(selector, (el) => el.scrollIntoView({ block: 'start' }));
    await p.evaluate(() => window.scrollBy(0, -80));
    await p.screenshot({ path: join(SHOTS, `busca-ia-${name}-${scheme === 'light' ? 'claro' : 'escuro'}-390.png`) });
  }
  await p.emulateMedia({ colorScheme: 'dark' });
}

/** Alvos de toque novos com pelo menos 44px. */
async function tapTargets(p, selector, label) {
  const small = await p.$$eval(selector, (els) => els.filter((el) => el.offsetParent)
    .map((el) => ({ el, r: el.getBoundingClientRect() }))
    .filter(({ r }) => r.height < 44 || r.width < 44)
    .map(({ el, r }) => `${el.outerHTML.slice(0, 60)} ${Math.round(r.width)}×${Math.round(r.height)}`));
  assert.deepEqual(small, [], `${label}: alvos de toque pequenos`);
}

/** Campos com letra < 16px fazem o iPhone dar zoom. */
async function inputsAt16(p, label) {
  const small = await p.$$eval('input, select, textarea', (els) => els
    .filter((el) => parseFloat(getComputedStyle(el).fontSize) < 16).map((el) => el.outerHTML.slice(0, 60)));
  assert.deepEqual(small, [], `${label}: campos com letra < 16px`);
}

/** Livro novo, busca comum pelo texto (Enter busca na hora). */
/** Livro novo do zero (passando pelo Início, para o formulário começar limpo). */
async function newBook(p) {
  await p.goto(`${BASE}#/inicio`);
  await onPage(p, 'inicio');
  await p.goto(`${BASE}#/novo`);
  await onPage(p, 'novo');
}

async function searchFor(p, text) {
  if (!(await p.$('#lookup'))) await newBook(p);
  await p.fill('#lookup', text);
  await p.press('#lookup', 'Enter');
  await p.waitForFunction(() => !/Buscando…/.test(document.getElementById('lookup-results').textContent)
    && document.querySelector('#lookup-results .ai-box, #lookup-results .ai-hint'));
}

async function aiResult(p) {
  await p.waitForFunction(() => {
    const box = document.querySelector('#lookup-results .ai-box');
    return box && !box.hasAttribute('aria-busy');
  }, null, { timeout: 40000 });
  return p.textContent('#lookup-results .ai-box');
}

try {
  await page.goto(`${BASE}#/inicio`);
  await page.waitForSelector('#app[data-page]');
  await page.emulateMedia({ colorScheme: 'dark' });

  step('sem chave do Gemini: depois da busca, só a dica discreta de Ajustes');
  await searchFor(page, 'cara debbie');
  assert.match(await page.textContent('#lookup-results'), /Não encontrei/);
  assert.match(await page.textContent('.ai-hint'), /^Ative a busca com IA em Ajustes$/);
  assert.equal(await page.$('[data-action="ai-search"]'), null);
  assert.equal(geminiCalls.length, 0, 'nada vai para o Gemini sem chave');

  step('Ajustes: cartão da chave do Gemini (senha, ≥16px, salvar com aviso, remover, Enter)');
  await page.goto(`${BASE}#/ajustes`);
  await onPage(page, 'ajustes');
  const heads = await page.$$eval('.set-head', (els) => els.map((e) => e.textContent));
  assert.deepEqual(heads.slice(3, 6), ['Busca de livros', 'Busca com IA (Gemini)', 'Outro celular']);
  assert.equal(await page.getAttribute('#ai-key', 'type'), 'password');
  assert.match(await page.textContent('#set-aikey + .set-card .gkey-status'), /Sem chave — busca com IA desligada/);
  assert.equal(await page.isDisabled('[data-action="remove-aikey"]'), true);
  assert.equal(await page.isDisabled('[data-action="share-keys"]'), true, 'sem chave, nada a enviar');
  await page.click('.key-help summary');
  assert.match(await page.textContent('.key-help'), /aistudio\.google\.com\/apikey[\s\S]*neivapedro\.github\.io[\s\S]*Generative Language API/);
  await inputsAt16(page, 'Ajustes');
  await tapTargets(page, '#set-aikey ~ .set-card button, #set-chaves ~ .set-card button, .key-help summary', 'Ajustes');
  await page.fill('#ai-key', '  chave-estranha  ');
  await page.click('[data-action="save-aikey"]');
  await toastHas(page, /não parece uma chave do Gemini/);
  assert.equal(await page.evaluate(() => localStorage.getItem('leituras:geminiKey')), 'chave-estranha');
  await page.click('[data-action="remove-aikey"]');
  await page.waitForFunction(() => /busca com IA desligada/.test(document.querySelector('#set-aikey + .set-card .gkey-status').textContent));
  assert.equal(await page.evaluate(() => localStorage.getItem('leituras:geminiKey')), null);
  await page.fill('#ai-key', GEMINI_KEY);
  await page.press('#ai-key', 'Enter');
  await toastHas(page, /Chave salva\. O botão/);
  assert.match(await page.textContent('#set-aikey + .set-card .gkey-status'), /Chave configurada/);
  assert.ok(!JSON.stringify(await readState(page)).includes(GEMINI_KEY), 'a chave não entra nos dados (nem no backup)');
  await noOverflow(page, 'Ajustes');
  await page.click('.key-help summary');
  await shots(page, 'ajustes-chave', '#set-aikey');
  await page.click('.key-help summary');
  await shots(page, 'ajustes-outro-celular', '#set-chaves');

  step('com chave: botão "Buscar com IA" (também no "Não encontrei"); carregando com Cancelar');
  await searchFor(page, 'cara debbie');
  assert.match(await page.textContent('#lookup-results'), /Não encontrei[\s\S]*Buscar com IA/);
  assert.equal(await page.$('.ai-hint'), null);
  await tapTargets(page, '.ai-btn', 'botão da IA');
  // Primeiro um pedido que demora, para ver (e fotografar) o carregando.
  await searchFor(page, 'demora');
  await page.click('[data-action="ai-search"]');
  await page.waitForSelector('.ai-box[aria-busy="true"]');
  assert.match(await page.textContent('.ai-box'), /Buscando com IA/);
  await tapTargets(page, '.ai-cancel', 'Cancelar');
  await shots(page, 'carregando', '.search-box');
  await page.click('[data-action="ai-cancel"]');
  await page.waitForSelector('[data-action="ai-search"]');

  step('sucesso com ISBN: dados conferidos na BrasilAPI, fontes da Busca Google, chave só no cabeçalho');
  await searchFor(page, 'cara debbie');
  const before = geminiCalls.length;
  await page.click('[data-action="ai-search"]');
  let text = await aiResult(page);
  assert.match(text, /Encontrado pela IA · confira os dados/);
  assert.match(text, /Cara Debbie/);
  assert.ok(!text.includes('(IA)'), 'título oficial da BrasilAPI no lugar do da IA');
  assert.match(text, /368 págs\./);
  assert.match(text, /fonte: amazon\.com\.br, skoob\.com\.br/);
  assert.match(text, /Dados conferidos: BrasilAPI \(CBL\)/);
  const call = geminiCalls[before];
  assert.equal(call.method, 'POST');
  assert.equal(call.model, 'gemini-3.8-flash');
  assert.equal(call.headers['x-goog-api-key'], GEMINI_KEY);
  assert.ok(!call.url.includes(GEMINI_KEY), 'a chave não vai no endereço');
  assert.deepEqual(call.body.tools, [{ google_search: {} }]);
  assert.match(call.body.contents[0].parts[0].text, /"cara debbie"/);
  await noOverflow(page, 'resultado da IA');
  await shots(page, 'resultado', '.search-box');
  await page.click('[data-action="pick-ai-result"]');
  await page.waitForSelector('.picked');
  assert.equal(await page.inputValue('#f-title'), 'Cara Debbie');
  assert.equal(await page.inputValue('#f-authors'), 'Freida McFadden');
  assert.equal(await page.inputValue('#f-pages'), '368');
  await page.click('.form-actions .btn-primary');
  let saved = null;
  for (let i = 0; i < 50 && !saved; i += 1) {
    saved = (await readState(page))?.books?.find((b) => b.title === 'Cara Debbie');
    if (!saved) await page.waitForTimeout(100);
  }
  assert.ok(saved, 'livro salvo');
  assert.equal(saved.isbn, ISBN, 'o ISBN vai junto, como nos outros resultados');

  step('sucesso sem ISBN: dados da IA, capa https, capa http descartada, números absurdos fora');
  await newBook(page);
  await searchFor(page, 'livro sem isbn');
  await page.click('[data-action="ai-search"]');
  text = await aiResult(page);
  const cards = await page.$$eval('.ai-result', (els) => els.map((el) => ({ text: el.textContent.replace(/\s+/g, ' '), img: el.querySelector('img')?.getAttribute('src') || null })));
  assert.equal(cards.length, 2);
  assert.match(cards[0].text, /O Lançamento: Uma história/);
  assert.match(cards[0].text, /280 págs\. · 2026/);
  assert.match(cards[0].text, /Editora Nova/);
  assert.match(cards[0].text, /fonte: editoranova\.com\.br/);
  assert.equal(cards[0].img, 'https://capas.exemplo.com.br/lancamento.png');
  assert.equal(cards[1].img, null, 'capa http não entra');
  assert.ok(!/99999|3000/.test(cards[1].text), 'páginas e ano impossíveis ficam de fora');
  assert.match(cards[1].text, /fonte: editoranova\.com\.br, amazon\.com\.br/);
  await page.click('.ai-result >> nth=0');
  await page.waitForSelector('.picked');
  assert.equal(await page.inputValue('#f-title'), 'O Lançamento: Uma história');
  assert.equal(await page.inputValue('#f-pages'), '280');

  step('não encontrado, limite (429), chave inválida (400), sem permissão (403)');
  const cases = [
    ['livro inexistente', /A IA não encontrou esse livro/, false],
    ['cota', /Limite gratuito de hoje atingido/, false],
    ['chave ruim', /Chave da IA inválida/, false],
    ['sem permissao', /não tem permissão[\s\S]*Generative Language API/, false],
  ];
  await newBook(page);
  for (const [query, re, retry] of cases) {
    await searchFor(page, query);
    await page.click('[data-action="ai-search"]');
    assert.match(await aiResult(page), re, query);
    assert.equal(Boolean(await page.$('[data-action="ai-search"]')), retry, `${query}: tentar de novo`);
  }
  await shots(page, 'erro', '.search-box');

  step('modelo que saiu do ar (404): tenta o próximo da lista');
  const n0 = geminiCalls.length;
  await searchFor(page, 'modelo velho');
  await page.click('[data-action="ai-search"]');
  assert.match(await aiResult(page), /Achado no segundo modelo/);
  assert.deepEqual(geminiCalls.slice(n0).map((c) => c.model), ['gemini-3.8-flash', 'gemini-3.5-flash-lite']);

  step('HTML malicioso nos campos: aparece como texto, nada é executado');
  await searchFor(page, 'livro malicioso');
  await page.click('[data-action="ai-search"]');
  text = await aiResult(page);
  assert.match(text, /<img src=x onerror="window.__xss=1">Livro/);
  assert.match(text, /<script>window.__xss=2<\/script>/);
  const injected = await page.evaluate(() => ({
    xss: window.__xss,
    img: document.querySelectorAll('.ai-result img').length,
    script: document.querySelectorAll('.ai-box script, .ai-box iframe, #injetado').length,
  }));
  assert.deepEqual(injected, { xss: undefined, img: 0, script: 0 });
  assert.ok(!/fonte: .*(javascript|<)/.test(text), 'fonte só com domínios de verdade');
  await page.click('[data-action="pick-ai-result"]');
  await page.waitForSelector('.picked');
  assert.equal(await page.evaluate(() => window.__xss), undefined);
  assert.equal(await page.$('.picked img'), null, 'capa javascript: não vira imagem');

  step('voltar a digitar cancela a busca com IA em andamento');
  await newBook(page);
  await searchFor(page, 'cancela');
  const aborted = page.waitForEvent('requestfailed', (r) => r.url().includes('generativelanguage'));
  await page.click('[data-action="ai-search"]');
  await page.waitForSelector('.ai-box[aria-busy="true"]');
  await page.type('#lookup', 'x');
  await aborted;
  assert.equal(await page.$('.ai-box[aria-busy="true"]'), null);

  step('sem internet: mensagem clara, sem chamar o Gemini');
  await searchFor(page, 'cara debbie');
  const n1 = geminiCalls.length;
  await iphone.setOffline(true);
  await page.click('[data-action="ai-search"]');
  assert.match(await aiResult(page), /Sem internet/);
  assert.equal(geminiCalls.length, n1);
  await iphone.setOffline(false);

  step('movimento reduzido: sem barra animada');
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await searchFor(page, 'demora 2');
  await page.click('[data-action="ai-search"]');
  await page.waitForSelector('.ai-box[aria-busy="true"]');
  assert.equal(await page.$eval('.ai-progress', (el) => getComputedStyle(el).display), 'none');
  await page.click('[data-action="ai-cancel"]');
  await page.emulateMedia({ reducedMotion: null });

  step('tempo esgotado (25 s): mensagem e "Tentar de novo"');
  await searchFor(page, 'demora');
  await page.click('[data-action="ai-search"]');
  assert.match(await aiResult(page), /A IA demorou demais para responder/);
  assert.ok(await page.$('[data-action="ai-search"]'), 'pode tentar de novo');

  step('Enviar chaves para outro celular (Compartilhar do iPhone)');
  await page.evaluate((k) => localStorage.setItem('leituras:googleBooksKey', k), BOOKS_KEY);
  await page.goto(`${BASE}#/ajustes`);
  await page.reload();
  await onPage(page, 'ajustes');
  await page.click('[data-action="share-keys"]');
  await page.waitForFunction(() => window.__shared);
  const shared = await page.evaluate(() => window.__shared);
  assert.match(shared.url, /#\/ajustes\?chaves=[A-Za-z0-9_-]+$/);
  assert.ok(shared.url.startsWith(BASE));
  const decoded = JSON.parse(Buffer.from(shared.url.split('chaves=')[1], 'base64url').toString());
  assert.deepEqual(decoded, { googleBooksKey: BOOKS_KEY, geminiKey: GEMINI_KEY }, 'só as duas chaves, nada de livros');
  assert.ok(!shared.text.includes(GEMINI_KEY));

  step('confirmação ao abrir o link (fotos no iPhone, claro e escuro)');
  await page.goto(`${BASE}#/inicio`);
  await page.goto(shared.url);
  await page.waitForSelector('.key-import');
  await shots(page, 'confirmar-chaves', '.key-import');
  await page.click('[data-action="cancel-import-keys"]');

  step('Android (Chrome): abre o link, Cancelar não salva, Salvar salva; a busca com IA funciona igual');
  const android = await browser.newContext({
    viewport: { width: 412, height: 915 }, deviceScaleFactor: 2.625, isMobile: true, hasTouch: true, locale: 'pt-BR',
    userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36',
  });
  await android.addInitScript(() => { delete Navigator.prototype.share; delete navigator.share; });
  await android.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: BASE });
  await mockNetwork(android);
  const pa = await android.newPage();
  watch(pa);
  await pa.goto(shared.url);
  await pa.waitForSelector('.key-import');
  assert.match(await pa.textContent('.key-import'), /Salvar as chaves de busca neste celular\?[\s\S]*Google Books[\s\S]*Gemini/);
  assert.ok(!(await pa.textContent('.key-import')).includes(GEMINI_KEY), 'a chave inteira não aparece');
  assert.equal(await pa.evaluate(() => location.hash), '#/ajustes', 'as chaves saem do endereço');
  assert.equal(await pa.evaluate(() => localStorage.getItem('leituras:geminiKey')), null, 'nada salvo sem confirmar');
  await noOverflow(pa, 'confirmação (Android)');
  await pa.click('[data-action="cancel-import-keys"]');
  await toastHas(pa, /Nada foi salvo/);
  assert.equal(await pa.$('.key-import'), null);
  assert.deepEqual(await pa.evaluate(() => [localStorage.getItem('leituras:geminiKey'), localStorage.getItem('leituras:googleBooksKey')]), [null, null]);
  await pa.reload();
  await onPage(pa, 'ajustes');
  assert.equal(await pa.$('.key-import'), null, 'recarregar não pergunta de novo');
  await pa.goto(`${BASE}#/inicio`);
  await pa.goto(shared.url);
  await pa.waitForSelector('.key-import');
  await pa.click('[data-action="import-keys"]');
  await toastHas(pa, /Chaves salvas neste celular \(Google Books e IA\)/);
  assert.deepEqual(await pa.evaluate(() => [localStorage.getItem('leituras:geminiKey'), localStorage.getItem('leituras:googleBooksKey')]), [GEMINI_KEY, BOOKS_KEY]);
  assert.equal(await pa.$$eval('.gkey-status.is-on', (els) => els.length), 2);
  await searchFor(pa, 'cara debbie');
  await pa.click('[data-action="ai-search"]');
  assert.match(await aiResult(pa), /Encontrado pela IA[\s\S]*368 págs\./);
  await pa.click('[data-action="pick-ai-result"]');
  assert.equal(await pa.inputValue('#f-pages'), '368');

  step('Android sem Compartilhar: o link vai para a área de transferência');
  await pa.goto(`${BASE}#/ajustes`);
  await onPage(pa, 'ajustes');
  await pa.click('[data-action="share-keys"]');
  await toastHas(pa, /Link copiado/);
  const copied = await pa.evaluate(() => navigator.clipboard.readText());
  assert.ok(copied.startsWith(BASE) && copied.includes('#/ajustes?chaves='), copied.slice(0, 60));

  step('app instalado no iPhone: colar o link dentro do app; link inválido é recusado');
  const p3 = await iphone.newPage();
  watch(p3);
  await p3.evaluate(() => localStorage.clear()).catch(() => {});
  await p3.goto(`${BASE}#/ajustes`);
  await p3.evaluate(() => localStorage.clear());
  await p3.reload();
  await onPage(p3, 'ajustes');
  await p3.fill('#keys-link', 'qualquer coisa');
  await p3.click('[data-action="paste-keys"]');
  await toastHas(p3, /Cole o link inteiro/);
  await p3.fill('#keys-link', `Abra este link: ${copied}`);
  await p3.click('[data-action="paste-keys"]');
  await p3.waitForSelector('.key-import');
  await p3.click('[data-action="import-keys"]');
  await toastHas(p3, /Chaves salvas/);
  assert.equal(await p3.evaluate(() => localStorage.getItem('leituras:geminiKey')), GEMINI_KEY);
  await p3.goto(`${BASE}#/inicio`);
  await p3.goto(`${BASE}#/ajustes?chaves=bGl4byBxdWFscXVlcg`);
  await toastHas(p3, /Esse link não tem chaves válidas/);
  assert.equal(await p3.$('.key-import'), null);
  assert.equal(await p3.evaluate(() => location.hash), '#/ajustes');
  await p3.close();
  await android.close();

  assert.deepEqual(errors, [], 'sem erros no console');
  console.log('\nOK: busca com IA e chaves em outro celular');
} catch (err) {
  await page.screenshot({ path: join(SHOTS, 'busca-ia-falha.png'), fullPage: true }).catch(() => {});
  console.error('\nFALHOU:', err.message);
  if (errors.length) console.error(errors.join('\n'));
  process.exitCode = 1;
} finally {
  await browser.close();
  server.close();
}
