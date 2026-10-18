import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  diarySummary, editEntry, entriesNewestFirst, entryLine, entryParts, removeEntry, restoreEntry, syncPosition,
} from '../app/js/diary.js';
import {
  buildQuote, countQuotes, fold, quoteFileName, quotePosition, quoteSavedDay, quotesNewestFirst, removeQuote, restoreQuote,
  searchQuotes, upsertQuote,
} from '../app/js/quotes.js';
import { fitQuote, wrapLines } from '../app/js/quote-image.js';

const TODAY = '2026-10-16';
const e = (date, from, to, extra = {}) => ({ date, from, to, unit: 'page', note: '', ...extra });
const p = (date, from, to, extra = {}) => ({ date, from, to, unit: 'percent', note: '', ...extra });
const physical = (journal, extra = {}) => ({ id: 'p', title: 'Dom Casmurro', authors: 'Machado de Assis', format: 'fisico', status: 'lendo', pages: 256, currentPage: null, journal, quotes: [], ...extra });
const kindle = (journal, extra = {}) => ({ id: 'k', title: 'Fora de Série', authors: 'Malcolm Gladwell', format: 'kindle', status: 'lendo', pages: 320, currentPercent: null, journal, quotes: [], ...extra });

// ---------- Diário ----------

test('texto da entrada: páginas, % com páginas estimadas, minutos e correção', () => {
  assert.equal(entryLine(physical([]), e('2026-10-12', 120, 164), TODAY), '12 out · p. 120 → 164 (+44 págs.)');
  assert.equal(entryLine(kindle([]), p('2026-10-12', 20, 45), TODAY), '12 out · 20% → 45% (+25% · ≈ 80 págs.)');
  assert.equal(entryLine(kindle([], { pages: null }), p('2026-10-12', 20, 45), TODAY), '12 out · 20% → 45% (+25%)');
  assert.equal(entryLine(physical([]), e('2025-12-30', 10, 11, { minutes: 32 }), TODAY), '30 dez 2025 · p. 10 → 11 (+1 pág.) · 32 min');
  assert.equal(entryParts(physical([]), e('2026-10-12', 120, 100)).delta, 'correção');
});

test('diário do mais recente para o mais antigo', () => {
  const book = physical([e('2026-10-01', 0, 10), e('2026-10-03', 10, 20), e('2026-10-02', 20, 30)]);
  assert.deepEqual(entriesNewestFirst(book).map((x) => x.date), ['2026-10-03', '2026-10-02', '2026-10-01']);
});

test('resumo: dias que avançaram, páginas e média por dia', () => {
  const book = physical([e('2026-10-01', 0, 40), e('2026-10-02', 40, 100), e('2026-10-03', 100, 90)]);
  assert.deepEqual(diarySummary(book), { days: 2, pages: 100, percent: 0, avg: 50, unit: 'page' });
  // Kindle com total de páginas: % vira página.
  assert.equal(diarySummary(kindle([p('2026-10-01', 0, 25)])).pages, 80);
  // Kindle sem total: fica em %.
  assert.deepEqual(diarySummary(kindle([p('2026-10-01', 0, 25), p('2026-10-02', 25, 30)], { pages: null })),
    { days: 2, pages: null, percent: 30, avg: 15, unit: 'percent' });
  assert.deepEqual(diarySummary(physical([])), { days: 0, pages: 0, percent: 0, avg: 0, unit: 'page' });
});

test('corrigir entrada: valores, nota e reordena pela data', () => {
  const book = physical([e('2026-10-01', 0, 40, { minutes: 20 }), e('2026-10-05', 40, 90)]);
  const { journal, entry } = editEntry(book, '2026-10-05', { date: '2026-09-30', from: '5', to: '30', note: ' no ônibus ' }, TODAY);
  assert.deepEqual(journal, [e('2026-09-30', 5, 30, { note: 'no ônibus' }), e('2026-10-01', 0, 40, { minutes: 20 })]);
  assert.equal(entry, journal[0]);
  // Campos que não estão no formulário (minutos do cronômetro) continuam.
  assert.equal(editEntry(book, '2026-10-01', { date: '2026-10-01', from: 0, to: 45 }, TODAY).journal[0].minutes, 20);
  // Não altera o diário original.
  assert.equal(book.journal[1].to, 90);
});

test('corrigir entrada: validações', () => {
  const book = physical([e('2026-10-01', 0, 40), e('2026-10-05', 40, 90)]);
  const err = (input, b = book, date = '2026-10-05') => editEntry(b, date, { date: '2026-10-05', from: 40, to: 90, ...input }, TODAY).error;
  assert.equal(err({ date: '2026-10-17' }), 'A data não pode estar no futuro.');
  assert.equal(err({ date: '2026-02-30' }), 'Informe uma data válida.');
  assert.match(err({ date: '2026-10-01' }), /Já existe um registro em 1 out/);
  assert.equal(err({ to: '' }), 'Informe as duas páginas.');
  assert.equal(err({ from: -1 }), 'Use números a partir de 0.');
  assert.equal(err({ to: 'abc' }), 'Use números a partir de 0.');
  assert.equal(err({ to: 12.5 }), 'Use números inteiros de página.');
  assert.match(err({ to: 300 }), /não pode passar de 256/);
  assert.equal(err({ to: 300 }, physical(book.journal, { pages: null })), undefined);
  assert.equal(err({}, book, '2026-01-01'), 'Registro não encontrado.');
  // Mesma data da própria entrada pode.
  assert.equal(err({}), undefined);
  const kb = kindle([p('2026-10-05', 10, 20)]);
  assert.equal(editEntry(kb, '2026-10-05', { date: '2026-10-05', from: 10, to: 101 }, TODAY).error, 'A porcentagem vai de 0 a 100.');
  assert.equal(editEntry(kb, '2026-10-05', { date: '2026-10-05', from: '10', to: '45,4%' }, TODAY).journal[0].to, 45);
});

test('excluir e desfazer entrada', () => {
  const book = physical([e('2026-10-01', 0, 40), e('2026-10-05', 40, 90)]);
  const journal = removeEntry(book, '2026-10-01');
  assert.deepEqual(journal, [e('2026-10-05', 40, 90)]);
  assert.deepEqual(restoreEntry({ journal }, e('2026-10-01', 0, 40)), book.journal);
  // Dia ocupado de novo: não duplica.
  assert.deepEqual(restoreEntry(book, e('2026-10-01', 5, 6)), book.journal);
});

test('corrigir o último dia acompanha a página atual', () => {
  const book = physical([e('2026-10-01', 0, 40), e('2026-10-05', 40, 90)], { currentPage: 90 });
  const before = book.journal[1];
  const { journal, entry } = editEntry(book, '2026-10-05', { date: '2026-10-05', from: 40, to: 85 }, TODAY);
  assert.deepEqual(syncPosition(book, before, entry, journal), { currentPage: 85 });
  // Dia antigo, ou página atual que não batia: não mexe.
  const old = editEntry(book, '2026-10-01', { date: '2026-10-01', from: 0, to: 35 }, TODAY);
  assert.deepEqual(syncPosition(book, book.journal[0], old.entry, old.journal), {});
  assert.deepEqual(syncPosition({ ...book, currentPage: 120 }, before, entry, journal), {});
  // Último dia levado para antes de outro: não é mais o último.
  const moved = editEntry(book, '2026-10-05', { date: '2026-09-01', from: 40, to: 85 }, TODAY);
  assert.deepEqual(syncPosition(book, before, moved.entry, moved.journal), {});
  const kb = kindle([p('2026-10-05', 10, 20)], { currentPercent: 20 });
  const k = editEntry(kb, '2026-10-05', { date: '2026-10-05', from: 10, to: 30 }, TODAY);
  assert.deepEqual(syncPosition(kb, kb.journal[0], k.entry, k.journal), { currentPercent: 30 });
});

// ---------- Trechos ----------

const NOW = '2026-10-16T12:00:00.000Z';

test('novo trecho: página no físico, % no Kindle', () => {
  const { quote } = buildQuote(physical([]), { text: '  Tudo é bom.  ', position: '45', note: ' gostei ' }, { id: 'q1', nowTs: NOW });
  assert.deepEqual(quote, { id: 'q1', createdAt: NOW, text: 'Tudo é bom.', page: 45, percent: null, note: 'gostei' });
  const k = buildQuote(kindle([]), { text: 'Dez mil horas.', position: '33,6%' }, { id: 'q2', nowTs: NOW }).quote;
  assert.equal(k.percent, 34);
  assert.equal(k.page, null);
  assert.equal(buildQuote(physical([]), { text: 'Sem página', position: '' }, { id: 'q3', nowTs: NOW }).quote.page, null);
});

test('trecho: validações', () => {
  const err = (input, book = physical([])) => buildQuote(book, input, { id: 'x', nowTs: NOW }).error;
  assert.equal(err({ text: '   ' }), 'Escreva o trecho.');
  assert.equal(err({ text: 'a', position: '300' }), 'Informe uma página entre 0 e 256.');
  assert.equal(err({ text: 'a', position: '2.5' }), 'Informe uma página entre 0 e 256.');
  assert.equal(err({ text: 'a', position: '-1' }), 'Informe um número de página válido.');
  assert.equal(err({ text: 'a', position: '101' }, kindle([])), 'Informe uma porcentagem entre 0 e 100.');
});

test('corrigir trecho mantém id, data e a posição do outro formato', () => {
  const existing = { id: 'q1', createdAt: '2026-01-01T00:00:00.000Z', text: 'velho', page: 12, percent: null, note: '' };
  const { quote } = buildQuote(kindle([]), { text: 'novo', position: '50', note: '' }, { existing, id: 'outro', nowTs: NOW });
  assert.deepEqual(quote, { id: 'q1', createdAt: '2026-01-01T00:00:00.000Z', text: 'novo', page: 12, percent: 50, note: '' });
});

test('incluir, substituir, excluir e desfazer trecho', () => {
  const a = { id: 'a', text: 'A' };
  const b = { id: 'b', text: 'B' };
  let list = upsertQuote([], a);
  list = upsertQuote(list, b);
  assert.deepEqual(upsertQuote(list, { id: 'a', text: 'A2' }), [{ id: 'a', text: 'A2' }, b]);
  const removed = removeQuote(list, 'a');
  assert.deepEqual(removed, [b]);
  assert.deepEqual(restoreQuote(removed, a, 0), [a, b]);
  assert.deepEqual(restoreQuote(list, a, 1), list);
});

test('posição e ordem dos trechos', () => {
  assert.equal(quotePosition({ page: 0, percent: null }), 'p. 0');
  assert.equal(quotePosition({ page: null, percent: 45 }), '45%');
  assert.equal(quotePosition({ page: null, percent: null }), '');
  const book = { quotes: [{ id: '1', createdAt: '2026-01-01T00:00:00Z' }, { id: '2', createdAt: '2026-05-01T00:00:00Z' }] };
  assert.deepEqual(quotesNewestFirst(book).map((q) => q.id), ['2', '1']);
});

test('busca de trechos ignora acentos e procura no texto, nota, título e autor', () => {
  const books = [
    physical([], { quotes: [
      { id: 'q1', text: 'Capitu tinha olhos de ressaca.', note: '', createdAt: '2026-02-01T00:00:00Z' },
      { id: 'q2', text: 'A vida é uma ópera.', note: 'sobre o coração', createdAt: '2026-03-01T00:00:00Z' },
    ] }),
    kindle([], { quotes: [{ id: 'q3', text: 'Dez mil horas de prática.', note: '', createdAt: '2026-04-01T00:00:00Z' }] }),
  ];
  const ids = (q) => searchQuotes(books, q).map((r) => r.quote.id);
  assert.deepEqual(ids(''), ['q3', 'q2', 'q1']);
  assert.deepEqual(ids('OPERA'), ['q2']);
  assert.deepEqual(ids('coracao'), ['q2']);
  assert.deepEqual(ids('machado'), ['q2', 'q1']);
  assert.deepEqual(ids('gladwell'), ['q3']);
  assert.deepEqual(ids('capitu ressaca'), ['q1']);
  assert.deepEqual(ids('capitu gladwell'), []);
  assert.equal(searchQuotes(books, 'série')[0].book.id, 'k');
  assert.equal(countQuotes(books), 3);
  assert.equal(fold('Ação É'), 'acao e');
  assert.equal(quoteFileName({ title: 'Fora de Série!' }), 'trecho-fora-de-serie.png');
  assert.equal(quoteFileName({ title: '???' }), 'trecho-livro.png');
});

// ---------- Imagem ----------

const measure = (t) => t.length * 10;

test('quebra de linhas por largura, respeitando parágrafos', () => {
  assert.deepEqual(wrapLines('um dois tres quatro', 90, measure), ['um dois', 'tres', 'quatro']);
  assert.deepEqual(wrapLines('linha um\n\nlinha dois', 200, measure), ['linha um', 'linha dois']);
  // Palavra maior que a linha é cortada.
  assert.deepEqual(wrapLines('abcdefghijkl x', 50, measure), ['abcde', 'fghij', 'kl x']);
  for (const line of wrapLines('Lorem ipsum dolor sit amet, consectetur adipiscing elit sed do eiusmod', 120, measure)) {
    assert.ok(measure(line) <= 120, line);
  }
});

test('tamanho da letra: o maior que cabe; texto enorme é cortado com reticências', () => {
  const at = (t, size) => t.length * size * 0.5;
  const short = fitQuote('Curto.', { maxWidth: 800, maxHeight: 500, maxSize: 76, minSize: 36 }, at);
  assert.equal(short.size, 76);
  assert.equal(short.truncated, false);
  const medium = fitQuote('palavra '.repeat(60), { maxWidth: 800, maxHeight: 500, maxSize: 76, minSize: 36 }, at);
  assert.ok(medium.size < 76 && medium.size >= 36);
  assert.ok(medium.lines.length * medium.lineHeight <= 500);
  const huge = fitQuote('palavra '.repeat(1000), { maxWidth: 800, maxHeight: 500, maxSize: 76, minSize: 36 }, at);
  assert.equal(huge.truncated, true);
  assert.equal(huge.size, 36);
  assert.ok(huge.lines.length * huge.lineHeight <= 500);
  assert.match(huge.lines.at(-1), /…$/);
  assert.ok(at(huge.lines.at(-1), 36) <= 800);
});

// ---------- Correções do QA ----------

test('imagem: palavra enorme (5000 letras, sem espaço) quebra com poucas medições', () => {
  let calls = 0;
  const counted = (t) => {
    calls += 1;
    return t.length * 10;
  };
  const lines = wrapLines('a'.repeat(5000), 500, counted);
  assert.equal(lines.length, 100);
  assert.ok(lines.every((l) => l.length === 50));
  // Antes: ~12 milhões de medições (travava a tela no iPhone).
  assert.ok(calls < 5000, `${calls} medições`);
  calls = 0;
  const fit = fitQuote('b'.repeat(5000), { maxWidth: 888, maxHeight: 560, maxSize: 84, minSize: 36 }, (t, size) => {
    calls += 1;
    return t.length * size * 0.5;
  });
  assert.equal(fit.truncated, true);
  assert.ok(calls < 50000, `${calls} medições`);
});

test('imagem: palavra cortada não parte emoji ao meio', () => {
  const byChar = (t) => Array.from(t).length * 10;
  const lines = wrapLines('📚'.repeat(12), 50, byChar);
  assert.deepEqual(lines, ['📚📚📚📚📚', '📚📚📚📚📚', '📚📚']);
  const fit = fitQuote('📚'.repeat(400), { maxWidth: 100, maxHeight: 100, maxSize: 40, minSize: 36 }, (t) => Array.from(t).length * 10);
  for (const line of fit.lines) assert.ok(!/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/.test(line), line);
});

test('posição do trecho em livro que mudou de formato: vale a do formato atual', () => {
  const both = { page: 63, percent: 30 };
  assert.equal(quotePosition(both, kindle([])), '30%');
  assert.equal(quotePosition(both, physical([])), 'p. 63');
  // Só a do formato antigo: mostra a que existe.
  assert.equal(quotePosition({ page: 63, percent: null }, kindle([])), 'p. 63');
  assert.equal(quotePosition({ page: null, percent: 30 }, physical([])), '30%');
});

test('trecho: livro com 500 trechos não aceita mais um (não some calado ao salvar)', () => {
  const quotes = Array.from({ length: 500 }, (_, i) => ({ id: `q${i}`, text: `t${i}`, page: null, percent: null, note: '', createdAt: NOW }));
  const book = physical([], { quotes });
  assert.match(buildQuote(book, { text: 'mais um' }, { id: 'novo', nowTs: NOW }).error, /500 trechos/);
  // Corrigir um que já existe continua possível.
  assert.equal(buildQuote(book, { text: 'corrigido' }, { existing: quotes[0], id: 'x', nowTs: NOW }).quote.text, 'corrigido');
});

test('trecho: dia em que foi salvo é o do fuso do aparelho, não o de Greenwich', () => {
  const tz = process.env.TZ;
  process.env.TZ = 'America/Sao_Paulo';
  try {
    // 22h30 de 16/10 em São Paulo = 01h30 de 17/10 em UTC.
    assert.equal(quoteSavedDay({ createdAt: '2026-10-17T01:30:00.000Z' }), '2026-10-16');
    assert.equal(quoteSavedDay({ createdAt: '2026-10-16T12:00:00.000Z' }), '2026-10-16');
    assert.equal(quoteSavedDay({ createdAt: 'lixo' }), '');
    assert.equal(quoteSavedDay({}), '');
  } finally {
    if (tz === undefined) delete process.env.TZ;
    else process.env.TZ = tz;
  }
});
