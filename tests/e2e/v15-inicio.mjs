// Teste de ponta a ponta do Início 1.5: saudação com nome (Ajustes, só no aparelho), data e
// sequência de dias lendo; botão tonal nos cartões "Lendo agora" depois do primeiro;
// "informe o total de páginas" como link (Início e ficha) que abre a edição no campo Páginas;
// véu da cor da capa; festa ao concluir um livro (capa salta para a grade, confete, número sobe)
// e, sem movimento, só o toast. Em 320, 390 e 430px, claro e escuro.
// Uso: node tests/e2e/v15-inicio.mjs   (precisa do Playwright; capturas em tests/e2e/screens/v15-inicio-*.png)

import { execSync } from 'node:child_process';
import { createServer } from 'node:http';
import { mkdirSync, readFileSync, existsSync } from 'node:fs';
import { extname, join, normalize } from 'node:path';
import { createRequire } from 'node:module';
import { deflateSync } from 'node:zlib';
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

// ---------- Capas de imagem (data: PNG de uma cor, com uma faixa clara) ----------

function crc32(buf) {
  let c = ~0;
  for (const byte of buf) {
    c ^= byte;
    for (let k = 0; k < 8; k += 1) c = (c >>> 1) ^ (0xEDB88320 & -(c & 1));
  }
  return ~c >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}
function pngCover([r, g, b], w = 40, h = 60) {
  const rows = [];
  for (let y = 0; y < h; y += 1) {
    const row = [0];
    const band = y > h * 0.62 && y < h * 0.7;
    for (let x = 0; x < w; x += 1) row.push(...(band ? [240, 232, 220] : [r, g, b]));
    rows.push(...row);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  const png = Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr), chunk('IDAT', deflateSync(Buffer.from(rows))), chunk('IEND', Buffer.alloc(0)),
  ]);
  return `data:image/png;base64,${png.toString('base64')}`;
}
const TEAL = pngCover([22, 110, 120]);
const CRIMSON = pngCover([150, 30, 45]);

// ---------- Dados ----------

const TS = '2026-01-01T00:00:00.000Z';
const read = (id, title, endDate, extra = {}) => ({
  id, title, authors: `Autor de ${title}`, status: 'lido', startDate: endDate.replace(/-\d\d$/, '-01'), endDate, pages: 300, format: 'fisico',
  rating: 4, genre: 'Ficção', createdAt: TS, updatedAt: TS, ...extra,
});
const entry = (date, from, to) => ({ date, from, to, unit: 'page', note: '' });
const seed = {
  version: 2, goals: { 2026: 12 }, defaultGoal: 12, customGenres: [], lastBackupAt: '2026-01-01T10:00:00.000Z',
  upNext: [], pageGoals: {},
  books: [
    read('a1', 'Duna', '2026-03-20', { rating: 4.5 }),
    read('a2', 'Sapiens', '2026-05-20', { genre: 'História' }),
    read('a3', 'Torto Arado', '2026-07-12', { rating: 5 }),
    {
      id: 'r1', title: 'Fora de Série', authors: 'Malcolm Gladwell', status: 'lendo', format: 'fisico', pages: 300, currentPage: 120,
      startDate: '2026-10-01', cover: TEAL, createdAt: TS, updatedAt: TS,
      journal: [entry('2026-10-26', 40, 70), entry('2026-10-27', 70, 96), entry('2026-10-28', 96, 120)],
    },
    {
      id: 'r2', title: 'Sem total de páginas', authors: 'Fulana', status: 'lendo', format: 'fisico', currentPage: 50,
      startDate: '2026-10-10', createdAt: TS, updatedAt: TS, journal: [entry('2026-10-20', 0, 50)],
    },
    {
      id: 'r3', title: 'Quase no fim', authors: 'Beltrano', status: 'lendo', format: 'fisico', pages: 200, currentPage: 200,
      startDate: '2026-10-02', cover: CRIMSON, createdAt: TS, updatedAt: TS, journal: [],
    },
  ],
};

// ---------- Navegador ----------

const browser = await playwright.chromium.launch();
const baseOptions = { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, locale: 'pt-BR' };
const NIGHT = '2026-10-28T21:00:00';

const errors = [];
const step = (msg) => console.log(`• ${msg}`);

async function newPage({ scheme = 'dark', reducedMotion = 'no-preference', time = NIGHT, name = null, data = seed } = {}) {
  const context = await browser.newContext({ ...baseOptions, colorScheme: scheme === 'light' ? 'light' : 'dark', reducedMotion });
  const page = await context.newPage();
  await page.clock.setFixedTime(new Date(time));
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errors.push(`console: ${m.text()}`); });
  page.on('dialog', (d) => d.accept());
  await page.goto(`${BASE}#/inicio`);
  await page.waitForSelector('#app[data-page]');
  await page.evaluate(async ([d, n, s]) => {
    await (await import('/js/db.js')).setItem('state', d);
    localStorage.setItem('leituras:tema', s === 'light' ? 'claro' : 'escuro');
    if (n === null) localStorage.removeItem('leituras:nome');
    else localStorage.setItem('leituras:nome', n);
  }, [data, name, scheme]);
  await page.reload();
  await page.waitForSelector('#app[data-page="inicio"] .greet');
  return { context, page };
}

const onPage = (page, name) => page.waitForFunction((n) => document.getElementById('app').dataset.page === n, name);
const toastHas = (page, re) => page.waitForFunction((src) => new RegExp(src).test(document.getElementById('toast').textContent), re.source);
const overflow = (page) => page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
const shot = async (page, name, full = false) => {
  await page.waitForTimeout(250);
  await page.screenshot({ path: join(SHOTS, `v15-inicio-${name}.png`), fullPage: full });
};
// O toast de sempre; com marco novo (aqui, 1.000 páginas no ano) o do marco toma o lugar dele.
const DONE_TOAST = /Leitura concluída\. Parabéns!|Marcos? alcançados?/;
const readState = (page) => page.evaluate(async () => (await import('/js/db.js')).getItem('state'));

try {
  // ---------- 4. Saudação ----------
  step('saudação sem nome: "Boa noite", data de hoje e sequência de dias lendo');
  {
    const { context, page } = await newPage();
    assert.equal((await page.textContent('.greet-title')).trim(), 'Boa noite');
    assert.equal(await page.locator('.greet-title[data-large-title]').count(), 1, 'o título grande é a saudação');
    assert.equal(await page.textContent('.greet-date'), 'quarta, 28 de outubro');
    assert.equal(await page.textContent('.greet-streak'), '3 dias seguidos lendo');
    assert.equal(await page.locator('.brand-name').count(), 0, 'sem o título fixo "Leituras"');
    // Barra compacta: continua "Leituras" e aparece quando a saudação passa por baixo dela.
    assert.equal(await page.textContent('.cbar-title'), 'Leituras');
    assert.equal(await page.evaluate(() => document.querySelector('[data-cbar]').classList.contains('is-on')), false);
    await page.evaluate(() => scrollTo(0, 300));
    await page.waitForFunction(() => document.querySelector('[data-cbar]').classList.contains('is-on'));
    await page.evaluate(() => scrollTo(0, 0));
    await page.waitForFunction(() => !document.querySelector('[data-cbar]').classList.contains('is-on'));

    step('Ajustes → Seu nome: limpa, limita a 30, fica só no aparelho (fora do backup)');
    await page.click('a[href="#/ajustes"]');
    await onPage(page, 'ajustes');
    const input = page.locator('#set-name');
    assert.equal(await input.getAttribute('maxlength'), '30');
    assert.ok(parseFloat(await input.evaluate((el) => getComputedStyle(el).fontSize)) >= 16, 'campo sem zoom no iPhone');
    await input.fill('   Pedro   Neiva  ');
    await input.press('Enter');
    await toastHas(page, /Nome salvo/);
    assert.equal(await input.inputValue(), 'Pedro Neiva');
    assert.equal(await page.evaluate(() => localStorage.getItem('leituras:nome')), 'Pedro Neiva');
    await page.screenshot({ path: join(SHOTS, 'v15-inicio-ajustes-nome-escuro-390.png') });
    const saved = JSON.stringify(await readState(page));
    assert.doesNotMatch(saved, /Pedro Neiva/, 'o nome não entra nos dados (nem no backup)');
    const backup = await page.evaluate(async () => (await import('/js/store.js')).serializeBackup((await (await import('/js/db.js')).getItem('state'))));
    assert.doesNotMatch(String(backup), /Pedro Neiva/, 'o nome não vai para o backup');
    await page.click('a[href="#/inicio"]');
    await onPage(page, 'inicio');
    assert.equal((await page.textContent('.greet-title')).trim(), 'Boa noite, Pedro Neiva');
    assert.equal(await page.textContent('.greet-name'), 'Pedro Neiva');

    step('nome com HTML é texto; apagar o nome volta a "Boa noite"');
    await page.goto(`${BASE}#/ajustes`);
    await onPage(page, 'ajustes');
    await page.fill('#set-name', '<img src=x onerror="window.__xss=1">');
    await page.locator('#set-name').press('Enter');
    await page.goto(`${BASE}#/inicio`);
    await onPage(page, 'inicio');
    assert.equal(await page.locator('.greet img').count(), 0);
    assert.equal(await page.evaluate(() => window.__xss), undefined);
    assert.match(await page.textContent('.greet-name'), /^<img src=x onerror=/);
    assert.ok([...(await page.textContent('.greet-name'))].length <= 30, 'no máximo 30 caracteres');
    await page.goto(`${BASE}#/ajustes`);
    await onPage(page, 'ajustes');
    await page.fill('#set-name', '   ');
    await page.locator('#set-name').press('Enter');
    await toastHas(page, /Nome removido/);
    assert.equal(await page.evaluate(() => localStorage.getItem('leituras:nome')), null);
    await page.goto(`${BASE}#/inicio`);
    await onPage(page, 'inicio');
    assert.equal((await page.textContent('.greet-title')).trim(), 'Boa noite');
    await context.close();
  }

  step('bom dia (9h) e boa tarde (15h); sem leitura hoje, a sequência até ontem continua');
  for (const [time, hello] of [['2026-10-29T09:00:00', 'Bom dia, Karoline'], ['2026-10-29T15:00:00', 'Boa tarde, Karoline']]) {
    const { context, page } = await newPage({ time, name: 'Karoline' });
    assert.equal((await page.textContent('.greet-title')).trim(), hello);
    assert.equal(await page.textContent('.greet-date'), 'quinta, 29 de outubro');
    assert.equal(await page.textContent('.greet-streak'), '3 dias seguidos lendo');
    await context.close();
  }

  // ---------- 1, 2 e 3: cartões "Lendo agora" ----------
  step('cartões: só o primeiro com botão cheio; link do total de páginas; véu da cor da capa');
  for (const scheme of ['dark', 'light']) {
    const { context, page } = await newPage({ scheme, name: scheme === 'dark' ? 'Pedro' : 'Karoline' });
    const tag = scheme === 'dark' ? 'escuro' : 'claro';
    const cards = page.locator('#app .reading');
    assert.equal(await cards.count(), 3);
    assert.equal(await cards.nth(0).locator('.rn-main.btn-primary').count(), 1, 'primeiro cartão: botão cheio');
    for (const i of [1, 2]) {
      assert.equal(await cards.nth(i).locator('.rn-main.btn-primary').count(), 0, `cartão ${i + 1}: sem botão cheio`);
      assert.equal(await cards.nth(i).locator('.rn-main.btn-tonal').count(), 1, `cartão ${i + 1}: botão tonal`);
    }
    assert.equal((await cards.nth(2).locator('.rn-main').textContent()).trim(), 'Concluir', 'o 100% continua com Concluir (tonal)');
    const [primary, tonal] = await Promise.all([cards.nth(0).locator('.rn-main').boundingBox(), cards.nth(1).locator('.rn-main').boundingBox()]);
    assert.ok(tonal.height >= 44 && Math.abs(tonal.height - primary.height) < 1, 'tonal do mesmo tamanho (≥ 44px)');
    const look = await page.evaluate(() => {
      const [a, b] = [...document.querySelectorAll('#app .reading .rn-main')].map((el) => getComputedStyle(el));
      return { primaryBg: a.backgroundColor, tonalBg: b.backgroundColor, tonalColor: b.color, accent: getComputedStyle(document.documentElement).getPropertyValue('--accent').trim() };
    });
    assert.notEqual(look.primaryBg, look.tonalBg, 'tonal mais leve que o cheio');

    // Item 2: link no lugar do texto solto.
    const ask = cards.nth(1).locator('.pages-ask');
    assert.equal(await ask.textContent(), 'informe o total de páginas');
    assert.equal(await cards.nth(1).locator('.rn-progress').textContent(), 'pág. 50 · informe o total de páginas para ver o %');
    assert.match(await ask.getAttribute('href'), /#\/livro\/r2\/editar\?campo=paginas$/);
    // Área de toque: um ponto 10px acima do texto ainda é o link (e não o cartão).
    const hit = await ask.evaluate((el) => {
      const r = el.getBoundingClientRect();
      const top = document.elementFromPoint(r.left + r.width / 2, r.top - 8);
      return { tall: r.height, ok: top === el };
    });
    assert.ok(hit.ok, 'área de toque do link maior que o texto');

    // Item 3: capa de imagem → véu da cor dela; capa desenhada → regra de antes.
    await page.waitForFunction(() => document.querySelector('.reading[data-id="r1"]').dataset.tintSrc === 'capa');
    await page.waitForTimeout(700); // o véu entra esmaecendo
    const tint = await page.evaluate(() => {
      const card = (id) => document.querySelector(`#app .reading[data-id="${id}"]`);
      const veil = (id) => getComputedStyle(card(id), '::before').opacity;
      return {
        r1: card('r1').style.getPropertyValue('--tint'), r1Veil: veil('r1'), r3Src: card('r3').dataset.tintSrc,
        r2Src: card('r2').dataset.tintSrc ?? null, r2Veil: veil('r2'), r2Bg: getComputedStyle(card('r2')).backgroundImage,
      };
    });
    const [r, g, b] = tint.r1.trim().split(' ').map(Number);
    assert.ok(g > r && b > r, `cartão de capa verde-azulada tingido de verde-azulado (${tint.r1})`);
    assert.equal(tint.r1Veil, '1', 'véu da cor da capa visível');
    assert.equal(tint.r3Src, 'capa');
    assert.equal(tint.r2Src, null, 'capa desenhada: sem cor de imagem');
    // 1.6.1: o brilho da cor da capa vale para os dois casos; o cartão em si é neutro.
    assert.equal(tint.r2Veil, '1', 'capa desenhada: brilho da cor da capa');
    assert.equal(tint.r2Bg, 'none', 'cartão neutro, sem degradê');

    // Contraste do texto sobre o véu (título e linha de progresso).
    const contrast = await page.evaluate(() => {
      const lum = (c) => {
        const [r1, g1, b1] = c.match(/[\d.]+/g).slice(0, 3).map(Number).map((v) => v / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
        return 0.2126 * r1 + 0.7152 * g1 + 0.0722 * b1;
      };
      const ratio = (a, b2) => (Math.max(lum(a), lum(b2)) + 0.05) / (Math.min(lum(a), lum(b2)) + 0.05);
      // Amostra do fundo: pinta o cartão num canvas não dá; usa a cor --tint misturada como no CSS.
      const card = document.querySelector('#app .reading[data-id="r1"]');
      const text = getComputedStyle(card.querySelector('.rn-progress')).color;
      const t = card.style.getPropertyValue('--tint').trim().split(' ').map(Number);
      const surface = getComputedStyle(document.documentElement).getPropertyValue('--surface').trim();
      const probe = document.createElement('span');
      probe.style.color = surface;
      document.body.append(probe);
      const s = getComputedStyle(probe).color.match(/\d+/g).map(Number);
      probe.remove();
      const light = document.documentElement.dataset.theme === 'light';
      // Ponto mais forte do brilho (1.6.1: 0,19 no escuro; 0,14 no claro) sobre a superfície.
      const a = light ? 0.14 : 0.19;
      const mix = s.map((v, i) => Math.round(v * (1 - a) + t[i] * a));
      return ratio(text, `rgb(${mix.join(',')})`);
    });
    assert.ok(contrast >= 4.5, `${scheme}: contraste do texto sobre o véu (${contrast.toFixed(2)})`);

    for (const width of [320, 390, 430]) {
      await page.setViewportSize({ width, height: width === 320 ? 568 : width === 430 ? 932 : 844 });
      await page.evaluate(() => scrollTo(0, 0));
      assert.ok(await overflow(page) <= 0, `${scheme} ${width}px: rolagem horizontal`);
      // Ações do cartão tonal numa linha e sem quebrar o rótulo.
      const [main, play, more] = await Promise.all(['.rn-main', '.btn-timer', '.rn-more'].map((s) => cards.nth(1).locator(s).boundingBox()));
      assert.ok(Math.abs(main.y - play.y) < 2 && Math.abs(play.y - more.y) < 2, `${width}px: ações fora de linha`);
      assert.ok(main.height <= 50, `${width}px: rótulo do botão tonal quebrou`);
      // Saudação com nome longo cabe (quebra a linha, sem vazar).
      const greet = await page.locator('.greet-title').boundingBox();
      assert.ok(greet.x >= 0 && greet.x + greet.width <= width, `${width}px: saudação vaza`);
      await shot(page, `${tag}-${width}`);
      // A data cabe inteira (no 320 em duas linhas), sem reticências.
      assert.equal(await page.locator('.greet-date').evaluate((el) => el.scrollWidth <= el.clientWidth), true, `${width}px: data cortada`);
      await page.locator('#app .reading').nth(1).evaluate((el) => el.scrollIntoView({ block: 'center' }));
      await shot(page, `${tag}-${width}-cartoes`);
    }
    await page.setViewportSize({ width: 390, height: 844 });
    await page.evaluate(() => scrollTo(0, 0));
    await shot(page, `${tag}-390-inteiro`, true);

    step(`${scheme}: o link abre a edição com o foco no campo Páginas (Início e ficha)`);
    await cards.nth(1).locator('.pages-ask').click();
    await onPage(page, 'livro');
    await page.waitForFunction(() => document.activeElement?.id === 'f-pages');
    assert.equal(await page.textContent('.form-title'), 'Editar livro');
    await shot(page, `${tag}-390-campo-paginas`);
    await page.fill('#f-pages', '250');
    await page.click('.form-actions .btn-primary');
    await page.waitForFunction(() => document.getElementById('app').dataset.page === 'inicio');
    assert.match(await page.locator('#app .reading[data-id="r2"] .rn-progress').textContent(), /pág\. 50 de 250/);
    // Ficha: a mesma frase é link.
    await page.evaluate(async () => {
      const db = await import('/js/db.js');
      const s = await db.getItem('state');
      s.books.find((x) => x.id === 'r2').pages = null;
      await db.setItem('state', s);
    });
    await page.goto(`${BASE}#/livro/r2`);
    await page.reload();
    await page.waitForSelector('.ficha-card .pages-ask');
    assert.equal(await page.textContent('.ficha-card p.ficha-progress-label'), 'Na pág. 50 · informe o total de páginas para ver o %');
    await page.click('.ficha-card .pages-ask');
    await page.waitForFunction(() => document.activeElement?.id === 'f-pages');
    await context.close();
  }

  // ---------- 5. Festa ao concluir ----------
  step('concluir pelo Início: volta, capa salta para a grade, confete e o número sobe');
  for (const scheme of ['dark', 'light']) {
    const { context, page } = await newPage({ scheme, name: 'Pedro' });
    const tag = scheme === 'dark' ? 'escuro' : 'claro';
    await page.waitForFunction(() => document.querySelector('.ring-count').textContent === '3'); // fim da animação de abertura
    await page.waitForTimeout(300);
    await page.click('#app .reading[data-id="r3"] .rn-main');
    await onPage(page, 'livro');
    await page.waitForSelector('.form-actions .btn-primary');
    await page.click('.form-actions .btn-primary');
    await onPage(page, 'inicio');
    await toastHas(page, DONE_TOAST);
    await page.waitForSelector('.grid-cover.is-celebrated', { timeout: 2000 });
    // A grade já tem o livro; o número sobe de 3 para 4.
    const ticking = await page.textContent('.ring-count');
    assert.ok(['3', '4'].includes(ticking));
    await page.waitForSelector('.confetti i', { timeout: 3000 });
    // Captura um quadro fixo do meio da festa (as animações param durante a captura).
    await page.waitForTimeout(120);
    await page.evaluate(() => document.getAnimations().forEach((a) => a.pause()));
    await page.screenshot({ path: join(SHOTS, `v15-inicio-${tag}-390-festa.png`) });
    await page.evaluate(() => document.getAnimations().forEach((a) => a.play()));
    const layer = await page.evaluate(() => {
      const el = document.querySelector('.confetti');
      return { pe: getComputedStyle(el).pointerEvents, n: el.children.length, hidden: el.getAttribute('aria-hidden') };
    });
    assert.equal(layer.pe, 'none', 'o confete não bloqueia o toque');
    assert.equal(layer.hidden, 'true');
    assert.ok(layer.n >= 16 && layer.n <= 40, `confete discreto (${layer.n} peças)`);
    // Durante a festa a tela responde (um toque num link funciona).
    assert.equal(await page.evaluate(() => {
      const inside = [...document.querySelectorAll('.confetti i')].map((i) => i.getBoundingClientRect())
        .filter((r) => r.top > 0 && r.left > 0 && r.bottom < innerHeight && r.right < innerWidth);
      return inside.length > 0 && inside.every((r) => !document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2)?.closest('.confetti'));
    }), true, 'toque atravessa o confete');
    await page.waitForSelector('.confetti', { state: 'detached', timeout: 3000 });
    await page.waitForFunction(() => !document.querySelector('.is-celebrated'), null, { timeout: 3000 });
    assert.equal(await page.textContent('.ring-count'), '4');
    const s = await readState(page);
    assert.equal(s.books.find((x) => x.id === 'r3').status, 'lido');
    // Voltar ao Início de novo não repete a festa.
    await page.click('[data-nav="estante"]');
    await onPage(page, 'estante');
    await page.click('[data-nav="inicio"]');
    await onPage(page, 'inicio');
    await page.waitForTimeout(900);
    assert.equal(await page.locator('.confetti, .is-celebrated').count(), 0, 'festa uma vez só');
    await context.close();
  }

  step('"Terminei o livro" (folha Registrar leitura) também comemora; a festa sai do anel se a capa não estiver na grade');
  {
    // Seis lidos mais recentes: o livro concluído com data antiga fica fora da grade.
    const more = ['Fev', 'Abr', 'Jun', 'Ago', 'Set', 'Out'].map((t, i) => read(`m${i}`, `Livro de ${t}`, `2026-${String(i + 2).padStart(2, '0')}-15`, { pages: 10 }));
    const { context, page } = await newPage({ name: 'Pedro', data: { ...seed, books: [...seed.books, ...more] } });
    await page.waitForFunction(() => document.querySelector('.ring-count').textContent === '9');
    await page.click('#app .reading[data-id="r1"] .rn-main');
    await page.waitForSelector('.sheet-layer.is-open [data-action="progress-finish"]');
    await page.click('[data-action="progress-finish"]');
    await onPage(page, 'livro');
    await page.waitForSelector('.form-actions .btn-primary');
    await page.evaluate(() => {
      for (const [id, value] of [['f-start', '2026-01-01'], ['f-end', '2026-01-05']]) {
        const input = document.getElementById(id);
        input.value = value;
        input.dispatchEvent(new Event('input', { bubbles: true }));
      }
    });
    await page.click('.form-actions .btn-primary');
    await onPage(page, 'inicio');
    await toastHas(page, DONE_TOAST);
    await page.waitForSelector('.confetti i', { timeout: 3000 });
    assert.equal(await page.locator('.grid-book[href="#/livro/r1"]').count(), 0, 'fora da grade');
    assert.equal(await page.locator('.is-celebrated').count(), 0);
    const [ring, burst] = await Promise.all([page.locator('.bento-ring .ring').boundingBox(), page.evaluate(() => {
      // Ponto de partida das peças (antes do movimento).
      const i = document.querySelector('.confetti i');
      return { x: parseFloat(i.style.left) + parseFloat(i.style.width) / 2, y: parseFloat(i.style.top) + parseFloat(i.style.height) / 2 };
    })]);
    assert.ok(Math.abs(burst.x - (ring.x + ring.width / 2)) < 4 && Math.abs(burst.y - (ring.y + ring.height / 2)) < 4, 'confete sai do anel');
    await page.waitForSelector('.confetti', { state: 'detached', timeout: 3000 });
    assert.equal(await page.textContent('.ring-count'), '10');
    await context.close();
  }

  step('sem movimento: sem confete nem salto, só o toast');
  {
    const { context, page } = await newPage({ reducedMotion: 'reduce', name: 'Pedro' });
    await page.click('#app .reading[data-id="r3"] .rn-main');
    await onPage(page, 'livro');
    await page.waitForSelector('.form-actions .btn-primary');
    await page.click('.form-actions .btn-primary');
    await onPage(page, 'inicio');
    await toastHas(page, DONE_TOAST);
    await page.waitForTimeout(1500);
    assert.equal(await page.locator('.confetti, .is-celebrated').count(), 0);
    assert.equal(await page.textContent('.ring-count'), '4');
    await context.close();
  }

  assert.deepEqual(errors, [], `erros no console:\n${errors.join('\n')}`);
  console.log('OK: Início 1.5');
} finally {
  await browser.close();
  server.close();
}
