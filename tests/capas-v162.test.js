import { test } from 'node:test';
import assert from 'node:assert/strict';
import { COVER_DECOS, COVER_PALETTE, cover, coverStyle, icon, mixHash } from '../app/js/ui.js';
import { contrast } from '../app/js/spines.js';
import { hexToRgb } from '../app/js/cover-color.js';

test('ornamento da capa: determinístico, depende de título e autor, e títulos em sequência variam', () => {
  assert.equal(COVER_DECOS, 8);
  assert.deepEqual(coverStyle('Duna', 'Frank Herbert'), coverStyle('Duna', 'Frank Herbert'));
  assert.equal(mixHash('abc'), mixHash('abc'));
  const seq = new Set();
  for (let i = 3; i <= 8; i += 1) seq.add(coverStyle(`Leitura ${i}`).deco);
  assert.ok(seq.size >= 4, `"Leitura 3…8" cai em ${seq.size} ornamentos`);
  const counts = new Array(COVER_DECOS).fill(0);
  for (let i = 0; i < 4000; i += 1) counts[coverStyle(`Título ${i}`, `Autor ${i % 37}`).deco] += 1;
  for (const n of counts) assert.ok(n > (4000 / COVER_DECOS) * 0.7 && n < (4000 / COVER_DECOS) * 1.3, `distribuição ${counts}`);
  // O autor pode mudar o desenho; a cor de fundo (usada em tintas e lombadas) não muda.
  assert.equal(coverStyle('Duna', 'A').bg, coverStyle('Duna', 'B').bg);
  assert.equal(coverStyle('Duna').bg, coverStyle('Duna', 'Frank Herbert').bg);
});

test('contraste do texto da capa sobre o fundo, mesmo com o ornamento por trás (toda cor)', () => {
  // Pior caso: o ornamento mais cheio (faixa diagonal, ~10% de opacidade) sobre o fundo.
  const mix = (a, b, t) => a.map((v, i) => v * (1 - t) + b[i] * t);
  for (const [bg, fg, acc] of COVER_PALETTE) {
    for (const t of [0, 0.1]) {
      const under = mix(hexToRgb(bg), hexToRgb(acc), t);
      const c = contrast(under, hexToRgb(fg));
      assert.ok(c >= 4.5, `${fg} sobre ${bg}+${acc} a ${t}: ${c.toFixed(2)}`);
    }
  }
});

test('capa do Início: só as iniciais, sem título nem autor; ícone de fila existe', () => {
  const html = cover({ title: 'Duna (audiolivro)', authors: 'Frank Herbert' }, { size: 'md', showText: false });
  assert.match(html, /cover-ini[^>]*>DA</);
  assert.doesNotMatch(html, /cover-title|cover-author/);
  assert.match(icon('queue'), /<svg/);
});
