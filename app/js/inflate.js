// Descompactador "deflate-raw" pequeno (o formato do CompressionStream). Serve para abrir o
// link de comparação em qualquer iPhone: o DecompressionStream só existe a partir do iOS 16.4,
// e aqui há um limite de tamanho de saída (um link malicioso não estoura a memória).
// Segue o "puff" do zlib (decodificação canônica de Huffman, um bit por vez): lento para
// arquivos grandes, de sobra para um link de poucos KB.

const LEN_BASE = [3, 4, 5, 6, 7, 8, 9, 10, 11, 13, 15, 17, 19, 23, 27, 31, 35, 43, 51, 59, 67, 83, 99, 115, 131, 163, 195, 227, 258];
const LEN_EXTRA = [0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 2, 2, 2, 2, 3, 3, 3, 3, 4, 4, 4, 4, 5, 5, 5, 5, 0];
const DIST_BASE = [1, 2, 3, 4, 5, 7, 9, 13, 17, 25, 33, 49, 65, 97, 129, 193, 257, 385, 513, 769, 1025, 1537, 2049, 3073, 4097, 6145, 8193, 12289, 16385, 24577];
const DIST_EXTRA = [0, 0, 0, 0, 1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 6, 6, 7, 7, 8, 8, 9, 9, 10, 10, 11, 11, 12, 12, 13, 13];
const CL_ORDER = [16, 17, 18, 0, 8, 7, 9, 6, 10, 5, 11, 4, 12, 3, 13, 2, 14, 1, 15];

class InflateError extends Error {}

/** Tabela canônica: quantos códigos há de cada tamanho e os símbolos em ordem. */
function tree(lengths) {
  const counts = new Uint16Array(16);
  for (const l of lengths) counts[l] += 1;
  counts[0] = 0;
  const offs = new Uint16Array(16);
  for (let i = 1; i < 16; i += 1) offs[i] = offs[i - 1] + counts[i - 1];
  const symbols = new Uint16Array(lengths.length);
  lengths.forEach((l, s) => { if (l) symbols[offs[l]++] = s; });
  return { counts, symbols };
}

let fixed = null;
function fixedTrees() {
  if (!fixed) {
    const lit = new Array(288);
    for (let i = 0; i < 288; i += 1) lit[i] = i < 144 ? 8 : i < 256 ? 9 : i < 280 ? 7 : 8;
    fixed = { lit: tree(lit), dist: tree(new Array(30).fill(5)) };
  }
  return fixed;
}

/**
 * Descompacta bytes deflate-raw. maxOut: tamanho máximo da saída (lança erro acima dele).
 * Devolve Uint8Array. Dados corrompidos lançam erro.
 */
export function inflateRaw(input, { maxOut = 65536 } = {}) {
  const src = input instanceof Uint8Array ? input : new Uint8Array(input);
  let pos = 0;
  let bitBuf = 0;
  let bitCnt = 0;
  let out = new Uint8Array(Math.min(maxOut, Math.max(1024, src.length * 4)));
  let len = 0;

  const bits = (n) => {
    while (bitCnt < n) {
      if (pos >= src.length) throw new InflateError('fim inesperado');
      bitBuf |= src[pos++] << bitCnt;
      bitCnt += 8;
    }
    const v = bitBuf & ((1 << n) - 1);
    bitBuf >>>= n;
    bitCnt -= n;
    return v;
  };
  const push = (byte) => {
    if (len >= maxOut) throw new InflateError('grande demais');
    if (len === out.length) {
      const bigger = new Uint8Array(Math.min(maxOut, out.length * 2));
      bigger.set(out);
      out = bigger;
    }
    out[len++] = byte;
  };
  const decode = (h) => {
    let code = 0;
    let first = 0;
    let index = 0;
    for (let l = 1; l < 16; l += 1) {
      code |= bits(1);
      const count = h.counts[l];
      if (code - count < first) return h.symbols[index + (code - first)];
      index += count;
      first += count;
      first <<= 1;
      code <<= 1;
    }
    throw new InflateError('código inválido');
  };
  const codes = (lit, dist) => {
    for (;;) {
      const sym = decode(lit);
      if (sym < 256) push(sym);
      else if (sym === 256) return;
      else {
        const i = sym - 257;
        if (i >= 29) throw new InflateError('comprimento inválido');
        const length = LEN_BASE[i] + bits(LEN_EXTRA[i]);
        const d = decode(dist);
        if (d >= 30) throw new InflateError('distância inválida');
        const back = DIST_BASE[d] + bits(DIST_EXTRA[d]);
        if (back > len) throw new InflateError('distância longe demais');
        for (let k = 0; k < length; k += 1) push(out[len - back]);
      }
    }
  };
  const dynamic = () => {
    const nlen = bits(5) + 257;
    const ndist = bits(5) + 1;
    const ncode = bits(4) + 4;
    if (nlen > 286 || ndist > 30) throw new InflateError('cabeçalho inválido');
    const cl = new Array(19).fill(0);
    for (let i = 0; i < ncode; i += 1) cl[CL_ORDER[i]] = bits(3);
    const clTree = tree(cl);
    const lengths = [];
    while (lengths.length < nlen + ndist) {
      const sym = decode(clTree);
      if (sym < 16) lengths.push(sym);
      else {
        let rep;
        let val = 0;
        if (sym === 16) {
          if (!lengths.length) throw new InflateError('repetição sem anterior');
          val = lengths[lengths.length - 1];
          rep = 3 + bits(2);
        } else if (sym === 17) rep = 3 + bits(3);
        else rep = 11 + bits(7);
        if (lengths.length + rep > nlen + ndist) throw new InflateError('comprimentos demais');
        for (let k = 0; k < rep; k += 1) lengths.push(val);
      }
    }
    if (!lengths[256]) throw new InflateError('sem fim de bloco');
    codes(tree(lengths.slice(0, nlen)), tree(lengths.slice(nlen)));
  };

  let last = 0;
  while (!last) {
    last = bits(1);
    const type = bits(2);
    if (type === 0) {
      bitBuf = 0;
      bitCnt = 0;
      if (pos + 4 > src.length) throw new InflateError('fim inesperado');
      const n = src[pos] | (src[pos + 1] << 8);
      const nn = src[pos + 2] | (src[pos + 3] << 8);
      pos += 4;
      if (n !== (~nn & 0xffff)) throw new InflateError('bloco guardado inválido');
      if (pos + n > src.length) throw new InflateError('fim inesperado');
      for (let k = 0; k < n; k += 1) push(src[pos++]);
    } else if (type === 1) {
      const t = fixedTrees();
      codes(t.lit, t.dist);
    } else if (type === 2) {
      dynamic();
    } else {
      throw new InflateError('tipo de bloco inválido');
    }
  }
  return out.slice(0, len);
}
