import { daysInclusive, formatShort, isIsoDate, yearOf } from '../dates.js';
import { formatSeriesNumber, seriesInfo, seriesNames } from '../series.js';
import { FORMAT_LABELS, FORMATS, STATUS, STATUS_LABELS, allGenres, allTags, validateBook } from '../store.js';
import { hasTag } from '../tags.js';
import { AI_MONTHLY_LIMIT, aiLimitReached } from '../prefs.js';
import { cover, esc, formatRating, icon, plural, progressOf, ratingLabel, starIcon } from '../ui.js';
import { bookTabBar, bookTabScreen, storedBook } from './book-tabs.js';

function segmented(options, current, action, label, cls = '') {
  const buttons = options.map(([value, text]) => `
    <button type="button" class="seg-btn${value === current ? ' is-on' : ''}" data-action="${action}" data-value="${esc(value)}" aria-pressed="${value === current}">${esc(text)}</button>`).join('');
  return `<div class="segmented${cls ? ` ${cls}` : ''}" role="group" aria-label="${esc(label)}" style="--seg-count:${options.length}">${buttons}</div>`;
}

// ---------- Busca com IA (Gemini), abaixo dos resultados comuns ----------
// Só aparece depois de uma busca comum, e só roda quando a pessoa toca no botão.
// Todo texto vindo da IA passa por esc(): é dado não confiável.

function aiCard(r, i) {
  const meta = [r.authors, r.pages ? `${r.pages} págs.` : '', r.year].filter(Boolean).join(' · ');
  const from = r.sources?.length ? `fonte: ${r.sources.join(', ')}` : 'sem fonte informada';
  return `
    <button type="button" class="result ai-result" data-action="pick-ai-result" data-index="${i}">
      ${cover(r, { size: 'xs', showText: false })}
      <span class="result-text">
        <span class="result-title">${esc(r.title)}</span>
        <span class="muted small">${esc(meta)}</span>
        ${r.publisher ? `<span class="muted small">${esc(r.publisher)}</span>` : ''}
        <span class="ai-source small">${esc(from)}</span>
        ${r.checkedBy ? `<span class="muted small">${icon('check', { size: 12, stroke: 2.4 })} Dados conferidos: ${esc(r.checkedBy)}</span>` : ''}
      </span>
    </button>`;
}

export function aiLookupBlock(lookup, aiEnabled, { limitReached = false } = {}) {
  if (!lookup.searched || lookup.loading || lookup.query.trim().length < 2) return '';
  if (!aiEnabled) return '<p class="faint small ai-hint">Ative a busca com IA em Ajustes</p>';
  const ai = lookup.ai || {};
  // Limite de segurança do mês (prefs.js): o botão fica desligado, com o motivo.
  const button = (label) => (limitReached
    ? `<button type="button" class="btn-outline ai-btn" disabled aria-describedby="ai-limit">${icon('sparkle', { size: 18, stroke: 1.8 })}${label}</button>
      <p class="muted small ai-limit" id="ai-limit">Limite de segurança do mês atingido (${AI_MONTHLY_LIMIT} buscas). Volta no dia 1º.</p>`
    : `<button type="button" class="btn-outline ai-btn" data-action="ai-search">${icon('sparkle', { size: 18, stroke: 1.8 })}${label}</button>`);
  if (ai.status === 'loading') {
    return `
    <div class="ai-box" aria-busy="true">
      <p class="small ai-status">${icon('sparkle', { size: 16, stroke: 1.8, cls: 'accent' })}Buscando com IA na Busca Google…</p>
      <span class="ai-progress" style="--ai-ms:${Number(ai.timeoutMs) || 25000}ms" aria-hidden="true"><span></span></span>
      <button type="button" class="btn-text small ai-cancel" data-action="ai-cancel">Cancelar</button>
    </div>`;
  }
  if (ai.status === 'error') {
    return `
    <div class="ai-box">
      <p class="small ai-error">${esc(ai.message)}</p>
      ${ai.retry ? button('Tentar de novo com IA') : ''}
    </div>`;
  }
  if (ai.status === 'done' && !ai.results.length) {
    return `
    <div class="ai-box">
      <p class="small ai-status">A IA não encontrou esse livro.</p>
      <p class="muted small">Confira a grafia ou tente pelo ISBN, ou preencha os dados abaixo.</p>
    </div>`;
  }
  if (ai.status === 'done') {
    return `
    <div class="ai-box">
      <p class="small ai-label">${icon('sparkle', { size: 16, stroke: 1.8, cls: 'accent' })}Encontrado pela IA · confira os dados</p>
      <div class="results">${ai.results.map(aiCard).join('')}</div>
    </div>`;
  }
  return `<div class="ai-box">${button('Buscar com IA')}</div>`;
}

export function lookupResults(lookup, { aiEnabled = false, aiLimit = false } = {}) {
  if (lookup.loading) return '<p class="muted small lookup-status">Buscando…</p>';
  // Sem resultado ou sem conexão, a mensagem é a mesma: o que importa é seguir pelo
  // cadastro manual logo abaixo. Se a busca era um ISBN, ele já fica guardado no livro.
  // Busca por texto: lembra que o ISBN acha quase todo livro brasileiro (cadastro nacional).
  const isbnTip = lookup.searched && !lookup.isbn
    ? '<p class="muted small lookup-tip">Não achou? Digite o ISBN: os 13 números perto do código de barras, no verso do livro.</p>'
    : '';
  const ai = aiLookupBlock(lookup, aiEnabled, { limitReached: aiLimit });
  if (lookup.query.trim().length >= 2 && lookup.searched && (lookup.failed || !lookup.results.length)) {
    const isbnNote = lookup.isbn ? `<br>O ISBN ${esc(lookup.isbn)} fica guardado no livro.` : '';
    return `<p class="muted small lookup-status">Não encontrei — preencha os dados abaixo.${isbnNote}</p>${isbnTip}${ai}`;
  }
  return lookup.results.map((r, i) => `
    <button type="button" class="result" data-action="pick-result" data-index="${i}">
      ${cover(r, { size: 'xs', showText: false })}
      <span class="result-text">
        <span class="result-title">${esc(r.title)}</span>
        <span class="muted small">${esc([r.authors, r.pages ? `${r.pages} págs.` : '', r.year].filter(Boolean).join(' · '))}</span>
      </span>
    </button>`).join('') + isbnTip + ai;
}

/** Opções da busca com IA para lookupResults (com chave? já no limite do mês?). */
export function aiLookupOptions(ui, today) {
  return { aiEnabled: Boolean(ui.geminiKey), aiLimit: aiLimitReached(ui.aiUsage, today) };
}

function lookupBlock(ui, today) {
  return `
    <section class="field-group">
      <label class="label" for="lookup">Buscar livro</label>
      <div class="search-box">
        ${icon('search', { size: 20, stroke: 2, cls: 'muted' })}
        <input id="lookup" type="search" inputmode="search" autocomplete="off" enterkeyhint="search"
          placeholder="Título, autor ou ISBN" value="${esc(ui.lookup.query)}" data-lookup>
      </div>
      <div id="lookup-results" class="results" aria-live="polite">${lookupResults(ui.lookup, aiLookupOptions(ui, today))}</div>
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

// "Quero terminar até": opcional, só enquanto está lendo.
function targetDateField(d) {
  return `
        <div class="field target-field">
          <label for="f-target">Quero terminar até <span class="faint">(opcional)</span></label>
          <span class="target-row">
            <input id="f-target" type="date" value="${esc(d.targetDate || '')}" data-field="targetDate">
            ${d.targetDate ? '<button type="button" class="btn-text small" data-action="clear-target-date">Limpar</button>' : ''}
          </span>
        </div>`;
}

/** Série e número; no livro já salvo, o próximo volume e quantos foram lidos. */
function seriesFields(state, d, isEdit) {
  const names = seriesNames(state.books).map((n) => `<option value="${esc(n)}"></option>`).join('');
  let info = '';
  if (isEdit && d.series && String(d.series).trim()) {
    const s = seriesInfo(state.books, d);
    const lines = [];
    if (s.next) {
      lines.push(`Próximo da série: <a class="inline-link" href="#/livro/${encodeURIComponent(s.next.id)}">nº ${esc(formatSeriesNumber(s.next.seriesNumber))} — ${esc(s.next.title)}</a>`);
    }
    if (s.total > 1) lines.push(`Você leu ${s.read} de ${s.total} cadastrados nesta série`);
    info = lines.length ? `<div class="series-info">${lines.map((l) => `<p class="muted small">${l}</p>`).join('')}</div>` : '';
  }
  return `
      <section class="field-group">
        <span class="label">Série</span>
        <div class="series-cols">
          <div class="field"><label for="f-series">Nome da série</label><input id="f-series" type="text" maxlength="120" list="series-names" autocomplete="off" value="${esc(d.series || '')}" data-field="series" placeholder="Ex.: Duna"></div>
          <div class="field"><label for="f-series-n">Nº</label><input id="f-series-n" type="text" inputmode="decimal" maxlength="8" value="${esc(formatSeriesNumber(d.seriesNumber))}" data-field="seriesNumber" placeholder="1"></div>
        </div>
        <datalist id="series-names">${names}</datalist>
        ${info}
      </section>`;
}

/** Etiquetas livres: as do livro (com ×), campo para criar e as já usadas em outros livros. */
function tagsField(state, ui, d) {
  const tags = d.tags || [];
  const current = tags.map((t) => `
    <span class="tag-chip">${esc(t)}<button type="button" class="tag-x" data-action="remove-tag" data-value="${esc(t)}" aria-label="Remover etiqueta ${esc(t)}">${icon('close', { size: 14, stroke: 2.2 })}</button></span>`).join('');
  const used = allTags(state).filter((t) => !hasTag(tags, t)).slice(0, 16);
  const usedChips = used.map((t) => `<button type="button" class="chip-btn sm" data-action="add-tag" data-value="${esc(t)}">+ ${esc(t)}</button>`).join('');
  return `
      <section class="field-group">
        <label class="label" for="f-tag">Etiquetas</label>
        ${tags.length ? `<div class="chips-wrap">${current}</div>` : ''}
        <div class="tag-input">
          <input id="f-tag" type="text" maxlength="40" autocomplete="off" autocapitalize="none" enterkeyhint="done" placeholder="Nova etiqueta" value="${esc(ui.tagInput || '')}" data-tag-input>
          <button type="button" class="chip-btn" data-action="add-tag-input">Adicionar</button>
        </div>
        ${used.length ? `<span class="muted small">Usadas antes</span><div class="chips-wrap">${usedChips}</div>` : '<span class="muted small">Toque em Adicionar, Enter ou vírgula para incluir.</span>'}
      </section>`;
}

// ---------- "Mais detalhes" (v1.4) ----------
// O formulário mostra primeiro o essencial; gênero, série, etiquetas, data alvo,
// favorito e anotações ficam numa seção recolhível. Ela abre sozinha quando algum
// desses campos já tem valor (nada fica escondido sem aviso) ou quando um erro
// de validação está lá dentro. A escolha de abrir/fechar vale enquanto o mesmo
// rascunho estiver aberto (ui.moreDetails guarda o rascunho a que se refere).

const filled = (v) => v !== null && v !== undefined && String(v).trim() !== '';

/** Algum campo de "Mais detalhes" (dos que aparecem neste status) está preenchido? */
export function detailsFilled(d) {
  return filled(d.genre) || filled(d.series) || filled(d.seriesNumber) || (d.tags || []).length > 0
    || filled(d.notes)
    || (d.status === STATUS.READING && filled(d.targetDate))
    || (d.status === STATUS.READ && d.favorite === true);
}

/** Algum erro de validação vem de um campo de "Mais detalhes"? */
export function detailsHaveErrors(d, today) {
  const without = { ...d, seriesNumber: null, targetDate: null, tags: [] };
  return validateBook(d, today).length > validateBook(without, today).length;
}

/**
 * Aberta ou fechada: a escolha feita neste rascunho; sem escolha, aberta se houver algo preenchido.
 * Depois de aberta sozinha, fica aberta (limpar o último campo não a recolhe debaixo do dedo).
 */
export function detailsOpen(ui) {
  const m = ui.moreDetails;
  if (m && m.draft === ui.draft) return m.open;
  if (!detailsFilled(ui.draft)) return false;
  ui.moreDetails = { draft: ui.draft, open: true };
  return true;
}

/** Linha sob "Mais detalhes": o que está preenchido, ou o que dá para preencher. */
export function detailsSummary(d) {
  const parts = [];
  if (filled(d.genre)) parts.push(d.genre);
  if (filled(d.series)) parts.push(filled(d.seriesNumber) ? `${d.series} nº ${formatSeriesNumber(d.seriesNumber)}` : d.series);
  const tags = (d.tags || []).length;
  if (tags) parts.push(plural(tags, 'etiqueta', 'etiquetas'));
  if (d.status === STATUS.READING && isIsoDate(d.targetDate)) parts.push(`terminar até ${formatShort(d.targetDate)}`);
  if (d.status === STATUS.READ && d.favorite) parts.push('favorito');
  if (filled(d.notes)) parts.push(d.status === STATUS.DROPPED ? 'com observações' : 'com anotações');
  if (parts.length) return parts.map(esc).join(' · ');
  const hints = ['Gênero', 'série', 'etiquetas'];
  if (d.status === STATUS.READING) hints.push('data alvo');
  if (d.status === STATUS.READ) hints.push('favorito');
  hints.push(d.status === STATUS.DROPPED ? 'observações' : 'anotações');
  return esc(`${hints.slice(0, -1).join(', ')} e ${hints[hints.length - 1]}`);
}

/** Gênero: um seletor compacto (no iPhone, a roda nativa) com "Novo gênero…" no fim. */
function genreField(state, ui, d) {
  const genres = allGenres(state);
  if (d.genre && !genres.includes(d.genre)) genres.push(d.genre);
  const options = genres.map((g) => `<option value="${esc(g)}"${g === d.genre ? ' selected' : ''}>${esc(g)}</option>`).join('');
  const newGenre = ui.newGenreOpen ? `
        <div class="new-genre">
          <label class="sr-only" for="new-genre">Novo gênero</label>
          <input id="new-genre" type="text" maxlength="60" autocomplete="off" enterkeyhint="done" placeholder="Nome do novo gênero" data-new-genre>
          <button type="button" class="chip-btn is-on" data-action="add-genre">OK</button>
          <button type="button" class="btn-text small" data-action="close-genre">Cancelar</button>
        </div>` : '';
  return `
      <section class="field-group">
        <div class="field select-field">
          <label for="f-genre">Gênero</label>
          <select id="f-genre" data-genre-select>
            <option value=""${d.genre ? '' : ' selected'}>Sem gênero</option>
            ${options}
            <option value="" data-new-genre-option>+ Novo gênero…</option>
          </select>
          ${icon('chevronDown', { size: 18, stroke: 2, cls: 'select-chevron' })}
        </div>${newGenre}
      </section>`;
}

function favoriteToggle(d) {
  return `
      <button type="button" class="card toggle-row" data-action="toggle-fav" aria-pressed="${d.favorite}">
        ${icon('heart', { size: 22, cls: 'accent', fill: d.favorite ? 'currentColor' : 'none' })}
        <span class="toggle-text"><span class="strong">Favorito do ano</span><span class="muted small">Aparece em destaque no resumo${isIsoDate(d.endDate) ? ` de ${yearOf(d.endDate)}` : ''}</span></span>
        <span class="switch${d.favorite ? ' is-on' : ''}"><span class="switch-knob"></span></span>
      </button>`;
}

function moreDetails(state, ui, d, isEdit) {
  const open = detailsOpen(ui);
  return `
      <div class="more${open ? ' is-open' : ''}">
        <button type="button" class="more-toggle" data-action="toggle-more" aria-expanded="${open}" aria-controls="more-details">
          <span class="more-text"><span class="more-title">Mais detalhes</span><span class="more-summary">${detailsSummary(d)}</span></span>
          ${icon('chevronDown', { size: 20, stroke: 2, cls: 'more-chevron' })}
        </button>
        <div class="more-body" id="more-details" role="region" aria-label="Mais detalhes">
          <div class="more-inner">
            ${genreField(state, ui, d)}
            ${seriesFields(state, d, isEdit)}
            ${tagsField(state, ui, d)}
            ${d.status === STATUS.READING ? `<section class="field-group">${targetDateField(d)}</section>` : ''}
            ${d.status === STATUS.READ ? favoriteToggle(d) : ''}
            <section class="field-group">
              <label class="label" for="f-notes">${d.status === STATUS.DROPPED ? 'Observações' : 'Anotações'}</label>
              <textarea id="f-notes" rows="5" maxlength="10000" placeholder="Ideias, citações, o que ficou do livro…" data-field="notes">${esc(d.notes)}</textarea>
            </section>
          </div>
        </div>
      </div>`;
}

/** Datas e progresso que fazem sentido para o status (nada para "Quero ler"). */
function periodFields(d) {
  if (d.status === STATUS.WANT) return '';
  const tracksProgress = d.status === STATUS.READING || d.status === STATUS.DROPPED;
  const progress = !tracksProgress ? '' : d.format === FORMATS.KINDLE
    ? `<div class="field"><label for="f-current">${d.status === STATUS.READING ? 'Progresso no Kindle (%)' : 'Parei em (%)'}</label><input id="f-current" type="number" inputmode="numeric" min="0" max="100" value="${esc(d.currentPercent ?? '')}" data-field="currentPercent"></div>`
    : `<div class="field"><label for="f-current">${d.status === STATUS.READING ? 'Página atual' : 'Parei na página'}${d.pages ? ` (de ${d.pages})` : ''}</label><input id="f-current" type="number" inputmode="numeric" min="0" max="${d.pages || 20000}" value="${esc(d.currentPage ?? '')}" data-field="currentPage"></div>`;
  const finished = d.status === STATUS.READ || d.status === STATUS.DROPPED;
  return `
      <section class="field-group" id="f-period">
        <span class="label">Período de leitura</span>
        <div class="two-cols">
          <div class="field"><label for="f-start">Início</label><input id="f-start" type="date" value="${esc(d.startDate || '')}" data-field="startDate"></div>
          ${finished ? `<div class="field"><label for="f-end">${d.status === STATUS.READ ? 'Término' : 'Parei em'}</label><input id="f-end" type="date" value="${esc(d.endDate || '')}" data-field="endDate"></div>` : ''}
        </div>
        ${progress}
        <div id="reading-summary" aria-live="polite">${readingSummary(d)}</div>
      </section>`;
}

export function formView({ state, ui, isEdit, today }) {
  // Livro já salvo tem as abas Diário e Trechos (views/book-tabs.js).
  if (isEdit && ui.bookTab && ui.bookTab !== 'dados') return bookTabScreen({ state, ui, today });
  const d = ui.draft;

  // Duas áreas por estrela: metade esquerda = n - 0,5; direita = n. Tocar na nota atual apaga.
  const hit = (value, side) => `<button type="button" class="star-hit ${side}" data-action="set-rating" data-value="${value}" aria-label="${ratingLabel(value)}" aria-pressed="${d.rating === value}"></button>`;
  const starButtons = [1, 2, 3, 4, 5].map((n) => `
    <span class="star-slot">${starIcon(n, d.rating, { size: 26 })}${hit(n - 0.5, 'left')}${hit(n, 'right')}</span>`).join('');

  // Só os erros que continuam valendo: corrigido o campo, a mensagem some no próximo desenho.
  const current = ui.formErrors?.length ? validateBook(d, today) : [];
  const shownErrors = (ui.formErrors || []).filter((e) => current.includes(e));
  const errors = shownErrors.length
    ? `<div class="form-errors" role="alert">${shownErrors.map((e) => `<p>${esc(e)}</p>`).join('')}</div>`
    : '';

  const showLookup = !isEdit && !ui.picked;
  const pickedCard = !isEdit && ui.picked
    ? `<div class="picked">${cover(d, { size: 'sm' })}<span class="picked-text"><span class="serif-title">${esc(d.title)}</span><span class="muted small">${esc(d.authors)}</span></span><button type="button" class="btn-text" data-action="unpick">Trocar</button></div>`
    : '';
  const canReread = isEdit && ui.original?.status === STATUS.READ;

  return `
    <header class="form-top">
      <a class="btn-text muted" href="${esc(ui.backHref)}" data-leave>Cancelar</a>
      <h1 class="form-title">${!isEdit ? 'Adicionar livro' : ui.finishing ? 'Concluir leitura' : 'Editar livro'}</h1>
      <button type="submit" form="book-form" class="btn-text accent strong">Salvar</button>
    </header>
    ${isEdit ? bookTabBar(storedBook(state, ui), 'dados') : ''}
    <form id="book-form" class="form form-lean" data-submit="save-book" novalidate>
      ${showLookup ? lookupBlock(ui, today) : ''}
      ${pickedCard}

      <section class="field-group">
        <span class="label">${showLookup ? 'Ou preencha os dados' : 'Dados do livro'}</span>
        <div class="field-stack">
          <div class="field"><label for="f-title">Título</label><input id="f-title"${isEdit ? '' : ' enterkeyhint="next"'} type="text" maxlength="300" value="${esc(d.title)}" data-field="title" required></div>
          <div class="field"><label for="f-authors">Autor(es)</label><input id="f-authors"${isEdit ? '' : ' enterkeyhint="next"'} type="text" maxlength="300" value="${esc(d.authors)}" data-field="authors" placeholder="Separe vários com vírgula"></div>
          <div class="field"><label for="f-pages">Páginas</label><input id="f-pages"${isEdit ? '' : ' enterkeyhint="done"'} type="number" inputmode="numeric" min="1" max="20000" value="${esc(d.pages ?? '')}" data-field="pages"></div>
        </div>
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

      <section class="field-group" id="f-status">
        <span class="label">Status</span>
        ${segmented(Object.entries(STATUS_LABELS), d.status, 'set-status', 'Status')}
        <div class="format-row">
          <span class="format-label" aria-hidden="true">Formato</span>
          ${segmented(Object.entries(FORMAT_LABELS), d.format, 'set-format', 'Formato', 'seg-mini')}
        </div>
      </section>

      ${periodFields(d)}

      ${d.status === STATUS.READ ? `
      <section class="field-group">
        <span class="label">Sua nota</span>
        <div class="star-row" role="group" aria-label="Nota">${starButtons}<span class="star-value" aria-hidden="true">${d.rating ? formatRating(d.rating) : ''}</span></div>
      </section>` : ''}

      ${d.status === STATUS.DROPPED ? `
      <section class="field-group">
        <label class="label" for="f-drop">Por que abandonei</label>
        <textarea id="f-drop" rows="3" maxlength="10000" placeholder="Não prendeu, não era o momento, conteúdo fraco…" data-field="dropReason">${esc(d.dropReason || '')}</textarea>
      </section>` : ''}

      ${moreDetails(state, ui, d, isEdit)}

      ${errors}
      <div class="form-actions">
        <button type="submit" class="btn-primary">Salvar livro</button>
      </div>
      ${isEdit ? `
      <div class="form-quiet">
        ${canReread ? `
        <button type="button" class="quiet-btn" data-action="reread">
          <span class="quiet-text"><span class="strong-ish">Ler de novo</span><span class="muted small">Começa uma nova leitura; a anterior continua no registro.</span></span>
          ${icon('chevronRight', { size: 18, stroke: 2, cls: 'muted' })}
        </button>` : ''}
        <button type="button" class="quiet-btn danger" data-action="delete-book">${icon('trash', { size: 18 })}<span>Excluir livro</span></button>
      </div>` : ''}
    </form>`;
}

