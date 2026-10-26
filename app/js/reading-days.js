// Ritmo de um livro, a partir do diário: quanto foi lido em cada dia (ou semana)
// e o diário agrupado por semana. Funções puras, só leem o livro (nada é gravado).
// Usado na ficha do livro ("Ritmo da leitura") e no topo da aba Diário.

import { daysInclusive, formatShort, isIsoDate } from './dates.js';
import { diarySummary } from './diary.js';
import { entryPages, UNITS } from './journal.js';
import { addDays } from './pace.js';

// Acima disso as barras diárias ficariam finas demais no celular: o gráfico passa a semanas.
export const MAX_DAILY_BARS = 90;

/** Segunda-feira da semana da data ('AAAA-MM-DD'). */
export function weekStart(iso) {
  const d = new Date(Number(iso.slice(0, 4)), Number(iso.slice(5, 7)) - 1, Number(iso.slice(8, 10)));
  const back = (d.getDay() + 6) % 7;
  return addDays(iso, -back);
}

/** "41 min", "1h", "1h 18min". */
export function formatMinutes(minutes) {
  const m = Math.round(Number(minutes) || 0);
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  const rest = m % 60;
  return rest ? `${h}h ${rest}min` : `${h}h`;
}

/** '3 nov'; em outro ano, '3 nov 2025'. */
export function dayLabel(iso, today) {
  return today && iso.slice(0, 4) === today.slice(0, 4) ? formatShort(iso) : `${formatShort(iso)} ${iso.slice(0, 4)}`;
}

/**
 * Quanto a entrada avançou, na unidade do gráfico: páginas (físico, ou Kindle com o total de
 * páginas) ou % (Kindle sem total). Correção para trás conta 0.
 */
function amountOf(book, entry, unit) {
  if (!(entry.to > entry.from)) return 0;
  if (unit === UNITS.PERCENT) return entry.unit === UNITS.PERCENT ? entry.to - entry.from : 0;
  return entryPages(book, entry);
}

const minutesOf = (entry) => (Number.isFinite(entry.minutes) && entry.minutes > 0 ? entry.minutes : 0);

/**
 * Série do gráfico de ritmo, do primeiro ao último dia do diário, na escala do tempo
 * (dias sem leitura aparecem como vão). Mais de 90 dias: uma barra por semana.
 * Devolve null sem diário; senão
 * { unit: 'page'|'percent', step: 'day'|'week', bars: [{ date, value, minutes }],
 *   first, last, max, avg (por dia de leitura), days (dias com leitura), total, minutes }.
 */
export function rhythmSeries(book) {
  const journal = (book.journal || []).filter((e) => isIsoDate(e.date));
  if (!journal.length) return null;
  const { unit } = diarySummary(book);
  const byDay = new Map();
  for (const entry of journal) {
    const day = byDay.get(entry.date) || { value: 0, minutes: 0 };
    day.value += amountOf(book, entry, unit);
    day.minutes += minutesOf(entry);
    byDay.set(entry.date, day);
  }
  const dates = [...byDay.keys()].sort();
  const first = dates[0];
  const last = dates[dates.length - 1];
  const span = daysInclusive(first, last);
  const step = span > MAX_DAILY_BARS ? 'week' : 'day';
  const bars = [];
  if (step === 'day') {
    for (let i = 0; i < span; i += 1) {
      const date = addDays(first, i);
      const day = byDay.get(date);
      bars.push({ date, value: day?.value || 0, minutes: day?.minutes || 0 });
    }
  } else {
    const end = weekStart(last);
    for (let date = weekStart(first); date <= end; date = addDays(date, 7)) bars.push({ date, value: 0, minutes: 0 });
    for (const [date, day] of byDay) {
      const bar = bars[Math.round((daysInclusive(bars[0].date, weekStart(date)) - 1) / 7)];
      bar.value += day.value;
      bar.minutes += day.minutes;
    }
  }
  let days = 0;
  let total = 0;
  let minutes = 0;
  for (const day of byDay.values()) {
    if (day.value > 0) days += 1;
    total += day.value;
    minutes += day.minutes;
  }
  const max = Math.max(0, ...bars.map((b) => b.value));
  return { unit, step, bars, first, last, max, avg: days ? total / days : 0, days, total, minutes };
}

/**
 * Diário agrupado por semana (segunda a domingo), da mais recente para a mais antiga.
 * [{ key: 'AAAA-MM-DD' (a segunda), entries (mais recente primeiro), days, amount, unit, minutes }]
 */
export function weekGroups(book) {
  const { unit } = diarySummary(book);
  const groups = new Map();
  const entries = [...(book.journal || [])].filter((e) => isIsoDate(e.date)).sort((a, b) => b.date.localeCompare(a.date));
  for (const entry of entries) {
    const key = weekStart(entry.date);
    if (!groups.has(key)) groups.set(key, { key, entries: [], days: 0, amount: 0, unit, minutes: 0 });
    const g = groups.get(key);
    const amount = amountOf(book, entry, unit);
    g.entries.push(entry);
    if (amount > 0) g.days += 1;
    g.amount += amount;
    g.minutes += minutesOf(entry);
  }
  return [...groups.values()];
}
