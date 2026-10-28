// Tela "Trechos salvos" (#/trechos): os trechos de todos os livros, com busca.

import { countQuotes, quotePosition, searchQuotes } from '../quotes.js';
import { emptyState, esc, icon, plural } from '../ui.js';

/** Só a lista: redesenhada a cada letra digitada, sem tirar o foco da busca. */
export function allQuotesResults(state, query) {
  if (!countQuotes(state.books)) {
    return emptyState('Nenhum trecho salvo ainda', 'Na página de um livro, abra a aba Trechos e toque em + Trecho.');
  }
  const found = searchQuotes(state.books, query);
  if (!found.length) return emptyState('Nenhum trecho encontrado', 'Tente outra palavra do trecho, do título ou do autor.');
  const count = query.trim() ? plural(found.length, 'trecho encontrado', 'trechos encontrados') : plural(found.length, 'trecho', 'trechos');
  return `<p class="muted small">${count}</p>${found.map(({ quote, book }) => {
    const author = book.authors.split(',')[0].trim();
    const position = quotePosition(quote, book);
    return `
    <a class="quote-card quote-link" href="#/livro/${encodeURIComponent(book.id)}?aba=trechos">
      <span class="quote-mark" aria-hidden="true">“</span>
      <blockquote class="quote-text">${esc(quote.text)}</blockquote>
      <span class="quote-source">
        <span class="quote-source-text"><span class="quote-book">${esc(book.title)}</span>${author ? `<span class="quote-author">${esc(author)}</span>` : ''}</span>
        ${position ? `<span class="quote-page">${esc(position)}</span>` : ''}
      </span>
    </a>`;
  }).join('')}`;
}

export function allQuotesView({ state, ui }) {
  const query = ui.quotesQuery || '';
  return `
    <header class="top">
      <a class="icon-btn" href="#/resumo/todos" aria-label="Voltar">${icon('chevronLeft', { stroke: 2 })}</a>
    </header>
    <div class="page-title">
      <span class="eyebrow">Todos os livros</span>
      <h1 class="display">Trechos <em>salvos</em></h1>
    </div>
    <div class="search-box">
      ${icon('search', { size: 20, stroke: 2, cls: 'muted' })}
      <label class="sr-only" for="quotes-q">Buscar nos trechos</label>
      <input id="quotes-q" type="search" autocomplete="off" enterkeyhint="search" placeholder="Palavra, livro ou autor" value="${esc(query)}" data-quotes-q>
    </div>
    <div id="quotes-results" class="list">${allQuotesResults(state, query)}</div>`;
}
