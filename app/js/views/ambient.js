// Seletor de som ambiente na tela do cronômetro (1.6). O som em si fica em js/ambient.js.

import { SOUNDS } from '../ambient.js';
import { esc } from '../ui.js';

const SPEAKER = '<svg class="icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 9h4l5-4v14l-5-4H4z"/><path d="M16.5 8.5a5 5 0 0 1 0 7"/></svg>';

/**
 * amb: { sound, volume, playing }; paused: cronômetro pausado (o som espera o Continuar).
 */
export function ambientPicker(amb, { paused = false } = {}) {
  const sound = amb?.sound || 'off';
  const chips = SOUNDS.map(([id, label]) => {
    const on = id === sound;
    return `<button type="button" class="amb-chip${on ? ' is-on' : ''}" data-action="ambient-pick" data-value="${id}" aria-pressed="${on}">${esc(label)}</button>`;
  }).join('');
  let status = '';
  if (sound !== 'off') {
    if (paused) status = 'O som volta quando você continuar.';
    else if (!amb.playing) status = 'Toque no som escolhido para tocar.';
  }
  const volume = sound === 'off' ? '' : `
      <label class="amb-volume">
        <span class="sr-only">Volume do som</span>${SPEAKER}
        <input type="range" min="0" max="100" step="1" value="${Number(amb.volume) || 0}" data-ambient-volume aria-label="Volume do som">
      </label>
      <p class="faint small amb-hint">${status ? `${esc(status)} ` : ''}Sem som? Confira o modo silencioso.</p>`;
  return `
    <section class="amb" aria-labelledby="amb-title" data-ambient-playing="${Boolean(amb?.playing)}">
      <h2 class="amb-title" id="amb-title">Som ambiente</h2>
      <div class="amb-chips" role="group" aria-labelledby="amb-title">${chips}</div>${volume}
    </section>`;
}
