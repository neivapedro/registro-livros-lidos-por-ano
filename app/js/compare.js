// Comparar com outra pessoa, sem servidor (1.6). Cada celular tem os seus livros; para
// comparar, um manda ao outro um link do app com um RESUMO do ano no fragmento
// (#/comparar?d=...): números, meses, gêneros, o favorito e, se a pessoa quiser, a lista dos
// livros lidos no ano (título, autor e nota) para achar os "livros em comum". Nada do link
// entra nos livros de quem abre: ele só é mostrado (e, se a pessoa pedir, guardado à parte).
//
// Formato do parâmetro d: "z." + base64url do JSON compactado (deflate-raw, CompressionStream,
// iOS 16.4+) ou "j." + base64url do JSON puro (sem CompressionStream). Quem abre descompacta
// com inflate.js (funciona em qualquer iOS 16). O link é dado NÃO confiável: o esquema é
// estrito (chaves conhecidas, tipos, faixas e tamanhos) e o texto é limpo aqui e escapado na tela.

import { inflateRaw } from './inflate.js';
import { getGoal } from './store.js';
import { splitAuthors, yearStats } from './stats.js';

export const COMPARE_VERSION = 1;
/** Tamanho máximo do parâmetro d aceito ao abrir (e buscado ao gerar). */
export const MAX_PARAM = 8000;
/** Ao gerar, o link fica abaixo disto (a lista de livros encurta se precisar). */
export const TARGET_PARAM = 6000;
const MAX_JSON = 32768;
const MAX_BOOKS = 300;
const MAX_TITLE = 120;
const MAX_AUTHOR = 80;
const MAX_GENRE = 60;
const MAX_NAME = 30;
const MAX_COUNT = 5000;

export const COMPARE_STORAGE = 'leituras:comparacao';

// Controles, marcas de direção e invisíveis (como em prefs.js: cleanName).
const JUNK = /[\u0000-\u001F\u007F-\u009F\u200B\u200E\u200F\u2028-\u202E\u2066-\u2069\uFEFF]/g;

/** Texto limpo e cortado (sem partir emoji). */
export function cleanText(value, max) {
  const text = String(value ?? '').replace(JUNK, '').replace(/\s+/g, ' ').trim();
  const chars = Array.from(text);
  return chars.length > max ? chars.slice(0, max).join('').trim() : text;
}

// ---------- base64url ----------

function bytesToB64u(bytes) {
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function b64uToBytes(text) {
  const b64 = text.replace(/-/g, '+').replace(/_/g, '/');
  const bin = atob(b64 + '='.repeat((4 - (b64.length % 4)) % 4));
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i += 1) out[i] = bin.charCodeAt(i);
  return out;
}

// ---------- Montar o resumo ----------

const round1 = (n) => Math.round(n * 10) / 10;

/**
 * Resumo do ano para mandar: { v, n, y, c, p, g, r, m, t, f, b?, s }.
 * withBooks: inclui a lista dos livros lidos no ano (título, primeiro autor, nota ou 0).
 */
export function buildSnapshot(state, year, today, { name = '', withBooks = true } = {}) {
  const s = yearStats(state.books, year, getGoal(state, year), today);
  const snap = {
    v: COMPARE_VERSION,
    n: cleanText(name, MAX_NAME),
    y: year,
    c: s.count,
    p: Math.round(s.pages || 0),
    g: s.goal,
    r: s.avgRating === null ? null : round1(s.avgRating),
    m: s.byMonth.slice(),
    t: s.genres.slice(0, 5).map((g) => [cleanText(g.label, MAX_GENRE), g.count]),
    f: s.favorite ? [cleanText(s.favorite.title, MAX_TITLE), cleanText(splitAuthors(s.favorite.authors)[0] || '', MAX_AUTHOR)] : null,
    s: today,
  };
  if (withBooks) {
    snap.b = s.books.slice(0, MAX_BOOKS).map((b) => [cleanText(b.title, MAX_TITLE), cleanText(splitAuthors(b.authors)[0] || '', MAX_AUTHOR), b.rating || 0]);
  }
  return snap;
}

async function deflate(bytes) {
  const stream = new Blob([bytes]).stream().pipeThrough(new CompressionStream('deflate-raw'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

/** Parâmetro d do resumo: compactado quando o aparelho sabe compactar (e fica menor). */
export async function encodeSnapshot(snap, { compress = true } = {}) {
  const bytes = new TextEncoder().encode(JSON.stringify(snap));
  if (compress && typeof CompressionStream === 'function') {
    try {
      const z = await deflate(bytes);
      if (z.length < bytes.length) return `z.${bytesToB64u(z)}`;
    } catch { /* sem deflate-raw neste navegador: vai sem compactar */ }
  }
  return `j.${bytesToB64u(bytes)}`;
}

/**
 * Parâmetro que cabe no limite: se a lista de livros deixar o link grande demais, ela encurta
 * (fica o começo, os mais recentes). Devolve { param, snap } ou null (sem como caber).
 */
export async function encodeWithinLimit(snap, { limit = TARGET_PARAM, compress = true } = {}) {
  let current = snap;
  for (;;) {
    const param = await encodeSnapshot(current, { compress });
    if (param.length <= limit) return { param, snap: current };
    if (!current.b) return null;
    const keep = current.b.length > 1 ? Math.floor(current.b.length * 0.75) : 0;
    current = { ...current };
    if (keep) current.b = snap.b.slice(0, keep);
    else delete current.b;
  }
}

/** Link do app que abre a comparação (base = endereço do app, sem o #). */
export function compareLink(base, param) {
  return `${String(base).split('#')[0]}#/comparar?d=${param}`;
}

// ---------- Ler o link (dado não confiável) ----------

const isInt = (v, min, max) => Number.isInteger(v) && v >= min && v <= max;
const isStr = (v, max) => typeof v === 'string' && Array.from(v).length <= max;
const isRating = (v) => typeof v === 'number' && Number.isFinite(v) && v >= 0.5 && v <= 5 && Math.round(v * 2) === v * 2;
const KEYS = new Set(['v', 'n', 'y', 'c', 'p', 'g', 'r', 'm', 't', 'f', 'b', 's']);

/** Confere o resumo campo a campo. Devolve uma cópia limpa ou null (qualquer coisa fora do esperado). */
export function validateSnapshot(data) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return null;
  if (Object.getPrototypeOf(data) !== Object.prototype) return null;
  const keys = Object.keys(data);
  if (keys.some((k) => !KEYS.has(k))) return null;
  const { v, n = '', y, c, p, g = null, r = null, m, t = [], f = null, b, s = '' } = data;
  if (v !== COMPARE_VERSION) return null;
  if (!isStr(n, MAX_NAME + 10) || !isInt(y, 1900, 2200) || !isInt(c, 0, MAX_COUNT) || !isInt(p, 0, 10000000)) return null;
  if (g !== null && !isInt(g, 1, 1000)) return null;
  if (r !== null && !(typeof r === 'number' && Number.isFinite(r) && r >= 0.5 && r <= 5)) return null;
  if (!Array.isArray(m) || m.length !== 12 || !m.every((x) => isInt(x, 0, MAX_COUNT))) return null;
  if (m.reduce((a, x) => a + x, 0) !== c) return null;
  if (!Array.isArray(t) || t.length > 5) return null;
  if (!t.every((x) => Array.isArray(x) && x.length === 2 && isStr(x[0], MAX_GENRE) && x[0].trim() && isInt(x[1], 1, MAX_COUNT))) return null;
  if (f !== null && !(Array.isArray(f) && f.length === 2 && isStr(f[0], MAX_TITLE) && f[0].trim() && isStr(f[1], MAX_AUTHOR))) return null;
  if (b !== undefined) {
    if (!Array.isArray(b) || b.length > MAX_BOOKS) return null;
    const ok = b.every((x) => Array.isArray(x) && x.length === 3 && isStr(x[0], MAX_TITLE) && x[0].trim()
      && isStr(x[1], MAX_AUTHOR) && (x[2] === 0 || isRating(x[2])));
    if (!ok) return null;
  }
  if (typeof s !== 'string' || (s && !/^\d{4}-\d{2}-\d{2}$/.test(s))) return null;
  const out = {
    v,
    n: cleanText(n, MAX_NAME),
    y,
    c,
    p,
    g,
    r: r === null ? null : round1(r),
    m: m.slice(),
    t: t.map(([label, count]) => [cleanText(label, MAX_GENRE), count]).filter(([label]) => label),
    f: f ? [cleanText(f[0], MAX_TITLE), cleanText(f[1], MAX_AUTHOR)] : null,
    s,
  };
  if (f && !out.f[0]) out.f = null;
  if (b) out.b = b.map(([title, author, rating]) => [cleanText(title, MAX_TITLE), cleanText(author, MAX_AUTHOR), rating]).filter(([title]) => title);
  return out;
}

/** Só o parâmetro d: de um link inteiro colado (com texto em volta) ou do próprio valor. */
export function extractParam(value) {
  const text = String(value ?? '').trim();
  const inLink = text.match(/[?&]d=([zj]\.[0-9A-Za-z_-]+)/);
  return inLink ? inLink[1] : text;
}

/** Lê o parâmetro d (ou um link colado). Devolve o resumo conferido ou null. */
export function decodeSnapshot(value) {
  const param = extractParam(value);
  if (param.length > MAX_PARAM || !/^[zj]\.[0-9A-Za-z_-]{4,}$/.test(param)) return null;
  try {
    let bytes = b64uToBytes(param.slice(2));
    if (param[0] === 'z') bytes = inflateRaw(bytes, { maxOut: MAX_JSON });
    if (bytes.length > MAX_JSON) return null;
    return validateSnapshot(JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)));
  } catch {
    return null;
  }
}

// ---------- Livros em comum ----------

/** Chave para achar o mesmo livro: sem acentos, maiúsculas, pontuação e "(Série, #2)"; do autor, o sobrenome. */
export function bookKey(title, author = '') {
  const norm = (s) => String(s || '').normalize('NFD').replace(/[\u0300-\u036F]/g, '').toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
  // Sem a série no fim ("Duna (Crônicas de Duna, #1)"); o subtítulo fica: "Percy Jackson: O mar
  // de monstros" não é "Percy Jackson: O ladrão de raios". Título só com parênteses: inteiro.
  const t = norm(String(title || '').replace(/\s*\([^()]*\)\s*$/, '')) || norm(title);
  const words = norm(author).split(' ').filter(Boolean);
  return `${t}|${words.length ? words[words.length - 1] : ''}`;
}

/**
 * Livros dos dois: os do link (lidos no ano dele) que você também leu (em qualquer ano).
 * Sem autor de um dos lados, vale só o título. Devolve [{ title, author, mine, theirs }].
 */
export function commonBooks(theirs, myBooks) {
  if (!Array.isArray(theirs?.b)) return [];
  const mine = new Map();
  const mineByTitle = new Map();
  const read = (myBooks || []).filter((b) => b.status === 'lido')
    .sort((a, b) => String(a.endDate || '').localeCompare(String(b.endDate || '')));
  for (const b of read) {
    const author = splitAuthors(b.authors)[0] || '';
    mine.set(bookKey(b.title, author), b);
    mineByTitle.set(bookKey(b.title), b);
  }
  const seen = new Set();
  const out = [];
  for (const [title, author, rating] of theirs.b) {
    let hit = mine.get(bookKey(title, author));
    if (!hit) {
      const byTitle = mineByTitle.get(bookKey(title));
      if (byTitle && (!author || !splitAuthors(byTitle.authors).length)) hit = byTitle;
    }
    if (!hit || seen.has(hit.id)) continue;
    seen.add(hit.id);
    out.push({ title: hit.title, author: author || splitAuthors(hit.authors)[0] || '', mine: hit.rating || 0, theirs: rating || 0, id: hit.id });
  }
  return out;
}

// ---------- Guardar para ver depois ----------
// Fica no localStorage deste aparelho, numa chave própria, fora dos livros e do backup:
// é um resumo de OUTRA pessoa (o backup é dos seus dados) e um link novo o traz de volta.
// Guarda o próprio parâmetro, conferido de novo ao abrir.

export function readSavedCompare(storage) {
  try {
    const raw = JSON.parse(storage.getItem(COMPARE_STORAGE) || 'null');
    if (!raw || typeof raw.d !== 'string') return null;
    const snap = decodeSnapshot(raw.d);
    return snap ? { param: raw.d, snap, savedAt: typeof raw.em === 'string' ? raw.em.slice(0, 10) : '' } : null;
  } catch {
    return null;
  }
}

export function saveCompare(storage, param, today) {
  if (!decodeSnapshot(param)) return false;
  try {
    storage.setItem(COMPARE_STORAGE, JSON.stringify({ d: param, em: today }));
    return true;
  } catch {
    return false;
  }
}

export function removeSavedCompare(storage) {
  try {
    storage.removeItem(COMPARE_STORAGE);
  } catch { /* nada a remover */ }
}
