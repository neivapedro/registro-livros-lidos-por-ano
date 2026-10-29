// Sons ambiente do cronômetro (1.6): chuva, café, lareira e ruído marrom, gerados na hora com
// Web Audio (nenhum arquivo de som). Cada som são camadas de ruído filtrado tocando em laço
// (AudioBuffer gerado uma vez) mais pequenos eventos agendados (gotas, estalos, xícaras).
// Nada de ScriptProcessor: o trabalho pesado é só gerar os buffers, uma vez por som.
//
// iPhone: o áudio só pode começar num toque (o AudioContext nasce e volta dentro do clique).
// Uma ligação ou outro app pode interromper o áudio: ao voltar, tenta retomar; se o sistema
// pedir um toque, retoma no próximo toque na tela. A chave do silencioso pode calar o
// Web Audio em algumas versões do iOS (a tela avisa).

export const SOUNDS = [
  ['off', 'Desligado'],
  ['chuva', 'Chuva'],
  ['cafe', 'Café'],
  ['lareira', 'Lareira'],
  ['marrom', 'Ruído marrom'],
];
const SOUND_IDS = SOUNDS.map(([id]) => id);
export const AMBIENT_STORAGE = 'leituras:som';
export const DEFAULT_VOLUME = 60;

// ---------- Escolha do aparelho ----------

export function validSound(id) {
  return SOUND_IDS.includes(id) ? id : 'off';
}

function validVolume(v) {
  const n = Math.round(Number(v));
  return Number.isFinite(n) && n >= 0 && n <= 100 ? n : DEFAULT_VOLUME;
}

/** { sound, volume } guardado neste aparelho (fora do backup); estragado ou sem acesso → padrão. */
export function readAmbientPref(storage) {
  try {
    const raw = JSON.parse(storage.getItem(AMBIENT_STORAGE) || 'null');
    if (raw && typeof raw === 'object') return { sound: validSound(raw.sound), volume: validVolume(raw.volume) };
  } catch { /* começa do padrão */ }
  return { sound: 'off', volume: DEFAULT_VOLUME };
}

export function saveAmbientPref(storage, pref) {
  const clean = { sound: validSound(pref?.sound), volume: validVolume(pref?.volume) };
  try {
    storage.setItem(AMBIENT_STORAGE, JSON.stringify(clean));
    return true;
  } catch {
    return false;
  }
}

/** Volume da tela (0–100) → ganho: curva quadrática (o ouvido percebe assim), no máximo 0,8. */
export function volumeGain(volume) {
  const v = validVolume(volume) / 100;
  return Math.round(v * v * 0.8 * 1000) / 1000;
}

// ---------- Ruídos (funções puras, testáveis) ----------

/**
 * Laço sem estalo: gera n + fade amostras e mistura o fim no começo, de modo que a última
 * amostra emenda na primeira. Depois normaliza o pico para `peak`.
 */
function loopable(gen, n, { fade = 2048, peak = 0.9 } = {}) {
  const f = Math.min(fade, Math.floor(n / 4));
  const raw = new Float32Array(n + f);
  for (let i = 0; i < raw.length; i += 1) raw[i] = gen(i);
  const out = new Float32Array(n);
  for (let i = 0; i < n; i += 1) {
    if (i < f) {
      const t = i / f;
      out[i] = raw[i] * t + raw[n + i] * (1 - t);
    } else out[i] = raw[i];
  }
  let max = 0;
  for (let i = 0; i < n; i += 1) max = Math.max(max, Math.abs(out[i]));
  if (max > 0) for (let i = 0; i < n; i += 1) out[i] = (out[i] / max) * peak;
  return out;
}

export function whiteNoise(n, rand = Math.random) {
  return loopable(() => rand() * 2 - 1, n);
}

/** Ruído marrom (vermelho): ruído branco integrado com fuga, grave e macio. */
export function brownNoise(n, rand = Math.random) {
  let last = 0;
  return loopable(() => {
    last = (last + 0.02 * (rand() * 2 - 1)) / 1.02;
    return last;
  }, n);
}

/** Ruído rosa (filtro de Paul Kellet): o "chiado" natural de chuva e de conversa ao longe. */
export function pinkNoise(n, rand = Math.random) {
  let b0 = 0;
  let b1 = 0;
  let b2 = 0;
  return loopable(() => {
    const w = rand() * 2 - 1;
    b0 = 0.99765 * b0 + w * 0.099046;
    b1 = 0.963 * b1 + w * 0.2965164;
    b2 = 0.57 * b2 + w * 1.0526913;
    return b0 + b1 + b2 + w * 0.1848;
  }, n);
}

/**
 * Gotas de chuva já gravadas no laço: estalinhos curtos (ruído com queda rápida), em
 * quantidade e força sorteadas. dropsPerSecond controla a "intensidade" da chuva.
 */
export function rainDrops(n, sampleRate, rand = Math.random, dropsPerSecond = 14) {
  const out = new Float32Array(n);
  const count = Math.round((n / sampleRate) * dropsPerSecond);
  for (let k = 0; k < count; k += 1) {
    const at = Math.floor(rand() * n);
    const len = Math.floor(sampleRate * (0.004 + rand() * 0.012));
    const amp = 0.15 + rand() ** 2 * 0.85;
    let prev = 0;
    for (let i = 0; i < len; i += 1) {
      const w = rand() * 2 - 1;
      // Diferença de amostras: tira o grave e deixa o "tic" agudo da gota.
      const s = (w - prev) * 0.5 * amp * Math.exp(-i / (len / 5));
      prev = w;
      out[(at + i) % n] += s;
    }
  }
  let max = 0;
  for (let i = 0; i < n; i += 1) max = Math.max(max, Math.abs(out[i]));
  if (max > 0) for (let i = 0; i < n; i += 1) out[i] = (out[i] / max) * 0.9;
  return out;
}

/** Estalo de lenha: ruído com queda muito rápida (poucos ms). */
export function crackle(sampleRate, rand = Math.random) {
  const len = Math.floor(sampleRate * (0.006 + rand() * 0.02));
  const out = new Float32Array(len);
  for (let i = 0; i < len; i += 1) out[i] = (rand() * 2 - 1) * Math.exp(-i / (len / 6));
  return out;
}

// ---------- Tocador ----------

const AudioCtx = () => globalThis.AudioContext || globalThis.webkitAudioContext || null;

/**
 * Tocador de som ambiente. Nada é criado até play() (que deve ser chamado num toque).
 * opts.AudioContextClass: para testes.
 */
export function createAmbient({ AudioContextClass = null } = {}) {
  let ctx = null;
  let master = null;
  let current = null; // { sound, nodes, timer }
  let volume = DEFAULT_VOLUME;
  let wanted = false;
  const buffers = new Map();

  function context() {
    if (ctx) return ctx;
    const Ctx = AudioContextClass || AudioCtx();
    if (!Ctx) return null;
    try {
      ctx = new Ctx();
    } catch {
      return null;
    }
    master = ctx.createGain();
    master.gain.value = 0;
    master.connect(ctx.destination);
    return ctx;
  }

  function buffer(kind) {
    if (buffers.has(kind)) return buffers.get(kind);
    const sr = ctx.sampleRate;
    // Tamanhos diferentes (e não múltiplos): os laços não se repetem juntos.
    const spec = {
      white: [3.1, (n) => whiteNoise(n)],
      pink: [5.3, (n) => pinkNoise(n)],
      brown: [6.7, (n) => brownNoise(n)],
      drops: [7.9, (n) => rainDrops(n, sr)],
    }[kind];
    const n = Math.floor(sr * spec[0]);
    const buf = ctx.createBuffer(1, n, sr);
    buf.getChannelData(0).set(spec[1](n));
    buffers.set(kind, buf);
    return buf;
  }

  function loop(kind, nodes) {
    const src = ctx.createBufferSource();
    src.buffer = buffer(kind);
    src.loop = true;
    src.start(0, Math.random() * src.buffer.duration);
    nodes.push(src);
    return src;
  }

  function filter(type, freq, q, nodes) {
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    f.Q.value = q;
    nodes.push(f);
    return f;
  }

  function gain(value, nodes) {
    const g = ctx.createGain();
    g.gain.value = value;
    nodes.push(g);
    return g;
  }

  /** Oscilação lenta do volume de uma camada (murmúrio do café, chama da lareira). */
  function wobble(target, rate, depth, nodes) {
    const lfo = ctx.createOscillator();
    lfo.frequency.value = rate;
    const amount = gain(depth, nodes);
    lfo.connect(amount).connect(target.gain);
    lfo.start();
    nodes.push(lfo);
  }

  function chain(nodes, ...parts) {
    for (let i = 0; i < parts.length - 1; i += 1) parts[i].connect(parts[i + 1]);
    parts[parts.length - 1].connect(master);
    return parts;
  }

  // Eventos curtos (estalos, xícaras): criados na hora e soltos sozinhos quando acabam.
  // Oito estalos diferentes, gerados uma vez e sorteados a cada evento.
  let crackles = null;
  function crackleAt(when, strength) {
    if (!crackles) {
      crackles = Array.from({ length: 8 }, () => {
        const data = crackle(ctx.sampleRate);
        const b = ctx.createBuffer(1, data.length, ctx.sampleRate);
        b.getChannelData(0).set(data);
        return b;
      });
    }
    const src = ctx.createBufferSource();
    src.buffer = crackles[Math.floor(Math.random() * crackles.length)];
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 1500 + Math.random() * 3500;
    bp.Q.value = 0.9;
    const g = ctx.createGain();
    g.gain.value = strength;
    src.connect(bp).connect(g).connect(master);
    src.start(when);
  }

  function clinkAt(when) {
    const base = 2300 + Math.random() * 1400;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, when);
    g.gain.exponentialRampToValueAtTime(0.035, when + 0.005);
    g.gain.exponentialRampToValueAtTime(0.0001, when + 0.35);
    g.connect(master);
    for (const mult of [1, 2.76]) {
      const o = ctx.createOscillator();
      o.frequency.value = base * mult;
      o.connect(g);
      o.start(when);
      o.stop(when + 0.4);
    }
  }

  /** Agenda os eventos de cada som um pouco à frente (o setInterval do iPhone atrasa). */
  function scheduler(sound) {
    let next = ctx.currentTime + 0.3;
    let nextClink = ctx.currentTime + 2 + Math.random() * 4;
    return setInterval(() => {
      if (!ctx || ctx.state !== 'running') return;
      const horizon = ctx.currentTime + 0.6;
      if (sound === 'lareira') {
        while (next < horizon) {
          const burst = Math.random() < 0.2;
          crackleAt(Math.max(next, ctx.currentTime), burst ? 0.5 + Math.random() * 0.4 : 0.08 + Math.random() * 0.25);
          next += burst ? 0.03 + Math.random() * 0.08 : 0.08 + Math.random() * 0.6;
        }
      }
      if (sound === 'cafe') {
        while (nextClink < horizon) {
          clinkAt(Math.max(nextClink, ctx.currentTime));
          nextClink += 3 + Math.random() * 7;
        }
      }
    }, 250);
  }

  function build(sound) {
    const nodes = [];
    if (sound === 'chuva') {
      chain(nodes, loop('pink', nodes), filter('bandpass', 1400, 0.5, nodes), gain(0.75, nodes));
      chain(nodes, loop('brown', nodes), filter('lowpass', 500, 0.7, nodes), gain(0.35, nodes));
      chain(nodes, loop('drops', nodes), filter('highpass', 1800, 0.7, nodes), gain(0.28, nodes));
    } else if (sound === 'cafe') {
      const low = gain(0.45, nodes);
      chain(nodes, loop('pink', nodes), filter('bandpass', 480, 1.1, nodes), low);
      wobble(low, 0.13, 0.18, nodes);
      const mid = gain(0.22, nodes);
      chain(nodes, loop('white', nodes), filter('bandpass', 1050, 1.6, nodes), filter('lowpass', 2200, 0.7, nodes), mid);
      wobble(mid, 0.21, 0.1, nodes);
      chain(nodes, loop('brown', nodes), filter('lowpass', 260, 0.7, nodes), gain(0.35, nodes));
    } else if (sound === 'lareira') {
      const roar = gain(0.7, nodes);
      chain(nodes, loop('brown', nodes), filter('lowpass', 380, 0.8, nodes), roar);
      wobble(roar, 0.09, 0.2, nodes);
    } else {
      chain(nodes, loop('brown', nodes), filter('lowpass', 900, 0.7, nodes), gain(1, nodes));
    }
    const timer = sound === 'lareira' || sound === 'cafe' ? scheduler(sound) : null;
    return { sound, nodes, timer };
  }

  function teardown(layer, delay = 0) {
    if (!layer) return;
    clearInterval(layer.timer);
    const done = () => {
      for (const node of layer.nodes) {
        try { if (typeof node.stop === 'function') node.stop(); } catch { /* já parado */ }
        try { node.disconnect(); } catch { /* já solto */ }
      }
    };
    if (delay) setTimeout(done, delay);
    else done();
  }

  function fadeTo(value, seconds) {
    const now = ctx.currentTime;
    master.gain.cancelScheduledValues(now);
    master.gain.setValueAtTime(master.gain.value, now);
    master.gain.setTargetAtTime(value, now, seconds / 3);
  }

  return {
    /** Toca (ou troca para) sound. Chame num toque. Devolve false se não houver áudio. */
    play(sound, vol = volume) {
      volume = validVolume(vol);
      const id = validSound(sound);
      if (id === 'off') {
        this.stop();
        return true;
      }
      if (!context()) return false;
      wanted = true;
      if (ctx.state !== 'running') ctx.resume().catch(() => {});
      if (current?.sound !== id) {
        teardown(current);
        master.gain.value = 0;
        current = build(id);
      }
      fadeTo(volumeGain(volume), 0.8);
      return true;
    },
    stop() {
      wanted = false;
      if (!ctx || !current) return;
      fadeTo(0, 0.25);
      const layer = current;
      current = null;
      teardown(layer, 350);
      // Parado, o contexto dorme (sem gastar bateria) até o próximo play.
      setTimeout(() => {
        if (!wanted && ctx.state === 'running') ctx.suspend().catch(() => {});
      }, 400);
    },
    setVolume(vol) {
      volume = validVolume(vol);
      if (ctx && current) fadeTo(volumeGain(volume), 0.15);
    },
    /** Depois de uma interrupção (ligação, outro app): volta, se ainda devia tocar. */
    resume() {
      if (!wanted || !ctx || ctx.state === 'running') return;
      ctx.resume().catch(() => {});
    },
    get playing() { return wanted && Boolean(current); },
    get sound() { return current?.sound || 'off'; },
    get state() { return ctx ? ctx.state : 'none'; },
    get context() { return ctx; },
  };
}
