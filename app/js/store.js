// Estado do app: livros, metas por ano e preferências.
// Tudo fica no IndexedDB do celular (veja db.js); o backup em arquivo é a cópia de segurança.

import { isIsoDate, yearOf } from './dates.js';

// Chave usada até a versão 1.2 (localStorage). Os dados são migrados dela na primeira abertura.
export const STORAGE_KEY = 'leituras:v1';
// Chave do estado inteiro no IndexedDB (db.js).
export const DB_STATE_KEY = 'state';
export const BACKUP_APP_ID = 'leituras';
// 2: nota com meia estrela, série, tags, data alvo, citações, diário de leitura, próximos da fila e meta de páginas.
export const SCHEMA_VERSION = 2;
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
const MAX_SERIES = 120;
const MAX_TAGS = 30;
const MAX_TAG = 40;
export const MAX_QUOTES = 500;
const MAX_QUOTE = 5000;
const MAX_JOURNAL = 5000;
export const MAX_UP_NEXT = 5;
// Capa tirada pelo celular: imagem já reduzida pelo app (cerca de 50 KB).
const MAX_COVER_DATA = 600000;
const COVER_DATA_RE = /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/;

export function createEmptyState() {
  return {
    version: SCHEMA_VERSION,
    books: [],
    goals: {},
    defaultGoal: DEFAULT_GOAL,
    customGenres: [],
    lastBackupAt: null,
    upNext: [],
    pageGoals: {},
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

function toNumber(value) {
  const n = typeof value === 'string' ? Number(value.trim().replace(',', '.')) : value;
  return typeof n === 'number' && Number.isFinite(n) ? n : null;
}

/** Nota de 0,5 a 5, de meia em meia estrela (4,3 vira 4,5). Fora disso, sem nota. */
export function normalizeRating(value) {
  const n = toNumber(value);
  if (n === null) return null;
  const r = Math.round(n * 2) / 2;
  return r >= 0.5 && r <= 5 ? r : null;
}

/** Número do volume na série: maior que zero, aceita fração (2,5 = conto entre o 2 e o 3). */
function seriesNumber(value) {
  const n = toNumber(value);
  if (n === null || n <= 0 || n > 100000) return null;
  return Math.round(n * 100) / 100;
}

/** Tags livres: sem espaços nas pontas, sem repetir (ignora maiúsculas), até 30. */
export function normalizeTags(value) {
  if (!Array.isArray(value)) return [];
  const seen = new Set();
  const out = [];
  for (const item of value) {
    const tag = text(item, MAX_TAG);
    const key = tag.toLocaleLowerCase('pt-BR');
    if (!tag || seen.has(key)) continue;
    seen.add(key);
    out.push(tag);
    if (out.length === MAX_TAGS) break;
  }
  return out;
}

function normalizeQuote(raw, nowTs) {
  if (!raw || typeof raw !== 'object') return null;
  const quote = text(raw.text, MAX_QUOTE);
  if (!quote) return null;
  return {
    id: text(raw.id, 100) || newId(),
    text: quote,
    page: intIn(raw.page, 0, 20000),
    percent: intIn(raw.percent, 0, 100),
    note: text(raw.note, MAX_NOTES),
    createdAt: typeof raw.createdAt === 'string' ? raw.createdAt : nowTs,
  };
}

function normalizeQuotes(value, nowTs) {
  if (!Array.isArray(value)) return [];
  const seen = new Set();
  const out = [];
  for (const item of value) {
    const q = normalizeQuote(item, nowTs);
    if (!q || seen.has(q.id)) continue;
    seen.add(q.id);
    out.push(q);
    if (out.length === MAX_QUOTES) break;
  }
  return out;
}

/** Entrada do diário com 'minutes' só quando há tempo registrado (mantém o formato antigo sem ele). */
function withMinutes(entry, minutes) {
  const rest = { ...entry };
  delete rest.minutes;
  return minutes > 0 ? { ...rest, minutes: Math.min(1440, minutes) } : rest;
}

/**
 * Diário de leitura: { date, from, to, unit: 'page'|'percent', note, minutes? }.
 * Uma entrada por dia, em ordem de data. Dias repetidos viram um só
 * (fica o 'from' da primeira e o 'to' da última). Regras de gravação em journal.js.
 */
export function normalizeJournal(value) {
  if (!Array.isArray(value)) return [];
  const byDate = new Map();
  for (const raw of value) {
    if (!raw || typeof raw !== 'object' || !isIsoDate(raw.date)) continue;
    const unit = raw.unit === 'percent' ? 'percent' : 'page';
    const max = unit === 'percent' ? 100 : 20000;
    const from = intIn(raw.from, 0, max);
    const to = intIn(raw.to, 0, max);
    if (from === null || to === null) continue;
    const note = text(raw.note, MAX_NOTES);
    // Minutos do cronômetro (opcional): inteiro de 0 a 1440; no mesmo dia, somam.
    const minutes = intIn(raw.minutes, 0, 1440) || 0;
    const prev = byDate.get(raw.date);
    if (prev && prev.unit === unit) {
      byDate.set(raw.date, withMinutes({ ...prev, to, note: [prev.note, note].filter(Boolean).join('\n') }, (prev.minutes || 0) + minutes));
    } else {
      byDate.set(raw.date, withMinutes({ date: raw.date, from, to, unit, note }, minutes));
    }
  }
  return [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date)).slice(-MAX_JOURNAL);
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
    rating: status === STATUS.READ ? normalizeRating(raw.rating) : null,
    favorite: status === STATUS.READ && raw.favorite === true,
    notes: text(raw.notes, MAX_NOTES),
    dropReason: status === STATUS.DROPPED ? text(raw.dropReason, MAX_NOTES) : '',
    reread: raw.reread === true,
    series: text(raw.series, MAX_SERIES),
    seriesNumber: seriesNumber(raw.seriesNumber),
    tags: normalizeTags(raw.tags),
    // "Quero terminar até": só faz sentido enquanto está lendo.
    targetDate: status === STATUS.READING && isIsoDate(raw.targetDate) ? raw.targetDate : null,
    quotes: normalizeQuotes(raw.quotes, nowTs),
    journal: normalizeJournal(raw.journal),
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
  if (book.seriesNumber !== null && book.seriesNumber !== undefined && book.seriesNumber !== ''
    && seriesNumber(book.seriesNumber) === null) {
    errors.push('O número na série deve ser maior que zero.');
  }
  if (book.status === STATUS.READING && book.targetDate) {
    if (!isIsoDate(book.targetDate)) errors.push('Data para terminar inválida.');
    else if (isIsoDate(book.startDate) && book.targetDate < book.startDate) {
      errors.push('A data para terminar é anterior à de início.');
    }
  }
  if (Array.isArray(book.tags) && book.tags.length > MAX_TAGS) {
    errors.push(`Use no máximo ${MAX_TAGS} etiquetas.`);
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
  state.upNext = cleanUpNext(state.books, raw.upNext);
  if (raw.pageGoals && typeof raw.pageGoals === 'object') {
    for (const [year, goal] of Object.entries(raw.pageGoals)) {
      const g = intIn(goal, 1, 1000000);
      if (/^\d{4}$/.test(year) && g) state.pageGoals[year] = g;
    }
  }
  return state;
}

/** Próximos da fila: só livros "Quero ler" que existem, sem repetir, até 5, na ordem dada. */
function cleanUpNext(books, ids) {
  if (!Array.isArray(ids)) return [];
  const want = new Set(books.filter((b) => b.status === STATUS.WANT).map((b) => b.id));
  return [...new Set(ids.filter((id) => typeof id === 'string' && want.has(id)))].slice(0, MAX_UP_NEXT);
}

/** Define a lista "Próximos" (ids de livros "Quero ler", em ordem). */
export function setUpNext(state, ids) {
  return { ...state, upNext: cleanUpNext(state.books, ids) };
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
  // Livro que saiu da fila (começou a ler) deixa de estar entre os próximos.
  return { state: { ...state, books, customGenres, upNext: cleanUpNext(books, state.upNext) }, book };
}

export function removeBook(state, id) {
  const books = state.books.filter((b) => b.id !== id);
  return { ...state, books, upNext: cleanUpNext(books, state.upNext) };
}

/**
 * Recoloca um livro excluído (botão Desfazer), na mesma posição de antes.
 * upNextIndex: onde ele estava em "Próximos" (-1 se não estava).
 */
export function restoreBook(state, book, index, upNextIndex = -1) {
  if (state.books.some((b) => b.id === book.id)) return state;
  const books = [...state.books];
  books.splice(Math.min(Math.max(index, 0), books.length), 0, book);
  const upNext = [...(state.upNext || [])];
  if (upNextIndex >= 0) upNext.splice(Math.min(upNextIndex, upNext.length), 0, book.id);
  return { ...state, books, upNext: cleanUpNext(books, upNext) };
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
    series: original.series,
    seriesNumber: original.seriesNumber,
    tags: original.tags,
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

/** Meta de páginas do ano, ou null (não há meta padrão). */
export function getPageGoal(state, year) {
  return state.pageGoals?.[String(year)] ?? null;
}

/** Define a meta de páginas do ano; null (ou valor inválido) remove. */
export function setPageGoal(state, year, goal) {
  const pageGoals = { ...(state.pageGoals || {}) };
  const g = intIn(goal, 1, 1000000);
  if (g) pageGoals[String(year)] = g;
  else delete pageGoals[String(year)];
  return { ...state, pageGoals };
}

export function allGenres(state) {
  const used = state.books.map((b) => b.genre).filter(Boolean);
  return [...new Set([...DEFAULT_GENRES, ...state.customGenres, ...used])];
}

/**
 * Contagem das tags nos livros, sem diferenciar maiúsculas ("Clássico" e "clássico" são a mesma).
 * Devolve [{ label, count }] da mais usada para a menos usada (empate: ordem alfabética);
 * o nome mostrado é a grafia mais usada (empate: a que apareceu primeiro).
 */
export function countTags(books) {
  const groups = new Map();
  for (const b of books) {
    for (const tag of b.tags || []) {
      const key = tag.toLocaleLowerCase('pt-BR');
      const g = groups.get(key) || { count: 0, spellings: new Map() };
      g.count += 1;
      g.spellings.set(tag, (g.spellings.get(tag) || 0) + 1);
      groups.set(key, g);
    }
  }
  return [...groups.values()]
    .map((g) => ({ label: [...g.spellings.entries()].reduce((a, b) => (b[1] > a[1] ? b : a))[0], count: g.count }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label, 'pt-BR'));
}

/** Tags usadas nos livros, da mais usada para a menos usada (empate: ordem alfabética). */
export function allTags(state) {
  return countTags(state.books).map((t) => t.label);
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

/** Igualdade de valores JSON (a ordem das chaves não importa). */
export function jsonEqual(a, b) {
  if (a === b) return true;
  if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  if (Array.isArray(a)) return a.length === b.length && a.every((v, i) => jsonEqual(v, b[i]));
  const ka = Object.keys(a).filter((k) => a[k] !== undefined);
  const kb = Object.keys(b).filter((k) => b[k] !== undefined);
  return ka.length === kb.length && ka.every((k) => Object.hasOwn(b, k) && jsonEqual(a[k], b[k]));
}

function readLegacy(legacy) {
  try {
    return legacy.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

/**
 * Abre os dados salvos. Na primeira abertura da versão 1.3, migra do localStorage.
 *
 * kv: armazenamento assíncrono do db.js ({ storageMode, getItem, setItem, removeItem, markStored }).
 * legacy: o localStorage (chave 'leituras:v1' das versões até 1.2).
 *
 * Migração: copia o JSON do localStorage para o kv, lê de volta e compara.
 * Só apaga o localStorage se a cópia for idêntica. Se algo falhar, continua usando
 * o localStorage (backend 'legacy') e tenta de novo na próxima abertura.
 * Enquanto a chave antiga existir, ela é a fonte da verdade: nunca se perde dado.
 *
 * Devolve { state, backend, migrated, error }:
 *   backend 'kv' grava no db.js, 'legacy' grava no localStorage antigo,
 *   null não grava (os dados estão no IndexedDB, mas ele não abriu agora).
 */
export async function openStoredState(kv, legacy) {
  let mode;
  try {
    mode = await kv.storageMode();
  } catch {
    mode = null;
  }
  const raw = readLegacy(legacy);
  let parsed = null;
  if (raw) {
    try {
      parsed = JSON.parse(raw);
    } catch {
      parsed = null;
    }
  }
  const result = (state, backend, extra = {}) => ({ state, backend, migrated: false, error: false, ...extra });

  // Sem IndexedDB: segue no localStorage, como nas versões anteriores.
  if (mode === 'localstorage') return result(loadState(legacy), 'legacy');
  if (mode === null) {
    if (parsed) return result(normalizeState(parsed), 'legacy');
    return result(createEmptyState(), null, { error: true });
  }

  if (parsed && typeof parsed === 'object') {
    try {
      await kv.setItem(DB_STATE_KEY, parsed);
      const back = await kv.getItem(DB_STATE_KEY);
      if (!jsonEqual(back, parsed)) throw new Error('Cópia diferente do original.');
      legacy.removeItem(STORAGE_KEY);
      // A marca "dados no IndexedDB" vai para o localStorage; se ele estava cheio
      // (capas por foto na 1.2), só agora, sem a chave antiga, ela cabe.
      kv.markStored?.();
      return result(normalizeState(parsed), 'kv', { migrated: true });
    } catch {
      try {
        await kv.removeItem(DB_STATE_KEY);
      } catch {
        // A chave antiga continua valendo; a cópia incompleta é sobrescrita na próxima tentativa.
      }
      return result(normalizeState(parsed), 'legacy');
    }
  }

  try {
    const stored = await kv.getItem(DB_STATE_KEY);
    return result(stored ? normalizeState(stored) : createEmptyState(), 'kv');
  } catch {
    return result(createEmptyState(), null, { error: true });
  }
}

/**
 * Relê o estado gravado no backend em uso (outra aba salvou, ou o app voltou do segundo plano).
 * Não migra nada: isso é só na abertura. Devolve null se não houver dados ou não der para ler.
 */
export async function readStoredState(backend, kv, legacy) {
  try {
    if (backend === 'legacy') {
      const raw = legacy.getItem(STORAGE_KEY);
      return raw ? normalizeState(JSON.parse(raw)) : null;
    }
    if (backend !== 'kv') return null;
    const stored = await kv.getItem(DB_STATE_KEY);
    return stored ? normalizeState(stored) : null;
  } catch {
    return null;
  }
}

/** Grava o estado no backend escolhido por openStoredState. Devolve false se não conseguir. */
export async function writeStoredState(backend, kv, legacy, state) {
  if (backend === 'legacy') return saveState(legacy, state);
  if (backend !== 'kv') return false;
  try {
    await kv.setItem(DB_STATE_KEY, state);
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
  if (!parsed || parsed.app !== BACKUP_APP_ID || !parsed.data || typeof parsed.data !== 'object') {
    throw new Error('O arquivo não é um backup válido do Leituras.');
  }
  // Aceita backups da versão 1 (sem os campos novos) e da 2.
  if (Number(parsed.schemaVersion) > SCHEMA_VERSION) {
    throw new Error('Este backup foi feito por uma versão mais nova do app. Atualize o app e tente de novo.');
  }
  // Sem a lista de livros, importar apagaria tudo: recusa o arquivo.
  if (!Array.isArray(parsed.data.books)) throw new Error('O arquivo não é um backup válido do Leituras.');
  return normalizeState(parsed.data);
}
