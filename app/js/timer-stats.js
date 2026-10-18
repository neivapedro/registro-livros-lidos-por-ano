// Números do cronômetro, a partir dos minutos guardados no diário (entry.minutes).
// Funções puras, prontas para o Resumo.

import { yearOf } from './dates.js';
import { entryPages } from './journal.js';

const minutesOf = (entry) => (Number.isFinite(entry.minutes) && entry.minutes > 0 ? entry.minutes : 0);

/** Minutos lidos por dia, somando os livros. Map 'AAAA-MM-DD' → { minutes, byBook: [{ id, title, minutes }] }. */
export function minutesReadPerDay(books) {
  const days = new Map();
  for (const book of books) {
    for (const entry of book.journal || []) {
      const minutes = minutesOf(entry);
      if (!minutes) continue;
      const day = days.get(entry.date) || { minutes: 0, byBook: [] };
      day.minutes += minutes;
      const item = day.byBook.find((x) => x.id === book.id);
      if (item) item.minutes += minutes;
      else day.byBook.push({ id: book.id, title: book.title, minutes });
      days.set(entry.date, day);
    }
  }
  return days;
}

/** Total de minutos cronometrados no ano; sem ano, de todos os anos. */
export function totalMinutes(books, year = null) {
  let total = 0;
  for (const book of books) {
    for (const entry of book.journal || []) {
      if (year === null || yearOf(entry.date) === year) total += minutesOf(entry);
    }
  }
  return total;
}

/**
 * Páginas por hora no ano (sem ano, de todos), só com dias que têm minutos E páginas
 * avançadas — dia sem cronômetro não diz nada sobre a velocidade. Sem dados: null.
 */
export function pagesPerHour(books, year = null) {
  let pages = 0;
  let minutes = 0;
  for (const book of books) {
    for (const entry of book.journal || []) {
      if (year !== null && yearOf(entry.date) !== year) continue;
      const m = minutesOf(entry);
      const p = m ? entryPages(book, entry) : 0;
      if (!m || !p) continue;
      pages += p;
      minutes += m;
    }
  }
  return minutes ? Math.round((pages * 60) / minutes) : null;
}
