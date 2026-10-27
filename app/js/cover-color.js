// Cor predominante da capa: tinge o cartão "Lendo agora" e a ficha do livro com a cor
// da própria capa. Calculada no aparelho a partir da imagem, sem guardar nada nos dados.
// Capas de sites que não deixam ler a imagem (CORS) ficam com a cor da capa desenhada.
//
// Uso nas telas: um elemento com data-tint="<endereço da capa>" e data-tint-title="<título>";
// depois de desenhar a tela, applyTints(raiz) põe a variável CSS --tint ("r g b") nele.
// No CSS: background: linear-gradient(rgb(var(--tint) / .5), ...).

import { normalizeCoverUrl } from './cover-url.js';
import { coverFallbackColor } from './ui.js';

/**
 * Cor predominante de pixels RGBA (como os de getImageData). Ignora transparente,
 * quase branco e quase preto, e dá mais peso às cores saturadas: o que interessa é
 * a cor que marca a capa, não o fundo. Devolve [r, g, b] ou null.
 */
export function dominantColor(data) {
  const buckets = new Map();
  for (let i = 0; i + 3 < data.length; i += 4) {
    const [r, g, b, a] = [data[i], data[i + 1], data[i + 2], data[i + 3]];
    if (a < 128) continue;
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    if (max < 28 || min > 235) continue;
    const sat = max === 0 ? 0 : (max - min) / max;
    const key = ((r >> 4) << 8) | ((g >> 4) << 4) | (b >> 4);
    const slot = buckets.get(key) || { w: 0, r: 0, g: 0, b: 0 };
    const w = 0.2 + sat;
    slot.w += w;
    slot.r += r * w;
    slot.g += g * w;
    slot.b += b * w;
    buckets.set(key, slot);
  }
  let best = null;
  for (const slot of buckets.values()) if (!best || slot.w > best.w) best = slot;
  return best ? [best.r / best.w, best.g / best.w, best.b / best.w].map(Math.round) : null;
}

/**
 * Ajusta a cor para fundo de cartão no tema escuro: limita o brilho e a saturação
 * (uma capa amarelo-limão não pode virar um cartão gritante). Devolve "r g b".
 */
export function tintFor(rgb) {
  const [r, g, b] = rgb.map((v) => v / 255);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  let h = 0;
  const l = (max + min) / 2;
  const d = max - min;
  let s = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1));
  if (d) {
    if (max === r) h = ((g - b) / d) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60;
    if (h < 0) h += 360;
  }
  s = Math.min(s, 0.55);
  const light = Math.min(Math.max(l, 0.22), 0.42);
  const c = (1 - Math.abs(2 * light - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = light - c / 2;
  const [r1, g1, b1] = h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x];
  return [r1, g1, b1].map((v) => Math.round((v + m) * 255)).join(' ');
}

/** "#6B4A32" → [107, 74, 50] */
export function hexToRgb(hex) {
  const n = parseInt(String(hex).replace('#', ''), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

const cache = new Map();

/**
 * Lê a cor da imagem da capa (fica na memória da sessão). null se não der para ler.
 * O pedido passa pelo service worker: capa de site com CORS (Open Library) que já está
 * guardada sai do cache, e a cor aparece também offline. A do Google fica opaca no cache e
 * não serve para ler a cor (sem CORS): ela vai à rede e, sem rede, fica a cor da capa desenhada.
 */
export function loadCoverColor(raw) {
  const src = normalizeCoverUrl(raw);
  if (!src) return Promise.resolve(null);
  if (cache.has(src)) return cache.get(src);
  const job = new Promise((resolve) => {
    const img = new Image();
    // Imagem separada da que aparece na tela: pedir CORS numa capa de site que não
    // permite faria a capa visível sumir.
    if (!src.startsWith('data:')) img.crossOrigin = 'anonymous';
    img.referrerPolicy = 'no-referrer';
    img.decoding = 'async';
    img.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = 24;
        canvas.height = 36;
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        ctx.drawImage(img, 0, 0, 24, 36);
        resolve(dominantColor(ctx.getImageData(0, 0, 24, 36).data));
      } catch {
        resolve(null);
      }
    };
    img.onerror = () => resolve(null);
    img.src = src;
  });
  cache.set(src, job);
  return job;
}

/** Põe --tint nos elementos [data-tint] da tela: primeiro a cor da capa desenhada, depois a da imagem. */
export function applyTints(root) {
  for (const el of root.querySelectorAll('[data-tint]')) {
    el.style.setProperty('--tint', tintFor(hexToRgb(coverFallbackColor(el.dataset.tintTitle || ''))));
    const src = el.dataset.tint;
    if (!src) continue;
    loadCoverColor(src).then((rgb) => {
      if (rgb && el.isConnected) el.style.setProperty('--tint', tintFor(rgb));
    });
  }
}
