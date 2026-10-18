// Séries de livros: nomes já usados, próximo volume e quantos foram lidos.
// O nome da série é comparado sem diferenciar maiúsculas nem espaços nas pontas.

import { STATUS } from './store.js';

function key(name) {
  return String(name || '').trim().toLocaleLowerCase('pt-BR');
}

/** 2 → '2'; 2.5 → '2,5'. */
export function formatSeriesNumber(n) {
  return n === null || n === undefined || n === '' ? '' : String(n).replace('.', ',');
}

/** Texto do chip: "Duna · nº 2" (ou só "Duna" sem número). */
export function seriesLabel(book) {
  if (!book.series) return '';
  const n = formatSeriesNumber(book.seriesNumber);
  const name = book.series.trim();
  return n ? `${name} · nº ${n}` : name;
}

/** Nomes de séries já cadastrados, em ordem alfabética (para sugerir no campo). */
export function seriesNames(books) {
  const byKey = new Map();
  for (const b of books) if (b.series && !byKey.has(key(b.series))) byKey.set(key(b.series), b.series.trim());
  return [...byKey.values()].sort((a, b) => a.localeCompare(b, 'pt-BR'));
}

/** Livros da mesma série, ordenados pelo número (sem número ficam no fim). */
export function booksInSeries(books, name) {
  const k = key(name);
  if (!k) return [];
  return books.filter((b) => key(b.series) === k)
    .sort((a, b) => (a.seriesNumber ?? Infinity) - (b.seriesNumber ?? Infinity) || a.title.localeCompare(b.title, 'pt-BR'));
}

/**
 * Situação da série para o livro em edição:
 * { total, read, next } — total e read contam volumes (releituras do mesmo volume contam uma vez);
 * next é o livro com o menor número acima do atual (prefere um ainda não lido), ou null.
 */
export function seriesInfo(books, book) {
  const list = booksInSeries(books, book.series);
  const volumes = new Map();
  for (const b of list) {
    const v = b.seriesNumber ?? `t:${key(b.title)}`;
    const read = volumes.get(v) || false;
    volumes.set(v, read || b.status === STATUS.READ);
  }
  let next = null;
  const n = book.seriesNumber;
  if (n !== null && n !== undefined && n !== '') {
    const after = list.filter((b) => b.id !== book.id && b.seriesNumber !== null && b.seriesNumber > Number(String(n).replace(',', '.')));
    if (after.length) {
      const nextNumber = after[0].seriesNumber;
      const same = after.filter((b) => b.seriesNumber === nextNumber);
      next = same.find((b) => b.status !== STATUS.READ) || same[0];
    }
  }
  return { total: volumes.size, read: [...volumes.values()].filter(Boolean).length, next };
}

/**
 * Lidos agrupados por série: [{ name, books }] por ordem alfabética e, no fim,
 * { name: null, books } com os que não são de série (na ordem recebida).
 */
export function groupBySeries(books) {
  const groups = new Map();
  const loose = [];
  for (const b of books) {
    if (!b.series) {
      loose.push(b);
      continue;
    }
    const k = key(b.series);
    if (!groups.has(k)) groups.set(k, { name: b.series.trim(), books: [] });
    groups.get(k).books.push(b);
  }
  const out = [...groups.values()]
    .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'))
    .map((g) => ({ ...g, books: booksInSeries(g.books, g.name) }));
  if (loose.length) out.push({ name: null, books: loose });
  return out;
}
