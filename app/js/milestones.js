// Marcos da vida de leitor: 10º livro, 1.000 páginas, primeiro livro de 500+ páginas...
// Funções puras: recebem os livros e devolvem a lista de marcos, sem pontos nem níveis.
// Só contam livros Lidos, na ordem em que foram terminados.

import { formatShort, yearOf } from './dates.js';
import { readBooks } from './stats.js';

export const BOOK_STEPS = [1, 10, 25, 50, 100];
export const PAGE_STEPS = [1000, 10000, 50000];
export const BIG_BOOK_PAGES = 500;

const nf = new Intl.NumberFormat('pt-BR');

/** '21 set 2026' */
function longDate(iso) {
  return `${formatShort(iso)} ${iso.slice(0, 4)}`;
}

function bookDetail(book) {
  return `${book.title} · ${longDate(book.endDate)}`;
}

function genreKey(genre) {
  return genre.trim().toLocaleLowerCase('pt-BR');
}

/** Livros lidos na ordem do término (mesmo dia: o salvo antes vem antes). */
export function finishOrder(books) {
  return readBooks(books)
    .slice()
    .sort((a, b) => a.endDate.localeCompare(b.endDate) || (a.updatedAt || '').localeCompare(b.updatedAt || ''));
}

/**
 * Marcos alcançados, do mais antigo ao mais recente.
 * Cada um: { id, kind, title, detail, date, bookId }.
 * kind: 'books' | 'pages' | 'big' | 'day' | 'genre' (a tela escolhe o ícone por ele).
 */
export function milestones(books) {
  const out = [];
  const genres = new Set();
  let pages = 0;
  let big = false;
  let oneDay = false;
  finishOrder(books).forEach((book, i) => {
    const n = i + 1;
    const base = { date: book.endDate, bookId: book.id };
    if (BOOK_STEPS.includes(n)) {
      out.push({ ...base, id: `books-${n}`, kind: 'books', title: `${n}º livro`, detail: bookDetail(book) });
    }
    const before = pages;
    pages += Number(book.pages) || 0;
    for (const step of PAGE_STEPS) {
      if (before < step && pages >= step) {
        out.push({ ...base, id: `pages-${step}`, kind: 'pages', title: `${nf.format(step)} páginas`, detail: `Com ${bookDetail(book)}` });
      }
    }
    if (!big && (Number(book.pages) || 0) >= BIG_BOOK_PAGES) {
      big = true;
      out.push({ ...base, id: 'big-book', kind: 'big', title: `Primeiro livro de ${BIG_BOOK_PAGES}+ páginas`, detail: `${book.title} (${nf.format(book.pages)} págs.) · ${longDate(book.endDate)}` });
    }
    if (!oneDay && book.startDate && book.startDate === book.endDate) {
      oneDay = true;
      out.push({ ...base, id: 'one-day', kind: 'day', title: 'Livro lido em um só dia', detail: bookDetail(book) });
    }
    if (book.genre && book.genre.trim()) {
      const key = genreKey(book.genre);
      if (!genres.has(key)) {
        genres.add(key);
        out.push({ ...base, id: `genre-${key}`, kind: 'genre', title: `Novo gênero: ${book.genre.trim()}`, detail: bookDetail(book) });
      }
    }
  });
  return out;
}

/** Marcos alcançados num ano (pela data do livro que os completou). */
export function milestonesInYear(books, year) {
  return milestones(books).filter((m) => yearOf(m.date) === year);
}

/**
 * Próximos marcos, em tom discreto: o próximo de livros, o próximo de páginas
 * e os de livro grande e de um dia, enquanto não alcançados.
 * Cada um: { id, kind, title, detail }.
 */
export function upcomingMilestones(books) {
  const done = new Set(milestones(books).map((m) => m.id));
  const read = finishOrder(books);
  const pages = read.reduce((s, b) => s + (Number(b.pages) || 0), 0);
  const out = [];
  const nextBooks = BOOK_STEPS.find((n) => n > read.length);
  if (nextBooks) {
    const left = nextBooks - read.length;
    out.push({
      id: `books-${nextBooks}`, kind: 'books', title: `${nextBooks}º livro`,
      detail: `${left === 1 ? 'Falta 1 livro' : `Faltam ${left} livros`} para o ${nextBooks}º`,
    });
  }
  const nextPages = PAGE_STEPS.find((n) => n > pages);
  if (nextPages) {
    const left = nextPages - pages;
    out.push({
      id: `pages-${nextPages}`, kind: 'pages', title: `${nf.format(nextPages)} páginas`,
      // O marco soma o total dos livros concluídos; o tile "páginas" também conta o que foi
      // lido em livros em andamento e abandonados. O texto diz a regra para os números não parecerem errados.
      detail: `${left === 1 ? 'Falta 1 página' : `Faltam ${nf.format(left)} páginas`} para ${nf.format(nextPages)}, contando os livros concluídos`,
    });
  }
  if (!done.has('big-book')) {
    out.push({ id: 'big-book', kind: 'big', title: `Primeiro livro de ${BIG_BOOK_PAGES}+ páginas`, detail: `Termine um livro com ${BIG_BOOK_PAGES} páginas ou mais` });
  }
  if (!done.has('one-day')) {
    out.push({ id: 'one-day', kind: 'day', title: 'Livro lido em um só dia', detail: 'Comece e termine um livro no mesmo dia' });
  }
  return out;
}

/** Marcos que existem depois e não existiam antes (para comemorar ao concluir um livro). */
export function newMilestones(booksBefore, booksAfter) {
  const before = new Set(milestones(booksBefore).map((m) => m.id));
  return milestones(booksAfter).filter((m) => !before.has(m.id));
}

/** Texto do aviso: "Marco alcançado: 10º livro" ou "Marcos alcançados: 10º livro e 1.000 páginas". */
export function milestoneMessage(list) {
  if (!list.length) return '';
  if (list.length === 1) return `Marco alcançado: ${list[0].title}`;
  const names = list.slice(0, 2).map((m) => m.title);
  const more = list.length - 2;
  return `Marcos alcançados: ${names.join(more ? ', ' : ' e ')}${more ? ` e mais ${more}` : ''}`;
}
