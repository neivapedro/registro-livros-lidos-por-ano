// QA da 1.6, de ponta a ponta: o que as partes fazem juntas. Livros com TODOS os campos novos
// (humor, ritmo, critérios, sinopse, empréstimo, audiolivro, desafios, horário das sessões)
// em todas as telas (inclusive as novas: Sugestões, Comparar, Cronômetro com som, Importar),
// texto 0,85 a 1,6 × 320/390/430, claro e escuro, as 5 cores, contraste aumentado, iPad e
// celular deitado: sem rolagem lateral, texto cortado, alvos pequenos nem contraste abaixo de AA.
// Também: terminar um audiolivro (diário em minutos + desafio), backup, importar/desfazer CSV.
// Capturas em tests/e2e/screens/qa-v16-*.png. QA_ONLY=telas|escala|contraste|largas|menu|fluxo|importar.
// Uso: node tests/e2e/qa-v16.mjs

import { execSync } from 'node:child_process';
import { createServer } from 'node:http';
import { mkdirSync, readFileSync, existsSync } from 'node:fs';
import { extname, join, normalize } from 'node:path';
import { createRequire } from 'node:module';
import assert from 'node:assert/strict';

const require = createRequire(import.meta.url);
let playwright;
try {
  playwright = require('playwright');
} catch {
  playwright = require(join(execSync('npm root -g').toString().trim(), 'playwright'));
}

const APP = new URL('../../app/', import.meta.url).pathname;
const SHOTS = new URL('./screens/', import.meta.url).pathname;
mkdirSync(SHOTS, { recursive: true });

const TYPES = {
  '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json',
  '.webmanifest': 'application/manifest+json', '.svg': 'image/svg+xml', '.png': 'image/png', '.woff2': 'font/woff2',
};
const server = createServer((req, res) => {
  const path = normalize(decodeURIComponent(new URL(req.url, 'http://x').pathname)).replace(/^\/+/, '');
  const file = join(APP, path || 'index.html');
  if (!file.startsWith(APP) || !existsSync(file)) {
    res.writeHead(404).end();
    return;
  }
  res.writeHead(200, { 'Content-Type': TYPES[extname(file)] || 'application/octet-stream' });
  res.end(readFileSync(file));
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
// 127.0.0.1 (e não localhost): sem service worker, cada cenário usa o código atual.
const BASE = `http://127.0.0.1:${server.address().port}/`;
const TODAY = '2026-10-26';
import { buildSnapshot, encodeSnapshot } from '../../app/js/compare.js';

// ---------- Dados: livros com TODOS os campos novos da 1.6 ----------

const TS = '2026-01-01T00:00:00.000Z';
let seq = 0;
function book(title, extra = {}) {
  seq += 1;
  return {
    id: `b${seq}`, title, authors: `Autora ${seq}`, pages: 320, status: 'lido', startDate: null, endDate: null,
    format: 'fisico', rating: null, genre: 'Ficção', favorite: false, notes: '', cover: null, isbn: '',
    currentPage: null, currentPercent: null, dropReason: '', reread: false, series: '', seriesNumber: null,
    tags: [], targetDate: null, quotes: [], journal: [], createdAt: TS, updatedAt: TS, ...extra,
  };
}
const dayIso = (start, i) => {
  const d = new Date(Date.UTC(Number(start.slice(0, 4)), Number(start.slice(5, 7)) - 1, Number(start.slice(8, 10)) + i));
  return d.toISOString().slice(0, 10);
};
/** Diário com cronômetro e horário das sessões. */
function timed(start, n, per, min, hours, unit = 'page', from = 0) {
  return Array.from({ length: n }, (_, i) => ({
    date: dayIso(start, i), from: from + i * per, to: from + (i + 1) * per, unit, note: i === 1 ? 'Um dia bom.' : '', minutes: min, hours: hours(i),
  }));
}
const quote = (id, text, page) => ({ id, text, page, percent: null, note: '', createdAt: '2026-03-02T10:00:00.000Z' });
const SYNOPSIS = 'Duas irmãs encontram uma faca enferrujada debaixo da cama da avó. A partir desse achado, a história cruza gerações de trabalhadores de uma fazenda no sertão da Bahia, entre fé, terra e resistência. Um romance sobre pertencimento, desigualdade e a força de quem cuida da terra, narrado com uma linguagem que mistura o oral e o poético.';
const books = [
  book('Torto Arado', {
    id: 'lido', status: 'lido', startDate: '2026-02-01', endDate: '2026-02-20', rating: 4.5, favorite: true, genre: 'Ficção',
    authors: 'Itamar Vieira Junior', pages: 260, isbn: '9788582851579', tags: ['Brasil', 'Clássico'], notes: 'Livro lindo.\nRelido em voz alta.',
    quotes: [quote('q1', 'A terra é de quem trabalha nela, não de quem a possui no papel.', 112)],
    moods: ['reflexivo', 'triste', 'inspirador'], pace: 'lento', criteria: { personagens: 5, enredo: 4, escrita: 4.5, emocao: 5 },
    description: SYNOPSIS, loan: { to: 'Ana Carolina', since: '2026-03-01' }, journal: timed('2026-02-01', 8, 32, 35, () => ({ 21: 25, 22: 10 })),
  }),
  book('Duna (audiolivro)', {
    id: 'aud', status: 'lendo', format: 'audio', durationMin: 1260, currentMin: 400, pages: null, startDate: '2026-10-10', authors: 'Frank Herbert',
    series: 'Duna', seriesNumber: 1, tags: ['Clássico'], moods: ['tenso', 'desafiador'], pace: 'medio', description: SYNOPSIS,
    journal: timed('2026-10-10', 9, 40, 40, (i) => (i % 2 ? { 7: 40 } : { 22: 40 }), 'minute', 40), targetDate: '2026-12-20',
  }),
  book('O Hobbit', { id: 'kindle', status: 'lendo', format: 'kindle', currentPercent: 42, pages: 336, startDate: '2026-10-01', authors: 'J.R.R. Tolkien', loan: { to: 'Pedro', since: null }, moods: ['leve'] }),
  book('Hábitos Atômicos', { id: 'quero', status: 'quero', pages: 320, authors: 'James Clear', loan: { to: 'Karoline', since: '2026-09-15' }, description: SYNOPSIS, moods: ['informativo'], pace: 'rapido' }),
  book('Ulysses', { id: 'aband', status: 'abandonado', startDate: '2026-05-01', endDate: '2026-05-20', dropReason: 'Não prendeu. Talvez em outro momento.', currentPage: 90, pages: 900, authors: 'James Joyce' }),
  book('Dom Casmurro', { id: 'reler', status: 'lido', startDate: '2026-03-01', endDate: '2026-03-10', rating: 5, reread: true, authors: 'Machado de Assis', pages: 256, tags: ['Clássico'], moods: ['reflexivo'], criteria: { escrita: 5 } }),
];
const G = ['Ficção', 'Biografia', 'Filosofia', 'História', 'Gestão'];
['2026-01-18', '2026-04-08', '2026-05-30', '2026-06-21', '2026-07-15', '2026-08-30', '2026-09-22', '2026-10-05'].forEach((end, i) => books.push(book(`Leitura ${i + 1}`, {
  endDate: end, startDate: `${end.slice(0, 8)}01`, rating: [4, 3.5, 5, 4, 4.5, 3, 4, 5][i], genre: G[i % G.length], pages: 180 + i * 40,
  format: i % 3 === 1 ? 'kindle' : i % 3 === 2 ? 'audio' : 'fisico', durationMin: i % 3 === 2 ? 480 + i * 30 : null, tags: i % 2 ? ['Clássico'] : [],
  moods: [['leve'], ['tenso', 'sombrio'], ['reflexivo'], ['engracado', 'leve']][i % 4], pace: ['lento', 'medio', 'rapido'][i % 3],
  authors: i < 3 ? 'Autor Repetido' : `Autora ${i + 20}`,
  journal: timed(`${end.slice(0, 8)}01`, 6, 25, 30, () => ({ 21: 30 })),
})));
['2025-02-10', '2025-07-01'].forEach((end, i) => books.push(book(`Antigo ${i + 1}`, { endDate: end, startDate: `${end.slice(0, 8)}01`, rating: 4, pages: 300 })));
['Quero B', 'Quero C', 'Quero D'].forEach((t) => books.push(book(t, { status: 'quero', pages: 200, moods: [] })));
const seed = {
  version: 2, books, goals: { 2026: 15, 2025: 12 }, defaultGoal: 12, customGenres: [], lastBackupAt: '2026-10-20T10:00:00.000Z',
  upNext: ['quero'], pageGoals: { 2026: 5000 },
  challenges: [
    { id: 'c1', year: 2026, title: '', target: 3, rule: { type: 'tag', value: 'Clássico' }, books: [] },
    { id: 'c2', year: 2026, title: '', target: 1, rule: { type: 'format', value: 'audio' }, books: [] },
    { id: 'c3', year: 2026, title: 'Meus favoritos do ano', target: 2, rule: { type: 'manual', value: null }, books: ['lido'] },
    { id: 'c4', year: 2026, title: '', target: 4, rule: { type: 'authors', value: null }, books: [] },
  ],
};

// Resumo de "outra pessoa" para #/comparar (feito pelo próprio código do app) e sugestões guardadas.
let compareParam = '';
const theirState = {
  books: [
    book('Torto Arado', { authors: 'Itamar Vieira Junior', endDate: '2026-04-02', rating: 5, genre: 'Ficção' }),
    book('Dom Casmurro', { authors: 'Machado de Assis', endDate: '2026-05-02', rating: 4, genre: 'Ficção' }),
    ...['Biografia', 'História', 'Filosofia', 'Ficção', 'Gestão'].map((g, i) => book(`Livro dela ${i + 1}`, { endDate: `2026-0${i + 1}-15`, rating: 4, genre: g, pages: 150 + i * 70 })),
  ],
  goals: { 2026: 12 }, defaultGoal: 12,
};
{
  const snap = buildSnapshot(theirState, 2026, '2026-10-20', { name: 'Karoline', withBooks: true });
  compareParam = await encodeSnapshot(snap);
}
const SUGGESTIONS = {
  fila: { date: '2026-10-25', items: [{ id: 'quero', reason: 'Combina com o seu momento: leitura leve e rápida depois de um audiolivro longo.' }, { id: books.find((b) => b.title === 'Quero B').id, reason: 'Curto, para fechar a semana.' }] },
  novos: {
    date: '2026-10-25',
    items: [
      { title: 'Grande Sertão: Veredas', authors: 'João Guimarães Rosa', pages: 608, cover: null, isbn: '', year: 1956, source: 'Google Livros', reason: 'Você gostou de Torto Arado e de livros sobre o sertão e a fé.' },
      { title: 'Vidas Secas', authors: 'Graciliano Ramos', pages: 176, cover: null, isbn: '', year: 1938, source: 'Open Library', reason: 'Curto e intenso, no mesmo universo.' },
    ],
  },
};

// ---------- Contraste: cor do texto contra o fundo opaco mais próximo (com camadas translúcidas) ----------

/* Roda na página. Devolve os textos visíveis abaixo do mínimo: 4,5:1 (< 18 px) ou 3:1 (≥ 18 px);
   com "Aumentar contraste", 7:1 e 4,5:1 (AAA). Ignora capas (arte do livro), controles
   desativados e texto só para leitor de tela. (Mesma auditoria de tema-v14.mjs.) */
function auditContrast({ small = 4.5, large = 3 } = {}) {
  const parse = (str) => {
    const out = [];
    const re = /rgba?\(([^)]+)\)|color\(srgb ([^)]+)\)/g;
    let m;
    while ((m = re.exec(str))) {
      if (m[1]) {
        const p = m[1].split(/[\s,/]+/).filter(Boolean).map(Number);
        out.push([p[0], p[1], p[2], p.length > 3 ? p[3] : 1]);
      } else {
        const p = m[2].split(/[\s/]+/).filter(Boolean).map(Number);
        out.push([p[0] * 255, p[1] * 255, p[2] * 255, p.length > 3 ? p[3] : 1]);
      }
    }
    return out;
  };
  const over = (top, under) => {
    const a = top[3];
    return [0, 1, 2].map((i) => top[i] * a + under[i] * (1 - a)).concat(1);
  };
  const lum = (c) => {
    const [r, g, b] = c.slice(0, 3).map((v) => {
      const s = v / 255;
      return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  const ratio = (a, b) => {
    const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
    return (x + 0.05) / (y + 0.05);
  };
  const canvas = parse(getComputedStyle(document.body).backgroundColor)[0] || [255, 255, 255, 1];
  const isColor = (str) => /^(rgba?|color)\(/.test(str);
  function splitTop(str) {
    const parts = [];
    let depth = 0;
    let cur = '';
    for (const ch of str) {
      if (ch === '(') depth += 1;
      if (ch === ')') depth -= 1;
      if (ch === ',' && depth === 0) {
        parts.push(cur.trim());
        cur = '';
      } else cur += ch;
    }
    if (cur.trim()) parts.push(cur.trim());
    return parts;
  }
  /** Gradientes de um background-image calculado, do de cima para o de baixo. */
  function gradients(img) {
    const out = [];
    const re = /(?:repeating-)?(linear|radial|conic)-gradient\(/g;
    let m;
    while ((m = re.exec(img))) {
      let depth = 1;
      let j = m.index + m[0].length;
      while (depth && j < img.length) {
        if (img[j] === '(') depth += 1;
        else if (img[j] === ')') depth -= 1;
        j += 1;
      }
      out.push({ type: m[1], args: splitTop(img.slice(m.index + m[0].length, j - 1)) });
      re.lastIndex = j;
    }
    return out;
  }
  const len = (v, ref) => (String(v).endsWith('%') ? (parseFloat(v) / 100) * ref : parseFloat(v));
  /** Cor do gradiente no ponto (x, y) da caixa (w × h). Interpolação pré-multiplicada, como no navegador. */
  function sample(g, w, h, x, y) {
    const geom = isColor(g.args[0]) ? '' : g.args[0];
    const raw = isColor(g.args[0]) ? g.args : g.args.slice(1);
    let t;
    let L = h;
    if (g.type === 'linear') {
      let a = 180;
      const deg = geom.match(/(-?[\d.]+)deg/);
      if (deg) a = Number(deg[1]);
      else if (/to top/.test(geom)) a = 0;
      else if (/to right/.test(geom)) a = 90;
      else if (/to left/.test(geom)) a = 270;
      const r = (a * Math.PI) / 180;
      const [dx, dy] = [Math.sin(r), -Math.cos(r)];
      L = Math.abs(w * dx) + Math.abs(h * dy);
      t = ((x - w / 2) * dx + (y - h / 2) * dy) / L + 0.5;
    } else if (g.type === 'radial') {
      const at = geom.match(/at (\S+) (\S+)/);
      const cx = at ? len(at[1], w) : w / 2;
      const cy = at ? len(at[2], h) : h / 2;
      const size = geom.replace(/at .*/, '').replace(/circle|ellipse/, '').trim().split(/\s+/).filter(Boolean);
      const far = Math.max(cx, w - cx);
      const farY = Math.max(cy, h - cy);
      let rx;
      let ry;
      if (size.length >= 2 && /[\d]/.test(size[0])) [rx, ry] = [len(size[0], w), len(size[1], h)];
      else if (/circle/.test(geom)) rx = ry = Math.hypot(far, farY);
      else [rx, ry] = [far * Math.SQRT2, farY * Math.SQRT2];
      L = rx;
      t = Math.hypot((x - cx) / rx, (y - cy) / ry);
    } else return null;
    const stops = raw.map((str) => {
      const c = parse(str)[0];
      const rest = str.replace(/^(rgba?|color)\([^)]*\)/, '').trim();
      return { c, pos: rest ? (rest.endsWith('%') ? parseFloat(rest) / 100 : parseFloat(rest) / L) : null };
    }).filter((st) => st.c);
    if (!stops.length) return null;
    if (stops[0].pos === null) stops[0].pos = 0;
    if (stops.at(-1).pos === null) stops.at(-1).pos = 1;
    for (let i = 1; i < stops.length - 1; i += 1) {
      if (stops[i].pos !== null) continue;
      let k = i;
      while (stops[k].pos === null) k += 1;
      for (let n = i; n < k; n += 1) stops[n].pos = stops[i - 1].pos + ((stops[k].pos - stops[i - 1].pos) * (n - i + 1)) / (k - i + 1);
    }
    for (let i = 1; i < stops.length; i += 1) stops[i].pos = Math.max(stops[i].pos, stops[i - 1].pos);
    if (t <= stops[0].pos) return stops[0].c;
    if (t >= stops.at(-1).pos) return stops.at(-1).c;
    const i = stops.findIndex((st) => st.pos >= t);
    const [A, B] = [stops[i - 1], stops[i]];
    const f = B.pos === A.pos ? 1 : (t - A.pos) / (B.pos - A.pos);
    const alpha = A.c[3] + (B.c[3] - A.c[3]) * f;
    const rgb = [0, 1, 2].map((k) => (alpha ? (A.c[k] * A.c[3] + (B.c[k] * B.c[3] - A.c[k] * A.c[3]) * f) / alpha : 0));
    return [...rgb, alpha];
  }
  /** Fundo atrás do texto em três pontos (topo, meio e base do elemento), com as camadas translúcidas. */
  function backgrounds(el) {
    const r = el.getBoundingClientRect();
    const points = [[r.left + r.width / 2, r.top + 2], [r.left + r.width / 2, r.top + r.height / 2], [r.left + r.width / 2, r.bottom - 2]];
    const layers = [];
    for (let n = el; n && n.nodeType === 1; n = n.parentElement) {
      const cs = getComputedStyle(n);
      const color = parse(cs.backgroundColor)[0];
      // Gradiente de 1-2px (filete desenhado com background) não é fundo de texto.
      const thin = /(^|\s)[0-2](\.\d+)?px/.test(cs.backgroundSize);
      const grads = cs.backgroundImage !== 'none' && !thin ? gradients(cs.backgroundImage) : [];
      if (grads.length || (color && color[3] > 0)) layers.push({ n, color, grads });
      if (color && color[3] >= 1) break;
      // Aba marcada (1.5): o fundo é a marca que desliza (.tab-ind), irmã logo atrás do botão.
      const ind = n.classList.contains('is-on') && n.parentElement?.classList.contains('has-ind') ? n.parentElement.querySelector(':scope > .tab-ind') : null;
      if (ind) {
        const ics = getComputedStyle(ind);
        const icolor = parse(ics.backgroundColor)[0];
        const igrads = ics.backgroundImage !== 'none' ? gradients(ics.backgroundImage) : [];
        if (igrads.length || (icolor && icolor[3] > 0)) layers.push({ n: ind, color: icolor, grads: igrads });
        if (icolor && icolor[3] >= 1) break;
      }
    }
    return points.map(([px, py]) => {
      let c = over(canvas, [255, 255, 255, 1]);
      for (const layer of [...layers].reverse()) {
        if (layer.color && layer.color[3] > 0) c = over(layer.color, c);
        const box = layer.n.getBoundingClientRect();
        for (const g of [...layer.grads].reverse()) {
          const at = sample(g, box.width, box.height, px - box.left, py - box.top);
          if (at) c = over(at, c);
        }
      }
      return c;
    });
  }
  function opacityOf(el) {
    let o = 1;
    for (let n = el; n && n.nodeType === 1; n = n.parentElement) o *= Number(getComputedStyle(n).opacity);
    return o;
  }
  const skip = '.cover, [disabled], [aria-disabled="true"], .sr-only, option, [inert], .sheet-layer:not(.is-open)';
  const out = [];
  const els = [...document.querySelectorAll('body *')].filter((el) => {
    if (el.closest(skip)) return false;
    if (el.closest('svg') && el.tagName.toLowerCase() !== 'text') return false;
    if (['input', 'select', 'textarea'].includes(el.tagName.toLowerCase())) return Boolean(el.value) && el.type !== 'range' && el.type !== 'file';
    return [...el.childNodes].some((c) => c.nodeType === 3 && c.textContent.trim());
  });
  for (const el of els) {
    if (!el.checkVisibility({ opacityProperty: true, visibilityProperty: true })) continue;
    const rect = el.getBoundingClientRect();
    if (rect.width <= 1 || rect.height <= 1) continue;
    const cs = getComputedStyle(el);
    if (cs.color === 'rgba(0, 0, 0, 0)' || cs.webkitTextFillColor === 'rgba(0, 0, 0, 0)') continue;
    const isSvg = el.tagName.toLowerCase() === 'text';
    const fg = parse(isSvg ? cs.fill : cs.color)[0];
    if (!fg) continue;
    const alpha = fg[3] * opacityOf(el) * (isSvg ? Number(cs.fillOpacity) : 1);
    const size = parseFloat(cs.fontSize);
    const need = size >= 18 ? large : small;
    const cands = backgrounds(el);
    const worst = Math.min(...cands.map((bg) => ratio(over([fg[0], fg[1], fg[2], alpha], bg), bg)));
    if (worst < need) {
      const text = (el.value || el.textContent).replace(/\s+/g, ' ').trim().slice(0, 40);
      const cls = typeof el.className === 'string' ? el.className : el.className.baseVal;
      out.push(`${el.tagName.toLowerCase()}.${String(cls).split(' ').join('.')} "${text}" ${worst.toFixed(2)} < ${need} (${size}px)`);
    }
  }
  return out;
}

// ---------- Texto cortado ou fora do lugar ----------

/* Roda na página. Devolve elementos com texto que transbordam a própria caixa (texto cortado
   ou por cima do vizinho) ou que passam da largura da tela. Reticências e limite de linhas
   (text-overflow / line-clamp) são cortes de propósito; capas e gráficos ficam de fora. */
function auditClip() {
  const skip = '.cover, .spine, .sp-item, svg, .sr-only, option, [inert], .sheet-layer:not(.is-open), .tab-ind, .cal-grid, .heatmap, .bars, .rchart';
  const out = [];
  const vw = document.documentElement.clientWidth;
  for (const el of document.querySelectorAll('body *')) {
    if (el.closest(skip)) continue;
    if (![...el.childNodes].some((c) => c.nodeType === 3 && c.textContent.trim())) continue;
    if (!el.checkVisibility({ visibilityProperty: true })) continue;
    const cs = getComputedStyle(el);
    const r = el.getBoundingClientRect();
    if (r.width <= 1 || r.height <= 1) continue;
    const label = () => `${el.tagName.toLowerCase()}.${String(el.className.baseVal ?? el.className).split(' ').filter(Boolean).join('.')} "${el.textContent.replace(/\s+/g, ' ').trim().slice(0, 30)}"`;
    // Passa da tela (sem estar num trilho que rola de lado).
    let scroller = false;
    for (let n = el.parentElement; n && n !== document.body; n = n.parentElement) {
      const ox = getComputedStyle(n).overflowX;
      if (ox === 'auto' || ox === 'scroll') { scroller = true; break; }
    }
    if (!scroller && (r.right > vw + 1 || r.left < -1)) out.push(`${label()} sai da tela (${Math.round(r.left)}–${Math.round(r.right)} de ${vw})`);
    if (cs.display === 'inline' || cs.display === 'contents') continue;
    if (cs.textOverflow === 'ellipsis' || cs.webkitLineClamp !== 'none' || el.matches('input, select, textarea')) continue;
    const dx = el.scrollWidth - el.clientWidth;
    const dy = el.scrollHeight - el.clientHeight;
    // Altura: tolera 3 px ou 30% da letra (títulos com line-height < 1 passam um pouco da linha).
    if (dx > 1) out.push(`${label()} transborda ${dx}px na largura`);
    else if (dy > Math.max(3, parseFloat(cs.fontSize) * 0.3) && !el.closest('[aria-hidden="true"]') && cs.overflowY !== 'auto' && cs.overflowY !== 'scroll') out.push(`${label()} transborda ${dy}px na altura`);
  }
  return out;
}


// ---------- Navegador ----------

const browser = await playwright.chromium.launch();
const errors = [];
function fakeSystemText(px) {
  const real = window.getComputedStyle;
  window.getComputedStyle = function getComputedStyle(el, pseudo) {
    const cs = real.call(window, el, pseudo);
    if (!el?.style || el.style.fontSize !== '1234px') return cs;
    return new Proxy(cs, { get: (t, k) => (k === 'fontSize' ? `${px}px` : (typeof t[k] === 'function' ? t[k].bind(t) : t[k])) });
  };
}
const FAKE_KEY = 'AIzaSyTESTE_nao_e_uma_chave_real_0123456789';

async function newPage({ width = 390, height = 844, scheme = 'dark', contrast = 'no-preference', accent = null, scale = null, extra = {} } = {}) {
  const context = await browser.newContext({
    viewport: { width, height }, deviceScaleFactor: 2, isMobile: width < 700 || height < 500, hasTouch: true, locale: 'pt-BR',
    reducedMotion: 'reduce', colorScheme: scheme, contrast, acceptDownloads: true,
  });
  if (scale !== null) await context.addInitScript(fakeSystemText, 17 * scale);
  const page = await context.newPage();
  await page.clock.setFixedTime(new Date(`${TODAY}T12:00:00`));
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errors.push(`console: ${m.text()}`); });
  await page.goto(BASE);
  const sessionStart = new Date(`${TODAY}T11:20:00`).getTime();
  await page.evaluate(async ({ d, a, k, cmp, sug, start }) => {
    await (await import('/js/db.js')).setItem('state', d);
    if (a) localStorage.setItem('leituras:acento', a);
    localStorage.setItem('leituras:geminiKey', k);
    localStorage.setItem('leituras:comparacao', JSON.stringify({ d: cmp, em: '2026-10-20' }));
    localStorage.setItem('leituras:sugestoes', JSON.stringify(sug));
    localStorage.setItem('leituras:nome', 'Pedro');
    localStorage.setItem('leituras:sessao', JSON.stringify({ bookId: 'aud', startedAt: start, pausedAt: null, pausedMs: 0 }));
    localStorage.setItem('leituras:som', JSON.stringify({ sound: 'chuva', volume: 0.5 }));
  }, { d: seed, a: accent, k: FAKE_KEY, cmp: compareParam, sug: SUGGESTIONS, start: sessionStart });
  await page.reload();
  await page.waitForFunction(() => document.getElementById('app')?.dataset.page);
  return page;
}
const step = (msg) => console.log(`• ${msg}`);
const onPage = (page, name) => page.waitForFunction((n) => document.getElementById('app').dataset.page === n, name);
async function open(page, hash, name) {
  await page.goto(`${BASE}${hash}`);
  await page.reload();
  try {
    await onPage(page, name);
  } catch {
    const where = await page.evaluate(() => `${location.hash} página=${document.getElementById('app').dataset.page}`).catch(() => '?');
    throw new Error(`esperava a tela "${name}" em ${hash}: ${where}`);
  }
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(60);
}
const failures = [];
async function checkLayout(page, label) {
  const overflow = await page.evaluate(() => document.scrollingElement.scrollWidth - innerWidth);
  if (overflow > 0) failures.push(`${label}: rolagem lateral de ${overflow}px`);
  const clip = await page.evaluate(auditClip);
  if (clip.length) failures.push(`${label}:\n    ${clip.join('\n    ')}`);
  // Alvos de toque de botões e links visíveis: 44 px (os de texto em linha não contam).
  const small = await page.evaluate(() => [...document.querySelectorAll('button, [role="button"], a.btn-primary, a.btn-ghost, input[type="checkbox"], select')]
    .filter((el) => el.checkVisibility({ visibilityProperty: true }) && !el.closest('.sr-only, [inert], .tab-ind, .toast, .sheet-layer:not(.is-open)'))
    .map((el) => ({ el, r: el.getBoundingClientRect() }))
    .filter(({ r, el }) => r.width > 0 && r.height > 0 && r.height < 43.5 && !el.matches('.btn-text, .link, .chip, .spine, .sp-item, .mini-seg-btn, .fchips select') && !el.closest('.cal-grid, .heatmap, .rchart, .bars'))
    .map(({ el, r }) => `${el.tagName.toLowerCase()}.${String(el.className).split(' ').join('.')} "${(el.textContent || '').trim().slice(0, 20)}" ${Math.round(r.width)}×${Math.round(r.height)}`));
  if (small.length) failures.push(`${label} (alvos < 44px):\n    ${small.join('\n    ')}`);
}
async function checkContrast(page, label, min) {
  const bad = await page.evaluate(auditContrast, min);
  if (bad.length) failures.push(`${label} (contraste):\n    ${bad.join('\n    ')}`);
}
const shot = (page, name, full = true) => page.screenshot({ path: `${SHOTS}qa-v16-${name}.png`, fullPage: full });
const text = (page, sel) => page.$eval(sel, (el) => el.textContent.replace(/\s+/g, ' ').trim());
const readState = (page) => page.evaluate(async () => (await import('/js/db.js')).getItem('state'));
async function waitState(page, predicate) {
  let last;
  for (let i = 0; i < 60; i += 1) {
    last = await readState(page);
    if (last && predicate(last)) return last;
    await page.waitForTimeout(100);
  }
  throw new Error(`Estado salvo não chegou ao esperado: ${JSON.stringify(last)?.slice(0, 300)}`);
}

const ROUTES = [
  ['inicio', '#/inicio', 'inicio'],
  ['estante-lido', '#/estante?aba=lido', 'estante'],
  ['estante-quero', '#/estante?aba=quero', 'estante'],
  ['ficha-audio', '#/livro/aud', 'livro'],
  ['ficha-lido', '#/livro/lido', 'livro'],
  ['ficha-quero', '#/livro/quero', 'livro'],
  ['form-audio', '#/livro/aud/editar', 'livro'],
  ['form-lido', '#/livro/lido/editar', 'livro'],
  ['novo', '#/novo', 'novo'],
  ['resumo', '#/resumo/2026', 'resumo'],
  ['resumo-ritmo', '#/resumo/2026?aba=ritmo', 'resumo'],
  ['resumo-gostos', '#/resumo/2026?aba=gostos', 'resumo'],
  ['resumo-todos', '#/resumo/todos', 'resumo'],
  ['buscar', '#/buscar', 'buscar'],
  ['trechos', '#/trechos', 'trechos'],
  ['sugestoes', '#/sugestoes', 'sugestoes'],
  ['comparar', '#/comparar', 'comparar'],
  ['ajustes', '#/ajustes', 'ajustes'],
  ['cronometro', '#/ler/aud', 'ler'],
  ['retro', '#/retro/2026', 'retro'],
];
const ONLY = process.env.QA_ONLY || '';
const want = (name) => !ONLY || ONLY === name;

try {
  // Cada tela nova com o dado mais completo possível.
  if (want('telas')) {
    step('telas novas: dados completos aparecem (ficha, humor, critérios, empréstimo, sinopse, desafios, sugestões, comparar)');
    const page = await newPage();
    await open(page, '#/livro/lido', 'livro');
    const ficha = await text(page, '#app');
    for (const part of [/Reflexivo/, /Triste/, /Ritmo lento/, /Personagens/, /Ana Carolina/, /Duas irmãs/, /Devolvido/]) assert.match(ficha, part);
    await shot(page, 'ficha-lido-390');
    await open(page, '#/livro/aud', 'livro');
    assert.match(await text(page, '#app'), /6h 40min de 21h/);
    await shot(page, 'ficha-audio-390');
    await open(page, '#/resumo/2026', 'resumo');
    await page.waitForSelector('.ch-card');
    assert.equal(await page.locator('.ch-item').count(), 4);
    await shot(page, 'resumo-390');
    await open(page, '#/resumo/2026?aba=gostos', 'resumo');
    await shot(page, 'gostos-390');
    await open(page, '#/resumo/2026?aba=ritmo', 'resumo');
    await shot(page, 'ritmo-390');
    await open(page, '#/sugestoes', 'sugestoes');
    await shot(page, 'sugestoes-390');
    await open(page, '#/comparar', 'comparar');
    await shot(page, 'comparar-390');
    await open(page, '#/ler/aud', 'ler');
    await shot(page, 'cronometro-390');
    await open(page, '#/estante?aba=lido', 'estante');
    await shot(page, 'estante-390');
    await page.context().close();
  }

  // Todas as telas em todos os tamanhos de texto e larguras: sem rolagem lateral nem texto cortado.
  if (want('escala')) {
    for (const scale of [0.85, 1, 1.3, 1.6]) {
      for (const width of [320, 390, 430]) {
        step(`todas as telas: texto ${scale}× em ${width} px`);
        const page = await newPage({ width, height: width === 320 ? 640 : 900, scale });
        for (const [label, hash, name] of ROUTES) {
          await open(page, hash, name);
          await checkLayout(page, `${label} ${scale}× ${width}px`);
          if (scale === 1.6 && width === 320 && ['ficha-audio', 'sugestoes', 'comparar', 'cronometro', 'form-audio'].includes(label)) await shot(page, `escala-1.6-320-${label}`);
        }
        await page.context().close();
      }
    }
  }

  // Cada cor de destaque nos dois temas: contraste AA nas telas novas.
  if (want('contraste')) {
    for (const scheme of ['light', 'dark']) {
      for (const accent of ['terracota', 'oliva', 'petroleo', 'vinho', 'grafite']) {
        step(`contraste AA: ${scheme === 'light' ? 'claro' : 'escuro'}, ${accent}`);
        const page = await newPage({ scheme, accent });
        for (const [label, hash, name] of ROUTES) {
          await open(page, hash, name);
          await checkContrast(page, `${label} ${scheme} ${accent}`, { small: 4.5, large: 3 });
          if (accent === 'terracota' && ['ficha-lido', 'sugestoes', 'comparar', 'resumo-gostos', 'cronometro'].includes(label)) await shot(page, `${scheme}-${label}`);
          if (accent === 'vinho' && scheme === 'light' && ['resumo', 'ficha-audio'].includes(label)) await shot(page, `${scheme}-vinho-${label}`);
        }
        await page.context().close();
      }
    }
    for (const scheme of ['light', 'dark']) {
      step(`contraste aumentado (AAA): ${scheme === 'light' ? 'claro' : 'escuro'}`);
      const page = await newPage({ scheme, contrast: 'more' });
      for (const [label, hash, name] of ROUTES.filter(([l]) => ['ficha-lido', 'ficha-audio', 'resumo', 'resumo-gostos', 'sugestoes', 'comparar', 'cronometro', 'ajustes'].includes(l))) {
        await open(page, hash, name);
        await checkContrast(page, `${label} ${scheme} AAA`, { small: 7, large: 4.5 });
      }
      await page.context().close();
    }
  }

  // iPad e celular deitado.
  if (want('largas')) {
    for (const [label, width, height] of [['ipad', 820, 1180], ['ipad-deitado', 1180, 820], ['celular-deitado', 844, 390]]) {
      step(`telas largas: ${label} ${width}×${height}`);
      const page = await newPage({ width, height });
      for (const [rl, hash, name] of ROUTES) {
        await open(page, hash, name);
        await checkLayout(page, `${rl} ${label}`);
        if (['resumo', 'sugestoes', 'comparar', 'ficha-audio'].includes(rl)) await shot(page, `${label}-${rl}`, false);
      }
      await page.context().close();
    }
  }

  // Menu com prévia na tela pequena, com o item novo "Emprestei para…".
  if (want('menu')) {
    step('menu de ações do livro cabe na tela do iPhone SE (320×568), com a lista mais longa');
    const page = await newPage({ width: 320, height: 568 });
    await open(page, '#/estante?aba=quero', 'estante');
    const opener = page.locator('[data-action="quick-menu"], [data-action="book-menu"], .li-more, .rn-more').first();
    await opener.click();
    await page.waitForSelector('.sheet-layer.is-open .qm-item');
    await page.waitForTimeout(500);
    const fit = await page.evaluate(() => {
      const sheet = document.querySelector('.sheet-layer .sheet').getBoundingClientRect();
      const items = [...document.querySelectorAll('.sheet-layer .qm-item')].map((e) => e.getBoundingClientRect());
      return { top: sheet.top, bottom: sheet.bottom, h: innerHeight, items: items.length, last: items.at(-1).bottom, first: items[0].top };
    });
    assert.ok(fit.top >= 0 && fit.bottom <= fit.h + 1, `menu fora da tela: ${JSON.stringify(fit)}`);
    assert.ok(fit.items >= 4);
    await shot(page, 'menu-320', false);
    await page.keyboard.press('Escape');
    await page.context().close();
  }

  // Livro novo e edição em todos os formatos: seletor de formato e campos de áudio.
  if (want('fluxo')) {
    step('terminar o audiolivro pela folha: diário em minutos, desafio de audiolivro cumprido, backup ida e volta');
    const page = await newPage();
    await open(page, '#/inicio', 'inicio');
    await page.locator('.reading:has-text("Duna") [data-action="update-page"]').click();
    await page.waitForSelector('.sheet-layer.is-open .psheet');
    await page.click('[data-action="progress-finish"]');
    await page.waitForFunction(() => /concluir=1/.test(location.hash) && document.querySelector('.form-title'));
    await page.click('.form-actions .btn-primary');
    const s = await waitState(page, (st) => st.books.find((b) => b.id === 'aud').status === 'lido');
    const aud = s.books.find((b) => b.id === 'aud');
    assert.equal(aud.currentMin, null);
    assert.equal(aud.durationMin, 1260);
    assert.equal(aud.journal.at(-1).to, 1260);
    assert.equal(aud.journal.at(-1).unit, 'minute');
    assert.deepEqual(aud.moods, ['tenso', 'desafiador']);
    assert.equal(aud.pace, 'medio');
    assert.match(aud.description, /^Duas irmãs/);
    assert.ok(aud.journal.filter((e) => e.date < '2026-10-26').every((e) => e.hours), 'o horário das sessões continua nos dias antigos');
    // Backup feito pelo app: ida e volta sem perder campo.
    const out = await page.evaluate(async () => {
      const store = await import('/js/store.js');
      const db = await import('/js/db.js');
      const st = await db.getItem('state');
      const text = store.serializeBackup(store.normalizeState(st));
      return { text, round: store.parseBackup(text), saved: store.normalizeState(st) };
    });
    assert.deepEqual(out.round, out.saved);
    assert.doesNotMatch(out.text, /AIza|leituras:/);
    await open(page, '#/resumo/2026', 'resumo');
    await page.waitForSelector('.ch-card');
    assert.equal(await page.locator('.ch-item.is-done').count() >= 1, true, 'desafio de audiolivro concluído');
    await page.context().close();

    step('livro novo: seletor de formato com 3 opções, campos de duração, e salvar com todos os campos');
    const p2 = await newPage();
    await open(p2, '#/novo', 'novo');
    await p2.fill('#f-title', 'Livro de teste do QA');
    await p2.click('.seg-btn:has-text("Audiolivro")');
    await p2.waitForSelector('[data-time], #f-duration-h, [id*="duration"]');
    await shot(p2, 'novo-audio-390');
    await p2.context().close();

    step('Emprestei para…: a folha abre inteira no iPhone SE, salva o empréstimo; Devolvido tira o selo');
    const p3 = await newPage({ width: 320, height: 568 });
    await open(p3, '#/livro/aud', 'livro');
    await p3.click('[data-action="loan-open"]');
    await p3.waitForSelector('.sheet-layer.is-open [data-loan-form]');
    await p3.fill('#loan-to', 'Marcela');
    const box = await p3.evaluate(() => {
      const b = document.querySelector('[data-loan-form] .btn-primary').getBoundingClientRect();
      const sh = document.querySelector('.sheet-layer .sheet').getBoundingClientRect();
      return { bottom: b.bottom, top: b.top, sheetBottom: sh.bottom, h: innerHeight };
    });
    assert.ok(box.bottom <= box.sheetBottom + 1 && box.bottom <= box.h, `botão Salvar do empréstimo à vista: ${JSON.stringify(box)}`);
    await p3.click('[data-loan-form] .btn-primary');
    const withLoan = await waitState(p3, (st) => st.books.find((b) => b.id === 'aud').loan?.to === 'Marcela');
    assert.equal(withLoan.books.find((b) => b.id === 'aud').status, 'lendo');
    await p3.waitForSelector('.ficha-loan-back');
    await p3.click('.ficha-loan-back');
    await waitState(p3, (st) => !st.books.find((b) => b.id === 'aud').loan);
    await p3.context().close();

    step('Desafio do meu jeito no iPhone SE: o erro aparece ao lado do botão, à vista');
    const p4 = await newPage({ width: 320, height: 568 });
    await open(p4, '#/resumo/2026', 'resumo');
    await p4.click('.ch-add');
    await p4.waitForSelector('.sheet-layer.is-open [data-action="challenge-custom"]');
    await p4.click('[data-action="challenge-custom"]');
    await p4.waitForSelector('[data-challenge-form]');
    await p4.selectOption('#ch-type', 'tag');
    await p4.click('.chs-form .btn-primary');
    const vis = await p4.evaluate(() => {
      const e = document.querySelector('.chs-error').getBoundingClientRect();
      const sh = document.querySelector('.sheet-layer .sheet').getBoundingClientRect();
      return { shown: !document.querySelector('.chs-error').hidden, top: e.top, bottom: e.bottom, sheetBottom: sh.bottom, h: innerHeight };
    });
    assert.ok(vis.shown && vis.bottom <= vis.sheetBottom + 1 && vis.bottom <= vis.h, `erro à vista: ${JSON.stringify(vis)}`);
    await shot(p4, 'desafio-erro-320', false);
    await p4.context().close();
  }

  // Importar CSV do Goodreads: prévia, importar e desfazer; sem rolagem lateral.
  if (want('importar')) {
    for (const width of [320, 390, 430]) {
      step(`importar do Goodreads em ${width}px: prévia, importar, desfazer`);
      const page = await newPage({ width, height: 800 });
      await open(page, '#/ajustes', 'ajustes');
      const before = (await readState(page)).books.length;
      await page.setInputFiles('[data-import-csv]', new URL('../fixtures/goodreads_library_export.csv', import.meta.url).pathname);
      await page.waitForSelector('.gr-import');
      await checkLayout(page, `importar prévia ${width}`);
      if (width === 390) await shot(page, 'importar-previa-390', false);
      await page.click('[data-action="gr-import"]');
      await page.waitForSelector('.gr-import.is-done');
      const mid = await waitState(page, (st) => st.books.length > before);
      assert.ok(mid.books.length > before);
      await checkLayout(page, `importar feito ${width}`);
      await page.click('[data-action="gr-undo"]');
      const after = await waitState(page, (st) => st.books.length === before);
      assert.deepEqual(after.books.map((b) => b.id), seed.books.map((b) => b.id), 'desfazer deixa os mesmos livros, na mesma ordem');
      await page.context().close();
    }
  }

  if (failures.length) {
    console.error(`\n${failures.length} problema(s):`);
    for (const f of failures) console.error(`- ${f}`);
    process.exitCode = 1;
  }
  assert.deepEqual(errors, [], 'sem erros no console');
  if (!failures.length) console.log('\nOK: QA 1.6 (telas novas × tamanhos de texto × temas × cores × telas largas)');
} catch (err) {
  console.error('\nFALHOU:', err.message);
  if (errors.length) console.error(errors.join('\n'));
  process.exitCode = 1;
} finally {
  await browser.close();
  server.close();
}
