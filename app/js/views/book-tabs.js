// Abas da página do livro: Dados (o formulário de form.js), Diário e Trechos.
// Diário e Trechos salvam na hora; o formulário de Dados continua com o Salvar do topo.

import { formatDuration } from '../audio.js';
import { formatShort } from '../dates.js';
import { diarySummary, entriesNewestFirst, entryDate, entryParts } from '../diary.js';
import { UNITS } from '../journal.js';
import { FORMATS, STATUS } from '../store.js';
import { quotePosition, quoteSavedDay, quotesNewestFirst, quoteUsesPercent } from '../quotes.js';
import { dayLabel, formatMinutes, weekGroups } from '../reading-days.js';
import { esc, icon, num, plural } from '../ui.js';
import { emptyScene } from '../empty-art.js';
import { amountText, rhythmChart } from './rhythm.js';
import { aiLimitReached } from '../prefs.js';
import { quotePhotoBlock } from './ai-views.js';

export const BOOK_TABS = ['dados', 'diario', 'trechos'];

// Ícones só desta tela (ui.js não tem lápis nem compartilhar).
const SVG = {
  pencil: '<path d="M4 20h4L19 9l-4-4L4 16z"/><path d="M13.5 6.5l4 4"/>',
  share: '<path d="M12 15V4M8 8l4-4 4 4"/><path d="M6 12v7a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1v-7"/>',
};
function svg(name, size = 18) {
  return `<svg class="icon" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${SVG[name]}</svg>`;
}

/** Livro salvo (o rascunho de Dados pode ter mudanças ainda não salvas). */
export function storedBook(state, ui) {
  return state.books.find((b) => b.id === ui.draft?.id) || ui.draft;
}

/** Barra de abas, logo abaixo do cabeçalho. Só para livro já salvo. */
export function bookTabBar(book, tab) {
  const counts = { diario: book.journal?.length || 0, trechos: book.quotes?.length || 0 };
  const labels = { dados: 'Dados', diario: 'Diário', trechos: 'Trechos' };
  const buttons = BOOK_TABS.map((t) => `
    <button type="button" role="tab" class="book-tab${t === tab ? ' is-on' : ''}" aria-selected="${t === tab}" data-action="book-tab" data-tab="${t}">
      ${labels[t]}${counts[t] ? ` <span class="book-tab-count">${counts[t]}</span>` : ''}
    </button>`).join('');
  return `<div class="book-tabs" role="tablist" aria-label="Seções do livro">${buttons}</div>`;
}

/** Há mudanças em Dados ainda não salvas? (diário e trechos já se salvam sozinhos). */
function draftChanged(draft, original) {
  if (!original) return false;
  const strip = (b) => JSON.stringify({ ...b, journal: null, quotes: null, createdAt: null, updatedAt: null }, Object.keys(b).sort());
  return strip(draft) !== strip(original);
}

/** Tela das abas Diário e Trechos (cabeçalho próprio: não há formulário para salvar). */
export function bookTabScreen({ state, ui, today }) {
  const book = storedBook(state, ui);
  const tab = ui.bookTab;
  const dirty = draftChanged(ui.draft, ui.original);
  return `
    <header class="form-top">
      <a class="btn-text muted" href="${esc(ui.backHref)}" data-leave>Voltar</a>
      <h1 class="form-title book-tabs-title">${esc(book.title)}</h1>
      ${dirty
    ? '<button type="button" class="btn-text accent strong" data-action="book-save">Salvar</button>'
    : '<span class="book-tabs-spacer" aria-hidden="true"></span>'}
    </header>
    ${bookTabBar(book, tab)}
    ${tab === 'diario' ? diaryTab(book, ui, today) : quotesTab(book, ui, today)}`;
}

// ---------- Diário ----------

function diarySummaryTiles(book) {
  const s = diarySummary(book);
  if (!s.days) return '';
  if (s.unit === UNITS.MINUTE) {
    return `
    <section class="tiles tiles-3 diary-summary" aria-label="Resumo do diário">
      <div class="tile"><span class="tile-value">${num(s.days)}</span><span class="tile-label">${s.days === 1 ? 'dia ouvindo' : 'dias ouvindo'}</span></div>
      <div class="tile"><span class="tile-value">${esc(formatDuration(s.minutes))}</span><span class="tile-label">ouvidos</span></div>
      <div class="tile"><span class="tile-value">${esc(formatDuration(s.avg))}</span><span class="tile-label">por dia ouvindo</span></div>
    </section>`;
  }
  const percent = s.unit === UNITS.PERCENT;
  return `
    <section class="tiles tiles-3 diary-summary" aria-label="Resumo do diário">
      <div class="tile"><span class="tile-value">${num(s.days)}</span><span class="tile-label">${s.days === 1 ? 'dia de leitura' : 'dias de leitura'}</span></div>
      <div class="tile"><span class="tile-value">${percent ? `${num(s.percent)}%` : num(s.pages)}</span><span class="tile-label">${percent ? 'registrados' : 'págs. registradas'}</span></div>
      <div class="tile"><span class="tile-value">${percent ? `${num(s.avg)}%` : num(s.avg)}</span><span class="tile-label">${percent ? 'por dia de leitura' : 'págs. por dia de leitura'}</span></div>
    </section>`;
}

function diaryRow(book, entry, today) {
  const p = entryParts(book, entry);
  const [day, month] = formatShort(entry.date).split(' ');
  const otherYear = entryDate(entry.date, today) !== formatShort(entry.date);
  const sub = [p.approx, p.minutes].filter(Boolean).join(' · ');
  return `
    <li class="diary-entry">
      <button type="button" class="diary-row" data-action="diary-edit" data-date="${esc(entry.date)}" aria-label="Corrigir o registro de ${esc(entryDate(entry.date, today))}">
        <span class="diary-date"><span class="diary-day">${esc(day)}</span><span class="diary-month">${esc(month)}${otherYear ? `<br>${esc(entry.date.slice(0, 4))}` : ''}</span></span>
        <span class="diary-main">
          <span class="diary-line"><span class="diary-range">${esc(p.range)}</span><span class="diary-delta${p.delta === 'correção' ? ' is-back' : ''}">${esc(p.delta)}</span></span>
          ${sub ? `<span class="diary-sub">${esc(sub)}</span>` : ''}
          ${entry.note ? `<span class="diary-note">${esc(entry.note)}</span>` : ''}
        </span>
        <span class="diary-edit-icon">${svg('pencil', 16)}</span>
      </button>
    </li>`;
}

/** Correção de um dia do audiolivro: tempos em texto ("1h 20min", "1:20" ou "80"). */
function audioTimeFields(book, entry) {
  const field = (name, label, value) => `<div class="field"><label for="d-${name}">${label}</label><input id="d-${name}" name="${name}" type="text" inputmode="text" autocomplete="off" placeholder="1h 20min" value="${esc(formatDuration(value))}"></div>`;
  return `<div class="two-cols">${field('from', 'De (tempo)', entry.from)}${field('to', 'Até (tempo)', entry.to)}</div>`;
}

function diaryForm(book, entry, today) {
  const percent = entry.unit === UNITS.PERCENT;
  const max = percent ? 100 : book.pages || 20000;
  const unitLabel = percent ? '(%)' : '(página)';
  return `
    <li class="diary-entry is-editing">
      <form class="notes-form" data-diary-form data-date="${esc(entry.date)}" novalidate>
        <span class="label">Corrigir registro</span>
        <div class="field"><label for="d-date">Data</label><input id="d-date" name="date" type="date" max="${esc(today)}" value="${esc(entry.date)}"></div>
        ${entry.unit === UNITS.MINUTE ? audioTimeFields(book, entry) : `<div class="two-cols">
          <div class="field"><label for="d-from">De ${unitLabel}</label><input id="d-from" name="from" type="number" inputmode="numeric" min="0" max="${max}" value="${esc(entry.from)}"></div>
          <div class="field"><label for="d-to">Até ${unitLabel}</label><input id="d-to" name="to" type="number" inputmode="numeric" min="0" max="${max}" value="${esc(entry.to)}"></div>
        </div>`}
        <div class="field"><label for="d-note">Nota (opcional)</label><input id="d-note" name="note" type="text" maxlength="500" placeholder="Onde leu, o que achou…" value="${esc(entry.note || '')}"></div>
        <div class="notes-form-actions">
          <button type="button" class="btn-text danger" data-action="diary-delete" data-date="${esc(entry.date)}">Excluir</button>
          <span class="notes-form-gap"></span>
          <button type="button" class="btn-text" data-action="diary-cancel">Cancelar</button>
          <button type="submit" class="btn-primary sm">Salvar</button>
        </div>
      </form>
    </li>`;
}

function diaryTab(book, ui, today) {
  const entries = entriesNewestFirst(book);
  const where = book.format === FORMATS.AUDIO ? 'o tempo ouvido' : quoteUsesPercent(book) ? 'a porcentagem' : 'a página';
  if (!entries.length) {
    const hint = book.status === STATUS.WANT
      ? `Quando começar a ler, cada vez que você atualizar ${where} no cartão do Início, o dia fica registrado aqui.`
      : `O diário se preenche sozinho: cada vez que você atualiza ${where} no cartão do Início, o dia fica registrado aqui.`;
    return `<section class="book-tab-panel" role="tabpanel">${emptyScene('diario', 'Nenhum dia registrado ainda', hint)}</section>`;
  }
  const weeks = weekGroups(book).map((week, i) => diaryWeek(book, week, i, ui, today)).join('');
  return `
    <section class="book-tab-panel" role="tabpanel">
      ${rhythmChart(book, today, { tall: true, hint: true })}
      ${diarySummaryTiles(book)}
      <p class="muted small">Registrado sozinho quando você atualiza ${where} no Início. Toque num dia para corrigir.</p>
      <div class="diary-weeks">${weeks}</div>
    </section>`;
}

/**
 * Uma semana do diário (segunda a domingo). A mais recente começa aberta; as outras,
 * recolhidas. A semana do dia em correção fica sempre aberta.
 */
function diaryWeek(book, week, index, ui, today) {
  const editing = week.entries.some((e) => e.date === ui.diaryEdit);
  const chosen = ui.diaryWeeks?.[week.key];
  const open = editing || (chosen ?? index === 0);
  const summary = [
    plural(week.days, 'dia', 'dias'),
    week.amount ? amountText(week.amount, week.unit) : '',
    week.minutes ? formatMinutes(week.minutes) : '',
  ].filter(Boolean).join(' · ');
  const id = `week-${week.key}`;
  const rows = week.entries.map((e) => (e.date === ui.diaryEdit ? diaryForm(book, e, today) : diaryRow(book, e, today))).join('');
  return `
    <section class="diary-week${open ? ' is-open' : ''}">
      <button type="button" class="diary-week-head" data-action="diary-week" data-week="${esc(week.key)}" aria-expanded="${open}" aria-controls="${id}">
        <span class="diary-week-text"><span class="diary-week-title">Semana de ${esc(dayLabel(week.key, today))}</span><span class="diary-week-sum">${esc(summary)}</span></span>
        ${icon('chevronDown', { size: 18, stroke: 2.2, cls: 'diary-week-chev' })}
      </button>
      <ol class="diary-list" id="${id}"${open ? '' : ' hidden'}>${rows}</ol>
    </section>`;
}

// ---------- Trechos ----------

function quoteForm(book, quote, ui = {}, today = '') {
  const percent = quoteUsesPercent(book);
  const position = percent ? quote?.percent : quote?.page;
  const posLabel = percent ? `Posição no ${book.format === FORMATS.AUDIO ? 'áudio' : 'Kindle'} (%)` : `Página${book.pages ? ` (de ${book.pages})` : ''}`;
  return `
    <form class="card notes-form quote-form" data-quote-form data-id="${esc(quote?.id || '')}" novalidate>
      <span class="label">${quote ? 'Corrigir trecho' : 'Novo trecho'}</span>
      <label class="sr-only" for="q-text">Trecho</label>
      <textarea id="q-text" name="text" rows="5" maxlength="5000" placeholder="Copie ou digite o trecho…">${esc(ui.quoteForm?.prefill?.text ?? quote?.text ?? '')}</textarea>
      ${percent ? '' : quotePhotoBlock(ui.quoteForm?.ocr, { hasKey: Boolean(ui.geminiKey), limitReached: aiLimitReached(ui.aiUsage, today) })}
      <div class="field"><label for="q-pos">${posLabel}</label><input id="q-pos" name="position" type="number" inputmode="numeric" min="0" max="${percent ? 100 : book.pages || 20000}" value="${esc(ui.quoteForm?.prefill?.position ?? position ?? '')}"></div>
      <div class="field"><label for="q-note">Nota (opcional)</label><input id="q-note" name="note" type="text" maxlength="500" placeholder="Por que esse trecho marcou" value="${esc(quote?.note || '')}"></div>
      <div class="notes-form-actions">
        <span class="notes-form-gap"></span>
        <button type="button" class="btn-text" data-action="quote-cancel">Cancelar</button>
        <button type="submit" class="btn-primary sm">Salvar</button>
      </div>
    </form>`;
}

function quoteCard(book, quote) {
  const position = quotePosition(quote, book);
  const day = quoteSavedDay(quote);
  const saved = day ? `salvo em ${formatShort(day)} ${day.slice(0, 4)}` : '';
  // Página como selo em versalete ("p. 61"), data apagada ao lado.
  const meta = [position ? `<span class="quote-page">${esc(position)}</span>` : '', saved ? `<span class="quote-date">${esc(saved)}</span>` : ''].filter(Boolean).join(' ');
  return `
    <article class="quote-card">
      <span class="quote-mark" aria-hidden="true">“</span>
      <blockquote class="quote-text">${esc(quote.text)}</blockquote>
      ${meta ? `<p class="quote-meta">${meta}</p>` : ''}
      ${quote.note ? `<p class="quote-note">${esc(quote.note)}</p>` : ''}
      <div class="quote-actions">
        <button type="button" class="btn-text small accent" data-action="quote-share" data-id="${esc(quote.id)}" aria-label="Compartilhar como imagem">${svg('share', 17)}Compartilhar</button>
        <span class="notes-form-gap"></span>
        <button type="button" class="btn-text small" data-action="quote-edit" data-id="${esc(quote.id)}">Editar</button>
        <button type="button" class="btn-text small" data-action="quote-delete" data-id="${esc(quote.id)}">Excluir</button>
      </div>
    </article>`;
}

function quotesTab(book, ui, today) {
  const quotes = quotesNewestFirst(book);
  const form = ui.quoteForm;
  const adding = form && !form.id;
  const addButton = '<button type="button" class="btn-outline sm" data-action="quote-new">+ Trecho</button>';
  const list = quotes.map((q) => (form?.id === q.id ? quoteForm(book, q, ui, today) : quoteCard(book, q))).join('');
  const body = !quotes.length && !adding
    ? emptyScene('trechos', 'Nenhum trecho salvo', 'Guarde aqui as frases que marcaram você neste livro.', addButton)
    : `${adding ? quoteForm(book, null, ui, today) : ''}<div class="quote-list">${list}</div>`;
  return `
    <section class="book-tab-panel" role="tabpanel">
      ${quotes.length && !adding ? `<div class="quotes-head"><span class="muted small">${plural(quotes.length, 'trecho salvo', 'trechos salvos')}</span>${addButton}</div>` : ''}
      ${body}
    </section>`;
}
