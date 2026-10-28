// Planilha (CSV) com os livros, para abrir no Excel, Numbers ou Google Planilhas.
// Só exportação: o backup continua sendo o arquivo .json.
// Padrão do Excel brasileiro: separador ';', vírgula decimal e BOM para os acentos.

import { formatDuration } from './audio.js';
import { formatBR } from './dates.js';
import { FORMAT_LABELS, FORMATS, STATUS_LABELS } from './store.js';

export const CSV_SEPARATOR = ';';
const BOM = '﻿';

export const CSV_COLUMNS = [
  'Título', 'Autor(es)', 'Status', 'Formato', 'Gênero', 'Etiquetas', 'Série', 'Nº', 'Páginas', 'Duração',
  'Início', 'Término', 'Nota', 'Favorito', 'Releitura', 'Abandonado por', 'ISBN', 'Anotações',
];

/** Campo entre aspas quando tem separador, aspas, quebra de linha ou espaço nas pontas. */
export function csvField(value) {
  const text = value === null || value === undefined ? '' : String(value);
  if (/[;"\r\n]/.test(text) || text !== text.trim()) return `"${text.replace(/"/g, '""')}"`;
  return text;
}

/** Linhas → texto CSV com BOM e quebras CRLF (o que o Excel espera). */
export function buildCsv(rows) {
  return BOM + rows.map((row) => row.map(csvField).join(CSV_SEPARATOR)).join('\r\n') + '\r\n';
}

/** 4.5 → '4,5'; vazio continua vazio. */
function decimalBR(n) {
  return n === null || n === undefined || n === '' ? '' : String(n).replace('.', ',');
}

export function bookCsvRow(book) {
  return [
    book.title,
    book.authors,
    STATUS_LABELS[book.status] || '',
    FORMAT_LABELS[book.format] || '',
    book.genre || '',
    (book.tags || []).join(', '),
    book.series || '',
    decimalBR(book.seriesNumber),
    book.pages ?? '',
    // Duração do audiolivro: "9h 45min" (vazio nos outros formatos).
    book.format === FORMATS.AUDIO && book.durationMin ? formatDuration(book.durationMin) : '',
    formatBR(book.startDate),
    formatBR(book.endDate),
    decimalBR(book.rating),
    book.favorite ? 'Sim' : '',
    book.reread ? 'Sim' : '',
    book.dropReason || '',
    book.isbn || '',
    book.notes || '',
  ];
}

/** Planilha completa: cabeçalho e um livro por linha, dos mais recentes para os mais antigos. */
export function booksToCsv(books) {
  const key = (b) => b.endDate || b.startDate || (b.createdAt || '').slice(0, 10);
  const sorted = [...books].sort((a, b) => key(b).localeCompare(key(a)) || a.title.localeCompare(b.title, 'pt-BR'));
  return buildCsv([CSV_COLUMNS, ...sorted.map(bookCsvRow)]);
}

export function csvFileName(today) {
  return `leituras-planilha-${today}.csv`;
}
