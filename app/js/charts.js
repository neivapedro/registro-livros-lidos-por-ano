// Dados dos gráficos do resumo, filtros vindos de um toque no gráfico e meta de páginas.
// Funções puras. As páginas seguem a mesma regra de pagesReadInYear (journal.js).

import { daysElapsedInYear, isLeapYear, monthName, monthOf, yearOf } from './dates.js';
import { entryPages, pagesReadInYear } from './journal.js';
import { FORMAT_LABELS, FORMATS, STATUS } from './store.js';

/** Notas possíveis, de meia em meia estrela. */
export const RATING_STEPS = [0.5, 1, 1.5, 2, 2.5, 3, 3.5, 4, 4.5, 5];

/** Quantos livros com cada nota (só os que têm nota). */
export function ratingDistribution(books) {
  const counts = RATING_STEPS.map((rating) => ({ rating, count: 0 }));
  for (const b of books) {
    const item = counts.find((c) => c.rating === b.rating);
    if (item) item.count += 1;
  }
  return counts;
}

/** Faixas de tamanho do livro, em páginas. */
export const LENGTH_BUCKETS = [
  { key: 'ate199', label: 'Até 199 págs.', short: 'até 199 págs.', min: 1, max: 199 },
  { key: '200-349', label: '200 a 349 págs.', short: '200–349 págs.', min: 200, max: 349 },
  { key: '350-499', label: '350 a 499 págs.', short: '350–499 págs.', min: 350, max: 499 },
  { key: '500+', label: '500 págs. ou mais', short: '500+ págs.', min: 500, max: Infinity },
];

export function lengthBucketOf(pages) {
  const n = Number(pages) || 0;
  return LENGTH_BUCKETS.find((b) => n >= b.min && n <= b.max) || null;
}

/** Livros por faixa de tamanho; os sem nº de páginas ficam de fora (e são contados à parte). */
export function lengthDistribution(books) {
  const rows = LENGTH_BUCKETS.map((b) => ({ ...b, count: 0 }));
  let unknown = 0;
  for (const book of books) {
    const bucket = lengthBucketOf(book.pages);
    if (bucket) rows.find((r) => r.key === bucket.key).count += 1;
    else unknown += 1;
  }
  return { rows, unknown };
}

/**
 * Páginas lidas em cada mês do ano (12 números). Mesma regra de pagesReadInYear:
 * entradas do diário no mês em que foram feitas; livro Lido sem diário (ou com diário
 * que não cobre o livro todo) põe o total (ou o que falta) no mês do término.
 * A soma dos 12 meses é igual a pagesReadInYear(books, year).
 */
export function pagesByMonth(books, year) {
  const months = Array(12).fill(0);
  for (const book of books) {
    if (book.status === STATUS.WANT) continue;
    const journal = book.journal || [];
    const finishedInYear = book.status === STATUS.READ && book.endDate && yearOf(book.endDate) === year;
    let all = 0;
    for (const entry of journal) {
      const pages = entryPages(book, entry);
      all += pages;
      if (yearOf(entry.date) === year) months[monthOf(entry.date)] += pages;
    }
    if (finishedInYear && book.pages) months[monthOf(book.endDate)] += Math.max(0, book.pages - all);
  }
  return months;
}

/** Páginas lidas no ano por formato. */
export function pagesByFormat(books, year) {
  return {
    [FORMATS.PHYSICAL]: pagesReadInYear(books.filter((b) => b.format !== FORMATS.KINDLE), year),
    [FORMATS.KINDLE]: pagesReadInYear(books.filter((b) => b.format === FORMATS.KINDLE), year),
  };
}

// ---------- Filtros vindos dos gráficos ----------

/**
 * Filtros extras da busca (sem campo na tela; aparecem como um chip):
 * rating (nota exata), length (faixa de tamanho), month (mês do término, 0 a 11).
 */
export function applyChartFilters(books, filters) {
  const rating = filters.rating ? Number(filters.rating) : null;
  const bucket = LENGTH_BUCKETS.find((b) => b.key === filters.length) || null;
  const month = filters.month !== undefined && filters.month !== null && filters.month !== '' ? Number(filters.month) : null;
  return books
    .filter((b) => rating === null || b.rating === rating)
    .filter((b) => !bucket || lengthBucketOf(b.pages)?.key === bucket.key)
    .filter((b) => month === null || (b.endDate && monthOf(b.endDate) === month));
}

/** O chip aparece quando há filtro sem campo na tela, ou quando a busca veio de um gráfico. */
export function hasChartFilter(filters) {
  return Boolean(filters.fromChart || filters.rating || filters.length
    || (filters.month !== undefined && filters.month !== null && filters.month !== ''));
}

function ratingText(r) {
  const n = Number(r);
  return `nota ${String(n).replace('.', ',')}`;
}

/** "Filtro: 500+ págs. em 2026", "Filtro: nota 4,5 em 2026", "Filtro: Kindle em março de 2026". */
export function chartFilterLabel(filters) {
  const parts = [];
  const bucket = LENGTH_BUCKETS.find((b) => b.key === filters.length);
  if (bucket) parts.push(bucket.short);
  if (filters.rating) parts.push(ratingText(filters.rating));
  if (filters.format) parts.push(FORMAT_LABELS[filters.format] || filters.format);
  if (filters.genre) parts.push(filters.genre);
  const hasMonth = filters.month !== undefined && filters.month !== null && filters.month !== '';
  const when = hasMonth
    ? `em ${monthName(Number(filters.month)).toLowerCase()}${filters.year ? ` de ${filters.year}` : ''}`
    : filters.year ? `em ${filters.year}` : '';
  const what = parts.join(' · ') || 'Lidos';
  return `Filtro: ${[what, when].filter(Boolean).join(' ')}`;
}

/** Filtros da busca para um toque no gráfico: só livros lidos do ano, mais o recorte tocado. */
export function chartFilters(year, kind, value) {
  const base = { q: '', status: STATUS.READ, year: String(year), genre: '', format: '', minRating: '', fromChart: true };
  if (kind === 'rating') return { ...base, rating: String(value) };
  if (kind === 'length') return { ...base, length: String(value) };
  if (kind === 'month') return { ...base, month: String(value) };
  if (kind === 'format') return { ...base, format: String(value) };
  if (kind === 'genre') return { ...base, genre: String(value) };
  return base;
}

// ---------- Meta de páginas ----------

function roundNice(n) {
  if (n >= 1000) return Math.round(n / 100) * 100;
  if (n >= 100) return Math.round(n / 10) * 10;
  return Math.round(n);
}

/**
 * Meta de páginas do ano: quanto já foi lido e, no ano corrente, a projeção
 * no ritmo atual (páginas até hoje ÷ dias passados × dias do ano), arredondada.
 */
export function pageGoalProgress(pages, goal, year, today) {
  const elapsed = daysElapsedInYear(year, today);
  const total = isLeapYear(year) ? 366 : 365;
  const isCurrent = year === yearOf(today);
  const projection = isCurrent && pages > 0 && elapsed > 0 ? roundNice((pages / elapsed) * total) : null;
  return {
    pages,
    goal,
    progress: goal > 0 ? Math.min(1, pages / goal) : 0,
    met: pages >= goal,
    projection,
  };
}

/** Linha da meta de páginas, sem julgamento: "4.210 de 6.000 págs. · no ritmo de ~5.800". */
export function pageGoalLine(p) {
  const fmt = (n) => n.toLocaleString('pt-BR');
  const head = `${fmt(p.pages)} de ${fmt(p.goal)} págs.`;
  if (p.met) return `${head} · meta de páginas batida`;
  if (p.projection) return `${head} · no ritmo de ~${fmt(p.projection)}`;
  return head;
}
