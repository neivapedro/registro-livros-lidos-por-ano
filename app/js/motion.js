// Movimento da primeira abertura do Início: o anel da meta enche e os números contam
// até o valor. Só com prefers-reduced-motion: no-preference; sem isso, tudo já aparece pronto.
// O texto final já está no HTML: a animação só reescreve o número durante ~0,9 s.

const DURATION = 900;

export function prefersMotion() {
  return Boolean(window.matchMedia?.('(prefers-reduced-motion: no-preference)').matches);
}

const ease = (t) => 1 - (1 - t) ** 3;

/** Anima os [data-count] (com data-decimals opcional) e marca a tela para a animação do anel. */
export function introMotion(root) {
  if (!prefersMotion()) return;
  const els = [...root.querySelectorAll('[data-count]')];
  root.querySelector('.bento')?.classList.add('is-intro');
  if (!els.length) return;
  const items = els.map((el) => {
    const decimals = Number(el.dataset.decimals) || 0;
    const fmt = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
    return { el, to: Number(el.dataset.count) || 0, fmt, final: el.textContent };
  });
  const start = performance.now();
  const step = (now) => {
    const t = Math.min(1, (now - start) / DURATION);
    for (const it of items) {
      if (!it.el.isConnected) continue;
      it.el.textContent = t < 1 ? it.fmt.format(it.to * ease(t)) : it.final;
    }
    if (t < 1) requestAnimationFrame(step);
  };
  for (const it of items) it.el.textContent = it.fmt.format(0);
  requestAnimationFrame(step);
}
