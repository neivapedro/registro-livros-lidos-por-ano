// 1.6: humor e ritmo, avaliação por critérios, sinopse e empréstimo / "Onde comprar".
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  MOODS, descriptionFromSource, loanLabel, loanNames, moodProfile, normalizeCriteria, normalizeDescription, normalizeLoan,
  normalizeMoods, shopLinks, toggleMood,
} from '../app/js/book-meta.js';
import { normalizeBook, normalizeState, parseBackup, serializeBackup, startReread, upsertBook, createEmptyState } from '../app/js/store.js';
import { CSV_COLUMNS, bookCsvRow } from '../app/js/csv.js';
import { fetchWorkDescription, normalizeBrasilApiBook, normalizeGoogleVolume } from '../app/js/books-api.js';
import { enrichAiResults } from '../app/js/ai-search.js';
import { bookDetailView } from '../app/js/views/book-detail.js';
import { formView, detailsSummary } from '../app/js/views/form.js';
import { quickMenu } from '../app/js/views/sheets.js';
import { readerProfileCard } from '../app/js/views/meta-ui.js';
import { bookItem } from '../app/js/ui.js';

const TODAY = '2026-10-16';
const NOW = '2026-10-16T12:00:00.000Z';
const base = (extra = {}) => ({ id: 'b1', title: 'Torto Arado', authors: 'Itamar Vieira Junior', status: 'lido', endDate: '2026-10-02', ...extra });

// ---------- Dados ----------

test('normalizeBook: livro antigo (sem os campos da 1.6) ganha os padrões', () => {
  const b = normalizeBook(base(), NOW);
  assert.deepEqual([b.moods, b.pace, b.criteria, b.description, b.loan], [[], null, {}, '', null]);
});

test('normalizeBook: humor só da lista, sem repetir, na ordem da lista; ritmo só lento/médio/rápido', () => {
  const b = normalizeBook(base({ moods: ['triste', 'reflexivo', 'TRISTE', 'triste', 42, 'inventado', null], pace: 'rapido' }), NOW);
  assert.deepEqual(b.moods, ['reflexivo', 'triste']);
  assert.equal(b.pace, 'rapido');
  assert.equal(normalizeBook(base({ pace: 'Rápido' }), NOW).pace, null);
  assert.equal(normalizeBook(base({ pace: ['lento'] }), NOW).pace, null);
  assert.deepEqual(normalizeBook(base({ moods: 'tenso' }), NOW).moods, []);
  assert.equal(MOODS.length, 12);
  // Humor e ritmo valem em qualquer status (não se perdem ao trocar de status).
  assert.deepEqual(normalizeBook(base({ status: 'quero', moods: ['leve'], pace: 'lento' }), NOW).moods, ['leve']);
});

test('normalizeBook: critérios de meia em meia estrela, só conhecidos, só em Lido; a nota principal é independente', () => {
  const b = normalizeBook(base({ rating: 3, criteria: { personagens: 4.3, enredo: '4,5', escrita: 0, emocao: 7, extra: 5, ritmo: 2 } }), NOW);
  assert.deepEqual(b.criteria, { personagens: 4.5, enredo: 4.5 });
  assert.equal(b.rating, 3);
  assert.deepEqual(normalizeBook(base({ status: 'lendo', startDate: '2026-10-01', criteria: { enredo: 4 } }), NOW).criteria, {});
  for (const bad of [null, 'x', [4, 5], 5]) assert.deepEqual(normalizeCriteria(bad), {});
  assert.deepEqual(normalizeCriteria({ enredo: Infinity, escrita: NaN, personagens: '  ' }), {});
});

test('normalizeBook: sinopse em texto puro, sem controles, até 2000 letras; aplicar de novo dá o mesmo', () => {
  const raw = `  Primeiro parágrafo\r\n\r\n\r\n\r\nSegundo\tcom   espaços\u0007 <b>e marcação digitada</b> & 3 < 4  `;
  const b = normalizeBook(base({ description: raw }), NOW);
  assert.equal(b.description, 'Primeiro parágrafo\n\nSegundo com espaços <b>e marcação digitada</b> & 3 < 4');
  assert.equal(normalizeDescription(b.description), b.description);
  assert.equal(normalizeBook(base({ description: 'x'.repeat(5000) }), NOW).description.length, 2000);
  assert.equal(normalizeBook(base({ description: { value: 'objeto' } }), NOW).description, '');
  // Emoji cortado ao meio no limite não deixa metade solta.
  const emoji = normalizeDescription(`${'a'.repeat(1999)}😀`);
  assert.equal(emoji, 'a'.repeat(1999));
});

test('normalizeBook: empréstimo { to, since } (sem nome, sem empréstimo; data inválida vira null)', () => {
  assert.deepEqual(normalizeBook(base({ loan: { to: '  Ana   Paula ', since: '2026-10-03', x: 1 } }), NOW).loan, { to: 'Ana Paula', since: '2026-10-03' });
  assert.deepEqual(normalizeLoan({ to: 'Ana', since: '03/10/2026' }), { to: 'Ana', since: null });
  for (const bad of [null, 'Ana', { to: '   ' }, { since: '2026-10-03' }, { to: 42 }]) assert.equal(normalizeLoan(bad), null);
  assert.equal(normalizeLoan({ to: 'x'.repeat(200) }).to.length, 60);
  // Vale em qualquer status (livro na fila também pode estar emprestado).
  assert.equal(normalizeBook(base({ status: 'quero', loan: { to: 'Ana' } }), NOW).loan.to, 'Ana');
});

test('backup: os campos novos vão e voltam; backup antigo (sem eles) continua entrando', () => {
  const book = normalizeBook(base({
    moods: ['tenso', 'emocionante'], pace: 'medio', criteria: { escrita: 5, enredo: 3.5 },
    description: 'Sinopse\n\ncom parágrafo.', loan: { to: 'Karoline', since: '2026-09-28' },
  }), NOW);
  const state = { ...createEmptyState(), books: [book] };
  const back = parseBackup(serializeBackup(state, NOW));
  assert.deepEqual(back.books[0], book);
  assert.deepEqual(back.books[0].moods, ['emocionante', 'tenso']);
  // Backup da 1.5 (schemaVersion 2, livro sem os campos novos).
  const old = JSON.stringify({ app: 'leituras', schemaVersion: 2, exportedAt: NOW, data: { books: [{ id: 'v', title: 'Velho', status: 'lido', endDate: '2025-01-01', rating: 4 }], goals: {} } });
  const imported = parseBackup(old).books[0];
  assert.deepEqual([imported.title, imported.rating, imported.moods, imported.pace, imported.criteria, imported.description, imported.loan], ['Velho', 4, [], null, {}, '', null]);
  // E o estado normalizado de novo não muda (idempotente).
  assert.deepEqual(normalizeState(JSON.parse(JSON.stringify(back))).books, back.books);
});

test('upsertBook e releitura: sinopse vai para a nova leitura; humor, critérios e empréstimo não', () => {
  const { state } = upsertBook(createEmptyState(), base({ moods: ['leve'], pace: 'rapido', criteria: { enredo: 4 }, description: 'Sobre o livro.', loan: { to: 'Ana' } }), NOW);
  const { book } = startReread(state, 'b1', TODAY, NOW);
  assert.equal(book.description, 'Sobre o livro.');
  assert.deepEqual([book.moods, book.pace, book.criteria, book.loan], [[], null, {}, null]);
});

test('toggleMood liga e desliga, sempre na ordem da lista', () => {
  assert.deepEqual(toggleMood([], 'triste'), ['triste']);
  assert.deepEqual(toggleMood(['triste'], 'leve'), ['leve', 'triste']);
  assert.deepEqual(toggleMood(['leve', 'triste'], 'leve'), ['triste']);
  assert.deepEqual(normalizeMoods(undefined), []);
});

// ---------- Sinopse vinda das buscas ----------

test('descriptionFromSource: HTML vira texto (parágrafos, quebras, entidades), sem script', () => {
  const html = '<p>Um <b>romance</b> &amp; uma saga.<br>Linha 2</p><p>Parágrafo&nbsp;2 &#8212; fim &#x2026; &quot;ok&quot;</p><script>alert(1)</script><img src=x onerror=alert(1)>';
  assert.equal(descriptionFromSource(html), 'Um romance & uma saga.\nLinha 2\n\nParágrafo 2 — fim … "ok"');
  // Entidade que vira "<" fica como texto (a tela escapa).
  assert.equal(descriptionFromSource('Nota: 3 &lt; 4 &lt;b&gt;'), 'Nota: 3 < 4 <b>');
  assert.equal(descriptionFromSource('Fim com tag cortada <a href="'), 'Fim com tag cortada');
  // Open Library: objeto { type, value } e as notas de fonte em Markdown no fim.
  assert.equal(descriptionFromSource({ type: '/type/text', value: 'Obra.\r\n\r\n----------\n([fonte][1])\n\n[1]: https://x.org' }), 'Obra.');
  for (const junk of [null, 42, '', '...', ' - ', 'N/A', { value: 3 }]) assert.equal(descriptionFromSource(junk), '', String(junk));
});

test('descriptionFromSource: longa demais, corta numa palavra com "…" (até 2000)', () => {
  const long = Array.from({ length: 600 }, (_, i) => `palavra${i}`).join(' ');
  const out = descriptionFromSource(long);
  assert.ok(out.length <= 2000);
  assert.ok(out.endsWith('…'));
  assert.match(out, /palavra\d+…$/);
});

test('buscas: Google (description), BrasilAPI (synopsis) e Open Library (obra, ao escolher)', async () => {
  const g = normalizeGoogleVolume({ id: 'a', volumeInfo: { title: 'X', description: '<p>Sinopse do <i>Google</i>.</p>' } });
  assert.equal(g.description, 'Sinopse do Google.');
  const br = normalizeBrasilApiBook({ title: 'Y', isbn: '9788521315315', synopsis: 'Sinopse da editora.' });
  assert.equal(br.description, 'Sinopse da editora.');
  const asked = [];
  const fetchImpl = async (url) => {
    asked.push(url);
    return { ok: true, status: 200, json: async () => ({ description: 'Da obra.' }) };
  };
  assert.equal(await fetchWorkDescription('/works/OL1W', { fetchImpl }), 'Da obra.');
  assert.deepEqual(asked, ['https://openlibrary.org/works/OL1W.json']);
  assert.equal(await fetchWorkDescription('/books/OL1M', { fetchImpl }), '');
  assert.equal(await fetchWorkDescription('https://evil.example/works/OL1W', { fetchImpl }), '');
  assert.equal(asked.length, 1);
  const failing = async () => { throw new Error('rede'); };
  assert.equal(await fetchWorkDescription('/works/OL1W', { fetchImpl: failing }), '');
});

test('busca com IA: a sinopse só vem da base oficial que confirmou o ISBN (a IA não escreve sinopse)', async () => {
  const ai = { title: 'Livro', authors: 'Autora', isbn: '9788521315315', pages: null, year: null, cover: null, description: 'inventada' };
  const [r] = await enrichAiResults([ai], async () => ({ title: 'Livro', authors: 'Autora', description: 'Da editora.', source: 'BrasilAPI' }));
  assert.equal(r.description, 'Da editora.');
  const [r2] = await enrichAiResults([ai], async () => ({ title: 'Livro', authors: 'Autora', source: 'Open Library' }));
  assert.equal(r2.description, '');
});

// ---------- Empréstimo e lojas ----------

test('loanLabel e loanNames', () => {
  assert.equal(loanLabel({ to: 'Ana', since: '2026-10-03' }, TODAY), 'com Ana desde 3 out');
  assert.equal(loanLabel({ to: 'Ana', since: '2025-12-20' }, TODAY), 'com Ana desde 20 dez 2025');
  assert.equal(loanLabel({ to: 'Ana', since: null }, TODAY), 'com Ana');
  assert.equal(loanLabel(null), '');
  const books = [
    { loan: { to: 'ana', since: '2026-01-01' } }, { loan: { to: 'Bruno', since: '2026-05-01' } }, { loan: { to: 'Ana', since: '2026-09-01' } }, { loan: null },
  ];
  assert.deepEqual(loanNames(books), ['Ana', 'Bruno']);
});

test('shopLinks: Amazon e Estante Virtual pelo ISBN, ou título + primeiro autor; sem afiliado', () => {
  assert.deepEqual(shopLinks({ title: 'Duna', authors: 'Frank Herbert', isbn: '978-85-7657-313-5' }).map((l) => l.href), [
    'https://www.amazon.com.br/s?k=9788576573135', 'https://www.estantevirtual.com.br/busca?q=9788576573135',
  ]);
  const [amazon] = shopLinks({ title: 'Cem Anos de Solidão & cia', authors: 'Gabriel García Márquez, Outro', isbn: '' });
  assert.equal(amazon.href, 'https://www.amazon.com.br/s?k=Cem%20Anos%20de%20Solid%C3%A3o%20%26%20cia%20Gabriel%20Garc%C3%ADa%20M%C3%A1rquez');
  for (const l of shopLinks({ title: 'X' })) assert.doesNotMatch(l.href, /tag=|affiliate|ref=/);
  assert.deepEqual(shopLinks({ title: '' }), []);
});

// ---------- Perfil de leitor ----------

test('moodProfile: só livros lidos no ano com dados; humores do mais comum, ritmo lento → rápido', () => {
  const books = [
    base({ id: 'a', moods: ['tenso', 'emocionante'], pace: 'rapido' }),
    base({ id: 'b', moods: ['tenso'], pace: 'rapido' }),
    base({ id: 'c', moods: ['reflexivo'], pace: 'lento' }),
    base({ id: 'd', pace: 'medio' }),
    base({ id: 'e' }),
    base({ id: 'f', endDate: '2025-05-01', moods: ['leve'] }),
    base({ id: 'g', status: 'lendo', endDate: null, moods: ['leve'] }),
    base({ id: 'h', status: 'abandonado', moods: ['leve'] }),
  ];
  const p = moodProfile(books, 2026);
  assert.deepEqual([p.read, p.withMoods, p.withPace, p.withAny], [5, 3, 4, 4]);
  assert.deepEqual(p.moods.map((m) => [m.id, m.count, m.pct]), [['tenso', 2, 67], ['emocionante', 1, 33], ['reflexivo', 1, 33]]);
  assert.deepEqual(p.paces.map((x) => [x.id, x.count, x.pct]), [['lento', 1, 25], ['medio', 1, 25], ['rapido', 2, 50]]);
  const none = moodProfile([base({ id: 'z' })], 2026);
  assert.deepEqual([none.read, none.withAny, none.moods, none.paces.map((x) => x.count)], [1, 0, [], [0, 0, 0]]);
});

test('perfil de leitor (Resumo): frase, barras e ritmo; convite quando não há dados; nada sem livros lidos', () => {
  const books = [base({ id: 'a', moods: ['tenso', 'inspirador'], pace: 'rapido' }), base({ id: 'b', moods: ['tenso'] })];
  const html = readerProfileCard(books, 2026);
  assert.match(html, /Seu perfil de leitor/);
  assert.match(html, /você leu mais livros <strong>tensos e inspiradores<\/strong>/);
  assert.match(html, /2 de 2 livros/);
  assert.match(html, /Tenso<\/span><span class="muted">2 livros · 100%/);
  assert.match(html, /aria-label="Lento: 0 livros, Médio: 0 livros, Rápido: 1 livro"/);
  assert.match(readerProfileCard([base()], 2026), /is-empty[\s\S]*Marque o <strong>humor<\/strong>/);
  assert.equal(readerProfileCard([base()], 2024), '');
});

// ---------- Telas ----------

const detail = (b, state = { books: [b], upNext: [] }) => bookDetailView({ state, ui: { detailBack: '#/estante', session: null }, today: TODAY, book: b });

test('ficha: chips de humor e ritmo, critérios com barras, sinopse escapada com "Ler mais"', () => {
  const b = normalizeBook(base({
    rating: 4.5, moods: ['sombrio', 'emocionante'], pace: 'medio', criteria: { personagens: 5, escrita: 3.5 },
    description: 'Texto <img src=x onerror=alert(1)> & mais',
  }), NOW);
  const html = detail(b);
  assert.match(html, /<div class="ficha-moods" aria-label="Humor e ritmo"><span class="ficha-chip is-mood">Emocionante<\/span><span class="ficha-chip is-mood">Sombrio<\/span><span class="ficha-chip is-pace">/);
  assert.match(html, /Ritmo médio/);
  assert.match(html, /<dt>Personagens<\/dt>[\s\S]*width:100%[\s\S]*<dt>Escrita<\/dt>[\s\S]*width:70%/);
  assert.doesNotMatch(html, /<dt>Enredo/);
  assert.match(html, /Texto &lt;img src=x onerror=alert\(1\)&gt; &amp; mais/);
  assert.doesNotMatch(html, /<img src=x/);
  assert.match(html, /data-action="synopsis-more"[^>]*aria-expanded="false"[^>]*>Ler mais/);
  assert.match(html, /data-action="loan-open"[^>]*><span>Emprestei para alguém/);
  assert.doesNotMatch(html, /ficha-shop/, 'livro lido: sem "Onde comprar"');
});

test('ficha: emprestado mostra o selo e o cartão com "Devolvido"; Quero ler tem "Onde comprar"', () => {
  const b = normalizeBook(base({ status: 'quero', endDate: null, isbn: '9788576573135', loan: { to: 'Ana <b>', since: '2026-10-03' } }), NOW);
  const html = detail(b);
  assert.match(html, /class="ficha-loan">[\s\S]*<span>com Ana &lt;b&gt; desde 3 out<\/span>/);
  assert.match(html, /<strong>Ana &lt;b&gt;<\/strong><span class="ficha-loan-when">Desde 3 out 2026 · há 13 dias<\/span>/);
  assert.match(html, /data-action="loan-return" data-id="b1">[\s\S]*Devolvido/);
  assert.match(html, /<a class="ficha-shop-link" href="https:\/\/www\.amazon\.com\.br\/s\?k=9788576573135" target="_blank" rel="noopener noreferrer"/);
  assert.match(html, /estantevirtual\.com\.br\/busca\?q=9788576573135/);
  // Livro sem nada novo: nenhuma das seções.
  const plain = detail(normalizeBook(base(), NOW));
  assert.doesNotMatch(plain, /ficha-moods|ficha-crit|ficha-syn|class="ficha-loan"/);
});

test('lista: a linha do livro emprestado diz com quem está', () => {
  const html = bookItem(normalizeBook(base({ loan: { to: 'Ana', since: '2026-10-03' } }), NOW));
  assert.match(html, /<span class="li-loan">com Ana desde 3 out<\/span>/);
  assert.doesNotMatch(bookItem(normalizeBook(base(), NOW)), /li-loan/);
});

test('menu rápido: "Emprestei para…" ou "Devolvido"', () => {
  const want = normalizeBook(base({ status: 'quero', endDate: null }), NOW);
  assert.match(quickMenu(want, { upNext: [] }), /data-action="loan-open" data-id="b1">[\s\S]*Emprestei para…/);
  const lent = { ...want, loan: { to: 'Ana <i>', since: null } };
  assert.match(quickMenu(lent, { upNext: [] }), /data-action="loan-return"[\s\S]*Devolvido \(estava com Ana &lt;i&gt;\)/);
});

const form = (draft, ui = {}) => formView({
  state: { books: [], customGenres: [], upNext: [] }, today: TODAY, isEdit: true,
  ui: { draft, backHref: '#/inicio', formErrors: [], lookup: { query: '', results: [] }, bookTab: 'dados', ...ui },
});

test('formulário: critérios recolhidos (abre sozinho com notas), humor e ritmo, sinopse; Quero ler sem humor', () => {
  const draft = normalizeBook(base({ rating: 4 }), NOW);
  let html = form(draft);
  assert.match(html, /data-action="toggle-criteria" aria-expanded="false"/);
  assert.doesNotMatch(html, /crit-row/);
  assert.match(html, /Personagens, enredo, escrita e emoção/);
  const rated = { ...draft, criteria: { enredo: 3.5 } };
  html = form(rated);
  assert.match(html, /aria-expanded="true"/);
  assert.match(html, /aria-label="Enredo: 3,5 estrelas" aria-pressed="true"/);
  assert.equal((html.match(/data-action="set-criterion"/g) || []).length, 40);
  html = form({ ...draft, moods: ['leve'], pace: 'lento', description: 'Sobre <b>' });
  assert.match(html, /data-action="toggle-mood" data-value="leve" aria-pressed="true"/);
  assert.equal((html.match(/data-action="toggle-mood"/g) || []).length, 12);
  assert.match(html, /data-action="set-pace" data-value="lento" aria-pressed="true"/);
  assert.match(html, /<textarea id="f-description"[^>]*maxlength="2000"[^>]*>Sobre &lt;b&gt;<\/textarea>/);
  const want = form({ ...draft, status: 'quero', moods: ['leve'] });
  assert.doesNotMatch(want, /toggle-mood|toggle-criteria/);
  assert.match(want, /f-description/);
  assert.doesNotMatch(form({ ...draft, status: 'lendo' }), /toggle-criteria/);
});

test('"Mais detalhes": o resumo fala do humor, do ritmo e da sinopse', () => {
  const d = normalizeBook(base({ moods: ['leve', 'tenso'], pace: 'rapido', description: 'x' }), NOW);
  assert.equal(detailsSummary(d), '2 humores · ritmo rápido · com sinopse');
  assert.equal(detailsSummary(normalizeBook(base({ status: 'quero', endDate: null }), NOW)), 'Gênero, série, etiquetas, sinopse e anotações');
  assert.equal(detailsSummary(normalizeBook(base({ status: 'lendo', endDate: null, startDate: '2026-10-01' }), NOW)), 'Gênero, série, etiquetas, humor, sinopse, data alvo e anotações');
});

test('planilha: colunas da 1.6 no fim (humor, ritmo, critérios, sinopse, empréstimo)', () => {
  assert.deepEqual(CSV_COLUMNS.slice(-9), ['Humor', 'Ritmo', 'Personagens', 'Enredo', 'Escrita', 'Emoção', 'Sinopse', 'Emprestado para', 'Emprestado desde']);
  const row = bookCsvRow(normalizeBook(base({
    moods: ['tenso', 'emocionante'], pace: 'medio', criteria: { personagens: 4.5, emocao: 3 }, description: 'Sobre; "o" livro', loan: { to: 'Ana', since: '2026-10-03' },
  }), NOW));
  assert.deepEqual(row.slice(-9), ['Emocionante, Tenso', 'Médio', '4,5', '', '', '3', 'Sobre; "o" livro', 'Ana', '03/10/2026']);
  assert.equal(row.length, CSV_COLUMNS.length);
});
