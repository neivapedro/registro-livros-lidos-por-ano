import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pagesByMonth, pageGoalProgress, ratingDistribution } from '../app/js/charts.js';
import { pagesReadInYear } from '../app/js/journal.js';
import { yearStats } from '../app/js/stats.js';
import {
  booksByMonth, cumulative, curveText, dailyPages, elapsedPosition, kpiDelta, kpiSeries, monthPosition, pagesReadUntil,
  plannedAt, plannedCurve, previousYearBaseline, ratingWindow, repeatedAuthors, runningAverage, sameDayLastYear, sCurve, sCurves,
} from '../app/js/trend.js';

const TODAY = '2026-10-26';
const entry = (date, from, to, unit = 'page') => ({ date, from, to, unit, note: '' });
const book = (id, extra) => ({
  id, title: id, authors: '', notes: '', format: 'fisico', journal: [], status: 'lido', pages: 300,
  createdAt: '2026-01-01', updatedAt: '2026-01-01', ...extra,
});

// 2026: 11 livros, um por mês de jan a set e dois em out (até hoje). 2025: 9 livros.
function sample() {
  const books = [];
  for (let m = 1; m <= 9; m += 1) books.push(book(`a${m}`, { endDate: `2026-0${m}-15`, startDate: `2026-0${m}-01`, rating: m % 2 ? 4 : 5 }));
  books.push(book('a10', { endDate: '2026-10-05', startDate: '2026-09-20', rating: 4.5 }));
  books.push(book('a11', { endDate: '2026-10-20', startDate: '2026-10-06' }));
  for (let m = 1; m <= 9; m += 1) books.push(book(`b${m}`, { endDate: `2025-${String(m + 3).padStart(2, '0')}-10`, startDate: `2025-${String(m + 3).padStart(2, '0')}-01`, rating: 4 }));
  // Livro em andamento com diário em 2026 (conta nas páginas, não nos livros).
  books.push(book('lendo', { status: 'lendo', endDate: null, journal: [entry('2026-10-25', 0, 40)] }));
  return books;
}

test('posição no eixo de meses e mesmo dia do ano anterior', () => {
  assert.equal(monthPosition('2026-01-31'), 1);
  assert.equal(monthPosition('2026-10-26'), 9 + 26 / 31);
  assert.equal(monthPosition('2024-02-29'), 2);
  assert.equal(elapsedPosition(2025, TODAY), 12);
  assert.equal(elapsedPosition(2027, TODAY), 0);
  assert.equal(sameDayLastYear('2026-10-26'), '2025-10-26');
  assert.equal(sameDayLastYear('2028-02-29'), '2027-02-28');
});

test('previsto distribuído por igual nos meses', () => {
  const p = plannedCurve(15);
  assert.equal(p.length, 13);
  assert.equal(p[0], 0);
  assert.equal(p[12], 15);
  assert.equal(p[6], 7.5);
  assert.equal(plannedAt(12, 9.5), 9.5);
  assert.equal(plannedAt(12, 14), 12);
  assert.deepEqual(cumulative([1, 0, 2, 3]), [1, 1, 3, 6]);
});

test('curva S do ano corrente: realizado até hoje, desvio e projeção', () => {
  const books = sample();
  const c = sCurve({ monthly: booksByMonth(books, 2026), goal: 15, year: 2026, today: TODAY });
  assert.equal(c.realized, 11);
  assert.equal(c.isCurrent, true);
  // 0 + fins de jan a set + hoje
  assert.equal(c.actual.length, 11);
  assert.deepEqual(c.actual[9], { x: 9, v: 9 });
  assert.deepEqual(c.actual.at(-1), { x: monthPosition(TODAY), v: 11 });
  const plannedNow = (15 * monthPosition(TODAY)) / 12;
  assert.equal(c.plannedNow, plannedNow);
  assert.equal(c.deviation, 11 - plannedNow);
  // Projeção pelos dias: 11 em 299 dias → ~13,4 em 365.
  assert.equal(c.projection.to.v, Math.round((11 / 299) * 365 * 10) / 10);
  assert.equal(c.projection.from.x, monthPosition(TODAY));
  assert.ok(Math.abs(c.perMonth - 4 / (12 - monthPosition(TODAY))) < 1e-9);
  const t = curveText(c);
  assert.equal(t.headline, '1,3 livro abaixo do previsto');
  assert.equal(t.detail, 'Para fechar 15: 1,9 por mês · no ritmo atual, ~13 em dezembro');
});

test('curva S de um ano passado: curva inteira, sem projeção', () => {
  const books = sample();
  const c = sCurve({ monthly: booksByMonth(books, 2025), goal: 12, year: 2025, today: TODAY });
  assert.equal(c.actual.length, 13);
  assert.equal(c.actual.at(-1).v, 9);
  assert.equal(c.projection, null);
  assert.equal(c.today, null);
  assert.deepEqual(curveText(c), { headline: '9 de 12 · 3 livros abaixo da meta', detail: '' });
  const met = sCurve({ monthly: booksByMonth(books, 2025), goal: 8, year: 2025, today: TODAY });
  assert.equal(curveText(met).headline, 'Meta de 8 alcançada · 1 livro além');
});

test('curva S: textos à frente, em linha e sem palavras de cobrança', () => {
  const monthly = [2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 0, 0];
  const ahead = curveText(sCurve({ monthly, goal: 22, year: 2026, today: TODAY }));
  assert.equal(ahead.headline, '2 livros à frente do previsto');
  assert.equal(curveText(sCurve({ monthly, goal: 12, year: 2026, today: TODAY })).headline, 'Meta de 12 alcançada · 8 livros além');
  const even = curveText(sCurve({ monthly: [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0, 0], goal: 12, year: 2026, today: TODAY }));
  assert.equal(even.headline, 'Em linha com o previsto');
  for (const t of [ahead, even]) assert.doesNotMatch(`${t.headline} ${t.detail}`, /atrasad|devendo|falhou|ruim/i);
  // 31 de dezembro: não divide por zero.
  const last = sCurve({ monthly: [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0], goal: 12, year: 2026, today: '2026-12-31' });
  assert.equal(last.perMonth, null);
  assert.equal(curveText(last).detail, 'Faltam 1 livro até 31 dez');
});

test('curva S de páginas: meses somam o total do ano e a projeção é a do Início', () => {
  const books = sample();
  const { paginas } = sCurves(books, 2026, { goal: 15, pageGoal: 6000 }, TODAY);
  const s = yearStats(books, 2026, 15, TODAY);
  assert.equal(paginas.realized, s.pages);
  assert.equal(paginas.cumulative[11], pagesReadInYear(books, 2026));
  assert.equal(paginas.projection.to.v, pageGoalProgress(s.pages, 6000, 2026, TODAY).projection);
  assert.match(curveText(paginas).detail, /^Para fechar 6\.000: ~\d[\d.]* por mês · no ritmo atual, ~[\d.]+ em dezembro$/);
  // Sem meta de páginas: sem previsto, só o realizado e o ritmo.
  const free = sCurves(books, 2026, { goal: 15, pageGoal: null }, TODAY).paginas;
  assert.equal(free.planned, null);
  assert.equal(free.deviation, null);
  assert.equal(curveText(free).headline, '3.340 págs. até hoje');
});

test('pagesReadUntil segue a regra do diário e fecha com pagesReadInYear', () => {
  const books = [
    book('j', { endDate: '2026-03-10', pages: 200, journal: [entry('2026-02-01', 0, 50), entry('2026-03-05', 50, 120)] }),
    book('k', { endDate: '2026-05-01', pages: 100 }),
    book('virou', { endDate: '2026-01-05', pages: 300, journal: [entry('2025-12-20', 0, 250)] }),
  ];
  // 'virou': as 50 que o diário de 2025 não cobriu entram no término (5/1).
  assert.equal(pagesReadUntil(books, 2026, '2026-02-28'), 50 + 50);
  // Em 10/03 o livro j termina: entram as 80 que o diário não cobriu.
  assert.equal(pagesReadUntil(books, 2026, '2026-03-10'), 50 + 50 + 70 + 80);
  assert.equal(pagesReadUntil(books, 2026, '2026-12-31'), pagesReadInYear(books, 2026));
  assert.equal(pagesReadUntil(books, 2025, '2025-12-31'), pagesReadInYear(books, 2025));
  const months = pagesByMonth(books, 2026);
  assert.equal(cumulative(months)[11], pagesReadInYear(books, 2026));
});

test('ano anterior até o mesmo dia (ano corrente) ou inteiro (ano passado)', () => {
  const books = sample();
  books.push(book('fim2025', { endDate: '2025-11-20', startDate: '2025-11-01', rating: 2 }));
  const cur = previousYearBaseline(books, 2026, TODAY);
  assert.equal(cur.year, 2025);
  assert.equal(cur.until, '2025-10-26');
  assert.equal(cur.count, 7); // abr a out de 2025; o de novembro e dezembro ainda não
  assert.equal(cur.avgRating, 4);
  assert.equal(cur.pages, 7 * 300);
  const past = previousYearBaseline(books, 2025, TODAY);
  assert.equal(past, null, '2024 sem dados');
  const full = previousYearBaseline(books, 2026, '2027-01-02');
  assert.equal(full.until, null);
  assert.equal(full.count, 10);
});

test('kpiDelta: direção, arredondamento e o que é favorável', () => {
  assert.deepEqual(kpiDelta(11, 9), { dir: 'up', diff: 2, pct: 22, favorable: true });
  assert.deepEqual(kpiDelta(20, 23, { lowerIsBetter: true }), { dir: 'down', diff: -3, pct: -13, favorable: true });
  assert.equal(kpiDelta(4.31, 4.29, { digits: 1 }).dir, 'same');
  assert.equal(kpiDelta(4.35, 4.0, { digits: 1 }).diff, 0.4);
  assert.equal(kpiDelta(null, 3), null);
  assert.equal(kpiDelta(3, null), null);
  assert.equal(kpiDelta(3, 0).pct, null);
});

test('séries dos mini-gráficos', () => {
  const books = sample();
  const k = kpiSeries(books, 2026, TODAY);
  assert.equal(k.count.length, 10);
  assert.equal(k.count.at(-1), 11);
  assert.equal(k.pages.at(-1), yearStats(books, 2026, 15, TODAY).pages);
  assert.equal(k.avgRating[0], 4);
  assert.equal(k.avgRating[1], 4.5);
  const avg = runningAverage(books, 2025, (b) => b.rating);
  assert.deepEqual(avg.slice(0, 4), [null, null, null, 4]);
  assert.equal(kpiSeries(books, 2025, TODAY).count.length, 12);
});

test('páginas por dia de leitura e melhor dia', () => {
  const books = [
    book('j', { endDate: '2026-03-10', pages: 200, journal: [entry('2026-02-01', 0, 50), entry('2026-02-02', 50, 70), entry('2026-03-05', 70, 120)] }),
    book('k', { status: 'lendo', endDate: null, journal: [entry('2026-02-02', 0, 30)] }),
  ];
  const d = dailyPages(books, 2026);
  assert.equal(d.days, 3);
  assert.equal(d.pages, 150);
  assert.equal(d.perReadingDay, 50);
  assert.deepEqual(d.best, { date: '2026-02-01', pages: 50 });
  assert.equal(dailyPages(books, 2025).best, null);
});

test('notas: só a faixa usada, com no mínimo 5 colunas', () => {
  const dist = ratingDistribution([{ rating: 4 }, { rating: 4.5 }, { rating: 5 }]);
  assert.deepEqual(ratingWindow(dist).map((d) => d.rating), [3, 3.5, 4, 4.5, 5]);
  const wide = ratingDistribution([{ rating: 1 }, { rating: 5 }]);
  assert.equal(ratingWindow(wide).length, 9);
  const low = ratingDistribution([{ rating: 0.5 }]);
  assert.deepEqual(ratingWindow(low).map((d) => d.rating), [0.5, 1, 1.5, 2, 2.5]);
  assert.deepEqual(ratingWindow(ratingDistribution([])), []);
});

test('autores: só os repetidos', () => {
  assert.deepEqual(repeatedAuthors([{ label: 'A', count: 2 }, { label: 'B', count: 1 }]), [{ label: 'A', count: 2 }]);
  assert.deepEqual(repeatedAuthors([{ label: 'B', count: 1 }]), []);
});
