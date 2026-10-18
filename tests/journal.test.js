import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  closeOnFinish, entryPages, longestDayStreak, pagesReadInYear, pagesReadPerDay, readingDays, recordProgress, unitOf,
} from '../app/js/journal.js';

const physical = (extra = {}) => ({ id: 'p', title: 'Físico', format: 'fisico', status: 'lendo', pages: 300, currentPage: null, journal: [], ...extra });
const kindle = (extra = {}) => ({ id: 'k', title: 'Kindle', format: 'kindle', status: 'lendo', pages: 400, currentPercent: null, journal: [], ...extra });

test('unidade: página no físico, % no Kindle', () => {
  assert.equal(unitOf(physical()), 'page');
  assert.equal(unitOf(kindle()), 'percent');
});

test('recordProgress parte da última posição conhecida', () => {
  // Sem diário nem página: parte do zero.
  assert.deepEqual(recordProgress(physical(), 40, 'page', '2026-10-01'), [
    { date: '2026-10-01', from: 0, to: 40, unit: 'page', note: '' },
  ]);
  // Sem diário, com página atual (livros da versão 1.2): parte dela.
  assert.deepEqual(recordProgress(physical({ currentPage: 100 }), 130, 'page', '2026-10-01'), [
    { date: '2026-10-01', from: 100, to: 130, unit: 'page', note: '' },
  ]);
  // Com diário: parte do 'to' da última entrada.
  const book = physical({ currentPage: 130, journal: [{ date: '2026-10-01', from: 100, to: 130, unit: 'page', note: '' }] });
  assert.deepEqual(recordProgress(book, 160, 'page', '2026-10-02')[1], { date: '2026-10-02', from: 130, to: 160, unit: 'page', note: '' });
});

test('recordProgress junta o mesmo dia: mantém o from do dia e atualiza o to', () => {
  let book = physical({ currentPage: 50 });
  book = { ...book, journal: recordProgress(book, 60, 'page', '2026-10-01'), currentPage: 60 };
  book = { ...book, journal: recordProgress(book, 75, 'page', '2026-10-01'), currentPage: 75 };
  assert.deepEqual(book.journal, [{ date: '2026-10-01', from: 50, to: 75, unit: 'page', note: '' }]);
  // Voltou para onde começou o dia: a entrada some.
  assert.deepEqual(recordProgress(book, 50, 'page', '2026-10-01'), []);
});

test('recordProgress ignora quando nada muda', () => {
  assert.deepEqual(recordProgress(physical({ currentPage: 80 }), 80, 'page', '2026-10-01'), []);
  const journal = [{ date: '2026-10-01', from: 50, to: 80, unit: 'page', note: '' }];
  assert.deepEqual(recordProgress(physical({ journal }), 80, 'page', '2026-10-02'), journal);
  assert.deepEqual(recordProgress(physical({ journal }), 80, 'page', '2026-10-01'), journal);
  assert.deepEqual(recordProgress(physical(), 'abc', 'page', '2026-10-01'), []);
});

test('recordProgress registra correção para trás (conta 0 páginas)', () => {
  const journal = [{ date: '2026-10-01', from: 0, to: 120, unit: 'page', note: '' }];
  const next = recordProgress(physical({ journal }), 100, 'page', '2026-10-02');
  assert.deepEqual(next[1], { date: '2026-10-02', from: 120, to: 100, unit: 'page', note: '' });
  assert.equal(entryPages(physical(), next[1]), 0);
});

test('recordProgress não altera o diário original', () => {
  const journal = [{ date: '2026-10-01', from: 0, to: 10, unit: 'page', note: '' }];
  const book = physical({ journal });
  recordProgress(book, 20, 'page', '2026-10-01');
  recordProgress(book, 30, 'page', '2026-10-02');
  assert.deepEqual(book.journal, [{ date: '2026-10-01', from: 0, to: 10, unit: 'page', note: '' }]);
});

test('Kindle registra em %', () => {
  const next = recordProgress(kindle({ currentPercent: 20 }), 35, 'percent', '2026-10-01');
  assert.deepEqual(next, [{ date: '2026-10-01', from: 20, to: 35, unit: 'percent', note: '' }]);
});

test('closeOnFinish termina no total do livro', () => {
  const journal = [{ date: '2026-10-01', from: 0, to: 120, unit: 'page', note: '' }];
  assert.deepEqual(closeOnFinish(physical({ currentPage: 120, journal }), '2026-10-05')[1],
    { date: '2026-10-05', from: 120, to: 300, unit: 'page', note: '' });
  // Mesmo dia de uma entrada: atualiza o to.
  assert.deepEqual(closeOnFinish(physical({ journal }), '2026-10-01'), [{ date: '2026-10-01', from: 0, to: 300, unit: 'page', note: '' }]);
  // Kindle: até 100%.
  assert.deepEqual(closeOnFinish(kindle({ currentPercent: 80 }), '2026-10-05'), [{ date: '2026-10-05', from: 80, to: 100, unit: 'percent', note: '' }]);
  // Físico sem total de páginas: não dá para saber onde termina.
  assert.deepEqual(closeOnFinish(physical({ pages: null, journal }), '2026-10-05'), journal);
});

test('pagesReadPerDay soma os livros e converte % do Kindle em páginas', () => {
  const books = [
    physical({ journal: [
      { date: '2026-10-01', from: 0, to: 40, unit: 'page', note: '' },
      { date: '2026-10-02', from: 40, to: 30, unit: 'page', note: '' },
    ] }),
    kindle({ journal: [{ date: '2026-10-01', from: 10, to: 15, unit: 'percent', note: '' }] }),
    kindle({ id: 'k2', title: 'Sem páginas', pages: null, journal: [{ date: '2026-10-03', from: 0, to: 10, unit: 'percent', note: '' }] }),
  ];
  const days = pagesReadPerDay(books);
  assert.deepEqual(days.get('2026-10-01'), {
    pages: 60,
    byBook: [{ id: 'p', title: 'Físico', pages: 40 }, { id: 'k', title: 'Kindle', pages: 20 }],
  });
  assert.equal(days.has('2026-10-02'), false, 'correção para trás não é dia de leitura');
  assert.deepEqual(days.get('2026-10-03'), { pages: 0, byBook: [{ id: 'k2', title: 'Sem páginas', pages: 0 }] });
});

test('readingDays e longestDayStreak', () => {
  const books = [
    physical({ journal: [
      { date: '2025-12-31', from: 0, to: 10, unit: 'page', note: '' },
      { date: '2026-01-01', from: 10, to: 20, unit: 'page', note: '' },
      { date: '2026-01-02', from: 20, to: 30, unit: 'page', note: '' },
      { date: '2026-01-05', from: 30, to: 25, unit: 'page', note: '' },
    ] }),
    kindle({ journal: [{ date: '2026-01-02', from: 0, to: 5, unit: 'percent', note: '' }, { date: '2026-01-04', from: 5, to: 9, unit: 'percent', note: '' }] }),
  ];
  assert.deepEqual([...readingDays(books, 2026)].sort(), ['2026-01-01', '2026-01-02', '2026-01-04']);
  assert.equal(readingDays(books).size, 4);
  assert.equal(longestDayStreak(readingDays(books)), 3);
  assert.equal(longestDayStreak(['2026-03-01', '2026-02-28', '2026-02-27', '2026-03-03']), 3);
  assert.equal(longestDayStreak(['2024-02-28', '2024-02-29', '2024-03-01']), 3);
  assert.equal(longestDayStreak(['2026-03-08', '2026-03-08']), 1);
  assert.equal(longestDayStreak([]), 0);
});

test('pagesReadInYear: diário quando existe, total do livro no ano do término quando não', () => {
  const books = [
    // Lido sem diário: 200 páginas em 2026.
    { id: 'a', title: 'A', status: 'lido', format: 'fisico', pages: 200, endDate: '2026-03-01', journal: [] },
    // Lido sem diário em 2025: não conta.
    { id: 'b', title: 'B', status: 'lido', format: 'fisico', pages: 500, endDate: '2025-03-01', journal: [] },
    // Lido com diário atravessando o ano: só as páginas de 2026.
    { id: 'c', title: 'C', status: 'lido', format: 'fisico', pages: 100, endDate: '2026-01-03', journal: [
      { date: '2025-12-30', from: 0, to: 60, unit: 'page', note: '' },
      { date: '2026-01-03', from: 60, to: 100, unit: 'page', note: '' },
    ] },
    // Lendo, Kindle: 10% de 300 páginas.
    { id: 'd', title: 'D', status: 'lendo', format: 'kindle', pages: 300, journal: [{ date: '2026-05-01', from: 20, to: 30, unit: 'percent', note: '' }] },
    // Abandonado com diário.
    { id: 'e', title: 'E', status: 'abandonado', format: 'fisico', pages: 400, endDate: '2026-06-01', journal: [{ date: '2026-05-20', from: 0, to: 50, unit: 'page', note: '' }] },
    // Lido com diário que começou no meio (livro da versão 1.2): o que falta entra no ano do término.
    { id: 'f', title: 'F', status: 'lido', format: 'fisico', pages: 300, endDate: '2026-10-10', journal: [{ date: '2026-10-10', from: 200, to: 300, unit: 'page', note: '' }] },
    // Quero ler: nunca conta.
    { id: 'g', title: 'G', status: 'quero', format: 'fisico', pages: 100, journal: [{ date: '2026-02-01', from: 0, to: 10, unit: 'page', note: '' }] },
  ];
  assert.equal(pagesReadInYear(books, 2026), 200 + 40 + 30 + 50 + 300);
  assert.equal(pagesReadInYear(books, 2025), 500 + 60);
  assert.equal(pagesReadInYear([], 2026), 0);
});
