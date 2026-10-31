// Gráfico "Ritmo da leitura": barras com o que foi lido em cada dia (ou semana) do diário,
// na escala do tempo. Só HTML/CSS (barras em flex, altura proporcional ao máximo).
// Tocar no gráfico mostra o dia mais próximo na linha de baixo (main.js, sem redesenhar).

import { formatDuration } from '../audio.js';
import { UNITS } from '../journal.js';
import { dayLabel, formatMinutes, rhythmSeries } from '../reading-days.js';
import { decimal, esc, num } from '../ui.js';

/** "44 págs.", "1 pág.", "12%", "1h 5min". */
export function amountText(value, unit) {
  if (unit === UNITS.PERCENT) return `${num(value)}%`;
  if (unit === UNITS.MINUTE) return formatDuration(value);
  return `${num(value)} ${Math.round(value) === 1 ? 'pág.' : 'págs.'}`;
}

function perDayText(avg, unit) {
  if (unit === UNITS.MINUTE) return `${formatDuration(avg)}/dia`;
  const n = avg >= 10 || Number.isInteger(avg) ? num(avg) : decimal(avg, 1).replace(/,0$/, '');
  return unit === UNITS.PERCENT ? `${n}%/dia` : `${n} ${avg > 1 ? 'págs.' : 'pág.'}/dia`;
}

/** Texto padrão da linha de baixo: dias, média e cronômetro. */
function summaryLine(s) {
  const parts = [];
  const what = s.unit === UNITS.MINUTE ? 'ouvindo' : 'de leitura';
  if (s.days) parts.push(`${s.days} ${s.days === 1 ? 'dia' : 'dias'} ${what}`, `média ${perDayText(s.avg, s.unit)}`);
  if (s.minutes) parts.push(`${formatMinutes(s.minutes)} cronometradas`);
  return parts.join(' · ') || 'Sem avanço registrado ainda';
}

function barTip(bar, s, today) {
  const when = s.step === 'week' ? `Semana de ${dayLabel(bar.date, today)}` : dayLabel(bar.date, today);
  const what = bar.value > 0 ? `+${amountText(bar.value, s.unit)}` : 'sem avanço';
  return [when, what, bar.minutes ? formatMinutes(bar.minutes) : ''].filter(Boolean).join(' · ');
}

/**
 * Cartão do gráfico. Sem diário devolve ''. Opções:
 * title (texto do cabeçalho), tall (altura maior, na aba Diário), hint (linha de baixo com a dica de
 * tocar, em vez do resumo), footer (HTML extra no rodapé).
 */
export function rhythmChart(book, today, { title = 'Ritmo da leitura', tall = false, hint = false, footer = '', headLink = '' } = {}) {
  const s = rhythmSeries(book);
  if (!s) return '';
  const unitWord = { [UNITS.PERCENT]: '% lidos', [UNITS.MINUTE]: 'tempo ouvido' }[s.unit] || 'páginas';
  const range = s.first === s.last ? dayLabel(s.first, today) : `${dayLabel(s.first, today)} → ${dayLabel(s.last, today)}`;
  const max = s.max || 1;
  const dense = s.bars.length > 40;
  const bars = s.bars.map((bar) => {
    const pct = bar.value > 0 ? Math.max(4, (bar.value / max) * 100) : 0;
    return `<i class="rchart-bar${bar.value > 0 ? '' : ' is-zero'}${bar.minutes && !bar.value ? ' has-time' : ''}" style="--v:${pct.toFixed(1)}%" data-tip="${esc(barTip(bar, s, today))}"></i>`;
  }).join('');
  const avgPct = s.max ? Math.min(100, (s.avg / s.max) * 100) : 0;
  // Linha da média por dia de leitura: só no gráfico diário (nas semanas, a escala é outra).
  const avgLine = s.step === 'day' && s.days > 1 && s.bars.length > 2
    ? `<span class="rchart-avg" style="--v:${avgPct.toFixed(1)}%" aria-hidden="true"></span>`
    : '';
  const label = `${s.step === 'week' ? 'Por semana' : 'Por dia'}, ${unitWord} de ${range}: ${summaryLine(s)}. Máximo de ${amountText(s.max, s.unit)} ${s.step === 'week' ? 'numa semana' : 'num dia'}.`;
  // Na aba Diário os totais já estão nos cartões logo abaixo: a linha só convida a tocar.
  const readout = hint ? `Toque numa barra para ver ${s.step === 'week' ? 'a semana' : 'o dia'}` : summaryLine(s);
  // headLink (ficha): o título sai do cartão e fica na linha de cima, como em Trechos, com a ação à direita.
  const outside = Boolean(headLink);
  const tag = outside ? 'div' : 'section';
  const card = `
    <${tag} class="rchart${tall ? ' is-tall' : ''}${outside ? ' is-outside' : ''}" data-rchart>
      <div class="rchart-head">
        ${outside ? '' : `<h2 class="rchart-title">${esc(title)}</h2>`}
        <span class="rchart-range">${{ [UNITS.PERCENT]: '%', [UNITS.MINUTE]: 'min' }[s.unit] || 'págs.'} por ${s.step === 'week' ? 'semana' : 'dia'}</span>
      </div>
      <div class="rchart-plot" role="img" aria-label="${esc(label)}">
        <span class="rchart-max" aria-hidden="true">${esc(amountText(s.max, s.unit))}</span>
        <div class="rchart-bars${dense ? ' is-dense' : ''}">${bars}${avgLine}</div>
      </div>
      <div class="rchart-axis" aria-hidden="true"><span>${esc(dayLabel(s.first, today))}</span>${s.first !== s.last ? `<span>${esc(dayLabel(s.last, today))}</span>` : ''}</div>
      <p class="rchart-readout" aria-live="polite" data-default="${esc(readout)}">${esc(readout)}</p>
      ${footer}
    </${tag}>`;
  if (!outside) return card;
  return `
    <section class="ficha-section ficha-rhythm">
      <div class="section-head"><h2>${esc(title)}</h2>${headLink}</div>${card}
    </section>`;
}
