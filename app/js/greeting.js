// Saudação do Início (v1.5): "Boa noite, Pedro", a data de hoje por extenso e a sequência
// de dias seguidos com leitura registrada no diário. Funções puras (o nome vem de prefs.js).

import { isIsoDate, monthName } from './dates.js';
import { addDays } from './pace.js';

const WEEKDAYS = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'];

/** 5h–11h59: "Bom dia"; 12h–17h59: "Boa tarde"; o resto: "Boa noite". */
export function greetingFor(hour) {
  const h = Number(hour);
  if (h >= 5 && h < 12) return 'Bom dia';
  if (h >= 12 && h < 18) return 'Boa tarde';
  return 'Boa noite';
}

/** '2026-10-27' → "terça, 27 de outubro". */
export function longDate(iso) {
  if (!isIsoDate(iso)) return '';
  const d = new Date(Number(iso.slice(0, 4)), Number(iso.slice(5, 7)) - 1, Number(iso.slice(8, 10)));
  return `${WEEKDAYS[d.getDay()]}, ${d.getDate()} de ${monthName(d.getMonth()).toLowerCase()}`;
}

/**
 * Dias seguidos com leitura até hoje. Se hoje ainda não teve leitura, a sequência que vai
 * até ontem continua valendo (o dia não acabou). days: Set ou lista de 'AAAA-MM-DD'.
 * Devolve { count, today } — today: hoje já conta.
 */
export function currentDayStreak(days, today) {
  const set = days instanceof Set ? days : new Set(days);
  if (!isIsoDate(today)) return { count: 0, today: false };
  const readToday = set.has(today);
  let day = readToday ? today : addDays(today, -1);
  let count = 0;
  while (set.has(day)) {
    count += 1;
    day = addDays(day, -1);
  }
  return { count, today: readToday };
}

/** "5 dias seguidos lendo"; um dia só: "Leitura registrada hoje" / "Última leitura ontem"; nada: ''. */
export function streakText({ count, today }) {
  if (!count) return '';
  if (count === 1) return today ? 'Leitura registrada hoje' : 'Última leitura ontem';
  return `${count} dias seguidos lendo`;
}
