// Todos os anos (v1.4): indicadores, livros por ano com o melhor ano, comparação,
// marcos como medalhas e os gostos de sempre.

import { yearOf } from '../dates.js';
import { pagesReadInYear } from '../journal.js';
import { countQuotes } from '../quotes.js';
import { FORMATS } from '../store.js';
import { allTimeStats, yearsWithData } from '../stats.js';
import { repeatedAuthors } from '../trend.js';
import { emptyState, esc, icon, plural } from '../ui.js';
import { yearPairCompare } from './charts.js';
import { yearSelect } from './home.js';
import { kpiTile, sparkline } from './kpi.js';
import { milestonesSection } from './marcos.js';

function yearsCard(s) {
  const max = Math.max(...s.years.map((y) => y.count), 1);
  const rows = s.years.map((y) => `
    <div class="cmp-row${y.year === s.bestYear?.year ? ' is-sel' : ''}">
      <span class="cmp-year">${y.year}</span>
      <div class="cmp-track"><div class="cmp-fill" style="width:${(y.count / max) * 100}%"></div></div>
      <span class="cmp-count">${y.count}</span>
    </div>`).join('');
  const best = s.bestYear && s.years.length > 1
    ? `<span class="eyebrow accent best-year">${icon('star', { size: 12 })} Melhor ano: ${s.bestYear.year} · ${plural(s.bestYear.count, 'livro', 'livros')}</span>`
    : '';
  return `<section class="card"><div class="section-head"><h2>Livros por ano</h2></div>${best}<div class="cmp-list">${rows}</div></section>`;
}

function ranking(title, list) {
  if (!list.length) return '';
  const rows = list.slice(0, 5).map((a, i) => `
    <div class="rank-row"><span class="rank-n${i === 0 ? ' is-top' : ''}">${i + 1}</span><span class="rank-name">${esc(a.label)}</span><span class="muted small">${plural(a.count, 'livro', 'livros')}</span></div>`).join('');
  return `<section class="card"><h2>${title}</h2>${rows}</section>`;
}

function formatCard(s) {
  const phys = s.formats[FORMATS.PHYSICAL];
  const kin = s.formats[FORMATS.KINDLE];
  const pct = (n) => Math.round((n / s.count) * 100);
  const label = (side, name, n) => `
    <span class="fmt-label fmt-${side}">
      <span class="fmt-name"><span class="dot ${side === 'a' ? 'dot-a' : 'dot-b'}"></span>${name} <span class="fmt-pct">${pct(n)}%</span></span>
      <span class="fmt-detail">${plural(n, 'livro', 'livros')}</span>
    </span>`;
  return `
    <section class="card fmt-card">
      <h2>Formato</h2>
      <div class="fmt-bar" role="img" aria-label="${phys} físicos e ${kin} no Kindle">
        ${phys ? `<span class="split-a" style="flex:${phys}"></span>` : ''}${kin ? `<span class="split-b" style="flex:${kin}"></span>` : ''}
      </div>
      <div class="fmt-labels">${phys ? label('a', 'Físico', phys) : ''}${kin ? label('b', 'Kindle', kin) : ''}</div>
    </section>`;
}

/** Atalho para a tela de trechos salvos (#/trechos). */
function quotesLink(n) {
  return `<a class="card quotes-link" href="#/trechos"><span class="strong-ish">Trechos salvos (${n})</span>${icon('chevronRight', { size: 18, stroke: 2, cls: 'accent' })}</a>`;
}

export function allTimeView({ state, ui, today }) {
  const nQuotes = countQuotes(state.books);
  const currentYear = yearOf(today);
  const s = allTimeStats(state.books, today);
  const header = `
    <header class="top">
      <a class="icon-btn" href="#/inicio" aria-label="Voltar">${icon('chevronLeft', { stroke: 2 })}</a>
      ${yearSelect(yearsWithData(state.books, currentYear), 'todos', 'summary-year', { withAll: true })}
    </header>
    <div class="page-title">
      <span class="eyebrow">Todos os anos</span>
      <h1 class="display">Sua história <em>de leitor</em></h1>
    </div>`;
  if (!s.count) {
    return `${header}${emptyState('Nenhum livro concluído ainda', 'Seus números de todos os anos aparecem aqui.')}${nQuotes ? quotesLink(nQuotes) : ''}`;
  }
  const extras = [
    s.rereads ? plural(s.rereads, 'releitura', 'releituras') : '',
    s.dropped ? plural(s.dropped, 'livro abandonado', 'livros abandonados') : '',
  ].filter(Boolean).join(' · ');
  // Mini-gráficos por ano, do mais antigo ao mais recente.
  const chrono = [...s.years].reverse();
  const opts = { slots: chrono.length };
  // Com só 2 anos a linha não diz nada além dos números: o mini-gráfico aparece a partir de 3.
  const yearSpark = (values) => (values.length >= 3 ? sparkline(values, opts) : '');
  const authors = repeatedAuthors(s.authors);
  return `
    ${header}
    <section class="kpis" aria-label="Indicadores de todos os anos">
      ${kpiTile({ label: 'Livros lidos', value: s.count, spark: yearSpark(chrono.map((y) => y.count)), cls: 'is-lead' })}
      ${kpiTile({ label: 'Páginas', value: s.pages || null, spark: yearSpark(chrono.map((y) => pagesReadInYear(state.books, y.year))) })}
      ${kpiTile({ label: s.years.length > 1 ? 'Livros por ano' : 'Livros no ano', value: s.avgPerYear, digits: 1, note: s.years.length > 1 ? 'média dos anos encerrados' : '' })}
      ${kpiTile({ label: 'Nota média', value: s.avgRating, digits: 1 })}
    </section>
    ${yearsCard(s)}
    ${milestonesSection(state.books)}
    ${yearPairCompare({ state, ui: ui || {}, today })}
    ${ranking('Gêneros mais lidos', s.genres)}
    ${authors.length ? ranking('Autores mais lidos', authors) : ''}
    ${formatCard(s)}
    ${extras ? `<p class="muted small center-text">${extras}</p>` : ''}
    ${quotesLink(nQuotes)}`;
}
