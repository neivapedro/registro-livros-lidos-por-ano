import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  daysElapsedInYear, daysInclusive, daysSince, formatBR, formatShort, isIsoDate, monthOf, toIso, yearOf,
} from '../app/js/dates.js';

test('isIsoDate aceita só datas reais no formato AAAA-MM-DD', () => {
  assert.equal(isIsoDate('2026-10-16'), true);
  assert.equal(isIsoDate('2024-02-29'), true);
  assert.equal(isIsoDate('2026-02-29'), false);
  assert.equal(isIsoDate('2026-13-01'), false);
  assert.equal(isIsoDate('16/10/2026'), false);
  assert.equal(isIsoDate(''), false);
  assert.equal(isIsoDate(null), false);
});

test('toIso usa a data local', () => {
  assert.equal(toIso(new Date(2026, 0, 5)), '2026-01-05');
});

test('daysInclusive conta o primeiro e o último dia', () => {
  assert.equal(daysInclusive('2026-09-03', '2026-09-21'), 19);
  assert.equal(daysInclusive('2026-09-03', '2026-09-03'), 1);
  assert.equal(daysInclusive('2025-12-30', '2026-01-02'), 4);
  // Atravessa a mudança de horário de verão sem errar.
  assert.equal(daysInclusive('2018-11-01', '2018-11-30'), 30);
});

test('daysSince', () => {
  assert.equal(daysSince('2026-10-01', '2026-10-16'), 15);
  assert.equal(daysSince('2026-10-16', '2026-10-16'), 0);
});

test('formatação em português', () => {
  assert.equal(formatBR('2026-09-03'), '03/09/2026');
  assert.equal(formatShort('2026-10-02'), '2 out');
  assert.equal(formatBR('lixo'), '');
});

test('yearOf e monthOf', () => {
  assert.equal(yearOf('2026-10-16'), 2026);
  assert.equal(monthOf('2026-01-31'), 0);
  assert.equal(monthOf('2026-12-01'), 11);
});

test('daysElapsedInYear', () => {
  assert.equal(daysElapsedInYear(2025, '2026-10-16'), 365);
  assert.equal(daysElapsedInYear(2024, '2026-10-16'), 366);
  assert.equal(daysElapsedInYear(2026, '2026-01-01'), 1);
  assert.equal(daysElapsedInYear(2026, '2026-10-16'), 289);
  assert.equal(daysElapsedInYear(2027, '2026-10-16'), 0);
});
