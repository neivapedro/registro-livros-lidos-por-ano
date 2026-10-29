// Desafios de leitura (1.6) na Visão geral do Resumo: cartão com anéis de progresso e as capas
// dos livros que contam, e as folhas de sugestões, criar/editar e detalhe (com a escolha dos
// livros no tipo 'manual'). As regras e os cálculos ficam em challenges.js.

import { formatShort } from '../dates.js';
import {
  CHALLENGE_TEMPLATES, RULE_LABELS, RULE_VALUE, autoTitle, challengeProgress, challengeTitle, challengesForYear,
  pickableBooks, ruleText, templateUsed,
} from '../challenges.js';
import { seriesNames } from '../series.js';
import { FORMAT_LABELS, allGenres, allTags } from '../store.js';
import { splitAuthors } from '../stats.js';
import { cover, esc, icon, plural } from '../ui.js';

const COVERS_SHOWN = 5;

/** Palavra da meta: "livros", "autores", "séries", "releituras". */
export function targetUnit(type, n) {
  if (type === 'authors') return n === 1 ? 'autor' : 'autores';
  if (type === 'seriesDone') return n === 1 ? 'série' : 'séries';
  if (type === 'reread') return n === 1 ? 'releitura' : 'releituras';
  return n === 1 ? 'livro' : 'livros';
}

/** Anel de progresso do desafio; completo, mostra o visto. */
function ring(p, { size = 48 } = {}) {
  const r = 20;
  const c = 2 * Math.PI * r;
  const dash = ((p.pct / 100) * c).toFixed(1);
  const inner = p.done
    ? `<span class="ch-ring-check">${icon('check', { size: size > 48 ? 24 : 20, stroke: 2.6 })}</span>`
    : `<span class="ch-ring-n">${p.count}<span class="ch-ring-of">/${p.target}</span></span>`;
  return `<span class="ch-ring${p.done ? ' is-done' : ''}" style="--ring:${size}px" aria-hidden="true"><svg viewBox="0 0 48 48"><circle cx="24" cy="24" r="${r}" class="ch-ring-track"/>${p.pct > 0 ? `<circle cx="24" cy="24" r="${r}" class="ch-ring-fill" stroke-dasharray="${dash} ${c.toFixed(1)}" transform="rotate(-90 24 24)"/>` : ''}</svg>${inner}</span>`;
}

function statusLine(c, p) {
  if (p.done) return `Concluído em ${formatShort(p.completedOn)}${p.count > p.target ? ` · ${p.count} ${targetUnit(c.rule.type, p.count)}` : ''}`;
  const left = p.target - p.count;
  const parts = [ruleText(c.rule)];
  if (p.count) parts.push(`falta${left === 1 ? '' : 'm'} ${left}`);
  if (p.reading) parts.push(`${p.reading} em leitura`);
  return parts.join(' · ');
}

function coverStack(list) {
  if (!list.length) return '';
  const shown = list.slice(-COVERS_SHOWN).reverse();
  const more = list.length - shown.length;
  return `<span class="ch-covers" aria-hidden="true">${shown.map((b) => `<span class="ch-cover">${cover(b, { size: 'xs', showText: false })}</span>`).join('')}${more ? `<span class="ch-more">+${more}</span>` : ''}</span>`;
}

function item(c, books) {
  const p = challengeProgress(c, books);
  const title = challengeTitle(c);
  const label = `${title}: ${p.done ? 'concluído' : `${p.count} de ${p.target}`}`;
  return `
    <li>
      <button type="button" class="ch-item${p.done ? ' is-done' : ''}" data-action="challenge-open" data-id="${esc(c.id)}" aria-label="${esc(label)}">
        ${ring(p)}
        <span class="ch-body">
          <span class="ch-title">${esc(title)}</span>
          <span class="ch-sub">${esc(statusLine(c, p))}</span>
          ${coverStack(p.books)}
        </span>
        ${icon('chevronRight', { size: 18, stroke: 2.2, cls: 'ch-chev' })}
      </button>
    </li>`;
}

const QUICK = ['longo', 'releituras', 'autores'];

/** Cartão "Desafios" do ano (Visão geral). */
export function challengesCard({ state, year }) {
  const list = challengesForYear(state, year);
  if (!list.length) {
    const chips = CHALLENGE_TEMPLATES.filter((t) => QUICK.includes(t.key)).map((t) => `
      <button type="button" class="ch-chip" data-action="challenge-template" data-key="${t.key}" data-year="${year}">${icon('plus', { size: 14, stroke: 2.4 })}${esc(t.title)}</button>`).join('');
    return `
      <section class="card ch-card is-empty" aria-labelledby="ch-head">
        <div class="section-head"><h2 id="ch-head">Desafios</h2></div>
        <p class="ch-intro">Metas extras para ${year}, além da meta de livros. O progresso se calcula sozinho com os livros que você terminar.</p>
        <div class="ch-chips">${chips}</div>
        <button type="button" class="btn-ghost ch-new-wide" data-action="challenge-new" data-year="${year}">Ver todas as sugestões</button>
      </section>`;
  }
  const done = list.filter((c) => challengeProgress(c, state.books).done).length;
  return `
    <section class="card ch-card" aria-labelledby="ch-head">
      <div class="section-head">
        <h2 id="ch-head">Desafios <span class="ch-count">${done} de ${list.length}</span></h2>
        <button type="button" class="ch-add" data-action="challenge-new" data-year="${year}">${icon('plus', { size: 16, stroke: 2.4 })}Novo</button>
      </div>
      <ul class="ch-list" role="list">${list.map((c) => item(c, state.books)).join('')}</ul>
    </section>`;
}

function sheetHead(eyebrow, title, extra = '') {
  return `
    <div class="chs-head" data-sheet-drag>
      ${extra}
      <div class="chs-head-text">
        <span class="eyebrow accent">${esc(eyebrow)}</span>
        <span class="chs-title" id="chs-title">${esc(title)}</span>
      </div>
      <button type="button" class="psheet-close" data-sheet-close aria-label="Fechar">${icon('close', { size: 18, stroke: 2.2 })}</button>
    </div>`;
}

/** Folha "Novo desafio": sugestões (um toque cria) e o caminho para criar do seu jeito. */
export function challengeNewSheet(state, year) {
  const rows = CHALLENGE_TEMPLATES.map((t) => {
    const used = templateUsed(state, year, t);
    return `
      <li>
        <button type="button" class="chs-tpl${used ? ' is-used' : ''}" data-action="challenge-template" data-key="${t.key}" data-year="${year}"${used ? ' disabled' : ''}>
          <span class="chs-tpl-text"><span class="chs-tpl-title">${esc(t.title)}</span><span class="chs-tpl-rule">${esc(used ? 'Já está nos seus desafios' : ruleText(t.rule))}</span></span>
          <span class="chs-tpl-add">${icon(used ? 'check' : 'plus', { size: 18, stroke: 2.4 })}</span>
        </button>
      </li>`;
  }).join('');
  return `
    <div class="chs">
      ${sheetHead(`Novo desafio · ${year}`, 'Escolha uma sugestão')}
      <ul class="chs-list" role="list">${rows}</ul>
      <button type="button" class="btn-ghost" data-action="challenge-custom" data-year="${year}">${icon('sliders', { size: 18 })}Criar do meu jeito</button>
    </div>`;
}

function authorNames(books) {
  const map = new Map();
  for (const b of books) for (const a of splitAuthors(b.authors)) if (!map.has(a.toLocaleLowerCase('pt-BR'))) map.set(a.toLocaleLowerCase('pt-BR'), a);
  return [...map.values()].sort((a, b) => a.localeCompare(b, 'pt-BR'));
}

function options(list, selected) {
  return list.map(([value, label]) => `<option value="${esc(value)}"${String(value) === String(selected ?? '') ? ' selected' : ''}>${esc(label)}</option>`).join('');
}

/** Campo do valor da regra (muda com o tipo escolhido). */
export function valueField(state, type, value) {
  const kind = RULE_VALUE[type];
  if (!kind) return `<p class="chs-hint">${esc(ruleText({ type, value: null }))}.${type === 'manual' ? ' Depois de criar, toque no desafio para marcar os livros.' : ''}</p>`;
  if (type === 'genre') {
    const genres = allGenres(state);
    return `<label class="chs-label" for="ch-value">Gênero</label>
      <div class="chs-select"><select id="ch-value" name="value">${options(genres.map((g) => [g, g]), value || genres[0])}</select>${icon('chevronDown', { size: 16, stroke: 2.2 })}</div>`;
  }
  if (type === 'format') {
    return `<label class="chs-label" for="ch-value">Formato</label>
      <div class="chs-select"><select id="ch-value" name="value">${options(Object.entries(FORMAT_LABELS), value || 'fisico')}</select>${icon('chevronDown', { size: 16, stroke: 2.2 })}</div>`;
  }
  if (type === 'pages') {
    return `<label class="chs-label" for="ch-value">Livros com mais de</label>
      <div class="chs-field"><input id="ch-value" name="value" type="number" inputmode="numeric" min="1" max="20000" value="${esc(value ?? 500)}" enterkeyhint="done"><span class="chs-suffix">páginas</span></div>`;
  }
  const lists = {
    tag: ['Etiqueta', allTags(state), 'Ex.: Clássico'],
    author: ['Autor', authorNames(state.books), 'Nome do autor'],
    series: ['Série (opcional)', seriesNames(state.books), 'Qualquer série'],
  }[type];
  return `<label class="chs-label" for="ch-value">${lists[0]}</label>
    <input class="chs-input" id="ch-value" name="value" type="text" maxlength="60" value="${esc(value || '')}" placeholder="${esc(lists[2])}" list="ch-value-list" autocomplete="off" autocapitalize="sentences" enterkeyhint="done">
    <datalist id="ch-value-list">${lists[1].slice(0, 200).map((v) => `<option value="${esc(v)}"></option>`).join('')}</datalist>`;
}

/**
 * Folha de criar/editar. draft: { id, year, title, target, type, value }.
 * error: mensagem de validação (aparece em cima dos botões).
 */
export function challengeFormSheet(state, draft, error = '') {
  const isEdit = Boolean(draft.id);
  const types = Object.entries(RULE_LABELS);
  return `
    <form class="chs chs-form" data-challenge-form data-id="${esc(draft.id || '')}" data-year="${draft.year}" novalidate>
      ${sheetHead(isEdit ? `Editar desafio · ${draft.year}` : `Novo desafio · ${draft.year}`, isEdit ? 'Ajuste o desafio' : 'Do seu jeito')}
      <label class="chs-label" for="ch-type">O que conta</label>
      <div class="chs-select"><select id="ch-type" name="type">${options(types, draft.type)}</select>${icon('chevronDown', { size: 16, stroke: 2.2 })}</div>
      <div class="chs-value" data-ch-value>${valueField(state, draft.type, draft.value)}</div>
      <label class="chs-label" for="ch-target">Meta</label>
      <div class="chs-stepper">
        <button type="button" class="chs-step" data-action="challenge-step" data-delta="-1" aria-label="Diminuir a meta">−</button>
        <span class="chs-target"><input id="ch-target" name="target" type="number" inputmode="numeric" min="1" max="1000" value="${esc(draft.target)}" enterkeyhint="done"><span class="chs-suffix" data-ch-unit>${targetUnit(draft.type, Number(draft.target))}</span></span>
        <button type="button" class="chs-step" data-action="challenge-step" data-delta="1" aria-label="Aumentar a meta">+</button>
      </div>
      <label class="chs-label" for="ch-title">Nome <span class="chs-optional">(opcional)</span></label>
      <input class="chs-input" id="ch-title" name="title" type="text" maxlength="80" value="${esc(draft.title || '')}" placeholder="${esc(autoTitle({ type: draft.type, value: draft.value || (draft.type === 'pages' ? 500 : '…') }, Number(draft.target) || 1))}" autocomplete="off" autocapitalize="sentences" enterkeyhint="done">
      <p class="chs-error" role="alert"${error ? '' : ' hidden'}>${esc(error)}</p>
      <div class="chs-actions">
        <button type="button" class="btn-ghost" data-sheet-close>Cancelar</button>
        <button type="submit" class="btn-primary">${isEdit ? 'Salvar' : 'Criar desafio'}</button>
      </div>
      ${isEdit ? `<button type="button" class="btn-text danger chs-delete" data-action="challenge-delete" data-id="${esc(draft.id)}">${icon('trash', { size: 18 })}Excluir desafio</button>` : ''}
    </form>`;
}

function bookLine(b, { picked = null, challengeId = '' } = {}) {
  const author = (b.authors || '').split(',')[0].trim();
  const sub = [author, b.endDate ? formatShort(b.endDate) : ''].filter(Boolean).join(' · ');
  const inner = `${cover(b, { size: 'xs', showText: false })}<span class="chs-book-text"><span class="chs-book-title">${esc(b.title)}</span><span class="chs-book-sub">${esc(sub)}</span></span>`;
  if (picked === null) {
    return `<li><a class="chs-book" href="#/livro/${encodeURIComponent(b.id)}" data-sheet-close>${inner}${icon('chevronRight', { size: 16, stroke: 2.2, cls: 'ch-chev' })}</a></li>`;
  }
  return `<li><button type="button" class="chs-book is-pick${picked ? ' is-on' : ''}" data-action="challenge-pick" data-id="${esc(challengeId)}" data-book="${esc(b.id)}" aria-pressed="${picked}">${inner}<span class="chs-check">${icon('check', { size: 16, stroke: 2.8 })}</span></button></li>`;
}

/** Folha de detalhe: progresso, livros que contam (ou a escolha deles), editar e excluir. */
export function challengeDetailSheet(state, c) {
  const p = challengeProgress(c, state.books);
  const unit = targetUnit(c.rule.type, p.target);
  const summary = p.done
    ? `Concluído em ${formatShort(p.completedOn)} · ${p.count} de ${p.target} ${unit}`
    : `${p.count} de ${p.target} ${unit} · ${p.target - p.count === 1 ? 'falta 1' : `faltam ${p.target - p.count}`}`;
  let body;
  if (c.rule.type === 'manual') {
    const books = pickableBooks(state.books, c.year);
    const picked = new Set(c.books);
    body = books.length
      ? `<p class="chs-label">Toque nos livros lidos em ${c.year} que contam</p><ul class="chs-books" role="list">${books.map((b) => bookLine(b, { picked: picked.has(b.id), challengeId: c.id })).join('')}</ul>`
      : `<p class="chs-hint">Nenhum livro lido em ${c.year} ainda. Quando terminar um, ele aparece aqui para você marcar.</p>`;
  } else {
    const label = c.rule.type === 'authors' ? 'Livros com autores novos no ano' : c.rule.type === 'seriesDone' ? 'Livros que fecharam a série' : 'Livros que contam';
    body = p.books.length
      ? `<p class="chs-label">${label}</p><ul class="chs-books" role="list">${p.books.map((b) => bookLine(b)).join('')}</ul>`
      : `<p class="chs-hint">Nenhum livro conta ainda. ${esc(ruleText(c.rule))}: os livros que você terminar em ${c.year} entram sozinhos.</p>`;
    if (p.reading) body += `<p class="chs-hint">${plural(p.reading, 'livro em leitura vai', 'livros em leitura vão')} contar quando terminar.</p>`;
  }
  return `
    <div class="chs chs-detail" data-challenge="${esc(c.id)}">
      ${sheetHead(`Desafio de ${c.year}`, challengeTitle(c), ring(p, { size: 56 }))}
      <div class="chs-progress${p.done ? ' is-done' : ''}">
        <span class="chs-bar"><span class="chs-bar-fill" style="width:${p.pct}%"></span></span>
        <span class="chs-progress-text">${esc(summary)}</span>
        <span class="chs-rule">${esc(ruleText(c.rule))}</span>
      </div>
      ${body}
      <div class="chs-actions">
        <button type="button" class="btn-ghost" data-action="challenge-edit" data-id="${esc(c.id)}">${icon('sliders', { size: 18 })}Editar</button>
        <button type="button" class="btn-ghost chs-del" data-action="challenge-delete" data-id="${esc(c.id)}">${icon('trash', { size: 18 })}Excluir</button>
      </div>
    </div>`;
}
