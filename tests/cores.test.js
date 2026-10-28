// 1.5: cor de destaque (validação, script do index.html, contraste AA de cada opção nos dois
// temas), lógica da marca que desliza nas abas e telas vazias ilustradas.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import {
  ACCENT_IDS, ACCENT_KEY, ACCENTS, DEFAULT_ACCENT, SHARE_ACCENTS, applyAccent, readAccent, saveAccent, shareAccent, validAccent,
} from '../app/js/accent.js';
import { controlKey, indicatorBox, sameBox } from '../app/js/tab-slide.js';
import { EMPTY_ARTS, emptyArt, emptyScene } from '../app/js/empty-art.js';
import { accentPicker } from '../app/js/views/settings.js';

function memoryStorage(initial = {}) {
  const data = { ...initial };
  return {
    getItem: (k) => (k in data ? data[k] : null),
    setItem: (k, v) => { data[k] = String(v); },
    removeItem: (k) => { delete data[k]; },
    data,
  };
}

// ---------- Cor de destaque ----------

test('destaque: cinco opções, Terracota por padrão; valor estranho (ou sem armazenamento) vira o padrão', () => {
  assert.equal(ACCENT_KEY, 'leituras:acento');
  assert.deepEqual(ACCENT_IDS, ['terracota', 'oliva', 'petroleo', 'vinho', 'grafite']);
  assert.deepEqual(ACCENTS.map((a) => a.label), ['Terracota', 'Oliva', 'Petróleo', 'Vinho', 'Grafite']);
  assert.equal(DEFAULT_ACCENT, 'terracota');
  for (const id of ACCENT_IDS) assert.equal(validAccent(id), id);
  for (const bad of [null, undefined, '', 'roxo', 'Oliva', 'oliva ', '__proto__', 'constructor', 42]) assert.equal(validAccent(bad), 'terracota');
  assert.equal(readAccent(memoryStorage()), 'terracota');
  assert.equal(readAccent(memoryStorage({ [ACCENT_KEY]: 'vinho' })), 'vinho');
  assert.equal(readAccent(memoryStorage({ [ACCENT_KEY]: 'x" onload="' })), 'terracota');
  assert.equal(readAccent({ getItem() { throw new Error('bloqueado'); } }), 'terracota');
  assert.equal(readAccent(undefined), 'terracota');
});

test('destaque: guardar grava a chave; o padrão (ou valor inválido) apaga; falha ao gravar devolve false', () => {
  const s = memoryStorage();
  assert.equal(saveAccent(s, 'petroleo'), true);
  assert.equal(s.data[ACCENT_KEY], 'petroleo');
  saveAccent(s, 'terracota');
  assert.equal(ACCENT_KEY in s.data, false);
  saveAccent(s, 'grafite');
  saveAccent(s, 'roxo');
  assert.equal(ACCENT_KEY in s.data, false);
  assert.equal(saveAccent({ setItem() { throw new Error('cheio'); }, removeItem() {} }, 'oliva'), false);
});

test('destaque: aplicar põe data-accent válido no <html>; imagens usam a versão escura', () => {
  const doc = { documentElement: { dataset: {} } };
  applyAccent(doc, 'oliva');
  assert.equal(doc.documentElement.dataset.accent, 'oliva');
  applyAccent(doc, '<b>');
  assert.equal(doc.documentElement.dataset.accent, 'terracota');
  doc.documentElement.dataset.accent = 'vinho';
  assert.equal(shareAccent(doc), SHARE_ACCENTS.vinho);
  doc.documentElement.dataset.accent = 'qualquer';
  assert.equal(shareAccent(doc), SHARE_ACCENTS.terracota);
  assert.equal(shareAccent(undefined), SHARE_ACCENTS.terracota);
});

test('index.html: o script antes do CSS aplica a mesma cor que accent.js (só valores conhecidos)', () => {
  const html = readFileSync(new URL('../app/index.html', import.meta.url), 'utf8');
  const script = html.match(/<script>([\s\S]*?)<\/script>/)[1];
  assert.ok(html.indexOf("localStorage.getItem('leituras:acento')") < html.indexOf('css/app.css'), 'antes da folha de estilo');
  for (const value of [null, ...ACCENT_IDS, 'roxo', '', 'terracota"><script>']) {
    const attrs = {};
    const set = (o) => (k, v) => { o[k] = v; };
    const document = {
      documentElement: { setAttribute: set(attrs) },
      querySelectorAll: () => [],
      querySelector: () => ({ setAttribute() {} }),
    };
    const matchMedia = () => ({ matches: false });
    const localStorage = memoryStorage(value === null ? {} : { [ACCENT_KEY]: value });
    runInNewContext(script, { document, localStorage, matchMedia, window: { matchMedia } });
    assert.equal(attrs['data-accent'], readAccent(localStorage), String(value));
  }
  // Armazenamento bloqueado: continua abrindo, com o padrão.
  const attrs = {};
  runInNewContext(script, {
    document: { documentElement: { setAttribute: (k, v) => { attrs[k] = v; } }, querySelectorAll: () => [], querySelector: () => ({ setAttribute() {} }) },
    localStorage: { getItem() { throw new Error('bloqueado'); } },
    matchMedia: () => ({ matches: true }),
    window: { matchMedia: () => ({ matches: true }) },
  });
  assert.equal(attrs['data-accent'], 'terracota');
  assert.equal(attrs['data-theme'], 'light');
});

// ---------- Contraste (WCAG) de cada destaque, lido do próprio CSS ----------

const css = readFileSync(new URL('../app/css/app.css', import.meta.url), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
/** Declarações do primeiro bloco com exatamente este seletor. */
function tokens(selector, from = 0) {
  const start = css.indexOf(`${selector} {`, from);
  assert.ok(start >= 0, `bloco ${selector}`);
  const body = css.slice(css.indexOf('{', start) + 1, css.indexOf('}', start));
  return Object.fromEntries([...body.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)].map((m) => [m[1], m[2].trim()]));
}
const hexRgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
function luminance(hex) {
  const [r, g, b] = hexRgb(hex).map((v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
export function contrast(a, b) {
  const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
}

const dark = tokens(':root, [data-theme="dark"]');
const light = tokens('[data-theme="light"]', css.indexOf('[data-theme="light"] {'));
const accentsDark = tokens(':root:not([data-theme="light"]), [data-theme="dark"]');
const accentsLight = tokens('[data-theme="light"]', css.indexOf(':root:not([data-theme="light"]), [data-theme="dark"]'));

test('contraste: calculadora confere com valores conhecidos', () => {
  assert.equal(contrast('#000000', '#FFFFFF').toFixed(2), '21.00');
  assert.equal(contrast('#777777', '#FFFFFF').toFixed(2), '4.48');
  assert.equal(contrast('#FFFFFF', '#FFFFFF'), 1);
});

test('cada destaque, no claro e no escuro: texto sobre ele (--on-accent) e ele como texto passam de 4,5:1', () => {
  const themes = [['escuro', dark, accentsDark], ['claro', light, accentsLight]];
  for (const [name, theme, palette] of themes) {
    for (const id of ACCENT_IDS) {
      const accent = palette[`--acc-${id}`];
      const hover = palette[`--acc-${id}-hover`];
      assert.match(accent, /^#[0-9A-F]{6}$/i, `${name}/${id}`);
      assert.match(hover, /^#[0-9A-F]{6}$/i, `${name}/${id} hover`);
      const on = theme['--on-accent'];
      // Botões cheios (Registrar leitura, +, aba marcada): texto --on-accent sobre o destaque.
      assert.ok(contrast(on, accent) >= 4.5, `${name}/${id}: ${on} sobre ${accent} = ${contrast(on, accent).toFixed(2)}`);
      assert.ok(contrast(on, hover) >= 4.5, `${name}/${id}: ${on} sobre ${hover} (tocado)`);
      // Destaque como texto (links, números, abas) sobre o fundo, o cartão e o cinza dos chips.
      for (const bg of ['--bg', '--surface', '--surface-2']) {
        assert.ok(contrast(accent, theme[bg]) >= 4.5, `${name}/${id}: ${accent} sobre ${bg} ${theme[bg]} = ${contrast(accent, theme[bg]).toFixed(2)}`);
      }
    }
  }
});

test('Terracota continua sendo o caramelo de sempre; imagens usam o destaque escuro do CSS', () => {
  assert.equal(accentsDark['--acc-terracota'], dark['--accent']);
  assert.equal(accentsDark['--acc-terracota-hover'], dark['--accent-hover']);
  assert.equal(accentsLight['--acc-terracota'], light['--accent']);
  assert.equal(accentsLight['--acc-terracota-hover'], light['--accent-hover']);
  for (const id of ACCENT_IDS) assert.equal(SHARE_ACCENTS[id].toUpperCase(), accentsDark[`--acc-${id}`].toUpperCase(), id);
  // Cada opção (menos a padrão) troca o destaque, inclusive dentro de trechos com tema próprio.
  for (const id of ACCENT_IDS.filter((a) => a !== 'terracota')) {
    assert.ok(css.includes(`[data-accent="${id}"], [data-accent="${id}"] [data-theme] { --accent: var(--acc-${id}); --accent-hover: var(--acc-${id}-hover); }`), id);
  }
  // Nenhuma cor literal do caramelo fora dos blocos de tokens (imagens de compartilhar usam accent.js).
  for (const file of ['share-image.js', 'quote-image.js', 'charts.js', 'views/home.js', 'views/charts.js']) {
    const js = readFileSync(new URL(`../app/js/${file}`, import.meta.url), 'utf8');
    assert.doesNotMatch(js, /#D08C4F|#97531E/i, file);
  }
});

// ---------- Marca que desliza ----------

test('abas: a chave do controle ignora a classe da marca e distingue controles iguais pela ordem', () => {
  assert.equal(controlKey('segmented tabs-4 shelf-tabs has-ind', 'Listas', 0), controlKey('shelf-tabs segmented tabs-4', 'Listas', 0));
  assert.notEqual(controlKey('segmented', 'Status', 0), controlKey('segmented', 'Formato', 0));
  assert.notEqual(controlKey('segmented seg-mini', 'Mostrar', 0), controlKey('segmented seg-mini', 'Mostrar', 1));
  assert.equal(controlKey('rs-tabs', null, 0), 'rs-tabs|#0');
});

test('abas: a caixa da marca é a do botão marcado, relativa ao controle e sem a borda dele', () => {
  const ctrl = { left: 18, top: 200, width: 354, height: 60 };
  // Qualquer número de opções: 2, 3, 4, 5 botões de larguras iguais ou diferentes.
  for (const n of [2, 3, 4, 5]) {
    const w = (354 - 8) / n;
    for (let i = 0; i < n; i += 1) {
      const btn = { left: 18 + 1 + 3 + i * w, top: 204, width: w, height: 52 };
      assert.deepEqual(indicatorBox(ctrl, btn, 1, 1), { x: Math.round((3 + i * w) * 100) / 100, y: 3, w: Math.round(w * 100) / 100, h: 52 });
    }
  }
  const uneven = indicatorBox({ left: 0, top: 0 }, { left: 87.333, top: 3, width: 101.4567, height: 40 });
  assert.deepEqual(uneven, { x: 87.33, y: 3, w: 101.46, h: 40 });
});

test('abas: posições quase iguais (menos de meio pixel) não animam', () => {
  const a = { x: 10, y: 3, w: 80, h: 44 };
  assert.equal(sameBox(a, { x: 10.3, y: 3, w: 80.2, h: 44 }), true);
  assert.equal(sameBox(a, { x: 96, y: 3, w: 80, h: 44 }), false);
  assert.equal(sameBox(a, { x: 10, y: 3, w: 120, h: 44 }), false);
  assert.equal(sameBox(a, undefined), false);
  assert.equal(sameBox(null, a), false);
});

// ---------- Telas vazias e Ajustes ----------

test('telas vazias: cada desenho é um SVG decorativo de traço, com o texto escapado', () => {
  assert.ok(EMPTY_ARTS.length >= 8);
  for (const name of EMPTY_ARTS) {
    const svg = emptyArt(name);
    assert.match(svg, /^<svg class="empty-art" viewBox="0 0 160 120"[^>]*aria-hidden="true"/, name);
    assert.match(svg, /stroke="currentColor"/);
    assert.doesNotMatch(svg, /#[0-9a-f]{3,6}\b/i, `${name}: cores só pelo CSS`);
    assert.equal((svg.match(/<svg/g) || []).length, 1);
    assert.ok(svg.endsWith('</svg>'));
  }
  assert.equal(emptyArt('nao-existe'), '');
  const html = emptyScene('trechos', 'Nada <b>aqui</b>', 'Dica & "aspas"', '<a class="btn-outline" href="#/novo">Adicionar</a>');
  assert.match(html, /^<div class="empty has-art" data-empty="trechos"><svg/);
  assert.match(html, /<p class="empty-title">Nada &lt;b&gt;aqui&lt;\/b&gt;<\/p>/);
  assert.match(html, /Dica &amp; &quot;aspas&quot;/);
  assert.ok(html.includes('<a class="btn-outline" href="#/novo">Adicionar</a>'));
});

test('Ajustes: cinco bolinhas, só a escolhida marcada (aria-pressed) e com o nome visível', () => {
  const html = accentPicker('vinho');
  const buttons = [...html.matchAll(/<button[^>]*data-value="(\w+)" aria-pressed="(true|false)"/g)].map((m) => [m[1], m[2]]);
  assert.deepEqual(buttons, [['terracota', 'false'], ['oliva', 'false'], ['petroleo', 'false'], ['vinho', 'true'], ['grafite', 'false']]);
  assert.equal((html.match(/class="accent-sw is-on"/g) || []).length, 1);
  assert.match(html, /role="group" aria-labelledby="accent-head"/);
  assert.match(html, /<span class="accent-name">Petróleo<\/span>/);
  assert.match(accentPicker('roxo'), /class="accent-sw is-on" data-action="set-accent" data-value="terracota"/);
});
