import '../server/node-check.js';
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { existsSync, readFileSync } from 'node:fs';
import { openDb } from '../server/db.js';
import { createApp } from '../server/app.js';
import { hashPassword } from '../server/security.js';

let server, base, db;
const ADMIN = { email: 'admin@test.sn', password: 'Sup3r-Secret!' };

before(async () => {
  db = openDb(':memory:');
  db.prepare('INSERT INTO users (nom, email, password_hash, role) VALUES (?,?,?,?)')
    .run('Admin Test', ADMIN.email, await hashPassword(ADMIN.password), 'admin');
  server = createServer(createApp({ db, log: { error() {} } }));
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${server.address().port}`;
});
after(() => server.close());

const H = { 'Content-Type': 'application/json', 'X-Requested-With': 'fetch' };
const call = (path, { method = 'GET', body, cookie, headers = {} } = {}) => fetch(base + path, {
  method,
  headers: { ...H, ...(cookie ? { Cookie: cookie } : {}), ...headers },
  body: body ? JSON.stringify(body) : undefined,
});

const member = (over = {}) => ({
  prenom: 'Awa', nom: 'Diop', sexe: 'F', date_naissance: '1990-05-12',
  telephone: '77 123 45 67', region: 'Thiès', departement: 'Mbour', commune: 'Saly Portudal',
  carte_electeur: '123456789', consentement: true, ...over,
});

async function login() {
  const r = await call('/api/auth/login', { method: 'POST', body: ADMIN });
  assert.equal(r.status, 200);
  return r.headers.get('set-cookie').split(';')[0];
}

test('les données géographiques couvrent 14 régions, 46 départements, 553 communes', () => {
  const g = JSON.parse(readFileSync(new URL('../public/data/senegal.json', import.meta.url)));
  const deps = g.regions.flatMap((r) => r.departements);
  assert.equal(g.regions.length, 14);
  assert.equal(deps.length, 46);
  assert.equal(deps.reduce((n, d) => n + d.communes.length, 0), 553);
  const paths = JSON.parse(readFileSync(new URL('../public/data/regions-paths.json', import.meta.url)));
  for (const r of g.regions) assert.ok(paths[r.nom], `tracé manquant : ${r.nom}`);
});

test('tous les fichiers précachés par le service worker existent', () => {
  const sw = readFileSync(new URL('../public/sw.js', import.meta.url), 'utf8');
  const list = [...sw.match(/const SHELL = \[([\s\S]*?)\];/)[1].matchAll(/'([^']+)'/g)].map((m) => m[1]);
  for (const p of list) {
    const file = p.endsWith('/') ? `${p}index.html` : p;
    assert.ok(existsSync(new URL(`../public${file}`, import.meta.url)), `absent : ${p}`);
  }
});

test('inscription publique valide puis doublons refusés', async () => {
  let r = await call('/api/inscriptions', { method: 'POST', body: member() });
  assert.equal(r.status, 201);
  const body = await r.json();
  assert.match(body.matricule, /^AHL-\d{4}-\d{6}$/);

  r = await call('/api/inscriptions', { method: 'POST', body: member({ carte_electeur: '999999999' }) });
  assert.equal(r.status, 409);
  assert.equal((await r.json()).duplicate, 'telephone');

  r = await call('/api/inscriptions', { method: 'POST', body: member({ telephone: '781112233' }) });
  assert.equal(r.status, 409);
  assert.equal((await r.json()).duplicate, 'carte_electeur');
});

test('validation : cascade géographique, téléphone, consentement', async () => {
  const r = await call('/api/inscriptions', {
    method: 'POST',
    body: member({ telephone: '12345', departement: 'Dakar', consentement: false, carte_electeur: '' }),
  });
  assert.equal(r.status, 422);
  const { fields } = await r.json();
  assert.ok(fields.telephone && fields.departement && fields.consentement && fields.carte_electeur);
});

test('sans en-tête anti-CSRF ou depuis une autre origine : refusé', async () => {
  let r = await fetch(`${base}/api/inscriptions`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
  assert.equal(r.status, 403);
  r = await call('/api/inscriptions', { method: 'POST', body: member(), headers: { Origin: 'https://evil.example' } });
  assert.equal(r.status, 403);
});

test('les routes admin exigent une session', async () => {
  for (const p of ['/api/members', '/api/stats', '/api/members/export.csv', '/api/users']) {
    assert.equal((await call(p)).status, 401, p);
  }
});

test('connexion : mauvais mot de passe puis verrouillage', async () => {
  const bad = { email: 'lock@test.sn', password: 'nope' };
  for (let i = 0; i < 5; i++) assert.equal((await call('/api/auth/login', { method: 'POST', body: bad })).status, 401);
  assert.equal((await call('/api/auth/login', { method: 'POST', body: bad })).status, 429);
});

test('cookie de session HttpOnly et SameSite=Strict', async () => {
  const r = await call('/api/auth/login', { method: 'POST', body: ADMIN });
  const c = r.headers.get('set-cookie');
  assert.match(c, /HttpOnly/);
  assert.match(c, /SameSite=Strict/);
});

test('CRUD membre, recherche, filtres, statistiques et export', async () => {
  const cookie = await login();
  let r = await call('/api/members', { method: 'POST', cookie, body: member({ prenom: 'Cheikh', nom: 'Mbaye', sexe: 'M', telephone: '76 555 44 33', carte_electeur: '555444333', region: 'Dakar', departement: 'Pikine', commune: 'Mbao', statut: 'actif' }) });
  assert.equal(r.status, 201);
  const m = await r.json();
  assert.equal(m.source, 'admin');

  r = await call('/api/members?q=cheikh%20mbao', { cookie });
  let list = await r.json();
  assert.equal(list.total, 1);
  r = await call(`/api/members?q=${m.matricule}`, { cookie });
  assert.equal((await r.json()).total, 1);
  r = await call('/api/members?q=cheïkh', { cookie }); // insensible aux accents
  assert.equal((await r.json()).total, 1);
  r = await call('/api/members?region=Dakar&sexe=M&carte=oui&age_min=30&age_max=40', { cookie });
  assert.equal((await r.json()).total, 1);
  r = await call('/api/members?region=Dakar&age_max=20', { cookie });
  assert.equal((await r.json()).total, 0);

  r = await call(`/api/members/${m.id}`, { method: 'PUT', cookie, body: { ...member({ prenom: 'Cheikh', nom: 'Mbaye Fall', sexe: 'M', telephone: '765554433', carte_electeur: '555444333', region: 'Dakar', departement: 'Pikine', commune: 'Mbao' }), statut: 'suspendu' } });
  assert.equal(r.status, 200);
  assert.equal((await r.json()).nom, 'Mbaye Fall');

  r = await call('/api/stats', { cookie });
  const s = await r.json();
  assert.equal(s.kpi.total, 2);
  assert.equal(s.monthly.length, 12);
  assert.ok(s.regions.find((x) => x.label === 'Dakar'));

  r = await call('/api/members/export.csv', { cookie });
  assert.equal(r.status, 200);
  const csv = await r.text();
  assert.match(csv, /Matricule;Prénom;Nom/);
  assert.match(csv, /Mbaye Fall/);

  r = await call('/api/members/bulk', { method: 'POST', cookie, body: { action: 'status', statut: 'actif', ids: [m.id] } });
  assert.equal((await r.json()).n, 1);

  r = await call(`/api/members/${m.id}`, { method: 'DELETE', cookie });
  assert.equal(r.status, 200);
  assert.equal((await call(`/api/members/${m.id}`, { cookie })).status, 404);

  const audit = await (await call('/api/audit', { cookie })).json();
  assert.ok(audit.items.some((a) => a.action === 'suppression'));
});

test('export CSV neutralise les formules', async () => {
  const cookie = await login();
  await call('/api/members', { method: 'POST', cookie, body: member({ prenom: '=HYPERLINK("x")', telephone: '701234567', carte_electeur: '777777777' }) });
  const csv = await (await call('/api/members/export.csv', { cookie })).text();
  assert.ok(csv.includes(`"'=HYPERLINK(""x"")"`));
});

test('rôle lecteur : lecture seule ; mot de passe à changer bloque l’accès', async () => {
  const cookie = await login();
  let r = await call('/api/users', { method: 'POST', cookie, body: { nom: 'Lecteur', email: 'lecteur@test.sn', role: 'lecteur', password: 'Lecteur-2026!' } });
  assert.equal(r.status, 201);
  r = await call('/api/auth/login', { method: 'POST', body: { email: 'lecteur@test.sn', password: 'Lecteur-2026!' } });
  const lc = r.headers.get('set-cookie').split(';')[0];
  assert.equal((await r.json()).user.must_change_password, true);
  assert.equal((await call('/api/members', { cookie: lc })).status, 403);
  r = await call('/api/auth/password', { method: 'POST', cookie: lc, body: { current: 'Lecteur-2026!', next: 'Nouveau-Secret-9' } });
  assert.equal(r.status, 200);
  assert.equal((await call('/api/members', { cookie: lc })).status, 200);
  assert.equal((await call('/api/members', { method: 'POST', cookie: lc, body: member() })).status, 403);
  assert.equal((await call('/api/members/export.csv', { cookie: lc })).status, 403);
});

test('fichiers statiques : en-têtes de sécurité et pas de traversée de répertoire', async () => {
  let r = await fetch(`${base}/`);
  assert.equal(r.status, 200);
  assert.match(r.headers.get('content-security-policy'), /script-src 'self'/);
  r = await fetch(`${base}/admin/`);
  assert.equal(r.status, 200);
  r = await fetch(`${base}/..%2f..%2fpackage.json`);
  assert.notEqual(r.status, 200);
});
