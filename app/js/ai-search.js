// Busca com IA (Gemini lendo resultados de busca na internet), só quando a pessoa toca em
// "Buscar com IA". Gratuita: usa só o que a cota sem cartão do Google permite.
//
// Para o livro que as bases (BrasilAPI, Open Library, Google Books) ainda não conhecem,
// como um lançamento da semana. A cota gratuita do Gemini não inclui a Busca Google
// ("grounding"), mas inclui a ferramenta url_context: o modelo abre os endereços citados
// no pedido. Então o pedido manda ler a página de resultados do DuckDuckGo (versão HTML,
// que o url_context consegue abrir) e copiar dela os dados do livro, em JSON.
//
// Duas etapas, no máximo dois pedidos ao Google por busca:
//  1. Procurar: lê os resultados de "<busca> livro" (e de "<busca> livros", se parecer nome
//     de autor). Se o Google não conseguir abrir a página, ou se ela não mostrar o livro,
//     tenta uma vez a versão "lite" do buscador (e aí não há a etapa 2).
//  2. Conferir: se o primeiro livro tem ISBN mas falta número de páginas ou ano, lê os
//     resultados da busca pelo próprio ISBN (livrarias costumam listar páginas e editora).
// Depois, main.js ainda consulta o ISBN nas bases de sempre (enrichAiResults), que valem
// mais que a IA onde têm dados (principalmente a capa).
//
// Daqui só sai o texto digitado na busca, com a chave da própria pessoa (guardada só no
// aparelho, veja prefs.js), direto para a API do Google. Tudo que a IA devolve é tratado
// como dado não confiável: cada campo é conferido (ISBN pelo dígito verificador, páginas e
// ano em faixas plausíveis), a capa nunca vem da IA e a tela passa todo texto por esc().
//
// API: generateContent (v1beta), com a ferramenta url_context. A chave vai no cabeçalho
// x-goog-api-key (as chaves novas do AI Studio, que começam com "AQ.", só funcionam assim;
// e assim ela não aparece em endereço nenhum). Sem responseSchema: o pedido é "responda só
// com JSON" e a leitura da resposta é tolerante (cercas de código, texto em volta).

import { joinAuthors, openLibraryCoverByIsbn, parseIsbn } from './books-api.js';

const API_URL = 'https://generativelanguage.googleapis.com/v1beta/models/';

/**
 * Modelos, em ordem de preferência (todos com cota gratuita). Se um deles não existir mais
 * (404, ou 400 "model not found") ou estiver sobrecarregado (503 e outros 5xx), tenta o seguinte.
 */
export const GEMINI_MODELS = ['gemini-3.5-flash-lite', 'gemini-flash-lite-latest', 'gemini-3.1-flash-lite'];

/** Tempo máximo da busca com IA quando basta um pedido (todas as tentativas de modelo). */
export const AI_TIMEOUT_MS = 25000;

/** Tempo máximo total quando é preciso o segundo pedido (conferir o ISBN). */
export const AI_CONFIRM_TIMEOUT_MS = 40000;

/** Quantos livros a IA pode sugerir. */
export const AI_RESULT_LIMIT = 3;

/** Pedidos ao Google por busca (procurar + conferir, ou procurar + página reserva). */
export const AI_MAX_STEPS = 2;

const MAX_PAGES = 5000;
const FIRST_PRINTED_YEAR = 1450;

// ---------- Páginas de resultados ----------

const plusQuery = (text) => encodeURIComponent(text).replace(/%20/g, '+');

/** Página de resultados do DuckDuckGo (versão HTML, que o url_context consegue ler). */
export function searchPageUrl(text, { lite = false } = {}) {
  return lite
    ? `https://lite.duckduckgo.com/lite/?q=${plusQuery(text)}`
    : `https://html.duckduckgo.com/html/?q=${plusQuery(text)}`;
}

/**
 * Texto da busca limpo: espaços simples, sem aspas nem controles, até 200 letras.
 * Sem metade de emoji (surrogate solto, também o que o corte em 200 deixaria): no
 * endereço da busca, encodeURIComponent lançaria URIError.
 */
export function cleanQuery(query) {
  return String(query ?? '').replace(/[\u0000-\u001f"“”]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 200)
    .replace(/([\uD800-\uDBFF][\uDC00-\uDFFF])|[\uD800-\uDFFF]/g, '$1').trim();
}

const NAME_PARTICLES = new Set(['de', 'da', 'do', 'das', 'dos', 'e', 'van', 'von', 'der', 'del', 'di', 'du', 'la', 'le']);

/**
 * Parece só um nome de pessoa ("Itamar Vieira Junior", "Freida McFadden")? Então também
 * vale procurar "<nome> livros". Duas a quatro palavras com inicial maiúscula (fora "de",
 * "da"...), sem começar por artigo.
 */
export function looksLikeAuthor(query) {
  const q = cleanQuery(query);
  if (!q || parseIsbn(q)) return false;
  const words = q.split(' ');
  if (words.length < 2 || words.length > 4 || /^(o|a|os|as|um|uma|the)$/i.test(words[0])) return false;
  return words.every((w) => NAME_PARTICLES.has(w) || /^\p{Lu}[\p{L}'.-]*$/u.test(w));
}

/** Endereços que a etapa "procurar" manda ler. */
export function findUrls(query, { lite = false } = {}) {
  const q = cleanQuery(query);
  const isbn = parseIsbn(q);
  if (isbn) return [searchPageUrl(isbn, { lite })];
  const urls = [searchPageUrl(`${q} livro`, { lite })];
  if (looksLikeAuthor(q)) urls.push(searchPageUrl(`${q} livros`, { lite }));
  return urls;
}

// ---------- Pedidos ----------

const JSON_FORMAT = '{"encontrado": true, "livros": [{"titulo": "", "subtitulo": null, "autores": [""], "editora": null, "ano": null, "paginas": null, "isbn13": null, "fontes": ["https://..."]}]}';

/** Pedido da etapa 1: ler os resultados de busca e listar os livros que aparecem neles. */
export function buildPrompt(query, { today = new Date(), lite = false } = {}) {
  const q = cleanQuery(query);
  const isbn = parseIsbn(q);
  const what = isbn ? `o livro de ISBN ${isbn}` : `o livro "${q}" (pode ser título, autor, ou os dois)`;
  const date = today.toISOString().slice(0, 10);
  const urls = findUrls(q, { lite });
  return [
    `Hoje é ${date}. Leia ${urls.length > 1 ? 'estas páginas' : 'esta página'} de resultados de busca na internet: ${urls.join(' e ')}`,
    `Nelas, identifique ${what}.`,
    'Use SOMENTE fatos escritos no texto dos resultados (títulos, trechos e endereços dos links). Não use o que você já sabe e não invente: campo ausente = null.',
    'Prefira a edição brasileira, em português do Brasil (lojas e editoras .com.br); se ela não aparecer, use a edição que aparecer. Se houver mais de um livro ou edição que combine, liste até 3, o mais provável primeiro.',
    'Responda SOMENTE com um JSON, sem texto antes ou depois, neste formato:',
    JSON_FORMAT,
    'autores: só quem escreveu o livro (sem tradutor nem ilustrador). paginas: número de páginas (inteiro), só se estiver escrito. ano: ano de publicação. isbn13: os 13 dígitos (978… ou 979…), só se estiver escrito. fontes: endereços (links) dos resultados onde você leu os dados.',
    'Se as páginas não mostrarem esse livro, responda {"encontrado": false}.',
  ].join('\n');
}

/** Pedido da etapa 2: ler os resultados da busca pelo ISBN e copiar páginas, ano e editora. */
export function buildConfirmPrompt(isbn, { title = '' } = {}) {
  const name = cleanQuery(title).slice(0, 120);
  return [
    `Leia esta página de resultados de busca na internet: ${searchPageUrl(isbn)}`,
    `Copie, só do texto dos resultados, os dados do livro de ISBN ${isbn}${name ? ` ("${name}")` : ''}: título, número de páginas, ano de publicação e editora.`,
    'Use só o que estiver escrito na página; não use o que você já sabe e não invente: campo ausente = null.',
    'Responda SOMENTE com um JSON, sem texto antes ou depois, neste formato:',
    '{"encontrado": true, "titulo": null, "paginas": null, "ano": null, "editora": null, "fontes": ["loja.com.br"]}',
    'fontes: domínios dos sites onde esses dados aparecem (por exemplo travessa.com.br).',
    'Se a página não falar desse ISBN, responda {"encontrado": false}.',
  ].join('\n');
}

/** Corpo do generateContent: o pedido e a ferramenta que lê endereços (url_context). */
export function requestBody(prompt) {
  return {
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
    tools: [{ url_context: {} }],
  };
}

/** Corpo da etapa 1 (procurar). */
export function buildRequest(query, opts) {
  return requestBody(buildPrompt(query, opts));
}

// ---------- Leitura da resposta ----------

/** Texto da resposta do modelo (sem as partes de "pensamento"). */
export function responseText(data) {
  const parts = data?.candidates?.[0]?.content?.parts;
  if (!Array.isArray(parts)) return '';
  return parts.filter((p) => typeof p?.text === 'string' && !p.thought).map((p) => p.text).join('');
}

const MAX_SCAN = 50000;
const MAX_SCAN_TRIES = 40;
const isRecord = (v) => Boolean(v) && typeof v === 'object' && !Array.isArray(v);

/** Fim do objeto/lista JSON que começa em start (respeita aspas e escapes), ou -1. */
function matchingEnd(text, start) {
  const stack = [];
  let inString = false;
  for (let i = start; i < text.length; i += 1) {
    const c = text[i];
    if (inString) {
      if (c === '\\') i += 1;
      else if (c === '"') inString = false;
    } else if (c === '"') {
      inString = true;
    } else if (c === '{' || c === '[') {
      stack.push(c === '{' ? '}' : ']');
    } else if (c === '}' || c === ']') {
      if (stack.pop() !== c) return -1;
      if (!stack.length) return i;
    }
  }
  return -1;
}

/**
 * Primeiro JSON válido no texto: inteiro, dentro de ```json ... ``` ou no meio de
 * outras palavras. Devolve o valor lido, ou null.
 */
export function extractJson(text) {
  const s = String(text ?? '').trim();
  if (!s) return null;
  const attempts = [s];
  for (const m of s.matchAll(/```(?:json|JSON)?\s*([\s\S]*?)```/g)) attempts.push(m[1].trim());
  for (const attempt of attempts) {
    try {
      return JSON.parse(attempt);
    } catch { /* tenta o próximo jeito */ }
  }
  // No meio do texto só vale objeto (ou lista com objeto): uma citação "[1]" antes do JSON
  // não pode passar por resposta. Texto e tentativas limitados, porque a resposta não é
  // confiável e milhares de "[" sem par travariam a tela (cada tentativa lê o resto do texto).
  const head = s.slice(0, MAX_SCAN);
  let tries = 0;
  for (let i = 0; i < head.length && tries < MAX_SCAN_TRIES; i += 1) {
    if (head[i] !== '{' && head[i] !== '[') continue;
    tries += 1;
    const end = matchingEnd(head, i);
    if (end < 0) continue;
    try {
      const value = JSON.parse(head.slice(i, end + 1));
      if (isRecord(value) || (Array.isArray(value) && value.some(isRecord))) return value;
    } catch { /* continua procurando */ }
  }
  return null;
}


const cleanText = (v, max = 300) => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().slice(0, max) : '');
const PLACEHOLDER = /^(null|undefined|n\/?a|-+|\?+|desconhecido|não encontrado|nao encontrado|unknown|título|titulo|sem título)$/i;

function toInt(v) {
  if (typeof v === 'number') return Number.isInteger(v) ? v : null;
  if (typeof v === 'string' && /^\s*\d{1,5}\s*$/.test(v)) return Number(v);
  return null;
}

/** Nome de domínio "limpo" (sem www.), ou '' se não parecer um domínio. */
export function domainOf(value) {
  const raw = String(value ?? '').trim();
  if (!raw) return '';
  let host = raw;
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(raw)) {
    try {
      host = new URL(raw).hostname;
    } catch {
      return '';
    }
  }
  host = host.toLowerCase().replace(/^www\./, '').replace(/\.$/, '');
  return /^(?=.{3,100}$)([a-z0-9-]+\.)+[a-z]{2,}$/.test(host) ? host : '';
}

const SEARCH_SITE = /(^|\.)duckduckgo\.com$/;

/**
 * Endereço de verdade de um link dos resultados: a versão lite do DuckDuckGo passa tudo
 * por um redirecionamento (//duckduckgo.com/l/?uddg=<endereço>&rut=...).
 */
export function unwrapLink(value) {
  if (typeof value !== 'string' || value.length > 2000) return '';
  let link = value.trim();
  if (link.startsWith('//')) link = `https:${link}`;
  const wrapped = link.match(/^https?:\/\/(?:[\w-]+\.)*duckduckgo\.com\/l\/?\?(?:[^#]*&)?uddg=([^&#]+)/i);
  if (wrapped) {
    try {
      return decodeURIComponent(wrapped[1]);
    } catch {
      return '';
    }
  }
  return link;
}

/**
 * Domínios das fontes, sem repetir e sem o próprio buscador ("travessa.com.br"), até 3;
 * os brasileiros (.br) primeiro.
 */
export function sourceDomains(list) {
  const items = Array.isArray(list) ? list : [list];
  const domains = [...new Set(items.map((v) => domainOf(unwrapLink(v))).filter((d) => d && !SEARCH_SITE.test(d)))];
  return [...domains.filter((d) => d.endsWith('.br')), ...domains.filter((d) => !d.endsWith('.br'))].slice(0, 3);
}

/**
 * ISBN escrito num dos links dos resultados: os da Amazon trazem o ISBN-10 do livro
 * (/dp/8501927597) e muitas livrarias põem o ISBN-13 no endereço. Vale só com dígito
 * verificador certo; '' se nenhum tiver.
 */
export function isbnFromLinks(list) {
  for (const wrapped of (Array.isArray(list) ? list : []).map(unwrapLink)) {
    if (!wrapped || wrapped.length > 1000) continue;
    let link = wrapped;
    try {
      link = decodeURI(wrapped).replace(/%2F/gi, '/'); // "...%2Fdp%2F655692878X"
    } catch { /* fica como veio */ }
    const amazon = link.match(/\/(?:dp|gp\/product)\/(\d{9}[\dXx])(?=[/?#]|$)/);
    const fromAmazon = amazon ? parseIsbn(amazon[1]) : null;
    if (fromAmazon) return fromAmazon;
    // Sem lookbehind na expressão: o Safari antes do 16.4 não entende e o app inteiro não abriria.
    for (const m of link.matchAll(/(?:^|\D)(97[89]\d{10})(?!\d)/g)) {
      const isbn = parseIsbn(m[1]);
      if (isbn) return isbn;
    }
  }
  return '';
}

const isbnField = (v) => (typeof v === 'string' || typeof v === 'number' ? parseIsbn(String(v)) || '' : '');

/** Lista de livros na resposta: aceita {livros:[...]}, uma lista solta ou um livro só. */
function candidateList(parsed) {
  if (Array.isArray(parsed)) return parsed;
  if (!parsed || typeof parsed !== 'object') return [];
  for (const key of ['livros', 'books', 'resultados', 'results']) {
    if (Array.isArray(parsed[key])) return parsed[key];
  }
  return 'titulo' in parsed || 'title' in parsed ? [parsed] : [];
}

/**
 * Confere e normaliza um livro vindo da IA para o formato dos outros resultados
 * ({ title, authors, pages, cover, isbn, year, ... }). null se não houver título.
 * A capa nunca vem da IA (um endereço inventado viraria imagem quebrada ou de outro livro).
 */
export function validateCandidate(raw, { today = new Date() } = {}) {
  if (!raw || typeof raw !== 'object') return null;
  const title = cleanText(raw.titulo ?? raw.title);
  if (!title || PLACEHOLDER.test(title)) return null;
  const subtitle = cleanText(raw.subtitulo ?? raw.subtitle);
  const authorList = Array.isArray(raw.autores ?? raw.authors) ? (raw.autores ?? raw.authors) : [raw.autores ?? raw.authors];
  const authors = joinAuthors(authorList.map((a) => cleanText(a, 120)).filter((a) => a && !PLACEHOLDER.test(a)));
  const pages = toInt(raw.paginas ?? raw.pages);
  const year = toInt(raw.ano ?? raw.year);
  const fontes = Array.isArray(raw.fontes ?? raw.sources) ? (raw.fontes ?? raw.sources) : [];
  const isbn = isbnField(raw.isbn13 ?? raw.isbn) || isbnField(raw.isbn10) || isbnFromLinks(fontes);
  const publisher = cleanText(raw.editora ?? raw.publisher, 120);
  return {
    source: 'IA',
    sourceId: `ia:${isbn || title.toLowerCase()}`,
    title: subtitle && !PLACEHOLDER.test(subtitle) && !title.includes(subtitle) ? `${title}: ${subtitle}` : title,
    authors,
    pages: pages >= 1 && pages <= MAX_PAGES ? pages : null,
    cover: null,
    isbn,
    year: year >= FIRST_PRINTED_YEAR && year <= today.getFullYear() + 1 ? year : null,
    publisher: PLACEHOLDER.test(publisher) ? '' : publisher,
    ai: true,
    sources: sourceDomains(fontes),
  };
}

/**
 * O Google conseguiu abrir as páginas pedidas? 'ok' (alguma abriu), 'error' (nenhuma)
 * ou 'none' (o modelo nem tentou: a resposta viria da "memória", que não serve aqui).
 */
export function retrievalStatus(data) {
  const meta = data?.candidates?.[0]?.urlContextMetadata ?? data?.candidates?.[0]?.url_context_metadata;
  const list = meta?.urlMetadata ?? meta?.url_metadata;
  if (!Array.isArray(list) || !list.length) return 'none';
  return list.some((m) => (m?.urlRetrievalStatus ?? m?.url_retrieval_status) === 'URL_RETRIEVAL_STATUS_SUCCESS') ? 'ok' : 'error';
}

const dedupeKey = (r) => r.isbn || `${r.title.toLowerCase()}|${r.authors.toLowerCase()}`;

/** Lê a resposta do modelo; lança AiSearchError('blocked'/'bad-response') se não houver JSON. */
function readJson(data) {
  if (data?.promptFeedback?.blockReason) throw new AiSearchError('blocked');
  const text = responseText(data);
  if (!text.trim()) throw new AiSearchError(data?.candidates?.[0]?.finishReason === 'SAFETY' ? 'blocked' : 'bad-response');
  const parsed = extractJson(text);
  if (parsed === null) throw new AiSearchError('bad-response');
  return parsed;
}

/**
 * Resposta da etapa "procurar" → { results, sources, notFound }.
 * notFound: a IA disse que não achou (ou não devolveu nenhum livro aproveitável).
 * Lança AiSearchError('blocked'/'bad-response') quando não há resposta legível.
 */
export function parseAiResponse(data, opts) {
  const parsed = readJson(data);
  const seen = new Set();
  const results = [];
  if (!(parsed && parsed.encontrado === false)) {
    for (const raw of candidateList(parsed)) {
      const r = validateCandidate(raw, opts);
      if (!r || seen.has(dedupeKey(r))) continue;
      seen.add(dedupeKey(r));
      results.push(r);
      if (results.length >= AI_RESULT_LIMIT) break;
    }
  }
  return { results, sources: sourceDomains(results.flatMap((r) => r.sources)), notFound: results.length === 0 };
}

/**
 * Resposta da etapa "conferir" → { title, pages, year, publisher, sources }, ou null se a
 * página não falava do ISBN (ou a resposta não deu para ler).
 */
export function parseConfirmResponse(data, { today = new Date() } = {}) {
  let parsed;
  try {
    parsed = readJson(data);
  } catch {
    return null;
  }
  const raw = Array.isArray(parsed) ? parsed.find(isRecord) : parsed;
  if (!isRecord(raw) || raw.encontrado === false) return null;
  const title = cleanText(raw.titulo ?? raw.title);
  const pages = toInt(raw.paginas ?? raw.pages);
  const year = toInt(raw.ano ?? raw.year);
  const publisher = cleanText(raw.editora ?? raw.publisher, 120);
  return {
    title: PLACEHOLDER.test(title) ? '' : title,
    pages: pages >= 1 && pages <= MAX_PAGES ? pages : null,
    year: year >= FIRST_PRINTED_YEAR && year <= today.getFullYear() + 1 ? year : null,
    publisher: PLACEHOLDER.test(publisher) ? '' : publisher,
    sources: sourceDomains(raw.fontes ?? raw.sources ?? []),
  };
}

/**
 * Junta ao livro o que a busca pelo ISBN confirmou: só preenche o que faltava.
 * Se os resultados do ISBN são de outro livro (título sem palavra em comum), o ISBN sai.
 */
export function applyConfirmation(r, checked) {
  if (!checked) return r;
  if (checked.title && !sameBook(r, { title: checked.title, authors: '' })) return { ...r, isbn: '', sourceId: `ia:${r.title.toLowerCase()}` };
  return {
    ...r,
    pages: r.pages || checked.pages,
    year: r.year || checked.year,
    publisher: r.publisher || checked.publisher,
    sources: sourceDomains([...r.sources, ...checked.sources]),
    confirmed: true,
  };
}

// ---------- Erros ----------

const MESSAGES = {
  key: 'Chave da IA inválida. Confira a chave em Ajustes.',
  permission: 'A chave não tem permissão para a IA. Em Ajustes, veja se ela está liberada para este site e para a “Generative Language API”.',
  // Na cota gratuita, o 429 é o limite por minuto ou por dia do Google.
  quota: 'Limite gratuito do Google por agora — tente mais tarde.',
  unreadable: 'Não consegui abrir a busca na internet agora. Tente de novo em instantes.',
  offline: 'Sem internet. Conecte-se e tente de novo.',
  network: 'Não consegui falar com o Google. Confira a internet e tente de novo.',
  timeout: 'A IA demorou demais para responder. Tente de novo.',
  model: 'O modelo de IA deste app não está disponível agora. Tente mais tarde.',
  server: 'O serviço de IA do Google está instável agora. Tente de novo em instantes.',
  blocked: 'A IA não quis responder a essa busca. Tente com outras palavras.',
  'bad-response': 'A IA respondeu de um jeito que não deu para entender. Tente de novo.',
  'bad-request': 'O Google recusou o pedido. Tente de novo mais tarde.',
  cancelled: '',
};

export class AiSearchError extends Error {
  constructor(code, status = 0) {
    super(MESSAGES[code] ?? MESSAGES.server);
    this.name = 'AiSearchError';
    this.code = code;
    this.status = status;
  }
}

/** Mensagem em português para o código do erro. */
export function aiErrorMessage(code) {
  return MESSAGES[code] ?? MESSAGES.server;
}

/** Erros em que adianta tentar de novo pelo botão (os de chave e de limite, não). */
export function isRetryable(code) {
  return !['key', 'permission', 'quota'].includes(code);
}

/**
 * Resposta HTTP de erro da API → código do erro.
 * 'model' e 'server' querem dizer "tente o próximo modelo" (não existe, não serve para
 * isto ou está sobrecarregado).
 */
export function mapGeminiError(status, body) {
  const err = body?.error || {};
  const message = String(err.message || '');
  const reasons = (Array.isArray(err.details) ? err.details : []).map((d) => d?.reason).filter(Boolean);
  const has = (...r) => reasons.some((x) => r.includes(x));
  if (status === 401 || has('API_KEY_INVALID', 'API_KEY_EXPIRED', 'ACCESS_TOKEN_TYPE_UNSUPPORTED') || /api key (not valid|expired|not found)/i.test(message)) return 'key';
  if (status === 429 || err.status === 'RESOURCE_EXHAUSTED') return 'quota';
  if (status === 403) return 'permission';
  if (status === 404) return 'model';
  if (status === 400 || err.status === 'INVALID_ARGUMENT' || err.status === 'FAILED_PRECONDITION') {
    if (/models?\/[\w.-]+ is not found|model.*(not found|not supported|does not exist)|not supported for generatecontent/i.test(message)) return 'model';
    if (/url[_ ]?context|tool.*not (supported|enabled)/i.test(message)) return 'model';
    return 'bad-request';
  }
  return 'server';
}

// ---------- Chamada ----------

/**
 * Busca com IA. Devolve { results, sources, notFound, model, steps } ou lança AiSearchError
 * (code: key, permission, quota, unreadable, offline, network, timeout, model, server, blocked,
 * bad-response, bad-request, cancelled).
 * onSend(): chamado uma vez, quando o primeiro pedido sai de fato para o Google (a busca
 * conta uma vez no limite do aparelho, mesmo com as duas etapas).
 * onStage('confirm', { timeoutMs, elapsedMs }): começou a etapa de conferir o ISBN.
 */
export async function aiSearch(query, {
  key, fetchImpl = fetch, signal, timeoutMs = AI_TIMEOUT_MS, confirmTimeoutMs = AI_CONFIRM_TIMEOUT_MS,
  models = GEMINI_MODELS, today = new Date(), onSend, onStage,
  online = () => (typeof navigator === 'undefined' ? true : navigator.onLine !== false),
} = {}) {
  const q = cleanQuery(query);
  if (!key) throw new AiSearchError('key');
  if (q.length < 2) return { results: [], sources: [], notFound: true, model: null, steps: 0 };
  if (!online()) throw new AiSearchError('offline');

  const started = Date.now();
  const ctrl = new AbortController();
  let timedOut = false;
  let timer = null;
  const arm = (ms) => {
    clearTimeout(timer);
    timer = setTimeout(() => { timedOut = true; ctrl.abort(); }, Math.max(0, ms));
  };
  arm(timeoutMs);
  const abort = () => ctrl.abort();
  if (signal?.aborted) abort();
  else signal?.addEventListener('abort', abort, { once: true });
  const stopped = () => new AiSearchError(timedOut ? 'timeout' : 'cancelled');
  // A corrida com o aborto garante a desistência mesmo se o fetch ignorar o sinal.
  const aborted = new Promise((_, reject) => {
    if (ctrl.signal.aborted) reject(stopped());
    else ctrl.signal.addEventListener('abort', () => reject(stopped()), { once: true });
  });
  aborted.catch(() => {});

  let sent = false;
  /** Um pedido ao Google, passando para o próximo modelo se este não existir ou estiver fora. */
  async function ask(prompt) {
    const body = JSON.stringify(requestBody(prompt));
    let lastError = new AiSearchError('model');
    for (const model of models) {
      let res;
      if (ctrl.signal.aborted) throw stopped();
      if (!sent) {
        sent = true;
        onSend?.();
      }
      try {
        res = await Promise.race([fetchImpl(`${API_URL}${encodeURIComponent(model)}:generateContent`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
          body,
          signal: ctrl.signal,
        }), aborted]);
      } catch (err) {
        if (err instanceof AiSearchError) throw err;
        if (ctrl.signal.aborted) throw stopped();
        throw new AiSearchError(online() ? 'network' : 'offline');
      }
      let data = null;
      try {
        data = await Promise.race([res.json(), aborted]);
      } catch (err) {
        if (err instanceof AiSearchError) throw err;
        data = null;
      }
      if (res.ok) {
        if (!data) throw new AiSearchError('bad-response');
        return { data, model };
      }
      const code = mapGeminiError(res.status, data);
      if (code !== 'model' && code !== 'server') throw new AiSearchError(code, res.status);
      lastError = new AiSearchError(code, res.status);
    }
    throw lastError;
  }

  try {
    // Etapa 1: procurar. Se o Google não abriu a página de resultados, a resposta não vale
    // (viria da "memória" do modelo); e às vezes a página abre sem os resultados (o buscador
    // desconfia de robô). Nos dois casos, tenta uma vez a versão lite do buscador.
    const first = await ask(buildPrompt(q, { today }));
    let out = retrievalStatus(first.data) === 'ok' ? { ...parseAiResponse(first.data, { today }), model: first.model, steps: 1 } : null;
    if (!out || out.notFound) {
      let again = null;
      try {
        again = await ask(buildPrompt(q, { today, lite: true }));
      } catch (err) {
        // Já há uma resposta ("não encontrei"): a reserva que falhou não vira erro na tela.
        if (!out || err?.code === 'cancelled') throw err;
      }
      if (again && retrievalStatus(again.data) === 'ok') {
        try {
          out = { ...parseAiResponse(again.data, { today }), model: again.model };
        } catch (err) {
          if (!out) throw err;
        }
      }
      if (!out) throw new AiSearchError('unreadable');
      out.steps = 2;
    }

    // Etapa 2: conferir o ISBN do primeiro livro, se faltam páginas ou ano.
    const top = out.results[0];
    if (out.steps >= AI_MAX_STEPS || !top?.isbn || (top.pages && top.year) || top.isbn === parseIsbn(q)) return out;
    arm(started + confirmTimeoutMs - Date.now());
    onStage?.('confirm', { timeoutMs: confirmTimeoutMs, elapsedMs: Date.now() - started });
    try {
      out.steps = 2;
      const checked = await ask(buildConfirmPrompt(top.isbn, { title: top.title }));
      if (retrievalStatus(checked.data) === 'ok') {
        out.results = [applyConfirmation(top, parseConfirmResponse(checked.data, { today })), ...out.results.slice(1)];
        out.sources = sourceDomains(out.results.flatMap((r) => r.sources));
      }
    } catch (err) {
      // A conferência é um extra: falhou (limite, tempo, instabilidade), ficam os dados da etapa 1.
      if (err?.code === 'cancelled') throw err;
    }
    return out;
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', abort);
  }
}

// ---------- Conferência pelo ISBN nas bases ----------

const STOP_WORDS = new Set(['the', 'and', 'uma', 'com', 'para', 'por', 'que', 'dos', 'das', 'nos', 'nas', 'del', 'los', 'las']);

/** Palavras com 3+ letras, sem acento e em minúsculas ("O Diário de Anne" → diario, anne). */
function words(text) {
  return String(text || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .split(/[^a-z0-9]+/).filter((w) => w.length >= 3 && !STOP_WORDS.has(w));
}

/** O livro da IA e o do ISBN parecem o mesmo? (alguma palavra do título ou do autor em comum) */
function sameBook(ai, official) {
  const shares = (a, b) => {
    const set = new Set(words(a));
    return words(b).some((w) => set.has(w));
  };
  if (!words(official.title).length && !words(official.authors).length) return true;
  return shares(ai.title, official.title) || shares(ai.authors, official.authors);
}

/**
 * Com ISBN, consulta o caminho de sempre (BrasilAPI, Open Library, Google Books) e
 * prefere os dados de lá, inclusive a capa. Sem capa de lá, fica a da Open Library pelo
 * ISBN (que some da tela se não existir). lookupIsbn(isbn) → Promise<resultado | null>.
 * Se o ISBN da IA for de outro livro (nem título nem autor batem com os dados oficiais),
 * ele é descartado e ficam os dados da IA, a não ser que seja o próprio ISBN digitado
 * na busca (queryIsbn): aí valem os dados oficiais desse ISBN.
 */
export async function enrichAiResults(results, lookupIsbn, { queryIsbn = '' } = {}) {
  return Promise.all(results.map(async (r) => {
    if (!r.isbn) return r;
    let official = null;
    try {
      official = await lookupIsbn(r.isbn);
    } catch {
      official = null;
    }
    if (!official) return { ...r, cover: r.cover || openLibraryCoverByIsbn(r.isbn) };
    if (r.isbn !== queryIsbn && !sameBook(r, official)) return { ...r, isbn: '' };
    return {
      ...r,
      title: official.title || r.title,
      authors: official.authors || r.authors,
      pages: official.pages || r.pages,
      year: official.year || r.year,
      cover: official.cover || r.cover || openLibraryCoverByIsbn(r.isbn),
      // Sinopse só das bases (a IA não escreve sinopse: inventaria).
      description: official.description || '',
      checkedBy: official.source || '',
    };
  }));
}
