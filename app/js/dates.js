// Datas são guardadas como texto 'AAAA-MM-DD' (data local, sem fuso),
// o mesmo formato de <input type="date">.

const MONTHS = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
const MONTHS_SHORT = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

const ISO_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

export function isIsoDate(value) {
  if (typeof value !== 'string') return false;
  const m = ISO_RE.exec(value);
  if (!m) return false;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return d.getFullYear() === Number(m[1]) && d.getMonth() === Number(m[2]) - 1 && d.getDate() === Number(m[3]);
}

export function toIso(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function todayIso(now = new Date()) {
  return toIso(now);
}

function parse(iso) {
  const m = ISO_RE.exec(iso);
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
}

export function yearOf(iso) {
  return Number(iso.slice(0, 4));
}

/** Mês de 0 a 11. */
export function monthOf(iso) {
  return Number(iso.slice(5, 7)) - 1;
}

/** Dias de leitura contando o primeiro e o último dia (03/09 a 21/09 = 19 dias). */
export function daysInclusive(startIso, endIso) {
  const ms = parse(endIso) - parse(startIso);
  return Math.round(ms / 86400000) + 1;
}

export function formatBR(iso) {
  if (!isIsoDate(iso)) return '';
  return `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;
}

/** '2 out' */
export function formatShort(iso) {
  if (!isIsoDate(iso)) return '';
  return `${Number(iso.slice(8, 10))} ${MONTHS_SHORT[monthOf(iso)]}`;
}

export function monthName(index) {
  return MONTHS[index];
}

export function monthInitial(index) {
  return MONTHS[index][0];
}

export function isLeapYear(year) {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

/** Dias já transcorridos do ano (o ano inteiro, se já acabou). */
export function daysElapsedInYear(year, today) {
  const total = isLeapYear(year) ? 366 : 365;
  const ty = yearOf(today);
  if (year < ty) return total;
  if (year > ty) return 0;
  return daysInclusive(`${year}-01-01`, today);
}

export function daysSince(iso, today) {
  return daysInclusive(iso, today) - 1;
}
