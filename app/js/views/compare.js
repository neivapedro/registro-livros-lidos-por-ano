// Comparar com outra pessoa (1.6): cartão em Ajustes e a tela #/comparar, lado a lado.
// Tudo que vem do link passa por esc() aqui (e já foi conferido em compare.js).

import { formatBR, monthInitial, monthName } from '../dates.js';
import { decimal, esc, icon, num } from '../ui.js';

function toggle(action, on, title, hint) {
  return `
        <button type="button" class="toggle-row vs-toggle" data-action="${action}" aria-pressed="${on}">
          <span class="toggle-text"><span class="strong-ish">${esc(title)}</span><span class="muted small">${esc(hint)}</span></span>
          <span class="switch${on ? ' is-on' : ''}"><span class="switch-knob"></span></span>
        </button>`;
}

/** Cartão "Comparar com alguém" de Ajustes. years: anos com dados (o primeiro é o atual). */
export function compareCard({ years = [], year, withBooks = true, saved = null }) {
  const options = years.map((y) => `<option value="${y}"${y === year ? ' selected' : ''}>${y}</option>`).join('');
  const savedRow = saved ? `
        <div class="vs-saved">
          <span class="vs-saved-text"><span class="strong-ish">${esc(saved.snap.n || 'Outra pessoa')} · ${saved.snap.y}</span><span class="muted small">Guardada${saved.savedAt ? ` em ${esc(formatBR(saved.savedAt))}` : ''}</span></span>
          <button type="button" class="btn-ghost vs-saved-btn" data-action="compare-open-saved">Ver</button>
          <button type="button" class="btn-ghost vs-saved-btn" data-action="compare-forget" aria-label="Apagar a comparação guardada">Apagar</button>
        </div>` : '';
  return `
    <section class="set-group" aria-labelledby="set-comparar">
      <h2 class="set-head" id="set-comparar">Comparar com alguém</h2>
      <div class="card set-card vs-card">
        <p class="muted small">Mande um resumo do seu ano para quem também usa o Leituras e vejam os dois lado a lado. Vai só o resumo (números, meses, gêneros e o favorito), nunca o seu backup.</p>
        <div class="vs-year">
          <label for="vs-year" class="strong-ish">Ano</label>
          <span class="vs-select"><select id="vs-year" data-compare-year>${options}</select>${icon('chevronDown', { size: 16, stroke: 2 })}</span>
        </div>
        ${toggle('compare-books', withBooks, 'Incluir a lista de livros lidos', 'Título, autor e nota, para ver os livros em comum')}
        <button type="button" class="btn-primary sm" data-action="share-compare">${icon('upload', { size: 18, stroke: 2 })}Enviar meu resumo</button>
        <div class="field">
          <label for="compare-link">Recebeu um link? Cole aqui</label>
          <input id="compare-link" type="url" autocomplete="off" autocapitalize="none" autocorrect="off" spellcheck="false" placeholder="https://…#/comparar?d=…" data-comparelink>
        </div>
        <button type="button" class="btn-ghost" data-action="paste-compare">Abrir comparação</button>${savedRow}
      </div>
      <p class="set-foot">Nada do link de outra pessoa entra nos seus livros. No iPhone com o app na Tela de Início, cole o link aqui dentro do app.</p>
    </section>`;
}

// ---------- Tela de comparação ----------

const fmt = (n) => num(n);

/** Duas barras (você e a outra pessoa) para um número. value: texto já formatado. */
function pair(label, a, b, { max = null, text = fmt } = {}) {
  const top = max ?? Math.max(a || 0, b || 0, 1);
  const w = (v) => (v === null || v === undefined ? 0 : Math.max(v ? 2 : 0, Math.min(100, (v / top) * 100)));
  const bar = (who, v, cls) => `
        <span class="vs-bar ${cls}">
          <span class="vs-bar-who">${esc(who)}</span>
          <span class="vs-track"><span class="vs-fill" style="width:${w(v).toFixed(1)}%"></span></span>
          <span class="vs-val">${v === null || v === undefined ? '—' : text(v)}</span>
        </span>`;
  return { label, a, b, bar };
}

function metricRow(m, names) {
  return `
      <div class="vs-metric" role="group" aria-label="${esc(m.label)}">
        <span class="vs-metric-label">${esc(m.label)}</span>${m.bar(names[0], m.a, 'is-me')}${m.bar(names[1], m.b, 'is-them')}
      </div>`;
}

function monthsChart(mine, theirs, names) {
  const max = Math.max(1, ...mine.m, ...theirs.m);
  const cols = mine.m.map((a, i) => {
    const b = theirs.m[i];
    const h = (v) => (v ? Math.max(6, (v / max) * 100) : 0);
    return `
        <span class="vs-month" role="listitem" aria-label="${monthName(i)}: ${esc(names[0])} ${a}, ${esc(names[1])} ${b}">
          <span class="vs-cols" aria-hidden="true"><span class="vs-col is-me" style="height:${h(a).toFixed(1)}%"></span><span class="vs-col is-them" style="height:${h(b).toFixed(1)}%"></span></span>
          <span class="vs-month-l" aria-hidden="true">${monthInitial(i)}</span>
        </span>`;
  }).join('');
  return `
    <section class="card vs-section">
      <h2>Mês a mês</h2>
      <div class="vs-months" role="list">${cols}</div>
    </section>`;
}

function genresCol(name, list) {
  if (!list.length) return `<div class="vs-gcol"><span class="vs-gname">${esc(name)}</span><span class="muted small">Sem gênero</span></div>`;
  return `<div class="vs-gcol"><span class="vs-gname">${esc(name)}</span><ol class="vs-glist">${list.slice(0, 3).map(([g, c]) => `<li><span>${esc(g)}</span><span class="muted small">${c}</span></li>`).join('')}</ol></div>`;
}

function favoriteCol(name, f) {
  return `<div class="vs-gcol"><span class="vs-gname">${esc(name)}</span>${f
    ? `<span class="serif-title vs-fav">${esc(f[0])}</span><span class="muted small">${esc(f[1])}</span>`
    : '<span class="muted small">Nenhum favorito marcado</span>'}</div>`;
}

const rating = (r) => (r ? `${icon('star', { size: 12, fill: 'currentColor', stroke: 0 })}${decimal(r)}` : '<span class="faint">sem nota</span>');

function commonSection(theirs, common, names) {
  if (!Array.isArray(theirs.b)) {
    return `<section class="card vs-section"><h2>Livros em comum</h2><p class="muted small">O link veio sem a lista de livros, então não dá para achar os livros em comum.</p></section>`;
  }
  if (!common.length) {
    const none = theirs.b.length === 1
      ? `O livro de ${esc(names[1])} em ${theirs.y} não está entre os que você leu.`
      : `Nenhum dos ${theirs.b.length} livros de ${esc(names[1])} em ${theirs.y} está entre os que você leu.`;
    return `<section class="card vs-section"><h2>Livros em comum</h2><p class="muted small">${none}</p></section>`;
  }
  const rows = common.map((c) => `
        <li class="vs-common-row">
          <span class="vs-common-book"><span class="strong-ish">${esc(c.title)}</span><span class="muted small">${esc(c.author)}</span></span>
          <span class="vs-common-rates">
            <span class="vs-rate is-me"><span class="sr-only">${esc(names[0])}: </span>${rating(c.mine)}</span>
            <span class="vs-rate is-them"><span class="sr-only">${esc(names[1])}: </span>${rating(c.theirs)}</span>
          </span>
        </li>`).join('');
  return `
    <section class="card vs-section">
      <div class="section-head"><h2>Livros em comum</h2><span class="muted small">${common.length}</span></div>
      <ul class="vs-common">${rows}</ul>
    </section>`;
}

/** Tela #/comparar sem resumo para mostrar. */
export function compareEmptyView() {
  return `
    <header class="top">
      <a class="icon-btn" href="#/ajustes" aria-label="Voltar">${icon('chevronLeft', { stroke: 2 })}</a>
      <h1 class="top-title">Comparar</h1>
      <span class="icon-btn-spacer"></span>
    </header>
    <section class="card vs-empty">
      <h2>Nenhuma comparação aberta</h2>
      <p class="muted small">Peça para a outra pessoa tocar em <strong>Ajustes › Comparar com alguém › Enviar meu resumo</strong> e cole o link recebido em Ajustes.</p>
      <a class="btn-primary sm" href="#/ajustes">Ir para Ajustes</a>
    </section>`;
}

/**
 * Tela lado a lado. mine e theirs: resumos no mesmo formato (compare.js); common: livros em
 * comum; saved: se este resumo já está guardado; names: [você, outra pessoa].
 */
export function compareView({ mine, theirs, common, saved, names }) {
  const goalPct = (s) => (s.g ? Math.round((s.c / s.g) * 100) : null);
  const metrics = [
    pair('Livros lidos', mine.c, theirs.c),
    pair('Páginas', mine.p || null, theirs.p || null),
    pair('Da meta do ano', goalPct(mine), goalPct(theirs), { max: Math.max(100, goalPct(mine) || 0, goalPct(theirs) || 0), text: (v) => `${v}%` }),
    pair('Nota média', mine.r, theirs.r, { max: 5, text: (v) => decimal(v) }),
  ];
  const sameYearNote = theirs.s ? `<p class="faint small vs-when">Resumo de ${esc(names[1])} gerado em ${esc(formatBR(theirs.s))}.</p>` : '';
  return `
    <header class="top">
      <a class="icon-btn" href="#/ajustes" aria-label="Voltar">${icon('chevronLeft', { stroke: 2 })}</a>
      <span class="eyebrow">Comparação de ${theirs.y}</span>
      <span class="icon-btn-spacer"></span>
    </header>
    <div class="page-title vs-title">
      <h1 class="display sm">${esc(names[0])} <em>e</em> ${esc(names[1])}</h1>
      <p class="vs-legend" aria-hidden="true"><span class="vs-dot is-me"></span>${esc(names[0])}<span class="vs-dot is-them"></span>${esc(names[1])}</p>
    </div>
    <section class="card vs-section">
      <h2>Em números</h2>${metrics.map((m) => metricRow(m, names)).join('')}
    </section>
    ${monthsChart(mine, theirs, names)}
    <section class="card vs-section">
      <h2>Gêneros preferidos</h2>
      <div class="vs-two">${genresCol(names[0], mine.t)}${genresCol(names[1], theirs.t)}</div>
    </section>
    <section class="card vs-section">
      <h2>Favorito do ano</h2>
      <div class="vs-two">${favoriteCol(names[0], mine.f)}${favoriteCol(names[1], theirs.f)}</div>
    </section>
    ${commonSection(theirs, common, names)}
    ${sameYearNote}
    <div class="vs-actions">
      ${saved
    ? `<p class="small vs-saved-note">${icon('check', { size: 14, stroke: 2.4 })}Guardada neste celular</p>
      <button type="button" class="btn-ghost" data-action="compare-forget">Apagar a comparação guardada</button>`
    : '<button type="button" class="btn-primary sm" data-action="compare-save">Guardar para ver depois</button>'}
      <p class="muted small">Nada deste resumo entra nos seus livros nem no seu backup.</p>
    </div>`;
}
