// Chave opcional do Google Books. Fica no localStorage e fora do estado de propósito:
// assim não vai parar no arquivo de backup (que a pessoa compartilha no Drive, WhatsApp…).

export const GOOGLE_KEY_STORAGE = 'leituras:googleBooksKey';

/** Formato típico de uma chave de API do Google: começa com 'AIza' e tem 39 caracteres. */
export function looksLikeGoogleKey(key) {
  return /^AIza[0-9A-Za-z_-]{35}$/.test(key);
}

export function readGoogleKey(storage) {
  try {
    return storage.getItem(GOOGLE_KEY_STORAGE) || '';
  } catch {
    return '';
  }
}

/**
 * Salva a chave (sem espaços nas pontas). Formato estranho só gera aviso: a pessoa decide.
 * Devolve { ok, key, warning }; ok = false se vazia ou se o navegador recusar gravar.
 */
export function saveGoogleKey(storage, value) {
  const key = String(value ?? '').replace(/\s+/g, '');
  if (!key) return { ok: false, key: '', warning: false };
  try {
    storage.setItem(GOOGLE_KEY_STORAGE, key);
  } catch {
    return { ok: false, key, warning: false };
  }
  return { ok: true, key, warning: !looksLikeGoogleKey(key) };
}

export function removeGoogleKey(storage) {
  try {
    storage.removeItem(GOOGLE_KEY_STORAGE);
  } catch {
    // Sem acesso ao armazenamento: nada a remover.
  }
}

// ---------- Chave da busca com IA (Gemini) ----------
// Mesmo cuidado da chave do Google Books: só no localStorage deste aparelho, fora do backup.

export const GEMINI_KEY_STORAGE = 'leituras:geminiKey';

/**
 * Formato das chaves do Gemini: a antiga (AIza + 35, 39 caracteres) ou a nova chave do
 * AI Studio, que começa com "AQ.". Outro formato só gera aviso.
 */
export function looksLikeGeminiKey(key) {
  return looksLikeGoogleKey(key) || /^AQ\.[0-9A-Za-z_.-]{20,}$/.test(key);
}

export function readGeminiKey(storage) {
  try {
    return storage.getItem(GEMINI_KEY_STORAGE) || '';
  } catch {
    return '';
  }
}

/** Como saveGoogleKey: devolve { ok, key, warning }. */
export function saveGeminiKey(storage, value) {
  const key = String(value ?? '').replace(/\s+/g, '');
  if (!key) return { ok: false, key: '', warning: false };
  try {
    storage.setItem(GEMINI_KEY_STORAGE, key);
  } catch {
    return { ok: false, key, warning: false };
  }
  return { ok: true, key, warning: !looksLikeGeminiKey(key) };
}

export function removeGeminiKey(storage) {
  try {
    storage.removeItem(GEMINI_KEY_STORAGE);
  } catch {
    // Sem acesso ao armazenamento: nada a remover.
  }
}

// ---------- Limite de segurança da busca com IA ----------
// Para não gastar à toa a cota gratuita do Google (a busca com IA não usa cartão nem
// faturamento), cada aparelho faz no máximo AI_MONTHLY_LIMIT buscas com IA por mês.
// Só conta a busca que de fato foi enviada ao Google, uma vez por busca (mesmo quando ela
// faz os dois pedidos: procurar e conferir o ISBN). Fica no localStorage, fora do backup.

export const AI_USAGE_STORAGE = 'leituras:iaUso';
export const AI_MONTHLY_LIMIT = 30;

/** Mês "AAAA-MM" de uma data ISO ("2026-10-27") ou de um Date (no fuso do aparelho). */
function monthOf(today) {
  if (typeof today === 'string') return today.slice(0, 7);
  const d = today instanceof Date ? today : new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

/** { mes, n } guardado, ou um registro vazio se não houver (ou estiver estragado). */
export function readAiUsage(storage) {
  try {
    const raw = JSON.parse(storage.getItem(AI_USAGE_STORAGE) || 'null');
    if (raw && typeof raw.mes === 'string' && Number.isInteger(raw.n) && raw.n >= 0) return { mes: raw.mes, n: raw.n };
  } catch { /* registro estragado ou sem acesso: começa do zero */ }
  return { mes: '', n: 0 };
}

/** Buscas com IA feitas no mês de today (registro de outro mês = 0). */
export function aiSearchesThisMonth(usage, today) {
  return usage && usage.mes === monthOf(today) && Number.isInteger(usage.n) ? usage.n : 0;
}

/** Chegou ao limite de segurança deste mês? */
export function aiLimitReached(usage, today) {
  return aiSearchesThisMonth(usage, today) >= AI_MONTHLY_LIMIT;
}

/**
 * Conta uma busca enviada e devolve o novo { mes, n }. current: a contagem em memória
 * (vale a maior das duas, para o limite valer mesmo se o navegador recusar gravar).
 */
export function countAiSearch(storage, today, current = null) {
  const n = Math.max(aiSearchesThisMonth(readAiUsage(storage), today), aiSearchesThisMonth(current, today)) + 1;
  const usage = { mes: monthOf(today), n };
  try {
    storage.setItem(AI_USAGE_STORAGE, JSON.stringify(usage));
  } catch { /* sem armazenamento: vale só enquanto o app estiver aberto */ }
  return usage;
}

// ---------- Levar as chaves para outro celular ----------
// Um link do app com as duas chaves no fragmento (#/ajustes?chaves=...): o que vem depois
// do # nunca vai para servidor nenhum. Só as chaves de busca entram, nunca dados de livros.
// Quem abre o link vê um pedido de confirmação em Ajustes; nada é salvo sem o toque.

const KEY_CHARS = /^[0-9A-Za-z_.-]{10,200}$/;

function toBase64Url(text) {
  return btoa(text).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(text) {
  const b64 = text.replace(/-/g, '+').replace(/_/g, '/');
  return atob(b64 + '='.repeat((4 - (b64.length % 4)) % 4));
}

/** Parâmetro "chaves" do link, ou '' se não houver chave para enviar. */
export function encodeKeysParam({ googleBooksKey = '', geminiKey = '' } = {}) {
  const keys = {};
  if (KEY_CHARS.test(googleBooksKey)) keys.googleBooksKey = googleBooksKey;
  if (KEY_CHARS.test(geminiKey)) keys.geminiKey = geminiKey;
  return Object.keys(keys).length ? toBase64Url(JSON.stringify(keys)) : '';
}

/** Link do app (base = endereço do app, sem o #) que leva as chaves. */
export function keysLink(base, keys) {
  const param = encodeKeysParam(keys);
  return param ? `${String(base).split('#')[0]}#/ajustes?chaves=${param}` : '';
}

/**
 * Lê o parâmetro "chaves" (ou um link inteiro colado) e devolve { googleBooksKey?, geminiKey? }
 * só com chaves de formato plausível; null se não houver nenhuma.
 */
export function decodeKeysParam(value) {
  let param = String(value ?? '').trim();
  const inLink = param.match(/[?&#]chaves=([0-9A-Za-z_-]+)/);
  if (inLink) param = inLink[1];
  if (!/^[0-9A-Za-z_-]{8,2000}$/.test(param)) return null;
  let data;
  try {
    data = JSON.parse(fromBase64Url(param));
  } catch {
    return null;
  }
  if (!data || typeof data !== 'object') return null;
  const out = {};
  if (typeof data.googleBooksKey === 'string' && KEY_CHARS.test(data.googleBooksKey)) out.googleBooksKey = data.googleBooksKey;
  if (typeof data.geminiKey === 'string' && KEY_CHARS.test(data.geminiKey)) out.geminiKey = data.geminiKey;
  return Object.keys(out).length ? out : null;
}

// ---------- Nome para a saudação do Início (v1.5) ----------
// Cada celular é de uma pessoa: o nome fica só no localStorage deste aparelho, fora do backup
// (um backup importado no celular de outra pessoa não troca o nome dela).

export const NAME_STORAGE = 'leituras:nome';
export const NAME_MAX = 30;

// Controles, marcas de direção e caracteres invisíveis: não têm lugar num nome. O "juntor"
// (U+200D, ZWJ) e o não-juntor (U+200C) ficam: formam emoji como 👩‍💻 e 👨‍👩‍👧 e algumas escritas.
const NAME_JUNK = /[\u0000-\u001F\u007F-\u009F\u200B\u200E\u200F\u2028-\u202E\u2066-\u2069\uFEFF]/g;

/** Nome limpo: sem caracteres invisíveis, espaços juntados, no máximo 30 caracteres (sem partir emoji). */
export function cleanName(value) {
  const text = String(value ?? '').replace(NAME_JUNK, '').replace(/\s+/g, ' ').trim();
  // Cortado no limite, não termina num juntor solto.
  return Array.from(text).slice(0, NAME_MAX).join('').replace(/[\u200C\u200D]+$/, '').trim();
}

export function readName(storage) {
  try {
    return cleanName(storage.getItem(NAME_STORAGE) || '');
  } catch {
    return '';
  }
}

/** Salva (ou apaga, se vazio) e devolve { ok, name }; ok = false se o navegador recusar gravar. */
export function saveName(storage, value) {
  const name = cleanName(value);
  try {
    if (name) storage.setItem(NAME_STORAGE, name);
    else storage.removeItem(NAME_STORAGE);
  } catch {
    return { ok: false, name };
  }
  return { ok: true, name };
}
