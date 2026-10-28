// Cronômetro de leitura. A sessão é calculada pelos horários (início + pausas),
// nunca contando "tiques": o iPhone congela o app em segundo plano e o tempo
// precisa continuar certo quando ele volta.
// Sessão: { bookId, startedAt, pausedAt, pausedMs } (horários em ms desde 1970).
// Uma sessão por vez, guardada no localStorage para sobreviver a fechar o app.

import { formatDuration } from './audio.js';

export const SESSION_KEY = 'leituras:sessao';

export function startSession(bookId, now) {
  return { bookId: String(bookId), startedAt: now, pausedAt: null, pausedMs: 0 };
}

export function isPaused(session) {
  return session.pausedAt !== null;
}

/** Tempo lido: do início até agora (ou até a pausa), menos o tempo pausado. */
export function elapsedMs(session, now) {
  const end = session.pausedAt ?? now;
  // Relógio do aparelho voltou no tempo: nunca mostra negativo.
  return Math.max(0, end - session.startedAt - session.pausedMs);
}

export function pauseSession(session, now) {
  if (isPaused(session)) return session;
  return { ...session, pausedAt: Math.max(now, session.startedAt) };
}

export function resumeSession(session, now) {
  if (!isPaused(session)) return session;
  return { ...session, pausedAt: null, pausedMs: session.pausedMs + Math.max(0, now - session.pausedAt) };
}

const isTime = (v) => typeof v === 'number' && Number.isFinite(v) && v >= 0;

/** Sessão lida do armazenamento; qualquer coisa estranha vira null (sem sessão). */
export function parseSession(raw) {
  let data;
  try {
    data = typeof raw === 'string' ? JSON.parse(raw) : raw;
  } catch {
    return null;
  }
  if (!data || typeof data !== 'object') return null;
  const { bookId, startedAt, pausedAt, pausedMs } = data;
  if (typeof bookId !== 'string' || !bookId || bookId.length > 100) return null;
  if (!isTime(startedAt) || !isTime(pausedMs)) return null;
  if (pausedAt !== null && !(isTime(pausedAt) && pausedAt >= startedAt)) return null;
  return { bookId, startedAt, pausedAt, pausedMs };
}

// O armazenamento pode falhar (modo privado, cota): o cronômetro segue só na memória.
export function loadSession(storage) {
  try {
    return parseSession(storage.getItem(SESSION_KEY));
  } catch {
    return null;
  }
}

export function saveSession(storage, session) {
  try {
    if (session) storage.setItem(SESSION_KEY, JSON.stringify(session));
    else storage.removeItem(SESSION_KEY);
  } catch {
    // Sem armazenamento: nada a fazer.
  }
}

const pad = (n) => String(n).padStart(2, '0');

/** "07:05" ou, a partir de uma hora, "1:02:09". */
export function formatElapsed(ms) {
  const total = Math.floor(Math.max(0, ms) / 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return h ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
}

/** Minutos que entram no diário: sessão de menos de 1 minuto não conta. */
export function sessionMinutes(ms) {
  if (!(ms >= 60000)) return 0;
  return Math.min(1440, Math.round(ms / 60000));
}

/** Minutos inteiros já lidos, para o aviso do Início. */
export function wholeMinutes(ms) {
  return Math.floor(Math.max(0, ms) / 60000);
}

/**
 * Resumo depois de salvar: "32 min · 18 págs. · 34 págs./hora" (Kindle: "32 min · 6%";
 * audiolivro: "32 min · 45 min ouvidos", o avanço no áudio, que pode ser acelerado).
 * delta: quanto avançou na sessão (páginas, pontos de % ou minutos do áudio).
 */
export function sessionSummary({ minutes, unit, delta }) {
  const parts = [minutes > 0 ? `${minutes} min` : 'menos de 1 min'];
  if (delta > 0) {
    if (unit === 'minute') {
      parts.push(`${formatDuration(delta)} ouvidos`);
    } else if (unit === 'percent') {
      parts.push(`${delta}%`);
    } else {
      parts.push(`${delta} ${delta === 1 ? 'pág.' : 'págs.'}`);
      if (minutes > 0) parts.push(`${Math.round((delta * 60) / minutes)} págs./hora`);
    }
  }
  return parts.join(' · ');
}
