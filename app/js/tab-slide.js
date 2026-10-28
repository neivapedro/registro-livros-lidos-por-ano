// Abas e seletores com a marca que desliza (1.5): Estante (status e Lista/Capas/...), abas do
// Resumo e do livro e os seletores segmentados (Status, Formato, Aparência...).
// As telas são redesenhadas inteiras (innerHTML), então a marca nasce de novo a cada vez:
// depois de cada render() ela começa onde estava a do desenho anterior (guardada por controle)
// e desliza até a opção marcada. Funciona com qualquer número de opções e larguras diferentes,
// porque mede os botões. Sem JS (ou antes de rodar) fica o visual antigo: o botão marcado pinta
// o próprio fundo. Com "Reduzir movimento" a marca só aparece no lugar novo (CSS).

export const TAB_CONTROLS = '.segmented, .mini-seg, .rs-tabs, .book-tabs';
const SELECTED = '.is-on';

// Posição da marca de cada controle no último desenho (chave → { x, y, w, h }).
const last = new Map();
let lastScope = null;
let observer = null;
const keys = new WeakMap();

/** Identifica o controle entre um desenho e outro: classes + rótulo + ordem na tela. */
export function controlKey(className, label, nth) {
  const cls = String(className || '').split(/\s+/).filter((c) => c && c !== 'has-ind').sort().join('.');
  return `${cls}|${label || ''}#${nth}`;
}

/** Caixa da opção marcada relativa ao controle (já sem a borda dele). */
export function indicatorBox(ctrlRect, btnRect, clientLeft = 0, clientTop = 0) {
  const round = (v) => Math.round(v * 100) / 100;
  return {
    x: round(btnRect.left - ctrlRect.left - clientLeft),
    y: round(btnRect.top - ctrlRect.top - clientTop),
    w: round(btnRect.width),
    h: round(btnRect.height),
  };
}

export function sameBox(a, b) {
  return Boolean(a && b) && ['x', 'y', 'w', 'h'].every((k) => Math.abs(a[k] - b[k]) < 0.5);
}

function setBox(ind, box) {
  ind.style.setProperty('--ind-x', `${box.x}px`);
  ind.style.setProperty('--ind-y', `${box.y}px`);
  ind.style.setProperty('--ind-w', `${box.w}px`);
  ind.style.setProperty('--ind-h', `${box.h}px`);
}

function options(ctrl) {
  return [...ctrl.children].filter((c) => !c.classList.contains('tab-ind'));
}

function measure(ctrl) {
  const all = options(ctrl);
  const idx = all.findIndex((c) => c.matches(SELECTED));
  if (idx < 0) return null;
  const ctrlRect = ctrl.getBoundingClientRect();
  const btnRect = all[idx].getBoundingClientRect();
  if (!ctrlRect.width || !btnRect.width) return null;
  return { ...indicatorBox(ctrlRect, btnRect, ctrl.clientLeft, ctrl.clientTop), idx };
}

function indicatorOf(ctrl) {
  let ind = ctrl.querySelector(':scope > .tab-ind');
  if (!ind) {
    ind = document.createElement('span');
    ind.className = 'tab-ind';
    ind.setAttribute('aria-hidden', 'true');
    ctrl.append(ind);
  }
  return ind;
}

/** Mudou o tamanho (giro do celular, fonte que chegou): a marca vai direto ao lugar certo. */
function onResize(entries) {
  for (const { target: ctrl } of entries) {
    const key = keys.get(ctrl);
    const ind = ctrl.querySelector(':scope > .tab-ind');
    if (!key || !ind || !ctrl.isConnected) continue;
    const box = measure(ctrl);
    if (!box || sameBox(box, last.get(key))) continue;
    ind.classList.add('is-instant');
    setBox(ind, box);
    ind.getBoundingClientRect();
    ind.classList.remove('is-instant');
    last.set(key, box);
  }
}

/**
 * Depois de cada desenho: põe (ou desliza) a marca de cada controle. `scope` é a tela: ao
 * trocar de tela as posições antigas são esquecidas (a marca não "voa" de outra tela).
 */
export function slideTabs(root, scope) {
  if (scope !== lastScope) {
    last.clear();
    lastScope = scope;
  }
  observer?.disconnect();
  if (!observer && typeof ResizeObserver === 'function') observer = new ResizeObserver(onResize);
  const seen = new Map();
  for (const ctrl of root.querySelectorAll(TAB_CONTROLS)) {
    const sig = controlKey(ctrl.className, ctrl.getAttribute('aria-label'), 0);
    const nth = seen.get(sig) || 0;
    seen.set(sig, nth + 1);
    const key = controlKey(ctrl.className, ctrl.getAttribute('aria-label'), nth);
    const box = measure(ctrl);
    if (!box) continue;
    const ind = indicatorOf(ctrl);
    const prev = last.get(key);
    const moved = prev && !sameBox(prev, box);
    // Começa onde estava; o estilo é lido antes da troca, então a mudança vira transição.
    // O texto também: a opção anterior começa com a cor de marcada e a nova, sem ela.
    setBox(ind, moved ? prev : box);
    ctrl.classList.add('has-ind');
    if (moved) {
      const all = options(ctrl);
      const from = prev.idx !== box.idx ? all[prev.idx] : null;
      from?.classList.add('tab-was-on');
      if (from) all[box.idx].classList.add('tab-not-yet');
      ind.getBoundingClientRect();
      setBox(ind, box);
      from?.classList.remove('tab-was-on');
      all[box.idx].classList.remove('tab-not-yet');
    }
    last.set(key, box);
    keys.set(ctrl, key);
    observer?.observe(ctrl);
  }
}
