// File d'attente hors-ligne des inscriptions (IndexedDB).
// Le service worker (sw.js) partage la même base pour la synchronisation en arrière-plan.

const DB = 'ahl-outbox';
const STORE = 'pending';

function open() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE, { keyPath: 'id', autoIncrement: true });
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function run(mode, fn) {
  const db = await open();
  return new Promise((resolve, reject) => {
    const t = db.transaction(STORE, mode);
    const out = fn(t.objectStore(STORE));
    t.oncomplete = () => { db.close(); resolve(out?.result ?? out); };
    t.onerror = () => { db.close(); reject(t.error); };
  });
}

export const enqueue = (payload) => run('readwrite', (s) => s.add({ payload, created_at: new Date().toISOString(), error: null }));
export const list = () => run('readonly', (s) => s.getAll());
export const remove = (id) => run('readwrite', (s) => s.delete(id));
export const markError = (item, error) => run('readwrite', (s) => s.put({ ...item, error }));

// Envoie les inscriptions en attente. Retourne { sent, failed }.
export async function flush() {
  const work = async () => {
    const items = await list();
    let sent = 0, failed = 0;
    for (const item of items) {
      if (item.error) { failed++; continue; }
      let res;
      try {
        res = await fetch('/api/inscriptions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'fetch' },
          body: JSON.stringify({ ...item.payload, offline: true }),
        });
      } catch {
        break; // toujours hors-ligne
      }
      if (res.ok) { await remove(item.id); sent++; }
      else if (res.status >= 400 && res.status < 500 && res.status !== 429) {
        const body = await res.json().catch(() => ({}));
        await markError(item, body.error || 'Inscription refusée.');
        failed++;
      } else break;
    }
    return { sent, failed };
  };
  // Verrou partagé avec le service worker pour éviter les doubles envois.
  if (navigator.locks) return navigator.locks.request('ahl-outbox', work);
  return work();
}
