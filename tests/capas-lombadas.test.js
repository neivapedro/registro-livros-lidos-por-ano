import { test } from 'node:test';
import assert from 'node:assert/strict';
import { COVER_DECOS, COVER_PALETTE, cover, coverFallbackColor, coverStyle, titleInitials } from '../app/js/ui.js';
import {
  SPINE_DEFAULT_W, SPINE_MAX_H, SPINE_MAX_W, SPINE_MIN_H, SPINE_MIN_W,
  authorInitials, contrast, spineColor, spineHeight, spineInk, spineLook, spineTitleFit, spineWidth,
} from '../app/js/spines.js';
import { shelfView } from '../app/js/views/shelf.js';
import { normalizeState } from '../app/js/store.js';
import { hexToRgb } from '../app/js/cover-color.js';

test('iniciais do título para a capa pequena', () => {
  assert.equal(titleInitials('Dom Casmurro'), 'DC');
  assert.equal(titleInitials('Duna'), 'D');
  assert.equal(titleInitials('O Nome da Rosa'), 'NR');
  assert.equal(titleInitials('A Revolução dos Bichos'), 'RB');
  assert.equal(titleInitials('Sapiens: Uma breve história da humanidade'), 'SB');
  assert.equal(titleInitials('“Ética” a Nicômaco'), 'ÉN');
  assert.equal(titleInitials('é isso aí'), 'ÉI');
  assert.equal(titleInitials('1984'), '1984');
  assert.equal(titleInitials('O'), 'O', 'só palavras pequenas: usa o que tem');
  assert.equal(titleInitials(''), '');
  assert.equal(titleInitials(null), '');
});

test('capa desenhada: cor e ornamento fixos por título, paleta funda com texto legível', () => {
  assert.deepEqual(coverStyle('Duna'), coverStyle('Duna'));
  assert.equal(coverFallbackColor('Duna'), coverStyle('Duna').bg);
  const decos = new Set();
  for (let i = 0; i < 200; i += 1) {
    const s = coverStyle(`Livro ${i}`);
    assert.ok(s.deco >= 0 && s.deco < COVER_DECOS);
    decos.add(s.deco);
  }
  assert.equal(decos.size, COVER_DECOS, 'todos os ornamentos aparecem');
  for (const [bg, fg] of COVER_PALETTE) {
    assert.ok(contrast(hexToRgb(bg), hexToRgb(fg)) >= 4.5, `texto ${fg} sobre ${bg}`);
  }
});

test('cover(): iniciais quando não há espaço para o texto, ornamento e imagem por cima', () => {
  const small = cover({ title: 'Dom Casmurro', authors: 'Machado de Assis' }, { size: 'li', showText: false });
  assert.match(small, /<span class="cover-ini" aria-hidden="true">DC<\/span>/);
  assert.doesNotMatch(small, /cover-title/);
  assert.match(small, /class="cover cover-li cover-d\d"/);
  assert.match(small, /--cover-acc:#/);
  const big = cover({ title: 'Duna', authors: 'Frank Herbert, Outro', cover: 'https://exemplo.com/c.jpg' }, { size: 'hero' });
  assert.match(big, /<span class="cover-title">Duna<\/span><span class="cover-author">Frank Herbert<\/span>/);
  assert.match(big, /<img class="cover-img" src="https:\/\/exemplo.com\/c.jpg"/);
  // A ficha põe a capa em alta resolução antes do último </span> (book-detail.js).
  assert.match(big, /<\/span>$/);
  assert.ok(big.indexOf('cover-deco') < big.indexOf('cover-img'), 'ornamento atrás da imagem');
  const evil = cover({ title: '<b>"x"</b>' }, { size: 'xs', showText: false });
  assert.doesNotMatch(evil, /<b>/);
});

test('largura da lombada pelas páginas (com limites) e altura fixa por título', () => {
  assert.equal(spineWidth(null), SPINE_DEFAULT_W);
  assert.equal(spineWidth(0), SPINE_DEFAULT_W);
  assert.equal(spineWidth('abc'), SPINE_DEFAULT_W);
  assert.equal(spineWidth(40), SPINE_MIN_W);
  assert.equal(spineWidth(5000), SPINE_MAX_W);
  assert.ok(spineWidth(200) < spineWidth(400) && spineWidth(400) < spineWidth(700));
  let prev = 0;
  for (let p = 1; p <= 2000; p += 37) {
    const w = spineWidth(p);
    assert.ok(w >= prev && w >= SPINE_MIN_W && w <= SPINE_MAX_W);
    prev = w;
  }
  assert.equal(spineHeight('Duna'), spineHeight('Duna'));
  const heights = new Set();
  for (let i = 0; i < 300; i += 1) {
    const h = spineHeight(`Título ${i}`);
    assert.ok(Number.isInteger(h) && h >= SPINE_MIN_H && h <= SPINE_MAX_H);
    heights.add(h);
  }
  assert.ok(heights.size > 15, 'alturas variadas');
});

test('lombada: cor contida e tinta com 4,5:1 para qualquer capa', () => {
  for (let r = 0; r <= 255; r += 17) {
    for (let g = 0; g <= 255; g += 17) {
      for (let b = 0; b <= 255; b += 17) {
        const bg = spineColor([r, g, b]);
        assert.ok(bg.every((v) => Number.isInteger(v) && v >= 0 && v <= 255));
        const ratio = contrast(bg, spineInk(bg));
        assert.ok(ratio >= 4.5, `capa ${[r, g, b]} → lombada ${bg} com ${ratio.toFixed(2)}`);
      }
    }
  }
  // Quase branca vira um tom de papel (não um bloco branco); quase preta não some no fundo escuro.
  assert.ok(Math.max(...spineColor([250, 250, 250])) < 200);
  assert.ok(Math.max(...spineColor([5, 5, 5])) >= 30);
});

test('iniciais do autor ao pé da lombada', () => {
  assert.equal(authorInitials('Machado de Assis'), 'MA');
  assert.equal(authorInitials('João Guimarães Rosa'), 'JR');
  assert.equal(authorInitials('J. R. R. Tolkien'), 'JT');
  assert.equal(authorInitials('Platão'), 'P');
  assert.equal(authorInitials('Yuval Noah Harari, Outro Autor'), 'YH');
  assert.equal(authorInitials(''), '');
  assert.equal(authorInitials(undefined), '');
});

test('corpo do título na lombada: cabe, nunca menor que 10px, duas linhas só em lombada larga', () => {
  assert.deepEqual(spineTitleFit('Duna', 34, 130), { size: 16, lines: 1 });
  const long = spineTitleFit('Memórias Póstumas de Brás Cubas', 22, 120);
  assert.equal(long.lines, 1);
  assert.equal(long.size, 10);
  const wide = spineTitleFit('Grande Sertão: Veredas', 40, 120);
  assert.equal(wide.lines, 2);
  assert.ok(wide.size >= 10 && wide.size <= 14);
  const look = spineLook({ title: 'Duna', pages: 680 });
  assert.equal(look.w, spineWidth(680));
  assert.match(look.bg, /^rgb\(\d+ \d+ \d+\)$/);
});

const TS = '2026-01-01T00:00:00.000Z';
const state = normalizeState({
  books: [
    { id: 'a1', title: 'Duna', authors: 'Frank Herbert', status: 'lido', startDate: '2026-01-01', endDate: '2026-02-01', pages: 680, favorite: true, createdAt: TS },
    { id: 'a2', title: 'Sapiens', authors: 'Yuval Noah Harari', status: 'lido', startDate: '2025-01-01', endDate: '2025-02-01', createdAt: TS, cover: 'https://exemplo.com/s.jpg' },
    { id: 'w1', title: 'Quero "isto"', authors: 'Alguém', status: 'quero', createdAt: TS },
    { id: 'r1', title: 'Lendo', authors: 'Fulana', status: 'lendo', startDate: '2026-10-01', createdAt: TS },
  ],
  upNext: ['w1'],
});

test('Estante em lombadas: anos, link, toque longo, rótulo e cor da imagem', () => {
  const html = shelfView({ state, ui: { shelfMode: 'lombadas' }, tab: 'lido' });
  assert.match(html, /data-mode="lombadas"/);
  assert.match(html, /data-value="lombadas" aria-pressed="true"/);
  assert.equal((html.match(/class="year-head group-head"/g) || []).length, 2);
  assert.equal((html.match(/<ul class="spine-shelf"/g) || []).length, 2);
  assert.match(html, /<a class="spine sp-d\d[^"]*is-fav" href="#\/livro\/a1"/);
  assert.match(html, /aria-label="Duna, Frank Herbert"/);
  assert.match(html, /data-spine="https:\/\/exemplo.com\/s.jpg"/);
  assert.doesNotMatch(html, /data-longpress/, 'lidos não têm menu rápido');
  assert.match(html, /--sp-w:\d+px;--sp-h:\d+px/);
  const want = shelfView({ state, ui: { shelfMode: 'lombadas' }, tab: 'quero' });
  assert.match(want, /href="#\/livro\/w1" data-longpress data-id="w1"/);
  assert.match(want, /aria-label="Quero &quot;isto&quot;, Alguém"/);
  assert.match(want, /<span class="next-pos">1º<\/span>/);
  const reading = shelfView({ state, ui: { shelfMode: 'lombadas' }, tab: 'lendo' });
  assert.match(reading, /data-longpress data-id="r1"/);
  // Modo desconhecido (sessão antiga) volta para a lista.
  assert.match(shelfView({ state, ui: { shelfMode: 'xyz' }, tab: 'lido' }), /data-mode="lista"/);
});
