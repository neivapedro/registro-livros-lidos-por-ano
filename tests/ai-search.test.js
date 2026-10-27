import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  AiSearchError, GEMINI_MODELS, aiErrorMessage, aiSearch, buildPrompt, buildRequest, domainOf, enrichAiResults, extractJson,
  groundingSources, isRetryable, mapGeminiError, parseAiResponse, safeHttpsUrl, validateCandidate, wasGrounded,
} from '../app/js/ai-search.js';
import {
  decodeKeysParam, encodeKeysParam, keysLink, looksLikeGeminiKey, readGeminiKey, removeGeminiKey, saveGeminiKey,
} from '../app/js/prefs.js';
import { aiLookupBlock, lookupResults } from '../app/js/views/form.js';
import { keyImportCard } from '../app/js/views/settings.js';

const TODAY = new Date('2026-10-27T12:00:00Z');
const KEY = 'AQ.Ab8RN6KtestetestetestetestetestetesteXYZ';

/** Resposta do generateContent com o texto dado e páginas da Busca Google. */
function geminiResponse(text, chunks = [{ web: { uri: 'https://vertexaisearch.cloud.google.com/grounding-api-redirect/abc', title: 'amazon.com.br' } }]) {
  return {
    candidates: [{
      content: { role: 'model', parts: [{ text }] },
      finishReason: 'STOP',
      groundingMetadata: { webSearchQueries: ['livro x'], groundingChunks: chunks },
    }],
  };
}

const book = {
  titulo: 'Cara Debbie', subtitulo: null, autores: ['Freida McFadden'], paginas: 352, ano: 2026,
  isbn13: '978-85-5532-500-7', editora: 'Arqueiro', idioma: 'pt', capaUrl: 'https://m.media-amazon.com/images/I/capa.jpg', fontes: ['https://www.skoob.com.br/livro/1'],
};

// ---------- Pedido ----------

test('pedido: pede o livro digitado, edição brasileira, JSON e nada inventado', () => {
  const p = buildPrompt('  Cara   Debbie  Freida ', { today: TODAY });
  assert.match(p, /"Cara Debbie Freida"/);
  assert.match(p, /2026-10-27/);
  assert.match(p, /edição brasileira/);
  assert.match(p, /Nunca invente/);
  assert.match(p, /"encontrado": false/);
  for (const field of ['titulo', 'subtitulo', 'autores', 'paginas', 'ano', 'isbn13', 'editora', 'idioma', 'capaUrl', 'fontes']) {
    assert.ok(p.includes(`"${field}"`), field);
  }
});

test('pedido: ISBN digitado com hífens vira "o livro de ISBN ..." com 13 dígitos', () => {
  assert.match(buildPrompt('85-325-1101-5', { today: TODAY }), /o livro de ISBN 9788532511010/);
});

test('pedido: texto longo é cortado e o corpo leva a ferramenta google_search', () => {
  const body = buildRequest('a'.repeat(1000), { today: TODAY });
  assert.deepEqual(body.tools, [{ google_search: {} }]);
  assert.equal(body.contents[0].role, 'user');
  assert.ok(!body.contents[0].parts[0].text.includes('a'.repeat(201)));
  assert.equal(body.generationConfig, undefined, 'sem temperature (os modelos 3.x não aceitam)');
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

test('validateCandidate: normaliza para o formato dos outros resultados', () => {
  const r = validateCandidate(book, { today: TODAY });
  assert.equal(r.title, 'Cara Debbie');
  assert.equal(r.authors, 'Freida McFadden');
  assert.equal(r.pages, 352);
  assert.equal(r.year, 2026);
  assert.equal(r.isbn, '9788555325007');
  assert.equal(r.publisher, 'Arqueiro');
  assert.equal(r.cover, 'https://m.media-amazon.com/images/I/capa.jpg');
  assert.deepEqual(r.sources, ['skoob.com.br']);
  assert.equal(r.ai, true);
});

test('validateCandidate: ISBN com dígito errado, páginas e ano absurdos viram vazio', () => {
  const r = validateCandidate({ ...book, isbn13: '9788555325006', paginas: 9000, ano: 2099 }, { today: TODAY });
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
});

test('validateCandidate: sem título ou com título de mentira não vale; subtítulo junta com ":"', () => {
  assert.equal(validateCandidate({ ...book, titulo: '' }), null);
  assert.equal(validateCandidate({ ...book, titulo: 'Desconhecido' }), null);
  assert.equal(validateCandidate({ ...book, titulo: null }), null);
  assert.equal(validateCandidate('texto'), null);
  assert.equal(validateCandidate({ ...book, subtitulo: 'Um suspense' }).title, 'Cara Debbie: Um suspense');
  assert.equal(validateCandidate({ ...book, autores: 'Uma Autora' }).authors, 'Uma Autora');
});

test('capa: só https; http, data:, javascript: e lixo ficam de fora', () => {
  assert.equal(safeHttpsUrl('https://exemplo.com/c.jpg'), 'https://exemplo.com/c.jpg');
  for (const bad of ['http://exemplo.com/c.jpg', 'javascript:alert(1)', 'data:image/png;base64,AAA', '//exemplo.com/c.jpg', 'https://localhost/x', 'capa.jpg', 42, null]) {
    assert.equal(safeHttpsUrl(bad), null, String(bad));
  }
  assert.equal(validateCandidate({ ...book, capaUrl: 'javascript:alert(1)' }).cover, null);
});

test('domínios: tira www e caminho; rejeita o que não é domínio', () => {
  assert.equal(domainOf('https://www.amazon.com.br/dp/123'), 'amazon.com.br');
  assert.equal(domainOf('skoob.com.br'), 'skoob.com.br');
  assert.equal(domainOf('WWW.Editora.COM.BR'), 'editora.com.br');
  assert.equal(domainOf('<b>x</b>'), '');
  assert.equal(domainOf('Amazon'), '');
  assert.equal(domainOf(''), '');
});

// ---------- Busca Google (grounding) ----------

test('groundingSources: domínio pelo title (o uri é redirecionamento do Google), sem repetir', () => {
  const data = geminiResponse('{}', [
    { web: { uri: 'https://vertexaisearch.cloud.google.com/grounding-api-redirect/a', title: 'amazon.com.br' } },
    { web: { uri: 'https://vertexaisearch.cloud.google.com/grounding-api-redirect/b', title: 'skoob.com.br' } },
    { web: { uri: 'https://vertexaisearch.cloud.google.com/grounding-api-redirect/c', title: 'amazon.com.br' } },
    { web: { uri: 'https://www.editoraarqueiro.com.br/livro', title: 'Cara Debbie - Arqueiro' } },
    { web: { uri: 'https://vertexaisearch.cloud.google.com/grounding-api-redirect/d', title: 'Página sem domínio' } },
    { web: { uri: 'x', domain: 'grupoeditorial.com.br', title: 'Grupo' } },
    { retrievedContext: {} },
  ]);
  assert.deepEqual(groundingSources(data), ['amazon.com.br', 'skoob.com.br', 'editoraarqueiro.com.br', 'grupoeditorial.com.br']);
  assert.equal(wasGrounded(data), true);
  assert.deepEqual(groundingSources({}), []);
  assert.equal(wasGrounded({ candidates: [{}] }), false);
});

test('parseAiResponse: até 3 livros, sem repetidos, fontes da busca quando o livro não traz', () => {
  const list = [book, { ...book }, { ...book, titulo: 'Outro', isbn13: null, fontes: [] }, { titulo: 'Terceiro' }, { titulo: 'Quarto' }];
  const out = parseAiResponse(geminiResponse(`\`\`\`json\n${JSON.stringify({ encontrado: true, livros: list })}\n\`\`\``), { today: TODAY });
  assert.equal(out.results.length, 3);
  assert.deepEqual(out.results.map((r) => r.title), ['Cara Debbie', 'Outro', 'Terceiro']);
  assert.deepEqual(out.results[1].sources, ['amazon.com.br']);
  assert.equal(out.notFound, false);
});

test('parseAiResponse: "não encontrado" e lista vazia; pensamento do modelo é ignorado', () => {
  assert.equal(parseAiResponse(geminiResponse('{"encontrado": false, "livros": []}')).notFound, true);
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

// ---------- Erros ----------

test('mapGeminiError: chave, permissão, cota, faturamento, modelo, servidor', () => {
  const err = (code, status, message, reason) => ({ error: { code, status, message, details: reason ? [{ reason }] : [] } });
  assert.equal(mapGeminiError(400, err(400, 'INVALID_ARGUMENT', 'API key not valid. Please pass a valid API key.', 'API_KEY_INVALID')), 'key');
  assert.equal(mapGeminiError(401, err(401, 'UNAUTHENTICATED', 'API key not valid.', 'ACCESS_TOKEN_TYPE_UNSUPPORTED')), 'key');
  assert.equal(mapGeminiError(403, err(403, 'PERMISSION_DENIED', 'Requests from referer <empty> are blocked.', 'API_KEY_HTTP_REFERRER_BLOCKED')), 'permission');
  assert.equal(mapGeminiError(403, err(403, 'PERMISSION_DENIED', 'Generative Language API has not been used', 'SERVICE_DISABLED')), 'permission');
  assert.equal(mapGeminiError(429, err(429, 'RESOURCE_EXHAUSTED', 'You exceeded your current quota. limit: 500, model: x')), 'quota');
  assert.equal(mapGeminiError(429, err(429, 'RESOURCE_EXHAUSTED', 'Quota exceeded for metric: ..., limit: 0, model: gemini-3.8-flash')), 'billing');
  assert.equal(mapGeminiError(404, err(404, 'NOT_FOUND', 'models/gemini-x is not found for API version v1beta')), 'model');
  assert.equal(mapGeminiError(400, err(400, 'INVALID_ARGUMENT', 'models/gemini-x is not found for API version v1beta, or is not supported for generateContent.')), 'model');
  assert.equal(mapGeminiError(400, err(400, 'INVALID_ARGUMENT', 'Google Search tool is not supported for this model on the free tier.')), 'billing');
  assert.equal(mapGeminiError(400, err(400, 'INVALID_ARGUMENT', 'Invalid JSON payload')), 'bad-request');
  assert.equal(mapGeminiError(503, err(503, 'UNAVAILABLE', 'The model is overloaded.')), 'server');
  assert.equal(mapGeminiError(500, null), 'server');
});

test('mensagens em português; chave e cota não oferecem "tentar de novo"', () => {
  assert.equal(aiErrorMessage('quota'), 'Limite gratuito de hoje atingido. Tente de novo amanhã.');
  assert.match(aiErrorMessage('key'), /Chave da IA inválida/);
  assert.match(aiErrorMessage('offline'), /Sem internet/);
  assert.match(aiErrorMessage('timeout'), /demorou demais/);
  assert.match(aiErrorMessage('qualquer'), /instável/);
  assert.equal(isRetryable('key'), false);
  assert.equal(isRetryable('quota'), false);
  assert.equal(isRetryable('timeout'), true);
  const e = new AiSearchError('permission', 403);
  assert.equal(e.code, 'permission');
  assert.equal(e.status, 403);
  assert.match(e.message, /Generative Language API/);
});

// ---------- Chamada (fetch simulado) ----------

const jsonResponse = (status, body) => ({ ok: status >= 200 && status < 300, status, json: async () => body });

test('aiSearch: chave no cabeçalho (nunca no endereço), POST no primeiro modelo', async () => {
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push({ url, init });
    return jsonResponse(200, geminiResponse(JSON.stringify({ encontrado: true, livros: [book] })));
  };
  const out = await aiSearch('Cara Debbie', { key: KEY, fetchImpl, today: TODAY });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODELS[0]}:generateContent`);
  assert.ok(!calls[0].url.includes(KEY));
  assert.equal(calls[0].init.method, 'POST');
  assert.equal(calls[0].init.headers['x-goog-api-key'], KEY);
  assert.deepEqual(JSON.parse(calls[0].init.body).tools, [{ google_search: {} }]);
  assert.equal(out.results[0].isbn, '9788555325007');
  assert.equal(out.model, GEMINI_MODELS[0]);
});

test('aiSearch: modelo que não existe (404/400) ou sobrecarregado (503) passa para o próximo', async () => {
  const seen = [];
  const replies = [
    jsonResponse(404, { error: { code: 404, status: 'NOT_FOUND', message: 'models/a is not found' } }),
    jsonResponse(503, { error: { code: 503, status: 'UNAVAILABLE', message: 'overloaded' } }),
    jsonResponse(200, geminiResponse('{"encontrado": false, "livros": []}')),
  ];
  const fetchImpl = async (url) => { seen.push(url.split('/models/')[1]); return replies.shift(); };
  const out = await aiSearch('xyz', { key: KEY, fetchImpl, models: ['a', 'b', 'c'] });
  assert.deepEqual(seen, ['a:generateContent', 'b:generateContent', 'c:generateContent']);
  assert.equal(out.notFound, true);
  assert.equal(out.model, 'c');
});

test('aiSearch: erros de chave e cota param na hora; todos os modelos fora → "model"', async () => {
  let n = 0;
  const quota = async () => { n += 1; return jsonResponse(429, { error: { code: 429, status: 'RESOURCE_EXHAUSTED', message: 'quota' } }); };
  await assert.rejects(aiSearch('xyz', { key: KEY, fetchImpl: quota, models: ['a', 'b'] }), (e) => e.code === 'quota');
  assert.equal(n, 1);
  const bad = async () => jsonResponse(400, { error: { code: 400, message: 'API key not valid.', details: [{ reason: 'API_KEY_INVALID' }] } });
  await assert.rejects(aiSearch('xyz', { key: KEY, fetchImpl: bad }), (e) => e.code === 'key');
  const gone = async () => jsonResponse(404, { error: { code: 404 } });
  await assert.rejects(aiSearch('xyz', { key: KEY, fetchImpl: gone, models: ['a', 'b'] }), (e) => e.code === 'model');
  await assert.rejects(aiSearch('xyz', { key: '', fetchImpl: gone }), (e) => e.code === 'key');
});

test('aiSearch: sem internet, falha de rede, tempo esgotado e cancelamento', async () => {
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

test('aiSearch: resposta 200 sem JSON legível vira bad-response', async () => {
  const fetchImpl = async () => ({ ok: true, status: 200, json: async () => { throw new SyntaxError('x'); } });
  await assert.rejects(aiSearch('xyz', { key: KEY, fetchImpl }), (e) => e.code === 'bad-response');
});

// ---------- Conferência pelo ISBN ----------

test('enrichAiResults: com ISBN, os dados oficiais valem; capa da IA só se não houver outra real', async () => {
  const ai = parseAiResponse(geminiResponse(JSON.stringify({ livros: [book, { ...book, titulo: 'Sem ISBN', isbn13: null }] })), { today: TODAY }).results;
  const asked = [];
  const official = { source: 'BrasilAPI (CBL)', title: 'Cara Debbie', authors: 'Freida McFadden', pages: 368, year: 2026, cover: 'https://covers.openlibrary.org/b/isbn/9788555325007-M.jpg?default=false', isbn: '9788555325007' };
  const out = await enrichAiResults(ai, async (isbn) => { asked.push(isbn); return official; });
  assert.deepEqual(asked, ['9788555325007']);
  assert.equal(out[0].pages, 368);
  assert.equal(out[0].checkedBy, 'BrasilAPI (CBL)');
  assert.equal(out[0].cover, 'https://m.media-amazon.com/images/I/capa.jpg', 'capa "pelo ISBN" é palpite: a da IA vem antes');
  assert.equal(out[1].title, 'Sem ISBN');
  const real = await enrichAiResults(ai.slice(0, 1), async () => ({ ...official, cover: 'https://books.google.com/capa' }));
  assert.equal(real[0].cover, 'https://books.google.com/capa');
  const failed = await enrichAiResults(ai.slice(0, 1), async () => { throw new Error('offline'); });
  assert.equal(failed[0].pages, 352);
  const none = await enrichAiResults(ai.slice(0, 1), async () => null);
  assert.equal(none[0].checkedBy, undefined);
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
  assert.match(aiLookupBlock(lookup({ ai: { status: 'loading', timeoutMs: 25000 } }), true), /Buscando com IA[\s\S]*ai-cancel/);
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
