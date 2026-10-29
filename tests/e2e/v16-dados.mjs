// Teste de ponta a ponta da 1.6 (dados do livro): humor e ritmo, avaliação por critérios,
// sinopse (da busca e editável) e empréstimo / "Onde comprar". Formulário, ficha, menu rápido,
// Estante e Resumo → Gostos ("Seu perfil de leitor"), em 320, 390 e 430 px, claro e escuro,
// com três cores de destaque. Capturas em tests/e2e/screens/v16-dados-*.png.
// Uso: node tests/e2e/v16-dados.mjs   (precisa do Playwright, como o smoke.mjs)

import { execSync } from 'node:child_process';
import { createServer } from 'node:http';
import { mkdirSync, readFileSync, existsSync } from 'node:fs';
import { extname, join, normalize } from 'node:path';
import { createRequire } from 'node:module';
import assert from 'node:assert/strict';

const require = createRequire(import.meta.url);
let playwright;
try {
  playwright = require('playwright');
} catch {
  playwright = require(join(execSync('npm root -g').toString().trim(), 'playwright'));
}

const APP = new URL('../../app/', import.meta.url).pathname;
const SHOTS = new URL('./screens/', import.meta.url).pathname;
mkdirSync(SHOTS, { recursive: true });

const TYPES = {
  '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json',
  '.webmanifest': 'application/manifest+json', '.svg': 'image/svg+xml', '.png': 'image/png', '.woff2': 'font/woff2',
};

const server = createServer((req, res) => {
  const path = normalize(decodeURIComponent(new URL(req.url, 'http://x').pathname)).replace(/^\/+/, '');
  const file = join(APP, path || 'index.html');
  if (!file.startsWith(APP) || !existsSync(file)) {
    res.writeHead(404).end();
    return;
  }
  res.writeHead(200, { 'Content-Type': TYPES[extname(file)] || 'application/octet-stream' });
  res.end(readFileSync(file));
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const BASE = `http://localhost:${server.address().port}/`;

const TODAY = '2026-10-16';
const TS = '2026-01-01T00:00:00.000Z';
const SYNOPSIS = 'Nas profundezas do sertão baiano, as irmãs Bibiana e Belonísia encontram uma faca na mala guardada sob a cama da avó. '
  + 'Ocorre então um acidente. E para sempre suas vidas estarão ligadas — a ponto de uma precisar ser a voz da outra.\n\n'
  + 'Numa trama conduzida com maestria e com uma prosa melodiosa, o romance conta uma história de vida e morte, de combate e redenção. '
  + '<img src=x onerror="window.__xss=1"> fica como texto.';
const book = (id, title, extra = {}) => ({
  id, title, authors: 'Autor', pages: 300, status: 'lido', startDate: '2025-01-10', endDate: '2026-09-20', format: 'fisico',
  genre: 'Ficção', rating: 4, favorite: false, notes: '', cover: null, isbn: '', currentPage: null, currentPercent: null,
  dropReason: '', reread: false, series: '', seriesNumber: null, tags: [], targetDate: null, quotes: [], journal: [],
  createdAt: TS, updatedAt: TS, ...extra,
});
// Livros sem nenhum campo da 1.6 (como num backup antigo) e livros com eles.
const seed = {
  version: 2, goals: { 2026: 12 }, defaultGoal: 12, customGenres: [], lastBackupAt: '2026-10-10T10:00:00.000Z', pageGoals: {}, upNext: [],
  books: [
    book('torto', 'Torto Arado', {
      authors: 'Itamar Vieira Junior', rating: 4.5, startDate: '2026-09-01', endDate: '2026-10-02', isbn: '9786580309320',
      moods: ['emocionante', 'reflexivo', 'sombrio', 'triste'], pace: 'medio',
      criteria: { personagens: 5, enredo: 4.5, escrita: 5, emocao: 4 }, description: SYNOPSIS,
    }),
    book('duna', 'Duna', { authors: 'Frank Herbert', rating: 5, endDate: '2026-08-10', moods: ['emocionante', 'tenso', 'desafiador'], pace: 'lento', criteria: { enredo: 5 } }),
    book('habitos', 'Hábitos Atômicos', { authors: 'James Clear', genre: 'Desenvolvimento pessoal', endDate: '2026-03-01', moods: ['informativo', 'inspirador', 'reflexivo'], pace: 'rapido' }),
    book('verity', 'Verity', { authors: 'Colleen Hoover', endDate: '2026-05-01', moods: ['tenso', 'misterioso', 'sombrio'], pace: 'rapido' }),
    book('semdados', 'Livro sem humor', { endDate: '2026-06-01' }),
    book('antigo', 'Livro de 2025', { endDate: '2025-04-01' }),
    book('lendo', 'Lendo Agora', { status: 'lendo', endDate: null, rating: null, startDate: '2026-10-01', currentPage: 40 }),
    book('quero', 'Cem Anos de Solidão', { status: 'quero', authors: 'Gabriel García Márquez, Outro', startDate: null, endDate: null, rating: null, isbn: '9788501012074' }),
    book('quero2', 'O Avesso da Pele', { status: 'quero', authors: 'Jeferson Tenório', startDate: null, endDate: null, rating: null, loan: { to: 'Karoline', since: '2026-09-28' } }),
  ],
};

const olSearch = {
  docs: [{ key: '/works/OL77W', title: 'Os Sertões', author_name: ['Euclides da Cunha'], first_publish_year: 1902, number_of_pages_median: 600 }],
};
const olWork = { key: '/works/OL77W', description: { type: '/type/text', value: 'Relato da <b>Guerra de Canudos</b>, entre o ensaio e a epopeia.\r\n\r\n----------\n([fonte][1])\n\n[1]: https://exemplo.org' } };

const browser = await playwright.chromium.launch();
const errors = [];
const step = (msg) => console.log(`• ${msg}`);

async function newPage({ width = 390, scheme = 'dark', accent = null } = {}) {
  const context = await browser.newContext({
    viewport: { width, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, locale: 'pt-BR',
    reducedMotion: 'reduce', colorScheme: scheme,
  });
  const page = await context.newPage();
  await page.clock.setFixedTime(new Date(`${TODAY}T12:00:00`));
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errors.push(`console: ${m.text()}`); });
  page.on('popup', (p) => p.close().catch(() => {}));
  await page.route(/^https:\/\//, (r) => r.abort());
  await page.route('https://openlibrary.org/**', (r) => r.fulfill({ json: r.request().url().includes('/works/OL77W.json') ? olWork : olSearch }));
  await page.goto(BASE);
  await page.waitForFunction(() => document.getElementById('app').dataset.page);
  await page.evaluate(async ({ d, a }) => {
    await (await import('/js/db.js')).setItem('state', d);
    if (a) localStorage.setItem('leituras:acento', a); else localStorage.removeItem('leituras:acento');
  }, { d: seed, a: accent });
  return page;
}
async function open(page, hash, name) {
  await page.evaluate((h) => history.replaceState(null, '', h), hash);
  await page.reload();
  await page.waitForFunction((n) => document.getElementById('app').dataset.page === n, name);
  await page.evaluate(() => document.fonts.ready);
}
const readState = (page) => page.evaluate(async () => (await import('/js/db.js')).getItem('state'));
async function waitBook(page, id, predicate) {
  let last;
  for (let i = 0; i < 50; i += 1) {
    last = (await readState(page))?.books.find((b) => b.id === id);
    if (last && predicate(last)) return last;
    await page.waitForTimeout(100);
  }
  throw new Error(`Livro ${id} não chegou ao esperado: ${JSON.stringify(last)?.slice(0, 400)}`);
}
const text = async (page, sel) => (await page.textContent(sel)).replace(/\s+/g, ' ').trim();
async function openMore(page) {
  if (await page.getAttribute('.more-toggle', 'aria-expanded') !== 'true') await page.click('.more-toggle');
  await page.waitForSelector('#f-description', { state: 'visible' });
}
const shot = (name) => join(SHOTS, `v16-dados-${name}.png`);

/** Sem rolagem lateral, alvos de toque de 44px (fora as meias estrelas) e campos com 16px. */
async function layout(page, label) {
  const out = await page.evaluate((lbl) => {
    const problems = [];
    const overflow = document.documentElement.scrollWidth - window.innerWidth;
    if (overflow > 0) problems.push(`${lbl}: ${overflow}px sobrando à direita`);
    const small = [...document.querySelectorAll('#app button, #app a, .sheet button, .sheet a')]
      .filter((el) => el.offsetParent && !el.classList.contains('star-hit') && getComputedStyle(el).visibility === 'visible')
      .filter((el) => el.closest('.ficha-syn, .ficha-shop, .ficha-loan-card, .ficha-loan-add, .crit, .mood-field, .profile-card, .loan-sheet, .li-main'))
      .map((el) => ({ el, r: el.getBoundingClientRect() }))
      .filter(({ r }) => r.height < 44)
      .map(({ el, r }) => `${el.outerHTML.slice(0, 80)} ${Math.round(r.height)}px`);
    if (small.length) problems.push(`${lbl}: alvos < 44px: ${small.join(' | ')}`);
    const fields = [...document.querySelectorAll('#app input, #app textarea, .sheet input')]
      .filter((el) => el.offsetParent && parseFloat(getComputedStyle(el).fontSize) < 16).map((el) => el.id);
    if (fields.length) problems.push(`${lbl}: letra < 16px em ${fields.join(', ')}`);
    for (const sel of ['.ficha-crit', '.ficha-moods', '.ficha-loan', '.ficha-loan-card', '.ficha-shop', '.profile-card', '.crit-list', '.mood-chips']) {
      for (const el of document.querySelectorAll(sel)) {
        const r = el.getBoundingClientRect();
        if (r.width && (r.left < -0.5 || r.right > window.innerWidth + 0.5)) problems.push(`${lbl}: ${sel} passa da tela`);
      }
    }
    return problems;
  }, label);
  assert.deepEqual(out, [], out.join('\n'));
}

try {
  // ---------- Ficha: humor, critérios, sinopse, empréstimo ----------
  let page = await newPage();
  await open(page, '#/livro/torto', 'livro');

  step('ficha: humor e ritmo em chips discretos no topo');
  assert.deepEqual(await page.locator('.ficha-moods .ficha-chip').allInnerTexts(), ['Emocionante', 'Reflexivo', 'Sombrio', 'Triste', 'Ritmo médio']);

  step('ficha: critérios sob as estrelas, com barrinhas; a nota principal continua a das estrelas');
  assert.equal(await page.getAttribute('.ficha-stars', 'aria-label'), 'Nota 4,5 de 5');
  assert.deepEqual(await page.locator('.ficha-crit dt').allInnerTexts(), ['Personagens', 'Enredo', 'Escrita', 'Emoção']);
  assert.deepEqual(await page.locator('.ficha-crit-n [aria-hidden]').allInnerTexts(), ['5', '4,5', '5', '4']);
  const widths = await page.locator('.ficha-crit-bar > span').evaluateAll((els) => els.map((e) => e.style.width));
  assert.deepEqual(widths, ['100%', '90%', '100%', '80%']);

  step('ficha: sinopse recolhida em 4 linhas, "Ler mais" abre e fecha; HTML aparece como texto');
  const clamp = await page.evaluate(() => {
    const p = document.querySelector('.ficha-syn-text');
    return { h: p.clientHeight, line: parseFloat(getComputedStyle(p).lineHeight), scroll: p.scrollHeight };
  });
  assert.ok(Math.round(clamp.h / clamp.line) === 4, `4 linhas visíveis (${clamp.h}px)`);
  assert.ok(clamp.scroll > clamp.h + 10, 'texto maior que o recorte');
  assert.equal(await page.locator('.ficha-syn-text img').count(), 0);
  assert.match(await page.textContent('.ficha-syn-text'), /<img src=x onerror="window.__xss=1"> fica como texto\.$/);
  assert.equal(await page.isVisible('.ficha-syn-more'), true);
  await page.screenshot({ path: shot('ficha-lido-390-escuro'), fullPage: true });
  await page.click('.ficha-syn-more');
  assert.equal(await page.getAttribute('.ficha-syn-more', 'aria-expanded'), 'true');
  assert.equal(await text(page, '.ficha-syn-more'), 'Ler menos');
  assert.ok(await page.evaluate(() => document.querySelector('.ficha-syn-text').clientHeight > 200));
  await page.click('.ficha-syn-more');
  assert.equal(await text(page, '.ficha-syn-more'), 'Ler mais');
  assert.equal(await page.evaluate(() => window.__xss), undefined);
  await layout(page, 'ficha lido 390');

  step('ficha: "Emprestei para alguém" abre a folha; salvar grava { to, since }');
  assert.equal(await page.locator('.ficha-loan').count(), 0);
  await page.click('.ficha-loan-add');
  await page.waitForSelector('.sheet-loan [data-loan-form]');
  assert.equal(await page.evaluate(() => document.activeElement.id), 'loan-to');
  assert.equal(await page.inputValue('#loan-since'), TODAY);
  assert.equal(await page.getAttribute('#loan-since', 'max'), TODAY);
  // Karoline já pegou um livro: aparece como sugestão.
  assert.deepEqual(await page.locator('#loan-names option').evaluateAll((o) => o.map((x) => x.value)), ['Karoline']);
  await page.click('.sheet-loan button[type="submit"]');
  await page.waitForFunction(() => /nome de quem pegou/.test(document.getElementById('toast').textContent));
  await page.fill('#loan-to', '  Ana   Paula ');
  await page.fill('#loan-since', '2026-10-03');
  await page.screenshot({ path: shot('folha-emprestimo-390-escuro') });
  await layout(page, 'folha do empréstimo');
  await page.click('.sheet-loan button[type="submit"]');
  await page.waitForFunction(() => !document.querySelector('.sheet-layer'));
  let saved = await waitBook(page, 'torto', (b) => b.loan);
  assert.deepEqual(saved.loan, { to: 'Ana Paula', since: '2026-10-03' });
  assert.equal(saved.rating, 4.5, 'nota principal intacta');
  assert.equal(await text(page, '.ficha-loan'), 'com Ana Paula desde 3 out');
  assert.match((await page.innerText('.ficha-loan-card')).replace(/\s+/g, ' '), /^Emprestado para Ana Paula Desde 3 out 2026 · há 13 dias Devolvido$/i);
  await page.locator('.ficha-loan-card').scrollIntoViewIfNeeded();
  await page.screenshot({ path: shot('ficha-emprestado-390-escuro'), fullPage: true });
  await layout(page, 'ficha emprestado');

  step('Estante: a linha do livro mostra "com Ana Paula desde 3 out"');
  await page.evaluate(() => { location.hash = '#/estante?aba=lido'; });
  await page.waitForFunction(() => document.getElementById('app').dataset.page === 'estante');
  await page.click('.seg-btn[data-value="lido"], [data-action="shelf-tab"][data-value="lido"]').catch(() => {});
  await page.waitForSelector('.book-row[data-id="torto"] .li-loan');
  assert.equal(await text(page, '.book-row[data-id="torto"] .li-loan'), 'com Ana Paula desde 3 out');
  assert.equal(await page.locator('.book-row[data-id="duna"] .li-loan').count(), 0);
  await page.screenshot({ path: shot('estante-lidos-390-escuro') });

  step('ficha: "Devolvido" tira o empréstimo; Desfazer devolve');
  await page.evaluate(() => { location.hash = '#/livro/torto'; });
  await page.waitForSelector('.ficha-loan-card');
  await page.click('.ficha-loan-back');
  await waitBook(page, 'torto', (b) => b.loan === null);
  await page.waitForFunction(() => /Devolvido: "Torto Arado"/.test(document.getElementById('toast').textContent));
  assert.equal(await page.locator('.ficha-loan, .ficha-loan-card').count(), 0);
  assert.equal(await page.isVisible('.ficha-loan-add'), true);
  await page.click('#toast [data-action="undo-loan-return"]');
  saved = await waitBook(page, 'torto', (b) => b.loan);
  assert.deepEqual(saved.loan, { to: 'Ana Paula', since: '2026-10-03' });
  await page.waitForSelector('.ficha-loan-card');
  // Tocar no cartão abre a folha para alterar; "Devolvido" também está nela.
  await page.click('.ficha-loan-info');
  await page.waitForSelector('.sheet-loan');
  assert.equal(await page.inputValue('#loan-to'), 'Ana Paula');
  await page.click('.sheet-loan [data-action="loan-return"]');
  await waitBook(page, 'torto', (b) => b.loan === null);
  await page.waitForFunction(() => !document.querySelector('.sheet-layer'));

  step('Quero ler: "Onde comprar" (Amazon pelo ISBN, Estante Virtual), em outra aba, sem afiliado');
  await open(page, '#/livro/quero', 'livro');
  const links = await page.locator('.ficha-shop a').evaluateAll((els) => els.map((a) => [a.href, a.target, a.rel]));
  assert.deepEqual(links, [
    ['https://www.amazon.com.br/s?k=9788501012074', '_blank', 'noopener noreferrer'],
    ['https://www.estantevirtual.com.br/busca?q=9788501012074', '_blank', 'noopener noreferrer'],
  ]);
  assert.equal(await page.locator('.ficha-syn').count(), 0, 'sem sinopse, sem seção');
  await layout(page, 'ficha quero');
  await open(page, '#/livro/quero2', 'livro');
  assert.equal(await page.getAttribute('.ficha-shop a[data-shop="amazon"]', 'href'), 'https://www.amazon.com.br/s?k=O%20Avesso%20da%20Pele%20Jeferson%20Ten%C3%B3rio');
  assert.equal(await text(page, '.ficha-loan'), 'com Karoline desde 28 set');
  await page.screenshot({ path: shot('ficha-quero-390-escuro'), fullPage: true });
  await open(page, '#/livro/duna', 'livro');
  assert.equal(await page.locator('.ficha-shop').count(), 0, 'livro lido não tem "Onde comprar"');
  assert.deepEqual(await page.locator('.ficha-crit dt').allInnerTexts(), ['Enredo']);
  await open(page, '#/livro/semdados', 'livro');
  assert.equal(await page.locator('.ficha-moods, .ficha-crit, .ficha-syn, .ficha-loan').count(), 0, 'livro sem os dados novos: nada novo no topo');

  step('menu rápido (Estante → Quero ler): "Emprestei para…" e "Devolvido"');
  await open(page, '#/estante?aba=quero', 'estante');
  await page.waitForSelector('.book-row[data-id="quero2"] .li-loan');
  assert.equal(await text(page, '.book-row[data-id="quero2"] .li-loan'), 'com Karoline desde 28 set');
  await page.click('[data-action="quick-menu"][data-id="quero"]');
  await page.waitForSelector('.sheet-menu');
  await page.click('.sheet-menu [data-action="loan-open"]');
  await page.waitForSelector('.sheet-loan');
  await page.fill('#loan-to', 'Karoline');
  await page.press('#loan-to', 'Enter');
  saved = await waitBook(page, 'quero', (b) => b.loan);
  assert.deepEqual(saved.loan, { to: 'Karoline', since: TODAY });
  await page.waitForSelector('.book-row[data-id="quero"] .li-loan');
  assert.equal(await text(page, '.book-row[data-id="quero"] .li-loan'), 'com Karoline desde 16 out');
  await page.screenshot({ path: shot('estante-quero-390-escuro') });
  await page.click('[data-action="quick-menu"][data-id="quero2"]');
  await page.waitForSelector('.sheet-menu [data-action="loan-return"]');
  assert.match(await text(page, '.sheet-menu [data-action="loan-return"]'), /Devolvido \(estava com Karoline\)/);
  await page.click('.sheet-menu [data-action="loan-return"]');
  await waitBook(page, 'quero2', (b) => b.loan === null);
  await page.waitForFunction(() => !document.querySelector('.book-row[data-id="quero2"] .li-loan'));

  // ---------- Formulário ----------
  step('formulário: critérios abertos (já há notas), meia estrela, tocar de novo apaga; a nota principal não muda');
  await open(page, '#/livro/torto/editar', 'livro');
  assert.equal(await page.getAttribute('.crit-toggle', 'aria-expanded'), 'true');
  assert.deepEqual(await page.locator('.crit-val').allInnerTexts(), ['5', '4,5', '5', '4']);
  await page.click('.crit-row[aria-label="Enredo"] .star-hit[data-value="3.5"]');
  await page.click('.crit-row[aria-label="Emoção"] .star-hit[data-value="4"]');
  assert.deepEqual(await page.locator('.crit-val').allInnerTexts(), ['5', '3,5', '5', '–']);
  assert.equal(await page.getAttribute('.crit-row[aria-label="Enredo"] .star-hit[data-value="3.5"]', 'aria-label'), 'Enredo: 3,5 estrelas');
  assert.equal(await page.locator('.star-row .star-hit[aria-pressed="true"]').getAttribute('data-value'), '4.5');

  step('formulário: humor (vários) e ritmo (um) em "Mais detalhes"; sinopse editável');
  await openMore(page);
  assert.deepEqual(await page.locator('.mood-chip[aria-pressed="true"]').allInnerTexts(), ['Emocionante', 'Reflexivo', 'Sombrio', 'Triste']);
  assert.equal(await page.locator('.mood-chip').count(), 12);
  await page.click('.mood-chip[data-value="triste"]');
  await page.click('.mood-chip[data-value="leve"]');
  await page.click('.pace-btn[data-value="rapido"]');
  assert.deepEqual(await page.locator('.mood-chip[aria-pressed="true"]').allInnerTexts(), ['Emocionante', 'Reflexivo', 'Leve', 'Sombrio']);
  assert.equal(await page.getAttribute('.pace-btn[data-value="rapido"]', 'aria-pressed'), 'true');
  assert.equal(await page.getAttribute('.pace-btn[data-value="medio"]', 'aria-pressed'), 'false');
  assert.equal(await page.inputValue('#f-description'), SYNOPSIS.replace(/\n\n/, '\n\n'));
  await page.fill('#f-description', '  Uma sinopse nova.\n\n\n\nCom parágrafos.  ');
  await page.locator('.mood-field').scrollIntoViewIfNeeded();
  await page.screenshot({ path: shot('form-humor-390-escuro') });
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.locator('.crit').scrollIntoViewIfNeeded();
  await page.screenshot({ path: shot('form-criterios-390-escuro') });
  await layout(page, 'formulário 390');
  await page.click('.form-actions .btn-primary');
  saved = await waitBook(page, 'torto', (b) => b.pace === 'rapido');
  assert.deepEqual(saved.moods, ['emocionante', 'reflexivo', 'leve', 'sombrio']);
  assert.deepEqual(saved.criteria, { personagens: 5, enredo: 3.5, escrita: 5 });
  assert.equal(saved.rating, 4.5);
  assert.equal(saved.description, 'Uma sinopse nova.\n\nCom parágrafos.');

  step('formulário: tocar de novo no ritmo escolhido limpa; resumo de "Mais detalhes" fala do humor');
  await open(page, '#/livro/duna/editar', 'livro');
  await openMore(page);
  await page.click('.pace-btn[data-value="lento"]');
  assert.equal(await page.locator('.pace-btn[aria-pressed="true"]').count(), 0);
  await page.click('.more-toggle');
  assert.match(await text(page, '.more-summary'), /3 humores/);
  assert.doesNotMatch(await text(page, '.more-summary'), /ritmo/);
  await page.click('.form-actions .btn-primary');
  await waitBook(page, 'duna', (b) => b.pace === null);

  step('formulário: "Avaliar por critérios" fechado num livro sem notas; só aparece em Lido');
  await open(page, '#/livro/semdados/editar', 'livro');
  assert.equal(await page.getAttribute('.crit-toggle', 'aria-expanded'), 'false');
  assert.equal(await page.locator('.crit-list').count(), 0);
  assert.match(await text(page, '.crit-summary'), /Personagens, enredo, escrita e emoção/);
  await page.click('.crit-toggle');
  assert.equal(await page.locator('.crit-row').count(), 4);
  await page.click('.seg-btn[data-action="set-status"][data-value="lendo"]');
  assert.equal(await page.locator('.crit').count(), 0);
  await page.click('.seg-btn[data-action="set-status"][data-value="quero"]');
  await openMore(page);
  assert.equal(await page.locator('.mood-field').count(), 0, 'Quero ler: sem humor');
  assert.equal(await page.isVisible('#f-description'), true, 'Quero ler: com sinopse');

  step('livro novo pela busca: a sinopse da obra (Open Library) chega depois de escolher');
  await open(page, '#/novo?status=quero', 'novo');
  await page.fill('#lookup', 'os sertões');
  await page.waitForSelector('[data-action="pick-result"]');
  await page.click('[data-action="pick-result"]');
  await page.waitForFunction(() => /Guerra de Canudos/.test(document.querySelector('.more-summary')?.textContent + (document.getElementById('f-description')?.value || '')) || /com sinopse/.test(document.querySelector('.more-summary')?.textContent || ''));
  assert.match(await text(page, '.more-summary'), /com sinopse/);
  await openMore(page);
  assert.equal(await page.inputValue('#f-description'), 'Relato da Guerra de Canudos, entre o ensaio e a epopeia.');
  await page.click('.form-actions .btn-primary');
  await page.waitForFunction(() => document.getElementById('app').dataset.page !== 'novo');
  const all = (await readState(page)).books;
  const sertoes = all.find((b) => b.title === 'Os Sertões');
  assert.equal(sertoes.description, 'Relato da Guerra de Canudos, entre o ensaio e a epopeia.');
  assert.deepEqual([sertoes.moods, sertoes.pace, sertoes.criteria, sertoes.loan], [[], null, {}, null]);
  await page.context().close();

  // ---------- Resumo → Gostos ----------
  step('Resumo → Gostos: "Seu perfil de leitor" (humores mais lidos e ritmo)');
  page = await newPage();
  await open(page, '#/resumo/2026?aba=gostos', 'resumo');
  await page.waitForSelector('.profile-card');
  assert.equal(await text(page, '.profile-card h2'), 'Seu perfil de leitor');
  assert.equal(await text(page, '.profile-card .section-head .muted'), '4 de 5 livros');
  assert.equal(await text(page, '.profile-lead'), 'Em 2026, você leu mais livros emocionantes, reflexivos e tensos.');
  const bars = await page.locator('.profile-bars .hbar-head').allInnerTexts();
  assert.deepEqual(bars.slice(0, 3).map((t) => t.replace(/\s+/g, ' ')), ['Emocionante 2 livros · 50%', 'Reflexivo 2 livros · 50%', 'Tenso 2 livros · 50%']);
  // 1.6.1: três à mostra e o resto em "Ver todos (9)" (antes só os seis primeiros).
  assert.equal(bars.length, 9);
  assert.equal(await text(page, ".profile-card .rb-open"), "Ver todos (9)");
  assert.equal(await page.locator(".profile-card .rb-more > .rb-row").count(), 6);
  assert.equal(await page.getAttribute('.pace-split', 'aria-label'), 'Lento: 1 livro, Médio: 1 livro, Rápido: 2 livros');
  assert.deepEqual(await page.locator('.pace-key').evaluateAll((els) => els.map((e) => e.textContent.replace(/\s+/g, ' ').trim())), ['Lento 1', 'Médio 1', 'Rápido 2']);
  await page.locator('.profile-card').scrollIntoViewIfNeeded();
  await page.screenshot({ path: shot('resumo-perfil-390-escuro'), fullPage: true });
  await layout(page, 'resumo perfil');
  step('Resumo de 2025: livros lidos sem humor → convite discreto');
  await open(page, '#/resumo/2025?aba=gostos', 'resumo');
  await page.waitForSelector('.profile-card.is-empty');
  assert.match(await text(page, '.profile-card.is-empty'), /Marque o humor e o ritmo/);
  await page.context().close();

  // ---------- Larguras, temas e cores ----------
  const combos = [
    { width: 320, scheme: 'light', accent: null },
    { width: 320, scheme: 'dark', accent: 'petroleo' },
    { width: 390, scheme: 'light', accent: 'vinho' },
    { width: 430, scheme: 'dark', accent: 'vinho' },
    { width: 430, scheme: 'light', accent: 'petroleo' },
  ];
  for (const c of combos) {
    const tag = `${c.width}-${c.scheme === 'light' ? 'claro' : 'escuro'}-${c.accent || 'terracota'}`;
    step(`telas em ${tag}`);
    page = await newPage(c);
    await page.evaluate(async () => {
      const db = await import('/js/db.js');
      const s = await db.getItem('state');
      s.books.find((b) => b.id === 'torto').loan = { to: 'Maria Eduarda dos Santos', since: '2026-10-03' };
      await db.setItem('state', s);
    });
    await open(page, '#/livro/torto', 'livro');
    await layout(page, `ficha ${tag}`);
    await page.locator('.ficha-loan-card').screenshot({ path: shot(`emprestimo-${tag}`) });
    await page.screenshot({ path: shot(`ficha-${tag}`), fullPage: true });
    await open(page, '#/livro/torto/editar', 'livro');
    await openMore(page);
    await layout(page, `formulário ${tag}`);
    await page.screenshot({ path: shot(`form-${tag}`), fullPage: true });
    await page.locator('.crit').screenshot({ path: shot(`criterios-${tag}`) });
    await page.locator('.mood-field').screenshot({ path: shot(`humor-${tag}`) });
    await open(page, '#/resumo/2026?aba=gostos', 'resumo');
    await layout(page, `resumo ${tag}`);
    // A barra de baixo (fixa) ficaria por cima do cartão na captura do elemento.
    await page.addStyleTag({ content: '#nav { visibility: hidden !important; }' });
    await page.evaluate(() => document.querySelector('.profile-card').scrollIntoView({ block: 'center' }));
    await page.locator('.profile-card').screenshot({ path: shot(`perfil-${tag}`) });
    await open(page, '#/livro/quero', 'livro');
    await layout(page, `quero ${tag}`);
    if (c.width === 320) await page.screenshot({ path: shot(`ficha-quero-${tag}`), fullPage: true });
    await page.context().close();
  }

  assert.deepEqual(errors, [], errors.join('\n'));
  console.log('\nTudo certo. Capturas em tests/e2e/screens/v16-dados-*.png');
} catch (err) {
  console.error('\nFALHOU:', err.message);
  if (errors.length) console.error(errors.join('\n'));
  process.exitCode = 1;
}
await browser.close();
server.close();
