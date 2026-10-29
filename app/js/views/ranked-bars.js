// Lista de barras ranqueadas (1.6.1): o mesmo desenho para Gêneros, humor e Tamanho dos livros.
// A linha líder (e os empates no primeiro lugar) na cor de destaque, as demais num tom neutro;
// mostra as primeiras `limit` linhas e o resto fica num <details> nativo ("Ver todos (N)"), sem
// JavaScript e sem estado guardado. Com `limit` linhas ou menos, mostra tudo e não há botão.

import { esc, plural } from '../ui.js';

/** Quais linhas lideram: as de maior contagem (empates incluídos); sem contagem, ninguém. */
export function leadersOf(rows) {
  const max = Math.max(0, ...rows.map((r) => r.count));
  return rows.map((r) => max > 0 && r.count === max);
}

/** Uma linha: botão (com `attrs`, que leva à busca filtrada) ou bloco simples; `count` 0 fica apagada. */
function rowHtml(r, { lead, max, total }) {
  const pct = r.pct ?? (total ? Math.round((r.count / total) * 100) : 0);
  const info = r.count ? `${plural(r.count, 'livro', 'livros')} · ${pct}%` : plural(0, 'livro', 'livros');
  const inner = `
      <span class="hbar-head"><span class="strong-ish rb-label">${esc(r.label)}</span><span class="muted rb-count">${info}</span></span>
      <span class="hbar-track"><span class="hbar-fill${lead ? ' is-top' : ''}" style="width:${max ? (r.count / max) * 100 : 0}%"></span></span>`;
  const cls = `hbar hbar-btn rb-row${lead ? ' is-lead' : ''}${r.count ? '' : ' is-empty'}`;
  return r.attrs && r.count
    ? `<button type="button" class="${cls}" ${r.attrs}>${inner}</button>`
    : `<div class="${cls}">${inner}</div>`;
}

/**
 * rows: [{ label, count, pct?, attrs? }] já na ordem de exibição.
 * opts.limit: quantas linhas ficam à mostra (padrão 3); opts.cls: classe extra na lista.
 */
export function rankedBars(rows, { limit = 3, cls = '' } = {}) {
  if (!rows.length) return '';
  const max = Math.max(...rows.map((r) => r.count), 0);
  const total = rows.reduce((sum, r) => sum + r.count, 0);
  const lead = leadersOf(rows);
  const html = rows.map((r, i) => rowHtml(r, { lead: lead[i], max, total }));
  const shown = html.slice(0, limit).join('');
  const rest = html.slice(limit);
  const more = rest.length
    ? `<details class="rb-more"><summary class="rb-toggle"><span class="rb-open">Ver todos (${rows.length})</span><span class="rb-close">Mostrar menos</span></summary>${rest.join('')}</details>`
    : '';
  return `<div class="hbar-list rb-list${cls ? ` ${cls}` : ''}">${shown}${more}</div>`;
}
