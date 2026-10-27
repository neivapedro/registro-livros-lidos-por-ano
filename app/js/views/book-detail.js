// Ficha do livro (#/livro/:id): a tela "vitrine" de cada livro. Capa grande sobre a cor da
// própria capa, os números da leitura, o ritmo do diário e o trecho mais recente.
// Só mostra: editar fica em #/livro/:id/editar (form.js e as abas Diário/Trechos).
// Tudo é derivado do livro salvo; nada aqui muda o modelo de dados.

import { daysInclusive, formatShort, isIsoDate } from '../dates.js';
import { paceLines } from '../pace.js';
import { quotePosition, quotesNewestFirst } from '../quotes.js';
import { formatMinutes } from '../reading-days.js';
import { seriesInfo, seriesLabel, formatSeriesNumber } from '../series.js';
import { FORMAT_LABELS, FORMATS, STATUS } from '../store.js';
import { cover, decimal, esc, formatRating, icon, largeCoverUrl, num, plural, progressOf, starIcon } from '../ui.js';
import { rhythmChart } from './rhythm.js';
import { timerButton } from './timer.js';

/** Endereço da edição: #/livro/:id/editar, com ?concluir=1 ou ?aba=diario|trechos. */
export function editHref(id, query = '') {
  return `#/livro/${encodeURIComponent(id)}/editar${query ? `?${query}` : ''}`;
}

// Capas em alta já baixadas nesta sessão: aparecem direto, sem o esmaecer de novo a cada redesenho.
export const loadedHdCovers = new Set();

/** '3 nov 2026' (sempre com o ano: a ficha mostra livros de qualquer época). */
function fullDate(iso) {
  return isIsoDate(iso) ? `${formatShort(iso)} ${iso.slice(0, 4)}` : '';
}

/** '22 jan → 10 fev 2026' (ano só no fim quando é o mesmo). */
function period(start, end) {
  if (start === end) return fullDate(end);
  if (start.slice(0, 4) === end.slice(0, 4)) return `${formatShort(start)} → ${formatShort(end)} ${end.slice(0, 4)}`;
  return `${fullDate(start)} → ${fullDate(end)}`;
}

/** Capa grande; com a versão em alta resolução por cima quando existe (entra ao carregar). */
function heroCover(book) {
  let html = cover(book, { size: 'hero' });
  const hd = largeCoverUrl(book.cover);
  if (hd && hd !== book.cover) {
    const ready = loadedHdCovers.has(hd) ? ' is-loaded' : '';
    html = html.replace(/<\/span>$/, `<img class="cover-img cover-hd${ready}" src="${esc(hd)}" alt="" referrerpolicy="no-referrer"></span>`);
  }
  if (!book.cover) return `<span class="ficha-cover">${html}</span>`;
  return `<button type="button" class="ficha-cover" data-action="zoom-book-cover" data-id="${esc(book.id)}" aria-label="Ver capa ampliada">${html}</button>`;
}

function ratingRow(book) {
  const fav = book.status === STATUS.READ
    ? `<button type="button" class="ficha-fav${book.favorite ? ' is-on' : ''}" data-action="detail-fav" data-id="${esc(book.id)}" aria-pressed="${Boolean(book.favorite)}" aria-label="Favorito do ano">${icon('heart', { size: 22, fill: book.favorite ? 'currentColor' : 'none' })}</button>`
    : '';
  if (!book.rating && !fav) return '';
  let starsHtml = '';
  if (book.rating) {
    let out = '';
    for (let i = 1; i <= 5; i += 1) out += starIcon(i, book.rating, { size: 22 });
    starsHtml = `<span class="ficha-stars" role="img" aria-label="Nota ${formatRating(book.rating)} de 5">${out}<span class="ficha-rating" aria-hidden="true">${formatRating(book.rating)}</span></span>`;
  }
  return `<div class="ficha-rate">${starsHtml}${fav}</div>`;
}

function seriesChip(state, book) {
  if (!book.series || !String(book.series).trim()) return '';
  const s = seriesInfo(state.books, book);
  const next = s.next
    ? `<a class="ficha-next" href="#/livro/${encodeURIComponent(s.next.id)}">Próximo: nº ${esc(formatSeriesNumber(s.next.seriesNumber))} · ${esc(s.next.title)}${icon('chevronRight', { size: 14, stroke: 2.2 })}</a>`
    : '';
  return `<div class="ficha-series"><span class="ficha-chip">${esc(seriesLabel(book))}</span>${next}</div>`;
}

const timerMinutes = (book) => (book.journal || []).reduce((s, e) => s + (Number.isFinite(e.minutes) && e.minutes > 0 ? e.minutes : 0), 0);

// ---------- Por status ----------

function readBlock(book) {
  const hasPeriod = isIsoDate(book.startDate) && isIsoDate(book.endDate) && book.startDate <= book.endDate;
  const days = hasPeriod ? daysInclusive(book.startDate, book.endDate) : null;
  const pages = Number(book.pages) || 0;
  const minutes = timerMinutes(book);
  const tiles = [];
  // Do início ao fim, contando os dias sem leitura: "dias de leitura" é o que o gráfico de ritmo
  // conta (só os dias com registro no diário), e os dois números lado a lado se contradiriam.
  if (days) tiles.push([num(days), days === 1 ? 'dia' : 'dias corridos']);
  if (days && pages) {
    const perDay = pages / days;
    tiles.push([perDay >= 10 ? num(perDay) : decimal(perDay, 1).replace(/,0$/, ''), 'págs. por dia']);
  }
  if (minutes) tiles.push([formatMinutes(minutes), 'no cronômetro']);
  else if (pages) tiles.push([num(pages), 'páginas']);
  const line = hasPeriod
    ? `Lido em ${plural(days, 'dia', 'dias')} · ${period(book.startDate, book.endDate)}`
    : isIsoDate(book.endDate) ? `Concluído em ${fullDate(book.endDate)}` : '';
  return `
    ${tiles.length >= 2 ? `<div class="ficha-stats">${tiles.map(([v, l]) => `<div><strong>${esc(v)}</strong><span>${esc(l)}</span></div>`).join('')}</div>` : ''}
    ${line ? `<p class="ficha-period">${esc(line)}</p>` : ''}`;
}

function readingBlock(book, ui, today) {
  const p = progressOf(book);
  const { pace, target } = paceLines(book, today);
  const since = isIsoDate(book.startDate) && book.startDate <= today
    ? `Lendo desde ${fullDate(book.startDate)} · ${plural(daysInclusive(book.startDate, today), 'dia', 'dias')}`
    : 'Lendo agora';
  let progress;
  if (p && p.pct !== null) {
    progress = `
      <div class="ficha-progress" role="img" aria-label="${p.pct}% lido, ${esc(p.label)}">
        <div class="ficha-progress-head"><span class="ficha-pct">${p.pct}%</span><span class="ficha-progress-label">${esc(p.label)}</span></div>
        <span class="progress-track"><span class="progress-fill" style="width:${p.pct}%"></span></span>
      </div>`;
  } else if (p) {
    progress = `<p class="ficha-progress-label">Na ${esc(p.label)} · informe o total de páginas para ver o %</p>`;
  } else {
    progress = `<p class="ficha-progress-label">${book.format === FORMATS.KINDLE ? 'Registre a % em que você está' : 'Registre a página em que você está'}</p>`;
  }
  const paceHtml = pace || target ? `<p class="ficha-pace">${[pace, target].filter(Boolean).map((t) => `<span>${esc(t)}</span>`).join('')}</p>` : '';
  // Registrar leitura abre a mesma folha do Início (openProgressSheet em main.js): nada de
  // formulário na própria ficha, que ficaria duplicado (e preso) se a tela redesenhasse por baixo.
  const actions = `<button type="button" class="btn-primary" data-action="update-page" data-id="${esc(book.id)}">Registrar leitura</button>`;
  return `
    <section class="ficha-card">
      <span class="ficha-eyebrow">${esc(since)}</span>
      ${progress}
      ${paceHtml}
      ${actions}
      <div class="ficha-actions">
        ${timerButton(book, ui.session)}
        <a class="btn-outline" href="${editHref(book.id, 'concluir=1')}">Concluir</a>
      </div>
    </section>`;
}

function wantBlock(state, book) {
  const queue = state.upNext || [];
  const pos = queue.indexOf(book.id);
  const added = String(book.createdAt || '').slice(0, 10);
  const next = pos >= 0
    ? `<button type="button" class="btn-ghost is-on" data-action="toggle-next" data-id="${esc(book.id)}" aria-pressed="true">${icon('check', { size: 18, stroke: 2.4, cls: 'accent' })}${pos === 0 ? 'É a próxima leitura' : `Próximas: ${pos + 1}º da fila`}</button>`
    : `<button type="button" class="btn-ghost" data-action="toggle-next" data-id="${esc(book.id)}" aria-pressed="false">Marcar como próxima</button>`;
  return `
    <section class="ficha-card">
      ${isIsoDate(added) ? `<span class="ficha-eyebrow">Na lista desde ${esc(fullDate(added))}</span>` : ''}
      <button type="button" class="btn-primary" data-action="start-reading" data-id="${esc(book.id)}">Começar a ler</button>
      ${next}
    </section>`;
}

function droppedBlock(book) {
  const p = progressOf(book);
  let where = '';
  if (p && book.format === FORMATS.KINDLE) where = `Parou em ${p.pct}%`;
  else if (p) where = `Parou na ${p.label}${p.pct !== null ? ` · ${p.pct}%` : ''}`;
  const when = isIsoDate(book.endDate) ? `Abandonado em ${fullDate(book.endDate)}` : 'Abandonado';
  const reason = String(book.dropReason || '').trim();
  return `
    <section class="ficha-card">
      <span class="ficha-eyebrow">${esc(when)}</span>
      ${where ? `<p class="ficha-stop">${esc(where)}</p>` : ''}
      ${p && p.pct !== null ? `<span class="progress-track is-muted"><span class="progress-fill" style="width:${p.pct}%"></span></span>` : ''}
      ${reason ? `<div class="ficha-reason"><span class="label">Por que parei</span><p>${esc(reason)}</p></div>` : ''}
    </section>`;
}

// ---------- Seções ----------

function rhythmSection(book, today) {
  const count = (book.journal || []).length;
  const footer = `<a class="ficha-more" href="${editHref(book.id, 'aba=diario')}">Ver diário (${count})${icon('chevronRight', { size: 16, stroke: 2.2 })}</a>`;
  const chart = rhythmChart(book, today, { footer });
  if (chart) return chart;
  if (book.status === STATUS.WANT || book.status === STATUS.DROPPED) return '';
  const text = book.status === STATUS.READING
    ? 'Cada vez que você registra a leitura, o dia entra aqui.'
    : 'Sem diário: este livro foi registrado sem a leitura dia a dia.';
  return `
    <section class="rchart is-empty">
      <div class="rchart-head"><h2 class="rchart-title">Ritmo da leitura</h2></div>
      <p class="rchart-readout">${esc(text)}</p>
    </section>`;
}

function quotesSection(book) {
  const quotes = quotesNewestFirst(book);
  const href = editHref(book.id, 'aba=trechos');
  if (!quotes.length) {
    if (book.status === STATUS.WANT) return '';
    return `<a class="ficha-row" href="${href}"><span>Guardar um trecho</span>${icon('plus', { size: 18, stroke: 2.2 })}</a>`;
  }
  const q = quotes[0];
  const position = quotePosition(q, book);
  return `
    <section class="ficha-section">
      <div class="section-head"><h2>Trechos</h2><a class="link" href="${href}">Ver todos (${quotes.length})</a></div>
      <a class="ficha-quote" href="${href}">
        <blockquote>${esc(q.text)}</blockquote>
        ${position || quotes.length > 1 ? `<span class="ficha-quote-meta">${[position ? esc(position) : '', quotes.length > 1 ? `o mais recente de ${quotes.length}` : ''].filter(Boolean).join(' · ')}</span>` : ''}
      </a>
    </section>`;
}

function notesSection(book) {
  const notes = String(book.notes || '').trim();
  if (!notes) return '';
  return `
    <section class="ficha-section">
      <h2>${book.status === STATUS.DROPPED ? 'Observações' : 'Anotações'}</h2>
      <p class="ficha-notes">${esc(notes)}</p>
    </section>`;
}

function detailsSection(book) {
  const chips = [];
  if (book.genre) chips.push(`<span class="ficha-chip">${esc(book.genre)}</span>`);
  chips.push(`<span class="ficha-chip">${esc(FORMAT_LABELS[book.format] || 'Físico')}</span>`);
  if (book.reread) chips.push('<span class="ficha-chip">Releitura</span>');
  for (const tag of book.tags || []) chips.push(`<span class="ficha-chip is-tag">${esc(tag)}</span>`);
  return `
    <section class="ficha-details">
      <div class="ficha-chips">${chips.join('')}</div>
      ${book.isbn ? `<p class="ficha-isbn">ISBN ${esc(book.isbn)}</p>` : ''}
    </section>`;
}

const STATUS_TEXT = { [STATUS.READ]: 'Lido', [STATUS.READING]: 'Lendo', [STATUS.WANT]: 'Quero ler', [STATUS.DROPPED]: 'Abandonado' };

export function bookDetailView({ state, ui, today, book }) {
  const authorLine = [book.authors || 'Autor não informado', book.pages ? `${num(book.pages)} págs.` : ''].filter(Boolean).join(' · ');
  const statusBlock = {
    [STATUS.READ]: () => readBlock(book),
    [STATUS.READING]: () => readingBlock(book, ui, today),
    [STATUS.WANT]: () => wantBlock(state, book),
    [STATUS.DROPPED]: () => droppedBlock(book),
  }[book.status]?.() || '';
  const heroStats = book.status === STATUS.READ ? statusBlock : '';
  return `
    <section class="ficha-hero" data-id="${esc(book.id)}" data-tint="${esc(book.cover || '')}" data-tint-title="${esc(book.title)}">
      <header class="ficha-top">
        <a class="btn-text ficha-back" href="${esc(ui.detailBack || '#/inicio')}">${icon('chevronLeft', { size: 20, stroke: 2.2 })}Voltar</a>
        <a class="btn-text accent strong" href="${editHref(book.id)}">Editar</a>
      </header>
      ${heroCover(book)}
      <div class="ficha-head">
        <span class="ficha-status is-${esc(book.status)}">${STATUS_TEXT[book.status] || ''}</span>
        <h1 class="ficha-title">${esc(book.title)}</h1>
        <p class="ficha-author">${esc(authorLine)}</p>
      </div>
      ${seriesChip(state, book)}
      ${ratingRow(book)}
      ${heroStats}
    </section>
    ${book.status === STATUS.READ ? '' : statusBlock}
    ${rhythmSection(book, today)}
    ${quotesSection(book)}
    ${notesSection(book)}
    ${detailsSection(book)}`;
}
