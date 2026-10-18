// Trechos salvos dos livros: criar, corrigir, apagar e buscar.
// Cada livro guarda em book.quotes { id, text, page, percent, note, createdAt }.
// Funções puras: devolvem uma lista nova, sem alterar a original.

import { FORMATS } from './store.js';

const MAX_QUOTE = 5000;
const MAX_NOTE = 10000;

/** Ignora maiúsculas e acentos ("coracao" acha "Coração"). */
export function fold(value) {
  return String(value ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
}

/** Mais recentes primeiro. */
export function quotesNewestFirst(book) {
  return [...(book.quotes || [])].sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
}

/** "p. 123", "45%" ou '' (sem posição). */
export function quotePosition(quote) {
  if (quote.page !== null && quote.page !== undefined) return `p. ${quote.page}`;
  if (quote.percent !== null && quote.percent !== undefined) return `${quote.percent}%`;
  return '';
}

/** Kindle marca o trecho em %, livro físico em página. */
export function quoteUsesPercent(book) {
  return book.format === FORMATS.KINDLE;
}

/**
 * Lê o formulário { text, position, note } e devolve { quote } pronto para salvar
 * ou { error }. `existing` é o trecho sendo corrigido (mantém id e data).
 */
export function buildQuote(book, input, { existing = null, id, nowTs }) {
  const text = String(input.text ?? '').trim().slice(0, MAX_QUOTE);
  if (!text) return { error: 'Escreva o trecho.' };
  const percent = quoteUsesPercent(book);
  const raw = String(input.position ?? '').trim().replace('%', '').replace(',', '.');
  let value = null;
  if (raw !== '') {
    value = Number(raw);
    if (!Number.isFinite(value) || value < 0) return { error: percent ? 'Informe uma porcentagem entre 0 e 100.' : 'Informe um número de página válido.' };
    if (percent) {
      if (value > 100) return { error: 'Informe uma porcentagem entre 0 e 100.' };
      value = Math.round(value);
    } else {
      const total = Number(book.pages) || 20000;
      if (!Number.isInteger(value) || value > total) {
        return { error: book.pages ? `Informe uma página entre 0 e ${book.pages}.` : 'Informe um número de página válido.' };
      }
    }
  }
  const base = existing || { id, createdAt: nowTs, page: null, percent: null };
  return {
    quote: {
      ...base,
      text,
      // O campo do outro formato fica como estava (o livro pode ter mudado de formato).
      page: percent ? base.page ?? null : value,
      percent: percent ? value : base.percent ?? null,
      note: String(input.note ?? '').trim().slice(0, MAX_NOTE),
    },
  };
}

/** Inclui ou substitui (pelo id). */
export function upsertQuote(quotes, quote) {
  const list = quotes || [];
  return list.some((q) => q.id === quote.id) ? list.map((q) => (q.id === quote.id ? quote : q)) : [...list, quote];
}

export function removeQuote(quotes, id) {
  return (quotes || []).filter((q) => q.id !== id);
}

/** Desfazer: recoloca na posição de antes. */
export function restoreQuote(quotes, quote, index) {
  const list = [...(quotes || [])];
  if (list.some((q) => q.id === quote.id)) return list;
  list.splice(Math.min(Math.max(index, 0), list.length), 0, quote);
  return list;
}

/**
 * Trechos de todos os livros, mais recentes primeiro, filtrados pela busca.
 * Cada palavra da busca precisa aparecer no trecho, na nota, no título ou no autor.
 * Devolve [{ quote, book }].
 */
export function searchQuotes(books, query = '') {
  const terms = fold(query).split(/\s+/).filter(Boolean);
  const out = [];
  for (const book of books) {
    for (const quote of book.quotes || []) {
      const hay = fold(`${quote.text} ${quote.note} ${book.title} ${book.authors}`);
      if (terms.every((t) => hay.includes(t))) out.push({ quote, book });
    }
  }
  return out.sort((a, b) => String(b.quote.createdAt).localeCompare(String(a.quote.createdAt)));
}

export function countQuotes(books) {
  return books.reduce((n, b) => n + (b.quotes?.length || 0), 0);
}

/** Nome do arquivo da imagem: "trecho-dom-casmurro.png". */
export function quoteFileName(book) {
  const slug = fold(book.title).replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40);
  return `trecho-${slug || 'livro'}.png`;
}
