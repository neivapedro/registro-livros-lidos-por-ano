// Desafios de leitura (1.6): metas extras do ano, além da meta de livros ("Ler 1 livro com mais
// de 500 páginas", "Ler 2 releituras"...). O progresso é calculado sozinho com os livros lidos
// no ano (status Lido, término no ano); no tipo 'manual' a pessoa escolhe os livros que contam.
// Funções puras: recebem o estado (ou os livros) e devolvem dados novos, sem alterar nada.
// O formato guardado e a limpeza ficam em store.js (normalizeChallenge).

import { yearOf } from './dates.js';
import { splitAuthors } from './stats.js';
import { FORMAT_LABELS, MAX_CHALLENGES, STATUS, newId, normalizeChallenge } from './store.js';

/** Nome das regras, na ordem do seletor do formulário. */
export const RULE_LABELS = {
  genre: 'Gênero',
  nonfiction: 'Não ficção',
  tag: 'Etiqueta',
  pages: 'Livros longos',
  format: 'Formato',
  reread: 'Releituras',
  series: 'Livros de série',
  seriesDone: 'Séries concluídas',
  authors: 'Autores diferentes',
  author: 'Livros de um autor',
  manual: 'Eu escolho os livros',
};

/** Regras que pedem um valor: 'select' (gênero, formato), 'text' (etiqueta, autor, série), 'number' (páginas). */
export const RULE_VALUE = { genre: 'select', format: 'select', tag: 'text', author: 'text', series: 'text', pages: 'number' };

/** Sugestões prontas: só regras que dá para conferir com o que já se registra dos livros. */
export const CHALLENGE_TEMPLATES = [
  { key: 'longo', title: 'Ler 1 livro com mais de 500 páginas', target: 1, rule: { type: 'pages', value: 500 } },
  { key: 'nao-ficcao', title: 'Ler 3 livros de não ficção', target: 3, rule: { type: 'nonfiction', value: null } },
  { key: 'releituras', title: 'Ler 2 releituras', target: 2, rule: { type: 'reread', value: null } },
  { key: 'serie', title: 'Terminar uma série', target: 1, rule: { type: 'seriesDone', value: null } },
  { key: 'autores', title: 'Ler 5 autores diferentes', target: 5, rule: { type: 'authors', value: null } },
  { key: 'classicos', title: 'Ler 3 clássicos', target: 3, rule: { type: 'tag', value: 'Clássico' } },
  { key: 'kindle', title: 'Ler 3 livros no Kindle', target: 3, rule: { type: 'format', value: 'kindle' } },
  { key: 'biografias', title: 'Ler 2 biografias', target: 2, rule: { type: 'genre', value: 'Biografia' } },
];

const key = (s) => String(s || '').trim().toLocaleLowerCase('pt-BR');
/** Sem acentos e sem maiúsculas: "Não-ficção" e "nao ficcao" se encontram. */
const fold = (s) => key(s).normalize('NFD').replace(/[̀-ͯ]/g, '');
const livros = (n) => `${n} ${n === 1 ? 'livro' : 'livros'}`;
const nf = new Intl.NumberFormat('pt-BR');

/** Áudio (se o app ganhar audiolivros) não é "livro lido no formato X" de páginas: conta só pelo formato. */
function formatLabel(value) {
  return FORMAT_LABELS[value] || String(value || '');
}

/** Título automático, quando a pessoa não escreve um. */
export function autoTitle(rule, target) {
  const v = rule?.value;
  switch (rule?.type) {
    case 'genre': return `Ler ${livros(target)} de ${v}`;
    case 'nonfiction': return `Ler ${livros(target)} de não ficção`;
    case 'tag': return `Ler ${livros(target)} com a etiqueta ${v}`;
    case 'pages': return `Ler ${livros(target)} com mais de ${nf.format(v)} páginas`;
    case 'format':
      if (v === 'kindle') return `Ler ${livros(target)} no Kindle`;
      if (v === 'fisico') return `Ler ${livros(target)} em papel`;
      return `Ler ${livros(target)} em ${formatLabel(v).toLocaleLowerCase('pt-BR')}`;
    case 'reread': return `Ler ${target} ${target === 1 ? 'releitura' : 'releituras'}`;
    case 'series': return v ? `Ler ${livros(target)} de ${v}` : `Ler ${livros(target)} de séries`;
    case 'seriesDone': return target === 1 ? 'Terminar uma série' : `Terminar ${target} séries`;
    case 'authors': return `Ler ${target} ${target === 1 ? 'autor' : 'autores diferentes'}`;
    case 'author': return `Ler ${livros(target)} de ${v}`;
    default: return `Ler ${livros(target)} escolhidos`;
  }
}

export function challengeTitle(c) {
  return c.title || autoTitle(c.rule, c.target);
}

/** O que conta, numa linha ("Etiqueta “Clássico”"). */
export function ruleText(rule) {
  const v = rule?.value;
  switch (rule?.type) {
    case 'genre': return `Gênero ${v}`;
    case 'nonfiction': return 'Gênero que não é ficção';
    case 'tag': return `Etiqueta “${v}”`;
    case 'pages': return `Mais de ${nf.format(v)} páginas`;
    case 'format': return `Formato ${formatLabel(v)}`;
    case 'reread': return 'Livros marcados como releitura';
    case 'series': return v ? `Série ${v}` : 'Qualquer livro de série';
    case 'seriesDone': return 'Todos os volumes cadastrados lidos';
    case 'authors': return 'Cada autor conta uma vez';
    case 'author': return `Autor ${v}`;
    default: return 'Você escolhe os livros que contam';
  }
}

/** O livro vale para a regra? (só regras de livro a livro; autores, séries concluídas e manual são à parte) */
function matches(rule, book) {
  const v = rule.value;
  switch (rule.type) {
    case 'genre': return Boolean(book.genre) && key(book.genre) === key(v);
    case 'nonfiction': return Boolean(book.genre) && !fold(book.genre).includes('ficcao');
    case 'tag': return (book.tags || []).some((t) => key(t) === key(v));
    case 'pages': return Number(book.pages) > v;
    case 'format': return book.format === v;
    case 'reread': return book.reread === true;
    case 'series': return Boolean(key(book.series)) && (!v || key(book.series) === key(v));
    case 'author': return splitAuthors(book.authors).some((a) => key(a) === key(v)) || (key(v).length >= 3 && key(book.authors).includes(key(v)));
    default: return false;
  }
}

const byEnd = (a, b) => a.endDate.localeCompare(b.endDate) || a.title.localeCompare(b.title, 'pt-BR');

function readInYear(books, year) {
  return books.filter((b) => b.status === STATUS.READ && b.endDate && yearOf(b.endDate) === year).sort(byEnd);
}

/**
 * Séries concluídas no ano: todos os volumes cadastrados (pelo menos 2) têm uma leitura concluída
 * e a última delas terminou no ano. Volume = número na série (ou o título, sem número); releituras
 * do mesmo volume contam uma vez. Devolve o livro que fechou cada série, em ordem de término.
 */
function seriesFinished(books, year) {
  const groups = new Map();
  for (const b of books) {
    const k = key(b.series);
    if (!k) continue;
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(b);
  }
  const out = [];
  for (const list of groups.values()) {
    const volumes = new Map();
    for (const b of list) {
      const v = b.seriesNumber ?? `t:${key(b.title)}`;
      const firstRead = volumes.get(v) ?? null;
      const read = b.status === STATUS.READ && b.endDate ? b : null;
      volumes.set(v, !firstRead ? read : read && read.endDate < firstRead.endDate ? read : firstRead);
    }
    if (volumes.size < 2 || [...volumes.values()].some((b) => !b)) continue;
    const last = [...volumes.values()].sort(byEnd).pop();
    if (yearOf(last.endDate) === year) out.push(last);
  }
  return out.sort(byEnd);
}

/**
 * Progresso do desafio: { count, target, done, pct, books, completedOn, reading }.
 * books: os livros que contam (na ordem em que foram lidos). completedOn: término do livro que
 * completou o desafio. reading: livros em leitura que vão contar quando terminarem.
 */
export function challengeProgress(challenge, books) {
  const { rule, year, target } = challenge;
  const read = readInYear(books, year);
  let hits = [];
  let count = 0;
  let completedOn = null;
  if (rule.type === 'authors') {
    const seen = new Set();
    for (const b of read) {
      const fresh = splitAuthors(b.authors).map(key).filter((a) => !seen.has(a));
      if (!fresh.length) continue;
      fresh.forEach((a) => seen.add(a));
      hits.push(b);
      if (!completedOn && seen.size >= target) completedOn = b.endDate;
    }
    count = seen.size;
  } else {
    if (rule.type === 'seriesDone') hits = seriesFinished(books, year);
    else if (rule.type === 'manual') {
      const picked = new Set(challenge.books || []);
      hits = read.filter((b) => picked.has(b.id));
    } else hits = read.filter((b) => matches(rule, b));
    count = hits.length;
    completedOn = count >= target ? hits[target - 1].endDate : null;
  }
  const reading = ['authors', 'seriesDone', 'manual'].includes(rule.type)
    ? 0
    : books.filter((b) => b.status === STATUS.READING && matches(rule, b)).length;
  return {
    count, target, done: count >= target, pct: Math.min(100, Math.round((count / target) * 100)), books: hits, completedOn, reading,
  };
}

/** Desafios do ano, na ordem em que foram criados. */
export function challengesForYear(state, year) {
  return (state.challenges || []).filter((c) => c.year === year);
}

/** Livros que dá para escolher num desafio 'manual': os lidos no ano, do mais recente ao mais antigo. */
export function pickableBooks(books, year) {
  return readInYear(books, year).reverse();
}

function doneIds(state) {
  const out = new Set();
  for (const c of state.challenges || []) if (challengeProgress(c, state.books).done) out.add(c.id);
  return out;
}

/**
 * Desafios que ficaram completos entre um estado e outro (para o aviso de parabéns, uma vez).
 * Só os que já existiam antes: criar um desafio que já nasce cumprido não é uma conquista nova.
 */
export function newlyCompleted(before, after) {
  if (!after.challenges?.length) return [];
  const existed = new Set((before.challenges || []).map((c) => c.id));
  const was = doneIds(before);
  return after.challenges.filter((c) => existed.has(c.id) && !was.has(c.id) && challengeProgress(c, after.books).done);
}

/** Cria ou atualiza um desafio. Devolve { state, challenge } (challenge null se inválido). */
export function saveChallenge(state, input) {
  const list = state.challenges || [];
  const existing = list.find((c) => c.id === input.id);
  if (!existing && list.length >= MAX_CHALLENGES) return { state, challenge: null };
  const challenge = normalizeChallenge({ ...existing, ...input, id: input.id || newId() });
  if (!challenge) return { state, challenge: null };
  const challenges = existing ? list.map((c) => (c.id === challenge.id ? challenge : c)) : [...list, challenge];
  return { state: { ...state, challenges }, challenge };
}

/** Tira o desafio. Devolve { state, removed, index } para o Desfazer. */
export function removeChallenge(state, id) {
  const list = state.challenges || [];
  const index = list.findIndex((c) => c.id === id);
  if (index < 0) return { state, removed: null, index: -1 };
  return { state: { ...state, challenges: list.filter((c) => c.id !== id) }, removed: list[index], index };
}

/** Desfazer: recoloca o desafio na mesma posição (se ainda não voltou). */
export function restoreChallenge(state, challenge, index) {
  const list = [...(state.challenges || [])];
  if (!challenge || list.some((c) => c.id === challenge.id)) return state;
  list.splice(Math.min(Math.max(index, 0), list.length), 0, challenge);
  return { ...state, challenges: list };
}

/** Marca ou desmarca um livro num desafio 'manual'. */
export function toggleChallengeBook(state, id, bookId) {
  const c = (state.challenges || []).find((x) => x.id === id);
  if (!c || c.rule.type !== 'manual') return state;
  const books = c.books.includes(bookId) ? c.books.filter((b) => b !== bookId) : [...c.books, bookId];
  return saveChallenge(state, { ...c, books }).state;
}

/** A sugestão já está no ano (mesma regra)? Para não criar duas iguais com toques repetidos. */
export function templateUsed(state, year, template) {
  return challengesForYear(state, year).some((c) => c.rule.type === template.rule.type
    && key(c.rule.value) === key(template.rule.value) && c.target === template.target);
}
