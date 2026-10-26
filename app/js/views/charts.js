// Gráficos do resumo (notas, tamanho, páginas por mês e por formato),
// comparação entre dois anos e meta de páginas (Início e Ajustes).
// Toque numa barra abre a Buscar já filtrada (ação "chart-filter" em main.js).

import {
  chartFilterLabel, hasChartFilter, lengthDistribution, pageGoalLine, pageGoalProgress, pagesByFormat, pagesByMonth,
  ratingDistribution,
} from '../charts.js';
import { monthInitial, monthName, monthOf, yearOf } from '../dates.js';
import { FORMATS, getGoal, getPageGoal } from '../store.js';
import { yearStats, yearsWithData } from '../stats.js';
import { ratingWindow } from '../trend.js';
import { decimal, esc, formatRating, icon, num, plural } from '../ui.js';

/** Atributos do toque que leva à busca filtrada. */
function tapAttrs(year, kind, value, label) {
  return `data-action="chart-filter" data-year="${year}" data-kind="${kind}" data-value="${esc(value)}" aria-label="${esc(label)}"`;
}

/** "1,2k" para caber em cima de uma barra estreita. */
function compact(n) {
  if (n < 1000) return String(Math.round(n));
  return `${decimal(n / 1000, n < 10000 ? 1 : 0)}k`;
}

// ---------- Livros | Páginas no gráfico mensal ----------

export function monthChartToggle(ui, year) {
  const mode = ui.monthChart === 'paginas' ? 'paginas' : 'livros';
  const btn = (value, label) => `<button type="button" class="seg-btn${mode === value ? ' is-on' : ''}" data-action="month-chart-mode" data-mode="${value}" data-year="${year}" aria-pressed="${mode === value}">${label}</button>`;
  return `<div class="segmented seg-mini" style="--seg-count:2" role="group" aria-label="Mostrar">${btn('livros', 'Livros')}${btn('paginas', 'Páginas')}</div>`;
}

/** Páginas lidas em cada mês (diário, ou o livro inteiro no mês do término quando não há diário). */
export function pagesMonthChart(state, s, today) {
  const months = pagesByMonth(state.books, s.year);
  const goal = getPageGoal(state, s.year);
  const target = goal ? goal / 12 : 0;
  const isCurrent = s.year === yearOf(today);
  const lastMonth = isCurrent ? monthOf(today) : 11;
  const max = Math.max(...months, target, 1) * 1.2;
  const h = 100;
  const bars = months.map((n, i) => {
    const future = i > lastMonth;
    const barH = n ? Math.max(6, Math.round((n / max) * h)) : 4;
    const cls = future ? 'bar future' : !n ? 'bar empty' : !target || n >= target ? 'bar met' : 'bar partial';
    const inner = `<span class="bar-value">${n ? compact(n) : ''}</span><span class="${cls}" style="height:${barH}px"></span><span class="bar-label${i === monthOf(today) && isCurrent ? ' now' : ''}">${monthInitial(i)}</span>`;
    // Leva aos livros concluídos no mês; mês sem livro concluído não abre a busca.
    return s.byMonth[i]
      ? `<button type="button" class="bar-col" ${tapAttrs(s.year, 'month', i, `${monthName(i)}: ${num(n)} páginas. Ver livros concluídos`)}>${inner}</button>`
      : `<div class="bar-col">${inner}<span class="sr-only">${monthName(i)}: ${num(n)} páginas</span></div>`;
  }).join('');
  const line = target ? `<span class="target-line" style="bottom:calc(${Math.round((target / max) * h)}px + 22px)"></span>` : '';
  return `<div class="bars" style="--chart-h:${h}px">${line}${bars}</div>`;
}

export function pagesMonthLegend(state, year) {
  const goal = getPageGoal(state, year);
  return goal
    ? `<span class="legend-target muted small"><span class="dash"></span>${num(goal / 12)}/mês</span>`
    : '<span class="muted small">páginas lidas</span>';
}

// ---------- Formato: uma barra só, com rótulo direto ----------

export function formatCard(state, s) {
  if (!s.count) return '';
  const phys = s.formats[FORMATS.PHYSICAL];
  const kin = s.formats[FORMATS.KINDLE];
  const pages = pagesByFormat(state.books, s.year);
  const pct = (n) => Math.round((n / s.count) * 100);
  const label = (format, side, name, books, pg) => `
    <button type="button" class="fmt-label fmt-${side}" ${tapAttrs(s.year, 'format', format, `${name}: ${plural(books, 'livro', 'livros')}, ${num(pg)} páginas. Ver livros`)}>
      <span class="fmt-name"><span class="dot ${side === 'a' ? 'dot-a' : 'dot-b'}"></span>${name} <span class="fmt-pct">${pct(books)}%</span></span>
      <span class="fmt-detail">${plural(books, 'livro', 'livros')}${pg ? ` · ${num(pg)} págs.` : ''}</span>
    </button>`;
  return `
    <section class="card fmt-card">
      <h2>Formato</h2>
      <div class="fmt-bar" role="img" aria-label="${esc(`${phys} físicos e ${kin} no Kindle`)}">
        ${phys ? `<span class="split-a" style="flex:${phys}"></span>` : ''}${kin ? `<span class="split-b" style="flex:${kin}"></span>` : ''}
      </div>
      <div class="fmt-labels split-legend-tap">
        ${phys ? label(FORMATS.PHYSICAL, 'a', 'Físico', phys, pages[FORMATS.PHYSICAL]) : ''}
        ${kin ? label(FORMATS.KINDLE, 'b', 'Kindle', kin, pages[FORMATS.KINDLE]) : ''}
      </div>
    </section>`;
}

// ---------- Notas (meia em meia estrela; só a faixa usada) ----------

export function ratingChart(s) {
  const rated = s.books.filter((b) => b.rating);
  if (!rated.length) return '';
  const dist = ratingWindow(ratingDistribution(rated));
  const top = Math.max(...dist.map((d) => d.count));
  const h = 72;
  const cols = dist.map((d) => {
    const barH = d.count ? Math.max(6, Math.round((d.count / (top * 1.15)) * h)) : 3;
    const cls = !d.count ? 'bar empty' : d.count === top ? 'bar met' : 'bar partial';
    const inner = `<span class="bar-value">${d.count || ''}</span><span class="${cls}" style="height:${barH}px"></span><span class="bar-label">${formatRating(d.rating)}</span>`;
    return d.count
      ? `<button type="button" class="bar-col" ${tapAttrs(s.year, 'rating', d.rating, `Nota ${formatRating(d.rating)}: ${plural(d.count, 'livro', 'livros')}. Ver livros`)}>${inner}</button>`
      : `<div class="bar-col">${inner}</div>`;
  }).join('');
  return `
    <section class="card">
      <div class="section-head"><h2>Notas</h2><span class="muted small">${icon('star', { size: 12, cls: 'accent' })} ${plural(rated.length, 'livro avaliado', 'livros avaliados')}</span></div>
      <div class="bars bars-rating" style="--chart-h:${h}px;--cols:${dist.length}">${cols}</div>
    </section>`;
}

// ---------- Tamanho dos livros ----------

export function lengthChart(s) {
  if (!s.count) return '';
  const { rows, unknown } = lengthDistribution(s.books);
  const max = Math.max(...rows.map((r) => r.count), 1);
  const top = Math.max(...rows.map((r) => r.count));
  const html = rows.map((r) => {
    const inner = `
      <span class="hbar-head"><span class="strong-ish">${r.label}</span><span class="muted">${plural(r.count, 'livro', 'livros')}</span></span>
      <span class="hbar-track"><span class="hbar-fill${r.count && r.count === top ? ' is-top' : ''}" style="width:${(r.count / max) * 100}%"></span></span>`;
    return r.count
      ? `<button type="button" class="hbar hbar-btn" ${tapAttrs(s.year, 'length', r.key, `${r.label}: ${plural(r.count, 'livro', 'livros')}. Ver livros`)}>${inner}</button>`
      : `<div class="hbar hbar-btn is-empty">${inner}</div>`;
  }).join('');
  const note = unknown ? `<p class="muted small">${plural(unknown, 'livro', 'livros')} sem nº de páginas ${unknown === 1 ? 'ficou' : 'ficaram'} de fora.</p>` : '';
  return `<section class="card"><h2>Tamanho dos livros</h2><div class="hbar-list">${html}</div>${note}</section>`;
}

// ---------- Buscar: chip do filtro vindo do gráfico ----------

export function chartFilterChip(filters) {
  if (!hasChartFilter(filters)) return '';
  return `
    <div class="filter-chip">
      <span class="filter-chip-text">${esc(chartFilterLabel(filters))}</span>
      <button type="button" class="filter-chip-x" data-action="clear-chart-filter" aria-label="Limpar filtro">${icon('close', { size: 16, stroke: 2.2 })}</button>
    </div>`;
}

// ---------- Todos os anos: dois anos lado a lado ----------

/** Anos comparados: os escolhidos, ou o ano atual e o anterior com livros. */
export function compareYearsOf(ui, years) {
  const a = years.includes(ui.compare?.a) ? ui.compare.a : years[0];
  const b = years.includes(ui.compare?.b) ? ui.compare.b : years.find((y) => y !== a) ?? a;
  return { a, b };
}

function yearPick(years, selected, which) {
  const options = years.map((y) => `<option value="${y}"${y === selected ? ' selected' : ''}>${y}</option>`).join('');
  return `<label class="year-pill cmp2-pick"><span class="sr-only">${which === 'a' ? 'Primeiro ano' : 'Segundo ano'}</span><select data-change="compare-${which}">${options}</select>${icon('chevronDown', { size: 16, stroke: 2 })}</label>`;
}

export function yearPairCompare({ state, ui, today }) {
  const years = yearsWithData(state.books, yearOf(today));
  if (years.length < 2) {
    return '<section class="card"><h2>Comparar anos</h2><p class="muted small">A comparação aparece quando houver livros em dois anos.</p></section>';
  }
  const { a, b } = compareYearsOf(ui, years);
  const sa = yearStats(state.books, a, getGoal(state, a), today);
  const sb = yearStats(state.books, b, getGoal(state, b), today);
  const rows = [
    ['Livros', sa.count, sb.count, (n) => num(n)],
    ['Páginas', sa.pages, sb.pages, (n) => num(n)],
    ['Nota média', sa.avgRating, sb.avgRating, (n) => decimal(n)],
    ['Dias por livro', sa.avgDays, sb.avgDays, (n) => num(n)],
  ];
  const cell = (v, max, fmt) => `
    <span class="cmp2-cell">
      <span class="cmp2-value">${v ? fmt(v) : '—'}</span>
      <span class="cmp2-track"><span class="cmp2-fill" style="width:${v && max ? (v / max) * 100 : 0}%"></span></span>
    </span>`;
  const body = rows.map(([label, va, vb, fmt]) => {
    const max = Math.max(va || 0, vb || 0);
    return `<div class="cmp2-row"><span class="cmp2-label muted small">${label}</span>${cell(va, max, fmt)}${cell(vb, max, fmt)}</div>`;
  }).join('');
  return `
    <section class="card cmp2">
      <h2>Comparar anos</h2>
      <div class="cmp2-row cmp2-head"><span class="cmp2-label"></span>${yearPick(years, a, 'a')}${yearPick(years, b, 'b')}</div>
      ${body}
    </section>`;
}

// ---------- Meta de páginas ----------

/** Linha fina no cartão da meta (Início), só quando há meta de páginas no ano. */
export function pageGoalHero(state, stats, today) {
  const goal = getPageGoal(state, stats.year);
  if (!goal) return '';
  const p = pageGoalProgress(stats.pages, goal, stats.year, today);
  return `
    <div class="hero-pages">
      <span class="hero-pages-track" role="img" aria-label="${esc(pageGoalLine(p))}"><span class="hero-pages-fill" style="width:${(p.progress * 100).toFixed(1)}%"></span></span>
      <span class="hero-pages-text">${esc(pageGoalLine(p))}</span>
    </div>`;
}

/** Campo opcional "Meta de páginas em AAAA" (Ajustes). */
export function pageGoalSettings(state, year) {
  const goal = getPageGoal(state, year);
  return `
    <form class="page-goal" data-page-goal-form data-year="${year}" novalidate>
      <label class="stepper-text" for="page-goal-input">
        <span class="strong">Meta de páginas em ${year}</span>
        <span class="muted small">${goal ? `Atual: ${num(goal)} páginas · aparece no Início` : 'Opcional · aparece no Início, junto da meta de livros'}</span>
      </label>
      <div class="page-goal-row">
        <span class="page-goal-field">
          <input id="page-goal-input" type="number" inputmode="numeric" min="1" max="1000000" step="100"
            value="${goal ?? ''}" placeholder="Ex.: 6000" enterkeyhint="done">
          <span class="progress-edit-suffix">págs.</span>
        </span>
        <button type="submit" class="btn-outline">Salvar</button>
        ${goal ? `<button type="button" class="btn-text small" data-action="page-goal-remove" data-year="${year}">Remover</button>` : ''}
      </div>
    </form>`;
}
