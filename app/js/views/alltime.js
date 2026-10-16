import { yearOf } from '../dates.js';
import { FORMATS } from '../store.js';
import { allTimeStats, yearsWithData } from '../stats.js';
import { decimal, emptyState, esc, icon, num, plural } from '../ui.js';
import { yearSelect } from './home.js';

function yearBars(s) {
  const max = Math.max(...s.years.map((y) => y.count), 1);
  return s.years.map((y) => `
    <div class="cmp-row${y.year === s.bestYear?.year ? ' is-sel' : ''}">
      <span class="cmp-year">${y.year}</span>
      <div class="cmp-track"><div class="cmp-fill" style="width:${(y.count / max) * 100}%"></div></div>
      <span class="cmp-count">${y.count}</span>
    </div>`).join('');
}

function ranking(title, list) {
  if (!list.length) return '';
  const rows = list.slice(0, 5).map((a, i) => `
    <div class="rank-row"><span class="rank-n${i === 0 ? ' is-top' : ''}">${i + 1}</span><span class="rank-name">${esc(a.label)}</span><span class="muted small">${plural(a.count, 'livro', 'livros')}</span></div>`).join('');
  return `<section class="card"><h2>${title}</h2>${rows}</section>`;
}

export function allTimeView({ state, today }) {
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
    return `${header}${emptyState('Nenhum livro concluído ainda', 'Seus números de todos os anos aparecem aqui.')}`;
  }
  const phys = s.formats[FORMATS.PHYSICAL];
  const kin = s.formats[FORMATS.KINDLE];
  const extras = [
    s.rereads ? plural(s.rereads, 'releitura', 'releituras') : '',
    s.dropped ? plural(s.dropped, 'livro abandonado', 'livros abandonados') : '',
  ].filter(Boolean).join(' · ');
  return `
    ${header}
    <section class="tiles tiles-2">
      <div class="tile"><span class="tile-value big">${num(s.count)}</span><span class="tile-label">livros lidos</span></div>
      <div class="tile"><span class="tile-value big">${s.pages ? num(s.pages) : '—'}</span><span class="tile-label">páginas</span></div>
      <div class="tile"><span class="tile-value big">${decimal(s.avgPerYear)}</span><span class="tile-label">livros por ano${s.years.length > 1 ? ' (anos encerrados)' : ''}</span></div>
      <div class="tile"><span class="tile-value big">${s.avgRating ? decimal(s.avgRating) : '—'}</span><span class="tile-label">nota média</span></div>
    </section>
    ${s.bestYear ? `
    <section class="card best-year">
      <span class="eyebrow accent">${icon('star', { size: 12 })} Melhor ano</span>
      <span class="serif-title lg">${s.bestYear.year}</span>
      <span class="muted small">${plural(s.bestYear.count, 'livro lido', 'livros lidos')}</span>
    </section>` : ''}
    <section class="card"><h2>Livros por ano</h2>${yearBars(s)}</section>
    <section class="card">
      <h2>Formato</h2>
      <div class="split" role="img" aria-label="${phys} físicos e ${kin} no Kindle">
        ${phys ? `<span class="split-a" style="flex:${phys}"></span>` : ''}${kin ? `<span class="split-b" style="flex:${kin}"></span>` : ''}
      </div>
      <div class="split-legend">
        <span><span class="dot dot-a"></span><strong>Físico</strong><span class="muted">${plural(phys, 'livro', 'livros')}</span></span>
        <span><span class="dot dot-b"></span><strong>Kindle</strong><span class="muted">${plural(kin, 'livro', 'livros')}</span></span>
      </div>
    </section>
    ${ranking('Gêneros mais lidos', s.genres)}
    ${ranking('Autores mais lidos', s.authors)}
    ${extras ? `<p class="muted small center-text">${extras}</p>` : ''}`;
}
