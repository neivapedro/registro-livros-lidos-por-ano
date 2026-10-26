// Tendências do Resumo (v1.4): curva S da meta (previsto × realizado), variação sobre o
// ano anterior e séries mensais dos mini-gráficos. Funções puras, sem tela.
//
// Previsto: a meta distribuída por igual nos 12 meses (meta ÷ 12 por mês, como um cronograma
// físico mensal); dentro do mês, proporcional aos dias. O eixo da curva vai de 0 (1º de janeiro)
// a 12 (31 de dezembro); o ponto k é o fim do mês k.

import { daysElapsedInYear, daysInclusive, isLeapYear, monthOf, yearOf } from './dates.js';
import { pagesByMonth, pageGoalProgress } from './charts.js';
import { countedEntries, pagesReadPerDay } from './journal.js';
import { booksReadInYear } from './stats.js';
import { STATUS } from './store.js';

function daysInMonth(year, month) {
  return new Date(year, month + 1, 0).getDate();
}

/** Posição de uma data no eixo de meses (0 a 12): 26 de outubro = 9 + 26/31. */
export function monthPosition(iso) {
  const y = yearOf(iso);
  const m = monthOf(iso);
  return m + Number(iso.slice(8, 10)) / daysInMonth(y, m);
}

/** Até onde o ano já andou no eixo: 12 nos anos passados, 0 nos futuros, a data de hoje no ano corrente. */
export function elapsedPosition(year, today) {
  const ty = yearOf(today);
  if (year < ty) return 12;
  if (year > ty) return 0;
  return monthPosition(today);
}

/** O mesmo dia no ano anterior (29 de fevereiro vira 28). */
export function sameDayLastYear(iso) {
  const y = yearOf(iso) - 1;
  const md = iso.slice(5);
  if (md === '02-29') return `${y}-02-28`;
  return `${y}-${md}`;
}

/** Soma acumulada: [1, 0, 2] → [1, 1, 3]. */
export function cumulative(values) {
  let sum = 0;
  return values.map((v) => (sum += v || 0));
}

/** Previsto acumulado no fim de cada mês, começando em 0: 13 números (0, meta/12, …, meta). */
export function plannedCurve(goal) {
  return Array.from({ length: 13 }, (_, k) => (goal * k) / 12);
}

/** Previsto acumulado numa posição do eixo (0 a 12). */
export function plannedAt(goal, position) {
  return (goal * Math.max(0, Math.min(12, position))) / 12;
}

/** Livros concluídos em cada mês do ano (12 números). */
export function booksByMonth(books, year) {
  const months = Array(12).fill(0);
  for (const b of booksReadInYear(books, year)) months[monthOf(b.endDate)] += 1;
  return months;
}

/**
 * Páginas lidas no ano até uma data (inclusive), pela mesma regra de pagesReadInYear:
 * entradas do diário pela data; o que falta de um livro Lido entra no dia do término.
 * Com a data em 31 de dezembro, dá exatamente pagesReadInYear(books, year).
 */
export function pagesReadUntil(books, year, untilIso) {
  let total = 0;
  for (const book of books) {
    if (book.status === STATUS.WANT) continue;
    const finished = book.status === STATUS.READ && book.endDate && yearOf(book.endDate) === year && book.endDate <= untilIso;
    let all = 0;
    for (const { entry, pages } of countedEntries(book)) {
      all += pages;
      if (yearOf(entry.date) === year && entry.date <= untilIso) total += pages;
    }
    if (finished && book.pages) total += Math.max(0, book.pages - all);
  }
  return total;
}

function roundTo(n, digits) {
  const f = 10 ** digits;
  return Math.round(n * f) / f;
}

/**
 * Curva S de um ano.
 * monthly: 12 números realizados por mês (livros ou páginas); goal: meta do ano (ou null);
 * kind: 'livros' | 'paginas'.
 * Devolve:
 *  planned: 13 pontos acumulados (ou null sem meta);
 *  actual: [{ x, v }] de 0 até o último ponto realizado (no ano corrente, termina em "hoje");
 *  today: { x, v, planned } só no ano corrente;
 *  projection: { from: { x, v }, to: { x: 12, v } } só no ano corrente com algo realizado;
 *  realized, plannedNow, deviation (realizado − previsto hoje), perMonth (para fechar a meta),
 *  monthsLeft, isCurrent, isPast.
 */
export function sCurve({ monthly, goal, year, today, kind = 'livros' }) {
  const ty = yearOf(today);
  const isCurrent = year === ty;
  const isPast = year < ty;
  const pos = elapsedPosition(year, today);
  const cum = cumulative(monthly);
  const lastFull = isPast ? 12 : isCurrent ? monthOf(today) : 0; // meses inteiros já fechados
  const actual = [{ x: 0, v: 0 }];
  for (let k = 1; k <= lastFull; k += 1) actual.push({ x: k, v: cum[k - 1] });
  const realized = isPast ? cum[11] : isCurrent ? cum[monthOf(today)] : 0;
  let todayPoint = null;
  if (isCurrent) {
    todayPoint = { x: pos, v: realized, planned: goal ? plannedAt(goal, pos) : null };
    if (pos > actual[actual.length - 1].x) actual.push({ x: pos, v: realized });
  }
  const plannedNow = goal ? plannedAt(goal, pos) : null;
  let projection = null;
  if (isCurrent && realized > 0 && pos < 12) {
    const elapsed = daysElapsedInYear(year, today);
    const total = isLeapYear(year) ? 366 : 365;
    // Páginas: a mesma projeção do Início (pageGoalProgress), para os números baterem.
    const end = kind === 'paginas'
      ? pageGoalProgress(realized, goal || 1, year, today).projection
      : roundTo((realized / elapsed) * total, 1);
    if (end !== null) projection = { from: { x: pos, v: realized }, to: { x: 12, v: end } };
  }
  const monthsLeft = Math.max(0, 12 - pos);
  const missing = goal ? Math.max(0, goal - realized) : 0;
  return {
    kind,
    goal: goal || null,
    planned: goal ? plannedCurve(goal) : null,
    actual,
    today: todayPoint,
    projection,
    realized,
    plannedNow,
    deviation: goal ? realized - plannedNow : null,
    missing,
    monthsLeft,
    perMonth: goal && missing > 0 && monthsLeft >= 1 ? missing / monthsLeft : null,
    isCurrent,
    isPast,
    cumulative: cum,
  };
}

/** Curva S dos livros e das páginas (páginas pela regra do diário; a soma dos meses = yearStats.pages). */
export function sCurves(books, year, { goal, pageGoal = null }, today) {
  return {
    livros: sCurve({ monthly: booksByMonth(books, year), goal, year, today, kind: 'livros' }),
    paginas: sCurve({ monthly: pagesByMonth(books, year), goal: pageGoal, year, today, kind: 'paginas' }),
  };
}

// ---------- Variação sobre o ano anterior ----------

function average(values) {
  return values.length ? values.reduce((s, v) => s + v, 0) / values.length : null;
}

function durationOf(b) {
  if (!b.startDate || b.startDate > b.endDate) return null;
  return daysInclusive(b.startDate, b.endDate);
}

/**
 * Números do ano anterior para comparar com `year`.
 * Ano corrente: o ano anterior só até o mesmo dia (justo: 26 out × 26 out).
 * Ano passado: o ano anterior inteiro. Devolve null quando o ano anterior não tem nada.
 * { year, until (ou null = ano todo), count, pages, avgRating, avgDays }
 */
export function previousYearBaseline(books, year, today) {
  const prev = year - 1;
  const isCurrent = year === yearOf(today);
  const until = isCurrent ? sameDayLastYear(today) : `${prev}-12-31`;
  const allYear = booksReadInYear(books, prev);
  const allPages = pagesReadUntil(books, prev, `${prev}-12-31`);
  if (!allYear.length && !allPages) return null;
  const read = allYear.filter((b) => b.endDate <= until);
  return {
    year: prev,
    until: isCurrent ? until : null,
    count: read.length,
    pages: pagesReadUntil(books, prev, until),
    avgRating: average(read.map((b) => b.rating).filter(Boolean)),
    avgDays: average(read.map(durationOf).filter((d) => d !== null)),
  };
}

/**
 * Variação de um indicador: { dir: 'up' | 'down' | 'same', diff, pct, favorable }.
 * favorable: true quando a mudança é boa (para "dias por livro", menos é melhor), null se igual.
 * Devolve null quando não há como comparar.
 * Arredonda como a tela mostra: digits casas decimais (nota média: 1; livros e dias: 0).
 */
export function kpiDelta(current, previous, { lowerIsBetter = false, digits = 0 } = {}) {
  if (current === null || current === undefined || previous === null || previous === undefined) return null;
  const diff = roundTo(roundTo(current, digits) - roundTo(previous, digits), digits);
  const dir = diff > 0 ? 'up' : diff < 0 ? 'down' : 'same';
  const pct = previous > 0 ? Math.round(((current - previous) / previous) * 100) : null;
  const favorable = dir === 'same' ? null : (dir === 'up') !== lowerIsBetter;
  return { dir, diff, pct, favorable };
}

// ---------- Séries dos mini-gráficos ----------

/**
 * Média acumulada mês a mês (12 números; null até o primeiro valor).
 * valueOf(book) devolve o número do livro (ou null para ignorar). Agrupa pelo mês do término.
 */
export function runningAverage(books, year, valueOf) {
  const sums = Array(12).fill(0);
  const counts = Array(12).fill(0);
  for (const b of booksReadInYear(books, year)) {
    const v = valueOf(b);
    if (v === null || v === undefined || v === 0) continue;
    sums[monthOf(b.endDate)] += v;
    counts[monthOf(b.endDate)] += 1;
  }
  let s = 0;
  let n = 0;
  return sums.map((sum, i) => {
    s += sum;
    n += counts[i];
    return n ? s / n : null;
  });
}

/** Séries mensais dos 4 indicadores (cortadas no mês de hoje no ano corrente). */
export function kpiSeries(books, year, today) {
  const ty = yearOf(today);
  const last = year < ty ? 11 : year > ty ? -1 : monthOf(today);
  const cut = (arr) => arr.slice(0, last + 1);
  return {
    count: cut(cumulative(booksByMonth(books, year))),
    pages: cut(cumulative(pagesByMonth(books, year))),
    avgRating: cut(runningAverage(books, year, (b) => b.rating || null)),
    avgDays: cut(runningAverage(books, year, durationOf)),
  };
}

// ---------- Ritmo: páginas por dia ----------

/** Dias com leitura no ano, média por dia de leitura e o melhor dia. */
export function dailyPages(books, year) {
  let days = 0;
  let pages = 0;
  let best = null;
  for (const [date, day] of pagesReadPerDay(books)) {
    if (yearOf(date) !== year) continue;
    days += 1;
    pages += day.pages;
    if (day.pages > 0 && (!best || day.pages > best.pages || (day.pages === best.pages && date < best.date))) {
      best = { date, pages: day.pages };
    }
  }
  return { days, pages, perReadingDay: days ? pages / days : 0, best };
}

// ---------- Gostos: faixa usada no gráfico de notas ----------

/**
 * Recorte do gráfico de notas: só da menor à maior nota usada, com pelo menos `minSteps`
 * colunas (abre para baixo primeiro, depois para cima) para 1 barra não ficar sozinha.
 * dist: [{ rating, count }] em ordem (ratingDistribution).
 */
export function ratingWindow(dist, minSteps = 5) {
  const used = dist.map((d, i) => (d.count ? i : -1)).filter((i) => i >= 0);
  if (!used.length) return [];
  let lo = used[0];
  let hi = used[used.length - 1];
  while (hi - lo + 1 < Math.min(minSteps, dist.length)) {
    if (lo > 0) lo -= 1;
    else hi += 1;
  }
  return dist.slice(lo, hi + 1);
}

/** Autores com mais de um livro (se ninguém repete, o ranking não diz nada). */
export function repeatedAuthors(list) {
  return list.filter((a) => a.count > 1);
}

// ---------- Textos (sem cobrança: "abaixo do previsto", nunca "atrasado") ----------

const nf0 = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 0 });
const nf1 = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 1 });

/** Livros com até 1 casa ("1,5"); páginas inteiras ("4.258"). */
export function curveAmount(kind, n) {
  return kind === 'paginas' ? nf0.format(Math.round(n)) : nf1.format(roundTo(n, 1));
}

function unitOf(kind, n) {
  if (kind === 'paginas') return Math.round(n) === 1 ? 'pág.' : 'págs.';
  return Math.abs(roundTo(n, 1)) < 2 ? 'livro' : 'livros';
}

function nice(n) {
  if (n >= 1000) return Math.round(n / 100) * 100;
  if (n >= 100) return Math.round(n / 10) * 10;
  return Math.round(n);
}

function capitalize(text) {
  return text ? text.charAt(0).toUpperCase() + text.slice(1) : '';
}

/**
 * Frases sob a curva S: { headline, detail }.
 * Ano corrente: o desvio de hoje ("1,3 livro abaixo do previsto") e o que fecha a meta
 * ("Para fechar 15: 1,9 por mês · no ritmo atual, ~13 em dezembro").
 * Ano passado: como o ano fechou. Sem meta (páginas): só o realizado e o ritmo.
 */
export function curveText(c) {
  const k = c.kind;
  const withUnit = (n) => `${curveAmount(k, n)} ${unitOf(k, n)}`;
  const proj = c.projection
    ? `no ritmo atual, ~${curveAmount(k, k === 'paginas' ? c.projection.to.v : Math.round(c.projection.to.v))} em dezembro`
    : '';
  if (!c.goal) {
    return { headline: `${withUnit(c.realized)} ${c.isCurrent ? 'até hoje' : 'no ano'}`, detail: capitalize(proj) };
  }
  const goalText = curveAmount(k, c.goal);
  if (c.realized >= c.goal) {
    const extra = c.realized - c.goal;
    return {
      headline: `Meta de ${goalText} alcançada${extra > 0 ? ` · ${withUnit(extra)} além` : ''}`,
      detail: c.isCurrent ? capitalize(proj) : '',
    };
  }
  if (!c.isCurrent) {
    return { headline: `${curveAmount(k, c.realized)} de ${goalText} · ${withUnit(c.goal - c.realized)} abaixo da meta`, detail: '' };
  }
  // Tolerância para "em linha": meio livro, ou 1% da meta de páginas.
  const tol = k === 'paginas' ? Math.max(1, c.goal * 0.01) : 0.5;
  const dev = c.deviation;
  const headline = Math.abs(dev) < tol
    ? 'Em linha com o previsto'
    : `${withUnit(Math.abs(dev))} ${dev < 0 ? 'abaixo do' : 'à frente do'} previsto`;
  const close = c.perMonth !== null
    ? `para fechar ${goalText}: ${k === 'paginas' ? `~${nf0.format(nice(c.perMonth))}` : curveAmount(k, c.perMonth)} por mês`
    : `faltam ${withUnit(c.missing)} até 31 dez`;
  return { headline, detail: capitalize([close, proj].filter(Boolean).join(' · ')) };
}
