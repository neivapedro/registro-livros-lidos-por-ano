// Tocar e segurar (~450 ms) numa capa ou cartão com data-longpress abre o menu rápido.
// O toque normal continua abrindo o livro; arrastar ou rolar a tela cancela.
// Com mouse, o botão direito (contextmenu) faz o mesmo.

export const HOLD_MS = 450;
const MOVE_TOLERANCE = 10;

let press = null;
// O clique que o próprio dedo do gesto ainda vai gerar ao soltar (o iPhone manda um clique
// mesmo depois de segurar). Nessa hora a folha já está aberta: o clique cairia no fundo
// escurecido (fechando o menu na hora) ou num item do menu que subiu sob o dedo.
let swallowClick = false;
let firedAt = 0;

function cancel() {
  if (!press) return;
  clearTimeout(press.timer);
  press.el.classList.remove('is-pressing');
  press = null;
}

/** Liga o gesto. onPress(el) recebe o elemento [data-longpress] (com data-id). */
export function initLongPress(onPress) {
  // Um toque novo (ou o teclado) começa outra interação: o clique dele vale.
  document.addEventListener('pointerdown', () => { swallowClick = false; }, true);
  document.addEventListener('keydown', () => { swallowClick = false; }, true);
  document.addEventListener('pointerdown', (e) => {
    if (e.button !== 0 || e.isPrimary === false) return;
    const el = e.target.closest?.('[data-longpress]');
    // Botões dentro do cartão (Registrar leitura, Concluir, cronômetro) seguem o toque normal.
    if (!el || e.target.closest('button, input, select, .swipe-actions, .rn-actions')) return;
    cancel();
    press = {
      el, x: e.clientX, y: e.clientY,
      timer: setTimeout(() => {
        if (!press || press.el !== el) return;
        el.classList.remove('is-pressing');
        press = null;
        firedAt = Date.now();
        // O dedo sai depois: o clique que vem em seguida (onde quer que caia) é descartado.
        swallowClick = true;
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
    if (!swallowClick) return;
    swallowClick = false;
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
