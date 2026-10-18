import { searchBooks } from './books-api.js';
import { isIsoDate, todayIso, yearOf } from './dates.js';
import { photoToCover } from './cover-photo.js';
import * as db from './db.js';
import { closeOnFinish, recordProgress, unitOf, UNITS } from './journal.js';
import { renderRetroImage } from './share-image.js';
import {
  STATUS, FORMATS, createEmptyState, getGoal, newId, openStoredState, parseBackup,
  removeBook, restoreBook, serializeBackup, setGoal, startReread, upsertBook, validateBook, writeStoredState,
} from './store.js';
import { esc, icon, largeCoverUrl } from './ui.js';
import { allTimeView } from './views/alltime.js';
import { formView, lookupResults, readingSummary } from './views/form.js';
import { homeView } from './views/home.js';
import { retroData, retroView } from './views/retro.js';
import { searchResults, searchView } from './views/search.js';
import { settingsView } from './views/settings.js';
import { shelfView } from './views/shelf.js';
import { summaryView } from './views/summary.js';

const root = document.getElementById('app');
const nav = document.getElementById('nav');
const toastEl = document.getElementById('toast');

// Preenchido em boot(), antes da primeira tela.
let state = createEmptyState();
// Onde gravar: 'kv' (IndexedDB), 'legacy' (localStorage antigo) ou null (não gravar). Veja openStoredState.
let backend = null;
let ready = false;

const ui = {
  year: yearOf(todayIso()),
  shelfTab: STATUS.WANT,
  draft: null,
  picked: false,
  newGenreOpen: false,
  formErrors: [],
  backHref: '#/inicio',
  lookup: emptyLookup(),
  filters: { q: '', status: '', year: '', genre: '', format: '', minRating: '' },
  retroSlide: 0,
  finishing: false,
  original: null,
  editingProgress: null,
  storageInfo: null,
};

let lastDeleted = null;

let currentKey = null;
let previousKey = null;
let lookupTimer = null;
let lookupAbort = null;
let toastTimer = null;

function emptyLookup() {
  return { query: '', results: [], loading: false, failed: false, searched: false, isbn: '' };
}

// ---------- Navegação ----------

function parseRoute() {
  const hash = location.hash.replace(/^#\/?/, '');
  const [path, qs] = hash.split('?');
  const parts = path.split('/').filter(Boolean).map((p) => decodeURIComponent(p));
  return { name: parts[0] || 'inicio', params: parts.slice(1), query: new URLSearchParams(qs || ''), key: hash || 'inicio' };
}

function go(href) {
  if (location.hash === href || (href === '#/inicio' && !location.hash)) render();
  else location.hash = href;
}

function blankDraft(status) {
  const today = todayIso();
  return {
    id: null, title: '', authors: '', pages: null, cover: null, isbn: '',
    status,
    startDate: status === STATUS.READING ? today : null,
    endDate: status === STATUS.READ ? today : null,
    format: FORMATS.PHYSICAL, genre: null, rating: null, favorite: false, notes: '',
    currentPage: null, currentPercent: null, dropReason: '', reread: false,
    series: '', seriesNumber: null, tags: [], targetDate: null, quotes: [], journal: [],
  };
}

function enterRoute(route) {
  const prev = previousKey;
  const prevName = prev ? prev.split(/[/?]/)[0] : null;
  if (route.name === 'novo' || route.name === 'livro') {
    ui.backHref = prev && !['novo', 'livro'].includes(prevName) ? `#/${prev}` : '#/inicio';
    ui.formErrors = [];
    ui.newGenreOpen = false;
    if (route.name === 'novo') {
      const status = Object.values(STATUS).includes(route.query.get('status')) ? route.query.get('status') : STATUS.READ;
      ui.draft = blankDraft(status);
      ui.original = null;
      ui.finishing = false;
      ui.picked = false;
      ui.lookup = emptyLookup();
    } else {
      const book = state.books.find((b) => b.id === route.params[0]);
      if (!book) {
        ui.draft = null;
        return;
      }
      ui.draft = { ...book };
      ui.original = book;
      ui.finishing = Boolean(route.query.get('concluir')) && book.status !== STATUS.READ;
      if (route.query.get('concluir')) {
        ui.draft.status = STATUS.READ;
        ui.draft.endDate = ui.draft.endDate || todayIso();
      }
    }
  }
  if (route.name === 'retro') ui.retroSlide = 0;
  if (route.name === 'ajustes') refreshStorageInfo();
  if (route.name === 'estante' && route.query.get('aba')) ui.shelfTab = route.query.get('aba');
}

function render() {
  if (!ready) return;
  const route = parseRoute();
  if (route.key !== currentKey) {
    ui.editingProgress = null;
    closeCoverViewer();
    previousKey = currentKey;
    currentKey = route.key;
    enterRoute(route);
    window.scrollTo(0, 0);
  }
  const today = todayIso();
  const ctx = { state, ui, today, year: ui.year };
  let html;
  let showNav = true;
  switch (route.name) {
    case 'novo':
      html = formView({ ...ctx, isEdit: false });
      showNav = false;
      break;
    case 'livro':
      if (!ui.draft) {
        toast('Livro não encontrado.');
        go('#/inicio');
        return;
      }
      html = formView({ ...ctx, isEdit: true });
      showNav = false;
      break;
    case 'estante':
      html = shelfView({ ...ctx, tab: ui.shelfTab });
      break;
    case 'buscar':
      html = searchView(ctx);
      break;
    case 'resumo': {
      if (route.params[0] === 'todos') {
        html = allTimeView(ctx);
        break;
      }
      const year = Number(route.params[0]) || ui.year;
      html = summaryView({ ...ctx, year });
      break;
    }
    case 'retro': {
      const year = Number(route.params[0]) || ui.year;
      html = retroView({ ...ctx, year });
      showNav = false;
      break;
    }
    case 'ajustes':
      html = settingsView(ctx);
      break;
    default:
      html = homeView(ctx);
  }
  root.innerHTML = html;
  root.dataset.page = route.name;
  document.body.classList.toggle('no-nav', !showNav);
  for (const link of nav.querySelectorAll('[data-nav]')) {
    const on = link.dataset.nav === route.name || (link.dataset.nav === 'inicio' && !['estante', 'resumo', 'buscar'].includes(route.name));
    link.classList.toggle('is-on', on);
    if (on) link.setAttribute('aria-current', 'page'); else link.removeAttribute('aria-current');
  }
  const summaryLink = nav.querySelector('[data-nav="resumo"]');
  if (summaryLink) summaryLink.href = `#/resumo/${ui.year}`;
}

// ---------- Persistência ----------

const SAVE_FAILED = 'Não foi possível salvar neste aparelho. Exporte um backup agora.';
const LOAD_FAILED = 'Não foi possível abrir seus dados agora. Feche o app e abra de novo.';

let persistRequested = false;
let queued = null;
let writing = null;
// Avisa as outras abas (ou o app instalado aberto ao lado) que os dados mudaram.
const channel = 'BroadcastChannel' in window ? new BroadcastChannel('leituras') : null;

/** Grava em segundo plano, um estado por vez; se vários se acumulam, grava só o último. */
async function flushSaves() {
  while (queued) {
    const snapshot = queued;
    queued = null;
    if (await writeStoredState(backend, db, localStorage, snapshot)) {
      channel?.postMessage({ type: 'saved' });
    } else {
      toast(backend ? SAVE_FAILED : LOAD_FAILED, { sticky: !backend });
    }
  }
  writing = null;
}

/** Troca o estado na hora (a tela já pode redesenhar) e grava no aparelho em seguida. */
function persist(next, message) {
  state = next;
  queued = state;
  writing ||= flushSaves();
  if (message) toast(message);
  if (!persistRequested && navigator.storage?.persist) {
    persistRequested = true;
    navigator.storage.persist().catch(() => {});
  }
}

async function loadFromStorage() {
  const opened = await openStoredState(db, localStorage);
  state = opened.state;
  backend = opened.backend;
  if (opened.error) toast(LOAD_FAILED, { sticky: true });
}

channel?.addEventListener('message', async (e) => {
  if (e.data?.type !== 'saved' || writing) return;
  await loadFromStorage();
  render();
});

/** Espaço usado e proteção contra limpeza, para a tela de Ajustes. */
async function refreshStorageInfo() {
  ui.storageInfo = await db.storageInfo();
  if (parseRoute().name === 'ajustes') render();
}

// ---------- Avisos ----------

function toast(message, { actionLabel, action, sticky = false, duration = 3200 } = {}) {
  clearTimeout(toastTimer);
  toastEl.innerHTML = `<span>${esc(message)}</span>${actionLabel ? `<button type="button" data-action="${action}">${esc(actionLabel)}</button>` : ''}`;
  toastEl.classList.add('show');
  if (!sticky) toastTimer = setTimeout(() => toastEl.classList.remove('show'), duration);
}

function hideToast() {
  clearTimeout(toastTimer);
  toastEl.classList.remove('show');
}

// ---------- Arquivos ----------

function isIOS() {
  return /iP(hone|ad|od)/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}

function downloadBlob(blob, name) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}

/** Abre o menu de compartilhar do celular; devolve false se não for possível. */
async function shareFile(file, title) {
  if (!navigator.canShare?.({ files: [file] })) return false;
  try {
    await navigator.share({ files: [file], title });
  } catch (err) {
    if (err.name !== 'AbortError') return false;
  }
  return true;
}

async function exportBackup() {
  const ts = new Date().toISOString();
  const name = `leituras-backup-${todayIso()}.json`;
  const file = new File([serializeBackup(state, ts)], name, { type: 'application/json' });
  const shared = isIOS() && await shareFile(file, 'Backup do Leituras');
  if (!shared) downloadBlob(file, name);
  persist({ ...state, lastBackupAt: ts }, 'Backup exportado. Guarde o arquivo em local seguro.');
  render();
}

async function importBackup(input) {
  const file = input.files?.[0];
  input.value = '';
  if (!file) return;
  try {
    const imported = parseBackup(await file.text());
    const ok = window.confirm(`Substituir os dados atuais (${state.books.length} livros) pelos do backup (${imported.books.length} livros)?`);
    if (!ok) return;
    persist({ ...imported, lastBackupAt: imported.lastBackupAt || new Date().toISOString() }, 'Backup importado com sucesso.');
    ui.year = yearOf(todayIso());
    render();
  } catch (err) {
    toast(err.message || 'Não foi possível ler o arquivo.');
  }
}

async function retroImage(share) {
  const year = Number(parseRoute().params[0]) || ui.year;
  const data = retroData(state, year, todayIso());
  toast('Gerando imagem…', { sticky: true });
  try {
    const blob = await renderRetroImage(data, year);
    const name = `leituras-${year}.png`;
    const file = new File([blob], name, { type: 'image/png' });
    hideToast();
    if ((share || isIOS()) && await shareFile(file, `Minhas leituras de ${year}`)) return;
    downloadBlob(file, name);
    toast(share ? 'Imagem salva. Compartilhe a partir da galeria.' : 'Imagem salva.');
  } catch {
    toast('Não foi possível gerar a imagem.');
  }
}

async function setCoverFromPhoto(input) {
  const file = input.files?.[0];
  input.value = '';
  if (!file || !ui.draft) return;
  try {
    ui.draft.cover = await photoToCover(file);
    render();
  } catch (err) {
    toast(err.message || 'Não foi possível usar essa imagem.');
  }
}

// ---------- Busca de livros (formulário) ----------

function renderLookup() {
  const el = document.getElementById('lookup-results');
  if (el) el.innerHTML = lookupResults(ui.lookup);
}

async function runLookup() {
  lookupAbort?.abort();
  lookupAbort = new AbortController();
  const query = ui.lookup.query;
  ui.lookup.loading = true;
  renderLookup();
  const { results, failed, isbn } = await searchBooks(query, { signal: lookupAbort.signal, googleKey: googleBooksKey() });
  if (query !== ui.lookup.query) return;
  Object.assign(ui.lookup, { results, failed, isbn, loading: false, searched: true });
  // ISBN sem resultado: os outros campos ficam para a pessoa, mas o ISBN já vai junto ao salvar.
  if (isbn && !results.length && ui.draft) ui.draft.isbn = isbn;
  renderLookup();
}

// Chave opcional da API do Google Books (sem tela para isso ainda). Fica fora do
// estado de propósito, para não ir parar no arquivo de backup.
function googleBooksKey() {
  try {
    return localStorage.getItem('leituras:googleBooksKey') || '';
  } catch {
    return '';
  }
}

function onLookupInput(value) {
  ui.lookup.query = value;
  clearTimeout(lookupTimer);
  if (value.trim().length < 2) {
    lookupAbort?.abort();
    ui.lookup = { ...emptyLookup(), query: value };
    renderLookup();
    return;
  }
  lookupTimer = setTimeout(runLookup, 450);
}

// ---------- Capa ampliada ----------

function closeCoverViewer() {
  document.querySelector('.cover-viewer')?.remove();
  document.body.classList.remove('viewer-open');
}

/** Mostra a capa em tela cheia; tenta a versão grande e, se falhar, usa a original. */
function openCoverViewer(src, title) {
  if (!src) return;
  closeCoverViewer();
  const viewer = document.createElement('div');
  viewer.className = 'cover-viewer';
  viewer.setAttribute('role', 'dialog');
  viewer.setAttribute('aria-modal', 'true');
  viewer.setAttribute('aria-label', `Capa de ${title}`);
  viewer.innerHTML = `
    <button type="button" class="cover-viewer-close" aria-label="Fechar">${icon('close', { size: 22, stroke: 2 })}</button>
    <img class="cover-viewer-img" alt="Capa de ${esc(title)}">
    <p class="cover-viewer-hint">Toque fora da capa para fechar · use dois dedos para aproximar</p>`;
  const img = viewer.querySelector('img');
  const large = largeCoverUrl(src);
  img.addEventListener('error', () => {
    if (img.src !== src) img.src = src;
  });
  img.src = large || src;
  img.referrerPolicy = 'no-referrer';
  viewer.addEventListener('click', (e) => {
    if (e.target !== img) closeCoverViewer();
  });
  document.body.appendChild(viewer);
  document.body.classList.add('viewer-open');
  viewer.querySelector('.cover-viewer-close').focus();
}

// ---------- Progresso da leitura (cartão do Início) ----------

/** Livro com a nova posição e o diário atualizado (registro automático e silencioso). */
function withProgress(book, value) {
  const unit = unitOf(book);
  const journal = recordProgress(book, value, unit, todayIso());
  return unit === UNITS.PERCENT ? { ...book, currentPercent: value, journal } : { ...book, currentPage: value, journal };
}

/** Kindle: valor em %. Físico: página. Chegar ao fim abre o Concluir. */
function saveProgress(bookId, raw) {
  const book = state.books.find((b) => b.id === bookId);
  if (!book) return;
  const text = String(raw ?? '').trim().replace('%', '').replace(',', '.');
  if (text === '') {
    toast(book.format === FORMATS.KINDLE ? 'Informe a porcentagem.' : 'Informe a página.');
    return;
  }
  const value = Number(text);
  if (book.format === FORMATS.KINDLE) {
    if (!Number.isFinite(value) || value < 0 || value > 100) {
      toast('Informe uma porcentagem entre 0 e 100.');
      return;
    }
    ui.editingProgress = null;
    if (Math.round(value) === 100) {
      go(`#/livro/${encodeURIComponent(book.id)}?concluir=1`);
      return;
    }
    persist(upsertBook(state, withProgress(book, Math.round(value))).state, 'Progresso atualizado.');
    render();
    return;
  }
  if (!Number.isInteger(value) || value < 0 || (book.pages && value > book.pages)) {
    toast(book.pages ? `Informe uma página entre 0 e ${book.pages}.` : 'Informe um número de página válido.');
    return;
  }
  ui.editingProgress = null;
  if (book.pages && value === book.pages) {
    go(`#/livro/${encodeURIComponent(book.id)}?concluir=1`);
    return;
  }
  persist(upsertBook(state, withProgress(book, value)).state, 'Página atualizada.');
  render();
}

// ---------- Ações ----------

function saveBook() {
  const d = ui.draft;
  if (!d) return;
  const errors = validateBook(d, todayIso());
  if (errors.length) {
    ui.formErrors = errors;
    render();
    document.querySelector('.form-errors')?.scrollIntoView({ block: 'center', behavior: 'smooth' });
    return;
  }
  const isNew = !d.id;
  const { state: next, book } = upsertBook(state, { ...d, id: d.id || newId(), journal: journalOnSave(d, ui.original) });
  let message = isNew ? 'Livro adicionado.' : 'Alterações salvas.';
  if (ui.finishing && book.status === STATUS.READ) message = 'Leitura concluída. Parabéns!';
  persist(next, message);
  if (book.status === STATUS.READ && book.endDate) ui.year = yearOf(book.endDate);
  go(ui.backHref);
}

/**
 * Diário ao salvar o formulário. Livro novo não ganha entrada: a página informada
 * no cadastro é o ponto de partida, não leitura feita hoje.
 */
function journalOnSave(d, original) {
  const journal = d.journal || [];
  if (!original) return journal;
  const today = todayIso();
  if (d.status === STATUS.READ) {
    if (original.status === STATUS.READ) return journal;
    // Conclusão: registra no dia do término informado, se não for no futuro nem antes do diário.
    const last = journal[journal.length - 1]?.date || '';
    const day = isIsoDate(d.endDate) && d.endDate <= today && d.endDate >= last ? d.endDate : today;
    return closeOnFinish({ ...d, currentPage: original.currentPage, currentPercent: original.currentPercent }, day);
  }
  if (d.status !== STATUS.READING && d.status !== STATUS.DROPPED) return journal;
  const unit = unitOf(d);
  const field = unit === UNITS.PERCENT ? 'currentPercent' : 'currentPage';
  const value = d[field];
  if (value === null || value === undefined || value === '' || Number(value) === original[field]) return journal;
  return recordProgress({ ...d, [field]: original[field] }, Number(value), unit, today);
}

function changeGoal(el, isDefault) {
  const delta = Number(el.dataset.delta);
  const year = yearOf(todayIso());
  if (isDefault) {
    const g = Math.min(1000, Math.max(1, state.defaultGoal + delta));
    persist({ ...state, defaultGoal: g });
  } else {
    persist(setGoal(state, year, Math.max(1, getGoal(state, year) + delta)));
  }
  render();
}

const actions = {
  'pick-result'(el) {
    const r = ui.lookup.results[Number(el.dataset.index)];
    if (!r) return;
    Object.assign(ui.draft, { title: r.title, authors: r.authors, pages: r.pages, cover: r.cover, isbn: r.isbn });
    ui.picked = true;
    render();
  },
  unpick() {
    ui.picked = false;
    render();
    document.getElementById('lookup')?.focus();
  },
  'set-status'(el) {
    const d = ui.draft;
    d.status = el.dataset.value;
    if (d.status === STATUS.READING && !d.startDate) d.startDate = todayIso();
    if ((d.status === STATUS.READ || d.status === STATUS.DROPPED) && !d.endDate) d.endDate = todayIso();
    render();
  },
  'zoom-cover'() {
    if (ui.draft?.cover) openCoverViewer(ui.draft.cover, ui.draft.title || 'livro');
  },
  'remove-cover'() {
    ui.draft.cover = null;
    render();
  },
  reread() {
    if (!ui.original) return;
    const { state: next } = startReread(state, ui.original.id, todayIso());
    persist(next, 'Releitura iniciada. Boa leitura!');
    ui.year = yearOf(todayIso());
    go('#/inicio');
  },
  'update-page'(el) {
    ui.editingProgress = el.dataset.id;
    render();
    const input = document.getElementById('progress-input');
    input?.focus();
    input?.select();
  },
  'cancel-progress'() {
    ui.editingProgress = null;
    render();
  },
  'undo-delete'() {
    if (!lastDeleted) return;
    persist(restoreBook(state, lastDeleted.book, lastDeleted.index), 'Livro restaurado.');
    lastDeleted = null;
    render();
  },
  'set-format'(el) {
    ui.draft.format = el.dataset.value;
    render();
  },
  'set-genre'(el) {
    ui.draft.genre = ui.draft.genre === el.dataset.value ? null : el.dataset.value;
    render();
  },
  'open-genre'() {
    ui.newGenreOpen = true;
    render();
    document.getElementById('new-genre')?.focus();
  },
  'add-genre'() {
    const value = document.getElementById('new-genre')?.value.trim();
    if (value) ui.draft.genre = value.slice(0, 60);
    ui.newGenreOpen = false;
    render();
  },
  'set-rating'(el) {
    const n = Number(el.dataset.value);
    ui.draft.rating = ui.draft.rating === n ? null : n;
    render();
  },
  'toggle-fav'() {
    ui.draft.favorite = !ui.draft.favorite;
    render();
  },
  'delete-book'() {
    if (!ui.draft?.id) return;
    const index = state.books.findIndex((b) => b.id === ui.draft.id);
    if (index < 0) return;
    lastDeleted = { book: state.books[index], index };
    persist(removeBook(state, ui.draft.id));
    go(ui.backHref);
    toast(`"${lastDeleted.book.title}" excluído.`, { actionLabel: 'Desfazer', action: 'undo-delete', duration: 7000 });
  },
  'start-reading'(el) {
    const book = state.books.find((b) => b.id === el.dataset.id);
    if (!book) return;
    persist(upsertBook(state, { ...book, status: STATUS.READING, startDate: todayIso() }).state, 'Boa leitura!');
    render();
  },
  'clear-filters'() {
    ui.filters = { q: ui.filters.q, status: '', year: '', genre: '', format: '', minRating: '' };
    render();
  },
  'retro-prev'() {
    ui.retroSlide = Math.max(0, ui.retroSlide - 1);
    render();
  },
  'retro-next'(el) {
    ui.retroSlide = Math.min(Number(el.dataset.max), ui.retroSlide + 1);
    render();
  },
  'retro-save'() { retroImage(false); },
  'retro-share'() { retroImage(true); },
  'goal-year'(el) { changeGoal(el, false); },
  'goal-default'(el) { changeGoal(el, true); },
  'export-backup'() { exportBackup(); },
  'wipe-data'() {
    if (!window.confirm('Apagar TODOS os livros e ajustes deste celular?')) return;
    if (!window.confirm('Tem certeza? Sem um backup, não será possível recuperar.')) return;
    persist(createEmptyState(), 'Dados apagados.');
    go('#/inicio');
  },
  reload() { window.location.reload(); },
};

document.addEventListener('click', (e) => {
  const el = e.target.closest('[data-action]');
  if (!el || !actions[el.dataset.action]) return;
  e.preventDefault();
  actions[el.dataset.action](el);
});

document.addEventListener('input', (e) => {
  const t = e.target;
  if (t.dataset.field && ui.draft) {
    ui.draft[t.dataset.field] = t.type === 'number' ? (t.value === '' ? null : Number(t.value)) : t.value;
    // Atualiza só o resumo (dias, %): redesenhar o formulário tiraria o foco do campo.
    const summary = document.getElementById('reading-summary');
    if (summary && ['startDate', 'endDate', 'currentPage', 'currentPercent', 'pages'].includes(t.dataset.field)) {
      summary.innerHTML = readingSummary(ui.draft);
    }
  }
  if ('lookup' in t.dataset) onLookupInput(t.value);
  if (t.dataset.filter === 'q') {
    ui.filters.q = t.value;
    const el = document.getElementById('search-results');
    if (el) el.innerHTML = searchResults(state, ui.filters);
  }
});

document.addEventListener('change', (e) => {
  const t = e.target;
  if (t.dataset.change === 'home-year') {
    ui.year = Number(t.value);
    render();
  } else if (t.dataset.change === 'summary-year') {
    if (t.value !== 'todos') ui.year = Number(t.value);
    go(`#/resumo/${t.value}`);
  } else if (t.dataset.filter && t.dataset.filter !== 'q') {
    ui.filters[t.dataset.filter] = t.value;
    render();
  } else if ('import' in t.dataset) {
    importBackup(t);
  } else if ('coverPhoto' in t.dataset) {
    setCoverFromPhoto(t);
  }
});

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') closeCoverViewer();
  if (e.key !== 'Enter') return;
  if ('lookup' in e.target.dataset) {
    e.preventDefault();
    clearTimeout(lookupTimer);
    if (ui.lookup.query.trim().length >= 2) runLookup();
    e.target.blur();
  } else if ('newGenre' in e.target.dataset) {
    e.preventDefault();
    actions['add-genre']();
  }
});

document.addEventListener('submit', (e) => {
  if (e.target.closest('[data-submit="save-book"]')) {
    e.preventDefault();
    saveBook();
  }
  const progressForm = e.target.closest('[data-progress-form]');
  if (progressForm) {
    e.preventDefault();
    saveProgress(progressForm.dataset.id, progressForm.querySelector('input')?.value);
  }
});

// Capa que não carrega (offline, link quebrado): fica a capa desenhada.
document.addEventListener('error', (e) => {
  if (e.target.classList?.contains('cover-img')) e.target.remove();
}, true);

window.addEventListener('hashchange', render);

// ---------- Offline e atualizações ----------

if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
  let hadController = Boolean(navigator.serviceWorker.controller);
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!hadController) {
      hadController = true;
      return;
    }
    // Versão nova instalada: recarrega sozinho, a não ser no meio de um cadastro.
    const busy = ['novo', 'livro'].includes(parseRoute().name) || ui.editingProgress;
    if (busy || writing) toast('Nova versão do app disponível.', { actionLabel: 'Atualizar', action: 'reload', sticky: true });
    else window.location.reload();
  });
  navigator.serviceWorker.register('./sw.js').then((registration) => {
    // O app instalado no iPhone volta do segundo plano sem recarregar: procura versão nova nessa hora.
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') registration.update().catch(() => {});
    });
  }).catch(() => {});
}

// Os dados vêm do IndexedDB (assíncrono): a primeira tela espera por eles.
async function boot() {
  try {
    await loadFromStorage();
  } catch {
    backend = null;
    toast(LOAD_FAILED, { sticky: true });
  }
  ready = true;
  render();
}

boot();
