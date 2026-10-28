// Diário de leitura: quanto foi lido em cada dia.
// Cada livro guarda em book.journal entradas { date, from, to, unit, note, minutes? }:
// a posição em que estava no começo do dia (from) e onde parou (to),
// em páginas (livro físico), em % (Kindle) ou em minutos (audiolivro). Uma entrada por livro por dia.
// 'minutes' (opcional) soma as sessões do cronômetro no dia.
// Funções puras: recebem o livro e devolvem um diário novo, sem alterar o original.

import { isIsoDate, monthOf, yearOf } from './dates.js';
import { FORMATS, STATUS } from './store.js';

export const UNITS = { PAGE: 'page', PERCENT: 'percent', MINUTE: 'minute' };

/** Unidade do progresso do livro: % no Kindle, minutos no audiolivro, página no físico. */
export function unitOf(book) {
  if (book.format === FORMATS.KINDLE) return UNITS.PERCENT;
  return book.format === FORMATS.AUDIO ? UNITS.MINUTE : UNITS.PAGE;
}

/** Campo do livro com a posição nesta unidade: currentPercent, currentMin ou currentPage. */
export function positionField(unit) {
  if (unit === UNITS.PERCENT) return 'currentPercent';
  return unit === UNITS.MINUTE ? 'currentMin' : 'currentPage';
}

/** Fim do livro na unidade: 100%, a duração do audiolivro ou o nº de páginas (null se não informado). */
export function unitTotal(book, unit = unitOf(book)) {
  if (unit === UNITS.PERCENT) return 100;
  const total = Number(unit === UNITS.MINUTE ? book.durationMin : book.pages);
  return total > 0 ? total : null;
}

function isNum(v) {
  return typeof v === 'number' && Number.isFinite(v);
}

/** Última posição conhecida: o 'to' da última entrada na mesma unidade, senão a página/% do livro, senão 0. */
function lastPosition(book, journal, unit) {
  for (let i = journal.length - 1; i >= 0; i -= 1) {
    if (journal[i].unit === unit) return journal[i].to;
  }
  const current = book[positionField(unit)];
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
 * Livro concluído: a entrada do dia termina no fim do livro (total de páginas no físico,
 * 100% no Kindle, a duração no audiolivro). Sem o total: nada muda.
 */
export function closeOnFinish(book, today) {
  const unit = unitOf(book);
  const total = unitTotal(book, unit);
  if (!total) return [...(book.journal || [])];
  return recordProgress(book, total, unit, today);
}

/**
 * Diário ao salvar o formulário: d é o livro editado, original o que estava salvo
 * (null para livro novo), today 'AAAA-MM-DD'. Devolve o diário a gravar.
 * - Livro novo ou que estava em "Quero ler": sem entrada. A página informada é o
 *   ponto de partida, não leitura feita hoje (marcar direto como Lido também não
 *   inventa um dia com o livro inteiro; as páginas entram no ano do término).
 * - Formato trocado (físico ↔ Kindle ↔ audiolivro): sem entrada; é correção do cadastro, e a
 *   posição na unidade nova vira o ponto de partida.
 * - Conclusão: fecha no dia do término informado, se não for no futuro nem antes do diário.
 * - Lendo/Abandonado com posição nova: registra no dia.
 * - De Lendo/Lido/Abandonado para "Quero ler": diário vazio (recomeça do zero).
 */
export function journalOnSave(d, original, today) {
  const journal = d.journal || [];
  // Voltou para "Quero ler": começa do zero na próxima vez (o diário antigo não conta mais).
  if (original && original.status !== STATUS.WANT && d.status === STATUS.WANT) return [];
  if (!original || original.status === STATUS.WANT) return journal;
  if (unitOf(d) !== unitOf(original)) return journal;
  if (d.status === STATUS.READ) {
    if (original.status === STATUS.READ) return journal;
    const last = journal[journal.length - 1]?.date || '';
    const day = isIsoDate(d.endDate) && d.endDate <= today && d.endDate >= last ? d.endDate : today;
    return closeOnFinish({
      ...d, currentPage: original.currentPage, currentPercent: original.currentPercent, currentMin: original.currentMin,
    }, day);
  }
  if (d.status !== STATUS.READING && d.status !== STATUS.DROPPED) return journal;
  const unit = unitOf(d);
  const field = positionField(unit);
  const value = d[field];
  if (value === null || value === undefined || value === '' || Number(value) === original[field]) return journal;
  return recordProgress({ ...d, [field]: original[field] }, Number(value), unit, today);
}

/**
 * Páginas avançadas numa entrada. Kindle: % convertido em páginas quando o total é conhecido.
 * Audiolivro: minutos convertidos em "páginas equivalentes" só com páginas E duração informadas;
 * senão 0 (o tempo ouvido conta à parte, em minutesListenedInYear).
 * A conversão arredonda as posições (não a diferença): entradas encadeadas de 0% a 100%
 * somam exatamente o total do livro (20 dias de 5% num livro de 416 págs. = 416, não 420).
 */
export function entryPages(book, entry) {
  const delta = Math.max(0, entry.to - entry.from);
  if (entry.unit === UNITS.PERCENT || entry.unit === UNITS.MINUTE) {
    const pages = Number(book.pages) || 0;
    const total = entry.unit === UNITS.PERCENT ? 100 : Number(book.durationMin) || 0;
    if (!pages || !total || !delta) return 0;
    const at = (v) => Math.round((Math.min(v, total) * pages) / total);
    return Math.max(0, at(entry.to) - at(entry.from));
  }
  return delta;
}

/**
 * Páginas que cada entrada do diário soma nos totais (ano, mês, dia), na ordem das datas.
 * Só conta o avanço além da maior posição já alcançada no livro: depois de uma correção
 * para trás (100 → 60), voltar a avançar até 100 não conta de novo (0→100, 100→60, 60→150 = 150).
 * O total nunca passa do nº de páginas do livro, quando conhecido.
 * Devolve [{ entry, pages }].
 */
export function countedEntries(book) {
  const total = Number(book.pages) || 0;
  const high = {};
  let sum = 0;
  return [...(book.journal || [])]
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((entry) => {
      const reached = high[entry.unit];
      const from = reached === undefined ? entry.from : Math.max(entry.from, reached);
      high[entry.unit] = reached === undefined ? entry.to : Math.max(reached, entry.to);
      let pages = entry.to > from ? entryPages(book, { ...entry, from }) : 0;
      if (total) pages = Math.max(0, Math.min(pages, total - sum));
      sum += pages;
      return { entry, pages };
    });
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
    for (const { entry, pages } of countedEntries(book)) {
      if (!advanced(entry)) continue;
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
    for (const { entry, pages } of countedEntries(book)) {
      all += pages;
      if (yearOf(entry.date) === year) total += pages;
    }
    if (finishedInYear && book.pages) total += Math.max(0, book.pages - all);
  }
  return total;
}

/**
 * Minutos ouvidos (audiolivro) que cada entrada soma, como countedEntries faz com as páginas:
 * só o avanço além da maior posição já alcançada, sem passar da duração. Devolve [{ entry, minutes }].
 */
export function listenedEntries(book) {
  const total = Number(book.durationMin) || 0;
  let high;
  let sum = 0;
  return [...(book.journal || [])]
    .filter((e) => e.unit === UNITS.MINUTE)
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((entry) => {
      const from = high === undefined ? entry.from : Math.max(entry.from, high);
      high = high === undefined ? entry.to : Math.max(high, entry.to);
      let minutes = Math.max(0, entry.to - from);
      if (total) minutes = Math.max(0, Math.min(minutes, total - sum));
      sum += minutes;
      return { entry, minutes };
    });
}

/**
 * Minutos ouvidos, datados: [{ date, minutes }]. Mesma regra das páginas: as entradas em minutos
 * do diário; audiolivro Lido sem diário (ou com diário incompleto) soma a duração que falta
 * no dia do término.
 */
function listenedDated(books) {
  const out = [];
  for (const book of books) {
    if (book.status === STATUS.WANT) continue;
    let all = 0;
    for (const { entry, minutes } of listenedEntries(book)) {
      all += minutes;
      if (minutes) out.push({ date: entry.date, minutes });
    }
    const rest = book.format === FORMATS.AUDIO && book.status === STATUS.READ && isIsoDate(book.endDate)
      ? Math.max(0, (Number(book.durationMin) || 0) - all) : 0;
    if (rest) out.push({ date: book.endDate, minutes: rest });
  }
  return out;
}

/** Minutos ouvidos em audiolivros no ano; sem ano (null), de todos os anos. */
export function minutesListenedInYear(books, year = null) {
  return listenedDated(books).reduce((s, x) => s + (year === null || yearOf(x.date) === year ? x.minutes : 0), 0);
}

/** Minutos ouvidos em cada mês do ano (12 números; a soma é minutesListenedInYear). */
export function minutesListenedByMonth(books, year) {
  const months = Array(12).fill(0);
  for (const x of listenedDated(books)) if (yearOf(x.date) === year) months[monthOf(x.date)] += x.minutes;
  return months;
}

/** Minutos ouvidos por dia (todos os livros). Map 'AAAA-MM-DD' → minutos. */
export function minutesListenedPerDay(books) {
  const days = new Map();
  for (const book of books) {
    for (const { entry, minutes } of listenedEntries(book)) {
      if (minutes > 0) days.set(entry.date, (days.get(entry.date) || 0) + minutes);
    }
  }
  return days;
}
