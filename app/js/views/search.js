import { yearOf } from '../dates.js';
import { FORMAT_LABELS, STATUS_LABELS, allGenres, allTags } from '../store.js';
import { filterBooks, yearsWithData } from '../stats.js';
import { bookItem, emptyState, esc, icon, itemGroup, plural } from '../ui.js';
import { applyChartFilters } from '../charts.js';
import { chartFilterChip } from './charts.js';

const RATINGS = [['5', '★ 5'], ['4.5', '★ 4,5+'], ['4', '★ 4+'], ['3.5', '★ 3,5+'], ['3', '★ 3+']];

/**
 * Filtro em forma de chip: o seletor nativo fica por cima, invisível (no iPhone abre a roda
 * de opções embaixo). Ativo: chip caramelo com o valor e um ✕ para tirar.
 */
function chipSelect(name, label, options, value) {
  const current = options.find(([v]) => v !== '' && String(v) === String(value ?? ''));
  const opts = [['', `${label}: todos`], ...options]
    .map(([v, t]) => `<option value="${esc(v)}"${String(v) === String(value ?? '') ? ' selected' : ''}>${esc(t)}</option>`).join('');
  return `
    <span class="fchip${current ? ' is-on' : ''}">
      <label class="fchip-pick">
        <span class="fchip-text" aria-hidden="true">${esc(current ? current[1] : label)}</span>${current ? '' : icon('chevronDown', { size: 14, stroke: 2.2 })}
        <select data-filter="${name}" aria-label="${esc(label)}">${opts}</select>
      </label>
      ${current ? `<button type="button" class="fchip-x" data-action="clear-filter" data-key="${name}" aria-label="Tirar o filtro ${esc(label)}">${icon('close', { size: 14, stroke: 2.4 })}</button>` : ''}
    </span>`;
}

export function searchResults(state, filters) {
  const active = Object.values(filters).some(Boolean);
  if (!state.books.length) return emptyState('Nada para buscar ainda', 'Os livros que você registrar poderão ser encontrados aqui.');
  // Filtros extras vindos de um toque nos gráficos do resumo (nota exata, tamanho, mês).
  const found = applyChartFilters(filterBooks(state.books, filters), filters);
  if (!found.length) return emptyState('Nenhum livro encontrado', 'Tente outro termo ou tire um filtro.');
  const head = active
    ? plural(found.length, 'livro encontrado', 'livros encontrados')
    : `Todos os ${plural(found.length, 'livro', 'livros')} · mais recentes primeiro`;
  return `<p class="results-count muted small">${head}</p>${itemGroup('', '', found.map((b) => bookItem(b, { withYear: true })).join(''))}`;
}

export function searchView({ state, ui, today }) {
  const f = ui.filters;
  const years = yearsWithData(state.books, yearOf(today));
  const hasFilters = f.status || f.year || f.genre || f.format || f.minRating || f.tag;
  const tags = allTags(state);
  return `
    <header class="top"><h1 class="display sm">Buscar</h1></header>
    <div class="search-box">
      ${icon('search', { size: 20, stroke: 2, cls: 'muted' })}
      <label class="sr-only" for="q">Buscar nos seus livros</label>
      <input id="q" type="search" autocomplete="off" enterkeyhint="search" placeholder="Título, autor ou anotação" value="${esc(f.q)}" data-filter="q">
    </div>
    <div class="fchips" role="group" aria-label="Filtros">
      ${chipSelect('status', 'Status', Object.entries(STATUS_LABELS), f.status)}
      ${chipSelect('year', 'Ano', years.map((y) => [String(y), String(y)]), f.year)}
      ${chipSelect('genre', 'Gênero', allGenres(state).map((g) => [g, g]), f.genre)}
      ${chipSelect('format', 'Formato', Object.entries(FORMAT_LABELS), f.format)}
      ${chipSelect('minRating', 'Nota', RATINGS, f.minRating)}
      ${tags.length || f.tag ? chipSelect('tag', 'Etiqueta', tags.map((t) => [t, t]), f.tag || '') : ''}
      ${hasFilters ? '<button type="button" class="fchip fchip-clear" data-action="clear-filters">Limpar</button>' : ''}
    </div>
    ${chartFilterChip(f)}
    <div id="search-results" class="list search-list">${searchResults(state, f)}</div>`;
}
