// Velocidade de leitura (1.6) na aba Ritmo do Resumo: páginas por hora, horário em que você
// mais lê (gráfico das 24 horas) e previsão da fila "Quero ler". Os cálculos ficam em speed.js.

import { yearOf } from '../dates.js';
import {
  MIN_HOUR_DAYS, bookEstimate, formatDuration, formatHours, hourDistribution, queueForecast, speedStats,
} from '../speed.js';
import { formatMinutes } from '../reading-days.js';
import { decimal, esc, icon, num, plural } from '../ui.js';

const hourLabel = (h) => `${h}h`;

/** Gráfico das 24 horas: uma barra por hora, eixo com 0h · 6h · 12h · 18h. */
function hoursChart(d) {
  const max = Math.max(...d.minutes, 1);
  const bars = d.minutes.map((m, h) => {
    const pct = m ? Math.max(6, Math.round((m / max) * 100)) : 0;
    return `<i class="hr-bar${h === d.peak ? ' is-peak' : ''}${m ? '' : ' is-zero'}" style="--v:${pct}%"></i>`;
  }).join('');
  const ticks = [0, 6, 12, 18].map((h) => `<span style="left:${(h / 24) * 100}%">${hourLabel(h)}</span>`).join('');
  const label = `Minutos de leitura por hora do dia. Pico às ${hourLabel(d.peak)}, ${formatMinutes(d.minutes[d.peak])} no total.`;
  return `
    <div class="hr-chart" role="img" aria-label="${esc(label)}">
      <div class="hr-bars">${bars}</div>
      <div class="hr-axis" aria-hidden="true">${ticks}</div>
    </div>`;
}

function hoursBlock(d) {
  if (!d.enough) {
    const why = d.total
      ? `Mais ${plural(Math.max(1, MIN_HOUR_DAYS - d.days), 'dia', 'dias')} com o cronômetro e aparece o horário em que você mais lê.`
      : 'Leia com o cronômetro (Ler agora): depois de alguns dias, aparece aqui o horário em que você mais lê.';
    return `<p class="sp-empty">${icon('sparkle', { size: 16 })}<span>${esc(why)}</span></p>`;
  }
  return `
    <div class="sp-hours">
      <p class="sp-hours-head"><span class="strong-ish">Você lê mais ${esc(d.period)}</span> <span class="muted small">pico às ${hourLabel(d.peak)}</span></p>
      ${hoursChart(d)}
    </div>`;
}

/** Cartão "Velocidade de leitura": páginas por hora no ano e o horário das sessões. */
export function speedCard(state, year) {
  const s = speedStats(state.books, year);
  const hours = hourDistribution(state.books, year);
  let top;
  if (s.enough) {
    top = `
      <div class="sp-main">
        <span class="sp-num">${num(s.pagesPerHour)}</span>
        <span class="sp-unit">págs. por hora</span>
      </div>
      <p class="muted small">${esc(`${formatMinutes(s.minutes)} cronometradas em ${plural(s.sessions, 'dia', 'dias')} · ${num(s.pages)} págs.`)}</p>`;
  } else {
    const what = s.sessions
      ? `Mais algumas sessões do cronômetro em ${year} e aparecem aqui suas páginas por hora.`
      : `Use o cronômetro (Ler agora) ao ler: com algumas sessões em ${year}, aparecem aqui suas páginas por hora.`;
    top = `<p class="sp-empty">${icon('chart', { size: 16, stroke: 2.2 })}<span>${esc(what)}</span></p>`;
  }
  return `
    <section class="card sp-card">
      <h2>Velocidade de leitura</h2>
      ${top}
      ${hoursBlock(hours)}
    </section>`;
}

function queueRow(label, q) {
  if (!q.count) return '';
  const pages = q.pages ? `${num(q.pages)} págs.` : 'sem nº de páginas';
  // Livro sem nº de páginas não entra na soma (nem na previsão): só é contado.
  const missing = q.missing && q.pages ? ` · ${q.missing} sem nº de págs.` : '';
  return `
    <div class="sp-q-row">
      <span class="sp-q-text"><span class="strong-ish">${esc(label)}</span> <span class="muted small">${esc(`${plural(q.count, 'livro', 'livros')} · ${pages}${missing}`)}</span></span>
      <span class="sp-q-days">${q.days ? esc(formatDuration(q.days)) : '—'}</span>
    </div>`;
}

/** Cartão "Previsão da fila": quanto tempo levam as Próximas e a lista "Quero ler" no ritmo recente. */
export function queueCard(state, year, today) {
  if (year !== yearOf(today)) return '';
  const f = queueForecast(state, today);
  if (!f.all.count) {
    return `
      <section class="card sp-card">
        <h2>Previsão da fila</h2>
        <p class="sp-empty">${icon('book', { size: 16 })}<span>Sua lista Quero ler está vazia. Adicione livros para ver quanto tempo ela leva.</span></p>
      </section>`;
  }
  if (!f.pace) {
    return `
      <section class="card sp-card">
        <h2>Previsão da fila</h2>
        <p class="sp-empty">${icon('chart', { size: 16, stroke: 2.2 })}<span>Registre a leitura por alguns dias (ou conclua um livro) e aparece aqui quanto tempo leva a sua fila de ${plural(f.all.count, 'livro', 'livros')}.</span></p>
      </section>`;
  }
  const perDay = f.pace.perDay < 10 ? decimal(f.pace.perDay) : num(f.pace.perDay);
  const sameList = f.next.count === f.all.count;
  return `
    <section class="card sp-card">
      <div class="section-head"><h2>Previsão da fila</h2><span class="muted small">no ritmo atual</span></div>
      <div class="sp-q">
        ${sameList ? '' : queueRow('Próximas', f.next)}
        ${queueRow('Toda a lista Quero ler', f.all)}
      </div>
      <p class="muted small">${esc(`Ritmo dos últimos ${f.pace.window} dias: ${perDay} ${f.pace.perDay > 1 ? 'págs.' : 'pág.'} por dia, contando os dias sem leitura.`)}</p>
    </section>`;
}

/** Linha "Você leva ~12 dias · ~6 h de leitura" na ficha de um livro da fila ('' sem base). */
export function bookEstimateLine(state, book, today) {
  const e = bookEstimate(state.books, book, today);
  if (!e) return '';
  const parts = [];
  if (e.days) parts.push(`Você leva ${formatDuration(e.days)}`);
  if (e.hours) parts.push(`${formatHours(e.hours)} de leitura`);
  const text = parts.join(' · ');
  return `<p class="ficha-estimate">${icon('chart', { size: 16, stroke: 2.2 })}<span>${esc(text.charAt(0).toUpperCase() + text.slice(1))}</span></p>`;
}
