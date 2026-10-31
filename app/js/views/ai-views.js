// Telas da IA 1.6 (ai-extras.js): o "Fotografar página" do novo trecho e a tela
// "O que ler a seguir" (#/sugestoes), com a entrada no Início.
// Todo texto vindo da IA (ou guardado a partir dela) passa por esc(): é dado não confiável.

import { formatShort } from '../dates.js';
import { AI_MONTHLY_LIMIT } from '../prefs.js';
import { STATUS } from '../store.js';
import { ownsBook, SHOW_QUEUE } from '../ai-extras.js';
import { cover, esc, icon, num, plural } from '../ui.js';
import { emptyScene } from '../empty-art.js';

const CAMERA = '<svg class="icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 8h3l2-3h6l2 3h3a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1z"/><circle cx="12" cy="13" r="3.5"/></svg>';

const LIVE_TEXT = 'Ou use o Texto ao Vivo da Câmera do iPhone: aponte para a página, toque no ícone de texto, copie o trecho e cole aqui.';
const LIMIT_TEXT = `Limite de segurança do mês atingido (${AI_MONTHLY_LIMIT} usos da IA). Volta no dia 1º.`;

const progress = (ms) => `<span class="ai-progress" style="--ai-ms:${Math.round(Number(ms)) || 45000}ms" aria-hidden="true"><span></span></span>`;

// ---------- Trecho por foto ----------

/** Os dois jeitos de escolher a foto: a câmera direto ou uma foto já tirada. */
function photoButtons(again = false) {
  return `
    <div class="ocr-actions">
      <label class="btn-outline ocr-btn file-btn">${CAMERA}${again ? 'Outra foto' : 'Fotografar página'}<input type="file" accept="image/*" capture="environment" class="sr-only" data-ocr-photo></label>
      <label class="btn-ghost ocr-btn file-btn">Escolher foto<input type="file" accept="image/*" class="sr-only" data-ocr-photo></label>
    </div>`;
}

/**
 * Bloco abaixo do campo do trecho (livro físico). ocr: estado em ui.quoteForm.ocr.
 * Sem chave, o botão só explica onde ativar (e lembra do Texto ao Vivo do iPhone).
 */
export function quotePhotoBlock(ocr, { hasKey = false, limitReached = false } = {}) {
  const o = ocr || {};
  let body;
  if (!hasKey) {
    body = o.status === 'nokey'
      ? `<p class="ocr-note" role="status">Para a IA ler a foto da página, ative em <a href="#/ajustes">Ajustes › Busca com IA (gratuita)</a>. É grátis, com a sua chave do Google.</p>
        <p class="quote-hint">${LIVE_TEXT}</p>`
      : `<div class="ocr-actions"><button type="button" class="btn-outline ocr-btn" data-action="ocr-nokey">${CAMERA}Fotografar página</button></div>
        <p class="quote-hint">${LIVE_TEXT}</p>`;
  } else if (o.status === 'loading') {
    body = `
      <div class="ai-box" aria-busy="true">
        <p class="small ai-status" role="status">${icon('sparkle', { size: 16, stroke: 1.8, cls: 'accent' })}Lendo a foto…</p>
        ${progress(o.timeoutMs)}
        <button type="button" class="btn-text small ai-cancel" data-action="ocr-cancel">Cancelar</button>
      </div>`;
  } else if (limitReached && o.status !== 'done') {
    body = `<p class="muted small ai-limit">${LIMIT_TEXT}</p><p class="quote-hint">${LIVE_TEXT}</p>`;
  } else if (o.status === 'error') {
    body = `
      <p class="small ai-error" role="alert">${esc(o.message)}</p>
      ${o.retry ? '<button type="button" class="btn-outline ocr-btn ocr-retry" data-action="ocr-retry">Tentar de novo</button>' : ''}
      ${limitReached ? '' : photoButtons(true)}`;
  } else if (o.status === 'done') {
    body = `
      <div class="ocr-done" role="status">
        <p class="ocr-done-title">${icon('check', { size: 15, stroke: 2.4 })}Texto da foto no campo acima${o.page ? ` · página ${esc(o.page)}` : ''}</p>
        <p class="quote-hint">Deixe só o trecho que quer guardar: apague o resto, ou selecione o trecho e toque em “Manter só a seleção”. Confira o texto: nada é salvo até você tocar em Salvar.</p>
        <button type="button" class="btn-tonal ocr-keep" data-action="ocr-keep-selection">Manter só a seleção</button>
      </div>
      ${limitReached ? '' : photoButtons(true)}`;
  } else {
    body = `${photoButtons()}<p class="quote-hint">A IA copia o texto da foto para o campo acima; depois é só deixar o trecho que você quer. ${LIVE_TEXT}</p>`;  }
  return `<div class="ocr-box" id="quote-ocr">${body}</div>`;
}

// ---------- O que ler a seguir ----------

/** Entrada no Início, logo abaixo do "Quero ler". */
export function suggestTeaser() {
  return `<a class="card teaser list-row sug-teaser" href="#/sugestoes"><span class="teaser-plus">${icon('sparkle', { size: 20 })}</span><span class="teaser-text"><span class="teaser-title">O que ler a seguir</span><span class="muted small">Sugestões da IA para a sua fila e livros novos</span></span>${icon('chevronRight', { cls: 'muted' })}</a>`;
}

const MODE_TEXT = {
  fila: 'A IA ordena a sua fila “Quero ler” pelo que mais combina com os livros que você leu e as notas que deu.',
  novos: 'A IA sugere livros que você ainda não tem. Cada um é conferido na busca de livros: o que não for encontrado não aparece.',
};

function modeTabs(mode) {
  const btn = (value, label) => `<button type="button" class="seg-btn${value === mode ? ' is-on' : ''}" data-action="suggest-mode" data-value="${value}" aria-pressed="${value === mode}">${label}</button>`;
  return `<div class="segmented sug-modes" role="group" aria-label="Tipo de sugestão" style="--seg-count:2">${btn('fila', 'Da minha fila')}${btn('novos', 'Novos livros')}</div>`;
}

/** "de hoje", "de ontem" ou "de 27 out" (de outro ano: "de 27 out 2025"). */
export function cacheDateLabel(date, today) {
  if (date === today) return 'de hoje';
  const d = new Date(`${today}T12:00:00`);
  d.setDate(d.getDate() - 1);
  const yesterday = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  if (date === yesterday) return 'de ontem';
  return `de ${formatShort(date)}${date.slice(0, 4) === today.slice(0, 4) ? '' : ` ${date.slice(0, 4)}`}`;
}

function reasonLine(reason) {
  return reason ? `<p class="sug-reason">${icon('sparkle', { size: 14, stroke: 1.8, cls: 'accent' })}<span>${esc(reason)}</span></p>` : '';
}

function queueCard(book, reason, rank, upNext) {
  const next = upNext.includes(book.id);
  return `
    <article class="card sug-card">
      <div class="sug-top">
        <a class="sug-cover" href="#/livro/${encodeURIComponent(book.id)}" aria-label="${esc(book.title)}" tabindex="-1">${cover(book, { size: 'sm', showText: false })}<span class="sug-rank" aria-hidden="true">${rank}</span></a>
        <div class="sug-text">
          <a class="sug-title serif-title" href="#/livro/${encodeURIComponent(book.id)}">${esc(book.title)}</a>
          <span class="sug-author">${esc(book.authors || 'Autor não informado')}${book.pages ? ` · ${num(book.pages)} págs.` : ''}</span>
          ${reasonLine(reason)}
        </div>
      </div>
      <div class="sug-actions">${next
    ? `<span class="sug-done">${icon('check', { size: 15, stroke: 2.4 })}Nas próximas leituras</span>`
    : `<button type="button" class="btn-tonal sug-btn" data-action="toggle-next" data-id="${esc(book.id)}">Pôr nas próximas</button>`}</div>
    </article>`;
}

function newCard(r, i, books) {
  const meta = [r.authors, r.year, r.pages ? `${num(r.pages)} págs.` : ''].filter(Boolean).join(' · ');
  const owned = ownsBook(books, r);
  return `
    <article class="card sug-card">
      <div class="sug-top">
        <span class="sug-cover">${cover(r, { size: 'sm', showText: false })}</span>
        <div class="sug-text">
          <span class="sug-title serif-title">${esc(r.title)}</span>
          ${meta ? `<span class="sug-author">${esc(meta)}</span>` : ''}
          ${reasonLine(r.reason)}
          ${r.source ? `<span class="sug-source">Encontrado em: ${esc(r.source)}</span>` : ''}
        </div>
      </div>
      <div class="sug-actions">${owned
    ? `<span class="sug-done">${icon('check', { size: 15, stroke: 2.4 })}Já está nos seus livros</span>`
    : `<button type="button" class="btn-tonal sug-btn" data-action="suggest-add" data-index="${i}">${icon('plus', { size: 17, stroke: 2.2 })}Adicionar à fila</button>`}</div>
    </article>`;
}

function skeletons() {
  return Array.from({ length: 3 }, (_, i) => `
    <span class="card sug-card sug-skel" style="--skel-i:${i}" aria-hidden="true">
      <span class="sug-top"><span class="skel sug-skel-cover"></span><span class="sug-text"><span class="skel skel-line is-title"></span><span class="skel skel-line is-meta"></span><span class="skel skel-line is-short"></span></span></span>
    </span>`).join('');
}

/** Tela #/sugestoes. sg: ui.suggest = { mode, cache, loading, error }. */
export function suggestionsView({ state, ui, today, hasKey = false, used = 0, limitReached = false }) {
  const sg = ui.suggest || {};
  const mode = sg.mode === 'novos' ? 'novos' : 'fila';
  const books = state.books;
  const read = books.filter((b) => b.status === STATUS.READ).length;
  const want = books.filter((b) => b.status === STATUS.WANT);
  const cached = sg.cache?.[mode];
  const loading = sg.loading?.mode === mode ? sg.loading : null;
  const error = sg.error?.mode === mode ? sg.error : null;
  const askLabel = mode === 'fila' ? 'Ordenar minha fila' : 'Sugerir livros novos';

  let body;
  if (!hasKey) {
    body = `
      <div class="card sug-nokey">
        <p>As sugestões usam a IA gratuita do Google (Gemini), com a sua chave. Ative em <a href="#/ajustes">Ajustes › Busca com IA (gratuita)</a>: é grátis, sem cartão.</p>
      </div>`;
  } else if (!read) {
    body = emptyScene('lido', 'Primeiro, alguns livros lidos', 'Registre livros lidos (com nota, se puder): a IA usa o seu gosto para sugerir.');
  } else if (mode === 'fila' && !want.length) {
    body = emptyScene('quero', 'Sua fila está vazia', 'Adicione livros em “Quero ler”, ou veja livros novos sugeridos pela IA.', '<button type="button" class="btn-outline sug-ask" data-action="suggest-mode" data-value="novos">Ver livros novos</button>');
  } else {
    const ask = (label) => (limitReached
      ? `<button type="button" class="btn-outline ai-btn sug-ask" disabled aria-describedby="sug-limit">${icon('sparkle', { size: 18, stroke: 1.8 })}${label}</button>
        <p class="muted small ai-limit" id="sug-limit">${LIMIT_TEXT}</p>`
      : `<button type="button" class="btn-outline ai-btn sug-ask" data-action="suggest-run">${icon('sparkle', { size: 18, stroke: 1.8 })}${label}</button>`);
    let list = '';
    let head = '';
    if (loading) {
      head = `
        <div class="ai-box" aria-busy="true">
          <p class="small ai-status" role="status">${icon('sparkle', { size: 16, stroke: 1.8, cls: 'accent' })}${loading.stage === 'verify' ? 'Conferindo os livros na busca…' : mode === 'fila' ? 'Lendo a sua fila…' : 'Pedindo sugestões à IA…'}</p>
          ${progress(loading.timeoutMs)}
          <button type="button" class="btn-text small ai-cancel" data-action="suggest-cancel">Cancelar</button>
        </div>`;
      list = skeletons();
    } else {
      if (error) head = `<p class="small ai-error" role="alert">${esc(error.message)}</p>`;
      if (cached) {
        const items = mode === 'fila'
          ? cached.items.map((x) => ({ x, book: books.find((b) => b.id === x.id && b.status === STATUS.WANT) })).filter((x) => x.book)
          : cached.items;
        list = mode === 'fila'
          ? items.slice(0, SHOW_QUEUE).map(({ x, book }, i) => queueCard(book, x.reason, i + 1, state.upNext || [])).join('')
          : items.map((r, i) => newCard(r, i, books)).join('');
        const label = `Sugestões ${cacheDateLabel(cached.date, today)}`;
        head += `<div class="sug-head"><span class="muted small">${esc(label)} · ${plural(items.length, 'livro', 'livros')}</span></div>`;
        if (!items.length) list = '<p class="muted small sug-empty">Os livros dessa sugestão já saíram da fila. Peça de novo.</p>';
        list += `<div class="sug-refresh">${ask('Atualizar sugestões')}</div>`;
      } else {
        list = `<div class="sug-start">${ask(error?.retry === false ? askLabel : error ? 'Tentar de novo' : askLabel)}</div>`;
      }
    }
    body = `${head}<div class="sug-list">${list}</div>`;
  }
  const usage = hasKey ? `<p class="faint small sug-usage">Usos da IA este mês neste celular: ${Math.min(used, AI_MONTHLY_LIMIT)} de ${AI_MONTHLY_LIMIT}. Cada pedido gasta um; a última sugestão fica guardada.</p>` : '';
  return `
    <header class="top">
      <a class="icon-btn" href="#/inicio" aria-label="Voltar">${icon('chevronLeft', { stroke: 2 })}</a>
    </header>
    <div class="page-title">
      <span class="eyebrow">Com a IA gratuita</span>
      <h1 class="display">O que ler <em>a seguir</em></h1>
    </div>
    ${modeTabs(mode)}
    <p class="muted small sug-intro">${MODE_TEXT[mode]}</p>
    <div id="sug-body" class="sug-body">${body}</div>
    ${usage}`;
}
