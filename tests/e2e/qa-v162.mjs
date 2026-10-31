
// QA 1.6.2 (interações entre as duas frentes): faixa da barra de status (véu e degradê) contra barras
// fixas, folhas e rotas; Ajustes instalado/no navegador; cartão "Lendo agora" em 320 px × 1,6.
// Capturas: tests/e2e/screens/qa-v162-*.png   Uso: node tests/e2e/qa-v162.mjs

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

const TS = '2026-01-01T00:00:00.000Z';
const base = { authors: 'Autor', format: 'fisico', genre: 'Ficção', tags: [], quotes: [], journal: [], createdAt: TS, updatedAt: TS, favorite: false, notes: '', isbn: '' };
const lidos = Array.from({ length: 14 }, (_, i) => ({
  ...base, id: `l${i}`, title: `Livro lido número ${i + 1}`, authors: `Autora ${i + 1}`, pages: 200 + i, status: 'lido', startDate: '2026-02-01', endDate: `2026-03-${String(i + 1).padStart(2, '0')}`, rating: 4, genre: i % 2 ? 'Ficção' : 'História',
}));
const seed = {
  version: 2, goals: { 2026: 12 }, defaultGoal: 12, customGenres: [], lastBackupAt: '2026-10-10T10:00:00.000Z', pageGoals: { 2026: 5000 }, upNext: ['w1'],
  books: [
    ...lidos,
    { ...base, id: 'c1', title: 'Hábitos Atômicos', authors: 'James Clear', pages: 320, status: 'lido', startDate: '2026-01-22', endDate: '2026-02-10', rating: 4.5, favorite: true,
      criteria: { personagens: 5, enredo: 4.5, escrita: 5, emocao: 4 }, moods: ['reflexivo'], pace: 'medio', description: 'Pequenas mudanças, resultados notáveis: um método prático.', isbn: '9788550807560',
      journal: [{ date: '2026-01-22', from: 0, to: 40, unit: 'page', note: '' }, { date: '2026-01-25', from: 40, to: 90, unit: 'page', note: '' }],
      quotes: [{ id: 'q1', text: 'Você não sobe ao nível das suas metas.', page: 27, percent: null, note: '', createdAt: '2026-02-01T10:00:00.000Z' }] },
    { ...base, id: 'r1', title: 'Extraordinariamente Incompreensivelmente Longo', authors: 'Fulana de Tal Sobrenome Comprido', pages: 500, currentPage: 160, status: 'lendo', startDate: '2026-10-06',
      journal: [{ date: '2026-10-14', from: 100, to: 160, unit: 'page', note: '' }] },
    { ...base, id: 'r2', title: 'Quase no fim', authors: 'Beltrano', status: 'lendo', format: 'kindle', currentPercent: 100, startDate: '2026-10-02' },
    { ...base, id: 'w1', title: 'Cem Anos de Solidão', authors: 'Gabriel García Márquez', status: 'quero', pages: 448 },
  ],
};

const browser = await playwright.chromium.launch();
const errors = [];
const step = (msg) => console.log(`• ${msg}`);
const shot = (page, name) => page.screenshot({ path: join(SHOTS, `qa-v162-${name}.png`) });

async function newPage({ width = 390, scheme = 'dark', accent = null, scale = 1, standalone = false, safeT = 47, session = false }) {
  const context = await browser.newContext({
    viewport: { width, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, locale: 'pt-BR', reducedMotion: 'reduce', colorScheme: scheme,
  });
  await context.addInitScript(({ st, ses }) => {
    if (st) Object.defineProperty(navigator, 'standalone', { get: () => true });
    if (ses) localStorage.setItem('leituras:sessao', JSON.stringify({ bookId: 'r1', startedAt: Date.now() - 600000, pausedAt: null, pausedMs: 0 }));
  }, { st: standalone, ses: session });
  const page = await context.newPage();
  await page.clock.setFixedTime(new Date('2026-10-16T12:00:00'));
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errors.push(`console: ${m.text()}`); });
  await page.route(/^https:\/\//, (r) => r.abort());
  await page.goto(BASE);
  await page.waitForFunction(() => document.getElementById('app').dataset.page);
  await page.evaluate(async ({ d, a }) => {
    await (await import('/js/db.js')).setItem('state', d);
    if (a) localStorage.setItem('leituras:acento', a); else localStorage.removeItem('leituras:acento');
  }, { d: seed, a: accent });
  page.__scale = scale;
  page.__safeT = safeT;
  return page;
}
async function open(page, hash, name) {
  await page.evaluate((h) => history.replaceState(null, '', h), hash);
  await page.reload();
  await page.waitForFunction((n) => document.getElementById('app').dataset.page === n, name);
  if (page.__safeT) await page.addStyleTag({ content: `:root,[data-theme]{--safe-t:${page.__safeT}px !important}` });
  if (page.__scale !== 1) {
    await page.evaluate((s) => {
      document.documentElement.style.setProperty('--type-scale', String(s));
      document.documentElement.style.setProperty('--type-scale-lg', String(s));
    }, page.__scale);
  }
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(80);
}
const scrollTo = async (page, y) => {
  await page.evaluate((v) => window.scrollTo(0, v), y);
  await page.waitForTimeout(120);
};
const veil = (page) => page.evaluate(() => {
  const b = getComputedStyle(document.body, '::before');
  const a = getComputedStyle(document.documentElement, '::after');
  return { scrolled: document.documentElement.classList.contains('is-scrolled'), bg: b.backgroundColor, fade: Number(a.opacity), fadeZ: Number(a.zIndex), fadeEvents: a.pointerEvents, veilEvents: b.pointerEvents };
});
const noOverflow = async (page, label) => {
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth) <= 0, true, `${label}: rolagem horizontal`);
};

const ROUTES = [
  ['inicio', '#/inicio', 'inicio'], ['estante', '#/estante?aba=lido', 'estante'], ['resumo', '#/resumo/2026', 'resumo'],
  ['ficha', '#/livro/c1', 'livro'], ['ficha-lendo', '#/livro/r1', 'livro'], ['ficha-quero', '#/livro/w1', 'livro'], ['ajustes', '#/ajustes', 'ajustes'],
  ['editar', '#/livro/c1/editar', 'livro'], ['novo', '#/novo', 'novo'], ['cronometro', '#/ler/r1', 'ler'],
];

try {
  step('faixa de status: transparente em repouso, véu ao rolar; degradê não captura toques e fica abaixo das barras fixas (claro/escuro, safe-t 47)');
  for (const scheme of ['light', 'dark']) {
    const page = await newPage({ scheme, session: true });
    for (const [label, hash, name] of ROUTES) {
      await open(page, hash, name);
      const rest = await veil(page);
      assert.equal(rest.scrolled, false, `${scheme} ${label}: is-scrolled em repouso`);
      assert.equal(rest.bg, 'rgba(0, 0, 0, 0)', `${scheme} ${label}: faixa em repouso deve ser transparente`);
      assert.equal(rest.fade, 0, `${scheme} ${label}: degradê escondido em repouso`);
      assert.equal(rest.fadeEvents, 'none');
      assert.equal(rest.veilEvents, 'none');
      await shot(page, `${label}-${scheme}-repouso`);
      const max = await page.evaluate(() => document.documentElement.scrollHeight - innerHeight);
      if (max > 120) {
        await scrollTo(page, Math.min(max, 400));
        const s = await veil(page);
        assert.equal(s.scrolled, true, `${scheme} ${label}: is-scrolled rolando`);
        assert.notEqual(s.bg, 'rgba(0, 0, 0, 0)', `${scheme} ${label}: véu rolando`);
        // Barras fixas/coladas têm de pintar por cima do degradê.
        const z = await page.evaluate(() => {
          const out = {};
          for (const sel of ['.form-top', '.rs-tabs', '.group-head', '.cbar', '.nav']) {
            const el = document.querySelector(sel);
            if (el && el.checkVisibility()) out[sel] = getComputedStyle(el).zIndex;
          }
          return out;
        });
        for (const [sel, zi] of Object.entries(z)) {
          if (sel === '.cbar' && s.fade === 0) continue;
          assert.ok(Number(zi) > s.fadeZ, `${scheme} ${label}: ${sel} (z ${zi}) precisa ficar acima do degradê (z ${s.fadeZ})`);
        }
        await shot(page, `${label}-${scheme}-rolado`);
        await scrollTo(page, 0);
        assert.equal((await veil(page)).scrolled, false, `${scheme} ${label}: volta ao topo`);
      }
    }
    await page.context().close();
  }

  step('mais contraste: o véu rolado é opaco e sem desfoque');
  {
    const page = await newPage({ scheme: 'light' });
    await page.emulateMedia({ contrast: 'more' });
    await open(page, '#/estante?aba=lido', 'estante');
    await scrollTo(page, 400);
    const v = await page.evaluate(() => {
      const cs = getComputedStyle(document.body, '::before');
      return { bg: cs.backgroundColor, blur: cs.backdropFilter };
    });
    assert.match(v.bg, /^rgb\(/, `véu opaco: ${v.bg}`);
    assert.equal(v.blur, 'none');
    await page.context().close();
  }

  step('rolar e trocar de rota/voltar: o véu acompanha a posição da nova tela');
  {
    const page = await newPage({ scheme: 'light' });
    await open(page, '#/estante?aba=lido', 'estante');
    await scrollTo(page, 400);
    assert.equal((await veil(page)).scrolled, true);
    await page.evaluate(() => { location.hash = '#/ajustes'; });
    await page.waitForFunction(() => document.getElementById('app').dataset.page === 'ajustes');
    await page.waitForTimeout(200);
    const y = await page.evaluate(() => scrollY);
    assert.equal((await veil(page)).scrolled, y > 2, `Ajustes: is-scrolled coerente com scrollY=${y}`);
    await page.goBack();
    await page.waitForFunction(() => document.getElementById('app').dataset.page === 'estante');
    await page.waitForTimeout(300);
    const y2 = await page.evaluate(() => scrollY);
    assert.equal((await veil(page)).scrolled, y2 > 2, `voltar: is-scrolled coerente com scrollY=${y2}`);
    await page.context().close();
  }

  step('folha aberta: degradê some; rolar dentro da folha não muda o véu');
  {
    const page = await newPage({ scheme: 'dark' });
    await open(page, '#/inicio', 'inicio');
    await scrollTo(page, 300);
    const before = await veil(page);
    assert.equal(before.scrolled, true);
    await page.locator('#app [data-longpress]').first().click({ button: 'right' });
    await page.waitForSelector('.sheet-layer .sheet');
    await page.waitForTimeout(250);
    const during = await veil(page);
    assert.equal(during.fade, 0, 'degradê escondido com folha/menu aberto');
    const sheetZ = await page.evaluate(() => Number(getComputedStyle(document.querySelector('.sheet-layer')).zIndex));
    assert.ok(sheetZ > during.fadeZ);
    await page.mouse.wheel(0, 200);
    await page.waitForTimeout(150);
    assert.equal((await veil(page)).scrolled, before.scrolled, 'rolar na folha não muda is-scrolled');
    await shot(page, 'inicio-folha-dark');
    await page.keyboard.press('Escape');
    await page.waitForTimeout(300);
    await page.context().close();
  }

  step('Ajustes: instalado esconde "Instalar no celular" sem deixar buraco; no navegador mostra duas linhas');
  for (const scheme of ['light', 'dark']) {
    const inst = await newPage({ scheme, standalone: true });
    await open(inst, '#/ajustes', 'ajustes');
    assert.equal(await inst.locator('#instalar, .howto').count(), 0);
    assert.doesNotMatch(await inst.innerText('#app'), /Instalar no celular/);
    const gaps = await inst.evaluate(() => [...document.querySelectorAll('#app section')].filter((g) => g.parentElement.id === 'app' || g.parentElement.parentElement?.id === 'app').map((g) => g.getBoundingClientRect()).filter((r) => r.height > 0).map((r) => [Math.round(r.top), Math.round(r.bottom)]));
    for (let i = 1; i < gaps.length; i += 1) assert.ok(gaps[i][0] - gaps[i - 1][1] < 60, `buraco entre grupos ${i}: ${gaps[i][0] - gaps[i - 1][1]}px`);
    await noOverflow(inst, `ajustes instalado ${scheme}`);
    await inst.context().close();
    const web = await newPage({ scheme, standalone: false });
    await open(web, '#/ajustes', 'ajustes');
    assert.equal(await web.locator('.howto-row').count(), 2);
    await web.locator('.howto').scrollIntoViewIfNeeded();
    await shot(web, `ajustes-navegador-${scheme}`);
    await web.context().close();
  }

  step('Início: cartão Lendo agora (anel, iniciais, botões) em 320/390/430 × 0,85/1/1,3/1,6; sem corte, sobreposição ou alvo < 44px');
  for (const accent of [null, 'vinho']) {
    for (const scheme of ['light', 'dark']) {
      for (const width of [320, 390, 430]) {
        for (const scale of [0.85, 1, 1.3, 1.6]) {
          const page = await newPage({ width, scheme, accent, scale, session: true });
          const label = `${scheme}/${accent || 'padrão'}/${width}px/${scale}x`;
          await open(page, '#/inicio', 'inicio');
          await noOverflow(page, `Início ${label}`);
          const probs = await page.evaluate(() => {
            const out = [];
            const rect = (el) => el.getBoundingClientRect();
            const inter = (a, b) => Math.min(a.right, b.right) - Math.max(a.left, b.left) > 1 && Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > 1;
            for (const el of document.querySelectorAll('#app button, #app a, #app summary')) {
              if (!el.checkVisibility()) continue;
              const r = rect(el);
              if (r.height < 43.5 && !el.matches('.reading-link, .link, .serif-title') && !el.closest('.cov-ring')) out.push(`alvo ${Math.round(r.height)}px: ${el.outerHTML.slice(0, 70)}`);
              if (r.right > innerWidth + 0.5 || r.left < -0.5) out.push(`fora da tela: ${el.outerHTML.slice(0, 70)}`);
            }
            for (const card of document.querySelectorAll('.card.reading')) {
              const cr = rect(card);
              const acts = card.querySelector('.rn-actions');
              for (const el of card.querySelectorAll('.rn-actions > *, .rn-text > *')) {
                const r = rect(el);
                if (r.right > cr.right + 0.5 || r.left < cr.left - 0.5) out.push(`cortado no cartão: ${el.className}`);
              }
              if (acts) {
                const kids = [...acts.children].filter((c) => c.checkVisibility());
                for (let i = 0; i < kids.length; i += 1) for (let j = i + 1; j < kids.length; j += 1) if (inter(rect(kids[i]), rect(kids[j]))) out.push(`botões sobrepostos: ${kids[i].className}/${kids[j].className}`);
                for (const k of kids) if (k.scrollWidth > k.clientWidth + 1) out.push(`botão com texto cortado: ${k.textContent.trim().slice(0, 20)}`);
              }
              const ring = card.querySelector('.cov-ring');
              const ini = card.querySelector('.cover-ini');
              if (ring && ini && inter(rect(ring), rect(ini))) out.push('anel sobre as iniciais');
              if (ring && rect(ring).width < 36) out.push(`anel pequeno ${rect(ring).width}`);
              if (ring && (rect(ring).right > innerWidth || rect(ring).bottom > rect(card).bottom + 0.5)) out.push('anel fora do cartão/tela');
              const next = card.nextElementSibling;
              if (next && rect(card).bottom > rect(next).top + 1) out.push('cartão sobre o seguinte');
            }
            return out;
          });
          assert.deepEqual(probs, [], `Início ${label}`);
          if (width === 320 && scale === 1.6 && !accent) await shot(page, `inicio-320-16-${scheme}`);
          await page.context().close();
        }
      }
    }
  }

  step('telas principais 320 x 1,6 / 430 x 0,85 / 320 x 1,3: sem rolagem horizontal (claro/escuro)');
  for (const scheme of ['light', 'dark']) {
    for (const [width, scale] of [[320, 1.6], [430, 0.85], [320, 1.3]]) {
      const page = await newPage({ width, scheme, scale, session: true });
      for (const [label, hash, name] of ROUTES) {
        await open(page, hash, name);
        await noOverflow(page, `${label} ${scheme} ${width}/${scale}`);
        const small = await page.evaluate(() => [...document.querySelectorAll('#app button, #app a, #app summary')]
          .filter((el) => el.checkVisibility() && el.getBoundingClientRect().height < 43.5 && !el.matches('.reading-link, .link:not(.ficha-more), .serif-title, .btn-text, .chip, .spine, .sp-item, .mini-seg-btn, .fchips select') && !el.closest('p, .muted, .small, .cbar-title, .cal-grid, .heatmap, .rchart, .bars, .brk, .legend'))
          .map((el) => el.outerHTML.slice(0, 90)));
        assert.deepEqual(small, [], `${label} ${scheme} ${width}/${scale}: alvos < 44px`);
        if (label === 'ficha-lendo' && width === 320 && scale === 1.6) await shot(page, `ficha-lendo-320-16-${scheme}`);
      }
      await page.context().close();
    }
  }

  step('contraste AA dos componentes novos: 5 acentos x claro/escuro (cor do texto contra as camadas de fundo opacas/translúcidas)');
  {
    const audit = (sels) => sels.flatMap((sel) => [...document.querySelectorAll(sel)].filter((el) => el.checkVisibility()).map((el) => {
      const cv = document.createElement('canvas');
      cv.width = 1; cv.height = 1;
      const ctx = cv.getContext('2d', { willReadFrequently: true });
      const rgba = (c) => { ctx.clearRect(0, 0, 1, 1); ctx.fillStyle = '#000'; ctx.fillStyle = c; ctx.fillRect(0, 0, 1, 1); const d = ctx.getImageData(0, 0, 1, 1).data; return [d[0], d[1], d[2], d[3] / 255]; };
      const over = (t, u) => [0, 1, 2].map((i) => t[i] * t[3] + u[i] * (1 - t[3])).concat(1);
      const layers = [];
      for (let n = el; n && n.nodeType === 1; n = n.parentElement) {
        const c = rgba(getComputedStyle(n).backgroundColor);
        if (c[3] > 0) layers.push(c);
        if (c[3] >= 1) break;
      }
      let bg = [255, 255, 255, 1];
      const page = rgba(getComputedStyle(document.body).backgroundColor);
      bg = over(page, bg);
      for (const l of layers.reverse()) bg = over(l, bg);
      const fgc = rgba(getComputedStyle(el).color);
      const fg = over([fgc[0], fgc[1], fgc[2], fgc[3] * Number(getComputedStyle(el).opacity)], bg);
      const lum = (c) => { const [r, g, b] = c.slice(0, 3).map((v) => { const s = v / 255; return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; }); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
      const [hi, lo] = [lum(fg), lum(bg)].sort((a, b) => b - a);
      return { sel, text: el.textContent.trim().slice(0, 24), ratio: (hi + 0.05) / (lo + 0.05), size: parseFloat(getComputedStyle(el).fontSize) };
    }));
    const INICIO = ['.cov-ring-pct', '.cov-ring-unit', '.bento-note', '.bento-note span', '.list-row .teaser-title', '.list-row .muted', '.timer-banner-go', '.rn-author'];
    const FICHA = ['.ficha-isbn', '.ficha-crit-toggle', '.ficha-rhythm .section-head .link', '.ficha-rhythm .section-head h2', '.rchart-readout', '.sug-source'];
    const AJ = ['.howto-chip', '.howto-text'];
    for (const accent of ['terracota', 'oliva', 'petroleo', 'vinho', 'grafite']) {
      for (const scheme of ['light', 'dark']) {
        const page = await newPage({ scheme, accent, session: true });
        for (const [hash, name, sels] of [['#/inicio', 'inicio', INICIO], ['#/livro/c1', 'livro', FICHA], ['#/ajustes', 'ajustes', AJ]]) {
          await open(page, hash, name);
          const res = await page.evaluate(`(${audit.toString()})(${JSON.stringify(sels)})`);
          assert.ok(res.length > 0, `${hash}: nada medido`);
          const bad = res.filter((r) => r.ratio < (r.size >= 18 ? 3 : 4.5));
          assert.deepEqual(bad, [], `${accent}/${scheme} ${hash}: contraste`);
        }
        await page.context().close();
      }
    }
  }

  step('ficha: Ver critérios e Ver diário alcançáveis e funcionais em 320 x 1,6');
  {
    const page = await newPage({ width: 320, scale: 1.6, scheme: 'light' });
    await open(page, '#/livro/c1', 'livro');
    const t = page.locator('.ficha-crit-toggle');
    const box = await t.boundingBox();
    assert.ok(box.height >= 43.5 && box.width >= 44, `toggle ${box.width}x${box.height}`);
    await t.click();
    await page.waitForTimeout(150);
    assert.equal(await page.locator('.ficha-crit').isVisible(), true);
    await noOverflow(page, 'critérios abertos');
    await shot(page, 'ficha-criterios-320-16');
    await page.locator('.ficha-rhythm .section-head .link').click();
    await page.waitForFunction(() => /editar/.test(location.hash));
    await page.context().close();
  }
} finally {
  await browser.close();
  server.close();
}
if (errors.length) {
  console.error(errors.join('\n'));
  process.exit(1);
}
console.log('qa-v162: ok');
