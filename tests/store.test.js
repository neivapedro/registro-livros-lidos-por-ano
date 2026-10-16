import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  STATUS, FORMATS, STORAGE_KEY, allGenres, createEmptyState, getGoal, loadState, normalizeBook, parseBackup,
  removeBook, restoreBook, saveState, serializeBackup, setGoal, startReread, upsertBook, validateBook,
} from '../app/js/store.js';

const NOW = '2026-10-16T12:00:00.000Z';

function memoryStorage() {
  const data = new Map();
  return {
    getItem: (k) => (data.has(k) ? data.get(k) : null),
    setItem: (k, v) => data.set(k, String(v)),
    removeItem: (k) => data.delete(k),
    data,
  };
}

test('normalizeBook limpa campos e aplica padrões', () => {
  const b = normalizeBook({
    title: '  A Meta  ', authors: 'Eliyahu M. Goldratt', pages: '384', status: 'lido',
    startDate: '2026-09-03', endDate: '2026-09-21', rating: 5, favorite: true,
    cover: 'http://books.google.com/x.jpg', format: 'qualquer',
  }, NOW);
  assert.equal(b.title, 'A Meta');
  assert.equal(b.pages, 384);
  assert.equal(b.cover, 'https://books.google.com/x.jpg');
  assert.equal(b.format, FORMATS.PHYSICAL);
  assert.equal(b.favorite, true);
  assert.equal(b.createdAt, NOW);
  assert.ok(b.id);
});

test('normalizeBook descarta dados que não combinam com o status', () => {
  const want = normalizeBook({ title: 'X', status: 'quero', startDate: '2026-01-01', endDate: '2026-01-02', rating: 4, favorite: true });
  assert.equal(want.startDate, null);
  assert.equal(want.endDate, null);
  assert.equal(want.rating, null);
  assert.equal(want.favorite, false);
  const reading = normalizeBook({ title: 'X', status: 'lendo', startDate: '2026-01-01', endDate: '2026-01-02' });
  assert.equal(reading.startDate, '2026-01-01');
  assert.equal(reading.endDate, null);
});

test('normalizeBook rejeita livro sem título e URLs inseguras', () => {
  assert.equal(normalizeBook({ title: '   ' }), null);
  assert.equal(normalizeBook(null), null);
  assert.equal(normalizeBook({ title: 'X', cover: 'javascript:alert(1)' }).cover, null);
  assert.equal(normalizeBook({ title: 'X', rating: 9, status: 'lido' }).rating, null);
});

test('validateBook', () => {
  assert.deepEqual(validateBook({ title: 'X', status: 'quero' }), []);
  assert.equal(validateBook({ title: '', status: 'quero' }).length, 1);
  assert.match(validateBook({ title: 'X', status: 'lido', endDate: null })[0], /terminou/);
  assert.match(validateBook({ title: 'X', status: 'lido', startDate: '2026-09-10', endDate: '2026-09-01' })[0], /anterior/);
});

test('upsertBook cria, atualiza e mantém um único favorito por ano', () => {
  let state = createEmptyState();
  ({ state } = upsertBook(state, { id: 'a', title: 'A', status: 'lido', endDate: '2026-03-01', favorite: true }, NOW));
  ({ state } = upsertBook(state, { id: 'b', title: 'B', status: 'lido', endDate: '2025-03-01', favorite: true }, NOW));
  ({ state } = upsertBook(state, { id: 'c', title: 'C', status: 'lido', endDate: '2026-05-01', favorite: true }, NOW));
  const fav = Object.fromEntries(state.books.map((b) => [b.id, b.favorite]));
  assert.deepEqual(fav, { a: false, b: true, c: true });

  const created = state.books.find((b) => b.id === 'c').createdAt;
  ({ state } = upsertBook(state, { id: 'c', title: 'C editado', status: 'lido', endDate: '2026-05-01' }, '2026-10-17T00:00:00.000Z'));
  const c = state.books.find((b) => b.id === 'c');
  assert.equal(c.title, 'C editado');
  assert.equal(c.createdAt, created);
  assert.equal(state.books.length, 3);
});

test('upsertBook guarda gêneros novos para reutilizar', () => {
  const { state } = upsertBook(createEmptyState(), { title: 'X', genre: 'Engenharia' });
  assert.deepEqual(state.customGenres, ['Engenharia']);
  assert.ok(allGenres(state).includes('Engenharia'));
  assert.ok(allGenres(state).includes('Gestão'));
});

test('removeBook', () => {
  const { state } = upsertBook(createEmptyState(), { id: 'a', title: 'A' });
  assert.equal(removeBook(state, 'a').books.length, 0);
});

test('metas por ano com padrão de 12', () => {
  let state = createEmptyState();
  assert.equal(getGoal(state, 2026), 12);
  state = setGoal(state, 2026, 15);
  assert.equal(getGoal(state, 2026), 15);
  assert.equal(getGoal(state, 2027), 12);
  assert.equal(setGoal(state, 2026, 0), state);
});

test('salvar e carregar do armazenamento', () => {
  const storage = memoryStorage();
  const { state } = upsertBook(createEmptyState(), { id: 'a', title: 'A', status: 'lido', endDate: '2026-01-10' });
  assert.equal(saveState(storage, state), true);
  assert.deepEqual(loadState(storage), state);
});

test('carregar dado corrompido não quebra o app', () => {
  const storage = memoryStorage();
  storage.setItem(STORAGE_KEY, '{quebrado');
  assert.deepEqual(loadState(storage), createEmptyState());
});

test('saveState devolve false quando o navegador recusa', () => {
  const storage = { setItem() { throw new Error('QuotaExceededError'); } };
  assert.equal(saveState(storage, createEmptyState()), false);
});

test('backup: ida e volta preserva os dados', () => {
  let state = createEmptyState();
  ({ state } = upsertBook(state, { id: 'a', title: 'A Meta', status: 'lido', endDate: '2026-09-21', rating: 5 }, NOW));
  state = setGoal(state, 2026, 12);
  const text = serializeBackup(state, NOW);
  assert.deepEqual(parseBackup(text), state);
});

test('backup inválido gera mensagem clara', () => {
  assert.throws(() => parseBackup('não é json'), /backup válido/);
  assert.throws(() => parseBackup(JSON.stringify({ app: 'outro', data: {} })), /backup válido/);
  assert.throws(() => parseBackup(JSON.stringify({ app: 'leituras', schemaVersion: 99, data: {} })), /versão mais nova/);
});

test('backup com livros repetidos ou inválidos é limpo', () => {
  const text = JSON.stringify({
    app: 'leituras', schemaVersion: 1,
    data: { books: [{ id: 'a', title: 'A' }, { id: 'a', title: 'A de novo' }, { title: '' }, 'lixo'], goals: { 2026: 10, abc: 5 } },
  });
  const state = parseBackup(text);
  assert.equal(state.books.length, 1);
  assert.deepEqual(state.goals, { 2026: 10 });
  assert.equal(state.books[0].status, STATUS.WANT);
});

test('status Abandonei guarda data em que parou, página e motivo', () => {
  const b = normalizeBook({
    title: 'X', status: 'abandonado', startDate: '2026-04-01', endDate: '2026-04-20',
    pages: 300, currentPage: 90, dropReason: '  Não prendeu  ', rating: 3, favorite: true,
  });
  assert.equal(b.endDate, '2026-04-20');
  assert.equal(b.currentPage, 90);
  assert.equal(b.dropReason, 'Não prendeu');
  assert.equal(b.rating, null);
  assert.equal(b.favorite, false);
  assert.equal(normalizeBook({ title: 'X', status: 'lido', dropReason: 'x' }).dropReason, '');
  assert.match(validateBook({ title: 'X', status: 'abandonado', startDate: '2026-05-01', endDate: '2026-04-01' })[0], /em que parou/);
});

test('página atual só vale para Lendo/Abandonei e não passa do total', () => {
  assert.equal(normalizeBook({ title: 'X', status: 'lendo', pages: 200, currentPage: '120' }).currentPage, 120);
  assert.equal(normalizeBook({ title: 'X', status: 'lendo', pages: 200, currentPage: 250 }).currentPage, null);
  assert.equal(normalizeBook({ title: 'X', status: 'lido', endDate: '2026-01-01', currentPage: 10 }).currentPage, null);
  assert.match(validateBook({ title: 'X', status: 'lendo', pages: 200, currentPage: 250 })[0], /passa do total/);
});

test('capa por foto aceita só imagem em data URL dentro do limite', () => {
  const jpg = 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQ==';
  assert.equal(normalizeBook({ title: 'X', cover: jpg }).cover, jpg);
  assert.equal(normalizeBook({ title: 'X', cover: 'data:text/html;base64,PHNjcmlwdD4=' }).cover, null);
  assert.equal(normalizeBook({ title: 'X', cover: `data:image/jpeg;base64,${'A'.repeat(700000)}` }).cover, null);
  assert.equal(normalizeBook({ title: 'X', cover: 'data:image/png;base64,abc"onerror=x' }).cover, null);
});

test('restoreBook desfaz a exclusão na mesma posição', () => {
  let state = createEmptyState();
  for (const id of ['a', 'b', 'c']) ({ state } = upsertBook(state, { id, title: id }));
  const book = state.books[1];
  const removed = removeBook(state, 'b');
  const back = restoreBook(removed, book, 1);
  assert.deepEqual(back.books.map((b) => b.id), ['a', 'b', 'c']);
  assert.equal(restoreBook(back, book, 1), back);
});

test('startReread cria nova leitura do mesmo livro', () => {
  let state = createEmptyState();
  ({ state } = upsertBook(state, {
    id: 'a', title: 'A Meta', authors: 'Goldratt', pages: 384, cover: 'https://x/c.jpg', status: 'lido',
    endDate: '2025-05-01', rating: 5, favorite: true, notes: 'anotação', genre: 'Gestão',
  }));
  const { state: next, book } = startReread(state, 'a', '2026-10-16');
  assert.equal(next.books.length, 2);
  assert.notEqual(book.id, 'a');
  assert.equal(book.title, 'A Meta');
  assert.equal(book.status, STATUS.READING);
  assert.equal(book.startDate, '2026-10-16');
  assert.equal(book.reread, true);
  assert.equal(book.rating, null);
  assert.equal(book.notes, '');
  assert.equal(book.cover, 'https://x/c.jpg');
  assert.equal(next.books.find((b) => b.id === 'a').favorite, true);
});

test('Kindle guarda o avanço em %, livro físico em página', () => {
  const kindle = normalizeBook({ title: 'X', status: 'lendo', format: 'kindle', currentPercent: '45', currentPage: 120 });
  assert.equal(kindle.currentPercent, 45);
  assert.equal(kindle.currentPage, null);
  const fisico = normalizeBook({ title: 'X', status: 'lendo', format: 'fisico', currentPercent: 45, currentPage: 120 });
  assert.equal(fisico.currentPercent, null);
  assert.equal(fisico.currentPage, 120);
  assert.equal(normalizeBook({ title: 'X', status: 'lendo', format: 'kindle', currentPercent: 140 }).currentPercent, null);
  assert.equal(normalizeBook({ title: 'X', status: 'lido', format: 'kindle', endDate: '2026-01-01', currentPercent: 50 }).currentPercent, null);
  assert.match(validateBook({ title: 'X', status: 'lendo', format: 'kindle', currentPercent: 140 })[0], /0 a 100/);
  assert.deepEqual(validateBook({ title: 'X', status: 'lendo', format: 'kindle', pages: 100, currentPage: 500, currentPercent: 30 }), []);
});

test('datas no futuro são recusadas quando se informa o dia de hoje', () => {
  const today = '2026-10-16';
  assert.match(validateBook({ title: 'X', status: 'lido', endDate: '2062-01-01' }, today)[0], /término não pode estar no futuro/);
  assert.match(validateBook({ title: 'X', status: 'lendo', startDate: '2026-10-17' }, today)[0], /início não pode estar no futuro/);
  assert.match(validateBook({ title: 'X', status: 'abandonado', endDate: '2027-01-01' }, today)[0], /em que parou não pode estar no futuro/);
  assert.deepEqual(validateBook({ title: 'X', status: 'lido', startDate: '2026-10-01', endDate: today }, today), []);
  assert.deepEqual(validateBook({ title: 'X', status: 'quero', startDate: '2099-01-01' }, today), []);
});

test('página maior que o total também é recusada ao abandonar', () => {
  assert.match(validateBook({ title: 'X', status: 'abandonado', pages: 100, currentPage: 500 })[0], /passa do total/);
});
