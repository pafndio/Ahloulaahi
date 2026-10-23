/* Service worker — Ahlou Lahi */
const VERSION = 'ahl-v1';
const SHELL = [
  '/', '/index.html', '/manifest.webmanifest',
  '/css/base.css', '/css/card.css', '/css/form.css',
  '/js/form.js', '/js/ui.js', '/js/geo.js', '/js/schema.js', '/js/member-fields.js', '/js/outbox.js', '/js/pwa.js', '/js/card.js',
  '/data/senegal.json',
  '/fonts/jakarta-latin.woff2', '/fonts/jakarta-latin-ext.woff2',
  '/icons/logo.svg', '/icons/icon-192.png', '/icons/icon-512.png',
  '/admin/', '/css/admin.css', '/vendor/chart.umd.js', '/data/regions-paths.json',
  '/js/admin/app.js', '/js/admin/api.js', '/js/admin/dashboard.js', '/js/admin/members.js',
  '/js/admin/users.js', '/js/admin/audit.js', '/js/admin/account.js', '/js/admin/map.js', '/js/admin/widgets.js',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    for (const k of await caches.keys()) if (k !== VERSION) await caches.delete(k);
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  const url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== location.origin || url.pathname.startsWith('/api/')) return;

  // Pages : réseau d'abord, cache en secours (fonctionne hors-ligne).
  if (req.mode === 'navigate') {
    e.respondWith((async () => {
      try {
        const res = await fetch(req);
        const c = await caches.open(VERSION);
        c.put(url.pathname.startsWith('/admin') ? '/admin/' : '/', res.clone());
        return res;
      } catch {
        return (await caches.match(url.pathname.startsWith('/admin') ? '/admin/' : '/')) || Response.error();
      }
    })());
    return;
  }

  // Ressources : cache puis mise à jour en arrière-plan.
  e.respondWith((async () => {
    const cached = await caches.match(req);
    const network = fetch(req).then(async (res) => {
      if (res.ok) (await caches.open(VERSION)).put(req, res.clone());
      return res;
    }).catch(() => cached);
    return cached || network;
  })());
});

// ---- Synchronisation des inscriptions hors-ligne ----
function idb(mode, fn) {
  return new Promise((resolve, reject) => {
    const open = indexedDB.open('ahl-outbox', 1);
    open.onupgradeneeded = () => open.result.createObjectStore('pending', { keyPath: 'id', autoIncrement: true });
    open.onerror = () => reject(open.error);
    open.onsuccess = () => {
      const db = open.result;
      const t = db.transaction('pending', mode);
      const r = fn(t.objectStore('pending'));
      t.oncomplete = () => { db.close(); resolve(r?.result); };
      t.onerror = () => { db.close(); reject(t.error); };
    };
  });
}

async function flush() {
  const items = (await idb('readonly', (s) => s.getAll())) || [];
  let sent = 0;
  for (const item of items) {
    if (item.error) continue;
    const res = await fetch('/api/inscriptions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'fetch' },
      body: JSON.stringify({ ...item.payload, offline: true }),
    });
    if (res.ok) { await idb('readwrite', (s) => s.delete(item.id)); sent++; }
    else if (res.status >= 400 && res.status < 500 && res.status !== 429) {
      const body = await res.json().catch(() => ({}));
      await idb('readwrite', (s) => s.put({ ...item, error: body.error || 'Inscription refusée.' }));
    } else throw new Error('retry');
  }
  if (sent) {
    for (const c of await self.clients.matchAll()) c.postMessage({ type: 'outbox-synced', sent });
  }
}

self.addEventListener('sync', (e) => {
  if (e.tag !== 'ahl-outbox') return;
  e.waitUntil(self.navigator?.locks ? self.navigator.locks.request('ahl-outbox', flush) : flush());
});
