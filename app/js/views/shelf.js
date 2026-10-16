import { yearOf } from '../dates.js';
import { STATUS } from '../store.js';
import { booksReadInYear, countByStatus, readBooks } from '../stats.js';
import { bookRow, emptyState, plural } from '../ui.js';

const TABS = [[STATUS.WANT, 'Quero ler'], [STATUS.READING, 'Lendo'], [STATUS.READ, 'Lidos']];

function wantList(books) {
  const want = books.filter((b) => b.status === STATUS.WANT)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  if (!want.length) {
    return emptyState('A fila está vazia', 'Adicione os livros que você quer ler a seguir.',
      '<a class="btn-outline" href="#/novo?status=quero">Adicionar à fila</a>');
  }
  return want.map((b) => bookRow(b, {
    action: `<button type="button" class="btn-outline sm" data-action="start-reading" data-id="${b.id}">Começar</button>`,
  })).join('') + '<a class="btn-ghost" href="#/novo?status=quero">+ Adicionar à fila</a>';
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

function readList(books) {
  const read = readBooks(books);
  if (!read.length) return emptyState('Nenhum livro concluído', 'Os livros que você terminar aparecem aqui, separados por ano.');
  const years = [...new Set(read.map((b) => yearOf(b.endDate)))].sort((a, b) => b - a);
  return years.map((y) => {
    const list = booksReadInYear(books, y);
    return `<h2 class="year-head">${y} <span class="muted small">${plural(list.length, 'livro', 'livros')}</span></h2>${list.map((b) => bookRow(b)).join('')}`;
  }).join('');
}

export function shelfView({ state, tab }) {
  const counts = countByStatus(state.books);
  const tabs = TABS.map(([value, label]) => `
    <a class="seg-btn${value === tab ? ' is-on' : ''}" href="#/estante?aba=${value}" aria-current="${value === tab ? 'page' : 'false'}">${label} <span class="seg-count">${counts[value]}</span></a>`).join('');
  let body;
  if (tab === STATUS.WANT) body = wantList(state.books);
  else if (tab === STATUS.READING) body = readingList(state.books);
  else body = readList(state.books);
  return `
    <header class="top"><h1 class="display sm">Estante</h1></header>
    <nav class="segmented" style="--seg-count:3" aria-label="Listas">${tabs}</nav>
    <div class="list">${body}</div>`;
}
