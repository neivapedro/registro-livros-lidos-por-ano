import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  applyChartFilters, chartFilterLabel, chartFilters, hasChartFilter, lengthBucketOf, lengthDistribution,
  pageGoalLine, pageGoalProgress, pagesByFormat, pagesByMonth, ratingDistribution,
} from '../app/js/charts.js';
import { pagesReadInYear } from '../app/js/journal.js';
import { filterBooks } from '../app/js/stats.js';

const entry = (date, from, to, unit = 'page') => ({ date, from, to, unit, note: '' });
const book = (extra) => ({ title: 'L', authors: '', notes: '', format: 'fisico', journal: [], createdAt: '2026-01-01', updatedAt: '2026-01-01', ...extra });

test('ratingDistribution conta meias estrelas e ignora livros sem nota', () => {
  const dist = ratingDistribution([book({ rating: 4.5 }), book({ rating: 4.5 }), book({ rating: 0.5 }), book({ rating: 5 }), book({ rating: null })]);
  assert.equal(dist.length, 10);
  assert.deepEqual(dist.map((d) => d.rating), [0.5, 1, 1.5, 2, 2.5, 3, 3.5, 4, 4.5, 5]);
  assert.deepEqual(dist.map((d) => d.count), [1, 0, 0, 0, 0, 0, 0, 0, 2, 1]);
});

test('faixas de tamanho', () => {
  assert.equal(lengthBucketOf(150).key, 'ate199');
  assert.equal(lengthBucketOf(199).key, 'ate199');
  assert.equal(lengthBucketOf(200).key, '200-349');
  assert.equal(lengthBucketOf(349).key, '200-349');
  assert.equal(lengthBucketOf(350).key, '350-499');
  assert.equal(lengthBucketOf(500).key, '500+');
  assert.equal(lengthBucketOf(2000).key, '500+');
  assert.equal(lengthBucketOf(null), null);
  const { rows, unknown } = lengthDistribution([book({ pages: 120 }), book({ pages: 640 }), book({ pages: 512 }), book({ pages: null })]);
  assert.deepEqual(rows.map((r) => r.count), [1, 0, 0, 2]);
  assert.equal(unknown, 1);
});

const mixed = [
  // Lido sem diário: total no mês do término (março).
  book({ id: 'a', status: 'lido', pages: 200, endDate: '2026-03-01' }),
  // Diário atravessando o ano: só dez/2025 fica fora.
  book({ id: 'c', status: 'lido', pages: 100, endDate: '2026-01-03', journal: [entry('2025-12-30', 0, 60), entry('2026-01-03', 60, 100)] }),
  // Kindle lendo: 10% de 300 em maio.
  book({ id: 'd', status: 'lendo', format: 'kindle', pages: 300, journal: [entry('2026-05-01', 20, 30, 'percent')] }),
  // Abandonado com diário (maio).
  book({ id: 'e', status: 'abandonado', pages: 400, endDate: '2026-06-01', journal: [entry('2026-05-20', 0, 50)] }),
  // Diário que começou no meio: o que falta entra no mês do término (outubro).
  book({ id: 'f', status: 'lido', pages: 300, endDate: '2026-10-10', journal: [entry('2026-09-30', 150, 200), entry('2026-10-10', 200, 300)] }),
  book({ id: 'g', status: 'quero', pages: 100, journal: [entry('2026-02-01', 0, 10)] }),
];

test('pagesByMonth soma o mesmo que pagesReadInYear', () => {
  const months = pagesByMonth(mixed, 2026);
  assert.deepEqual(months, [40, 0, 200, 0, 80, 0, 0, 0, 50, 250, 0, 0]);
  assert.equal(months.reduce((s, n) => s + n, 0), pagesReadInYear(mixed, 2026));
  assert.equal(pagesByMonth(mixed, 2025)[11], 60);
  assert.deepEqual(pagesByMonth([], 2026), Array(12).fill(0));
});

test('pagesByFormat separa físico e Kindle', () => {
  assert.deepEqual(pagesByFormat(mixed, 2026), { fisico: 200 + 40 + 50 + 300, kindle: 30 });
});

test('filtros vindos do gráfico', () => {
  const books = [
    book({ id: 'a', title: 'Grande', status: 'lido', pages: 600, endDate: '2026-03-01', rating: 4.5, format: 'kindle' }),
    book({ id: 'b', title: 'Pequeno', status: 'lido', pages: 120, endDate: '2026-03-20', rating: 4 }),
    book({ id: 'c', title: 'Grande 2025', status: 'lido', pages: 700, endDate: '2025-03-01', rating: 4.5 }),
    book({ id: 'd', title: 'Abandonado grande', status: 'abandonado', pages: 800, endDate: '2026-04-01' }),
  ];
  const run = (f) => applyChartFilters(filterBooks(books, f), f).map((b) => b.id);
  assert.deepEqual(run(chartFilters(2026, 'length', '500+')), ['a']);
  assert.deepEqual(run(chartFilters(2026, 'rating', 4.5)), ['a']);
  assert.deepEqual(run(chartFilters(2026, 'month', 2)).sort(), ['a', 'b']);
  assert.deepEqual(run(chartFilters(2026, 'format', 'kindle')), ['a']);
  assert.deepEqual(run({ q: '', length: '500+' }).sort(), ['a', 'c', 'd']);
  assert.equal(hasChartFilter({ q: '', status: '' }), false);
  assert.equal(hasChartFilter({ month: '0' }), true);
  assert.equal(hasChartFilter(chartFilters(2026, 'genre', 'Ficção')), true);
});

test('chartFilterLabel descreve o recorte', () => {
  assert.equal(chartFilterLabel(chartFilters(2026, 'length', '500+')), 'Filtro: 500+ págs. em 2026');
  assert.equal(chartFilterLabel(chartFilters(2026, 'rating', 4.5)), 'Filtro: nota 4,5 em 2026');
  assert.equal(chartFilterLabel(chartFilters(2026, 'month', 2)), 'Filtro: Lidos em março de 2026');
  assert.equal(chartFilterLabel(chartFilters(2026, 'format', 'kindle')), 'Filtro: Kindle em 2026');
  assert.equal(chartFilterLabel(chartFilters(2026, 'genre', 'Ficção')), 'Filtro: Ficção em 2026');
  assert.equal(chartFilterLabel({ length: 'ate199' }), 'Filtro: até 199 págs.');
});

test('pageGoalProgress: projeção no ritmo atual, só no ano corrente', () => {
  // 16/10/2026 = dia 289 do ano: 4.210 ÷ 289 × 365 ≈ 5.317 → ~5.300.
  const p = pageGoalProgress(4210, 6000, 2026, '2026-10-16');
  assert.equal(p.projection, 5300);
  assert.equal(p.met, false);
  assert.equal(pageGoalLine(p), '4.210 de 6.000 págs. · no ritmo de ~5.300');
  assert.equal(pageGoalProgress(4210, 6000, 2025, '2026-10-16').projection, null);
  assert.equal(pageGoalLine(pageGoalProgress(4210, 6000, 2025, '2026-10-16')), '4.210 de 6.000 págs.');
  assert.equal(pageGoalProgress(0, 6000, 2026, '2026-10-16').projection, null);
  assert.equal(pageGoalLine(pageGoalProgress(6100, 6000, 2026, '2026-10-16')), '6.100 de 6.000 págs. · meta de páginas batida');
  assert.equal(pageGoalProgress(3000, 6000, 2026, '2026-10-16').progress, 0.5);
  // Ano bissexto: 366 dias. 630 págs. em 21 dias → 10.980 → ~11.000.
  assert.equal(pageGoalProgress(630, 6000, 2028, '2028-01-21').projection, 11000);
  // 50 págs. em 21 dias → 869 → ~870.
  assert.equal(pageGoalProgress(50, 6000, 2026, '2026-01-21').projection, 870);
});

test('pageGoalProgress: sem projeção nas primeiras semanas (igual à curva do Resumo)', () => {
  // 1º de janeiro: 30 págs. "projetariam" ~11.000. Antes do dia 21, nada de "no ritmo de".
  assert.equal(pageGoalProgress(30, 6000, 2028, '2028-01-01').projection, null);
  assert.equal(pageGoalProgress(50, 6000, 2026, '2026-01-02').projection, null);
  assert.equal(pageGoalProgress(400, 6000, 2026, '2026-01-20').projection, null);
  assert.equal(pageGoalLine(pageGoalProgress(30, 6000, 2026, '2026-01-01')), '30 de 6.000 págs.');
  assert.equal(pageGoalProgress(400, 6000, 2026, '2026-01-21').projection, 7000);
});

test('pagesByMonth bate com pagesReadInYear depois de uma correção para trás', () => {
  const books = [book({ id: 'c', status: 'lido', pages: 300, endDate: '2026-04-10', journal: [entry('2026-02-01', 0, 100), entry('2026-02-02', 100, 60), entry('2026-03-01', 60, 150)] })];
  const months = pagesByMonth(books, 2026);
  assert.deepEqual(months.slice(1, 4), [100, 50, 150]);
  assert.equal(months.reduce((a, b) => a + b, 0), pagesReadInYear(books, 2026));
  assert.equal(pagesReadInYear(books, 2026), 300);
});
