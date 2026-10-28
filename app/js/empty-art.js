// Telas vazias ilustradas (1.5): desenhos de traço fino, no mesmo estilo dos ícones (pontas e
// cantos redondos), em SVG dentro da página. As cores vêm do CSS: o traço neutro segue o texto
// e os detalhes (.a) e preenchimentos suaves (.f) seguem a cor de destaque escolhida.

import { esc } from './ui.js';

// Prateleira com os suportes, base de várias cenas da Estante.
const SHELF = '<path d="M22 98h116"/><path class="l" d="M30 98v6M130 98v6"/>';
// Sombra suave no chão.
const FLOOR = '<ellipse class="s" cx="80" cy="102" rx="54" ry="5"/>';

const ART = {
  // Quero ler, fila vazia: dois livros e vagas tracejadas esperando os próximos.
  quero: `${SHELF}
    <rect x="38" y="52" width="16" height="46" rx="2.5"/><path class="l" d="M42 60h8M42 90h8"/>
    <rect class="a f" x="57" y="40" width="19" height="58" rx="2.5"/><path class="a" d="M61 50h11M61 88h11"/>
    <rect class="d" x="80" y="48" width="17" height="50" rx="2.5"/>
    <rect class="d" x="101" y="56" width="16" height="42" rx="2.5"/>
    <path class="a" d="M124 22v12M118 28h12"/><circle class="a" cx="110" cy="38" r="1.4"/>`,
  // Lendo, nada em andamento: livro aberto com a fita marcando a página.
  lendo: `${FLOOR}
    <path class="p" d="M80 46c-10-7-26-9-44-6v52c18-3 34-1 44 6c10-7 26-9 44-6V40c-18-3-34-1-44 6z"/>
    <path d="M80 46c-10-7-26-9-44-6v52c18-3 34-1 44 6"/><path d="M80 46c10-7 26-9 44-6v52c-18-3-34-1-44 6"/>
    <path d="M80 46v52"/>
    <path class="l" d="M45 52c9-1.4 18-.8 26 1.6M45 61c9-1.4 18-.8 26 1.6M45 70c9-1.4 18-.8 26 1.6M45 79c6-1 12-.8 17 .6"/>
    <path class="l" d="M89 53.6c8-2.4 17-3 26-1.6M89 62.6c8-2.4 17-3 26-1.6M89 71.6c8-2.4 17-3 26-1.6"/>
    <path class="a" d="M104 41.2v25l4.5-4 4.5 4V40.4"/>
    <path class="a" d="M80 22v8M70 27l4 3.5M90 27l-4 3.5"/>`,
  // Lidos, nenhum concluído: vagas na prateleira e o selo de "feito" esperando o primeiro.
  lido: `${SHELF}
    <rect class="d" x="36" y="50" width="17" height="48" rx="2.5"/>
    <rect class="d" x="56" y="42" width="19" height="56" rx="2.5"/>
    <rect class="d" x="78" y="54" width="16" height="44" rx="2.5"/>
    <circle class="a f" cx="117" cy="60" r="16"/><path class="a" d="M110 60.5l5 5 9.5-10.5"/>
    <path class="a" d="M135 30v8M131 34h8"/>`,
  // Abandonei, nenhum: um livro deitado, descansando sob a lua.
  abandonado: `${SHELF}
    <rect x="40" y="82" width="74" height="16" rx="2.5"/><path class="l" d="M49 82v16M58 90h48"/>
    <rect class="a f" x="52" y="68" width="58" height="14" rx="2.5"/><path class="a" d="M60 68v14"/>
    <path class="a f" d="M118 30a14 14 0 1 0 12 21 11 11 0 0 1-12-21z"/>
    <path class="a" d="M88 36v8M84 40h8"/><circle class="a" cx="102" cy="22" r="1.4"/>`,
  // Buscar sem livros: lupa sobre uma página.
  busca: `${FLOOR}
    <rect x="40" y="26" width="54" height="70" rx="6"/>
    <path class="l" d="M50 40h34M50 49h34M50 58h24M50 67h28M50 76h18"/>
    <circle class="a f" cx="98" cy="70" r="17"/>
    <path class="a w" d="M110.5 82.5l11 11"/>`,
  // Busca sem resultados: a lupa encontra uma página em branco.
  nada: `${FLOOR}
    <rect class="d" x="40" y="26" width="54" height="70" rx="6"/>
    <circle class="a f" cx="98" cy="70" r="17"/>
    <path class="a" d="M92.5 65.5c0-3.2 2.5-5.5 5.6-5.5 3.1 0 5.6 2.2 5.6 5.1 0 4.4-5.4 4.6-5.4 8.4"/><circle class="a" cx="98.3" cy="79" r=".9"/>
    <path class="a w" d="M110.5 82.5l11 11"/>`,
  // Trechos: um cartão com aspas, como os trechos salvos.
  trechos: `${FLOOR}
    <rect x="30" y="30" width="100" height="64" rx="10"/>
    <path class="a w" d="M30 44v36"/>
    <circle class="af" cx="51" cy="57" r="4.6"/><path class="a" d="M46.6 56.4c-.4-5.6 2.4-9.6 7.6-11.6"/>
    <circle class="af" cx="64.5" cy="57" r="4.6"/><path class="a" d="M60.1 56.4c-.4-5.6 2.4-9.6 7.6-11.6"/>
    <path class="l" d="M78 50h38M78 59h30M46 72h70M46 81h48"/>
    <path class="a" d="M128 16v8M124 20h8"/>`,
  // Resumo sem livros lidos: barras tracejadas esperando os números.
  resumo: `
    <path d="M30 98h100"/>
    <rect class="d" x="40" y="72" width="15" height="26" rx="3.5"/>
    <rect class="d" x="61" y="58" width="15" height="40" rx="3.5"/>
    <rect class="a f" x="82" y="44" width="15" height="54" rx="3.5"/>
    <rect class="d" x="103" y="64" width="15" height="34" rx="3.5"/>
    <path class="a" d="M89.5 22v10M84.5 27h10"/><circle class="a" cx="72" cy="36" r="1.4"/>`,
  // Diário sem dias: calendário com um dia marcado.
  diario: `${FLOOR}
    <rect x="38" y="32" width="84" height="64" rx="9"/><path d="M38 48h84"/>
    <path d="M56 26v12M104 26v12"/>
    <path class="l dot" d="M52 60h.01M66 60h.01M80 60h.01M94 60h.01M108 60h.01M52 72h.01M66 72h.01M94 72h.01M108 72h.01M52 84h.01M66 84h.01M80 84h.01"/>
    <circle class="a f" cx="80" cy="72" r="7"/>
    <path class="a" d="M77 72.2l2.2 2.2 4-4.4"/>`,
};

export const EMPTY_ARTS = Object.keys(ART);

/** O desenho (decorativo: o texto ao lado diz tudo). */
export function emptyArt(name) {
  const body = ART[name];
  if (!body) return '';
  return `<svg class="empty-art" viewBox="0 0 160 120" width="168" height="126" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${body}</svg>`;
}

/** Tela vazia ilustrada: desenho, título, dica e, se fizer sentido, um botão. */
export function emptyScene(art, title, text, cta = '') {
  return `<div class="empty has-art" data-empty="${esc(art)}">${emptyArt(art)}<p class="empty-title">${esc(title)}</p><p class="empty-text">${esc(text)}</p>${cta}</div>`;
}

/**
 * Troca o conteúdo de uma lista que é redesenhada a cada letra digitada (Buscar, Trechos
 * salvos). Se a mesma tela vazia já estava ali, a nova não refaz a entrada: sem isso o desenho
 * sumia e voltava a cada letra de uma busca sem resultado.
 */
export function swapResults(el, html) {
  const before = el.querySelector('.empty.has-art')?.dataset.empty;
  el.innerHTML = html;
  const now = el.querySelector('.empty.has-art');
  if (now && before && now.dataset.empty === before) now.classList.add('is-steady');
}
