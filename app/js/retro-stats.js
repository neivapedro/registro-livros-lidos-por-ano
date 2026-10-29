// Cálculos da retrospectiva do ano. Funções puras, sem tela.
// A base é sempre booksReadInYear (a mesma do Resumo), para os números baterem.

import { monthOf } from './dates.js';
import { FORMATS } from './store.js';
import { booksReadInYear } from './stats.js';

/** Mínimo de livros concluídos no ano para abrir a retrospectiva. */
export const RETRO_MIN_BOOKS = 3;

/**
 * Mês com mais livros terminados; empate: o de mais páginas; persistindo, o primeiro.
 * Devolve { month (0 a 11), count, pages } ou null sem livros.
 */
export function strongestMonth(books, year) {
  const months = Array.from({ length: 12 }, (_, month) => ({ month, count: 0, pages: 0 }));
  for (const b of booksReadInYear(books, year)) {
    const m = months[monthOf(b.endDate)];
    m.count += 1;
    m.pages += Number(b.pages) || 0;
  }
  const best = months.reduce((top, m) => (m.count > top.count || (m.count === top.count && m.pages > top.pages) ? m : top));
  return best.count ? best : null;
}

/**
 * O livro mais longo e o mais curto do ano (só Lidos com número de páginas).
 * Empate: o terminado antes. Precisa de dois livros com tamanhos diferentes; senão, null.
 */
export function longestAndShortest(books, year) {
  const withPages = booksReadInYear(books, year)
    .filter((b) => Number(b.pages) > 0)
    .sort((a, b) => a.endDate.localeCompare(b.endDate) || (a.updatedAt || '').localeCompare(b.updatedAt || ''));
  if (withPages.length < 2) return null;
  let longest = withPages[0];
  let shortest = withPages[0];
  for (const b of withPages) {
    if (b.pages > longest.pages) longest = b;
    if (b.pages < shortest.pages) shortest = b;
  }
  return longest.pages === shortest.pages ? null : { longest, shortest };
}

// Pilha de livros: cerca de 0,1 mm por página, já contando as capas.
const CM_PER_PAGE = 0.01;
const HEIGHTS = [
  [210, 'mais alta que uma porta'],
  [170, 'da altura de uma pessoa'],
  [75, 'mais alta que uma mesa'],
  [30, 'maior que uma régua escolar'],
];

/** Altura estimada da pilha dos livros do ano: { cm, comparison } (comparação vazia se baixa). */
export function stackHeight(pages) {
  const cm = Math.round((Number(pages) || 0) * CM_PER_PAGE);
  const found = HEIGHTS.find(([min]) => cm >= min);
  return { cm, comparison: found ? found[1] : '' };
}

function pct(n) {
  return Math.round(n * 100);
}

/**
 * Perfil de leitor do ano: regras simples, na ordem, a primeira que vale ganha.
 * Entrada: { count, bigBooks, monthsMet, genres, avgDays, formats }
 *   bigBooks = livros de 500+ páginas; genres = nº de gêneros diferentes;
 *   avgDays = média de dias por livro (ou null); formats = { fisico, kindle }.
 * Saída: { id, title, reason, rule } — reason com os números do ano, rule com a regra.
 */
export function readerProfile({ count, bigBooks = 0, monthsMet = 0, genres = 0, avgDays = null, formats = {} }) {
  if (bigBooks >= 3) {
    return { id: 'maratonista', title: 'Maratonista', reason: `${bigBooks} livros com 500 páginas ou mais.`, rule: '3 ou mais livros de 500+ páginas no ano' };
  }
  if (monthsMet >= 10) {
    return { id: 'constante', title: 'Constante', reason: `Meta do mês batida em ${monthsMet} meses.`, rule: 'meta mensal batida em 10 meses ou mais' };
  }
  if (genres >= 5) {
    return { id: 'explorador', title: 'Explorador', reason: `${genres} gêneros diferentes no ano.`, rule: '5 ou mais gêneros diferentes' };
  }
  const days = avgDays === null || avgDays === undefined ? null : Math.round(avgDays);
  if (days !== null && days <= 10) {
    return { id: 'veloz', title: 'Veloz', reason: `${days === 1 ? '1 dia' : `${days} dias`} por livro, em média.`, rule: 'média de até 10 dias por livro' };
  }
  const kindle = formats[FORMATS.KINDLE] || 0;
  const physical = formats[FORMATS.PHYSICAL] || 0;
  const audio = formats[FORMATS.AUDIO] || 0;
  if (count && audio / count >= 0.8) {
    return { id: 'ouvinte', title: 'Bom de ouvido', reason: `${pct(audio / count)}% dos livros em audiolivro.`, rule: '80% ou mais dos livros em audiolivro' };
  }
  if (count && kindle / count >= 0.8) {
    return { id: 'kindle', title: 'Fiel ao Kindle', reason: `${pct(kindle / count)}% dos livros no Kindle.`, rule: '80% ou mais dos livros no Kindle' };
  }
  if (count && physical / count >= 0.8) {
    return { id: 'papel', title: 'Fiel ao papel', reason: `${pct(physical / count)}% dos livros em papel.`, rule: '80% ou mais dos livros físicos' };
  }
  return { id: 'curioso', title: 'Curioso', reason: 'Um pouco de tudo, sem um padrão dominante.', rule: 'quando nenhuma outra regra se aplica' };
}
