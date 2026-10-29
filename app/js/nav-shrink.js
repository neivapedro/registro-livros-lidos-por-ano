// Barra de baixo que encolhe ao rolar (1.6, no jeito do iOS 26): rolando para baixo, passado
// o começo da página, a cápsula de vidro fica menor (os nomes somem, os ícones se juntam no
// meio, o + diminui); rolando para cima, no alto ou no fim da página, ela volta inteira.
// Só transform e opacity (CSS: body.nav-compact), um cálculo por quadro no máximo e nada
// com "Reduzir movimento". A conta está em gestures.js (navShrinkStep).

import { navShrinkStep } from './gestures.js';

let state = { compact: false, anchor: 0 };
let frame = 0;

const reducedMotion = () => Boolean(window.matchMedia?.('(prefers-reduced-motion: reduce)').matches);

function apply(compact) {
  const body = document.body;
  if (body.classList.contains('nav-compact') !== compact) body.classList.toggle('nav-compact', compact);
}

function update() {
  frame = 0;
  const body = document.body;
  if (reducedMotion() || body.classList.contains('no-nav') || body.classList.contains('sheet-open') || body.classList.contains('edge-back')) {
    state = { compact: false, anchor: window.scrollY };
    apply(false);
    return;
  }
  const maxY = document.documentElement.scrollHeight - window.innerHeight;
  state = navShrinkStep(state, { y: window.scrollY, maxY });
  apply(state.compact);
}

function schedule() {
  if (!frame) frame = requestAnimationFrame(update);
}

export function initNavShrink() {
  addEventListener('scroll', schedule, { passive: true });
  addEventListener('resize', schedule, { passive: true });
}

/** Tela nova: a barra volta inteira, e a rolagem restaurada não conta como "rolar para baixo". */
export function resetNavShrink() {
  if (frame) cancelAnimationFrame(frame);
  frame = 0;
  state = { compact: false, anchor: window.scrollY };
  apply(false);
}
