// Busca de livros, sem cadastro em nenhum serviço.
//
// - ISBN (digitado ou colado): BrasilAPI, que consulta CBL, Mercado Editorial, Open Library
//   e Google ao mesmo tempo e conhece bem as edições brasileiras, junto com a Open Library.
// - Título ou autor: Open Library, priorizando edições em português; sem nenhum resultado
//   em português, a busca é refeita sem o filtro de idioma.
// - Google Books só entra com chave própria: sem chave, a cota anônima (compartilhada por
//   todo mundo) vive esgotada e toda consulta volta com HTTP 429.
//
// Cada fonte tem um tempo máximo; uma fonte lenta não segura a resposta das outras.
// Buscas repetidas na mesma sessão saem da memória, sem consultar a rede de novo.

const GOOGLE_URL = 'https://www.googleapis.com/books/v1/volumes';
const OPEN_LIBRARY_URL = 'https://openlibrary.org/search.json';
const BRASIL_API_URL = 'https://brasilapi.com.br/api/isbn/v1/';
const OPEN_LIBRARY_FIELDS = [
  'key', 'title', 'subtitle', 'author_name', 'number_of_pages_median', 'cover_i', 'isbn', 'first_publish_year',
  'editions', 'editions.key', 'editions.title', 'editions.subtitle', 'editions.language', 'editions.isbn',
  'editions.cover_i', 'editions.number_of_pages_median',
].join(',');

/** Tempo máximo de cada fonte (ms). Passado isso, ela conta como falha. */
export const SOURCE_TIMEOUT_MS = 8000;

// Nomes que a BrasilAPI usa para dizer de onde veio o livro.
const BRASIL_API_PROVIDERS = {
  cbl: 'CBL',
  'mercado-editorial': 'Mercado Editorial',
  'open-library': 'Open Library',
  'google-books': 'Google Books',
};

// ---------- ISBN ----------

function isbn13CheckDigit(first12) {
  let sum = 0;
  for (let i = 0; i < 12; i += 1) sum += Number(first12[i]) * (i % 2 ? 3 : 1);
  return String((10 - (sum % 10)) % 10);
}

function isValidIsbn10(isbn) {
  if (!/^\d{9}[\dX]$/.test(isbn)) return false;
  let sum = 0;
  for (let i = 0; i < 10; i += 1) sum += (isbn[i] === 'X' ? 10 : Number(isbn[i])) * (10 - i);
  return sum % 11 === 0;
}

/** Converte ISBN-10 em ISBN-13 (prefixo 978 e novo dígito verificador). */
export function isbn10To13(isbn10) {
  const clean = String(isbn10 || '').replace(/[\s-]/g, '').toUpperCase();
  if (!isValidIsbn10(clean)) return null;
  const first12 = `978${clean.slice(0, 9)}`;
  return first12 + isbn13CheckDigit(first12);
}

/**
 * Reconhece um ISBN no texto digitado (hífens e espaços são aceitos) e devolve
 * o ISBN-13, ou null quando não é um ISBN válido. Conferir o dígito verificador
 * evita tratar como ISBN um número qualquer (ou um ISBN com dígito trocado,
 * que então vira busca comum).
 */
export function parseIsbn(text) {
  const clean = String(text || '').trim().replace(/[\s-]/g, '').toUpperCase();
  if (clean.length === 10) return isbn10To13(clean);
  if (/^97[89]\d{10}$/.test(clean) && isbn13CheckDigit(clean) === clean[12]) return clean;
  return null;
}

/** Capa da Open Library pelo ISBN. default=false faz responder 404 quando não há capa (e a tela some com a imagem). */
export function openLibraryCoverByIsbn(isbn13) {
  return `https://covers.openlibrary.org/b/isbn/${isbn13}-M.jpg?default=false`;
}

// ---------- Normalização: todas as fontes viram o mesmo formato ----------

function pickIsbn(list) {
  if (!Array.isArray(list)) return '';
  return list.find((i) => /^97[89]\d{10}$/.test(i)) || list.find((i) => /^\d{9}[\dX]$/.test(i)) || '';
}

function toHttps(url) {
  return typeof url === 'string' && url ? url.replace(/^http:/, 'https:').replace(/&edge=curl/, '') : null;
}

function joinTitle(title, subtitle) {
  return subtitle ? `${title}: ${subtitle}` : title;
}

export function normalizeGoogleVolume(item) {
  const info = item?.volumeInfo;
  if (!info?.title) return null;
  const ids = (info.industryIdentifiers || []).map((i) => i.identifier);
  const links = info.imageLinks || {};
  return {
    source: 'Google Books',
    sourceId: `google:${item.id}`,
    title: joinTitle(info.title, info.subtitle),
    authors: (info.authors || []).join(', '),
    pages: info.pageCount > 0 ? info.pageCount : null,
    cover: toHttps(links.thumbnail || links.smallThumbnail),
    isbn: pickIsbn(ids),
    year: info.publishedDate ? Number(String(info.publishedDate).slice(0, 4)) || null : null,
  };
}

/**
 * A Open Library organiza por obra (título original, quase sempre em inglês).
 * Quando a busca pede português, ela devolve em editions a edição em português
 * que melhor combina: título, capa e ISBN vêm dela.
 */
export function normalizeOpenLibraryDoc(doc) {
  if (!doc?.title) return null;
  const edition = doc.editions?.docs?.[0];
  const useEdition = Boolean(edition?.title) && (!edition.language || edition.language.includes('por'));
  const src = useEdition ? edition : doc;
  const coverId = src.cover_i || doc.cover_i;
  const pages = src.number_of_pages_median || doc.number_of_pages_median;
  return {
    source: 'Open Library',
    sourceId: `openlibrary:${useEdition && edition.key ? edition.key : doc.key}`,
    title: joinTitle(src.title, src.subtitle),
    authors: (doc.author_name || []).join(', '),
    pages: pages > 0 ? pages : null,
    cover: coverId ? `https://covers.openlibrary.org/b/id/${coverId}-M.jpg` : null,
    isbn: pickIsbn(src.isbn) || (useEdition ? '' : pickIsbn(doc.isbn)),
    year: doc.first_publish_year || null,
  };
}

/**
 * Resposta da BrasilAPI (um livro só, já que o ISBN identifica a edição).
 * O nome da fonte mostra o provedor que respondeu, ex.: "BrasilAPI (CBL)".
 * Sem capa na resposta, tenta a capa da Open Library pelo mesmo ISBN.
 */
export function normalizeBrasilApiBook(data, fallbackIsbn = '') {
  if (!data?.title) return null;
  const isbn = parseIsbn(data.isbn) || fallbackIsbn || '';
  const provider = data.provider ? BRASIL_API_PROVIDERS[data.provider] || data.provider : '';
  const authors = Array.isArray(data.authors) ? data.authors : [];
  const year = Number(data.year);
  return {
    source: provider ? `BrasilAPI (${provider})` : 'BrasilAPI',
    sourceId: `brasilapi:${isbn || data.title}`,
    title: joinTitle(data.title, data.subtitle),
    authors: authors.filter((a) => typeof a === 'string' && a.trim()).map((a) => a.trim()).join(', '),
    pages: data.page_count > 0 ? data.page_count : null,
    cover: toHttps(data.cover_url) || (isbn ? openLibraryCoverByIsbn(isbn) : null),
    isbn,
    year: year > 0 ? year : null,
  };
}

// ---------- Junção dos resultados ----------

function dedupeKey(r) {
  const norm = (s) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]/g, '');
  return r.isbn || `${norm(r.title)}|${norm(r.authors.split(',')[0] || '')}`;
}

/** Junta as listas intercalando as fontes (na ordem dada) e removendo repetidos. */
export function mergeResults(lists, limit = 12) {
  const out = [];
  const seen = new Set();
  const max = Math.max(0, ...lists.map((l) => l.length));
  for (let i = 0; i < max && out.length < limit; i += 1) {
    for (const list of lists) {
      const r = list[i];
      if (!r) continue;
      const key = dedupeKey(r);
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(r);
    }
  }
  return out.slice(0, limit);
}

// ---------- Rede ----------

/**
 * Busca um JSON com tempo máximo. O AbortController próprio junta o sinal de
 * quem chamou (nova busca cancela a anterior) com o prazo desta fonte.
 * A corrida com o aborto garante a desistência mesmo se o fetch ignorar o sinal.
 */
async function getJson(fetchImpl, url, { signal, timeoutMs }) {
  const ctrl = new AbortController();
  const abort = () => ctrl.abort();
  const timer = setTimeout(abort, timeoutMs);
  if (signal?.aborted) abort();
  else signal?.addEventListener('abort', abort, { once: true });
  const aborted = new Promise((_, reject) => {
    const fail = () => reject(new Error('cancelada ou demorou demais'));
    if (ctrl.signal.aborted) fail();
    else ctrl.signal.addEventListener('abort', fail, { once: true });
  });
  aborted.catch(() => {});
  try {
    const res = await Promise.race([fetchImpl(url, { signal: ctrl.signal }), aborted]);
    // 404 da BrasilAPI quer dizer "ISBN não encontrado": resposta válida, sem livro.
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await Promise.race([res.json(), aborted]);
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', abort);
  }
}

function openLibraryUrl(param) {
  return `${OPEN_LIBRARY_URL}?${param}&limit=10&fields=${OPEN_LIBRARY_FIELDS}`;
}

function googleUrl(query, { portuguese, key }) {
  const lang = portuguese ? '&langRestrict=pt' : '';
  return `${GOOGLE_URL}?q=${encodeURIComponent(query)}&maxResults=10&printType=books${lang}&key=${encodeURIComponent(key)}`;
}

/**
 * Consulta as fontes em paralelo. Cada fonte é { url, parse }.
 * failed: todas falharam; partial: alguma falhou (o resultado pode estar incompleto).
 */
async function runSources(fetchImpl, sources, opts) {
  const settled = await Promise.allSettled(
    sources.map((s) => getJson(fetchImpl, s.url, opts).then((data) => (data ? s.parse(data) : []))),
  );
  const lists = settled.map((s) => (s.status === 'fulfilled' ? s.value : []));
  const rejected = settled.filter((s) => s.status === 'rejected').length;
  return {
    results: mergeResults(lists),
    failed: rejected === sources.length,
    partial: rejected > 0,
  };
}

const parseOpenLibrary = (data) => (data.docs || []).map(normalizeOpenLibraryDoc).filter(Boolean);
const parseGoogle = (data) => (data.items || []).map(normalizeGoogleVolume).filter(Boolean);

function searchIsbn(fetchImpl, isbn, googleKey, opts) {
  // A busca foi por este ISBN: os resultados da Open Library (que agrupa por obra)
  // ficam com ele, o que também tira o repetido quando a BrasilAPI achou o mesmo livro.
  const parseOl = (data) => parseOpenLibrary(data).map((r) => ({
    ...r, isbn, cover: r.cover || openLibraryCoverByIsbn(isbn),
  }));
  const sources = [
    { url: `${BRASIL_API_URL}${isbn}`, parse: (data) => [normalizeBrasilApiBook(data, isbn)].filter(Boolean) },
    { url: openLibraryUrl(`isbn=${isbn}`), parse: parseOl },
  ];
  if (googleKey) sources.push({ url: googleUrl(`isbn:${isbn}`, { portuguese: false, key: googleKey }), parse: parseGoogle });
  return runSources(fetchImpl, sources, opts);
}

async function searchText(fetchImpl, q, googleKey, opts) {
  const build = (portuguese) => {
    const olParam = portuguese ? `q=${encodeURIComponent(`${q} language:por`)}&lang=pt` : `q=${encodeURIComponent(q)}`;
    const sources = [{ url: openLibraryUrl(olParam), parse: parseOpenLibrary }];
    if (googleKey) sources.push({ url: googleUrl(q, { portuguese, key: googleKey }), parse: parseGoogle });
    return sources;
  };
  const outcome = await runSources(fetchImpl, build(true), opts);
  if (outcome.failed || outcome.results.length || opts.signal?.aborted) return outcome;
  return runSources(fetchImpl, build(false), opts);
}

// ---------- Memória da sessão ----------

const CACHE_LIMIT = 50;
const cache = new Map();

/** Esquece as buscas guardadas (usado nos testes). */
export function clearSearchCache() {
  cache.clear();
}

function remember(key, outcome) {
  cache.delete(key);
  cache.set(key, outcome);
  if (cache.size > CACHE_LIMIT) cache.delete(cache.keys().next().value);
}

/**
 * Busca por título, autor ou ISBN.
 * Retorna { results, failed, isbn }: failed = true quando todas as fontes falharam;
 * isbn = ISBN-13 quando a busca era um ISBN válido (para guardar no livro mesmo sem resultado).
 * googleKey (opcional): chave da API do Google Books; sem ela, o Google não é consultado.
 */
export async function searchBooks(query, { fetchImpl = fetch, signal, googleKey = '', timeoutMs = SOURCE_TIMEOUT_MS } = {}) {
  const q = query.trim().replace(/\s+/g, ' ');
  if (q.length < 2) return { results: [], failed: false, isbn: '' };
  const isbn = parseIsbn(q) || '';
  const key = `${googleKey ? 'google|' : ''}${isbn ? `isbn:${isbn}` : q.toLowerCase()}`;
  const cached = cache.get(key);
  if (cached) return { results: cached.results, failed: false, isbn };

  const opts = { signal, timeoutMs };
  const outcome = isbn
    ? await searchIsbn(fetchImpl, isbn, googleKey, opts)
    : await searchText(fetchImpl, q, googleKey, opts);
  if (signal?.aborted) return { results: [], failed: false, isbn };
  // Só guarda resposta completa: se alguma fonte falhou, a próxima tentativa consulta de novo.
  if (outcome.results.length || !outcome.partial) remember(key, outcome);
  return { results: outcome.results, failed: outcome.failed, isbn };
}
