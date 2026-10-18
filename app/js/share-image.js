// Gera a imagem da retrospectiva para salvar ou compartilhar:
// 'story' (1080×1920, stories) ou 'square' (1080×1080, feed).

import { FORMATS } from './store.js';
import { num, plural } from './ui.js';

export const IMAGE_SIZES = { story: [1080, 1920], square: [1080, 1080] };

const C = {
  bg: '#140F0C', card: '#241B16', text: '#F4EFEA', muted: '#A39A92', soft: '#CFC8C1', accent: '#D08C4F', line: '#3A2E26',
};
const SERIF = '"Instrument Serif", Georgia, serif';
const SANS = 'Manrope, system-ui, sans-serif';
const serif = (n) => `400 ${n}px ${SERIF}`;
const serifItalic = (n) => `italic 400 ${n}px ${SERIF}`;

async function ensureFonts() {
  if (!document.fonts?.load) return;
  await Promise.all([
    document.fonts.load(`400 100px ${SERIF}`),
    document.fonts.load(`italic 400 100px ${SERIF}`),
    document.fonts.load(`700 40px ${SANS}`),
    document.fonts.load(`800 40px ${SANS}`),
  ]).catch(() => {});
}

/** Diminui a fonte até caber; se nem no mínimo couber, corta com reticências. Devolve o texto final. */
function fitText(ctx, text, maxWidth, size, fontFn, min = 28) {
  let s = size;
  ctx.font = fontFn(s);
  while (ctx.measureText(text).width > maxWidth && s > min) {
    s -= 4;
    ctx.font = fontFn(s);
  }
  let out = text;
  while (out.length > 1 && ctx.measureText(out).width > maxWidth) out = `${out.slice(0, -2).trimEnd()}…`;
  return out;
}

function eyebrow(ctx, text, x, y, { size = 30, align = 'left', color = C.muted } = {}) {
  ctx.font = `700 ${size}px ${SANS}`;
  ctx.fillStyle = color;
  ctx.letterSpacing = '5px';
  const t = text.toUpperCase();
  // À direita: mede e desconta a largura, menos a sobra de espaçamento depois da última letra.
  ctx.fillText(t, align === 'right' ? x - ctx.measureText(t).width + 5 : x, y);
  ctx.letterSpacing = '0px';
}

function rule(ctx, x1, x2, y) {
  ctx.strokeStyle = C.line;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(x1, y);
  ctx.lineTo(x2, y);
  ctx.stroke();
}

function brand(ctx, year, x, y, size) {
  ctx.font = serif(size);
  ctx.fillStyle = C.text;
  ctx.fillText('Leituras', x, y);
  const w = ctx.measureText('Leituras ').width;
  ctx.font = serifItalic(size);
  ctx.fillStyle = C.accent;
  ctx.fillText(String(year), x + w, y);
}

function bookCard(ctx, title, x, y, w, h, { label = 64, titleSize = 76 } = {}) {
  ctx.fillStyle = C.card;
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, 36);
  ctx.fill();
  eyebrow(ctx, 'Livro do ano', x + 48, y + label);
  const text = fitText(ctx, title, w - 96, titleSize, serif);
  ctx.fillStyle = C.accent;
  ctx.fillText(text, x + 48, y + h - 56);
}

/** Números da imagem: os mesmos da tela (retroData). */
function facts(d) {
  const { s } = d;
  return {
    goalLine: s.count >= s.goal ? 'Meta cumprida.' : `Meta: ${s.goal}.`,
    months: `${d.monthsMet} de ${d.monthsElapsed} meses com a meta batida`,
    pages: s.pages ? num(s.pages) : '—',
    genre: s.genres[0]?.label || '—',
    author: s.authors[0]?.label || '—',
    streak: d.streak >= 2 ? `${d.streak} dias seguidos` : '',
    format: `${plural(s.formats[FORMATS.PHYSICAL], 'físico', 'físicos')} · ${s.formats[FORMATS.KINDLE]} no Kindle`,
    profile: d.profile?.title || '',
  };
}

function drawStory(ctx, d, year, W) {
  const { s } = d;
  const f = facts(d);
  const x = 96;
  const maxW = W - x * 2;
  brand(ctx, year, x, 170, 64);

  eyebrow(ctx, d.isCurrent ? `Em ${year}, até agora` : `Em ${year} eu li`, x, 330);
  ctx.font = serif(460);
  ctx.fillStyle = C.accent;
  ctx.fillText(String(s.count), x - 16, 720);
  ctx.font = serif(84);
  ctx.fillStyle = C.text;
  const label = s.count === 1 ? 'livro. ' : 'livros. ';
  ctx.fillText(label, x, 830);
  const lw = ctx.measureText(label).width;
  ctx.font = serifItalic(84);
  ctx.fillStyle = C.soft;
  ctx.fillText(f.goalLine, x + lw, 830);
  ctx.font = `700 32px ${SANS}`;
  ctx.fillStyle = C.accent;
  ctx.fillText(f.months, x, 900);

  const rows = [
    ['Páginas', f.pages],
    ['Gênero favorito', f.genre],
    ['Autor mais lido', f.author],
    f.streak ? ['Maior sequência', f.streak] : null,
    f.profile ? ['Perfil de leitor', f.profile, true] : null,
  ].filter(Boolean);
  let y = 980;
  for (const [k, v, highlight] of rows) {
    rule(ctx, x, W - x, y);
    eyebrow(ctx, k, x, y + 66);
    const text = fitText(ctx, v, maxW - 400, 56, highlight ? serifItalic : serif);
    ctx.fillStyle = highlight ? C.accent : C.text;
    ctx.textAlign = 'right';
    ctx.fillText(text, W - x, y + 72);
    ctx.textAlign = 'left';
    y += 116;
  }
  if (d.book) bookCard(ctx, d.book.title, x, y + 40, maxW, 220, { label: 74, titleSize: 76 });
}

function drawSquare(ctx, d, year, W) {
  const { s } = d;
  const f = facts(d);
  const m = 80;
  brand(ctx, year, m, 132, 56);
  if (f.profile) {
    eyebrow(ctx, 'Perfil', W - m, 90, { size: 22, align: 'right' });
    const text = fitText(ctx, f.profile, 420, 52, serifItalic);
    ctx.fillStyle = C.accent;
    ctx.textAlign = 'right';
    ctx.fillText(text, W - m, 142);
    ctx.textAlign = 'left';
  }

  // Número grande à esquerda; ao lado, "livros", a meta e os meses.
  ctx.font = serif(300);
  ctx.fillStyle = C.accent;
  ctx.fillText(String(s.count), m - 10, 450);
  const cx = m - 10 + ctx.measureText(String(s.count)).width + 36;
  const side = W - m - cx;
  const label = d.isCurrent ? (s.count === 1 ? 'livro até agora' : 'livros até agora') : (s.count === 1 ? 'livro lido' : 'livros lidos');
  ctx.fillStyle = C.text;
  ctx.fillText(fitText(ctx, label, side, 76, serif), cx, 330);
  ctx.fillStyle = C.soft;
  ctx.fillText(fitText(ctx, f.goalLine, side, 48, serifItalic), cx, 394);
  ctx.font = `700 26px ${SANS}`;
  ctx.fillStyle = C.accent;
  ctx.fillText(fitText(ctx, f.months, side, 26, (n) => `700 ${n}px ${SANS}`, 18), cx, 444);

  const cells = [
    ['Páginas', f.pages],
    ['Gênero favorito', f.genre],
    ['Autor mais lido', f.author],
    f.streak ? ['Maior sequência', f.streak] : ['Formato', f.format],
  ];
  const colW = (W - m * 2 - 40) / 2;
  cells.forEach(([k, v], i) => {
    const cx2 = m + (i % 2) * (colW + 40);
    const y = 510 + Math.floor(i / 2) * 140;
    rule(ctx, cx2, cx2 + colW, y);
    eyebrow(ctx, k, cx2, y + 50, { size: 22 });
    const text = fitText(ctx, v, colW, 52, serif);
    ctx.fillStyle = C.text;
    ctx.fillText(text, cx2, y + 112);
  });

  if (d.book) bookCard(ctx, d.book.title, m, 812, W - m * 2, 188, { label: 62, titleSize: 64 });
}

/** format: 'story' (padrão) ou 'square'. */
export async function renderRetroImage(d, year, format = 'story') {
  await ensureFonts();
  const [W, H] = IMAGE_SIZES[format] || IMAGE_SIZES.story;
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = C.bg;
  ctx.fillRect(0, 0, W, H);
  ctx.textBaseline = 'alphabetic';
  if (format === 'square') drawSquare(ctx, d, year, W);
  else drawStory(ctx, d, year, W);

  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('Falha ao gerar a imagem.'))), 'image/png');
  });
}
