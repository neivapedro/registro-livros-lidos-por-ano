import { test } from 'node:test';
import assert from 'node:assert/strict';
import { leadersOf, rankedBars } from '../app/js/views/ranked-bars.js';

const row = (label, count, extra = {}) => ({ label, count, ...extra });
const leads = (html) => (html.match(/class="hbar hbar-btn rb-row is-lead/g) || []).length;
const rows = (html) => (html.match(/class="hbar hbar-btn rb-row/g) || []).length;

test('leadersOf: o maior e os empates; zero nunca lidera', () => {
  assert.deepEqual(leadersOf([row('a', 3), row('b', 3), row('c', 1)]), [true, true, false]);
  assert.deepEqual(leadersOf([row('a', 0), row('b', 0)]), [false, false]);
  assert.deepEqual(leadersOf([]), []);
});

test('rankedBars: vazio não gera nada', () => {
  assert.equal(rankedBars([]), '');
});

test('rankedBars: até 3 linhas mostra tudo, sem "Ver todos"', () => {
  const html = rankedBars([row('Ficção', 4), row('História', 2), row('Poesia', 1)]);
  assert.equal(rows(html), 3);
  assert.doesNotMatch(html, /<details/);
  assert.equal(leads(html), 1);
  assert.match(html, /Ficção<\/span><span class="muted rb-count">4 livros · 57%/);
  assert.match(html, /Poesia<\/span><span class="muted rb-count">1 livro · 14%/);
});

test('rankedBars: empate no primeiro lugar destaca todos os empatados', () => {
  const html = rankedBars([row('A', 2), row('B', 2), row('C', 1)]);
  assert.equal(leads(html), 2);
  assert.equal((html.match(/hbar-fill is-top/g) || []).length, 2);
});

test('rankedBars: mais de 3 linhas deixa 3 à mostra e o resto num <details>', () => {
  const html = rankedBars([row('A', 5), row('B', 4), row('C', 3), row('D', 2), row('E', 1)]);
  const [before, inside] = html.split('<details');
  assert.equal(rows(before), 3);
  assert.equal(rows(inside), 2);
  assert.match(html, /<summary class="rb-toggle"><span class="rb-open">Ver todos \(5\)<\/span><span class="rb-close">Mostrar menos<\/span><\/summary>/);
  assert.equal(leads(html), 1);
  assert.ok(!html.includes('data-action'), 'nada de ação nova: só HTML nativo');
});

test('rankedBars: limit personalizado e contagem zero apagada, sem toque', () => {
  const html = rankedBars([row('Curto', 0, { attrs: 'data-action="chart-filter"' }), row('Médio', 2, { attrs: 'data-action="chart-filter"' })], { limit: 2 });
  assert.doesNotMatch(html, /<details/);
  assert.equal((html.match(/<button/g) || []).length, 1, 'só a linha com livros é botão');
  assert.match(html, /rb-row is-empty/);
  assert.match(html, /0 livros/);
  assert.match(html, /width:0%/);
  assert.equal(leads(rankedBars([row('x', 0), row('y', 0)])), 0);
});

test('rankedBars: pct informado vence o calculado; rótulos escapados; classe extra', () => {
  const html = rankedBars([row('<b>"Ficção" & cia</b>', 2, { pct: 40 })], { cls: 'profile-bars' });
  assert.match(html, /&lt;b&gt;/);
  assert.doesNotMatch(html, /<b>/);
  assert.match(html, /2 livros · 40%/);
  assert.match(html, /class="hbar-list rb-list profile-bars"/);
});
