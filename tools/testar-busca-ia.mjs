// Diagnóstico manual da busca com IA (não roda nos testes): faz o caminho real do app
// (Gemini lendo os resultados do DuckDuckGo, conferência do ISBN e consulta às bases pelo ISBN)
// e mostra cada pedido ao Google: modelo, status HTTP, se a página abriu e o texto devolvido.
//
// Uso:
//   GEMINI_KEY=... node tools/testar-busca-ia.mjs "A Bruxa Freida McFadden" "Outro livro"
//   (opcional: GOOGLE_BOOKS_KEY=... para consultar também o Google Books pelo ISBN)
//   Atrás de proxy (HTTPS_PROXY), use Node 22.21+ com NODE_USE_ENV_PROXY=1.
//
// A chave só é lida da variável de ambiente; nunca é impressa nem gravada em arquivo.
// Cada busca gasta 1 ou 2 pedidos da cota gratuita do Google.

import { aiSearch, enrichAiResults, retrievalStatus, responseText } from '../app/js/ai-search.js';
import { searchBooks } from '../app/js/books-api.js';

const key = process.env.GEMINI_KEY || '';
const googleKey = process.env.GOOGLE_BOOKS_KEY || '';
const queries = process.argv.slice(2);
if (!key || !queries.length) {
  console.error('Uso: GEMINI_KEY=... node tools/testar-busca-ia.mjs "título e/ou autor" [...]');
  process.exit(2);
}
const hide = (text) => String(text).split(key).join('<chave>');

/** fetch que anota cada pedido ao Google (sem a chave). */
function loggingFetch(log) {
  return async (url, init) => {
    const t0 = Date.now();
    const prompt = JSON.parse(init.body).contents[0].parts[0].text;
    const res = await fetch(url, init);
    const data = await res.clone().json().catch(() => null);
    log.push({
      model: url.match(/models\/([^:]+):/)?.[1],
      status: res.status,
      ms: Date.now() - t0,
      urls: [...prompt.matchAll(/https:\/\/\w+\.duckduckgo\.com\/\S+/g)].map((m) => m[0]),
      retrieval: data ? retrievalStatus(data) : '-',
      text: data ? responseText(data) : '',
      error: res.ok ? '' : data?.error?.message || '',
    });
    return res;
  };
}

let failed = 0;
for (const query of queries) {
  console.log(`\n=== ${query}`);
  const log = [];
  const t0 = Date.now();
  try {
    const found = await aiSearch(query, {
      key, fetchImpl: loggingFetch(log), onStage: (stage) => console.log(`  (etapa: ${stage})`),
    });
    for (const c of log) {
      console.log(`  → ${c.model} HTTP ${c.status} em ${c.ms} ms · página: ${c.retrieval} · ${c.urls.join(' ')}`);
      if (c.error) console.log(`    erro: ${hide(c.error).slice(0, 300)}`);
      if (c.text) console.log(`    resposta: ${hide(c.text).replace(/\s+/g, ' ').slice(0, 600)}`);
    }
    console.log(`  IA: ${found.results.length} livro(s), ${found.steps} pedido(s), modelo ${found.model}, ${Date.now() - t0} ms`);
    const lookupIsbn = (isbn) => searchBooks(isbn, { googleKey }).then((o) => o.results[0] || null).catch(() => null);
    const results = await enrichAiResults(found.results, lookupIsbn, {});
    for (const r of results) {
      console.log(`  • ${r.title} · ${r.authors || '?'} · ${r.pages ?? '?'} págs. · ${r.year ?? '?'} · ${r.publisher || '?'} · ISBN ${r.isbn || '-'}`);
      console.log(`    fonte: ${r.sources.join(', ') || '-'}${r.confirmed ? ' · conferido pelo ISBN' : ''}${r.checkedBy ? ` · dados de ${r.checkedBy}` : ''}${r.cover ? ` · capa ${r.cover}` : ''}`);
    }
    if (!results.length) console.log('  (nada encontrado)');
  } catch (err) {
    failed += 1;
    for (const c of log) console.log(`  → ${c.model} HTTP ${c.status} em ${c.ms} ms · página: ${c.retrieval}${c.error ? ` · ${hide(c.error).slice(0, 300)}` : ''}`);
    console.log(`  ERRO ${err.code || ''}: ${hide(err.message)}`);
  }
}
process.exitCode = failed ? 1 : 0;
