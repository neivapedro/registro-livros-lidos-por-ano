// Gera a imagem da retrospectiva (formato stories, 1080×1920) para salvar ou compartilhar.

import { FORMATS } from './store.js';
import { decimal, num, plural } from './ui.js';

const W = 1080;
const H = 1920;
const C = {
  bg: '#140F0C', card: '#241B16', text: '#F4EFEA', muted: '#A39A92', soft: '#CFC8C1', accent: '#D08C4F', line: '#3A2E26',
};
const SERIF = '"Instrument Serif", Georgia, serif';
const SANS = 'Manrope, system-ui, sans-serif';

async function ensureFonts() {
  if (!document.fonts?.load) return;
  await Promise.all([
    document.fonts.load(`400 100px ${SERIF}`),
    document.fonts.load(`italic 400 100px ${SERIF}`),
    document.fonts.load(`700 40px ${SANS}`),
    document.fonts.load(`800 40px ${SANS}`),
  ]).catch(() => {});
}

function fitText(ctx, text, maxWidth, size, fontFn) {
  let s = size;
  ctx.font = fontFn(s);
  while (ctx.measureText(text).width > maxWidth && s > 24) {
    s -= 4;
    ctx.font = fontFn(s);
  }
  return s;
}

function eyebrow(ctx, text, x, y) {
  ctx.font = `700 30px ${SANS}`;
  ctx.fillStyle = C.muted;
  ctx.letterSpacing = '5px';
  ctx.fillText(text.toUpperCase(), x, y);
  ctx.letterSpacing = '0px';
}

export async function renderRetroImage(d, year) {
  await ensureFonts();
  const { s } = d;
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  const x = 96;
  const maxW = W - x * 2;

  ctx.fillStyle = C.bg;
  ctx.fillRect(0, 0, W, H);

  ctx.textBaseline = 'alphabetic';
  ctx.font = `400 64px ${SERIF}`;
  ctx.fillStyle = C.text;
  ctx.fillText('Leituras', x, 170);
  const brandW = ctx.measureText('Leituras ').width;
  ctx.font = `italic 400 64px ${SERIF}`;
  ctx.fillStyle = C.accent;
  ctx.fillText(String(year), x + brandW, 170);

  eyebrow(ctx, d.isCurrent ? `Em ${year}, até agora` : `Em ${year} eu li`, x, 330);
  ctx.font = `400 460px ${SERIF}`;
  ctx.fillStyle = C.accent;
  ctx.fillText(String(s.count), x - 16, 720);
  ctx.font = `400 84px ${SERIF}`;
  ctx.fillStyle = C.text;
  const label = s.count === 1 ? 'livro. ' : 'livros. ';
  ctx.fillText(label, x, 830);
  const lw = ctx.measureText(label).width;
  ctx.font = `italic 400 84px ${SERIF}`;
  ctx.fillStyle = C.soft;
  ctx.fillText(s.count >= s.goal ? 'Meta cumprida.' : `Meta: ${s.goal}.`, x + lw, 830);
  ctx.font = `700 32px ${SANS}`;
  ctx.fillStyle = C.accent;
  ctx.fillText(`${d.monthsMet} de ${d.monthsElapsed} meses com a meta batida`, x, 900);

  const rows = [
    ['Páginas', s.pages ? num(s.pages) : '—'],
    ['Nota média', s.avgRating ? decimal(s.avgRating) : '—'],
    ['Gênero favorito', s.genres[0]?.label || '—'],
    ['Autor mais lido', s.authors[0]?.label || '—'],
    ['Formato', `${plural(s.formats[FORMATS.PHYSICAL], 'físico', 'físicos')} · ${s.formats[FORMATS.KINDLE]} no Kindle`],
  ];
  let y = 980;
  for (const [k, v] of rows) {
    ctx.strokeStyle = C.line;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(W - x, y);
    ctx.stroke();
    eyebrow(ctx, k, x, y + 62);
    const size = fitText(ctx, v, maxW - 380, 56, (n) => `400 ${n}px ${SERIF}`);
    ctx.font = `400 ${size}px ${SERIF}`;
    ctx.fillStyle = C.text;
    ctx.textAlign = 'right';
    ctx.fillText(v, W - x, y + 68);
    ctx.textAlign = 'left';
    y += 120;
  }

  if (d.book) {
    y += 40;
    ctx.fillStyle = C.card;
    ctx.beginPath();
    ctx.roundRect(x, y, maxW, 220, 36);
    ctx.fill();
    eyebrow(ctx, 'Livro do ano', x + 48, y + 74);
    const title = d.book.title;
    const size = fitText(ctx, title, maxW - 96, 76, (n) => `400 ${n}px ${SERIF}`);
    ctx.font = `400 ${size}px ${SERIF}`;
    ctx.fillStyle = C.accent;
    ctx.fillText(title, x + 48, y + 166);
  }

  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('Falha ao gerar a imagem.'))), 'image/png');
  });
}
