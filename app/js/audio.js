// Audiolivro (1.6): duração e posição em minutos inteiros, mostradas como "5h 30min".
// No iPhone a hora e os minutos entram em dois campos numéricos lado a lado (teclado de números),
// que o main.js junta num total de minutos. Funções puras, sem dependências.

/** "41 min", "1h", "1h 18min". */
export function formatDuration(minutes) {
  const m = Math.max(0, Math.round(Number(minutes) || 0));
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  const rest = m % 60;
  return rest ? `${h}h ${rest}min` : `${h}h`;
}

/** Curto, para números grandes em espaço estreito: "45 min", "7h", "27h30". */
export function formatDurationShort(minutes) {
  const m = Math.max(0, Math.round(Number(minutes) || 0));
  if (m < 60) return `${m} min`;
  const rest = m % 60;
  return `${Math.floor(m / 60)}h${rest ? String(rest).padStart(2, '0') : ''}`;
}

/** Horas ouvidas para os números grandes: "12", "1,5", "0,3" (uma casa abaixo de 10 h). */
export function hoursText(minutes) {
  const h = (Number(minutes) || 0) / 60;
  const n = h >= 10 ? Math.round(h) : Math.round(h * 10) / 10;
  return n.toLocaleString('pt-BR', { maximumFractionDigits: 1 });
}

/** 330 → { h: 5, m: 30 }; vazio → { h: '', m: '' }. */
export function splitMinutes(value) {
  if (value === null || value === undefined || value === '' || !Number.isFinite(Number(value))) return { h: '', m: '' };
  const total = Math.max(0, Math.round(Number(value)));
  return { h: Math.floor(total / 60), m: total % 60 };
}

/** Horas e minutos digitados → minutos. Os dois vazios: null. Inválido: NaN. */
export function joinMinutes(h, m) {
  const hs = String(h ?? '').trim();
  const ms = String(m ?? '').trim();
  if (hs === '' && ms === '') return null;
  const hn = hs === '' ? 0 : Number(hs.replace(',', '.'));
  const mn = ms === '' ? 0 : Number(ms.replace(',', '.'));
  if (!Number.isFinite(hn) || !Number.isFinite(mn) || hn < 0 || mn < 0) return NaN;
  return Math.round(hn * 60 + mn);
}

/**
 * Texto livre → minutos: "5h30", "5h 30min", "5:30", "45min", "2h" ou só minutos ("90").
 * Vazio: null. Não deu para entender: NaN.
 */
export function parseDuration(raw) {
  const text = String(raw ?? '').trim().toLowerCase().replace(/\s+/g, '');
  if (text === '') return null;
  let m = text.match(/^(\d+):(\d{1,2})$/);
  if (m) return Number(m[1]) * 60 + Number(m[2]);
  m = text.match(/^(?:(\d+(?:[.,]\d+)?)h)?(?:(\d+)(?:min|m)?)?$/);
  if (m && (m[1] || m[2])) {
    const hours = m[1] ? Number(m[1].replace(',', '.')) : 0;
    return Math.round(hours * 60 + (m[2] ? Number(m[2]) : 0));
  }
  return NaN;
}

/** Largura do campo em algarismos (o campo cresce com o número; vazio, a do exemplo). */
export function timeLen(value, placeholder) {
  return Math.max(1, String(value === '' || value === null || value === undefined ? placeholder : value).length);
}

/**
 * Dois campos (horas e minutos) para o teclado numérico do iPhone. Cada parte é um <label>:
 * tocar no "h" ou no "min" também abre o teclado. Os minutos aparecem com dois algarismos.
 * attrs: atributos extras do grupo (ex.: data-time-field="durationMin"); id: prefixo dos ids
 * (o de horas recebe o id, para o <label for>); size: 'lg' na folha "Registrar leitura".
 */
export function timeInputs({ id, value = null, attrs = '', label = 'Tempo', size = '' } = {}) {
  const { h, m } = splitMinutes(value);
  const mm = m === '' ? '' : String(m).padStart(2, '0');
  const part = (pid, val, ph, kind, max, aria, unit) => `<label class="time-part"><input id="${pid}" type="number" inputmode="numeric" pattern="[0-9]*" min="0" max="${max}" step="1" placeholder="${ph}" value="${val}" data-time-part="${kind}" aria-label="${aria}" autocomplete="off" style="--len:${timeLen(val, ph)}"><span class="time-unit" aria-hidden="true">${unit}</span></label>`;
  return `<span class="time-field${size ? ` is-${size}` : ''}" role="group" aria-label="${label}" data-time ${attrs}>`
    + part(id, h, '0', 'h', 999, 'Horas', 'h')
    + part(`${id}-min`, mm, '00', 'm', 59, 'Minutos', 'min')
    + '</span>';
}

/** Minutos digitados num grupo de timeInputs (elemento [data-time]). */
export function readTimeInputs(group) {
  if (!group) return null;
  const h = group.querySelector('[data-time-part="h"]')?.value;
  const m = group.querySelector('[data-time-part="m"]')?.value;
  return joinMinutes(h, m);
}

/** Ajusta a largura do campo ao número digitado. */
export function fitTimeInput(input) {
  input?.style.setProperty('--len', String(timeLen(input.value, input.placeholder)));
}

/** Preenche o grupo com um total de minutos (atalhos +15 min e régua da folha). */
export function writeTimeInputs(group, minutes) {
  if (!group) return;
  const { h, m } = splitMinutes(minutes);
  const hEl = group.querySelector('[data-time-part="h"]');
  const mEl = group.querySelector('[data-time-part="m"]');
  if (hEl) hEl.value = String(h);
  if (mEl) mEl.value = m === '' ? '' : String(m).padStart(2, '0');
  fitTimeInput(hEl);
  fitTimeInput(mEl);
}

/** Fones de ouvido (formato audiolivro), no traço dos outros ícones. */
export function headphonesIcon(size = 14, cls = '') {
  return `<svg class="icon icon-audio${cls ? ` ${cls}` : ''}" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 15v-3a8 8 0 0 1 16 0v3"/><path d="M4 15a1 1 0 0 1 1-1h1.5a1 1 0 0 1 1 1v4a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1z"/><path d="M20 15a1 1 0 0 0-1-1h-1.5a1 1 0 0 0-1 1v4a1 1 0 0 0 1 1H19a1 1 0 0 0 1-1z"/></svg>`;
}

/** Horas para um número grande (kpiTile): { value, digits }, com uma casa abaixo de 10 h. */
export function hoursValue(minutes) {
  const h = (Number(minutes) || 0) / 60;
  return h >= 10 ? { value: Math.round(h), digits: 0 } : { value: Math.round(h * 10) / 10, digits: 1 };
}
