// QA da 1.6: o que as partes fazem juntas. Um livro com TODOS os campos novos atravessa
// backup, planilha, ficha e comparação sem perder nada; backups antigos entram iguais;
// nada do aparelho (chaves de IA, nome, cor) vai para backup nem para link.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  STATUS, createEmptyState, normalizeBook, normalizeState, parseBackup, pauseReading, serializeBackup, startReread, upsertBook,
} from '../app/js/store.js';
import { booksToCsv, bookCsvRow, CSV_COLUMNS } from '../app/js/csv.js';
import { buildSnapshot, compareLink, decodeSnapshot, encodeSnapshot, validateSnapshot } from '../app/js/compare.js';
import { applyImport, planImport, undoImport } from '../app/js/goodreads.js';
import { addMinutes, journalOnSave, recordProgress } from '../app/js/journal.js';
import { challengeProgress } from '../app/js/challenges.js';
import { readFileSync } from 'node:fs';

const TS = '2026-01-01T00:00:00.000Z';
const full = (extra = {}) => ({
  id: 'x1', title: 'Torto Arado', authors: 'Itamar Vieira Junior, Outra Pessoa', pages: 260, cover: null, isbn: '9788582851579',
  status: 'lido', startDate: '2026-02-01', endDate: '2026-02-20', currentPage: null, currentPercent: null, currentMin: null,
  durationMin: 720, format: 'audio', genre: 'Ficção', rating: 4.5, favorite: true, notes: 'Anotação; com "aspas"\ne quebra.',
  dropReason: '', reread: true, series: 'Série X', seriesNumber: 2, tags: ['Brasil', 'Clássico'], targetDate: null,
  quotes: [{ id: 'q1', text: 'Trecho', page: 12, percent: null, note: 'n', createdAt: TS }],
  journal: [{ date: '2026-02-10', from: 0, to: 300, unit: 'minute', note: 'bom', minutes: 40, hours: { 21: 30, 22: 10 } }],
  moods: ['reflexivo', 'triste'], pace: 'lento', criteria: { personagens: 5, enredo: 4, escrita: 4.5 },
  description: 'Sinopse com acento e “aspas”.', loan: { to: 'Ana', since: '2026-03-01' },
  createdAt: TS, updatedAt: TS, ...extra,
});

test('livro com todos os campos novos: normalizar de novo não muda nada', () => {
  const b = normalizeBook(full(), TS);
  assert.deepEqual(normalizeBook(b, TS), b);
  for (const k of ['moods', 'pace', 'criteria', 'description', 'loan', 'durationMin', 'journal']) assert.ok(b[k] && (typeof b[k] !== 'object' || Object.keys(b[k]).length), `${k} ficou`);
  assert.deepEqual(b.journal[0].hours, { 21: 30, 22: 10 });
  assert.equal(b.journal[0].unit, 'minute');
});

test('backup: ida e volta com todos os campos, desafios e diário em minutos', () => {
  const state = normalizeState({
    version: 2, books: [normalizeBook(full(), TS), normalizeBook(full({ id: 'x2', title: 'Duna', status: 'lendo', startDate: '2026-10-01', endDate: null, currentMin: 300, rating: null, favorite: false, criteria: {} }), TS)],
    goals: { 2026: 20 }, defaultGoal: 12, customGenres: ['Poesia'], upNext: [], pageGoals: { 2026: 5000 },
    challenges: [{ id: 'c1', year: 2026, title: 'Meu', target: 2, rule: { type: 'tag', value: 'Clássico' }, books: [] }, { id: 'c2', year: 2026, title: '', target: 1, rule: { type: 'manual', value: null }, books: ['x1'] }],
  });
  const back = parseBackup(serializeBackup(state, TS));
  assert.deepEqual(back, state);
  assert.equal(back.books[1].currentMin, 300);
  assert.equal(back.challenges.length, 2);
  assert.deepEqual(back.challenges[1].books, ['x1']);
});

test('backup antigo da 1.5 (sem nenhum campo novo) entra com valores vazios e o resto igual', () => {
  const old = {
    app: 'leituras', schemaVersion: 2, exportedAt: TS,
    data: {
      version: 2, goals: { 2025: 10 }, defaultGoal: 12, customGenres: [], lastBackupAt: null, upNext: ['q'], pageGoals: {},
      books: [
        { id: 'a', title: 'Antigo', authors: 'A', pages: 100, cover: null, isbn: '', status: 'lido', startDate: '2025-01-01', endDate: '2025-01-10', currentPage: null, currentPercent: null, format: 'fisico', genre: 'Ficção', rating: 4, favorite: false, notes: 'n', dropReason: '', reread: false, series: '', seriesNumber: null, tags: ['x'], targetDate: null, quotes: [], journal: [{ date: '2025-01-05', from: 0, to: 50, unit: 'page', note: '' }], createdAt: TS, updatedAt: TS },
        { id: 'q', title: 'Quero', authors: '', pages: null, status: 'quero', format: 'kindle', createdAt: TS, updatedAt: TS },
      ],
    },
  };
  // O app guarda o nome do app no backup; usa o valor real.
  const real = JSON.parse(serializeBackup(createEmptyState(), TS));
  old.app = real.app;
  const s = parseBackup(JSON.stringify(old));
  const a = s.books[0];
  assert.equal(a.title, 'Antigo');
  assert.equal(a.rating, 4);
  assert.deepEqual(a.journal, [{ date: '2025-01-05', from: 0, to: 50, unit: 'page', note: '' }]);
  assert.deepEqual([a.moods, a.pace, a.criteria, a.description, a.loan, a.durationMin, a.currentMin], [[], null, {}, '', null, null, null]);
  assert.deepEqual(s.challenges, []);
  assert.deepEqual(s.upNext, ['q']);
  assert.equal(s.pageGoals && Object.keys(s.pageGoals).length, 0);
});

test('backup nunca leva chaves de IA, nome, cor, tema nem tamanho de texto', () => {
  const text = serializeBackup(normalizeState({ books: [normalizeBook(full(), TS)] }), TS);
  assert.doesNotMatch(text, /AIza|geminiKey|googleBooksKey|leituras:|iaUso|comparacao|sugestoes/i);
});

test('planilha: uma coluna para cada campo novo e a linha bate com o cabeçalho', () => {
  const b = normalizeBook(full(), TS);
  const row = bookCsvRow(b);
  assert.equal(row.length, CSV_COLUMNS.length);
  const get = (name) => row[CSV_COLUMNS.indexOf(name)];
  assert.equal(get('Duração'), '12h');
  assert.equal(get('Humor'), 'Reflexivo, Triste');
  assert.equal(get('Ritmo'), 'Lento');
  assert.equal(get('Personagens'), '5');
  assert.equal(get('Escrita'), '4,5');
  assert.equal(get('Emprestado para'), 'Ana');
  assert.equal(get('Emprestado desde'), '01/03/2026');
  assert.match(booksToCsv([b]), /"Anotação; com ""aspas""\ne quebra\."/);
});

test('comparar: o resumo não leva anotações, chaves, empréstimo nem sinopse e não mexe nos livros', async () => {
  const state = normalizeState({ books: [normalizeBook(full(), TS)], goals: { 2026: 12 } });
  const before = JSON.stringify(state);
  const snap = buildSnapshot(state, 2026, '2026-10-26', { name: 'Eu', withBooks: true });
  assert.equal(JSON.stringify(state), before, 'não altera o estado');
  const param = await encodeSnapshot(snap);
  const link = compareLink('https://x.test/app/', param);
  assert.doesNotMatch(link, /AIza|Ana|Sinopse|Anotação/);
  const json = JSON.stringify(decodeSnapshot(param));
  assert.doesNotMatch(json, /Ana|Sinopse|Anotação|Brasil|Clássico|AIza|isbn|9788582851579/);
  assert.deepEqual(validateSnapshot(JSON.parse(JSON.stringify(snap))), snap);
  assert.equal(snap.c, 1);
});

test('pauseReading zera a posição em qualquer formato (incluindo minutos) e o diário; guarda humor, trechos e empréstimo', () => {
  const state = normalizeState({ books: [normalizeBook(full({ status: 'lendo', endDate: null, currentMin: 300, rating: null, favorite: false, criteria: {}, targetDate: '2026-12-01' }), TS)] });
  const { state: next, before } = pauseReading(state, 'x1', TS);
  assert.equal(before.currentMin, 300);
  const b = next.books[0];
  assert.deepEqual([b.status, b.startDate, b.currentMin, b.currentPage, b.currentPercent, b.targetDate, b.journal], [STATUS.WANT, null, null, null, null, null, []]);
  assert.deepEqual([b.moods, b.pace, b.loan, b.durationMin, b.quotes.length], [['reflexivo', 'triste'], 'lento', { to: 'Ana', since: '2026-03-01' }, 720, 1]);
});

test('reler copia o cadastro (incluindo duração e sinopse) e não leva leitura, humor, critérios nem empréstimo', () => {
  const state = normalizeState({ books: [normalizeBook(full(), TS)] });
  const { book } = startReread(state, 'x1', '2026-10-26', TS);
  assert.equal(book.durationMin, 720);
  assert.equal(book.format, 'audio');
  assert.equal(book.description, 'Sinopse com acento e “aspas”.');
  assert.equal(book.status, STATUS.READING);
  assert.equal(book.reread, true);
  assert.deepEqual([book.moods, book.pace, book.criteria, book.loan, book.journal, book.quotes, book.rating, book.currentMin], [[], null, {}, null, [], [], null, null]);
});

test('cronômetro de audiolivro: minutos e horas entram juntos e somam; posição em minutos', () => {
  const audio = normalizeBook(full({ status: 'lendo', endDate: null, currentMin: 300, journal: [], rating: null, favorite: false, criteria: {} }), TS);
  const j1 = addMinutes(audio, 20, '2026-10-27', { 12: 20 });
  assert.deepEqual(j1, [{ date: '2026-10-27', from: 300, to: 300, unit: 'minute', note: '', minutes: 20, hours: { 12: 20 } }]);
  const j2 = addMinutes({ ...audio, journal: j1 }, 15, '2026-10-27', { 12: 5, 13: 10 });
  assert.equal(j2[0].minutes, 35);
  assert.deepEqual(j2[0].hours, { 12: 25, 13: 10 });
  const j3 = recordProgress({ ...audio, journal: j2 }, 435, 'minute', '2026-10-27');
  assert.equal(j3[0].to, 435);
  assert.equal(j3[0].minutes, 35);
  assert.deepEqual(j3[0].hours, { 12: 25, 13: 10 });
});

test('trocar o formato de um livro lendo (físico → audio) mantém a duração e não inventa leitura', () => {
  const orig = normalizeBook(full({ status: 'lendo', endDate: null, format: 'fisico', currentPage: 40, journal: [], rating: null, favorite: false, criteria: {} }), TS);
  const edited = { ...orig, format: 'audio', currentMin: 120 };
  assert.deepEqual(journalOnSave(edited, orig, '2026-10-27'), []);
  const saved = normalizeBook(edited, TS);
  assert.equal(saved.currentPage, null);
  assert.equal(saved.currentMin, 120);
  assert.equal(saved.durationMin, 720);
});

test('desafio de livro escolhido conta o livro lido com todos os campos', () => {
  const state = normalizeState({
    books: [normalizeBook(full(), TS)],
    challenges: [{ id: 'c', year: 2026, title: '', target: 1, rule: { type: 'format', value: 'audio' }, books: [] }],
  });
  const p = challengeProgress(state.challenges[0], state.books);
  assert.equal(p.count, 1);
  assert.equal(p.done, true);
});

test('Goodreads: o que importa já passa por normalizeBook e o desfazer deixa o estado exatamente como estava', () => {
  const csv = readFileSync(new URL('./fixtures/goodreads_library_export.csv', import.meta.url), 'utf8');
  const state = normalizeState({ books: [normalizeBook(full(), TS)], upNext: [] });
  const snapshot = JSON.stringify(state);
  const plan = planImport(state, csv, TS);
  assert.ok(!plan.error);
  assert.ok(plan.books.length > 0);
  for (const b of plan.books) assert.deepEqual(normalizeBook(b, TS), b, b.title);
  const { state: after, ids } = applyImport(state, plan);
  assert.equal(after.books.length, state.books.length + ids.length);
  assert.equal(JSON.stringify(state), snapshot, 'importar não altera o estado de antes');
  assert.equal(JSON.stringify(undoImport(after, ids)), snapshot);
  // O estado depois de importar sobrevive ao backup.
  assert.deepEqual(parseBackup(serializeBackup(after, TS)), after);
});

test('salvar um livro lendo pelo upsert mantém empréstimo, sinopse e humor', () => {
  const state = normalizeState({ books: [normalizeBook(full({ status: 'lendo', endDate: null, rating: null, favorite: false, criteria: {} }), TS)] });
  const { book } = upsertBook(state, { ...state.books[0], notes: 'novo' }, TS);
  assert.deepEqual([book.loan, book.description, book.moods, book.pace], [{ to: 'Ana', since: '2026-03-01' }, 'Sinopse com acento e “aspas”.', ['reflexivo', 'triste'], 'lento']);
});
