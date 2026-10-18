// Cálculos dos indicadores. Funções puras: recebem os livros e devolvem números.

import { daysElapsedInYear, daysInclusive, monthOf, yearOf } from './dates.js';
import { pagesReadInYear } from './journal.js';
import { STATUS, FORMATS } from './store.js';

export function readBooks(books) {
  return books.filter((b) => b.status === STATUS.READ && b.endDate);
}

/** Livros concluídos no ano, do mais recente para o mais antigo. */
export function booksReadInYear(books, year) {
  return readBooks(books)
    .filter((b) => yearOf(b.endDate) === year)
    .sort((a, b) => (b.endDate.localeCompare(a.endDate)) || b.updatedAt.localeCompare(a.updatedAt));
}

/** Livros por mês para manter a sequência: a meta anual ÷ 12, arredondada (12 a 17/ano = 1/mês; 18 a 29 = 2/mês). */
export function monthlyTarget(goal) {
  return Math.max(1, Math.round(goal / 12));
}

/** Autores separados: "Womack, Jones" conta para os dois. */
export function splitAuthors(authors) {
  return (authors || '').split(/\s*[,;]\s*|\s+e\s+|\s*&\s*/).map((a) => a.trim()).filter(Boolean);
}

function ranking(map) {
  return [...map.entries()]
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label, 'pt-BR'));
}

function average(values) {
  return values.length ? values.reduce((s, v) => s + v, 0) / values.length : null;
}

export function yearStats(books, year, goal, today) {
  const read = booksReadInYear(books, year);
  // Páginas lidas no ano pelo diário (regra em journal.js): conta também o que foi lido
  // em livros ainda em andamento ou abandonados. Retrospectiva e imagem usam este número.
  const pages = pagesReadInYear(books, year);
  const ratings = read.map((b) => b.rating).filter((r) => r);
  const durations = read
    .filter((b) => b.startDate && b.startDate <= b.endDate)
    .map((b) => daysInclusive(b.startDate, b.endDate));

  const byMonth = Array(12).fill(0);
  const formats = { [FORMATS.PHYSICAL]: 0, [FORMATS.KINDLE]: 0 };
  const genres = new Map();
  const authors = new Map();
  for (const b of read) {
    byMonth[monthOf(b.endDate)] += 1;
    formats[b.format] += 1;
    if (b.genre) genres.set(b.genre, (genres.get(b.genre) || 0) + 1);
    for (const a of splitAuthors(b.authors)) authors.set(a, (authors.get(a) || 0) + 1);
  }

  const daysElapsed = daysElapsedInYear(year, today);
  return {
    year,
    goal,
    count: read.length,
    books: read,
    progress: goal > 0 ? Math.min(1, read.length / goal) : 0,
    remaining: Math.max(0, goal - read.length),
    pages,
    // Livros concluídos no ano com nº de páginas (os sem nº não somam páginas).
    pagesKnown: read.filter((b) => b.pages).length,
    pagesPerDay: daysElapsed > 0 ? pages / daysElapsed : 0,
    avgRating: average(ratings),
    avgDays: average(durations),
    favorite: read.find((b) => b.favorite) || null,
    byMonth,
    monthlyTarget: monthlyTarget(goal),
    formats,
    genres: ranking(genres),
    authors: ranking(authors),
  };
}

/**
 * Sequência de meses batendo a meta mensal.
 * O mês corrente só conta se já bateu; enquanto não bate, não quebra a sequência.
 */
export function goalStreak(books, goalForYear, today) {
  const read = readBooks(books);
  if (!read.length) return { current: 0, best: 0 };
  const counts = new Map();
  let first = null;
  for (const b of read) {
    const key = b.endDate.slice(0, 7);
    counts.set(key, (counts.get(key) || 0) + 1);
    if (!first || key < first) first = key;
  }
  const todayKey = today.slice(0, 7);
  if (first > todayKey) return { current: 0, best: 0 };

  let y = Number(first.slice(0, 4));
  let m = Number(first.slice(5, 7)) - 1;
  let run = 0;
  let best = 0;
  let current = 0;
  for (;;) {
    const key = `${y}-${String(m + 1).padStart(2, '0')}`;
    const met = (counts.get(key) || 0) >= monthlyTarget(goalForYear(y));
    const isCurrentMonth = key === todayKey;
    if (met) {
      run += 1;
      best = Math.max(best, run);
    } else if (!isCurrentMonth) {
      run = 0;
    }
    if (isCurrentMonth) {
      current = run;
      break;
    }
    m += 1;
    if (m === 12) { m = 0; y += 1; }
  }
  return { current, best };
}

/** Meses do ano em que a meta mensal foi batida. */
export function monthsMetInYear(byMonth, target) {
  return byMonth.filter((n) => n >= target).length;
}

/** Anos com algum livro concluído, mais o ano atual. Do mais recente para o mais antigo. */
export function yearsWithData(books, currentYear) {
  const years = new Set(readBooks(books).map((b) => yearOf(b.endDate)));
  years.add(currentYear);
  return [...years].sort((a, b) => b - a);
}

export function countByStatus(books) {
  const out = { [STATUS.WANT]: 0, [STATUS.READING]: 0, [STATUS.READ]: 0, [STATUS.DROPPED]: 0 };
  for (const b of books) out[b.status] += 1;
  return out;
}

function fold(s) {
  return (s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

/**
 * Filtros da tela de busca. Campos vazios não filtram.
 * { q, status, year, genre, format, minRating, tag }
 */
export function filterBooks(books, filters) {
  const q = fold(filters.q).trim();
  const year = filters.year ? Number(filters.year) : null;
  const minRating = filters.minRating ? Number(filters.minRating) : 0;
  return books
    .filter((b) => !q || fold(`${b.title} ${b.authors} ${b.notes} ${b.series || ''} ${(b.tags || []).join(' ')}`).includes(q))
    .filter((b) => !filters.status || b.status === filters.status)
    .filter((b) => !year || (b.endDate && yearOf(b.endDate) === year))
    .filter((b) => !filters.genre || b.genre === filters.genre)
    .filter((b) => !filters.format || b.format === filters.format)
    .filter((b) => !minRating || (b.rating || 0) >= minRating)
    .filter((b) => !filters.tag || (b.tags || []).some((t) => t.toLocaleLowerCase('pt-BR') === filters.tag.toLocaleLowerCase('pt-BR')))
    .sort((a, b) => (b.endDate || b.startDate || b.createdAt).localeCompare(a.endDate || a.startDate || a.createdAt));
}

/** Livros abandonados no ano (pela data em que parou), do mais recente ao mais antigo. */
export function droppedInYear(books, year) {
  return books
    .filter((b) => b.status === STATUS.DROPPED && b.endDate && yearOf(b.endDate) === year)
    .sort((a, b) => b.endDate.localeCompare(a.endDate));
}

/** Páginas de todos os anos: a soma de pagesReadInYear em cada ano com término ou diário. */
export function pagesAllTime(books) {
  const years = new Set();
  for (const b of books) {
    if (b.endDate) years.add(yearOf(b.endDate));
    for (const e of b.journal || []) years.add(yearOf(e.date));
  }
  let total = 0;
  for (const y of years) total += pagesReadInYear(books, y);
  return total;
}

/** Indicadores de todos os anos somados. */
export function allTimeStats(books, today) {
  const read = readBooks(books);
  const currentYear = yearOf(today);
  const perYear = new Map();
  const genres = new Map();
  const authors = new Map();
  const formats = { [FORMATS.PHYSICAL]: 0, [FORMATS.KINDLE]: 0 };
  for (const b of read) {
    const y = yearOf(b.endDate);
    perYear.set(y, (perYear.get(y) || 0) + 1);
    formats[b.format] += 1;
    if (b.genre) genres.set(b.genre, (genres.get(b.genre) || 0) + 1);
    for (const a of splitAuthors(b.authors)) authors.set(a, (authors.get(a) || 0) + 1);
  }
  const firstYear = perYear.size ? Math.min(...perYear.keys(), currentYear) : currentYear;
  const years = [];
  for (let y = currentYear; y >= firstYear; y -= 1) years.push({ year: y, count: perYear.get(y) || 0 });
  const best = years.reduce((top, y) => (y.count > (top?.count || 0) ? y : top), null);
  return {
    count: read.length,
    pages: pagesAllTime(books),
    avgRating: average(read.map((b) => b.rating).filter((r) => r)),
    // Média dos anos já encerrados; no primeiro ano, o próprio ano em andamento.
    avgPerYear: years.length > 1
      ? years.slice(1).reduce((sum, y) => sum + y.count, 0) / (years.length - 1)
      : read.length,
    years,
    bestYear: best,
    formats,
    genres: ranking(genres),
    authors: ranking(authors),
    rereads: read.filter((b) => b.reread).length,
    dropped: books.filter((b) => b.status === STATUS.DROPPED).length,
  };
}
