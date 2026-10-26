import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// Uma chave perdida (por exemplo, ao juntar trabalhos em paralelo) faz o navegador
// ignorar silenciosamente todo o CSS que vem depois dela.
test('app.css: chaves balanceadas e nenhum marcador de conflito', () => {
  const css = readFileSync(new URL('../app/css/app.css', import.meta.url), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
  let depth = 0;
  css.split('\n').forEach((line, i) => {
    for (const ch of line) {
      if (ch === '{') depth += 1;
      if (ch === '}') depth -= 1;
      assert.ok(depth >= 0, `"}" sobrando na linha ${i + 1}`);
    }
  });
  assert.equal(depth, 0, 'falta fechar "}"');
  assert.doesNotMatch(css, /^(<{7}|={7}|>{7})/m);
});
