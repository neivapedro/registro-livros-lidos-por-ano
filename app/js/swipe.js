// Deslizar para a esquerda numa linha [data-swipe] mostra os botões escondidos atrás dela
// (na fila "Quero ler": Começar e Próxima). Só com o dedo: teclado e leitor de tela usam
// o menu rápido (botão "Mais ações"), que tem as mesmas opções.
// A linha usa touch-action: pan-y, então a rolagem vertical continua com o navegador.

const LOCK_PX = 8;

let drag = null;
let openRow = null;
let swallowClick = false;

function contentOf(row) {
  return row.querySelector('.swipe-content');
}

function widthOf(row) {
  return row.querySelector('.swipe-actions')?.offsetWidth || 0;
}

function setOffset(row, px, animate) {
  const content = contentOf(row);
  if (!content) return;
  content.style.transition = animate ? '' : 'none';
  content.style.transform = px ? `translateX(${px}px)` : '';
}

export function closeSwipe(row = openRow) {
  if (!row) return;
  row.classList.remove('is-open');
  setOffset(row, 0, true);
  if (row === openRow) openRow = null;
}

function openSwipe(row) {
  if (openRow && openRow !== row) closeSwipe(openRow);
  row.classList.add('is-open');
  setOffset(row, -widthOf(row), true);
  openRow = row;
}

export function initSwipe() {
  document.addEventListener('pointerdown', (e) => {
    if (openRow && !openRow.isConnected) openRow = null;
    if (e.pointerType !== 'touch') return;
    const row = e.target.closest?.('[data-swipe]');
    if (openRow && openRow !== row) closeSwipe(openRow);
    if (!row || e.target.closest('.swipe-actions')) return;
    drag = { row, x: e.clientX, y: e.clientY, base: row === openRow ? -widthOf(row) : 0, locked: null, offset: 0 };
  }, { passive: true });

  document.addEventListener('pointermove', (e) => {
    if (!drag) return;
    const dx = e.clientX - drag.x;
    const dy = e.clientY - drag.y;
    if (!drag.locked) {
      if (Math.abs(dx) > LOCK_PX && Math.abs(dx) > Math.abs(dy) * 1.3) {
        drag.locked = 'h';
        drag.row.classList.add('is-swiping');
      } else if (Math.abs(dy) > LOCK_PX) {
        drag = null;
        return;
      } else {
        return;
      }
    }
    const width = widthOf(drag.row);
    // Passa um pouco do limite com resistência (como no iPhone).
    let offset = drag.base + dx;
    if (offset < -width) offset = -width - (Math.min(-offset - width, 80) * 0.35);
    drag.offset = Math.min(0, offset);
    setOffset(drag.row, drag.offset, false);
  }, { passive: true });

  const end = () => {
    if (!drag) return;
    const { row, locked, offset } = drag;
    drag = null;
    if (locked !== 'h') return;
    row.classList.remove('is-swiping');
    swallowClick = true;
    setTimeout(() => { swallowClick = false; }, 400);
    if (offset < -widthOf(row) * 0.4) openSwipe(row);
    else closeSwipe(row);
  };
  document.addEventListener('pointerup', end, { passive: true });
  document.addEventListener('pointercancel', end, { passive: true });

  // Depois de arrastar, o clique não abre o livro; com a linha aberta, tocar nela só fecha.
  document.addEventListener('click', (e) => {
    const row = e.target.closest?.('[data-swipe]');
    if (swallowClick && row && !e.target.closest('.swipe-actions')) {
      swallowClick = false;
      e.preventDefault();
      e.stopPropagation();
      return;
    }
    if (openRow && row === openRow && !e.target.closest('.swipe-actions')) {
      e.preventDefault();
      e.stopPropagation();
      closeSwipe(openRow);
    }
  }, true);
}
