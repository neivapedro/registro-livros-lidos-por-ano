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

- **Início:** anel da meta anual, sequência de meses na meta, páginas, nota média, dias por livro, livros em leitura (com a página atual e o % lido) e capas do ano.
- **Adicionar livro:** busca por título ou autor (Open Library, preferindo a edição em português) ou por ISBN (BrasilAPI, que consulta CBL, Mercado Editorial, Open Library e Google, junto com a Open Library), ou cadastro manual — se a busca não achar, o ISBN digitado fica guardado no livro; capa pela foto (câmera ou galeria); status (Quero ler / Lendo / Lido / Abandonei, com o motivo), datas, página atual, formato (Físico / Kindle), gênero, nota, favorito do ano e anotações. Livros lidos podem ser lidos de novo (releitura).
- **Estante:** fila "Quero ler", leituras em andamento, lidos por ano e abandonados.
- **Buscar:** texto livre (título, autor, anotações) e filtros por status, ano, gênero, formato e nota.
- **Resumo:** indicadores, favorito do ano, livros por mês com a meta, formatos, gêneros, autores, abandonados e comparativo entre anos. Opção **Todos os anos** com os números da vida toda.
- **Retrospectiva:** telas em sequência com os números do ano e imagem pronta para salvar ou compartilhar.
- **Ajustes:** meta do ano e dos próximos anos, backup, instruções de instalação.

## Estrutura

```
app/            o app publicado (HTML, CSS e JavaScript puros, sem etapa de build)
  js/store.js       dados, validação e backup
  js/stats.js       cálculos dos indicadores
  js/books-api.js   busca de livros
  js/views/         telas
  sw.js             funcionamento offline
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

Nenhuma fonte exige cadastro. O Google Books sem chave fica de fora (a cota anônima vive esgotada e responde HTTP 429). Para usá-lo com chave própria, guarde a chave no navegador (no console: `localStorage.setItem('leituras:googleBooksKey', 'SUA_CHAVE')`); ela fica fora dos dados do app e não vai para o backup. Cada fonte tem até 8 segundos para responder, e buscas repetidas na mesma sessão não consultam a rede de novo.
