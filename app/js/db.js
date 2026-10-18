// Armazenamento chave-valor no aparelho.
// IndexedDB guarda bem mais que o localStorage (que tem limite de ~5 MB) e, com
// navigator.storage.persist(), fica protegido da limpeza automática do navegador.
// Sem IndexedDB (navegador antigo, modo privado), usa o localStorage como antes,
// gravando JSON em 'leituras:<chave>'.

const DB_NAME = 'leituras';
const STORE = 'kv';
const LS_PREFIX = 'leituras:';
// Deixada depois da primeira gravação no IndexedDB. Daí em diante os dados estão lá:
// se o IndexedDB falhar, cair para o localStorage mostraria dados vazios ou velhos,
// então as funções passam a dar erro em vez de fingir que está tudo certo.
export const IDB_MARK_KEY = 'leituras:indexeddb';
// O Safari às vezes não responde à abertura do banco: sem resposta, desiste.
const OPEN_TIMEOUT_MS = 5000;

let dbPromise = null;
let mode = null;
let marked = false;

function openDb() {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      if (!globalThis.indexedDB) {
        reject(new Error('IndexedDB indisponível.'));
        return;
      }
      const timer = setTimeout(() => reject(new Error('IndexedDB não respondeu.')), OPEN_TIMEOUT_MS);
      let req;
      try {
        req = globalThis.indexedDB.open(DB_NAME, 1);
      } catch (err) {
        clearTimeout(timer);
        reject(err);
        return;
      }
      req.onupgradeneeded = () => req.result.createObjectStore(STORE);
      req.onsuccess = () => {
        clearTimeout(timer);
        const db = req.result;
        // Outra aba quer atualizar o banco, ou o sistema fechou a conexão: reabre na próxima vez.
        db.onversionchange = () => { db.close(); dbPromise = null; };
        db.onclose = () => { dbPromise = null; };
        resolve(db);
      };
      req.onerror = () => {
        clearTimeout(timer);
        reject(req.error || new Error('Falha ao abrir o IndexedDB.'));
      };
    });
    dbPromise.catch(() => { dbPromise = null; });
  }
  return dbPromise;
}

function hasMark() {
  try {
    return globalThis.localStorage?.getItem(IDB_MARK_KEY) === '1';
  } catch {
    return false;
  }
}

function setMark() {
  if (marked) return;
  try {
    globalThis.localStorage?.setItem(IDB_MARK_KEY, '1');
    marked = true;
  } catch {
    // Sem a marca, o pior caso é usar o localStorage numa falha futura do IndexedDB.
  }
}

/** Deixa a marca de que os dados estão no IndexedDB (nova tentativa, se a da gravação falhou). */
export function markStored() {
  setMark();
}

/**
 * Onde os dados ficam: 'indexeddb' ou 'localstorage'.
 * Dá erro se o IndexedDB já guarda os dados mas não abriu agora (tente de novo depois).
 */
export async function storageMode() {
  if (mode) return mode;
  try {
    await openDb();
    mode = 'indexeddb';
  } catch (err) {
    if (hasMark()) throw err;
    mode = 'localstorage';
  }
  return mode;
}

async function run(txMode, op) {
  for (let attempt = 0; ; attempt += 1) {
    const db = await openDb();
    try {
      return await new Promise((resolve, reject) => {
        const tx = db.transaction(STORE, txMode);
        const req = op(tx.objectStore(STORE));
        tx.oncomplete = () => resolve(req.result);
        tx.onerror = () => reject(tx.error || req.error);
        tx.onabort = () => reject(tx.error || new Error('Gravação cancelada.'));
      });
    } catch (err) {
      // O iPhone derruba a conexão quando o app fica em segundo plano: reabre uma vez.
      dbPromise = null;
      if (attempt >= 1) throw err;
    }
  }
}

/** Valor guardado na chave, ou null. */
export async function getItem(key) {
  if (await storageMode() === 'localstorage') {
    const raw = globalThis.localStorage.getItem(LS_PREFIX + key);
    return raw === null ? null : JSON.parse(raw);
  }
  const value = await run('readonly', (store) => store.get(key));
  return value === undefined ? null : value;
}

/** Grava o valor (objeto simples, sem funções). Dá erro se o aparelho recusar. */
export async function setItem(key, value) {
  if (await storageMode() === 'localstorage') {
    globalThis.localStorage.setItem(LS_PREFIX + key, JSON.stringify(value));
    return;
  }
  await run('readwrite', (store) => store.put(value, key));
  setMark();
}

export async function removeItem(key) {
  if (await storageMode() === 'localstorage') {
    globalThis.localStorage.removeItem(LS_PREFIX + key);
    return;
  }
  await run('readwrite', (store) => store.delete(key));
}

/** Espaço usado e proteção contra limpeza. Campos ficam null quando o navegador não informa. */
export async function storageInfo() {
  const s = globalThis.navigator?.storage;
  let usage = null;
  let persisted = null;
  try {
    if (s?.estimate) usage = (await s.estimate()).usage ?? null;
  } catch {
    usage = null;
  }
  try {
    if (s?.persisted) persisted = await s.persisted();
  } catch {
    persisted = null;
  }
  return { usage, persisted };
}
