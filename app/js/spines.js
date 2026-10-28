// Estante em lombadas: cada livro de pé na prateleira, com largura pela grossura (páginas),
// altura um pouco diferente de livro para livro (sempre a mesma para o mesmo título) e a cor
// da capa — a predominante da imagem quando dá para ler, senão a da capa desenhada.
// Nada disso é guardado nos dados: tudo sai do título, das páginas e da imagem.

import { loadCoverColor, hexToRgb } from './cover-color.js';
import { coverStyle, hash } from './ui.js';

export const SPINE_MIN_W = 20;
export const SPINE_MAX_W = 42;
export const SPINE_DEFAULT_W = 25;
export const SPINE_MIN_H = 112;
export const SPINE_MAX_H = 138;
/** Quantos desenhos de lombada existem (classes .sp-d0 … .sp-d3 no CSS). */
export const SPINE_DECOS = 4;

// Tinta clara (papel) e escura (nanquim) do texto da lombada.
export const SPINE_LIGHT = [246, 238, 223];
export const SPINE_DARK = [30, 24, 19];

/** Largura da lombada em px: cresce com o número de páginas, entre 20 e 42 (sem páginas: 25). */
export function spineWidth(pages) {
  const n = Number(pages);
  if (!Number.isFinite(n) || n <= 0) return SPINE_DEFAULT_W;
  return Math.max(SPINE_MIN_W, Math.min(SPINE_MAX_W, Math.round(14 + n / 32)));
}

/** Altura da lombada em px, entre 112 e 138: fixa para o mesmo título. */
export function spineHeight(title) {
  return SPINE_MIN_H + (hash(`h:${title || ''}`) % (SPINE_MAX_H - SPINE_MIN_H + 1));
}

/** Desenho (frisos) da lombada, fixo para o mesmo título. */
export function spineDeco(title) {
  return hash(`d:${title || ''}`) % SPINE_DECOS;
}

/** Luminância relativa (WCAG) de [r, g, b] de 0 a 255. */
export function luminance(rgb) {
  const [r, g, b] = rgb.map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** Contraste WCAG entre duas cores (1 a 21). */
export function contrast(a, b) {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

/** Tinta do texto sobre a lombada: a clara ou a escura, a que contrastar mais. */
export function spineInk(rgb) {
  return contrast(rgb, SPINE_LIGHT) >= contrast(rgb, SPINE_DARK) ? SPINE_LIGHT : SPINE_DARK;
}

/**
 * Cor da lombada a partir da cor da capa: segura o brilho e a saturação (uma capa
 * amarelo-limão ou quase branca vira um tom de encadernação, não um bloco gritante).
 */
export function spineColor(rgb) {
  const [r, g, b] = rgb.map((v) => v / 255);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;
  let h = 0;
  const l = (max + min) / 2;
  let s = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1));
  if (d) {
    if (max === r) h = ((g - b) / d) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60;
    if (h < 0) h += 360;
  }
  s = Math.min(s, 0.62);
  let light = Math.min(Math.max(l, 0.16), 0.66);
  let out = hsl(h, s, light);
  // Tons do meio não dão 4,5:1 nem com a tinta clara nem com a escura: escurece até dar.
  while (light > 0.1 && bestContrast(out) < 4.5) {
    light -= 0.02;
    out = hsl(h, s, light);
  }
  return out;
}

function hsl(h, s, light) {
  const c = (1 - Math.abs(2 * light - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = light - c / 2;
  const [r1, g1, b1] = h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x];
  return [r1, g1, b1].map((v) => Math.round((v + m) * 255));
}

const bestContrast = (rgb) => Math.max(contrast(rgb, SPINE_LIGHT), contrast(rgb, SPINE_DARK));

const PARTICLES = new Set(['de', 'da', 'do', 'das', 'dos', 'e', 'van', 'von', 'der', 'del', 'la', 'le', 'di', 'du', 'y']);

/** Iniciais do (primeiro) autor: "Machado de Assis" → "MA", "Platão" → "P". */
export function authorInitials(authors) {
  const first = String(authors || '').split(',')[0];
  const words = first.split(/[\s.\-]+/).map((w) => w.replace(/^[^\p{L}]+/u, '')).filter(Boolean)
    .filter((w) => !PARTICLES.has(w.toLocaleLowerCase('pt-BR')));
  if (!words.length) return '';
  const pick = words.length > 1 ? [words[0], words[words.length - 1]] : [words[0]];
  return pick.map((w) => [...w][0].toLocaleUpperCase('pt-BR')).join('');
}

const css = (rgb) => `rgb(${rgb.join(' ')})`;

// Largura média de uma letra da serifa, em "em" (a Instrument Serif é estreita).
const CHAR_EM = 0.42;
// Altura da lombada que sobra para o título (frisos, iniciais do autor e margens).
const RESERVED_H = 52;

/**
 * Corpo do título na lombada: o maior que cabe inteiro (até 16px, ou metade da largura),
 * nunca menor que 10px. Lombada larga com título comprido quebra em duas linhas.
 * Devolve { size, lines }; o que ainda não couber termina em reticências.
 */
export function spineTitleFit(title, w, h) {
  const len = Math.max(1, [...String(title || '')].length);
  const room = h - RESERVED_H;
  const cap = Math.min(16, Math.round(w * 0.5));
  const one = room / (len * CHAR_EM);
  if (one >= 11 || w < 30) return { size: Math.max(10, Math.min(cap, Math.floor(one))), lines: 1 };
  // Duas linhas: cada uma com metade do título e a largura dividida entre elas.
  const capTwo = Math.min(14, Math.floor((w - 6) / 2.1));
  return { size: Math.max(10, Math.min(capTwo, Math.floor((room * 2) / (len * CHAR_EM * 1.1)))), lines: 2 };
}

/** Medidas e cores da lombada (a cor é a da capa desenhada; a da imagem chega depois). */
export function spineLook(book) {
  const bg = spineColor(hexToRgb(coverStyle(book.title).bg));
  const w = spineWidth(book.pages);
  const h = spineHeight(book.title);
  const fit = spineTitleFit(book.title, w, h);
  return {
    w,
    h,
    fs: fit.size,
    lines: fit.lines,
    deco: spineDeco(book.title),
    bg: css(bg),
    fg: css(spineInk(bg)),
  };
}

// Cores já lidas nesta sessão (endereço → [r, g, b] ou null): ao redesenhar a tela, a
// lombada já nasce com a cor certa, sem piscar a cor da capa desenhada.
const known = new Map();
let observer = null;

function paint(el, rgb) {
  if (!rgb) return;
  const bg = spineColor(rgb);
  el.style.setProperty('--sp-bg', css(bg));
  el.style.setProperty('--sp-fg', css(spineInk(bg)));
}

function load(el) {
  const src = el.dataset.spine;
  loadCoverColor(src).then((rgb) => {
    known.set(src, rgb);
    if (el.isConnected) paint(el, rgb);
  });
}

/**
 * Pinta as lombadas [data-spine] com a cor predominante da imagem da capa (quando dá para ler).
 * Só lê as imagens das lombadas perto da tela: uma estante grande não baixa tudo de uma vez.
 */
export function applySpineColors(root) {
  observer?.disconnect();
  observer = null;
  for (const el of root.querySelectorAll('[data-spine]')) {
    const src = el.dataset.spine;
    if (!src) continue;
    if (known.has(src)) {
      paint(el, known.get(src));
      continue;
    }
    if (typeof IntersectionObserver !== 'function') {
      load(el);
      continue;
    }
    observer ||= new IntersectionObserver((entries, obs) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        obs.unobserve(entry.target);
        load(entry.target);
      }
    }, { rootMargin: '600px 0px' });
    observer.observe(el);
  }
}
