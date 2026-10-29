// Folha que sobe de baixo (bottom sheet), no jeito do iPhone: fundo escurecido, alça,
// fecha com toque fora, Esc ou puxando para baixo. Uma folha por vez.
// O conteúdo é HTML pronto (quem chama faz o esc(), inclusive do label); os botões com
// data-action passam pelo mesmo tratador de cliques do app. data-sheet-close num botão
// ou link fecha a folha depois da ação.
//
// 1.6: folhas em dois tamanhos (média ~55% e grande ~92% da tela) quando o conteúdo não cabe
// na média: puxar a alça para cima abre a grande, para baixo volta à média e, mais, fecha.
// Na média o conteúdo não rola (arrastar nele muda o tamanho); na grande, rola.
// E o "menu com prévia" (context): a capa do livro sai do lugar dela na tela, cresce sobre o
// fundo desfocado e a lista de ações aparece embaixo (ou em cima) dela, como no app Fotos.
// Mesmo foco preso, Esc, toque fora e devolução do foco da folha comum.

import { dragHeight, placeContextMenu, sheetDetents, snapDetent, velocityOf } from './gestures.js';

let current = null;

const reducedMotion = () => Boolean(window.matchMedia?.('(prefers-reduced-motion: reduce)').matches);

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';
// De onde dá para puxar a folha para baixo (o resto rola normalmente).
const DRAG_AREA = '[data-sheet-grab], [data-sheet-drag]';
// Nunca começam um arrasto da folha (o toque é deles).
const NO_DRAG = 'button, a, input, select, textarea, label, [contenteditable], [data-no-sheet-drag]';
// Menu com prévia: tela mínima (celular deitado usa a folha comum).
const CONTEXT_MIN = { w: 300, h: 440 };

/** O resto da tela fica inerte (nem toque, nem Tab, nem leitor de tela) enquanto a folha está aberta. */
function setBackground(off) {
  for (const id of ['app', 'nav']) {
    const el = document.getElementById(id);
    if (!el) continue;
    if (off) el.setAttribute('inert', '');
    else el.removeAttribute('inert');
  }
  document.body.classList.toggle('sheet-open', off);
}

/** Quem abriu a folha, para devolver o foco mesmo depois de a tela ser redesenhada. */
function describe(el) {
  if (!el || el === document.body) return null;
  return { el, action: el.dataset?.action || '', id: el.dataset?.id || '' };
}

function restoreFocus(opener) {
  if (!opener) return;
  let target = opener.el?.isConnected ? opener.el : null;
  if (!target && opener.id) {
    const sameId = [...document.querySelectorAll('#app [data-id]')].filter((x) => x.dataset.id === opener.id);
    target = (opener.action && sameId.find((x) => x.dataset.action === opener.action))
      || sameId.find((x) => x.matches('button, a[href]')) || null;
  }
  target?.focus?.({ preventScroll: true });
}

// Teclado do iPhone: a folha sobe junto (o visualViewport encolhe, a janela não).
function syncKeyboard() {
  if (!current) return;
  const vv = window.visualViewport;
  const covered = vv ? Math.max(0, window.innerHeight - vv.height - vv.offsetTop) : 0;
  current.layer.style.setProperty('--kb', `${Math.round(covered)}px`);
}

/** O item tocado está à vista e a tela tem espaço para o menu com prévia? */
function contextFits(source) {
  if (!source?.isConnected || window.innerWidth < CONTEXT_MIN.w || window.innerHeight < CONTEXT_MIN.h) return false;
  const r = source.getBoundingClientRect();
  return r.width > 0 && r.height > 0 && r.bottom > 0 && r.top < window.innerHeight && r.right > 0 && r.left < window.innerWidth;
}

/**
 * Abre uma folha. { id, label, html, cls, focus, opener, onClose, context, detents }
 * focus: seletor do campo que recebe o foco (senão, o primeiro focável).
 * opener: quem abriu (recebe o foco de volta ao fechar).
 * context: { source, preview, href, resolve } abre como menu com prévia: source é o elemento
 *   na tela (a capa), preview o HTML da capa grande, href o link do toque na prévia e
 *   resolve() acha o item de novo se a tela for redesenhada. Sem espaço, vira folha comum.
 * detents: false mantém a folha sempre do tamanho do conteúdo.
 */
export function openSheet({ id = 'sheet', label = '', html = '', cls = '', focus = null, opener: from = null, onClose = null, context = null, detents = true }) {
  // Uma folha abrindo outra (menu → Registrar leitura): o foco volta para quem abriu a primeira.
  const inside = current && (current.panel.contains(document.activeElement) || current.panel.contains(from));
  const opener = inside ? current.opener : describe(from || document.activeElement);
  if (current) closeSheet({ immediate: true, keepFocus: true });

  const ctx = context && contextFits(context.source) ? context : null;
  const layer = document.createElement('div');
  layer.className = `sheet-layer${ctx ? ' is-ctx' : ''}`;
  layer.innerHTML = ctx
    ? `
    <button type="button" class="sheet-backdrop" data-sheet-backdrop tabindex="-1" aria-label="Fechar menu"></button>
    <span class="ctx-safe" aria-hidden="true"></span>
    <a class="ctx-preview"${ctx.href ? ` href="${ctx.href}"` : ''} tabindex="-1" aria-hidden="true">${ctx.preview || ''}</a>
    <div class="sheet ${cls} is-ctx" role="dialog" aria-modal="true" aria-label="${label}" tabindex="-1">
      <div class="sheet-body">${html}</div>
    </div>`
    : `
    <div class="sheet-backdrop" data-sheet-backdrop></div>
    <div class="sheet ${cls}" role="dialog" aria-modal="true" aria-label="${label}" tabindex="-1">
      <div class="sheet-grab" data-sheet-grab aria-hidden="true"><span class="sheet-handle"></span></div>
      <div class="sheet-body">${html}</div>
    </div>`;
  const panel = layer.querySelector('.sheet');
  document.body.appendChild(layer);
  current = { id, layer, panel, opener, onClose, ctx: null, detents: null, height: null };
  setBackground(true);
  syncKeyboard();

  layer.querySelector('[data-sheet-backdrop]').addEventListener('click', () => closeSheet());
  panel.addEventListener('click', (e) => {
    const closer = e.target.closest('[data-sheet-close]');
    if (!closer) return;
    // Depois da ação (o tratador do app roda no document, na volta do mesmo evento).
    setTimeout(() => {
      if (current?.panel === panel) closeSheet({ keepFocus: closer.matches('a[href]') });
    }, 0);
  });
  if (ctx) {
    openContext(current, ctx);
  } else {
    if (detents) setupDetents(current);
    dragSheet(current);
  }

  // Próximo quadro: a classe dispara a transição de entrada.
  requestAnimationFrame(() => layer.classList.add('is-open'));
  const target = (focus && panel.querySelector(focus)) || panel.querySelector(FOCUSABLE) || panel;
  target.focus({ preventScroll: true });
  if (target.type === 'number') target.select?.();
  return panel;
}

/** Fecha a folha aberta. immediate: sem animação. keepFocus: não devolve o foco a quem abriu. */
export function closeSheet({ immediate = false, keepFocus = false } = {}) {
  if (!current) return;
  const { layer, opener, onClose, ctx } = current;
  current = null;
  setBackground(false);
  onClose?.();
  if (!keepFocus) restoreFocus(opener);
  if (immediate || reducedMotion()) {
    if (ctx) showSource(ctx);
    layer.remove();
    return;
  }
  // Saindo: sem ids nem cliques, para não se confundir com uma folha nova que abra logo em seguida.
  layer.setAttribute('inert', '');
  for (const el of layer.querySelectorAll('[id]')) el.removeAttribute('id');
  layer.classList.remove('is-open');
  layer.classList.add('is-closing');
  if (ctx) {
    closeContext(layer, ctx);
    return;
  }
  const finish = () => layer.remove();
  layer.querySelector('.sheet').addEventListener('transitionend', finish, { once: true });
  setTimeout(finish, 320);
}

/** A folha que está aberta (ou null): { id, panel, layer }. */
export function openSheetInfo() {
  return current ? { id: current.id, panel: current.panel, layer: current.layer, context: Boolean(current.ctx) } : null;
}

// ---------- Folhas em dois tamanhos ----------

/** Mede o conteúdo e, se ele não cabe na média, a folha nasce na média. */
function setupDetents(cur) {
  const { panel } = cur;
  const body = panel.querySelector('.sheet-body');
  const grab = panel.querySelector('.sheet-grab');
  const natural = (grab?.offsetHeight || 0) + (body?.scrollHeight || 0) + 2;
  const list = sheetDetents({ natural, viewport: window.innerHeight });
  if (!list) return;
  cur.detents = list;
  panel.classList.add('has-detents');
  setDetent(cur, list[0]);
  // Tab (ou o leitor de tela) chegou num campo escondido embaixo da média: abre a grande.
  panel.addEventListener('focusin', (e) => {
    if (!cur.detents || panel.classList.contains('is-large')) return;
    const r = e.target.getBoundingClientRect();
    if (r.bottom > panel.getBoundingClientRect().bottom - 4) setDetent(cur, cur.detents[cur.detents.length - 1]);
  });
}

function setDetent(cur, height) {
  const { panel } = cur;
  cur.height = height;
  panel.style.height = `${height}px`;
  const large = height >= cur.detents[cur.detents.length - 1];
  panel.classList.toggle('is-large', large);
  panel.dataset.detent = large ? 'large' : 'medium';
  // Na média o conteúdo volta ao começo (ele não rola nesse tamanho).
  const body = panel.querySelector('.sheet-body');
  if (!large && body?.scrollTop) body.scrollTo({ top: 0, behavior: reducedMotion() ? 'auto' : 'smooth' });
}

/**
 * Arrastar a folha: pela alça e pelo cabeçalho (data-sheet-drag) sempre; na média, por qualquer
 * parte que não seja botão ou campo. Com dois tamanhos, a altura acompanha o dedo; abaixo da
 * menor, a folha desce. Ao soltar, para no tamanho mais perto (ou no seguinte, se o gesto foi
 * rápido) ou fecha.
 */
function dragSheet(cur) {
  const { panel } = cur;
  let start = null;
  const apply = (height) => {
    panel.style.transition = 'none';
    if (cur.detents) {
      const min = cur.detents[0];
      panel.style.height = `${dragHeight(Math.max(height, min), cur.detents)}px`;
      panel.style.transform = height < min ? `translateY(${min - height}px)` : '';
    } else {
      panel.style.transform = `translateY(${Math.max(0, start.h - height)}px)`;
    }
  };
  panel.addEventListener('pointerdown', (e) => {
    if (e.pointerType === 'mouse' || e.button > 0) return;
    const medium = cur.detents && !panel.classList.contains('is-large');
    if ((!e.target.closest(DRAG_AREA) && !medium) || e.target.closest(NO_DRAG)) return;
    start = { y: e.clientY, h: cur.height ?? panel.offsetHeight, samples: [{ v: e.clientY, t: e.timeStamp }], moved: false };
  });
  panel.addEventListener('pointermove', (e) => {
    if (!start) return;
    const dy = e.clientY - start.y;
    if (!start.moved && Math.abs(dy) < 4) return;
    start.moved = true;
    start.samples.push({ v: e.clientY, t: e.timeStamp });
    if (start.samples.length > 8) start.samples.shift();
    apply(start.h - dy);
  });
  panel.addEventListener('pointerup', (e) => {
    if (!start) return;
    const { moved, h, y, samples } = start;
    start = null;
    if (!moved) return;
    samples.push({ v: e.clientY, t: e.timeStamp });
    const height = h - (e.clientY - y);
    const target = snapDetent({ height, velocity: velocityOf(samples), detents: cur.detents || [h] });
    panel.style.transition = '';
    panel.style.transform = '';
    if (target === 0) {
      if (current === cur) closeSheet();
      return;
    }
    if (cur.detents) setDetent(cur, target);
  });
  panel.addEventListener('pointercancel', () => {
    if (!start) return;
    start = null;
    panel.style.transition = '';
    panel.style.transform = '';
    if (cur.detents) setDetent(cur, cur.height);
  });
}

// ---------- Menu com prévia ----------

const LIFT_EASE = 'cubic-bezier(.2, .9, .25, 1.08)';

function sourceOf(ctx) {
  if (ctx.source?.isConnected) return ctx.source;
  const again = ctx.resolve?.();
  if (again) ctx.source = again;
  return again || null;
}

function hideSource(ctx) {
  const el = sourceOf(ctx);
  if (el) el.style.visibility = 'hidden';
}

function showSource(ctx) {
  for (const el of new Set([ctx.source, ctx.resolve?.()])) if (el?.style) el.style.visibility = '';
}

/** Transform que leva a prévia (no lugar final, tamanho cheio w×h) ao retângulo r. */
function flyTo(r, place, w, h) {
  return `translate(${(r.left - place.preview.x).toFixed(1)}px, ${(r.top - place.preview.y).toFixed(1)}px) scale(${(r.width / w).toFixed(4)}, ${(r.height / h).toFixed(4)})`;
}

function openContext(cur, context) {
  const { layer, panel } = cur;
  const preview = layer.querySelector('.ctx-preview');
  const safe = layer.querySelector('.ctx-safe').getBoundingClientRect();
  const src = context.source.getBoundingClientRect();
  const w = preview.offsetWidth;
  const h = preview.offsetHeight;
  const place = placeContextMenu({
    src,
    preview: { w, h },
    menu: { w: panel.offsetWidth, h: panel.offsetHeight },
    view: { w: window.innerWidth, h: window.innerHeight, top: safe.top, bottom: Math.max(0, window.innerHeight - safe.bottom) },
  });
  Object.assign(preview.style, { left: `${place.preview.x}px`, top: `${place.preview.y}px`, transform: `scale(${place.scale})` });
  Object.assign(panel.style, { left: `${place.menu.x}px`, top: `${place.menu.y}px`, width: `${place.menu.w}px`, maxHeight: `${place.menu.h}px` });
  const alignLeft = place.menu.x <= place.preview.x + 1;
  panel.style.transformOrigin = `${alignLeft ? 'left' : 'right'} ${place.placement === 'below' ? 'top' : 'bottom'}`;
  layer.dataset.placement = place.placement;
  cur.ctx = { ...context, place, w, h, preview };
  hideSource(cur.ctx);
  // O dedo que segurou solta em cima da capa: o foco continua no menu (o toque não o leva).
  preview.addEventListener('mousedown', (e) => e.preventDefault());
  if (reducedMotion() || typeof preview.animate !== 'function') return;
  // A capa sai do lugar dela (FLIP) e cresce; o menu brota da borda da capa.
  preview.animate([{ transform: flyTo(src, place, w, h) }, { transform: `scale(${place.scale})` }], { duration: 420, easing: LIFT_EASE });
  panel.animate([
    { opacity: 0, transform: 'scale(.4)' },
    { opacity: 1, transform: 'none' },
  ], { duration: 340, delay: 70, easing: LIFT_EASE, fill: 'backwards' });
}

function closeContext(layer, ctx) {
  const { preview, place, w, h } = ctx;
  const panel = layer.querySelector('.sheet');
  let done = false;
  const finish = () => {
    if (done) return;
    done = true;
    showSource(ctx);
    layer.remove();
  };
  if (typeof preview.animate !== 'function') {
    finish();
    return;
  }
  const el = sourceOf(ctx);
  if (el) el.style.visibility = 'hidden';
  const r = el?.getBoundingClientRect();
  const visible = r && r.width > 0 && r.bottom > 0 && r.top < window.innerHeight;
  const anims = [panel.animate([{ opacity: 1, transform: 'none' }, { opacity: 0, transform: 'scale(.6)' }], { duration: 180, easing: 'ease-in', fill: 'forwards' })];
  // A capa volta ao lugar dela; se ele sumiu da tela, a capa só se apaga.
  anims.push(visible
    ? preview.animate([{ transform: `scale(${place.scale})` }, { transform: flyTo(r, place, w, h) }], { duration: 300, easing: 'cubic-bezier(.3, .7, .2, 1)', fill: 'forwards' })
    : preview.animate([{ opacity: 1, transform: `scale(${place.scale})` }, { opacity: 0, transform: `scale(${place.scale * 0.85})` }], { duration: 200, easing: 'ease-in', fill: 'forwards' }));
  Promise.all(anims.map((a) => a.finished)).then(finish, finish);
  setTimeout(finish, 420);
}

document.addEventListener('keydown', (e) => {
  if (!current) return;
  if (e.key === 'Escape') {
    e.preventDefault();
    closeSheet();
    return;
  }
  if (e.key !== 'Tab') return;
  // Foco preso na folha (o resto da tela está inerte, mas o Tab sairia para o navegador).
  const items = [...current.panel.querySelectorAll(FOCUSABLE)].filter((x) => x.offsetParent !== null);
  if (!items.length) return;
  const first = items[0];
  const last = items[items.length - 1];
  if (e.shiftKey && document.activeElement === first) {
    e.preventDefault();
    last.focus();
  } else if (!e.shiftKey && document.activeElement === last) {
    e.preventDefault();
    first.focus();
  }
});

window.visualViewport?.addEventListener('resize', syncKeyboard);
window.visualViewport?.addEventListener('scroll', syncKeyboard);
// Girou o celular com o menu com prévia aberto: as posições não valem mais.
window.addEventListener('resize', () => {
  if (current?.ctx) closeSheet({ immediate: true });
});
