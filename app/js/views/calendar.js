// Seção "Calendário" do Resumo do ano: mapa de calor do ano e grade do mês.

import { calendarData, dayDetail, defaultMonth, monthGrid, yearHalves } from '../calendar.js';
import { monthName, yearOf } from '../dates.js';
import { cover, esc, icon, plural } from '../ui.js';

// Medidas do mapa em unidades do SVG (ele estica para a largura do cartão).
// 28 colunas: a maior metade de ano possível (jul–dez começando no domingo).
const CELL = 10;
const GAP = 2;
const STEP = CELL + GAP;
const COLS = 28;
const WIDTH = COLS * STEP - GAP;
const HEIGHT = 7 * STEP - GAP;
const MONTHS_SHORT = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
const WEEKDAYS = ['S', 'T', 'Q', 'Q', 'S', 'S', 'D'];
const WEEKDAY_NAMES = ['segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado', 'domingo'];

// O resumo redesenha a tela inteira a cada toque: guarda o último cálculo.
let memo = { books: null, year: null, data: null };
function dataFor(books, year) {
  if (memo.books !== books || memo.year !== year) memo = { books, year, data: calendarData(books, year) };
  return memo.data;
}

/** Estado da seção (modo, mês e dia tocado); volta ao padrão quando o ano muda. */
export function calendarUi(ui, year, today) {
  if (ui.calendar?.year === year) return ui.calendar;
  return { year, mode: ui.calendar?.mode || 'ano', month: defaultMonth(year, today), day: null };
}

function heatHalf(half, index, data, sel, today, year) {
  const labels = half.monthStarts.map(({ month, week }) => (
    `<span class="hm-month" style="left:${((week * STEP) / WIDTH) * 100}%">${MONTHS_SHORT[month]}</span>`)).join('');
  let cells = '';
  half.weeks.forEach((week, col) => {
    week.forEach((date, row) => {
      if (!date) return;
      const x = col * STEP;
      const y = row * STEP;
      const day = data.days.get(date);
      const level = day ? day.level : 0;
      const future = year === yearOf(today) && date > today ? ' hm-future' : '';
      cells += `<rect x="${x}" y="${y}" width="${CELL}" height="${CELL}" rx="2" class="hm-l${level}${future}" data-date="${date}"/>`;
      if (data.finished.has(date)) cells += `<circle cx="${x + CELL / 2}" cy="${y + CELL / 2}" r="2.2" class="hm-dot"/>`;
      if (date === sel) cells += `<rect x="${x - 1}" y="${y - 1}" width="${CELL + 2}" height="${CELL + 2}" rx="3" class="hm-sel"/>`;
    });
  });
  return `
    <div class="hm-half">
      <div class="hm-months" aria-hidden="true">${labels}</div>
      <svg class="hm-svg" viewBox="-1 -1 ${WIDTH + 2} ${HEIGHT + 2}" data-heatmap data-year="${year}" data-half="${index}"
        role="img" aria-label="Dias com leitura de ${index ? 'julho a dezembro' : 'janeiro a junho'}">${cells}</svg>
    </div>`;
}

function heatmap(data, sel, today, year) {
  const [a, b] = yearHalves(year);
  return `
    <div class="heatmap">
      ${heatHalf(a, 0, data, sel, today, year)}
      ${heatHalf(b, 1, data, sel, today, year)}
      <div class="hm-legend muted small" aria-hidden="true">
        <span class="hm-scale">menos <i class="hm-key hm-l0"></i><i class="hm-key hm-l1"></i><i class="hm-key hm-l2"></i><i class="hm-key hm-l3"></i><i class="hm-key hm-l4"></i> mais</span>
        <span class="hm-scale"><i class="hm-key hm-l0 hm-key-dot"></i> livro concluído</span>
      </div>
    </div>`;
}

// Marcador de "Abandonei": um círculo cortado (sem ícone novo em ui.js).
const DROP_MARK = '<svg class="cal-drop" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="8"/><path d="M6.5 17.5l11-11"/></svg>';

function monthView(data, cal, today, year) {
  const m = cal.month;
  const grid = monthGrid(year, m);
  const head = WEEKDAYS.map((d, i) => `<span class="cal-wd" title="${WEEKDAY_NAMES[i]}">${d}</span>`).join('');
  const cells = grid.flat().map((date) => {
    if (!date) return '<span class="cal-cell is-out"></span>';
    const finished = data.finished.get(date) || [];
    const dropped = data.dropped.get(date) || [];
    const read = data.days.has(date);
    const cls = ['cal-cell', read ? 'has-read' : '', date === today ? 'is-today' : '', date === cal.sel ? 'is-sel' : '', finished.length ? 'has-book' : '']
      .filter(Boolean).join(' ');
    const label = [`${Number(date.slice(8))} de ${monthName(m).toLowerCase()}`,
      read ? 'leitura registrada' : '',
      finished.length ? `concluiu ${finished.map((b) => b.title).join(', ')}` : '',
      dropped.length ? `abandonou ${dropped.map((b) => b.title).join(', ')}` : ''].filter(Boolean).join(', ');
    const thumb = finished.length
      ? `<span class="cal-cover">${cover(finished[0], { size: 'xs' })}${finished.length > 1 ? `<span class="cal-more">+${finished.length - 1}</span>` : ''}</span>`
      : '';
    return `<button type="button" class="${cls}" data-action="cal-day" data-date="${date}" data-year="${year}" aria-label="${esc(label)}">
      <span class="cal-num">${Number(date.slice(8))}</span>${thumb}${dropped.length ? DROP_MARK : ''}</button>`;
  }).join('');
  const nav = (delta, disabled, name, label) => `<button type="button" class="icon-btn cal-nav" data-action="cal-month" data-delta="${delta}" data-year="${year}" aria-label="${label}"${disabled ? ' disabled' : ''}>${icon(name, { size: 18, stroke: 2 })}</button>`;
  return `
    <div class="cal-month">
      <div class="cal-month-head">
        ${nav(-1, m === 0, 'chevronLeft', 'Mês anterior')}
        <span class="cal-month-name">${monthName(m)}</span>
        ${nav(1, m === 11, 'chevronRight', 'Próximo mês')}
      </div>
      <div class="cal-grid">${head}${cells}</div>
    </div>`;
}

function detail(data, date) {
  if (!date) return '<p class="cal-detail muted small" aria-live="polite">Toque num dia para ver o que você leu.</p>';
  const d = dayDetail(data, date);
  const extra = [
    d.finished.length ? `<span class="cal-detail-line">${icon('check', { size: 14, stroke: 2.4, cls: 'accent' })}Concluído: ${esc(d.finished.join(', '))}</span>` : '',
    d.dropped.length ? `<span class="cal-detail-line">${DROP_MARK}Abandonado: ${esc(d.dropped.join(', '))}</span>` : '',
  ].join('');
  return `<p class="cal-detail" aria-live="polite"><span class="strong-ish">${esc(d.text)}</span>${extra}</p>`;
}

/** Seção completa do calendário para o ano do resumo. */
export function calendarSection({ state, ui, year, today }) {
  const data = dataFor(state.books, year);
  const cal = { ...calendarUi(ui, year, today) };
  cal.sel = cal.day;
  const isMonth = cal.mode === 'mes';
  const toggle = ['ano', 'mes'].map((mode) => `<button type="button" class="seg-btn${cal.mode === mode ? ' is-on' : ''}" data-action="cal-mode" data-mode="${mode}" data-year="${year}" aria-pressed="${cal.mode === mode}">${mode === 'ano' ? 'Ano' : 'Mês'}</button>`).join('');
  const foot = data.hasJournal
    ? `<div class="cal-foot">
        <span><strong>${plural(data.readingDays, 'dia', 'dias')}</strong> <span class="muted">com leitura em ${year}</span></span>
        <span><span class="muted">Maior sequência:</span> <strong>${plural(data.longestStreak, 'dia', 'dias')}</strong></span>
      </div>`
    : '<p class="muted small cal-note">O calendário fica completo conforme você atualiza a página dos livros.</p>';
  return `
    <section class="card calendar" id="calendario">
      <div class="section-head cal-head">
        <h2>Calendário</h2>
        <div class="segmented seg-mini" style="--seg-count:2" role="group" aria-label="Ver por">${toggle}</div>
      </div>
      ${isMonth ? monthView(data, cal, today, year) : heatmap(data, cal.sel, today, year)}
      ${detail(data, cal.sel)}
      ${foot}
    </section>`;
}

/** Dia mais próximo do toque no mapa (os quadradinhos são pequenos para acertar no dedo). */
export function heatmapDayAt(svg, x, y) {
  let best = null;
  let bestDist = Infinity;
  for (const rect of svg.querySelectorAll('rect[data-date]')) {
    const r = rect.getBoundingClientRect();
    const dist = Math.hypot(r.left + r.width / 2 - x, r.top + r.height / 2 - y);
    if (dist < bestDist) {
      bestDist = dist;
      best = rect;
    }
  }
  if (!best) return null;
  const size = best.getBoundingClientRect().width || 1;
  return bestDist <= size * 2 ? best.dataset.date : null;
}
