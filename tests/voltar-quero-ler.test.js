import { test } from 'node:test';
import assert from 'node:assert/strict';
import { STATUS, FORMATS, createEmptyState, pauseReading, upsertBook } from '../app/js/store.js';
import { journalOnSave } from '../app/js/journal.js';
import { quickMenu } from '../app/js/views/sheets.js';

const NOW = '2026-10-27T12:00:00.000Z';

function withReading(extra = {}) {
  return upsertBook(createEmptyState(), {
    id: 'b1', title: 'Livro em pausa', pages: 300, status: STATUS.READING, startDate: '2026-10-01',
    currentPage: 120, targetDate: '2026-11-30', notes: 'minha nota', tags: ['clube'],
    quotes: [{ id: 'q1', text: 'Um trecho', createdAt: NOW }],
    journal: [{ date: '2026-10-02', from: 0, to: 60, unit: 'page' }, { date: '2026-10-05', from: 60, to: 120, unit: 'page' }],
    ...extra,
  }, NOW).state;
}

test('voltar para Quero ler: recomeça do zero e guarda trechos, anotações e etiquetas', () => {
  const { state, before } = pauseReading(withReading(), 'b1', NOW);
  const book = state.books.find((b) => b.id === 'b1');
  assert.equal(book.status, STATUS.WANT);
  assert.equal(book.startDate, null);
  assert.equal(book.currentPage, null);
  assert.equal(book.targetDate, null);
  assert.deepEqual(book.journal, []);
  assert.equal(book.notes, 'minha nota');
  assert.deepEqual(book.tags, ['clube']);
  assert.equal(book.quotes.length, 1);
  assert.equal(before.status, STATUS.READING);
  assert.equal(before.journal.length, 2);
});

test('voltar para Quero ler: Kindle zera a %', () => {
  const s = withReading({ format: FORMATS.KINDLE, currentPage: null, currentPercent: 40, journal: [] });
  const book = pauseReading(s, 'b1', NOW).state.books[0];
  assert.equal(book.currentPercent, null);
  assert.equal(book.status, STATUS.WANT);
});

test('voltar para Quero ler: desfazer devolve o livro como estava', () => {
  const { state, before } = pauseReading(withReading(), 'b1', NOW);
  const back = upsertBook(state, before, NOW).state.books[0];
  assert.equal(back.status, STATUS.READING);
  assert.equal(back.startDate, '2026-10-01');
  assert.equal(back.currentPage, 120);
  assert.equal(back.journal.length, 2);
});

test('voltar para Quero ler: só vale para livro em leitura', () => {
  const s = upsertBook(createEmptyState(), { id: 'x', title: 'Lido', status: STATUS.READ, endDate: '2026-10-01' }, NOW).state;
  const r = pauseReading(s, 'x', NOW);
  assert.equal(r.before, null);
  assert.equal(r.state, s);
  assert.equal(pauseReading(s, 'nao-existe', NOW).before, null);
});

test('formulário: trocar Lendo por Quero ler também zera o diário', () => {
  const original = withReading().books[0];
  const d = { ...original, status: STATUS.WANT };
  assert.deepEqual(journalOnSave(d, original, '2026-10-27'), []);
  // Livro que já estava em Quero ler: nada muda.
  const want = { ...original, status: STATUS.WANT };
  assert.equal(journalOnSave({ ...want }, want, '2026-10-27'), want.journal);
});

test('menu do livro em leitura tem "Voltar para Quero ler"; o de Quero ler não', () => {
  const s = withReading();
  assert.match(quickMenu(s.books[0], s), /data-action="pause-reading"[^>]*>.*Voltar para Quero ler/s);
  const want = pauseReading(s, 'b1', NOW).state;
  assert.doesNotMatch(quickMenu(want.books[0], want), /pause-reading/);
});
