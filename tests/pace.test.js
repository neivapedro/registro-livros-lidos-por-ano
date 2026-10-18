import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  addDays, forecastFinish, formatPace, paceLines, readingPace, remainingAmount, targetPace,
} from '../app/js/pace.js';

const TODAY = '2026-10-16';
const entry = (date, from, to, unit = 'page') => ({ date, from, to, unit, note: '' });
const physical = (extra = {}) => ({
  id: 'p', title: 'Físico', format: 'fisico', status: 'lendo', pages: 300, currentPage: null, startDate: '2026-10-01', journal: [], ...extra,
});
const kindle = (extra = {}) => ({
  id: 'k', title: 'Kindle', format: 'kindle', status: 'lendo', pages: null, currentPercent: null, startDate: '2026-10-01', journal: [], ...extra,
});

test('addDays atravessa meses e anos', () => {
  assert.equal(addDays('2026-10-30', 3), '2026-11-02');
  assert.equal(addDays('2026-12-31', 1), '2027-01-01');
  assert.equal(addDays('2026-03-01', -1), '2026-02-28');
});

test('ritmo pelo diário: média por dia de leitura nos últimos 14 dias', () => {
  const book = physical({
    currentPage: 120,
    journal: [
      entry('2026-09-20', 0, 40), // fora da janela
      entry('2026-10-10', 40, 70),
      entry('2026-10-12', 70, 70), // não avançou: não conta como dia de leitura
      entry('2026-10-15', 70, 120),
    ],
  });
  assert.deepEqual(readingPace(book, TODAY), { perDay: 40, unit: 'page', source: 'journal' });
  // Primeiro dia da janela (hoje - 13) entra.
  const edge = physical({ currentPage: 30, journal: [entry('2026-10-03', 0, 30)] });
  assert.equal(readingPace(edge, TODAY).perDay, 30);
  const out = physical({ currentPage: 30, startDate: '2026-10-01', journal: [entry('2026-10-02', 0, 30)] });
  assert.equal(readingPace(out, TODAY).source, 'start');
});

test('ritmo no Kindle em % e ignora entradas em outra unidade', () => {
  const book = kindle({
    currentPercent: 30,
    journal: [entry('2026-10-14', 10, 20, 'percent'), entry('2026-10-15', 20, 30, 'percent'), entry('2026-10-13', 0, 50, 'page')],
  });
  assert.deepEqual(readingPace(book, TODAY), { perDay: 10, unit: 'percent', source: 'journal' });
});

test('sem diário: posição atual ÷ dias desde o início (contando o primeiro dia)', () => {
  const book = physical({ currentPage: 80, startDate: '2026-10-13' }); // 4 dias
  assert.deepEqual(readingPace(book, TODAY), { perDay: 20, unit: 'page', source: 'start' });
  assert.equal(readingPace(physical({ currentPage: 0 }), TODAY), null);
  assert.equal(readingPace(physical({ currentPage: 50, startDate: null }), TODAY), null);
  assert.equal(readingPace(physical({ currentPage: 50, startDate: '2026-10-20' }), TODAY), null, 'início no futuro');
  // Começou hoje: a página do cadastro é o ponto de partida, não 200 págs. lidas hoje.
  assert.equal(readingPace(physical({ currentPage: 200, startDate: TODAY }), TODAY), null, 'início hoje');
  assert.deepEqual(paceLines(physical({ currentPage: 200, startDate: TODAY }), TODAY), { pace: '', target: '' });
  // Mas com leitura registrada hoje no diário, o ritmo aparece.
  const today = physical({ currentPage: 230, startDate: TODAY, journal: [entry(TODAY, 200, 230)] });
  assert.deepEqual(readingPace(today, TODAY), { perDay: 30, unit: 'page', source: 'journal' });
});

test('quanto falta: físico precisa do total; Kindle usa %', () => {
  assert.equal(remainingAmount(physical({ currentPage: 100 })), 200);
  assert.equal(remainingAmount(physical({ pages: null, currentPage: 100 })), null);
  assert.equal(remainingAmount(kindle({ currentPercent: 35 })), 65);
  // Sem posição informada: usa o fim da última entrada do diário.
  assert.equal(remainingAmount(physical({ journal: [entry('2026-10-15', 0, 90)] })), 210);
});

test('previsão: hoje + falta ÷ ritmo, arredondando para cima', () => {
  const book = physical({ currentPage: 120, journal: [entry('2026-10-15', 92, 120)] }); // 28/dia, faltam 180
  assert.equal(forecastFinish(book, TODAY), '2026-10-23'); // ceil(180/28) = 7
  assert.equal(forecastFinish(physical({ pages: null, currentPage: 120, journal: [entry('2026-10-15', 92, 120)] }), TODAY), null);
  assert.equal(forecastFinish(physical({ currentPage: 300 }), TODAY), null, 'nada falta');
  assert.equal(forecastFinish(physical(), TODAY), null, 'sem ritmo');
  // Ritmo baixíssimo: previsão longe demais não aparece.
  assert.equal(forecastFinish(physical({ pages: 20000, currentPage: 1, startDate: '2020-01-01' }), TODAY), null);
});

test('ritmo necessário para a data alvo (contando hoje)', () => {
  const book = physical({ currentPage: 110, targetDate: '2026-10-25' }); // 10 dias, faltam 190
  assert.deepEqual(targetPace(book, TODAY), { perDay: 19, unit: 'page' });
  assert.deepEqual(targetPace(kindle({ currentPercent: 40, targetDate: TODAY }), TODAY), { perDay: 60, unit: 'percent' });
  assert.equal(targetPace(physical({ targetDate: '2026-10-10' }), TODAY), null, 'data passada');
  assert.equal(targetPace(physical({ pages: null, targetDate: '2026-10-25' }), TODAY), null);
  assert.equal(targetPace(physical({ targetDate: null }), TODAY), null);
});

test('formatPace: inteiro, singular e decimal abaixo de 1', () => {
  assert.equal(formatPace(27.6, 'page'), '28 págs./dia');
  assert.equal(formatPace(1.2, 'page'), '1 pág./dia');
  assert.equal(formatPace(0.45, 'page'), '0,5 pág./dia');
  assert.equal(formatPace(0.01, 'page'), '0,1 pág./dia');
  assert.equal(formatPace(6.4, 'percent'), '6%/dia');
});

test('linhas do cartão: ritmo, previsão e data alvo sem tom de cobrança', () => {
  const book = physical({ currentPage: 120, journal: [entry('2026-10-15', 92, 120)], targetDate: '2026-11-15' });
  assert.deepEqual(paceLines(book, TODAY), {
    pace: 'Ritmo: 28 págs./dia · termina por volta de 23 out',
    target: 'Para terminar até 15 nov: 6 págs./dia',
  });
  const k = kindle({ currentPercent: 40, journal: [entry('2026-10-16', 34, 40, 'percent')] });
  assert.deepEqual(paceLines(k, TODAY), { pace: 'Ritmo: 6%/dia · termina por volta de 26 out', target: '' });
  // Data passada: só lembra a data, nunca "atrasado".
  const late = physical({ currentPage: 120, journal: [entry('2026-10-15', 92, 120)], targetDate: '2026-10-01' });
  assert.equal(paceLines(late, TODAY).target, 'Meta de data: 1 out');
  // Sem total de páginas: ritmo sem previsão; data alvo neutra.
  const noTotal = physical({ pages: null, currentPage: 60, startDate: '2026-10-14', targetDate: '2026-10-30' });
  assert.deepEqual(paceLines(noTotal, TODAY), { pace: 'Ritmo: 20 págs./dia', target: 'Meta de data: 30 out' });
  // Termina em outro ano: mostra o ano.
  const slow = physical({ currentPage: 10, startDate: '2026-10-07', pages: 400 }); // 1 pág./dia, 390 dias
  assert.match(paceLines(slow, TODAY).pace, /termina por volta de 10 nov 2027$/);
  assert.deepEqual(paceLines({ ...book, status: 'lido' }, TODAY), { pace: '', target: '' });
  assert.deepEqual(paceLines(physical(), TODAY), { pace: '', target: '' });
});
