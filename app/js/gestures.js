// Contas dos gestos nativos da 1.6, sem DOM (testadas em tests/gestos-v16.test.js):
// voltar deslizando da borda, barra de baixo que encolhe ao rolar, folhas em dois tamanhos
// (média e grande) e a posição do menu com prévia (capa levantada + lista de ações).
// Velocidades em px/ms; distâncias em px de CSS.

/** Faixa da borda esquerda onde o dedo começa o "voltar" (como no iPhone). */
export const EDGE_PX = 24;
/** Quanto o dedo anda antes de decidir se o gesto é na horizontal ou na vertical. */
export const LOCK_PX = 8;

/** O toque começou na faixa da borda esquerda? */
export function isEdgeStart(x, edge = EDGE_PX) {
  return Number.isFinite(x) && x >= 0 && x <= edge;
}

/**
 * Direção do gesto depois de alguns px: 'x' (horizontal), 'y' (vertical) ou null (ainda não
 * deu para saber). Na dúvida (diagonal), é rolagem: a vertical nunca trava.
 */
export function lockAxis(dx, dy, lock = LOCK_PX) {
  const ax = Math.abs(dx);
  const ay = Math.abs(dy);
  if (ax < lock && ay < lock) return null;
  return ax > ay * 1.2 ? 'x' : 'y';
}

/**
 * Velocidade (px/ms) dos últimos ~100 ms de amostras [{ v, t }] (v = posição, t = ms).
 * Poucas amostras ou tempo zero: 0.
 */
export function velocityOf(samples, windowMs = 100) {
  if (!Array.isArray(samples) || samples.length < 2) return 0;
  const last = samples[samples.length - 1];
  let first = samples[samples.length - 2];
  for (let i = samples.length - 2; i >= 0; i -= 1) {
    if (last.t - samples[i].t > windowMs) break;
    first = samples[i];
  }
  const dt = last.t - first.t;
  return dt > 0 ? (last.v - first.v) / dt : 0;
}

/**
 * Soltou o dedo no "voltar": navega (true) ou a tela volta para o lugar (false)?
 * Passou de 35% da largura, ou foi um gesto rápido para a direita; jogar de volta cancela.
 */
export function edgeBackCommit({ dx, width, velocity = 0 }) {
  if (!(dx > 0) || !(width > 0)) return false;
  if (velocity < -0.3) return false;
  if (velocity > 0.5 && dx > 30) return true;
  return dx > width * 0.35;
}

/** Quanto da tela já saiu (0 a 1), para escurecer/deslocar o fundo junto. */
export function edgeProgress(dx, width) {
  if (!(width > 0)) return 0;
  return Math.min(1, Math.max(0, dx / width));
}

/** Duração (ms) do fim da animação: mais rápida se o dedo vinha rápido. */
export function settleDuration(distance, velocity = 0, { min = 140, max = 320 } = {}) {
  const d = Math.abs(distance);
  const v = Math.max(Math.abs(velocity), 1.1);
  return Math.round(Math.min(max, Math.max(min, d / v)));
}

// ---------- Barra de baixo que encolhe ----------

/**
 * Próximo estado da barra de baixo a cada rolagem. state = { compact, anchor }:
 * anchor é o ponto onde a direção atual começou. Rolar para baixo mais de `delta` px
 * (passado o `top`) encolhe; rolar para cima mais de `delta` px, chegar ao alto ou ao fim
 * da página, expande. maxY = altura rolável (scrollHeight − altura da janela).
 */
export function navShrinkStep(state, { y, maxY }, { top = 96, delta = 14, bottomGap = 4 } = {}) {
  const prev = state || { compact: false, anchor: 0 };
  if (!Number.isFinite(y)) return prev;
  // Página curta (quase sem rolagem), no alto ou no fim: inteira.
  if (y <= top || (Number.isFinite(maxY) && (maxY <= top * 2 || y >= maxY - bottomGap))) return { compact: false, anchor: y };
  if (!prev.compact) {
    if (y - prev.anchor > delta) return { compact: true, anchor: y };
    // Subindo (ou parado): o ponto de partida acompanha o mais alto.
    return { compact: false, anchor: Math.min(prev.anchor, y) };
  }
  if (prev.anchor - y > delta) return { compact: false, anchor: y };
  return { compact: true, anchor: Math.max(prev.anchor, y) };
}

// ---------- Folhas em dois tamanhos ----------

export const DETENT_MEDIUM = 0.55;
export const DETENT_LARGE = 0.92;

/**
 * Alturas da folha: [média, grande] se o conteúdo não cabe na média; null se cabe
 * (a folha fica do tamanho do conteúdo, como antes). natural = altura do conteúdo inteiro;
 * viewport = altura da janela. A grande nunca passa do conteúdo.
 */
export function sheetDetents({ natural, viewport, medium = DETENT_MEDIUM, large = DETENT_LARGE, slack = 24 }) {
  if (!(natural > 0) || !(viewport > 0)) return null;
  const m = Math.round(viewport * medium);
  if (natural <= m + slack) return null;
  const l = Math.max(m, Math.min(Math.round(viewport * large), Math.ceil(natural)));
  return l - m < slack ? null : [m, l];
}

/**
 * Altura da folha enquanto o dedo arrasta: passa da maior com resistência (no máximo `stretch` px).
 * Abaixo da menor, a folha desce (a diferença vira translateY, veja sheetOffset).
 */
export function dragHeight(height, detents, stretch = 36) {
  const max = detents[detents.length - 1];
  if (height <= max) return height;
  return max + Math.min(stretch, (height - max) * 0.3);
}

/**
 * Onde a folha para ao soltar: uma das alturas de `detents` (crescente) ou 0 (fecha).
 * height = altura que o dedo deixou; velocity > 0 = descendo.
 * Abaixo da menor: fecha se desceu mais que min(120, 30%) ou rápido; senão volta à menor.
 * Entre as alturas: rápido vai para a próxima na direção do gesto; devagar, para a mais próxima.
 */
export function snapDetent({ height, velocity = 0, detents }) {
  const list = [...detents].sort((a, b) => a - b);
  const lowest = list[0];
  if (height <= lowest) {
    const drop = lowest - height;
    if (drop > Math.min(120, lowest * 0.3) || (velocity > 0.5 && drop > 30)) return 0;
    return lowest;
  }
  if (velocity > 0.5) return [...list].reverse().find((d) => d < height) ?? lowest;
  if (velocity < -0.5) return list.find((d) => d >= height) ?? list[list.length - 1];
  return list.reduce((best, d) => (Math.abs(d - height) < Math.abs(best - height) ? d : best), lowest);
}

// ---------- Menu com prévia ----------

/**
 * Posição da capa levantada e do menu (tudo em px da janela).
 * src: retângulo do item na tela { left, top, width, height }; preview: { w, h } da capa
 * (tamanho cheio); menu: { w, h }; view: { w, h, top, bottom } (top/bottom = áreas seguras).
 * O menu fica embaixo da capa, ou em cima se o item está na parte de baixo da tela; a capa
 * encolhe (scale) se as duas coisas não cabem; o menu alinha pela borda da capa mais perto
 * do meio e nunca sai da tela.
 */
export function placeContextMenu({ src, preview, menu, view, gap = 12, margin = 12 }) {
  const minY = (view.top || 0) + margin;
  const maxY = view.h - (view.bottom || 0) - margin;
  const room = maxY - minY;
  let scale = 1;
  if (preview.h + gap + menu.h > room) scale = Math.max(0.35, (room - gap - menu.h) / preview.h);
  const pw = preview.w * scale;
  const ph = preview.h * scale;
  const total = Math.min(room, ph + gap + menu.h);
  const cx = src.left + src.width / 2;
  const cy = src.top + src.height / 2;
  const px = Math.min(Math.max(cx - pw / 2, margin), view.w - margin - pw);
  const above = cy > minY + room * 0.58;
  let py;
  let my;
  if (above) {
    // Menu em cima, capa embaixo (perto de onde estava).
    const blockTop = Math.min(Math.max(cy + ph / 2 - total, minY), maxY - total);
    my = blockTop;
    py = blockTop + Math.min(menu.h, room - ph - gap) + gap;
  } else {
    const blockTop = Math.min(Math.max(cy - ph / 2, minY), maxY - total);
    py = blockTop;
    my = blockTop + ph + gap;
  }
  const mw = Math.min(menu.w, view.w - margin * 2);
  const alignLeft = px + pw / 2 <= view.w / 2;
  const mx = Math.min(Math.max(alignLeft ? px : px + pw - mw, margin), view.w - margin - mw);
  const mh = Math.min(menu.h, room - ph - gap);
  const r = (v) => Math.round(v * 10) / 10;
  return { placement: above ? 'above' : 'below', scale: Math.round(scale * 1000) / 1000, preview: { x: r(px), y: r(py), w: r(pw), h: r(ph) }, menu: { x: r(mx), y: r(my), w: r(mw), h: r(mh) } };
}
