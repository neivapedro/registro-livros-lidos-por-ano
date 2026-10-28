import { yearOf } from '../dates.js';
import { groupBySeries } from '../series.js';
import { FORMAT_LABELS, MAX_UP_NEXT, STATUS } from '../store.js';
import { booksReadInYear, countByStatus, readBooks } from '../stats.js';
import { GLYPHS, bookItem, chip, cover, coverItem, emptyState, esc, hasQuickMenu, itemGroup, plural } from '../ui.js';
import { authorInitials, spineLook } from '../spines.js';
import { drawCandidates, wantQueue } from '../upnext.js';
import { compactBar } from '../large-title.js';

const TABS = [[STATUS.WANT, 'Quero ler'], [STATUS.READING, 'Lendo'], [STATUS.READ, 'Lidos'], [STATUS.DROPPED, 'Abandonei']];

const DICE = '<svg class="icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round" aria-hidden="true"><rect x="4" y="4" width="16" height="16" rx="4"/><circle cx="9" cy="9" r="1.2" fill="currentColor"/><circle cx="15" cy="15" r="1.2" fill="currentColor"/><circle cx="15" cy="9" r="1.2" fill="currentColor"/><circle cx="9" cy="15" r="1.2" fill="currentColor"/></svg>';

/** Botão "Mais ações" (abre o menu rápido): o caminho de teclado e leitor de tela para o que o gesto faz. */
function moreButton(b) {
  return `<button type="button" class="li-btn li-more" data-action="quick-menu" data-id="${esc(b.id)}" aria-label="Mais ações: ${esc(b.title)}">${GLYPHS.more}</button>`;
}

/** Botões que aparecem ao deslizar a linha para a esquerda (só toque; fora da ordem do Tab). */
function swipeButtons(b, isNext) {
  return `<button type="button" class="swipe-btn swipe-start" data-action="start-reading" data-id="${esc(b.id)}" tabindex="-1">${GLYPHS.play}<span>Começar</span></button>`
    + `<button type="button" class="swipe-btn swipe-next" data-action="toggle-next" data-id="${esc(b.id)}" tabindex="-1">${GLYPHS.queue}<span>${isNext ? 'Tirar' : 'Próxima'}</span></button>`;
}

/** Próximas: posição sobre a capa, subir/descer e "Mais ações". */
function nextTools(b, index, count) {
  return `
    <div class="li-tools">
      <button type="button" class="li-btn" data-action="move-next" data-delta="-1" data-id="${esc(b.id)}" aria-label="Subir ${esc(b.title)} na lista"${index === 0 ? ' disabled' : ''}>${GLYPHS.up}</button>
      <button type="button" class="li-btn" data-action="move-next" data-delta="1" data-id="${esc(b.id)}" aria-label="Descer ${esc(b.title)} na lista"${index === count - 1 ? ' disabled' : ''}>${GLYPHS.down}</button>
      ${moreButton(b)}
    </div>`;
}

const posBadge = (i) => `<span class="next-pos">${i + 1}º</span>`;

/** Modos da Estante: Lista, Capas e Lombadas (a escolha fica na sessão, em main.js). */
export const SHELF_MODES = ['lista', 'capas', 'lombadas'];

const SPINES_GLYPH = '<svg class="icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linejoin="round" aria-hidden="true"><rect x="3.5" y="6" width="4" height="13" rx=".8"/><rect x="9.5" y="3.5" width="4.5" height="15.5" rx=".8"/><path d="M15.6 7.4l3.3-.9 2.6 11.8-3.3.8z"/><path d="M2.5 21h19"/></svg>';

function modeToggle(mode) {
  // O rótulo dos botões apagados some em telas estreitas (fica o ícone; o nome vai no aria-label).
  const btn = (value, label, glyph) => `<button type="button" class="mini-seg-btn${mode === value ? ' is-on' : ''}" data-action="shelf-mode" data-value="${value}" aria-pressed="${mode === value}" aria-label="${label}">${glyph}<span class="mini-seg-label">${label}</span></button>`;
  return `<div class="mini-seg shelf-modes" role="group" aria-label="Mostrar como">${btn('lista', 'Lista', GLYPHS.list)}${btn('capas', 'Capas', GLYPHS.grid)}${btn('lombadas', 'Lombadas', SPINES_GLYPH)}</div>`;
}

function toolsRow(mode, extra = '') {
  return `<div class="shelf-tools">${modeToggle(mode)}${extra}</div>`;
}

const coverGrid = (items) => `<ul class="cover-grid" role="list">${items}</ul>`;

/**
 * Um livro de pé na prateleira: lombada com o título na vertical (de cima para baixo, como nas
 * lombadas brasileiras) e as iniciais do autor ao pé. Mesmo link, data-id e toque longo da lista.
 */
export function spineItem(b, { badge = '' } = {}) {
  const look = spineLook(b);
  const author = (b.authors || '').split(',')[0].trim();
  const label = `${b.title}${author ? `, ${author}` : ''}`;
  const ini = authorInitials(b.authors);
  return `
    <li class="sp-item" style="--sp-w:${look.w}px;--sp-h:${look.h}px">
      <a class="spine sp-d${look.deco}${look.lines > 1 ? ' sp-2l' : ''}${b.favorite ? ' is-fav' : ''}" href="#/livro/${encodeURIComponent(b.id)}"${hasQuickMenu(b) ? ' data-longpress' : ''} data-id="${esc(b.id)}"${b.cover ? ` data-spine="${esc(b.cover)}"` : ''} style="--sp-bg:${look.bg};--sp-fg:${look.fg};--sp-fs:${look.fs}px" aria-label="${esc(label)}">
        <span class="sp-title" aria-hidden="true">${esc(b.title)}</span>${ini ? `<span class="sp-foot" aria-hidden="true">${esc(ini)}</span>` : ''}
      </a>${badge}
    </li>`;
}

/** Prateleiras de lombadas (quebram em várias fileiras, cada uma sobre a sua tábua). */
const spineShelf = (items) => `<ul class="spine-shelf" role="list">${items}</ul>`;

/** Lombadas ou capas, conforme o modo (os dois modos visuais usam os mesmos grupos). */
function visualList(mode, books, opts = () => ({})) {
  if (mode === 'lombadas') return spineShelf(books.map((b, i) => spineItem(b, opts(b, i))).join(''));
  return coverGrid(books.map((b, i) => coverItem(b, opts(b, i))).join(''));
}

function drawSelect(name, label, options, value) {
  const opts = options.map(([v, t]) => `<option value="${esc(v)}"${String(v) === String(value) ? ' selected' : ''}>${esc(t)}</option>`).join('');
  return `<label class="filter"><span class="sr-only">${esc(label)}</span><select data-draw="${name}">${opts}</select><svg class="icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 9l6 6 6-6"/></svg></label>`;
}

/** Painel do sorteio: filtros opcionais e o livro sorteado. */
function drawPanel(books, draw) {
  const want = books.filter((b) => b.status === STATUS.WANT);
  const genres = [...new Set(want.map((b) => b.genre).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'pt-BR'));
  const picked = want.find((b) => b.id === draw.id);
  const pool = drawCandidates(books, draw).length;
  let result;
  if (picked) {
    result = `
      <div class="draw-result" aria-live="polite">
        ${cover(picked, { size: 'md' })}
        <span class="reading-text">
          <span class="eyebrow accent">Sorteado</span>
          <span class="serif-title">${esc(picked.title)}</span>
          <span class="muted small">${esc(picked.authors || 'Autor não informado')}</span>
          <span class="chips">${chip(FORMAT_LABELS[picked.format])}${picked.genre ? chip(picked.genre) : ''}</span>
        </span>
      </div>
      <div class="two-cols">
        <button type="button" class="btn-primary sm" data-action="draw-start" data-id="${esc(picked.id)}">Começar a ler</button>
        <button type="button" class="btn-ghost" data-action="draw-again"${pool > 1 ? '' : ' disabled'}>Sortear de novo</button>
      </div>`;
  } else {
    result = pool
      ? '<button type="button" class="btn-primary sm" data-action="draw-again">Sortear</button>'
      : '<p class="muted small" aria-live="polite">Nenhum livro da fila com esses filtros.</p>';
  }
  return `
    <section class="card draw-panel" aria-label="Sortear um livro da fila">
      <div class="section-head"><h2>Sortear da fila</h2><button type="button" class="btn-text small" data-action="draw-close">Fechar</button></div>
      <div class="filters filters-2">
        ${drawSelect('genre', 'Gênero', [['', 'Gênero'], ...genres.map((g) => [g, g])], draw.genre)}
        ${drawSelect('format', 'Formato', [['', 'Formato'], ...Object.entries(FORMAT_LABELS)], draw.format)}
      </div>
      ${result}
    </section>`;
}

function wantList(state, ui, mode) {
  const { next, rest } = wantQueue(state);
  if (!next.length && !rest.length) {
    return emptyState('A fila está vazia', 'Adicione os livros que você quer ler a seguir.',
      '<a class="btn-outline" href="#/novo?status=quero">Adicionar à fila</a>');
  }
  const draw = ui?.draw;
  const drawBtn = `<button type="button" class="chip-btn sm draw-open" data-action="draw-open" aria-expanded="false">${DICE}Sortear</button>`;
  const top = toolsRow(mode, draw ? '' : drawBtn) + (draw ? drawPanel(state.books, draw) : '');
  const add = '<a class="btn-ghost add-queue" href="#/novo?status=quero">+ Adicionar à fila</a>';
  if (mode !== 'lista') {
    const nextCount = next.length;
    return top + visualList(mode, [...next, ...rest], (b, i) => (i < nextCount ? { badge: posBadge(i) } : {})) + add;
  }
  const nextHead = `<h2 class="list-head group-head">Próximas <span class="muted small">${next.length} de ${MAX_UP_NEXT}</span></h2>`;
  const nextRows = next.map((b, i) => bookItem(b, { badge: posBadge(i), tools: nextTools(b, i, next.length), swipe: swipeButtons(b, true) })).join('');
  const restRows = rest.map((b) => bookItem(b, { tools: moreButton(b), swipe: swipeButtons(b, false) })).join('');
  const restHead = next.length ? '<h2 class="list-head group-head">Restante da fila</h2>' : '';
  return top
    + (next.length ? `<section class="group-section">${nextHead}<ul class="group" role="list">${nextRows}</ul></section>` : '')
    + (rest.length ? `<section class="group-section">${restHead}<ul class="group" role="list">${restRows}</ul></section>` : '')
    + '<p class="shelf-hint muted small">Deslize uma linha para a esquerda para começar ou marcar como próxima. Toque e segure para mais opções.</p>'
    + add;
}

function readingList(books, mode) {
  const reading = books.filter((b) => b.status === STATUS.READING);
  if (!reading.length) {
    return emptyState('Nenhuma leitura em andamento', 'Na aba "Quero ler", toque em "Começar" para iniciar um livro.');
  }
  if (mode !== 'lista') return toolsRow(mode) + visualList(mode, reading);
  return toolsRow(mode) + itemGroup('', '', reading.map((b) => bookItem(b, { tools: moreButton(b) })).join(''));
}

/** Lidos agrupados por série (os de fora de série no fim, do mais recente ao mais antigo). */
function readBySeries(books, mode) {
  const read = readBooks(books).sort((a, b) => b.endDate.localeCompare(a.endDate));
  return groupBySeries(read).map((g) => {
    const title = g.name ? esc(g.name) : 'Fora de séries';
    const count = plural(g.books.length, 'livro', 'livros');
    if (mode !== 'lista') return `<section class="group-section"><h2 class="year-head group-head">${title} <span class="muted small">${count}</span></h2>${visualList(mode, g.books)}</section>`;
    return itemGroup(title, count, g.books.map((b) => bookItem(b)).join(''));
  }).join('');
}

function readList(books, groupSeries, mode) {
  const read = readBooks(books);
  if (!read.length) return emptyState('Nenhum livro concluído', 'Os livros que você terminar aparecem aqui, separados por ano.');
  const seriesBtn = read.some((b) => b.series)
    ? `<button type="button" class="chip-btn sm${groupSeries ? ' is-on' : ''}" data-action="toggle-group-series" aria-pressed="${groupSeries}">Agrupar por série</button>`
    : '';
  const top = toolsRow(mode, seriesBtn);
  if (seriesBtn && groupSeries) return top + readBySeries(books, mode);
  const years = [...new Set(read.map((b) => yearOf(b.endDate)))].sort((a, b) => b - a);
  return top + years.map((y) => {
    const list = booksReadInYear(books, y);
    const count = plural(list.length, 'livro', 'livros');
    if (mode !== 'lista') return `<section class="group-section"><h2 class="year-head group-head">${y} <span class="muted small">${count}</span></h2>${visualList(mode, list)}</section>`;
    return itemGroup(String(y), count, list.map((b) => bookItem(b)).join(''));
  }).join('');
}

function droppedList(books, mode) {
  const dropped = books.filter((b) => b.status === STATUS.DROPPED)
    .sort((a, b) => (b.endDate || b.updatedAt).localeCompare(a.endDate || a.updatedAt));
  if (!dropped.length) {
    return emptyState('Nenhum livro abandonado', 'Quando largar um livro, marque o status "Abandonei" e conte o porquê.');
  }
  if (mode !== 'lista') return toolsRow(mode) + visualList(mode, dropped);
  const rows = dropped.map((b) => bookItem(b, {
    extra: b.dropReason ? `<span class="li-extra drop-reason"><span class="eyebrow">Por que parei</span> ${esc(b.dropReason)}</span>` : '',
  })).join('');
  return toolsRow(mode) + itemGroup('', '', rows);
}

export function shelfView({ state, ui, tab }) {
  const counts = countByStatus(state.books);
  const mode = SHELF_MODES.includes(ui?.shelfMode) ? ui.shelfMode : 'lista';
  const tabs = TABS.map(([value, label]) => `
    <a class="seg-btn${value === tab ? ' is-on' : ''}" href="#/estante?aba=${value}" aria-current="${value === tab ? 'page' : 'false'}">${label} <span class="seg-count">${counts[value]}</span></a>`).join('');
  let body;
  if (tab === STATUS.WANT) body = wantList(state, ui, mode);
  else if (tab === STATUS.READING) body = readingList(state.books, mode);
  else if (tab === STATUS.DROPPED) body = droppedList(state.books, mode);
  else body = readList(state.books, ui?.groupSeries, mode);
  return `
    <header class="top"><h1 class="display sm" data-large-title>Estante</h1></header>
    ${compactBar({ title: 'Estante' })}
    <nav class="segmented tabs-4 shelf-tabs" style="--seg-count:4" aria-label="Listas">${tabs}</nav>
    <div class="list shelf-list" data-mode="${mode}">${body}</div>`;
}
