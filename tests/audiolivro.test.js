// 1.6: formato Audiolivro (duração e posição em minutos, diário em minutos, horas ouvidas).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  formatDuration, formatDurationShort, hoursText, hoursValue, joinMinutes, parseDuration, splitMinutes, timeInputs, timeLen,
} from '../app/js/audio.js';
import {
  closeOnFinish, countedEntries, entryPages, journalOnSave, listenedEntries, minutesListenedByMonth, minutesListenedInYear,
  minutesListenedPerDay, pagesReadInYear, positionField, recordProgress, unitOf, unitTotal,
} from '../app/js/journal.js';
import {
  FORMAT_LABELS, FORMATS, createEmptyState, normalizeBook, normalizeJournal, normalizeState, parseBackup, pauseReading,
  serializeBackup, startReread, upsertBook, validateBook,
} from '../app/js/store.js';
import { currentPosition, forecastFinish, formatPace, paceLines, paceUnit, readingPace, remainingAmount, targetPace } from '../app/js/pace.js';
import { allTimeStats, emptyFormats, formatShares, formatsText, yearStats } from '../app/js/stats.js';
import { CSV_COLUMNS, bookCsvRow } from '../app/js/csv.js';
import { formatChip, progressBar, progressOf } from '../app/js/ui.js';
import { diarySummary, editEntry, entryLine, entryParts, syncPosition } from '../app/js/diary.js';
import { sessionSummary } from '../app/js/timer.js';
import { calendarData, dayDetail } from '../app/js/calendar.js';
import { readerProfile } from '../app/js/retro-stats.js';
import { dailyPages } from '../app/js/trend.js';
import { pagesByFormat } from '../app/js/charts.js';
import { progressSheet, progressTotal, quickMenu } from '../app/js/views/sheets.js';
import { rhythmSeries } from '../app/js/reading-days.js';

const TODAY = '2026-10-27';
const m = (date, from, to, extra = {}) => ({ date, from, to, unit: 'minute', note: '', ...extra });
const audio = (extra = {}) => ({
  id: 'a', title: 'Torto Arado', format: 'audio', status: 'lendo', pages: null, durationMin: 720, currentMin: null, journal: [], ...extra,
});

// ---------- Utilidades de tempo ----------

test('tempo: "5h 30min", curto "27h30", horas com uma casa e h + min', () => {
  assert.equal(formatDuration(45), '45 min');
  assert.equal(formatDuration(60), '1h');
  assert.equal(formatDuration(330), '5h 30min');
  assert.equal(formatDuration(null), '0 min');
  assert.equal(formatDurationShort(1650), '27h30');
  assert.equal(formatDurationShort(420), '7h');
  assert.equal(formatDurationShort(605), '10h05');
  assert.equal(formatDurationShort(20), '20 min');
  assert.equal(hoursText(1650), '28');
  assert.equal(hoursText(90), '1,5');
  assert.deepEqual(hoursValue(1650), { value: 28, digits: 0 });
  assert.deepEqual(hoursValue(20), { value: 0.3, digits: 1 });
  assert.deepEqual(splitMinutes(330), { h: 5, m: 30 });
  assert.deepEqual(splitMinutes(null), { h: '', m: '' });
  assert.equal(joinMinutes('5', '30'), 330);
  assert.equal(joinMinutes('', '45'), 45);
  assert.equal(joinMinutes('2', ''), 120);
  assert.equal(joinMinutes('', ''), null);
  assert.ok(Number.isNaN(joinMinutes('-1', '0')));
});

test('texto livre vira minutos: 5h30, 5:30, 45min, 2h, 90; o resto é inválido', () => {
  assert.equal(parseDuration('5h30'), 330);
  assert.equal(parseDuration('5h 30min'), 330);
  assert.equal(parseDuration(' 5:30 '), 330);
  assert.equal(parseDuration('45min'), 45);
  assert.equal(parseDuration('2h'), 120);
  assert.equal(parseDuration('1,5h'), 90);
  assert.equal(parseDuration('90'), 90);
  assert.equal(parseDuration(''), null);
  assert.ok(Number.isNaN(parseDuration('abc')));
  assert.ok(Number.isNaN(parseDuration('5:3:1')));
});

test('campos h + min: teclado numérico, minutos com dois algarismos, largura do número', () => {
  const html = timeInputs({ id: 'f-duration', value: 305, attrs: 'data-time-field="durationMin"', label: 'Duração' });
  assert.match(html, /id="f-duration"[^>]*inputmode="numeric"[^>]*value="5"[^>]*data-time-part="h"/);
  assert.match(html, /id="f-duration-min"[^>]*value="05"[^>]*data-time-part="m"/);
  assert.match(html, /data-time-field="durationMin"/);
  assert.match(html, /<label class="time-part">/);
  assert.match(timeInputs({ id: 'x' }), /value=""[^>]*style="--len:1"/);
  assert.equal(timeLen('', '00'), 2);
  assert.equal(timeLen(120, '0'), 3);
});

// ---------- Dados ----------

test('normalizeBook: duração e posição em minutos, só para o audiolivro em leitura', () => {
  const b = normalizeBook({ title: 'X', format: 'audio', status: 'lendo', durationMin: '585', currentMin: 60.4 });
  assert.equal(b.format, 'audio');
  assert.equal(b.durationMin, 585);
  assert.equal(b.currentMin, 60);
  assert.equal(b.currentPage, null);
  assert.equal(b.currentPercent, null);
  // Passa da duração: descartado. Sem duração: até 60.000 min.
  assert.equal(normalizeBook({ title: 'X', format: 'audio', status: 'lendo', durationMin: 100, currentMin: 200 }).currentMin, null);
  assert.equal(normalizeBook({ title: 'X', format: 'audio', status: 'lendo', currentMin: 5000 }).currentMin, 5000);
  assert.equal(normalizeBook({ title: 'X', format: 'audio', status: 'lendo', currentMin: 70000 }).currentMin, null);
  // Lido / Quero ler: sem posição; a duração fica.
  const read = normalizeBook({ title: 'X', format: 'audio', status: 'lido', endDate: '2026-01-01', durationMin: 300, currentMin: 100 });
  assert.equal(read.currentMin, null);
  assert.equal(read.durationMin, 300);
  // Abandonei guarda onde parou.
  assert.equal(normalizeBook({ title: 'X', format: 'audio', status: 'abandonado', durationMin: 300, currentMin: 100 }).currentMin, 100);
  // Valores estranhos viram null; formato desconhecido vira físico.
  assert.equal(normalizeBook({ title: 'X', durationMin: 'abc' }).durationMin, null);
  assert.equal(normalizeBook({ title: 'X', durationMin: 0 }).durationMin, null);
  assert.equal(normalizeBook({ title: 'X', format: 'podcast' }).format, 'fisico');
  // Físico e Kindle não ganham posição em minutos, mas a duração sobrevive à troca de formato.
  const k = normalizeBook({ title: 'X', format: 'kindle', status: 'lendo', durationMin: 300, currentMin: 100, currentPercent: 40 });
  assert.equal(k.currentMin, null);
  assert.equal(k.durationMin, 300);
  assert.equal(k.currentPercent, 40);
  assert.equal(FORMAT_LABELS[FORMATS.AUDIO], 'Audiolivro');
});

test('validação: tempo ouvido maior que a duração', () => {
  assert.match(validateBook({ title: 'X', format: 'audio', status: 'lendo', durationMin: 100, currentMin: 120 })[0], /passa da duração/);
  assert.deepEqual(validateBook({ title: 'X', format: 'audio', status: 'lendo', durationMin: 100, currentMin: 100 }), []);
  // A página atual do físico não vale para o audiolivro (e vice-versa).
  assert.deepEqual(validateBook({ title: 'X', format: 'audio', status: 'lendo', pages: 10, currentPage: 50 }), []);
});

test('diário aceita a unidade minuto (até 60.000) e junta o mesmo dia', () => {
  assert.deepEqual(normalizeJournal([m('2026-10-01', 0, 90), m('2026-10-01', 90, 120, { minutes: 30 })]),
    [{ date: '2026-10-01', from: 0, to: 120, unit: 'minute', note: '', minutes: 30 }]);
  assert.deepEqual(normalizeJournal([m('2026-10-01', 0, 70000)]), []);
  assert.equal(normalizeJournal([{ date: '2026-10-01', from: 0, to: 10, unit: 'hora' }])[0].unit, 'page');
});

test('backup: audiolivro vai e volta igual; backup antigo entra sem mudar nada', () => {
  let state = createEmptyState();
  ({ state } = upsertBook(state, {
    id: 'a1', title: 'Sapiens', format: 'audio', status: 'lendo', startDate: '2026-10-01', durationMin: 930, currentMin: 120,
    journal: [m('2026-10-02', 0, 60), m('2026-10-03', 60, 120, { minutes: 45 })],
  }, '2026-10-03T10:00:00.000Z'));
  const back = parseBackup(serializeBackup(state, '2026-10-04T00:00:00.000Z'));
  assert.deepEqual(back, state);
  assert.deepEqual(normalizeState(JSON.parse(JSON.stringify(back))), state);
  // Backup da 1.5 (sem os campos novos): os livros continuam como eram.
  const old = {
    app: 'leituras', schemaVersion: 2, exportedAt: '2026-01-01T00:00:00.000Z',
    data: {
      version: 2, goals: {}, defaultGoal: 12, customGenres: [], upNext: [], pageGoals: {},
      books: [
        { id: 'p', title: 'Físico', format: 'fisico', status: 'lendo', pages: 300, currentPage: 120, journal: [{ date: '2026-01-02', from: 0, to: 120, unit: 'page', note: '' }], createdAt: 'x', updatedAt: 'x' },
        { id: 'k', title: 'Kindle', format: 'kindle', status: 'lendo', currentPercent: 40, createdAt: 'x', updatedAt: 'x' },
        { id: 'v1', title: 'Versão 1', status: 'lido', endDate: '2025-05-01', createdAt: 'x', updatedAt: 'x' },
      ],
    },
  };
  const imported = parseBackup(JSON.stringify(old));
  const [p, k, v1] = imported.books;
  assert.equal(p.format, 'fisico');
  assert.equal(p.currentPage, 120);
  assert.deepEqual(p.journal, old.data.books[0].journal);
  assert.equal(k.currentPercent, 40);
  assert.equal(v1.format, 'fisico');
  for (const b of imported.books) {
    assert.equal(b.durationMin, null);
    assert.equal(b.currentMin, null);
  }
});

test('Voltar para Quero ler zera o tempo ouvido; reler leva a duração', () => {
  let state = createEmptyState();
  ({ state } = upsertBook(state, { id: 'a', title: 'A', format: 'audio', status: 'lendo', startDate: '2026-10-01', durationMin: 600, currentMin: 200, journal: [m('2026-10-02', 0, 200)] }));
  const { state: paused, before } = pauseReading(state, 'a');
  assert.equal(before.currentMin, 200);
  assert.equal(paused.books[0].status, 'quero');
  assert.equal(paused.books[0].currentMin, null);
  assert.equal(paused.books[0].durationMin, 600);
  assert.deepEqual(paused.books[0].journal, []);
  ({ state } = upsertBook(state, { ...state.books[0], status: 'lido', endDate: '2026-10-05' }));
  const { book } = startReread(state, 'a', TODAY);
  assert.equal(book.format, 'audio');
  assert.equal(book.durationMin, 600);
  assert.equal(book.currentMin, null);
});

// ---------- Diário ----------

test('unidade minuto: posição em currentMin, fim na duração', () => {
  assert.equal(unitOf(audio()), 'minute');
  assert.equal(positionField('minute'), 'currentMin');
  assert.equal(positionField('percent'), 'currentPercent');
  assert.equal(positionField('page'), 'currentPage');
  assert.equal(unitTotal(audio()), 720);
  assert.equal(unitTotal(audio({ durationMin: null })), null);
  assert.equal(progressTotal(audio()), 720);
});

test('registrar o tempo ouvido grava o dia em minutos', () => {
  const b = audio({ currentMin: 60, journal: [m('2026-10-20', 0, 60)] });
  assert.deepEqual(recordProgress(b, 135, 'minute', TODAY), [m('2026-10-20', 0, 60), m(TODAY, 60, 135)]);
  // Concluir fecha na duração; sem duração não inventa nada.
  assert.deepEqual(closeOnFinish({ ...b, currentMin: 135, journal: [m('2026-10-20', 0, 60), m(TODAY, 60, 135)] }, TODAY).at(-1), m(TODAY, 60, 720));
  assert.deepEqual(closeOnFinish(audio({ durationMin: null, journal: [m('2026-10-20', 0, 60)] }), TODAY), [m('2026-10-20', 0, 60)]);
});

test('journalOnSave: trocar o formato (físico ↔ Kindle ↔ audiolivro) não cria entrada', () => {
  const physical = { id: 'p', title: 'P', format: 'fisico', status: 'lendo', pages: 300, currentPage: 120, journal: [] };
  assert.deepEqual(journalOnSave({ ...physical, format: 'audio', currentMin: 200, durationMin: 600 }, physical, TODAY), []);
  const a = audio({ currentMin: 100 });
  assert.deepEqual(journalOnSave({ ...a, format: 'kindle', currentPercent: 30 }, a, TODAY), []);
  assert.deepEqual(journalOnSave({ ...a, format: 'fisico', currentPage: 30 }, a, TODAY), []);
  // Mesmo formato, posição nova: registra em minutos.
  assert.deepEqual(journalOnSave({ ...a, currentMin: 160 }, a, TODAY), [m(TODAY, 100, 160)]);
  // Concluir: fecha na duração a partir da posição salva.
  assert.deepEqual(journalOnSave({ ...a, status: 'lido', endDate: TODAY, currentMin: null }, a, TODAY), [m(TODAY, 100, 720)]);
});

test('entryPages: minutos viram páginas só com páginas E duração', () => {
  const withPages = audio({ pages: 360 });
  assert.equal(entryPages(withPages, m(TODAY, 0, 360)), 180);
  assert.equal(entryPages(withPages, m(TODAY, 360, 720)), 180);
  assert.equal(entryPages(audio(), m(TODAY, 0, 360)), 0);
  assert.equal(entryPages(audio({ pages: 300, durationMin: null }), m(TODAY, 0, 360)), 0);
  // Encadeadas, somam exatamente o total do livro.
  const journal = Array.from({ length: 7 }, (_, i) => m(`2026-10-0${i + 1}`, i * 103, Math.min(720, (i + 1) * 103)));
  assert.equal(countedEntries({ ...withPages, journal }).reduce((s, x) => s + x.pages, 0), 360);
});

test('minutos ouvidos: só o avanço novo, sem passar da duração; Lido sem diário soma a duração', () => {
  const b = audio({ journal: [m('2026-10-01', 0, 100), m('2026-10-02', 100, 60), m('2026-10-03', 60, 150), m('2026-10-04', 150, 900)] });
  assert.deepEqual(listenedEntries(b).map((x) => x.minutes), [100, 0, 50, 570]);
  const read = audio({ id: 'r', status: 'lido', endDate: '2026-05-30', durationMin: 930, journal: [] });
  const partial = audio({ id: 'q', status: 'lido', endDate: '2026-06-10', durationMin: 300, journal: [m('2026-06-09', 100, 200)] });
  const want = audio({ id: 'w', status: 'quero', journal: [m('2026-10-01', 0, 50)] });
  const books = [b, read, partial, want];
  assert.equal(minutesListenedInYear(books, 2026), 720 + 930 + 100 + 200);
  assert.equal(minutesListenedInYear(books, 2025), 0);
  assert.equal(minutesListenedInYear(books), 720 + 930 + 300);
  const months = minutesListenedByMonth(books, 2026);
  assert.equal(months.reduce((s, n) => s + n, 0), minutesListenedInYear(books, 2026));
  assert.equal(months[4], 930);
  assert.equal(months[5], 300);
  assert.equal(minutesListenedPerDay(books).get('2026-10-04'), 570);
  // Sem páginas, o audiolivro não soma páginas; com páginas, soma as equivalentes (e o resto no término).
  assert.equal(pagesReadInYear([b], 2026), 0);
  assert.equal(pagesReadInYear([{ ...read, pages: 464 }], 2026), 464);
});

// ---------- Ritmo e previsão ----------

test('ritmo do audiolivro em minutos por dia e previsão de término', () => {
  const b = audio({ startDate: '2026-10-18', currentMin: 300,
    journal: [m('2026-10-20', 0, 90), m('2026-10-22', 90, 180), m('2026-10-24', 180, 240), m('2026-10-26', 240, 300)] });
  assert.equal(paceUnit(b), 'minute');
  assert.equal(currentPosition(b), 300);
  assert.deepEqual(readingPace(b, TODAY), { perDay: 75, unit: 'minute', source: 'journal' });
  assert.equal(remainingAmount(b), 420);
  assert.equal(forecastFinish(b, TODAY), '2026-11-02');
  assert.equal(remainingAmount(audio({ durationMin: null, currentMin: 10 })), null);
  assert.equal(formatPace(75, 'minute'), '1h 15min/dia');
  assert.equal(formatPace(0.4, 'minute'), '1 min/dia');
  assert.deepEqual(targetPace({ ...b, targetDate: '2026-10-30' }, TODAY), { perDay: 105, unit: 'minute' });
  assert.equal(paceLines(b, TODAY).pace, 'Ritmo: 1h 15min/dia · termina por volta de 2 nov');
});

// ---------- Telas ----------

test('progresso do audiolivro: tempo ouvido ÷ duração; sem duração, só o tempo', () => {
  assert.deepEqual(progressOf(audio({ currentMin: 300 })), { pct: 42, label: '5h de 12h', audio: true });
  assert.deepEqual(progressOf(audio({ currentMin: 65, durationMin: null })), { pct: null, label: '1h 5min ouvidos', audio: true });
  assert.equal(progressOf(audio()), null);
  assert.match(progressBar(audio({ currentMin: 65, durationMin: null })), /informe a duração/);
  assert.match(formatChip({ format: 'audio' }), /class="chip chip-audio"><svg[^>]*icon-audio/);
  assert.match(formatChip({ format: 'audio' }), /Audiolivro<\/span>$/);
  assert.equal(formatChip({ format: 'kindle' }), '<span class="chip">Kindle</span>');
});

test('folha "Registrar leitura" do audiolivro: h + min, atalhos de tempo e régua na duração', () => {
  const html = progressSheet(audio({ currentMin: 300 }), TODAY);
  assert.match(html, /data-unit="minute"/);
  assert.match(html, /Quanto você já ouviu\?/);
  assert.match(html, /id="progress-h"/);
  assert.doesNotMatch(html, /id="progress-input"/);
  assert.deepEqual([...html.matchAll(/class="psheet-chip"[^>]*data-delta="(\d+)">([^<]+)</g)].map((x) => [x[1], x[2]]),
    [['15', '+15 min'], ['30', '+30 min'], ['60', '+1h']]);
  assert.match(html, /id="progress-range"[^>]*max="720"[^>]*value="300"/);
  assert.match(html, /de 12h/);
  // Físico continua igual.
  assert.match(progressSheet({ id: 'p', title: 'P', format: 'fisico', status: 'lendo', pages: 300, currentPage: 10, journal: [] }, TODAY), /id="progress-input"/);
  assert.match(quickMenu(audio(), { upNext: [] }), /Ouvir agora/);
});

test('diário do audiolivro: resumo em tempo, linhas "1h → 2h 15min" e correção em texto', () => {
  const b = audio({ pages: 360, currentMin: 135, journal: [m('2026-10-20', 0, 60), m(TODAY, 60, 135, { minutes: 50 })] });
  assert.deepEqual(diarySummary(b), { days: 2, pages: 68, percent: 0, minutes: 135, avg: 68, unit: 'minute' });
  assert.deepEqual(entryParts(b, b.journal[1]), { range: '1h → 2h 15min', delta: '+1h 15min', approx: '≈ 38 págs.', minutes: '50 min no cronômetro' });
  assert.equal(entryLine(b, b.journal[0], TODAY), '20 out · 0 min → 1h (+1h · ≈ 30 págs.)');
  const { journal, entry } = editEntry(b, TODAY, { date: TODAY, from: '1h', to: '2:30', note: '' }, TODAY);
  assert.deepEqual(entry, m(TODAY, 60, 150, { minutes: 50 }));
  assert.deepEqual(syncPosition(b, b.journal[1], entry, journal), { currentMin: 150 });
  assert.match(editEntry(b, TODAY, { date: TODAY, from: '1h', to: '13h' }, TODAY).error, /passar de 12h/);
  assert.match(editEntry(b, TODAY, { date: TODAY, from: 'x', to: '1h' }, TODAY).error, /1h 20min/);
  assert.equal(rhythmSeries(b).unit, 'minute');
  assert.equal(rhythmSeries(b).total, 135);
});

test('cronômetro do audiolivro: resumo em tempo ouvido', () => {
  assert.equal(sessionSummary({ minutes: 20, unit: 'minute', delta: 30 }), '20 min · 30 min ouvidos');
  assert.equal(sessionSummary({ minutes: 40, unit: 'minute', delta: 75 }), '40 min · 1h 15min ouvidos');
});

// ---------- Estatísticas e planilha ----------

const LIBRARY = [
  { id: 'p', title: 'Dom Casmurro', authors: 'Machado', format: 'fisico', status: 'lido', pages: 256, endDate: '2026-02-20', startDate: '2026-02-01', journal: [], updatedAt: 'x' },
  { id: 'k', title: 'Fora de Série', authors: 'Gladwell', format: 'kindle', status: 'lido', pages: 304, endDate: '2026-04-18', startDate: '2026-04-01', journal: [], updatedAt: 'x' },
  { id: 'a1', title: 'Sapiens', authors: 'Harari', format: 'audio', status: 'lido', pages: 464, durationMin: 930, endDate: '2026-05-30', startDate: '2026-05-02', journal: [], updatedAt: 'x' },
  { id: 'a2', title: 'Torto Arado', authors: 'Itamar', format: 'audio', status: 'lido', pages: null, durationMin: 720, endDate: '2026-10-27', startDate: '2026-10-18',
    journal: [m('2026-10-20', 0, 90), m('2026-10-27', 90, 720)], updatedAt: 'x' },
];

test('estatísticas: audiolivro conta na meta, no formato e nas horas ouvidas', () => {
  const s = yearStats(LIBRARY, 2026, 12, TODAY);
  assert.equal(s.count, 4);
  assert.deepEqual(s.formats, { fisico: 1, kindle: 1, audio: 2 });
  assert.equal(s.listened, 930 + 720);
  assert.equal(s.pages, 256 + 304 + 464);
  const all = allTimeStats(LIBRARY, TODAY);
  assert.equal(all.listened, 1650);
  assert.deepEqual(all.formats, { fisico: 1, kindle: 1, audio: 2 });
  assert.deepEqual(pagesByFormat(LIBRARY, 2026), { fisico: 256, kindle: 304, audio: 464 });
  assert.deepEqual(emptyFormats(), { fisico: 0, kindle: 0, audio: 0 });
});

test('formatos: % que somam 100 e texto com o audiolivro só quando houver', () => {
  assert.deepEqual(formatShares({ fisico: 1, kindle: 1, audio: 1 }).map((f) => f.pct), [34, 33, 33]);
  assert.deepEqual(formatShares({ fisico: 1, kindle: 7, audio: 0 }).map((f) => [f.format, f.pct]), [['fisico', 13], ['kindle', 87]]);
  assert.deepEqual(formatShares({ fisico: 0, kindle: 0, audio: 3 }), [{ format: 'audio', count: 3, pct: 100 }]);
  assert.deepEqual(formatShares({ fisico: 0, kindle: 0 }), []);
  assert.equal(formatsText({ fisico: 3, kindle: 2, audio: 0 }), '3 físicos · 2 no Kindle');
  assert.equal(formatsText({ fisico: 1, kindle: 0, audio: 1 }), '1 físico · 0 no Kindle · 1 audiolivro');
});

test('perfil de leitor "Bom de ouvido" com 80% ou mais em audiolivro', () => {
  const p = readerProfile({ count: 10, bigBooks: 0, monthsMet: 4, genres: 3, avgDays: 20, formats: { fisico: 1, kindle: 1, audio: 8 } });
  assert.equal(p.id, 'ouvinte');
  assert.equal(p.reason, '80% dos livros em audiolivro.');
});

test('calendário e páginas por dia: dia só de audiolivro mostra o tempo e não puxa a média de páginas', () => {
  const data = calendarData(LIBRARY, 2026);
  assert.equal(data.days.get('2026-10-20').listened, 90);
  assert.match(dayDetail(data, '2026-10-20').text, /20 de out · 1h 30min ouvidos — Torto Arado/);
  const physical = { id: 'f', title: 'F', format: 'fisico', status: 'lendo', pages: 300, journal: [{ date: '2026-10-21', from: 0, to: 30, unit: 'page', note: '' }] };
  const d = dailyPages([...LIBRARY, physical], 2026);
  assert.equal(d.days, 1);
  assert.equal(d.perReadingDay, 30);
});

test('planilha: coluna Duração, preenchida só no audiolivro', () => {
  assert.equal(CSV_COLUMNS[9], 'Duração');
  const row = bookCsvRow(normalizeBook({ title: 'Sapiens', format: 'audio', status: 'lido', endDate: '2026-05-30', durationMin: 930, pages: 464 }));
  assert.equal(row[3], 'Audiolivro');
  assert.equal(row[8], 464);
  assert.equal(row[9], '15h 30min');
  assert.equal(bookCsvRow(normalizeBook({ title: 'K', format: 'kindle', durationMin: 930 }))[9], '');
  assert.equal(row.length, CSV_COLUMNS.length);
});
