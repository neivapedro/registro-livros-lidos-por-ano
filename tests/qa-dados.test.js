import test from 'node:test';
import assert from 'node:assert/strict';
import { applyRescue, buildRescue, clearRescue, readRescue, RESCUE_KEY, writeRescue } from '../app/js/rescue.js';
import {
  DB_STATE_KEY, STORAGE_KEY, createEmptyState, parseBackup, readStoredState, removeBook, setGoal, upsertBook,
} from '../app/js/store.js';

const T1 = '2026-10-16T10:00:00.000Z';
const T2 = '2026-10-16T11:00:00.000Z';
const T3 = '2026-10-16T12:00:00.000Z';

function memoryStorage(initial = {}) {
  const data = new Map(Object.entries(initial));
  return {
    getItem: (k) => (data.has(k) ? data.get(k) : null),
    setItem: (k, v) => data.set(k, String(v)),
    removeItem: (k) => data.delete(k),
    data,
  };
}

function base() {
  let state = createEmptyState();
  ({ state } = upsertBook(state, { id: 'a', title: 'A', status: 'quero' }, T1));
  ({ state } = upsertBook(state, { id: 'b', title: 'B', status: 'lendo', startDate: '2026-10-01', currentPage: 10 }, T1));
  ({ state } = upsertBook(state, { id: 'c', title: 'C', status: 'quero' }, T1));
  return state;
}

test('resgate: guarda só os livros alterados, os excluídos e os ajustes', () => {
  const saved = base();
  let pending = upsertBook(saved, { ...saved.books[1], currentPage: 50 }, T2).state;
  pending = removeBook(pending, 'c');
  pending = setGoal(pending, 2026, 20);
  const rescue = buildRescue(saved, pending, T2);
  assert.deepEqual(rescue.changed.map((b) => b.id), ['b']);
  assert.deepEqual(rescue.removed, ['c']);
  assert.deepEqual(rescue.meta.goals, { 2026: 20 });

  const applied = applyRescue(saved, rescue);
  assert.deepEqual(applied, pending);
});

test('resgate: livro novo e ordem preservados; aplicar duas vezes dá o mesmo', () => {
  const saved = base();
  const pending = upsertBook(saved, { id: 'd', title: 'Novo', status: 'quero' }, T2).state;
  const rescue = buildRescue(saved, pending, T2);
  const once = applyRescue(saved, rescue);
  assert.deepEqual(once.books.map((b) => b.id), ['a', 'b', 'c', 'd']);
  assert.deepEqual(applyRescue(once, rescue), once);
});

test('resgate: não troca um livro gravado depois (outra aba) pela versão velha', () => {
  const saved = base();
  const pending = upsertBook(saved, { ...saved.books[1], currentPage: 50 }, T2).state;
  const rescue = buildRescue(saved, pending, T2);
  const other = upsertBook(saved, { ...saved.books[1], currentPage: 80 }, T3).state;
  const applied = applyRescue(other, rescue);
  assert.equal(applied.books.find((b) => b.id === 'b').currentPage, 80);
  // Excluído na cópia, mas alterado depois em outra aba: fica.
  const removedPending = removeBook(saved, 'a');
  const otherA = upsertBook(saved, { ...saved.books[0], title: 'A editado' }, T3).state;
  const applied2 = applyRescue(otherA, buildRescue(saved, removedPending, T2));
  assert.ok(applied2.books.some((b) => b.id === 'a'));
});

test('resgate: cópia inválida não mexe nos dados; grande demais não é guardada', () => {
  const saved = base();
  assert.equal(applyRescue(saved, null), saved);
  assert.equal(applyRescue(saved, { lixo: true }), saved);
  const storage = memoryStorage();
  assert.equal(writeRescue(storage, { changed: [{ notes: 'x'.repeat(2000000) }] }), false);
  assert.equal(storage.getItem(RESCUE_KEY), null);
  assert.equal(writeRescue(storage, { at: T1, changed: [] }), true);
  assert.deepEqual(readRescue(storage), { at: T1, changed: [] });
  clearRescue(storage);
  assert.equal(readRescue(storage), null);
  const full = { getItem: () => null, setItem: () => { throw new Error('QuotaExceededError'); }, removeItem() {} };
  assert.equal(writeRescue(full, { changed: [] }), false);
});

test('releitura de dados de outra aba: só lê, sem migrar', async () => {
  const state = base();
  const kv = { getItem: async (k) => (k === DB_STATE_KEY ? state : null) };
  const legacy = memoryStorage({ [STORAGE_KEY]: JSON.stringify(setGoal(state, 2026, 3)) });
  assert.deepEqual(await readStoredState('kv', kv, legacy), state);
  assert.ok(legacy.getItem(STORAGE_KEY), 'a chave antiga não é tocada');
  assert.deepEqual((await readStoredState('legacy', kv, legacy)).goals, { 2026: 3 });
  assert.equal(await readStoredState(null, kv, legacy), null);
  const broken = { getItem: async () => { throw new Error('IndexedDB fechou'); } };
  assert.equal(await readStoredState('kv', broken, legacy), null, 'falha de leitura não vira estado vazio');
});

test('backup sem lista de livros é recusado (importar apagaria tudo)', () => {
  assert.throws(() => parseBackup(JSON.stringify({ app: 'leituras', schemaVersion: 2, data: null })), /backup válido/);
  assert.throws(() => parseBackup(JSON.stringify({ app: 'leituras', schemaVersion: 2, data: { goals: {} } })), /backup válido/);
  assert.equal(parseBackup(JSON.stringify({ app: 'leituras', schemaVersion: 1, data: { books: [] } })).books.length, 0);
});
