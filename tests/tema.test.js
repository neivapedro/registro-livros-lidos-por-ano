import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { THEME_KEY, THEME_COLORS, readThemePref, resolveTheme, saveThemePref } from '../app/js/theme.js';

function memoryStorage(initial = {}) {
  const data = { ...initial };
  return {
    getItem: (k) => (k in data ? data[k] : null),
    setItem: (k, v) => { data[k] = String(v); },
    removeItem: (k) => { delete data[k]; },
    data,
  };
}

test('aparência: lê a escolha guardada; sem nada (ou valor estranho) é automático', () => {
  assert.equal(THEME_KEY, 'leituras:tema');
  assert.equal(readThemePref(memoryStorage()), 'auto');
  assert.equal(readThemePref(memoryStorage({ [THEME_KEY]: 'claro' })), 'claro');
  assert.equal(readThemePref(memoryStorage({ [THEME_KEY]: 'escuro' })), 'escuro');
  assert.equal(readThemePref(memoryStorage({ [THEME_KEY]: 'roxo' })), 'auto');
  assert.equal(readThemePref({ getItem() { throw new Error('bloqueado'); } }), 'auto');
});

test('aparência: guardar Claro/Escuro grava a chave; Automático apaga', () => {
  const s = memoryStorage();
  assert.equal(saveThemePref(s, 'claro'), true);
  assert.equal(s.data[THEME_KEY], 'claro');
  saveThemePref(s, 'auto');
  assert.equal(THEME_KEY in s.data, false);
  assert.equal(saveThemePref({ setItem() { throw new Error('cheio'); }, removeItem() {} }, 'escuro'), false);
});

test('aparência: tema efetivo segue o sistema só no automático', () => {
  assert.equal(resolveTheme('auto', true), 'light');
  assert.equal(resolveTheme('auto', false), 'dark');
  assert.equal(resolveTheme('claro', false), 'light');
  assert.equal(resolveTheme('escuro', true), 'dark');
});

test('index.html: o script antes do CSS resolve o tema igual a theme.js e acerta as metas', () => {
  const html = readFileSync(new URL('../app/index.html', import.meta.url), 'utf8');
  const script = html.match(/<script>([\s\S]*?)<\/script>/)[1];
  assert.ok(html.indexOf('<script>') < html.indexOf('css/app.css'), 'script antes da folha de estilo');
  for (const pref of [null, 'auto', 'claro', 'escuro', 'roxo']) {
    for (const light of [true, false]) {
      const attrs = {};
      const metas = [{ attrs: {} }, { attrs: {} }];
      const colorScheme = { attrs: {} };
      const set = (o) => (k, v) => { o[k] = v; };
      const document = {
        documentElement: { setAttribute: set(attrs) },
        querySelectorAll: () => metas.map((m) => ({ setAttribute: set(m.attrs) })),
        querySelector: () => ({ setAttribute: set(colorScheme.attrs) }),
      };
      const matchMedia = () => ({ matches: light });
      const localStorage = memoryStorage(pref ? { [THEME_KEY]: pref } : {});
      runInNewContext(script, { document, localStorage, matchMedia, window: { matchMedia } });
      const expected = resolveTheme(readThemePref(localStorage), light);
      assert.equal(attrs['data-theme'], expected, `${pref} / sistema ${light ? 'claro' : 'escuro'}`);
      assert.ok(metas.every((m) => m.attrs.content === THEME_COLORS[expected]));
      assert.equal(colorScheme.attrs.content, expected);
    }
  }
});

test('index.html: telas de abertura do iPhone existem e estão no service worker', () => {
  const html = readFileSync(new URL('../app/index.html', import.meta.url), 'utf8');
  const sw = readFileSync(new URL('../app/sw.js', import.meta.url), 'utf8');
  const splashes = [...html.matchAll(/rel="apple-touch-startup-image" href="([^"]+)"/g)].map((m) => m[1]);
  assert.ok(splashes.length >= 10);
  for (const s of splashes) assert.ok(sw.includes(`'./${s}'`), s);
  for (const scheme of ['light', 'dark']) assert.ok(html.includes(`prefers-color-scheme: ${scheme})">`));
});
