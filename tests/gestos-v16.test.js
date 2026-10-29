// Gestos nativos da 1.6: as contas (sem DOM) do voltar deslizando da borda, da barra de baixo
// que encolhe, das folhas em dois tamanhos e da posição do menu com prévia.
// O resto (toque de verdade, telas, capturas) está em tests/e2e/v16-gestos.mjs.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  EDGE_PX, dragHeight, edgeBackCommit, edgeProgress, isEdgeStart, lockAxis, navShrinkStep,
  placeContextMenu, settleDuration, sheetDetents, snapDetent, velocityOf,
} from '../app/js/gestures.js';

test('voltar: só começa na faixa da borda esquerda', () => {
  assert.equal(EDGE_PX, 24);
  assert.equal(isEdgeStart(0), true);
  assert.equal(isEdgeStart(12), true);
  assert.equal(isEdgeStart(24), true);
  assert.equal(isEdgeStart(25), false);
  assert.equal(isEdgeStart(195), false, 'meio da tela não volta');
  assert.equal(isEdgeStart(-1), false);
  assert.equal(isEdgeStart(NaN), false);
  assert.equal(isEdgeStart(30, 32), true);
});

test('direção do gesto: espera alguns px; diagonal é rolagem', () => {
  assert.equal(lockAxis(3, 2), null);
  assert.equal(lockAxis(7, -7), null);
  assert.equal(lockAxis(12, 3), 'x');
  assert.equal(lockAxis(-12, 3), 'x', 'para a esquerda também trava na horizontal (quem chama recusa)');
  assert.equal(lockAxis(3, 12), 'y');
  assert.equal(lockAxis(10, 10), 'y', 'diagonal: a página rola');
  assert.equal(lockAxis(12, 9), 'x');
  assert.equal(lockAxis(11, 10), 'y');
});

test('velocidade: últimos ~100 ms das amostras', () => {
  assert.equal(velocityOf([]), 0);
  assert.equal(velocityOf([{ v: 0, t: 0 }]), 0);
  assert.equal(velocityOf([{ v: 0, t: 0 }, { v: 100, t: 100 }]), 1);
  // Amostras antigas (antes de 100 ms) não contam: o dedo parou no fim.
  const stopped = [{ v: 0, t: 0 }, { v: 200, t: 100 }, { v: 200, t: 300 }, { v: 201, t: 350 }];
  assert.ok(Math.abs(velocityOf(stopped)) < 0.05);
  assert.equal(velocityOf([{ v: 10, t: 5 }, { v: 10, t: 5 }]), 0, 'tempo zero');
  assert.equal(velocityOf([{ v: 300, t: 0 }, { v: 240, t: 60 }]), -1, 'voltando');
});

test('voltar: soltar passa de 35% ou gesto rápido; jogar de volta cancela', () => {
  const width = 390;
  assert.equal(edgeBackCommit({ dx: 120, width, velocity: 0 }), false, '31%: volta ao lugar');
  assert.equal(edgeBackCommit({ dx: 140, width, velocity: 0 }), true, '36%: navega');
  assert.equal(edgeBackCommit({ dx: 60, width, velocity: 0.9 }), true, 'rápido para a direita');
  assert.equal(edgeBackCommit({ dx: 20, width, velocity: 2 }), false, 'rápido, mas quase sem andar');
  assert.equal(edgeBackCommit({ dx: 300, width, velocity: -0.6 }), false, 'jogou de volta');
  assert.equal(edgeBackCommit({ dx: 0, width, velocity: 3 }), false);
  assert.equal(edgeBackCommit({ dx: -40, width, velocity: 0 }), false);
  assert.equal(edgeBackCommit({ dx: 200, width: 0, velocity: 0 }), false);
  assert.equal(edgeBackCommit({ dx: 112, width: 320 }), false, '320px: 35% = 112');
  assert.equal(edgeBackCommit({ dx: 113, width: 320 }), true);
});

test('voltar: progresso do fundo e duração do fim da animação', () => {
  assert.equal(edgeProgress(0, 390), 0);
  assert.equal(edgeProgress(195, 390), 0.5);
  assert.equal(edgeProgress(500, 390), 1);
  assert.equal(edgeProgress(-20, 390), 0);
  assert.equal(edgeProgress(10, 0), 0);
  assert.equal(settleDuration(390, 0), 320, 'devagar: no máximo 320 ms');
  assert.equal(settleDuration(10, 0), 140, 'pouco caminho: no mínimo 140 ms');
  assert.equal(settleDuration(300, 2), 150, 'dedo rápido: termina rápido');
  assert.equal(settleDuration(-300, -2), 150);
  assert.equal(settleDuration(390, 0, { max: 260 }), 260);
});

test('barra de baixo: encolhe rolando para baixo, volta rolando para cima, no alto e no fim', () => {
  const maxY = 2000;
  let s = { compact: false, anchor: 0 };
  const go = (y) => { s = navShrinkStep(s, { y, maxY }); return s.compact; };
  assert.equal(go(50), false, 'no começo da página fica inteira');
  assert.equal(go(90), false);
  assert.equal(go(130), true, 'passou do começo rolando para baixo');
  assert.equal(go(400), true);
  assert.equal(go(392), true, 'um tremido para cima não abre');
  assert.equal(go(388), true);
  assert.equal(go(380), false, 'subiu mais de 14px desde o ponto mais baixo');
  assert.equal(go(375), false);
  assert.equal(go(384), false, 'tremido para baixo não fecha');
  assert.equal(go(390), true, 'desceu mais de 14px desde o ponto mais alto');
  assert.equal(go(1997), false, 'chegou ao fim da página');
  assert.equal(go(1999), false);
  assert.equal(go(1500), false, 'subindo: continua inteira');
  assert.equal(go(1530), true);
  assert.equal(go(40), false, 'voltou ao alto');
  // Página curta (sem rolagem) ou estado vazio.
  assert.equal(navShrinkStep(null, { y: 300, maxY: 0 }).compact, false);
  assert.equal(navShrinkStep({ compact: false, anchor: 100 }, { y: 150, maxY: 180 }).compact, false, 'página que mal rola não encolhe');
  assert.deepEqual(navShrinkStep({ compact: true, anchor: 500 }, { y: NaN, maxY }), { compact: true, anchor: 500 });
});

test('folhas: dois tamanhos só quando o conteúdo não cabe na média', () => {
  assert.equal(sheetDetents({ natural: 415, viewport: 844 }), null, 'Registrar leitura cabe na média do 390×844');
  assert.deepEqual(sheetDetents({ natural: 420, viewport: 568 }), [312, 420], '320×568: média e grande = conteúdo');
  assert.deepEqual(sheetDetents({ natural: 1400, viewport: 844 }), [464, 776], 'conteúdo longo: 55% e 92%');
  assert.equal(sheetDetents({ natural: 480, viewport: 844 }), null, 'quase cabe (folga de 24px)');
  assert.equal(sheetDetents({ natural: 330, viewport: 568 }), null, 'grande quase igual à média: um tamanho só');
  assert.equal(sheetDetents({ natural: 0, viewport: 844 }), null);
  assert.equal(sheetDetents({ natural: 500, viewport: 0 }), null);
});

test('folhas: puxar acima da grande tem resistência', () => {
  assert.equal(dragHeight(400, [312, 420]), 400);
  assert.equal(dragHeight(420, [312, 420]), 420);
  assert.equal(dragHeight(450, [312, 420]), 429);
  assert.equal(dragHeight(900, [312, 420]), 456, 'no máximo 36px a mais');
});

test('folhas: onde a folha para ao soltar', () => {
  const detents = [312, 520];
  // Abaixo da média: fecha se desceu bastante ou rápido.
  assert.equal(snapDetent({ height: 300, velocity: 0, detents }), 312, 'desceu pouco: volta à média');
  assert.equal(snapDetent({ height: 180, velocity: 0, detents }), 0, 'desceu mais de 30%: fecha');
  assert.equal(snapDetent({ height: 270, velocity: 0.9, detents }), 0, 'rápido para baixo: fecha');
  assert.equal(snapDetent({ height: 300, velocity: 0.9, detents }), 312, 'rápido mas só 12px: fica');
  // Entre as duas: a mais perto, ou a próxima na direção de um gesto rápido.
  assert.equal(snapDetent({ height: 400, velocity: 0, detents }), 312);
  assert.equal(snapDetent({ height: 430, velocity: 0, detents }), 520);
  assert.equal(snapDetent({ height: 340, velocity: -0.8, detents }), 520, 'rápido para cima: grande');
  assert.equal(snapDetent({ height: 500, velocity: 0.8, detents }), 312, 'rápido para baixo: média');
  assert.equal(snapDetent({ height: 560, velocity: 0, detents }), 520, 'passou da grande: volta a ela');
  assert.equal(snapDetent({ height: 560, velocity: -2, detents }), 520);
  // Folha de um tamanho só (o comportamento de antes: puxar 220px fecha, 20px não).
  assert.equal(snapDetent({ height: 415 - 220, velocity: 2.3, detents: [415] }), 0);
  assert.equal(snapDetent({ height: 415 - 20, velocity: 0.2, detents: [415] }), 415);
  assert.equal(snapDetent({ height: 415 - 125, velocity: 0, detents: [415] }), 0, 'mais de 120px fecha');
  assert.equal(snapDetent({ height: 415 - 100, velocity: 0, detents: [415] }), 415);
});

test('menu com prévia: capa perto de onde estava, menu embaixo (ou em cima) e sempre na tela', () => {
  const view = { w: 390, h: 844, top: 47, bottom: 34 };
  const preview = { w: 170, h: 255 };
  const menu = { w: 256, h: 290 };
  // Cartão no alto, à esquerda: menu embaixo, alinhado à esquerda da capa.
  const top = placeContextMenu({ src: { left: 32, top: 140, width: 60, height: 90 }, preview, menu, view });
  assert.equal(top.placement, 'below');
  assert.equal(top.scale, 1);
  assert.equal(top.preview.x, 12);
  assert.equal(top.preview.y, 59, 'não passa da área segura do topo (47 + 12)');
  assert.equal(top.menu.x, 12);
  assert.equal(top.menu.y, top.preview.y + 255 + 12);
  // Item embaixo, à direita: menu em cima, alinhado pela direita da capa.
  const low = placeContextMenu({ src: { left: 300, top: 700, width: 60, height: 90 }, preview, menu, view });
  assert.equal(low.placement, 'above');
  assert.ok(low.preview.y + low.preview.h <= 844 - 34 - 12, 'capa acima da área segura de baixo');
  assert.equal(low.menu.y + low.menu.h + 12, low.preview.y, 'menu logo acima da capa');
  assert.equal(low.menu.x + low.menu.w, low.preview.x + low.preview.w, 'alinhado pela direita');
  assert.ok(low.menu.x >= 12 && low.menu.x + low.menu.w <= 378);
  // No meio: a capa fica centrada no item (não pula para o alto).
  const mid = placeContextMenu({ src: { left: 150, top: 250, width: 90, height: 135 }, preview, menu, view });
  assert.equal(mid.placement, 'below');
  assert.equal(mid.preview.y, Math.round((250 + 67.5 - 127.5) * 10) / 10);
  // Tela baixa (320×568): a capa encolhe para caber com o menu.
  const small = placeContextMenu({ src: { left: 20, top: 200, width: 40, height: 60 }, preview, menu: { w: 256, h: 290 }, view: { w: 320, h: 568, top: 20, bottom: 0 } });
  assert.ok(small.scale < 1 && small.scale >= 0.35);
  assert.ok(small.preview.y >= 32 && small.menu.y + small.menu.h <= 568 - 12 + 0.5, JSON.stringify(small));
  assert.ok(small.menu.x + small.menu.w <= 308);
  // Menu enorme: encolhe até o mínimo e o menu rola (altura limitada).
  const huge = placeContextMenu({ src: { left: 20, top: 200, width: 40, height: 60 }, preview, menu: { w: 256, h: 900 }, view: { w: 320, h: 568, top: 0, bottom: 0 } });
  assert.equal(huge.scale, 0.35);
  assert.ok(huge.menu.h < 900 && huge.menu.y + huge.menu.h <= 556.5);
  // Tela estreita: o menu nunca passa da largura.
  const narrow = placeContextMenu({ src: { left: 10, top: 100, width: 30, height: 45 }, preview, menu: { w: 400, h: 200 }, view: { w: 300, h: 600 } });
  assert.equal(narrow.menu.w, 276);
  assert.equal(narrow.menu.x, 12);
});

test('CSS da 1.6: um bloco só no fim, sem color-mix e com "Reduzir movimento"', () => {
  const css = readFileSync(new URL('../app/css/app.css', import.meta.url), 'utf8');
  const start = css.indexOf('/* ===== 1.6 Gestos nativos ===== */');
  assert.ok(start > 0, 'bloco da 1.6');
  const block = css.slice(start);
  assert.doesNotMatch(block.replace(/\/\*[\s\S]*?\*\//g, ''), /color-mix\(/);
  assert.match(block, /@media \(prefers-reduced-motion: reduce\)/);
  assert.match(block, /body\.nav-compact \.nav \{ scale: \.86;/, 'barra compacta só com transform');
  // Botões da barra compacta: 52px × 0,86 ≥ 44px.
  assert.ok(52 * 0.86 >= 44);
  const sw = readFileSync(new URL('../app/sw.js', import.meta.url), 'utf8');
  for (const file of ['gestures.js', 'edge-back.js', 'nav-shrink.js']) assert.match(sw, new RegExp(`'\\./js/${file.replace('.', '\\.')}'`));
});
