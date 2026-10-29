#!/usr/bin/env node
// 1.6: faz o tamanho das letras do app acompanhar o "Tamanho do Texto" do iPhone.
//
// Troca cada `font-size: 15px` de app/css/app.css por `font-size: calc(15px * var(--type-scale, 1))`.
// --type-scale vem do index.html / js/text-scale.js (o tamanho do texto do sistema, ou a escolha
// em Ajustes → Aparência), entre 0,85 e 1,6; sem ele, o fator é 1 e nada muda.
//
//   - Letras de título (28 px ou mais, e os clamp() que chegam lá) usam --type-scale-lg, que
//     cresce só metade (como os títulos grandes do iOS); a barra de baixo usa --type-scale-nav
//     (no máximo 1,2), porque cinco rótulos precisam caber lado a lado.
//   - Não mexe em: texto desenhado em cima de capas e lombadas, gráficos (rótulos de eixo, svg),
//     calendário e mapa de calor (células de tamanho fixo), a retrospectiva (telas de "cinema"
//     no tamanho da tela), nem em valores com var(), em, %, cqw ou palavras (já relativos).
//   - Para deixar uma declaração nova de fora, ponha `/* sem-escala */` logo depois dela, na
//     mesma linha; ou acrescente o seletor em FIXOS abaixo.
//
// É idempotente: valor que já tem --type-scale fica como está. Depois de juntar CSS novo
// (blocos com font-size em px), rode de novo:
//
//   node tools/escala-texto.mjs            # converte app/css/app.css no lugar
//   node tools/escala-texto.mjs --check    # só confere (sai com 1 se falta converter)
//   node tools/escala-texto.mjs outro.css  # outro arquivo

import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

export const SCALE = '--type-scale';
export const SCALE_LG = '--type-scale-lg';
export const SCALE_NAV = '--type-scale-nav';
/** A partir deste tamanho (px) a letra é de título e cresce menos. */
export const LARGE_PX = 28;
export const SKIP_MARK = 'sem-escala';

/** Seletores cujo texto fica fixo (basta uma parte da lista de seletores casar). */
export const FIXOS = [
  /\.cover-(title|author|ini)\b/, // texto desenhado na capa genérica
  /\.sp-[\w-]+/, /\.spine\b/, // lombadas da estante
  /\.cov-ring/, // anel de progresso sobre a capa
  /\.cal-(num|more|wd|cover)\b/, // células do calendário
  /\.hm-/, // mapa de calor
  /\.retro\b/, /\.retro-/, // retrospectiva: telas no tamanho da tela, para compartilhar
  /\.sc-svg/, // texto dentro do gráfico (svg)
  /\.bar-(label|value)\b/, // colunas de 20 px do gráfico de barras
  /\.rchart-(axis|max)\b/, // eixos do gráfico de ritmo
];
/** Seletores da barra de navegação de baixo (fator limitado). */
export const NAV = [/^\.nav\b/];

/** Troca comentários por espaços (mesmo tamanho), para achar regras sem cair dentro deles. */
function mask(css) {
  return css.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '));
}

/** Seletor da regra que contém a posição `at` (texto entre o "{" dela e o fim da regra anterior). */
function selectorAt(masked, at) {
  const open = masked.lastIndexOf('{', at);
  if (open < 0) return '';
  const before = Math.max(masked.lastIndexOf('}', open - 1), masked.lastIndexOf('{', open - 1), masked.lastIndexOf(';', open - 1));
  return masked.slice(before + 1, open).replace(/\s+/g, ' ').trim();
}

function maxPx(value) {
  return Math.max(0, ...[...value.matchAll(/(-?\d*\.?\d+)px/g)].map((m) => Number(m[1])));
}

/** Valor convertido, ou null se fica como está. */
export function scaleValue(value, selector) {
  const raw = value.trim();
  const important = /\s*!important$/i.test(raw) ? ' !important' : '';
  const v = raw.replace(/\s*!important$/i, '');
  if (v.includes(SCALE)) return null; // já convertido
  const parts = selector.split(',').map((s) => s.trim());
  if (parts.some((s) => FIXOS.some((re) => re.test(s)))) return null;
  const plain = /^\d*\.?\d+px$/.test(v);
  // clamp()/min()/max() só com px e vw/vh: o resultado todo é multiplicado.
  const fn = /^(clamp|min|max)\([\d.\s,pxvwhmin+*/()-]+\)$/.test(v) && /px/.test(v) && !/\b(em|rem|%|var)\b/.test(v);
  if (!plain && !fn) return null;
  let factor = SCALE;
  if (parts.every((s) => NAV.some((re) => re.test(s)))) factor = SCALE_NAV;
  else if (maxPx(v) >= LARGE_PX) factor = SCALE_LG;
  return `calc(${v} * var(${factor}, 1))${important}`;
}

/** Converte o CSS todo. Devolve { css, changed } (changed: quantas declarações mudaram). */
export function convertCss(css) {
  const masked = mask(css);
  const re = /(^|[\s;{])font-size\s*:\s*([^;}]+)/g;
  let out = '';
  let last = 0;
  let changed = 0;
  let m;
  while ((m = re.exec(masked))) {
    const valueStart = m.index + m[0].length - m[2].length;
    const valueEnd = m.index + m[0].length;
    // Valor no texto original (o mascarado só tem espaços onde havia comentário).
    const value = css.slice(valueStart, valueEnd);
    if (value.includes('/*')) continue; // comentário no meio do valor: deixa
    const eol = css.indexOf('\n', valueEnd);
    const rest = css.slice(valueEnd, eol < 0 ? undefined : eol);
    if (rest.includes(SKIP_MARK)) continue;
    const next = scaleValue(value, selectorAt(masked, m.index));
    if (next === null) continue;
    const trailing = value.match(/\s*$/)[0];
    out += css.slice(last, valueStart) + next + trailing;
    last = valueEnd;
    changed += 1;
  }
  return { css: out + css.slice(last), changed };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const args = process.argv.slice(2);
  const check = args.includes('--check');
  const file = args.find((a) => !a.startsWith('--')) || fileURLToPath(new URL('../app/css/app.css', import.meta.url));
  const before = readFileSync(file, 'utf8');
  const { css, changed } = convertCss(before);
  if (check) {
    console.log(changed ? `${changed} font-size ainda em px fixo em ${file}` : `${file}: tudo convertido`);
    process.exit(changed ? 1 : 0);
  }
  if (changed) writeFileSync(file, css);
  console.log(`${changed} font-size convertido(s) em ${file}`);
}
