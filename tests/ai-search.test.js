import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  AI_CONFIRM_TIMEOUT_MS, AI_TIMEOUT_MS, AiSearchError, GEMINI_MODELS, aiErrorMessage, aiSearch, applyConfirmation, buildConfirmPrompt,
  buildPrompt, buildRequest, domainOf, enrichAiResults, extractJson, findUrls, isRetryable, isbnFromLinks, looksLikeAuthor,
  mapGeminiError, parseAiResponse, parseConfirmResponse, retrievalStatus, searchPageUrl, sourceDomains, unwrapLink, validateCandidate,
} from '../app/js/ai-search.js';
import {
  AI_MONTHLY_LIMIT, AI_USAGE_STORAGE, aiLimitReached, aiSearchesThisMonth, countAiSearch, readAiUsage,
  decodeKeysParam, encodeKeysParam, keysLink, looksLikeGeminiKey, readGeminiKey, removeGeminiKey, saveGeminiKey,
} from '../app/js/prefs.js';
import { aiLookupBlock, aiLookupOptions, lookupResults } from '../app/js/views/form.js';
import { keyImportCard, settingsView } from '../app/js/views/settings.js';

const TODAY = new Date('2026-10-27T12:00:00Z');
const KEY = 'AQ.Ab8RN6KtestetestetestetestetestetesteXYZ';
const OK = 'URL_RETRIEVAL_STATUS_SUCCESS';
const FAIL = 'URL_RETRIEVAL_STATUS_ERROR';

/** Resposta do generateContent com o texto dado e o resultado da leitura das páginas (url_context). */
function geminiResponse(text, status = OK, url = 'https://html.duckduckgo.com/html/?q=x') {
  return {
    candidates: [{
      content: { role: 'model', parts: [{ text }] },
      finishReason: 'STOP',
      ...(status ? { urlContextMetadata: { urlMetadata: [{ retrievedUrl: url, urlRetrievalStatus: status }] } } : {}),
    }],
  };
}

const book = {
  titulo: 'Cara Debbie', subtitulo: null, autores: ['Freida McFadden'], paginas: 352, ano: 2026,
  isbn13: '978-85-5532-500-7', editora: 'Arqueiro', capaUrl: 'https://m.media-amazon.com/images/I/capa.jpg', fontes: ['https://www.skoob.com.br/livro/1'],
};

// ---------- Pedido ----------

test('páginas de resultados: DuckDuckGo HTML (e lite como reserva), texto codificado', () => {
  assert.equal(searchPageUrl('A Bruxa Freida McFadden livro'), 'https://html.duckduckgo.com/html/?q=A+Bruxa+Freida+McFadden+livro');
  assert.equal(searchPageUrl('Coração & cia', { lite: true }), 'https://lite.duckduckgo.com/lite/?q=Cora%C3%A7%C3%A3o+%26+cia');
  assert.equal(searchPageUrl('9788501927590'), 'https://html.duckduckgo.com/html/?q=9788501927590');
});

test('pedido: "<busca> livro"; nome de autor também "<busca> livros"; ISBN busca o próprio número', () => {
  assert.deepEqual(findUrls('Coração sem medo Itamar Vieira Junior'), ['https://html.duckduckgo.com/html/?q=Cora%C3%A7%C3%A3o+sem+medo+Itamar+Vieira+Junior+livro']);
  assert.deepEqual(findUrls('Itamar Vieira Junior'), [
    'https://html.duckduckgo.com/html/?q=Itamar+Vieira+Junior+livro',
    'https://html.duckduckgo.com/html/?q=Itamar+Vieira+Junior+livros',
  ]);
  assert.deepEqual(findUrls('85-325-1101-5', { lite: true }), ['https://lite.duckduckgo.com/lite/?q=9788532511010']);
  for (const name of ['Freida McFadden', 'Machado de Assis', 'J. K. Rowling']) assert.equal(looksLikeAuthor(name), true, name);
  for (const other of ['A Bruxa', 'Coração sem medo', 'freida', 'Cara Debbie Freida McFadden Arqueiro', '9788532511010', '']) assert.equal(looksLikeAuthor(other), false, other);
});

test('pedido: lê os resultados, só fatos da página, edição brasileira, JSON e nada inventado', () => {
  const p = buildPrompt('  Cara   Debbie  Freida ', { today: TODAY });
  assert.match(p, /https:\/\/html\.duckduckgo\.com\/html\/\?q=Cara\+Debbie\+Freida\+livro/);
  assert.match(p, /"Cara Debbie Freida"/);
  assert.match(p, /2026-10-27/);
  assert.match(p, /SOMENTE fatos escritos/);
  assert.match(p, /não invente: campo ausente = null/);
  assert.match(p, /edição brasileira/);
  assert.match(p, /até 3/);
  assert.match(p, /\{"encontrado": false\}/);
  for (const field of ['titulo', 'subtitulo', 'autores', 'editora', 'ano', 'paginas', 'isbn13', 'fontes']) {
    assert.ok(p.includes(`"${field}"`), field);
  }
  assert.ok(!/capaUrl|capa/.test(p), 'a capa não é pedida à IA');
  assert.match(buildPrompt('x y', { today: TODAY, lite: true }), /lite\.duckduckgo\.com\/lite\/\?q=x\+y\+livro/);
  assert.match(buildPrompt('Itamar Vieira Junior', { today: TODAY }), /livro e https:\/\/html\.duckduckgo\.com\/html\/\?q=Itamar\+Vieira\+Junior\+livros/);
});

test('pedido: ISBN digitado com hífens vira "o livro de ISBN ..." com 13 dígitos', () => {
  assert.match(buildPrompt('85-325-1101-5', { today: TODAY }), /o livro de ISBN 9788532511010/);
});

test('pedido: texto longo é cortado, aspas saem, e o corpo leva só a ferramenta url_context', () => {
  const body = buildRequest(`${'a'.repeat(1000)}"`, { today: TODAY });
  assert.deepEqual(body.tools, [{ url_context: {} }]);
  assert.ok(!JSON.stringify(body).includes('google_search'), 'nada de Busca Google (exige faturamento)');
  assert.equal(body.contents[0].role, 'user');
  assert.ok(!body.contents[0].parts[0].text.includes('a'.repeat(201)));
  assert.equal(body.generationConfig, undefined, 'sem temperature (os modelos 3.x não aceitam)');
  assert.match(buildPrompt('O "livro"\nnovo', { today: TODAY }), /"O livro novo"/);
});

test('pedido de conferência: lê a busca pelo ISBN e copia páginas, ano e editora', () => {
  const p = buildConfirmPrompt('9788501927590', { title: 'A bruxa' });
  assert.match(p, /https:\/\/html\.duckduckgo\.com\/html\/\?q=9788501927590/);
  assert.match(p, /ISBN 9788501927590 \("A bruxa"\)/);
  assert.match(p, /não invente: campo ausente = null/);
  for (const field of ['titulo', 'paginas', 'ano', 'editora', 'fontes']) assert.ok(p.includes(`"${field}"`), field);
});

// ---------- JSON ----------

test('extractJson: puro, em cerca de código, com texto em volta e com chaves dentro de aspas', () => {
  assert.deepEqual(extractJson('{"a":1}'), { a: 1 });
  assert.deepEqual(extractJson('Aqui está:\n```json\n{"a": [1, 2]}\n```\nEspero ter ajudado.'), { a: [1, 2] });
  assert.deepEqual(extractJson('```\n[{"b":"x"}]\n```'), [{ b: 'x' }]);
  assert.deepEqual(extractJson('Resultado: {"t": "uso de } e { no título \\" ok"} fim'), { t: 'uso de } e { no título " ok' });
  assert.deepEqual(extractJson('lixo {quebrado} e depois {"ok": true}'), { ok: true });
  assert.equal(extractJson('não encontrei nada'), null);
  assert.equal(extractJson(''), null);
  assert.equal(extractJson(null), null);
});

test('validateCandidate: normaliza para o formato dos outros resultados; capa nunca vem da IA', () => {
  const r = validateCandidate(book, { today: TODAY });
  assert.equal(r.title, 'Cara Debbie');
  assert.equal(r.authors, 'Freida McFadden');
  assert.equal(r.pages, 352);
  assert.equal(r.year, 2026);
  assert.equal(r.isbn, '9788555325007');
  assert.equal(r.publisher, 'Arqueiro');
  assert.equal(r.cover, null, 'endereço de capa da IA é ignorado');
  assert.deepEqual(r.sources, ['skoob.com.br']);
  assert.equal(r.ai, true);
  assert.equal(validateCandidate({ ...book, capaUrl: 'javascript:alert(1)' }).cover, null);
});

test('validateCandidate: ISBN com dígito errado, páginas e ano absurdos viram vazio', () => {
  const r = validateCandidate({ ...book, isbn13: '9788555325006', paginas: 9000, ano: 2099, fontes: [] }, { today: TODAY });
  assert.equal(r.isbn, '');
  assert.equal(r.pages, null);
  assert.equal(r.year, null);
  const s = validateCandidate({ ...book, paginas: '240', ano: '1999', isbn13: '8532511015' }, { today: TODAY });
  assert.equal(s.pages, 240);
  assert.equal(s.year, 1999);
  assert.equal(s.isbn, '9788532511010', 'ISBN-10 vira ISBN-13');
  assert.equal(validateCandidate({ ...book, paginas: 0 }).pages, null);
  assert.equal(validateCandidate({ ...book, paginas: 12.5 }).pages, null);
  assert.equal(validateCandidate({ ...book, paginas: 5000 }).pages, 5000);
  assert.equal(validateCandidate({ ...book, ano: 1449 }, { today: TODAY }).year, null);
  assert.equal(validateCandidate({ ...book, ano: 2027 }, { today: TODAY }).year, 2027, 'pré-venda do ano que vem vale');
});

test('validateCandidate: sem título ou com título de mentira não vale; subtítulo junta com ":"', () => {
  assert.equal(validateCandidate({ ...book, titulo: '' }), null);
  assert.equal(validateCandidate({ ...book, titulo: 'Desconhecido' }), null);
  assert.equal(validateCandidate({ ...book, titulo: null }), null);
  assert.equal(validateCandidate('texto'), null);
  assert.equal(validateCandidate({ ...book, subtitulo: 'Um suspense' }).title, 'Cara Debbie: Um suspense');
  assert.equal(validateCandidate({ ...book, autores: 'Uma Autora' }).authors, 'Uma Autora');
});

test('ISBN nos links dos resultados: Amazon /dp/ (ISBN-10) e ISBN-13 no endereço, só com dígito certo', () => {
  assert.equal(isbnFromLinks(['https://www.amazon.com.br/bruxa-Freida-McFadden/dp/8501927597']), '9788501927590');
  assert.equal(isbnFromLinks(['https://www.amazon.com.br/x/dp/B0HJCVJXZH', 'https://www.travessa.com.br/a-bruxa/artigo/9788501927590?x=1']), '9788501927590');
  assert.equal(isbnFromLinks(['https://www.amazon.com.br/Cora/dp/655692878X']), '9786556928784');
  assert.equal(isbnFromLinks(['https://www.amazon.com.br/x/dp/8501927596', 'https://loja.com.br/9788501927591']), '', 'dígito errado não vale');
  assert.equal(isbnFromLinks(['https://loja.com.br/p/197885019275901']), '', 'número maior não é ISBN');
  assert.equal(isbnFromLinks([42, null, 'texto']), '');
  const r = validateCandidate({ ...book, isbn13: null, fontes: ['https://www.amazon.com.br/bruxa/dp/8501927597'] });
  assert.equal(r.isbn, '9788501927590', 'sem isbn13, vale o do link');
});

test('fontes: domínios sem www, sem o buscador e desembrulhando o redirecionamento do DuckDuckGo lite', () => {
  assert.equal(domainOf('https://www.amazon.com.br/dp/123'), 'amazon.com.br');
  assert.equal(domainOf('skoob.com.br'), 'skoob.com.br');
  assert.equal(domainOf('WWW.Editora.COM.BR'), 'editora.com.br');
  assert.equal(domainOf('<b>x</b>'), '');
  assert.equal(domainOf('Amazon'), '');
  assert.equal(domainOf(''), '');
  const wrapped = '//duckduckgo.com/l/?uddg=https%3A%2F%2Fwww.amazon.com.br%2FCora%2Fdp%2F655692878X&rut=7f5d';
  assert.equal(unwrapLink(wrapped), 'https://www.amazon.com.br/Cora/dp/655692878X');
  assert.equal(unwrapLink('https://duckduckgo.com/l/?uddg=%E0%A4%A'), '', 'codificação quebrada');
  assert.deepEqual(sourceDomains([wrapped, 'https://html.duckduckgo.com/html/?q=x', 'travessa.com.br', 'https://www.travessa.com.br/x', 'disal.com.br', 'quarto.com.br']),
    ['amazon.com.br', 'travessa.com.br', 'disal.com.br']);
  assert.equal(isbnFromLinks([wrapped]), '9786556928784');
  assert.equal(isbnFromLinks(['https://www.amazon.com.br/Cora%C3%A7%C3%A3o%2Dsem%2Dmedo%2DTrilogia%2DTerra%2Fdp%2F655692878X']), '9786556928784', 'caminho codificado');
  assert.deepEqual(sourceDomains(['amazon.ca', 'abebooks.com', 'mercadolivre.com.br', 'travessa.com.br']), ['mercadolivre.com.br', 'travessa.com.br', 'amazon.ca'], '.br primeiro');
});

// ---------- Leitura da página (url_context) ----------

test('retrievalStatus: abriu alguma página, nenhuma, ou nem tentou', () => {
  assert.equal(retrievalStatus(geminiResponse('{}')), 'ok');
  assert.equal(retrievalStatus(geminiResponse('{}', FAIL)), 'error');
  assert.equal(retrievalStatus(geminiResponse('{}', null)), 'none');
  const two = geminiResponse('{}', FAIL);
  two.candidates[0].urlContextMetadata.urlMetadata.push({ retrievedUrl: 'x', urlRetrievalStatus: OK });
  assert.equal(retrievalStatus(two), 'ok');
  assert.equal(retrievalStatus({}), 'none');
});

test('parseAiResponse: até 3 livros, sem repetidos, fontes de cada livro', () => {
  const list = [book, { ...book }, { ...book, titulo: 'Outro', isbn13: null, fontes: [] }, { titulo: 'Terceiro' }, { titulo: 'Quarto' }];
  const out = parseAiResponse(geminiResponse(`\`\`\`json\n${JSON.stringify({ encontrado: true, livros: list })}\n\`\`\``), { today: TODAY });
  assert.equal(out.results.length, 3);
  assert.deepEqual(out.results.map((r) => r.title), ['Cara Debbie', 'Outro', 'Terceiro']);
  assert.deepEqual(out.results[1].sources, []);
  assert.deepEqual(out.sources, ['skoob.com.br']);
  assert.equal(out.notFound, false);
});

test('parseAiResponse: "não encontrado" e lista vazia; pensamento do modelo é ignorado', () => {
  assert.equal(parseAiResponse(geminiResponse('{"encontrado": false}')).notFound, true);
  assert.equal(parseAiResponse(geminiResponse('{"encontrado": false, "livros": [{"titulo": "Inventado"}]}')).notFound, true);
  assert.equal(parseAiResponse(geminiResponse('[]')).notFound, true);
  const data = geminiResponse('');
  data.candidates[0].content.parts = [{ text: '{"titulo":"Pensado"}', thought: true }, { text: '{"titulo": "Real"}' }];
  assert.equal(parseAiResponse(data).results[0].title, 'Real');
});

test('parseAiResponse: resposta sem texto ou bloqueada vira erro claro', () => {
  assert.throws(() => parseAiResponse({ candidates: [{ finishReason: 'SAFETY' }] }), (e) => e.code === 'blocked');
  assert.throws(() => parseAiResponse({ promptFeedback: { blockReason: 'OTHER' } }), (e) => e.code === 'blocked');
  assert.throws(() => parseAiResponse(geminiResponse('Desculpe, não sei.')), (e) => e.code === 'bad-response');
});

test('conferência: lê páginas, ano e editora; só preenche o que faltava; título de outro livro tira o ISBN', () => {
  const c = parseConfirmResponse(geminiResponse('```json\n{"encontrado": true, "titulo": "A bruxa", "paginas": 364, "ano": "2026", "editora": "Record", "fontes": ["travessa.com.br", "https://html.duckduckgo.com/html/?q=1"]}\n```'), { today: TODAY });
  assert.deepEqual(c, { title: 'A bruxa', pages: 364, year: 2026, publisher: 'Record', sources: ['travessa.com.br'] });
  assert.equal(parseConfirmResponse(geminiResponse('{"encontrado": false}')), null);
  assert.equal(parseConfirmResponse(geminiResponse('não sei')), null);
  assert.equal(parseConfirmResponse(geminiResponse('{"paginas": 99999, "ano": 3000}'), { today: TODAY }).pages, null);
  const r = validateCandidate({ titulo: 'A Bruxa', autores: ['Freida McFadden'], paginas: null, ano: null, isbn13: '9788501927590', fontes: ['https://www.amazon.com.br/x'] }, { today: TODAY });
  const merged = applyConfirmation(r, c);
  assert.equal(merged.pages, 364);
  assert.equal(merged.year, 2026);
  assert.equal(merged.publisher, 'Record');
  assert.deepEqual(merged.sources, ['amazon.com.br', 'travessa.com.br']);
  assert.equal(merged.confirmed, true);
  assert.equal(applyConfirmation({ ...r, pages: 300 }, c).pages, 300, 'o que já havia fica');
  const other = applyConfirmation(r, { ...c, title: 'Manual de Jardinagem' });
  assert.equal(other.isbn, '');
  assert.equal(other.pages, null);
  assert.equal(applyConfirmation(r, null), r);
});

// ---------- Erros ----------

test('mapGeminiError: chave, permissão, limite gratuito, modelo, servidor', () => {
  const err = (code, status, message, reason) => ({ error: { code, status, message, details: reason ? [{ reason }] : [] } });
  assert.equal(mapGeminiError(400, err(400, 'INVALID_ARGUMENT', 'API key not valid. Please pass a valid API key.', 'API_KEY_INVALID')), 'key');
  assert.equal(mapGeminiError(401, err(401, 'UNAUTHENTICATED', 'API key not valid.', 'ACCESS_TOKEN_TYPE_UNSUPPORTED')), 'key');
  assert.equal(mapGeminiError(403, err(403, 'PERMISSION_DENIED', 'Requests from referer <empty> are blocked.', 'API_KEY_HTTP_REFERRER_BLOCKED')), 'permission');
  assert.equal(mapGeminiError(403, err(403, 'PERMISSION_DENIED', 'Generative Language API has not been used', 'SERVICE_DISABLED')), 'permission');
  assert.equal(mapGeminiError(429, err(429, 'RESOURCE_EXHAUSTED', 'You exceeded your current quota. limit: 500, model: x')), 'quota');
  assert.equal(mapGeminiError(429, err(429, 'RESOURCE_EXHAUSTED', 'Quota exceeded for metric: generate_content_free_tier_requests, limit: 0')), 'quota');
  assert.equal(mapGeminiError(404, err(404, 'NOT_FOUND', 'models/gemini-x is not found for API version v1beta')), 'model');
  assert.equal(mapGeminiError(400, err(400, 'INVALID_ARGUMENT', 'models/gemini-x is not found for API version v1beta, or is not supported for generateContent.')), 'model');
  assert.equal(mapGeminiError(400, err(400, 'INVALID_ARGUMENT', 'Url context tool is not supported for this model.')), 'model');
  assert.equal(mapGeminiError(400, err(400, 'INVALID_ARGUMENT', 'Invalid JSON payload')), 'bad-request');
  assert.equal(mapGeminiError(503, err(503, 'UNAVAILABLE', 'This model is currently experiencing high demand.')), 'server');
  assert.equal(mapGeminiError(500, null), 'server');
});

test('mensagens em português, sem falar de faturamento; chave e limite não oferecem "tentar de novo"', () => {
  assert.equal(aiErrorMessage('quota'), 'Limite gratuito do Google por agora — tente mais tarde.');
  assert.match(aiErrorMessage('key'), /Chave da IA inválida/);
  assert.match(aiErrorMessage('offline'), /Sem internet/);
  assert.match(aiErrorMessage('timeout'), /demorou demais/);
  assert.match(aiErrorMessage('unreadable'), /Não consegui abrir a busca na internet/);
  assert.match(aiErrorMessage('qualquer'), /instável/);
  for (const code of ['key', 'permission', 'quota', 'unreadable', 'offline', 'network', 'timeout', 'model', 'server', 'blocked', 'bad-response', 'bad-request', 'billing']) {
    assert.ok(!/faturamento|billing|cobra|cart[aã]o/i.test(aiErrorMessage(code)), code);
  }
  assert.equal(isRetryable('key'), false);
  assert.equal(isRetryable('quota'), false);
  assert.equal(isRetryable('timeout'), true);
  assert.equal(isRetryable('unreadable'), true);
  const e = new AiSearchError('permission', 403);
  assert.equal(e.code, 'permission');
  assert.equal(e.status, 403);
  assert.match(e.message, /Generative Language API/);
});

// ---------- Chamada (fetch simulado) ----------

const jsonResponse = (status, body) => ({ ok: status >= 200 && status < 300, status, json: async () => body });
const promptOf = (init) => JSON.parse(init.body).contents[0].parts[0].text;
const found = (livros, status = OK) => jsonResponse(200, geminiResponse(JSON.stringify({ encontrado: true, livros }), status));
const notFound = (status = OK) => jsonResponse(200, geminiResponse('{"encontrado": false}', status));

test('aiSearch: chave no cabeçalho (nunca no endereço), POST no primeiro modelo, url_context e DuckDuckGo no pedido', async () => {
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push({ url, init });
    return found([book]);
  };
  const out = await aiSearch('Cara Debbie', { key: KEY, fetchImpl, today: TODAY });
  assert.equal(calls.length, 1, 'com páginas e ano, não precisa conferir');
  assert.equal(calls[0].url, `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODELS[0]}:generateContent`);
  assert.deepEqual(GEMINI_MODELS, ['gemini-3.5-flash-lite', 'gemini-flash-lite-latest', 'gemini-3.1-flash-lite']);
  assert.ok(!calls[0].url.includes(KEY));
  assert.equal(calls[0].init.method, 'POST');
  assert.equal(calls[0].init.headers['x-goog-api-key'], KEY);
  assert.deepEqual(JSON.parse(calls[0].init.body).tools, [{ url_context: {} }]);
  assert.match(promptOf(calls[0].init), /html\.duckduckgo\.com\/html\/\?q=Cara\+Debbie\+livro/);
  assert.equal(out.results[0].isbn, '9788555325007');
  assert.equal(out.model, GEMINI_MODELS[0]);
  assert.equal(out.steps, 1);
});

test('aiSearch: duas etapas — com ISBN mas sem páginas, confere pela busca do ISBN (no máximo 2 pedidos)', async () => {
  const prompts = [];
  const stages = [];
  let sent = 0;
  const replies = [
    found([{ titulo: 'A bruxa', autores: ['Freida McFadden'], editora: null, ano: null, paginas: null, isbn13: null, fontes: ['https://www.amazon.com.br/bruxa-Freida-McFadden/dp/8501927597'] }]),
    jsonResponse(200, geminiResponse('{"encontrado": true, "titulo": "A BRUXA", "paginas": 364, "ano": 2026, "editora": "Record", "fontes": ["travessa.com.br"]}')),
  ];
  const fetchImpl = async (url, init) => { prompts.push(promptOf(init)); return replies.shift(); };
  const out = await aiSearch('A Bruxa Freida McFadden', {
    key: KEY, fetchImpl, today: TODAY, onSend: () => { sent += 1; }, onStage: (s, o) => stages.push([s, o.timeoutMs]),
  });
  assert.equal(prompts.length, 2);
  assert.match(prompts[1], /html\.duckduckgo\.com\/html\/\?q=9788501927590/);
  assert.deepEqual(stages, [['confirm', AI_CONFIRM_TIMEOUT_MS]]);
  assert.equal(sent, 1, 'as duas etapas contam uma busca');
  const [r] = out.results;
  assert.deepEqual([r.title, r.authors, r.pages, r.year, r.publisher, r.isbn], ['A bruxa', 'Freida McFadden', 364, 2026, 'Record', '9788501927590']);
  assert.deepEqual(r.sources, ['amazon.com.br', 'travessa.com.br']);
  assert.equal(r.cover, null);
  assert.equal(out.steps, 2);
});

test('aiSearch: sem conferência quando não há ISBN, quando já tem páginas e ano, ou quando a busca era o ISBN', async () => {
  for (const [query, livros] of [
    ['livro x', [{ titulo: 'X', autores: ['A'], isbn13: null }]],
    ['livro y', [book]],
    ['9788555325007', [{ ...book, paginas: null }]],
  ]) {
    let n = 0;
    const out = await aiSearch(query, { key: KEY, fetchImpl: async () => { n += 1; return found(livros); }, today: TODAY });
    assert.equal(n, 1, query);
    assert.equal(out.results.length, 1);
  }
});

test('aiSearch: conferência que falha (limite, 503, página que não abre, tempo) mantém o achado', async () => {
  const first = () => found([{ titulo: 'A bruxa', autores: ['Freida'], isbn13: '9788501927590' }]);
  for (const second of [
    () => jsonResponse(429, { error: { code: 429, status: 'RESOURCE_EXHAUSTED', message: 'quota' } }),
    () => jsonResponse(503, { error: { code: 503, status: 'UNAVAILABLE', message: 'high demand' } }),
    () => jsonResponse(200, geminiResponse('{"titulo": "A bruxa", "paginas": 999}', FAIL)),
    () => new Promise(() => {}),
  ]) {
    let n = 0;
    const out = await aiSearch('a bruxa', {
      key: KEY, today: TODAY, models: ['a'], timeoutMs: 1000, confirmTimeoutMs: 60,
      fetchImpl: async () => { n += 1; return n === 1 ? first() : second(); },
    });
    assert.equal(out.results[0].title, 'A bruxa');
    assert.equal(out.results[0].pages, null, 'nada da página que não abriu');
  }
  const ctrl = new AbortController();
  let n = 0;
  const p = aiSearch('a bruxa', {
    key: KEY, today: TODAY, signal: ctrl.signal,
    fetchImpl: async (url, init) => { n += 1; if (n === 1) return first(); setTimeout(() => ctrl.abort(), 5); return new Promise((_, rej) => init.signal.addEventListener('abort', () => rej(new DOMException('x', 'AbortError')))); },
  });
  await assert.rejects(p, (e) => e.code === 'cancelled', 'cancelar na conferência cancela tudo');
});

test('aiSearch: página de resultados que não abre (ERROR ou nem tentou) → tenta o DuckDuckGo lite uma vez', async () => {
  const prompts = [];
  let replies = [found([{ titulo: 'Inventado da memória', autores: ['X'] }], FAIL), found([{ titulo: 'Coração sem medo', autores: ['Itamar Vieira Junior'], isbn13: '9786556928784', ano: 2025 }])];
  const fetchImpl = async (url, init) => { prompts.push(promptOf(init)); return replies.shift(); };
  const out = await aiSearch('Coração sem medo', { key: KEY, fetchImpl, today: TODAY });
  assert.equal(prompts.length, 2, 'a página reserva conta como o segundo pedido: sem conferência depois');
  assert.match(prompts[0], /html\.duckduckgo\.com/);
  assert.match(prompts[1], /lite\.duckduckgo\.com\/lite\/\?q=Cora%C3%A7%C3%A3o\+sem\+medo\+livro/);
  assert.deepEqual(out.results.map((r) => r.title), ['Coração sem medo']);
  assert.equal(out.steps, 2);
  replies = [notFound(null), found([{ titulo: 'Achado no lite' }])];
  assert.equal((await aiSearch('xyz', { key: KEY, fetchImpl, today: TODAY })).results[0].title, 'Achado no lite');
  replies = [notFound(FAIL), found([{ titulo: 'Inventado' }], FAIL)];
  await assert.rejects(aiSearch('xyz', { key: KEY, fetchImpl, today: TODAY }), (e) => e.code === 'unreadable');
});

test('aiSearch: página abriu mas não mostrou o livro → tenta o lite; se o lite falhar, fica o "não encontrei"', async () => {
  const prompts = [];
  let replies = [notFound(), found([{ titulo: 'A bruxa', autores: ['Freida McFadden'], isbn13: '9788501927590' }])];
  const fetchImpl = async (url, init) => { prompts.push(promptOf(init)); return replies.shift(); };
  const out = await aiSearch('A Bruxa Freida McFadden', { key: KEY, fetchImpl, today: TODAY });
  assert.equal(prompts.length, 2, 'sem conferência depois do lite (máximo de 2 pedidos)');
  assert.match(prompts[1], /lite\.duckduckgo\.com/);
  assert.equal(out.results[0].title, 'A bruxa');
  assert.equal(out.steps, 2);
  for (const second of [
    () => jsonResponse(429, { error: { code: 429, status: 'RESOURCE_EXHAUSTED', message: 'quota' } }),
    () => notFound(FAIL),
    () => jsonResponse(200, geminiResponse('Desculpe.')),
  ]) {
    replies = [notFound(), second()];
    const nothing = await aiSearch('livro inexistente', { key: KEY, fetchImpl, today: TODAY, models: ['a'] });
    assert.equal(nothing.notFound, true);
    assert.equal(nothing.steps, 2);
  }
  replies = [notFound(), notFound()];
  assert.equal((await aiSearch('xyz', { key: KEY, fetchImpl, today: TODAY })).notFound, true);
});

test('aiSearch: modelo que não existe (404/400) ou sobrecarregado (503) passa para o próximo', async () => {
  const seen = [];
  const replies = [
    jsonResponse(404, { error: { code: 404, status: 'NOT_FOUND', message: 'models/a is not found' } }),
    jsonResponse(503, { error: { code: 503, status: 'UNAVAILABLE', message: 'This model is currently experiencing high demand.' } }),
    found([{ titulo: 'Achado no terceiro' }]),
  ];
  const fetchImpl = async (url) => { seen.push(url.split('/models/')[1]); return replies.shift(); };
  const out = await aiSearch('xyz', { key: KEY, fetchImpl, models: ['a', 'b', 'c'] });
  assert.deepEqual(seen, ['a:generateContent', 'b:generateContent', 'c:generateContent']);
  assert.equal(out.results[0].title, 'Achado no terceiro');
  assert.equal(out.model, 'c');
});

test('aiSearch: erros de chave e de limite gratuito param na hora; todos os modelos fora → "model"', async () => {
  let n = 0;
  const quota = async () => { n += 1; return jsonResponse(429, { error: { code: 429, status: 'RESOURCE_EXHAUSTED', message: 'quota' } }); };
  await assert.rejects(aiSearch('xyz', { key: KEY, fetchImpl: quota, models: ['a', 'b'] }), (e) => e.code === 'quota' && e.message === 'Limite gratuito do Google por agora — tente mais tarde.');
  assert.equal(n, 1);
  const bad = async () => jsonResponse(400, { error: { code: 400, message: 'API key not valid.', details: [{ reason: 'API_KEY_INVALID' }] } });
  await assert.rejects(aiSearch('xyz', { key: KEY, fetchImpl: bad }), (e) => e.code === 'key');
  const gone = async () => jsonResponse(404, { error: { code: 404 } });
  await assert.rejects(aiSearch('xyz', { key: KEY, fetchImpl: gone, models: ['a', 'b'] }), (e) => e.code === 'model');
  await assert.rejects(aiSearch('xyz', { key: '', fetchImpl: gone }), (e) => e.code === 'key');
});

test('aiSearch: sem internet, falha de rede, tempo esgotado e cancelamento', async () => {
  assert.equal(AI_TIMEOUT_MS, 25000);
  const never = (url, init) => new Promise((_, reject) => init.signal.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError'))));
  await assert.rejects(aiSearch('xyz', { key: KEY, fetchImpl: never, online: () => false }), (e) => e.code === 'offline');
  await assert.rejects(aiSearch('xyz', { key: KEY, fetchImpl: async () => { throw new TypeError('Failed to fetch'); } }), (e) => e.code === 'network');
  await assert.rejects(aiSearch('xyz', { key: KEY, fetchImpl: never, timeoutMs: 30 }), (e) => e.code === 'timeout');
  const ignoresSignal = () => new Promise(() => {});
  await assert.rejects(aiSearch('xyz', { key: KEY, fetchImpl: ignoresSignal, timeoutMs: 30 }), (e) => e.code === 'timeout');
  const ctrl = new AbortController();
  const p = aiSearch('xyz', { key: KEY, fetchImpl: never, signal: ctrl.signal });
  ctrl.abort();
  await assert.rejects(p, (e) => e.code === 'cancelled');
});

test('aiSearch: a conferência ganha prazo maior (40 s no total), não os 25 s da primeira etapa', async () => {
  let n = 0;
  const t0 = Date.now();
  const out = await aiSearch('a bruxa', {
    key: KEY, today: TODAY, timeoutMs: 80, confirmTimeoutMs: 400,
    fetchImpl: async () => {
      n += 1;
      if (n === 1) return found([{ titulo: 'A bruxa', isbn13: '9788501927590' }]);
      await new Promise((r) => setTimeout(r, 150)); // passaria dos 80 ms da primeira etapa
      return jsonResponse(200, geminiResponse('{"titulo": "A bruxa", "paginas": 364}'));
    },
  });
  assert.equal(out.results[0].pages, 364);
  assert.ok(Date.now() - t0 < 400);
});

test('aiSearch: resposta 200 sem JSON legível vira bad-response', async () => {
  const fetchImpl = async () => ({ ok: true, status: 200, json: async () => { throw new SyntaxError('x'); } });
  await assert.rejects(aiSearch('xyz', { key: KEY, fetchImpl }), (e) => e.code === 'bad-response');
  const text = async () => jsonResponse(200, geminiResponse('Desculpe, não consegui.'));
  await assert.rejects(aiSearch('xyz', { key: KEY, fetchImpl: text }), (e) => e.code === 'bad-response');
});

// ---------- Conferência pelo ISBN nas bases ----------

test('enrichAiResults: com ISBN, os dados oficiais valem (capa inclusive); sem eles, capa da Open Library pelo ISBN', async () => {
  const ai = parseAiResponse(geminiResponse(JSON.stringify({ livros: [book, { ...book, titulo: 'Sem ISBN', isbn13: null, fontes: [] }] })), { today: TODAY }).results;
  const asked = [];
  const official = { source: 'BrasilAPI (CBL)', title: 'Cara Debbie', authors: 'Freida McFadden', pages: 368, year: 2026, cover: 'https://books.google.com/capa', isbn: '9788555325007' };
  const out = await enrichAiResults(ai, async (isbn) => { asked.push(isbn); return official; });
  assert.deepEqual(asked, ['9788555325007']);
  assert.equal(out[0].pages, 368);
  assert.equal(out[0].checkedBy, 'BrasilAPI (CBL)');
  assert.equal(out[0].cover, 'https://books.google.com/capa');
  assert.equal(out[1].title, 'Sem ISBN');
  assert.equal(out[1].cover, null, 'sem ISBN, sem capa');
  const olGuess = 'https://covers.openlibrary.org/b/isbn/9788555325007-M.jpg?default=false';
  const noCover = await enrichAiResults(ai.slice(0, 1), async () => ({ ...official, cover: null }));
  assert.equal(noCover[0].cover, olGuess);
  const failed = await enrichAiResults(ai.slice(0, 1), async () => { throw new Error('offline'); });
  assert.equal(failed[0].pages, 352);
  assert.equal(failed[0].cover, olGuess);
  const none = await enrichAiResults(ai.slice(0, 1), async () => null);
  assert.equal(none[0].checkedBy, undefined);
  assert.equal(none[0].cover, olGuess);
});

// ---------- Tela ----------

const lookup = (extra = {}) => ({ query: 'cara debbie', results: [], loading: false, failed: false, searched: true, isbn: '', ...extra });

test('tela: sem chave, só a dica de Ajustes; com chave, o botão (também no "Não encontrei")', () => {
  assert.match(lookupResults(lookup()), /Ative a busca com IA em Ajustes/);
  const html = lookupResults(lookup(), { aiEnabled: true });
  assert.match(html, /Não encontrei/);
  assert.match(html, /data-action="ai-search"/);
  assert.match(html, /Buscar com IA/);
  assert.equal(aiLookupBlock(lookup({ searched: false }), true), '');
  assert.equal(aiLookupBlock(lookup({ loading: true }), true), '');
});

test('tela: texto da IA é escapado (título, autor, editora, fonte)', () => {
  const evil = { title: '<img src=x onerror=alert(1)>', authors: '<script>x</script>', pages: 10, year: 2026, publisher: '"><b>', cover: null, isbn: '', sources: ['a.com.br'], ai: true };
  const html = aiLookupBlock(lookup({ ai: { status: 'done', results: [evil] } }), true);
  assert.ok(!html.includes('<img src=x'));
  assert.ok(!html.includes('<script>'));
  assert.ok(!html.includes('"><b>'));
  assert.match(html, /&lt;img src=x onerror=alert\(1\)&gt;/);
  assert.match(html, /Encontrado pela IA · confira os dados/);
  assert.match(html, /fonte: a\.com\.br/);
});

test('tela: carregando, erro, não encontrado', () => {
  const find = aiLookupBlock(lookup({ ai: { status: 'loading', stage: 'find', timeoutMs: 25000 } }), true);
  assert.match(find, /Procurando na internet…[\s\S]*--ai-ms:25000ms;--ai-delay:0ms[\s\S]*ai-cancel/);
  const confirm = aiLookupBlock(lookup({ ai: { status: 'loading', stage: 'confirm', timeoutMs: 40000, elapsedMs: 6123.4 } }), true);
  assert.match(confirm, /Conferindo o ISBN…[\s\S]*--ai-ms:40000ms;--ai-delay:-6123ms[\s\S]*ai-cancel/, 'a barra continua de onde estava');
  assert.match(aiLookupBlock(lookup({ ai: { status: 'loading', timeoutMs: 'x', elapsedMs: '<b>' } }), true), /--ai-ms:25000ms;--ai-delay:0ms/);
  const err = aiLookupBlock(lookup({ ai: { status: 'error', message: '<b>erro</b>', retry: true } }), true);
  assert.match(err, /&lt;b&gt;erro/);
  assert.match(err, /Tentar de novo com IA/);
  assert.ok(!aiLookupBlock(lookup({ ai: { status: 'error', message: 'x', retry: false } }), true).includes('data-action="ai-search"'));
  assert.match(aiLookupBlock(lookup({ ai: { status: 'done', results: [] } }), true), /A IA não encontrou esse livro/);
});

// ---------- Chave e link para outro celular ----------

function memoryStorage() {
  const m = new Map();
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) };
}

test('chave do Gemini: salva sem espaços, avisa formato estranho, remove', () => {
  const s = memoryStorage();
  assert.equal(readGeminiKey(s), '');
  assert.deepEqual(saveGeminiKey(s, `  ${KEY} \n`), { ok: true, key: KEY, warning: false });
  assert.equal(readGeminiKey(s), KEY);
  assert.equal(saveGeminiKey(s, 'abc').warning, true);
  assert.equal(saveGeminiKey(s, '   ').ok, false);
  removeGeminiKey(s);
  assert.equal(readGeminiKey(s), '');
  assert.ok(looksLikeGeminiKey(`AIza${'a'.repeat(35)}`));
  assert.ok(!looksLikeGeminiKey('AQ.curta'));
  const broken = { getItem() { throw new Error('x'); }, setItem() { throw new Error('x'); }, removeItem() { throw new Error('x'); } };
  assert.equal(readGeminiKey(broken), '');
  assert.equal(saveGeminiKey(broken, KEY).ok, false);
  removeGeminiKey(broken);
});

test('link de chaves: ida e volta, só chaves no fragmento, nada de dados', () => {
  const g = `AIza${'B'.repeat(35)}`;
  const link = keysLink('https://neivapedro.github.io/leituras/#/inicio', { googleBooksKey: g, geminiKey: KEY });
  assert.match(link, /^https:\/\/neivapedro\.github\.io\/leituras\/#\/ajustes\?chaves=[A-Za-z0-9_-]+$/);
  assert.deepEqual(decodeKeysParam(link.split('chaves=')[1]), { googleBooksKey: g, geminiKey: KEY });
  assert.deepEqual(decodeKeysParam(`Abra: ${link} `), { googleBooksKey: g, geminiKey: KEY }, 'link inteiro colado com texto');
  assert.deepEqual(decodeKeysParam(encodeKeysParam({ geminiKey: KEY })), { geminiKey: KEY });
  assert.equal(encodeKeysParam({}), '');
  assert.equal(keysLink('https://x.com/', {}), '');
  assert.equal(encodeKeysParam({ geminiKey: '<script>alert(1)</script>' }), '', 'formato inválido não vai no link');
});

test('link de chaves: lixo, JSON estranho e campos extras são ignorados', () => {
  const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
  assert.equal(decodeKeysParam(''), null);
  assert.equal(decodeKeysParam('!!!'), null);
  assert.equal(decodeKeysParam('aGVsbG8gd29ybGQ'), null);
  assert.equal(decodeKeysParam(b64({ geminiKey: '"><img src=x>' })), null);
  assert.deepEqual(decodeKeysParam(b64({ geminiKey: KEY, books: [{ title: 'x' }], other: 1 })), { geminiKey: KEY });
  assert.equal(decodeKeysParam(b64(['x'])), null);
});

test('cartão de confirmação: mostra só o fim das chaves e avisa substituição', () => {
  const html = keyImportCard({ geminiKey: KEY, googleBooksKey: `AIza${'B'.repeat(35)}` }, { geminiKey: 'AQ.outra-chave-qualquer-0000000000' });
  assert.match(html, /Salvar as chaves de busca neste celular\?/);
  assert.match(html, /…eXYZ/);
  assert.ok(!html.includes(KEY), 'a chave inteira não aparece na tela');
  assert.match(html, /substitui a chave atual/);
  assert.match(html, /data-action="import-keys"/);
  assert.match(html, /data-action="cancel-import-keys"/);
  assert.equal(keyImportCard(null), '');
});

// ---------- Conferência de QA (bugs achados depois da primeira versão) ----------

test('QA: citação "[1]" antes do JSON não vira "não encontrei"', () => {
  const out = parseAiResponse(geminiResponse('Encontrei o livro [1], [2] na Amazon: {"encontrado": true, "livros": [{"titulo": "X", "autores": ["A"]}]}'), { today: TODAY });
  assert.equal(out.notFound, false);
  assert.equal(out.results[0].title, 'X');
  assert.deepEqual(extractJson('veja [1] e {"livros": []}'), { livros: [] });
  assert.equal(extractJson('só [1] e [2, 3]'), null);
});

test('QA: resposta com milhares de "[" ou "{" sem par não trava a tela', () => {
  for (const junk of ['['.repeat(60000), '{"a":'.repeat(30000), `${'{'.repeat(40000)} {"livros":[]}`]) {
    const t0 = Date.now();
    extractJson(junk);
    assert.ok(Date.now() - t0 < 1500, `levou ${Date.now() - t0} ms`);
  }
});

test('QA: "API Key not found" é chave inválida', () => {
  assert.equal(mapGeminiError(400, { error: { status: 'INVALID_ARGUMENT', message: 'API Key not found. Please pass a valid API key.' } }), 'key');
});

test('QA: limite gratuito (429) não passa para outro modelo; 503 "high demand" passa', async () => {
  const limit = () => jsonResponse(429, { error: { code: 429, status: 'RESOURCE_EXHAUSTED', message: 'Quota exceeded for metric: generate_content_free_tier_requests, limit: 15' } });
  const busy = () => jsonResponse(503, { error: { code: 503, status: 'UNAVAILABLE', message: 'This model is currently experiencing high demand. Spikes in demand are usually temporary.' } });
  const seen = [];
  let replies = [limit(), notFound()];
  await assert.rejects(aiSearch('xyz', { key: KEY, fetchImpl: async (url) => { seen.push(url); return replies.shift(); }, models: ['a', 'b'] }), (e) => e.code === 'quota');
  assert.equal(seen.length, 1);
  replies = [busy(), busy(), busy()];
  await assert.rejects(aiSearch('xyz', { key: KEY, fetchImpl: async () => replies.shift() }), (e) => e.code === 'server');
  replies = [busy(), found([{ titulo: 'X' }])];
  assert.equal((await aiSearch('xyz', { key: KEY, fetchImpl: async () => replies.shift() })).model, GEMINI_MODELS[1]);
});

test('QA: texto malicioso da página ou da IA vira só texto; fontes só com domínio de verdade', () => {
  const evil = {
    titulo: '<img src=x onerror=alert(1)>Livro', autores: ['<script>x</script>'], editora: '"><b>', paginas: '<b>12</b>',
    capaUrl: 'javascript:alert(1)', isbn13: '<b>978</b>', fontes: ['javascript:alert(1)', 'https://<b>x</b>', '//duckduckgo.com/l/?uddg=javascript%3Aalert(1)'],
  };
  const r = validateCandidate(evil, { today: TODAY });
  assert.equal(r.title, '<img src=x onerror=alert(1)>Livro', 'fica como texto; a tela escapa');
  assert.equal(r.pages, null);
  assert.equal(r.cover, null);
  assert.equal(r.isbn, '');
  assert.deepEqual(r.sources, []);
  const html = aiLookupBlock(lookup({ ai: { status: 'done', results: [r] } }), true);
  assert.ok(!html.includes('<img src=x') && !html.includes('<script>') && !html.includes('"><b>'));
  assert.match(html, /sem fonte informada/);
});

test('QA: ISBN da IA que é de outro livro é descartado (a não ser o ISBN digitado na busca)', async () => {
  const [r] = parseAiResponse(geminiResponse(JSON.stringify({ livros: [book] })), { today: TODAY }).results;
  const other = { source: 'BrasilAPI', title: 'Manual de Jardinagem', authors: 'Fulano de Tal', pages: 90, year: 1999, cover: null };
  const [out] = await enrichAiResults([r], async () => other);
  assert.equal(out.title, 'Cara Debbie');
  assert.equal(out.isbn, '', 'ISBN de outro livro não vai junto');
  assert.equal(out.checkedBy, undefined);
  const [typed] = await enrichAiResults([r], async () => other, { queryIsbn: r.isbn });
  assert.equal(typed.title, 'Manual de Jardinagem', 'o ISBN digitado vale: dados oficiais dele');
  assert.equal(typed.isbn, r.isbn);
  const [same] = await enrichAiResults([r], async () => ({ ...other, title: 'Dear Debbie', authors: 'Freida McFadden' }));
  assert.equal(same.checkedBy, 'BrasilAPI', 'mesmo autor: é o mesmo livro');
});

// ---------- Limite de segurança: no máximo 30 buscas com IA por mês neste aparelho ----------

function seededStorage(init = {}) {
  const m = new Map(Object.entries(init));
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k), m };
}

test('limite do mês: conta por mês, recomeça no mês seguinte, aguenta registro estragado', () => {
  assert.equal(AI_MONTHLY_LIMIT, 30);
  const s = memoryStorage();
  assert.deepEqual(readAiUsage(s), { mes: '', n: 0 });
  assert.deepEqual(countAiSearch(s, '2026-10-27'), { mes: '2026-10', n: 1 });
  assert.deepEqual(countAiSearch(s, '2026-10-31'), { mes: '2026-10', n: 2 });
  assert.equal(s.getItem(AI_USAGE_STORAGE), '{"mes":"2026-10","n":2}');
  assert.equal(aiSearchesThisMonth(readAiUsage(s), '2026-10-31'), 2);
  assert.equal(aiSearchesThisMonth(readAiUsage(s), '2026-11-01'), 0, 'dia 1º recomeça');
  assert.deepEqual(countAiSearch(s, '2026-11-01'), { mes: '2026-11', n: 1 });
  for (const bad of ['xyz', '{"mes":"2026-10","n":-3}', '{"mes":5,"n":1}', 'null']) {
    assert.deepEqual(readAiUsage(seededStorage({ [AI_USAGE_STORAGE]: bad })), { mes: '', n: 0 }, bad);
  }
  assert.deepEqual(readAiUsage({ getItem: () => { throw new Error('bloqueado'); } }), { mes: '', n: 0 });
  // Sem gravar (modo privado): a contagem em memória continua valendo.
  const blocked = { getItem: () => null, setItem: () => { throw new Error('cheio'); } };
  let usage = null;
  for (let i = 0; i < 30; i += 1) usage = countAiSearch(blocked, '2026-10-27', usage);
  assert.equal(usage.n, 30);
  assert.equal(aiLimitReached(usage, '2026-10-27'), true);
  assert.equal(aiLimitReached({ mes: '2026-10', n: 29 }, '2026-10-27'), false);
  assert.equal(aiLimitReached({ mes: '2026-09', n: 30 }, '2026-10-01'), false);
});

test('limite do mês: conta só a busca que saiu de fato, uma vez mesmo com troca de modelo', async () => {
  let sent = 0;
  const onSend = () => { sent += 1; };
  const gone = async () => jsonResponse(404, { error: { code: 404 } });
  await assert.rejects(aiSearch('xyz', { key: KEY, fetchImpl: gone, models: ['a', 'b', 'c'], onSend }));
  assert.equal(sent, 1, 'três modelos tentados, uma busca contada');
  await assert.rejects(aiSearch('xyz', { key: KEY, fetchImpl: gone, online: () => false, onSend }), (e) => e.code === 'offline');
  await assert.rejects(aiSearch('xyz', { key: '', fetchImpl: gone, onSend }), (e) => e.code === 'key');
  assert.equal(await aiSearch('x', { key: KEY, fetchImpl: gone, onSend }).then((r) => r.notFound), true);
  const ctrl = new AbortController();
  ctrl.abort();
  let fetched = 0;
  await assert.rejects(aiSearch('xyz', { key: KEY, fetchImpl: async () => { fetched += 1; return gone(); }, signal: ctrl.signal, onSend }), (e) => e.code === 'cancelled');
  assert.equal(fetched, 0);
  assert.equal(sent, 1, 'sem internet, sem chave, busca curta ou já cancelada: nada contado');
});

test('limite do mês: botão desligado com o aviso; Ajustes mostra o uso', () => {
  const html = lookupResults(lookup(), { aiEnabled: true, aiLimit: true });
  assert.match(html, /<button[^>]*class="btn-outline ai-btn" disabled/);
  assert.ok(!html.includes('data-action="ai-search"'));
  assert.match(html, /Limite de segurança do mês atingido \(30 buscas\)\. Volta no dia 1º\./);
  const retry = aiLookupBlock(lookup({ ai: { status: 'error', message: 'x', retry: true } }), true, { limitReached: true });
  assert.ok(!retry.includes('data-action="ai-search"'));
  const results = aiLookupBlock(lookup({ ai: { status: 'done', results: [validateCandidate(book, { today: TODAY })] } }), true, { limitReached: true });
  assert.match(results, /pick-ai-result/, 'resultados já achados continuam escolhíveis');
  assert.deepEqual(aiLookupOptions({ geminiKey: KEY, aiUsage: { mes: '2026-10', n: 30 } }, '2026-10-27'), { aiEnabled: true, aiLimit: true });
  assert.deepEqual(aiLookupOptions({ geminiKey: '', aiUsage: null }, '2026-10-27'), { aiEnabled: false, aiLimit: false });

  const state = { books: [], goals: {}, defaultGoal: 12, lastBackupAt: null };
  const page = (usage, geminiKey = KEY) => settingsView({ state, ui: { geminiKey, aiUsage: usage }, today: '2026-10-27' });
  assert.match(page({ mes: '2026-10', n: 2 }), /Buscas com IA este mês: 2 de 30/);
  assert.match(page({ mes: '2026-09', n: 30 }), /Buscas com IA este mês: 0 de 30/);
  assert.match(page({ mes: '2026-10', n: 30 }), /Limite de segurança do mês atingido \(30 buscas\)/);
  assert.ok(!/Buscas com IA este mês/.test(page(null, '')), 'sem chave, sem contador');
  const help = page(null);
  const card = help.slice(help.indexOf('set-aikey'), help.indexOf('set-chaves'));
  assert.match(card, /Busca com IA \(gratuita\)/);
  assert.match(card, /Usa a cota gratuita do Google, sem cartão/);
  assert.match(card, /aistudio\.google\.com\/apikey[\s\S]*se aparecer pedido de cartão ou faturamento[\s\S]*ignore/);
  assert.match(card, /no máximo 30 buscas/);
  assert.ok(!/exige o faturamento|Set up billing<\/em>, no Google|cobrad|cobra |orçamento|US\$/i.test(card), 'nada de faturamento ou preço');
});

// ---------- QA: Safari mais antigo e emoji cortado ----------

test('QA: nenhum lookbehind nas expressões do app (Safari antes do 16.4 não abriria o app)', async () => {
  const { readdir, readFile } = await import('node:fs/promises');
  const dir = new URL('../app/js/', import.meta.url);
  const files = (await readdir(dir, { recursive: true })).filter((f) => f.endsWith('.js'));
  assert.ok(files.length > 5);
  for (const f of files) {
    const src = await readFile(new URL(f, dir), 'utf8');
    assert.ok(!/\(\?<[!=]/.test(src), `${f} usa lookbehind`);
  }
  // E o ISBN-13 no meio do endereço continua achado, só quando não está colado em outro número.
  assert.equal(isbnFromLinks(['9788501927590']), '9788501927590');
  assert.equal(isbnFromLinks(['https://loja.com.br/x-9788501927590-y']), '9788501927590');
  assert.equal(isbnFromLinks(['https://loja.com.br/p/19788501927590']), '');
  assert.equal(isbnFromLinks(['https://loja.com.br/97885019275901/9788501927590']), '9788501927590');
});

test('QA: busca longa com emoji cortado no meio não quebra o endereço (URIError)', async () => {
  const q = `${'a'.repeat(199)}😀 livro`;
  assert.doesNotThrow(() => findUrls(q));
  assert.ok(!/[\uD800-\uDFFF]/.test(buildPrompt(q, { today: TODAY })));
  assert.match(findUrls('Livro 😀 bom')[0], /%F0%9F%98%80/, 'emoji inteiro fica');
  assert.doesNotThrow(() => findUrls('meio \uD83D emoji'));
  let calls = 0;
  const res = await aiSearch(q, {
    key: KEY, today: TODAY, online: () => true,
    fetchImpl: async () => { calls += 1; return new Response(JSON.stringify(geminiResponse('{"encontrado": false}')), { status: 200 }); },
  });
  assert.equal(res.notFound, true);
  assert.ok(calls >= 1, 'o pedido saiu');
});
