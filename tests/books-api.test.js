import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mergeResults, normalizeGoogleVolume, normalizeOpenLibraryDoc, searchBooks } from '../app/js/books-api.js';

const googleItem = {
  id: 'abc123',
  volumeInfo: {
    title: 'A Meta',
    subtitle: 'Um processo de melhoria contínua',
    authors: ['Eliyahu M. Goldratt', 'Jeff Cox'],
    pageCount: 384,
    publishedDate: '2014-05-01',
    industryIdentifiers: [{ type: 'ISBN_10', identifier: '8521315316' }, { type: 'ISBN_13', identifier: '9788521315316' }],
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

test('normalizeGoogleVolume', () => {
  assert.deepEqual(normalizeGoogleVolume(googleItem), {
    source: 'Google Books',
    sourceId: 'google:abc123',
    title: 'A Meta: Um processo de melhoria contínua',
    authors: 'Eliyahu M. Goldratt, Jeff Cox',
    pages: 384,
    cover: 'https://books.google.com/books/content?id=abc123&printsec=frontcover&img=1&zoom=1&source=gbs_api',
    isbn: '9788521315316',
    year: 2014,
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
      language: ['por'], isbn: ['8521315316', '9788521315316'], cover_i: 999,
    }] },
  };
  const r = normalizeOpenLibraryDoc(doc);
  assert.equal(r.title, 'A Meta: Um processo de melhoria contínua');
  assert.equal(r.isbn, '9788521315316');
  assert.equal(r.cover, 'https://covers.openlibrary.org/b/id/999-M.jpg');
  assert.equal(r.sourceId, 'openlibrary:/books/OL9M');
  assert.equal(r.pages, 337);
  assert.equal(r.authors, 'Eliyahu M. Goldratt');
});

test('normalizeOpenLibraryDoc ignora edição em outro idioma', () => {
  const doc = { ...olDoc, editions: { docs: [{ key: '/books/X', title: 'Le But', language: ['fre'] }] } };
  assert.equal(normalizeOpenLibraryDoc(doc).title, 'The Goal');
});

test('mergeResults intercala as fontes e tira repetidos', () => {
  const g = [{ title: 'A', authors: 'X', isbn: '1' }, { title: 'B', authors: 'Y', isbn: '' }];
  const o = [{ title: 'Á', authors: 'x', isbn: '1' }, { title: 'C', authors: 'Z', isbn: '' }, { title: 'b', authors: 'y', isbn: '' }];
  assert.deepEqual(mergeResults(g, o).map((r) => r.title), ['A', 'B', 'C']);
});

function fakeFetch(routes) {
  const calls = [];
  const impl = async (url) => {
    calls.push(url);
    for (const [prefix, handler] of routes) {
      if (url.startsWith(prefix)) return handler(url);
    }
    throw new Error('sem rota');
  };
  return { impl, calls };
}

const ok = (body) => ({ ok: true, status: 200, json: async () => body });

test('searchBooks consulta as duas fontes pedindo português e junta', async () => {
  const { impl, calls } = fakeFetch([
    ['https://www.googleapis.com/', () => ok({ items: [googleItem] })],
    ['https://openlibrary.org/', () => ok({ docs: [olDoc] })],
  ]);
  const { results, failed } = await searchBooks('a meta goldratt', { fetchImpl: impl });
  assert.equal(failed, false);
  assert.equal(results.length, 2);
  assert.equal(results[0].source, 'Google Books');
  assert.equal(calls.length, 2);
  assert.match(calls[0], /q=a%20meta%20goldratt&/);
  assert.match(calls[0], /langRestrict=pt/);
  assert.match(calls[1], /q=a%20meta%20goldratt%20language%3Apor&lang=pt/);
  assert.match(calls[1], /editions\.title/);
});

test('searchBooks refaz sem filtro de idioma quando não acha nada em português', async () => {
  const { impl, calls } = fakeFetch([
    ['https://www.googleapis.com/', (url) => ok(url.includes('langRestrict') ? {} : { items: [googleItem] })],
    ['https://openlibrary.org/', (url) => ok(url.includes('language%3Apor') ? { docs: [] } : { docs: [olDoc] })],
  ]);
  const { results } = await searchBooks('obscure book', { fetchImpl: impl });
  assert.equal(calls.length, 4);
  assert.doesNotMatch(calls[2], /langRestrict/);
  assert.doesNotMatch(calls[3], /language%3Apor/);
  assert.equal(results.length, 2);
});

test('searchBooks segue funcionando se o Google recusar (cota excedida)', async () => {
  const { impl } = fakeFetch([
    ['https://www.googleapis.com/', () => ({ ok: false, status: 429, json: async () => ({}) })],
    ['https://openlibrary.org/', () => ok({ docs: [olDoc] })],
  ]);
  const { results, failed } = await searchBooks('the goal', { fetchImpl: impl });
  assert.equal(failed, false);
  assert.deepEqual(results.map((r) => r.source), ['Open Library']);
});

test('searchBooks avisa quando as duas fontes falham', async () => {
  const { impl } = fakeFetch([]);
  const { results, failed } = await searchBooks('qualquer', { fetchImpl: impl });
  assert.equal(failed, true);
  assert.deepEqual(results, []);
});

test('searchBooks reconhece ISBN', async () => {
  const { impl, calls } = fakeFetch([
    ['https://www.googleapis.com/', () => ok({})],
    ['https://openlibrary.org/', () => ok({})],
  ]);
  await searchBooks('978-85-213-1531-6', { fetchImpl: impl });
  assert.equal(calls.length, 2);
  assert.match(calls[0], /q=isbn%3A9788521315316/);
  assert.doesNotMatch(calls[0], /langRestrict/);
  assert.match(calls[1], /isbn=9788521315316/);
});

test('searchBooks ignora termos muito curtos', async () => {
  const { impl, calls } = fakeFetch([]);
  assert.deepEqual(await searchBooks(' a ', { fetchImpl: impl }), { results: [], failed: false });
  assert.equal(calls.length, 0);
});
