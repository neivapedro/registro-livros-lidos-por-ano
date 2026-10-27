import { daysSince, formatBR, yearOf } from '../dates.js';
import { getGoal } from '../store.js';
import { monthlyTarget } from '../stats.js';
import { decimal, esc, icon, plural } from '../ui.js';
import { pageGoalSettings } from './charts.js';

export const APP_VERSION = '1.4.0';

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

/** "Espaço usado: 1,2 MB · Proteção contra limpeza automática: ativa". Some o que o navegador não informa. */
export function storageLine(info) {
  if (!info) return '';
  const parts = [];
  if (typeof info.usage === 'number') {
    const mb = info.usage / (1024 * 1024);
    parts.push(`Espaço usado: ${mb < 0.1 ? 'menos de 0,1' : decimal(mb)} MB`);
  }
  if (typeof info.persisted === 'boolean') parts.push(`Proteção contra limpeza automática: ${info.persisted ? 'ativa' : 'não ativa'}`);
  return parts.length ? `<p class="muted small storage-info">${parts.join(' · ')}</p>` : '';
}

/** Grupo de ajustes no estilo do iPhone: título fora do cartão, cartão, nota de rodapé. */
function group(id, title, body, foot = '', cls = '') {
  return `
    <section class="set-group" aria-labelledby="set-${id}">
      <h2 class="set-head" id="set-${id}">${esc(title)}</h2>
      <div class="card set-card${cls ? ` ${cls}` : ''}">${body}
      </div>${foot ? `
      <p class="set-foot">${foot}</p>` : ''}
    </section>`;
}

/** Chave opcional do Google Books (guardada fora do backup; veja prefs.js). */
function googleKeyCard(hasKey) {
  return group('gkey', 'Busca de livros', `
        <p class="muted small">Opcional: com uma chave gratuita do Google Books a busca por título encontra mais livros brasileiros.</p>
        <div class="field">
          <label for="gb-key">Chave do Google Books</label>
          <input id="gb-key" type="password" autocomplete="off" autocapitalize="none" autocorrect="off" spellcheck="false" placeholder="Cole a chave aqui (AIza…)" data-gkey>
        </div>
        <p class="small gkey-status${hasKey ? ' is-on' : ''}" role="status">${hasKey ? `${icon('check', { size: 14, stroke: 2.4 })}Chave configurada` : 'Sem chave — usando BrasilAPI e Open Library'}</p>
        <div class="two-cols">
          <button type="button" class="btn-primary sm" data-action="save-gkey">Salvar</button>
          <button type="button" class="btn-ghost" data-action="remove-gkey"${hasKey ? '' : ' disabled'}>Remover</button>
        </div>`, 'A chave fica só neste aparelho e não vai para o backup.', 'gkey');
}

/** Aparência (V14): fica só neste aparelho, como a chave do Google (veja theme.js). */
const THEME_OPTIONS = [['auto', 'Automático'], ['claro', 'Claro'], ['escuro', 'Escuro']];
function appearanceCard(pref) {
  const current = THEME_OPTIONS.some(([v]) => v === pref) ? pref : 'auto';
  const buttons = THEME_OPTIONS.map(([value, label]) => `<button type="button" class="seg-btn${value === current ? ' is-on' : ''}" data-action="set-theme" data-value="${value}" aria-pressed="${value === current}">${label}</button>`).join('');
  return group('aparencia', 'Aparência', `
        <div class="segmented theme-seg" style="--seg-count:3" role="group" aria-label="Aparência">${buttons}</div>`,
  'Automático acompanha o iPhone: claro de dia, escuro à noite. Vale só para este aparelho (não vai para o backup).', 'theme-card');
}

export function settingsView({ state, ui, today }) {
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
${group('meta', 'Meta de leitura', `
        ${stepper(`Meta de ${year}`, goal, 'goal-year', `${plural(monthlyTarget(goal), 'livro', 'livros')} por mês para manter a sequência`)}
        ${stepper('Meta para os próximos anos', state.defaultGoal, 'goal-default', 'Vale para cada ano novo')}
        ${pageGoalSettings(state, year)}`)}
${appearanceCard(ui?.themePref)}
${group('backup', 'Backup dos dados', `
        <p class="muted small">Seus livros ficam guardados só neste celular. Exporte um backup de vez em quando e guarde no Google Drive, e-mail ou WhatsApp. Se trocar de celular, é só importar.</p>
        <p class="small strong-ish">${last} ${plural(state.books.length, 'livro registrado', 'livros registrados')}.</p>
        ${storageLine(ui?.storageInfo)}
        <div class="set-actions">
          <button type="button" class="btn-primary" data-action="export-backup">${icon('download', { size: 18, stroke: 2 })}Exportar backup</button>
          <label class="btn-ghost file-btn">${icon('upload', { size: 18, stroke: 2 })}Importar backup<input type="file" accept="application/json,.json" data-import class="sr-only"></label>
          <button type="button" class="btn-ghost" data-action="export-csv">${icon('download', { size: 18, stroke: 2 })}Exportar planilha (CSV)</button>
        </div>`, 'A planilha abre no Excel, Numbers ou Google Planilhas. Para restaurar os dados, use o backup.')}
${googleKeyCard(Boolean(ui?.googleKey))}
${group('instalar', 'Instalar no celular', `
        <div class="howto">
          <p><strong>Android (Chrome):</strong> menu ⋮ → <em>Adicionar à tela inicial</em> ou <em>Instalar app</em>.</p>
          <p><strong>iPhone (Safari):</strong> botão Compartilhar → <em>Adicionar à Tela de Início</em>.</p>
        </div>`, 'Instalado, o Leituras abre como um app e funciona sem internet (só a busca de livros precisa de conexão).')}
${group('sobre', 'Sobre', `
        <p class="muted small">Leituras ${APP_VERSION} · Busca de livros via BrasilAPI e Open Library (e Google Books, com a chave).</p>
        <button type="button" class="btn-danger" data-action="wipe-data">${icon('trash', { size: 18 })}Apagar todos os dados</button>`)}`;
}
