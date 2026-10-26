// Curva S da meta (Resumo → Visão geral): previsto × realizado acumulados por mês,
// como no cronograma físico de uma obra. SVG puro, em escala, com os rótulos dentro do desenho.

import { monthName } from '../dates.js';
import { getPageGoal } from '../store.js';
import { curveAmount, curveText, sCurves } from '../trend.js';
import { esc } from '../ui.js';

const W = 300;
const H = 172;
const TOP = 22;
const BOTTOM = H - 24;
const FONT = 11.5;
const CHAR = 6.7; // largura média de um algarismo em FONT (Manrope), para reservar espaço
const MONTH_INITIALS = ['J', 'F', 'M', 'A', 'M', 'J', 'J', 'A', 'S', 'O', 'N', 'D'];

/** Passo "redondo" do eixo y (1, 2, 5 × 10ⁿ), com uns 3 intervalos. */
export function niceStep(max, kind) {
  const raw = Math.max(max, 1) / 3;
  const p = 10 ** Math.floor(Math.log10(raw));
  const m = raw / p;
  const s = (m <= 1 ? 1 : m <= 2 ? 2 : m <= 5 ? 5 : 10) * p;
  return kind === 'livros' ? Math.max(1, Math.round(s)) : s;
}

/** Rótulo do eixo: "15", "2k", "1,5k". */
function axisLabel(v, kind) {
  if (kind !== 'paginas' || v < 1000) return String(Math.round(v));
  const k = v / 1000;
  return `${k.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}k`;
}

function pathOf(points, xOf, yOf) {
  return points.map((p, i) => `${i ? 'L' : 'M'}${xOf(p.x).toFixed(1)} ${yOf(p.v).toFixed(1)}`).join(' ');
}

/** Valores de um mês tocado: realizado (null se o mês ainda não chegou) e previsto no fim do mês. */
export function monthValues(c, m) {
  const curMonth = c.isCurrent ? Math.floor(c.today.x - 1e-9) : 11;
  let real = null;
  if (c.isPast || (c.isCurrent && m < curMonth)) real = c.cumulative[m];
  else if (c.isCurrent && m === curMonth) real = c.realized;
  return { real, planned: c.planned ? c.planned[m + 1] : null, isNow: c.isCurrent && m === curMonth };
}

/**
 * Número do realizado junto do ponto de hoje, no lado vazio: abaixo do previsto, o rótulo vai
 * para baixo e à direita (a linha do previsto passa por cima); à frente, para cima e à esquerda.
 */
function valueLabel(x, y, c) {
  const below = c.goal && c.deviation < 0;
  const nearEnd = c.today.x > 10.6;
  const anchor = below && !nearEnd ? 'start' : 'end';
  const dx = anchor === 'start' ? 8 : -8;
  return `<text class="sc-val" x="${(x + dx).toFixed(1)}" y="${(below ? y + 18 : y - 9).toFixed(1)}" text-anchor="${anchor}">${esc(curveAmount(c.kind, c.realized))}</text>`;
}

/** O desenho. sel: mês tocado (0 a 11) ou null. */
export function sCurveSvg(c, year, sel = null) {
  const k = c.kind;
  const projEnd = c.projection ? c.projection.to.v : 0;
  const top = Math.max(c.goal || 0, c.realized, projEnd, 1);
  const step = niceStep(top, k);
  const yMax = Math.ceil(top / step) * step;
  const ticks = [];
  for (let v = 0; v <= yMax + 1e-9; v += step) ticks.push(v);
  const yLabelW = Math.max(...ticks.map((t) => axisLabel(t, k).length)) * CHAR;
  const L = Math.ceil(yLabelW + 8);
  const endLabels = [c.goal ? curveAmount(k, c.goal) : '', c.projection ? `~${curveAmount(k, k === 'paginas' ? projEnd : Math.round(projEnd))}` : '',
    c.isCurrent ? '' : curveAmount(k, c.realized)];
  const R = W - Math.ceil(Math.max(...endLabels.map((s) => s.length), 1) * CHAR + 8);
  const xOf = (x) => L + (x / 12) * (R - L);
  const yOf = (v) => BOTTOM - (v / yMax) * (BOTTOM - TOP);

  const grid = ticks.map((t) => `<line class="${t ? 'sc-grid' : 'sc-base'}" x1="${L}" x2="${R}" y1="${yOf(t).toFixed(1)}" y2="${yOf(t).toFixed(1)}"/>`
    + `<text class="sc-ylab" x="${L - 7}" y="${(yOf(t) + FONT * 0.35).toFixed(1)}" text-anchor="end">${axisLabel(t, k)}</text>`).join('');
  const curMonth = c.isCurrent ? Math.floor(c.today.x - 1e-9) : -1;
  const months = MONTH_INITIALS.map((m, i) => `<text class="sc-xlab${i === curMonth ? ' is-now' : ''}${i === sel ? ' is-sel' : ''}" x="${xOf(i + 0.5).toFixed(1)}" y="${H - 7}" text-anchor="middle">${m}</text>`).join('');

  const planned = c.planned
    ? `<path class="sc-planned" d="${pathOf(c.planned.map((v, x) => ({ x, v })), xOf, yOf)}"/>` : '';
  const line = pathOf(c.actual, xOf, yOf);
  const last = c.actual[c.actual.length - 1];
  const area = c.actual.length > 1
    ? `<path class="sc-area" d="${line} L${xOf(last.x).toFixed(1)} ${BOTTOM} L${xOf(0)} ${BOTTOM} Z" fill="url(#sc-fill-${k})"/>` : '';
  const proj = c.projection
    ? `<path class="sc-proj" d="M${xOf(c.projection.from.x).toFixed(1)} ${yOf(c.projection.from.v).toFixed(1)} L${xOf(12).toFixed(1)} ${yOf(projEnd).toFixed(1)}"/>` : '';

  // Rótulos diretos na ponta direita: meta (previsto) e projeção; se ficarem colados, afasta.
  const labels = [];
  if (c.goal) labels.push({ y: yOf(c.goal), text: endLabels[0], cls: 'sc-end-planned' });
  if (c.projection) labels.push({ y: yOf(projEnd), text: endLabels[1], cls: 'sc-end-proj' });
  if (!c.isCurrent && c.actual.length > 1) labels.push({ y: yOf(c.realized), text: endLabels[2], cls: 'sc-end-real' });
  labels.sort((a, b) => a.y - b.y);
  for (let i = 1; i < labels.length; i += 1) {
    if (labels[i].y - labels[i - 1].y < FONT + 1) labels[i].y = labels[i - 1].y + FONT + 1;
  }
  const ends = labels.map((l) => `<text class="${l.cls}" x="${R + 6}" y="${(Math.min(l.y, BOTTOM) + FONT * 0.35).toFixed(1)}">${esc(l.text)}</text>`).join('');

  let today = '';
  if (c.isCurrent) {
    const x = xOf(c.today.x).toFixed(1);
    const y = yOf(c.realized);
    const anchor = c.today.x > 10.5 ? 'end' : c.today.x < 1 ? 'start' : 'middle';
    today = `
      <line class="sc-today" x1="${x}" x2="${x}" y1="${TOP - 4}" y2="${BOTTOM}"/>
      <text class="sc-today-lab" x="${x}" y="${TOP - 9}" text-anchor="${anchor}">hoje</text>
      <circle class="sc-dot" cx="${x}" cy="${y.toFixed(1)}" r="5"/>
      ${valueLabel(Number(x), y, c)}`;
  } else if (c.actual.length > 1) {
    today = `<circle class="sc-dot" cx="${xOf(12).toFixed(1)}" cy="${yOf(c.realized).toFixed(1)}" r="5"/>`;
  }

  let selMark = '';
  if (sel !== null && sel >= 0 && sel <= 11) {
    const v = monthValues(c, sel);
    const x = xOf(sel === curMonth ? c.today.x : sel + 1).toFixed(1);
    selMark = `<line class="sc-sel" x1="${x}" x2="${x}" y1="${TOP}" y2="${BOTTOM}"/>`
      + (v.planned !== null ? `<circle class="sc-sel-planned" cx="${xOf(sel + 1).toFixed(1)}" cy="${yOf(v.planned).toFixed(1)}" r="3.5"/>` : '')
      + (v.real !== null ? `<circle class="sc-sel-real" cx="${x}" cy="${yOf(v.real).toFixed(1)}" r="4.5"/>` : '');
  }

  const t = curveText(c);
  const aria = `Curva S de ${year}: ${c.goal ? `${curveAmount(k, c.realized)} de ${curveAmount(k, c.goal)} ${k === 'paginas' ? 'páginas' : 'livros'}` : `${curveAmount(k, c.realized)} ${k === 'paginas' ? 'páginas' : 'livros'}`}. ${t.headline}. ${t.detail}`;
  return `
    <svg class="sc-svg" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(aria)}" data-curve data-year="${year}"
      data-left="${L}" data-right="${R}" data-width="${W}">
      <defs>
        <linearGradient id="sc-fill-${k}" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" class="sc-fill-top"/><stop offset="1" class="sc-fill-bottom"/>
        </linearGradient>
      </defs>
      ${grid}${months}${selMark}${planned}${area}
      <path class="sc-line" d="${line}" pathLength="1"/>
      ${proj}${ends}${today}
    </svg>`;
}

/** Mês sob o toque (0 a 11), pelas medidas gravadas no desenho. */
export function curveMonthAt(svg, clientX) {
  const r = svg.getBoundingClientRect();
  const scale = r.width / Number(svg.dataset.width);
  const L = Number(svg.dataset.left) * scale;
  const R = Number(svg.dataset.right) * scale;
  const x = clientX - r.left;
  if (x < L - 12 * scale || x > R + 12 * scale) return null;
  return Math.max(0, Math.min(11, Math.floor(((x - L) / (R - L)) * 12)));
}

function readout(c, sel) {
  if (sel === null || sel === undefined) return '<p class="sc-readout muted small" aria-live="polite">Toque num mês para ver os números.</p>';
  const v = monthValues(c, sel);
  const k = c.kind;
  const name = `${monthName(sel)}${v.isNow ? ' (até hoje)' : ''}`;
  const parts = [];
  if (v.real !== null) parts.push(`realizado <strong>${curveAmount(k, v.real)}</strong>`);
  if (v.planned !== null) parts.push(`previsto <strong>${curveAmount(k, v.isNow ? c.plannedNow : v.planned)}</strong>`);
  if (!parts.length) parts.push('sem previsto');
  return `<p class="sc-readout is-on" aria-live="polite"><span class="strong-ish">${name}</span> · ${parts.join(' · ')}</p>`;
}

function toggle(mode, year) {
  const btn = (value, label) => `<button type="button" class="seg-btn${mode === value ? ' is-on' : ''}" data-action="curve-mode" data-mode="${value}" data-year="${year}" aria-pressed="${mode === value}">${label}</button>`;
  return `<div class="segmented seg-mini" style="--seg-count:2" role="group" aria-label="Curva de">${btn('livros', 'Livros')}${btn('paginas', 'Páginas')}</div>`;
}

/**
 * Cartão da curva S. Livros sempre; Páginas quando há meta de páginas ou páginas lidas no ano
 * (sem meta, a curva de páginas mostra só o realizado e o ritmo, sem previsto).
 */
export function sCurveCard({ state, ui, year, today, goal }) {
  const pageGoal = getPageGoal(state, year);
  const curves = sCurves(state.books, year, { goal, pageGoal }, today);
  const canPages = Boolean(pageGoal) || curves.paginas.realized > 0;
  const mode = canPages && ui.curve === 'paginas' ? 'paginas' : 'livros';
  const c = curves[mode];
  const sel = ui.curveMonth?.year === year ? ui.curveMonth.month : null;
  const t = curveText(c);
  const legend = [
    '<span class="sc-key"><span class="sc-swatch sc-key-real"></span>Realizado</span>',
    c.planned ? '<span class="sc-key"><span class="sc-swatch sc-key-planned"></span>Previsto</span>' : '',
    c.projection ? '<span class="sc-key"><span class="sc-swatch sc-key-proj"></span>Projeção</span>' : '',
  ].join('');
  const hint = mode === 'paginas' && !pageGoal
    ? '<p class="muted small">Sem meta de páginas: defina uma em <a href="#/ajustes">Ajustes</a> para ver o previsto.</p>' : '';
  return `
    <section class="card sc-card">
      <div class="section-head sc-head">
        <h2>Meta acumulada</h2>
        ${canPages ? toggle(mode, year) : ''}
      </div>
      ${sCurveSvg(c, year, sel)}
      <div class="sc-legend" aria-hidden="true">${legend}</div>
      ${readout(c, sel)}
      <div class="sc-text">
        <span class="sc-headline">${esc(t.headline)}</span>
        ${t.detail ? `<span class="muted small">${esc(t.detail)}</span>` : ''}
      </div>
      ${hint}
    </section>`;
}
