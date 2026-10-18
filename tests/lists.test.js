// Etiquetas, séries, próximas leituras, sorteio e chave do Google.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  GOOGLE_KEY_STORAGE, looksLikeGoogleKey, readGoogleKey, removeGoogleKey, saveGoogleKey,
} from '../app/js/prefs.js';
import {
  booksInSeries, formatSeriesNumber, groupBySeries, seriesInfo, seriesLabel, seriesNames,
} from '../app/js/series.js';
import { normalizeState, removeBook, upsertBook } from '../app/js/store.js';
import { addTags, hasTag, removeTag, tagRanking, topTagsInYear } from '../app/js/tags.js';
import {
  drawBook, drawCandidates, firstUpNext, moveUpNext, toggleUpNext, wantQueue,
} from '../app/js/upnext.js';

test('addTags: vírgula separa, sem repetir (ignora maiúsculas), sem vazios', () => {
  assert.deepEqual(addTags([], 'clássico'), ['clássico']);
  assert.deepEqual(addTags(['clássico'], ' presente , Clássico,, ficção científica '), ['clássico', 'presente', 'ficção científica']);
  assert.deepEqual(addTags(['a'], '   '), ['a']);
  assert.deepEqual(addTags(undefined, 'x'), ['x']);
  assert.equal(addTags([], 'a'.repeat(60))[0].length, 40);
  const many = Array.from({ length: 35 }, (_, i) => `t${i}`).join(',');
  assert.equal(addTags([], many).length, 30);
});

test('removeTag e hasTag ignoram maiúsculas', () => {
  assert.deepEqual(removeTag(['Clássico', 'presente'], 'clássico'), ['presente']);
  assert.deepEqual(removeTag(['a'], 'b'), ['a']);
  assert.equal(hasTag(['Presente'], 'presente'), true);
  assert.equal(hasTag([], 'x'), false);
});

test('etiquetas mais usadas (no ano: só livros lidos nele)', () => {
  const books = [
    { status: 'lido', endDate: '2026-02-01', tags: ['b', 'a'], updatedAt: '' },
    { status: 'lido', endDate: '2026-03-01', tags: ['a'], updatedAt: '' },
    { status: 'lido', endDate: '2025-03-01', tags: ['z', 'z2'], updatedAt: '' },
    { status: 'quero', tags: ['q'] },
  ];
  assert.deepEqual(topTagsInYear(books, 2026), [{ label: 'a', count: 2 }, { label: 'b', count: 1 }]);
  assert.equal(tagRanking(books).length, 5);
  assert.deepEqual(tagRanking(books, 2).map((t) => t.label), ['a', 'b']);
});

const vol = (id, n, status = 'quero', extra = {}) => ({ id, title: `Duna ${n}`, series: 'Duna', seriesNumber: n, status, ...extra });

test('série: próximo volume e quantos foram lidos', () => {
  const books = [
    vol('d1', 1, 'lido'), vol('d2', 2, 'lido'), vol('d3', 3), vol('d5', 5),
    vol('d2b', 2, 'lido', { reread: true }), // releitura do 2 conta uma vez
    { id: 'x', title: 'Outro', series: 'Fundação', seriesNumber: 1, status: 'lido' },
    vol('dz', null, 'quero', { title: 'Duna: contos', series: ' duna ' }),
  ];
  const info = seriesInfo(books, books[1]);
  assert.equal(info.next.id, 'd3');
  assert.equal(info.total, 5);
  assert.equal(info.read, 2);
  assert.equal(seriesInfo(books, books[2]).next.id, 'd5', 'pula o número que falta');
  assert.equal(seriesInfo(books, books[3]).next, null, 'último volume');
  assert.equal(seriesInfo(books, { ...vol('new', '2,5'), id: 'new' }).next.id, 'd3', 'número digitado com vírgula');
  // Mesmo número repetido: prefere o volume ainda não lido.
  const twice = [vol('a1', 1, 'lido'), vol('a2', 2, 'lido'), vol('a2b', 2, 'quero')];
  assert.equal(seriesInfo(twice, twice[0]).next.id, 'a2b');
});

test('série: nomes, rótulo, ordem e agrupamento', () => {
  const books = [vol('d2', 2), vol('d1', 1), { id: 'f', title: 'Fundação', series: 'Fundação ', seriesNumber: 1.5 }, { id: 'n', title: 'Solto', series: '' }];
  assert.deepEqual(seriesNames(books), ['Duna', 'Fundação']);
  assert.deepEqual(booksInSeries(books, 'duna').map((b) => b.id), ['d1', 'd2']);
  assert.equal(seriesLabel(books[0]), 'Duna · nº 2');
  assert.equal(seriesLabel(books[2]), 'Fundação · nº 1,5');
  assert.equal(seriesLabel({ series: 'Duna', seriesNumber: null }), 'Duna');
  assert.equal(seriesLabel({ series: '' }), '');
  assert.equal(formatSeriesNumber(2.5), '2,5');
  const groups = groupBySeries(books);
  assert.deepEqual(groups.map((g) => g.name), ['Duna', 'Fundação', null]);
  assert.deepEqual(groups[0].books.map((b) => b.id), ['d1', 'd2']);
});

function queueState() {
  return normalizeState({
    books: [
      { id: 'w1', title: 'A', status: 'quero', createdAt: '2026-01-01', genre: 'Ficção', format: 'fisico' },
      { id: 'w2', title: 'B', status: 'quero', createdAt: '2026-01-02', genre: 'Gestão', format: 'kindle' },
      { id: 'w3', title: 'C', status: 'quero', createdAt: '2026-01-03', genre: 'Ficção', format: 'kindle' },
      { id: 'w4', title: 'D', status: 'quero', createdAt: '2026-01-04' },
      { id: 'w5', title: 'E', status: 'quero', createdAt: '2026-01-05' },
      { id: 'w6', title: 'F', status: 'quero', createdAt: '2026-01-06' },
      { id: 'r1', title: 'Lido', status: 'lido', endDate: '2026-02-01' },
    ],
    upNext: ['w3', 'w1'],
  });
}

test('próximas: lista na ordem escolhida e o resto na ordem de entrada', () => {
  const { next, rest } = wantQueue(queueState());
  assert.deepEqual(next.map((b) => b.id), ['w3', 'w1']);
  assert.deepEqual(rest.map((b) => b.id), ['w2', 'w4', 'w5', 'w6']);
  assert.equal(firstUpNext(queueState()).id, 'w3');
  assert.equal(firstUpNext(normalizeState({ books: [] })), null);
});

test('próximas: marcar, desmarcar e limite de 5', () => {
  let s = queueState();
  s = toggleUpNext(s, 'w2').state;
  assert.deepEqual(s.upNext, ['w3', 'w1', 'w2']);
  s = toggleUpNext(s, 'w1').state;
  assert.deepEqual(s.upNext, ['w3', 'w2']);
  s = toggleUpNext(toggleUpNext(toggleUpNext(s, 'w4').state, 'w5').state, 'w6').state;
  assert.equal(s.upNext.length, 5);
  const full = toggleUpNext(s, 'w1');
  assert.equal(full.full, true);
  assert.equal(full.state, s);
  assert.equal(toggleUpNext(s, 'r1').state.upNext.includes('r1'), false, 'livro lido não entra');
});

test('próximas: subir e descer', () => {
  const s = queueState();
  assert.deepEqual(moveUpNext(s, 'w1', -1).upNext, ['w1', 'w3']);
  assert.deepEqual(moveUpNext(s, 'w3', 1).upNext, ['w1', 'w3']);
  assert.equal(moveUpNext(s, 'w3', -1), s, 'primeiro não sobe');
  assert.equal(moveUpNext(s, 'w1', 1), s, 'último não desce');
  assert.equal(moveUpNext(s, 'w2', 1), s, 'fora da lista');
});

test('próximas ficam limpas ao começar a ler ou excluir', () => {
  const s = queueState();
  const started = upsertBook(s, { ...s.books.find((b) => b.id === 'w3'), status: 'lendo', startDate: '2026-10-16' }).state;
  assert.deepEqual(started.upNext, ['w1']);
  assert.deepEqual(removeBook(s, 'w1').upNext, ['w3']);
});

test('sorteio com filtros e gerador injetado', () => {
  const { books } = queueState();
  assert.deepEqual(drawCandidates(books, { genre: 'Ficção' }).map((b) => b.id), ['w1', 'w3']);
  assert.deepEqual(drawCandidates(books, { genre: 'Ficção', format: 'kindle' }).map((b) => b.id), ['w3']);
  assert.equal(drawCandidates(books).length, 6, 'só "Quero ler"');
  assert.equal(drawBook(books, {}, () => 0).id, 'w1');
  assert.equal(drawBook(books, {}, () => 0.999).id, 'w6');
  assert.equal(drawBook(books, { format: 'kindle' }, () => 0.5).id, 'w3');
  assert.equal(drawBook(books, { genre: 'Ficção' }, () => 0, 'w1').id, 'w3', 'não repete o anterior');
  assert.equal(drawBook(books, { genre: 'Ficção', format: 'kindle' }, () => 0, 'w3').id, 'w3', 'única opção');
  assert.equal(drawBook(books, { genre: 'Poesia' }, () => 0), null);
});

function memoryStorage() {
  const data = new Map();
  return {
    getItem: (k) => (data.has(k) ? data.get(k) : null),
    setItem: (k, v) => data.set(k, String(v)),
    removeItem: (k) => data.delete(k),
  };
}

test('chave do Google: limpa espaços, avisa formato estranho, remove', () => {
  const st = memoryStorage();
  const key = `AIza${'x'.repeat(35)}`;
  assert.equal(looksLikeGoogleKey(key), true);
  assert.equal(looksLikeGoogleKey('AIza123'), false);
  assert.deepEqual(saveGoogleKey(st, `  ${key}\n`), { ok: true, key, warning: false });
  assert.equal(readGoogleKey(st), key);
  assert.equal(st.getItem(GOOGLE_KEY_STORAGE), key);
  assert.deepEqual(saveGoogleKey(st, 'outra-coisa'), { ok: true, key: 'outra-coisa', warning: true });
  assert.deepEqual(saveGoogleKey(st, '   '), { ok: false, key: '', warning: false });
  removeGoogleKey(st);
  assert.equal(readGoogleKey(st), '');
  const broken = { getItem() { throw new Error('x'); }, setItem() { throw new Error('x'); }, removeItem() { throw new Error('x'); } };
  assert.equal(readGoogleKey(broken), '');
  assert.equal(saveGoogleKey(broken, key).ok, false);
  assert.doesNotThrow(() => removeGoogleKey(broken));
});
