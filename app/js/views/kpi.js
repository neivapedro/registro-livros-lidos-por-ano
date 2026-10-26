// Indicadores do Resumo (v1.4): mosaico de números com variação e mini-gráfico,
// e o movimento de entrada (números contando e curva desenhando).

import { esc } from '../ui.js';

/** Número formatado como a tela mostra ("4.258", "4,3"). */
export function fmtNumber(n, digits = 0) {
  return n.toLocaleString('pt-BR', { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

/**
 * Mini-gráfico (série mensal acumulada). O eixo x é sempre o ano inteiro (slots = 12 meses):
 * no ano corrente a linha para no mês de hoje. Valores null no começo não são desenhados.
 */
export function sparkline(values, { slots = 12 } = {}) {
  const pts = values.map((v, i) => (v === null || v === undefined ? null : { i, v })).filter(Boolean);
  if (pts.length < 2) return '';
  const W = 100;
  const H = 28;
  const pad = 3;
  const vs = pts.map((p) => p.v);
  let lo = Math.min(...vs);
  let hi = Math.max(...vs);
  if (hi === lo) { hi += 1; lo -= 1; }
  const x = (i) => (i / Math.max(1, slots - 1)) * W;
  const y = (v) => pad + (1 - (v - lo) / (hi - lo)) * (H - pad * 2);
  const line = pts.map((p, k) => `${k ? 'L' : 'M'}${x(p.i).toFixed(1)} ${y(p.v).toFixed(1)}`).join(' ');
  const last = pts[pts.length - 1];
  const area = `${line} L${x(last.i).toFixed(1)} ${H} L${x(pts[0].i).toFixed(1)} ${H} Z`;
  return `
    <svg class="kpi-spark" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" aria-hidden="true" focusable="false">
      <path class="kpi-spark-area" d="${area}"/>
      <path class="kpi-spark-line" d="${line}" vector-effect="non-scaling-stroke"/>
      <path class="kpi-spark-dot" d="M${x(last.i).toFixed(1)} ${y(last.v).toFixed(1)} h0" vector-effect="non-scaling-stroke"/>
    </svg>`;
}

/**
 * Linha da variação: "▲ 2 livros". Cor calma: verde suave quando a mudança é boa,
 * cinza quando não é (nada de vermelho). `text` é o número já escrito; `long` vai para leitores de tela.
 */
export function deltaLine(delta, text, long) {
  if (!delta) return '';
  const arrow = delta.dir === 'up' ? '▲' : delta.dir === 'down' ? '▼' : '=';
  const cls = delta.favorable === true ? ' is-good' : delta.favorable === false ? ' is-calm' : '';
  return `<span class="kpi-delta${cls}"><span aria-hidden="true">${arrow} ${esc(text)}</span><span class="sr-only">${esc(long)}</span></span>`;
}

/**
 * Um bloco do mosaico. value: número (ou null = "—"); digits: casas decimais;
 * of: complemento pequeno ("/ 15"); delta: HTML de deltaLine; spark: HTML de sparkline.
 */
export function kpiTile({ label, value, digits = 0, of = '', delta = '', spark = '', note = '', cls = '' }) {
  const shown = value === null || value === undefined ? '—' : fmtNumber(value, digits);
  const count = shown === '—' ? '' : ` data-count="${value}" data-digits="${digits}"`;
  return `
    <div class="kpi${cls ? ` ${cls}` : ''}">
      <span class="kpi-label">${esc(label)}</span>
      <span class="kpi-value"><span class="kpi-num"${count}>${shown}</span>${of ? `<span class="kpi-of">${esc(of)}</span>` : ''}</span>
      ${delta}
      ${note ? `<span class="kpi-note">${esc(note)}</span>` : ''}
      ${spark}
    </div>`;
}

// ---------- Movimento de entrada ----------

function reducedMotion() {
  return typeof matchMedia !== 'function' || !matchMedia('(prefers-reduced-motion: no-preference)').matches;
}

/**
 * Números contando a partir de zero. O texto real do número não muda (leitores de tela e
 * cópia veem o valor final): o que conta é um ::after por cima, com o texto em data-show.
 */
function countUp(el, duration = 900) {
  const target = Number(el.dataset.count);
  const digits = Number(el.dataset.digits) || 0;
  if (!Number.isFinite(target) || target <= 0) return;
  el.classList.add('is-counting');
  const start = performance.now();
  const step = (now) => {
    const t = Math.min(1, (now - start) / duration);
    const eased = 1 - (1 - t) ** 3;
    el.dataset.show = fmtNumber(target * eased, digits);
    if (t < 1 && el.isConnected) requestAnimationFrame(step);
    else el.classList.remove('is-counting');
  };
  el.dataset.show = fmtNumber(0, digits);
  requestAnimationFrame(step);
}

/**
 * Entrada da página (só na primeira vez que a tela abre e só sem "Reduzir movimento"):
 * os números contam e a curva S se desenha. Sem movimento, a página já nasce completa.
 */
export function playIntro(root) {
  if (reducedMotion()) return;
  root.querySelectorAll('.kpi-num[data-count]').forEach((el) => countUp(el));
  root.querySelectorAll('.sc-svg').forEach((svg) => svg.classList.add('is-intro'));
}
