// Tamanho do texto (1.6): as letras do app acompanham o "Tamanho do Texto" do iPhone
// (Ajustes → Tela e Brilho, ou Acessibilidade → Textos Maiores).
//
// O Safari expõe esse ajuste na fonte `-apple-system-body` (17 px no tamanho padrão). O fator
// é tamanho ÷ 17, entre 0,85 e 1,6, e vai para a variável CSS --type-scale do <html>: os
// font-size de css/app.css são calc(Npx * var(--type-scale, 1)) (tools/escala-texto.mjs).
// Em Ajustes → Aparência dá para trocar: Sistema (padrão), Menor, Padrão ou Maior. A escolha é
// do aparelho (localStorage 'leituras:texto'), fora dos dados e do backup, como o tema.
// O index.html aplica o fator num script antes do CSS (sem piscar); mantenha a lógica igual à
// de lá (tests/v16-acessibilidade.test.js confere).

export const TEXT_KEY = 'leituras:texto';
export const TEXT_PREFS = ['sistema', 'menor', 'padrao', 'maior'];
export const TEXT_OPTIONS = [
  ['sistema', 'Sistema'],
  ['menor', 'Menor'],
  ['padrao', 'Padrão'],
  ['maior', 'Maior'],
];
/** Fator fixo das escolhas que não seguem o iPhone. */
export const TEXT_PRESETS = { menor: 0.9, padrao: 1, maior: 1.25 };
/** Tamanho da fonte do corpo do iOS no ajuste padrão. */
export const BASE_PX = 17;
export const MIN_SCALE = 0.85;
export const MAX_SCALE = 1.6;

/** 'sistema' | 'menor' | 'padrao' | 'maior'. Sem nada guardado (ou sem armazenamento): 'sistema'. */
export function readTextPref(storage) {
  try {
    const value = storage?.getItem(TEXT_KEY);
    return TEXT_PREFS.includes(value) ? value : 'sistema';
  } catch {
    return 'sistema';
  }
}

/** Guarda a escolha; 'sistema' apaga a chave. Devolve false se o aparelho não deixou gravar. */
export function saveTextPref(storage, pref) {
  try {
    if (pref === 'sistema' || !TEXT_PREFS.includes(pref)) storage.removeItem(TEXT_KEY);
    else storage.setItem(TEXT_KEY, pref);
    return true;
  } catch {
    return false;
  }
}

/** Fator a partir do tamanho (px) da fonte do sistema; sem medida (outro navegador): 1. */
export function scaleFromSize(px) {
  const n = Number(px);
  if (!Number.isFinite(n) || n <= 0) return 1;
  const s = Math.round((n / BASE_PX) * 100) / 100;
  return Math.min(MAX_SCALE, Math.max(MIN_SCALE, s));
}

/** Fator efetivo: o da escolha fixa, ou o do iPhone em 'sistema'. */
export function resolveScale(pref, systemPx) {
  if (Object.hasOwn(TEXT_PRESETS, pref)) return TEXT_PRESETS[pref];
  return scaleFromSize(systemPx);
}

/**
 * Tamanho (px) da fonte -apple-system-body, ou null se o navegador não a conhece. O teste
 * começa num tamanho impossível: se `font: -apple-system-body` não for aceito, ele fica.
 */
export function systemTextSize(doc = document) {
  const probe = doc.createElement('span');
  probe.setAttribute('aria-hidden', 'true');
  probe.style.cssText = 'position:absolute;visibility:hidden;pointer-events:none;font-size:1234px;font:-apple-system-body';
  doc.documentElement.appendChild(probe);
  const size = parseFloat(getComputedStyle(probe).fontSize);
  probe.remove();
  return size && size !== 1234 ? size : null;
}

/**
 * Faixa do fator, para o CSS ajustar o layout ([data-text-size] no <html>): 'pequeno' (< 0,95),
 * 'padrao', 'grande' (a partir de 1,18: seletores de 4 opções em 2 linhas...) e 'enorme' (1,45+).
 */
export function sizeBucket(scale) {
  if (scale >= 1.45) return 'enorme';
  if (scale >= 1.18) return 'grande';
  if (scale < 0.95) return 'pequeno';
  return 'padrao';
}

/** Teto do fator na barra de baixo (cinco rótulos lado a lado) e nos seletores segmentados. */
export const NAV_MAX = 1.2;
export const UI_MAX = 1.3;

/** Variáveis CSS do fator: o geral e os com teto (números, sem min() no CSS). */
export function scaleVars(scale) {
  return {
    '--type-scale': String(scale),
    '--type-scale-nav': String(Math.min(scale, NAV_MAX)),
    '--type-scale-ui': String(Math.min(scale, UI_MAX)),
  };
}

/**
 * Põe o fator no <html>: --type-scale (usado pelo CSS; --type-scale-lg, dos títulos, sai dele no
 * CSS), os tetos --type-scale-nav e --type-scale-ui e data-text-size (a faixa).
 */
export function applyScale(doc, scale) {
  const root = doc.documentElement;
  for (const [name, value] of Object.entries(scaleVars(scale))) {
    if (root.style.getPropertyValue(name) !== value) root.style.setProperty(name, value);
  }
  const bucket = sizeBucket(scale);
  if (root.dataset.textSize !== bucket) root.dataset.textSize = bucket;
}

// Escolha feita nesta sessão (vale mesmo se o aparelho não deixou gravar).
let chosen = null;

function sync(doc, storage) {
  const pref = chosen ?? readTextPref(storage);
  applyScale(doc, resolveScale(pref, pref === 'sistema' ? systemTextSize(doc) : null));
}

/**
 * Aplica a escolha guardada e acompanha o iPhone: o tamanho do texto pode mudar com o app em
 * segundo plano (volta: visibilitychange/pageshow) ou com ele aberto (o Safari refaz o layout;
 * resize cobre a rotação e a Central de Controle). Devolve a escolha atual.
 */
export function initTextScale(doc = document, storage = localStorage) {
  const run = () => sync(doc, storage);
  run();
  doc.addEventListener('visibilitychange', () => { if (doc.visibilityState === 'visible') run(); });
  addEventListener('pageshow', run);
  addEventListener('resize', run);
  addEventListener('storage', (e) => {
    if (e.key !== TEXT_KEY && e.key !== null) return;
    chosen = null;
    run();
  });
  return readTextPref(storage);
}

/** Troca feita em Ajustes: guarda e aplica na hora. */
export function setTextPref(pref, doc = document, storage = localStorage) {
  const saved = saveTextPref(storage, pref);
  chosen = TEXT_PREFS.includes(pref) ? pref : 'sistema';
  applyScale(doc, resolveScale(pref, pref === 'sistema' ? systemTextSize(doc) : null));
  return saved;
}
