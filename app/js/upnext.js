// Próximas leituras (até 5, em ordem) e sorteio de um livro da fila "Quero ler".
// Funções puras; a lista é guardada em state.upNext e limpa pelo store.js.

import { MAX_UP_NEXT, STATUS, setUpNext } from './store.js';

/** Livros "Quero ler" separados: os próximos (na ordem escolhida) e o resto (na ordem em que entraram). */
export function wantQueue(state) {
  const want = state.books.filter((b) => b.status === STATUS.WANT);
  const byId = new Map(want.map((b) => [b.id, b]));
  const next = (state.upNext || []).map((id) => byId.get(id)).filter(Boolean);
  const nextIds = new Set(next.map((b) => b.id));
  const rest = want.filter((b) => !nextIds.has(b.id))
    .sort((a, b) => (a.createdAt || '').localeCompare(b.createdAt || ''));
  return { next, rest };
}

/**
 * Marca ou desmarca um livro como próximo. Marcado entra no fim da lista.
 * Devolve { state, full }: full = true quando a lista já tinha 5 e nada mudou.
 */
export function toggleUpNext(state, id) {
  const list = state.upNext || [];
  if (list.includes(id)) return { state: setUpNext(state, list.filter((x) => x !== id)), full: false };
  if (list.length >= MAX_UP_NEXT) return { state, full: true };
  return { state: setUpNext(state, [...list, id]), full: false };
}

/** Sobe (delta -1) ou desce (+1) um livro na lista de próximos. */
export function moveUpNext(state, id, delta) {
  const list = [...(state.upNext || [])];
  const i = list.indexOf(id);
  const j = i + delta;
  if (i < 0 || j < 0 || j >= list.length) return state;
  [list[i], list[j]] = [list[j], list[i]];
  return setUpNext(state, list);
}

/** Primeiro da lista de próximos (para o Início), ou null. */
export function firstUpNext(state) {
  return wantQueue(state).next[0] || null;
}

/** Livros que podem ser sorteados: "Quero ler", com os filtros de gênero e formato (vazios não filtram). */
export function drawCandidates(books, { genre = '', format = '' } = {}) {
  return books.filter((b) => b.status === STATUS.WANT
    && (!genre || b.genre === genre)
    && (!format || b.format === format));
}

/**
 * Sorteia um livro. rng devolve um número em [0, 1) (Math.random, ou fixo nos testes).
 * Evita repetir o último sorteado quando há outra opção.
 */
export function drawBook(books, filters = {}, rng = Math.random, previousId = null) {
  let pool = drawCandidates(books, filters);
  if (pool.length > 1 && previousId) pool = pool.filter((b) => b.id !== previousId);
  if (!pool.length) return null;
  const i = Math.min(pool.length - 1, Math.floor(rng() * pool.length));
  return pool[i];
}
