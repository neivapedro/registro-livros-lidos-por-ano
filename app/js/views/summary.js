// Resumo do ano (v1.4): três abas — Visão geral (indicadores + curva S), Ritmo e Gostos.

import { daysInclusive, formatShort, monthInitial, monthName, monthOf, yearOf } from '../dates.js';
import { getGoal } from '../store.js';
import { droppedInYear, goalStreak, monthsMetInYear, yearStats, yearsWithData } from '../stats.js';
import { topTagsInYear } from '../tags.js';
import { dailyPages, kpiDelta, kpiSeries, previousYearBaseline, repeatedAuthors } from '../trend.js';
import { cover, decimal, esc, icon, num, plural, stars } from '../ui.js';
import { emptyScene } from '../empty-art.js';
import { calendarSection } from './calendar.js';
import { formatCard, lengthChart, monthChartToggle, pagesMonthChart, pagesMonthLegend, ratingChart } from './charts.js';
import { yearSelect } from './home.js';
import { deltaLine, kpiTile, sparkline } from './kpi.js';
import { sCurveCard } from './scurve.js';
import { compactBar } from '../large-title.js';
import { readerProfileCard } from './meta-ui.js';
import { formatDuration, formatDurationShort, headphonesIcon, hoursValue } from '../audio.js';
import { minutesListenedByMonth, minutesListenedPerDay } from '../journal.js';

export const SUMMARY_TABS = ['geral', 'ritmo', 'gostos'];
const TAB_LABELS = { geral: 'Visão geral', ritmo: 'Ritmo', gostos: 'Gostos' };

function tabs(active, year) {
  const html = SUMMARY_TABS.map((t) => `
    <button type="button" role="tab" id="rs-tab-${t}" class="rs-tab${t === active ? ' is-on' : ''}" aria-selected="${t === active}"
      aria-controls="rs-panel" tabindex="${t === active ? 0 : -1}" data-action="summary-tab" data-tab="${t}" data-value="${t}" data-year="${year}">${TAB_LABELS[t]}</button>`).join('');
  return `<div class="rs-tabs" role="tablist" aria-label="Seções do resumo">${html}</div>`;
}

// ---------- Visão geral ----------

function kpis(state, s, year, today) {
  const base = previousYearBaseline(state.books, year, today);
  const series = kpiSeries(state.books, year, today);
  const since = base ? `${base.year}${base.until ? ` até ${formatShort(base.until)}` : ''}` : '';
  const d = (cur, prev, opts, text, long) => {
    const delta = base ? kpiDelta(cur, prev, opts) : null;
    return delta ? deltaLine(delta, text(delta), long(delta)) : '';
  };
  const abs = (n) => Math.abs(n);
  const same = (delta, word) => (delta.dir === 'same' ? `igual a ${since}` : word);
  const booksDelta = d(s.count, base?.count, {},
    (x) => (x.dir === 'same' ? 'igual' : plural(abs(x.diff), 'livro', 'livros')),
    (x) => same(x, `${plural(abs(x.diff), 'livro', 'livros')} a ${x.dir === 'up' ? 'mais' : 'menos'} que ${since}`));
  // Sem páginas no ano o bloco mostra "—": sem variação ao lado (um "▼ 100%" sob um traço confunde).
  const pagesDelta = base?.pages && s.pages
    ? d(s.pages, base.pages, { byPct: true },
      (x) => (x.dir === 'same' ? 'igual' : `${abs(x.pct)}%`),
      (x) => same(x, `${abs(x.pct)}% ${x.dir === 'up' ? 'a mais' : 'a menos'} que ${since}`))
    : '';
  const ratingDelta = d(s.avgRating, base?.avgRating, { digits: 1 },
    (x) => (x.dir === 'same' ? 'igual' : decimal(abs(x.diff))),
    (x) => same(x, `${decimal(abs(x.diff))} ${x.dir === 'up' ? 'acima' : 'abaixo'} de ${since}`));
  const daysDelta = d(s.avgDays, base?.avgDays, { lowerIsBetter: true },
    (x) => (x.dir === 'same' ? 'igual' : plural(abs(x.diff), 'dia', 'dias')),
    (x) => same(x, `${plural(abs(x.diff), 'dia', 'dias')} a ${x.dir === 'up' ? 'mais' : 'menos'} por livro que ${since}`));
  const hasDelta = [booksDelta, pagesDelta, ratingDelta, daysDelta].some(Boolean);
  // Audiolivros (1.6): as horas ouvidas num bloco largo, só quando houver.
  const heard = s.listened ? listenedTile(state, s, year, today) : '';
  return `
    <section class="kpis" aria-label="Indicadores de ${year}">
      ${kpiTile({ label: 'Livros lidos', value: s.count, of: `/ ${s.goal}`, delta: booksDelta, spark: sparkline(series.count), cls: 'is-lead' })}
      ${kpiTile({ label: 'Páginas', value: s.pages || null, delta: pagesDelta, spark: sparkline(series.pages), note: s.pagesKnown < s.count ? `${s.pagesKnown} de ${s.count} livros com nº de págs.` : '' })}
      ${kpiTile({ label: 'Nota média', value: s.avgRating, digits: 1, delta: ratingDelta, spark: sparkline(series.avgRating) })}
      ${kpiTile({ label: 'Dias por livro', value: s.avgDays === null ? null : Math.round(s.avgDays), delta: daysDelta, spark: sparkline(series.avgDays) })}
      ${heard}
    </section>
    ${hasDelta ? `<p class="kpi-caption">Comparado a ${esc(since)}</p>` : ''}`;
}

/** Bloco "Horas ouvidas": total do ano em horas, o tempo exato e a curva do ano. */
function listenedTile(state, s, year, today) {
  const ty = yearOf(today);
  const last = year < ty ? 11 : year > ty ? -1 : monthOf(today);
  let acc = 0;
  const series = minutesListenedByMonth(state.books, year).map((m) => { acc += m; return acc / 60; }).slice(0, last + 1);
  const books = s.formats.audio || 0;
  const note = [formatDuration(s.listened), books ? plural(books, 'audiolivro lido', 'audiolivros lidos') : ''].filter(Boolean).join(' · ');
  return kpiTile({
    label: 'Horas ouvidas', ...hoursValue(s.listened), of: 'h', note, spark: sparkline(series), cls: 'is-wide is-audio',
  });
}

function favoriteCard(s) {
  const b = s.favorite;
  if (!b) {
    return s.count
      ? '<p class="rs-hint muted small">Marque um livro como <strong>favorito do ano</strong> ao editá-lo para ele aparecer aqui.</p>'
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

function overview({ state, ui, year, today, s }) {
  return `
    ${kpis(state, s, year, today)}
    ${sCurveCard({ state, ui, year, today, goal: s.goal })}
    ${favoriteCard(s)}
    ${s.count ? `<a class="btn-primary" href="#/retro/${year}">Ver retrospectiva ${icon('chevronRight', { size: 18, stroke: 2.4 })}</a>` : ''}`;
}

// ---------- Ritmo ----------

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

function monthsCard({ state, ui, s, today, year, streak }) {
  const pages = ui?.monthChart === 'paginas';
  return `
    <section class="card">
      <div class="section-head">
        <h2>${pages ? 'Páginas por mês' : 'Livros por mês'}</h2>
        ${pages ? pagesMonthLegend(state, year) : '<span class="legend-target muted small"><span class="dash"></span>meta</span>'}
      </div>
      ${monthChartToggle(ui || {}, year)}
      ${pages ? pagesMonthChart(state, s, today) : monthChart(s, today)}
      ${streakLine(s, streak, today)}
    </section>`;
}

/** Páginas por dia: no ano (por dia corrido), por dia com leitura e o melhor dia. */
function pagesPerDayCard(state, s, year) {
  if (!s.pages) return '';
  const d = dailyPages(state.books, year);
  // Abaixo de 10 com uma casa: 0,4 pág./dia não vira "0" num ano com páginas lidas.
  const perDay = (n) => (n < 10 ? decimal(n) : num(n));
  const cell = (value, label, sub = '') => `
    <div class="ppd-cell"><span class="ppd-value">${value}</span><span class="ppd-label">${label}</span>${sub ? `<span class="ppd-sub">${sub}</span>` : ''}</div>`;
  return `
    <section class="card">
      <h2>Páginas por dia</h2>
      <div class="ppd">
        ${cell(perDay(s.pagesPerDay), 'média no ano')}
        ${d.days ? cell(perDay(d.perReadingDay), 'por dia de leitura') : ''}
        ${d.best ? cell(num(d.best.pages), 'melhor dia', formatShort(d.best.date)) : ''}
      </div>
    </section>`;
}

/** Audiolivros: tempo ouvido no ano, por dia ouvindo e o melhor dia. */
function listenedCard(state, s, year) {
  if (!s.listened) return '';
  let days = 0;
  let sum = 0;
  let best = null;
  for (const [date, minutes] of minutesListenedPerDay(state.books)) {
    if (yearOf(date) !== year) continue;
    days += 1;
    sum += minutes;
    if (!best || minutes > best.minutes || (minutes === best.minutes && date < best.date)) best = { date, minutes };
  }
  const cell = (value, label, sub = '') => `
    <div class="ppd-cell"><span class="ppd-value">${esc(value)}</span><span class="ppd-label">${label}</span>${sub ? `<span class="ppd-sub">${sub}</span>` : ''}</div>`;
  return `
    <section class="card listen-card">
      <h2 class="listen-head">${headphonesIcon(16, 'accent')}Horas ouvidas</h2>
      <div class="ppd">
        ${cell(formatDurationShort(s.listened), 'no ano')}
        ${days ? cell(formatDurationShort(sum / days), 'por dia ouvindo') : ''}
        ${best ? cell(formatDurationShort(best.minutes), 'melhor dia', formatShort(best.date)) : ''}
      </div>
    </section>`;
}

function rhythm({ state, ui, year, today, s }) {
  const streak = goalStreak(state.books, (y) => getGoal(state, y), today);
  return `
    ${calendarSection({ state, ui: ui || {}, year, today })}
    ${monthsCard({ state, ui, s, today, year, streak })}
    ${pagesPerDayCard(state, s, year)}
    ${listenedCard(state, s, year)}`;
}

// ---------- Gostos ----------

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

/** Autores: só quem tem mais de um livro no ano; se ninguém repete, uma linha discreta. */
function authorRank(s) {
  if (!s.authors.length) return '';
  const list = repeatedAuthors(s.authors);
  if (!list.length) return `<p class="rs-hint muted small">Nenhum autor repetido em ${s.year}: ${plural(s.authors.length, 'autor diferente', 'autores diferentes')}.</p>`;
  const rows = list.slice(0, 5).map((a, i) => `
    <div class="rank-row"><span class="rank-n${i === 0 ? ' is-top' : ''}">${i + 1}</span><span class="rank-name">${esc(a.label)}</span><span class="muted small">${plural(a.count, 'livro', 'livros')}</span></div>`).join('');
  return `<section class="card"><h2>Autores mais lidos</h2>${rows}</section>`;
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

// Etiquetas dos livros lidos no ano (as criadas pela própria pessoa).
function tagsCard(state, year) {
  const list = topTagsInYear(state.books, year);
  if (!list.length) return '';
  const chips = list.map((t) => `<span class="tag-count"><span class="tag-count-name">${esc(t.label)}</span><span class="tag-count-n">${t.count}</span></span>`).join('');
  return `<section class="card"><h2>Etiquetas mais usadas</h2><div class="chips-wrap" aria-label="Etiquetas e quantidade de livros">${chips}</div></section>`;
}

function tastes({ state, year, s }) {
  const body = [genreBars(s), readerProfileCard(state.books, year), ratingChart(s), lengthChart(s), formatCard(state, s), authorRank(s), tagsCard(state, year), droppedCard(state, year)].join('');
  return body.trim() || emptyScene('resumo', `Nenhum livro lido em ${year}`, `Os gostos de ${year} (gêneros, notas, autores) aparecem quando houver livros lidos no ano.`);
}

// ---------- Página ----------

export function summaryView({ state, ui, year, today }) {
  const currentYear = yearOf(today);
  const s = yearStats(state.books, year, getGoal(state, year), today);
  const tab = SUMMARY_TABS.includes(ui?.summaryTab) ? ui.summaryTab : 'geral';
  const ctx = { state, ui: ui || {}, year, today, s };
  const panel = tab === 'ritmo' ? rhythm(ctx) : tab === 'gostos' ? tastes(ctx) : overview(ctx);
  const back = `<a class="icon-btn" href="#/inicio" aria-label="Voltar">${icon('chevronLeft', { stroke: 2 })}</a>`;
  return `
    <header class="top">
      ${back}
      ${yearSelect(yearsWithData(state.books, currentYear), year, 'summary-year', { withAll: true })}
    </header>
    ${compactBar({ title: `Resumo de ${year}`, start: back, flush: true })}
    <div class="page-title">
      <span class="eyebrow">Resumo do ano</span>
      <h1 class="display" data-large-title>Seu ${year} ${year === currentYear ? '<em>até agora</em>' : '<em>em livros</em>'}</h1>
    </div>
    ${tabs(tab, year)}
    <div class="rs-panel" id="rs-panel" role="tabpanel" aria-labelledby="rs-tab-${tab}" data-tab="${tab}">
      ${panel}
    </div>`;
}
