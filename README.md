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

- **Início:** anel da meta anual, sequência de meses na meta, páginas, nota média, dias por livro, livros em leitura e capas do ano.
- **Adicionar livro:** busca por título, autor ou ISBN (Google Books + Open Library) ou cadastro manual; status (Quero ler / Lendo / Lido), datas, formato (Físico / Kindle), gênero, nota, favorito do ano e anotações.
- **Estante:** fila "Quero ler", leituras em andamento e lidos por ano.
- **Buscar:** texto livre (título, autor, anotações) e filtros por status, ano, gênero, formato e nota.
- **Resumo:** indicadores, favorito do ano, livros por mês com a meta, formatos, gêneros, autores e comparativo entre anos.
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
