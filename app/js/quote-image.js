// Imagem quadrada (1080×1080) de um trecho, para salvar ou compartilhar.
// Mesmas cores e fontes da imagem da retrospectiva (share-image.js).

import { quotePosition } from './quotes.js';

const S = 1080;
const PAD = 96;
const C = {
  bg: '#140F0C', text: '#F4EFEA', muted: '#A39A92', soft: '#CFC8C1', accent: '#D08C4F', line: '#3A2E26',
};
const SERIF = '"Instrument Serif", Georgia, serif';
const SANS = 'Manrope, system-ui, sans-serif';

/**
 * Quebra o texto em linhas que caibam em maxWidth. measure(texto) devolve a largura.
 * Respeita as quebras de linha do texto; palavra maior que a linha é cortada.
 */
export function wrapLines(text, maxWidth, measure) {
  const lines = [];
  for (const paragraph of String(text).replace(/\r/g, '').split('\n')) {
    const words = paragraph.split(/\s+/).filter(Boolean);
    let line = '';
    for (let word of words) {
      // Palavra sozinha que não cabe: corta em pedaços.
      while (measure(word) > maxWidth && word.length > 1) {
        if (line) {
          lines.push(line);
          line = '';
        }
        let cut = word.length - 1;
        while (cut > 1 && measure(word.slice(0, cut)) > maxWidth) cut -= 1;
        lines.push(word.slice(0, cut));
        word = word.slice(cut);
      }
      const candidate = line ? `${line} ${word}` : word;
      if (line && measure(candidate) > maxWidth) {
        lines.push(line);
        line = word;
      } else {
        line = candidate;
      }
    }
    if (line) lines.push(line);
  }
  return lines;
}

/**
 * Escolhe o maior tamanho de letra em que o trecho cabe na caixa.
 * measureAt(texto, tamanho) devolve a largura. Se nem no mínimo couber,
 * corta as linhas que sobram e termina com reticências.
 * Devolve { size, lines, lineHeight, truncated }.
 */
export function fitQuote(text, { maxWidth, maxHeight, maxSize = 76, minSize = 36, leading = 1.28 }, measureAt) {
  for (let size = maxSize; size >= minSize; size -= 2) {
    const lines = wrapLines(text, maxWidth, (t) => measureAt(t, size));
    if (lines.length * size * leading <= maxHeight) return { size, lines, lineHeight: size * leading, truncated: false };
  }
  const size = minSize;
  const all = wrapLines(text, maxWidth, (t) => measureAt(t, size));
  const max = Math.max(1, Math.floor(maxHeight / (size * leading)));
  const lines = all.slice(0, max);
  let last = lines[max - 1] || '';
  while (last && measureAt(`${last}…`, size) > maxWidth) last = last.slice(0, -1);
  lines[max - 1] = `${last.replace(/[\s.,;:!?–—-]+$/, '')}…`;
  return { size, lines, lineHeight: size * leading, truncated: true };
}

async function ensureFonts() {
  if (!document.fonts?.load) return;
  await Promise.all([
    document.fonts.load(`400 100px ${SERIF}`),
    document.fonts.load(`italic 400 100px ${SERIF}`),
    document.fonts.load(`700 30px ${SANS}`),
  ]).catch(() => {});
}

/** Diminui a letra até o texto caber numa linha. */
function fitLine(ctx, text, maxWidth, size, fontFn, min = 24) {
  let s = size;
  ctx.font = fontFn(s);
  while (ctx.measureText(text).width > maxWidth && s > min) {
    s -= 2;
    ctx.font = fontFn(s);
  }
  return s;
}

/** Corta com reticências o que não couber mesmo no menor tamanho. */
function clip(ctx, text, maxWidth) {
  if (ctx.measureText(text).width <= maxWidth) return text;
  let t = text;
  while (t && ctx.measureText(`${t}…`).width > maxWidth) t = t.slice(0, -1);
  return `${t.trimEnd()}…`;
}

export async function renderQuoteImage(quote, book) {
  await ensureFonts();
  const canvas = document.createElement('canvas');
  canvas.width = S;
  canvas.height = S;
  const ctx = canvas.getContext('2d');
  const maxW = S - PAD * 2;

  ctx.fillStyle = C.bg;
  ctx.fillRect(0, 0, S, S);
  ctx.textBaseline = 'alphabetic';

  // Aspas grandes em caramelo, como abertura.
  ctx.font = `400 340px ${SERIF}`;
  ctx.fillStyle = C.accent;
  ctx.fillText('“', PAD - 14, 330);

  // Trecho: serifa itálica, no maior tamanho que couber, centrado na área do meio.
  const boxTop = 260;
  const boxBottom = 820;
  const italic = (n) => `italic 400 ${n}px ${SERIF}`;
  const fit = fitQuote(quote.text, { maxWidth: maxW, maxHeight: boxBottom - boxTop, maxSize: 84 }, (t, n) => {
    ctx.font = italic(n);
    return ctx.measureText(t).width;
  });
  ctx.font = italic(fit.size);
  ctx.fillStyle = C.text;
  const blockH = fit.lines.length * fit.lineHeight;
  let y = boxTop + Math.max(0, (boxBottom - boxTop - blockH) / 2) + fit.size;
  for (const line of fit.lines) {
    ctx.fillText(line, PAD, y);
    y += fit.lineHeight;
  }

  // Rodapé: título e autor à esquerda, marca do app à direita.
  ctx.strokeStyle = C.line;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(PAD, 872);
  ctx.lineTo(S - PAD, 872);
  ctx.stroke();

  const markW = 200;
  const titleSize = fitLine(ctx, book.title, maxW - markW, 48, (n) => `400 ${n}px ${SERIF}`, 30);
  ctx.font = `400 ${titleSize}px ${SERIF}`;
  ctx.fillStyle = C.accent;
  ctx.fillText(clip(ctx, book.title, maxW - markW), PAD, 940);

  const author = (book.authors || '').split(',')[0].trim();
  const meta = [author, quotePosition(quote)].filter(Boolean).join(' · ').toUpperCase();
  if (meta) {
    ctx.font = `700 24px ${SANS}`;
    ctx.letterSpacing = '4px';
    ctx.fillStyle = C.muted;
    ctx.fillText(clip(ctx, meta, maxW - markW), PAD, 990);
    ctx.letterSpacing = '0px';
  }

  ctx.textAlign = 'right';
  ctx.font = `italic 400 40px ${SERIF}`;
  ctx.fillStyle = C.soft;
  ctx.fillText('Leituras', S - PAD, 990);
  ctx.textAlign = 'left';

  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('Falha ao gerar a imagem.'))), 'image/png');
  });
}
