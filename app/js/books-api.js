// Busca de livros: Google Books e Open Library em paralelo.
// Nenhuma das duas exige cadastro; se uma falhar, a outra ainda responde.

const GOOGLE_URL = 'https://www.googleapis.com/books/v1/volumes';
const OPEN_LIBRARY_URL = 'https://openlibrary.org/search.json';
const OPEN_LIBRARY_FIELDS = 'key,title,subtitle,author_name,number_of_pages_median,cover_i,isbn,first_publish_year';

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

export function normalizeOpenLibraryDoc(doc) {
  if (!doc?.title) return null;
  return {
    source: 'Open Library',
    sourceId: `openlibrary:${doc.key}`,
    title: doc.subtitle ? `${doc.title}: ${doc.subtitle}` : doc.title,
    authors: (doc.author_name || []).join(', '),
    pages: doc.number_of_pages_median > 0 ? doc.number_of_pages_median : null,
    cover: doc.cover_i ? `https://covers.openlibrary.org/b/id/${doc.cover_i}-M.jpg` : null,
    isbn: pickIsbn(doc.isbn),
    year: doc.first_publish_year || null,
  };
}

function dedupeKey(r) {
  const norm = (s) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]/g, '');
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

/**
 * Busca por título, autor ou ISBN.
 * Retorna { results, failed }: failed = true quando as duas fontes falharam.
 */
export async function searchBooks(query, { fetchImpl = fetch, signal } = {}) {
  const q = query.trim();
  if (q.length < 2) return { results: [], failed: false };
  const isIsbn = /^[\d-]{10,17}X?$/i.test(q) && q.replace(/-/g, '').length >= 10;
  const clean = q.replace(/-/g, '');

  const googleQuery = isIsbn ? `isbn:${clean}` : q;
  const googleUrl = `${GOOGLE_URL}?q=${encodeURIComponent(googleQuery)}&maxResults=10&printType=books`;
  const olParam = isIsbn ? `isbn=${encodeURIComponent(clean)}` : `q=${encodeURIComponent(q)}`;
  const olUrl = `${OPEN_LIBRARY_URL}?${olParam}&limit=10&fields=${OPEN_LIBRARY_FIELDS}`;

  const [google, openLibrary] = await Promise.allSettled([
    getJson(fetchImpl, googleUrl, signal).then((data) => (data.items || []).map(normalizeGoogleVolume).filter(Boolean)),
    getJson(fetchImpl, olUrl, signal).then((data) => (data.docs || []).map(normalizeOpenLibraryDoc).filter(Boolean)),
  ]);
  if (signal?.aborted) return { results: [], failed: false };
  const g = google.status === 'fulfilled' ? google.value : [];
  const o = openLibrary.status === 'fulfilled' ? openLibrary.value : [];
  return {
    results: mergeResults(g, o),
    failed: google.status === 'rejected' && openLibrary.status === 'rejected',
  };
}
