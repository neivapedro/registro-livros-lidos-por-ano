// 1.5: fundo desfocado da ficha, ritmo sem diário discreto, trechos como citação,
// esqueletos da busca e "Não encontrei" que some enquanto a IA procura.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { bookDetailView, heroBackdrop, loadedHdCovers } from '../app/js/views/book-detail.js';
import { formView, aiCoversLookup, lookupResults, resultSkeleton } from '../app/js/views/form.js';
import { allQuotesResults } from '../app/js/views/all-quotes.js';

const TODAY = '2026-10-16';
const COVER = 'https://covers.openlibrary.org/b/id/123-M.jpg';
const book = (extra = {}) => ({
  id: 'b1', title: 'Dom Casmurro', authors: 'Machado de Assis', format: 'fisico', status: 'lido', pages: 256,
  startDate: '2026-10-01', endDate: '2026-10-10', rating: 4, favorite: false, notes: '', genre: 'Ficção', tags: [],
  currentPage: null, currentPercent: null, journal: [], quotes: [], createdAt: '2026-09-01T10:00:00.000Z', cover: null, ...extra,
});
const view = (b) => bookDetailView({
  state: { books: [b], upNext: [] }, ui: { detailBack: '#/estante', session: null }, today: TODAY, book: b,
});

test('ficha: capa com imagem ganha o fundo desfocado (mesma imagem, escondido do leitor de tela)', () => {
  const html = view(book({ cover: COVER }));
  assert.match(html, /class="ficha-hero has-backdrop" data-id="b1"/);
  assert.match(html, /<span class="ficha-backdrop" aria-hidden="true"><img class="ficha-backdrop-img" src="https:\/\/covers\.openlibrary\.org\/b\/id\/123-M\.jpg" alt=""/);
  // Só um fundo, antes do cabeçalho (fica atrás de tudo).
  assert.equal(html.match(/ficha-backdrop-img/g).length, 1);
  assert.ok(html.indexOf('ficha-backdrop') < html.indexOf('ficha-top'));
});

test('ficha: sem imagem, nada de fundo desfocado (fica a cor da capa)', () => {
  const html = view(book());
  assert.doesNotMatch(html, /ficha-backdrop|has-backdrop/);
  assert.match(html, /class="ficha-hero" data-id="b1" data-tint=""/);
  assert.equal(heroBackdrop(book({ cover: '  ' })), '');
});

test('ficha: fundo já carregado nesta sessão aparece direto; endereço escapado', () => {
  assert.doesNotMatch(heroBackdrop(book({ cover: COVER })), /is-loaded/);
  loadedHdCovers.add(COVER);
  assert.match(heroBackdrop(book({ cover: COVER })), /ficha-backdrop-img is-loaded/);
  loadedHdCovers.delete(COVER);
  const evil = heroBackdrop(book({ cover: 'https://x.com/a.jpg?"><script>' }));
  assert.ok(!evil.includes('"><script>'));
});

test('ritmo sem diário: linha discreta (lendo e lido), nada para Quero ler e Abandonado', () => {
  const reading = view(book({ status: 'lendo', endDate: null }));
  assert.match(reading, /<p class="ficha-row ficha-rhythm-empty"><svg[^]*<\/svg><span><strong>Ritmo da leitura<\/strong> · aparece quando você registrar a leitura<\/span><\/p>/);
  assert.doesNotMatch(reading, /rchart/);
  assert.match(view(book()), /<strong>Ritmo da leitura<\/strong> · este livro foi registrado sem o diário/);
  assert.doesNotMatch(view(book({ status: 'quero', startDate: null, endDate: null })), /Ritmo da leitura/);
  assert.doesNotMatch(view(book({ status: 'abandonado' })), /Ritmo da leitura/);
  // Com diário, o cartão do gráfico continua.
  const withDiary = view(book({ journal: [{ date: '2026-10-02', from: 0, to: 40, unit: 'page', note: '' }] }));
  assert.match(withDiary, /class="rchart is-outside"/);
  // 1.6.2: o título fica fora do cartão, na linha de cima, com "Ver diário" à direita (como Trechos).
  assert.match(withDiary, /<section class="ficha-section ficha-rhythm">\s*<div class="section-head"><h2>Ritmo da leitura<\/h2><a class="link ficha-more" href="#\/livro\/b1\/editar\?aba=diario">Ver diário \(0\)<\/a><\/div>/);
  assert.doesNotMatch(withDiary, /rchart-title/);
  assert.doesNotMatch(withDiary, /ficha-rhythm-empty/);
});

test('trechos: aspa decorativa fora do texto, página em selo', () => {
  const quotes = [
    { id: 'q1', text: 'Capitu, sempre.', page: 61, percent: null, note: '', createdAt: '2026-10-02T10:00:00.000Z' },
    { id: 'q2', text: '<b>Olhos</b> de ressaca.', page: null, percent: null, note: '', createdAt: '2026-10-05T10:00:00.000Z' },
  ];
  const ficha = view(book({ quotes }));
  assert.match(ficha, /<span class="quote-mark" aria-hidden="true">“<\/span>\s*<blockquote>&lt;b&gt;Olhos&lt;\/b&gt; de ressaca\.<\/blockquote>/);
  assert.match(ficha, /<span class="ficha-quote-meta"><span>o mais recente de 2<\/span><\/span>/);
  const tab = formView({
    state: { books: [book({ quotes })] },
    ui: { draft: book({ quotes }), original: book({ quotes }), bookTab: 'trechos', backHref: '#/livro/b1' },
    isEdit: true, today: TODAY,
  });
  assert.equal(tab.match(/class="quote-mark"/g).length, 2);
  assert.match(tab, /<p class="quote-meta"><span class="quote-page">p\. 61<\/span> <span class="quote-date">salvo em 2 out 2026<\/span><\/p>/);
  assert.match(tab, /<blockquote class="quote-text">Capitu, sempre\.<\/blockquote>/);
  for (const action of ['quote-share', 'quote-edit', 'quote-delete']) assert.equal(tab.match(new RegExp(`data-action="${action}"`, 'g')).length, 2);
  const all = allQuotesResults({ books: [book({ quotes })] }, '');
  assert.match(all, /<span class="quote-book">Dom Casmurro<\/span><span class="quote-author">Machado de Assis<\/span>/);
  assert.match(all, /<span class="quote-page">p\. 61<\/span>/);
  assert.equal(all.match(/class="quote-page"/g).length, 1, 'trecho sem posição, sem selo');
});

const lookup = (extra = {}) => ({ query: 'cara debbie', results: [], loading: false, failed: false, searched: true, isbn: '', ...extra });

test('busca: carregando mostra 3 esqueletos e "Buscando…" só para o leitor de tela', () => {
  const html = lookupResults(lookup({ loading: true }));
  assert.match(html, /^<p class="sr-only" role="status">Buscando…<\/p>/);
  assert.equal(html.match(/class="result result-skel"/g).length, 3);
  assert.equal(html.match(/aria-hidden="true"/g).length, 3);
  assert.match(resultSkeleton(1), /--skel-i:1/);
  assert.equal(resultSkeleton(0).match(/skel-line/g).length, 3);
  assert.equal(resultSkeleton(1).match(/skel-line/g).length, 2);
});

test('busca com IA: carregando tem o texto da etapa e um esqueleto', () => {
  const html = lookupResults(lookup({ ai: { status: 'loading', stage: 'confirm', timeoutMs: 40000 } }), { aiEnabled: true });
  assert.match(html, /Conferindo o ISBN…[\s\S]*ai-progress[\s\S]*result-skel[\s\S]*ai-cancel/);
  assert.equal(html.match(/result-skel/g).length, 1);
});

test('busca com IA: "Não encontrei" e a dica do ISBN somem enquanto ela procura ou quando acha', () => {
  const found = { status: 'done', results: [{ title: 'Cara Debbie', authors: 'Freida McFadden', sources: [] }] };
  for (const ai of [{ status: 'loading', stage: 'find' }, found]) {
    const html = lookupResults(lookup({ ai }), { aiEnabled: true });
    assert.doesNotMatch(html, /Não encontrei|lookup-tip/);
    assert.ok(aiCoversLookup(lookup({ ai }), true));
  }
  // Com resultados comuns, a dica do ISBN também não fica acima da IA.
  const withResults = lookupResults(lookup({ results: [{ title: 'Outro', authors: 'X' }], ai: found }), { aiEnabled: true });
  assert.doesNotMatch(withResults, /lookup-tip/);
  // Não achou, erro ou ainda sem rodar: as mensagens voltam.
  for (const ai of [{ status: 'done', results: [] }, { status: 'error', message: 'Falhou', retry: true }, undefined]) {
    const html = lookupResults(lookup({ ai }), { aiEnabled: true });
    assert.match(html, /Não encontrei — preencha os dados abaixo\.[\s\S]*lookup-tip/);
    assert.equal(aiCoversLookup(lookup({ ai }), true), false);
  }
  // Sem chave, nada muda.
  assert.equal(aiCoversLookup(lookup({ ai: { status: 'loading' } }), false), false);
  assert.match(lookupResults(lookup({ isbn: '9788555325007', ai: { status: 'error', message: 'x' } }), { aiEnabled: true }), /O ISBN 9788555325007 fica guardado no livro/);
});
