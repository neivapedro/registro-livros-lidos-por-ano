import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, relative } from 'node:path';

const APP = new URL('../app/', import.meta.url).pathname;

function listFiles(dir) {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    return statSync(full).isDirectory() ? listFiles(full) : [full];
  });
}

const sw = readFileSync(join(APP, 'sw.js'), 'utf8');
const shell = [...sw.matchAll(/'\.\/([^']*)'/g)].map((m) => m[1]).filter(Boolean);

test('o service worker guarda todos os arquivos do app para uso offline', () => {
  const files = listFiles(APP).map((f) => relative(APP, f)).filter((f) => f !== 'sw.js');
  const missing = files.filter((f) => !shell.includes(f));
  assert.deepEqual(missing, [], `Adicione ao SHELL do sw.js: ${missing.join(', ')}`);
});

test('todo arquivo listado no service worker existe', () => {
  const absent = shell.filter((f) => !existsSync(join(APP, f)));
  assert.deepEqual(absent, []);
});

test('o manifesto aponta para ícones que existem', () => {
  const manifest = JSON.parse(readFileSync(join(APP, 'manifest.webmanifest'), 'utf8'));
  for (const icon of manifest.icons) assert.ok(existsSync(join(APP, icon.src)), icon.src);
});
