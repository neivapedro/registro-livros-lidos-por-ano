// Títulos grandes que se recolhem (V18), como nos apps do iPhone: nas abas principais o título
// serifado grande rola com a página e, quando passa por baixo do topo, aparece uma barra
// compacta de vidro com o título pequeno e as mesmas ações (CSS: .cbar).
//
// Uso nas telas: compactBar({ title, start, end }) logo no começo da página e o atributo
// data-large-title no título grande. initLargeTitles() uma vez; syncLargeTitle() após desenhar.

import { esc } from './ui.js';

/**
 * Barra compacta. title é texto; start e end são HTML (botões, já escapados por quem chama).
 * flush: sem filete embaixo (quando outra barra presa, como as abas do Resumo, vem logo abaixo).
 */
export function compactBar({ title, start = '', end = '', flush = false }) {
  return `<div class="cbar${flush ? ' is-flush' : ''}" data-cbar>
      <span class="cbar-start">${start}</span>
      <span class="cbar-title" aria-hidden="true">${esc(title)}</span>
      <span class="cbar-end">${end}</span>
    </div>`;
}

let frame = 0;

function update() {
  frame = 0;
  const bar = document.querySelector('[data-cbar]');
  if (!bar) return;
  const title = document.querySelector('[data-large-title]');
  // A barra aparece quando o título grande já passou (quase todo) por baixo dela.
  const on = !title || title.getBoundingClientRect().bottom - 6 <= bar.getBoundingClientRect().bottom;
  if (bar.classList.contains('is-on') !== on) bar.classList.toggle('is-on', on);
}

function schedule() {
  if (!frame) frame = requestAnimationFrame(update);
}

/** Acompanha a rolagem (um cálculo por quadro, no máximo). */
export function initLargeTitles() {
  addEventListener('scroll', schedule, { passive: true });
  addEventListener('resize', schedule, { passive: true });
}

/** Depois de desenhar a tela: a barra já nasce no estado certo (sem esmaecer). */
export function syncLargeTitle() {
  if (frame) cancelAnimationFrame(frame);
  const bar = document.querySelector('[data-cbar]');
  if (!bar) return;
  bar.style.transition = 'none';
  update();
  // Volta à transição do CSS no próximo quadro.
  requestAnimationFrame(() => { bar.style.transition = ''; });
}
