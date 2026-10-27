// Aparência (V14): Automático (segue o iPhone), Claro ou Escuro.
// A escolha é do aparelho (localStorage 'leituras:tema'): não entra nos dados nem no backup.
// O index.html aplica o tema num script antes do CSS (sem piscar); aqui ficam a troca feita
// em Ajustes e o acompanhamento do iPhone quando ele muda de claro para escuro.
// Mantenha a lógica de resolveTheme igual à do script do index.html (tests/tema.test.js confere).

export const THEME_KEY = 'leituras:tema';
export const THEME_PREFS = ['auto', 'claro', 'escuro'];
/** Cor da barra do sistema (meta theme-color) em cada tema: o fundo do app. */
export const THEME_COLORS = { light: '#F6F1EB', dark: '#0E0C0B' };

const LIGHT_QUERY = '(prefers-color-scheme: light)';

/** 'auto' | 'claro' | 'escuro'. Sem nada guardado (ou sem acesso ao armazenamento): 'auto'. */
export function readThemePref(storage) {
  try {
    const value = storage?.getItem(THEME_KEY);
    return THEME_PREFS.includes(value) ? value : 'auto';
  } catch {
    return 'auto';
  }
}

/** Guarda a escolha; 'auto' apaga a chave. Devolve false se o aparelho não deixou gravar. */
export function saveThemePref(storage, pref) {
  try {
    if (pref === 'auto' || !THEME_PREFS.includes(pref)) storage.removeItem(THEME_KEY);
    else storage.setItem(THEME_KEY, pref);
    return true;
  } catch {
    return false;
  }
}

/** Tema efetivo ('light' | 'dark'). No automático, sem preferência do sistema, fica o escuro de sempre. */
export function resolveTheme(pref, prefersLight) {
  if (pref === 'claro') return 'light';
  if (pref === 'escuro') return 'dark';
  return prefersLight ? 'light' : 'dark';
}

/** Põe o tema no <html> e acerta as metas (cor da barra do sistema e esquema de cores). */
export function applyTheme(doc, theme) {
  const root = doc.documentElement;
  if (root.dataset.theme !== theme) root.dataset.theme = theme;
  for (const meta of doc.querySelectorAll('meta[name="theme-color"]')) meta.setAttribute('content', THEME_COLORS[theme]);
  doc.querySelector('meta[name="color-scheme"]')?.setAttribute('content', theme);
}

function prefersLight() {
  return typeof matchMedia === 'function' && matchMedia(LIGHT_QUERY).matches;
}

/** Aplica a escolha guardada e acompanha o iPhone no modo automático. Devolve a escolha atual. */
export function initTheme(doc = document, storage = localStorage) {
  const sync = () => applyTheme(doc, resolveTheme(readThemePref(storage), prefersLight()));
  sync();
  if (typeof matchMedia === 'function') matchMedia(LIGHT_QUERY).addEventListener?.('change', sync);
  // Outra aba (ou o app instalado aberto ao lado) trocou a aparência.
  addEventListener('storage', (e) => {
    if (e.key === THEME_KEY || e.key === null) sync();
  });
  return readThemePref(storage);
}

/** Troca feita em Ajustes: guarda e aplica na hora. */
export function setThemePref(pref, doc = document, storage = localStorage) {
  const saved = saveThemePref(storage, pref);
  applyTheme(doc, resolveTheme(pref, prefersLight()));
  return saved;
}
