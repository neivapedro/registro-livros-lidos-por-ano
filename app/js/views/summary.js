import { daysInclusive, monthInitial, monthName, monthOf, yearOf } from '../dates.js';
import { getGoal } from '../store.js';
import { droppedInYear, goalStreak, monthsMetInYear, yearStats, yearsWithData } from '../stats.js';
import { cover, decimal, esc, icon, num, plural, stars } from '../ui.js';
import { calendarSection } from './calendar.js';
import { formatCard, lengthChart, monthChartToggle, pagesMonthChart, pagesMonthLegend, ratingChart } from './charts.js';
import { yearSelect } from './home.js';

function kpis(s) {
  return `
    <section class="tiles tiles-2">
      <div class="tile"><span class="tile-value big">${s.count}<span class="tile-of"> / ${s.goal}</span></span><span class="tile-label">livros lidos</span></div>
      <div class="tile"><span class="tile-value big">${s.pages ? num(s.pages) : '—'}</span><span class="tile-label">páginas${s.pagesKnown < s.count ? ` (${s.pagesKnown} com nº de págs.)` : ''}</span></div>
      <div class="tile"><span class="tile-value big">${s.avgRating ? decimal(s.avgRating) : '—'}</span><span class="tile-label">nota média</span></div>
      <div class="tile"><span class="tile-value big">${s.avgDays ? Math.round(s.avgDays) : '—'}</span><span class="tile-label">dias por livro</span></div>
    </section>`;
}

function favoriteCard(s) {
  const b = s.favorite;
  if (!b) {
    return s.count
      ? '<section class="card soft"><p class="muted small">Marque um livro como <strong>favorito do ano</strong> ao editá-lo para ele aparecer aqui.</p></section>'
      : '';
  }
  const days = b.startDate && b.startDate <= b.endDate ? ` · lido em ${plural(daysInclusive(b.startDate, b.endDate), 'dia', 'dias')}` : '';
  return `
    <a class="card favorite" href="#/livro/${encodeURIComponent(b.id)}">
      ${cover(b, { size: 'lg' })}
      <span class="favorite-text">
        <span class="eyebrow accent">${icon('heart', { size: 12 })} Favorito do ano</span>
        <span class="serif-title lg">${esc(b.title)}</span>
        <span class="muted small">${esc(b.authors || '')}${days}</span>
        ${stars(b.rating)}
      </span>
    </a>`;
}

function monthChart(s, today) {
  const isCurrent = s.year === yearOf(today);
  const lastMonth = isCurrent ? monthOf(today) : 11;
  const max = Math.max(...s.byMonth, s.monthlyTarget) * 1.25;
  const h = 100;
  const targetY = Math.round((s.monthlyTarget / max) * h);
  const bars = s.byMonth.map((n, i) => {
    const future = i > lastMonth;
    const barH = n ? Math.max(6, Math.round((n / max) * h)) : 4;
    const cls = future ? 'bar future' : n >= s.monthlyTarget ? 'bar met' : n ? 'bar partial' : 'bar empty';
    const inner = `<span class="bar-value">${n || ''}</span><span class="${cls}" style="height:${barH}px"></span><span class="bar-label${i === monthOf(today) && isCurrent ? ' now' : ''}">${monthInitial(i)}</span><span class="sr-only">${monthName(i)}: ${plural(n, 'livro', 'livros')}</span>`;
    // Mês com livro: o toque abre a busca com os livros concluídos no mês.
    return n
      ? `<button type="button" class="bar-col" data-action="chart-filter" data-year="${s.year}" data-kind="month" data-value="${i}">${inner}</button>`
      : `<div class="bar-col">${inner}</div>`;
  }).join('');
  return `
    <div class="bars" style="--chart-h:${h}px">
      <span class="target-line" style="bottom:calc(${targetY}px + 22px)"></span>
      ${bars}
    </div>`;
}

function streakLine(s, streak, today) {
  const isCurrent = s.year === yearOf(today);
  const met = monthsMetInYear(s.byMonth, s.monthlyTarget);
  const elapsed = isCurrent ? monthOf(today) + 1 : 12;
  const title = isCurrent && streak.current
    ? `${streak.current === 1 ? '1 mês' : `${streak.current} meses seguidos`} batendo a meta`
    : `${met} de ${elapsed} meses com a meta batida`;
  const sub = isCurrent
    ? `${monthName(monthOf(today))} em andamento · recorde: ${plural(streak.best, 'mês', 'meses')}`
    : `Meta mensal: ${plural(s.monthlyTarget, 'livro', 'livros')}`;
  return `
    <div class="streak">
      <span class="streak-icon">${icon('flame', { size: 18 })}</span>
      <span class="streak-text"><span class="strong">${title}</span><span class="muted small">${sub}</span></span>
    </div>`;
}

function genreBars(s) {
  if (!s.genres.length) return '';
  const max = s.genres[0].count;
  const rows = s.genres.slice(0, 6).map((g, i) => `
    <button type="button" class="hbar hbar-btn" data-action="chart-filter" data-year="${s.year}" data-kind="genre" data-value="${esc(g.label)}">
      <span class="hbar-head"><span class="strong-ish">${esc(g.label)}</span><span class="muted">${plural(g.count, 'livro', 'livros')}</span></span>
      <span class="hbar-track"><span class="hbar-fill${i === 0 ? ' is-top' : ''}" style="width:${(g.count / max) * 100}%"></span></span>
    </button>`).join('');
  return `<section class="card"><h2>Gêneros mais lidos</h2><div class="hbar-list">${rows}</div></section>`;
}

function authorRank(s) {
  if (!s.authors.length) return '';
  const rows = s.authors.slice(0, 5).map((a, i) => `
    <div class="rank-row"><span class="rank-n${i === 0 ? ' is-top' : ''}">${i + 1}</span><span class="rank-name">${esc(a.label)}</span><span class="muted small">${plural(a.count, 'livro', 'livros')}</span></div>`).join('');
  return `<section class="card"><h2>Autores mais lidos</h2>${rows}</section>`;
}

function yearCompare(state, today, selectedYear) {
  const years = yearsWithData(state.books, yearOf(today)).slice(0, 6);
  const rows = years.map((y) => ({ y, s: yearStats(state.books, y, getGoal(state, y), today) }));
  const max = Math.max(...rows.map((r) => Math.max(r.s.count, r.s.goal)), 1);
  const html = rows.map(({ y, s }) => `
    <div class="cmp-row${y === selectedYear ? ' is-sel' : ''}">
      <span class="cmp-year">${y}</span>
      <div class="cmp-track">
        <div class="cmp-fill" style="width:${(s.count / max) * 100}%"></div>
        <span class="cmp-goal" style="left:${(s.goal / max) * 100}%" title="Meta ${s.goal}"></span>
      </div>
      <span class="cmp-count">${s.count}</span>
    </div>`).join('');
  const note = years.length < 2 ? 'O comparativo cresce a cada ano registrado.' : 'A marca branca é a meta de cada ano.';
  return `<section class="card"><div class="section-head"><h2>Comparativo entre anos</h2></div>${html}<p class="muted small">${note}</p></section>`;
}

function droppedCard(state, year) {
  const list = droppedInYear(state.books, year);
  if (!list.length) return '';
  const rows = list.map((b) => `
    <a class="dropped-row" href="#/livro/${encodeURIComponent(b.id)}">
      <span class="strong-ish">${esc(b.title)}</span>
      ${b.dropReason ? `<span class="muted small">${esc(b.dropReason)}</span>` : ''}
    </a>`).join('');
  return `<section class="card"><div class="section-head"><h2>Abandonados</h2><span class="muted small">${plural(list.length, 'livro', 'livros')} · não contam na meta</span></div>${rows}</section>`;
}

export function summaryView({ state, ui, year, today }) {
  const currentYear = yearOf(today);
  const s = yearStats(state.books, year, getGoal(state, year), today);
  const streak = goalStreak(state.books, (y) => getGoal(state, y), today);
  return `
    <header class="top">
      <a class="icon-btn" href="#/inicio" aria-label="Voltar">${icon('chevronLeft', { stroke: 2 })}</a>
      ${yearSelect(yearsWithData(state.books, currentYear), year, 'summary-year', { withAll: true })}
    </header>
    <div class="page-title">
      <span class="eyebrow">Resumo do ano</span>
      <h1 class="display">Seu ${year} ${year === currentYear ? '<em>até agora</em>' : '<em>em livros</em>'}</h1>
    </div>
    ${kpis(s)}
    ${favoriteCard(s)}
    <section class="card">
      ${ui?.monthChart === 'paginas'
    ? `<div class="section-head"><h2>Páginas por mês</h2>${pagesMonthLegend(state, year)}</div>`
    : '<div class="section-head"><h2>Livros por mês</h2><span class="legend-target muted small"><span class="dash"></span>meta</span></div>'}
      ${monthChartToggle(ui || {}, year)}
      ${ui?.monthChart === 'paginas' ? pagesMonthChart(state, s, today) : monthChart(s, today)}
      ${streakLine(s, streak, today)}
    </section>
    ${calendarSection({ state, ui: ui || {}, year, today })}
    ${formatCard(state, s)}
    ${ratingChart(s)}
    ${lengthChart(s)}
    ${genreBars(s)}
    ${authorRank(s)}
    ${droppedCard(state, year)}
    ${yearCompare(state, today, year)}
    ${s.count ? `<a class="btn-primary" href="#/retro/${year}">Ver retrospectiva ${icon('chevronRight', { size: 18, stroke: 2.4 })}</a>` : ''}`;
}
