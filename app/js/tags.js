// Etiquetas livres dos livros (as que a pessoa cria; o app não sugere nenhuma).
// Funções puras: recebem a lista e devolvem uma nova.

import { booksReadInYear } from './stats.js';
import { countTags, normalizeTags } from './store.js';

/** Acrescenta o que foi digitado; vírgula separa várias etiquetas ("clássico, presente"). */
export function addTags(tags, input) {
  const parts = String(input ?? '').split(',').map((t) => t.trim()).filter(Boolean);
  return normalizeTags([...(tags || []), ...parts]);
}

/** Tira uma etiqueta (sem diferenciar maiúsculas). */
export function removeTag(tags, tag) {
  const key = String(tag).toLocaleLowerCase('pt-BR');
  return (tags || []).filter((t) => t.toLocaleLowerCase('pt-BR') !== key);
}

export function hasTag(tags, tag) {
  const key = String(tag).toLocaleLowerCase('pt-BR');
  return (tags || []).some((t) => t.toLocaleLowerCase('pt-BR') === key);
}

/** Etiquetas mais usadas: [{ label, count }], da mais usada para a menos usada (empate: alfabética). */
export function tagRanking(books, limit = 8) {
  return countTags(books).slice(0, limit);
}

/** Etiquetas dos livros lidos no ano. */
export function topTagsInYear(books, year, limit = 8) {
  return tagRanking(booksReadInYear(books, year), limit);
}
