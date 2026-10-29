// Voltar deslizando da borda (1.6). Instalado na tela de início, o app não tem o gesto de
// voltar do Safari: aqui o dedo que começa na borda esquerda (24px) e anda para a direita
// leva a tela junto (com sombra na borda) e, por baixo, o fundo da tela anterior clareia e
// desliza um pouco (paralaxe). Soltando depois de 35% da largura, ou num gesto rápido, a tela
// sai e o app volta (mesmo destino do botão Voltar); senão, ela volta ao lugar.
//
// Só nas telas com Voltar (quem chama decide: target() devolve o link ou null). Nunca com
// folha, menu ou capa ampliada abertos, em campos, réguas, texto selecionado ou numa fileira
// que rola para o lado e não está no começo. O dedo na vertical rola a página normalmente:
// os eventos de toque só deixam de ser passivos depois de um toque na borda.

import { EDGE_PX, edgeBackCommit, edgeProgress, isEdgeStart, lockAxis, settleDuration, velocityOf } from './gestures.js';

const BLOCKED = 'input, textarea, select, [contenteditable=""], [contenteditable="true"], [data-no-edge-back], .sheet-layer, .cover-viewer, dialog';

let options = null;
let drag = null;
let busy = false;
let swallowClickUntil = 0;

const reducedMotion = () => Boolean(window.matchMedia?.('(prefers-reduced-motion: reduce)').matches);

/** Safari (fora do app instalado) já tem o próprio gesto de voltar: o nosso fica desligado. */
function nativeBackExists() {
  const ios = /iP(hone|ad|od)/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const standalone = navigator.standalone === true || Boolean(window.matchMedia?.('(display-mode: standalone)').matches);
  return ios && !standalone;
}

/** Algum ancestral rola para o lado e não está no começo? (o dedo é dele) */
function inScrolledRow(el) {
  for (let n = el; n && n !== document.body && n.nodeType === 1; n = n.parentElement) {
    if (n.scrollWidth > n.clientWidth + 1 && n.scrollLeft > 0) {
      const ox = getComputedStyle(n).overflowX;
      if (ox === 'auto' || ox === 'scroll') return true;
    }
  }
  return false;
}

function blocked(target) {
  const body = document.body;
  if (busy || body.classList.contains('sheet-open') || body.classList.contains('viewer-open')) return true;
  if (document.querySelector('.sheet-layer, dialog[open]')) return true;
  if (target?.closest?.(BLOCKED) || target?.closest?.('[data-swipe].is-open')) return true;
  const sel = window.getSelection?.();
  if (sel && !sel.isCollapsed && String(sel).trim()) return true;
  return target ? inScrolledRow(target) : false;
}

function touchOf(e) {
  for (const t of e.changedTouches) if (t.identifier === drag?.id) return t;
  return null;
}

// ---------- Desenho ----------

function app() {
  return document.getElementById('app');
}

/**
 * Começa: a tela ganha fundo e sombra; por baixo aparece a tela anterior (desenhada por
 * options.preview, sem ids nem toque) ou, sem ela, só o fundo do app, escurecido.
 */
function begin() {
  const el = app();
  const box = el.getBoundingClientRect();
  const under = document.createElement('div');
  under.className = 'edge-under';
  under.setAttribute('aria-hidden', 'true');
  under.inert = true;
  under.innerHTML = '<div class="edge-under-page app"></div><span class="edge-under-dim"></span>';
  const page = under.firstElementChild;
  let scroll = 0;
  try {
    scroll = options.preview?.(drag.link, page);
  } catch {
    scroll = null;
  }
  if (scroll == null) page.replaceChildren();
  else page.style.setProperty('--edge-scroll', `${-Math.max(0, Number(scroll) || 0)}px`);
  document.body.append(under);
  // A barra compacta (position: fixed dentro da tela) fica onde estava enquanto a tela anda.
  el.style.setProperty('--edge-top', `${-box.top}px`);
  el.style.setProperty('--edge-m', `${Math.max(0, box.left)}px`);
  el.style.transition = 'none';
  document.body.classList.add('edge-back');
  drag.under = under;
  drag.page = page;
  drag.dim = under.lastElementChild;
  drag.width = window.innerWidth;
  paintUnder(0);
}

/** Fundo: a tela anterior vem de 28% para a esquerda até o lugar e clareia. */
function paintUnder(p) {
  if (!drag?.under) return;
  drag.page.style.transform = `translate3d(${(-28 * (1 - p)).toFixed(2)}%, var(--edge-scroll, 0px), 0)`;
  drag.dim.style.opacity = (1 - p).toFixed(3);
}

function paint() {
  if (!drag) return;
  drag.frame = 0;
  const dx = Math.max(0, drag.dx);
  app().style.transform = `translate3d(${dx}px, 0, 0)`;
  paintUnder(edgeProgress(dx, drag.width));
}

function cleanup() {
  const el = app();
  el.style.transition = '';
  el.style.transform = '';
  el.style.removeProperty('--edge-top');
  el.style.removeProperty('--edge-m');
  document.body.classList.remove('edge-back');
  for (const u of document.querySelectorAll('.edge-under')) u.remove();
  busy = false;
  // Gesto terminado (tela no lugar ou tela nova desenhada): o próximo clique já é de outro toque.
  swallowClickUntil = 0;
}

/** Leva a tela até x (px) com a duração dada; depois chama then. */
function settle(x, duration, then) {
  const el = app();
  if (reducedMotion() || !duration) {
    then();
    return;
  }
  const curve = `${duration}ms cubic-bezier(.2, .8, .2, 1)`;
  el.style.transition = `transform ${curve}`;
  el.style.transform = `translate3d(${x}px, 0, 0)`;
  if (drag?.under) {
    drag.page.style.transition = `transform ${curve}`;
    drag.dim.style.transition = `opacity ${curve}`;
    paintUnder(edgeProgress(x, drag.width));
  }
  let done = false;
  const finish = () => {
    if (done) return;
    done = true;
    then();
  };
  el.addEventListener('transitionend', (e) => { if (e.target === el) finish(); }, { once: true });
  setTimeout(finish, duration + 80);
}

// ---------- Toque ----------

function onStart(e) {
  if (drag || busy || e.touches.length !== 1 || !options) return;
  const t = e.touches[0];
  if (!isEdgeStart(t.clientX, EDGE_PX) || blocked(e.target)) return;
  const link = options.target();
  if (!link) return;
  drag = { id: t.identifier, x0: t.clientX, y0: t.clientY, dx: 0, axis: null, link, samples: [{ v: t.clientX, t: e.timeStamp }], frame: 0 };
  document.addEventListener('touchmove', onMove, { passive: false });
  document.addEventListener('touchend', onEnd);
  document.addEventListener('touchcancel', onCancel);
}

function detach() {
  document.removeEventListener('touchmove', onMove);
  document.removeEventListener('touchend', onEnd);
  document.removeEventListener('touchcancel', onCancel);
}

function onMove(e) {
  if (!drag) return;
  const t = touchOf(e);
  if (!t) return;
  const dx = t.clientX - drag.x0;
  const dy = t.clientY - drag.y0;
  if (!drag.axis) {
    const axis = lockAxis(dx, dy);
    if (!axis) {
      // Ainda indeciso, mas indo para o lado: a página não começa a rolar.
      if (Math.abs(dx) >= Math.abs(dy) && e.cancelable) e.preventDefault();
      return;
    }
    if (axis === 'y' || dx < 0) {
      // Rolagem (ou para a esquerda): o gesto não é nosso.
      detach();
      drag = null;
      return;
    }
    drag.axis = axis;
    busy = true;
    begin();
  }
  if (e.cancelable) e.preventDefault();
  drag.dx = dx;
  drag.samples.push({ v: t.clientX, t: e.timeStamp });
  if (drag.samples.length > 10) drag.samples.shift();
  if (!drag.frame) drag.frame = requestAnimationFrame(paint);
}

function onEnd(e) {
  if (!drag) return;
  const t = touchOf(e);
  if (!t) return;
  detach();
  const d = drag;
  if (!d.axis) {
    drag = null;
    return;
  }
  if (d.frame) cancelAnimationFrame(d.frame);
  d.samples.push({ v: t.clientX, t: e.timeStamp });
  const dx = Math.max(0, t.clientX - d.x0);
  const velocity = velocityOf(d.samples);
  // O clique que o navegador ainda pode mandar ao soltar não abre nada por baixo do dedo.
  swallowClickUntil = Date.now() + 350;
  if (edgeBackCommit({ dx, width: d.width, velocity })) {
    settle(d.width, settleDuration(d.width - dx, velocity), () => {
      drag = null;
      goBack(d.link);
    });
  } else {
    settle(0, settleDuration(dx, velocity, { max: 260 }), () => {
      drag = null;
      cleanup();
    });
  }
}

function onCancel() {
  if (!drag) return;
  detach();
  const had = drag.axis;
  if (drag.frame) cancelAnimationFrame(drag.frame);
  if (had) settle(0, 180, () => { drag = null; cleanup(); });
  else drag = null;
}

/** Navega e só devolve a tela ao lugar depois que a anterior foi desenhada. */
function goBack(link) {
  let done = false;
  const finish = () => {
    if (done) return;
    done = true;
    removeEventListener('hashchange', onHash);
    cleanup();
    // A tela anterior aparece clareando (o fundo já estava no lugar dela).
    if (!reducedMotion()) app().animate?.([{ opacity: 0.4 }, { opacity: 1 }], { duration: 160, easing: 'ease-out' });
  };
  // O app desenha a tela nova no próprio hashchange (registrado antes deste).
  const onHash = () => requestAnimationFrame(finish);
  addEventListener('hashchange', onHash);
  setTimeout(finish, 600);
  try {
    options.back(link);
  } catch (err) {
    finish();
    throw err;
  }
}

/**
 * Liga o gesto. target(): o link "Voltar" da tela (ou null: tela sem voltar, gesto desligado);
 * back(link): navega para onde ele leva; preview(link, el): desenha em el a tela de destino
 * (o fundo durante o gesto) e devolve a rolagem dela, ou null (sem prévia).
 */
export function initEdgeBack({ target, back, preview = null }) {
  if (options || nativeBackExists()) return;
  options = { target, back, preview };
  document.addEventListener('touchstart', onStart, { passive: true });
  document.addEventListener('pointerdown', () => { if (!drag) swallowClickUntil = 0; }, { capture: true, passive: true });
  document.addEventListener('click', (e) => {
    if (Date.now() < swallowClickUntil) {
      swallowClickUntil = 0;
      e.preventDefault();
      e.stopPropagation();
    }
  }, true);
}
