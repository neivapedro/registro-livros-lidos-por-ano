// Telas dos dados extras do livro (1.6): humor e ritmo, avaliação por critérios, sinopse,
// empréstimo e "Onde comprar". Formulário (form.js), ficha (book-detail.js), folha do
// empréstimo e menu rápido (sheets.js), perfil de leitor no Resumo (summary.js).
// As regras dos dados ficam em ../book-meta.js. Todo texto vindo de dados passa por esc().

import { daysSince, formatShort, isIsoDate } from '../dates.js';
import {
  CRITERIA, MAX_DESCRIPTION, MAX_LOAN_NAME, MOODS, MOOD_LABELS, PACES, PACE_LABELS, hasCriteria, loanLabel, moodProfile, shopLinks,
} from '../book-meta.js';
import { cover, esc, formatRating, icon, plural, ratingLabel, starIcon } from '../ui.js';

const svg = (inner, size = 18, stroke = 1.9) => `<svg class="icon" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${stroke}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${inner}</svg>`;

/** Ícones desta parte: livro passando de mão (empréstimo), velocímetro (ritmo) e link externo. */
export const META_GLYPHS = {
  loan: (size = 18) => svg('<circle cx="9" cy="8" r="3.5"/><path d="M2.8 20a6.2 6.2 0 0 1 12.4 0"/><path d="M16 12h6M19.5 9.5 22 12l-2.5 2.5"/>', size),
  pace: (size = 14) => svg('<path d="M4.5 17a8 8 0 1 1 15 0"/><path d="M12 13l4-4"/><circle cx="12" cy="13" r="1.2" fill="currentColor"/>', size, 2),
  external: (size = 16) => svg('<path d="M14 5h5v5M19 5l-8 8"/><path d="M17 14v4a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V8a1 1 0 0 1 1-1h4"/>', size, 2),
};

// ---------- Formulário ----------

/** Humor (vários) e ritmo (um), dentro de "Mais detalhes". Não aparece em "Quero ler". */
export function moodFields(d) {
  const moods = new Set(d.moods || []);
  const chips = MOODS.map((m) => {
    const on = moods.has(m.id);
    return `<button type="button" class="mood-chip${on ? ' is-on' : ''}" data-action="toggle-mood" data-value="${m.id}" aria-pressed="${on}">${on ? icon('check', { size: 14, stroke: 2.6 }) : ''}${esc(m.label)}</button>`;
  }).join('');
  const paces = PACES.map((p) => {
    const on = d.pace === p.id;
    return `<button type="button" class="pace-btn${on ? ' is-on' : ''}" data-action="set-pace" data-value="${p.id}" aria-pressed="${on}">${esc(p.label)}</button>`;
  }).join('');
  return `
      <section class="field-group mood-field">
        <span class="label" id="mood-label">Humor do livro</span>
        <div class="mood-chips" role="group" aria-labelledby="mood-label">${chips}</div>
        <span class="label mood-pace-label" id="pace-label">Ritmo</span>
        <div class="pace-pick" role="group" aria-labelledby="pace-label">${paces}</div>
        <span class="muted small">Escolha quantos quiser; toque de novo para tirar.</span>
      </section>`;
}

/** Sinopse: texto livre (vem da busca quando a fonte tem). */
export function descriptionField(d) {
  return `
      <section class="field-group">
        <label class="label" for="f-description">Sinopse</label>
        <textarea id="f-description" rows="5" maxlength="${MAX_DESCRIPTION}" placeholder="Sobre o que é o livro (vem da busca quando a fonte tem)" data-field="description">${esc(d.description || '')}</textarea>
      </section>`;
}

/** Critérios aberto ou fechado: a escolha deste rascunho; sem escolha, aberto se já há notas. */
export function criteriaOpen(ui) {
  const c = ui.criteriaOpen;
  if (c && c.draft === ui.draft) return c.open;
  return hasCriteria(ui.draft?.criteria);
}

/** "Avaliar por critérios", recolhível, logo abaixo das estrelas da nota (só Lido). */
export function criteriaBlock(ui) {
  const d = ui.draft;
  const crit = d.criteria || {};
  const open = criteriaOpen(ui);
  const filled = CRITERIA.filter((c) => crit[c.id]);
  const summary = filled.length
    ? filled.map((c) => `${c.label} ${formatRating(crit[c.id])}`).join(' · ')
    : 'Personagens, enredo, escrita e emoção';
  const rows = CRITERIA.map((c) => {
    const value = crit[c.id] || null;
    const hit = (v, side) => `<button type="button" class="star-hit ${side}" data-action="set-criterion" data-crit="${c.id}" data-value="${v}" aria-label="${esc(`${c.label}: ${ratingLabel(v)}`)}" aria-pressed="${value === v}"></button>`;
    const slots = [1, 2, 3, 4, 5].map((n) => `<span class="star-slot crit-slot">${starIcon(n, value, { size: 20 })}${hit(n - 0.5, 'left')}${hit(n, 'right')}</span>`).join('');
    return `
        <div class="crit-row" role="group" aria-label="${esc(c.label)}">
          <span class="crit-name">${esc(c.label)}<span class="crit-val" aria-hidden="true">${value ? formatRating(value) : '–'}</span></span>
          <span class="crit-stars">${slots}</span>
        </div>`;
  }).join('');
  return `
      <div class="crit${open ? ' is-open' : ''}">
        <button type="button" class="crit-toggle" data-action="toggle-criteria" aria-expanded="${open}" aria-controls="crit-list">
          <span class="crit-toggle-text"><span class="crit-title">Avaliar por critérios <span class="faint">(opcional)</span></span>${open ? '' : `<span class="crit-summary">${esc(summary)}</span>`}</span>
          ${icon('chevronDown', { size: 18, stroke: 2, cls: 'crit-chevron' })}
        </button>
        ${open ? `<div class="crit-list" id="crit-list">${rows}<p class="muted small crit-hint">Não muda a sua nota: ela continua a das estrelas acima.</p></div>` : ''}
      </div>`;
}

// ---------- Ficha ----------

/** Humor e ritmo em chips discretos, no topo da ficha. */
export function moodChips(book) {
  const moods = (book.moods || []).filter((m) => MOOD_LABELS[m]);
  const pace = PACE_LABELS[book.pace];
  if (!moods.length && !pace) return '';
  const chips = moods.map((m) => `<span class="ficha-chip is-mood">${esc(MOOD_LABELS[m])}</span>`);
  if (pace) chips.push(`<span class="ficha-chip is-pace">${META_GLYPHS.pace(13)}Ritmo ${esc(pace.toLowerCase())}</span>`);
  return `<div class="ficha-moods" aria-label="Humor e ritmo">${chips.join('')}</div>`;
}

/** Notas por critério: nome, barrinha e número (só livro lido com alguma nota). */
export function criteriaList(book) {
  const crit = book.criteria || {};
  if (book.status !== 'lido' || !hasCriteria(crit)) return '';
  const rows = CRITERIA.filter((c) => crit[c.id]).map((c) => `
      <div class="ficha-crit-row">
        <dt>${esc(c.label)}</dt>
        <dd><span class="ficha-crit-bar" aria-hidden="true"><span style="width:${(crit[c.id] / 5) * 100}%"></span></span><span class="ficha-crit-n"><span class="sr-only">${esc(ratingLabel(crit[c.id]))}</span><span aria-hidden="true">${formatRating(crit[c.id])}</span></span></dd>
      </div>`).join('');
  return `<dl class="ficha-crit" aria-label="Avaliação por critérios">${rows}</dl>`;
}

/** Sinopse recolhida em ~4 linhas, com "Ler mais" (main.js esconde o botão se couber tudo). */
export function synopsisSection(book, ui = {}) {
  const text = String(book.description || '').trim();
  if (!text) return '';
  const open = ui.synopsisOpen === book.id;
  return `
    <section class="ficha-section ficha-syn${open ? ' is-open' : ''}">
      <h2>Sinopse</h2>
      <div class="ficha-syn-card">
        <p class="ficha-syn-text" id="ficha-syn-text">${esc(text)}</p>
        <button type="button" class="ficha-syn-more" data-action="synopsis-more" data-id="${esc(book.id)}" aria-expanded="${open}" aria-controls="ficha-syn-text">${open ? 'Ler menos' : 'Ler mais'}</button>
      </div>
    </section>`;
}

/** Selo "com Ana desde 3 out" no topo da ficha. */
export function loanBadge(book, today) {
  if (!book.loan?.to) return '';
  return `<span class="ficha-loan">${META_GLYPHS.loan(14)}<span>${esc(loanLabel(book.loan, today))}</span></span>`;
}

/** Cartão do empréstimo (com "Devolvido") ou a linha discreta "Emprestei para alguém". */
export function loanSection(book, today) {
  const id = esc(book.id);
  if (!book.loan?.to) {
    return `<button type="button" class="ficha-row ficha-loan-add" data-action="loan-open" data-id="${id}"><span>Emprestei para alguém</span>${META_GLYPHS.loan(18)}</button>`;
  }
  const since = book.loan.since;
  let when = 'Sem data';
  if (isIsoDate(since)) {
    const days = isIsoDate(today) && since <= today ? daysSince(since, today) : null;
    const ago = days === null ? '' : days === 0 ? ' · hoje' : ` · há ${plural(days, 'dia', 'dias')}`;
    when = `Desde ${formatShort(since)} ${since.slice(0, 4)}${ago}`;
  }
  return `
    <section class="ficha-loan-card" aria-label="Empréstimo">
      <button type="button" class="ficha-loan-info" data-action="loan-open" data-id="${id}" aria-label="${esc(`Emprestado para ${book.loan.to}. Alterar empréstimo`)}">
        <span class="ficha-loan-icon">${META_GLYPHS.loan(20)}</span>
        <span class="ficha-loan-text"><span class="ficha-eyebrow">Emprestado para</span><strong>${esc(book.loan.to)}</strong><span class="ficha-loan-when">${esc(when)}</span></span>
      </button>
      <button type="button" class="btn-outline ficha-loan-back" data-action="loan-return" data-id="${id}">${icon('check', { size: 16, stroke: 2.4 })}Devolvido</button>
    </section>`;
}

/** "Onde comprar" (só Quero ler): busca nas lojas, em outra aba, sem nenhum código de afiliado. */
export function shopSection(book) {
  if (book.status !== 'quero') return '';
  const links = shopLinks(book);
  if (!links.length) return '';
  const rows = links.map((l) => `
      <a class="ficha-shop-link" href="${esc(l.href)}" target="_blank" rel="noopener noreferrer" data-shop="${l.id}">
        <span class="ficha-shop-text"><span class="ficha-shop-name">${esc(l.label)}</span><span class="ficha-shop-host">${esc(l.host)}</span></span>
        ${META_GLYPHS.external(16)}
      </a>`).join('');
  return `
    <section class="ficha-section">
      <h2>Onde comprar</h2>
      <div class="ficha-shop">${rows}</div>
    </section>`;
}

// ---------- Folha do empréstimo ----------

export function loanSheet(book, names, today) {
  const loan = book.loan;
  const options = names.map((n) => `<option value="${esc(n)}"></option>`).join('');
  return `
    <form class="psheet loan-sheet" data-loan-form data-id="${esc(book.id)}" novalidate>
      <div class="psheet-head" data-sheet-drag>
        ${cover(book, { size: 'xs', showText: false })}
        <div class="psheet-head-text">
          <span class="eyebrow accent">${loan ? 'Empréstimo' : 'Emprestar'}</span>
          <span class="psheet-title">${esc(book.title)}</span>
        </div>
        <button type="button" class="psheet-close" data-sheet-close aria-label="Fechar">${icon('close', { size: 18, stroke: 2.2 })}</button>
      </div>
      <div class="field-stack">
        <div class="field"><label for="loan-to">Emprestei para</label><input id="loan-to" type="text" maxlength="${MAX_LOAN_NAME}" autocomplete="off" autocapitalize="words" enterkeyhint="done" list="loan-names" placeholder="Nome de quem pegou" value="${esc(loan?.to || '')}"></div>
        <div class="field"><label for="loan-since">Desde</label><input id="loan-since" type="date" max="${esc(today)}" value="${esc(loan?.since || today)}"></div>
      </div>
      <datalist id="loan-names">${options}</datalist>
      <div class="psheet-actions">
        ${loan
    ? `<button type="button" class="btn-ghost" data-action="loan-return" data-id="${esc(book.id)}" data-sheet-close>${icon('check', { size: 18, stroke: 2.2 })}Devolvido</button>`
    : '<button type="button" class="btn-ghost" data-sheet-close>Cancelar</button>'}
        <button type="submit" class="btn-primary">Salvar</button>
      </div>
    </form>`;
}

// ---------- Resumo → Gostos: perfil de leitor ----------

/** 'reflexivo' → 'reflexivos', 'inspirador' → 'inspiradores'. */
function moodPlural(label) {
  const l = label.toLocaleLowerCase('pt-BR');
  return /[rz]$/.test(l) ? `${l}es` : `${l}s`;
}

function joinAnd(list) {
  return list.length > 1 ? `${list.slice(0, -1).join(', ')} e ${list[list.length - 1]}` : list[0] || '';
}

export function readerProfileCard(books, year) {
  const p = moodProfile(books, year);
  if (!p.read) return '';
  if (!p.withAny) {
    return `
    <section class="card profile-card is-empty">
      <h2>Seu perfil de leitor</h2>
      <div class="profile-empty">
        <span class="profile-empty-dots" aria-hidden="true">${MOODS.slice(0, 4).map((m) => `<span>${esc(m.label)}</span>`).join('')}</span>
        <p class="muted small">Marque o <strong>humor</strong> e o <strong>ritmo</strong> dos livros (Editar → Mais detalhes) para ver aqui o que você mais leu em ${year}.</p>
      </div>
    </section>`;
  }
  const top = p.moods.slice(0, 6);
  const lead = top.length
    ? `<p class="profile-lead">Em ${year}, você leu mais livros <strong>${esc(joinAnd(top.slice(0, 3).map((m) => moodPlural(m.label))))}</strong>.</p>`
    : '';
  const max = top[0]?.count || 1;
  const bars = top.map((m) => `
      <div class="hbar profile-bar">
        <span class="hbar-head"><span class="strong-ish">${esc(m.label)}</span><span class="muted">${plural(m.count, 'livro', 'livros')} · ${m.pct}%</span></span>
        <span class="hbar-track"><span class="hbar-fill${m.count === max ? ' is-top' : ''}" style="width:${(m.count / max) * 100}%"></span></span>
      </div>`).join('');
  const paceTotal = p.withPace;
  const paceBlock = paceTotal ? `
      <div class="profile-pace">
        <span class="profile-sub">Ritmo</span>
        <div class="pace-split" role="img" aria-label="${esc(p.paces.map((x) => `${x.label}: ${plural(x.count, 'livro', 'livros')}`).join(', '))}">
          ${p.paces.filter((x) => x.count).map((x) => `<span class="pace-seg is-${x.id}" style="flex:${x.count}"></span>`).join('')}
        </div>
        <div class="pace-legend" aria-hidden="true">
          ${p.paces.map((x) => `<span class="pace-key${x.count ? '' : ' is-zero'}"><span class="pace-dot is-${x.id}"></span>${esc(x.label)} <strong>${x.count}</strong></span>`).join('')}
        </div>
      </div>` : '';
  return `
    <section class="card profile-card">
      <div class="section-head"><h2>Seu perfil de leitor</h2><span class="muted small">${p.withAny} de ${plural(p.read, 'livro', 'livros')}</span></div>
      ${lead}
      ${bars ? `<div class="hbar-list profile-bars">${bars}</div>` : '<p class="muted small">Nenhum humor marcado ainda.</p>'}
      ${paceBlock}
    </section>`;
}
