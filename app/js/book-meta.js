// Dados extras do livro (1.6): humor e ritmo (como no StoryGraph), avaliação por critérios,
// sinopse e empréstimo. Tudo opcional. As regras de limpeza ficam aqui (store.js chama
// normalizeMoods, normalizePace, normalizeCriteria, normalizeDescription e normalizeLoan),
// junto do perfil de leitor do Resumo e dos links "Onde comprar".
// Sem importar store.js (ele importa daqui).

import { formatShort, isIsoDate, yearOf } from './dates.js';

// ---------- Humor e ritmo ----------

/** Humores possíveis, na ordem em que aparecem. O id é o que fica gravado. */
export const MOODS = [
  { id: 'emocionante', label: 'Emocionante' },
  { id: 'reflexivo', label: 'Reflexivo' },
  { id: 'leve', label: 'Leve' },
  { id: 'tenso', label: 'Tenso' },
  { id: 'inspirador', label: 'Inspirador' },
  { id: 'sombrio', label: 'Sombrio' },
  { id: 'engracado', label: 'Engraçado' },
  { id: 'triste', label: 'Triste' },
  { id: 'romantico', label: 'Romântico' },
  { id: 'misterioso', label: 'Misterioso' },
  { id: 'informativo', label: 'Informativo' },
  { id: 'desafiador', label: 'Desafiador' },
];
export const MOOD_IDS = MOODS.map((m) => m.id);
export const MOOD_LABELS = Object.fromEntries(MOODS.map((m) => [m.id, m.label]));

export const PACES = [
  { id: 'lento', label: 'Lento' },
  { id: 'medio', label: 'Médio' },
  { id: 'rapido', label: 'Rápido' },
];
export const PACE_IDS = PACES.map((p) => p.id);
export const PACE_LABELS = Object.fromEntries(PACES.map((p) => [p.id, p.label]));

/** Humores conhecidos, sem repetir, na ordem da lista (assim dois livros iguais gravam igual). */
export function normalizeMoods(value) {
  if (!Array.isArray(value)) return [];
  const set = new Set(value.filter((v) => typeof v === 'string'));
  return MOOD_IDS.filter((id) => set.has(id));
}

export function normalizePace(value) {
  return PACE_IDS.includes(value) ? value : null;
}

/** Liga/desliga um humor na lista (devolve uma lista nova, já na ordem). */
export function toggleMood(moods, id) {
  const list = normalizeMoods(moods);
  return list.includes(id) ? list.filter((m) => m !== id) : normalizeMoods([...list, id]);
}

// ---------- Avaliação por critérios ----------

export const CRITERIA = [
  { id: 'personagens', label: 'Personagens' },
  { id: 'enredo', label: 'Enredo' },
  { id: 'escrita', label: 'Escrita' },
  { id: 'emocao', label: 'Emoção' },
];
export const CRITERIA_IDS = CRITERIA.map((c) => c.id);

/** Mesma regra da nota principal: de 0,5 a 5, de meia em meia estrela; fora disso, sem nota. */
function halfStar(value) {
  const n = typeof value === 'string' ? Number(value.trim().replace(',', '.')) : value;
  if (typeof n !== 'number' || !Number.isFinite(n)) return null;
  const r = Math.round(n * 2) / 2;
  return r >= 0.5 && r <= 5 ? r : null;
}

/** { personagens: 4.5, escrita: 3 }: só critérios conhecidos com nota válida. */
export function normalizeCriteria(value) {
  const out = {};
  if (!value || typeof value !== 'object' || Array.isArray(value)) return out;
  for (const id of CRITERIA_IDS) {
    const r = halfStar(value[id]);
    if (r !== null) out[id] = r;
  }
  return out;
}

export function hasCriteria(criteria) {
  return Boolean(criteria) && CRITERIA_IDS.some((id) => typeof criteria[id] === 'number');
}

// ---------- Sinopse ----------

export const MAX_DESCRIPTION = 2000;

/** Tira o pedaço solto de um emoji cortado ao meio no fim do texto. */
const dropLoneSurrogate = (s) => s.replace(/[\uD800-\uDBFF]$/, '');

/**
 * Sinopse como fica gravada: texto puro, sem controles, no máximo uma linha em branco
 * entre parágrafos, até 2000 letras. Não mexe em "<" ou "&" (a tela escapa tudo):
 * aplicar de novo dá o mesmo resultado.
 */
export function normalizeDescription(value) {
  if (typeof value !== 'string') return '';
  const clean = value
    .replace(/\r\n?/g, '\n')
    .replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, ' ')
    .replace(/[ \t ]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  return dropLoneSurrogate(clean.slice(0, MAX_DESCRIPTION)).trim();
}

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', mdash: '—', ndash: '–', hellip: '…', laquo: '«', raquo: '»', ldquo: '“', rdquo: '”', lsquo: '‘', rsquo: '’' };

function decodeEntities(text) {
  return text.replace(/&(#x[0-9a-f]{1,6}|#\d{1,7}|[a-z]{2,8});/gi, (all, code) => {
    if (code[0] === '#') {
      const n = code[1] === 'x' || code[1] === 'X' ? parseInt(code.slice(2), 16) : Number(code.slice(1));
      return n > 31 && n < 0x110000 && !(n >= 0xD800 && n <= 0xDFFF) ? String.fromCodePoint(n) : ' ';
    }
    return ENTITIES[code.toLowerCase()] ?? all;
  });
}

/**
 * Sinopse vinda de uma busca (Google Books manda HTML: <p>, <br>, <b>...): vira texto puro.
 * Parágrafos e quebras viram linhas; o resto das marcações sai; entidades viram letras.
 * Longa demais, corta no fim de uma palavra com "…".
 */
export function descriptionFromSource(value) {
  if (typeof value !== 'string') {
    // Open Library: { type: '/type/text', value: '...' }
    if (value && typeof value === 'object' && typeof value.value === 'string') return descriptionFromSource(value.value);
    return '';
  }
  const text = decodeEntities(value
    .slice(0, 20000)
    .replace(/<\s*(script|style)\b[^>]*>[\s\S]*?<\s*\/\s*\1\s*>/gi, ' ')
    .replace(/<\s*br\s*\/?\s*>/gi, '\n')
    .replace(/<\s*\/?\s*(p|div|li|ul|ol|h[1-6]|blockquote)\b[^>]*>/gi, '\n\n')
    .replace(/<[^>]*>/g, '')
    .replace(/<[^>]*$/, ''));
  // Open Library às vezes traz a fonte no fim, em Markdown: "([source][1])" e "[1]: https://..."
  const plain = normalizeDescription(text.replace(/\n-{3,}\n[\s\S]*$/, '').replace(/^\s*\[\d+\]:\s*\S+\s*$/gm, '').replace(/\(\[[^\]]*\]\[\d+\]\)/g, ''));
  // "...", "-", "N/A": não é sinopse.
  if (!/\p{L}{3}/u.test(plain)) return '';
  if (plain.length < MAX_DESCRIPTION) return plain;
  const cut = plain.slice(0, MAX_DESCRIPTION - 1);
  const space = cut.lastIndexOf(' ');
  return `${dropLoneSurrogate(space > MAX_DESCRIPTION - 200 ? cut.slice(0, space) : cut).replace(/[\s,;:.–—-]+$/, '')}…`;
}

// ---------- Empréstimo ----------

export const MAX_LOAN_NAME = 60;

/** { to: 'Ana', since: '2026-10-03' } ou null (sem nome, não há empréstimo). */
export function normalizeLoan(value) {
  if (!value || typeof value !== 'object') return null;
  const to = typeof value.to === 'string' ? value.to.replace(/\s+/g, ' ').trim().slice(0, MAX_LOAN_NAME) : '';
  if (!to) return null;
  return { to, since: isIsoDate(value.since) ? value.since : null };
}

/** 'com Ana desde 3 out' (com o ano quando não é o de hoje); sem data: 'com Ana'. */
export function loanLabel(loan, today = '') {
  if (!loan?.to) return '';
  if (!isIsoDate(loan.since)) return `com ${loan.to}`;
  const year = isIsoDate(today) && yearOf(today) !== yearOf(loan.since) ? ` ${yearOf(loan.since)}` : '';
  return `com ${loan.to} desde ${formatShort(loan.since)}${year}`;
}

/** Nomes de quem já pegou livro emprestado (mais recentes primeiro), para sugerir no campo. */
export function loanNames(books) {
  const seen = new Set();
  const out = [];
  const sorted = [...books].filter((b) => b.loan?.to).sort((a, b) => String(b.loan.since || '').localeCompare(String(a.loan.since || '')));
  for (const b of sorted) {
    const key = b.loan.to.toLocaleLowerCase('pt-BR');
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(b.loan.to);
  }
  return out;
}

// ---------- Onde comprar ----------

/** Busca do livro nas lojas: pelo ISBN quando há; senão, título e primeiro autor. */
export function shopLinks(book) {
  const isbn = String(book?.isbn || '').replace(/[^0-9Xx]/g, '');
  const author = String(book?.authors || '').split(',')[0].trim();
  const words = [String(book?.title || '').trim(), author].filter(Boolean).join(' ');
  const q = encodeURIComponent(isbn.length === 10 || isbn.length === 13 ? isbn : words);
  if (!q) return [];
  return [
    { id: 'amazon', label: 'Amazon', host: 'amazon.com.br', href: `https://www.amazon.com.br/s?k=${q}` },
    { id: 'estante', label: 'Estante Virtual', host: 'estantevirtual.com.br', href: `https://www.estantevirtual.com.br/busca?q=${q}` },
  ];
}

// ---------- Perfil de leitor (Resumo → Gostos) ----------

/**
 * Humores e ritmo dos livros lidos no ano, só dos que têm esses dados.
 * moods: [{ id, label, count, pct }] do mais comum ao menos (empate: ordem da lista),
 *   pct = parte dos livros com humor marcado.
 * paces: [{ id, label, count, pct }] na ordem lento → rápido (todos os três, mesmo com 0).
 */
export function moodProfile(books, year) {
  const read = books.filter((b) => b.status === 'lido' && isIsoDate(b.endDate) && yearOf(b.endDate) === year);
  const withMoods = read.filter((b) => normalizeMoods(b.moods).length);
  const withPace = read.filter((b) => normalizePace(b.pace));
  const counts = new Map();
  for (const b of withMoods) for (const id of normalizeMoods(b.moods)) counts.set(id, (counts.get(id) || 0) + 1);
  const pct = (n, total) => (total ? Math.round((n / total) * 100) : 0);
  const moods = MOODS.filter((m) => counts.has(m.id))
    .map((m) => ({ ...m, count: counts.get(m.id), pct: pct(counts.get(m.id), withMoods.length) }))
    .sort((a, b) => b.count - a.count || MOOD_IDS.indexOf(a.id) - MOOD_IDS.indexOf(b.id));
  const paces = PACES.map((p) => {
    const count = withPace.filter((b) => b.pace === p.id).length;
    return { ...p, count, pct: pct(count, withPace.length) };
  });
  return {
    read: read.length,
    withMoods: withMoods.length,
    withPace: withPace.length,
    withAny: read.filter((b) => normalizeMoods(b.moods).length || normalizePace(b.pace)).length,
    moods,
    paces,
  };
}
