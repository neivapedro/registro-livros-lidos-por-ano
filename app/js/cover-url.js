// Endereço das capas: sempre o mesmo endereço para a mesma capa.
// O service worker guarda cada capa pelo endereço (sw.js, cache "leituras-capas"): se a tela
// pedisse a mesma capa ora com http, ora com "edge=curl" ou outro zoom, cada variação seria
// baixada e guardada de novo. Sem importações: serve à tela, à busca e aos testes.

/** Servidores de capa do Google Books (books.google.com, books.google.com.br, ...googleusercontent.com). */
export function isGoogleCoverHost(hostname) {
  return /^books\.google\.[a-z.]+$/.test(hostname) || hostname.endsWith('googleusercontent.com');
}

/**
 * Forma única do endereço de uma capa: https e, no Google Books, sem a "dobra de página"
 * (edge=curl) e no tamanho de miniatura padrão (zoom=1, ~128 px de largura, nítida na lista).
 * Foto do celular (data:) e endereços já certos voltam iguais (o mesmo texto que está salvo).
 * Devolve null quando não é uma capa utilizável.
 */
export function normalizeCoverUrl(url) {
  if (typeof url !== 'string') return null;
  const value = url.trim();
  if (!value) return null;
  if (value.startsWith('data:')) return value;
  let u;
  try {
    u = new URL(value);
  } catch {
    return null;
  }
  if (u.protocol === 'http:') u.protocol = 'https:';
  if (u.protocol !== 'https:') return null;
  if (isGoogleCoverHost(u.hostname)) {
    const p = u.searchParams;
    // Só mexe na busca do endereço quando precisa: reescrevê-la mudaria a forma de
    // endereços que já estão certos (e a capa guardada com eles deixaria de ser achada).
    if (p.has('edge')) p.delete('edge');
    if (!p.has('fife') && p.get('zoom') !== '1') p.set('zoom', '1');
  }
  return u.href;
}

/** Capa de um site (não foto do celular): é essa que o service worker guarda. */
export function isRemoteCover(url) {
  return typeof url === 'string' && url.startsWith('https://');
}
