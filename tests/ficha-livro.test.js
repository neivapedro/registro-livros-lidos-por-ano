import { test } from 'node:test';
import assert from 'node:assert/strict';
import { formatMinutes, rhythmSeries, weekGroups, weekStart } from '../app/js/reading-days.js';
import { bookDetailView, editHref } from '../app/js/views/book-detail.js';
import { rhythmChart } from '../app/js/views/rhythm.js';

const TODAY = '2026-10-16';
const e = (date, from, to, extra = {}) => ({ date, from, to, unit: 'page', note: '', ...extra });
const p = (date, from, to, extra = {}) => ({ date, from, to, unit: 'percent', note: '', ...extra });
const book = (extra = {}) => ({
  id: 'b1', title: 'Dom Casmurro', authors: 'Machado de Assis', format: 'fisico', status: 'lido', pages: 256,
  startDate: '2026-10-01', endDate: '2026-10-10', rating: 4.5, favorite: false, notes: '', genre: 'Ficção', tags: [],
  currentPage: null, currentPercent: null, journal: [], quotes: [], createdAt: '2026-09-01T10:00:00.000Z', ...extra,
});
const view = (b, { state = {}, ui = {} } = {}) => bookDetailView({
  state: { books: [b], upNext: [], ...state }, ui: { detailBack: '#/estante', session: null, editingProgress: null, ...ui }, today: TODAY, book: b,
});

test('semana começa na segunda-feira', () => {
  assert.equal(weekStart('2026-10-12'), '2026-10-12'); // segunda
  assert.equal(weekStart('2026-10-18'), '2026-10-12'); // domingo
  assert.equal(weekStart('2026-10-10'), '2026-10-05'); // sábado
  assert.equal(weekStart('2026-01-01'), '2025-12-29'); // virada do ano
});

test('minutos: "41 min", "1h", "1h 18min"', () => {
  assert.equal(formatMinutes(41), '41 min');
  assert.equal(formatMinutes(60), '1h');
  assert.equal(formatMinutes(78), '1h 18min');
});

test('ritmo por dia: na escala do tempo, dia sem leitura vira vão, correção conta 0', () => {
  const s = rhythmSeries(book({ journal: [e('2026-10-01', 0, 20, { minutes: 30 }), e('2026-10-03', 20, 60), e('2026-10-04', 60, 50), e('2026-10-05', 50, 50, { minutes: 15 })] }));
  assert.equal(s.step, 'day');
  assert.equal(s.unit, 'page');
  assert.deepEqual(s.bars.map((b) => [b.date, b.value]), [['2026-10-01', 20], ['2026-10-02', 0], ['2026-10-03', 40], ['2026-10-04', 0], ['2026-10-05', 0]]);
  assert.equal(s.max, 40);
  assert.equal(s.days, 2);
  assert.equal(s.avg, 30);
  assert.equal(s.minutes, 45);
  assert.equal(rhythmSeries(book()), null, 'sem diário, sem gráfico');
});

test('ritmo: Kindle com total vira páginas; sem total fica em %', () => {
  const withPages = rhythmSeries(book({ format: 'kindle', pages: 400, journal: [p('2026-10-01', 0, 10), p('2026-10-02', 10, 25)] }));
  assert.equal(withPages.unit, 'page');
  assert.deepEqual(withPages.bars.map((b) => b.value), [40, 60]);
  const noPages = rhythmSeries(book({ format: 'kindle', pages: null, journal: [p('2026-10-01', 0, 10), p('2026-10-02', 10, 25)] }));
  assert.equal(noPages.unit, 'percent');
  assert.deepEqual(noPages.bars.map((b) => b.value), [10, 15]);
});

test('ritmo: mais de 90 dias vira barras por semana', () => {
  const s = rhythmSeries(book({ journal: [e('2025-12-28', 0, 80), e('2026-10-10', 80, 120), e('2026-10-12', 120, 164)] }));
  assert.equal(s.step, 'week');
  assert.equal(s.bars[0].date, '2025-12-22');
  assert.equal(s.bars[0].value, 80);
  assert.deepEqual(s.bars.slice(-2).map((b) => [b.date, b.value]), [['2026-10-05', 40], ['2026-10-12', 44]]);
  assert.equal(s.bars.reduce((sum, b) => sum + b.value, 0), 164);
});

test('diário por semana: mais recente primeiro, com dias, páginas e minutos', () => {
  const groups = weekGroups(book({ journal: [e('2026-10-05', 0, 10), e('2026-10-06', 10, 30, { minutes: 41 }), e('2026-10-12', 30, 40, { minutes: 37 }), e('2026-10-13', 40, 35)] }));
  assert.deepEqual(groups.map((g) => g.key), ['2026-10-12', '2026-10-05']);
  assert.deepEqual(groups[0].entries.map((x) => x.date), ['2026-10-13', '2026-10-12']);
  assert.deepEqual([groups[0].days, groups[0].amount, groups[0].minutes], [1, 10, 37], 'a correção não conta como dia');
  assert.deepEqual([groups[1].days, groups[1].amount, groups[1].minutes], [2, 30, 41]);
});

test('gráfico: barras proporcionais ao máximo, rótulo acessível e escape', () => {
  const html = rhythmChart(book({ journal: [e('2026-10-01', 0, 20), e('2026-10-03', 20, 60)] }), TODAY);
  assert.match(html, /role="img" aria-label="Por dia, páginas de 1 out → 3 out: 2 dias de leitura · média 30 págs\.\/dia\. Máximo de 40 págs\. num dia\."/);
  assert.match(html, /--v:50\.0%/);
  assert.match(html, /--v:100\.0%/);
  assert.match(html, /rchart-bar is-zero/);
  assert.equal(rhythmChart(book(), TODAY), '');
});

test('endereço da edição', () => {
  assert.equal(editHref('a b'), '#/livro/a%20b/editar');
  assert.equal(editHref('x', 'concluir=1'), '#/livro/x/editar?concluir=1');
});

test('ficha: lido mostra dias, páginas por dia, período, nota e favorito', () => {
  const html = view(book({ journal: [e('2026-10-01', 0, 128, { minutes: 50 }), e('2026-10-10', 128, 256, { minutes: 40 })] }));
  assert.match(html, /<strong>10<\/strong><span>dias de leitura/);
  assert.match(html, /<strong>26<\/strong><span>págs\. por dia/);
  assert.match(html, /<strong>1h 30min<\/strong><span>no cronômetro/);
  assert.match(html, /Lido em 10 dias · 1 out → 10 out 2026/);
  assert.match(html, /aria-label="Nota 4,5 de 5"/);
  assert.match(html, /data-action="detail-fav"[^>]*aria-pressed="false"/);
  assert.match(html, /href="#\/estante"/, 'Voltar para a lista de origem');
  assert.match(html, /href="#\/livro\/b1\/editar"/);
  assert.match(html, /Ritmo da leitura/);
});

test('ficha: lendo tem progresso, Registrar leitura, Ler agora e Concluir', () => {
  const html = view(book({ status: 'lendo', endDate: null, rating: null, currentPage: 128, startDate: '2026-10-10', journal: [e('2026-10-15', 100, 128)] }));
  assert.match(html, /50%/);
  assert.match(html, /pág\. 128 de 256/);
  assert.match(html, /data-action="update-page" data-id="b1">Registrar leitura/);
  assert.match(html, /data-action="start-timer"/);
  assert.match(html, /href="#\/livro\/b1\/editar\?concluir=1"/);
  assert.match(html, /Ritmo: /);
  assert.doesNotMatch(html, /atrasad/i);
  const editing = view(book({ status: 'lendo', endDate: null, currentPage: 128 }), { ui: { editingProgress: 'b1' } });
  assert.match(editing, /data-progress-form data-id="b1"/);
  assert.match(editing, /id="progress-input"/);
});

test('ficha: quero ler e abandonado', () => {
  const want = book({ status: 'quero', startDate: null, endDate: null, rating: null });
  assert.match(view(want), /data-action="start-reading"[^>]*>Começar a ler/);
  assert.match(view(want), />Marcar como próxima</);
  assert.match(view(want, { state: { upNext: ['b1'] } }), /É a próxima leitura/);
  const dropped = view(book({ status: 'abandonado', rating: null, currentPage: 80, dropReason: 'Não prendeu.' }));
  assert.match(dropped, /Parou na pág\. 80 de 256 · 31%/);
  assert.match(dropped, /Abandonado em 10 out 2026/);
  assert.match(dropped, /Não prendeu\./);
});

test('ficha: texto do livro sempre escapado', () => {
  const evil = book({ title: '<img src=x onerror=alert(1)>', authors: '"><b>x</b>', notes: '<script>', genre: '<i>g</i>', tags: ['<u>t</u>'],
    quotes: [{ id: 'q', text: '<b>trecho</b>', page: 3, createdAt: '2026-10-02T10:00:00.000Z' }], series: '<s>S</s>', seriesNumber: 1 });
  const html = view(evil);
  assert.doesNotMatch(html, /<img src=x|<b>|<script>|<i>g|<u>t|<s>S/);
  assert.match(html, /&lt;img src=x onerror=alert\(1\)&gt;/);
});
