// Tela do cronômetro de leitura (#/ler/:id) e aviso de leitura em andamento no Início.

import { STATUS } from '../store.js';
import { elapsedMs, formatElapsed, isPaused, wholeMinutes } from '../timer.js';
import { cover, esc, icon } from '../ui.js';
import { ambientPicker } from './ambient.js';

/** Formulário do "Parar": onde parou, já preenchido com a posição atual. */
function stopForm(book) {
  const kindle = book.format === 'kindle';
  const value = kindle ? book.currentPercent : book.currentPage;
  const label = kindle ? 'Quantos % o Kindle mostra?' : 'Em que página você parou?';
  return `
    <form class="timer-stop" data-timer-form novalidate>
      <label class="timer-stop-label" for="timer-input">${label}</label>
      <span class="progress-edit-field">
        <input id="timer-input" type="number" inputmode="numeric" min="0" max="${kindle ? 100 : book.pages || 20000}"
          value="${esc(value ?? '')}" placeholder="${kindle ? '0 a 100' : 'Página'}" enterkeyhint="done">
        <span class="progress-edit-suffix">${kindle ? '%' : book.pages ? `de ${esc(book.pages)}` : 'pág.'}</span>
      </span>
      <button type="submit" class="btn-primary">Salvar</button>
      <button type="button" class="btn-text timer-text-btn" data-action="timer-back">Voltar ao cronômetro</button>
    </form>`;
}

export function timerView({ book, session, now, stopping, ambient = null }) {
  const paused = isPaused(session);
  const controls = stopping ? stopForm(book) : `
    <div class="timer-actions">
      <button type="button" class="btn-ghost" data-action="timer-toggle">${paused ? 'Continuar' : 'Pausar'}</button>
      <button type="button" class="btn-primary" data-action="timer-stop">Parar</button>
    </div>
    <button type="button" class="btn-text timer-text-btn" data-action="timer-cancel">Cancelar sessão</button>`;
  return `
    <header class="top">
      <a class="icon-btn" href="#/inicio" aria-label="Voltar ao Início">${icon('chevronLeft', { size: 20, stroke: 2 })}</a>
      <span class="eyebrow">Lendo agora</span>
      <span class="icon-btn-spacer" aria-hidden="true"></span>
    </header>
    <section class="timer${paused ? ' is-paused' : ''}">
      ${cover(book, { size: 'xl' })}
      <div class="timer-book">
        <span class="serif-title lg">${esc(book.title)}</span>
        <span class="muted small">${esc(book.authors || 'Autor não informado')}</span>
      </div>
      <p class="timer-clock" role="timer" aria-label="Tempo de leitura" data-timer-elapsed>${formatElapsed(elapsedMs(session, now))}</p>
      <span class="timer-state">${stopping ? 'Tempo da sessão' : paused ? 'Pausado' : 'Lendo · a tela fica acesa'}</span>
    </section>
    <section class="timer-controls">${controls}</section>${ambient && !stopping ? ambientPicker(ambient, { paused }) : ''}`;
}

// Triângulo desenhado (o caractere ▶ vira emoji no iPhone).
const PLAY = '<svg class="icon" width="12" height="12" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M7 4.5v15a1 1 0 0 0 1.5.86l12.5-7.5a1 1 0 0 0 0-1.72L8.5 3.64A1 1 0 0 0 7 4.5z"/></svg>';

/** Botão "Ler agora" do cartão de leitura; com a sessão deste livro aberta (destacado), volta a ela. */
export function timerButton(book, session) {
  const running = session?.bookId === book.id;
  const label = running ? ' aria-label="Ler agora: voltar ao cronômetro"' : '';
  return `<button type="button" class="btn-timer${running ? ' is-running' : ''}" data-action="start-timer" data-id="${esc(book.id)}"${label}>${PLAY}Ler agora</button>`;
}

/** Aviso no Início quando há uma sessão aberta (inclusive depois de fechar e abrir o app). */
export function timerBanner(books, session, now = Date.now()) {
  if (!session) return '';
  const book = books.find((b) => b.id === session.bookId && b.status === STATUS.READING);
  if (!book) return '';
  const label = isPaused(session) ? 'Leitura pausada' : 'Leitura em andamento';
  return `
    <a class="timer-banner" href="#/ler/${encodeURIComponent(book.id)}">
      <span class="timer-dot${isPaused(session) ? ' is-paused' : ''}" aria-hidden="true"></span>
      <span class="timer-banner-text">
        <span>${label}: <strong data-timer-minutes>${wholeMinutes(elapsedMs(session, now))} min</strong></span>
        <span class="muted small timer-banner-title">${esc(book.title)}</span>
      </span>
      <span class="timer-banner-go">Voltar</span>
    </a>`;
}
