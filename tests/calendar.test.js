import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  calendarData, dayDetail, defaultMonth, levelFor, monthGrid, weekdayMon, weeksOf, yearHalves,
} from '../app/js/calendar.js';

const entry = (date, from, to, unit = 'page') => ({ date, from, to, unit, note: '' });

test('weekdayMon: segunda = 0, domingo = 6', () => {
  assert.equal(weekdayMon('2026-01-01'), 3); // quinta
  assert.equal(weekdayMon('2026-10-12'), 0); // segunda
  assert.equal(weekdayMon('2026-10-18'), 6); // domingo
});

test('weeksOf: semanas de segunda a domingo cobrindo todos os dias', () => {
  const { weeks, monthStarts } = weeksOf(2026, 0, 11);
  const days = weeks.flat().filter(Boolean);
  assert.equal(days.length, 365);
  assert.equal(days[0], '2026-01-01');
  assert.equal(days.at(-1), '2026-12-31');
  assert.equal(weeks.length, 53);
  // 1º de janeiro de 2026 é quinta: posição 3 da primeira coluna.
  assert.deepEqual(weeks[0], [null, null, null, '2026-01-01', '2026-01-02', '2026-01-03', '2026-01-04']);
  assert.equal(monthStarts.length, 12);
  assert.deepEqual(monthStarts[0], { month: 0, week: 0 });
  // 1º de fevereiro de 2026 é domingo: ainda na semana 4 (a quinta coluna).
  assert.deepEqual(monthStarts[1], { month: 1, week: 4 });
  for (const w of weeks) assert.equal(w.length, 7);
});

test('yearHalves divide em jan–jun e jul–dez e cabe em 28 colunas', () => {
  for (const year of [2024, 2026, 2028, 2033]) {
    const [a, b] = yearHalves(year);
    assert.equal(a.weeks.flat().filter(Boolean)[0], `${year}-01-01`);
    assert.equal(a.weeks.flat().filter(Boolean).at(-1), `${year}-06-30`);
    assert.equal(b.weeks.flat().filter(Boolean)[0], `${year}-07-01`);
    assert.equal(b.weeks.flat().filter(Boolean).at(-1), `${year}-12-31`);
    assert.ok(a.weeks.length <= 28 && b.weeks.length <= 28, `${year}: ${a.weeks.length}/${b.weeks.length}`);
    assert.equal(a.monthStarts.length, 6);
  }
});

test('monthGrid: fevereiro de 2026 começa no domingo', () => {
  const grid = monthGrid(2026, 1);
  assert.deepEqual(grid[0], [null, null, null, null, null, null, '2026-02-01']);
  assert.equal(grid.flat().filter(Boolean).length, 28);
  assert.equal(grid.at(-1)[5], '2026-02-28');
  assert.equal(monthGrid(2024, 1).flat().filter(Boolean).length, 29);
});

test('levelFor: 4 tons por quantil, o maior sempre no tom 4', () => {
  const sorted = [10, 20, 30, 40];
  assert.deepEqual([10, 20, 30, 40].map((v) => levelFor(v, sorted)), [1, 2, 3, 4]);
  assert.equal(levelFor(50, [50]), 4);
  assert.deepEqual([5, 5, 5].map((v) => levelFor(v, [5, 5, 5])), [4, 4, 4]);
  const many = Array.from({ length: 8 }, (_, i) => (i + 1) * 10);
  assert.deepEqual(many.map((v) => levelFor(v, many)), [1, 1, 2, 2, 3, 3, 4, 4]);
  // Leitura sem páginas (Kindle sem total): tom mais claro.
  assert.equal(levelFor(0, many), 1);
});

const books = [
  { id: 'a', title: 'Livro X', status: 'lido', format: 'fisico', pages: 100, startDate: '2026-03-10', endDate: '2026-03-15', journal: [
    entry('2025-12-31', 0, 10),
    entry('2026-03-14', 10, 30),
    entry('2026-03-15', 30, 100),
  ] },
  { id: 'b', title: 'Livro Y', status: 'lendo', format: 'fisico', pages: 300, journal: [entry('2026-03-14', 0, 12), entry('2026-03-16', 12, 40)] },
  { id: 'k', title: 'Kindle sem páginas', status: 'lendo', format: 'kindle', pages: null, journal: [entry('2026-03-20', 0, 10, 'percent')] },
  { id: 'c', title: 'Sem diário', status: 'lido', format: 'fisico', pages: 200, endDate: '2026-05-02', journal: [] },
  { id: 'd', title: 'Larguei', status: 'abandonado', format: 'fisico', endDate: '2026-05-02', journal: [] },
  { id: 'e', title: 'Outro ano', status: 'lido', format: 'fisico', pages: 50, endDate: '2025-05-02', journal: [] },
];

test('calendarData: dias do ano, livros concluídos e abandonados, sequência', () => {
  const data = calendarData(books, 2026);
  assert.deepEqual([...data.days.keys()].sort(), ['2026-03-14', '2026-03-15', '2026-03-16', '2026-03-20']);
  assert.equal(data.days.get('2026-03-14').pages, 32);
  assert.equal(data.days.get('2026-03-15').level, 4);
  assert.equal(data.days.get('2026-03-20').level, 1);
  assert.equal(data.readingDays, 4);
  assert.equal(data.longestStreak, 3);
  assert.equal(data.hasJournal, true);
  assert.deepEqual(data.finished.get('2026-03-15').map((b) => b.id), ['a']);
  assert.deepEqual(data.finished.get('2026-05-02').map((b) => b.id), ['c']);
  assert.deepEqual(data.dropped.get('2026-05-02').map((b) => b.id), ['d']);
  assert.equal(data.finished.has('2025-05-02'), false);

  const empty = calendarData([books[3]], 2026);
  assert.equal(empty.hasJournal, false);
  assert.equal(empty.readingDays, 0);
  assert.equal(empty.longestStreak, 0);
});

test('dayDetail: texto do dia tocado', () => {
  const data = calendarData(books, 2026);
  assert.equal(dayDetail(data, '2026-03-14').text, '14 de mar · 32 págs. — Livro X (20), Livro Y (12)');
  assert.equal(dayDetail(data, '2026-03-20').text, '20 de mar · Leitura registrada — Kindle sem páginas');
  assert.deepEqual(dayDetail(data, '2026-03-15').finished, ['Livro X']);
  const may = dayDetail(data, '2026-05-02');
  assert.equal(may.text, '2 de mai · sem leitura registrada');
  assert.deepEqual(may.finished, ['Sem diário']);
  assert.deepEqual(may.dropped, ['Larguei']);
});

test('defaultMonth', () => {
  assert.equal(defaultMonth(2026, '2026-10-16'), 9);
  assert.equal(defaultMonth(2025, '2026-10-16'), 11);
  assert.equal(defaultMonth(2027, '2026-10-16'), 0);
});
