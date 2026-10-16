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
