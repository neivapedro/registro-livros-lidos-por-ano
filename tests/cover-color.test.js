import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dominantColor, hexToRgb, tintFor } from '../app/js/cover-color.js';

const px = (...colors) => Uint8ClampedArray.from(colors.flatMap(([r, g, b, a = 255]) => [r, g, b, a]));

test('dominantColor: pega a cor marcante e ignora fundo branco, preto e transparente', () => {
  const blue = [40, 80, 160];
  const data = px(...Array(10).fill([250, 250, 250]), ...Array(10).fill([5, 5, 5]), ...Array(6).fill(blue), [200, 30, 30, 0]);
  assert.deepEqual(dominantColor(data), blue);
});

test('dominantColor: cor saturada vence cinza em quantidade parecida', () => {
  const data = px(...Array(8).fill([120, 120, 120]), ...Array(6).fill([200, 60, 40]));
  assert.deepEqual(dominantColor(data), [200, 60, 40]);
});

test('dominantColor: imagem só branca/preta não tem cor', () => {
  assert.equal(dominantColor(px([255, 255, 255], [0, 0, 0])), null);
});

test('tintFor: escurece e tira o exagero para fundo de cartão escuro', () => {
  const [r, g, b] = tintFor([255, 240, 0]).split(' ').map(Number);
  assert.ok(Math.max(r, g, b) <= 170, `muito claro: ${r} ${g} ${b}`);
  assert.ok(r > b, 'continua amarelado');
  assert.equal(tintFor([0, 0, 0]), '56 56 56');
});

test('hexToRgb', () => {
  assert.deepEqual(hexToRgb('#6B4A32'), [107, 74, 50]);
});
