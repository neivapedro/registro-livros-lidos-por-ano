// Teste de ponta a ponta da 1.5 (capas, lombadas e textura):
// - capa desenhada com ornamento, título em serifa e autor em versalete; nas miniaturas, as iniciais;
// - lombada e borda de páginas em toda capa (com e sem imagem), sem cobrir o anel nem o selo;
// - Estante em Lista, Capas e Lombadas, em 320, 390 e 430px, no escuro e no claro: sem rolagem
//   para o lado, lombadas com link, toque longo abre o menu rápido, modo guardado na sessão,
//   texto da lombada legível (4,5:1) e cabeçalhos de ano em Lidos;
// - grão de papel atrás de tudo (não recebe toque, não cobre a barra de navegação).
// Uso: node tests/e2e/v15-capas.mjs   (precisa do Playwright; capturas em tests/e2e/screens/v15-capas-*.png)

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

// ---------- Navegador ----------

const browser = await playwright.chromium.launch();
const options = { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, locale: 'pt-BR' };
const context = await browser.newContext(options);
const page = await context.newPage();
await page.clock.setFixedTime(new Date('2026-10-16T12:00:00'));

const errors = [];
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errors.push(`console: ${m.text()}`); });
page.on('dialog', (d) => d.accept());

const writeState = (data) => page.evaluate(async (d) => (await import('/js/db.js')).setItem('state', d), data);
const step = (msg) => console.log(`• ${msg}`);
const onPage = (name) => page.waitForFunction((n) => document.getElementById('app').dataset.page === n, name);
const openSheet = '.sheet-layer.is-open';
const sheetGone = () => page.waitForSelector('.sheet-layer', { state: 'detached', timeout: 5000 });
const shot = async (name, full = false) => {
  await page.waitForTimeout(250);
  await page.screenshot({ path: join(SHOTS, `v15-capas-${name}.png`), fullPage: full });
};
const overflow = () => page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);

/** Toque com eventos de ponteiro (segurar = toque longo). */
async function touch(selector, holdMs = 0) {
  await page.evaluate(async ([sel, hold]) => {
    const el = document.querySelector(sel);
    const r = el.getBoundingClientRect();
    const x = r.left + r.width / 2;
    const y = r.top + r.height / 2;
    const fire = (type) => el.dispatchEvent(new PointerEvent(type, {
      bubbles: true, cancelable: true, composed: true, pointerType: 'touch', isPrimary: true, button: 0, clientX: x, clientY: y, pointerId: 7,
    }));
    fire('pointerdown');
    if (hold) await new Promise((res) => setTimeout(res, hold));
    fire('pointerup');
    el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, clientX: x, clientY: y }));
  }, [selector, holdMs]);
}

// ---------- Dados ----------

// Capas "fotografadas" (data: JPEG, como a foto do celular), desenhadas no próprio navegador:
// uma vermelha, uma azul-clara e uma amarela (a lombada tem de achar a tinta legível em cada uma).
await page.goto(`${BASE}#/inicio`);
await page.waitForSelector('#app[data-page]');
const photos = await page.evaluate(() => {
  const make = (a, b, text) => {
    const c = document.createElement('canvas');
    c.width = 120;
    c.height = 180;
    const x = c.getContext('2d');
    const g = x.createLinearGradient(0, 0, 120, 180);
    g.addColorStop(0, a);
    g.addColorStop(1, b);
    x.fillStyle = g;
    x.fillRect(0, 0, 120, 180);
    x.fillStyle = 'rgba(255,255,255,.85)';
    x.font = 'bold 22px serif';
    x.fillText(text, 12, 140);
    return c.toDataURL('image/jpeg', 0.8);
  };
  return { red: make('#B3261E', '#5E0F0B', 'ROMA'), sky: make('#9CC9E8', '#5D97C4', 'MAR'), yellow: make('#F5D547', '#E0A800', 'SOL') };
});

const TS = '2026-01-01T00:00:00.000Z';
const read = (id, title, authors, endDate, extra = {}) => ({
  id, title, authors, status: 'lido', startDate: endDate.replace(/-\d\d$/, '-01'), endDate, pages: 300, format: 'fisico',
  rating: 4, genre: 'Ficção', createdAt: TS, updatedAt: TS, ...extra,
});
const TITLES = [
  ['Dom Casmurro', 'Machado de Assis', 256], ['O Nome da Rosa', 'Umberto Eco', 560], ['Grande Sertão: Veredas', 'João Guimarães Rosa', 624],
  ['Duna', 'Frank Herbert', 680], ['Torto Arado', 'Itamar Vieira Junior', 264], ['Sapiens', 'Yuval Noah Harari', 472],
  ['1984', 'George Orwell', 336], ['A Hora da Estrela', 'Clarice Lispector', 88], ['Cem Anos de Solidão', 'Gabriel García Márquez', 448],
  ['Ensaio sobre a Cegueira', 'José Saramago', 312], ['Memórias Póstumas de Brás Cubas', 'Machado de Assis', 208], ['Vidas Secas', 'Graciliano Ramos', 176],
  ['O Hobbit', 'J. R. R. Tolkien', 310], ['Capitães da Areia', 'Jorge Amado', 280], ['Meditações', 'Marco Aurélio', 0],
];
const books = TITLES.map(([title, authors, pages], i) => read(`a${i + 1}`, title, authors, i < 10 ? `2026-0${(i % 9) + 1}-1${i % 9}` : `2025-0${(i % 9) + 1}-12`, {
  pages: pages || null,
  favorite: i === 3,
  cover: i === 1 ? photos.red : i === 4 ? photos.sky : i === 6 ? photos.yellow : undefined,
}));
books.push(
  { id: 'r1', title: 'Fora de Série', authors: 'Malcolm Gladwell', status: 'lendo', format: 'fisico', pages: 300, currentPage: 120, startDate: '2026-10-01', createdAt: TS, updatedAt: TS, cover: photos.red },
  { id: 'r2', title: 'O Poder do Hábito', authors: 'Charles Duhigg', status: 'lendo', format: 'kindle', currentPercent: 40, startDate: '2026-10-05', createdAt: TS, updatedAt: TS },
  { id: 'w1', title: 'O Gerente Minuto', authors: 'Ken Blanchard', status: 'quero', format: 'fisico', pages: 112, createdAt: '2026-09-01T00:00:00.000Z', updatedAt: TS },
  { id: 'w2', title: 'Pai Rico, Pai Pobre', authors: 'Robert Kiyosaki', status: 'quero', format: 'fisico', pages: 336, createdAt: '2026-09-02T00:00:00.000Z', updatedAt: TS, cover: photos.sky },
  { id: 'w3', title: 'Neuromancer', authors: 'William Gibson', status: 'quero', format: 'kindle', createdAt: '2026-09-03T00:00:00.000Z', updatedAt: TS },
  { id: 'd1', title: 'Livro chato', authors: 'Ninguém', status: 'abandonado', format: 'fisico', startDate: '2026-04-01', endDate: '2026-04-10', dropReason: 'Não prendeu.', createdAt: TS, updatedAt: TS },
);
const seed = { version: 2, goals: { 2026: 12 }, defaultGoal: 12, customGenres: [], lastBackupAt: '2026-10-01T10:00:00.000Z', upNext: ['w1', 'w2'], books };

async function open(hash, theme) {
  await page.evaluate((t) => localStorage.setItem('leituras:tema', t), theme);
  await page.goto(`${BASE}${hash}`);
  await page.reload();
  await page.waitForSelector('#app[data-page]');
}

async function setMode(mode) {
  await page.click(`[data-action="shelf-mode"][data-value="${mode}"]`);
  await page.waitForSelector(`.shelf-list[data-mode="${mode}"]`);
}

/** Contraste WCAG entre o texto e o fundo de cada lombada (cores calculadas pelo navegador). */
const spineContrasts = () => page.evaluate(() => {
  const rgb = (s) => s.match(/[\d.]+/g).slice(0, 3).map(Number);
  const lum = ([r, g, b]) => [r, g, b].map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  }).reduce((acc, v, i) => acc + v * [0.2126, 0.7152, 0.0722][i], 0);
  return [...document.querySelectorAll('.spine')].map((el) => {
    const cs = getComputedStyle(el);
    const [a, b] = [lum(rgb(cs.backgroundColor)), lum(rgb(cs.color))].sort((x, y) => y - x);
    return { id: el.dataset.id, ratio: (a + 0.05) / (b + 0.05) };
  });
});

try {
  await writeState(seed);

  for (const theme of ['escuro', 'claro']) {
    const tag = theme === 'escuro' ? 'escuro' : 'claro';

    step(`${tag}: Estante (Lidos) em Lista, Capas e Lombadas — 320, 390 e 430px`);
    await page.setViewportSize({ width: 390, height: 844 });
    await open('#/estante?aba=lido', theme);
    await onPage('estante');
    for (const mode of ['lista', 'capas', 'lombadas']) {
      await setMode(mode);
      assert.equal(await page.getAttribute(`[data-action="shelf-mode"][data-value="${mode}"]`, 'aria-pressed'), 'true');
      for (const width of [320, 390, 430]) {
        await page.setViewportSize({ width, height: 844 });
        await page.evaluate(() => window.scrollTo(0, 0));
        assert.ok(await overflow() <= 0, `${tag} ${mode} ${width}px: rolagem para o lado`);
        // Os três botões de modo cabem numa linha só, com área de toque de verdade.
        const seg = await page.evaluate(() => [...document.querySelectorAll('.shelf-modes .mini-seg-btn')].map((b) => b.getBoundingClientRect()).map((r) => [Math.round(r.top), r.width, r.height]));
        assert.equal(new Set(seg.map((s) => s[0])).size, 1, `${tag} ${mode} ${width}px: botões de modo na mesma linha`);
        assert.ok(seg.every(([, w, h]) => w >= 36 && h >= 40), `${tag} ${mode} ${width}px: botões de modo pequenos demais ${JSON.stringify(seg)}`);
        await shot(`${tag}-${mode}-${width}`);
      }
    }
    await page.setViewportSize({ width: 390, height: 844 });

    step(`${tag}: lombadas — anos, links, rótulos, larguras, contraste e tábua`);
    assert.equal(await page.locator('.spine').count(), TITLES.length, 'uma lombada por livro lido');
    assert.deepEqual(await page.locator('.year-head').evaluateAll((els) => els.map((e) => e.firstChild.textContent.trim())), ['2026', '2025']);
    const spines = await page.locator('.spine').evaluateAll((els) => els.map((el) => ({
      id: el.dataset.id, href: el.getAttribute('href'), label: el.getAttribute('aria-label'),
      w: el.getBoundingClientRect().width, h: el.getBoundingClientRect().height, foot: el.querySelector('.sp-foot')?.textContent,
    })));
    for (const s of spines) {
      assert.equal(s.href, `#/livro/${s.id}`);
      const [title, authors] = TITLES[Number(s.id.slice(1)) - 1];
      assert.equal(s.label, `${title}, ${authors}`);
      assert.ok(s.w >= 20 && s.w <= 42, `largura ${s.w}`);
      assert.ok(s.h >= 112 && s.h <= 138, `altura ${s.h}`);
    }
    const by = Object.fromEntries(spines.map((s) => [s.id, s]));
    assert.ok(by.a4.w > by.a8.w, 'livro grosso (680 p.) tem lombada mais larga que o fino (88 p.)');
    assert.equal(by.a1.foot, 'MA', 'iniciais do autor ao pé (Machado de Assis)');
    for (const { id, ratio } of await spineContrasts()) assert.ok(ratio >= 4.5, `${tag}: lombada ${id} com contraste ${ratio.toFixed(2)}`);
    // A lombada com capa de foto pega a cor da imagem (vermelha), não a da capa desenhada.
    await page.waitForFunction(() => {
      const el = document.querySelector('.spine[data-id="a2"]');
      const [r, g, b] = getComputedStyle(el).backgroundColor.match(/[\d.]+/g).map(Number);
      return r > g * 1.6 && r > b * 1.6;
    }, null, { timeout: 4000 });
    // A tábua fica sob cada fileira: o pé de cada lombada encosta nela.
    const { row, feet } = await page.evaluate(() => {
      const shelf = document.querySelector('.spine-shelf');
      const row = parseFloat(getComputedStyle(shelf).getPropertyValue('--row'));
      const plank = parseFloat(getComputedStyle(shelf).getPropertyValue('--plank-h'));
      const top = shelf.getBoundingClientRect().top + shelf.clientTop;
      return { row, feet: [...shelf.querySelectorAll('.spine')].map((el) => (((el.getBoundingClientRect().bottom - top + plank) % row) + row) % row) };
    });
    assert.ok(feet.every((f) => f < 1 || f > row - 1), `lombadas em pé sobre a tábua: ${feet.join(', ')}`);
    // Toque de verdade cai na lombada.
    const hit = await page.evaluate(() => {
      const el = document.querySelector('.spine[data-id="a3"]');
      const r = el.getBoundingClientRect();
      return document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2)?.closest('.spine') === el;
    });
    assert.ok(hit, 'a lombada recebe o toque');
    await shot(`${tag}-lombadas-inteira`, true);

    step(`${tag}: tocar abre o livro; o modo continua ao voltar`);
    await page.click('.spine[data-id="a3"]');
    await onPage('livro');
    assert.match(page.url(), /#\/livro\/a3$/);
    await page.goBack();
    await onPage('estante');
    await page.waitForSelector('.shelf-list[data-mode="lombadas"]');
    await page.reload();
    await page.waitForSelector('.shelf-list[data-mode="lombadas"]');

    step(`${tag}: Quero ler em lombadas — posição da fila e toque longo abre o menu rápido`);
    await page.goto(`${BASE}#/estante?aba=quero`);
    await page.waitForSelector('.spine-shelf');
    assert.deepEqual(await page.locator('.sp-item .next-pos').allTextContents(), ['1º', '2º']);
    assert.equal(await page.getAttribute('.spine[data-id="w3"]', 'data-longpress'), '');
    await touch('.spine[data-id="w3"]', 650);
    await page.waitForSelector(`${openSheet} .qm`);
    assert.equal(await page.evaluate(() => document.getElementById('app').dataset.page), 'estante', 'segurar não abre o livro');
    await shot(`${tag}-lombadas-menu`);
    await page.keyboard.press('Escape');
    await sheetGone();
    await shot(`${tag}-lombadas-quero`);
    await page.goto(`${BASE}#/estante?aba=lendo`);
    await page.waitForSelector('.spine-shelf');
    assert.equal(await page.locator('.spine').count(), 2);
    for (const { id, ratio } of await spineContrasts()) assert.ok(ratio >= 4.5, `${tag}: lombada ${id} com contraste ${ratio.toFixed(2)}`);
    await setMode('lista');

    step(`${tag}: capas desenhadas e com imagem — lista, Início, Buscar e ficha`);
    await page.goto(`${BASE}#/estante?aba=lido`);
    await page.waitForSelector('.group');
    // Miniatura sem imagem mostra as iniciais do título; com imagem, a imagem cobre.
    assert.equal((await page.textContent('.book-row[data-id="a1"] .cover-ini')).trim(), 'DC');
    assert.equal((await page.textContent('.book-row[data-id="a2"] .cover-ini')).trim(), 'NR');
    const thumb = await page.evaluate(() => {
      const c = document.querySelector('.book-row[data-id="a1"] .cover');
      const ini = c.querySelector('.cover-ini').getBoundingClientRect();
      const box = c.getBoundingClientRect();
      const before = getComputedStyle(c, '::before');
      return { inside: ini.left >= box.left && ini.right <= box.right && ini.top >= box.top && ini.bottom <= box.bottom, spine: before.content !== 'none' && parseFloat(before.width) >= 3 };
    });
    assert.ok(thumb.inside, 'iniciais dentro da miniatura');
    assert.ok(thumb.spine, 'lombada sobre a miniatura');
    await shot(`${tag}-lista-miniaturas`);
    await setMode('capas');
    await shot(`${tag}-capas-grade`);
    await setMode('lista');

    await page.goto(`${BASE}#/inicio`);
    await onPage('inicio');
    await page.waitForSelector('.reading');
    // O anel de progresso continua por cima da capa (a lombada não o cobre).
    const ring = await page.evaluate(() => {
      const r = document.querySelector('.reading[data-id="r1"] .cov-ring');
      if (!r) return true;
      const b = r.getBoundingClientRect();
      // (o link do cartão cobre tudo por cima; o que importa é o anel acima da capa)
      const stack = document.elementsFromPoint(b.left + b.width / 2, b.top + b.height / 2);
      const ringAt = stack.findIndex((el) => el.closest('.cov-ring') === r);
      const coverAt = stack.findIndex((el) => el.matches('.cover, .cover *'));
      return ringAt >= 0 && (coverAt < 0 || ringAt < coverAt);
    });
    assert.ok(ring, 'anel de progresso visível sobre a capa');
    await shot(`${tag}-inicio`);

    await page.goto(`${BASE}#/buscar`);
    await onPage('buscar');
    await shot(`${tag}-buscar`);

    for (const id of ['a1', 'a2', 'a4']) {
      await page.goto(`${BASE}#/livro/${id}`);
      await onPage('livro');
      await page.waitForSelector('.ficha-cover .cover');
      const hero = await page.evaluate(() => {
        const c = document.querySelector('.ficha-cover .cover');
        return { vt: getComputedStyle(c).viewTransitionName, before: getComputedStyle(c, '::before').content, title: c.querySelector('.cover-title')?.textContent };
      });
      assert.equal(hero.vt, 'book-cover', 'transição da capa intacta');
      assert.notEqual(hero.before, 'none', 'lombada na capa grande');
      if (id !== 'a2') await shot(`${tag}-ficha-${id}`);
    }
    // Capa ampliada (zoom) de uma capa com imagem continua abrindo.
    await page.goto(`${BASE}#/livro/a2`);
    await page.click('[data-action="zoom-book-cover"]');
    await page.waitForSelector('.cover-viewer');
    await page.keyboard.press('Escape');

    step(`${tag}: grão de papel atrás de tudo, sem cobrir a navegação`);
    await page.goto(`${BASE}#/estante?aba=lido`);
    await onPage('estante');
    const grain = await page.evaluate(() => {
      const cs = getComputedStyle(document.getElementById('app'), '::before');
      const nav = document.getElementById('nav').getBoundingClientRect();
      const hitNav = document.elementFromPoint(nav.left + 40, nav.top + nav.height / 2)?.closest('#nav');
      return { img: cs.backgroundImage, pe: cs.pointerEvents, z: cs.zIndex, pos: cs.position, op: Number(cs.opacity), hitNav: Boolean(hitNav) };
    });
    assert.match(grain.img, /svg/);
    assert.equal(grain.pe, 'none');
    assert.equal(grain.z, '-1');
    assert.equal(grain.pos, 'fixed');
    assert.ok(grain.op > 0 && grain.op <= 1);
    assert.ok(grain.hitNav, 'a barra de navegação recebe o toque');
  }

  step('sem movimento: a lombada não sobe ao tocar');
  {
    const ctx = await browser.newContext({ ...options, reducedMotion: 'reduce' });
    const p = await ctx.newPage();
    await p.goto(`${BASE}#/estante?aba=lido`);
    await p.waitForSelector('#app[data-page]');
    await p.evaluate(async (d) => (await import('/js/db.js')).setItem('state', d), seed);
    await p.evaluate(() => sessionStorage.setItem('leituras:estante-modo', 'lombadas'));
    await p.reload();
    await p.waitForSelector('.spine');
    assert.equal(await p.evaluate(() => getComputedStyle(document.querySelector('.spine')).transitionDuration), '0s');
    await ctx.close();
  }

  assert.deepEqual(errors, []);
  console.log('\nTudo certo. Capturas em tests/e2e/screens/v15-capas-*.png');
} catch (err) {
  await page.screenshot({ path: join(SHOTS, 'v15-capas-falha.png'), fullPage: true }).catch(() => {});
  console.error('\nFALHOU:', err.message);
  if (errors.length) console.error(errors.join('\n'));
  process.exitCode = 1;
} finally {
  await browser.close();
  server.close();
}
