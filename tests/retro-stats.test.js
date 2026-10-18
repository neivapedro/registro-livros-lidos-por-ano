import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  longestAndShortest, readerProfile, stackHeight, strongestMonth,
} from '../app/js/retro-stats.js';

let seq = 0;
function book(title, status, endDate, pages, extra = {}) {
  seq += 1;
  return { id: `r${seq}`, title, status, endDate, pages, format: 'fisico', updatedAt: '2026-01-01T00:00:00.000Z', ...extra };
}
const lido = (title, endDate, pages, extra) => book(title, 'lido', endDate, pages, extra);

test('mês mais forte: mais livros', () => {
  const books = [
    lido('A', '2026-03-02', 100), lido('B', '2026-03-20', 100), lido('C', '2026-03-28', 100),
    lido('D', '2026-05-01', 900), lido('E', '2026-05-09', 900),
    lido('Outro ano', '2025-03-01', 100),
  ];
  assert.deepEqual(strongestMonth(books, 2026), { month: 2, count: 3, pages: 300 });
});

test('mês mais forte: empate decide pelas páginas; persistindo, o primeiro', () => {
  const books = [
    lido('A', '2026-01-02', 100), lido('B', '2026-01-20', 100),
    lido('C', '2026-06-02', 300), lido('D', '2026-06-20', 50),
  ];
  assert.equal(strongestMonth(books, 2026).month, 5);
  const same = [lido('A', '2026-02-02', 100), lido('B', '2026-04-20', 100)];
  assert.equal(strongestMonth(same, 2026).month, 1);
  assert.equal(strongestMonth(books, 2024), null);
});

test('mês mais forte não conta abandonados nem lendo', () => {
  const books = [
    lido('A', '2026-02-02', 100),
    book('Ab1', 'abandonado', '2026-08-01', 100), book('Ab2', 'abandonado', '2026-08-03', 100),
    book('Lendo', 'lendo', null, 100, { startDate: '2026-08-01' }),
  ];
  assert.deepEqual(strongestMonth(books, 2026), { month: 1, count: 1, pages: 100 });
});

test('mais longo e mais curto: só livros Lidos do ano com páginas', () => {
  const books = [
    lido('Médio', '2026-02-01', 300),
    lido('Longo', '2026-03-01', 640),
    lido('Curto', '2026-04-01', 96),
    lido('Sem páginas', '2026-04-02', null),
    book('Abandonado enorme', 'abandonado', '2026-05-01', 1200),
    book('Lendo minúsculo', 'lendo', null, 20, { startDate: '2026-05-01' }),
    book('Quero ler', 'quero', null, 10),
    lido('Outro ano', '2025-05-01', 2000),
  ];
  const r = longestAndShortest(books, 2026);
  assert.equal(r.longest.title, 'Longo');
  assert.equal(r.shortest.title, 'Curto');
});

test('mais longo e mais curto: empate fica com o terminado antes; sem dois tamanhos, nada', () => {
  const tie = [lido('Depois', '2026-05-01', 500), lido('Antes', '2026-01-01', 500), lido('Mini', '2026-03-01', 80)];
  assert.equal(longestAndShortest(tie, 2026).longest.title, 'Antes');
  assert.equal(longestAndShortest([lido('Só', '2026-01-01', 200)], 2026), null);
  assert.equal(longestAndShortest([lido('A', '2026-01-01', 200), lido('B', '2026-02-01', 200)], 2026), null);
  assert.equal(longestAndShortest([lido('A', '2026-01-01', 200), lido('B', '2026-02-01', null)], 2026), null);
});

test('altura da pilha: 0,1 mm por página, com comparação', () => {
  assert.deepEqual(stackHeight(3830), { cm: 38, comparison: 'maior que uma régua escolar' });
  assert.deepEqual(stackHeight(8000), { cm: 80, comparison: 'mais alta que uma mesa' });
  assert.deepEqual(stackHeight(17500), { cm: 175, comparison: 'da altura de uma pessoa' });
  assert.deepEqual(stackHeight(25000), { cm: 250, comparison: 'mais alta que uma porta' });
  assert.deepEqual(stackHeight(1200), { cm: 12, comparison: '' });
  assert.deepEqual(stackHeight(0), { cm: 0, comparison: '' });
});

const base = { count: 10, bigBooks: 0, monthsMet: 4, genres: 3, avgDays: 20, formats: { fisico: 5, kindle: 5 } };

test('perfil: Maratonista (3+ livros de 500+ páginas) vem primeiro', () => {
  const p = readerProfile({ ...base, bigBooks: 3, monthsMet: 12, genres: 8 });
  assert.equal(p.title, 'Maratonista');
  assert.equal(p.reason, '3 livros com 500 páginas ou mais.');
  assert.ok(p.rule);
  assert.notEqual(readerProfile({ ...base, bigBooks: 2 }).id, 'maratonista');
});

test('perfil: Constante (meta mensal em 10+ meses)', () => {
  assert.equal(readerProfile({ ...base, monthsMet: 10 }).title, 'Constante');
  assert.equal(readerProfile({ ...base, monthsMet: 10 }).reason, 'Meta do mês batida em 10 meses.');
  assert.notEqual(readerProfile({ ...base, monthsMet: 9 }).id, 'constante');
});

test('perfil: Explorador (5+ gêneros)', () => {
  assert.equal(readerProfile({ ...base, genres: 5 }).title, 'Explorador');
  assert.equal(readerProfile({ ...base, genres: 6 }).reason, '6 gêneros diferentes no ano.');
});

test('perfil: Veloz (até 10 dias por livro, arredondado como no Resumo)', () => {
  assert.equal(readerProfile({ ...base, avgDays: 10.4 }).title, 'Veloz');
  assert.equal(readerProfile({ ...base, avgDays: 7.6 }).reason, '8 dias por livro, em média.');
  assert.equal(readerProfile({ ...base, avgDays: 1 }).reason, '1 dia por livro, em média.');
  assert.notEqual(readerProfile({ ...base, avgDays: 10.6 }).id, 'veloz');
  assert.notEqual(readerProfile({ ...base, avgDays: null }).id, 'veloz');
});

test('perfil: Fiel ao Kindle / Fiel ao papel (80%+ num formato)', () => {
  const k = readerProfile({ ...base, formats: { fisico: 2, kindle: 8 } });
  assert.equal(k.title, 'Fiel ao Kindle');
  assert.equal(k.reason, '80% dos livros no Kindle.');
  assert.equal(readerProfile({ ...base, formats: { fisico: 9, kindle: 1 } }).title, 'Fiel ao papel');
  assert.equal(readerProfile({ ...base, formats: { fisico: 7, kindle: 3 } }).title, 'Curioso');
});

test('perfil: Curioso quando nenhuma regra vale', () => {
  const p = readerProfile(base);
  assert.equal(p.id, 'curioso');
  assert.ok(p.reason && p.rule);
});
