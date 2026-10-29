// Conteúdo das folhas que sobem de baixo: "Registrar leitura" e o menu rápido
// (tocar e segurar numa capa ou cartão, ou o botão "Mais ações").

import { formatDuration, timeInputs } from '../audio.js';
import { positionField, unitOf, unitTotal, UNITS } from '../journal.js';
import { paceLines } from '../pace.js';
import { FORMATS, STATUS } from '../store.js';
import { GLYPHS, cover, esc, finishHref, icon, progressOf } from '../ui.js';
import { META_GLYPHS } from './meta-ui.js';

/** Total da régua: 100 no Kindle, a duração (minutos) no audiolivro, nº de páginas no físico (null se não informado). */
export function progressTotal(book) {
  return unitTotal(book, unitOf(book));
}

/** Atalhos de cada formato: páginas, % ou minutos. */
const STEPS = {
  [UNITS.PAGE]: [[10, '+10'], [20, '+20'], [50, '+50']],
  [UNITS.PERCENT]: [[5, '+5%'], [10, '+10%']],
  [UNITS.MINUTE]: [[15, '+15 min'], [30, '+30 min'], [60, '+1h']],
};

/** Campo grande da folha: página/% num campo só; audiolivro em horas e minutos. */
function sheetField(book, unit, value, total) {
  if (unit === UNITS.MINUTE) {
    return `
      <div class="psheet-field is-time">
        ${timeInputs({ id: 'progress-h', value, size: 'lg', label: 'Tempo ouvido' })}
        ${total ? `<span class="psheet-suffix">de ${esc(formatDuration(total))}</span>` : ''}
      </div>`;
  }
  const kindle = unit === UNITS.PERCENT;
  return `
      <div class="psheet-field">
        <input id="progress-input" class="psheet-input" type="number" inputmode="numeric" min="0" max="${total || 20000}"
          value="${esc(value ?? '')}" placeholder="${kindle ? '0' : 'Página'}" enterkeyhint="done" autocomplete="off">
        <span class="psheet-suffix">${kindle ? '%' : total ? `de ${esc(total)}` : 'pág.'}</span>
      </div>`;
}

const SHEET_LABEL = {
  [UNITS.PAGE]: ['Em que página você está?', 'Página atual'],
  [UNITS.PERCENT]: ['Quantos % o Kindle mostra?', 'Porcentagem lida'],
  [UNITS.MINUTE]: ['Quanto você já ouviu?', 'Tempo ouvido'],
};

/** Folha "Registrar leitura": campo grande, atalhos +10/+20/+50 (ou +5%/+10%, ou +15 min/+30 min/+1h), régua e Salvar. */
export function progressSheet(book, today) {
  const unit = unitOf(book);
  const total = progressTotal(book);
  const value = book[positionField(unit)];
  const p = progressOf(book);
  const { pace } = paceLines(book, today);
  const now = p ? (p.pct != null ? `${p.pct}% · ${p.label}` : p.audio ? p.label : `Na ${p.label}`) : 'Ainda sem registro';
  const [label, rangeLabel] = SHEET_LABEL[unit];
  return `
    <form class="progress-edit psheet" data-progress-form data-id="${esc(book.id)}" data-unit="${unit}" novalidate>
      <div class="psheet-head" data-sheet-drag>
        ${cover(book, { size: 'xs', showText: false })}
        <div class="psheet-head-text">
          <span class="eyebrow accent">Registrar leitura</span>
          <span class="psheet-title" id="psheet-title">${esc(book.title)}</span>
          <span class="muted small">${esc(now)}</span>
          ${pace ? `<span class="muted small">${esc(pace.replace(/ · termina.*$/, ''))}</span>` : ''}
        </div>
        <button type="button" class="psheet-close" data-action="cancel-progress" aria-label="Fechar">${icon('close', { size: 18, stroke: 2.2 })}</button>
      </div>
      <label class="progress-edit-label" for="${unit === UNITS.MINUTE ? 'progress-h' : 'progress-input'}">${esc(label)}</label>
      ${sheetField(book, unit, value, total)}
      <div class="psheet-quick" role="group" aria-label="Somar ao valor">
        ${STEPS[unit].map(([n, text]) => `<button type="button" class="psheet-chip" data-action="progress-add" data-delta="${n}">${text}</button>`).join('')}
      </div>
      ${total ? `<input id="progress-range" class="psheet-range" type="range" min="0" max="${total}" step="1" value="${esc(Math.min(total, Number(value) || 0))}" aria-label="${rangeLabel}" style="--fill:${Math.round(((Number(value) || 0) / total) * 100)}%">` : ''}
      <div class="psheet-actions">
        <button type="button" class="btn-ghost" data-action="progress-finish" data-id="${esc(book.id)}">${icon('check', { size: 18, stroke: 2.2 })}Terminei o livro</button>
        <button type="submit" class="btn-primary">Salvar</button>
      </div>
    </form>`;
}

function menuItem({ label, glyph, action = '', href = '', id, close = true, primary = false, extra = '' }) {
  const cls = `qm-item${primary ? ' is-primary' : ''}`;
  const attrs = `${close ? ' data-sheet-close' : ''}${extra}`;
  if (href) return `<a class="${cls}" href="${href}"${attrs}>${glyph}<span>${label}</span></a>`;
  return `<button type="button" class="${cls}" data-action="${action}" data-id="${esc(id)}"${attrs}>${glyph}<span>${label}</span></button>`;
}

/** Menu rápido de um livro: abrir, registrar, ler agora, concluir, próxima, começar. */
export function quickMenu(book, state) {
  const id = book.id;
  const items = [menuItem({ label: 'Abrir livro', glyph: icon('book', { size: 20 }), href: `#/livro/${encodeURIComponent(id)}` })];
  if (book.status === STATUS.READING) {
    items.push(
      menuItem({ label: 'Registrar leitura', glyph: GLYPHS.pencil, action: 'update-page', id, close: false }),
      menuItem({ label: book.format === FORMATS.AUDIO ? 'Ouvir agora' : 'Ler agora', glyph: `<span class="qm-play">${GLYPHS.play}</span>`, action: 'start-timer', id }),
      menuItem({ label: 'Concluir', glyph: icon('check', { size: 20, stroke: 2 }), href: finishHref(id) }),
      menuItem({ label: 'Voltar para Quero ler', glyph: GLYPHS.queue, action: 'pause-reading', id }),
    );
  }
  if (book.status === STATUS.WANT) {
    const isNext = (state.upNext || []).includes(id);
    items.push(
      menuItem({ label: 'Começar a ler', glyph: `<span class="qm-play">${GLYPHS.play}</span>`, action: 'start-reading', id }),
      menuItem({ label: isNext ? 'Desmarcar como próxima' : 'Marcar como próxima', glyph: GLYPHS.queue, action: 'toggle-next', id, extra: ` aria-pressed="${isNext}"` }),
    );
  }
  // 1.6: empréstimo. "Emprestei para…" nos livros da fila (em leitura, o livro está com a
  // pessoa); "Devolvido" em qualquer livro emprestado.
  if (book.loan?.to) {
    items.push(menuItem({ label: `Devolvido (estava com ${esc(book.loan.to)})`, glyph: META_GLYPHS.loan(20), action: 'loan-return', id }));
  } else if (book.status === STATUS.WANT) {
    items.push(menuItem({ label: 'Emprestei para…', glyph: META_GLYPHS.loan(20), action: 'loan-open', id, close: false }));
  }
  const author = (book.authors || '').split(',')[0].trim();
  return `
    <div class="qm">
      <div class="qm-head" data-sheet-drag>
        ${cover(book, { size: 'xs', showText: false })}
        <div class="qm-head-text"><span class="qm-title">${esc(book.title)}</span>${author ? `<span class="muted small">${esc(author)}</span>` : ''}</div>
      </div>
      <div class="qm-list">${items.join('')}</div>
      <button type="button" class="btn-ghost qm-cancel" data-sheet-close>Cancelar</button>
    </div>`;
}
