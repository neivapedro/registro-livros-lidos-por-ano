import { daysInclusive, isIsoDate, yearOf } from '../dates.js';
import { FORMAT_LABELS, FORMATS, STATUS, STATUS_LABELS, allGenres } from '../store.js';
import { cover, esc, formatRating, icon, plural, progressOf, ratingLabel, starIcon } from '../ui.js';
import { bookTabBar, bookTabScreen, storedBook } from './book-tabs.js';

function segmented(options, current, action, label) {
  const buttons = options.map(([value, text]) => `
    <button type="button" class="seg-btn${value === current ? ' is-on' : ''}" data-action="${action}" data-value="${esc(value)}" aria-pressed="${value === current}">${esc(text)}</button>`).join('');
  return `<div class="segmented" role="group" aria-label="${esc(label)}" style="--seg-count:${options.length}">${buttons}</div>`;
}

export function lookupResults(lookup) {
  if (lookup.loading) return '<p class="muted small lookup-status">Buscando…</p>';
  // Sem resultado ou sem conexão, a mensagem é a mesma: o que importa é seguir pelo
  // cadastro manual logo abaixo. Se a busca era um ISBN, ele já fica guardado no livro.
  if (lookup.query.trim().length >= 2 && lookup.searched && (lookup.failed || !lookup.results.length)) {
    const isbnNote = lookup.isbn ? `<br>O ISBN ${esc(lookup.isbn)} fica guardado no livro.` : '';
    return `<p class="muted small lookup-status">Não encontrei — preencha os dados abaixo.${isbnNote}</p>`;
  }
  return lookup.results.map((r, i) => `
    <button type="button" class="result" data-action="pick-result" data-index="${i}">
      ${cover(r, { size: 'xs', showText: false })}
      <span class="result-text">
        <span class="result-title">${esc(r.title)}</span>
        <span class="muted small">${esc([r.authors, r.pages ? `${r.pages} págs.` : '', r.year].filter(Boolean).join(' · '))}</span>
      </span>
    </button>`).join('');
}

function lookupBlock(ui) {
  return `
    <section class="field-group">
      <label class="label" for="lookup">Buscar livro</label>
      <div class="search-box">
        ${icon('search', { size: 20, stroke: 2, cls: 'muted' })}
        <input id="lookup" type="search" inputmode="search" autocomplete="off" enterkeyhint="search"
          placeholder="Título, autor ou ISBN" value="${esc(ui.lookup.query)}" data-lookup>
      </div>
      <div id="lookup-results" class="results" aria-live="polite">${lookupResults(ui.lookup)}</div>
    </section>`;
}

export function readingSummary(d) {
  if (d.status === STATUS.READING) {
    const p = progressOf(d);
    return p?.pct !== null && p ? `<p class="muted small">Você está em <strong class="accent">${p.pct}%</strong> do livro</p>` : '';
  }
  if (d.status === STATUS.DROPPED) {
    return isIsoDate(d.endDate) ? `<p class="muted small">Fica registrado em ${yearOf(d.endDate)}, sem contar para a meta</p>` : '';
  }
  if (d.status !== STATUS.READ || !isIsoDate(d.endDate)) return '';
  const year = yearOf(d.endDate);
  if (isIsoDate(d.startDate) && d.startDate <= d.endDate) {
    return `<p class="muted small">Lido em <strong class="accent">${plural(daysInclusive(d.startDate, d.endDate), 'dia', 'dias')}</strong> · entra no registro de ${year}</p>`;
  }
  return `<p class="muted small">Entra no registro de ${year}</p>`;
}

export function formView({ state, ui, isEdit, today }) {
  // Livro já salvo tem as abas Diário e Trechos (views/book-tabs.js).
  if (isEdit && ui.bookTab && ui.bookTab !== 'dados') return bookTabScreen({ state, ui, today });
  const d = ui.draft;
  const genres = allGenres(state);
  if (d.genre && !genres.includes(d.genre)) genres.push(d.genre);
  const genreChips = genres.map((g) => `
    <button type="button" class="chip-btn${g === d.genre ? ' is-on' : ''}" data-action="set-genre" data-value="${esc(g)}" aria-pressed="${g === d.genre}">${esc(g)}</button>`).join('');
  const newGenre = ui.newGenreOpen
    ? `<span class="new-genre"><label class="sr-only" for="new-genre">Novo gênero</label><input id="new-genre" type="text" maxlength="60" placeholder="Novo gênero" data-new-genre><button type="button" class="chip-btn is-on" data-action="add-genre">OK</button></span>`
    : '<button type="button" class="chip-btn chip-dashed" data-action="open-genre">+ Novo</button>';

  // Duas áreas por estrela: metade esquerda = n - 0,5; direita = n. Tocar na nota atual apaga.
  const hit = (value, side) => `<button type="button" class="star-hit ${side}" data-action="set-rating" data-value="${value}" aria-label="${ratingLabel(value)}" aria-pressed="${d.rating === value}"></button>`;
  const starButtons = [1, 2, 3, 4, 5].map((n) => `
    <span class="star-slot">${starIcon(n, d.rating, { size: 26 })}${hit(n - 0.5, 'left')}${hit(n, 'right')}</span>`).join('');

  const errors = ui.formErrors?.length
    ? `<div class="form-errors" role="alert">${ui.formErrors.map((e) => `<p>${esc(e)}</p>`).join('')}</div>`
    : '';

  const showLookup = !isEdit && !ui.picked;
  const pickedCard = !isEdit && ui.picked
    ? `<div class="picked">${cover(d, { size: 'sm' })}<span class="picked-text"><span class="serif-title">${esc(d.title)}</span><span class="muted small">${esc(d.authors)}</span></span><button type="button" class="btn-text" data-action="unpick">Trocar</button></div>`
    : '';

  return `
    <header class="form-top">
      <a class="btn-text muted" href="${esc(ui.backHref)}">Cancelar</a>
      <h1 class="form-title">${isEdit ? 'Editar livro' : 'Adicionar livro'}</h1>
      <button type="submit" form="book-form" class="btn-text accent strong">Salvar</button>
    </header>
    ${isEdit ? bookTabBar(storedBook(state, ui), 'dados') : ''}
    <form id="book-form" class="form" data-submit="save-book" novalidate>
      ${showLookup ? lookupBlock(ui) : ''}
      ${pickedCard}

      <section class="field-group">
        <span class="label">${showLookup ? 'Ou preencha os dados' : 'Dados do livro'}</span>
        <div class="field"><label for="f-title">Título</label><input id="f-title" type="text" maxlength="300" value="${esc(d.title)}" data-field="title" required></div>
        <div class="field"><label for="f-authors">Autor(es)</label><input id="f-authors" type="text" maxlength="300" value="${esc(d.authors)}" data-field="authors" placeholder="Separe vários com vírgula"></div>
        <div class="field"><label for="f-pages">Páginas</label><input id="f-pages" type="number" inputmode="numeric" min="1" max="20000" value="${esc(d.pages ?? '')}" data-field="pages"></div>
        <div class="cover-edit">
          ${d.cover
    ? `<button type="button" class="cover-zoom" data-action="zoom-cover" aria-label="Ver capa ampliada">${cover(d, { size: 'sm' })}<span class="cover-zoom-hint" aria-hidden="true">${icon('search', { size: 12, stroke: 2.4 })}</span></button>`
    : cover(d, { size: 'sm' })}
          <span class="cover-edit-actions">
            <label class="btn-outline sm file-btn">${d.cover ? 'Trocar capa' : 'Adicionar foto da capa'}<input type="file" accept="image/*" class="sr-only" data-cover-photo></label>
            ${d.cover ? '<button type="button" class="btn-text small" data-action="remove-cover">Remover capa</button>' : '<span class="muted small">Tire uma foto ou escolha da galeria</span>'}
          </span>
        </div>
      </section>

      <section class="field-group">
        <span class="label">Status</span>
        ${segmented(Object.entries(STATUS_LABELS), d.status, 'set-status', 'Status')}
      </section>

      ${d.status !== STATUS.WANT ? `
      <section class="field-group">
        <span class="label">Período de leitura</span>
        <div class="two-cols">
          <div class="field"><label for="f-start">Início</label><input id="f-start" type="date" value="${esc(d.startDate || '')}" data-field="startDate"></div>
          ${d.status === STATUS.READ || d.status === STATUS.DROPPED ? `<div class="field"><label for="f-end">${d.status === STATUS.READ ? 'Término' : 'Parei em'}</label><input id="f-end" type="date" value="${esc(d.endDate || '')}" data-field="endDate"></div>` : ''}
        </div>
        ${d.status === STATUS.READING || d.status === STATUS.DROPPED ? `
        ${d.format === FORMATS.KINDLE
    ? `<div class="field"><label for="f-current">${d.status === STATUS.READING ? 'Progresso no Kindle (%)' : 'Parei em (%)'}</label><input id="f-current" type="number" inputmode="numeric" min="0" max="100" value="${esc(d.currentPercent ?? '')}" data-field="currentPercent"></div>`
    : `<div class="field"><label for="f-current">${d.status === STATUS.READING ? 'Página atual' : 'Parei na página'}${d.pages ? ` (de ${d.pages})` : ''}</label><input id="f-current" type="number" inputmode="numeric" min="0" max="${d.pages || 20000}" value="${esc(d.currentPage ?? '')}" data-field="currentPage"></div>`}` : ''}
        <div id="reading-summary" aria-live="polite">${readingSummary(d)}</div>
      </section>` : ''}

      <section class="field-group">
        <span class="label">Formato</span>
        ${segmented(Object.entries(FORMAT_LABELS), d.format, 'set-format', 'Formato')}
      </section>

      <section class="field-group">
        <span class="label">Gênero</span>
        <div class="chips-wrap">${genreChips}${newGenre}</div>
      </section>

      ${d.status === STATUS.READ ? `
      <section class="field-group">
        <span class="label">Sua nota</span>
        <div class="star-row" role="group" aria-label="Nota">${starButtons}<span class="star-value" aria-hidden="true">${d.rating ? formatRating(d.rating) : ''}</span></div>
      </section>

      <button type="button" class="card toggle-row" data-action="toggle-fav" aria-pressed="${d.favorite}">
        ${icon('heart', { size: 22, cls: 'accent', fill: d.favorite ? 'currentColor' : 'none' })}
        <span class="toggle-text"><span class="strong">Favorito do ano</span><span class="muted small">Aparece em destaque no resumo${isIsoDate(d.endDate) ? ` de ${yearOf(d.endDate)}` : ''}</span></span>
        <span class="switch${d.favorite ? ' is-on' : ''}"><span class="switch-knob"></span></span>
      </button>` : ''}

      ${d.status === STATUS.DROPPED ? `
      <section class="field-group">
        <label class="label" for="f-drop">Por que abandonei</label>
        <textarea id="f-drop" rows="3" maxlength="10000" placeholder="Não prendeu, não era o momento, conteúdo fraco…" data-field="dropReason">${esc(d.dropReason || '')}</textarea>
      </section>` : ''}

      <section class="field-group">
        <label class="label" for="f-notes">${d.status === STATUS.DROPPED ? 'Observações' : 'Anotações'}</label>
        <textarea id="f-notes" rows="5" maxlength="10000" placeholder="Ideias, citações, o que ficou do livro…" data-field="notes">${esc(d.notes)}</textarea>
      </section>

      ${errors}
      <button type="submit" class="btn-primary">Salvar livro</button>
      ${isEdit && ui.original?.status === STATUS.READ ? `<button type="button" class="btn-ghost" data-action="reread">Ler de novo</button>` : ''}
      ${isEdit ? `<button type="button" class="btn-danger" data-action="delete-book">${icon('trash', { size: 18 })}Excluir livro</button>` : ''}
    </form>`;
}
