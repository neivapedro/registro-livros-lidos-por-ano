import { test } from 'node:test';
import assert from 'node:assert/strict';
import { currentDayStreak, greetingFor, longDate, streakText } from '../app/js/greeting.js';
import { NAME_MAX, NAME_STORAGE, cleanName, readName, saveName } from '../app/js/prefs.js';
import { readingDays } from '../app/js/journal.js';

function memoryStorage(initial = {}) {
  const data = new Map(Object.entries(initial));
  return {
    getItem: (k) => (data.has(k) ? data.get(k) : null),
    setItem: (k, v) => data.set(k, String(v)),
    removeItem: (k) => data.delete(k),
    data,
  };
}

test('saudação pela hora: bom dia de 5h a 11h59, boa tarde de 12h a 17h59, boa noite no resto', () => {
  const expected = { 0: 'Boa noite', 4: 'Boa noite', 5: 'Bom dia', 11: 'Bom dia', 12: 'Boa tarde', 17: 'Boa tarde', 18: 'Boa noite', 23: 'Boa noite' };
  for (const [hour, text] of Object.entries(expected)) assert.equal(greetingFor(Number(hour)), text, `${hour}h`);
});

test('data por extenso em português, com o dia da semana', () => {
  assert.equal(longDate('2026-10-28'), 'quarta, 28 de outubro');
  assert.equal(longDate('2026-10-27'), 'terça, 27 de outubro');
  assert.equal(longDate('2026-03-01'), 'domingo, 1 de março');
  assert.equal(longDate('2026-08-08'), 'sábado, 8 de agosto');
  assert.equal(longDate('2026-02-30'), '');
  assert.equal(longDate(''), '');
});

test('sequência de dias lendo: conta até hoje, ou até ontem se hoje ainda não teve leitura', () => {
  const days = ['2026-10-25', '2026-10-26', '2026-10-27', '2026-10-28', '2026-10-20'];
  assert.deepEqual(currentDayStreak(days, '2026-10-28'), { count: 4, today: true });
  assert.deepEqual(currentDayStreak(new Set(days), '2026-10-29'), { count: 4, today: false });
  assert.deepEqual(currentDayStreak(days, '2026-10-30'), { count: 0, today: false }, 'anteontem não segura a sequência');
  assert.deepEqual(currentDayStreak([], '2026-10-28'), { count: 0, today: false });
  // Virada de mês e de ano.
  assert.equal(currentDayStreak(['2025-12-31', '2026-01-01'], '2026-01-01').count, 2);
  assert.equal(currentDayStreak(['2026-02-28', '2026-03-01'], '2026-03-01').count, 2);
});

test('texto da sequência: discreto, sem cobrança', () => {
  assert.equal(streakText({ count: 0, today: false }), '');
  assert.equal(streakText({ count: 1, today: true }), 'Leitura registrada hoje');
  assert.equal(streakText({ count: 1, today: false }), 'Última leitura ontem');
  assert.equal(streakText({ count: 5, today: true }), '5 dias seguidos lendo');
  assert.equal(streakText({ count: 5, today: false }), '5 dias seguidos lendo');
});

test('a sequência sai do diário de todos os livros (só entradas que avançaram)', () => {
  const books = [
    { journal: [{ date: '2026-10-27', from: 10, to: 30 }, { date: '2026-10-28', from: 30, to: 20 }] },
    { journal: [{ date: '2026-10-28', from: 0, to: 5 }, { date: '2026-10-26', from: 1, to: 9 }] },
  ];
  assert.deepEqual(currentDayStreak(readingDays(books), '2026-10-28'), { count: 3, today: true });
  // Correção para trás não conta como dia de leitura.
  assert.deepEqual(currentDayStreak(readingDays([books[0]]), '2026-10-28'), { count: 1, today: false });
});

test('nome: espaços juntados, sem invisíveis, no máximo 30 caracteres (sem partir emoji)', () => {
  assert.equal(cleanName('  Pedro   Neiva  '), 'Pedro Neiva');
  assert.equal(cleanName('Ka\u200Broline\u0007'), 'Karoline');
  assert.equal(cleanName('\u202Eolleh'), 'olleh');
  assert.equal(cleanName(null), '');
  assert.equal(cleanName(undefined), '');
  assert.equal(cleanName('a'.repeat(40)).length, NAME_MAX);
  const emoji = `${'x'.repeat(29)}📚📚`;
  assert.equal(cleanName(emoji), `${'x'.repeat(29)}📚`);
  // O HTML fica como texto: quem desenha escapa (esc), aqui só se limpa.
  assert.equal(cleanName('<b>Pedro</b>'), '<b>Pedro</b>');
});

test('nome fica só no localStorage do aparelho; vazio apaga; falha ao gravar não quebra', () => {
  const storage = memoryStorage();
  assert.equal(readName(storage), '');
  assert.deepEqual(saveName(storage, '  Karoline '), { ok: true, name: 'Karoline' });
  assert.equal(storage.getItem(NAME_STORAGE), 'Karoline');
  assert.equal(NAME_STORAGE, 'leituras:nome');
  assert.equal(readName(storage), 'Karoline');
  assert.deepEqual(saveName(storage, '   '), { ok: true, name: '' });
  assert.equal(storage.data.has(NAME_STORAGE), false);
  const broken = { getItem() { throw new Error('x'); }, setItem() { throw new Error('x'); }, removeItem() { throw new Error('x'); } };
  assert.equal(readName(broken), '');
  assert.deepEqual(saveName(broken, 'Pedro'), { ok: false, name: 'Pedro' });
  // Valor estranho guardado à mão também sai limpo.
  assert.equal(readName(memoryStorage({ [NAME_STORAGE]: `  ${'y'.repeat(50)} ` })), 'y'.repeat(30));
});
