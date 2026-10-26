// Marcos na tela: seção de Todos os anos e lista usada na retrospectiva.

import { formatShort } from '../dates.js';
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

// ---------- Todos os anos: marcos como medalhas (v1.4) ----------

const nf = new Intl.NumberFormat('pt-BR');

/** Rosto da medalha: numeral ou sigla curta em serifa ("10", "1k", "500+") ou ícone. */
export function medalFace(m) {
  const n = /^(books|pages)-(\d+)$/.exec(m.id);
  if (n && m.kind === 'books') return { text: n[2], caption: `${n[2]}º livro` };
  if (n && m.kind === 'pages') {
    const v = Number(n[2]);
    return { text: `${v / 1000}k`, caption: `${nf.format(v)} págs.` };
  }
  if (m.kind === 'big') return { text: '500+', caption: 'Livro de 500+' };
  if (m.kind === 'day') return { icon: 'day', caption: 'Em um só dia' };
  if (m.kind === 'genre') return { icon: 'genre', caption: m.title.replace(/^Novo gênero: /, '') };
  return { icon: m.kind, caption: m.title };
}

/** "20 jan 2026" a partir da data do marco. */
function medalDate(iso) {
  return iso ? `${formatShort(iso)} ${iso.slice(0, 4)}` : '';
}

function leftText(m) {
  if (m.left === null || m.left === undefined) return 'a conquistar';
  return m.kind === 'pages' ? `faltam ${nf.format(m.left)}` : `${m.left === 1 ? 'falta' : 'faltam'} ${m.left}`;
}

function medal(m, upcoming) {
  const f = medalFace(m);
  const face = f.text
    ? `<span class="medal-num${f.text.length > 3 ? ' is-long' : ''}">${esc(f.text)}</span>`
    : milestoneIcon(f.icon, 22);
  const sub = upcoming ? leftText(m) : medalDate(m.date);
  // O toque mostra o detalhe logo abaixo da fileira (sem redesenhar: a rolagem fica onde está).
  return `
    <li>
      <button type="button" class="medal-item${upcoming ? ' is-next' : ''}" data-action="medal" aria-pressed="false"
        data-title="${esc(m.title)}" data-detail="${esc(m.detail)}"${m.bookId ? ` data-book="${esc(m.bookId)}"` : ''}>
        <span class="medal${upcoming ? ' is-off' : ''}" aria-hidden="true">${face}</span>
        <span class="medal-caption">${esc(f.caption)}</span>
        <span class="medal-sub">${esc(sub)}</span>
      </button>
    </li>`;
}

/** Seção "Marcos" de Todos os anos: conquistados (mais recentes primeiro) e os próximos, pontilhados. */
export function milestonesSection(books) {
  const all = milestones(books).reverse();
  const next = upcomingMilestones(books);
  if (!all.length && !next.length) return '';
  return `
    <section class="card milestones">
      <div class="section-head"><h2>Marcos</h2><span class="muted small">${all.length === 1 ? '1 alcançado' : `${all.length} alcançados`}</span></div>
      ${all.length ? `<ul class="medals" aria-label="Marcos alcançados">${all.map((m) => medal(m, false)).join('')}</ul>` : ''}
      ${next.length ? `<span class="eyebrow">Próximos</span><ul class="medals" aria-label="Próximos marcos">${next.map((m) => medal(m, true)).join('')}</ul>` : ''}
      <p class="medal-detail muted small" aria-live="polite" data-medal-detail>Toque numa medalha para ver o livro e a data.</p>
    </section>`;
}
