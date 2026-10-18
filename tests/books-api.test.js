import { beforeEach, test } from 'node:test';
import assert from 'node:assert/strict';
import {
  clearSearchCache, isbn10To13, joinAuthors, mergeResults, rankResults, normalizeBrasilApiBook, normalizeGoogleVolume, normalizeOpenLibraryDoc,
  openLibraryCoverByIsbn, parseIsbn, searchBooks,
} from '../app/js/books-api.js';

beforeEach(clearSearchCache);

const googleItem = {
  id: 'abc123',
  volumeInfo: {
    title: 'A Meta',
    subtitle: 'Um processo de melhoria contínua',
    authors: ['Eliyahu M. Goldratt', 'Jeff Cox'],
    pageCount: 384,
    publishedDate: '2014-05-01',
    industryIdentifiers: [{ type: 'ISBN_10', identifier: '8521315317' }, { type: 'ISBN_13', identifier: '9788521315315' }],
    imageLinks: { thumbnail: 'http://books.google.com/books/content?id=abc123&printsec=frontcover&img=1&zoom=1&edge=curl&source=gbs_api' },
  },
};

const olDoc = {
  key: '/works/OL123W',
  title: 'The Goal',
  author_name: ['Eliyahu M. Goldratt'],
  number_of_pages_median: 337,
  cover_i: 8231856,
  isbn: ['0884270610', '9780884271956'],
  first_publish_year: 1984,
};

const brasilApiBook = {
  isbn: '9788521315315',
  title: 'A Meta',
  subtitle: 'Um processo de melhoria contínua',
  authors: ['Eliyahu M. Goldratt', 'Jeff Cox'],
  publisher: 'Nobel',
  synopsis: '...',
  year: 2014,
  page_count: 384,
  cover_url: 'http://exemplo.com/capa.jpg',
  provider: 'cbl',
  subjects: ['Administração'],
};

test('normalizeGoogleVolume', () => {
  assert.deepEqual(normalizeGoogleVolume(googleItem), {
    source: 'Google Books',
    sourceId: 'google:abc123',
    title: 'A Meta: Um processo de melhoria contínua',
    authors: 'Eliyahu M. Goldratt, Jeff Cox',
    pages: 384,
    cover: 'https://books.google.com/books/content?id=abc123&printsec=frontcover&img=1&zoom=1&source=gbs_api',
    isbn: '9788521315315',
    year: 2014,
    lang: '',
  });
  assert.equal(normalizeGoogleVolume({ volumeInfo: {} }), null);
  assert.equal(normalizeGoogleVolume({ id: 'x', volumeInfo: { title: 'Sem capa' } }).cover, null);
});

test('normalizeOpenLibraryDoc', () => {
  assert.deepEqual(normalizeOpenLibraryDoc(olDoc), {
    source: 'Open Library',
    sourceId: 'openlibrary:/works/OL123W',
    title: 'The Goal',
    authors: 'Eliyahu M. Goldratt',
    pages: 337,
    cover: 'https://covers.openlibrary.org/b/id/8231856-M.jpg',
    isbn: '9780884271956',
    year: 1984,
  });
  assert.equal(normalizeOpenLibraryDoc({}), null);
});

test('normalizeOpenLibraryDoc usa a edição em português quando vem', () => {
  const doc = {
    ...olDoc,
    editions: { numFound: 1, docs: [{
      key: '/books/OL9M', title: 'A Meta', subtitle: 'Um processo de melhoria contínua',
      language: ['por'], isbn: ['8521315317', '9788521315315'], cover_i: 999,
    }] },
  };
  const r = normalizeOpenLibraryDoc(doc);
  assert.equal(r.title, 'A Meta: Um processo de melhoria contínua');
  assert.equal(r.isbn, '9788521315315');
  assert.equal(r.cover, 'https://covers.openlibrary.org/b/id/999-M.jpg');
  assert.equal(r.sourceId, 'openlibrary:/books/OL9M');
  assert.equal(r.pages, 337);
  assert.equal(r.authors, 'Eliyahu M. Goldratt');
});

test('normalizeOpenLibraryDoc ignora edição em outro idioma', () => {
  const doc = { ...olDoc, editions: { docs: [{ key: '/books/X', title: 'Le But', language: ['fre'] }] } };
  assert.equal(normalizeOpenLibraryDoc(doc).title, 'The Goal');
});

test('normalizeBrasilApiBook', () => {
  assert.deepEqual(normalizeBrasilApiBook(brasilApiBook), {
    source: 'BrasilAPI (CBL)',
    sourceId: 'brasilapi:9788521315315',
    title: 'A Meta: Um processo de melhoria contínua',
    authors: 'Eliyahu M. Goldratt, Jeff Cox',
    pages: 384,
    cover: 'https://exemplo.com/capa.jpg',
    isbn: '9788521315315',
    year: 2014,
  });
  assert.equal(normalizeBrasilApiBook({}), null);
});

test('normalizeBrasilApiBook sem capa usa a capa da Open Library pelo ISBN', () => {
  const r = normalizeBrasilApiBook({
    ...brasilApiBook, isbn: '8521315317', subtitle: null, cover_url: null, page_count: 0, year: null, provider: 'mercado-editorial',
  });
  assert.equal(r.source, 'BrasilAPI (Mercado Editorial)');
  assert.equal(r.isbn, '9788521315315');
  assert.equal(r.cover, 'https://covers.openlibrary.org/b/isbn/9788521315315-M.jpg?default=false');
  assert.equal(r.title, 'A Meta');
  assert.equal(r.pages, null);
  assert.equal(r.year, null);
  assert.equal(normalizeBrasilApiBook({ title: 'X', provider: 'outro' }).source, 'BrasilAPI (outro)');
  assert.equal(normalizeBrasilApiBook({ title: 'X' }).source, 'BrasilAPI');
  assert.equal(normalizeBrasilApiBook({ title: 'X' }).cover, null);
  assert.equal(normalizeBrasilApiBook({ title: 'X' }, '9788521315315').cover, openLibraryCoverByIsbn('9788521315315'));
});

test('parseIsbn reconhece ISBN-10 e ISBN-13 e confere o dígito verificador', () => {
  assert.equal(parseIsbn('978-85-213-1531-5'), '9788521315315');
  assert.equal(parseIsbn(' 978 85 213 1531 5 '), '9788521315315');
  assert.equal(parseIsbn('9798886450088'), '9798886450088');
  assert.equal(parseIsbn('85-213-1531-7'), '9788521315315');
  assert.equal(parseIsbn('0-8044-2957-x'), '9780804429573');
  assert.equal(parseIsbn('9788521315317'), null, 'dígito verificador errado');
  assert.equal(parseIsbn('8521315316'), null, 'dígito verificador errado');
  assert.equal(parseIsbn('9771234567003'), null, 'prefixo que não é de livro');
  assert.equal(parseIsbn('a meta'), null);
  assert.equal(parseIsbn('12345'), null);
});

test('isbn10To13', () => {
  assert.equal(isbn10To13('8521315317'), '9788521315315');
  assert.equal(isbn10To13('0884270610'), '9780884270614');
  assert.equal(isbn10To13('080442957X'), '9780804429573');
  assert.equal(isbn10To13('0884270611'), null);
});

test('mergeResults intercala as fontes e tira repetidos', () => {
  const g = [{ title: 'A', authors: 'X', isbn: '1' }, { title: 'B', authors: 'Y', isbn: '' }];
  const o = [{ title: 'Á', authors: 'x', isbn: '1' }, { title: 'C', authors: 'Z', isbn: '' }, { title: 'b', authors: 'y', isbn: '' }];
  assert.deepEqual(mergeResults([g, o]).map((r) => r.title), ['A', 'B', 'C']);
  assert.deepEqual(mergeResults([[], o, []]).map((r) => r.title), ['Á', 'C', 'b']);
  assert.deepEqual(mergeResults([]), []);
});

function fakeFetch(routes) {
  const calls = [];
  const impl = async (url, opts) => {
    calls.push(url);
    for (const [prefix, handler] of routes) {
      if (url.startsWith(prefix)) return handler(url, opts);
    }
    throw new Error('sem rota');
  };
  return { impl, calls };
}

const ok = (body) => ({ ok: true, status: 200, json: async () => body });
const notFound = () => ({ ok: false, status: 404, json: async () => ({ message: 'ISBN não encontrado' }) });
const tooMany = () => ({ ok: false, status: 429, json: async () => ({}) });
const hang = () => new Promise(() => {});

const BRASIL = 'https://brasilapi.com.br/api/isbn/v1/';
const OL = 'https://openlibrary.org/';
const GOOGLE = 'https://www.googleapis.com/';

test('busca por título consulta só a Open Library (pedindo português) quando não há chave do Google', async () => {
  const { impl, calls } = fakeFetch([
    [GOOGLE, () => ok({ items: [googleItem] })],
    [BRASIL, () => ok(brasilApiBook)],
    [OL, () => ok({ docs: [olDoc] })],
  ]);
  const { results, failed, isbn } = await searchBooks('a meta goldratt', { fetchImpl: impl });
  assert.equal(failed, false);
  assert.equal(isbn, '');
  assert.deepEqual(results.map((r) => r.source), ['Open Library']);
  assert.equal(calls.length, 1);
  assert.match(calls[0], /q=a%20meta%20goldratt%20language%3Apor&lang=pt/);
  assert.match(calls[0], /editions\.title/);
});

test('busca por título inclui o Google Books quando há chave', async () => {
  const { impl, calls } = fakeFetch([
    [GOOGLE, () => ok({ items: [googleItem] })],
    [OL, () => ok({ docs: [olDoc] })],
  ]);
  const { results } = await searchBooks('a meta goldratt', { fetchImpl: impl, googleKey: 'minha chave' });
  assert.deepEqual(results.map((r) => r.source).sort(), ['Google Books', 'Open Library']);
  assert.equal(calls.length, 3, 'Open Library + 2 páginas do Google');
  assert.ok(calls.some((u) => u.startsWith(GOOGLE) && u.includes('startIndex=20')));
  const google = calls.find((u) => u.startsWith(GOOGLE));
  assert.match(google, /q=a%20meta%20goldratt&/);
  assert.match(google, /langRestrict=pt/);
  assert.match(google, /&key=minha%20chave/);
});

test('searchBooks refaz sem filtro de idioma quando não acha nada em português', async () => {
  const { impl, calls } = fakeFetch([
    [OL, (url) => ok(url.includes('language%3Apor') ? { docs: [] } : { docs: [olDoc] })],
  ]);
  const { results } = await searchBooks('obscure book', { fetchImpl: impl });
  assert.equal(calls.length, 2);
  assert.doesNotMatch(calls[1], /language%3Apor/);
  assert.equal(results.length, 1);
});

test('searchBooks segue funcionando se o Google com chave recusar', async () => {
  const { impl } = fakeFetch([
    [GOOGLE, tooMany],
    [OL, () => ok({ docs: [olDoc] })],
  ]);
  const { results, failed } = await searchBooks('the goal', { fetchImpl: impl, googleKey: 'k' });
  assert.equal(failed, false);
  assert.deepEqual(results.map((r) => r.source), ['Open Library']);
});

test('searchBooks avisa quando todas as fontes falham', async () => {
  const { impl } = fakeFetch([]);
  assert.deepEqual(await searchBooks('qualquer', { fetchImpl: impl }), { results: [], failed: true, isbn: '' });
  assert.deepEqual(await searchBooks('9788521315315', { fetchImpl: impl }), { results: [], failed: true, isbn: '9788521315315' });
});

test('ISBN consulta BrasilAPI e Open Library (sem Google) e põe a BrasilAPI primeiro', async () => {
  const { impl, calls } = fakeFetch([
    [GOOGLE, () => ok({ items: [googleItem] })],
    [BRASIL, () => ok(brasilApiBook)],
    [OL, () => ok({ docs: [{ ...olDoc, title: 'Outra obra', author_name: ['Fulano'], cover_i: undefined }] })],
  ]);
  const { results, failed, isbn } = await searchBooks('85-213-1531-7', { fetchImpl: impl });
  assert.equal(failed, false);
  assert.equal(isbn, '9788521315315');
  assert.equal(calls.length, 2);
  assert.ok(calls.includes(`${BRASIL}9788521315315`));
  assert.ok(calls.some((u) => u.startsWith(`${OL}search.json?isbn=9788521315315&`)));
  assert.ok(!calls.some((u) => u.startsWith(GOOGLE)));
  // A obra da Open Library tem esse mesmo ISBN: aparece uma vez só, com os dados da BrasilAPI.
  assert.deepEqual(results.map((r) => r.source), ['BrasilAPI (CBL)']);
  assert.equal(results[0].title, 'A Meta: Um processo de melhoria contínua');
});

test('ISBN: a BrasilAPI vem antes mesmo respondendo depois', async () => {
  const { impl } = fakeFetch([
    [BRASIL, async () => {
      await new Promise((r) => setTimeout(r, 10));
      return ok(brasilApiBook);
    }],
    [OL, () => ok({ docs: [olDoc, { ...olDoc, key: '/works/OL2W', title: 'Outra obra', isbn: [] }] })],
  ]);
  const { results } = await searchBooks('9788521315315', { fetchImpl: impl });
  assert.equal(results[0].source, 'BrasilAPI (CBL)');
  assert.equal(results.length, 1);
});

test('ISBN que a BrasilAPI não conhece (404) usa a Open Library', async () => {
  const { impl } = fakeFetch([
    [BRASIL, notFound],
    [OL, () => ok({ docs: [{ ...olDoc, cover_i: undefined }] })],
  ]);
  const { results, failed } = await searchBooks('9788521315315', { fetchImpl: impl });
  assert.equal(failed, false);
  assert.deepEqual(results.map((r) => r.source), ['Open Library']);
  // Resultado da Open Library numa busca por ISBN fica com esse ISBN e a capa por ele.
  assert.equal(results[0].isbn, '9788521315315');
  assert.equal(results[0].cover, openLibraryCoverByIsbn('9788521315315'));
});

test('ISBN sem resultado em lugar nenhum não é falha e devolve o ISBN', async () => {
  const { impl } = fakeFetch([
    [BRASIL, notFound],
    [OL, () => ok({ docs: [] })],
  ]);
  assert.deepEqual(await searchBooks('9788521315315', { fetchImpl: impl }), { results: [], failed: false, isbn: '9788521315315' });
});

test('ISBN com dígito errado vira busca comum na Open Library', async () => {
  const { impl, calls } = fakeFetch([[OL, () => ok({ docs: [olDoc] })]]);
  const { isbn } = await searchBooks('9788521315317', { fetchImpl: impl });
  assert.equal(isbn, '');
  assert.ok(calls.every((u) => u.startsWith(`${OL}search.json?q=`)));
});

test('busca repetida sai da memória, sem consultar de novo', async () => {
  const { impl, calls } = fakeFetch([
    [BRASIL, () => ok(brasilApiBook)],
    [OL, () => ok({ docs: [olDoc] })],
  ]);
  const first = await searchBooks('a meta', { fetchImpl: impl });
  const again = await searchBooks('  A  Meta ', { fetchImpl: impl });
  assert.equal(calls.length, 1);
  assert.deepEqual(again, first);
  await searchBooks('978-85-213-1531-5', { fetchImpl: impl });
  await searchBooks('8521315317', { fetchImpl: impl });
  assert.equal(calls.length, 3, 'mesmo ISBN escrito de outro jeito sai da memória');
});

test('falha não fica guardada: a próxima tentativa consulta de novo', async () => {
  let online = false;
  const { impl, calls } = fakeFetch([[OL, () => {
    if (!online) throw new Error('offline');
    return ok({ docs: [olDoc] });
  }]]);
  assert.equal((await searchBooks('the goal', { fetchImpl: impl })).failed, true);
  online = true;
  const { results, failed } = await searchBooks('the goal', { fetchImpl: impl });
  assert.equal(failed, false);
  assert.equal(results.length, 1);
  assert.equal(calls.length, 2);
});

test('resultado parcial (uma fonte falhou) não fica guardado: a próxima tentativa consulta de novo', async () => {
  let brasilUp = false;
  const { impl, calls } = fakeFetch([
    [BRASIL, () => {
      if (!brasilUp) throw new Error('fora do ar');
      return ok(brasilApiBook);
    }],
    [OL, () => ok({ docs: [olDoc] })],
  ]);
  const first = await searchBooks('9788521315315', { fetchImpl: impl });
  assert.deepEqual(first.results.map((r) => r.source), ['Open Library']);
  brasilUp = true;
  const again = await searchBooks('9788521315315', { fetchImpl: impl });
  assert.equal(calls.length, 4, 'consulta as fontes de novo');
  assert.ok(again.results.some((r) => r.source.startsWith('BrasilAPI')));
});

test('fonte lenta é abandonada no tempo máximo', async () => {
  const signals = [];
  const { impl } = fakeFetch([
    [BRASIL, (url, opts) => {
      signals.push(opts.signal);
      return hang();
    }],
    [OL, () => ok({ docs: [olDoc] })],
  ]);
  const started = Date.now();
  const { results, failed } = await searchBooks('9788521315315', { fetchImpl: impl, timeoutMs: 30 });
  assert.ok(Date.now() - started < 1000);
  assert.equal(failed, false);
  assert.deepEqual(results.map((r) => r.source), ['Open Library']);
  assert.equal(signals[0].aborted, true, 'a requisição lenta é cancelada');
});

test('todas as fontes lentas: failed = true', async () => {
  const { impl } = fakeFetch([[BRASIL, hang], [OL, hang]]);
  const outcome = await searchBooks('9788521315315', { fetchImpl: impl, timeoutMs: 20 });
  assert.deepEqual(outcome, { results: [], failed: true, isbn: '9788521315315' });
});

test('busca cancelada por quem chamou não devolve nada nem fica guardada', async () => {
  const ctrl = new AbortController();
  const { impl } = fakeFetch([[OL, (url, opts) => new Promise((resolve, reject) => {
    opts.signal.addEventListener('abort', () => reject(new Error('abortado')));
  })]]);
  const pending = searchBooks('the goal', { fetchImpl: impl, signal: ctrl.signal });
  ctrl.abort();
  assert.deepEqual(await pending, { results: [], failed: false, isbn: '' });
  const { impl: impl2, calls } = fakeFetch([[OL, () => ok({ docs: [olDoc] })]]);
  assert.equal((await searchBooks('the goal', { fetchImpl: impl2 })).results.length, 1);
  assert.equal(calls.length, 1);
});

test('searchBooks ignora termos muito curtos', async () => {
  const { impl, calls } = fakeFetch([]);
  assert.deepEqual(await searchBooks(' a ', { fetchImpl: impl }), { results: [], failed: false, isbn: '' });
  assert.equal(calls.length, 0);
});

test('rankResults: livros do autor buscado vêm primeiro e o que não combina sai', () => {
  const r = (title, authors, source = 'Google Books') => ({ title, authors, source });
  const list = [r('IA para Empreendedores', 'Alexandre Rodrigues'), r('Coletânea', 'Vários, Joel Silva'),
    r('Influência', 'Joel Jota'), r('Outro', 'Fulano'), r('Ultracorajoso', 'Joel Jota')];
  assert.deepEqual(rankResults(list, 'joel jota').map((x) => x.title),
    ['Influência', 'Ultracorajoso', 'Coletânea']);
  // Open Library sem palavra em comum fica (edição em português com outro título), no fim.
  assert.deepEqual(rankResults([r('A Meta', 'Goldratt', 'Open Library'), r('The Goal', 'Goldratt')], 'the goal')
    .map((x) => x.title), ['The Goal', 'A Meta']);
  // Se nada combina, a lista fica como veio.
  assert.deepEqual(rankResults(list, 'xyz').map((x) => x.title), list.map((x) => x.title));
  // Título vence palavra solta; acentos e maiúsculas não importam.
  assert.deepEqual(rankResults([r('Bom dia', 'X'), r('A Revolução dos Bichos', 'George Orwell')], 'revolucao bichos')
    .map((x) => x.title), ['A Revolução dos Bichos']);
});

test('Google com erro 503 passageiro: tenta de novo e traz o livro', async () => {
  let n = 0;
  const unavailable = () => ({ ok: false, status: 503, json: async () => ({}) });
  const { impl } = fakeFetch([
    [GOOGLE, (url) => {
      if (url.includes('startIndex')) return ok({});
      n += 1;
      return n === 1 ? unavailable() : ok({ items: [googleItem] });
    }],
    [OL, () => ok({ docs: [] })],
  ]);
  const { results, failed } = await searchBooks('a meta goldratt', { fetchImpl: impl, googleKey: 'k' });
  assert.equal(failed, false);
  assert.equal(n, 2);
  assert.ok(results.some((x) => x.source === 'Google Books'));
});

test('busca mostra até 15 resultados', async () => {
  const items = Array.from({ length: 30 }, (_, i) => ({ id: `g${i}`, volumeInfo: { title: `Livro ${i}`, authors: ['A'] } }));
  const { impl } = fakeFetch([[GOOGLE, () => ok({ items })], [OL, () => ok({ docs: [] })]]);
  const { results } = await searchBooks('livro', { fetchImpl: impl, googleKey: 'k' });
  assert.equal(results.length, 15);
});

test('joinAuthors: até 3 nomes; coletânea vira "e outros"', () => {
  assert.equal(joinAuthors(['Joel Jota']), 'Joel Jota');
  assert.equal(joinAuthors(['A', ' B ', '', 'C']), 'A, B, C');
  assert.equal(joinAuthors(['Joel Jota', 'Ana', 'Bia', 'Caio', 'Duda']), 'Joel Jota, Ana, Bia e outros');
  assert.equal(joinAuthors(undefined), '');
});

test('ordem: no empate, edição em português antes da estrangeira', () => {
  const r = (title, lang) => ({ title, authors: 'Itamar Vieira Junior', source: 'Google Books', lang });
  assert.deepEqual(rankResults([r('Crooked Plow', 'en'), r('Salvar el fuego', 'es'), r('Torto Arado', 'pt-BR')], 'itamar vieira')
    .map((x) => x.title), ['Torto Arado', 'Crooked Plow', 'Salvar el fuego']);
});

test('segunda página do Google com erro não marca a busca como falha', async () => {
  const { impl } = fakeFetch([
    [GOOGLE, (url) => (url.includes('startIndex') ? { ok: false, status: 400, json: async () => ({}) } : ok({ items: [googleItem] }))],
    [OL, () => ok({ docs: [] })],
  ]);
  const { results, failed } = await searchBooks('a meta', { fetchImpl: impl, googleKey: 'k' });
  assert.equal(failed, false);
  assert.equal(results.length, 1);
});
