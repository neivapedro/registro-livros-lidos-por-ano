// Velocidade de leitura (1.6): páginas por hora (cronômetro), horário em que mais se lê e
// previsão de quanto tempo leva a fila "Quero ler". Funções puras, prontas para o Resumo e a ficha.
// Só livros de papel e Kindle: áudio (se existir) não tem páginas por hora nem entra na fila.

import { yearOf } from './dates.js';
import { entryPages, pagesReadPerDay } from './journal.js';
import { addDays } from './pace.js';
import { STATUS } from './store.js';

// Base mínima para mostrar um número: com menos, a tela explica o que falta.
export const MIN_SPEED_SESSIONS = 2;
export const MIN_SPEED_MINUTES = 30;
export const MIN_HOUR_MINUTES = 60;
export const MIN_HOUR_DAYS = 3;
// Ritmo recente: últimos 30 dias (senão 90), com pelo menos 3 dias de leitura.
export const RECENT_WINDOWS = [30, 90];
export const MIN_RECENT_DAYS = 3;

const UNITS_WITH_PAGES = new Set(['page', 'percent']);
const isAudio = (book) => book.format === 'audio';
const minutesOf = (entry) => (Number.isFinite(entry.minutes) && entry.minutes > 0 ? entry.minutes : 0);
const inYear = (date, year) => year === null || yearOf(date) === year;

/**
 * Páginas por hora no ano (sem ano: todos), só com dias que têm minutos do cronômetro E páginas
 * avançadas. { pagesPerHour, pages, minutes, sessions (dias), enough } — enough: base suficiente.
 */
export function speedStats(books, year = null) {
  let pages = 0;
  let minutes = 0;
  let sessions = 0;
  for (const book of books) {
    if (isAudio(book)) continue;
    for (const entry of book.journal || []) {
      if (!UNITS_WITH_PAGES.has(entry.unit) || !inYear(entry.date, year)) continue;
      const m = minutesOf(entry);
      const p = m ? entryPages(book, entry) : 0;
      if (!m || !p) continue;
      pages += p;
      minutes += m;
      sessions += 1;
    }
  }
  const pagesPerHour = minutes ? Math.round((pages * 60) / minutes) : null;
  return { pagesPerHour, pages, minutes, sessions, enough: sessions >= MIN_SPEED_SESSIONS && minutes >= MIN_SPEED_MINUTES };
}

/** Período do dia de uma hora (0–23). */
export function dayPeriod(hour) {
  if (hour < 6) return 'de madrugada';
  if (hour < 12) return 'de manhã';
  if (hour < 18) return 'à tarde';
  return 'à noite';
}

/**
 * Minutos do cronômetro por hora do dia (entry.hours, gravado a partir da 1.6).
 * { minutes: [24], total, days, peak (hora com mais minutos), period, enough }.
 */
export function hourDistribution(books, year = null) {
  const minutes = new Array(24).fill(0);
  const days = new Set();
  for (const book of books) {
    for (const entry of book.journal || []) {
      if (!entry.hours || !inYear(entry.date, year)) continue;
      let any = false;
      for (const [h, m] of Object.entries(entry.hours)) {
        const hour = Number(h);
        if (!Number.isInteger(hour) || hour < 0 || hour > 23 || !(m > 0)) continue;
        minutes[hour] += m;
        any = true;
      }
      if (any) days.add(entry.date);
    }
  }
  const total = minutes.reduce((s, m) => s + m, 0);
  let peak = null;
  minutes.forEach((m, h) => { if (m > 0 && (peak === null || m > minutes[peak])) peak = h; });
  // Período com mais minutos (não só a hora de pico: 20h + 21h + 22h ganham de um 7h isolado).
  const periods = new Map();
  minutes.forEach((m, h) => periods.set(dayPeriod(h), (periods.get(dayPeriod(h)) || 0) + m));
  const period = total ? [...periods.entries()].reduce((a, b) => (b[1] > a[1] ? b : a))[0] : null;
  return { minutes, total, days: days.size, peak, period, enough: total >= MIN_HOUR_MINUTES && days.size >= MIN_HOUR_DAYS };
}

/**
 * Páginas por dia corrido nos últimos 30 dias (senão 90): o diário de todos os livros mais os
 * livros terminados na janela sem diário (registrados depois de lidos). Conta os dias sem leitura:
 * é o ritmo real para prever "quantos dias". Sem base: null. { perDay, window, days }.
 */
export function recentPagesPerDay(books, today) {
  const paper = books.filter((b) => !isAudio(b));
  const perDay = pagesReadPerDay(paper);
  for (const window of RECENT_WINDOWS) {
    const from = addDays(today, -(window - 1));
    let pages = 0;
    let days = 0;
    for (const [date, day] of perDay) {
      if (date < from || date > today || !day.pages) continue;
      pages += day.pages;
      days += 1;
    }
    let finished = 0;
    for (const b of paper) {
      if (b.status !== STATUS.READ || (b.journal || []).length || !b.pages || !b.endDate) continue;
      if (b.endDate < from || b.endDate > today) continue;
      pages += b.pages;
      finished += 1;
    }
    if (pages > 0 && (days >= MIN_RECENT_DAYS || finished > 0)) return { perDay: pages / window, window, days };
  }
  return null;
}

/** Livros da fila "Quero ler" (sem áudio): os de "Próximas" na ordem, depois os outros. */
export function queueBooks(state) {
  const want = state.books.filter((b) => b.status === STATUS.WANT && !isAudio(b));
  const next = (state.upNext || []).map((id) => want.find((b) => b.id === id)).filter(Boolean);
  return { next, all: want };
}

function estimate(list, perDay) {
  const known = list.filter((b) => Number(b.pages) > 0);
  const pages = known.reduce((s, b) => s + Number(b.pages), 0);
  return { count: list.length, pages, missing: list.length - known.length, days: perDay && pages ? Math.ceil(pages / perDay) : null };
}

/**
 * Previsão da fila: { pace (recentPagesPerDay ou null), next, all }, com { count, pages, missing,
 * days } para "Próximas" e para a lista inteira. Livros sem nº de páginas não entram na soma (missing).
 */
export function queueForecast(state, today) {
  const pace = recentPagesPerDay(state.books, today);
  const { next, all } = queueBooks(state);
  return { pace, next: estimate(next, pace?.perDay), all: estimate(all, pace?.perDay) };
}

/** "Você leva ~N dias" de um livro da fila: { days, hours } (hours só com velocidade conhecida) ou null. */
export function bookEstimate(books, book, today) {
  const pages = Number(book?.pages) || 0;
  if (!pages || isAudio(book)) return null;
  const pace = recentPagesPerDay(books, today);
  const speed = speedStats(books);
  const hours = speed.enough && speed.pagesPerHour ? pages / speed.pagesPerHour : null;
  if (!pace && !hours) return null;
  return { days: pace ? Math.max(1, Math.ceil(pages / pace.perDay)) : null, hours };
}

/** "~5 dias", "~3 semanas", "~4 meses", "~1,5 ano". */
export function formatDuration(days) {
  if (!Number.isFinite(days) || days <= 0) return '';
  if (days <= 1) return '~1 dia';
  if (days < 15) return `~${Math.round(days)} dias`;
  if (days < 63) return `~${Math.round(days / 7)} semanas`;
  const months = days / 30.44;
  if (months < 11.5) return `~${Math.round(months)} ${Math.round(months) === 1 ? 'mês' : 'meses'}`;
  const years = Math.round((days / 365.25) * 2) / 2;
  return `~${String(years).replace('.', ',')} ${years === 1 ? 'ano' : 'anos'}`;
}

/** "~6 h", "~45 min", "~1 h 30 min" de leitura. */
export function formatHours(hours) {
  if (!Number.isFinite(hours) || hours <= 0) return '';
  const total = Math.max(5, Math.round((hours * 60) / 5) * 5);
  if (total < 60) return `~${total} min`;
  const h = Math.floor(total / 60);
  const m = total % 60;
  if (h >= 10 || !m) return `~${Math.round(total / 60)} h`;
  return `~${h} h ${m} min`;
}
