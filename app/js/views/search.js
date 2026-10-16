import { yearOf } from '../dates.js';
import { FORMAT_LABELS, STATUS_LABELS, allGenres } from '../store.js';
import { filterBooks, yearsWithData } from '../stats.js';
import { bookRow, emptyState, esc, icon, plural } from '../ui.js';

function select(name, label, options, value) {
  const opts = options.map(([v, t]) => `<option value="${esc(v)}"${String(v) === String(value) ? ' selected' : ''}>${esc(t)}</option>`).join('');
  return `<label class="filter"><span class="sr-only">${esc(label)}</span><select data-filter="${name}">${opts}</select>${icon('chevronDown', { size: 14, stroke: 2 })}</label>`;
}

export function searchResults(state, filters) {
  const active = Object.values(filters).some(Boolean);
  if (!state.books.length) return emptyState('Nada para buscar ainda', 'Os livros que você registrar poderão ser encontrados aqui.');
  const found = filterBooks(state.books, filters);
  if (!found.length) return emptyState('Nenhum livro encontrado', 'Tente outro termo ou limpe os filtros.');
  return `<p class="muted small">${active ? plural(found.length, 'livro encontrado', 'livros encontrados') : `Todos os ${plural(found.length, 'livro', 'livros')}`}</p>${found.map((b) => bookRow(b)).join('')}`;
}

export function searchView({ state, ui, today }) {
  const f = ui.filters;
  const years = yearsWithData(state.books, yearOf(today));
  const hasFilters = f.status || f.year || f.genre || f.format || f.minRating;
  return `
    <header class="top"><h1 class="display sm">Buscar</h1></header>
    <div class="search-box">
      ${icon('search', { size: 20, stroke: 2, cls: 'muted' })}
      <label class="sr-only" for="q">Buscar nos seus livros</label>
      <input id="q" type="search" autocomplete="off" enterkeyhint="search" placeholder="Título, autor ou anotação" value="${esc(f.q)}" data-filter="q">
    </div>
    <div class="filters">
      ${select('status', 'Status', [['', 'Status'], ...Object.entries(STATUS_LABELS)], f.status)}
      ${select('year', 'Ano', [['', 'Ano'], ...years.map((y) => [y, y])], f.year)}
      ${select('genre', 'Gênero', [['', 'Gênero'], ...allGenres(state).map((g) => [g, g])], f.genre)}
      ${select('format', 'Formato', [['', 'Formato'], ...Object.entries(FORMAT_LABELS)], f.format)}
      ${select('minRating', 'Nota mínima', [['', 'Nota'], ['5', '★ 5'], ['4', '★ 4+'], ['3', '★ 3+']], f.minRating)}
      ${hasFilters ? '<button type="button" class="btn-text accent small" data-action="clear-filters">Limpar</button>' : ''}
    </div>
    <div id="search-results" class="list">${searchResults(state, f)}</div>`;
}
