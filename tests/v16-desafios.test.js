// 1.6: desafios de leitura (regras, dados, backup) e velocidade de leitura (páginas por hora,
// horário das sessões, previsão da fila).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  CHALLENGE_TYPES, createEmptyState, normalizeBook, normalizeChallenge, normalizeHours, normalizeJournal, normalizeState,
  parseBackup, removeBook, restoreBook, serializeBackup, upsertBook,
} from '../app/js/store.js';
import {
  CHALLENGE_TEMPLATES, autoTitle, challengeProgress, challengeTitle, challengesForYear, newlyCompleted, removeChallenge,
  restoreChallenge, ruleText, saveChallenge, templateUsed, toggleChallengeBook,
} from '../app/js/challenges.js';
import { addMinutes, recordProgress } from '../app/js/journal.js';
import { sessionHours } from '../app/js/timer.js';
import {
  bookEstimate, dayPeriod, formatDuration, formatHours, hourDistribution, queueForecast, recentPagesPerDay, speedStats,
} from '../app/js/speed.js';

let n = 0;
function book(extra = {}) {
  n += 1;
  return normalizeBook({ id: `b${n}`, title: `Livro ${n}`, authors: `Autor ${n}`, pages: 300, status: 'lido', endDate: '2026-03-10', ...extra });
}
const ch = (rule, target = 1, extra = {}) => normalizeChallenge({ id: `c-${rule.type}`, year: 2026, target, rule, ...extra });

// ---------- Regras ----------

test('desafios: só livros Lido com término no ano contam, em ordem de término', () => {
  const books = [
    book({ genre: 'Ficção', endDate: '2026-05-01' }),
    book({ genre: 'ficção ', endDate: '2026-02-01' }),
    book({ genre: 'Ficção', endDate: '2025-12-31' }),
    book({ genre: 'Ficção', status: 'abandonado', endDate: '2026-04-01' }),
    book({ genre: 'Ficção', status: 'lendo', endDate: null }),
  ];
  const p = challengeProgress(ch({ type: 'genre', value: 'Ficção' }, 3), books);
  assert.equal(p.count, 2);
  assert.deepEqual(p.books.map((b) => b.endDate), ['2026-02-01', '2026-05-01']);
  assert.equal(p.done, false);
  assert.equal(p.pct, 67);
  assert.equal(p.reading, 1, 'o que está em leitura vai contar');
  assert.equal(p.completedOn, null);
});

test('desafios: gênero, não ficção, etiqueta, páginas, formato, releitura, série, autor', () => {
  const books = [
    book({ genre: 'Biografia', tags: ['Clássico'], pages: 650, format: 'kindle', endDate: '2026-01-10' }),
    book({ genre: 'Ficção científica', tags: ['clássico'], pages: 500, reread: true, endDate: '2026-02-10', series: 'Duna', seriesNumber: 1 }),
    book({ genre: 'Não ficção', pages: 120, endDate: '2026-03-10', authors: 'Machado de Assis, José de Alencar' }),
    book({ genre: null, pages: null, endDate: '2026-04-10', series: 'Fundação', authors: 'Isaac Asimov' }),
  ];
  const count = (rule) => challengeProgress(ch(rule, 1), books).count;
  assert.equal(count({ type: 'genre', value: 'biografia' }), 1);
  assert.equal(count({ type: 'nonfiction', value: null }), 1, '"Não ficção" e "Ficção científica" ficam fora; sem gênero também');
  assert.equal(count({ type: 'nonfiction' }) + 0, 1);
  assert.equal(count({ type: 'tag', value: 'CLÁSSICO' }), 2, 'etiqueta sem diferenciar maiúsculas');
  assert.equal(count({ type: 'pages', value: 500 }), 1, '"mais de 500": 500 não conta');
  assert.equal(count({ type: 'format', value: 'kindle' }), 1);
  assert.equal(count({ type: 'reread', value: null }), 1);
  assert.equal(count({ type: 'series', value: null }), 2, 'qualquer série');
  assert.equal(count({ type: 'series', value: 'duna' }), 1);
  assert.equal(count({ type: 'author', value: 'José de Alencar' }), 1);
  assert.equal(count({ type: 'author', value: 'asimov' }), 1, 'parte do nome (3+ letras) também vale');
});

test('desafios: "mais de 500" — nenhum livro de 500 exatas; 501 completa no dia do término', () => {
  const books = [book({ pages: 500, endDate: '2026-01-01' }), book({ pages: 501, endDate: '2026-06-02' })];
  const p = challengeProgress(ch({ type: 'pages', value: 500 }), books);
  assert.equal(p.done, true);
  assert.equal(p.completedOn, '2026-06-02');
  assert.equal(p.pct, 100);
});

test('desafios: autores diferentes contam uma vez cada (coautoria conta os dois)', () => {
  const books = [
    book({ authors: 'Ana', endDate: '2026-01-01' }),
    book({ authors: 'ana', endDate: '2026-02-01' }),
    book({ authors: 'Bia e Caio', endDate: '2026-03-01' }),
    book({ authors: 'Duda', endDate: '2026-04-01' }),
  ];
  const p = challengeProgress(ch({ type: 'authors' }, 3), books);
  assert.equal(p.count, 4);
  assert.equal(p.books.length, 3, 'só os livros que trouxeram autor novo');
  assert.equal(p.completedOn, '2026-03-01');
  assert.equal(p.reading, 0);
});

test('desafios: série concluída = todos os volumes cadastrados lidos, o último no ano', () => {
  const s = (title, num, extra) => book({ title, series: 'Duna', seriesNumber: num, ...extra });
  const done = [s('Duna', 1, { endDate: '2025-08-01' }), s('Messias', 2, { endDate: '2026-02-01' }), s('Filhos', 3, { endDate: '2026-05-01' })];
  let p = challengeProgress(ch({ type: 'seriesDone' }), done);
  assert.equal(p.count, 1);
  assert.equal(p.books[0].title, 'Filhos');
  assert.equal(p.completedOn, '2026-05-01');
  // Um volume ainda na fila: não terminou.
  p = challengeProgress(ch({ type: 'seriesDone' }), [...done, s('Imperador', 4, { status: 'quero', endDate: null })]);
  assert.equal(p.count, 0);
  // Releitura do volume 1 em 2026 não muda a data em que a série terminou.
  p = challengeProgress(ch({ type: 'seriesDone' }), [...done, s('Duna', 1, { endDate: '2026-09-01', reread: true })]);
  assert.equal(p.completedOn, '2026-05-01');
  // Série com um volume só cadastrado não conta; série terminada em 2025 também não.
  assert.equal(challengeProgress(ch({ type: 'seriesDone' }), [book({ series: 'Solo' })]).count, 0);
  assert.equal(challengeProgress(ch({ type: 'seriesDone' }), [s('A', 1, { endDate: '2025-01-01' }), s('B', 2, { endDate: '2025-02-01' })]).count, 0);
});

test('desafios: "eu escolho" conta os livros marcados lidos no ano', () => {
  const a = book({ endDate: '2026-01-01' });
  const b = book({ endDate: '2025-01-01' });
  const c = normalizeChallenge({ id: 'm', year: 2026, target: 2, rule: { type: 'manual' }, books: [a.id, b.id, 'sumiu'] });
  const p = challengeProgress(c, [a, b]);
  assert.equal(p.count, 1);
  assert.equal(p.done, false);
});

test('desafios: títulos automáticos e textos das regras', () => {
  assert.equal(autoTitle({ type: 'pages', value: 500 }, 1), 'Ler 1 livro com mais de 500 páginas');
  assert.equal(autoTitle({ type: 'format', value: 'kindle' }, 3), 'Ler 3 livros no Kindle');
  assert.equal(autoTitle({ type: 'reread' }, 2), 'Ler 2 releituras');
  assert.equal(autoTitle({ type: 'seriesDone' }, 1), 'Terminar uma série');
  assert.equal(autoTitle({ type: 'seriesDone' }, 2), 'Terminar 2 séries');
  assert.equal(autoTitle({ type: 'authors' }, 5), 'Ler 5 autores diferentes');
  assert.equal(autoTitle({ type: 'pages', value: 1200 }, 2), 'Ler 2 livros com mais de 1.200 páginas');
  assert.equal(challengeTitle(normalizeChallenge({ year: 2026, target: 2, title: '  Clube  ', rule: { type: 'manual' } })), 'Clube');
  assert.equal(ruleText({ type: 'tag', value: 'Clássico' }), 'Etiqueta “Clássico”');
  for (const t of CHALLENGE_TEMPLATES) {
    assert.ok(CHALLENGE_TYPES.includes(t.rule.type), t.key);
    assert.ok(normalizeChallenge({ year: 2026, ...t }), `sugestão ${t.key} é válida`);
  }
  assert.equal(CHALLENGE_TEMPLATES.length, 8);
});

// ---------- Dados ----------

test('normalizeChallenge: limpa, preserva e não perde desafio de tipo desconhecido', () => {
  assert.equal(normalizeChallenge(null), null);
  assert.equal(normalizeChallenge({ year: 2026, target: 0, rule: { type: 'reread' } }), null, 'meta 0');
  assert.equal(normalizeChallenge({ year: 'x', target: 1, rule: { type: 'reread' } }), null, 'sem ano');
  const c = normalizeChallenge({ id: 'a', year: '2026', target: '3', title: 'x'.repeat(200), rule: { type: 'pages', value: '450' }, books: ['z'] });
  assert.deepEqual(c, { id: 'a', year: 2026, title: 'x'.repeat(80), target: 3, rule: { type: 'pages', value: 450 }, books: [] });
  assert.deepEqual(normalizeChallenge({ id: 'b', year: 2026, target: 1, rule: { type: 'voar', value: 'alto' } }).rule, { type: 'manual', value: null });
  assert.deepEqual(normalizeChallenge({ id: 'c', year: 2026, target: 1, rule: { type: 'tag', value: '  ' } }).rule, { type: 'manual', value: null }, 'etiqueta vazia');
  assert.deepEqual(normalizeChallenge({ id: 'd', year: 2026, target: 1, rule: { type: 'series', value: '' } }).rule, { type: 'series', value: null }, 'série sem nome = qualquer série');
  assert.deepEqual(normalizeChallenge({ id: 'e', year: 2026, target: 1, rule: { type: 'manual' }, books: ['x', 'x', 3, '', 'y'] }).books, ['x', 'y']);
});

test('normalizeState: backup antigo sem desafios importa igual (lista vazia); ida e volta preserva tudo', () => {
  const old = { app: 'leituras', schemaVersion: 2, data: { books: [{ id: 'a', title: 'A', status: 'lido', endDate: '2026-01-02' }], goals: { 2026: 10 } } };
  const imported = parseBackup(JSON.stringify(old));
  assert.deepEqual(imported.challenges, []);
  assert.equal(imported.books.length, 1);
  assert.deepEqual(createEmptyState().challenges, []);
  const v1 = parseBackup(JSON.stringify({ app: 'leituras', schemaVersion: 1, data: { books: [] } }));
  assert.deepEqual(v1.challenges, []);

  let state = normalizeState({ books: [{ id: 'a', title: 'A', status: 'lido', endDate: '2026-01-02',
    journal: [{ date: '2026-01-01', from: 0, to: 20, unit: 'page', note: '', minutes: 30, hours: { 21: 30 } }] }] });
  state = saveChallenge(state, { id: 'c1', year: 2026, target: 2, title: 'Meu', rule: { type: 'manual' }, books: ['a'] }).state;
  state = saveChallenge(state, { id: 'c2', year: 2026, target: 1, rule: { type: 'pages', value: 500 } }).state;
  const back = parseBackup(serializeBackup(state, '2026-10-26T00:00:00.000Z'));
  assert.deepEqual(back, state);
  assert.deepEqual(normalizeState(JSON.parse(JSON.stringify(back))), back, 'normalizar de novo não muda nada');
  assert.deepEqual(back.books[0].journal[0].hours, { 21: 30 });
  assert.equal(normalizeState({ challenges: 'lixo' }).challenges.length, 0);
  assert.equal(normalizeState({ challenges: [{ id: 'x', year: 2026, target: 1, rule: { type: 'reread' } }, { id: 'x', year: 2026, target: 2, rule: { type: 'reread' } }] }).challenges.length, 1, 'id repetido');
});

test('desafios: mudar livros (upsert, excluir, restaurar) não mexe nos desafios', () => {
  let state = saveChallenge(createEmptyState(), { year: 2026, target: 1, rule: { type: 'reread' } }).state;
  state = upsertBook(state, { id: 'a', title: 'A' }).state;
  const removed = removeBook(state, 'a');
  assert.equal(removed.challenges.length, 1);
  assert.equal(restoreBook(removed, state.books[0], 0).challenges.length, 1);
});

test('desafios: criar, editar, excluir e Desfazer na mesma posição; marcar livros', () => {
  let state = createEmptyState();
  state = saveChallenge(state, { id: 'a', year: 2026, target: 1, rule: { type: 'reread' } }).state;
  state = saveChallenge(state, { id: 'b', year: 2026, target: 2, rule: { type: 'manual' } }).state;
  state = saveChallenge(state, { id: 'c', year: 2025, target: 3, rule: { type: 'authors' } }).state;
  assert.deepEqual(challengesForYear(state, 2026).map((c) => c.id), ['a', 'b']);
  state = saveChallenge(state, { id: 'a', target: 4 }).state;
  assert.equal(state.challenges[0].target, 4, 'editar mantém o resto');
  assert.equal(state.challenges[0].year, 2026);
  const invalid = saveChallenge(state, { year: 2026, target: 0, rule: { type: 'reread' } });
  assert.equal(invalid.challenge, null);
  assert.equal(invalid.state, state);
  const { state: without, removed, index } = removeChallenge(state, 'b');
  assert.equal(index, 1);
  assert.deepEqual(without.challenges.map((c) => c.id), ['a', 'c']);
  const back = restoreChallenge(without, removed, index);
  assert.deepEqual(back.challenges.map((c) => c.id), ['a', 'b', 'c']);
  assert.equal(restoreChallenge(back, removed, index), back, 'Desfazer duas vezes não duplica');
  let s2 = toggleChallengeBook(back, 'b', 'x');
  assert.deepEqual(s2.challenges[1].books, ['x']);
  s2 = toggleChallengeBook(s2, 'b', 'x');
  assert.deepEqual(s2.challenges[1].books, []);
  assert.equal(toggleChallengeBook(back, 'a', 'x'), back, 'só no tipo manual');
  assert.equal(templateUsed(back, 2026, CHALLENGE_TEMPLATES.find((t) => t.key === 'releituras')), false, 'meta diferente');
});

test('newlyCompleted: avisa só o desafio que já existia e ficou completo agora', () => {
  let before = upsertBook(createEmptyState(), { id: 'a', title: 'A', status: 'lido', endDate: '2026-01-01', pages: 600 }).state;
  before = saveChallenge(before, { id: 'longo', year: 2026, target: 2, rule: { type: 'pages', value: 500 } }).state;
  before = saveChallenge(before, { id: 'feito', year: 2026, target: 1, rule: { type: 'pages', value: 500 } }).state;
  const after = upsertBook(before, { id: 'b', title: 'B', status: 'lido', endDate: '2026-02-01', pages: 700 }).state;
  assert.deepEqual(newlyCompleted(before, after).map((c) => c.id), ['longo']);
  assert.deepEqual(newlyCompleted(after, after), []);
  const created = saveChallenge(after, { id: 'novo', year: 2026, target: 1, rule: { type: 'pages', value: 500 } }).state;
  assert.deepEqual(newlyCompleted(after, created), [], 'desafio que já nasce cumprido não é aviso');
});

// ---------- Horário das sessões ----------

test('sessionHours: minutos espalhados pelas horas a partir do início', () => {
  const at = (h, m) => new Date(2026, 9, 26, h, m, 30).getTime();
  assert.deepEqual(sessionHours(at(21, 50), 30), { 21: 10, 22: 20 });
  assert.deepEqual(sessionHours(at(7, 0), 45), { 7: 45 });
  assert.deepEqual(sessionHours(at(23, 30), 90), { 23: 30, 0: 60 });
  assert.equal(sessionHours(at(7, 0), 0), null);
  assert.equal(sessionHours(-1, 10), null);
  const all = sessionHours(at(0, 0), 2000);
  assert.equal(Object.values(all).reduce((s, m) => s + m, 0), 1440, 'no máximo um dia');
});

test('diário: horas normalizadas, somadas no mesmo dia e mantidas pelo registro de página', () => {
  assert.equal(normalizeHours(null), null);
  assert.equal(normalizeHours({ 24: 10, '-1': 5, x: 3, 5: 0 }), null);
  assert.deepEqual(normalizeHours({ 21: 50 }, { 21: 30, 7: '10' }), { 7: 10, 21: 60 });
  const j = normalizeJournal([
    { date: '2026-10-01', from: 0, to: 10, unit: 'page', note: '', minutes: 20, hours: { 21: 20 } },
    { date: '2026-10-01', from: 10, to: 30, unit: 'page', note: '', minutes: 15, hours: { 22: 15 } },
    { date: '2026-10-02', from: 30, to: 40, unit: 'page', note: '', hours: 'lixo' },
  ]);
  assert.deepEqual(j[0], { date: '2026-10-01', from: 0, to: 30, unit: 'page', note: '', minutes: 35, hours: { 21: 20, 22: 15 } });
  assert.equal('hours' in j[1], false, 'sem horas válidas: sem o campo (formato antigo)');
  const b = { format: 'fisico', currentPage: 30, journal: j };
  const withTime = addMinutes(b, 20, '2026-10-01', { 23: 20 });
  assert.deepEqual(withTime[0].hours, { 21: 20, 22: 15, 23: 20 });
  assert.deepEqual(addMinutes(b, 10, '2026-10-03', { 6: 10 }).at(-1), { date: '2026-10-03', from: 40, to: 40, unit: 'page', note: '', minutes: 10, hours: { 6: 10 } });
  assert.equal('hours' in addMinutes(b, 10, '2026-10-03').at(-1), false, 'sem horas: entrada como antes');
  const moved = recordProgress({ ...b, journal: withTime }, 50, 'page', '2026-10-01');
  assert.deepEqual(moved[0].hours, { 21: 20, 22: 15, 23: 20 });
});

test('hourDistribution: minutos por hora, pico, período e base mínima', () => {
  const books = [book({ journal: [
    { date: '2026-10-01', from: 0, to: 10, unit: 'page', note: '', minutes: 40, hours: { 21: 30, 22: 10 } },
    { date: '2026-10-02', from: 10, to: 20, unit: 'page', note: '', minutes: 40, hours: { 7: 40 } },
    { date: '2026-10-03', from: 20, to: 30, unit: 'page', note: '', minutes: 30, hours: { 21: 30 } },
    { date: '2025-10-03', from: 0, to: 5, unit: 'page', note: '', minutes: 30, hours: { 3: 30 } },
  ] })];
  const d = hourDistribution(books, 2026);
  assert.equal(d.total, 110);
  assert.equal(d.days, 3);
  assert.equal(d.peak, 21);
  assert.equal(d.period, 'à noite');
  assert.equal(d.enough, true);
  assert.equal(d.minutes[7], 40);
  assert.equal(hourDistribution(books, 2025).enough, false, 'um dia só');
  assert.equal(hourDistribution([book()], 2026).peak, null);
  assert.deepEqual([0, 6, 12, 18].map(dayPeriod), ['de madrugada', 'de manhã', 'à tarde', 'à noite']);
});

// ---------- Velocidade e fila ----------

test('speedStats: páginas por hora só com minutos e avanço; áudio fica de fora', () => {
  const books = [
    book({ journal: [
      { date: '2026-10-01', from: 0, to: 30, unit: 'page', note: '', minutes: 60 },
      { date: '2026-10-02', from: 30, to: 50, unit: 'page', note: '', minutes: 20 },
      { date: '2026-10-03', from: 50, to: 90, unit: 'page', note: '' },
      { date: '2026-10-04', from: 90, to: 90, unit: 'page', note: '', minutes: 30 },
    ] }),
    { ...book(), format: 'audio', journal: [{ date: '2026-10-01', from: 0, to: 300, unit: 'page', note: '', minutes: 10 }] },
  ];
  const s = speedStats(books, 2026);
  assert.deepEqual(s, { pagesPerHour: 38, pages: 50, minutes: 80, sessions: 2, enough: true });
  assert.equal(speedStats(books, 2025).pagesPerHour, null);
  assert.equal(speedStats([book({ journal: [{ date: '2026-10-01', from: 0, to: 30, unit: 'page', note: '', minutes: 60 }] })]).enough, false);
});

test('recentPagesPerDay e queueForecast: ritmo dos últimos 30 dias e a fila', () => {
  const today = '2026-10-26';
  const daily = Array.from({ length: 6 }, (_, i) => ({ date: `2026-10-${String(20 + i).padStart(2, '0')}`, from: i * 25, to: (i + 1) * 25, unit: 'page', note: '' }));
  const reading = book({ status: 'lendo', endDate: null, currentPage: 150, pages: 500, journal: daily });
  const pace = recentPagesPerDay([reading], today);
  assert.deepEqual(pace, { perDay: 5, window: 30, days: 6 });
  // Sem diário recente: livro terminado sem diário na janela de 90 dias.
  assert.deepEqual(recentPagesPerDay([book({ endDate: '2026-08-15', pages: 450 })], today), { perDay: 5, window: 90, days: 0 });
  assert.equal(recentPagesPerDay([book({ endDate: '2026-01-15' })], today), null);
  assert.equal(recentPagesPerDay([], today), null);

  const want = (id, pages) => ({ ...book({ status: 'quero', endDate: null, pages }), id });
  // 'audio' ainda não é um formato do app (normalizeBook o trocaria): o livro vai cru, como viria de um formato novo.
  const state = { ...normalizeState({ books: [reading, want('q1', 100), want('q2', 400), want('q3', null)], upNext: ['q2'] }) };
  state.books = [...state.books, { ...want('q4', 900), format: 'audio' }];
  const f = queueForecast(state, today);
  assert.equal(f.pace.perDay, 5);
  assert.deepEqual(f.next, { count: 1, pages: 400, missing: 0, days: 80 });
  assert.deepEqual(f.all, { count: 3, pages: 500, missing: 1, days: 100 }, 'áudio fora; sem páginas só contado');
  const empty = queueForecast(normalizeState({ books: [] }), today);
  assert.equal(empty.pace, null);
  assert.deepEqual(empty.all, { count: 0, pages: 0, missing: 0, days: null });
});

test('bookEstimate: dias pelo ritmo recente e horas pela velocidade', () => {
  const today = '2026-10-26';
  const journal = Array.from({ length: 4 }, (_, i) => ({ date: `2026-10-2${i}`, from: i * 30, to: (i + 1) * 30, unit: 'page', note: '', minutes: 60 }));
  const books = [book({ status: 'lendo', endDate: null, currentPage: 120, journal })];
  const e = bookEstimate(books, { pages: 300, format: 'fisico' }, today);
  assert.equal(e.days, 75, '120 págs. em 30 dias = 4 por dia');
  assert.equal(e.hours, 10, '30 págs. por hora');
  assert.equal(bookEstimate(books, { pages: null }, today), null);
  assert.equal(bookEstimate(books, { pages: 300, format: 'audio' }, today), null);
  assert.equal(bookEstimate([], { pages: 300 }, today), null);
});

test('formatDuration e formatHours', () => {
  assert.equal(formatDuration(0), '');
  assert.equal(formatDuration(1), '~1 dia');
  assert.equal(formatDuration(12), '~12 dias');
  assert.equal(formatDuration(20), '~3 semanas');
  assert.equal(formatDuration(80), '~3 meses');
  assert.equal(formatDuration(400), '~1 ano');
  assert.equal(formatDuration(600), '~1,5 anos');
  assert.equal(formatHours(0.4), '~25 min');
  assert.equal(formatHours(1.5), '~1 h 30 min');
  assert.equal(formatHours(10.2), '~10 h');
  assert.equal(formatHours(0), '');
});
