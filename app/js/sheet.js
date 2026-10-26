// Folha que sobe de baixo (bottom sheet), no jeito do iPhone: fundo escurecido, alça,
// fecha com toque fora, Esc ou puxando para baixo. Uma folha por vez.
// O conteúdo é HTML pronto (quem chama faz o esc(), inclusive do label); os botões com
// data-action passam pelo mesmo tratador de cliques do app. data-sheet-close num botão
// ou link fecha a folha depois da ação.

let current = null;

const reducedMotion = () => Boolean(window.matchMedia?.('(prefers-reduced-motion: reduce)').matches);

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';
// De onde dá para puxar a folha para baixo (o resto rola normalmente).
const DRAG_AREA = '[data-sheet-grab], [data-sheet-drag]';

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

/**
 * Abre uma folha. { id, label, html, cls, focus, opener, onClose }
 * focus: seletor do campo que recebe o foco (senão, o primeiro focável).
 * opener: quem abriu (recebe o foco de volta ao fechar).
 */
export function openSheet({ id = 'sheet', label = '', html = '', cls = '', focus = null, opener: from = null, onClose = null }) {
  // Uma folha abrindo outra (menu → Registrar leitura): o foco volta para quem abriu a primeira.
  const inside = current && (current.panel.contains(document.activeElement) || current.panel.contains(from));
  const opener = inside ? current.opener : describe(from || document.activeElement);
  if (current) closeSheet({ immediate: true, keepFocus: true });

  const layer = document.createElement('div');
  layer.className = 'sheet-layer';
  layer.innerHTML = `
    <div class="sheet-backdrop" data-sheet-backdrop></div>
    <div class="sheet ${cls}" role="dialog" aria-modal="true" aria-label="${label}" tabindex="-1">
      <div class="sheet-grab" data-sheet-grab aria-hidden="true"><span class="sheet-handle"></span></div>
      <div class="sheet-body">${html}</div>
    </div>`;
  const panel = layer.querySelector('.sheet');
  document.body.appendChild(layer);
  current = { id, layer, panel, opener, onClose };
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
  dragToClose(panel);

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
  const { layer, opener, onClose } = current;
  current = null;
  setBackground(false);
  onClose?.();
  if (!keepFocus) restoreFocus(opener);
  if (immediate || reducedMotion()) {
    layer.remove();
    return;
  }
  // Saindo: sem ids nem cliques, para não se confundir com uma folha nova que abra logo em seguida.
  layer.setAttribute('inert', '');
  for (const el of layer.querySelectorAll('[id]')) el.removeAttribute('id');
  layer.classList.remove('is-open');
  layer.classList.add('is-closing');
  const finish = () => layer.remove();
  layer.querySelector('.sheet').addEventListener('transitionend', finish, { once: true });
  setTimeout(finish, 320);
}

/** Puxar para baixo pela alça ou pelo cabeçalho fecha a folha. */
function dragToClose(panel) {
  let start = null;
  const reset = () => {
    start = null;
    panel.style.transition = '';
    panel.style.transform = '';
  };
  panel.addEventListener('pointerdown', (e) => {
    if (e.pointerType === 'mouse' || !e.target.closest(DRAG_AREA) || e.target.closest('button, a, input, select')) return;
    start = { y: e.clientY, t: Date.now(), dy: 0 };
  });
  panel.addEventListener('pointermove', (e) => {
    if (!start) return;
    start.dy = Math.max(0, e.clientY - start.y);
    panel.style.transition = 'none';
    panel.style.transform = `translateY(${start.dy}px)`;
  });
  panel.addEventListener('pointerup', () => {
    if (!start) return;
    const { dy, t } = start;
    const fast = dy > 30 && dy / Math.max(1, Date.now() - t) > 0.5;
    const close = dy > Math.min(120, panel.offsetHeight * 0.3) || fast;
    reset();
    if (close) closeSheet();
  });
  panel.addEventListener('pointercancel', () => {
    if (start) reset();
  });
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
