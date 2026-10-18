// Chave opcional do Google Books. Fica no localStorage e fora do estado de propósito:
// assim não vai parar no arquivo de backup (que a pessoa compartilha no Drive, WhatsApp…).

export const GOOGLE_KEY_STORAGE = 'leituras:googleBooksKey';

/** Formato típico de uma chave de API do Google: começa com 'AIza' e tem 39 caracteres. */
export function looksLikeGoogleKey(key) {
  return /^AIza[0-9A-Za-z_-]{35}$/.test(key);
}

export function readGoogleKey(storage) {
  try {
    return storage.getItem(GOOGLE_KEY_STORAGE) || '';
  } catch {
    return '';
  }
}

/**
 * Salva a chave (sem espaços nas pontas). Formato estranho só gera aviso: a pessoa decide.
 * Devolve { ok, key, warning }; ok = false se vazia ou se o navegador recusar gravar.
 */
export function saveGoogleKey(storage, value) {
  const key = String(value ?? '').replace(/\s+/g, '');
  if (!key) return { ok: false, key: '', warning: false };
  try {
    storage.setItem(GOOGLE_KEY_STORAGE, key);
  } catch {
    return { ok: false, key, warning: false };
  }
  return { ok: true, key, warning: !looksLikeGoogleKey(key) };
}

export function removeGoogleKey(storage) {
  try {
    storage.removeItem(GOOGLE_KEY_STORAGE);
  } catch {
    // Sem acesso ao armazenamento: nada a remover.
  }
}
