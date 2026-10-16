import { formatShort, yearOf } from '../dates.js';
import { FORMAT_LABELS, STATUS, getGoal } from '../store.js';
import { countByStatus, goalStreak, yearStats, yearsWithData } from '../stats.js';
import { cover, decimal, esc, icon, num, plural, emptyState, progressBar } from '../ui.js';

const RING_C = 2 * Math.PI * 56;

export function yearSelect(years, selected, action, { withAll = false } = {}) {
  let options = years.map((y) => `<option value="${y}"${y === selected ? ' selected' : ''}>${y}</option>`).join('');
  if (withAll) options += `<option value="todos"${selected === 'todos' ? ' selected' : ''}>Todos os anos</option>`;
  return `<label class="year-pill"><span class="sr-only">Ano</span><select data-change="${action}">${options}</select>${icon('chevronDown', { size: 16, stroke: 2 })}</label>`;
}

function hero(stats, streak, isCurrentYear) {
  const dash = (RING_C * stats.progress).toFixed(1);
  const pct = Math.round(stats.progress * 100);
  let line;
  if (stats.remaining === 0) line = 'Meta batida!';
  else if (isCurrentYear) line = `Faltam ${plural(stats.remaining, 'livro', 'livros')} até dezembro`;
  else line = `Faltaram ${plural(stats.remaining, 'livro', 'livros')}`;
  const streakChip = isCurrentYear && streak.current > 0
    ? `<span class="pill-accent">${icon('flame', { size: 14 })}${streak.current === 1 ? '1 mês na meta' : `${streak.current} meses seguidos`}</span>`
    : `<span class="pill-muted">Meta mensal: ${plural(stats.monthlyTarget, 'livro', 'livros')}</span>`;
  return `
    <section class="card hero">
      <div class="ring">
        <svg width="132" height="132" viewBox="0 0 132 132" role="img" aria-label="${stats.count} de ${stats.goal} livros da meta">
          <circle cx="66" cy="66" r="56" fill="none" stroke="var(--line-strong)" stroke-width="11"/>
          <circle cx="66" cy="66" r="56" fill="none" stroke="var(--accent)" stroke-width="11" stroke-linecap="round"
            stroke-dasharray="${dash} ${RING_C.toFixed(1)}" transform="rotate(-90 66 66)" class="ring-progress"/>
        </svg>
        <div class="ring-center"><span class="ring-count">${stats.count}</span><span class="ring-sub">de ${plural(stats.goal, 'livro', 'livros')}</span></div>
      </div>
      <div class="hero-text">
        <span class="eyebrow">Meta ${stats.year}</span>
        <span class="hero-pct">${pct}%</span>
        <span class="muted small">${line}</span>
        ${streakChip}
      </div>
    </section>`;
}

function statTiles(stats) {
  const rating = stats.avgRating ? decimal(stats.avgRating) : '—';
  return `
    <section class="tiles tiles-3">
      <div class="tile"><span class="tile-value">${stats.pages ? num(stats.pages) : '—'}</span><span class="tile-label">páginas</span></div>
      <div class="tile"><span class="tile-value">${rating}${stats.avgRating ? icon('star', { size: 15, cls: 'accent' }) : ''}</span><span class="tile-label">nota média</span></div>
      <div class="tile"><span class="tile-value">${stats.avgDays ? Math.round(stats.avgDays) : '—'}</span><span class="tile-label">dias por livro</span></div>
    </section>`;
}

function updateLabel(b) {
  const kindle = b.format === 'kindle';
  const has = kindle ? b.currentPercent != null : b.currentPage != null;
  return `${has ? 'Atualizar' : 'Informar'} ${kindle ? '%' : 'página'}`;
}

function progressEditor(b) {
  const kindle = b.format === 'kindle';
  const value = kindle ? b.currentPercent : b.currentPage;
  const label = kindle ? 'Quantos % o Kindle mostra?' : `Em que página você está?${b.pages ? ` (de ${b.pages})` : ''}`;
  return `
    <form class="progress-edit" data-progress-form data-id="${esc(b.id)}" novalidate>
      <label class="progress-edit-label" for="progress-input">${esc(label)}</label>
      <div class="progress-edit-row">
        <span class="progress-edit-field">
          <input id="progress-input" type="number" inputmode="${kindle ? 'decimal' : 'numeric'}" min="0" max="${kindle ? 100 : b.pages || 20000}"
            value="${esc(value ?? '')}" placeholder="${kindle ? '0 a 100' : 'Página'}" enterkeyhint="done">
          <span class="progress-edit-suffix">${kindle ? '%' : 'pág.'}</span>
        </span>
        <button type="submit" class="btn-primary sm">Salvar</button>
        <button type="button" class="btn-text small" data-action="cancel-progress">Cancelar</button>
      </div>
    </form>`;
}

function readingNow(books, editingId) {
  if (!books.length) return '';
  const cards = books.map((b) => `
    <div class="card reading">
      <div class="reading-main">
      <a class="reading-link" href="#/livro/${encodeURIComponent(b.id)}">
        ${cover(b, { size: 'md' })}
        <span class="reading-text">
          <span class="serif-title">${esc(b.title)}</span>
          <span class="muted small">${esc(b.authors || 'Autor não informado')}</span>
          <span class="chips"><span class="chip">${FORMAT_LABELS[b.format]}</span>${b.startDate ? `<span class="chip">desde ${formatShort(b.startDate)}</span>` : ''}</span>
        </span>
      </a>
      <a class="btn-outline" href="#/livro/${encodeURIComponent(b.id)}?concluir=1">Concluir</a>
      </div>
      ${editingId === b.id ? progressEditor(b) : `
      <div class="reading-progress">
        ${progressBar(b) || `<span class="muted small">${b.format === 'kindle' ? 'Registre a % em que você está' : 'Registre a página em que você está'}</span>`}
        <button type="button" class="btn-text accent small" data-action="update-page" data-id="${esc(b.id)}">${updateLabel(b)}</button>
      </div>`}
    </div>`).join('');
  return `
    <section class="section">
      <div class="section-head"><h2>Lendo agora</h2><span class="muted small">${plural(books.length, 'livro', 'livros')}</span></div>
      ${cards}
    </section>`;
}

function readGrid(stats) {
  const head = `<div class="section-head"><h2>Lidos em ${stats.year}</h2>${stats.count > 6 ? `<a class="link" href="#/estante?aba=lido">Ver todos (${stats.count})</a>` : ''}</div>`;
  if (!stats.count) {
    return `<section class="section">${head}${emptyState('Nenhum livro concluído ainda', `Toque no + para registrar o primeiro livro de ${stats.year}.`)}</section>`;
  }
  const items = stats.books.slice(0, 6).map((b) => `
    <a class="grid-book" href="#/livro/${encodeURIComponent(b.id)}">
      <span class="grid-cover">${cover(b, { size: 'fill' })}${b.favorite ? `<span class="fav-badge">${icon('heart', { size: 12, label: 'Favorito do ano' })}</span>` : ''}</span>
      <span class="grid-meta"><span class="grid-month">${esc(formatShort(b.endDate))}</span>${b.rating ? `<span class="grid-rating">${icon('star', { size: 11 })}${b.rating}</span>` : ''}</span>
    </a>`).join('');
  return `<section class="section">${head}<div class="book-grid">${items}</div></section>`;
}

function wantTeaser(books) {
  const want = books.filter((b) => b.status === STATUS.WANT);
  if (!want.length) {
    return `<a class="card teaser" href="#/novo?status=quero"><span class="teaser-plus">${icon('plus', { size: 20 })}</span><span class="teaser-text"><span class="teaser-title">Quero ler</span><span class="muted small">Monte a fila dos próximos livros</span></span>${icon('chevronRight', { cls: 'muted' })}</a>`;
  }
  const stack = want.slice(0, 3).map((b) => cover(b, { size: 'xs', showText: false })).join('');
  return `<a class="card teaser" href="#/estante?aba=quero"><span class="stack">${stack}</span><span class="teaser-text"><span class="teaser-title">Quero ler</span><span class="muted small">${plural(want.length, 'livro', 'livros')} na fila</span></span>${icon('chevronRight', { cls: 'muted' })}</a>`;
}

export function homeView({ state, ui, year, today }) {
  const currentYear = yearOf(today);
  const stats = yearStats(state.books, year, getGoal(state, year), today);
  const streak = goalStreak(state.books, (y) => getGoal(state, y), today);
  const reading = state.books.filter((b) => b.status === STATUS.READING);
  const counts = countByStatus(state.books);
  return `
    <header class="top">
      <div class="brand"><span class="muted small">Seu ano em</span><span class="brand-name">Leituras</span></div>
      <div class="top-actions">
        ${yearSelect(yearsWithData(state.books, currentYear), year, 'home-year')}
        <a class="icon-btn" href="#/ajustes" aria-label="Ajustes">${icon('sliders', { size: 18 })}</a>
      </div>
    </header>
    ${hero(stats, streak, year === currentYear)}
    ${statTiles(stats)}
    ${year === currentYear ? readingNow(reading, ui?.editingProgress) : ''}
    ${readGrid(stats)}
    ${counts[STATUS.WANT] || year === currentYear ? wantTeaser(state.books) : ''}`;
}
