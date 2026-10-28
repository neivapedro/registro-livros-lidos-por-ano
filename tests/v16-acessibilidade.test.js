// 1.6: tamanho do texto (fator do iPhone, escolha em Ajustes, script do index.html), conversão
// dos font-size (tools/escala-texto.mjs), contraste aumentado e telas largas (manifesto, CSS).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import {
  BASE_PX, MAX_SCALE, MIN_SCALE, NAV_MAX, TEXT_KEY, TEXT_OPTIONS, TEXT_PREFS, TEXT_PRESETS, UI_MAX,
  applyScale, readTextPref, resolveScale, saveTextPref, scaleFromSize, scaleVars, sizeBucket,
} from '../app/js/text-scale.js';
import { textSizePicker } from '../app/js/views/settings.js';
import { FIXOS, convertCss, scaleValue } from '../tools/escala-texto.mjs';

const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');

function memoryStorage(initial = {}) {
  const data = { ...initial };
  return {
    getItem: (k) => (k in data ? data[k] : null),
    setItem: (k, v) => { data[k] = String(v); },
    removeItem: (k) => { delete data[k]; },
    data,
  };
}

// ---------- Fator do texto ----------

test('tamanho do texto: fator = fonte do sistema ÷ 17, entre 0,85 e 1,6', () => {
  assert.equal(BASE_PX, 17);
  assert.equal(scaleFromSize(17), 1);
  assert.equal(scaleFromSize(19), 1.12);
  assert.equal(scaleFromSize(22.1), 1.3);
  assert.equal(scaleFromSize(23), 1.35);
  assert.equal(scaleFromSize(14), MIN_SCALE, 'xSmall do iOS (14 px) fica no mínimo');
  assert.equal(scaleFromSize(53), MAX_SCALE, 'AX5 (53 px) fica no máximo');
  assert.equal(scaleFromSize(28), 1.6);
  for (const bad of [null, undefined, 0, -3, NaN, 'abc', Infinity]) assert.equal(scaleFromSize(bad), 1, String(bad));
  assert.equal(scaleFromSize('20'), 1.18);
});

test('tamanho do texto: Sistema segue o iPhone; Menor/Padrão/Maior são fixos', () => {
  assert.deepEqual(TEXT_PREFS, ['sistema', 'menor', 'padrao', 'maior']);
  assert.deepEqual(TEXT_OPTIONS.map(([, l]) => l), ['Sistema', 'Menor', 'Padrão', 'Maior']);
  assert.equal(resolveScale('sistema', 22.1), 1.3);
  assert.equal(resolveScale('sistema', null), 1, 'navegador sem -apple-system-body');
  assert.equal(resolveScale('menor', 30), TEXT_PRESETS.menor);
  assert.equal(resolveScale('padrao', 30), 1);
  assert.equal(resolveScale('maior', 14), TEXT_PRESETS.maior);
  for (const v of Object.values(TEXT_PRESETS)) assert.ok(v >= MIN_SCALE && v <= MAX_SCALE);
  assert.equal(resolveScale('__proto__', 17), 1);
});

test('tamanho do texto: escolha só no aparelho; Sistema apaga a chave; falha devolve false', () => {
  assert.equal(TEXT_KEY, 'leituras:texto');
  assert.equal(readTextPref(memoryStorage()), 'sistema');
  assert.equal(readTextPref(memoryStorage({ [TEXT_KEY]: 'maior' })), 'maior');
  assert.equal(readTextPref(memoryStorage({ [TEXT_KEY]: 'gigante' })), 'sistema');
  assert.equal(readTextPref({ getItem() { throw new Error('bloqueado'); } }), 'sistema');
  assert.equal(readTextPref(undefined), 'sistema');
  const s = memoryStorage();
  assert.equal(saveTextPref(s, 'menor'), true);
  assert.equal(s.data[TEXT_KEY], 'menor');
  saveTextPref(s, 'sistema');
  assert.equal(TEXT_KEY in s.data, false);
  saveTextPref(s, 'maior');
  saveTextPref(s, 'xx');
  assert.equal(TEXT_KEY in s.data, false);
  assert.equal(saveTextPref({ setItem() { throw new Error('cheio'); }, removeItem() {} }, 'maior'), false);
});

test('tamanho do texto: faixas e tetos (barra de baixo 1,2; seletores 1,3)', () => {
  assert.equal(sizeBucket(0.85), 'pequeno');
  assert.equal(sizeBucket(0.9), 'pequeno');
  assert.equal(sizeBucket(1), 'padrao');
  assert.equal(sizeBucket(1.12), 'padrao');
  assert.equal(sizeBucket(1.18), 'grande');
  assert.equal(sizeBucket(1.3), 'grande');
  assert.equal(sizeBucket(1.45), 'enorme');
  assert.equal(sizeBucket(1.6), 'enorme');
  assert.equal(NAV_MAX, 1.2);
  assert.equal(UI_MAX, 1.3);
  assert.deepEqual(scaleVars(1.6), { '--type-scale': '1.6', '--type-scale-nav': '1.2', '--type-scale-ui': '1.3' });
  assert.deepEqual(scaleVars(0.9), { '--type-scale': '0.9', '--type-scale-nav': '0.9', '--type-scale-ui': '0.9' });
  const props = {};
  const doc = { documentElement: { dataset: {}, style: { getPropertyValue: (k) => props[k] ?? '', setProperty: (k, v) => { props[k] = v; } } } };
  applyScale(doc, 1.35);
  assert.deepEqual(props, { '--type-scale': '1.35', '--type-scale-nav': '1.2', '--type-scale-ui': '1.3' });
  assert.equal(doc.documentElement.dataset.textSize, 'grande');
});

test('index.html: o script antes do CSS calcula o mesmo fator que text-scale.js', () => {
  const html = read('../app/index.html');
  const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1]);
  const script = scripts.find((s) => s.includes("'leituras:texto'"));
  assert.ok(script, 'script do tamanho do texto');
  assert.ok(html.indexOf("'leituras:texto'") < html.indexOf('css/app.css'), 'antes da folha de estilo');
  for (const pref of [null, 'sistema', 'menor', 'padrao', 'maior', 'gigante', 'hasOwnProperty']) {
    for (const systemPx of [null, 14, 17, 19, 22.1, 28, 53]) {
      const props = {};
      const attrs = {};
      const root = {
        style: { setProperty: (k, v) => { props[k] = v; } },
        setAttribute: (k, v) => { attrs[k] = v; },
        appendChild() {},
        removeChild() {},
      };
      const probe = { style: {} };
      const document = { documentElement: root, createElement: () => probe };
      // Sem -apple-system-body o navegador ignora a declaração e fica o tamanho do teste (1234px).
      const getComputedStyle = () => ({ fontSize: `${systemPx ?? 1234}px` });
      const localStorage = memoryStorage(pref ? { [TEXT_KEY]: pref } : {});
      runInNewContext(script, { document, localStorage, getComputedStyle, Math, String, parseFloat });
      const expected = resolveScale(readTextPref(localStorage), systemPx);
      assert.deepEqual(props, scaleVars(expected), `${pref} ${systemPx}`);
      assert.equal(attrs['data-text-size'], sizeBucket(expected), `${pref} ${systemPx}`);
    }
  }
  // Sem armazenamento: segue o sistema.
  const props = {};
  runInNewContext(script, {
    document: { documentElement: { style: { setProperty: (k, v) => { props[k] = v; } }, setAttribute() {}, appendChild() {}, removeChild() {} }, createElement: () => ({ style: {} }) },
    localStorage: { getItem() { throw new Error('bloqueado'); } },
    getComputedStyle: () => ({ fontSize: '19px' }), Math, String, parseFloat,
  });
  assert.equal(props['--type-scale'], '1.12');
});

test('Ajustes → Aparência: Tamanho do texto com quatro opções e a escolhida marcada', () => {
  const html = textSizePicker('maior');
  assert.equal((html.match(/data-action="set-text-size"/g) || []).length, 4);
  assert.match(html, /data-value="maior" aria-pressed="true"/);
  assert.match(html, /data-value="sistema" aria-pressed="false"/);
  assert.match(html, /--seg-count:4/);
  assert.match(textSizePicker('xx'), /data-value="sistema" aria-pressed="true"/);
  assert.match(html, />Tamanho do texto</);
});

// ---------- Conversão dos font-size ----------

const SAMPLE = `/* font-size: 12px no comentário fica */
body { margin: 0; font-size: 15px; line-height: 1.4; }
h1 { font-size: 40px }
.a, .b { color: red; font-size: 12.5px !important; }
.cover-title { font-size: 13px; }
.card .cover-author, .x { font-size: 9px; }
.nav a { font-size: 10.5px; }
.t { font-size: clamp(30px, 9vw, 40px); }
.s { font-size: clamp(17px, 5.4vw, 21px); }
.v { font-size: var(--sp-fs, 12px); }
.e { font-size: max(16px, 1em); font-size: 1.2em; font-size: 42cqw; font-size: inherit; }
.k { font-size: 14px; } /* sem-escala */
@media (max-width: 359px) {
  .m { padding: 2px; font-size: 11px; }
}
.retro-huge { font-size: 64px; }
.sc-svg text { font-size: 11px; }
.ok-input { font-size:16px; }
`;

test('escala-texto: converte px de texto, deixa capas, gráficos e valores relativos', () => {
  const { css, changed } = convertCss(SAMPLE);
  assert.equal(changed, 8);
  assert.match(css, /body \{ margin: 0; font-size: calc\(15px \* var\(--type-scale, 1\)\); line-height: 1\.4; \}/);
  assert.match(css, /h1 \{ font-size: calc\(40px \* var\(--type-scale-lg, 1\)\) \}/);
  assert.match(css, /font-size: calc\(12\.5px \* var\(--type-scale, 1\)\) !important;/);
  assert.match(css, /\.cover-title \{ font-size: 13px; \}/);
  assert.match(css, /\.card \.cover-author, \.x \{ font-size: 9px; \}/);
  assert.match(css, /\.nav a \{ font-size: calc\(10\.5px \* var\(--type-scale-nav, 1\)\); \}/);
  assert.match(css, /\.t \{ font-size: calc\(clamp\(30px, 9vw, 40px\) \* var\(--type-scale-lg, 1\)\); \}/);
  assert.match(css, /\.s \{ font-size: calc\(clamp\(17px, 5\.4vw, 21px\) \* var\(--type-scale, 1\)\); \}/);
  assert.match(css, /var\(--sp-fs, 12px\)/);
  assert.match(css, /font-size: max\(16px, 1em\); font-size: 1\.2em; font-size: 42cqw; font-size: inherit;/);
  assert.match(css, /\.k \{ font-size: 14px; \} \/\* sem-escala \*\//);
  assert.match(css, /\.m \{ padding: 2px; font-size: calc\(11px \* var\(--type-scale, 1\)\); \}/);
  assert.match(css, /\.retro-huge \{ font-size: 64px; \}/);
  assert.match(css, /\.sc-svg text \{ font-size: 11px; \}/);
  assert.match(css, /\.ok-input \{ font-size:calc\(16px \* var\(--type-scale, 1\)\); \}/);
  assert.match(css, /^\/\* font-size: 12px no comentário fica \*\//);
});

test('escala-texto: idempotente (rodar de novo não muda nada) e o app.css já está convertido', () => {
  const once = convertCss(SAMPLE).css;
  const twice = convertCss(once);
  assert.equal(twice.changed, 0);
  assert.equal(twice.css, once);
  const app = read('../app/css/app.css');
  const again = convertCss(app);
  assert.equal(again.changed, 0, 'node tools/escala-texto.mjs: falta converter font-size em px');
  assert.equal(again.css, app);
  assert.equal(scaleValue('calc(13px * var(--type-scale, 1))', '.a'), null);
  assert.ok(FIXOS.some((re) => re.test('.cover-title')));
  // Nada de font-size em px de texto comum sobrou (fora dos seletores fixos).
  assert.ok(app.includes('font-size: calc(15px * var(--type-scale, 1))'), 'body escalado');
});

// ---------- Contraste aumentado e telas largas ----------

test('CSS 1.6: bloco no fim com contraste aumentado, transparência reduzida e telas largas', () => {
  const css = read('../app/css/app.css');
  const start = css.indexOf('/* ===== 1.6 Texto, contraste e telas largas ===== */');
  assert.ok(start > 0, 'bloco 1.6');
  const block = css.slice(start);
  assert.match(block, /@media \(prefers-contrast: more\) \{/);
  assert.match(block, /prefers-reduced-transparency: reduce/);
  assert.match(block, /@media \(min-width: 768px\) \{/);
  assert.match(block, /@media \(orientation: landscape\) and \(max-height: 520px\) \{/);
  assert.match(block, /--type-scale-lg: calc\(1 \+ \(var\(--type-scale, 1\) - 1\) \* 0\.5\)/);
  // Cada destaque tem versão forte nos dois temas.
  for (const id of ['terracota', 'oliva', 'petroleo', 'vinho', 'grafite']) {
    assert.equal((block.match(new RegExp(`--acc-${id}: #[0-9A-F]{6}; --acc-${id}-hover: #[0-9A-F]{6};`, 'g')) || []).length, 2, id);
  }
  // Sem aninhamento de CSS (o iOS 16.0–16.4 não entende).
  assert.doesNotMatch(block.replace(/\/\*[\s\S]*?\*\//g, ''), /&/);
});

test('manifesto e service worker: qualquer orientação; text-scale.js no pacote offline', () => {
  const manifest = JSON.parse(read('../app/manifest.webmanifest'));
  assert.equal(manifest.orientation, 'any');
  const sw = read('../app/sw.js');
  assert.match(sw, /'\.\/js\/text-scale\.js'/);
  assert.doesNotMatch(read('../app/js/main.js'), /screen\.orientation\.lock/);
});
