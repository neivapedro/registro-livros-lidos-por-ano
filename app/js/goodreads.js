// Importar a planilha (CSV) exportada do Goodreads ou do StoryGraph (1.6).
// Nada é gravado aqui: planImport monta uma prévia (quantos de cada status, quais já estão no
// app) e applyImport só ACRESCENTA livros novos, nunca troca nem junta com os que já existem.
// undoImport tira exatamente os livros que a importação acrescentou.

import { isbn10To13, openLibraryCoverByIsbn, parseIsbn } from './books-api.js';
import { isIsoDate } from './dates.js';
import { FORMATS, normalizeBook, STATUS } from './store.js';
import { bookKey } from './compare.js';
import { splitAuthors } from './stats.js';

export const MAX_FILE_BYTES = 15 * 1024 * 1024;
export const MAX_ROWS = 20000;

// ---------- CSV ----------

/**
 * CSV (RFC 4180): aspas, aspas dobradas, separador e quebras de linha dentro de campos,
 * BOM, CRLF/LF/CR. O separador é a vírgula, ou ';' se o cabeçalho tiver mais ';' (Excel BR).
 * Devolve linhas (arrays de texto); linhas totalmente vazias ficam de fora.
 */
export function parseCsv(text, { maxRows = MAX_ROWS + 1 } = {}) {
  const src = String(text ?? '').replace(/^\uFEFF/, '');
  const firstLine = src.slice(0, src.search(/\r|\n|$/));
  const sep = (firstLine.match(/;/g) || []).length > (firstLine.match(/,/g) || []).length ? ';' : ',';
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;
  let i = 0;
  const endRow = () => {
    row.push(field);
    field = '';
    if (row.length > 1 || row[0] !== '') rows.push(row);
    row = [];
  };
  while (i < src.length) {
    const ch = src[i];
    if (quoted) {
      if (ch === '"') {
        if (src[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        quoted = false;
      } else {
        field += ch;
      }
      i += 1;
      continue;
    }
    if (ch === '"' && field === '') quoted = true;
    else if (ch === sep) {
      row.push(field);
      field = '';
    } else if (ch === '\r' || ch === '\n') {
      endRow();
      if (rows.length >= maxRows) return rows;
      if (ch === '\r' && src[i + 1] === '\n') i += 1;
    } else {
      field += ch;
    }
    i += 1;
  }
  if (field !== '' || row.length) endRow();
  return rows;
}

// ---------- Campos ----------

/** ="0441172717" (como o Goodreads exporta o ISBN) → 0441172717. */
export function unwrapExcel(value) {
  const v = String(value ?? '').trim();
  const m = v.match(/^="(.*)"$/);
  return (m ? m[1] : v.replace(/^=/, '')).trim();
}

/** ISBN-13 a partir do ISBN13 ou do ISBN (10) do arquivo; '' se nenhum for válido. */
export function cleanIsbn(isbn13, isbn10) {
  const a = unwrapExcel(isbn13).replace(/[\s-]/g, '');
  const b = unwrapExcel(isbn10).replace(/[\s-]/g, '').toUpperCase();
  return parseIsbn(a) || (b.length === 10 ? isbn10To13(b) : parseIsbn(b)) || '';
}

/** "2023/05/14", "2023-05-14", "2023/5/4" (e com hora) → "2023-05-14"; outra coisa → null. */
export function parseDate(value) {
  const m = String(value ?? '').trim().match(/^(\d{4})[/.-](\d{1,2})[/.-](\d{1,2})/);
  if (!m) return null;
  const iso = `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
  return isIsoDate(iso) ? iso : null;
}

/** Resenha do Goodreads vem com <br/> e outras marcas: vira texto. */
export function reviewText(value) {
  return String(value ?? '')
    .replace(/\r\n?/g, '\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>\s*<p[^>]*>/gi, '\n\n')
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/g, ' ').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** "Duna (Crônicas de Duna, #1)" → { title: "Duna", series: "Crônicas de Duna", seriesNumber: 1 }. */
export function splitSeries(raw) {
  const title = String(raw ?? '').trim();
  const m = title.match(/^(.+?)\s*\(([^()]+?),?\s*#(\d+(?:\.\d+)?)(?:-\d+)?\)$/);
  if (!m) return { title, series: '', seriesNumber: null };
  return { title: m[1].trim(), series: m[2].trim(), seriesNumber: Number(m[3]) };
}

const DROP_SHELF = /(^|[-_ ])(dnf|did-not-finish|abandon|desist|parei)/i;
const STANDARD_SHELVES = new Set(['read', 'currently-reading', 'to-read', 'did-not-finish', 'dnf']);

function statusOf(shelf) {
  const s = String(shelf ?? '').trim().toLowerCase();
  if (s === 'read') return STATUS.READ;
  if (s === 'currently-reading') return STATUS.READING;
  if (s === 'to-read' || !s) return STATUS.WANT;
  if (DROP_SHELF.test(s)) return STATUS.DROPPED;
  return STATUS.WANT;
}

// ---------- Linhas → livros ----------

/** Cabeçalho → índice, por nome (sem maiúsculas e espaços nas pontas). */
function headerIndex(header) {
  const idx = new Map();
  header.forEach((h, i) => {
    const key = String(h).trim().toLowerCase();
    if (!idx.has(key)) idx.set(key, i);
  });
  return idx;
}

/** Qual planilha é: 'goodreads', 'storygraph' ou null. */
export function detectSource(header) {
  const idx = headerIndex(header);
  if (idx.has('title') && idx.has('exclusive shelf') && idx.has('author')) return 'goodreads';
  if (idx.has('title') && idx.has('read status') && idx.has('authors')) return 'storygraph';
  return null;
}

function rowGetter(header, row) {
  const idx = headerIndex(header);
  return (name) => {
    const i = idx.get(name);
    return i === undefined ? '' : String(row[i] ?? '').trim();
  };
}

function joinAuthors(...lists) {
  const seen = new Set();
  const out = [];
  for (const list of lists) {
    for (const a of String(list || '').split(',').map((x) => x.replace(/\s+/g, ' ').trim()).filter(Boolean)) {
      const key = a.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(a);
    }
  }
  return out.join(', ');
}

/** Uma linha do Goodreads → livro cru (antes de normalizeBook). undated: lido sem data de leitura. */
export function mapGoodreadsRow(get) {
  const { title, series, seriesNumber } = splitSeries(get('title'));
  const status = statusOf(get('exclusive shelf'));
  const added = parseDate(get('date added'));
  const readAt = parseDate(get('date read'));
  const started = parseDate(get('date started'));
  const isbn = cleanIsbn(get('isbn13'), get('isbn'));
  const rating = Number(get('my rating')) || null;
  const exclusive = get('exclusive shelf').toLowerCase();
  const tags = get('bookshelves').split(',').map((t) => t.trim()).filter((t) => t && !STANDARD_SHELVES.has(t.toLowerCase()) && t.toLowerCase() !== exclusive);
  const notes = [reviewText(get('my review')), reviewText(get('private notes'))].filter(Boolean).join('\n\n');
  const finished = status === STATUS.READ || status === STATUS.DROPPED;
  const endDate = finished ? readAt || added : null;
  return {
    raw: {
      title,
      authors: joinAuthors(get('author'), get('additional authors')),
      pages: Number(get('number of pages')) || null,
      isbn,
      cover: isbn ? openLibraryCoverByIsbn(isbn) : null,
      status,
      startDate: status === STATUS.WANT ? null : started && (!endDate || started <= endDate) ? started : status === STATUS.READING ? added : null,
      endDate,
      format: /kindle|ebook|e-book/i.test(get('binding')) ? FORMATS.KINDLE : FORMATS.PHYSICAL,
      rating: status === STATUS.READ && rating >= 1 && rating <= 5 ? rating : null,
      notes,
      reread: status === STATUS.READ && Number(get('read count')) > 1,
      series,
      seriesNumber,
      tags,
      createdAt: added ? `${added}T12:00:00.000Z` : undefined,
    },
    undated: finished && !readAt,
  };
}

/** Uma linha do StoryGraph → livro cru. */
export function mapStoryGraphRow(get) {
  const shelf = get('read status').toLowerCase();
  const status = shelf === 'did-not-finish' ? STATUS.DROPPED : statusOf(shelf);
  const added = parseDate(get('date added'));
  const readAt = parseDate(get('last date read')) || parseDate(get('dates read').split('-').pop());
  const isbn = cleanIsbn(get('isbn/uid'), get('isbn/uid'));
  const rating = Number(get('star rating').replace(',', '.')) || null;
  const finished = status === STATUS.READ || status === STATUS.DROPPED;
  const endDate = finished ? readAt || added : null;
  return {
    raw: {
      title: get('title'),
      authors: joinAuthors(get('authors')),
      pages: null,
      isbn,
      cover: isbn ? openLibraryCoverByIsbn(isbn) : null,
      status,
      startDate: status === STATUS.READING ? added : null,
      endDate,
      format: /digital|ebook|kindle/i.test(get('format')) ? FORMATS.KINDLE : FORMATS.PHYSICAL,
      rating: status === STATUS.READ ? rating : null,
      notes: reviewText(get('review')),
      reread: status === STATUS.READ && Number(get('read count')) > 1,
      tags: get('tags').split(',').map((t) => t.trim()).filter(Boolean),
      createdAt: added ? `${added}T12:00:00.000Z` : undefined,
    },
    undated: finished && !readAt,
  };
}

function dupKeys(book) {
  const keys = [bookKey(book.title, splitAuthors(book.authors)[0] || '')];
  if (book.isbn) keys.push(`isbn:${parseIsbn(book.isbn) || book.isbn}`);
  return keys;
}

/**
 * Prévia da importação. Devolve { source, books, duplicates, counts, undated, skipped }
 * ou { error } quando o arquivo não é uma planilha do Goodreads/StoryGraph.
 * books: livros novos, já normalizados; duplicates: os que já estão no app (ou repetidos
 * no próprio arquivo), com o motivo; skipped: linhas sem título.
 */
export function planImport(state, text, nowTs = new Date().toISOString()) {
  // Uma linha a mais que o limite: dá para saber que o arquivo passou dele.
  const rows = parseCsv(text, { maxRows: MAX_ROWS + 2 });
  if (rows.length < 1) return { error: 'vazio' };
  const header = rows[0];
  const source = detectSource(header);
  if (!source) return { error: 'formato' };
  if (rows.length - 1 > MAX_ROWS) return { error: 'grande' };
  const map = source === 'goodreads' ? mapGoodreadsRow : mapStoryGraphRow;
  const known = new Map();
  for (const b of state.books) for (const k of dupKeys(b)) if (!known.has(k)) known.set(k, b);
  const books = [];
  const duplicates = [];
  const counts = { [STATUS.READ]: 0, [STATUS.READING]: 0, [STATUS.WANT]: 0, [STATUS.DROPPED]: 0 };
  let undated = 0;
  let skipped = 0;
  for (const row of rows.slice(1)) {
    const { raw, undated: noDate } = map(rowGetter(header, row));
    const book = normalizeBook(raw, nowTs);
    if (!book) {
      skipped += 1;
      continue;
    }
    const keys = dupKeys(book);
    const twin = keys.map((k) => known.get(k)).find(Boolean);
    if (twin) {
      duplicates.push({ book, twin: { id: twin.id, title: twin.title }, inFile: books.includes(twin) });
      continue;
    }
    for (const k of keys) known.set(k, book);
    books.push(book);
    counts[book.status] += 1;
    if (noDate) undated += 1;
  }
  return { source, books, duplicates, counts, undated, skipped };
}

/**
 * Acrescenta os livros da prévia (e, se a pessoa pediu, também os repetidos) sem mexer nos
 * que já existem. Devolve { state, ids } (ids: os livros acrescentados, para desfazer).
 */
export function applyImport(state, plan, { includeDuplicates = false } = {}) {
  const extra = includeDuplicates ? plan.duplicates.map((d) => d.book) : [];
  const existing = new Set(state.books.map((b) => b.id));
  const added = [...plan.books, ...extra].filter((b) => !existing.has(b.id));
  return { state: { ...state, books: [...state.books, ...added] }, ids: added.map((b) => b.id) };
}

/** Desfaz a importação: tira só os livros que ela acrescentou (o resto fica como está). */
export function undoImport(state, ids) {
  const gone = new Set(ids);
  return { ...state, books: state.books.filter((b) => !gone.has(b.id)), upNext: (state.upNext || []).filter((id) => !gone.has(id)) };
}
