import { monthName, monthOf, yearOf } from '../dates.js';
import { longestDayStreak, readingDays } from '../journal.js';
import { BIG_BOOK_PAGES, milestonesInYear } from '../milestones.js';
import {
  RETRO_MIN_BOOKS, longestAndShortest, readerProfile, stackHeight, strongestMonth,
} from '../retro-stats.js';
import { FORMATS, getGoal } from '../store.js';
import { monthsMetInYear, yearStats } from '../stats.js';
import { cover, esc, icon, num, plural, stars } from '../ui.js';
import { milestoneList } from './marcos.js';

/** O livro do ano: o favorito; sem favorito, o de maior nota mais recente. */
export function bookOfTheYear(s) {
  if (s.favorite) return s.favorite;
  return [...s.books].sort((a, b) => (b.rating || 0) - (a.rating || 0))[0] || null;
}

export function firstSentence(notes, max = 140) {
  const t = (notes || '').trim().split(/\n/)[0];
  if (!t) return '';
  return t.length > max ? `${t.slice(0, max - 1).trimEnd()}…` : t;
}

/** Dados da retrospectiva, compartilhados entre a tela e a imagem. */
export function retroData(state, year, today) {
  const s = yearStats(state.books, year, getGoal(state, year), today);
  const isCurrent = year === yearOf(today);
  const monthsMet = monthsMetInYear(s.byMonth, s.monthlyTarget);
  return {
    s,
    isCurrent,
    monthsMet,
    monthsElapsed: isCurrent ? monthOf(today) + 1 : 12,
    book: bookOfTheYear(s),
    // Capas do mosaico: as 12 mais recentes, na ordem em que foram lidas.
    covers: s.books.slice(0, 12).reverse(),
    stack: stackHeight(s.pages),
    extremes: longestAndShortest(state.books, year),
    month: strongestMonth(state.books, year),
    streak: longestDayStreak([...readingDays(state.books, year)]),
    milestones: milestonesInYear(state.books, year),
    profile: readerProfile({
      count: s.count,
      bigBooks: s.books.filter((b) => (Number(b.pages) || 0) >= BIG_BOOK_PAGES).length,
      monthsMet,
      genres: s.genres.length,
      avgDays: s.avgDays,
      formats: s.formats,
    }),
  };
}

function mosaicSlide(d, year) {
  const n = d.covers.length;
  // Colunas para o mosaico ficar cheio: 3 → 3, 4 → 2×2, até 9 → 3, acima → 4.
  const cols = n <= 3 ? n : n === 4 ? 2 : n <= 9 ? 3 : 4;
  // Linhas: a altura das capas acompanha a da tela (iPhone SE), e a última linha fica centralizada.
  const rows = Math.ceil(n / cols);
  return `
    <div class="slide center">
      <div class="retro-mosaic" style="--cols:${cols};--rows:${rows}">${d.covers.map((b) => cover(b, { size: 'fill' })).join('')}</div>
      <span class="retro-line">Seu <em class="accent">${year}</em> em livros</span>
    </div>`;
}

function countSlide(d, year) {
  const { s } = d;
  // Mesmo texto da imagem: "7 livros. Meta: 12." (frase nova, com maiúscula).
  const goalLine = s.count >= s.goal ? 'Meta cumprida.' : `Meta: ${s.goal}.`;
  return `
    <div class="slide">
      <span class="eyebrow">${d.isCurrent ? `Em ${year}, até agora, você leu` : `Em ${year} você leu`}</span>
      <span class="retro-huge accent">${s.count}</span>
      <span class="retro-line">${s.count === 1 ? 'livro' : 'livros'}. <em>${goalLine}</em></span>
      <span class="pill-accent lg">${icon('flame', { size: 14 })}${d.monthsMet} de ${d.monthsElapsed} meses com a meta batida</span>
    </div>`;
}

function pagesSlide(d) {
  const { s, stack } = d;
  if (!s.pages) return '';
  return `
    <div class="slide">
      <span class="eyebrow">Páginas viradas</span>
      <span class="retro-big accent">${num(s.pages)}</span>
      <span class="retro-line">Cerca de <em>${plural(Math.max(1, Math.round(s.pagesPerDay)), 'página', 'páginas')} por dia</em>${d.isCurrent ? ' até aqui.' : ', o ano inteiro.'}</span>
      ${stack.cm >= 1 ? `<span class="retro-note">Sua pilha de livros teria <strong>${num(stack.cm)} cm</strong> de altura${stack.comparison ? ` — ${stack.comparison}` : ''}.</span>` : ''}
    </div>`;
}

function extremeRow(label, b) {
  return `
    <div class="retro-pair">
      ${cover(b, { size: 'lg' })}
      <span class="retro-block">
        <span class="eyebrow">${label}</span>
        <span class="retro-title">${esc(b.title)}</span>
        <span class="muted">${num(b.pages)} páginas</span>
      </span>
    </div>`;
}

function extremesSlide(d) {
  if (!d.extremes) return '';
  return `
    <div class="slide gap-lg">
      ${extremeRow('O mais longo', d.extremes.longest)}
      ${extremeRow('O mais curto', d.extremes.shortest)}
    </div>`;
}

function monthSlide(d) {
  // Um livro por mês não faz um mês "mais forte".
  if (!d.month || d.month.count < 2) return '';
  const max = Math.max(...d.s.byMonth, 1);
  const bars = d.s.byMonth.map((n, i) => `<span class="retro-mbar${i === d.month.month ? ' on' : ''}" style="height:${Math.max(4, Math.round((n / max) * 64))}px"></span>`).join('');
  return `
    <div class="slide">
      <span class="eyebrow">Seu mês mais forte</span>
      <span class="retro-mid accent">${monthName(d.month.month).toLowerCase()}</span>
      <span class="retro-line">${plural(d.month.count, 'livro', 'livros')} terminados.</span>
      <span class="retro-months" aria-hidden="true">${bars}</span>
    </div>`;
}

function streakSlide(d) {
  if (d.streak < 2) return '';
  return `
    <div class="slide">
      <span class="eyebrow">Maior sequência de leitura</span>
      <span class="retro-huge accent">${d.streak}</span>
      <span class="retro-line">dias seguidos <em>com leitura registrada.</em></span>
    </div>`;
}

function tasteSlide(d) {
  const { s } = d;
  const genre = s.genres[0];
  const author = s.authors[0];
  const phys = s.formats[FORMATS.PHYSICAL];
  const kin = s.formats[FORMATS.KINDLE];
  return `
    <div class="slide gap-lg">
      ${genre ? `<div class="retro-block"><span class="eyebrow">Gênero favorito</span><span class="retro-mid accent">${esc(genre.label)}</span><span class="muted">${genre.count} de ${plural(s.count, 'livro', 'livros')}</span></div>` : ''}
      ${author ? `<div class="retro-block"><span class="eyebrow">Autor mais lido</span><span class="retro-name">${esc(author.label)}</span><span class="muted">${plural(author.count, 'livro', 'livros')}</span></div>` : ''}
      <div class="retro-block"><span class="eyebrow">Formato</span><span class="retro-format">${plural(phys, 'físico', 'físicos')} <span class="faint">·</span> <em>${kin} no Kindle</em></span></div>
    </div>`;
}

// No slide cabem poucos marcos; os gêneros novos viram uma linha só.
const MILESTONES_SHOWN = 5;

function milestonesSlide(d, year) {
  if (!d.milestones.length) return '';
  const genres = d.milestones.filter((m) => m.kind === 'genre');
  const rows = d.milestones.filter((m) => m.kind !== 'genre').reverse();
  if (genres.length === 1) rows.push(genres[0]);
  if (genres.length > 1) {
    const names = genres.map((m) => m.title.replace(/^Novo gênero: /, ''));
    rows.push({ kind: 'genre', title: `${genres.length} gêneros novos`, detail: names.join(', ') });
  }
  const shown = rows.slice(0, MILESTONES_SHOWN);
  const more = rows.length - shown.length;
  return `
    <div class="slide retro-miles">
      <span class="eyebrow">Marcos de ${year}</span>
      ${milestoneList(shown)}
      ${more ? `<span class="muted small">E mais ${plural(more, 'marco', 'marcos')}.</span>` : ''}
    </div>`;
}

function profileSlide(d) {
  const p = d.profile;
  return `
    <div class="slide">
      <span class="eyebrow">Seu perfil de leitor</span>
      <span class="retro-mid accent">${esc(p.title)}</span>
      <span class="retro-line">${esc(p.reason)}</span>
      <span class="retro-note faint">Regra: ${esc(p.rule)}.</span>
    </div>`;
}

function bookSlide(d) {
  if (!d.book) return '';
  const quote = firstSentence(d.book.notes);
  return `
    <div class="slide center">
      <span class="eyebrow">Livro do ano</span>
      ${cover(d.book, { size: 'xl' })}
      <span class="retro-name retro-book-name${d.book.title.length > 40 ? ' is-long' : ''}">${esc(d.book.title)}</span>
      ${stars(d.book.rating, { size: 20 })}
      ${quote ? `<span class="retro-quote">“${esc(quote)}”</span>` : ''}
    </div>`;
}

/** Uma ideia por slide; slides sem dados ficam de fora. */
function slides(d, year) {
  return [
    mosaicSlide(d, year),
    countSlide(d, year),
    pagesSlide(d),
    extremesSlide(d),
    monthSlide(d),
    streakSlide(d),
    tasteSlide(d),
    milestonesSlide(d, year),
    profileSlide(d),
    bookSlide(d),
  ].filter(Boolean);
}

function closeTop(year) {
  return `<div class="retro-top"><span class="retro-brand">Leituras <em>${year}</em></span><a class="icon-btn dark" href="#/resumo/${year}" aria-label="Fechar">${icon('close', { size: 18, stroke: 2 })}</a></div>`;
}

function formatToggle(current) {
  const btn = (value, label) => `<button type="button" class="seg-btn${current === value ? ' is-on' : ''}" data-action="retro-format" data-value="${value}" aria-pressed="${current === value}">${label}</button>`;
  return `<div class="segmented retro-format-toggle" style="--seg-count:2" role="group" aria-label="Formato da imagem">${btn('story', 'Story')}${btn('square', 'Quadrado')}</div>`;
}

export function retroView({ state, year, today, ui }) {
  const d = retroData(state, year, today);
  if (d.s.count < RETRO_MIN_BOOKS) {
    const left = RETRO_MIN_BOOKS - d.s.count;
    return `
      <div class="retro">
        ${closeTop(year)}
        <div class="retro-stage"><div class="slide retro-gate">
          <span class="retro-line">Termine ${RETRO_MIN_BOOKS} livros para ver sua retrospectiva de ${year}</span>
          <span class="muted">${d.s.count ? `${left === 1 ? 'Falta 1' : `Faltam ${left}`}.` : 'Nenhum livro concluído ainda.'}</span>
        </div></div>
      </div>`;
  }
  const all = slides(d, year);
  const index = Math.min(ui.retroSlide, all.length - 1);
  const segments = all.map((_, i) => `<span class="seg${i <= index ? ' on' : ''}"></span>`).join('');
  return `
    <div class="retro">
      <div class="segments">${segments}</div>
      ${closeTop(year)}
      <div class="retro-stage" aria-live="polite">
        ${all[index]}
        <button type="button" class="tap tap-prev" data-action="retro-prev" aria-label="Anterior"></button>
        <button type="button" class="tap tap-next" data-action="retro-next" data-max="${all.length - 1}" aria-label="Próximo"></button>
      </div>
      <div class="retro-actions">
        ${formatToggle(ui.retroFormat === 'square' ? 'square' : 'story')}
        <button type="button" class="btn-ghost" data-action="retro-save">${icon('download', { size: 18, stroke: 2 })}Salvar</button>
        <button type="button" class="btn-primary sm" data-action="retro-share">${icon('upload', { size: 18, stroke: 2.2 })}Compartilhar</button>
      </div>
    </div>`;
}
