// Diagnóstico manual da IA 1.6 (não roda nos testes): lê uma "foto" de página gerada aqui
// (texto desenhado num PNG pelo Playwright) e faz um pedido de sugestões de livros novos,
// conferidos na busca de livros de sempre. Mostra o que voltou de cada pedido.
//
// Uso:
//   GEMINI_KEY=... node tools/testar-ia-16.mjs [foto|sugestoes|fila]   (padrão: foto e sugestoes)
//   Atrás de proxy (HTTPS_PROXY), use Node 22.21+ com NODE_USE_ENV_PROXY=1.
//
// A chave só é lida da variável de ambiente; nunca é impressa nem gravada em arquivo.
// Cada parte gasta um pedido da cota gratuita do Google.

import { execSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { extrasErrorMessage, readPagePhoto, suggestBooks } from '../app/js/ai-extras.js';
import { responseText } from '../app/js/ai-search.js';
import { searchBooks } from '../app/js/books-api.js';

const key = process.env.GEMINI_KEY || '';
const parts = process.argv.slice(2);
const want = parts.length ? parts : ['foto', 'sugestoes'];
if (!key) {
  console.error('Uso: GEMINI_KEY=... node tools/testar-ia-16.mjs [foto|sugestoes|fila]');
  process.exit(2);
}
const hide = (text) => String(text).split(key).join('<chave>');

/** fetch que anota modelo, status e o texto devolvido (sem a chave). */
function loggingFetch(log) {
  return async (url, init) => {
    const t0 = Date.now();
    const body = JSON.parse(init.body);
    const res = await fetch(url, init);
    const data = await res.clone().json().catch(() => null);
    log.push({
      model: url.match(/models\/([^:]+):/)?.[1],
      status: res.status,
      ms: Date.now() - t0,
      tools: body.tools ? JSON.stringify(body.tools) : 'nenhuma',
      image: body.contents[0].parts.some((p) => p.inline_data),
      text: data ? responseText(data) : '',
      error: res.ok ? '' : data?.error?.message || '',
    });
    return res;
  };
}

const show = (log) => {
  for (const c of log) {
    console.log(`  → ${c.model} HTTP ${c.status} em ${c.ms} ms · ferramentas: ${c.tools} · imagem: ${c.image}`);
    if (c.error) console.log(`    erro: ${hide(c.error).slice(0, 300)}`);
    if (c.text) console.log(`    resposta: ${hide(c.text).replace(/\s+/g, ' ').slice(0, 700)}`);
  }
};

const PAGE = `<html><body style="margin:0;background:#f4efe6;font:21px/1.5 Georgia,serif;color:#222">
<div style="padding:50px 60px;width:620px">
<p style="text-align:center;font-size:14px;letter-spacing:2px">DOM CASMURRO</p>
<p style="text-indent:2em;text-align:justify">Uma noite destas, vindo da cidade para o Engenho Novo, encontrei no trem da Central um rapaz aqui do bairro, que eu conheço de vista e de chapéu. Cumprimentou-me, sentou-se ao pé de mim, falou da lua e dos ministros, e acabou recitando-me versos.</p>
<p style="text-indent:2em;text-align:justify">A viagem era curta, e os versos pode ser que não fossem inteiramente maus. Sucedeu, porém, que, como eu estava cansado, fechei os olhos três ou quatro vezes; tanto bastou para que ele interrompesse a leitura e metesse os versos no bolso.</p>
<p style="text-align:center;font-size:15px;margin-top:30px">27</p>
</div></body></html>`;

async function pagePhoto() {
  const require = createRequire(import.meta.url);
  let playwright;
  try {
    playwright = require('playwright');
  } catch {
    playwright = require(join(execSync('npm root -g').toString().trim(), 'playwright'));
  }
  const browser = await playwright.chromium.launch();
  const page = await browser.newPage({ viewport: { width: 740, height: 620 } });
  await page.setContent(PAGE);
  const png = await page.screenshot({ type: 'jpeg', quality: 80 });
  await browser.close();
  return `data:image/jpeg;base64,${png.toString('base64')}`;
}

const BOOKS = [
  { title: 'Torto Arado', authors: 'Itamar Vieira Junior', status: 'lido', rating: 5, genre: 'Ficção', endDate: '2026-09-01', favorite: true },
  { title: 'Dom Casmurro', authors: 'Machado de Assis', status: 'lido', rating: 4.5, genre: 'Ficção', endDate: '2026-07-10' },
  { title: 'Sapiens', authors: 'Yuval Noah Harari', status: 'lido', rating: 4, genre: 'História', endDate: '2026-05-02' },
  { title: 'Hábitos Atômicos', authors: 'James Clear', status: 'lido', rating: 3, genre: 'Desenvolvimento pessoal', endDate: '2026-03-02' },
  { title: 'Cem Anos de Solidão', authors: 'Gabriel García Márquez', status: 'quero', createdAt: '2026-01-01' },
  { title: 'O Poder do Hábito', authors: 'Charles Duhigg', status: 'quero', createdAt: '2026-01-02' },
  { title: 'Grande Sertão: Veredas', authors: 'João Guimarães Rosa', status: 'quero', createdAt: '2026-01-03' },
].map((b, i) => ({ id: `b${i}`, tags: [], ...b }));

let failed = 0;
if (want.includes('foto')) {
  console.log('\n=== Trecho por foto');
  const log = [];
  try {
    const out = await readPagePhoto(await pagePhoto(), { key, fetchImpl: loggingFetch(log) });
    show(log);
    console.log(`  página: ${out.page} · modelo ${out.model}\n  texto:\n${out.text.split('\n').map((l) => `    ${l}`).join('\n')}`);
  } catch (err) {
    show(log);
    failed += 1;
    console.log(`  ERRO ${err.code || ''}: ${hide(extrasErrorMessage('ocr', err.code) || err.message)}`);
  }
}
for (const mode of ['sugestoes', 'fila']) {
  if (!want.includes(mode)) continue;
  console.log(`\n=== Sugestões: ${mode === 'fila' ? 'da minha fila' : 'livros novos'}`);
  const log = [];
  const searched = [];
  const search = (q) => {
    searched.push(q);
    return searchBooks(q);
  };
  try {
    const out = await suggestBooks(mode === 'fila' ? 'fila' : 'novos', BOOKS, { key, fetchImpl: loggingFetch(log), search });
    show(log);
    if (searched.length) console.log(`  conferidos na busca: ${searched.join(' | ')}`);
    for (const r of out.items) {
      const b = r.id ? BOOKS.find((x) => x.id === r.id) : r;
      console.log(`  • ${b.title} — ${b.authors}${r.isbn ? ` · ISBN ${r.isbn}` : ''}${r.cover ? ' · com capa' : ''}${r.source ? ` · ${r.source}` : ''}\n    ${r.reason}`);
    }
  } catch (err) {
    show(log);
    failed += 1;
    console.log(`  ERRO ${err.code || ''}: ${hide(extrasErrorMessage('suggest', err.code) || err.message)}`);
  }
}
process.exit(failed ? 1 : 0);
