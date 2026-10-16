import { daysSince, formatBR, yearOf } from '../dates.js';
import { getGoal } from '../store.js';
import { monthlyTarget } from '../stats.js';
import { esc, icon, plural } from '../ui.js';

export const APP_VERSION = '1.2.1';

function stepper(label, value, action, hint) {
  return `
    <div class="stepper-row">
      <span class="stepper-text"><span class="strong">${esc(label)}</span><span class="muted small">${esc(hint)}</span></span>
      <span class="stepper">
        <button type="button" class="step-btn" data-action="${action}" data-delta="-1" aria-label="Diminuir">−</button>
        <span class="step-value" aria-live="polite">${value}</span>
        <button type="button" class="step-btn" data-action="${action}" data-delta="1" aria-label="Aumentar">+</button>
      </span>
    </div>`;
}

export function settingsView({ state, today }) {
  const year = yearOf(today);
  const goal = getGoal(state, year);
  const last = state.lastBackupAt
    ? `Último backup em ${formatBR(state.lastBackupAt.slice(0, 10))} (há ${plural(daysSince(state.lastBackupAt.slice(0, 10), today), 'dia', 'dias')}).`
    : 'Nenhum backup feito ainda.';
  return `
    <header class="top">
      <a class="icon-btn" href="#/inicio" aria-label="Voltar">${icon('chevronLeft', { stroke: 2 })}</a>
      <h1 class="top-title">Ajustes</h1>
      <span class="icon-btn-spacer"></span>
    </header>

    <section class="card">
      <h2>Meta de leitura</h2>
      ${stepper(`Meta de ${year}`, goal, 'goal-year', `${plural(monthlyTarget(goal), 'livro', 'livros')} por mês para manter a sequência`)}
      ${stepper('Meta para os próximos anos', state.defaultGoal, 'goal-default', 'Usada automaticamente em cada ano novo')}
    </section>

    <section class="card">
      <h2>Backup dos dados</h2>
      <p class="muted small">Seus livros ficam guardados só neste celular. Exporte um backup de vez em quando e guarde no Google Drive, e-mail ou WhatsApp. Se trocar de celular, é só importar.</p>
      <p class="small strong-ish">${last} ${plural(state.books.length, 'livro registrado', 'livros registrados')}.</p>
      <button type="button" class="btn-primary" data-action="export-backup">${icon('download', { size: 18, stroke: 2 })}Exportar backup</button>
      <label class="btn-ghost file-btn">${icon('upload', { size: 18, stroke: 2 })}Importar backup<input type="file" accept="application/json,.json" data-import class="sr-only"></label>
    </section>

    <section class="card">
      <h2>Instalar no celular</h2>
      <div class="howto">
        <p><strong>Android (Chrome):</strong> menu ⋮ → <em>Adicionar à tela inicial</em> ou <em>Instalar app</em>.</p>
        <p><strong>iPhone (Safari):</strong> botão Compartilhar → <em>Adicionar à Tela de Início</em>.</p>
        <p class="muted small">Instalado, o Leituras abre como um app e funciona sem internet (só a busca de livros precisa de conexão).</p>
      </div>
    </section>

    <section class="card">
      <h2>Sobre</h2>
      <p class="muted small">Leituras ${APP_VERSION} · Busca de livros via Google Books e Open Library.</p>
      <button type="button" class="btn-danger" data-action="wipe-data">${icon('trash', { size: 18 })}Apagar todos os dados</button>
    </section>`;
}
