import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  STATUS, FORMATS, STORAGE_KEY, DB_STATE_KEY, SCHEMA_VERSION, allGenres, allTags, createEmptyState, getGoal,
  getPageGoal, jsonEqual, loadState, normalizeBook, normalizeRating, normalizeState, openStoredState, parseBackup,
  removeBook, restoreBook, saveState, serializeBackup, setGoal, setPageGoal, setUpNext, startReread, upsertBook,
  validateBook, writeStoredState,
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

test('restoreBook devolve o livro ao mesmo lugar em "Próximos"', () => {
  let state = createEmptyState();
  for (const id of ['a', 'b', 'c']) ({ state } = upsertBook(state, { id, title: id, status: 'quero' }));
  state = setUpNext(state, ['c', 'b', 'a']);
  const book = state.books[1];
  const removed = removeBook(state, 'b');
  assert.deepEqual(removed.upNext, ['c', 'a']);
  assert.deepEqual(restoreBook(removed, book, 1, state.upNext.indexOf('b')).upNext, ['c', 'b', 'a']);
  // Fora da lista antes de excluir: continua fora.
  assert.deepEqual(restoreBook(removeBook(state, 'b'), book, 1, -1).upNext, ['c', 'a']);
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

// ---------- Versão 2 dos dados ----------

test('nota aceita meia estrela, de 0,5 a 5', () => {
  const rate = (rating) => normalizeBook({ title: 'X', status: 'lido', endDate: '2026-01-01', rating }).rating;
  assert.equal(rate(4.5), 4.5);
  assert.equal(rate('3.5'), 3.5);
  assert.equal(rate('3,5'), 3.5);
  assert.equal(rate(0.5), 0.5);
  assert.equal(rate(4.3), 4.5);
  assert.equal(rate(4.2), 4);
  assert.equal(rate(5), 5);
  assert.equal(rate(0.2), null);
  assert.equal(rate(0), null);
  assert.equal(rate(5.5), null);
  assert.equal(rate('abc'), null);
  assert.equal(normalizeBook({ title: 'X', status: 'lendo', rating: 4.5 }).rating, null);
  assert.equal(normalizeRating(2.75), 3);
});

test('livro da versão 1 ganha os campos novos sem perder nada', () => {
  const v1 = {
    id: 'a', title: 'A Meta', authors: 'Goldratt', pages: 384, cover: null, isbn: '', status: 'lido',
    startDate: '2026-09-03', endDate: '2026-09-21', currentPage: null, currentPercent: null, format: 'fisico',
    genre: 'Gestão', rating: 5, favorite: true, notes: 'nota', dropReason: '', reread: false,
    createdAt: NOW, updatedAt: NOW,
  };
  const b = normalizeBook(v1);
  for (const [k, v] of Object.entries(v1)) assert.deepEqual(b[k], v, k);
  assert.equal(b.series, '');
  assert.equal(b.seriesNumber, null);
  assert.deepEqual(b.tags, []);
  assert.equal(b.targetDate, null);
  assert.deepEqual(b.quotes, []);
  assert.deepEqual(b.journal, []);
});

test('série, número na série e tags', () => {
  const b = normalizeBook({
    title: 'X', series: '  Duna  ', seriesNumber: '2,5',
    tags: [' clássico ', 'Clássico', '', 7, 'ficção científica', 'x'.repeat(60)],
  });
  assert.equal(b.series, 'Duna');
  assert.equal(b.seriesNumber, 2.5);
  assert.deepEqual(b.tags, ['clássico', 'ficção científica', 'x'.repeat(40)]);
  assert.equal(normalizeBook({ title: 'X', seriesNumber: 0 }).seriesNumber, null);
  assert.equal(normalizeBook({ title: 'X', seriesNumber: -1 }).seriesNumber, null);
  assert.equal(normalizeBook({ title: 'X', series: 's'.repeat(200) }).series.length, 120);
  const many = normalizeBook({ title: 'X', tags: Array.from({ length: 40 }, (_, i) => `t${i}`) });
  assert.equal(many.tags.length, 30);
  assert.deepEqual(normalizeBook({ title: 'X', tags: 'não é lista' }).tags, []);
  assert.match(validateBook({ title: 'X', status: 'quero', seriesNumber: -2 })[0], /série/);
});

test('data para terminar só vale enquanto está lendo', () => {
  assert.equal(normalizeBook({ title: 'X', status: 'lendo', targetDate: '2026-12-01' }).targetDate, '2026-12-01');
  assert.equal(normalizeBook({ title: 'X', status: 'lendo', targetDate: '2026-02-30' }).targetDate, null);
  assert.equal(normalizeBook({ title: 'X', status: 'quero', targetDate: '2026-12-01' }).targetDate, null);
  assert.equal(normalizeBook({ title: 'X', status: 'lido', endDate: '2026-01-01', targetDate: '2026-12-01' }).targetDate, null);
  assert.match(validateBook({ title: 'X', status: 'lendo', startDate: '2026-10-01', targetDate: '2026-09-01' })[0], /anterior à de início/);
});

test('citações: texto obrigatório, página/% opcionais, ficam em qualquer status', () => {
  const b = normalizeBook({
    title: 'X', status: 'lido', endDate: '2026-01-01',
    quotes: [
      { id: 'q1', text: '  A restrição dita o ritmo.  ', page: '42', note: 'cap. 3', createdAt: NOW },
      { text: '   ' },
      { id: 'q1', text: 'repetida' },
      { text: 'Kindle', percent: 150 },
      'lixo',
    ],
  }, NOW);
  assert.equal(b.quotes.length, 2);
  assert.deepEqual(b.quotes[0], { id: 'q1', text: 'A restrição dita o ritmo.', page: 42, percent: null, note: 'cap. 3', createdAt: NOW });
  assert.equal(b.quotes[1].percent, null);
  assert.ok(b.quotes[1].id);
  assert.equal(b.quotes[1].createdAt, NOW);
  assert.equal(normalizeBook({ title: 'X', quotes: [{ text: 'y'.repeat(6000) }] }).quotes[0].text.length, 5000);
});

test('diário: entradas válidas, em ordem, uma por dia', () => {
  const b = normalizeBook({
    title: 'X', status: 'lendo',
    journal: [
      { date: '2026-10-03', from: 50, to: 80, unit: 'page', note: '' },
      { date: '2026-10-01', from: 0, to: 30, unit: 'page' },
      { date: '2026-10-03', from: 80, to: 95, unit: 'page', note: 'fim de semana' },
      { date: 'ontem', from: 0, to: 10, unit: 'page' },
      { date: '2026-10-04', from: 'x', to: 10, unit: 'page' },
      { date: '2026-10-05', from: 10, to: 140, unit: 'percent' },
    ],
  });
  assert.deepEqual(b.journal, [
    { date: '2026-10-01', from: 0, to: 30, unit: 'page', note: '' },
    { date: '2026-10-03', from: 50, to: 95, unit: 'page', note: 'fim de semana' },
  ]);
  // O diário continua depois de concluir ou abandonar.
  assert.equal(normalizeBook({ title: 'X', status: 'lido', endDate: '2026-10-05', journal: b.journal }).journal.length, 2);
});

test('próximos da fila: só "Quero ler" existentes, sem repetir, até 5', () => {
  const books = [
    { id: 'w1', title: 'A', status: 'quero' }, { id: 'w2', title: 'B', status: 'quero' },
    { id: 'r1', title: 'C', status: 'lendo' }, ...['w3', 'w4', 'w5', 'w6'].map((id) => ({ id, title: id, status: 'quero' })),
  ];
  const state = normalizeState({ books, upNext: ['w2', 'r1', 'x', 'w2', 'w1', 'w3', 'w4', 'w5', 'w6'] });
  assert.deepEqual(state.upNext, ['w2', 'w1', 'w3', 'w4', 'w5']);
  assert.deepEqual(setUpNext(state, ['w6', 'r1']).upNext, ['w6']);
  // Começou a ler ou excluiu: sai dos próximos.
  const { state: started } = upsertBook(state, { ...state.books.find((b) => b.id === 'w2'), status: 'lendo' });
  assert.deepEqual(started.upNext, ['w1', 'w3', 'w4', 'w5']);
  assert.deepEqual(removeBook(started, 'w1').upNext, ['w3', 'w4', 'w5']);
});

test('meta de páginas por ano, sem padrão', () => {
  let state = normalizeState({ pageGoals: { 2026: '8000', 2025: 0, abc: 10 } });
  assert.deepEqual(state.pageGoals, { 2026: 8000 });
  assert.equal(getPageGoal(state, 2026), 8000);
  assert.equal(getPageGoal(state, 2027), null);
  state = setPageGoal(state, 2027, 5000);
  assert.equal(getPageGoal(state, 2027), 5000);
  state = setPageGoal(state, 2026, null);
  assert.deepEqual(state.pageGoals, { 2027: 5000 });
  assert.deepEqual(createEmptyState().pageGoals, {});
});

test('allTags ordena pelas mais usadas', () => {
  const state = normalizeState({
    books: [
      { title: 'A', tags: ['ficção', 'clássico'] },
      { title: 'B', tags: ['clássico', 'brasil'] },
      { title: 'C', tags: ['clássico', 'ficção'] },
    ],
  });
  assert.deepEqual(allTags(state), ['clássico', 'ficção', 'brasil']);
  assert.deepEqual(allTags(createEmptyState()), []);
});

test('releitura mantém série e tags, mas começa diário e citações do zero', () => {
  let state = createEmptyState();
  ({ state } = upsertBook(state, {
    id: 'a', title: 'Duna', status: 'lido', endDate: '2025-05-01', series: 'Duna', seriesNumber: 1, tags: ['sci-fi'],
    quotes: [{ text: 'O medo mata a mente.' }], journal: [{ date: '2025-05-01', from: 0, to: 100, unit: 'page' }],
  }));
  const { book } = startReread(state, 'a', '2026-10-16');
  assert.equal(book.series, 'Duna');
  assert.equal(book.seriesNumber, 1);
  assert.deepEqual(book.tags, ['sci-fi']);
  assert.deepEqual(book.quotes, []);
  assert.deepEqual(book.journal, []);
});

test('backup da versão 1 continua sendo importado', () => {
  const text = JSON.stringify({
    app: 'leituras', schemaVersion: 1, exportedAt: NOW,
    data: {
      version: 1, goals: { 2026: 12 }, defaultGoal: 12, customGenres: [], lastBackupAt: null,
      books: [{ id: 'a', title: 'A', status: 'lido', endDate: '2026-02-01', rating: 4, createdAt: NOW, updatedAt: NOW }],
    },
  });
  const state = parseBackup(text);
  assert.equal(state.version, SCHEMA_VERSION);
  assert.equal(state.books[0].rating, 4);
  assert.deepEqual(state.upNext, []);
  assert.deepEqual(state.pageGoals, {});
  assert.equal(JSON.parse(serializeBackup(state, NOW)).schemaVersion, 2);
});

test('backup da versão 2 preserva os campos novos', () => {
  let state = createEmptyState();
  ({ state } = upsertBook(state, {
    id: 'a', title: 'A', status: 'lido', endDate: '2026-09-21', rating: 4.5, series: 'S', seriesNumber: 2,
    tags: ['t'], quotes: [{ id: 'q', text: 'citação', createdAt: NOW }],
    journal: [{ date: '2026-09-20', from: 10, to: 50, unit: 'page', note: '' }],
  }, NOW));
  ({ state } = upsertBook(state, { id: 'w', title: 'W', status: 'quero' }, NOW));
  state = setUpNext(setPageGoal(state, 2026, 9000), ['w']);
  assert.deepEqual(parseBackup(serializeBackup(state, NOW)), state);
});

// ---------- Armazenamento: IndexedDB com migração do localStorage ----------

/** Armazenamento assíncrono falso, como o db.js. */
function memoryKv({ mode = 'indexeddb', corrupt = false, failSet = false, failGet = false } = {}) {
  const data = new Map();
  return {
    data,
    storageMode: async () => {
      if (mode === 'broken') throw new Error('IndexedDB não abriu');
      return mode;
    },
    getItem: async (k) => {
      if (failGet) throw new Error('falha');
      if (!data.has(k)) return null;
      const v = structuredClone(data.get(k));
      if (corrupt && v.books) v.books = v.books.slice(1);
      return v;
    },
    setItem: async (k, v) => {
      if (failSet) throw new Error('QuotaExceededError');
      data.set(k, structuredClone(v));
    },
    removeItem: async (k) => { data.delete(k); },
  };
}

function legacyWith(state) {
  const storage = memoryStorage();
  storage.setItem(STORAGE_KEY, JSON.stringify(state));
  return storage;
}

const v1State = {
  version: 1, goals: { 2026: 12 }, defaultGoal: 12, customGenres: ['Engenharia'], lastBackupAt: null,
  books: [
    { id: 'a', title: 'A', status: 'lido', endDate: '2026-02-01', rating: 4, createdAt: NOW, updatedAt: NOW },
    { id: 'b', title: 'B', status: 'lendo', currentPage: 30, pages: 200, createdAt: NOW, updatedAt: NOW },
  ],
};

test('migração: copia do localStorage, confere e só então apaga', async () => {
  const kv = memoryKv();
  const legacy = legacyWith(v1State);
  const opened = await openStoredState(kv, legacy);
  assert.equal(opened.migrated, true);
  assert.equal(opened.backend, 'kv');
  assert.equal(opened.state.books.length, 2);
  assert.deepEqual(kv.data.get(DB_STATE_KEY), v1State, 'cópia idêntica ao JSON original');
  assert.equal(legacy.getItem(STORAGE_KEY), null);
  // Segunda abertura: lê do IndexedDB.
  const again = await openStoredState(kv, legacy);
  assert.equal(again.migrated, false);
  assert.equal(again.backend, 'kv');
  assert.deepEqual(again.state, opened.state);
});

test('migração: marca "dados no IndexedDB" de novo depois de liberar o localStorage', async () => {
  // Com o localStorage cheio (muitas capas por foto na 1.2), a marca gravada junto
  // com a cópia pode ser recusada; apagada a chave antiga, já cabe.
  const kv = memoryKv();
  const legacy = legacyWith(v1State);
  const marks = [];
  kv.markStored = () => marks.push(legacy.getItem(STORAGE_KEY));
  await openStoredState(kv, legacy);
  assert.deepEqual(marks, [null], 'marca pedida depois de apagar a chave antiga');
  // Cópia que falhou não marca.
  const bad = memoryKv({ corrupt: true });
  bad.markStored = () => assert.fail('não devia marcar');
  await openStoredState(bad, legacyWith(v1State));
});

test('migração: cópia diferente mantém o localStorage e continua usando ele', async () => {
  const kv = memoryKv({ corrupt: true });
  const legacy = legacyWith(v1State);
  const opened = await openStoredState(kv, legacy);
  assert.equal(opened.migrated, false);
  assert.equal(opened.backend, 'legacy');
  assert.equal(opened.state.books.length, 2);
  assert.deepEqual(JSON.parse(legacy.getItem(STORAGE_KEY)), v1State);
  assert.equal(kv.data.has(DB_STATE_KEY), false, 'cópia incompleta é removida');
  // Salvar continua indo para o localStorage.
  const next = { ...opened.state, defaultGoal: 20 };
  assert.equal(await writeStoredState(opened.backend, kv, legacy, next), true);
  assert.equal(JSON.parse(legacy.getItem(STORAGE_KEY)).defaultGoal, 20);
});

test('migração: gravação recusada mantém o localStorage', async () => {
  const legacy = legacyWith(v1State);
  const opened = await openStoredState(memoryKv({ failSet: true }), legacy);
  assert.equal(opened.backend, 'legacy');
  assert.equal(opened.state.books.length, 2);
  assert.ok(legacy.getItem(STORAGE_KEY));
});

test('sem IndexedDB: segue no localStorage como antes', async () => {
  const legacy = legacyWith(v1State);
  const kv = memoryKv({ mode: 'localstorage' });
  const opened = await openStoredState(kv, legacy);
  assert.equal(opened.backend, 'legacy');
  assert.equal(opened.state.books.length, 2);
  assert.ok(legacy.getItem(STORAGE_KEY));
  assert.equal(kv.data.size, 0);
});

test('IndexedDB com os dados, mas fora do ar: não mostra vazio como se fosse o normal', async () => {
  const opened = await openStoredState(memoryKv({ mode: 'broken' }), memoryStorage());
  assert.equal(opened.error, true);
  assert.equal(opened.backend, null);
  assert.equal(await writeStoredState(null, memoryKv(), memoryStorage(), createEmptyState()), false);
  const failRead = await openStoredState(memoryKv({ failGet: true }), memoryStorage());
  assert.equal(failRead.error, true);
});

test('primeira abertura sem dados em lugar nenhum', async () => {
  const opened = await openStoredState(memoryKv(), memoryStorage());
  assert.deepEqual(opened.state, createEmptyState());
  assert.equal(opened.backend, 'kv');
  assert.equal(opened.error, false);
});

test('localStorage corrompido não é apagado nem atrapalha', async () => {
  const legacy = memoryStorage();
  legacy.setItem(STORAGE_KEY, '{quebrado');
  const kv = memoryKv();
  const opened = await openStoredState(kv, legacy);
  assert.equal(opened.backend, 'kv');
  assert.equal(legacy.getItem(STORAGE_KEY), '{quebrado');
});

test('writeStoredState grava no kv e avisa falha', async () => {
  const kv = memoryKv();
  const state = normalizeState(v1State);
  assert.equal(await writeStoredState('kv', kv, memoryStorage(), state), true);
  assert.deepEqual(kv.data.get(DB_STATE_KEY), state);
  assert.equal(await writeStoredState('kv', memoryKv({ failSet: true }), memoryStorage(), state), false);
});

test('jsonEqual', () => {
  assert.equal(jsonEqual({ a: 1, b: [1, { c: null }] }, { b: [1, { c: null }], a: 1 }), true);
  assert.equal(jsonEqual({ a: 1 }, { a: 1, b: 2 }), false);
  assert.equal(jsonEqual([1, 2], [2, 1]), false);
  assert.equal(jsonEqual({ a: [] }, { a: {} }), false);
  assert.equal(jsonEqual(null, {}), false);
});
