// Estado do app: livros, metas por ano e preferências.
// Tudo fica no localStorage do celular; o backup em arquivo é a cópia de segurança.

import { isIsoDate, yearOf } from './dates.js';

export const STORAGE_KEY = 'leituras:v1';
export const BACKUP_APP_ID = 'leituras';
export const SCHEMA_VERSION = 1;
export const DEFAULT_GOAL = 12;

export const STATUS = { WANT: 'quero', READING: 'lendo', READ: 'lido', DROPPED: 'abandonado' };
export const STATUS_LABELS = { quero: 'Quero ler', lendo: 'Lendo', lido: 'Lido', abandonado: 'Abandonei' };
export const FORMATS = { PHYSICAL: 'fisico', KINDLE: 'kindle' };
export const FORMAT_LABELS = { fisico: 'Físico', kindle: 'Kindle' };

export const DEFAULT_GENRES = [
  'Gestão', 'Técnico', 'Desenvolvimento pessoal', 'Ficção',
  'Biografia', 'História', 'Filosofia', 'Religião',
];

const MAX_TEXT = 300;
const MAX_NOTES = 10000;
// Capa tirada pelo celular: imagem já reduzida pelo app (cerca de 30 KB).
const MAX_COVER_DATA = 400000;
const COVER_DATA_RE = /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/;

export function createEmptyState() {
  return {
    version: SCHEMA_VERSION,
    books: [],
    goals: {},
    defaultGoal: DEFAULT_GOAL,
    customGenres: [],
    lastBackupAt: null,
  };
}

export function newId() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  return `id-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function text(value, max = MAX_TEXT) {
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

function intIn(value, min, max) {
  const n = typeof value === 'string' ? Number(value.trim()) : value;
  if (typeof n !== 'number' || !Number.isFinite(n)) return null;
  const r = Math.round(n);
  return r >= min && r <= max ? r : null;
}

function coverSource(value) {
  if (typeof value === 'string' && value.startsWith('data:')) {
    return value.length <= MAX_COVER_DATA && COVER_DATA_RE.test(value) ? value : null;
  }
  return httpsUrl(value);
}

function httpsUrl(value) {
  if (typeof value !== 'string') return null;
  try {
    const url = new URL(value.trim());
    if (url.protocol === 'http:') url.protocol = 'https:';
    return url.protocol === 'https:' ? url.href : null;
  } catch {
    return null;
  }
}

/** Limpa e completa um livro vindo do formulário, do backup ou de versões antigas. */
export function normalizeBook(raw, nowTs = new Date().toISOString()) {
  if (!raw || typeof raw !== 'object') return null;
  const title = text(raw.title);
  if (!title) return null;
  const status = Object.values(STATUS).includes(raw.status) ? raw.status : STATUS.WANT;
  const startDate = isIsoDate(raw.startDate) ? raw.startDate : null;
  const endDate = isIsoDate(raw.endDate) ? raw.endDate : null;
  const pages = intIn(raw.pages, 1, 20000);
  const tracksPage = status === STATUS.READING || status === STATUS.DROPPED;
  const finished = status === STATUS.READ || status === STATUS.DROPPED;
  return {
    id: text(raw.id, 100) || newId(),
    title,
    authors: text(raw.authors),
    pages,
    cover: coverSource(raw.cover),
    isbn: text(raw.isbn, 20),
    status,
    startDate: status === STATUS.WANT ? null : startDate,
    endDate: finished ? endDate : null,
    // Kindle mostra o avanço em %, livro físico em página.
    currentPage: tracksPage && raw.format !== FORMATS.KINDLE ? intIn(raw.currentPage, 0, pages || 20000) : null,
    currentPercent: tracksPage && raw.format === FORMATS.KINDLE ? intIn(raw.currentPercent, 0, 100) : null,
    format: raw.format === FORMATS.KINDLE ? FORMATS.KINDLE : FORMATS.PHYSICAL,
    genre: text(raw.genre, 60) || null,
    rating: status === STATUS.READ ? intIn(raw.rating, 1, 5) : null,
    favorite: status === STATUS.READ && raw.favorite === true,
    notes: text(raw.notes, MAX_NOTES),
    dropReason: status === STATUS.DROPPED ? text(raw.dropReason, MAX_NOTES) : '',
    reread: raw.reread === true,
    createdAt: typeof raw.createdAt === 'string' ? raw.createdAt : nowTs,
    updatedAt: typeof raw.updatedAt === 'string' ? raw.updatedAt : nowTs,
  };
}

/** Problemas que impedem salvar o livro, em texto para mostrar na tela. */
export function validateBook(book, today = null) {
  const errors = [];
  if (!text(book.title)) errors.push('Informe o título do livro.');
  if (book.status === STATUS.READ && !isIsoDate(book.endDate)) {
    errors.push('Informe a data em que terminou a leitura.');
  }
  if (book.status !== STATUS.WANT && book.startDate && !isIsoDate(book.startDate)) {
    errors.push('Data de início inválida.');
  }
  const finished = book.status === STATUS.READ || book.status === STATUS.DROPPED;
  if (today && book.status !== STATUS.WANT && isIsoDate(book.startDate) && book.startDate > today) {
    errors.push('A data de início não pode estar no futuro.');
  }
  if (today && finished && isIsoDate(book.endDate) && book.endDate > today) {
    errors.push(`A data ${book.status === STATUS.READ ? 'de término' : 'em que parou'} não pode estar no futuro.`);
  }
  if (finished && isIsoDate(book.startDate) && isIsoDate(book.endDate) && book.endDate < book.startDate) {
    errors.push(`A data ${book.status === STATUS.READ ? 'de término' : 'em que parou'} é anterior à de início.`);
  }
  const pages = Number(book.pages) || 0;
  if (book.format === FORMATS.KINDLE && Number(book.currentPercent) > 100) {
    errors.push('A porcentagem vai de 0 a 100.');
  }
  const tracksPage = book.status === STATUS.READING || book.status === STATUS.DROPPED;
  if (book.format !== FORMATS.KINDLE && tracksPage && pages && Number(book.currentPage) > pages) {
    errors.push(`A página atual passa do total de ${pages} páginas.`);
  }
  return errors;
}

export function normalizeState(raw) {
  const state = createEmptyState();
  if (!raw || typeof raw !== 'object') return state;
  const seen = new Set();
  for (const item of Array.isArray(raw.books) ? raw.books : []) {
    const book = normalizeBook(item);
    if (!book || seen.has(book.id)) continue;
    seen.add(book.id);
    state.books.push(book);
  }
  if (raw.goals && typeof raw.goals === 'object') {
    for (const [year, goal] of Object.entries(raw.goals)) {
      const g = intIn(goal, 1, 1000);
      if (/^\d{4}$/.test(year) && g) state.goals[year] = g;
    }
  }
  state.defaultGoal = intIn(raw.defaultGoal, 1, 1000) ?? DEFAULT_GOAL;
  if (Array.isArray(raw.customGenres)) {
    state.customGenres = [...new Set(raw.customGenres.map((g) => text(g, 60)).filter(Boolean))];
  }
  state.lastBackupAt = typeof raw.lastBackupAt === 'string' ? raw.lastBackupAt : null;
  return state;
}

/** Cria ou atualiza um livro. Só um favorito por ano: marcar um desmarca os outros. */
export function upsertBook(state, input, nowTs = new Date().toISOString()) {
  const existing = state.books.find((b) => b.id === input.id);
  const book = normalizeBook({ ...input, createdAt: existing?.createdAt, updatedAt: nowTs }, nowTs);
  if (!book) throw new Error('Livro sem título.');
  let books = existing
    ? state.books.map((b) => (b.id === book.id ? book : b))
    : [...state.books, book];
  if (book.favorite && book.endDate) {
    const year = yearOf(book.endDate);
    books = books.map((b) => (b.id !== book.id && b.favorite && b.endDate && yearOf(b.endDate) === year
      ? { ...b, favorite: false, updatedAt: nowTs }
      : b));
  }
  let customGenres = state.customGenres;
  if (book.genre && !DEFAULT_GENRES.includes(book.genre) && !customGenres.includes(book.genre)) {
    customGenres = [...customGenres, book.genre];
  }
  return { state: { ...state, books, customGenres }, book };
}

export function removeBook(state, id) {
  return { ...state, books: state.books.filter((b) => b.id !== id) };
}

/** Recoloca um livro excluído (botão Desfazer), na mesma posição de antes. */
export function restoreBook(state, book, index) {
  if (state.books.some((b) => b.id === book.id)) return state;
  const books = [...state.books];
  books.splice(Math.min(Math.max(index, 0), books.length), 0, book);
  return { ...state, books };
}

/** Nova leitura de um livro já lido: um novo registro, começando hoje. */
export function startReread(state, id, today, nowTs = new Date().toISOString()) {
  const original = state.books.find((b) => b.id === id);
  if (!original) throw new Error('Livro não encontrado.');
  return upsertBook(state, {
    id: newId(),
    title: original.title,
    authors: original.authors,
    pages: original.pages,
    cover: original.cover,
    isbn: original.isbn,
    format: original.format,
    genre: original.genre,
    status: STATUS.READING,
    startDate: today,
    reread: true,
  }, nowTs);
}

export function getGoal(state, year) {
  return state.goals[String(year)] ?? state.defaultGoal;
}

export function setGoal(state, year, goal) {
  const g = intIn(goal, 1, 1000);
  if (!g) return state;
  return { ...state, goals: { ...state.goals, [String(year)]: g } };
}

export function allGenres(state) {
  const used = state.books.map((b) => b.genre).filter(Boolean);
  return [...new Set([...DEFAULT_GENRES, ...state.customGenres, ...used])];
}

export function loadState(storage) {
  try {
    const raw = storage.getItem(STORAGE_KEY);
    return raw ? normalizeState(JSON.parse(raw)) : createEmptyState();
  } catch {
    return createEmptyState();
  }
}

/** Devolve false quando o navegador recusa gravar (sem espaço, modo privado…). */
export function saveState(storage, state) {
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(state));
    return true;
  } catch {
    return false;
  }
}

export function serializeBackup(state, nowTs = new Date().toISOString()) {
  return JSON.stringify({
    app: BACKUP_APP_ID,
    schemaVersion: SCHEMA_VERSION,
    exportedAt: nowTs,
    data: state,
  }, null, 2);
}

export function parseBackup(textContent) {
  let parsed;
  try {
    parsed = JSON.parse(textContent);
  } catch {
    throw new Error('O arquivo não é um backup válido do Leituras.');
  }
  if (!parsed || parsed.app !== BACKUP_APP_ID || typeof parsed.data !== 'object') {
    throw new Error('O arquivo não é um backup válido do Leituras.');
  }
  if (Number(parsed.schemaVersion) > SCHEMA_VERSION) {
    throw new Error('Este backup foi feito por uma versão mais nova do app. Atualize o app e tente de novo.');
  }
  return normalizeState(parsed.data);
}
