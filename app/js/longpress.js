// Tocar e segurar (~450 ms) numa capa ou cartão com data-longpress abre o menu rápido.
// O toque normal continua abrindo o livro; arrastar ou rolar a tela cancela.
// Com mouse, o botão direito (contextmenu) faz o mesmo.

export const HOLD_MS = 450;
const MOVE_TOLERANCE = 10;

let press = null;
let suppressClickUntil = 0;
let firedAt = 0;

function cancel() {
  if (!press) return;
  clearTimeout(press.timer);
  press.el.classList.remove('is-pressing');
  press = null;
}

/** Liga o gesto. onPress(el) recebe o elemento [data-longpress] (com data-id). */
export function initLongPress(onPress) {
  document.addEventListener('pointerdown', (e) => {
    if (e.button !== 0 || e.isPrimary === false) return;
    const el = e.target.closest?.('[data-longpress]');
    // Botões dentro do cartão (Registrar leitura, cronômetro) seguem o toque normal.
    if (!el || e.target.closest('button, input, select, .swipe-actions')) return;
    cancel();
    press = {
      el, x: e.clientX, y: e.clientY,
      timer: setTimeout(() => {
        if (!press || press.el !== el) return;
        el.classList.remove('is-pressing');
        press = null;
        firedAt = Date.now();
        // O dedo sai depois: o clique que vem em seguida não abre o livro.
        suppressClickUntil = Date.now() + 800;
        navigator.vibrate?.(8);
        onPress(el);
      }, HOLD_MS),
    };
    el.classList.add('is-pressing');
  });
  document.addEventListener('pointermove', (e) => {
    if (press && Math.hypot(e.clientX - press.x, e.clientY - press.y) > MOVE_TOLERANCE) cancel();
  }, { passive: true });
  for (const type of ['pointerup', 'pointercancel', 'dragstart']) document.addEventListener(type, cancel, { passive: true });
  window.addEventListener('scroll', cancel, { passive: true, capture: true });
  document.addEventListener('click', (e) => {
    if (Date.now() > suppressClickUntil) return;
    suppressClickUntil = 0;
    if (!e.target.closest?.('[data-longpress]')) return;
    e.preventDefault();
    e.stopPropagation();
  }, true);
  // Android dispara contextmenu ao segurar; mouse, no botão direito.
  document.addEventListener('contextmenu', (e) => {
    const el = e.target.closest?.('[data-longpress]');
    if (!el) return;
    e.preventDefault();
    if (Date.now() - firedAt < 1000) return;
    cancel();
    onPress(el);
  });
}
