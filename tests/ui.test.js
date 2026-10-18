import { test } from 'node:test';
import assert from 'node:assert/strict';
import { esc, progressBar, progressOf } from '../app/js/ui.js';

test('progresso de livro físico vem da página', () => {
  assert.deepEqual(progressOf({ format: 'fisico', pages: 400, currentPage: 100 }), { pct: 25, label: 'pág. 100 de 400' });
  assert.deepEqual(progressOf({ format: 'fisico', currentPage: 50 }), { pct: null, label: 'pág. 50' });
  assert.equal(progressOf({ format: 'fisico', pages: 400, currentPage: null }), null);
});

test('progresso no Kindle vem da porcentagem', () => {
  assert.deepEqual(progressOf({ format: 'kindle', currentPercent: 2, currentPage: 300, pages: 400 }), { pct: 2, label: 'no Kindle' });
  assert.equal(progressOf({ format: 'kindle', currentPercent: null, currentPage: 100, pages: 400 }), null);
  assert.match(progressBar({ format: 'kindle', currentPercent: 45 }), /45% · no Kindle/);
});

test('esc protege texto vindo de dados', () => {
  assert.equal(esc('<b>"A" & \'B\'</b>'), '&lt;b&gt;&quot;A&quot; &amp; &#39;B&#39;&lt;/b&gt;');
});

test('largeCoverUrl pede a versão grande da capa', async () => {
  const { largeCoverUrl } = await import('../app/js/ui.js');
  assert.equal(largeCoverUrl('https://covers.openlibrary.org/b/id/123-M.jpg'), 'https://covers.openlibrary.org/b/id/123-L.jpg');
  assert.equal(
    largeCoverUrl('https://covers.openlibrary.org/b/isbn/9788521315316-M.jpg?default=false'),
    'https://covers.openlibrary.org/b/isbn/9788521315316-L.jpg?default=false',
  );
  const g = new URL(largeCoverUrl('https://books.google.com/books/content?id=abc&printsec=frontcover&img=1&zoom=1&source=gbs_api'));
  assert.equal(g.searchParams.get('fife'), 'w800');
  assert.equal(g.searchParams.get('zoom'), null);
  assert.equal(g.searchParams.get('id'), 'abc');
  assert.equal(largeCoverUrl('data:image/jpeg;base64,AAAA'), 'data:image/jpeg;base64,AAAA');
  assert.equal(largeCoverUrl('https://exemplo.com/capa.jpg'), 'https://exemplo.com/capa.jpg');
  assert.equal(largeCoverUrl(null), null);
});

test('meia estrela na exibição e nota com vírgula', async () => {
  const { formatRating, ratingLabel, stars } = await import('../app/js/ui.js');
  assert.equal(formatRating(4.5), '4,5');
  assert.equal(formatRating(4), '4');
  assert.equal(ratingLabel(0.5), '0,5 estrela');
  assert.equal(ratingLabel(1.5), '1,5 estrela');
  assert.equal(ratingLabel(3.5), '3,5 estrelas');
  const html = stars(3.5);
  assert.match(html, /aria-label="Nota 3,5 de 5"/);
  assert.equal((html.match(/star-on/g) || []).length, 3);
  assert.equal((html.match(/class="icon star-half"/g) || []).length, 1);
  assert.equal((html.match(/star-off/g) || []).length, 1);
  assert.equal((stars(5).match(/star-on/g) || []).length, 5);
  assert.equal(stars(null), '');
});
