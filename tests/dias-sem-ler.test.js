import { test } from 'node:test';
import assert from 'node:assert/strict';
import { currentDayStreak, idleDays, idleText } from '../app/js/greeting.js';

test('idleText: limiar de 3 dias, só com livro em leitura', () => {
  assert.equal(idleText({ days: 2, hasReading: true }), '');
  assert.equal(idleText({ days: 3, hasReading: true }), 'Você não registra leitura há 3 dias');
  assert.equal(idleText({ days: 4, hasReading: true }), 'Você não registra leitura há 4 dias');
  assert.equal(idleText({ days: 400, hasReading: true }), 'Você não registra leitura há 400 dias');
  assert.equal(idleText({ days: 40, hasReading: false }), '');
  assert.equal(idleText({ days: 0, hasReading: true }), '');
  assert.equal(idleText({ days: NaN, hasReading: true }), '');
});

test('idleDays: sem diário, hoje, ontem e limites', () => {
  assert.equal(idleDays(new Set(), '2026-11-05'), 0, 'sem diário');
  assert.equal(idleDays(new Set(['2026-11-05']), '2026-11-05'), 0, 'hoje');
  assert.equal(idleDays(new Set(['2026-11-04']), '2026-11-05'), 1, 'ontem');
  assert.equal(idleDays(new Set(['2026-11-03']), '2026-11-05'), 2);
  assert.equal(idleDays(new Set(['2026-11-02']), '2026-11-05'), 3);
  assert.equal(idleDays(new Set(['2026-10-01', '2026-10-20', '2026-09-01']), '2026-11-05'), 16, 'usa o último dia');
  assert.equal(idleDays(['2026-09-26'], '2026-11-05'), 40);
  assert.equal(idleDays(['2025-09-30'], '2026-11-05'), 401, 'mais de um ano');
  assert.equal(idleDays(new Set(['2026-11-05']), 'x'), 0);
});

test('idleDays: virada de mês e de ano', () => {
  assert.equal(idleDays(['2026-01-29'], '2026-02-02'), 4);
  assert.equal(idleDays(['2026-12-30'], '2027-01-02'), 3);
  assert.equal(idleDays(['2028-02-27'], '2028-03-01'), 3, 'ano bissexto');
  assert.equal(idleDays(['2027-02-27'], '2027-03-02'), 3);
});

test('idleDays: horário de verão não altera a contagem; datas futuras são ignoradas', () => {
  assert.equal(idleDays(['2026-03-07'], '2026-03-10'), 3);
  assert.equal(idleDays(['2026-10-31'], '2026-11-03'), 3);
  assert.equal(idleDays(['2026-11-10'], '2026-11-05'), 0, 'só futuro: nada');
  assert.equal(idleDays(['2026-11-01', '2026-11-10'], '2026-11-05'), 4, 'futuro não conta como último dia');
});

test('activityDays: tempo cronometrado/ouvido (sem avanço) também é atividade', async () => {
  const { activityDays, readingDays } = await import('../app/js/journal.js');
  const books = [{ journal: [
    { date: '2026-11-01', from: 0, to: 10, unit: 'page', note: '' },
    { date: '2026-11-04', from: 10, to: 10, unit: 'page', note: '', minutes: 15 },
    { date: '2026-11-03', from: 10, to: 10, unit: 'page', note: 'só nota' },
  ] }];
  assert.deepEqual([...readingDays(books)], ['2026-11-01']);
  assert.deepEqual([...activityDays(books)].sort(), ['2026-11-01', '2026-11-04']);
  assert.equal(idleDays(activityDays(books), '2026-11-05'), 1);
});

test('com sequência atual nunca há texto de ociosidade', () => {
  for (const days of [new Set(['2026-11-05']), new Set(['2026-11-04'])]) {
    assert.ok(currentDayStreak(days, '2026-11-05').count > 0);
    assert.equal(idleText({ days: idleDays(days, '2026-11-05'), hasReading: true }), '');
  }
});
