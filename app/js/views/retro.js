import { monthOf, yearOf } from '../dates.js';
import { FORMATS, getGoal } from '../store.js';
import { monthsMetInYear, yearStats } from '../stats.js';
import { cover, decimal, esc, icon, num, plural, stars } from '../ui.js';

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
  return {
    s,
    isCurrent,
    monthsMet: monthsMetInYear(s.byMonth, s.monthlyTarget),
    monthsElapsed: isCurrent ? monthOf(today) + 1 : 12,
    book: bookOfTheYear(s),
  };
}

function slides(d, year) {
  const { s } = d;
  const goalLine = s.count >= s.goal
    ? 'Meta cumprida.'
    : `de ${s.goal} da meta.`;
  const list = [];
  list.push(`
    <div class="slide">
      <span class="eyebrow">${d.isCurrent ? `Em ${year}, até agora, você leu` : `Em ${year} você leu`}</span>
      <span class="retro-huge accent">${s.count}</span>
      <span class="retro-line">${s.count === 1 ? 'livro' : 'livros'}. <em>${goalLine}</em></span>
      <span class="pill-accent lg">${icon('flame', { size: 14 })}${d.monthsMet} de ${d.monthsElapsed} meses com a meta batida</span>
    </div>`);
  if (s.pages) {
    list.push(`
      <div class="slide">
        <span class="eyebrow">Páginas viradas</span>
        <span class="retro-big accent">${num(s.pages)}</span>
        <span class="retro-line">Cerca de <em>${plural(Math.max(1, Math.round(s.pagesPerDay)), 'página', 'páginas')} por dia</em>${d.isCurrent ? ' até aqui.' : ', o ano inteiro.'}</span>
        <div class="tiles tiles-2 retro-tiles">
          <div class="tile dark"><span class="tile-value">${s.avgDays ? Math.round(s.avgDays) : '—'}</span><span class="tile-label">dias por livro, em média</span></div>
          <div class="tile dark"><span class="tile-value">${s.avgRating ? decimal(s.avgRating) : '—'}</span><span class="tile-label">nota média</span></div>
        </div>
      </div>`);
  }
  const genre = s.genres[0];
  const author = s.authors[0];
  const phys = s.formats[FORMATS.PHYSICAL];
  const kin = s.formats[FORMATS.KINDLE];
  list.push(`
    <div class="slide gap-lg">
      ${genre ? `<div class="retro-block"><span class="eyebrow">Gênero favorito</span><span class="retro-mid accent">${esc(genre.label)}</span><span class="muted">${genre.count} de ${plural(s.count, 'livro', 'livros')}</span></div>` : ''}
      ${author ? `<div class="retro-block"><span class="eyebrow">Autor mais lido</span><span class="retro-name">${esc(author.label)}</span><span class="muted">${plural(author.count, 'livro', 'livros')}</span></div>` : ''}
      <div class="retro-block"><span class="eyebrow">Formato</span><span class="retro-format">${plural(phys, 'físico', 'físicos')} <span class="faint">·</span> <em>${kin} no Kindle</em></span></div>
    </div>`);
  if (d.book) {
    const quote = firstSentence(d.book.notes);
    list.push(`
      <div class="slide center">
        <span class="eyebrow">Livro do ano</span>
        ${cover(d.book, { size: 'xl' })}
        <span class="retro-name">${esc(d.book.title)}</span>
        ${stars(d.book.rating, { size: 20 })}
        ${quote ? `<span class="retro-quote">“${esc(quote)}”</span>` : ''}
      </div>`);
  }
  return list;
}

export function retroView({ state, year, today, ui }) {
  const d = retroData(state, year, today);
  if (!d.s.count) {
    return `
      <div class="retro">
        <div class="retro-top"><span class="retro-brand">Leituras <em>${year}</em></span><a class="icon-btn dark" href="#/resumo/${year}" aria-label="Fechar">${icon('close', { size: 18, stroke: 2 })}</a></div>
        <div class="retro-stage"><div class="slide"><span class="retro-line">Nenhum livro concluído em ${year} ainda.</span></div></div>
      </div>`;
  }
  const all = slides(d, year);
  const index = Math.min(ui.retroSlide, all.length - 1);
  const segments = all.map((_, i) => `<span class="seg${i <= index ? ' on' : ''}"></span>`).join('');
  return `
    <div class="retro">
      <div class="segments">${segments}</div>
      <div class="retro-top"><span class="retro-brand">Leituras <em>${year}</em></span><a class="icon-btn dark" href="#/resumo/${year}" aria-label="Fechar">${icon('close', { size: 18, stroke: 2 })}</a></div>
      <div class="retro-stage" aria-live="polite">
        ${all[index]}
        <button type="button" class="tap tap-prev" data-action="retro-prev" aria-label="Anterior"></button>
        <button type="button" class="tap tap-next" data-action="retro-next" data-max="${all.length - 1}" aria-label="Próximo"></button>
      </div>
      <div class="retro-actions">
        <button type="button" class="btn-ghost" data-action="retro-save">${icon('download', { size: 18, stroke: 2 })}Salvar imagem</button>
        <button type="button" class="btn-primary sm" data-action="retro-share">${icon('upload', { size: 18, stroke: 2.2 })}Compartilhar</button>
      </div>
    </div>`;
}
