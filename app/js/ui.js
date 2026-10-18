// Peças de interface reutilizadas pelas telas. Todo texto vindo de dados passa por esc().

import { formatShort } from './dates.js';
import { seriesLabel } from './series.js';
import { FORMAT_LABELS, FORMATS, STATUS } from './store.js';

const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

export function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, (c) => ESC[c]);
}

export function plural(n, one, many) {
  return `${n} ${n === 1 ? one : many}`;
}

const nf = new Intl.NumberFormat('pt-BR');
export function num(n) {
  return nf.format(Math.round(n));
}

export function decimal(n, digits = 1) {
  return n.toLocaleString('pt-BR', { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

const PATHS = {
  chevronDown: '<path d="M6 9l6 6 6-6"/>',
  chevronLeft: '<path d="M15 6l-6 6 6 6"/>',
  chevronRight: '<path d="M9 6l6 6-6 6"/>',
  sliders: '<path d="M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12"/><circle cx="16" cy="6" r="2"/><circle cx="10" cy="12" r="2"/><circle cx="18" cy="18" r="2"/>',
  home: '<path d="M4 11l8-7 8 7v9a1 1 0 0 1-1 1h-5v-6h-4v6H5a1 1 0 0 1-1-1z"/>',
  shelf: '<path d="M5 4h3v16H5zM10 4h3v16h-3zM15.5 5l2.8-.8 3.6 15.4-2.8.8z"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  chart: '<path d="M5 20V10M12 20V4M19 20v-7"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="M20 20l-4-4"/>',
  close: '<path d="M6 6l12 12M18 6L6 18"/>',
  check: '<path d="M5 12l5 5 9-10"/>',
  download: '<path d="M12 4v11M7 10l5 5 5-5M5 20h14"/>',
  upload: '<path d="M12 15V4M7 9l5-5 5 5M5 14v5a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-5"/>',
  trash: '<path d="M4 7h16M10 11v6M14 11v6M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12M9 7V4h6v3"/>',
  phone: '<rect x="7" y="2" width="10" height="20" rx="2"/><path d="M11 18h2"/>',
  book: '<path d="M4 5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2z"/><path d="M4 21a2 2 0 0 1 2-2h13v2z"/>',
};
const FILLED = {
  star: '<path d="M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9z"/>',
  heart: '<path d="M12 21s-7.5-4.6-9.3-9.2C1.4 8.4 3.6 5 7 5c2 0 3.6 1.1 5 3 1.4-1.9 3-3 5-3 3.4 0 5.6 3.4 4.3 6.8C19.5 16.4 12 21 12 21z"/>',
  flame: '<path d="M12 3c1 3.5 5 5.5 5 10a5 5 0 0 1-10 0c0-2.5 1.5-4 2.5-5 .3 1.6 1 2.5 2 3 0-3-.5-5.5.5-8z"/>',
};

/** Ícone SVG decorativo. Para ícones com significado, use label. */
export function icon(name, { size = 20, stroke = 1.8, cls = '', label = '', fill = null } = {}) {
  const a11y = label ? `role="img" aria-label="${esc(label)}"` : 'aria-hidden="true"';
  if (FILLED[name]) {
    const f = fill ?? 'currentColor';
    return `<svg class="icon ${cls}" width="${size}" height="${size}" viewBox="0 0 24 24" fill="${f}" stroke="${fill === 'none' ? 'currentColor' : 'none'}" stroke-width="1.8" stroke-linejoin="round" ${a11y}>${FILLED[name]}</svg>`;
  }
  return `<svg class="icon ${cls}" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${stroke}" stroke-linecap="round" stroke-linejoin="round" ${a11y}>${PATHS[name]}</svg>`;
}

const COVER_PALETTE = [
  ['#6B4A32', '#F4EFEA'], ['#3A3633', '#F4EFEA'], ['#8C6A4F', '#F4EFEA'], ['#D9D2CA', '#1A1715'],
  ['#4E3B2E', '#F4EFEA'], ['#2B2826', '#F4EFEA'], ['#A39A92', '#1A1715'], ['#5C4636', '#F4EFEA'],
];

function hash(str) {
  let h = 0;
  for (let i = 0; i < str.length; i += 1) h = (h * 31 + str.charCodeAt(i)) | 0;
  return Math.abs(h);
}

/**
 * Capa do livro: a imagem real quando existe, sobre uma capa desenhada
 * (que aparece se a imagem não carregar ou estiver offline).
 */
export function cover(book, { size = 'md', showText = true } = {}) {
  const [bg, fg] = COVER_PALETTE[hash(book.title || '') % COVER_PALETTE.length];
  const author = (book.authors || '').split(',')[0];
  const text = showText
    ? `<span class="cover-title">${esc(book.title)}</span><span class="cover-author">${esc(author)}</span>`
    : '';
  const img = book.cover
    ? `<img class="cover-img" src="${esc(book.cover)}" alt="" loading="lazy" referrerpolicy="no-referrer">`
    : '';
  return `<span class="cover cover-${size}" style="--cover-bg:${bg};--cover-fg:${fg}">${text}${img}</span>`;
}

/**
 * Endereço da capa em tamanho grande, para ver ampliada.
 * Google Books: pede largura de 800px; Open Library: versão L (mantendo ?default=false
 * da capa pelo ISBN). Foto do celular: a própria.
 */
export function largeCoverUrl(url) {
  if (typeof url !== 'string' || !url) return null;
  if (url.startsWith('data:')) return url;
  try {
    const u = new URL(url);
    if (u.hostname === 'covers.openlibrary.org') return url.replace(/-[SM]\.jpg(?=$|\?)/, '-L.jpg');
    if (u.hostname.endsWith('books.google.com') || u.hostname.endsWith('googleusercontent.com')) {
      u.searchParams.delete('zoom');
      u.searchParams.set('fife', 'w800');
      return u.href;
    }
  } catch {
    return null;
  }
  return url;
}

/** Nota no formato brasileiro: 4 → "4", 4.5 → "4,5". */
export function formatRating(rating) {
  return decimal(Number(rating), Number(rating) % 1 ? 1 : 0);
}

/** "0,5 estrela", "1,5 estrela", "4 estrelas" (abaixo de 2 fica no singular). */
export function ratingLabel(rating) {
  return `${formatRating(rating)} ${Number(rating) < 2 ? 'estrela' : 'estrelas'}`;
}

// Metade esquerda da estrela (o eixo de simetria é x = 12).
const STAR_LEFT = '<path d="M12 3L9.3 8.6l-6.1.9 4.4 4.3-1 6.1L12 17z"/>';

/** Estrela n de uma nota: cheia, meia (metade esquerda) ou vazia. */
export function starIcon(n, rating, { size = 14 } = {}) {
  const r = Number(rating) || 0;
  if (r >= n) return icon('star', { size, cls: 'star-on' });
  if (r >= n - 0.5) {
    return `<svg class="icon star-half" width="${size}" height="${size}" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><g class="star-half-bg">${FILLED.star}</g>${STAR_LEFT}</svg>`;
  }
  return icon('star', { size, cls: 'star-off' });
}

export function stars(rating, { size = 14 } = {}) {
  if (!rating) return '';
  let out = '';
  for (let i = 1; i <= 5; i += 1) out += starIcon(i, rating, { size });
  return `<span class="stars" role="img" aria-label="Nota ${formatRating(rating)} de 5">${out}</span>`;
}

export function chip(text, cls = '') {
  return `<span class="chip ${cls}">${esc(text)}</span>`;
}

const isBlank = (v) => v === null || v === undefined || v === '';

/** Avanço da leitura: { pct, label }. Kindle usa a % informada; físico calcula pela página. */
export function progressOf(book) {
  if (book.format === FORMATS.KINDLE) {
    if (isBlank(book.currentPercent)) return null;
    const pct = Math.max(0, Math.min(100, Math.round(Number(book.currentPercent))));
    return Number.isFinite(pct) ? { pct, label: 'no Kindle' } : null;
  }
  if (book.currentPage === null || book.currentPage === undefined || book.currentPage === '') return null;
  const current = Number(book.currentPage);
  if (!Number.isFinite(current)) return null;
  const pages = Number(book.pages) || 0;
  // Sem o total de páginas não dá para calcular o percentual.
  if (!pages) return { pct: null, label: `pág. ${current}` };
  const pct = Math.max(0, Math.min(100, Math.round((current / pages) * 100)));
  return { pct, label: `pág. ${current} de ${pages}` };
}

export function progressBar(book) {
  const p = progressOf(book);
  if (!p) return '';
  if (p.pct === null) {
    return `<span class="progress"><span class="progress-text">Na ${esc(p.label)} · informe o total de páginas para ver o %</span></span>`;
  }
  return `<span class="progress" role="img" aria-label="${p.pct}% lido, ${esc(p.label)}"><span class="progress-track"><span class="progress-fill" style="width:${p.pct}%"></span></span><span class="progress-text">${p.pct}% · ${esc(p.label)}</span></span>`;
}

/** Linha de livro usada na estante e na busca. */
export function bookRow(book, { action = '' } = {}) {
  const meta = [];
  if (book.status === STATUS.READ && book.endDate) meta.push(chip(`Lido em ${formatShort(book.endDate)} ${book.endDate.slice(0, 4)}`));
  if (book.status === STATUS.READING) meta.push(chip(book.startDate ? `Lendo desde ${formatShort(book.startDate)}` : 'Lendo'));
  if (book.status === STATUS.WANT) meta.push(chip('Quero ler'));
  if (book.status === STATUS.DROPPED) meta.push(chip(book.endDate ? `Abandonado em ${formatShort(book.endDate)} ${book.endDate.slice(0, 4)}` : 'Abandonado', 'chip-muted'));
  if (book.reread) meta.push(chip('Releitura'));
  meta.push(chip(FORMAT_LABELS[book.format]));
  if (book.genre) meta.push(chip(book.genre));
  if (book.series) meta.push(chip(seriesLabel(book), 'chip-series'));
  for (const tag of book.tags || []) meta.push(chip(tag, 'chip-tag'));
  return `
    <div class="book-row">
      <a class="book-row-link" href="#/livro/${encodeURIComponent(book.id)}">
        ${cover(book, { size: 'sm' })}
        <span class="book-row-text">
          <span class="book-row-title">${esc(book.title)}${book.favorite ? ` ${icon('heart', { size: 14, cls: 'accent', label: 'Favorito do ano' })}` : ''}</span>
          <span class="book-row-author">${esc(book.authors || 'Autor não informado')}</span>
          ${book.rating ? stars(book.rating, { size: 12 }) : ''}
          ${book.status === STATUS.READING ? progressBar(book) : ''}
          <span class="chips">${meta.join('')}</span>
        </span>
      </a>
      ${action}
    </div>`;
}

export function emptyState(title, text, cta = '') {
  return `<div class="empty">${icon('book', { size: 28, cls: 'accent' })}<p class="empty-title">${esc(title)}</p><p class="empty-text">${esc(text)}</p>${cta}</div>`;
}
