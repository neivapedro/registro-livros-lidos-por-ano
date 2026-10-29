// Calendário de leitura: grades do ano e do mês e os dados de cada dia.
// Funções puras: recebem os livros e devolvem estruturas prontas para desenhar.

import { formatShort, isLeapYear, monthOf, toIso, yearOf } from './dates.js';
import { formatDuration } from './audio.js';
import { longestDayStreak, minutesListenedPerDay, pagesReadPerDay } from './journal.js';
import { STATUS } from './store.js';

/** Dia da semana com segunda = 0 … domingo = 6 (o calendário começa na segunda). */
export function weekdayMon(iso) {
  const d = new Date(Number(iso.slice(0, 4)), Number(iso.slice(5, 7)) - 1, Number(iso.slice(8, 10)));
  return (d.getDay() + 6) % 7;
}

function daysInMonth(year, month) {
  return [31, isLeapYear(year) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month];
}

function iso(year, month, day) {
  return toIso(new Date(year, month, day));
}

/**
 * Semanas (colunas) de um intervalo de meses, segunda a domingo.
 * Cada semana tem 7 posições: a data 'AAAA-MM-DD' ou null fora do intervalo.
 * monthStarts: em que semana cada mês começa (para os rótulos).
 */
export function weeksOf(year, firstMonth, lastMonth) {
  const weeks = [];
  const monthStarts = [];
  let week = Array(7).fill(null);
  for (let m = firstMonth; m <= lastMonth; m += 1) {
    for (let d = 1; d <= daysInMonth(year, m); d += 1) {
      const date = iso(year, m, d);
      const wd = weekdayMon(date);
      if (wd === 0 && week.some(Boolean)) {
        weeks.push(week);
        week = Array(7).fill(null);
      }
      if (d === 1) monthStarts.push({ month: m, week: weeks.length });
      week[wd] = date;
    }
  }
  weeks.push(week);
  return { weeks, monthStarts };
}

/**
 * O ano em duas metades (jan–jun e jul–dez), uma embaixo da outra:
 * os quadradinhos ficam com o dobro do tamanho e cabem numa tela de 320px.
 */
export function yearHalves(year) {
  return [weeksOf(year, 0, 5), weeksOf(year, 6, 11)];
}

/** Grade do mês: semanas de segunda a domingo, null nos dias de fora. */
export function monthGrid(year, month) {
  return weeksOf(year, month, month).weeks;
}

/**
 * Intensidade de 1 a 4 pelo quantil: a fração dos dias com leitura que leram
 * até essa quantidade. O dia de maior leitura sempre fica no tom mais forte.
 * Dia com leitura sem páginas (Kindle sem total) fica no tom 1.
 */
export function levelFor(pages, sortedPositive) {
  if (!(pages > 0) || !sortedPositive.length) return 1;
  let count = 0;
  while (count < sortedPositive.length && sortedPositive[count] <= pages) count += 1;
  return Math.max(1, Math.ceil((4 * count) / sortedPositive.length));
}

/**
 * Tudo o que o calendário do ano precisa.
 * days: Map data → { pages, byBook, level, listened } (só dias com leitura no diário;
 * listened: minutos ouvidos em audiolivros no dia).
 * finished / dropped: Map data → livros concluídos / abandonados naquele dia.
 */
export function calendarData(books, year) {
  const days = new Map();
  const heard = minutesListenedPerDay(books);
  for (const [date, day] of pagesReadPerDay(books)) {
    if (yearOf(date) === year) days.set(date, { ...day, listened: heard.get(date) || 0 });
  }
  const sorted = [...days.values()].map((d) => d.pages).filter((p) => p > 0).sort((a, b) => a - b);
  for (const day of days.values()) day.level = levelFor(day.pages, sorted);

  const finished = new Map();
  const dropped = new Map();
  for (const b of books) {
    if (!b.endDate || yearOf(b.endDate) !== year) continue;
    const target = b.status === STATUS.READ ? finished : b.status === STATUS.DROPPED ? dropped : null;
    if (!target) continue;
    if (!target.has(b.endDate)) target.set(b.endDate, []);
    target.get(b.endDate).push(b);
  }
  return {
    year,
    days,
    finished,
    dropped,
    readingDays: days.size,
    longestStreak: longestDayStreak([...days.keys()]),
    hasJournal: days.size > 0,
  };
}

function pagesLabel(n) {
  return `${n.toLocaleString('pt-BR')} ${n === 1 ? 'pág.' : 'págs.'}`;
}

/**
 * Texto do dia tocado: "14 mar · 32 págs. — Livro X (20), Livro Y (12)".
 * Kindle sem total de páginas: "Leitura registrada". Inclui livros concluídos e abandonados.
 */
export function dayDetail(data, date) {
  const day = data.days.get(date);
  const label = formatShort(date).replace(' ', ' de ');
  const parts = [];
  if (day) {
    const books = day.byBook.map((b) => (b.pages ? `${b.title} (${b.pages})` : b.title)).join(', ');
    const amount = [day.pages ? pagesLabel(day.pages) : '', day.listened ? `${formatDuration(day.listened)} ouvidos` : ''].filter(Boolean).join(' + ');
    parts.push(`${label} · ${amount || 'Leitura registrada'} — ${books}`);
  } else {
    parts.push(`${label} · sem leitura registrada`);
  }
  const finished = data.finished.get(date) || [];
  const dropped = data.dropped.get(date) || [];
  return {
    text: parts[0],
    finished: finished.map((b) => b.title),
    dropped: dropped.map((b) => b.title),
  };
}

/** Mês inicial do calendário: o mês de hoje no ano corrente; dezembro nos anos passados. */
export function defaultMonth(year, today) {
  const ty = yearOf(today);
  if (year === ty) return monthOf(today);
  return year < ty ? 11 : 0;
}
