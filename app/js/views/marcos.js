// Marcos na tela: seção de Todos os anos e lista usada na retrospectiva.

import { milestones, upcomingMilestones } from '../milestones.js';
import { esc } from '../ui.js';

// Ícones de traço próprios dos marcos (ficam aqui para não mexer nos ícones gerais).
const ICONS = {
  books: '<path d="M5 4h4v16H5zM10 4h4v16h-4zM15.5 5l2.8-.8 3.6 15.4-2.8.8z"/>',
  pages: '<path d="M3 8l9-4.5L21 8l-9 4.5z"/><path d="M3 12.5l9 4.5 9-4.5"/><path d="M3 17l9 4.5 9-4.5"/>',
  big: '<path d="M3 20l6.5-11 4 6.5 2.5-4L21 20z"/>',
  day: '<circle cx="12" cy="12" r="4"/><path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M5.3 18.7l1.4-1.4M17.3 6.7l1.4-1.4"/>',
  genre: '<circle cx="12" cy="12" r="9"/><path d="M15.5 8.5l-2 5-5 2 2-5z"/>',
};

export function milestoneIcon(kind, size = 18) {
  return `<svg class="icon" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[kind] || ICONS.books}</svg>`;
}

function row(m, upcoming = false) {
  return `
    <li class="mile${upcoming ? ' is-next' : ''}">
      <span class="mile-icon">${milestoneIcon(m.kind)}</span>
      <span class="mile-text"><span class="mile-title">${esc(m.title)}</span><span class="mile-detail">${esc(m.detail)}</span></span>
    </li>`;
}

/** Lista de marcos; upcoming = próximos, em tom discreto. */
export function milestoneList(list, { upcoming = false } = {}) {
  return `<ul class="mile-list">${list.map((m) => row(m, upcoming)).join('')}</ul>`;
}

// Gêneros novos podem ser muitos: na tela aparecem só os mais recentes.
const GENRES_SHOWN = 3;

/** Seção "Marcos" de Todos os anos. */
export function milestonesSection(books) {
  const all = milestones(books).reverse();
  if (!all.length) return '';
  const genres = all.filter((m) => m.kind === 'genre');
  const shown = all.filter((m) => m.kind !== 'genre' || genres.indexOf(m) < GENRES_SHOWN);
  const hidden = genres.length - Math.min(genres.length, GENRES_SHOWN);
  const next = upcomingMilestones(books);
  return `
    <section class="card milestones">
      <div class="section-head"><h2>Marcos</h2><span class="muted small">${all.length === 1 ? '1 alcançado' : `${all.length} alcançados`}</span></div>
      ${milestoneList(shown)}
      ${hidden ? `<p class="muted small">E mais ${hidden === 1 ? '1 gênero descoberto' : `${hidden} gêneros descobertos`}.</p>` : ''}
      ${next.length ? `<span class="eyebrow">Próximos</span>${milestoneList(next, { upcoming: true })}` : ''}
    </section>`;
}
