// Capas sempre à mão: a tela pede ao service worker que guarde as capas de todos os livros
// (não só as que já apareceram na tela) e, quando uma capa não carrega, tenta de novo mais
// tarde em vez de desistir. O cache das capas fica no sw.js ("leituras-capas").

import { isRemoteCover, normalizeCoverUrl } from './cover-url.js';
import { STATUS } from './store.js';
import { largeCoverUrl } from './ui.js';

/**
 * Endereços das capas para guardar: primeiro os livros sendo lidos (com a capa grande da
 * ficha, que é aberta toda hora), depois os outros na ordem da lista. Fotos do celular
 * (data:) já estão nos dados e ficam de fora.
 */
export function coverUrlsFor(books) {
  const list = Array.isArray(books) ? books : [];
  const reading = list.filter((b) => b?.status === STATUS.READING);
  const urls = [];
  for (const b of reading) urls.push(normalizeCoverUrl(b.cover));
  for (const b of reading) urls.push(largeCoverUrl(b.cover));
  for (const b of list) urls.push(normalizeCoverUrl(b?.cover));
  return [...new Set(urls.filter(isRemoteCover))];
}

/** Espera do novo pedido de capa depois de cada falha (ms). Depois da última, só com a volta da rede ou do app. */
export const RETRY_DELAYS = [2000, 5000, 15000, 30000, 60000];

// ---------- Pré-carga ----------

let warmTimer = null;
let lastSent = '';
let lastComplete = false;

function whenIdle(fn) {
  if (typeof window.requestIdleCallback === 'function') window.requestIdleCallback(fn, { timeout: 4000 });
  else setTimeout(fn, 200); // Safari não tem requestIdleCallback.
}

function sendWarm(books) {
  if (!('serviceWorker' in navigator) || navigator.onLine === false) return;
  const urls = coverUrlsFor(books);
  if (!urls.length) return;
  const signature = urls.join('\n');
  // Mesma lista e a última vez guardou tudo: nada a fazer.
  if (signature === lastSent && lastComplete) return;
  lastSent = signature;
  lastComplete = false;
  navigator.serviceWorker.ready
    .then((registration) => registration.active?.postMessage({ type: 'capas', urls }))
    .catch(() => {});
}

/**
 * Pede ao service worker as capas que faltam (ele baixa poucas por vez e ignora as que já
 * tem). Chamado depois de abrir o app e quando os livros mudam (capa nova, backup restaurado).
 */
export function warmCovers(books, { delay = 0 } = {}) {
  clearTimeout(warmTimer);
  warmTimer = setTimeout(() => whenIdle(() => sendWarm(books)), delay);
}

// ---------- Capa que não carregou: tenta de novo ----------

let attempt = 0;
let retryTimer = null;

function scheduleRetry() {
  if (retryTimer || attempt >= RETRY_DELAYS.length || document.visibilityState === 'hidden') return;
  retryTimer = setTimeout(() => {
    retryTimer = null;
    attempt += 1;
    retryBrokenCovers();
  }, RETRY_DELAYS[attempt]);
}

/**
 * Tenta de novo as capas que falharam. Cada endereço é pedido uma vez numa imagem fora da
 * tela; só quando ele chega a capa da tela é trocada (sem piscar a capa desenhada).
 * 'fresh' recomeça a sequência de esperas (rede voltou, app voltou para a frente).
 */
export function retryBrokenCovers(fresh = false) {
  if (fresh) {
    attempt = 0;
    clearTimeout(retryTimer);
    retryTimer = null;
  }
  const broken = new Map();
  for (const img of document.querySelectorAll('img.cover-img.is-broken')) {
    const src = img.getAttribute('src');
    if (!isRemoteCover(src)) continue;
    if (!broken.has(src)) broken.set(src, []);
    broken.get(src).push(img);
  }
  for (const [src, imgs] of broken) {
    const probe = new Image();
    probe.referrerPolicy = 'no-referrer';
    probe.onload = () => {
      for (const img of imgs) {
        if (!img.isConnected || !img.classList.contains('is-broken')) continue;
        const again = img.cloneNode();
        again.classList.remove('is-broken');
        again.loading = 'eager';
        img.replaceWith(again);
      }
    };
    probe.onerror = scheduleRetry;
    probe.src = src;
  }
}

function onCoverError(e) {
  const img = e.target;
  if (!img.classList?.contains('cover-img')) return;
  // Fica a capa desenhada embaixo; a imagem continua no lugar para a nova tentativa.
  img.classList.add('is-broken');
  const src = img.getAttribute('src');
  if (!isRemoteCover(src)) return;
  // Se a capa veio do cache e não abriu, a cópia guardada está ruim: o service worker a apaga.
  navigator.serviceWorker?.controller?.postMessage({ type: 'capa-falhou', url: src });
  scheduleRetry();
}

/** Liga as novas tentativas: falha de capa, rede de volta, app de volta para a frente, pré-carga concluída. */
export function initCoverRetry(getBooks) {
  document.addEventListener('error', onCoverError, true);
  window.addEventListener('online', () => {
    retryBrokenCovers(true);
    lastComplete = false;
    warmCovers(getBooks(), { delay: 1000 });
  });
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') retryBrokenCovers(true);
  });
  navigator.serviceWorker?.addEventListener('message', (event) => {
    if (event.data?.type !== 'capas-prontas') return;
    lastComplete = event.data.failed === 0;
    if (event.data.fetched > 0) retryBrokenCovers(true);
  });
}
