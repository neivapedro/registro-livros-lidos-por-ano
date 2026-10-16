// Busca de livros: Google Books e Open Library em paralelo, priorizando edições em português.
// Nenhuma das duas exige cadastro; se uma falhar, a outra ainda responde.
// Sem nenhum resultado em português, a busca é refeita sem o filtro de idioma.

const GOOGLE_URL = 'https://www.googleapis.com/books/v1/volumes';
const OPEN_LIBRARY_URL = 'https://openlibrary.org/search.json';
const OPEN_LIBRARY_FIELDS = [
  'key', 'title', 'subtitle', 'author_name', 'number_of_pages_median', 'cover_i', 'isbn', 'first_publish_year',
  'editions', 'editions.key', 'editions.title', 'editions.subtitle', 'editions.language', 'editions.isbn',
  'editions.cover_i', 'editions.number_of_pages_median',
].join(',');

function pickIsbn(list) {
  if (!Array.isArray(list)) return '';
  return list.find((i) => /^97[89]\d{10}$/.test(i)) || list.find((i) => /^\d{9}[\dX]$/.test(i)) || '';
}

function toHttps(url) {
  return typeof url === 'string' ? url.replace(/^http:/, 'https:').replace(/&edge=curl/, '') : null;
}

export function normalizeGoogleVolume(item) {
  const info = item?.volumeInfo;
  if (!info?.title) return null;
  const ids = (info.industryIdentifiers || []).map((i) => i.identifier);
  const links = info.imageLinks || {};
  return {
    source: 'Google Books',
    sourceId: `google:${item.id}`,
    title: info.subtitle ? `${info.title}: ${info.subtitle}` : info.title,
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
    title: src.subtitle ? `${src.title}: ${src.subtitle}` : src.title,
    authors: (doc.author_name || []).join(', '),
    pages: pages > 0 ? pages : null,
    cover: coverId ? `https://covers.openlibrary.org/b/id/${coverId}-M.jpg` : null,
    isbn: pickIsbn(src.isbn) || (useEdition ? '' : pickIsbn(doc.isbn)),
    year: doc.first_publish_year || null,
  };
}

function dedupeKey(r) {
  const norm = (s) => s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]/g, '');
  return r.isbn || `${norm(r.title)}|${norm(r.authors.split(',')[0] || '')}`;
}

/** Junta as duas listas intercalando as fontes e removendo repetidos. */
export function mergeResults(google, openLibrary, limit = 12) {
  const out = [];
  const seen = new Set();
  const max = Math.max(google.length, openLibrary.length);
  for (let i = 0; i < max && out.length < limit; i += 1) {
    for (const r of [google[i], openLibrary[i]]) {
      if (!r) continue;
      const key = dedupeKey(r);
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(r);
    }
  }
  return out.slice(0, limit);
}

async function getJson(fetchImpl, url, signal) {
  const res = await fetchImpl(url, { signal });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

function buildUrls(q, isIsbn, portuguese) {
  const clean = q.replace(/-/g, '');
  const googleQuery = isIsbn ? `isbn:${clean}` : q;
  const googleLang = portuguese ? '&langRestrict=pt' : '';
  const google = `${GOOGLE_URL}?q=${encodeURIComponent(googleQuery)}&maxResults=10&printType=books${googleLang}`;
  let olParam;
  if (isIsbn) olParam = `isbn=${encodeURIComponent(clean)}`;
  else if (portuguese) olParam = `q=${encodeURIComponent(`${q} language:por`)}&lang=pt`;
  else olParam = `q=${encodeURIComponent(q)}`;
  const openLibrary = `${OPEN_LIBRARY_URL}?${olParam}&limit=10&fields=${OPEN_LIBRARY_FIELDS}`;
  return { google, openLibrary };
}

async function runSearch(fetchImpl, urls, signal) {
  const [google, openLibrary] = await Promise.allSettled([
    getJson(fetchImpl, urls.google, signal).then((data) => (data.items || []).map(normalizeGoogleVolume).filter(Boolean)),
    getJson(fetchImpl, urls.openLibrary, signal).then((data) => (data.docs || []).map(normalizeOpenLibraryDoc).filter(Boolean)),
  ]);
  const g = google.status === 'fulfilled' ? google.value : [];
  const o = openLibrary.status === 'fulfilled' ? openLibrary.value : [];
  return {
    results: mergeResults(g, o),
    failed: google.status === 'rejected' && openLibrary.status === 'rejected',
  };
}

/**
 * Busca por título, autor ou ISBN.
 * Retorna { results, failed }: failed = true quando as duas fontes falharam.
 */
export async function searchBooks(query, { fetchImpl = fetch, signal } = {}) {
  const q = query.trim();
  if (q.length < 2) return { results: [], failed: false };
  const isIsbn = /^[\d-]{10,17}X?$/i.test(q) && q.replace(/-/g, '').length >= 10;

  // ISBN já identifica a edição: não precisa de filtro de idioma.
  let outcome = await runSearch(fetchImpl, buildUrls(q, isIsbn, !isIsbn), signal);
  if (!isIsbn && !outcome.failed && !outcome.results.length && !signal?.aborted) {
    outcome = await runSearch(fetchImpl, buildUrls(q, false, false), signal);
  }
  if (signal?.aborted) return { results: [], failed: false };
  return outcome;
}
