import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createEmptyState, upsertBook } from '../app/js/store.js';
import {
  allTimeStats, booksReadInYear, countByStatus, droppedInYear, filterBooks, goalStreak, monthlyTarget, monthsMetInYear, splitAuthors, yearStats, yearsWithData,
} from '../app/js/stats.js';

const TODAY = '2026-10-16';

function build(list) {
  let state = createEmptyState();
  list.forEach((b, i) => {
    ({ state } = upsertBook(state, { id: `b${i}`, format: 'fisico', ...b }, '2026-10-16T12:00:00.000Z'));
  });
  return state.books;
}

const read = (title, endDate, extra = {}) => ({ title, status: 'lido', endDate, ...extra });

test('monthlyTarget', () => {
  assert.equal(monthlyTarget(12), 1);
  assert.equal(monthlyTarget(13), 1);
  assert.equal(monthlyTarget(17), 1);
  assert.equal(monthlyTarget(6), 1);
  assert.equal(monthlyTarget(18), 2);
  assert.equal(monthlyTarget(24), 2);
});

test('splitAuthors separa coautores', () => {
  assert.deepEqual(splitAuthors('James P. Womack, Daniel T. Jones'), ['James P. Womack', 'Daniel T. Jones']);
  assert.deepEqual(splitAuthors('Womack e Jones'), ['Womack', 'Jones']);
  assert.deepEqual(splitAuthors('Machado de Assis'), ['Machado de Assis']);
  assert.deepEqual(splitAuthors(''), []);
});

test('yearStats calcula os indicadores do ano', () => {
  const books = build([
    read('A Meta', '2026-09-21', { startDate: '2026-09-03', pages: 384, rating: 5, genre: 'Gestão', authors: 'Eliyahu M. Goldratt', favorite: true }),
    read('1984', '2026-06-10', { startDate: '2026-06-01', pages: 416, rating: 4, genre: 'Ficção', authors: 'George Orwell', format: 'kindle' }),
    read('A Revolução dos Bichos', '2026-06-25', { pages: 152, rating: 4, genre: 'Ficção', authors: 'George Orwell' }),
    read('Livro de 2025', '2025-12-31', { pages: 100, rating: 1 }),
    { title: 'Lendo', status: 'lendo', startDate: '2026-10-01' },
  ]);
  const s = yearStats(books, 2026, 12, TODAY);
  assert.equal(s.count, 3);
  assert.equal(s.pages, 952);
  assert.equal(s.avgRating, 13 / 3);
  assert.equal(s.avgDays, (19 + 10) / 2);
  assert.equal(s.remaining, 9);
  assert.equal(s.progress, 0.25);
  assert.equal(s.favorite.title, 'A Meta');
  assert.deepEqual(s.byMonth, [0, 0, 0, 0, 0, 2, 0, 0, 1, 0, 0, 0]);
  assert.deepEqual(s.formats, { fisico: 2, kindle: 1, audio: 0 });
  assert.deepEqual(s.genres[0], { label: 'Ficção', count: 2 });
  assert.deepEqual(s.authors[0], { label: 'George Orwell', count: 2 });
  assert.equal(s.books[0].title, 'A Meta');
  assert.equal(Math.round(s.pagesPerDay * 100) / 100, Math.round((952 / 289) * 100) / 100);
});

test('yearStats de um ano vazio não quebra', () => {
  const s = yearStats([], 2026, 12, TODAY);
  assert.equal(s.count, 0);
  assert.equal(s.avgRating, null);
  assert.equal(s.avgDays, null);
  assert.equal(s.favorite, null);
  assert.equal(s.progress, 0);
});

test('progresso não passa de 100%', () => {
  const books = build(Array.from({ length: 14 }, (_, i) => read(`L${i}`, '2026-02-01')));
  const s = yearStats(books, 2026, 12, TODAY);
  assert.equal(s.progress, 1);
  assert.equal(s.remaining, 0);
});

test('sequência de meses batendo a meta', () => {
  const months = ['01', '02', '03', '04', '05', '06', '07', '08', '09'];
  const books = build(months.map((m) => read(`L${m}`, `2026-${m}-15`)));
  // Outubro ainda sem livro: não quebra a sequência.
  assert.deepEqual(goalStreak(books, () => 12, TODAY), { current: 9, best: 9 });
  // Com outubro lido, conta 10.
  const more = build([...months.map((m) => read(`L${m}`, `2026-${m}-15`)), read('Out', '2026-10-02')]);
  assert.deepEqual(goalStreak(more, () => 12, TODAY), { current: 10, best: 10 });
});

test('sequência quebra em mês sem leitura e guarda o recorde', () => {
  const books = build([
    read('a', '2025-11-10'), read('b', '2025-12-10'), read('c', '2026-01-10'),
    read('d', '2026-03-10'), read('e', '2026-04-10'),
  ]);
  assert.deepEqual(goalStreak(books, () => 12, '2026-05-20'), { current: 2, best: 3 });
  assert.deepEqual(goalStreak(books, () => 12, '2026-06-01'), { current: 0, best: 3 });
});

test('sequência respeita a meta mensal maior', () => {
  const books = build([read('a', '2026-01-05'), read('b', '2026-01-20'), read('c', '2026-02-05')]);
  assert.deepEqual(goalStreak(books, () => 24, '2026-03-10'), { current: 0, best: 1 });
  assert.deepEqual(goalStreak([], () => 12, TODAY), { current: 0, best: 0 });
});

test('monthsMetInYear', () => {
  assert.equal(monthsMetInYear([1, 0, 2, 1, 0, 0, 0, 0, 0, 0, 0, 0], 1), 3);
  assert.equal(monthsMetInYear([1, 0, 2, 1, 0, 0, 0, 0, 0, 0, 0, 0], 2), 1);
});

test('yearsWithData inclui o ano atual e ordena do mais recente', () => {
  const books = build([read('a', '2024-05-01'), read('b', '2025-05-01')]);
  assert.deepEqual(yearsWithData(books, 2026), [2026, 2025, 2024]);
  assert.deepEqual(yearsWithData([], 2026), [2026]);
});

test('booksReadInYear e countByStatus', () => {
  const books = build([read('a', '2026-01-01'), read('b', '2026-03-01'), { title: 'c', status: 'quero' }]);
  assert.deepEqual(booksReadInYear(books, 2026).map((b) => b.title), ['b', 'a']);
  assert.deepEqual(countByStatus(books), { quero: 1, lendo: 0, lido: 2, abandonado: 0 });
});

test('filterBooks combina texto (sem acento) e filtros', () => {
  const books = build([
    read('Sapiens', '2025-08-01', { authors: 'Yuval Noah Harari', genre: 'História', rating: 5 }),
    read('Hábitos Atômicos', '2026-05-01', { authors: 'James Clear', genre: 'Desenvolvimento pessoal', rating: 4, format: 'kindle' }),
    { title: 'O Modelo Toyota', status: 'quero', notes: 'indicação da obra' },
  ]);
  assert.deepEqual(filterBooks(books, { q: 'habitos' }).map((b) => b.title), ['Hábitos Atômicos']);
  assert.deepEqual(filterBooks(books, { q: 'OBRA' }).map((b) => b.title), ['O Modelo Toyota']);
  assert.deepEqual(filterBooks(books, { year: '2025' }).map((b) => b.title), ['Sapiens']);
  assert.deepEqual(filterBooks(books, { format: 'kindle' }).map((b) => b.title), ['Hábitos Atômicos']);
  assert.deepEqual(filterBooks(books, { minRating: '5' }).map((b) => b.title), ['Sapiens']);
  assert.deepEqual(filterBooks(books, { status: 'quero' }).map((b) => b.title), ['O Modelo Toyota']);
  assert.equal(filterBooks(books, {}).length, 3);
});

test('livros abandonados não contam para meta, nota nem sequência', () => {
  const books = build([
    read('Lido', '2026-03-10', { rating: 4 }),
    { title: 'Larguei', status: 'abandonado', startDate: '2026-04-01', endDate: '2026-04-20', dropReason: 'Não prendeu' },
  ]);
  const s = yearStats(books, 2026, 12, TODAY);
  assert.equal(s.count, 1);
  assert.equal(s.avgRating, 4);
  assert.deepEqual(droppedInYear(books, 2026).map((b) => b.title), ['Larguei']);
  assert.deepEqual(droppedInYear(books, 2025), []);
});

test('allTimeStats soma todos os anos', () => {
  const books = build([
    read('a', '2024-02-01', { pages: 100, rating: 5, authors: 'X', genre: 'Gestão' }),
    read('b', '2024-05-01', { pages: 200, rating: 3, authors: 'X', genre: 'Gestão', format: 'kindle' }),
    read('c', '2025-07-01', { pages: 300, rating: 4, authors: 'Y', genre: 'Ficção', reread: true }),
    read('d', '2026-01-01', { authors: 'Z' }),
    { title: 'e', status: 'abandonado', endDate: '2026-02-01' },
  ]);
  const s = allTimeStats(books, TODAY);
  assert.equal(s.count, 4);
  assert.equal(s.pages, 600);
  assert.equal(s.avgRating, 4);
  assert.deepEqual(s.years, [{ year: 2026, count: 1 }, { year: 2025, count: 1 }, { year: 2024, count: 2 }]);
  assert.equal(s.avgPerYear, 1.5);
  assert.deepEqual(s.bestYear, { year: 2024, count: 2 });
  assert.deepEqual(s.authors[0], { label: 'X', count: 2 });
  assert.deepEqual(s.genres[0], { label: 'Gestão', count: 2 });
  assert.deepEqual(s.formats, { fisico: 3, kindle: 1, audio: 0 });
  assert.equal(s.rereads, 1);
  assert.equal(s.dropped, 1);
});

test('yearStats e allTimeStats: páginas pela regra do diário (pagesReadInYear)', () => {
  const books = build([
    // Lido sem diário: total no ano do término.
    read('Sem diário', '2026-03-01', { pages: 200 }),
    // Lido com diário atravessando o ano: 60 em 2025, 40 em 2026.
    read('Virada', '2026-01-03', { pages: 100, journal: [
      { date: '2025-12-30', from: 0, to: 60, unit: 'page' },
      { date: '2026-01-03', from: 60, to: 100, unit: 'page' },
    ] }),
    // Em andamento: as páginas do diário contam no ano, o livro não conta na meta.
    { title: 'Lendo', status: 'lendo', startDate: '2026-10-01', pages: 300, currentPage: 50, journal: [{ date: '2026-10-02', from: 0, to: 50, unit: 'page' }] },
  ]);
  const s = yearStats(books, 2026, 12, TODAY);
  assert.equal(s.count, 2);
  assert.equal(s.pages, 200 + 40 + 50);
  assert.equal(s.pagesKnown, 2);
  assert.equal(yearStats(books, 2025, 12, TODAY).pages, 60);
  assert.equal(allTimeStats(books, TODAY).pages, 350);
});

test('allTimeStats no primeiro ano e sem livros', () => {
  const first = allTimeStats(build([read('a', '2026-01-01'), read('b', '2026-02-01')]), TODAY);
  assert.equal(first.avgPerYear, 2);
  assert.deepEqual(first.years, [{ year: 2026, count: 2 }]);
  const empty = allTimeStats([], TODAY);
  assert.equal(empty.count, 0);
  assert.equal(empty.bestYear, null);
});
