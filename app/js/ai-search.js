// Busca com IA (Gemini + Busca Google), só quando a pessoa toca em "Buscar com IA".
//
// Para o livro que as bases (BrasilAPI, Open Library, Google Books) ainda não conhecem,
// como um lançamento da semana. O Gemini pesquisa no Google ("grounding") e devolve os
// dados em JSON; daqui só sai o texto digitado na busca, com a chave da própria pessoa
// (guardada só no aparelho, veja prefs.js), direto para a API do Google.
//
// Tudo que a IA devolve é tratado como dado não confiável: cada campo é conferido
// (ISBN pelo dígito verificador, páginas e ano em faixas plausíveis, capa só https) e a
// tela passa todo texto por esc(). Com ISBN, os dados oficiais (BrasilAPI, Open Library,
// Google Books) substituem os da IA (veja enrichAiResults).
//
// API: generateContent (v1beta), com a ferramenta google_search. A chave vai no cabeçalho
// x-goog-api-key (as chaves novas do AI Studio, que começam com "AQ.", só funcionam assim;
// e assim ela não aparece em endereço nenhum). Sem responseSchema: nem todo modelo aceita
// saída estruturada junto com a busca, então o pedido é "responda só com JSON" e a leitura
// da resposta é tolerante (cercas de código, texto em volta, vários candidatos).

import { joinAuthors, parseIsbn } from './books-api.js';

const API_URL = 'https://generativelanguage.googleapis.com/v1beta/models/';

/**
 * Modelos, em ordem de preferência. Se um deles não existir mais (404, ou 400 "model not
 * found"), ou estiver sobrecarregado (5xx), tenta o seguinte.
 */
export const GEMINI_MODELS = ['gemini-3.8-flash', 'gemini-3.5-flash-lite', 'gemini-3.1-flash-lite'];

/** Tempo máximo da busca com IA inteira (todas as tentativas de modelo). */
export const AI_TIMEOUT_MS = 25000;

/** Quantos livros a IA pode sugerir. */
export const AI_RESULT_LIMIT = 3;

const MAX_PAGES = 5000;
const FIRST_PRINTED_YEAR = 1450;

// ---------- Pedido ----------

/** Texto do pedido: o livro que a pessoa digitou, de preferência na edição brasileira. */
export function buildPrompt(query, { today = new Date() } = {}) {
  const q = String(query ?? '').replace(/\s+/g, ' ').trim().slice(0, 200);
  const isbn = parseIsbn(q);
  const what = isbn ? `o livro de ISBN ${isbn}` : `o livro "${q}" (pode ser título, autor, ou os dois)`;
  const date = today.toISOString().slice(0, 10);
  return [
    `Hoje é ${date}. Pesquise na Busca Google e identifique ${what}.`,
    'Pode ser um lançamento recente. Prefira a edição brasileira, em português do Brasil; se ela não existir, use a edição original.',
    'Use só dados que você encontrou nas páginas pesquisadas (livrarias, editoras, Skoob, Amazon, Google Livros). Nunca invente: campo que você não confirmou fica null.',
    'Se houver mais de um livro ou edição que combine, liste até 3, o mais provável primeiro.',
    'Responda SOMENTE com um JSON, sem texto antes ou depois, neste formato:',
    '{"encontrado": true, "livros": [{"titulo": "", "subtitulo": null, "autores": [""], "paginas": 0, "ano": 0, "isbn13": "", "editora": "", "idioma": "pt", "capaUrl": null, "fontes": ["https://..."]}]}',
    'paginas: número de páginas da edição impressa (inteiro). isbn13: só os 13 dígitos. capaUrl: endereço https da imagem da capa, se encontrou. fontes: endereços das páginas onde achou os dados.',
    'Se não encontrar o livro, responda {"encontrado": false, "livros": []}.',
  ].join('\n');
}

/** Corpo do generateContent: o pedido e a ferramenta de busca do Google. */
export function buildRequest(query, opts) {
  return {
    contents: [{ role: 'user', parts: [{ text: buildPrompt(query, opts) }] }],
    tools: [{ google_search: {} }],
  };
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

/** Só endereço https bem formado (a capa vai num <img>; nada de http:, data:, javascript:). */
export function safeHttpsUrl(v) {
  if (typeof v !== 'string' || v.length > 1000) return null;
  try {
    const url = new URL(v.trim());
    return url.protocol === 'https:' && url.hostname.includes('.') ? url.href : null;
  } catch {
    return null;
  }
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
  const isbnRaw = raw.isbn13 ?? raw.isbn;
  const isbn = typeof isbnRaw === 'string' || typeof isbnRaw === 'number' ? parseIsbn(String(isbnRaw)) || '' : '';
  const fontes = Array.isArray(raw.fontes ?? raw.sources) ? (raw.fontes ?? raw.sources) : [];
  const publisher = cleanText(raw.editora ?? raw.publisher, 120);
  return {
    source: 'IA',
    sourceId: `ia:${isbn || title.toLowerCase()}`,
    title: subtitle && !PLACEHOLDER.test(subtitle) && !title.includes(subtitle) ? `${title}: ${subtitle}` : title,
    authors,
    pages: pages >= 1 && pages <= MAX_PAGES ? pages : null,
    cover: safeHttpsUrl(raw.capaUrl ?? raw.capa ?? raw.cover),
    isbn,
    year: year >= FIRST_PRINTED_YEAR && year <= today.getFullYear() + 1 ? year : null,
    publisher: PLACEHOLDER.test(publisher) ? '' : publisher,
    lang: cleanText(raw.idioma ?? raw.language, 20).toLowerCase(),
    ai: true,
    sources: [...new Set(fontes.map(domainOf).filter(Boolean))].slice(0, 3),
  };
}

/**
 * Domínios das páginas que a Busca Google usou ("amazon.com.br", "skoob.com.br").
 * No Gemini API o uri é um redirecionamento do Google; o domínio de verdade vem em title
 * (ou em domain, quando existe).
 */
export function groundingSources(data) {
  const chunks = data?.candidates?.[0]?.groundingMetadata?.groundingChunks;
  if (!Array.isArray(chunks)) return [];
  const out = [];
  for (const chunk of chunks) {
    const web = chunk?.web;
    if (!web) continue;
    let d = domainOf(web.domain) || domainOf(web.title);
    if (!d) {
      const fromUri = domainOf(web.uri);
      if (fromUri && !/(^|\.)(vertexaisearch\.cloud\.google\.com|googleusercontent\.com)$/.test(fromUri)) d = fromUri;
    }
    if (d && !out.includes(d)) out.push(d);
  }
  return out;
}

/** O modelo usou a Busca Google nesta resposta? */
export function wasGrounded(data) {
  const meta = data?.candidates?.[0]?.groundingMetadata;
  return Boolean(meta && ((meta.groundingChunks || []).length || (meta.webSearchQueries || []).length));
}

const dedupeKey = (r) => r.isbn || `${r.title.toLowerCase()}|${r.authors.toLowerCase()}`;

/**
 * Resposta do generateContent → { results, sources, notFound }.
 * notFound: a IA disse que não achou (ou não devolveu nenhum livro aproveitável).
 * Lança AiSearchError('blocked'/'bad-response') quando não há resposta legível.
 */
export function parseAiResponse(data, opts) {
  if (data?.promptFeedback?.blockReason) throw new AiSearchError('blocked');
  const text = responseText(data);
  const sources = groundingSources(data);
  if (!text.trim()) throw new AiSearchError(data?.candidates?.[0]?.finishReason === 'SAFETY' ? 'blocked' : 'bad-response');
  const parsed = extractJson(text);
  if (parsed === null) throw new AiSearchError('bad-response');
  const seen = new Set();
  const results = [];
  if (!(parsed && parsed.encontrado === false)) {
    for (const raw of candidateList(parsed)) {
      const r = validateCandidate(raw, opts);
      if (!r || seen.has(dedupeKey(r))) continue;
      seen.add(dedupeKey(r));
      // Sem fonte própria, mostra as páginas que a busca do Google usou.
      if (!r.sources.length) r.sources = sources.slice(0, 3);
      results.push(r);
      if (results.length >= AI_RESULT_LIMIT) break;
    }
  }
  return { results, sources, notFound: results.length === 0 };
}

// ---------- Erros ----------

const MESSAGES = {
  key: 'Chave da IA inválida. Confira a chave em Ajustes.',
  permission: 'A chave não tem permissão para a IA. Em Ajustes, veja se ela está liberada para este site e para a “Generative Language API”.',
  // Sem prometer "grátis": com faturamento ativo, o 429 é o limite de uso (por minuto ou dia).
  quota: 'A chave atingiu o limite de uso da IA por agora. Tente de novo mais tarde.',
  billing: 'O Google exige o faturamento ativo no projeto desta chave para a busca com Google. Ative no Google Cloud, em Faturamento (no AI Studio: “Set up billing”). As primeiras 5.000 buscas do mês não são cobradas; crie um alerta de orçamento para ser avisado de qualquer cobrança. Veja Ajustes.',
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

/** Erros em que adianta tentar de novo pelo botão (os de chave e faturamento, não). */
export function isRetryable(code) {
  return !['key', 'permission', 'billing', 'quota'].includes(code);
}

/**
 * Resposta HTTP de erro da API → código do erro.
 * 'model' quer dizer "tente o próximo modelo" (não existe ou não serve para isto).
 */
export function mapGeminiError(status, body) {
  const err = body?.error || {};
  const message = String(err.message || '');
  const reasons = (Array.isArray(err.details) ? err.details : []).map((d) => d?.reason).filter(Boolean);
  const has = (...r) => reasons.some((x) => r.includes(x));
  if (status === 401 || has('API_KEY_INVALID', 'API_KEY_EXPIRED', 'ACCESS_TOKEN_TYPE_UNSUPPORTED') || /api key (not valid|expired|not found)/i.test(message)) return 'key';
  if (status === 429 || err.status === 'RESOURCE_EXHAUSTED') {
    // Cota zero: o plano gratuito não inclui a busca do Google para este modelo.
    return /limit:\s*0\b/.test(message) ? 'billing' : 'quota';
  }
  if (status === 403) return 'permission';
  if (status === 404) return 'model';
  if (status === 400 || err.status === 'INVALID_ARGUMENT' || err.status === 'FAILED_PRECONDITION') {
    if (/models?\/[\w.-]+ is not found|model.*(not found|not supported|does not exist)|not supported for generatecontent/i.test(message)) return 'model';
    if (/google[_ ]?search|grounding|search tool/i.test(message)) return 'billing';
    if (/billing|free tier/i.test(message)) return 'billing';
    return 'bad-request';
  }
  if (status >= 500) return 'server';
  return 'server';
}

// ---------- Chamada ----------

/**
 * Busca com IA. Devolve { results, sources, notFound, model } ou lança AiSearchError
 * (code: key, permission, quota, billing, offline, network, timeout, model, server, blocked,
 * bad-response, bad-request, cancelled).
 * onSend(): chamado uma vez, quando o primeiro pedido sai de fato para o Google.
 */
export async function aiSearch(query, {
  key, fetchImpl = fetch, signal, timeoutMs = AI_TIMEOUT_MS, models = GEMINI_MODELS, today = new Date(), onSend,
  online = () => (typeof navigator === 'undefined' ? true : navigator.onLine !== false),
} = {}) {
  const q = String(query ?? '').trim();
  if (!key) throw new AiSearchError('key');
  if (q.length < 2) return { results: [], sources: [], notFound: true, model: null };
  if (!online()) throw new AiSearchError('offline');

  const ctrl = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => { timedOut = true; ctrl.abort(); }, timeoutMs);
  const abort = () => ctrl.abort();
  if (signal?.aborted) abort();
  else signal?.addEventListener('abort', abort, { once: true });
  // A corrida com o aborto garante a desistência mesmo se o fetch ignorar o sinal.
  const aborted = new Promise((_, reject) => {
    const fail = () => reject(new AiSearchError(timedOut ? 'timeout' : 'cancelled'));
    if (ctrl.signal.aborted) fail();
    else ctrl.signal.addEventListener('abort', fail, { once: true });
  });
  aborted.catch(() => {});

  const body = JSON.stringify(buildRequest(q, { today }));
  let lastError = new AiSearchError('model');
  let sent = false;
  try {
    for (const model of models) {
      let res;
      if (ctrl.signal.aborted) throw new AiSearchError(timedOut ? 'timeout' : 'cancelled');
      // Uma busca conta uma vez (no limite de segurança do aparelho), na hora em que sai de fato.
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
        if (ctrl.signal.aborted) throw new AiSearchError(timedOut ? 'timeout' : 'cancelled');
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
        return { ...parseAiResponse(data, { today }), model };
      }
      const code = mapGeminiError(res.status, data);
      // Modelo que não existe mais ou sobrecarregado: tenta o próximo da lista. Sem
      // faturamento ('billing', cota zero) também: a cota grátis é de cada modelo e o próximo
      // pode tê-la; se nenhum servir, o aviso de faturamento é o que a pessoa vê.
      if (code !== 'model' && code !== 'server' && code !== 'billing') throw new AiSearchError(code, res.status);
      if (lastError.code !== 'billing') lastError = new AiSearchError(code, res.status);
    }
    throw lastError;
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', abort);
  }
}

// ---------- Conferência pelo ISBN ----------

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
 * prefere os dados de lá; a capa da IA só entra se não houver outra.
 * lookupIsbn(isbn) → Promise<resultado | null>.
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
    if (!official) return r;
    if (r.isbn !== queryIsbn && !sameBook(r, official)) return { ...r, isbn: '' };
    // A capa "pelo ISBN" da Open Library muitas vezes não existe: a da IA vem antes dela.
    const guessed = (c) => !c || c.includes('covers.openlibrary.org/b/isbn/');
    return {
      ...r,
      title: official.title || r.title,
      authors: official.authors || r.authors,
      pages: official.pages || r.pages,
      year: official.year || r.year,
      cover: guessed(official.cover) ? r.cover || official.cover : official.cover,
      checkedBy: official.source || '',
    };
  }));
}
