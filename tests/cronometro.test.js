import { test } from 'node:test';
import assert from 'node:assert/strict';
import { addMinutes, closeOnFinish, recordProgress } from '../app/js/journal.js';
import { normalizeBook } from '../app/js/store.js';
import {
  SESSION_KEY, elapsedMs, formatElapsed, isPaused, loadSession, parseSession, pauseSession, resumeSession,
  saveSession, sessionMinutes, sessionSummary, startSession, wholeMinutes,
} from '../app/js/timer.js';
import { minutesReadPerDay, pagesPerHour, totalMinutes } from '../app/js/timer-stats.js';

const MIN = 60000;
const T0 = Date.UTC(2026, 9, 16, 12, 0, 0);

const physical = (extra = {}) => ({ id: 'p', title: 'Físico', format: 'fisico', status: 'lendo', pages: 300, currentPage: null, journal: [], ...extra });
const kindle = (extra = {}) => ({ id: 'k', title: 'Kindle', format: 'kindle', status: 'lendo', pages: 400, currentPercent: null, journal: [], ...extra });

function memoryStorage() {
  const data = new Map();
  return {
    getItem: (k) => (data.has(k) ? data.get(k) : null),
    setItem: (k, v) => data.set(k, String(v)),
    removeItem: (k) => data.delete(k),
    data,
  };
}

test('tempo da sessão vem dos horários, descontando as pausas', () => {
  let s = startSession('p', T0);
  assert.equal(elapsedMs(s, T0 + 5 * MIN), 5 * MIN);
  s = pauseSession(s, T0 + 10 * MIN);
  assert.ok(isPaused(s));
  // Pausado: o tempo não anda, mesmo com o app congelado por horas.
  assert.equal(elapsedMs(s, T0 + 3 * 60 * MIN), 10 * MIN);
  s = resumeSession(s, T0 + 25 * MIN);
  assert.equal(s.pausedMs, 15 * MIN);
  assert.equal(elapsedMs(s, T0 + 30 * MIN), 15 * MIN);
  // Pausar duas vezes ou continuar sem pausa não muda nada.
  assert.equal(pauseSession(pauseSession(s, T0 + 40 * MIN), T0 + 50 * MIN).pausedAt, T0 + 40 * MIN);
  assert.equal(resumeSession(s, T0 + 60 * MIN), s);
  // Relógio do aparelho voltou no tempo: nunca negativo.
  assert.equal(elapsedMs(startSession('p', T0), T0 - MIN), 0);
});

test('sessão guardada e lida do armazenamento', () => {
  const storage = memoryStorage();
  const s = pauseSession(startSession('livro-1', T0), T0 + MIN);
  saveSession(storage, s);
  assert.deepEqual(JSON.parse(storage.data.get(SESSION_KEY)), s);
  assert.deepEqual(loadSession(storage), s);
  saveSession(storage, null);
  assert.equal(storage.data.has(SESSION_KEY), false);
  assert.equal(loadSession(storage), null);
  // Armazenamento que falha: sem sessão e sem erro.
  const broken = { getItem() { throw new Error('x'); }, setItem() { throw new Error('x'); }, removeItem() { throw new Error('x'); } };
  assert.equal(loadSession(broken), null);
  assert.doesNotThrow(() => saveSession(broken, s));
});

test('parseSession recusa dados estranhos', () => {
  const ok = { bookId: 'a', startedAt: T0, pausedAt: null, pausedMs: 0 };
  assert.deepEqual(parseSession(JSON.stringify(ok)), ok);
  assert.deepEqual(parseSession({ ...ok, extra: 1 }), ok);
  for (const bad of ['', '{', 'null', '[]', JSON.stringify({ ...ok, bookId: '' }), JSON.stringify({ ...ok, startedAt: 'x' }),
    JSON.stringify({ ...ok, pausedMs: -1 }), JSON.stringify({ ...ok, pausedAt: T0 - 1 }), JSON.stringify({ ...ok, bookId: 7 })]) {
    assert.equal(parseSession(bad), null, bad);
  }
});

test('formato do tempo e minutos da sessão', () => {
  assert.equal(formatElapsed(0), '00:00');
  assert.equal(formatElapsed(65 * 1000), '01:05');
  assert.equal(formatElapsed(59 * MIN + 59999), '59:59');
  assert.equal(formatElapsed(62 * MIN + 9000), '1:02:09');
  assert.equal(formatElapsed(-5), '00:00');
  assert.equal(sessionMinutes(59 * 1000), 0, 'menos de 1 minuto não conta');
  assert.equal(sessionMinutes(MIN), 1);
  assert.equal(sessionMinutes(32 * MIN + 20000), 32);
  assert.equal(sessionMinutes(32 * MIN + 40000), 33);
  assert.equal(sessionMinutes(30 * 60 * MIN), 1440);
  assert.equal(wholeMinutes(12 * MIN + 59000), 12);
});

test('resumo da sessão', () => {
  assert.equal(sessionSummary({ minutes: 32, unit: 'page', delta: 18 }), '32 min · 18 págs. · 34 págs./hora');
  assert.equal(sessionSummary({ minutes: 32, unit: 'percent', delta: 6 }), '32 min · 6%');
  assert.equal(sessionSummary({ minutes: 10, unit: 'page', delta: 1 }), '10 min · 1 pág. · 6 págs./hora');
  assert.equal(sessionSummary({ minutes: 25, unit: 'page', delta: 0 }), '25 min');
  assert.equal(sessionSummary({ minutes: 25, unit: 'page', delta: -3 }), '25 min');
  assert.equal(sessionSummary({ minutes: 0, unit: 'page', delta: 4 }), 'menos de 1 min · 4 págs.');
});

test('addMinutes soma no dia e cria parada quando não houve avanço', () => {
  // Sem entrada no dia: cria from = to na posição atual.
  assert.deepEqual(addMinutes(physical({ currentPage: 40 }), 20, '2026-10-16'), [
    { date: '2026-10-16', from: 40, to: 40, unit: 'page', note: '', minutes: 20 },
  ]);
  // Com entrada no dia: soma às sessões anteriores.
  let book = physical({ currentPage: 40 });
  book = { ...book, journal: recordProgress(book, 58, 'page', '2026-10-16'), currentPage: 58 };
  book = { ...book, journal: addMinutes(book, 32, '2026-10-16') };
  book = { ...book, journal: addMinutes(book, 10, '2026-10-16') };
  assert.deepEqual(book.journal, [{ date: '2026-10-16', from: 40, to: 58, unit: 'page', note: '', minutes: 42 }]);
  // Avançar de novo no mesmo dia mantém os minutos.
  book = { ...book, journal: recordProgress(book, 70, 'page', '2026-10-16'), currentPage: 70 };
  assert.equal(book.journal[0].minutes, 42);
  assert.equal(book.journal[0].to, 70);
  // Voltar ao início do dia não apaga a entrada que tem minutos.
  assert.deepEqual(recordProgress(book, 40, 'page', '2026-10-16'), [{ date: '2026-10-16', from: 40, to: 40, unit: 'page', note: '', minutes: 42 }]);
  // Concluir no mesmo dia mantém os minutos.
  assert.equal(closeOnFinish(book, '2026-10-16')[0].minutes, 42);
  // Teto de 1440 minutos no dia; zero ou inválido não muda nada.
  assert.equal(addMinutes(book, 2000, '2026-10-16')[0].minutes, 1440);
  assert.deepEqual(addMinutes(book, 0, '2026-10-16'), book.journal);
  assert.deepEqual(addMinutes(book, 'x', '2026-10-16'), book.journal);
  // Kindle: a parada fica em %.
  assert.deepEqual(addMinutes(kindle({ currentPercent: 30 }), 15, '2026-10-16'), [
    { date: '2026-10-16', from: 30, to: 30, unit: 'percent', note: '', minutes: 15 },
  ]);
});

test('normalizeJournal guarda os minutos e soma no mesmo dia', () => {
  const b = normalizeBook({
    title: 'X', status: 'lendo',
    journal: [
      { date: '2026-10-01', from: 0, to: 30, unit: 'page', note: '', minutes: 25 },
      { date: '2026-10-01', from: 30, to: 50, unit: 'page', note: '', minutes: 20.4 },
      { date: '2026-10-02', from: 50, to: 60, unit: 'page', note: '', minutes: 0 },
      { date: '2026-10-03', from: 60, to: 70, unit: 'page', note: '', minutes: 'abc' },
      { date: '2026-10-04', from: 70, to: 80, unit: 'page', note: '', minutes: 5000 },
      { date: '2026-10-05', from: 80, to: 90, unit: 'page', note: '', minutes: 1000 },
      { date: '2026-10-05', from: 90, to: 95, unit: 'page', note: '', minutes: 1000 },
    ],
  });
  assert.deepEqual(b.journal, [
    { date: '2026-10-01', from: 0, to: 50, unit: 'page', note: '', minutes: 45 },
    { date: '2026-10-02', from: 50, to: 60, unit: 'page', note: '' },
    { date: '2026-10-03', from: 60, to: 70, unit: 'page', note: '' },
    { date: '2026-10-04', from: 70, to: 80, unit: 'page', note: '' },
    { date: '2026-10-05', from: 80, to: 95, unit: 'page', note: '', minutes: 1440 },
  ]);
});

test('minutos por dia, total do ano e páginas por hora', () => {
  const books = [
    physical({ journal: [
      { date: '2025-12-31', from: 0, to: 30, unit: 'page', note: '', minutes: 60 },
      { date: '2026-10-01', from: 30, to: 60, unit: 'page', note: '', minutes: 45 },
      // Sem cronômetro: não entra na velocidade.
      { date: '2026-10-02', from: 60, to: 200, unit: 'page', note: '' },
      // Só tempo, sem avanço: conta minutos, não velocidade.
      { date: '2026-10-03', from: 200, to: 200, unit: 'page', note: '', minutes: 15 },
    ] }),
    // Kindle: 5% de 400 páginas = 20 páginas.
    kindle({ journal: [{ date: '2026-10-01', from: 10, to: 15, unit: 'percent', note: '', minutes: 15 }] }),
    // Kindle sem total de páginas: minutos contam, velocidade não.
    kindle({ id: 'k2', title: 'Sem páginas', pages: null, journal: [{ date: '2026-10-01', from: 0, to: 10, unit: 'percent', note: '', minutes: 30 }] }),
  ];
  const days = minutesReadPerDay(books);
  assert.deepEqual(days.get('2026-10-01'), {
    minutes: 90,
    byBook: [{ id: 'p', title: 'Físico', minutes: 45 }, { id: 'k', title: 'Kindle', minutes: 15 }, { id: 'k2', title: 'Sem páginas', minutes: 30 }],
  });
  assert.equal(days.has('2026-10-02'), false);
  assert.equal(days.get('2026-10-03').minutes, 15);
  assert.equal(totalMinutes(books, 2026), 105);
  assert.equal(totalMinutes(books, 2025), 60);
  assert.equal(totalMinutes(books), 165);
  // 2026: (30 + 20) páginas em (45 + 15) minutos = 50 por hora.
  assert.equal(pagesPerHour(books, 2026), 50);
  // Todos os anos: 80 páginas em 120 minutos.
  assert.equal(pagesPerHour(books), 40);
  assert.equal(pagesPerHour(books, 2024), null);
  assert.equal(pagesPerHour([physical()], 2026), null);
});
