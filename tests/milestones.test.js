import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  finishOrder, milestoneMessage, milestones, milestonesInYear, newMilestones, upcomingMilestones,
} from '../app/js/milestones.js';

let seq = 0;
function lido(title, endDate, extra = {}) {
  seq += 1;
  return {
    id: `m${seq}`, title, status: 'lido', endDate, startDate: null, pages: null, genre: null,
    format: 'fisico', updatedAt: '2026-01-01T00:00:00.000Z', ...extra,
  };
}

/** n livros lidos, um por dia a partir de 2025-01-01, com o mesmo número de páginas. */
function many(n, pages = 100) {
  const out = [];
  for (let i = 0; i < n; i += 1) {
    const d = new Date(Date.UTC(2025, 0, 1 + i)).toISOString().slice(0, 10);
    out.push(lido(`Livro ${i + 1}`, d, { pages }));
  }
  return out;
}

test('sem livros lidos, sem marcos', () => {
  assert.deepEqual(milestones([]), []);
  assert.deepEqual(milestones([{ id: 'x', title: 'Lendo', status: 'lendo', startDate: '2026-01-01' }]), []);
});

test('ordem de término: data e, no mesmo dia, quem foi salvo antes', () => {
  const a = lido('A', '2026-03-01', { updatedAt: '2026-03-01T10:00:00.000Z' });
  const b = lido('B', '2026-03-01', { updatedAt: '2026-03-01T09:00:00.000Z' });
  const c = lido('C', '2026-01-10');
  assert.deepEqual(finishOrder([a, b, c]).map((x) => x.title), ['C', 'B', 'A']);
});

test('marcos de quantidade de livros: 1º, 10º, 25º, 50º, 100º', () => {
  const books = many(100);
  const ids = milestones(books).filter((m) => m.kind === 'books').map((m) => m.id);
  assert.deepEqual(ids, ['books-1', 'books-10', 'books-25', 'books-50', 'books-100']);
  const tenth = milestones(books).find((m) => m.id === 'books-10');
  assert.equal(tenth.title, '10º livro');
  assert.equal(tenth.detail, 'Livro 10 · 10 jan 2025');
  assert.equal(tenth.date, '2025-01-10');
  assert.equal(tenth.bookId, books[9].id);
});

test('ignora livros não lidos e lidos sem data de término', () => {
  const books = [
    lido('A', '2026-01-01'),
    { id: 'q', title: 'Quero', status: 'quero', pages: 900 },
    { id: 'ab', title: 'Abandonado', status: 'abandonado', endDate: '2026-01-02', pages: 900, genre: 'Ficção' },
    { id: 'semdata', title: 'Sem data', status: 'lido', endDate: null, pages: 900 },
  ];
  assert.deepEqual(milestones(books).map((m) => m.id), ['books-1']);
});

test('páginas acumuladas pela ordem de término: 1.000, 10.000, 50.000', () => {
  const books = [
    lido('A', '2026-01-10', { pages: 600 }),
    lido('B', '2026-02-10', { pages: 300 }),
    lido('C', '2026-03-10', { pages: 150 }),
  ];
  const pages = milestones(books).filter((m) => m.kind === 'pages');
  assert.equal(pages.length, 1);
  assert.equal(pages[0].title, '1.000 páginas');
  assert.equal(pages[0].bookId, books[2].id, 'o livro que cruzou os 1.000');
  assert.equal(pages[0].detail, 'Com C · 10 mar 2026');

  const big = many(170, 300); // 51.000 páginas
  assert.deepEqual(milestones(big).filter((m) => m.kind === 'pages').map((m) => m.id), ['pages-1000', 'pages-10000', 'pages-50000']);
  // Um livro enorme pode cruzar dois marcos de uma vez.
  const jump = milestones([lido('Enorme', '2026-01-01', { pages: 12000 })]).filter((m) => m.kind === 'pages');
  assert.deepEqual(jump.map((m) => m.id), ['pages-1000', 'pages-10000']);
});

test('primeiro livro de 500+ páginas e livro lido em um dia', () => {
  const books = [
    lido('Curto', '2026-01-05', { pages: 120, startDate: '2026-01-05' }),
    lido('Grande', '2026-02-20', { pages: 512 }),
    lido('Outro grande', '2026-03-20', { pages: 800, startDate: '2026-03-20' }),
  ];
  const list = milestones(books);
  const big = list.filter((m) => m.kind === 'big');
  assert.equal(big.length, 1);
  assert.equal(big[0].bookId, books[1].id);
  assert.equal(big[0].detail, 'Grande (512 págs.) · 20 fev 2026');
  const day = list.filter((m) => m.kind === 'day');
  assert.equal(day.length, 1);
  assert.equal(day[0].bookId, books[0].id);
});

test('primeiro livro de cada gênero (sem diferenciar maiúsculas)', () => {
  const books = [
    lido('A', '2026-01-01', { genre: 'Ficção' }),
    lido('B', '2026-02-01', { genre: 'ficção' }),
    lido('C', '2026-03-01', { genre: 'História' }),
    lido('D', '2026-04-01', { genre: '' }),
  ];
  const genres = milestones(books).filter((m) => m.kind === 'genre');
  assert.deepEqual(genres.map((m) => m.title), ['Novo gênero: Ficção', 'Novo gênero: História']);
  assert.deepEqual(genres.map((m) => m.bookId), [books[0].id, books[2].id]);
});

test('marcos do ano', () => {
  const books = [...many(9), lido('Décimo', '2026-02-01', { pages: 100 })];
  const ids = milestonesInYear(books, 2026).map((m) => m.id);
  assert.deepEqual(ids, ['books-10', 'pages-1000']);
  assert.ok(milestonesInYear(books, 2025).some((m) => m.id === 'books-1'));
});

test('próximos marcos: quanto falta', () => {
  const books = many(22, 100);
  const next = upcomingMilestones(books);
  assert.equal(next.find((m) => m.kind === 'books').detail, 'Faltam 3 livros para o 25º');
  assert.equal(next.find((m) => m.kind === 'books').left, 3);
  assert.equal(next.find((m) => m.kind === 'pages').left, 7800);
  assert.equal(next.find((m) => m.id === 'big-book').left, null);
  assert.equal(next.find((m) => m.kind === 'pages').detail, 'Faltam 7.800 páginas para 10.000, contando os livros concluídos');
  assert.ok(next.some((m) => m.id === 'big-book'));
  assert.ok(next.some((m) => m.id === 'one-day'));
  assert.equal(upcomingMilestones(many(24)).find((m) => m.kind === 'books').detail, 'Falta 1 livro para o 25º');
  assert.equal(upcomingMilestones([]).find((m) => m.kind === 'books').detail, 'Falta 1 livro para o 1º');
  // Depois do 100º livro, das 50.000 páginas, do livro grande e do livro de um dia, nada mais.
  const done = upcomingMilestones([...many(170, 600), lido('Rápido', '2026-01-01', { startDate: '2026-01-01' })]);
  assert.deepEqual(done, []);
});

test('marcos novos ao concluir um livro e texto do aviso', () => {
  const before = many(9);
  const after = [...before, lido('O décimo', '2026-05-01', { pages: 100 })];
  const fresh = newMilestones(before, after);
  assert.deepEqual(fresh.map((m) => m.id), ['books-10', 'pages-1000']);
  assert.equal(milestoneMessage(fresh), 'Marcos alcançados: 10º livro e 1.000 páginas');
  assert.equal(milestoneMessage(fresh.slice(0, 1)), 'Marco alcançado: 10º livro');
  assert.equal(milestoneMessage([...fresh, { title: 'Novo gênero: Ficção' }]), 'Marcos alcançados: 10º livro, 1.000 páginas e mais 1');
  assert.equal(milestoneMessage([]), '');
  assert.deepEqual(newMilestones(after, after), []);
});

test('aviso do marco: sem dois-pontos duplos nem maiúscula no meio da frase', () => {
  assert.equal(milestoneMessage([{ title: 'Novo gênero: Distopia' }]), 'Marco alcançado: primeiro livro de Distopia');
  assert.equal(milestoneMessage([{ title: 'Livro lido em um só dia' }]), 'Marco alcançado: livro lido em um só dia');
  assert.equal(
    milestoneMessage([{ title: '10º livro' }, { title: 'Primeiro livro de 500+ páginas' }]),
    'Marcos alcançados: 10º livro e primeiro livro de 500+ páginas',
  );
  assert.equal(
    milestoneMessage([{ title: '1.000 páginas' }, { title: 'Novo gênero: Poesia' }]),
    'Marcos alcançados: 1.000 páginas e primeiro livro de Poesia',
  );
});
