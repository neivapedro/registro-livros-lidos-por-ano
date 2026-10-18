// Cópia de resgate da última alteração.
// A gravação no IndexedDB é assíncrona: se o app for fechado no mesmo instante em que
// salva, a gravação pode ser cancelada. Quando o app sai da tela com uma gravação em
// andamento, guarda no localStorage só o que mudou (os livros alterados, os excluídos e os
// ajustes) — pequeno, sem as capas dos outros livros. Na próxima abertura, se a cópia ainda
// estiver lá (a gravação não terminou), ela é aplicada por cima do que foi lido.

import { normalizeBook, normalizeState } from './store.js';

export const RESCUE_KEY = 'leituras:pendente';
// Acima disso não vale a pena (o localStorage tem ~5 MB e guarda outras coisas).
export const RESCUE_MAX_CHARS = 1500000;

const META = ['goals', 'defaultGoal', 'customGenres', 'lastBackupAt', 'upNext', 'pageGoals'];

/**
 * O que mudou de 'saved' (último estado gravado) para 'pending' (o que está sendo gravado).
 * Livros iguais por referência não mudaram (upsertBook só cria objeto novo para o alterado).
 */
export function buildRescue(saved, pending, nowTs = new Date().toISOString()) {
  const before = new Map((saved?.books || []).map((b) => [b.id, b]));
  const ids = new Set(pending.books.map((b) => b.id));
  const changed = pending.books.filter((b) => before.get(b.id) !== b);
  const removed = [...before.keys()].filter((id) => !ids.has(id));
  const meta = {};
  for (const key of META) meta[key] = pending[key];
  return { at: nowTs, changed, removed, order: pending.books.map((b) => b.id), meta };
}

/**
 * Aplica a cópia de resgate ao estado lido do aparelho. Um livro gravado depois da cópia
 * (outra aba) não é trocado pela versão mais velha da cópia.
 */
export function applyRescue(state, rescue) {
  if (!rescue || typeof rescue !== 'object' || !Array.isArray(rescue.changed)) return state;
  const at = typeof rescue.at === 'string' ? rescue.at : '';
  const byId = new Map(state.books.map((b) => [b.id, b]));
  for (const id of Array.isArray(rescue.removed) ? rescue.removed : []) {
    const b = byId.get(id);
    if (b && !(b.updatedAt > at)) byId.delete(id);
  }
  for (const raw of rescue.changed) {
    const book = normalizeBook(raw);
    if (!book) continue;
    const current = byId.get(book.id);
    if (current && current.updatedAt > book.updatedAt) continue;
    byId.set(book.id, book);
  }
  // Mantém a ordem da cópia; livros que só existem no aparelho vão para o fim.
  const order = Array.isArray(rescue.order) ? rescue.order : [];
  const books = order.filter((id) => byId.has(id)).map((id) => byId.get(id));
  const placed = new Set(order);
  for (const b of byId.values()) if (!placed.has(b.id)) books.push(b);
  const meta = rescue.meta && typeof rescue.meta === 'object' ? rescue.meta : {};
  const next = { ...state, books };
  for (const key of META) if (key in meta) next[key] = meta[key];
  return normalizeState(next);
}

/** Guarda a cópia; não cabendo (ou grande demais), segue sem ela. */
export function writeRescue(storage, rescue) {
  try {
    const json = JSON.stringify(rescue);
    if (json.length > RESCUE_MAX_CHARS) return false;
    storage.setItem(RESCUE_KEY, json);
    return true;
  } catch {
    return false;
  }
}

export function readRescue(storage) {
  try {
    const raw = storage.getItem(RESCUE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function clearRescue(storage) {
  try {
    storage.removeItem(RESCUE_KEY);
  } catch {
    // Sem acesso ao localStorage: a cópia (se houver) é aplicada de novo, sem prejuízo.
  }
}
