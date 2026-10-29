import { daysSince, formatBR, yearOf } from '../dates.js';
import { getGoal } from '../store.js';
import { monthlyTarget } from '../stats.js';
import { decimal, esc, icon, plural } from '../ui.js';
import { pageGoalSettings } from './charts.js';
import { AI_MONTHLY_LIMIT, aiSearchesThisMonth } from '../prefs.js';
import { ACCENTS, validAccent } from '../accent.js';

export const APP_VERSION = '1.5.0';

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

/** Chave da busca com IA (Gemini). Também só neste aparelho e fora do backup (prefs.js). */
function geminiKeyCard(hasKey, used = 0) {
  const usage = hasKey
    ? `
        <p class="faint small ai-usage">${used >= AI_MONTHLY_LIMIT
    ? `Limite de segurança do mês atingido (${AI_MONTHLY_LIMIT} buscas). Volta no dia 1º.`
    : `Buscas com IA este mês: ${used} de ${AI_MONTHLY_LIMIT}`}</p>`
    : '';
  return group('aikey', 'Busca com IA (gratuita)', `
        <p class="muted small">Opcional: para o livro que a busca comum não acha (um lançamento, por exemplo), o botão “Buscar com IA” procura na internet e a IA do Google (Gemini) lê os resultados. Usa a cota gratuita do Google, sem cartão. Só roda quando você toca nele. A mesma chave liga o trecho por foto (em Trechos) e as sugestões de “O que ler a seguir” (no Início).</p>
        <div class="field">
          <label for="ai-key">Chave do Gemini</label>
          <input id="ai-key" type="password" autocomplete="off" autocapitalize="none" autocorrect="off" spellcheck="false" placeholder="Cole a chave aqui (AQ… ou AIza…)" data-aikey>
        </div>
        <p class="small gkey-status${hasKey ? ' is-on' : ''}" role="status">${hasKey ? `${icon('check', { size: 14, stroke: 2.4 })}Chave configurada` : 'Sem chave — busca com IA desligada'}</p>${usage}
        <div class="two-cols">
          <button type="button" class="btn-primary sm" data-action="save-aikey">Salvar</button>
          <button type="button" class="btn-ghost" data-action="remove-aikey"${hasKey ? '' : ' disabled'}>Remover</button>
        </div>
        <details class="key-help">
          <summary>Como criar a chave (grátis, sem cartão)</summary>
          <ol>
            <li>Abra <a href="https://aistudio.google.com/apikey" target="_blank" rel="noopener noreferrer">aistudio.google.com/apikey</a> e entre com sua conta Google.</li>
            <li>Toque em <em>Create API key</em> e copie a chave.</li>
            <li>Não precisa de cartão nem de faturamento: se aparecer pedido de cartão ou faturamento (<em>Set up billing</em>), ignore.</li>
            <li>Opcional: no <a href="https://console.cloud.google.com/apis/credentials" target="_blank" rel="noopener noreferrer">Google Cloud › Credenciais</a>, toque na chave e restrinja: em <em>Restrições de aplicativos</em>, “Sites” com <code>https://neivapedro.github.io/*</code>; em <em>Restrições de API</em>, só a “Generative Language API”.</li>
            <li>Volte aqui, cole a chave e toque em Salvar.</li>
          </ol>
          <p class="muted small">A cota gratuita tem limite por minuto e por dia; se acabar, a busca avisa e volta a funcionar mais tarde. Cada busca usa um ou dois pedidos dela. Este app faz no máximo ${AI_MONTHLY_LIMIT} buscas com IA por mês neste celular; cada foto lida e cada pedido de sugestões conta como uma.</p>
        </details>`, 'A chave fica só neste aparelho e não vai para o backup. Use uma chave separada da do Google Books, liberada só para a IA.', 'gkey');
}

/** Levar as chaves de busca para outro celular por um link (prefs.js: keysLink). */
function keysTransferCard(hasAny) {
  return group('chaves', 'Outro celular', `
        <p class="muted small">Manda um link que leva as chaves de busca (Google Books e IA) para outro celular, sem precisar digitar. Só as chaves vão no link, nunca os seus livros.</p>
        <button type="button" class="btn-ghost" data-action="share-keys"${hasAny ? '' : ' disabled'}>${icon('phone', { size: 18, stroke: 2 })}Enviar chaves para outro celular</button>
        <div class="field">
          <label for="keys-link">Recebeu o link? Cole aqui</label>
          <input id="keys-link" type="url" autocomplete="off" autocapitalize="none" autocorrect="off" spellcheck="false" placeholder="https://…#/ajustes?chaves=…" data-keylink>
        </div>
        <button type="button" class="btn-ghost" data-action="paste-keys">Usar o link colado</button>`,
  'Quem tiver o link usa as suas chaves: envie só para quem vai usar o app. No iPhone com o app na Tela de Início, cole o link aqui dentro do app.', 'gkey');
}

/** Pedido de confirmação ao abrir um link com chaves: nunca salva sem o toque. */
export function keyImportCard(keys, current = {}) {
  if (!keys) return '';
  const tail = (k) => `…${k.slice(-4)}`;
  const line = (label, key, now) => (key
    ? `<li><strong>${label}</strong> (${esc(tail(key))})${now && now !== key ? ' — substitui a chave atual' : ''}${now === key ? ' — já é a deste celular' : ''}</li>`
    : '');
  return `
    <section class="card key-import" aria-labelledby="key-import-title" aria-describedby="key-import-list">
      <h2 id="key-import-title">Salvar as chaves de busca neste celular?</h2>
      <ul id="key-import-list" class="small">
        ${line('Google Books', keys.googleBooksKey, current.googleBooksKey)}
        ${line('Busca com IA (Gemini)', keys.geminiKey, current.geminiKey)}
      </ul>
      <p class="muted small">Elas ficam só neste aparelho e não vão para o backup.</p>
      <div class="two-cols">
        <button type="button" class="btn-primary sm" data-action="import-keys">Salvar</button>
        <button type="button" class="btn-ghost" data-action="cancel-import-keys">Cancelar</button>
      </div>
    </section>`;
}

/** Aparência (V14): fica só neste aparelho, como a chave do Google (veja theme.js). */
const THEME_OPTIONS = [['auto', 'Automático'], ['claro', 'Claro'], ['escuro', 'Escuro']];

/** Cor de destaque (1.5): cinco bolinhas; o nome aparece embaixo da escolhida (veja accent.js). */
export function accentPicker(accent) {
  const current = validAccent(accent);
  const swatches = ACCENTS.map(({ id, label }) => {
    const on = id === current;
    return `<button type="button" class="accent-sw${on ? ' is-on' : ''}" data-action="set-accent" data-value="${id}" aria-pressed="${on}" style="--sw: var(--acc-${id})">
            <span class="accent-dot" aria-hidden="true">${on ? icon('check', { size: 16, stroke: 2.6 }) : ''}</span><span class="accent-name">${esc(label)}</span>
          </button>`;
  }).join('');
  return `
        <div class="accent-pick">
          <p class="accent-head" id="accent-head">Cor de destaque</p>
          <div class="accent-row" role="group" aria-labelledby="accent-head">${swatches}</div>
        </div>`;
}

function appearanceCard(pref, accent) {
  const current = THEME_OPTIONS.some(([v]) => v === pref) ? pref : 'auto';
  const buttons = THEME_OPTIONS.map(([value, label]) => `<button type="button" class="seg-btn${value === current ? ' is-on' : ''}" data-action="set-theme" data-value="${value}" aria-pressed="${value === current}">${label}</button>`).join('');
  return group('aparencia', 'Aparência', `
        <div class="segmented theme-seg" style="--seg-count:3" role="group" aria-label="Aparência">${buttons}</div>${accentPicker(accent)}`,
  'Automático acompanha o iPhone: claro de dia, escuro à noite. O tema e a cor valem só para este aparelho (não vão para o backup).', 'theme-card');
}

/** Nome da saudação do Início (v1.5): só neste aparelho, fora do backup (prefs.js). */
function nameCard(name) {
  return group('nome', 'Seu nome', `
        <div class="field">
          <label for="set-name">Nome na saudação do Início</label>
          <input id="set-name" type="text" maxlength="30" autocomplete="given-name" autocapitalize="words" enterkeyhint="done" spellcheck="false" placeholder="Opcional" value="${esc(name)}" data-username>
        </div>`, 'Aparece como “Boa noite, Nome”. Fica só neste aparelho e não vai para o backup.', 'name-card');
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
${keyImportCard(ui?.keyImport, { googleBooksKey: ui?.googleKey, geminiKey: ui?.geminiKey })}
${nameCard(ui?.userName || '')}
${group('meta', 'Meta de leitura', `
        ${stepper(`Meta de ${year}`, goal, 'goal-year', `${plural(monthlyTarget(goal), 'livro', 'livros')} por mês para manter a sequência`)}
        ${stepper('Meta para os próximos anos', state.defaultGoal, 'goal-default', 'Vale para cada ano novo')}
        ${pageGoalSettings(state, year)}`)}
${appearanceCard(ui?.themePref, ui?.accent)}
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
${geminiKeyCard(Boolean(ui?.geminiKey), aiSearchesThisMonth(ui?.aiUsage, today))}
${keysTransferCard(Boolean(ui?.googleKey || ui?.geminiKey))}
${group('instalar', 'Instalar no celular', `
        <div class="howto">
          <p><strong>Android (Chrome):</strong> menu ⋮ → <em>Adicionar à tela inicial</em> ou <em>Instalar app</em>.</p>
          <p><strong>iPhone (Safari):</strong> botão Compartilhar → <em>Adicionar à Tela de Início</em>.</p>
        </div>`, 'Instalado, o Leituras abre como um app e funciona sem internet (só a busca de livros precisa de conexão).')}
${group('sobre', 'Sobre', `
        <p class="muted small">Leituras ${APP_VERSION} · Busca de livros via BrasilAPI e Open Library (e Google Books e Gemini, com as chaves).</p>
        <button type="button" class="btn-danger" data-action="wipe-data">${icon('trash', { size: 18 })}Apagar todos os dados</button>`)}`;
}
