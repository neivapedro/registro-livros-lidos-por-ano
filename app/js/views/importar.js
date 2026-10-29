// Prévia da importação do Goodreads / StoryGraph (1.6), no topo de Ajustes, como o pedido de
// confirmação das chaves: nada é gravado sem o toque em "Importar".

import { STATUS } from '../store.js';
import { esc, icon, plural } from '../ui.js';

const SOURCE_LABEL = { goodreads: 'Goodreads', storygraph: 'StoryGraph' };
const STATUS_ROWS = [
  [STATUS.READ, 'Lidos'],
  [STATUS.READING, 'Lendo'],
  [STATUS.WANT, 'Quero ler'],
  [STATUS.DROPPED, 'Abandonados'],
];

function dupFate(n, included) {
  if (included) return n === 1 ? 'vai entrar repetido' : 'vão entrar repetidos';
  return n === 1 ? 'fica de fora' : 'ficam de fora';
}

/** Botão do arquivo, no cartão de backup de Ajustes. */
export function importCsvButton() {
  return `<label class="btn-ghost file-btn">${icon('upload', { size: 18, stroke: 2 })}Importar do Goodreads ou StoryGraph (CSV)<input type="file" accept=".csv,text/csv,text/comma-separated-values,application/vnd.ms-excel" data-import-csv class="sr-only"></label>`;
}

/**
 * Cartão da prévia. imp: { plan, fileName, includeDuplicates } ou, depois de importar,
 * { done: { count } } (com o Desfazer).
 */
export function importPreviewCard(imp) {
  if (!imp) return '';
  if (imp.done) {
    return `
    <section class="card gr-import is-done" aria-labelledby="gr-title" aria-live="polite">
      <h2 id="gr-title">${icon('check', { size: 18, stroke: 2.4 })}${plural(imp.done.count, 'livro importado', 'livros importados')}</h2>
      <p class="muted small">As capas aparecem aos poucos, conforme forem baixadas. Mudou de ideia? Desfazer tira só os livros que acabaram de entrar.</p>
      <div class="two-cols">
        <button type="button" class="btn-ghost" data-action="gr-undo">Desfazer importação</button>
        <button type="button" class="btn-primary sm" data-action="gr-close">Pronto</button>
      </div>
    </section>`;
  }
  const { plan, fileName, includeDuplicates } = imp;
  const source = SOURCE_LABEL[plan.source] || 'CSV';
  const total = plan.books.length + (includeDuplicates ? plan.duplicates.length : 0);
  const counts = STATUS_ROWS.filter(([s]) => plan.counts[s]).map(([s, label]) => `
        <li><span class="gr-n">${plan.counts[s]}</span><span class="muted small">${label}</span></li>`).join('');
  const dups = plan.duplicates.length ? `
      <div class="gr-dups">
        <p class="small"><strong>${plural(plan.duplicates.length, 'livro já está', 'livros já estão')} no app</strong> (mesmo ISBN ou mesmo título e autor) e ${dupFate(plan.duplicates.length, includeDuplicates)}.</p>
        <details class="gr-dup-list">
          <summary>Ver quais</summary>
          <ul class="small">${plan.duplicates.slice(0, 50).map((d) => `<li>${esc(d.book.title)}${d.book.authors ? ` <span class="muted">· ${esc(d.book.authors)}</span>` : ''}</li>`).join('')}${plan.duplicates.length > 50 ? `<li class="muted">e mais ${plan.duplicates.length - 50}</li>` : ''}</ul>
        </details>
        <button type="button" class="toggle-row vs-toggle" data-action="gr-dups" aria-pressed="${Boolean(includeDuplicates)}">
          <span class="toggle-text"><span class="strong-ish">Importar os repetidos mesmo assim</span><span class="muted small">Ficam dois registros do mesmo livro</span></span>
          <span class="switch${includeDuplicates ? ' is-on' : ''}"><span class="switch-knob"></span></span>
        </button>
      </div>` : '';
  const notes = [
    plan.undated ? `${plural(plan.undated, 'livro lido está', 'livros lidos estão')} sem data de leitura no ${source}: ${plan.undated === 1 ? 'entra' : 'entram'} com a data em que ${plan.undated === 1 ? 'foi adicionado' : 'foram adicionados'} lá.` : '',
    plan.skipped ? `${plural(plan.skipped, 'linha sem título foi ignorada', 'linhas sem título foram ignoradas')}.` : '',
  ].filter(Boolean).map((t) => `<p class="muted small">${esc(t)}</p>`).join('');
  return `
    <section class="card gr-import" aria-labelledby="gr-title">
      <h2 id="gr-title">Importar do ${source}?</h2>
      <p class="muted small gr-file">${esc(fileName || '')}</p>
      ${counts ? `<ul class="gr-counts" aria-label="Livros novos por status">${counts}</ul>` : `<p class="small">Nenhum livro novo no arquivo.</p>`}
      ${dups}${notes}
      <p class="muted small">Os livros que você já tem não mudam. Dá para desfazer logo depois.</p>
      <div class="two-cols">
        <button type="button" class="btn-primary sm" data-action="gr-import"${total ? '' : ' disabled'}>Importar ${plural(total, 'livro', 'livros')}</button>
        <button type="button" class="btn-ghost" data-action="gr-cancel">Cancelar</button>
      </div>
    </section>`;
}
