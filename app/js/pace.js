// Ritmo de leitura e previsão de término de um livro em andamento.
// Funções puras: recebem o livro e a data de hoje ('AAAA-MM-DD').
// Livro físico conta páginas; Kindle conta % (é o que o Kindle mostra).

import { daysInclusive, formatShort, isIsoDate, toIso } from './dates.js';
import { FORMATS, STATUS } from './store.js';

// Janela do ritmo: o jeito de ler das últimas duas semanas, não o do mês passado.
export const PACE_WINDOW_DAYS = 14;
// Previsão muito distante não ajuda; acima disso mostra só o ritmo.
const MAX_FORECAST_DAYS = 730;

function isNum(v) {
  return v !== null && v !== undefined && v !== '' && Number.isFinite(Number(v));
}

export function addDays(iso, n) {
  const d = new Date(Number(iso.slice(0, 4)), Number(iso.slice(5, 7)) - 1, Number(iso.slice(8, 10)));
  d.setDate(d.getDate() + n);
  return toIso(d);
}

/** 'percent' no Kindle, 'page' no físico. */
export function paceUnit(book) {
  return book.format === FORMATS.KINDLE ? 'percent' : 'page';
}

/** Posição atual: a informada no livro, senão o fim da última entrada do diário, senão 0. */
export function currentPosition(book) {
  const unit = paceUnit(book);
  const value = unit === 'percent' ? book.currentPercent : book.currentPage;
  if (isNum(value)) return Number(value);
  const journal = (book.journal || []).filter((e) => e.unit === unit);
  return journal.length ? journal[journal.length - 1].to : 0;
}

/**
 * Ritmo em páginas (ou %) por dia de leitura.
 * - Diário: média do avanço nos dias com leitura dos últimos 14 dias.
 * - Sem leitura recente no diário: posição atual ÷ dias desde o início.
 * Devolve { perDay, unit, source: 'journal'|'start' } ou null.
 */
export function readingPace(book, today, windowDays = PACE_WINDOW_DAYS) {
  if (!book || !isIsoDate(today)) return null;
  const unit = paceUnit(book);
  const from = addDays(today, -(windowDays - 1));
  const recent = (book.journal || [])
    .filter((e) => e.unit === unit && e.date >= from && e.date <= today && e.to > e.from);
  if (recent.length) {
    const total = recent.reduce((s, e) => s + (e.to - e.from), 0);
    return { perDay: total / recent.length, unit, source: 'journal' };
  }
  const position = currentPosition(book);
  if (!isIsoDate(book.startDate) || book.startDate > today || position <= 0) return null;
  return { perDay: position / daysInclusive(book.startDate, today), unit, source: 'start' };
}

/** Quanto falta: páginas (físico, precisa do total) ou % (Kindle). null se não dá para saber. */
export function remainingAmount(book) {
  if (paceUnit(book) === 'percent') return Math.max(0, 100 - currentPosition(book));
  const pages = Number(book.pages) || 0;
  if (!pages) return null;
  return Math.max(0, pages - currentPosition(book));
}

/** Data prevista para terminar no ritmo atual, ou null. */
export function forecastFinish(book, today) {
  const pace = readingPace(book, today);
  const remaining = remainingAmount(book);
  if (!pace || !(pace.perDay > 0) || !remaining) return null;
  const days = Math.ceil(remaining / pace.perDay);
  if (days > MAX_FORECAST_DAYS) return null;
  return addDays(today, days);
}

/**
 * Quanto ler por dia para terminar até book.targetDate (contando hoje).
 * Devolve { perDay, unit } ou null (sem data, data passada ou falta desconhecida).
 */
export function targetPace(book, today) {
  if (!isIsoDate(book.targetDate) || !isIsoDate(today) || book.targetDate < today) return null;
  const remaining = remainingAmount(book);
  if (!remaining) return null;
  return { perDay: Math.ceil(remaining / daysInclusive(today, book.targetDate)), unit: paceUnit(book) };
}

/** "28 págs./dia", "1 pág./dia", "0,5 pág./dia", "6%/dia". */
export function formatPace(perDay, unit) {
  // Abaixo de 1 por dia usa uma casa decimal (nunca mostra 0).
  const n = perDay >= 1 ? Math.round(perDay) : Math.max(0.1, Math.round(perDay * 10) / 10);
  const text = n.toLocaleString('pt-BR', { maximumFractionDigits: 1 });
  if (unit === 'percent') return `${text}%/dia`;
  return `${text} ${n > 1 ? 'págs.' : 'pág.'}/dia`;
}

/** '3 nov'; em outro ano, '3 jan 2027'. */
function shortDate(iso, today) {
  return iso.slice(0, 4) === today.slice(0, 4) ? formatShort(iso) : `${formatShort(iso)} ${iso.slice(0, 4)}`;
}

/**
 * Linhas discretas para o cartão do Início (texto puro; quem mostra faz o esc).
 * { pace: 'Ritmo: 28 págs./dia · termina por volta de 3 nov', target: 'Para terminar até 15 nov: 19 págs./dia' }
 * Sem tom de cobrança: com a data já passada (ou sem saber quanto falta), só lembra a data.
 */
export function paceLines(book, today) {
  if (!book || book.status !== STATUS.READING) return { pace: '', target: '' };
  const pace = readingPace(book, today);
  let paceText = '';
  if (pace && pace.perDay > 0) {
    const finish = forecastFinish(book, today);
    paceText = `Ritmo: ${formatPace(pace.perDay, pace.unit)}${finish ? ` · termina por volta de ${shortDate(finish, today)}` : ''}`;
  }
  let targetText = '';
  if (isIsoDate(book.targetDate)) {
    const need = targetPace(book, today);
    targetText = need
      ? `Para terminar até ${shortDate(book.targetDate, today)}: ${formatPace(need.perDay, need.unit)}`
      : `Meta de data: ${shortDate(book.targetDate, today)}`;
  }
  return { pace: paceText, target: targetText };
}
