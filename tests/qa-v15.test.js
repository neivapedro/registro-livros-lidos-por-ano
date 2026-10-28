// QA da 1.5: o que as partes fazem juntas. Confete sem color-mix() (iOS 16.0/16.1), CSS com
// alternativas para quem não tem color-mix, nome com emoji de várias partes e o grão de papel
// também nos cabeçalhos presos. O resto (pixels, contraste, larguras) está em tests/e2e/qa-v15.mjs.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { confettiColors } from '../app/js/motion.js';
import { cleanName, NAME_MAX } from '../app/js/prefs.js';

const CSS = readFileSync(new URL('../app/css/app.css', import.meta.url), 'utf8');

/** Corpo do primeiro bloco que começa com `head` (chaves balanceadas). */
function block(head) {
  const start = CSS.indexOf(head);
  assert.ok(start >= 0, `sem o bloco ${head}`);
  let depth = 0;
  for (let i = CSS.indexOf('{', start); i < CSS.length; i += 1) {
    if (CSS[i] === '{') depth += 1;
    else if (CSS[i] === '}') {
      depth -= 1;
      if (!depth) return CSS.slice(start, i + 1);
    }
  }
  throw new Error(`bloco sem fim: ${head}`);
}

test('confete: cores em rgb() calculadas no JS, nunca color-mix (iOS 16.0/16.1 não tem)', () => {
  const colors = confettiColors('#D08C4F', '42 110 120');
  assert.deepEqual(colors, ['rgb(208 140 79)', 'rgb(80 136 144)', 'rgb(232 198 167)', 'rgb(159 190 194)']);
  for (const accent of ['#A9B26A', '#5FAFBA', '#DB8597', '#B4BAC2', '#97531E', ' #454B54 ', '#abc']) {
    const list = confettiColors(accent, '10 20 30');
    assert.equal(list.length, 4);
    for (const c of list) assert.match(c, /^rgb\(\d{1,3} \d{1,3} \d{1,3}\)$/);
  }
  // Destaque ilegível: a cor do texto; capa sem cor: só o destaque e o tom claro dele.
  assert.deepEqual(confettiColors('var(--x)', '1 2 3').slice(0, 1), ['currentColor']);
  assert.deepEqual(confettiColors('#000000', ''), ['rgb(0 0 0)', 'rgb(128 128 128)']);
  assert.deepEqual(confettiColors('#ffffff', 'a b c'), ['rgb(255 255 255)', 'rgb(255 255 255)']);
});

test('sem color-mix: tons derivados do destaque só valem com @supports; alternativas simples para o resto', () => {
  // Os tons do destaque (mapa de leitura, barras, cartões quentes) ficam dentro do @supports:
  // sem color-mix eles voltariam "unset" e o mapa de leitura sumiria.
  const guarded = block('@supports (color: color-mix(in srgb, red, red)) {\n  :is([data-accent="oliva"]');
  for (const token of ['--surface-warm', '--heat-1', '--heat-2', '--heat-3', '--bar-partial', '--medal-hi']) assert.match(guarded, new RegExp(`${token}:`));
  const outside = CSS.replace(guarded, '');
  assert.doesNotMatch(outside, /--heat-1: color-mix/, 'nenhum --heat-1 com color-mix fora do @supports');
  // Esqueletos da busca: cor simples.
  for (const m of CSS.matchAll(/--skel(?:-sheen)?: ([^;]+);/g)) assert.doesNotMatch(m[1], /color-mix/);
  // Alternativas: bolinhas das cores, capa desfocada (sem véu, fica escondida), botão tonal,
  // cartão claro, barra de baixo (vidro).
  const fallback = block('@supports not (color: color-mix(in srgb, red, red))');
  for (const sel of ['.accent-dot', '.ficha-backdrop', '.btn-tonal', '[data-theme="light"] .card.reading', '--glass-bg', '--bar-bg']) {
    assert.ok(fallback.includes(sel), `sem alternativa para ${sel}`);
  }
  assert.doesNotMatch(fallback.slice(fallback.indexOf('{')), /color-mix\(/, 'a alternativa não pode usar color-mix');
  assert.match(fallback, /\.ficha-backdrop \{ display: none; \}/);
});

test('grão de papel também nos cabeçalhos presos e na barra compacta (sem faixa lisa no claro)', () => {
  const rule = CSS.match(/([^{}]*)::before \{\s*content: ''; position: absolute; inset: 0; z-index: -1; pointer-events: none;\s*background-image: var\(--grain\)/);
  assert.ok(rule, 'regra do grão nos cabeçalhos');
  for (const sel of ['.group-head::before', '.rs-tabs::before', '.cbar::before']) assert.ok(rule[0].includes(sel), sel);
  // A ficha não termina numa faixa opaca da cor do fundo: o pé se dissolve no grão.
  const hero = block('.ficha-hero {\n  margin:');
  assert.doesNotMatch(hero, /var\(--bg\)\)/);
  assert.match(CSS, /\.ficha-backdrop \{\n {2}-webkit-mask-image: linear-gradient\(to bottom, #000 64%, transparent\);/);
});

test('nome: emoji de várias partes (ZWJ) fica inteiro; invisíveis continuam fora', () => {
  assert.equal(cleanName('Ana 👩‍💻'), 'Ana 👩‍💻');
  assert.equal(cleanName('👨‍👩‍👧 Família'), '👨‍👩‍👧 Família');
  assert.equal(cleanName('Ka​roline‎‮'), 'Karoline');
  // Cortado no limite, não termina com um juntor solto.
  const name = `${'x'.repeat(NAME_MAX - 2)}👩‍💻`;
  const cut = cleanName(name);
  assert.equal([...cut].length, NAME_MAX - 1);
  assert.doesNotMatch(cut, /‍$/);
});
