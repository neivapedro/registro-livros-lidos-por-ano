import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import zlib from 'node:zlib';
import { inflateRaw } from '../app/js/inflate.js';
import {
  COMPARE_STORAGE, MAX_PARAM, bookKey, buildSnapshot, cleanText, commonBooks, compareLink, decodeSnapshot,
  encodeSnapshot, encodeWithinLimit, extractParam, readSavedCompare, removeSavedCompare, saveCompare, validateSnapshot,
} from '../app/js/compare.js';
import {
  applyImport, cleanIsbn, detectSource, mapGoodreadsRow, parseCsv, parseDate, planImport, reviewText, splitSeries,
  undoImport, unwrapExcel,
} from '../app/js/goodreads.js';
import {
  AMBIENT_STORAGE, SOUNDS, brownNoise, createAmbient, crackle, pinkNoise, rainDrops, readAmbientPref, saveAmbientPref,
  volumeGain, whiteNoise,
} from '../app/js/ambient.js';
import { createEmptyState, normalizeBook, normalizeState } from '../app/js/store.js';
import { ambientPicker } from '../app/js/views/ambient.js';
import { compareView } from '../app/js/views/compare.js';
import { importPreviewCard } from '../app/js/views/importar.js';

function memoryStorage(initial = {}) {
  const data = { ...initial };
  return {
    getItem: (k) => (k in data ? data[k] : null),
    setItem: (k, v) => { data[k] = String(v); },
    removeItem: (k) => { delete data[k]; },
    data,
  };
}

const b64u = (s) => Buffer.from(s).toString('base64url');
const TODAY = '2026-10-28';
const book = (o) => normalizeBook({ status: 'lido', format: 'fisico', ...o }, '2026-01-01T00:00:00.000Z');

/** Um ano com n livros lidos (títulos e autores de tamanho realista). */
function stateWithYear(n, year = 2026) {
  const state = createEmptyState();
  const genres = ['Ficção', 'Romance', 'Fantasia', 'História', 'Biografia'];
  for (let i = 0; i < n; i += 1) {
    const month = String((i % 10) + 1).padStart(2, '0');
    state.books.push(book({
      id: `b${i}`, title: `O Livro Número ${i} das Leituras do Ano`, authors: `Autora Sobrenome${i % 9}, Outro Autor`,
      endDate: `${year}-${month}-1${i % 9}`, startDate: `${year}-${month}-01`, rating: 3 + (i % 5) / 2, pages: 200 + i,
      genre: genres[i % 5], favorite: i === 3,
    }));
  }
  state.goals[year] = 30;
  return state;
}

// ---------- inflate ----------

test('inflate: igual ao zlib (blocos guardados, fixos e dinâmicos) e ao CompressionStream', async () => {
  const texts = ['', 'a', 'abc abc abc abc abc', JSON.stringify(Array.from({ length: 200 }, (_, i) => [`Título ção ${i}`, `Autor ${i % 7}`, i % 5])),
    Array.from({ length: 3000 }, (_, i) => String.fromCharCode(33 + ((i * 7919) % 90))).join('')];
  for (const t of texts) {
    for (const level of [0, 1, 9]) {
      for (const strategy of [zlib.constants.Z_DEFAULT_STRATEGY, zlib.constants.Z_FIXED, zlib.constants.Z_HUFFMAN_ONLY]) {
        const z = zlib.deflateRawSync(Buffer.from(t), { level, strategy });
        assert.equal(Buffer.from(inflateRaw(z, { maxOut: 1e6 })).toString(), t);
      }
    }
  }
  const z = new Uint8Array(await new Response(new Blob([texts[3]]).stream().pipeThrough(new CompressionStream('deflate-raw'))).arrayBuffer());
  assert.equal(Buffer.from(inflateRaw(z, { maxOut: 1e6 })).toString(), texts[3]);
});

test('inflate: bomba de compressão para no limite; lixo dá erro', () => {
  const bomb = zlib.deflateRawSync(Buffer.alloc(5_000_000, 'a'));
  assert.ok(bomb.length < 10000);
  assert.throws(() => inflateRaw(bomb, { maxOut: 32768 }), /grande demais/);
  assert.throws(() => inflateRaw(new Uint8Array([0xff, 0xff, 0xff])));
  assert.throws(() => inflateRaw(new Uint8Array([])));
  assert.throws(() => inflateRaw(zlib.deflateRawSync(Buffer.from('texto qualquer')).subarray(0, 4)));
});

// ---------- Comparar: montar e ler o link ----------

test('comparar: resumo do ano com nome, meta, meses, gêneros, favorito e livros', () => {
  const snap = buildSnapshot(stateWithYear(12), 2026, TODAY, { name: '  Karoline‮ ', withBooks: true });
  assert.equal(snap.v, 1);
  assert.equal(snap.n, 'Karoline');
  assert.equal(snap.y, 2026);
  assert.equal(snap.c, 12);
  assert.equal(snap.g, 30);
  assert.equal(snap.m.reduce((a, b) => a + b, 0), 12);
  assert.ok(snap.t.length <= 5 && snap.t[0][1] >= snap.t[snap.t.length - 1][1]);
  assert.deepEqual(snap.f, ['O Livro Número 3 das Leituras do Ano', 'Autora Sobrenome3']);
  assert.equal(snap.b.length, 12);
  assert.equal(snap.b[0].length, 3);
  assert.equal(snap.s, TODAY);
  assert.equal(buildSnapshot(stateWithYear(3), 2026, TODAY, { withBooks: false }).b, undefined);
  assert.deepEqual(validateSnapshot(snap), snap, 'o próprio resumo passa na conferência');
});

test('comparar: ida e volta compactada (deflate-raw) e sem compactar', async () => {
  const snap = buildSnapshot(stateWithYear(30), 2026, TODAY, { name: 'Pedro' });
  const z = await encodeSnapshot(snap);
  const j = await encodeSnapshot(snap, { compress: false });
  assert.match(z, /^z\.[A-Za-z0-9_-]+$/);
  assert.match(j, /^j\.[A-Za-z0-9_-]+$/);
  assert.ok(z.length < j.length * 0.7, `compactado ${z.length} vs ${j.length}`);
  assert.deepEqual(decodeSnapshot(z), snap);
  assert.deepEqual(decodeSnapshot(j), snap);
  const link = compareLink('https://neivapedro.github.io/registro-livros-lidos-por-ano/#/inicio', z);
  assert.ok(link.startsWith('https://neivapedro.github.io/registro-livros-lidos-por-ano/#/comparar?d=z.'));
  // Um ano de 30 livros com a lista: o link fica curto o bastante para WhatsApp/iMessage.
  assert.ok(link.length < 2600, `link de ${link.length} caracteres`);
  // Colado com texto em volta (como chega no WhatsApp).
  assert.deepEqual(decodeSnapshot(`Compare as nossas leituras: ${link} 👋`), snap);
  assert.equal(extractParam(`veja ${link}`), z);
});

test('comparar: sem CompressionStream o link sai sem compactar e abre igual', async () => {
  const saved = globalThis.CompressionStream;
  globalThis.CompressionStream = undefined;
  try {
    const snap = buildSnapshot(stateWithYear(5), 2026, TODAY, {});
    const p = await encodeSnapshot(snap);
    assert.match(p, /^j\./);
    assert.deepEqual(decodeSnapshot(p), snap);
  } finally {
    globalThis.CompressionStream = saved;
  }
});

test('comparar: link grande demais encurta a lista de livros (os números ficam)', async () => {
  const snap = buildSnapshot(stateWithYear(300), 2026, TODAY, {});
  const out = await encodeWithinLimit(snap, { limit: 1500, compress: false });
  assert.ok(out.param.length <= 1500);
  assert.ok(out.snap.b === undefined || out.snap.b.length < 300);
  assert.equal(out.snap.c, 300);
  assert.deepEqual(out.snap.m, snap.m);
  assert.equal(await encodeWithinLimit({ ...snap, b: undefined, n: 'x' }, { limit: 10 }), null);
});

test('comparar: rejeita link malicioso, estragado ou grande demais', () => {
  const good = buildSnapshot(stateWithYear(2), 2026, TODAY, {});
  const enc = (o) => `j.${b64u(JSON.stringify(o))}`;
  assert.ok(decodeSnapshot(enc(good)));
  const bad = [
    { ...good, v: 2 },
    { ...good, extra: 1 },
    JSON.parse(`{"__proto__":{"x":1},${JSON.stringify(good).slice(1)}`),
    { ...good, y: '2026' },
    { ...good, y: 99999 },
    { ...good, c: -1 },
    { ...good, c: 3 }, // meses não somam o total
    { ...good, m: [1, 1] },
    { ...good, m: Array(12).fill(0.5) },
    { ...good, p: 1e12 },
    { ...good, g: 0 },
    { ...good, r: 7 },
    { ...good, r: '5' },
    { ...good, n: 'x'.repeat(200) },
    { ...good, t: [['ok', 1], ['a', 1], ['b', 1], ['c', 1], ['d', 1], ['e', 1]] },
    { ...good, t: [['', 1]] },
    { ...good, t: [[{}, 1]] },
    { ...good, f: ['', 'x'] },
    { ...good, f: ['a'.repeat(500), 'x'] },
    { ...good, b: [['T', 'A', 6]] },
    { ...good, b: [['T', 'A', 4.3]] },
    { ...good, b: [['T', 'A']] },
    { ...good, b: Array.from({ length: 301 }, () => ['T', 'A', 0]) },
    { ...good, b: 'livros' },
    { ...good, s: 'ontem' },
    [good],
    null,
    'texto',
  ];
  for (const o of bad) assert.equal(decodeSnapshot(enc(o)), null, JSON.stringify(o)?.slice(0, 80));
  assert.equal(decodeSnapshot(''), null);
  assert.equal(decodeSnapshot('j.@@@'), null);
  assert.equal(decodeSnapshot('x.abcd'), null);
  assert.equal(decodeSnapshot(`j.${'A'.repeat(MAX_PARAM)}`), null, 'grande demais');
  assert.equal(decodeSnapshot(`j.${b64u('{"v":1')}`), null, 'JSON quebrado');
  assert.equal(decodeSnapshot(`j.${Buffer.from([0xff, 0xfe, 0x7b]).toString('base64url')}`), null, 'UTF-8 inválido');
  const bomb = zlib.deflateRawSync(Buffer.from(JSON.stringify({ ...good, n: ' '.repeat(5_000_000) })));
  assert.equal(decodeSnapshot(`z.${bomb.toString('base64url')}`), null, 'bomba de compressão');
});

test('comparar: texto do link é limpo (controles, direção) e o HTML é escapado na tela', () => {
  const evil = {
    ...buildSnapshot(createEmptyState(), 2026, TODAY, {}),
    n: '<img src=x onerror=alert(1)>‮',
    c: 1,
    m: [1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    t: [['<script>alert(1)</script>', 1]],
    f: ['"><b>x</b>', "'onmouseover='"],
    b: [['<svg onload=alert(1)>', '\u0000Autor​', 5]],
  };
  const snap = validateSnapshot(JSON.parse(JSON.stringify(evil)));
  assert.ok(snap);
  assert.equal(snap.n, '<img src=x onerror=alert(1)>');
  assert.equal(snap.b[0][1], 'Autor');
  const me = buildSnapshot(createEmptyState(), 2026, TODAY, {});
  const html = compareView({ mine: me, theirs: snap, common: [{ title: snap.b[0][0], author: 'a', mine: 4, theirs: 5 }], saved: false, names: ['Você', snap.n] });
  assert.doesNotMatch(html, /<img src=x|<script>|<svg onload|<b>x<\/b>/);
  assert.match(html, /&lt;img src=x onerror=alert\(1\)&gt;/);
  assert.equal(cleanText('a\u0007b⁦c  d', 30), 'abc d');
});

test('comparar: livros em comum por título e sobrenome (sem acento, maiúsculas, série), com as duas notas', () => {
  const mine = [
    book({ id: 'm1', title: 'Duna', authors: 'Frank Herbert', endDate: '2024-05-01', rating: 4 }),
    book({ id: 'm2', title: 'Torto arado', authors: 'Itamar Vieira Junior', endDate: '2026-02-01', rating: 5 }),
    book({ id: 'm3', title: 'O Hobbit', authors: '', endDate: '2026-03-01', rating: null }),
    book({ id: 'm4', title: 'Percy Jackson: O mar de monstros', authors: 'Rick Riordan', endDate: '2026-03-01' }),
    normalizeBook({ id: 'm5', title: 'Quero Ler', authors: 'X', status: 'quero' }),
  ];
  const theirs = {
    y: 2026,
    b: [['DUNA (Crônicas de Duna, #1)', 'Frank HERBERT', 4.5], ['Tórto Arado', 'Itamar Vieira Júnior', 3], ['O hobbit', 'J.R.R. Tolkien', 0],
      ['Percy Jackson: O ladrão de raios', 'Rick Riordan', 4], ['Quero Ler', 'X', 3], ['Duna', 'Outro Autor', 2]],
  };
  const common = commonBooks(theirs, mine);
  assert.deepEqual(common.map((c) => [c.id, c.mine, c.theirs]), [['m1', 4, 4.5], ['m2', 5, 3], ['m3', 0, 0]]);
  assert.deepEqual(commonBooks({ y: 2026 }, mine), [], 'sem lista no link');
  assert.equal(bookKey('A Revolução dos Bichos', 'George Orwell'), bookKey('a revolucao dos bichos!', 'ORWELL'));
  assert.notEqual(bookKey('ノルウェイの森', '村上春樹'), bookKey('海辺のカフカ', '村上春樹'), 'títulos não latinos não colidem');
});

test('comparar: guardar para ver depois fica numa chave própria (fora do estado e do backup)', async () => {
  const s = memoryStorage();
  const param = await encodeSnapshot(buildSnapshot(stateWithYear(3), 2026, TODAY, { name: 'Karoline' }));
  assert.equal(readSavedCompare(s), null);
  assert.equal(saveCompare(s, param, TODAY), true);
  assert.deepEqual(Object.keys(s.data), [COMPARE_STORAGE]);
  const saved = readSavedCompare(s);
  assert.equal(saved.snap.n, 'Karoline');
  assert.equal(saved.savedAt, TODAY);
  assert.equal(saveCompare(s, 'j.lixo', TODAY), false, 'link inválido não é guardado');
  s.data[COMPARE_STORAGE] = JSON.stringify({ d: 'j.estragado' });
  assert.equal(readSavedCompare(s), null);
  removeSavedCompare(s);
  assert.deepEqual(s.data, {});
  assert.equal(readSavedCompare({ getItem() { throw new Error('bloqueado'); } }), null);
  assert.equal(saveCompare({ setItem() { throw new Error('cheio'); } }, param, TODAY), false);
  // O estado do app nem conhece a chave: um backup restaurado não a traz nem a apaga.
  assert.equal('comparacao' in normalizeState({ comparacao: param }), false);
});

// ---------- Goodreads / StoryGraph ----------

const FIXTURE = readFileSync(new URL('./fixtures/goodreads_library_export.csv', import.meta.url), 'utf8');

test('CSV: aspas, aspas dobradas, vírgula e quebra de linha no campo, BOM, CRLF, CR e ponto e vírgula', () => {
  assert.deepEqual(parseCsv('﻿a,b,c\r\n1,"x, y","diz ""oi"""\r\n2,"linha 1\nlinha 2",\n\n3,,"" \r'), [
    ['a', 'b', 'c'], ['1', 'x, y', 'diz "oi"'], ['2', 'linha 1\nlinha 2', ''], ['3', '', ' '],
  ]);
  assert.deepEqual(parseCsv('a;b\r1;"2;3"'), [['a', 'b'], ['1', '2;3']]);
  assert.deepEqual(parseCsv('a,b\n"sem fim'), [['a', 'b'], ['sem fim']]);
  assert.deepEqual(parseCsv(''), []);
  assert.equal(parseCsv('x\n1\n2\n3\n4', { maxRows: 3 }).length, 3);
});

test('Goodreads: ISBN com ="...", datas, resenha com <br/>, série no título', () => {
  assert.equal(unwrapExcel('="0441172717"'), '0441172717');
  assert.equal(unwrapExcel('=""'), '');
  assert.equal(unwrapExcel(' 978-85 '), '978-85');
  assert.equal(cleanIsbn('="9780441172719"', '="0441172717"'), '9780441172719');
  assert.equal(cleanIsbn('=""', '="0441172717"'), '9780441172719', 'ISBN-10 vira 13');
  assert.equal(cleanIsbn('="123"', '=""'), '');
  assert.equal(parseDate('2026/03/14'), '2026-03-14');
  assert.equal(parseDate('2026/3/4'), '2026-03-04');
  assert.equal(parseDate('2026-02-30'), null);
  assert.equal(parseDate('14/03/2026'), null);
  assert.equal(reviewText('Ótimo.<br/><br/>Linha 2 &amp; <b>negrito</b>'), 'Ótimo.\n\nLinha 2 & negrito');
  assert.deepEqual(splitSeries('Dune (Dune Chronicles, #1)'), { title: 'Dune', series: 'Dune Chronicles', seriesNumber: 1 });
  assert.deepEqual(splitSeries('Harry Potter (Harry Potter #2.5)'), { title: 'Harry Potter', series: 'Harry Potter', seriesNumber: 2.5 });
  assert.deepEqual(splitSeries('Livro (edição especial)'), { title: 'Livro (edição especial)', series: '', seriesNumber: null });
  assert.equal(detectSource(['Title', 'Author', 'Exclusive Shelf']), 'goodreads');
  assert.equal(detectSource(['Title', 'Authors', 'Read Status', 'Star Rating']), 'storygraph');
  assert.equal(detectSource(['Título', 'Autor(es)', 'Status']), null, 'a planilha do próprio app não é importada assim');
});

test('Goodreads: linha → livro (status, nota, páginas, datas, etiquetas, releitura, Kindle, capa)', () => {
  const get = (o) => (k) => o[k] ?? '';
  const { raw, undated } = mapGoodreadsRow(get({
    title: 'Dune (Dune Chronicles, #1)', author: 'Frank Herbert', 'additional authors': 'Brian Herbert, Frank Herbert',
    isbn: '="0441172717"', isbn13: '="9780441172719"', 'my rating': '5', 'number of pages': '688', 'date read': '2026/03/14',
    'date added': '2026/01/02', bookshelves: 'favoritos, read, to-read, sci-fi', 'exclusive shelf': 'read', 'my review': 'Bom<br/>demais', 'read count': '2', binding: 'Kindle Edition',
  }));
  assert.equal(undated, false);
  assert.equal(raw.title, 'Dune');
  assert.equal(raw.series, 'Dune Chronicles');
  assert.equal(raw.authors, 'Frank Herbert, Brian Herbert');
  assert.equal(raw.status, 'lido');
  assert.equal(raw.rating, 5);
  assert.equal(raw.pages, 688);
  assert.equal(raw.endDate, '2026-03-14');
  assert.deepEqual(raw.tags, ['favoritos', 'sci-fi']);
  assert.equal(raw.reread, true);
  assert.equal(raw.format, 'kindle');
  assert.equal(raw.notes, 'Bom\ndemais');
  assert.equal(raw.cover, 'https://covers.openlibrary.org/b/isbn/9780441172719-M.jpg?default=false');
  const want = mapGoodreadsRow(get({ title: 'X', author: 'Y', 'exclusive shelf': 'to-read', 'my rating': '0' })).raw;
  assert.equal(want.status, 'quero');
  assert.equal(want.rating, null);
  assert.equal(want.cover, null);
  assert.equal(mapGoodreadsRow(get({ title: 'X', 'exclusive shelf': 'currently-reading', 'date added': '2026/09/20' })).raw.startDate, '2026-09-20');
  assert.equal(mapGoodreadsRow(get({ title: 'X', 'exclusive shelf': 'abandonados-dnf' })).raw.status, 'abandonado');
});

test('Goodreads: prévia do arquivo de exemplo (contagens, repetidos, sem data, sem título)', () => {
  const state = createEmptyState();
  state.books.push(book({ id: 'sap', title: 'Sapiens', authors: 'Yuval Noah Harari', endDate: '2026-08-28', isbn: '9788525432186' }));
  const plan = planImport(state, `﻿${FIXTURE.replace(/\n/g, '\r\n')}`, '2026-10-28T12:00:00.000Z');
  assert.equal(plan.source, 'goodreads');
  assert.deepEqual(plan.counts, { lido: 3, lendo: 1, quero: 1, abandonado: 1 });
  assert.equal(plan.books.length, 6);
  assert.deepEqual(plan.duplicates.map((d) => [d.book.title, d.twin.title, d.inFile]), [
    ['Sapiens: Uma breve história da humanidade', 'Sapiens', false], // mesmo ISBN
    ['Duna', 'Dune', true], // mesmo ISBN, repetido no próprio arquivo
  ]);
  assert.equal(plan.undated, 1, 'O Hobbit, lido sem data');
  assert.equal(plan.skipped, 1, 'linha sem título');
  const hobbit = plan.books.find((b) => b.title === 'O Hobbit');
  assert.equal(hobbit.endDate, '2025-06-01');
  assert.equal(hobbit.format, 'kindle');
  const contos = plan.books.find((b) => b.title.startsWith('Contos'));
  assert.equal(contos.title, 'Contos, Crônicas & "Outras" Histórias');
  assert.equal(contos.notes, 'Primeira linha\nsegunda linha, com vírgula\nterceira\n\nNota privada');
  assert.deepEqual(contos.tags, ['contos', 'favoritos']);
  const dune = plan.books.find((b) => b.title === 'Dune');
  assert.equal(dune.notes, 'Incrível.\n\nLinha 2, com vírgula e "aspas".');
  assert.equal(dune.isbn, '9780441172719');
  const dropped = plan.books.find((b) => b.status === 'abandonado');
  assert.equal(dropped.authors, 'Fulano de Tal, Beltrano, Sicrano');
  assert.equal(dropped.endDate, '2026-02-01');
  // A prévia não mexe no estado.
  assert.equal(state.books.length, 1);
  assert.deepEqual(planImport(state, 'a,b\n1,2'), { error: 'formato' });
  assert.deepEqual(planImport(state, ''), { error: 'vazio' });
});

test('Goodreads: importar só acrescenta; Desfazer volta exatamente ao estado de antes', () => {
  const before = normalizeState({ books: [book({ id: 'sap', title: 'Sapiens', authors: 'Yuval Noah Harari', endDate: '2026-08-28', isbn: '9788525432186', favorite: true })], upNext: [] });
  const snapshot = JSON.stringify(before);
  const plan = planImport(before, FIXTURE);
  const { state: after, ids } = applyImport(before, plan);
  assert.equal(after.books.length, 7);
  assert.equal(ids.length, 6);
  assert.deepEqual(after.books[0], before.books[0], 'o livro que já existia não muda');
  assert.equal(JSON.stringify(before), snapshot, 'o estado anterior não é alterado');
  assert.deepEqual(normalizeState(JSON.parse(JSON.stringify(after))).books.length, 7, 'o resultado sobrevive ao backup');
  assert.deepEqual(undoImport(after, ids), { ...before, upNext: [] });
  const withDups = applyImport(before, plan, { includeDuplicates: true });
  assert.equal(withDups.ids.length, 8);
  // Desfazer depois de outra alteração: só tira os importados.
  const edited = { ...after, books: [...after.books, book({ id: 'novo', title: 'Novo', endDate: '2026-10-01' })] };
  assert.deepEqual(undoImport(edited, ids).books.map((b) => b.id), ['sap', 'novo']);
});

test('StoryGraph: colunas próprias (Read Status, Star Rating com meia estrela, did-not-finish)', () => {
  const csv = [
    'Title,Authors,Contributors,ISBN/UID,Format,Read Status,Date Added,Last Date Read,Dates Read,Read Count,Moods,Pace,Star Rating,Review,Tags,Owned?',
    'Torto Arado,Itamar Vieira Junior,,9786580309313,paperback,read,2026/01/10,2026/02/03,2026/01/11-2026/02/03,1,,,4.5,"Lindo, triste",brasil,No',
    'Livro Digital,Ana,,,digital,currently-reading,2026/10/01,,,0,,,,,,No',
    'Largado,Beto,,,paperback,did-not-finish,2026/03/01,2026/03/10,,0,,,,,,No',
  ].join('\n');
  const plan = planImport(createEmptyState(), csv);
  assert.equal(plan.source, 'storygraph');
  const [torto, digital, largado] = plan.books;
  assert.equal(torto.rating, 4.5);
  assert.equal(torto.endDate, '2026-02-03');
  assert.equal(torto.notes, 'Lindo, triste');
  assert.deepEqual(torto.tags, ['brasil']);
  assert.equal(digital.status, 'lendo');
  assert.equal(digital.format, 'kindle');
  assert.equal(largado.status, 'abandonado');
});

test('importar: prévia na tela escapa o que vem do arquivo', () => {
  const plan = planImport(createEmptyState(), 'Title,Author,Exclusive Shelf\n"<img src=x onerror=alert(1)>",<b>A</b>,read\n"<img src=x onerror=alert(1)>",<b>A</b>,read');
  const html = importPreviewCard({ plan, fileName: '<script>.csv', includeDuplicates: false });
  assert.doesNotMatch(html, /<img src=x|<script>|<b>A<\/b>/);
  assert.match(html, /Importar 1 livro</);
  assert.match(html, /1 livro já está no app/);
  assert.match(importPreviewCard({ plan, fileName: 'x', includeDuplicates: true }), /Importar 2 livros</);
  assert.match(importPreviewCard({ done: { count: 3 } }), /3 livros importados[\s\S]*data-action="gr-undo"/);
});

// ---------- Sons ambiente ----------

test('som ambiente: escolha e volume ficam no aparelho; valor estranho volta ao padrão', () => {
  assert.deepEqual(SOUNDS.map(([id]) => id), ['off', 'chuva', 'cafe', 'lareira', 'marrom']);
  const s = memoryStorage();
  assert.deepEqual(readAmbientPref(s), { sound: 'off', volume: 60 });
  assert.equal(saveAmbientPref(s, { sound: 'lareira', volume: 35 }), true);
  assert.deepEqual(readAmbientPref(s), { sound: 'lareira', volume: 35 });
  s.data[AMBIENT_STORAGE] = '{"sound":"<b>","volume":900}';
  assert.deepEqual(readAmbientPref(s), { sound: 'off', volume: 60 });
  s.data[AMBIENT_STORAGE] = 'lixo';
  assert.deepEqual(readAmbientPref(s), { sound: 'off', volume: 60 });
  assert.equal(saveAmbientPref({ setItem() { throw new Error('cheio'); } }, { sound: 'chuva' }), false);
  assert.equal(volumeGain(0), 0);
  assert.equal(volumeGain(100), 0.8);
  assert.ok(volumeGain(50) < 0.4 / 1.5);
});

test('som ambiente: ruídos gerados em laço sem estalo (emenda contínua) e sem passar do pico', () => {
  let seed = 7;
  const rand = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
  for (const gen of [whiteNoise, pinkNoise, brownNoise]) {
    const n = 48000;
    const a = gen(n, rand);
    assert.equal(a.length, n);
    let max = 0;
    for (const v of a) {
      assert.ok(Number.isFinite(v));
      max = Math.max(max, Math.abs(v));
    }
    assert.ok(max <= 0.9 + 1e-6 && max > 0.5, `${gen.name}: pico ${max}`);
  }
  // Ruído marrom é suave: a emenda (última → primeira amostra) é um passo pequeno, como os outros.
  const brown = brownNoise(48000, rand);
  const step = Math.abs(brown[0] - brown[brown.length - 1]);
  let avg = 0;
  for (let i = 1; i < brown.length; i += 1) avg += Math.abs(brown[i] - brown[i - 1]);
  avg /= brown.length - 1;
  assert.ok(step < avg * 8, `emenda ${step} vs passo médio ${avg}`);
  const drops = rainDrops(44100, 44100, rand);
  assert.ok(drops.some((v) => v !== 0) && drops.every((v) => Math.abs(v) <= 0.9 + 1e-6));
  const c = crackle(44100, rand);
  assert.ok(c.length > 200 && c.length < 1200);
});

/** AudioContext de mentira: registra o que foi criado e o estado. */
class FakeParam {
  constructor() { this.value = 0; }
  setValueAtTime(v) { this.value = v; }
  setTargetAtTime(v) { this.value = v; }
  cancelScheduledValues() {}
  exponentialRampToValueAtTime(v) { this.value = v; }
}
class FakeNode {
  constructor(ctx) { this.ctx = ctx; this.gain = new FakeParam(); this.frequency = new FakeParam(); this.Q = new FakeParam(); }
  connect(n) { return n; }
  disconnect() {}
  start() { this.ctx.started += 1; }
  stop() { this.ctx.stopped += 1; }
}
class FakeContext {
  static made = 0;
  constructor() { FakeContext.made += 1; this.state = 'running'; this.sampleRate = 8000; this.currentTime = 0; this.destination = {}; this.started = 0; this.stopped = 0; }
  createGain() { return new FakeNode(this); }
  createBiquadFilter() { return new FakeNode(this); }
  createOscillator() { return new FakeNode(this); }
  createBufferSource() { return new FakeNode(this); }
  createBuffer(ch, n) { const data = new Float32Array(n); return { duration: n / this.sampleRate, getChannelData: () => data }; }
  async resume() { this.state = 'running'; }
  async suspend() { this.state = 'suspended'; }
}

test('som ambiente: nada de áudio até tocar; tocar, trocar, volume e parar', async () => {
  FakeContext.made = 0;
  const player = createAmbient({ AudioContextClass: FakeContext });
  assert.equal(FakeContext.made, 0, 'nenhum AudioContext antes do toque');
  assert.equal(player.state, 'none');
  assert.equal(player.playing, false);
  assert.equal(player.play('chuva', 50), true);
  assert.equal(FakeContext.made, 1);
  assert.equal(player.playing, true);
  assert.equal(player.sound, 'chuva');
  assert.ok(player.context.started >= 3, 'três camadas da chuva');
  player.play('lareira');
  assert.equal(player.sound, 'lareira');
  assert.equal(FakeContext.made, 1, 'o mesmo contexto é reaproveitado');
  player.setVolume(10);
  player.stop();
  assert.equal(player.playing, false);
  await new Promise((r) => { setTimeout(r, 500); });
  assert.equal(player.state, 'suspended', 'parado, o contexto dorme');
  assert.ok(player.context.stopped > 0);
  player.context.state = 'interrupted';
  player.resume();
  assert.equal(player.context.state, 'interrupted', 'parado de propósito: não volta sozinho');
  player.play('cafe');
  player.context.state = 'interrupted';
  player.resume();
  await Promise.resolve();
  assert.equal(player.context.state, 'running', 'interrompido pelo sistema: volta');
  player.play('off');
  assert.equal(player.playing, false);
  assert.equal(createAmbient({ AudioContextClass: null }).play('chuva') || true, true);
});

test('som ambiente: seletor com os cinco sons, volume e o aviso do modo silencioso', () => {
  const off = ambientPicker({ sound: 'off', volume: 60, playing: false });
  assert.equal((off.match(/data-action="ambient-pick"/g) || []).length, 5);
  assert.doesNotMatch(off, /data-ambient-volume/);
  const on = ambientPicker({ sound: 'chuva', volume: 40, playing: true });
  assert.match(on, /data-value="chuva" aria-pressed="true"/);
  assert.match(on, /value="40" style="--p:0.4" data-ambient-volume/);
  assert.match(on, /aria-label="Ruído marrom">Marrom</);
  assert.match(on, /Sem som\? Confira o modo silencioso/);
  assert.match(on, /data-ambient-playing="true"/);
  assert.match(ambientPicker({ sound: 'chuva', volume: 40, playing: false }, { paused: true }), /O som volta quando você continuar/);
});
