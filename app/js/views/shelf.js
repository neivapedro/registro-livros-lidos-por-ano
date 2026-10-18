import { yearOf } from '../dates.js';
import { groupBySeries } from '../series.js';
import { FORMAT_LABELS, MAX_UP_NEXT, STATUS } from '../store.js';
import { booksReadInYear, countByStatus, readBooks } from '../stats.js';
import { bookRow, chip, cover, emptyState, esc, icon, plural } from '../ui.js';
import { drawCandidates, wantQueue } from '../upnext.js';

const TABS = [[STATUS.WANT, 'Quero ler'], [STATUS.READING, 'Lendo'], [STATUS.READ, 'Lidos'], [STATUS.DROPPED, 'Abandonei']];

const DICE = '<svg class="icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round" aria-hidden="true"><rect x="4" y="4" width="16" height="16" rx="4"/><circle cx="9" cy="9" r="1.2" fill="currentColor"/><circle cx="15" cy="15" r="1.2" fill="currentColor"/><circle cx="15" cy="9" r="1.2" fill="currentColor"/><circle cx="9" cy="15" r="1.2" fill="currentColor"/></svg>';

const startButton = (b) => `<button type="button" class="btn-outline sm" data-action="start-reading" data-id="${esc(b.id)}">Começar</button>`;

/** Próximas: posição, subir/descer e desmarcar. Resto da fila: marcar como próxima. */
function queueTools(b, index, count) {
  if (index < 0) {
    return `<div class="row-tools"><button type="button" class="chip-btn sm" data-action="toggle-next" data-id="${esc(b.id)}" aria-pressed="false" aria-label="Marcar ${esc(b.title)} como próxima leitura">+ Próxima</button></div>`;
  }
  return `
    <div class="row-tools">
      <span class="next-pos" aria-hidden="true">${index + 1}º</span>
      <button type="button" class="icon-btn sm" data-action="move-next" data-delta="-1" data-id="${esc(b.id)}" aria-label="Subir ${esc(b.title)} na lista"${index === 0 ? ' disabled' : ''}>${icon('chevronDown', { size: 18, stroke: 2, cls: 'flip' })}</button>
      <button type="button" class="icon-btn sm" data-action="move-next" data-delta="1" data-id="${esc(b.id)}" aria-label="Descer ${esc(b.title)} na lista"${index === count - 1 ? ' disabled' : ''}>${icon('chevronDown', { size: 18, stroke: 2 })}</button>
      <button type="button" class="chip-btn sm is-on" data-action="toggle-next" data-id="${esc(b.id)}" aria-pressed="true" aria-label="Tirar ${esc(b.title)} das próximas">${icon('check', { size: 14, stroke: 2.4 })}Próxima</button>
    </div>`;
}

function drawSelect(name, label, options, value) {
  const opts = options.map(([v, t]) => `<option value="${esc(v)}"${String(v) === String(value) ? ' selected' : ''}>${esc(t)}</option>`).join('');
  return `<label class="filter"><span class="sr-only">${esc(label)}</span><select data-draw="${name}">${opts}</select>${icon('chevronDown', { size: 14, stroke: 2 })}</label>`;
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

function wantList(state, ui) {
  const { next, rest } = wantQueue(state);
  if (!next.length && !rest.length) {
    return emptyState('A fila está vazia', 'Adicione os livros que você quer ler a seguir.',
      '<a class="btn-outline" href="#/novo?status=quero">Adicionar à fila</a>');
  }
  const draw = ui?.draw;
  const top = draw
    ? drawPanel(state.books, draw)
    : `<button type="button" class="btn-ghost draw-open" data-action="draw-open" aria-expanded="false">${DICE}Sortear um livro da fila</button>`;
  const nextRows = next.map((b, i) => bookRow(b, { action: startButton(b) + queueTools(b, i, next.length) })).join('');
  const restRows = rest.map((b) => bookRow(b, { action: startButton(b) + queueTools(b, -1, 0) })).join('');
  const nextHead = `<h2 class="list-head">Próximas <span class="muted small">${next.length} de ${MAX_UP_NEXT}</span></h2>`;
  return top
    + (next.length ? nextHead + nextRows : '')
    + (rest.length && next.length ? '<h2 class="list-head">Restante da fila</h2>' : '')
    + restRows
    + '<a class="btn-ghost" href="#/novo?status=quero">+ Adicionar à fila</a>';
}

function readingList(books) {
  const reading = books.filter((b) => b.status === STATUS.READING);
  if (!reading.length) {
    return emptyState('Nenhuma leitura em andamento', 'Na aba "Quero ler", toque em "Começar" para iniciar um livro.');
  }
  return reading.map((b) => bookRow(b, {
    action: `<a class="btn-outline sm" href="#/livro/${encodeURIComponent(b.id)}?concluir=1">Concluir</a>`,
  })).join('');
}

/** Lidos agrupados por série (os de fora de série no fim, do mais recente ao mais antigo). */
function readBySeries(books) {
  const read = readBooks(books).sort((a, b) => b.endDate.localeCompare(a.endDate));
  return groupBySeries(read).map((g) => `<h2 class="year-head">${g.name ? esc(g.name) : 'Fora de séries'} <span class="muted small">${plural(g.books.length, 'livro', 'livros')}</span></h2>${g.books.map((b) => bookRow(b)).join('')}`).join('');
}

function readList(books, groupSeries = false) {
  const read = readBooks(books);
  if (!read.length) return emptyState('Nenhum livro concluído', 'Os livros que você terminar aparecem aqui, separados por ano.');
  const toggle = read.some((b) => b.series)
    ? `<div class="list-tools"><button type="button" class="chip-btn sm${groupSeries ? ' is-on' : ''}" data-action="toggle-group-series" aria-pressed="${groupSeries}">Agrupar por série</button></div>`
    : '';
  if (toggle && groupSeries) return toggle + readBySeries(books);
  const years = [...new Set(read.map((b) => yearOf(b.endDate)))].sort((a, b) => b - a);
  const byYear = years.map((y) => {
    const list = booksReadInYear(books, y);
    return `<h2 class="year-head">${y} <span class="muted small">${plural(list.length, 'livro', 'livros')}</span></h2>${list.map((b) => bookRow(b)).join('')}`;
  }).join('');
  return toggle + byYear;
}

function droppedList(books) {
  const dropped = books.filter((b) => b.status === STATUS.DROPPED)
    .sort((a, b) => (b.endDate || b.updatedAt).localeCompare(a.endDate || a.updatedAt));
  if (!dropped.length) {
    return emptyState('Nenhum livro abandonado', 'Quando largar um livro, marque o status "Abandonei" e conte o porquê.');
  }
  return dropped.map((b) => bookRow(b) + (b.dropReason
    ? `<p class="drop-reason"><span class="eyebrow">Por que parei</span>${esc(b.dropReason)}</p>` : '')).join('');
}

export function shelfView({ state, ui, tab }) {
  const counts = countByStatus(state.books);
  const tabs = TABS.map(([value, label]) => `
    <a class="seg-btn${value === tab ? ' is-on' : ''}" href="#/estante?aba=${value}" aria-current="${value === tab ? 'page' : 'false'}">${label} <span class="seg-count">${counts[value]}</span></a>`).join('');
  let body;
  if (tab === STATUS.WANT) body = wantList(state, ui);
  else if (tab === STATUS.READING) body = readingList(state.books);
  else if (tab === STATUS.DROPPED) body = droppedList(state.books);
  else body = readList(state.books, ui?.groupSeries);
  return `
    <header class="top"><h1 class="display sm">Estante</h1></header>
    <nav class="segmented tabs-4" style="--seg-count:4" aria-label="Listas">${tabs}</nav>
    <div class="list">${body}</div>`;
}
