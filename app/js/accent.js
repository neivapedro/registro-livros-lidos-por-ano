// Cor de destaque (1.5): Terracota (padrão), Oliva, Petróleo, Vinho ou Grafite.
// Como o tema, a escolha é do aparelho (localStorage 'leituras:acento'): não entra nos dados
// nem no backup. O index.html aplica data-accent no <html> antes do CSS (sem piscar); as cores
// de cada opção, no claro e no escuro, ficam no CSS (bloco "1.5 Cores" em css/app.css).
// Mantenha a lista igual à do script do index.html (tests/cores.test.js confere).

export const ACCENT_KEY = 'leituras:acento';
export const DEFAULT_ACCENT = 'terracota';
export const ACCENTS = [
  { id: 'terracota', label: 'Terracota' },
  { id: 'oliva', label: 'Oliva' },
  { id: 'petroleo', label: 'Petróleo' },
  { id: 'vinho', label: 'Vinho' },
  { id: 'grafite', label: 'Grafite' },
];
export const ACCENT_IDS = ACCENTS.map((a) => a.id);

/**
 * Destaque no tema escuro de cada opção: as imagens para compartilhar (retrospectiva e trecho)
 * são sempre escuras. Os mesmos valores de --acc-* no CSS (o teste confere).
 */
export const SHARE_ACCENTS = {
  terracota: '#D08C4F', oliva: '#A9B26A', petroleo: '#5FAFBA', vinho: '#DB8597', grafite: '#B4BAC2',
};

/** Só aceita uma das opções; qualquer outra coisa vira o padrão. */
export function validAccent(value) {
  return ACCENT_IDS.includes(value) ? value : DEFAULT_ACCENT;
}

/** Escolha guardada; sem nada (ou sem acesso ao armazenamento): Terracota. */
export function readAccent(storage) {
  try {
    return validAccent(storage?.getItem(ACCENT_KEY));
  } catch {
    return DEFAULT_ACCENT;
  }
}

/** Guarda a escolha; o padrão apaga a chave. Devolve false se o aparelho não deixou gravar. */
export function saveAccent(storage, id) {
  try {
    const value = validAccent(id);
    if (value === DEFAULT_ACCENT) storage.removeItem(ACCENT_KEY);
    else storage.setItem(ACCENT_KEY, value);
    return true;
  } catch {
    return false;
  }
}

export function applyAccent(doc, id) {
  const root = doc.documentElement;
  const value = validAccent(id);
  if (root.dataset.accent !== value) root.dataset.accent = value;
}

/** Cor de destaque (tema escuro) para desenhar as imagens de compartilhar. */
export function shareAccent(doc = globalThis.document) {
  return SHARE_ACCENTS[validAccent(doc?.documentElement?.dataset?.accent)];
}

/** Aplica a escolha guardada e acompanha outra aba que troque a cor. Devolve a escolha atual. */
export function initAccent(doc = document, storage = localStorage) {
  const sync = () => applyAccent(doc, readAccent(storage));
  sync();
  addEventListener('storage', (e) => {
    if (e.key === ACCENT_KEY || e.key === null) sync();
  });
  return readAccent(storage);
}

/** Troca feita em Ajustes: guarda e aplica na hora. */
export function setAccentPref(id, doc = document, storage = localStorage) {
  const saved = saveAccent(storage, id);
  applyAccent(doc, id);
  return saved;
}
