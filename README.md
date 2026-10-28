# Leituras

App para celular para registrar os livros lidos em cada ano: meta anual, sequência de meses batendo a meta, resumo com gráficos e retrospectiva para compartilhar.

## Como usar no celular

1. Abra o endereço do app no navegador do celular (veja em *Settings → Pages* do repositório).
2. Instale na tela inicial:
   - **Android (Chrome):** menu ⋮ → *Adicionar à tela inicial* / *Instalar app*.
   - **iPhone (Safari):** Compartilhar → *Adicionar à Tela de Início*.
3. Pronto: abre como um app e funciona sem internet (a busca de livros precisa de conexão).

> **Seus dados ficam só no celular.** Em *Ajustes → Exportar backup* gere um arquivo de cópia de vez em quando e guarde no Drive/e-mail. Para trocar de celular, use *Importar backup*.

## O que o app faz

- **Início:** anel da meta anual, sequência de meses na meta, meta de páginas (opcional), páginas, nota média, dias por livro, livros em leitura (com a página atual, o % lido, o ritmo e a previsão de término), próxima leitura da fila e capas do ano.
- **Adicionar livro:** busca por título ou autor (Open Library, preferindo a edição em português) ou por ISBN (BrasilAPI, que consulta CBL, Mercado Editorial, Open Library e Google, junto com a Open Library), ou cadastro manual — se a busca não achar, o ISBN digitado fica guardado no livro; capa pela foto (câmera ou galeria); status (Quero ler / Lendo / Lido / Abandonei, com o motivo), datas, página atual, formato (Físico / Kindle), gênero, nota em meia estrela, série e número, etiquetas livres, data em que quer terminar, favorito do ano e anotações. Livros lidos podem ser lidos de novo (releitura).
- **Tela do livro:** abas Dados, Diário (páginas ou % lidos por dia, registrados sozinhos ao atualizar a página) e Trechos (frases marcantes, com imagem para compartilhar).
- **Cronômetro (opcional):** marca o tempo de leitura de um livro; os minutos entram no diário.
- **Estante:** fila "Quero ler" com até 5 próximas em ordem e sorteio de um livro da fila, leituras em andamento, lidos por ano (com opção de agrupar por série) e abandonados.
- **Buscar:** texto livre (título, autor, série, etiquetas, anotações) e filtros por status, ano, gênero, formato, nota e etiqueta.
- **Resumo:** indicadores, calendário de leitura (ano e mês), gráficos que abrem a busca ao tocar (notas, tamanho dos livros, livros ou páginas por mês, físico × Kindle), etiquetas mais usadas, favorito do ano, livros por mês com a meta, formatos, gêneros, autores, abandonados e comparativo entre anos. Opção **Todos os anos** com os números da vida toda e os **marcos** (1º, 10º, 25º… livro, 1.000 páginas, primeiro livro de 500+ páginas, livro lido em um dia, novos gêneros), com aviso discreto ao concluir um livro que alcança um marco.
- **Retrospectiva:** a partir de 3 livros no ano, telas em sequência (mosaico de capas, livros, páginas, o mais longo e o mais curto, mês mais forte, maior sequência de leitura, gostos, marcos do ano, perfil de leitor por regras simples e livro do ano) e imagem pronta para salvar ou compartilhar, em formato story ou quadrado.
- **Trechos salvos:** todos os trechos de todos os livros, com busca.
- **Ajustes:** meta do ano e dos próximos anos, meta de páginas, backup, planilha CSV, chave do Google Books, instruções de instalação.

- **Visual (1.4):** tema claro e escuro (segue o iPhone; Ajustes → Aparência), ficha própria de cada livro com a cor da capa, painel “Registrar leitura”, toque longo e gestos na Estante, lista ou capas, filtros em chips, barra de navegação de vidro, títulos que encolhem ao rolar, curva S da meta (previsto × realizado) e Resumo em três abas.

- **Capas guardadas no aparelho (1.4.2):** cada capa fica no cache do app depois da primeira vez (funciona sem internet), as de todos os livros são baixadas em segundo plano, a que falhar é tentada de novo e a guardada há mais de 14 dias é conferida em segundo plano.
- **Busca com IA (opcional e gratuita):** botão "Buscar com IA" faz o Gemini ler os resultados de uma busca na internet (DuckDuckGo, pela ferramenta *URL context*) e, se faltar páginas ou ano, os resultados da busca pelo ISBN; depois os dados ainda são conferidos pelo ISBN nas bases de sempre. Usa a cota gratuita do Google, sem cartão nem faturamento, com chave própria em *Ajustes → Busca com IA* (só no aparelho); o app limita a 30 buscas por mês por aparelho. Diagnóstico com a API de verdade: `GEMINI_KEY=... node tools/testar-busca-ia.mjs "título autor"`. *Ajustes → Enviar chaves para outro celular* leva as chaves de busca (nunca os livros) para outra pessoa.
- **Visual 1.5:** capas desenhadas com cara de livro (lombada e páginas), Estante em modo *Lombadas*, textura de papel, capa desfocada no topo da ficha, trechos como citação, cor de destaque à escolha (Terracota, Oliva, Petróleo, Vinho, Grafite), abas com pílula deslizante, telas vazias ilustradas, saudação com o seu nome no Início, cor da capa no cartão "Lendo agora" e comemoração ao concluir um livro. Nome e cor ficam só no aparelho (fora do backup).

## Estrutura

```
app/            o app publicado (HTML, CSS e JavaScript puros, sem etapa de build)
  js/store.js       dados, validação, backup e migração do localStorage
  js/db.js          armazenamento no IndexedDB (com localStorage de reserva)
  js/journal.js     diário de leitura (páginas lidas por dia)
  js/stats.js       cálculos dos indicadores
  js/books-api.js   busca de livros
  js/cover-cache.js capas guardadas no aparelho (pré-carga e nova tentativa)
  js/views/         telas
  sw.js             funcionamento offline (arquivos do app e cache das capas)
tests/          testes automáticos (node --test) e teste de ponta a ponta
tools/          gerador dos ícones
```

## Desenvolvimento

```bash
npm test          # testes de lógica (Node 20+)
npm start         # serve o app em http://localhost:8080
npm run e2e       # teste de ponta a ponta no Chromium (precisa do Playwright)
```

A cada push na `main`, o GitHub Actions roda os testes e publica a pasta `app/` no GitHub Pages.
Ao mudar arquivos do app, aumente `VERSION` em `app/sw.js` para os celulares baixarem a versão nova.

## Busca de livros

Nenhuma fonte exige cadastro. O Google Books sem chave fica de fora (a cota anônima vive esgotada e responde HTTP 429). Para usá-lo com chave própria, cole a chave em *Ajustes → Busca de livros*; ela fica só no navegador, fora dos dados do app, e não vai para o backup. Cada fonte tem até 8 segundos para responder, e buscas repetidas na mesma sessão não consultam a rede de novo.
