import { searchBooks } from './books-api.js';
import { booksToCsv, csvFileName } from './csv.js';
import { readGoogleKey, readName, removeGoogleKey, saveGoogleKey, saveName } from './prefs.js';
import { addTags, removeTag } from './tags.js';
import { MAX_UP_NEXT } from './store.js';
import { drawBook, moveUpNext, toggleUpNext } from './upnext.js';
import { formatShort, todayIso, yearOf } from './dates.js';
import { chartFilters } from './charts.js';
import { applyTints, hexToRgb, loadCoverColor, tintFor } from './cover-color.js';
import { applySpineColors } from './spines.js';
import { initCoverRetry, warmCovers } from './cover-cache.js';
import { normalizeCoverUrl } from './cover-url.js';
import { photoToCover } from './cover-photo.js';
import * as db from './db.js';
import { editEntry, removeEntry, restoreEntry, syncPosition } from './diary.js';
import { journalOnSave, recordProgress, unitOf, UNITS } from './journal.js';
import { renderQuoteImage } from './quote-image.js';
import { buildQuote, quoteFileName, removeQuote, restoreQuote, upsertQuote } from './quotes.js';
import { yearsWithData } from './stats.js';
import { milestoneMessage, newMilestones } from './milestones.js';
import { renderRetroImage } from './share-image.js';
import {
  STATUS, FORMATS, createEmptyState, getGoal, jsonEqual, newId, openStoredState, parseBackup, readStoredState,
  pauseReading, removeBook, restoreBook, serializeBackup, setGoal, startReread, upsertBook, validateBook, writeStoredState,
} from './store.js';
import { applyRescue, buildRescue, clearRescue, readRescue, writeRescue } from './rescue.js';
import { setPageGoal } from './store.js';
import { esc, icon, largeCoverUrl } from './ui.js';
import { allQuotesResults, allQuotesView } from './views/all-quotes.js';
import { allTimeView } from './views/alltime.js';
import { BOOK_TABS } from './views/book-tabs.js';
import { bookDetailView, loadedHdCovers } from './views/book-detail.js';
import { calendarUi, heatmapDayAt } from './views/calendar.js';
import { compareYearsOf } from './views/charts.js';
import { detailsHaveErrors, detailsSummary, aiLookupOptions, formView, lookupResults, readingSummary } from './views/form.js';
import { homeView } from './views/home.js';
import { retroData, retroView } from './views/retro.js';
import { searchResults, searchView } from './views/search.js';
import { APP_VERSION, settingsView, storageLine } from './views/settings.js';
import { SHELF_MODES, shelfView } from './views/shelf.js';
import { SUMMARY_TABS, summaryView } from './views/summary.js';
import { playIntro } from './views/kpi.js';
import { curveMonthAt } from './views/scurve.js';
import { addMinutes } from './journal.js';
import {
  elapsedMs, formatElapsed, isPaused, loadSession, pauseSession, resumeSession, saveSession,
  sessionMinutes, sessionSummary, startSession, wholeMinutes,
} from './timer.js';
import { timerView } from './views/timer.js';
import { closeSheet, openSheet } from './sheet.js';
import { initLongPress } from './longpress.js';
import { closeSwipe, initSwipe } from './swipe.js';
import { celebrateFinish, confettiColors, introMotion } from './motion.js';
import { progressSheet, progressTotal, quickMenu } from './views/sheets.js';
import { coverFallbackColor, finishHref } from './ui.js';
import { initTheme, setThemePref } from './theme.js';
import { initAccent, setAccentPref } from './accent.js';
import { slideTabs } from './tab-slide.js';
import { swapResults } from './empty-art.js';
import { initLargeTitles, syncLargeTitle } from './large-title.js';
import { AI_CONFIRM_TIMEOUT_MS, AI_TIMEOUT_MS, aiErrorMessage, aiSearch, enrichAiResults, isRetryable } from './ai-search.js';
import { aiLimitReached, aiSearchesThisMonth, countAiSearch, decodeKeysParam, keysLink, readAiUsage, readGeminiKey, removeGeminiKey, saveGeminiKey } from './prefs.js';
import {
  OCR_MAX_SIDE, OCR_QUALITY, OCR_TIMEOUT_MS, SUGGEST_TIMEOUT_MS, extrasErrorMessage, keepSelection, ownsBook,
  readPagePhoto, readSuggestions, saveSuggestions, suggestBooks,
} from './ai-extras.js';
import { resizePhoto } from './cover-photo.js';
import { quotePhotoBlock, suggestionsView } from './views/ai-views.js';

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
let lastPaused = null;

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

/** #/livro/:id é a ficha; #/livro/:id/editar (ou os endereços antigos com ?concluir e ?aba) é a edição. */
function isBookEdit(route) {
  return route.name === 'livro' && (route.params[1] === 'editar' || route.query.has('concluir') || route.query.has('aba'));
}

/** O endereço anterior (sem '#/') é a ficha ou a edição de um livro? */
function isBookKey(key) {
  return Boolean(key) && key.split(/[/?]/)[0] === 'livro';
}

function go(href) {
  if (location.hash === href || (href === '#/inicio' && !location.hash)) render();
  else {
    tagHistoryEntry();
    location.hash = href;
  }
}

// Cada entrada do histórico tem um número e guardamos qual tela ela mostra. Assim, sair da
// edição (Salvar, Cancelar, Voltar, Excluir) volta PELO histórico, como o gesto de voltar do
// iPhone, em vez de empilhar a tela de antes de novo: o voltar seguinte leva para onde a pessoa
// estava antes da ficha, e não de volta ao formulário.
// O número só é gravado na entrada (history.state.n) quando o próprio app sai dela (link, botão),
// nunca no meio de um redesenho: é a única forma de voltar a ela pelo histórico.
let historyIndex = 0;
let replacingEntry = false;
const historyKeys = new Map();

function trackHistory(key) {
  const tagged = history.state?.n;
  if (Number.isInteger(tagged)) historyIndex = tagged;
  else if (!replacingEntry) historyIndex += 1;
  replacingEntry = false;
  historyKeys.set(historyIndex, key);
}

/** Antes de o app trocar de tela: a entrada atual guarda o seu número. */
function tagHistoryEntry() {
  if (!historyIndex || history.state?.n === historyIndex) return;
  try {
    history.replaceState({ ...(history.state || {}), n: historyIndex }, '');
  } catch { /* sem acesso ao histórico: sair da edição só troca a entrada atual */ }
}

// Links do app (telas, barra de baixo, capas): a entrada atual é marcada antes de sair dela.
document.addEventListener('click', (e) => {
  if (e.target.closest?.('a[href^="#/"]')) tagHistoryEntry();
}, true);

// Volta pelo histórico já pedida (ela chega depois, no hashchange): um segundo toque rápido em
// Salvar ou Cancelar não volta mais uma tela (o que poderia até sair do app).
let leavingAt = 0;
addEventListener('hashchange', () => { leavingAt = 0; });

/** Sai da edição (ou do livro novo) para href: volta pelo histórico se href é a tela de onde se veio. */
function leaveForm(href) {
  if (leavingAt && Date.now() - leavingAt < 1500) return;
  const key = href.replace(/^#\/?/, '') || 'inicio';
  // Só atravessa telas do próprio livro (ficha, edição, livro novo) no caminho de volta.
  for (let n = historyIndex - 1; historyKeys.has(n); n -= 1) {
    const k = historyKeys.get(n);
    if (k === key) {
      leavingAt = Date.now();
      history.go(n - historyIndex);
      return;
    }
    if (!isBookKey(k) && !k.startsWith('novo')) break;
  }
  // Aberta por um link direto (ou depois de recarregar): troca a entrada da edição pela tela.
  if (location.hash === href || (href === '#/inicio' && !location.hash)) render();
  else {
    replacingEntry = true;
    location.replace(href);
  }
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

/** Ficha do livro: o Voltar leva para onde a pessoa estava antes de abrir o livro. */
function enterBookDetail(route, prev) {
  const id = route.params[0];
  // Vindo da edição (ou de outro livro, pela série), o Voltar continua apontando para a lista de origem.
  if (prev && !isBookKey(prev) && !prev.startsWith('novo')) ui.detailBack = `#/${prev}`;
  else if (!prev || !ui.detailBack) ui.detailBack = '#/inicio';
  ui.detailId = id;
  ui.draft = null;
  ui.original = null;
}

function enterRoute(route) {
  const prev = previousKey;
  const prevName = prev ? prev.split(/[/?]/)[0] : null;
  if (route.name === 'livro' && !isBookEdit(route)) enterBookDetail(route, prev);
  if (route.name === 'novo' || isBookEdit(route)) {
    // Edição: volta para a ficha do livro, a não ser que tenha vindo de outra tela
    // (o Concluir do Início volta para o Início; um trecho da lista de Trechos, para a lista).
    const detail = route.name === 'livro' ? `#/livro/${encodeURIComponent(route.params[0])}` : '#/inicio';
    ui.backHref = prev && !['novo', 'livro'].includes(prevName) ? `#/${prev}` : detail;
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
  if (route.name === 'novo' || isBookEdit(route)) enterBookNotes(route);
  if (route.name === 'retro') ui.retroSlide = 0;
  if (route.name === 'ajustes') {
    refreshStorageInfo();
    takeKeysFromRoute(route);
  }
  if (route.name === 'estante' && route.query.get('aba')) ui.shelfTab = route.query.get('aba');
  if (route.name === 'resumo' && SUMMARY_TABS.includes(route.query.get('aba'))) ui.summaryTab = route.query.get('aba');
}

// Rolagem de cada lista (Início, Estante, Buscar...) ao abrir um livro: voltar da ficha ou da
// edição (botão Voltar, gesto do iPhone) devolve a pessoa ao mesmo ponto da lista.
const listScroll = new Map();

function render() {
  if (!ready) return;
  const route = parseRoute();
  let scrollY = null;
  const sameScreen = route.key === currentKey;
  // Filtros da Buscar: a fileira de chips rola na horizontal e não deve pular ao redesenhar.
  const chipsScroll = sameScreen ? root.querySelector('.fchips')?.scrollLeft : null;
  if (route.key !== currentKey) {
    ui.editingProgress = null;
    closeSheet({ immediate: true, keepFocus: true });
    closeCoverViewer();
    if (currentKey && !isBookKey(currentKey)) listScroll.set(currentKey, window.scrollY);
    scrollY = isBookKey(currentKey) && !isBookKey(route.key) ? listScroll.get(route.key) || 0 : 0;
    previousKey = currentKey;
    currentKey = route.key;
    trackHistory(route.key);
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
    case 'livro': {
      const book = isBookEdit(route) ? ui.draft : state.books.find((b) => b.id === route.params[0]);
      if (!book) {
        toast('Livro não encontrado.');
        go('#/inicio');
        return;
      }
      html = isBookEdit(route) ? formView({ ...ctx, isEdit: true }) : bookDetailView({ ...ctx, book });
      showNav = false;
      break;
    }
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
    case 'trechos':
      html = allQuotesView(ctx);
      break;
    case 'sugestoes':
      html = suggestionsScreen(ctx);
      break;
    case 'ler':
      html = timerScreen(route.params[0]);
      if (html === null) return;
      showNav = false;
      break;
    default:
      html = homeView(ctx);
  }
  root.innerHTML = html;
  root.dataset.page = route.name;
  if (scrollY) window.scrollTo(0, scrollY);
  if (route.name === 'buscar') syncFilterChips(chipsScroll);
  applyTints(root);
  applySpineColors(root);
  revealFinishFields();
  // Abas e seletores: a marca desliza da opção anterior até a nova (js/tab-slide.js).
  slideTabs(root, [route.name, ...route.params].join('/'));
  if (route.name === 'resumo') summaryIntro(route);
  // Primeira vez no Início nesta sessão: o anel enche e os números contam.
  const intro = route.name === 'inicio' && !introShown;
  if (intro) {
    introShown = true;
    introMotion(root);
  }
  if (route.name === 'inicio') playFinishCelebration(!intro);
  focusAskedField(route);
  document.body.classList.toggle('no-nav', !showNav);
  // Trechos salvos se abre a partir do Resumo (Todos os anos).
  const navName = route.name === 'trechos' ? 'resumo' : route.name;
  for (const link of nav.querySelectorAll('[data-nav]')) {
    const on = link.dataset.nav === navName || (link.dataset.nav === 'inicio' && !['estante', 'resumo', 'buscar'].includes(navName));
    link.classList.toggle('is-on', on);
    if (on) link.setAttribute('aria-current', 'page'); else link.removeAttribute('aria-current');
  }
  const summaryLink = nav.querySelector('[data-nav="resumo"]');
  if (summaryLink) summaryLink.href = `#/resumo/${ui.year}`;
  syncLargeTitle();
}

/**
 * Fileira de filtros da Buscar: redesenhada na mesma tela, fica onde estava; ao chegar na
 * tela, o primeiro filtro ativo aparece (não fica escondido à direita, fora da vista).
 */
function syncFilterChips(previousScroll) {
  const row = root.querySelector('.fchips');
  if (!row) return;
  if (previousScroll != null) {
    row.scrollLeft = previousScroll;
    return;
  }
  const chip = row.querySelector('.fchip.is-on');
  if (!chip) return;
  const pad = parseFloat(getComputedStyle(row).paddingLeft) || 0;
  const box = chip.getBoundingClientRect();
  const left = box.left - row.getBoundingClientRect().left + row.scrollLeft;
  if (left + box.width > row.clientWidth - pad) row.scrollLeft = left - pad;
}

// ---------- Persistência ----------

const SAVE_FAILED = 'Não foi possível salvar neste aparelho. Exporte um backup agora.';
const LOAD_FAILED = 'Não foi possível abrir seus dados agora. Feche o app e abra de novo.';

let persistRequested = false;
let queued = null;
let writing = null;
// Conta as alterações feitas nesta aba (para não trocá-las por dados lidos antes delas).
let localChanges = 0;
// Último estado confirmado no aparelho (base da cópia de resgate) e se há cópia guardada.
let lastSaved = null;
let hasRescue = false;
// Outra aba salvou enquanto esta gravava: relê quando terminar.
let reloadPending = false;
// Avisa as outras abas (ou o app instalado aberto ao lado) que os dados mudaram.
const channel = 'BroadcastChannel' in window ? new BroadcastChannel('leituras') : null;

/** Grava em segundo plano, um estado por vez; se vários se acumulam, grava só o último. */
async function flushSaves() {
  while (queued) {
    const snapshot = queued;
    queued = null;
    if (await writeStoredState(backend, db, localStorage, snapshot)) {
      lastSaved = snapshot;
      channel?.postMessage({ type: 'saved' });
      // Tudo gravado: a cópia de resgate não é mais necessária.
      if (hasRescue && !queued) {
        clearRescue(localStorage);
        hasRescue = false;
      }
    } else {
      // Não gravou: a alteração fica também na cópia de resgate, aplicada na próxima abertura.
      saveRescue();
      toast(backend ? SAVE_FAILED : LOAD_FAILED, { sticky: !backend });
    }
  }
  writing = null;
  if (reloadPending) reloadFromStorage();
}

/** O app vai sair da tela com gravação em andamento: guarda o que mudou no localStorage. */
function saveRescue() {
  if (!writing || backend !== 'kv') return;
  if (writeRescue(localStorage, buildRescue(lastSaved, state))) hasRescue = true;
}

/** Na abertura: aplica a cópia de uma gravação que não terminou (app fechado no meio). */
function applyPendingRescue() {
  if (backend !== 'kv') return;
  const rescue = readRescue(localStorage);
  if (!rescue) return;
  hasRescue = true;
  const next = applyRescue(state, rescue);
  if (jsonEqual(next, state)) {
    clearRescue(localStorage);
    hasRescue = false;
    return;
  }
  // Grava pelo caminho normal; a cópia só sai do localStorage depois de confirmada.
  persist(next);
}

/** Troca o estado na hora (a tela já pode redesenhar) e grava no aparelho em seguida. */
function persist(next, message) {
  state = next;
  localChanges += 1;
  queued = state;
  writing ||= flushSaves();
  if (message) toast(message);
  if (!persistRequested && navigator.storage?.persist) {
    persistRequested = true;
    navigator.storage.persist().catch(() => {});
  }
  // Capa nova (livro salvo, backup restaurado...): já fica guardada para uso offline.
  warmCovers(state.books, { delay: 3000 });
}

function applyOpened(opened) {
  state = opened.state;
  lastSaved = state;
  backend = opened.backend;
  if (opened.error) toast(LOAD_FAILED, { sticky: true });
}

async function loadFromStorage() {
  applyOpened(await openStoredState(db, localStorage));
}

/**
 * Relê os dados que outra aba gravou (ou ao voltar do segundo plano, quando o aviso pode
 * ter se perdido). Só lê do armazenamento em uso: a migração é só na abertura, e uma falha
 * de leitura aqui mantém o que está na tela em vez de mostrar tudo vazio.
 */
async function reloadFromStorage() {
  if (!ready) return;
  if (writing) {
    reloadPending = true;
    return;
  }
  reloadPending = false;
  const before = localChanges;
  const stored = await readStoredState(backend, db, localStorage);
  // Alterado aqui enquanto lia: fica o desta aba (já indo para o aparelho, e a outra aba
  // recebe o aviso). Trocar pelo lido apagaria da tela o que acabou de ser salvo.
  if (!stored || localChanges !== before || writing) return;
  lastSaved = stored;
  if (jsonEqual(stored, state)) return;
  state = stored;
  render();
}

channel?.addEventListener('message', (e) => {
  if (e.data?.type === 'saved') reloadFromStorage();
});

/** Espaço usado e proteção contra limpeza, para a tela de Ajustes. */
async function refreshStorageInfo() {
  ui.storageInfo = await db.storageInfo();
  if (parseRoute().name !== 'ajustes') return;
  // Troca só a linha: redesenhar a tela inteira apagaria o que está sendo digitado
  // e trocaria o campo "Importar backup" no meio da escolha do arquivo.
  const html = storageLine(ui.storageInfo);
  const line = root.querySelector('.storage-info');
  if (line) line.outerHTML = html;
  else if (html) root.querySelector('[data-action="export-backup"]')?.insertAdjacentHTML('beforebegin', html);
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
    const format = ui.retroFormat === 'square' ? 'square' : 'story';
    const blob = await renderRetroImage(data, year, format);
    const name = format === 'square' ? `leituras-${year}-quadrado.png` : `leituras-${year}.png`;
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
  if (el) el.innerHTML = lookupResults(ui.lookup, aiLookupOptions(ui, todayIso()));
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
  // Como no app Fotos: a capa ampliada fica sobre fundo escuro também no tema claro.
  viewer.dataset.theme = 'dark';
  viewer.setAttribute('role', 'dialog');
  viewer.setAttribute('aria-modal', 'true');
  viewer.setAttribute('aria-label', `Capa de ${title}`);
  viewer.innerHTML = `
    <button type="button" class="cover-viewer-close" aria-label="Fechar">${icon('close', { size: 22, stroke: 2 })}</button>
    <img class="cover-viewer-img" alt="Capa de ${esc(title)}">
    <p class="cover-viewer-hint">Toque fora da capa para fechar · use dois dedos para aproximar</p>`;
  const img = viewer.querySelector('img');
  const base = normalizeCoverUrl(src) || src;
  const large = largeCoverUrl(base);
  img.addEventListener('error', () => {
    if (img.src !== base) img.src = base;
  });
  img.src = large || base;
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

/** Kindle: valor em %. Físico: página. Chegar ao fim abre o Concluir. Devolve o valor aceito (nada se inválido). */
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
      go(`#/livro/${encodeURIComponent(book.id)}/editar?concluir=1`);
      return 100;
    }
    persist(upsertBook(state, withProgress(book, Math.round(value))).state, 'Progresso atualizado.');
    render();
    closeSheet();
    return Math.round(value);
  }
  if (!Number.isInteger(value) || value < 0 || (book.pages && value > book.pages)) {
    toast(book.pages ? `Informe uma página entre 0 e ${book.pages}.` : 'Informe um número de página válido.');
    return;
  }
  ui.editingProgress = null;
  if (book.pages && value === book.pages) {
    go(`#/livro/${encodeURIComponent(book.id)}/editar?concluir=1`);
    return value;
  }
  persist(upsertBook(state, withProgress(book, value)).state, 'Página atualizada.');
  render();
  closeSheet();
  return value;
}

// ---------- Diário e trechos (abas do livro) ----------

// Último registro do diário ou trecho excluído, para o Desfazer.
let lastNoteDeleted = null;

/** Ao abrir um livro: aba Dados, ou a pedida no endereço (#/livro/id?aba=trechos). */
function enterBookNotes(route) {
  const tab = route.query.get('aba');
  ui.bookTab = route.name === 'livro' && BOOK_TABS.includes(tab) ? tab : 'dados';
  ui.diaryEdit = null;
  ui.quoteForm = null;
  ui.diaryWeeks = {};
}

function currentBook() {
  return state.books.find((b) => b.id === ui.draft?.id) || null;
}

/**
 * Grava diário/trechos direto no livro salvo: mudanças ainda não salvas em Dados
 * ficam só no rascunho. O rascunho recebe as mesmas listas, para que o Salvar
 * de Dados depois não desfaça o que foi feito aqui.
 */
function saveBookNotes(bookId, patch, message) {
  const book = state.books.find((b) => b.id === bookId);
  if (!book) return;
  const { state: next, book: saved } = upsertBook(state, { ...book, ...patch });
  persist(next, message);
  if (ui.draft?.id !== bookId) return;
  for (const key of Object.keys(patch)) {
    if (key === 'journal' || key === 'quotes' || ui.draft[key] === ui.original?.[key]) ui.draft[key] = saved[key];
  }
  ui.original = saved;
}

function saveDiaryEntry(form) {
  const book = currentBook();
  if (!book) return;
  const before = (book.journal || []).find((e) => e.date === form.dataset.date);
  const result = editEntry(book, form.dataset.date, Object.fromEntries(new FormData(form)), todayIso());
  if (result.error) {
    toast(result.error);
    return;
  }
  ui.diaryEdit = null;
  // Corrigiu o último dia: a página (ou %) atual do livro acompanha.
  saveBookNotes(book.id, { journal: result.journal, ...syncPosition(book, before, result.entry, result.journal) }, 'Registro corrigido.');
  render();
}

function saveQuote(form) {
  const book = currentBook();
  if (!book) return;
  const existing = (book.quotes || []).find((q) => q.id === form.dataset.id) || null;
  const result = buildQuote(book, Object.fromEntries(new FormData(form)), { existing, id: newId(), nowTs: new Date().toISOString() });
  if (result.error) {
    toast(result.error);
    return;
  }
  ui.quoteForm = null;
  saveBookNotes(book.id, { quotes: upsertQuote(book.quotes, result.quote) }, existing ? 'Trecho atualizado.' : 'Trecho salvo.');
  render();
}

/** Imagem 1080×1080 do trecho: menu de compartilhar do celular; sem ele, baixa o arquivo. */
async function shareQuoteImage(quoteId) {
  const book = currentBook();
  const quote = book?.quotes?.find((q) => q.id === quoteId);
  if (!quote) return;
  toast('Gerando imagem…', { sticky: true });
  try {
    const blob = await renderQuoteImage(quote, book);
    const name = quoteFileName(book);
    const file = new File([blob], name, { type: 'image/png' });
    hideToast();
    if (await shareFile(file, `Trecho de ${book.title}`)) return;
    downloadBlob(file, name);
    toast('Imagem salva.');
  } catch {
    toast('Não foi possível gerar a imagem.');
  }
}

/** Abre um formulário inline e põe o cursor no campo indicado. */
function openNotesForm(fieldId) {
  render();
  const field = document.getElementById(fieldId);
  field?.focus();
  field?.closest('form')?.scrollIntoView({ block: 'nearest' });
}

document.addEventListener('submit', (e) => {
  const diary = e.target.closest('[data-diary-form]');
  const quote = e.target.closest('[data-quote-form]');
  if (!diary && !quote) return;
  e.preventDefault();
  if (diary) saveDiaryEntry(diary);
  else saveQuote(quote);
});

// Busca dos trechos: redesenha só a lista, para não tirar o foco do campo.
document.addEventListener('input', (e) => {
  if (!('quotesQ' in e.target.dataset)) return;
  ui.quotesQuery = e.target.value;
  const el = document.getElementById('quotes-results');
  if (el) swapResults(el, allQuotesResults(state, ui.quotesQuery));
});

// ---------- Ações ----------

function saveBook() {
  const d = ui.draft;
  if (!d) return;
  const errors = validateBook(d, todayIso());
  if (errors.length) {
    ui.formErrors = errors;
    // Erro em gênero/série/etiquetas/data alvo: "Mais detalhes" abre para mostrá-lo.
    if (detailsHaveErrors(d, todayIso())) ui.moreDetails = { draft: d, open: true };
    render();
    document.querySelector('.form-errors')?.scrollIntoView({ block: 'center', behavior: 'smooth' });
    return;
  }
  const isNew = !d.id;
  // O id fica no rascunho: um segundo toque rápido em Salvar (antes de a tela mudar)
  // grava o mesmo livro de novo em vez de criar outro igual.
  d.id ||= newId();
  const booksBefore = state.books;
  const { state: next, book } = upsertBook(state, { ...d, journal: journalOnSave(d, ui.original, todayIso()) });
  let message = isNew ? 'Livro adicionado.' : 'Alterações salvas.';
  if (ui.finishing && book.status === STATUS.READ) message = 'Leitura concluída. Parabéns!';
  persist(next, message);
  if (book.status === STATUS.READ && ui.original?.status !== STATUS.READ) {
    const milestone = celebrateMilestones(booksBefore, next.books);
    // Livro que estava em leitura (ou na fila) e foi concluído: festa ao voltar ao Início.
    if (ui.finishing || ui.original) queueFinishCelebration(book, milestone);
  }
  if (book.status === STATUS.READ && book.endDate) ui.year = yearOf(book.endDate);
  leaveForm(ui.backHref);
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
    // Segundo toque antes de a tela mudar não cria outra releitura.
    ui.original = null;
    persist(next, 'Releitura iniciada. Boa leitura!');
    ui.year = yearOf(todayIso());
    leaveForm('#/inicio');
  },
  'update-page'(el) {
    openProgressSheet(el.dataset.id, el);
  },
  'cancel-progress'() {
    closeSheet();
  },
  'undo-delete'() {
    if (!lastDeleted) return;
    persist(restoreBook(state, lastDeleted.book, lastDeleted.index, lastDeleted.upNextIndex), 'Livro restaurado.');
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
    lastDeleted = { book: state.books[index], index, upNextIndex: (state.upNext || []).indexOf(ui.draft.id) };
    persist(removeBook(state, ui.draft.id));
    // Vindo da ficha do livro excluído: volta para a lista de onde a ficha foi aberta.
    leaveForm(ui.backHref.startsWith(`#/livro/${encodeURIComponent(ui.draft.id)}`) ? ui.detailBack || '#/inicio' : ui.backHref);
    toast(`"${lastDeleted.book.title}" excluído.`, { actionLabel: 'Desfazer', action: 'undo-delete', duration: 7000 });
  },
  'pause-reading'(el) {
    const { state: next, before } = pauseReading(state, el.dataset.id);
    if (!before) return;
    // Cronômetro aberto deste livro: a sessão acaba junto (senão voltaria, com horas a mais,
    // quando o livro fosse começado de novo). O Desfazer a devolve.
    const session = ui.session?.bookId === before.id ? ui.session : null;
    if (session) {
      ui.timerStop = null;
      setSession(null);
    }
    lastPaused = { book: before, session };
    persist(next);
    render();
    toast(`"${before.title}" voltou para Quero ler.`, { actionLabel: 'Desfazer', action: 'undo-pause', duration: 7000 });
  },
  'undo-pause'() {
    const book = lastPaused && state.books.find((b) => b.id === lastPaused.book.id);
    // Só desfaz se o livro ainda está como ficou (nem excluído, nem começado de novo).
    if (!book || book.status !== STATUS.WANT) return;
    persist(upsertBook(state, lastPaused.book).state, 'Leitura retomada.');
    if (lastPaused.session && !ui.session) setSession(lastPaused.session);
    lastPaused = null;
    render();
  },
  'start-reading'(el) {
    const book = state.books.find((b) => b.id === el.dataset.id);
    if (!book) return;
    // Sessão do cronômetro que sobrou deste livro (de antes de ele sair de Lendo): recomeça do zero.
    if (ui.session?.bookId === book.id && book.status !== STATUS.READING) {
      ui.timerStop = null;
      setSession(null);
    }
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
    // Sessão do cronômetro aberta não sobrevive: voltaria do nada se um backup fosse importado depois.
    ui.timerStop = null;
    setSession(null);
    go('#/inicio');
  },
  async reload() {
    // Atualizar no meio de uma gravação a cancelaria: espera ela terminar.
    while (writing) await writing;
    window.location.reload();
  },

  // ---------- Diário e trechos (abas do livro) ----------
  'book-tab'(el) {
    ui.bookTab = el.dataset.tab;
    ui.diaryEdit = null;
    ui.quoteForm = null;
    render();
  },
  'book-save'() {
    // Volta para Dados: se houver erro no formulário, ele aparece lá.
    ui.bookTab = 'dados';
    saveBook();
  },
  'diary-edit'(el) {
    ui.diaryEdit = el.dataset.date;
    openNotesForm('d-to');
  },
  'diary-cancel'() {
    ui.diaryEdit = null;
    render();
  },
  'diary-delete'(el) {
    const book = currentBook();
    const entry = book?.journal?.find((e) => e.date === el.dataset.date);
    if (!entry) return;
    lastNoteDeleted = { bookId: book.id, entry };
    ui.diaryEdit = null;
    saveBookNotes(book.id, { journal: removeEntry(book, entry.date) });
    render();
    toast(`Registro de ${formatShort(entry.date)} excluído.`, { actionLabel: 'Desfazer', action: 'notes-undo', duration: 7000 });
  },
  'quote-new'() {
    ui.quoteForm = { id: null };
    openNotesForm('q-text');
  },
  'quote-edit'(el) {
    ui.quoteForm = { id: el.dataset.id };
    openNotesForm('q-text');
  },
  'quote-cancel'() {
    ui.quoteForm = null;
    render();
  },
  'quote-delete'(el) {
    const book = currentBook();
    const index = (book?.quotes || []).findIndex((q) => q.id === el.dataset.id);
    if (index < 0) return;
    lastNoteDeleted = { bookId: book.id, quote: book.quotes[index], index };
    saveBookNotes(book.id, { quotes: removeQuote(book.quotes, el.dataset.id) });
    render();
    toast('Trecho excluído.', { actionLabel: 'Desfazer', action: 'notes-undo', duration: 7000 });
  },
  'quote-share'(el) { shareQuoteImage(el.dataset.id); },
  'notes-undo'() {
    const d = lastNoteDeleted;
    const book = d && state.books.find((b) => b.id === d.bookId);
    if (!book) return;
    lastNoteDeleted = null;
    const patch = d.entry ? { journal: restoreEntry(book, d.entry) } : { quotes: restoreQuote(book.quotes, d.quote, d.index) };
    saveBookNotes(book.id, patch, d.entry ? 'Registro restaurado.' : 'Trecho restaurado.');
    render();
  },
};

// ---------- Estatísticas: calendário, gráficos e meta de páginas ----------
// Estado só da tela (não vai para os dados): modo do calendário, gráfico mensal e anos comparados.
Object.assign(ui, { calendar: null, monthChart: 'livros', compare: null });

const BLANK_FILTERS = { q: '', status: '', year: '', genre: '', format: '', minRating: '' };

function setCalendar(year, changes) {
  ui.calendar = { ...calendarUi(ui, year, todayIso()), ...changes };
  render();
}

Object.assign(actions, {
  'cal-mode'(el) { setCalendar(Number(el.dataset.year), { mode: el.dataset.mode }); },
  'cal-month'(el) {
    const year = Number(el.dataset.year);
    const month = calendarUi(ui, year, todayIso()).month + Number(el.dataset.delta);
    if (month >= 0 && month <= 11) setCalendar(year, { month });
  },
  'cal-day'(el) { setCalendar(Number(el.dataset.year), { day: el.dataset.date }); },
  'month-chart-mode'(el) {
    ui.monthChart = el.dataset.mode;
    render();
  },
  // Toque numa barra ou faixa: abre a Buscar com os livros daquele recorte.
  'chart-filter'(el) {
    ui.filters = chartFilters(el.dataset.year, el.dataset.kind, el.dataset.value);
    go('#/buscar');
  },
  'clear-chart-filter'() {
    // Como o "Limpar": o texto digitado na busca fica.
    ui.filters = { ...BLANK_FILTERS, q: ui.filters.q };
    render();
  },
  'page-goal-remove'(el) {
    persist(setPageGoal(state, Number(el.dataset.year), null), 'Meta de páginas removida.');
    render();
  },
});

// ---------- Resumo v1.4: abas, curva S, medalhas e movimento de entrada ----------
// Estado só da tela: aba do resumo (lembrada na sessão), curva em livros ou páginas e mês tocado.
Object.assign(ui, { summaryTab: 'geral', curve: 'livros', curveMonth: null });

// Os números contam e a curva se desenha só na primeira vez que cada resumo aparece na sessão.
const introSeen = new Set();
function summaryIntro(route) {
  const key = route.params[0] || String(ui.year);
  if (introSeen.has(key) || !root.querySelector('.kpi-num, .sc-svg')) return;
  introSeen.add(key);
  playIntro(root);
}

function showSummaryTab(tab, year) {
  if (!SUMMARY_TABS.includes(tab)) return;
  ui.summaryTab = tab;
  // Link direto (#/resumo/2026?aba=ritmo) sem virar uma nova página: não rola para o topo.
  history.replaceState(history.state, '', `#/resumo/${year}${tab === 'geral' ? '' : `?aba=${tab}`}`);
  currentKey = parseRoute().key;
  historyKeys.set(historyIndex, currentKey);
  render();
  // Trocar de aba lá embaixo: volta para o começo do painel, logo abaixo das abas fixas.
  const panel = document.getElementById('rs-panel');
  const tabs = document.querySelector('.rs-tabs');
  if (panel && tabs) {
    const target = panel.getBoundingClientRect().top + window.scrollY - tabs.offsetHeight - 12;
    if (window.scrollY > target) window.scrollTo(0, target);
  }
}

Object.assign(actions, {
  'summary-tab'(el) { showSummaryTab(el.dataset.tab, el.dataset.year); },
  'curve-mode'(el) {
    ui.curve = el.dataset.mode;
    ui.curveMonth = null;
    render();
  },
  // Medalha: o detalhe aparece embaixo da fileira, sem redesenhar (a rolagem lateral fica onde está).
  medal(el) {
    const section = el.closest('.milestones');
    const panel = section?.querySelector('[data-medal-detail]');
    if (!panel) return;
    const on = el.getAttribute('aria-pressed') === 'true';
    panel.dataset.hint = panel.dataset.hint || panel.textContent;
    for (const b of section.querySelectorAll('.medal-item')) b.setAttribute('aria-pressed', 'false');
    if (on) {
      panel.textContent = panel.dataset.hint;
      panel.classList.remove('is-on');
      return;
    }
    el.setAttribute('aria-pressed', 'true');
    const { title, detail, book } = el.dataset;
    panel.innerHTML = `<span class="strong-ish">${esc(title)}</span> <span>${esc(detail)}</span>${book ? ` <a href="#/livro/${encodeURIComponent(book)}">Ver livro</a>` : ''}`;
    panel.classList.add('is-on');
  },
});

// Curva S: o toque vale para o mês sob o dedo (o gráfico inteiro é a área de toque).
document.addEventListener('click', (e) => {
  const svg = e.target.closest?.('[data-curve]');
  if (!svg) return;
  const month = curveMonthAt(svg, e.clientX);
  if (month === null) return;
  const year = Number(svg.dataset.year);
  const same = ui.curveMonth?.year === year && ui.curveMonth.month === month;
  ui.curveMonth = same ? null : { year, month };
  render();
});

// Abas com as setas do teclado (padrão de abas acessíveis).
document.addEventListener('keydown', (e) => {
  const tab = e.target.closest?.('.rs-tab');
  if (!tab || !['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) return;
  e.preventDefault();
  const i = SUMMARY_TABS.indexOf(tab.dataset.tab);
  const next = e.key === 'Home' ? 0 : e.key === 'End' ? SUMMARY_TABS.length - 1
    : (i + (e.key === 'ArrowRight' ? 1 : -1) + SUMMARY_TABS.length) % SUMMARY_TABS.length;
  showSummaryTab(SUMMARY_TABS[next], tab.dataset.year);
  document.getElementById(`rs-tab-${SUMMARY_TABS[next]}`)?.focus();
});

// Mapa do ano: o toque vale para o quadradinho mais próximo (são pequenos no celular).
document.addEventListener('click', (e) => {
  const svg = e.target.closest?.('[data-heatmap]');
  if (!svg) return;
  const day = heatmapDayAt(svg, e.clientX, e.clientY);
  if (day) setCalendar(Number(svg.dataset.year), { day });
});

document.addEventListener('change', (e) => {
  const which = { 'compare-a': 'a', 'compare-b': 'b' }[e.target.dataset?.change];
  if (!which) return;
  const years = yearsWithData(state.books, yearOf(todayIso()));
  ui.compare = { ...compareYearsOf(ui, years), [which]: Number(e.target.value) };
  render();
});

document.addEventListener('submit', (e) => {
  const form = e.target.closest('[data-page-goal-form]');
  if (!form) return;
  e.preventDefault();
  const raw = form.querySelector('input')?.value.trim() || '';
  const goal = Number(raw.replace(/\./g, ''));
  if (!Number.isInteger(goal) || goal < 1 || goal > 1000000) {
    toast('Informe um número de páginas entre 1 e 1.000.000.');
    return;
  }
  persist(setPageGoal(state, Number(form.dataset.year), goal), 'Meta de páginas salva.');
  render();
});

// ---------- Marcos e retrospectiva (v1.3) ----------

// Formato da imagem da retrospectiva: 'story' (1080×1920) ou 'square' (1080×1080).
ui.retroFormat = 'story';

actions['retro-format'] = (el) => {
  ui.retroFormat = el.dataset.value === 'square' ? 'square' : 'story';
  render();
};

/** Livro concluído: se um marco novo apareceu, avisa com o toast (sem pop-up, sem pontos). Devolve se houve. */
function celebrateMilestones(booksBefore, booksAfter) {
  const message = milestoneMessage(newMilestones(booksBefore, booksAfter));
  if (message) toast(message, { duration: 5000 });
  return Boolean(message);
}

document.addEventListener('click', (e) => {
  const el = e.target.closest('[data-action]');
  if (!el || !actions[el.dataset.action]) return;
  e.preventDefault();
  const hadFocus = document.activeElement === el;
  actions[el.dataset.action](el);
  // Redesenhar a tela troca os botões e o foco cairia no começo da página:
  // quem usa teclado volta para o mesmo botão (ex.: a meia estrela que escolheu).
  if (hadFocus && !el.isConnected && (!document.activeElement || document.activeElement === document.body)) {
    const { action, value, id } = el.dataset;
    [...document.querySelectorAll('[data-action]')]
      .find((x) => x.dataset.action === action && x.dataset.value === value && x.dataset.id === id)
      ?.focus({ preventScroll: true });
  }
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
    if (el) swapResults(el, searchResults(state, ui.filters));
  }
});

document.addEventListener('change', (e) => {
  const t = e.target;
  if (t.dataset.change === 'home-year') {
    ui.year = Number(t.value);
    render();
  } else if (t.dataset.change === 'summary-year') {
    if (t.value !== 'todos') ui.year = Number(t.value);
    // A aba continua a mesma no outro ano, e o endereço diz qual é (voltar/avançar e link direto).
    const aba = t.value !== 'todos' && ui.summaryTab !== 'geral' ? `?aba=${ui.summaryTab}` : '';
    go(`#/resumo/${t.value}${aba}`);
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
  } else if (e.target.matches?.('input:not([data-tag-input])') && e.target.closest('[data-submit="save-book"]') && parseRoute().name === 'novo') {
    // Livro novo: o Return do teclado não salva (sairia "Lido" com a data de hoje sem querer).
    // Título → Autor → Páginas; nos outros campos só fecha o teclado. Salvar é só pelo botão.
    e.preventDefault();
    const order = ['f-title', 'f-authors', 'f-pages'];
    const at = order.indexOf(e.target.id);
    const next = at >= 0 ? document.getElementById(order[at + 1]) : null;
    if (next) next.focus();
    else e.target.blur();
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

// ---------- Fila, etiquetas, série, planilha e chave do Google (v1.3) ----------
// Bloco próprio: ações novas entram no mesmo objeto `actions` usado pelos cliques.

Object.assign(ui, { draw: null, groupSeries: false, tagInput: '', googleKey: readGoogleKey(localStorage) });

/** Sorteia (de novo) com os filtros do painel, evitando repetir o último. */
function drawNext() {
  const picked = drawBook(state.books, ui.draw, Math.random, ui.draw.id);
  ui.draw.id = picked?.id || null;
}

/** Leva o texto digitado no campo de etiqueta para o livro. Devolve true se acrescentou algo. */
function commitTagInput() {
  const value = document.querySelector('[data-tag-input]')?.value ?? ui.tagInput;
  ui.tagInput = '';
  if (!ui.draft || !String(value).trim()) return false;
  ui.draft.tags = addTags(ui.draft.tags, value);
  return true;
}

function focusTagInput() {
  const input = document.getElementById('f-tag');
  if (!input) return;
  input.focus();
  input.setSelectionRange(input.value.length, input.value.length);
}

async function exportCsv() {
  const name = csvFileName(todayIso());
  const file = new File([booksToCsv(state.books)], name, { type: 'text/csv;charset=utf-8' });
  const shared = isIOS() && await shareFile(file, 'Planilha do Leituras');
  if (!shared) downloadBlob(file, name);
  toast('Planilha exportada.');
}

function saveGoogleKeyFromInput() {
  const result = saveGoogleKey(localStorage, document.querySelector('[data-gkey]')?.value);
  if (!result.key) {
    toast('Cole a chave antes de salvar.');
    return;
  }
  if (!result.ok) {
    toast('Não foi possível salvar a chave neste aparelho.');
    return;
  }
  ui.googleKey = result.key;
  render();
  if (result.warning) {
    toast('Chave salva, mas ela não parece uma chave do Google (começa com AIza e tem 39 caracteres). Confira se colou inteira.', { duration: 7000 });
  } else {
    toast('Chave salva. A busca vai consultar também o Google Books.');
  }
}

Object.assign(actions, {
  'toggle-next'(el) {
    const { state: next, full } = toggleUpNext(state, el.dataset.id);
    if (full) {
      toast(`Limite de ${MAX_UP_NEXT} próximas. Tire uma da lista para marcar outra.`);
      return;
    }
    persist(next);
    render();
  },
  'move-next'(el) {
    const { id, delta } = el.dataset;
    persist(moveUpNext(state, id, Number(delta)));
    render();
    // Mantém o foco no mesmo botão (quem usa leitor de tela continua de onde estava).
    const again = document.querySelector(`[data-action="move-next"][data-delta="${delta}"][data-id="${CSS.escape(id)}"]`);
    (again && !again.disabled ? again : document.querySelector(`[data-action="move-next"][data-id="${CSS.escape(id)}"]:not([disabled])`))?.focus();
  },
  'draw-open'() {
    ui.draw = { genre: '', format: '', id: null };
    drawNext();
    render();
  },
  'draw-again'() {
    if (!ui.draw) return;
    drawNext();
    render();
  },
  'draw-close'() {
    ui.draw = null;
    render();
  },
  'draw-start'(el) {
    ui.draw = null;
    actions['start-reading'](el);
  },
  'toggle-group-series'() {
    ui.groupSeries = !ui.groupSeries;
    render();
  },
  'add-tag'(el) {
    if (!ui.draft) return;
    ui.draft.tags = addTags(ui.draft.tags, el.dataset.value);
    render();
  },
  'remove-tag'(el) {
    if (!ui.draft) return;
    ui.draft.tags = removeTag(ui.draft.tags, el.dataset.value);
    render();
    focusTagInput();
  },
  'add-tag-input'() {
    commitTagInput();
    render();
    focusTagInput();
  },
  'clear-target-date'() {
    if (!ui.draft) return;
    ui.draft.targetDate = null;
    render();
  },
  'export-csv'() { exportCsv(); },
  'save-gkey'() { saveGoogleKeyFromInput(); },
  'remove-gkey'() {
    removeGoogleKey(localStorage);
    ui.googleKey = '';
    render();
    toast('Chave removida. A busca volta a usar BrasilAPI e Open Library.');
  },
});

document.addEventListener('input', (e) => {
  const t = e.target;
  if (!('tagInput' in t.dataset) || !ui.draft) return;
  // Vírgula fecha a etiqueta: o que vem antes entra no livro, o resto continua no campo.
  if (t.value.includes(',')) {
    const cut = t.value.lastIndexOf(',');
    ui.draft.tags = addTags(ui.draft.tags, t.value.slice(0, cut));
    ui.tagInput = t.value.slice(cut + 1).trimStart();
    render();
    focusTagInput();
  } else {
    ui.tagInput = t.value;
  }
});

document.addEventListener('keydown', (e) => {
  if (e.key !== 'Enter') return;
  if ('tagInput' in e.target.dataset) {
    // Enter num campo de texto enviaria o formulário: aqui ele só acrescenta a etiqueta.
    e.preventDefault();
    commitTagInput();
    render();
    focusTagInput();
  } else if ('gkey' in e.target.dataset) {
    e.preventDefault();
    saveGoogleKeyFromInput();
  }
});

document.addEventListener('change', (e) => {
  const t = e.target;
  if (!t.dataset.draw || !ui.draw) return;
  ui.draw[t.dataset.draw] = t.value;
  ui.draw.id = null;
  drawNext();
  render();
});

// Antes do salvar (fase de captura): etiqueta digitada e não confirmada também vale.
document.addEventListener('submit', (e) => {
  if (e.target.closest('[data-submit="save-book"]')) commitTagInput();
}, true);

// Mudou de tela: o texto de etiqueta pela metade e o painel de sorteio não acompanham.
window.addEventListener('hashchange', () => {
  ui.tagInput = '';
  ui.draw = null;
});

// Capa que não carrega (offline, rede lenta, site fora do ar): fica a capa desenhada e a
// imagem é pedida de novo mais tarde (cover-cache.js), sem precisar sair da tela.
initCoverRetry(() => state?.books || []);

// Cancelar/Voltar da edição: volta pelo histórico (veja leaveForm).
document.addEventListener('click', (e) => {
  if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
  const link = e.target.closest?.('a[data-leave]');
  if (!link) return;
  e.preventDefault();
  leaveForm(link.getAttribute('href'));
});

// Endereço já desenhado pela transição da capa (abaixo): o hashchange que chega depois não redesenha.
let renderedByTransition = null;
window.addEventListener('hashchange', () => {
  const skip = renderedByTransition && renderedByTransition === location.hash;
  renderedByTransition = null;
  if (!skip) render();
});

// ---------- Formulário enxuto (v1.4): "Mais detalhes", gênero e "Concluir" ----------

const reducedMotion = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

Object.assign(actions, {
  // Abre/fecha sem redesenhar a tela: a altura anima (CSS) e o foco fica no botão.
  'toggle-more'(el) {
    if (!ui.draft) return;
    const open = el.getAttribute('aria-expanded') !== 'true';
    ui.moreDetails = { draft: ui.draft, open };
    el.setAttribute('aria-expanded', String(open));
    const box = el.closest('.more');
    box?.classList.toggle('is-open', open);
    // Fechando: o resumo passa a mostrar o que foi preenchido lá dentro.
    const summary = box?.querySelector('.more-summary');
    if (!open && summary) summary.innerHTML = detailsSummary(ui.draft);
    // Botão na metade de baixo da tela: sobe um pouco para mostrar o que abriu.
    if (open && el.getBoundingClientRect().top > window.innerHeight * 0.55) {
      el.scrollIntoView({ block: 'start', behavior: reducedMotion() ? 'auto' : 'smooth' });
    }
  },
  'close-genre'() {
    ui.newGenreOpen = false;
    render();
    document.getElementById('f-genre')?.focus({ preventScroll: true });
  },
});

// Seletor de gênero: "Sem gênero" apaga; "+ Novo gênero…" abre o campo de texto.
document.addEventListener('change', (e) => {
  const t = e.target;
  if (!('genreSelect' in t.dataset) || !ui.draft) return;
  if (t.selectedOptions[0] && 'newGenreOption' in t.selectedOptions[0].dataset) {
    t.value = ui.draft.genre || '';
    actions['open-genre']();
    return;
  }
  ui.draft.genre = t.value || null;
  if (ui.newGenreOpen) {
    ui.newGenreOpen = false;
    render();
  }
});

// Antes do salvar (fase de captura): gênero novo digitado sem tocar em OK também vale.
document.addEventListener('submit', (e) => {
  if (!e.target.closest('[data-submit="save-book"]') || !ui.draft) return;
  const value = document.getElementById('new-genre')?.value.trim();
  if (value) ui.draft.genre = value.slice(0, 60);
  ui.newGenreOpen = false;
}, true);

// "Concluir" (?concluir=1): a tela abre já no status, datas e nota, uma vez por rascunho.
let revealedDraft = null;
function revealFinishFields() {
  if (!ui.finishing || !ui.draft || revealedDraft === ui.draft) return;
  const status = document.getElementById('f-status');
  if (!status) return;
  revealedDraft = ui.draft;
  const last = document.querySelector('.star-row') || document.getElementById('f-period') || status;
  if (last.getBoundingClientRect().bottom > window.innerHeight - 96) status.scrollIntoView({ block: 'start' });
}

// ---------- Cronômetro de leitura ----------
// A sessão fica no localStorage (fora do estado e do backup: é passageira) e o tempo
// sai sempre dos horários gravados; o intervalo de 1 s só redesenha o número na tela.

ui.session = loadSession(localStorage);
// Formulário do "Parar" aberto: { resume } diz se o cronômetro corria antes de parar.
ui.timerStop = null;
let timerTicker = null;
let wakeLock = null;
let wakeLockPending = false;

function setSession(session) {
  ui.session = session;
  saveSession(localStorage, session);
  syncTicker();
  syncWakeLock();
}

/** Livro da sessão aberta, se ainda existe e está em leitura. */
function sessionBook() {
  const s = ui.session;
  return s ? state.books.find((b) => b.id === s.bookId && b.status === STATUS.READING) || null : null;
}

/** Tela #/ler/:id. Devolve null quando redireciona (sem sessão ou sessão de outro livro). */
function timerScreen(id) {
  const book = sessionBook();
  if (!book) {
    if (ui.session) setSession(null);
    go('#/inicio');
    return null;
  }
  if (book.id !== id) {
    go(`#/ler/${encodeURIComponent(book.id)}`);
    return null;
  }
  syncWakeLock();
  return timerView({ book, session: ui.session, now: Date.now(), stopping: Boolean(ui.timerStop) });
}

function tickTimer() {
  if (!ui.session) return;
  const ms = elapsedMs(ui.session, Date.now());
  for (const el of document.querySelectorAll('[data-timer-elapsed]')) el.textContent = formatElapsed(ms);
  for (const el of document.querySelectorAll('[data-timer-minutes]')) el.textContent = `${wholeMinutes(ms)} min`;
}

// Pausado, o número não muda: o intervalo só existe com o cronômetro correndo.
function syncTicker() {
  const running = ui.session && !isPaused(ui.session);
  if (running && !timerTicker) timerTicker = setInterval(tickTimer, 1000);
  else if (!running && timerTicker) {
    clearInterval(timerTicker);
    timerTicker = null;
  }
}

function wantsWakeLock() {
  return parseRoute().name === 'ler' && Boolean(ui.session) && !isPaused(ui.session) && document.visibilityState === 'visible';
}

/** Tela acesa só na tela do cronômetro correndo. Sem suporte (iOS antes do 18.4): segue sem. */
async function syncWakeLock() {
  if (!wantsWakeLock()) {
    if (wakeLock) {
      const lock = wakeLock;
      wakeLock = null;
      lock.release().catch(() => {});
    }
    return;
  }
  if (wakeLock || wakeLockPending || !navigator.wakeLock?.request) return;
  wakeLockPending = true;
  try {
    const lock = await navigator.wakeLock.request('screen');
    // O sistema solta a trava quando o app vai para o segundo plano.
    lock.addEventListener('release', () => {
      if (wakeLock === lock) wakeLock = null;
    });
    wakeLock = lock;
  } catch {
    // Negado (bateria fraca, sem permissão): o cronômetro funciona igual.
  }
  wakeLockPending = false;
  if (!wantsWakeLock()) syncWakeLock();
}

/** "Parar" → Salvar: grava a posição pelo mesmo caminho do cartão do Início e soma os minutos ao dia. */
function saveTimerSession(raw) {
  const book = sessionBook();
  if (!book) return;
  const minutes = sessionMinutes(elapsedMs(ui.session, Date.now()));
  const unit = unitOf(book);
  const before = (unit === UNITS.PERCENT ? book.currentPercent : book.currentPage) ?? 0;
  const value = saveProgress(book.id, raw);
  if (value === undefined) return;
  ui.timerStop = null;
  setSession(null);
  // Sessão de menos de 1 minuto não soma minutos (a posição já foi salva).
  if (minutes) {
    const saved = state.books.find((b) => b.id === book.id);
    persist(upsertBook(state, { ...saved, journal: addMinutes(saved, minutes, todayIso()) }).state);
  }
  // Fim do livro: saveProgress já abriu o Concluir; senão, volta ao Início.
  if (parseRoute().name === 'ler') go('#/inicio');
  toast(sessionSummary({ minutes, unit, delta: value - before }), { duration: 5000 });
}

Object.assign(actions, {
  'start-timer'(el) {
    const id = el.dataset.id;
    const current = sessionBook();
    // Uma sessão por vez: com outra aberta, leva até ela.
    if (current && current.id !== id) {
      toast(`Já há uma leitura em andamento: ${current.title}.`);
      go(`#/ler/${encodeURIComponent(current.id)}`);
      return;
    }
    if (!current) {
      ui.timerStop = null;
      setSession(startSession(id, Date.now()));
    }
    go(`#/ler/${encodeURIComponent(id)}`);
  },
  'timer-toggle'() {
    if (!ui.session) return;
    const now = Date.now();
    setSession(isPaused(ui.session) ? resumeSession(ui.session, now) : pauseSession(ui.session, now));
    render();
  },
  'timer-stop'() {
    if (!ui.session) return;
    // O tempo congela enquanto a pessoa informa onde parou.
    ui.timerStop = { resume: !isPaused(ui.session) };
    setSession(pauseSession(ui.session, Date.now()));
    render();
    const input = document.getElementById('timer-input');
    input?.focus();
    input?.select();
  },
  'timer-back'() {
    if (ui.session && ui.timerStop?.resume) setSession(resumeSession(ui.session, Date.now()));
    ui.timerStop = null;
    render();
  },
  'timer-cancel'() {
    if (!window.confirm('Descartar esta sessão? O tempo lido não será salvo.')) return;
    ui.timerStop = null;
    setSession(null);
    go('#/inicio');
    toast('Sessão descartada.');
  },
});

document.addEventListener('submit', (e) => {
  if (!e.target.closest('[data-timer-form]')) return;
  e.preventDefault();
  saveTimerSession(document.getElementById('timer-input')?.value);
});

window.addEventListener('hashchange', syncWakeLock);
// Volta do segundo plano: acerta o número na hora e pede a tela acesa de novo.
document.addEventListener('visibilitychange', () => {
  tickTimer();
  syncWakeLock();
});

// Saindo da tela com gravação em andamento: cópia de resgate. Voltando: relê os dados
// (outra aba pode ter salvo enquanto esta estava parada, sem receber o aviso).
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') saveRescue();
  else reloadFromStorage();
});
window.addEventListener('pagehide', saveRescue);
syncTicker();

// ---------- v1.4: folhas (Registrar leitura e menu rápido), gestos e modo da Estante ----------
// "Registrar leitura" abre uma folha que sobe de baixo; o Salvar passa pelo mesmo saveProgress
// de antes (diário, Kindle em %, fim do livro → Concluir, mensagens de validação).

let introShown = false;
const SHELF_MODE_KEY = 'leituras:estante-modo';

function readShelfMode() {
  try {
    const saved = sessionStorage.getItem(SHELF_MODE_KEY);
    return SHELF_MODES.includes(saved) ? saved : 'lista';
  } catch {
    return 'lista';
  }
}
ui.shelfMode = readShelfMode();

function openProgressSheet(id, opener) {
  const book = state.books.find((b) => b.id === id && b.status === STATUS.READING);
  if (!book) return;
  // Só a folha marca a edição em andamento: ui.editingProgress faria a ficha desenhar, por
  // trás dela, o formulário antigo (com outro #progress-input) no próximo redesenho.
  ui.progressSheet = id;
  openSheet({
    id: 'progress',
    cls: 'sheet-progress',
    label: esc(`Registrar leitura: ${book.title}`),
    html: progressSheet(book, todayIso()),
    focus: '#progress-input',
    opener,
    onClose: () => {
      if (ui.progressSheet === id) ui.progressSheet = null;
    },
  });
}

function openQuickMenu(id, opener) {
  const book = state.books.find((b) => b.id === id);
  if (!book) return;
  openSheet({ id: 'menu', cls: 'sheet-menu', label: esc(`Ações: ${book.title}`), html: quickMenu(book, state), opener });
}

/** Régua da folha acompanha o campo (e vice-versa); --fill pinta a parte já lida. */
function syncProgressRange(form, fromRange) {
  const range = form.querySelector('#progress-range');
  const input = form.querySelector('#progress-input');
  if (!range || !input) return;
  if (fromRange) {
    input.value = range.value;
  } else {
    const v = Number(String(input.value).replace(',', '.'));
    if (input.value !== '' && Number.isFinite(v)) range.value = String(Math.min(Number(range.max), Math.max(0, v)));
  }
  range.style.setProperty('--fill', `${((Number(range.value) / Number(range.max)) * 100).toFixed(1)}%`);
}

Object.assign(actions, {
  'quick-menu'(el) { openQuickMenu(el.dataset.id, el); },
  'progress-add'(el) {
    const form = el.closest('[data-progress-form]');
    const book = state.books.find((b) => b.id === form?.dataset.id);
    const input = form?.querySelector('#progress-input');
    if (!book || !input) return;
    const total = progressTotal(book);
    const typed = Number(String(input.value).trim().replace(',', '.'));
    const saved = Number(book.format === FORMATS.KINDLE ? book.currentPercent : book.currentPage) || 0;
    let next = (input.value.trim() !== '' && Number.isFinite(typed) ? typed : saved) + Number(el.dataset.delta);
    if (total) next = Math.min(total, next);
    input.value = String(Math.max(0, Math.round(next)));
    syncProgressRange(form, false);
  },
  'progress-finish'(el) {
    closeSheet({ immediate: true, keepFocus: true });
    go(finishHref(el.dataset.id));
  },
  'shelf-mode'(el) {
    ui.shelfMode = SHELF_MODES.includes(el.dataset.value) ? el.dataset.value : 'lista';
    try {
      sessionStorage.setItem(SHELF_MODE_KEY, ui.shelfMode);
    } catch {
      // Sem sessionStorage (modo privado): vale só até sair da tela.
    }
    render();
  },
  'clear-filter'(el) {
    ui.filters = { ...ui.filters, [el.dataset.key]: '' };
    render();
    document.querySelector('.fchips select')?.focus({ preventScroll: true });
  },
});

document.addEventListener('input', (e) => {
  const form = e.target.closest?.('[data-progress-form]');
  if (form && (e.target.id === 'progress-range' || e.target.id === 'progress-input')) syncProgressRange(form, e.target.id === 'progress-range');
});

initLongPress((el) => {
  closeSwipe();
  openQuickMenu(el.dataset.id, el);
});
initSwipe();

// ---------- Ficha do livro (v1.4) ----------
// #/livro/:id mostra a ficha (views/book-detail.js); editar fica em #/livro/:id/editar.

Object.assign(actions, {
  'zoom-book-cover'(el) {
    const book = state.books.find((b) => b.id === el.dataset.id);
    if (book?.cover) openCoverViewer(book.cover, book.title || 'livro');
  },
  'detail-fav'(el) {
    const book = state.books.find((b) => b.id === el.dataset.id);
    if (!book || book.status !== STATUS.READ) return;
    // Um favorito por ano (upsertBook tira o anterior): o aviso diz qual saiu.
    const year = book.endDate ? yearOf(book.endDate) : null;
    const replaced = !book.favorite && year
      ? state.books.find((b) => b.id !== book.id && b.favorite && b.endDate && yearOf(b.endDate) === year)
      : null;
    let message = 'Marcado como favorito do ano.';
    if (book.favorite) message = 'Tirado dos favoritos.';
    else if (replaced) message = `Favorito de ${year}: "${book.title}" no lugar de "${replaced.title}".`;
    persist(upsertBook(state, { ...book, favorite: !book.favorite }).state, message);
    render();
  },
  // Aba Diário: abre ou recolhe uma semana.
  'diary-week'(el) {
    const key = el.dataset.week;
    ui.diaryWeeks = { ...ui.diaryWeeks, [key]: el.getAttribute('aria-expanded') !== 'true' };
    render();
  },
});

// Capa em alta resolução e fundo desfocado da ficha: aparecem ao terminar de carregar
// (e não esmaecem de novo).
document.addEventListener('load', (e) => {
  const img = e.target;
  if (!img.classList?.contains('cover-hd') && !img.classList?.contains('ficha-backdrop-img')) return;
  loadedHdCovers.add(img.getAttribute('src'));
  img.classList.add('is-loaded');
}, true);

// Gráfico do ritmo: o toque mostra o dia (ou a semana) mais próximo, sem redesenhar a tela.
document.addEventListener('click', (e) => {
  const plot = e.target.closest?.('.rchart-plot');
  if (!plot) return;
  const bars = [...plot.querySelectorAll('.rchart-bar')];
  if (!bars.length) return;
  let best = null;
  let dist = Infinity;
  for (const bar of bars) {
    const r = bar.getBoundingClientRect();
    const d = Math.abs(r.left + r.width / 2 - e.clientX);
    if (d < dist) {
      dist = d;
      best = bar;
    }
  }
  const readout = plot.closest('[data-rchart]')?.querySelector('.rchart-readout');
  const again = best.classList.contains('is-picked');
  for (const bar of bars) bar.classList.remove('is-picked');
  if (!again) best.classList.add('is-picked');
  plot.classList.toggle('has-pick', !again);
  if (readout) readout.textContent = again ? readout.dataset.default : best.dataset.tip;
});

/** Transição da capa ("voa" da lista para a ficha) só com suporte e sem "Reduzir movimento". */
function canAnimateCover() {
  return typeof document.startViewTransition === 'function'
    && !window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
}

/**
 * Troca de tela com a capa como elemento compartilhado: a capa tocada (from) e a capa
 * correspondente na tela nova (pickTarget) recebem o mesmo view-transition-name.
 * O resto da tela só se funde, rápido. Sem suporte, é uma navegação normal.
 */
function navigateWithCover(href, from, pickTarget) {
  from.style.viewTransitionName = 'book-cover';
  const startHash = location.hash;
  let target = null;
  const transition = document.startViewTransition(() => {
    from.style.viewTransitionName = '';
    // Outra navegação chegou antes da troca (toque rápido em outra coisa): ela vale.
    if (location.hash !== startHash) return;
    renderedByTransition = href;
    tagHistoryEntry();
    location.hash = href;
    render();
    target = pickTarget?.() || null;
    if (target) target.style.viewTransitionName = 'book-cover';
  });
  transition.finished.finally(() => {
    if (target) target.style.viewTransitionName = '';
  });
}

document.addEventListener('click', (e) => {
  if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
  const link = e.target.closest?.('a[href^="#/"]');
  if (!link || !canAnimateCover()) return;
  const href = link.getAttribute('href');
  // Abrir a ficha a partir de uma capa (Início, Estante, Buscar, Resumo...).
  if (/^#\/livro\/[^/?]+$/.test(href)) {
    // No cartão "Lendo agora" a capa fica fora do link (que cobre o cartão inteiro).
    const from = link.querySelector('.cover') || link.closest('.reading')?.querySelector('.rn-cover .cover');
    if (!from || href === location.hash) return;
    e.preventDefault();
    navigateWithCover(href, from);
    return;
  }
  // Voltar da ficha: a capa volta para o lugar dela na lista, se estiver à vista.
  if (link.classList.contains('ficha-back')) {
    const from = root.querySelector('.ficha-cover .cover');
    const id = ui.detailId;
    if (!from || !id || href === location.hash) return;
    e.preventDefault();
    navigateWithCover(href, from, () => {
      const cover = root.querySelector(`a[href="#/livro/${CSS.escape(encodeURIComponent(id))}"] .cover`)
        || root.querySelector(`.reading[data-id="${CSS.escape(id)}"] .rn-cover .cover`);
      if (!cover) return null;
      const r = cover.getBoundingClientRect();
      return r.bottom > 0 && r.top < window.innerHeight ? cover : null;
    });
  }
});

// ---------- Offline e atualizações ----------

if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
  let hadController = Boolean(navigator.serviceWorker.controller);
  // Versão nova instalada: recarrega sozinho, a não ser no meio de um cadastro.
  const applyUpdate = () => {
    const route = parseRoute();
    const busy = route.name === 'novo' || isBookEdit(route) || ui.editingProgress || ui.progressSheet;
    if (busy || writing) toast('Nova versão do app disponível.', { actionLabel: 'Atualizar', action: 'reload', sticky: true });
    else window.location.reload();
  };
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!hadController) {
      hadController = true;
      return;
    }
    applyUpdate();
  });
  // A troca de versão pode terminar antes de o app começar a ouvir o aviso acima: a tela
  // fica na versão antiga até a próxima abertura. Por isso pergunta ao service worker
  // qual versão ele tem; se for outra, recarrega (uma vez só por versão, para nunca entrar em ciclo).
  navigator.serviceWorker.addEventListener('message', (event) => {
    const version = event.data?.type === 'versao' ? event.data.version : null;
    if (!version || version === `v${APP_VERSION}`) return;
    try {
      if (sessionStorage.getItem('leituras:recarregou') === version) return;
      sessionStorage.setItem('leituras:recarregou', version);
    } catch {
      return;
    }
    applyUpdate();
  });
  navigator.serviceWorker.startMessages?.();
  navigator.serviceWorker.controller?.postMessage({ type: 'versao' });
  navigator.serviceWorker.register('./sw.js').then((registration) => {
    // O app instalado no iPhone volta do segundo plano sem recarregar: procura versão nova nessa hora.
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState !== 'visible') return;
      registration.update().catch(() => {});
      navigator.serviceWorker.controller?.postMessage({ type: 'versao' });
    });
  }).catch(() => {});
}

// ---------- Busca com IA (Gemini) e chaves em outro celular ----------
// Bloco próprio. A busca com IA só roda no toque do botão, com a chave guardada neste
// aparelho (prefs.js), e é cancelada quando a pessoa volta a digitar ou sai da tela.
// O link de chaves (#/ajustes?chaves=...) só mostra um pedido de confirmação em Ajustes.

ui.geminiKey = readGeminiKey(localStorage);
ui.aiUsage = readAiUsage(localStorage);
ui.keyImport = null;
let aiAbort = null;

function cancelAiSearch() {
  aiAbort?.abort();
  aiAbort = null;
}

async function runAiSearch() {
  const lookup = ui.lookup;
  const query = lookup.query;
  if (!ui.geminiKey || query.trim().length < 2) return;
  // Limite de segurança do mês neste aparelho (prefs.js): o botão já vem desligado.
  const stored = readAiUsage(localStorage); // outra aba pode ter contado também
  if (aiSearchesThisMonth(stored, todayIso()) > aiSearchesThisMonth(ui.aiUsage, todayIso())) ui.aiUsage = stored;
  if (aiLimitReached(ui.aiUsage, todayIso())) {
    renderLookup();
    return;
  }
  cancelAiSearch();
  const ctrl = new AbortController();
  aiAbort = ctrl;
  const started = Date.now();
  lookup.ai = { status: 'loading', stage: 'find', timeoutMs: AI_TIMEOUT_MS, results: [] };
  renderLookup();
  const stale = () => ctrl.signal.aborted || ui.lookup !== lookup || lookup.query !== query;
  // Segunda etapa ("Conferindo o ISBN…"): a barra continua de onde estava, no prazo maior.
  const showStage = (stage, timeoutMs = AI_CONFIRM_TIMEOUT_MS) => {
    if (stale() || lookup.ai?.status !== 'loading' || lookup.ai.stage === stage) return;
    lookup.ai = { status: 'loading', stage, timeoutMs, elapsedMs: Date.now() - started, results: [] };
    renderLookup();
  };
  try {
    // Uma busca conta uma vez no limite do aparelho, mesmo com os dois pedidos.
    const onSend = () => { ui.aiUsage = countAiSearch(localStorage, todayIso(), ui.aiUsage); };
    const found = await aiSearch(query, { key: ui.geminiKey, signal: ctrl.signal, onSend, onStage: (stage, o) => showStage(stage, o?.timeoutMs) });
    if (found.results.some((r) => r.isbn)) showStage('confirm');
    // Com ISBN, os dados oficiais (BrasilAPI, Open Library, Google Books) valem mais que os da IA.
    const lookupIsbn = (isbn) => searchBooks(isbn, { signal: ctrl.signal, googleKey: googleBooksKey() }).then((o) => o.results[0] || null);
    const results = await enrichAiResults(found.results, lookupIsbn, { queryIsbn: lookup.isbn });
    if (stale()) return;
    lookup.ai = { status: 'done', results };
  } catch (err) {
    if (stale() || err?.code === 'cancelled') return;
    const code = err?.code || 'server';
    lookup.ai = { status: 'error', code, message: aiErrorMessage(code), retry: isRetryable(code), results: [] };
  } finally {
    if (aiAbort === ctrl) aiAbort = null;
  }
  renderLookup();
}

/** Abriu Ajustes por um link com chaves: guarda para confirmar e tira as chaves do endereço. */
function takeKeysFromRoute(route) {
  if (!route.query.has('chaves')) return;
  ui.keyImport = decodeKeysParam(route.query.get('chaves'));
  if (!ui.keyImport) toast('Esse link não tem chaves válidas. Peça para enviarem de novo.');
  try {
    history.replaceState(history.state, '', '#/ajustes');
  } catch { /* sem acesso ao histórico: o endereço fica, mas nada é salvo sem confirmar */ }
  currentKey = parseRoute().key;
  historyKeys.set(historyIndex, currentKey);
}

function saveGeminiKeyFromInput() {
  const result = saveGeminiKey(localStorage, document.querySelector('[data-aikey]')?.value);
  if (!result.key) {
    toast('Cole a chave antes de salvar.');
    return;
  }
  if (!result.ok) {
    toast('Não foi possível salvar a chave neste aparelho.');
    return;
  }
  ui.geminiKey = result.key;
  render();
  if (result.warning) {
    toast('Chave salva, mas ela não parece uma chave do Gemini (começa com AQ. ou AIza). Confira se colou inteira.', { duration: 7000 });
  } else {
    toast('Chave salva. O botão “Buscar com IA” aparece na busca de livros.');
  }
}

async function shareKeys() {
  const link = keysLink(`${location.origin}${location.pathname}`, { googleBooksKey: ui.googleKey, geminiKey: ui.geminiKey });
  if (!link) {
    toast('Salve uma chave antes de enviar.');
    return;
  }
  if (typeof navigator.share === 'function') {
    try {
      await navigator.share({ title: 'Chaves do Leituras', text: 'Abra este link no outro celular para salvar as chaves de busca do Leituras:', url: link });
      return;
    } catch (err) {
      if (err?.name === 'AbortError') return;
    }
  }
  try {
    await navigator.clipboard.writeText(link);
    toast('Link copiado. Cole no WhatsApp ou no e-mail e abra no outro celular.', { duration: 6000 });
  } catch {
    window.prompt('Copie o link e envie para o outro celular:', link);
  }
}

function importKeys() {
  const keys = ui.keyImport;
  if (!keys) return;
  const saved = [];
  if (keys.googleBooksKey) {
    const r = saveGoogleKey(localStorage, keys.googleBooksKey);
    if (r.ok) {
      ui.googleKey = r.key;
      saved.push('Google Books');
    }
  }
  if (keys.geminiKey) {
    const r = saveGeminiKey(localStorage, keys.geminiKey);
    if (r.ok) {
      ui.geminiKey = r.key;
      saved.push('IA');
    }
  }
  ui.keyImport = null;
  render();
  toast(saved.length ? `Chaves salvas neste celular (${saved.join(' e ')}).` : 'Não foi possível salvar as chaves neste aparelho.');
}

Object.assign(actions, {
  'ai-search'() { runAiSearch(); },
  'ai-cancel'() {
    cancelAiSearch();
    delete ui.lookup.ai;
    renderLookup();
  },
  'pick-ai-result'(el) {
    const r = ui.lookup.ai?.results?.[Number(el.dataset.index)];
    if (!r || !ui.draft) return;
    // Sem ISBN conferido da IA, fica o ISBN que a pessoa digitou na busca (se digitou).
    Object.assign(ui.draft, { title: r.title, authors: r.authors, pages: r.pages, cover: r.cover, isbn: r.isbn || ui.lookup.isbn || '' });
    ui.picked = true;
    render();
  },
  'save-aikey'() { saveGeminiKeyFromInput(); },
  'remove-aikey'() {
    removeGeminiKey(localStorage);
    ui.geminiKey = '';
    render();
    toast('Chave removida. A busca com IA fica desligada.');
  },
  'share-keys'() { shareKeys(); },
  'paste-keys'() {
    const keys = decodeKeysParam(document.querySelector('[data-keylink]')?.value);
    if (!keys) {
      toast('Cole o link inteiro recebido (ele tem “chaves=” no fim).');
      return;
    }
    ui.keyImport = keys;
    render();
    window.scrollTo(0, 0);
  },
  'import-keys'() { importKeys(); },
  'cancel-import-keys'() {
    ui.keyImport = null;
    render();
    toast('Nada foi salvo.');
  },
});

// Voltou a digitar: a busca com IA anterior (e o resultado dela) deixa de valer.
document.addEventListener('input', (e) => {
  if (!('lookup' in e.target.dataset) || !ui.lookup.ai) return;
  cancelAiSearch();
  delete ui.lookup.ai;
  renderLookup();
});

document.addEventListener('keydown', (e) => {
  if (e.key !== 'Enter') return;
  if ('aikey' in e.target.dataset) {
    e.preventDefault();
    saveGeminiKeyFromInput();
  } else if ('keylink' in e.target.dataset) {
    e.preventDefault();
    actions['paste-keys']();
  }
});

window.addEventListener('hashchange', () => {
  cancelAiSearch();
  if (parseRoute().name !== 'ajustes') ui.keyImport = null;
});

// ---------- Aparência e títulos grandes (v1.4) ----------
// O tema já veio aplicado pelo index.html (antes do CSS); aqui a troca em Ajustes e o
// acompanhamento do iPhone. A escolha é do aparelho, fora dos dados e do backup.

ui.themePref = initTheme();
ui.accent = initAccent();
initLargeTitles();

actions['set-theme'] = (el) => {
  const pref = el.dataset.value;
  if (!setThemePref(pref)) toast('Não foi possível guardar a aparência neste aparelho; vale até fechar o app.');
  ui.themePref = pref;
  render();
};

// Cor de destaque (1.5): também só deste aparelho (js/accent.js).
actions['set-accent'] = (el) => {
  const id = el.dataset.value;
  if (!setAccentPref(id)) toast('Não foi possível guardar a cor neste aparelho; vale até fechar o app.');
  ui.accent = id;
  render();
};

// ---------- Início 1.5: saudação, nome, "informe o total de páginas" e festa ao concluir ----------

// Nome da saudação: só deste aparelho (localStorage), fora dos dados e do backup (prefs.js).
ui.userName = readName(localStorage);

document.addEventListener('input', (e) => {
  if (!('username' in e.target.dataset)) return;
  // Grava enquanto digita (o app pode ser fechado sem sair do campo); o aviso vem no change.
  ui.userName = saveName(localStorage, e.target.value).name;
});

document.addEventListener('change', (e) => {
  if (!('username' in e.target.dataset)) return;
  const result = saveName(localStorage, e.target.value);
  ui.userName = result.name;
  e.target.value = result.name;
  if (!result.ok) toast('Não foi possível guardar o nome neste aparelho; vale até fechar o app.');
  else toast(result.name ? 'Nome salvo.' : 'Nome removido.');
});

document.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && 'username' in e.target.dataset) {
    e.preventDefault();
    e.target.blur();
  }
});

// "informe o total de páginas" (Início e ficha) abre a edição com ?campo=paginas:
// o campo Páginas recebe o foco uma vez por rascunho.
let askedDraft = null;
function focusAskedField(route) {
  if (!isBookEdit(route) || route.query.get('campo') !== 'paginas' || !ui.draft || askedDraft === ui.draft) return;
  const input = document.getElementById('f-pages');
  if (!input) return;
  askedDraft = ui.draft;
  input.focus({ preventScroll: true });
  input.scrollIntoView({ block: 'center' });
}

// Livro concluído: a festa espera a volta ao Início (vale por 3 minutos).
const CELEBRATION_TTL_MS = 3 * 60 * 1000;
function queueFinishCelebration(book, milestone) {
  ui.celebration = { id: book.id, title: book.title, cover: book.cover || '', big: milestone, at: Date.now() };
}

/** Cor da capa ("r g b"): a da imagem se já estiver na memória (em até 250 ms), senão a da capa desenhada. */
async function celebrationTint(c) {
  const fallback = tintFor(hexToRgb(coverFallbackColor(c.title || '')));
  if (!c.cover) return fallback;
  const rgb = await Promise.race([loadCoverColor(c.cover), new Promise((r) => { setTimeout(() => r(null), 250); })]);
  return rgb ? tintFor(rgb) : fallback;
}

function playFinishCelebration(tick) {
  const c = ui.celebration;
  ui.celebration = null;
  if (!c || Date.now() - c.at > CELEBRATION_TTL_MS) return;
  const accent = getComputedStyle(root).getPropertyValue('--accent').trim();
  // A festa começa já (a capa fica escondida até "saltar"); as cores chegam antes do confete.
  const colors = celebrationTint(c).then((tint) => confettiColors(accent, tint));
  celebrateFinish(root, { id: c.id, colors, tick, big: c.big }).catch(() => {});
}

// ---------- IA 1.6: trecho por foto e "O que ler a seguir" ----------
// Mesma IA gratuita (chave deste aparelho) e mesmo limite do mês da busca com IA: cada foto
// lida e cada pedido de sugestões conta um uso, só quando sai de fato para o Google.
// O texto da foto vai para o campo do trecho; nada é salvo sem o toque em Salvar.

ui.suggest = { mode: 'fila', cache: readSuggestions(localStorage), loading: null, error: null };
let ocrAbort = null;
let ocrPhoto = null; // última foto já reduzida, para o "Tentar de novo"
let quoteSelection = null; // última seleção feita no campo do trecho
let suggestAbort = null;

/** Ainda dentro do limite do mês? (outra aba pode ter contado também) */
function aiAllowed() {
  const stored = readAiUsage(localStorage);
  if (aiSearchesThisMonth(stored, todayIso()) > aiSearchesThisMonth(ui.aiUsage, todayIso())) ui.aiUsage = stored;
  return !aiLimitReached(ui.aiUsage, todayIso());
}

function countAiUse() {
  ui.aiUsage = countAiSearch(localStorage, todayIso(), ui.aiUsage);
}

/** Redesenha só o bloco da foto (a tela inteira apagaria o que está sendo digitado). */
function renderOcr() {
  const el = document.getElementById('quote-ocr');
  if (!el || !ui.quoteForm) return;
  el.outerHTML = quotePhotoBlock(ui.quoteForm.ocr, { hasKey: Boolean(ui.geminiKey), limitReached: aiLimitReached(ui.aiUsage, todayIso()) });
}

function cancelOcr() {
  ocrAbort?.abort();
  ocrAbort = null;
}

async function readQuotePhoto(input) {
  const file = input.files?.[0];
  input.value = '';
  const form = ui.quoteForm;
  if (!file || !form || !ui.geminiKey) return;
  try {
    ocrPhoto = await resizePhoto(file, { maxW: OCR_MAX_SIDE, maxH: OCR_MAX_SIDE, quality: OCR_QUALITY });
  } catch {
    ocrPhoto = null;
    form.ocr = { status: 'error', code: 'image', message: extrasErrorMessage('ocr', 'image'), retry: false };
    renderOcr();
    return;
  }
  runOcr(form);
}

/** Texto lido: entra no campo (depois do que já estava escrito) e a página, se o campo está vazio. */
function applyOcrText(form, { text, page }) {
  const area = document.getElementById('q-text');
  const pos = document.getElementById('q-pos');
  const current = area ? area.value.trim() : '';
  const value = (current ? `${current}\n\n${text}` : text).slice(0, 5000);
  const position = pos && !pos.value && page ? String(page) : pos?.value ?? '';
  if (area) {
    area.value = value;
    // O campo cresce para mostrar o texto lido (até um limite; depois rola).
    area.style.height = 'auto';
    area.style.height = `${Math.min(area.scrollHeight + 2, 420)}px`;
  }
  if (pos) pos.value = position;
  form.prefill = { text: value, position };
  form.ocr = { status: 'done', page };
  quoteSelection = null;
}

async function runOcr(form) {
  if (!ui.geminiKey || !ocrPhoto || ui.quoteForm !== form) return;
  if (!aiAllowed()) {
    form.ocr = null;
    renderOcr();
    return;
  }
  cancelOcr();
  const ctrl = new AbortController();
  ocrAbort = ctrl;
  form.ocr = { status: 'loading', timeoutMs: OCR_TIMEOUT_MS };
  renderOcr();
  const book = state.books.find((b) => b.id === ui.draft?.id);
  const stale = () => ctrl.signal.aborted || ui.quoteForm !== form;
  try {
    const out = await readPagePhoto(ocrPhoto, { key: ui.geminiKey, signal: ctrl.signal, maxPage: book?.pages || null, onSend: countAiUse });
    if (stale()) return;
    applyOcrText(form, out);
  } catch (err) {
    if (stale() || err?.code === 'cancelled') return;
    const code = err?.code || 'server';
    form.ocr = { status: 'error', code, message: extrasErrorMessage('ocr', code), retry: isRetryable(code) && code !== 'image' };
  } finally {
    if (ocrAbort === ctrl) ocrAbort = null;
  }
  renderOcr();
  document.getElementById('q-text')?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
}

/** Deixa no campo só o que a pessoa selecionou. */
function keepQuoteSelection() {
  const area = document.getElementById('q-text');
  if (!area) return;
  let start = area.selectionStart;
  let end = area.selectionEnd;
  // Ao tocar no botão o campo perde o foco; vale a última seleção feita nele.
  if (start === end && quoteSelection?.value === area.value) ({ start, end } = quoteSelection);
  const picked = keepSelection(area.value, start, end);
  if (!picked || picked === area.value.trim()) {
    toast('Selecione o trecho no texto (toque duas vezes numa palavra e arraste) e toque de novo.', { duration: 5000 });
    return;
  }
  area.value = picked;
  if (ui.quoteForm?.prefill) ui.quoteForm.prefill.text = picked;
  quoteSelection = null;
  toast('Ficou só o trecho selecionado. Confira e toque em Salvar.');
}

document.addEventListener('selectionchange', () => {
  const area = document.activeElement;
  if (area?.id !== 'q-text' || area.selectionStart === area.selectionEnd) return;
  quoteSelection = { start: area.selectionStart, end: area.selectionEnd, value: area.value };
});

document.addEventListener('change', (e) => {
  if ('ocrPhoto' in e.target.dataset) readQuotePhoto(e.target);
});

// O texto lido continua no campo se a tela for redesenhada (com o que a pessoa já apagou).
document.addEventListener('input', (e) => {
  const prefill = ui.quoteForm?.prefill;
  if (!prefill) return;
  if (e.target.id === 'q-text') prefill.text = e.target.value;
  else if (e.target.id === 'q-pos') prefill.position = e.target.value;
});

// Trocar de trecho, de aba ou cancelar: a leitura em andamento deixa de valer.
for (const name of ['quote-new', 'quote-edit', 'quote-cancel', 'book-tab']) {
  const original = actions[name];
  actions[name] = (el) => {
    cancelOcr();
    return original(el);
  };
}

// ---------- O que ler a seguir (#/sugestoes) ----------

function suggestionsScreen(ctx) {
  const used = aiSearchesThisMonth(ui.aiUsage, ctx.today);
  return suggestionsView({ ...ctx, hasKey: Boolean(ui.geminiKey), used, limitReached: aiLimitReached(ui.aiUsage, ctx.today) });
}

function renderSuggest() {
  if (parseRoute().name === 'sugestoes') render();
}

function cancelSuggest() {
  suggestAbort?.abort();
  suggestAbort = null;
  ui.suggest.loading = null;
}

async function runSuggest() {
  const sg = ui.suggest;
  const mode = sg.mode;
  if (!ui.geminiKey || sg.loading?.mode === mode) return;
  if (sg.loading) cancelSuggest();
  if (!aiAllowed()) {
    renderSuggest();
    return;
  }
  const ctrl = new AbortController();
  suggestAbort = ctrl;
  sg.loading = { mode, stage: 'ask', timeoutMs: SUGGEST_TIMEOUT_MS };
  sg.error = null;
  renderSuggest();
  // Conferir os livros sugeridos na busca de sempre: só os achados aparecem, com os dados de lá.
  const search = (q) => {
    if (sg.loading?.mode === mode && sg.loading.stage !== 'verify' && !ctrl.signal.aborted) {
      sg.loading = { mode, stage: 'verify', timeoutMs: 20000 };
      renderSuggest();
    }
    return searchBooks(q, { signal: ctrl.signal, googleKey: googleBooksKey() });
  };
  try {
    const out = await suggestBooks(mode, state.books, { key: ui.geminiKey, signal: ctrl.signal, onSend: countAiUse, search });
    if (ctrl.signal.aborted) return;
    sg.cache = saveSuggestions(localStorage, mode, out.items, todayIso());
    sg.loading = null;
  } catch (err) {
    if (ctrl.signal.aborted) return;
    const code = err?.code || 'server';
    sg.loading = null;
    sg.error = { mode, code, message: extrasErrorMessage('suggest', code), retry: isRetryable(code) };
  } finally {
    if (suggestAbort === ctrl) suggestAbort = null;
  }
  renderSuggest();
}

/** Livro sugerido (já conferido na busca) entra na fila "Quero ler". */
function addSuggestion(index) {
  const r = ui.suggest.cache?.novos?.items?.[index];
  if (!r) return;
  if (ownsBook(state.books, r)) {
    toast('Esse livro já está nos seus livros.');
    return;
  }
  const { state: next } = upsertBook(state, {
    ...blankDraft(STATUS.WANT), title: r.title, authors: r.authors, pages: r.pages, cover: r.cover, isbn: r.isbn,
  });
  persist(next, `“${r.title}” entrou na fila Quero ler.`);
  render();
}

Object.assign(actions, {
  'ocr-nokey'() {
    if (!ui.quoteForm) return;
    ui.quoteForm.ocr = { status: 'nokey' };
    renderOcr();
  },
  'ocr-cancel'() {
    cancelOcr();
    if (ui.quoteForm) ui.quoteForm.ocr = null;
    renderOcr();
  },
  'ocr-retry'() { runOcr(ui.quoteForm); },
  'ocr-keep-selection'() { keepQuoteSelection(); },
  'suggest-mode'(el) {
    const mode = el.dataset.value === 'novos' ? 'novos' : 'fila';
    if (ui.suggest.mode === mode) return;
    ui.suggest.mode = mode;
    render();
  },
  'suggest-run'() { runSuggest(); },
  'suggest-cancel'() {
    cancelSuggest();
    render();
  },
  'suggest-add'(el) { addSuggestion(Number(el.dataset.index)); },
});

window.addEventListener('hashchange', () => {
  cancelOcr();
  if (parseRoute().name !== 'sugestoes' && ui.suggest.loading) cancelSuggest();
});

// Os dados vêm do IndexedDB (assíncrono): a primeira tela espera por eles.
async function boot() {
  try {
    await loadFromStorage();
    applyPendingRescue();
  } catch {
    backend = null;
    toast(LOAD_FAILED, { sticky: true });
  }
  ready = true;
  render();
  // Com a tela pronta: guarda as capas de todos os livros, inclusive as que ainda não apareceram.
  warmCovers(state.books, { delay: 1500 });
}

boot();
