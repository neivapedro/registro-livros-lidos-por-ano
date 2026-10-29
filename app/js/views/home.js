import { formatShort, yearOf } from '../dates.js';
import { FORMATS, STATUS, getGoal, getPageGoal } from '../store.js';
import { forecastFinish, paceLines } from '../pace.js';
import { countByStatus, goalStreak, yearStats, yearsWithData } from '../stats.js';
import { pageGoalLine, pageGoalProgress } from '../charts.js';
import {
  GLYPHS, cover, emptyState, esc, finishHref, formatRating, icon, num, plural, progressOf, progressRing,
} from '../ui.js';
import { timerBanner } from './timer.js';
import { compactBar } from '../large-title.js';
import { firstUpNext } from '../upnext.js';
import { currentDayStreak, greetingFor, longDate, streakText } from '../greeting.js';
import { minutesListenedInYear, readingDays } from '../journal.js';
import { editHref, registerHint } from './book-detail.js';
import { formatDuration, headphonesIcon, hoursText } from '../audio.js';
import { suggestTeaser } from './ai-views.js';

const RING_R = 50;
const RING_C = 2 * Math.PI * RING_R;

export function yearSelect(years, selected, action, { withAll = false } = {}) {
  // O ano escolhido sempre aparece, mesmo que tenha ficado sem livros.
  if (typeof selected === 'number' && !years.includes(selected)) years = [...years, selected].sort((a, b) => b - a);
  let options = years.map((y) => `<option value="${y}"${y === selected ? ' selected' : ''}>${y}</option>`).join('');
  if (withAll) options += `<option value="todos"${selected === 'todos' ? ' selected' : ''}>Todos os anos</option>`;
  return `<label class="year-pill"><span class="sr-only">Ano</span><select data-change="${action}">${options}</select>${icon('chevronDown', { size: 16, stroke: 2 })}</label>`;
}

// ---------- Mosaico (bento): meta, páginas, nota e dias ----------

function ringTile(stats, streak, isCurrentYear) {
  const dash = (RING_C * stats.progress).toFixed(1);
  const pct = Math.round(stats.progress * 100);
  let line;
  if (stats.remaining === 0) line = 'Meta batida!';
  else if (isCurrentYear) line = `<span class="bento-pct">${pct}%</span> · faltam ${stats.remaining}`;
  else line = `<span class="bento-pct">${pct}%</span> · faltaram ${stats.remaining}`;
  const streakChip = isCurrentYear && streak.current > 0
    ? `<span class="pill-accent bento-streak">${icon('flame', { size: 13 })}${streak.current === 1 ? '1 mês na meta' : `${streak.current} meses seguidos`}</span>`
    : `<span class="pill-muted bento-streak">${plural(stats.monthlyTarget, 'livro', 'livros')} por mês</span>`;
  // Sem livros: sem o arco (com a ponta arredondada, um traço de tamanho zero vira um ponto).
  return `
    <div class="tile bento-ring hero">
      <span class="eyebrow">Meta ${stats.year}</span>
      <div class="ring">
        <svg viewBox="0 0 120 120" role="img" aria-label="${stats.count} de ${stats.goal} livros da meta">
          <circle cx="60" cy="60" r="${RING_R}" fill="none" stroke="var(--line-strong)" stroke-width="11"/>
          ${stats.progress > 0 ? `<circle cx="60" cy="60" r="${RING_R}" fill="none" stroke="var(--accent)" stroke-width="11" stroke-linecap="round"
            stroke-dasharray="${dash} ${RING_C.toFixed(1)}" transform="rotate(-90 60 60)" class="ring-progress"/>` : ''}
        </svg>
        <div class="ring-center" aria-hidden="true"><span class="ring-count" data-count="${stats.count}">${stats.count}</span><span class="ring-sub">de ${stats.goal}</span></div>
      </div>
      <span class="bento-line">${line}</span>
      ${streakChip}
    </div>`;
}

function pagesTile(state, stats, today) {
  const goal = getPageGoal(state, stats.year);
  const value = stats.pages ? `<span class="tile-value" data-count="${Math.round(stats.pages)}">${num(stats.pages)}</span>` : '<span class="tile-value">—</span>';
  // Audiolivros: as horas ouvidas numa linha discreta sob as páginas.
  const listened = minutesListenedInYear(state.books, stats.year);
  const heard = listened ? `<span class="bento-heard" aria-label="${esc(`${formatDuration(listened)} ouvidas`)}">${headphonesIcon(12)}${hoursText(listened)} h ouvidas</span>` : '';
  if (!goal) return `<div class="tile bento-pages">${value}<span class="tile-label">páginas</span>${heard}</div>`;
  const p = pageGoalProgress(stats.pages, goal, stats.year, today);
  const note = p.met ? 'meta batida' : p.projection ? `ritmo de ~${num(p.projection)}` : '';
  return `
    <div class="tile bento-pages">
      ${value}<span class="tile-label">de ${num(goal)} págs.</span>
      <div class="hero-pages">
        <span class="hero-pages-track" role="img" aria-label="${esc(pageGoalLine(p))}"><span class="hero-pages-fill" style="width:${(p.progress * 100).toFixed(1)}%"></span></span>
        ${note ? `<span class="hero-pages-text">${esc(note)}</span>` : ''}
      </div>
      ${heard}
    </div>`;
}

function bento(state, stats, streak, isCurrentYear, today) {
  const rating = stats.avgRating
    ? `<span class="tile-value"><span data-count="${stats.avgRating.toFixed(1)}" data-decimals="1">${stats.avgRating.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}</span>${icon('star', { size: 15, cls: 'accent' })}</span>`
    : '<span class="tile-value">—</span>';
  const days = stats.avgDays ? `<span class="tile-value" data-count="${Math.round(stats.avgDays)}">${Math.round(stats.avgDays)}</span>` : '<span class="tile-value">—</span>';
  return `
    <section class="bento" aria-label="Números de ${stats.year}">
      ${ringTile(stats, streak, isCurrentYear)}
      ${pagesTile(state, stats, today)}
      <div class="tile">${rating}<span class="tile-label">nota média</span></div>
      <div class="tile">${days}<span class="tile-label">dias por livro</span></div>
    </section>`;
}

// ---------- "Lendo agora" ----------

/** '3 nov'; em outro ano, '3 jan 2027'. */
function shortDate(iso, today) {
  return iso.slice(0, 4) === today.slice(0, 4) ? formatShort(iso) : `${formatShort(iso)} ${iso.slice(0, 4)}`;
}

/** "pág. 264 de 420 · termina ~3 nov" (ou "38% no Kindle · …"). */
function progressLine(b, today) {
  const p = progressOf(b);
  // Audiolivro: os fones de ouvido antes do tempo ouvido.
  const lead = b.format === FORMATS.AUDIO ? headphonesIcon(13, 'rn-audio') : '';
  if (!p) return `<span class="rn-progress muted">${lead}${registerHint(b)}</span>`;
  const where = b.format === FORMATS.KINDLE ? `${p.pct}% no Kindle` : p.label;
  // Sem o total de páginas (ou a duração) não há % nem previsão.
  // O pedido é um link: abre a edição com o cursor no campo Páginas (ou Duração).
  if (p.pct === null) {
    const ask = p.audio ? ['campo=duracao', 'informe a duração'] : ['campo=paginas', 'informe o total de páginas'];
    return `<span class="rn-progress">${lead}${esc(where)} <span class="muted">· <a class="pages-ask" href="${editHref(b.id, ask[0])}">${ask[1]}</a> para ver o %</span></span>`;
  }
  const finish = forecastFinish(b, today);
  return `<span class="rn-progress">${lead}${esc(where)}${finish ? ` · <span class="nowrap">termina ~${esc(shortDate(finish, today))}</span>` : ''}</span>`;
}

// Só com data-alvo: quanto ler por dia (sem tom de cobrança).
function targetLine(b, today) {
  const { target } = paceLines(b, today);
  return target ? `<p class="pace-line"><span>${esc(target)}</span></p>` : '';
}

function moreButton(b) {
  return `<button type="button" class="rn-icon rn-more" data-action="quick-menu" data-id="${esc(b.id)}" aria-label="Mais ações: ${esc(b.title)}">${GLYPHS.more}</button>`;
}

function timerButton(b, session) {
  const running = session?.bookId === b.id;
  const verb = b.format === FORMATS.AUDIO ? 'Ouvir agora' : 'Ler agora';
  return `<button type="button" class="rn-icon btn-timer${running ? ' is-running' : ''}" data-action="start-timer" data-id="${esc(b.id)}">${GLYPHS.play}<span class="sr-only">${running ? `${verb}: voltar ao cronômetro` : verb}</span></button>`;
}

// Só o primeiro cartão tem o botão cheio; nos outros ele é tonal (mesmo tamanho, menos peso).
function readingCard(b, session, today, primary = true) {
  const p = progressOf(b);
  const done = p?.pct === 100;
  const cls = primary ? 'btn-primary rn-main' : 'btn-tonal rn-main';
  const main = done
    ? `<a class="${cls}" href="${finishHref(b.id)}">${icon('check', { size: 18, stroke: 2.2 })}Concluir</a>`
    : `<button type="button" class="${cls}" data-action="update-page" data-id="${esc(b.id)}">Registrar leitura</button>`;
  return `
    <article class="card reading" data-tint="${esc(b.cover || '')}" data-tint-title="${esc(b.title)}" data-longpress data-id="${esc(b.id)}">
      <div class="rn-top">
        <span class="rn-cover">${cover(b, { size: 'md' })}${p?.pct != null ? progressRing(p.pct) : ''}</span>
        <div class="rn-text">
          <a class="reading-link" href="#/livro/${encodeURIComponent(b.id)}"><span class="serif-title">${esc(b.title)}</span></a>
          <span class="rn-author">${esc(b.authors || 'Autor não informado')}</span>
          ${progressLine(b, today)}
          ${targetLine(b, today)}
        </div>
      </div>
      <div class="rn-actions">${main}${timerButton(b, session)}${moreButton(b)}</div>
    </article>`;
}

function readingNow(books, session, today) {
  if (!books.length) return '';
  return `
    <section class="section">
      <div class="section-head"><h2>Lendo agora</h2><span class="muted small">${plural(books.length, 'livro', 'livros')}</span></div>
      ${books.map((b, i) => readingCard(b, session, today, i === 0)).join('')}
    </section>`;
}

// Sem leitura em andamento: sugere o primeiro da lista de próximas.
function nextUpCard(state) {
  const b = firstUpNext(state);
  if (!b) return '';
  return `
    <section class="section">
      <div class="section-head"><h2>Próxima leitura</h2><a class="link" href="#/estante?aba=quero">Ver fila</a></div>
      <article class="card reading next-up" data-tint="${esc(b.cover || '')}" data-tint-title="${esc(b.title)}" data-longpress data-id="${esc(b.id)}">
        <div class="rn-top">
          <span class="rn-cover">${cover(b, { size: 'md' })}</span>
          <div class="rn-text">
            <a class="reading-link" href="#/livro/${encodeURIComponent(b.id)}"><span class="serif-title">${esc(b.title)}</span></a>
            <span class="rn-author">${esc(b.authors || 'Autor não informado')}</span>
            ${b.format === FORMATS.AUDIO && b.durationMin ? `<span class="rn-progress muted">${headphonesIcon(13, 'rn-audio')}${esc(formatDuration(b.durationMin))}</span>`
    : b.pages ? `<span class="rn-progress muted">${num(b.pages)} páginas</span>` : ''}
          </div>
        </div>
        <div class="rn-actions">
          <button type="button" class="btn-primary rn-main" data-action="start-reading" data-id="${esc(b.id)}">Começar a ler</button>${moreButton(b)}
        </div>
      </article>
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
      <span class="grid-meta"><span class="grid-month">${esc(formatShort(b.endDate))}</span>${b.rating ? `<span class="grid-rating" aria-label="Nota ${formatRating(b.rating)}">${icon('star', { size: 11 })}${formatRating(b.rating)}</span>` : ''}</span>
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

// ---------- Saudação (v1.5) ----------

/** "quarta, 28 de outubro": o dia da semana à parte (no iPhone SE a data fica em duas linhas). */
function dateParts(text) {
  const cut = text.indexOf(', ');
  return cut < 0 ? esc(text) : `<span class="greet-wd">${esc(text.slice(0, cut + 1))}</span> ${esc(text.slice(cut + 2))}`;
}

/** "Boa noite, Pedro" + a data de hoje + a sequência de dias lendo. O nome é só deste aparelho. */
function greetingHeader(state, ui, today, now, controls) {
  const name = ui?.userName || '';
  const hello = greetingFor(now.getHours());
  const streak = streakText(currentDayStreak(readingDays(state.books), today));
  return `
    <header class="greet">
      <div class="greet-row">
        <span class="greet-date">${dateParts(longDate(today))}</span>
        <div class="top-actions">${controls}</div>
      </div>
      <h1 class="greet-title" data-large-title>${esc(hello)}${name ? `, <em class="greet-name">${esc(name)}</em>` : ''}</h1>
      ${streak ? `<p class="greet-streak"><span class="greet-dot" aria-hidden="true"></span>${esc(streak)}</p>` : ''}
    </header>`;
}

export function homeView({ state, ui, year, today, now = new Date() }) {
  const currentYear = yearOf(today);
  const stats = yearStats(state.books, year, getGoal(state, year), today);
  const streak = goalStreak(state.books, (y) => getGoal(state, y), today);
  const reading = state.books.filter((b) => b.status === STATUS.READING);
  const counts = countByStatus(state.books);
  const settings = `<a class="icon-btn" href="#/ajustes" aria-label="Ajustes">${icon('cog', { size: 20 })}</a>`;
  return `
    ${greetingHeader(state, ui, today, now, `${yearSelect(yearsWithData(state.books, currentYear), year, 'home-year')}${settings}`)}
    ${compactBar({ title: year === currentYear ? 'Leituras' : `Leituras ${year}`, end: settings })}
    ${timerBanner(state.books, ui?.session)}
    ${bento(state, stats, streak, year === currentYear, today)}
    ${year === currentYear ? readingNow(reading, ui?.session, today) : ''}
    ${year === currentYear && !reading.length ? nextUpCard(state) : ''}
    ${readGrid(stats)}
    ${counts[STATUS.WANT] || year === currentYear ? wantTeaser(state.books) : ''}
    ${year === currentYear ? suggestTeaser() : ''}`;
}
