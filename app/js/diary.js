// Aba "Diário" do livro: resumo, texto de cada dia e correção manual das entradas.
// O registro automático fica em journal.js; aqui só se lê e se corrige o que já existe.
// Funções puras: devolvem um diário novo, sem alterar o original.

import { formatShort, isIsoDate, yearOf } from './dates.js';
import { entryPages, UNITS } from './journal.js';

const nf = new Intl.NumberFormat('pt-BR');
const num = (n) => nf.format(Math.round(n));

/** Diário do mais recente para o mais antigo. */
export function entriesNewestFirst(book) {
  return [...(book.journal || [])].sort((a, b) => b.date.localeCompare(a.date));
}

/**
 * Totais do diário: dias que avançaram, páginas e média por dia de leitura.
 * Kindle sem total de páginas: soma os % (pages fica null).
 */
export function diarySummary(book) {
  let days = 0;
  let pages = 0;
  let percent = 0;
  let unknownPages = false;
  for (const entry of book.journal || []) {
    if (entry.to <= entry.from) continue;
    days += 1;
    if (entry.unit === UNITS.PERCENT) {
      percent += entry.to - entry.from;
      if (!Number(book.pages)) unknownPages = true;
    }
    pages += entryPages(book, entry);
  }
  if (unknownPages) {
    return { days, pages: null, percent, avg: days ? Math.round(percent / days) : 0, unit: UNITS.PERCENT };
  }
  return { days, pages, percent, avg: days ? Math.round(pages / days) : 0, unit: UNITS.PAGE };
}

/** "12 out"; de outro ano, "12 out 2025". */
export function entryDate(date, today) {
  return yearOf(date) === yearOf(today) ? formatShort(date) : `${formatShort(date)} ${date.slice(0, 4)}`;
}

/**
 * Partes do texto de uma entrada:
 * físico  → { range: 'p. 120 → 164', delta: '+44 págs.' }
 * Kindle  → { range: '20% → 45%', delta: '+25%', approx: '≈ 80 págs.' } (approx só com o total de páginas)
 * Voltou atrás (correção): delta 'correção'.
 */
export function entryParts(book, entry) {
  const back = entry.to < entry.from;
  const minutes = Number.isFinite(entry.minutes) && entry.minutes > 0 ? `${Math.round(entry.minutes)} min` : '';
  if (entry.unit === UNITS.PERCENT) {
    const pages = entryPages(book, entry);
    return {
      range: `${entry.from}% → ${entry.to}%`,
      delta: back ? 'correção' : `+${entry.to - entry.from}%`,
      approx: !back && Number(book.pages) && pages ? `≈ ${num(pages)} págs.` : '',
      minutes,
    };
  }
  const delta = entry.to - entry.from;
  return {
    range: `p. ${entry.from} → ${entry.to}`,
    delta: back ? 'correção' : `+${num(delta)} ${delta === 1 ? 'pág.' : 'págs.'}`,
    approx: '',
    minutes,
  };
}

/** Linha completa, ex.: "12 out · p. 120 → 164 (+44 págs.) · 32 min". */
export function entryLine(book, entry, today) {
  const p = entryParts(book, entry);
  const extra = [p.delta, p.approx].filter(Boolean).join(' · ');
  return [`${entryDate(entry.date, today)} · ${p.range} (${extra})`, p.minutes].filter(Boolean).join(' · ');
}

function parseValue(raw) {
  const text = String(raw ?? '').trim().replace('%', '').replace(',', '.');
  if (text === '') return null;
  const n = Number(text);
  return Number.isFinite(n) ? n : NaN;
}

/**
 * Corrige a entrada do dia `originalDate` com { date, from, to, note }.
 * Devolve { journal } (novo diário, em ordem de data) ou { error } com a mensagem para a tela.
 * Regras: data válida e não futura; valores a partir de 0; páginas inteiras e até o total
 * do livro (quando conhecido); % até 100; uma entrada por dia (outra data já usada é recusada).
 */
export function editEntry(book, originalDate, input, today) {
  const journal = book.journal || [];
  const index = journal.findIndex((e) => e.date === originalDate);
  if (index < 0) return { error: 'Registro não encontrado.' };
  const entry = journal[index];
  const date = String(input.date || '').trim();
  if (!isIsoDate(date)) return { error: 'Informe uma data válida.' };
  if (date > today) return { error: 'A data não pode estar no futuro.' };
  if (date !== originalDate && journal.some((e) => e.date === date)) {
    return { error: `Já existe um registro em ${formatShort(date)}. Corrija aquele registro ou escolha outra data.` };
  }
  const from = parseValue(input.from);
  const to = parseValue(input.to);
  const percent = entry.unit === UNITS.PERCENT;
  if (from === null || to === null) return { error: percent ? 'Informe as duas porcentagens.' : 'Informe as duas páginas.' };
  if (Number.isNaN(from) || Number.isNaN(to) || from < 0 || to < 0) {
    return { error: 'Use números a partir de 0.' };
  }
  if (percent) {
    if (from > 100 || to > 100) return { error: 'A porcentagem vai de 0 a 100.' };
  } else {
    if (!Number.isInteger(from) || !Number.isInteger(to)) return { error: 'Use números inteiros de página.' };
    const total = Number(book.pages) || 0;
    if (total && (from > total || to > total)) return { error: `A página não pode passar de ${total}, o total do livro.` };
    if (from > 20000 || to > 20000) return { error: 'Número de página grande demais.' };
  }
  const next = {
    ...entry,
    date,
    from: Math.round(from),
    to: Math.round(to),
    note: String(input.note ?? '').trim().slice(0, 10000),
  };
  const out = journal.filter((_, i) => i !== index);
  out.push(next);
  return { journal: out.sort((a, b) => a.date.localeCompare(b.date)), entry: next };
}

/** Tira a entrada do dia. */
export function removeEntry(book, date) {
  return (book.journal || []).filter((e) => e.date !== date);
}

/** Desfazer: recoloca a entrada, se o dia continua livre. */
export function restoreEntry(book, entry) {
  const journal = book.journal || [];
  if (journal.some((e) => e.date === entry.date)) return journal;
  return [...journal, entry].sort((a, b) => a.date.localeCompare(b.date));
}

/**
 * Posição atual depois de corrigir a última entrada: se o livro estava exatamente
 * no 'to' antigo, passa para o novo (senão o cartão do Início ficaria desatualizado).
 * Recebe o livro ANTES da correção e o diário novo.
 * Devolve o campo a mudar ({ currentPage } ou { currentPercent }) ou {}.
 */
export function syncPosition(book, before, after, nextJournal) {
  const journal = book.journal || [];
  const last = journal[journal.length - 1];
  if (!last || last.date !== before.date || nextJournal[nextJournal.length - 1] !== after) return {};
  const field = before.unit === UNITS.PERCENT ? 'currentPercent' : 'currentPage';
  return book[field] === before.to && after.to !== before.to ? { [field]: after.to } : {};
}
