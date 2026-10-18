// Diário de leitura: quanto foi lido em cada dia.
// Cada livro guarda em book.journal entradas { date, from, to, unit, note, minutes? }:
// a posição em que estava no começo do dia (from) e onde parou (to),
// em páginas (livro físico) ou em % (Kindle). Uma entrada por livro por dia.
// 'minutes' (opcional) soma as sessões do cronômetro no dia.
// Funções puras: recebem o livro e devolvem um diário novo, sem alterar o original.

import { isIsoDate, yearOf } from './dates.js';
import { FORMATS, STATUS } from './store.js';

export const UNITS = { PAGE: 'page', PERCENT: 'percent' };

/** Unidade do progresso do livro: % no Kindle, página no físico. */
export function unitOf(book) {
  return book.format === FORMATS.KINDLE ? UNITS.PERCENT : UNITS.PAGE;
}

function isNum(v) {
  return typeof v === 'number' && Number.isFinite(v);
}

/** Última posição conhecida: o 'to' da última entrada na mesma unidade, senão a página/% do livro, senão 0. */
function lastPosition(book, journal, unit) {
  for (let i = journal.length - 1; i >= 0; i -= 1) {
    if (journal[i].unit === unit) return journal[i].to;
  }
  const current = unit === UNITS.PERCENT ? book.currentPercent : book.currentPage;
  return isNum(current) ? current : 0;
}

function insertSorted(journal, entry) {
  const index = journal.findIndex((e) => e.date > entry.date);
  if (index < 0) journal.push(entry);
  else journal.splice(index, 0, entry);
  return journal;
}

/**
 * Registra a nova posição (página ou %) no dia `today` ('AAAA-MM-DD').
 * Devolve o novo diário. O livro deve vir com a posição ANTERIOR à mudança.
 * - Já existe entrada no dia: mantém o 'from' do dia e atualiza o 'to'
 *   (se voltar ao 'from' e não tiver nota, a entrada some: o dia ficou sem leitura).
 * - Não muda nada (mesma posição): devolve o diário como está.
 * - Valor menor que o anterior (correção): registra mesmo assim; conta 0 páginas.
 */
export function recordProgress(book, newValue, unit, today) {
  const journal = [...(book.journal || [])];
  const value = Number(newValue);
  if (!Number.isFinite(value) || value < 0) return journal;
  const index = journal.findIndex((e) => e.date === today);
  if (index >= 0 && journal[index].unit === unit) {
    const entry = journal[index];
    if (entry.to === value) return journal;
    if (entry.from === value && !entry.note && !entry.minutes) journal.splice(index, 1);
    else journal[index] = { ...entry, to: value };
    return journal;
  }
  // Entrada do dia em outra unidade (o formato mudou): é substituída, mas os minutos ficam.
  const minutes = index >= 0 ? journal[index].minutes || 0 : 0;
  if (index >= 0) journal.splice(index, 1);
  const from = lastPosition(book, journal.filter((e) => e.date < today), unit);
  if (value === from && !minutes) return journal;
  const entry = { date: today, from, to: value, unit, note: '' };
  return insertSorted(journal, minutes ? { ...entry, minutes } : entry);
}

/** Teto de minutos num dia (o dia tem 1440). */
export const MAX_DAY_MINUTES = 1440;

/**
 * Soma minutos de leitura (cronômetro) à entrada do dia. Sem entrada no dia,
 * cria uma parada na posição atual (from = to): houve tempo de leitura, mesmo sem avanço.
 */
export function addMinutes(book, minutes, today) {
  const journal = [...(book.journal || [])];
  const add = Math.round(Number(minutes));
  if (!Number.isFinite(add) || add <= 0) return journal;
  const index = journal.findIndex((e) => e.date === today);
  if (index >= 0) {
    const entry = journal[index];
    journal[index] = { ...entry, minutes: Math.min(MAX_DAY_MINUTES, (entry.minutes || 0) + add) };
    return journal;
  }
  const unit = unitOf(book);
  const at = lastPosition(book, journal.filter((e) => e.date < today), unit);
  return insertSorted(journal, { date: today, from: at, to: at, unit, note: '', minutes: Math.min(MAX_DAY_MINUTES, add) });
}

/**
 * Livro concluído: a entrada do dia termina no fim do livro
 * (total de páginas no físico, 100% no Kindle). Físico sem total de páginas: nada muda.
 */
export function closeOnFinish(book, today) {
  const unit = unitOf(book);
  const total = unit === UNITS.PERCENT ? 100 : Number(book.pages) || null;
  if (!total) return [...(book.journal || [])];
  return recordProgress(book, total, unit, today);
}

/**
 * Diário ao salvar o formulário: d é o livro editado, original o que estava salvo
 * (null para livro novo), today 'AAAA-MM-DD'. Devolve o diário a gravar.
 * - Livro novo ou que estava em "Quero ler": sem entrada. A página informada é o
 *   ponto de partida, não leitura feita hoje (marcar direto como Lido também não
 *   inventa um dia com o livro inteiro; as páginas entram no ano do término).
 * - Formato trocado (físico ↔ Kindle): sem entrada; é correção do cadastro, e a
 *   posição na unidade nova vira o ponto de partida.
 * - Conclusão: fecha no dia do término informado, se não for no futuro nem antes do diário.
 * - Lendo/Abandonado com posição nova: registra no dia.
 */
export function journalOnSave(d, original, today) {
  const journal = d.journal || [];
  if (!original || original.status === STATUS.WANT) return journal;
  if (unitOf(d) !== unitOf(original)) return journal;
  if (d.status === STATUS.READ) {
    if (original.status === STATUS.READ) return journal;
    const last = journal[journal.length - 1]?.date || '';
    const day = isIsoDate(d.endDate) && d.endDate <= today && d.endDate >= last ? d.endDate : today;
    return closeOnFinish({ ...d, currentPage: original.currentPage, currentPercent: original.currentPercent }, day);
  }
  if (d.status !== STATUS.READING && d.status !== STATUS.DROPPED) return journal;
  const unit = unitOf(d);
  const field = unit === UNITS.PERCENT ? 'currentPercent' : 'currentPage';
  const value = d[field];
  if (value === null || value === undefined || value === '' || Number(value) === original[field]) return journal;
  return recordProgress({ ...d, [field]: original[field] }, Number(value), unit, today);
}

/** Páginas avançadas numa entrada. Kindle: % convertido em páginas quando o total é conhecido. */
export function entryPages(book, entry) {
  const delta = Math.max(0, entry.to - entry.from);
  if (entry.unit === UNITS.PERCENT) {
    const pages = Number(book.pages) || 0;
    return pages ? Math.round((delta * pages) / 100) : 0;
  }
  return delta;
}

/** Só conta como dia de leitura a entrada que avançou (correções para trás não contam). */
function advanced(entry) {
  return entry.to > entry.from;
}

/**
 * Páginas lidas por dia, somando todos os livros.
 * Map 'AAAA-MM-DD' → { pages, byBook: [{ id, title, pages }] }.
 * Kindle sem total de páginas entra com 0 páginas, mas o dia aparece (houve leitura).
 */
export function pagesReadPerDay(books) {
  const days = new Map();
  for (const book of books) {
    for (const entry of book.journal || []) {
      if (!advanced(entry)) continue;
      const pages = entryPages(book, entry);
      const day = days.get(entry.date) || { pages: 0, byBook: [] };
      day.pages += pages;
      const item = day.byBook.find((x) => x.id === book.id);
      if (item) item.pages += pages;
      else day.byBook.push({ id: book.id, title: book.title, pages });
      days.set(entry.date, day);
    }
  }
  return days;
}

/** Dias com leitura registrada no diário; sem ano, de todos os anos. */
export function readingDays(books, year = null) {
  const out = new Set();
  for (const book of books) {
    for (const entry of book.journal || []) {
      if (advanced(entry) && (year === null || yearOf(entry.date) === year)) out.add(entry.date);
    }
  }
  return out;
}

function dayNumber(iso) {
  return Date.UTC(Number(iso.slice(0, 4)), Number(iso.slice(5, 7)) - 1, Number(iso.slice(8, 10))) / 86400000;
}

/** Maior sequência de dias seguidos na lista de datas (qualquer ordem, repetidas contam uma vez). */
export function longestDayStreak(dates) {
  const days = [...new Set(dates)].map(dayNumber).sort((a, b) => a - b);
  let best = 0;
  let run = 0;
  for (let i = 0; i < days.length; i += 1) {
    run = i > 0 && days[i] === days[i - 1] + 1 ? run + 1 : 1;
    best = Math.max(best, run);
  }
  return best;
}

/**
 * Páginas lidas no ano. Regra:
 * - Livro Lido, Lendo ou Abandonado COM diário: soma as páginas das entradas datadas no ano
 *   (Kindle: % convertido pelo total de páginas; sem total, 0).
 *   Livro Lido com diário que não cobre o livro todo (começou antes do diário existir,
 *   como os livros da versão 1.2): as páginas que faltam para o total entram no ano do término.
 * - Livro Lido SEM diário (registrado depois de lido, ou de versões antigas):
 *   o total de páginas entra no ano do término.
 * - "Quero ler" não conta.
 */
export function pagesReadInYear(books, year) {
  let total = 0;
  for (const book of books) {
    if (book.status === STATUS.WANT) continue;
    const journal = book.journal || [];
    const finishedInYear = book.status === STATUS.READ && book.endDate && yearOf(book.endDate) === year;
    if (!journal.length) {
      if (finishedInYear) total += book.pages || 0;
      continue;
    }
    let all = 0;
    for (const entry of journal) {
      const pages = entryPages(book, entry);
      all += pages;
      if (yearOf(entry.date) === year) total += pages;
    }
    if (finishedInYear && book.pages) total += Math.max(0, book.pages - all);
  }
  return total;
}
