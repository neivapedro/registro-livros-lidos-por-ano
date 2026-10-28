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

// ---------- Livro concluído (v1.5) ----------
// Ao voltar ao Início depois de concluir um livro: o número de lidos sobe um, a capa "salta"
// para o lugar dela na grade de Lidos e um confete discreto (~1,2 s) sai dela, nas cores do
// destaque e da capa. Só com movimento (sem ele fica o toast de sempre). Nada aqui recebe
// toque (pointer-events: none) e tudo o que é criado sai da página ao terminar.

const CONFETTI_MS = 1200;
const POP_MS = 640;

const wait = (ms) => new Promise((resolve) => { setTimeout(resolve, ms); });

/** Conta de from até to no elemento; no fim volta o texto que já estava nele. */
function tickNumber(el, from, to, duration = 700) {
  const final = el.textContent;
  const fmt = new Intl.NumberFormat('pt-BR');
  const start = performance.now();
  const step = (now) => {
    if (!el.isConnected) return;
    const t = Math.min(1, (now - start) / duration);
    el.textContent = t < 1 ? fmt.format(Math.round(from + (to - from) * ease(t))) : final;
    if (t < 1) requestAnimationFrame(step);
  };
  el.textContent = fmt.format(from);
  requestAnimationFrame(step);
}

/** Anel da meta: o arco cresce do valor de antes até o de agora e o número sobe um. */
function tickRing(root) {
  const count = root.querySelector('.ring-count');
  const to = Number(count?.dataset.count);
  if (!count || !(to >= 1)) return;
  tickNumber(count, to - 1, to);
  const arc = root.querySelector('.ring-progress');
  const dash = arc?.getAttribute('stroke-dasharray')?.trim().split(/\s+/).map(Number);
  if (arc && dash?.length === 2 && dash.every(Number.isFinite)) {
    const before = (dash[0] * (to - 1)) / to;
    arc.animate([{ strokeDasharray: `${before} ${dash[1]}` }, { strokeDasharray: `${dash[0]} ${dash[1]}` }], { duration: 800, easing: 'cubic-bezier(.2, .8, .2, 1)' });
  }
  root.querySelector('.ring-center')?.animate([
    { transform: 'scale(1)' }, { transform: 'scale(1.14)', offset: 0.45 }, { transform: 'scale(1)' },
  ], { duration: 520, delay: 420, easing: 'ease-out' });
}

/** "#D08C4F" (ou "#abc") → [r, g, b]; null se não for hexadecimal. */
function parseHex(value) {
  const hex = String(value || '').trim().replace(/^#/, '');
  const full = /^[0-9a-f]{3}$/i.test(hex) ? [...hex].map((c) => c + c).join('') : hex;
  if (!/^[0-9a-f]{6}$/i.test(full)) return null;
  const n = parseInt(full, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** [r, g, b] misturado com branco (p = quanto fica da cor, 0 a 1), como "rgb(r g b)". */
function towardWhite(rgb, p) {
  return `rgb(${rgb.map((v) => Math.round(v * p + 255 * (1 - p))).join(' ')})`;
}

/**
 * Cores do confete: o destaque, a cor da capa clareada e versões claras dos dois. Calculadas
 * aqui (rgb simples), não com color-mix(): no iOS 16.0/16.1 color-mix não existe e as peças
 * ficariam sem cor. accent: "#RRGGBB" (o --accent); tint: "r g b" (cover-color.js tintFor).
 */
export function confettiColors(accent, tint) {
  const acc = parseHex(accent);
  const cover = String(tint || '').trim().split(/\s+/).map(Number);
  const hasCover = cover.length === 3 && cover.every((v) => Number.isFinite(v) && v >= 0 && v <= 255);
  const colors = [acc ? `rgb(${acc.join(' ')})` : 'currentColor'];
  if (hasCover) colors.push(towardWhite(cover, 0.82));
  if (acc) colors.push(towardWhite(acc, 0.5));
  if (hasCover) colors.push(towardWhite(cover, 0.45));
  return colors;
}

/** Confete saindo do ponto (x, y) da tela, nas cores dadas (CSS). Devolve a camada (some sozinha). */
export function confettiBurst(x, y, colors, { pieces = 22 } = {}) {
  const layer = document.createElement('div');
  layer.className = 'confetti';
  layer.setAttribute('aria-hidden', 'true');
  const anims = [];
  for (let i = 0; i < pieces; i += 1) {
    const bit = document.createElement('i');
    const round = i % 3 === 0;
    const w = round ? 6 : 5 + Math.random() * 3;
    const h = round ? 6 : 9 + Math.random() * 4;
    bit.style.cssText = `left:${(x - w / 2).toFixed(1)}px;top:${(y - h / 2).toFixed(1)}px;width:${w.toFixed(1)}px;height:${h.toFixed(1)}px;background:${colors[i % colors.length]}${round ? ';border-radius:50%' : ''}`;
    layer.append(bit);
    // Leque para cima (de -165° a -15°); depois cai com a "gravidade" e some.
    const angle = (-165 + Math.random() * 150) * (Math.PI / 180);
    const dist = 56 + Math.random() * 84;
    const dx = Math.cos(angle) * dist;
    const dy = Math.sin(angle) * dist;
    const spin = (Math.random() < 0.5 ? -1 : 1) * (180 + Math.random() * 360);
    const fall = 90 + Math.random() * 40;
    // Uma curva por trecho (sai rápido, para no alto, cai acelerando); só some no fim.
    anims.push(bit.animate([
      { transform: 'translate(0, 0) rotate(0deg) scale(.4)', opacity: 1, easing: 'cubic-bezier(.15, .85, .3, 1)' },
      { transform: `translate(${dx}px, ${dy}px) rotate(${spin / 2}deg) scale(1)`, opacity: 1, offset: 0.38, easing: 'cubic-bezier(.45, 0, .85, .55)' },
      { transform: `translate(${dx * 1.1}px, ${dy + fall * 0.45}px) rotate(${spin * 0.8}deg) scale(.95)`, opacity: 1, offset: 0.72 },
      { transform: `translate(${dx * 1.18}px, ${dy + fall}px) rotate(${spin}deg) scale(.9)`, opacity: 0 },
    ], { duration: CONFETTI_MS * (0.85 + Math.random() * 0.15), fill: 'forwards' }));
  }
  document.body.append(layer);
  // Sai da página mesmo que alguma animação não avise o fim (app em segundo plano).
  const done = () => layer.remove();
  setTimeout(done, CONFETTI_MS + 300);
  Promise.all(anims.map((a) => a.finished)).then(done, done);
  return layer;
}

/** A capa do livro na grade "Lidos em …" do Início (null se ele não aparece lá). */
function gridCoverOf(root, id) {
  const href = `#/livro/${encodeURIComponent(id)}`;
  return [...root.querySelectorAll('.grid-book')].find((a) => a.getAttribute('href') === href)?.querySelector('.grid-cover') || null;
}

/** O retângulo cabe na parte livre da tela (abaixo da barra compacta, acima da barra de baixo)? */
function inView(r) {
  return r.top >= 56 && r.bottom <= window.innerHeight - 96;
}

/**
 * Comemoração do livro concluído (main.js chama ao desenhar o Início). id: o livro;
 * colors: cores do confete (lista ou promessa de lista); tick: anima o número de lidos (não quando a animação de abertura
 * já está contando); big: um marco novo (mais confete). Termina quando a festa acaba;
 * devolve false se não houve (sem movimento, ou a tela mudou antes).
 */
export async function celebrateFinish(root, { id, colors = [], tick = true, big = false } = {}) {
  if (!prefersMotion() || typeof Element.prototype.animate !== 'function') return false;
  if (tick) tickRing(root);
  const target = gridCoverOf(root, id);
  let origin;
  if (target) {
    let delay = 260;
    // Fora da vista: rola (suave) até a capa antes de ela aparecer.
    if (!inView(target.getBoundingClientRect())) {
      target.scrollIntoView({ block: 'center', behavior: 'smooth' });
      delay = 640;
    }
    target.style.setProperty('--cel-delay', `${delay}ms`);
    target.classList.add('is-celebrated');
    target.animate([
      { transform: 'translateY(18px) scale(.55)', opacity: 0 },
      { transform: 'translateY(-4px) scale(1.08)', opacity: 1, offset: 0.62 },
      { transform: 'none', opacity: 1 },
    ], { duration: POP_MS, delay, easing: 'cubic-bezier(.2, .8, .2, 1)', fill: 'backwards' });
    // O brilho em volta da capa (CSS) se apaga sozinho; a classe sai depois dele.
    setTimeout(() => target.classList.remove('is-celebrated'), delay + 1600);
    await wait(delay + POP_MS * 0.45);
    if (!target.isConnected) return false;
    const box = target.getBoundingClientRect();
    origin = [box.left + box.width / 2, box.top + box.height * 0.4];
  } else {
    // Livro fora da grade (só os 6 mais recentes aparecem): o confete sai do anel da meta.
    const ring = root.querySelector('.bento-ring .ring');
    if (!ring) return false;
    await wait(420);
    if (!ring.isConnected) return false;
    const box = ring.getBoundingClientRect();
    origin = [box.left + box.width / 2, box.top + box.height / 2];
  }
  const palette = await colors;
  confettiBurst(origin[0], origin[1], palette?.length ? palette : ['currentColor'], { pieces: big ? 34 : 22 });
  await wait(CONFETTI_MS + 320);
  return true;
}
