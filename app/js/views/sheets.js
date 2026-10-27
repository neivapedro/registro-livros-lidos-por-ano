// Conteúdo das folhas que sobem de baixo: "Registrar leitura" e o menu rápido
// (tocar e segurar numa capa ou cartão, ou o botão "Mais ações").

import { paceLines } from '../pace.js';
import { FORMATS, STATUS } from '../store.js';
import { GLYPHS, cover, esc, finishHref, icon, progressOf } from '../ui.js';

/** Total da régua: 100 no Kindle, nº de páginas no físico (null se não informado). */
export function progressTotal(book) {
  if (book.format === FORMATS.KINDLE) return 100;
  return Number(book.pages) > 0 ? Number(book.pages) : null;
}

/** Folha "Registrar leitura": campo grande, atalhos +10/+20/+50 (ou +5%/+10%), régua e Salvar. */
export function progressSheet(book, today) {
  const kindle = book.format === FORMATS.KINDLE;
  const total = progressTotal(book);
  const value = kindle ? book.currentPercent : book.currentPage;
  const p = progressOf(book);
  const { pace } = paceLines(book, today);
  const now = p ? (p.pct != null ? `${p.pct}% · ${p.label}` : `Na ${p.label}`) : 'Ainda sem registro';
  const steps = kindle ? [5, 10] : [10, 20, 50];
  const label = kindle ? 'Quantos % o Kindle mostra?' : 'Em que página você está?';
  return `
    <form class="progress-edit psheet" data-progress-form data-id="${esc(book.id)}" novalidate>
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
      <label class="progress-edit-label" for="progress-input">${esc(label)}</label>
      <div class="psheet-field">
        <input id="progress-input" class="psheet-input" type="number" inputmode="numeric" min="0" max="${total || 20000}"
          value="${esc(value ?? '')}" placeholder="${kindle ? '0' : 'Página'}" enterkeyhint="done" autocomplete="off">
        <span class="psheet-suffix">${kindle ? '%' : total ? `de ${esc(total)}` : 'pág.'}</span>
      </div>
      <div class="psheet-quick" role="group" aria-label="Somar ao valor">
        ${steps.map((n) => `<button type="button" class="psheet-chip" data-action="progress-add" data-delta="${n}">+${n}${kindle ? '%' : ''}</button>`).join('')}
      </div>
      ${total ? `<input id="progress-range" class="psheet-range" type="range" min="0" max="${total}" step="1" value="${esc(Math.min(total, Number(value) || 0))}" aria-label="${kindle ? 'Porcentagem lida' : 'Página atual'}" style="--fill:${Math.round(((Number(value) || 0) / total) * 100)}%">` : ''}
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
      menuItem({ label: 'Ler agora', glyph: `<span class="qm-play">${GLYPHS.play}</span>`, action: 'start-timer', id }),
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
