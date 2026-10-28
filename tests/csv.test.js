import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CSV_COLUMNS, bookCsvRow, booksToCsv, buildCsv, csvField, csvFileName } from '../app/js/csv.js';
import { normalizeBook } from '../app/js/store.js';

test('csvField: aspas só quando precisa, dobrando as aspas internas', () => {
  assert.equal(csvField('Dom Casmurro'), 'Dom Casmurro');
  assert.equal(csvField('Sapiens; uma breve história'), '"Sapiens; uma breve história"');
  assert.equal(csvField('O "Gerente" Minuto'), '"O ""Gerente"" Minuto"');
  assert.equal(csvField('linha 1\nlinha 2'), '"linha 1\nlinha 2"');
  assert.equal(csvField('a\r\nb'), '"a\r\nb"');
  assert.equal(csvField(' espaço'), '" espaço"');
  assert.equal(csvField('vírgula, ok'), 'vírgula, ok');
  assert.equal(csvField(null), '');
  assert.equal(csvField(undefined), '');
  assert.equal(csvField(0), '0');
});

test('buildCsv: BOM, separador ; e CRLF', () => {
  const out = buildCsv([['a', 'b;c'], ['1', '2']]);
  assert.ok(out.startsWith('﻿'));
  assert.equal(out, '﻿a;"b;c"\r\n1;2\r\n');
});

test('linha do livro no padrão brasileiro', () => {
  const book = normalizeBook({
    id: 'x', title: 'Duna', authors: 'Frank Herbert', status: 'lido', format: 'kindle', genre: 'Ficção',
    tags: ['clássico', 'presente'], series: 'Duna', seriesNumber: 1.5, pages: 680,
    startDate: '2026-01-02', endDate: '2026-02-03', rating: 4.5, favorite: true, reread: true,
    isbn: '9788576573135', notes: 'Muito bom; "épico".',
  });
  assert.deepEqual(bookCsvRow(book), [
    'Duna', 'Frank Herbert', 'Lido', 'Kindle', 'Ficção', 'clássico, presente', 'Duna', '1,5', 680, '',
    '02/01/2026', '03/02/2026', '4,5', 'Sim', 'Sim', '', '9788576573135', 'Muito bom; "épico".',
  ]);
  const dropped = normalizeBook({ id: 'y', title: 'Chato', status: 'abandonado', endDate: '2026-03-01', dropReason: 'Não prendeu' });
  const row = bookCsvRow(dropped);
  assert.equal(row[2], 'Abandonei');
  assert.equal(row[3], 'Físico');
  assert.equal(row[8], '');
  assert.equal(row[9], '');
  assert.equal(row[12], '');
  assert.equal(row[13], '');
  assert.equal(row[15], 'Não prendeu');
});

test('planilha completa: cabeçalho e um livro por linha, do mais recente ao mais antigo', () => {
  const books = [
    normalizeBook({ id: 'a', title: 'Antigo', status: 'lido', endDate: '2025-05-01' }),
    normalizeBook({ id: 'b', title: 'Recente', status: 'lido', endDate: '2026-05-01', notes: 'várias\nlinhas' }),
  ];
  const csv = booksToCsv(books);
  const lines = csv.slice(1).split('\r\n');
  assert.equal(lines[0], CSV_COLUMNS.join(';'));
  assert.equal(CSV_COLUMNS.length, 18);
  assert.match(lines[1], /^Recente;/);
  assert.match(lines[1], /"várias\nlinhas"$/);
  assert.match(lines[2], /^Antigo;/);
  assert.equal(lines[3], '');
  assert.equal(csvFileName('2026-10-16'), 'leituras-planilha-2026-10-16.csv');
});
