import { readFile, stat } from 'node:fs/promises';
import { join, normalize, extname, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateMember } from './validation.js';
import { createMembersRepo, DuplicateError } from './members.js';
import {
  hashPassword, verifyPassword, newToken, sha256, passwordProblem, RateLimiter,
} from './security.js';
import { STATUTS, ROLES, formatPhone, ageFrom } from '../public/js/schema.js';

const PUBLIC_DIR = fileURLToPath(new URL('../public/', import.meta.url));
const SESSION_TTL = 8 * 3600 * 1000;
const COOKIE = 'ahl_sid';
const MAX_BODY = 1_000_000;

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json', '.svg': 'image/svg+xml', '.png': 'image/png',
  '.ico': 'image/x-icon', '.woff2': 'font/woff2', '.txt': 'text/plain; charset=utf-8',
};

const DUP_LABEL = {
  telephone: 'Ce numéro de téléphone est déjà enregistré.',
  carte_electeur: 'Ce numéro de carte d’électeur est déjà enregistré.',
  cni: 'Ce numéro de CNI est déjà enregistré.',
};

class HttpError extends Error {
  constructor(status, message, extra) { super(message); this.status = status; this.extra = extra; }
}

const ROLE_RANK = { lecteur: 1, editeur: 2, admin: 3 };

export function createApp({ db, secureCookies = false, trustProxy = false, log = console }) {
  const members = createMembersRepo(db);
  const loginLimiter = new RateLimiter({ windowMs: 15 * 60 * 1000, max: 5 });
  const loginIpLimiter = new RateLimiter({ windowMs: 15 * 60 * 1000, max: 30 });
  const publicLimiter = new RateLimiter({ windowMs: 60 * 60 * 1000, max: 40 });

  const audit = (user, action, entity, entityId, details, ip) => {
    db.prepare('INSERT INTO audit (user_id, user_nom, action, entity, entity_id, details, ip) VALUES (?,?,?,?,?,?,?)')
      .run(user?.id ?? null, user?.nom ?? 'Formulaire public', action, entity ?? null, entityId ?? null,
        details ? JSON.stringify(details) : null, ip ?? null);
  };

  // ---------- Utilitaires HTTP ----------
  const clientIp = (req) => (trustProxy && req.headers['x-forwarded-for']
    ? String(req.headers['x-forwarded-for']).split(',')[0].trim()
    : req.socket.remoteAddress) || 'unknown';

  const isSecure = (req) => secureCookies || (trustProxy && req.headers['x-forwarded-proto'] === 'https');

  function securityHeaders(res) {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Referrer-Policy', 'same-origin');
    res.setHeader('Permissions-Policy', 'camera=(self), geolocation=(), microphone=()');
    res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
    res.setHeader('Content-Security-Policy', [
      "default-src 'self'", "script-src 'self'", "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob:", "font-src 'self'", "connect-src 'self'",
      "manifest-src 'self'", "worker-src 'self'", "frame-ancestors 'none'",
      "base-uri 'self'", "form-action 'self'", "object-src 'none'",
    ].join('; '));
  }

  function json(res, status, body) {
    const data = JSON.stringify(body);
    res.writeHead(status, {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      'Content-Length': Buffer.byteLength(data),
    });
    res.end(data);
  }

  async function readJson(req) {
    const type = req.headers['content-type'] || '';
    if (!type.startsWith('application/json')) throw new HttpError(415, 'Format JSON attendu.');
    let size = 0;
    const chunks = [];
    for await (const c of req) {
      size += c.length;
      if (size > MAX_BODY) throw new HttpError(413, 'Requête trop volumineuse.');
      chunks.push(c);
    }
    try { return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}'); }
    catch { throw new HttpError(400, 'JSON invalide.'); }
  }

  const cookies = (req) => Object.fromEntries((req.headers.cookie || '').split(';')
    .map((c) => c.trim().split('=')).filter(([k]) => k).map(([k, ...v]) => [k, decodeURIComponent(v.join('='))]));

  function setSessionCookie(req, res, token, maxAgeSec) {
    const parts = [`${COOKIE}=${token}`, 'Path=/', 'HttpOnly', 'SameSite=Strict', `Max-Age=${maxAgeSec}`];
    if (isSecure(req)) parts.push('Secure');
    res.setHeader('Set-Cookie', parts.join('; '));
  }

  // Protection CSRF : cookie SameSite=Strict + en-tête personnalisé + contrôle d'origine.
  function checkCsrf(req) {
    if (req.headers['x-requested-with'] !== 'fetch') throw new HttpError(403, 'Requête refusée.');
    const origin = req.headers.origin;
    if (origin) {
      const host = req.headers['x-forwarded-host'] && trustProxy ? req.headers['x-forwarded-host'] : req.headers.host;
      try {
        if (new URL(origin).host !== host) throw new Error();
      } catch { throw new HttpError(403, 'Origine refusée.'); }
    }
  }

  function currentUser(req) {
    const token = cookies(req)[COOKIE];
    if (!token) return null;
    const row = db.prepare(`SELECT s.token_hash, s.expires_at, u.id, u.nom, u.email, u.role, u.actif, u.must_change_password
      FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token_hash = ?`).get(sha256(token));
    if (!row || row.expires_at < Date.now() || !row.actif) return null;
    // Expiration glissante.
    const exp = Date.now() + SESSION_TTL;
    if (row.expires_at - Date.now() < SESSION_TTL / 2) {
      db.prepare('UPDATE sessions SET expires_at = ? WHERE token_hash = ?').run(exp, row.token_hash);
    }
    return { id: row.id, nom: row.nom, email: row.email, role: row.role, must_change_password: Boolean(row.must_change_password), tokenHash: row.token_hash };
  }

  function requireUser(req, minRole = 'lecteur') {
    const user = currentUser(req);
    if (!user) throw new HttpError(401, 'Authentification requise.');
    if (user.must_change_password && !req.allowPasswordChange) {
      throw new HttpError(403, 'Vous devez changer votre mot de passe.', { code: 'PASSWORD_CHANGE_REQUIRED' });
    }
    if (ROLE_RANK[user.role] < ROLE_RANK[minRole]) throw new HttpError(403, 'Droits insuffisants.');
    return user;
  }

  const idParam = (s) => {
    const id = Number.parseInt(s, 10);
    if (!Number.isInteger(id) || id <= 0) throw new HttpError(404, 'Introuvable.');
    return id;
  };
  const idList = (v) => {
    if (!Array.isArray(v) || !v.length || v.length > 500) throw new HttpError(400, 'Sélection invalide.');
    return v.map((x) => idParam(x));
  };

  // ---------- Routes ----------
  const routes = [];
  const route = (method, path, handler) => {
    const keys = [];
    const re = new RegExp('^' + path.replace(/:(\w+)/g, (_, k) => { keys.push(k); return '([^/]+)'; }) + '$');
    routes.push({ method, re, keys, handler });
  };

  route('GET', '/api/health', (req, res) => json(res, 200, { ok: true, time: new Date().toISOString() }));

  // Inscription publique depuis la PWA.
  route('POST', '/api/inscriptions', async (req, res, { ip }) => {
    checkCsrf(req);
    const wait = publicLimiter.blocked(ip);
    if (wait) throw new HttpError(429, 'Trop d’inscriptions depuis cet appareil. Réessayez plus tard.', { retry_after: wait });
    const body = await readJson(req);
    if (body.website) return json(res, 201, { ok: true }); // pot de miel anti-robots
    const { data, errors } = validateMember(body);
    if (errors) return json(res, 422, { error: 'Certains champs sont invalides.', fields: errors });
    publicLimiter.hit(ip);
    try {
      const m = members.create(data, { source: body.offline ? 'hors-ligne' : 'formulaire' });
      audit(null, 'inscription', 'member', m.id, { matricule: m.matricule }, ip);
      json(res, 201, { ok: true, matricule: m.matricule, prenom: m.prenom, nom: m.nom, commune: m.commune, region: m.region });
    } catch (e) {
      if (e instanceof DuplicateError) {
        return json(res, 409, { error: DUP_LABEL[e.field], fields: { [e.field]: DUP_LABEL[e.field] }, duplicate: e.field });
      }
      throw e;
    }
  });

  // ----- Authentification -----
  route('POST', '/api/auth/login', async (req, res, { ip }) => {
    checkCsrf(req);
    const body = await readJson(req);
    const email = String(body.email || '').trim().toLowerCase().slice(0, 120);
    const password = String(body.password || '').slice(0, 200);
    const key = `${ip}|${email}`;
    const wait = Math.max(loginLimiter.blocked(key), loginIpLimiter.blocked(ip));
    if (wait) {
      throw new HttpError(429, `Trop de tentatives. Réessayez dans ${Math.ceil(wait / 60)} min.`, { retry_after: wait });
    }
    const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
    const ok = await verifyPassword(password, user?.password_hash);
    if (!ok || !user?.actif) {
      loginLimiter.hit(key);
      loginIpLimiter.hit(ip);
      audit(null, 'connexion_echouee', 'user', user?.id, { email }, ip);
      throw new HttpError(401, 'Identifiants incorrects.');
    }
    loginLimiter.reset(key);
    const token = newToken();
    const now = Date.now();
    db.prepare('DELETE FROM sessions WHERE expires_at < ?').run(now);
    db.prepare('INSERT INTO sessions (token_hash, user_id, created_at, expires_at, ip, user_agent) VALUES (?,?,?,?,?,?)')
      .run(sha256(token), user.id, now, now + SESSION_TTL, ip, String(req.headers['user-agent'] || '').slice(0, 200));
    db.prepare(`UPDATE users SET last_login = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ?`).run(user.id);
    audit(user, 'connexion', 'user', user.id, null, ip);
    setSessionCookie(req, res, token, SESSION_TTL / 1000);
    json(res, 200, { user: { id: user.id, nom: user.nom, email: user.email, role: user.role, must_change_password: Boolean(user.must_change_password) } });
  });

  route('POST', '/api/auth/logout', (req, res) => {
    checkCsrf(req);
    const user = currentUser(req);
    if (user) db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(user.tokenHash);
    setSessionCookie(req, res, '', 0);
    json(res, 200, { ok: true });
  });

  route('GET', '/api/auth/me', (req, res) => {
    const user = currentUser(req);
    if (!user) throw new HttpError(401, 'Authentification requise.');
    const { tokenHash, ...pub } = user;
    json(res, 200, { user: pub });
  });

  route('POST', '/api/auth/password', async (req, res, { ip }) => {
    checkCsrf(req);
    req.allowPasswordChange = true;
    const user = requireUser(req);
    const body = await readJson(req);
    const row = db.prepare('SELECT password_hash FROM users WHERE id = ?').get(user.id);
    if (!(await verifyPassword(String(body.current || ''), row.password_hash))) {
      throw new HttpError(400, 'Mot de passe actuel incorrect.', { fields: { current: 'Mot de passe actuel incorrect.' } });
    }
    const problem = passwordProblem(body.next);
    if (problem) throw new HttpError(422, problem, { fields: { next: problem } });
    if (body.next === body.current) throw new HttpError(422, 'Le nouveau mot de passe doit être différent.');
    db.prepare('UPDATE users SET password_hash = ?, must_change_password = 0 WHERE id = ?').run(await hashPassword(body.next), user.id);
    // Invalide les autres sessions.
    db.prepare('DELETE FROM sessions WHERE user_id = ? AND token_hash != ?').run(user.id, user.tokenHash);
    audit(user, 'mot_de_passe_modifie', 'user', user.id, null, ip);
    json(res, 200, { ok: true });
  });

  // ----- Membres -----
  route('GET', '/api/members', (req, res, { query }) => {
    requireUser(req);
    json(res, 200, members.list(query));
  });

  route('GET', '/api/members/export.csv', (req, res, { query, ip }) => {
    const user = requireUser(req, 'editeur');
    const cols = [
      ['matricule', 'Matricule'], ['prenom', 'Prénom'], ['nom', 'Nom'], ['sexe', 'Sexe'],
      ['date_naissance', 'Date de naissance'], ['age', 'Âge'], ['lieu_naissance', 'Lieu de naissance'],
      ['nationalite', 'Nationalité'], ['cni', 'CNI'], ['carte_electeur', 'Carte électeur'],
      ['lieu_vote', 'Lieu de vote'], ['bureau_vote', 'Bureau de vote'], ['telephone', 'Téléphone'],
      ['telephone2', 'Téléphone 2'], ['whatsapp', 'WhatsApp'], ['email', 'E-mail'], ['region', 'Région'],
      ['departement', 'Département'], ['commune', 'Commune'], ['quartier', 'Quartier / Village'],
      ['adresse', 'Adresse'], ['situation_matrimoniale', 'Situation matrimoniale'], ['nb_enfants', 'Enfants'],
      ['profession', 'Profession'], ['niveau_instruction', 'Niveau d’instruction'], ['section', 'Section / Dahira'],
      ['fonction', 'Fonction'], ['date_adhesion', 'Date d’adhésion'], ['groupe_sanguin', 'Groupe sanguin'],
      ['urgence_nom', 'Contact d’urgence'], ['urgence_tel', 'Tél. urgence'], ['statut', 'Statut'],
      ['source', 'Source'], ['created_at', 'Inscrit le'],
    ];
    // Neutralise l'injection de formules dans les tableurs.
    const cell = (v) => {
      let s = v == null ? '' : String(v);
      if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
      return /[";\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const statutLabel = Object.fromEntries(STATUTS.map((s) => [s.value, s.label]));
    res.writeHead(200, {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="membres-ahloulaahi-${new Date().toISOString().slice(0, 10)}.csv"`,
      'Cache-Control': 'no-store',
    });
    res.write('﻿' + cols.map(([, l]) => cell(l)).join(';') + '\r\n');
    let n = 0;
    for (const m of members.iterate(query)) {
      const row = {
        ...m, age: ageFrom(m.date_naissance), whatsapp: m.whatsapp ? 'Oui' : 'Non',
        telephone: formatPhone(m.telephone), telephone2: formatPhone(m.telephone2), urgence_tel: formatPhone(m.urgence_tel),
        statut: statutLabel[m.statut] || m.statut, sexe: m.sexe === 'F' ? 'Femme' : 'Homme',
      };
      res.write(cols.map(([k]) => cell(row[k])).join(';') + '\r\n');
      n++;
    }
    res.end();
    audit(user, 'export_csv', 'member', null, { lignes: n, filtres: query }, ip);
  });

  route('GET', '/api/members/:id', (req, res, { params }) => {
    requireUser(req);
    const m = members.get(idParam(params.id));
    if (!m) throw new HttpError(404, 'Membre introuvable.');
    json(res, 200, m);
  });

  const saveMember = async (req, res, { params, ip }) => {
    checkCsrf(req);
    const user = requireUser(req, 'editeur');
    const body = await readJson(req);
    const { data, errors } = validateMember(body, { admin: true });
    if (errors) return json(res, 422, { error: 'Certains champs sont invalides.', fields: errors });
    try {
      if (params.id) {
        const id = idParam(params.id);
        if (!('photo' in body)) data.photo = undefined;
        const m = members.update(id, data);
        if (!m) throw new HttpError(404, 'Membre introuvable.');
        audit(user, 'modification', 'member', id, { matricule: m.matricule }, ip);
        return json(res, 200, m);
      }
      const m = members.create(data, { source: 'admin', userId: user.id });
      audit(user, 'creation', 'member', m.id, { matricule: m.matricule }, ip);
      json(res, 201, m);
    } catch (e) {
      if (e instanceof DuplicateError) {
        return json(res, 409, { error: DUP_LABEL[e.field], fields: { [e.field]: DUP_LABEL[e.field] } });
      }
      throw e;
    }
  };
  route('POST', '/api/members', saveMember);
  route('PUT', '/api/members/:id', saveMember);

  route('DELETE', '/api/members/:id', (req, res, { params, ip }) => {
    checkCsrf(req);
    const user = requireUser(req, 'editeur');
    const id = idParam(params.id);
    const m = members.get(id);
    if (!m || !members.remove(id)) throw new HttpError(404, 'Membre introuvable.');
    audit(user, 'suppression', 'member', id, { matricule: m.matricule, nom: `${m.prenom} ${m.nom}` }, ip);
    json(res, 200, { ok: true });
  });

  route('POST', '/api/members/bulk', async (req, res, { ip }) => {
    checkCsrf(req);
    const user = requireUser(req, 'editeur');
    const body = await readJson(req);
    const ids = idList(body.ids);
    let n;
    if (body.action === 'delete') {
      n = members.removeMany(ids);
    } else if (body.action === 'status' && STATUTS.some((s) => s.value === body.statut)) {
      n = members.setStatus(ids, body.statut);
    } else throw new HttpError(400, 'Action inconnue.');
    audit(user, body.action === 'delete' ? 'suppression_groupee' : 'statut_groupe', 'member', null, { n, statut: body.statut }, ip);
    json(res, 200, { ok: true, n });
  });

  route('GET', '/api/stats', (req, res, { query }) => {
    requireUser(req);
    json(res, 200, members.stats(query));
  });

  route('GET', '/api/audit', (req, res, { query }) => {
    requireUser(req, 'admin');
    const limit = Math.min(Number.parseInt(query.limit, 10) || 50, 200);
    const page = Math.max(Number.parseInt(query.page, 10) || 1, 1);
    const total = db.prepare('SELECT COUNT(*) n FROM audit').get().n;
    const items = db.prepare('SELECT * FROM audit ORDER BY id DESC LIMIT ? OFFSET ?').all(limit, (page - 1) * limit)
      .map((r) => ({ ...r, details: r.details ? JSON.parse(r.details) : null }));
    json(res, 200, { items, total, page, pages: Math.max(1, Math.ceil(total / limit)) });
  });

  // ----- Utilisateurs (administrateurs) -----
  const publicUser = (u) => ({ id: u.id, nom: u.nom, email: u.email, role: u.role, actif: Boolean(u.actif), last_login: u.last_login, created_at: u.created_at, must_change_password: Boolean(u.must_change_password) });

  route('GET', '/api/users', (req, res) => {
    requireUser(req, 'admin');
    json(res, 200, db.prepare('SELECT * FROM users ORDER BY nom').all().map(publicUser));
  });

  const validateUser = (b, creating) => {
    const fields = {};
    const nom = String(b.nom || '').trim().slice(0, 80);
    const email = String(b.email || '').trim().toLowerCase().slice(0, 120);
    if (!nom) fields.nom = 'Le nom est obligatoire.';
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) fields.email = 'E-mail invalide.';
    if (!ROLES.some((r) => r.value === b.role)) fields.role = 'Rôle invalide.';
    if (creating || b.password) {
      const p = passwordProblem(b.password);
      if (p) fields.password = p;
    }
    if (Object.keys(fields).length) throw new HttpError(422, 'Certains champs sont invalides.', { fields });
    return { nom, email, role: b.role, actif: b.actif === false ? 0 : 1 };
  };

  route('POST', '/api/users', async (req, res, { ip }) => {
    checkCsrf(req);
    const admin = requireUser(req, 'admin');
    const b = await readJson(req);
    const u = validateUser(b, true);
    if (db.prepare('SELECT 1 FROM users WHERE email = ?').get(u.email)) {
      throw new HttpError(409, 'Cet e-mail est déjà utilisé.', { fields: { email: 'Cet e-mail est déjà utilisé.' } });
    }
    const info = db.prepare('INSERT INTO users (nom, email, password_hash, role, actif, must_change_password) VALUES (?,?,?,?,?,1)')
      .run(u.nom, u.email, await hashPassword(b.password), u.role, u.actif);
    audit(admin, 'utilisateur_cree', 'user', Number(info.lastInsertRowid), { email: u.email, role: u.role }, ip);
    json(res, 201, publicUser(db.prepare('SELECT * FROM users WHERE id = ?').get(info.lastInsertRowid)));
  });

  route('PUT', '/api/users/:id', async (req, res, { params, ip }) => {
    checkCsrf(req);
    const admin = requireUser(req, 'admin');
    const id = idParam(params.id);
    const b = await readJson(req);
    const u = validateUser(b, false);
    const cur = db.prepare('SELECT * FROM users WHERE id = ?').get(id);
    if (!cur) throw new HttpError(404, 'Utilisateur introuvable.');
    if (id === admin.id && (u.role !== 'admin' || !u.actif)) throw new HttpError(400, 'Vous ne pouvez pas retirer vos propres droits.');
    if (db.prepare('SELECT 1 FROM users WHERE email = ? AND id != ?').get(u.email, id)) {
      throw new HttpError(409, 'Cet e-mail est déjà utilisé.', { fields: { email: 'Cet e-mail est déjà utilisé.' } });
    }
    db.prepare('UPDATE users SET nom = ?, email = ?, role = ?, actif = ? WHERE id = ?').run(u.nom, u.email, u.role, u.actif, id);
    if (b.password) {
      db.prepare('UPDATE users SET password_hash = ?, must_change_password = 1 WHERE id = ?').run(await hashPassword(b.password), id);
      db.prepare('DELETE FROM sessions WHERE user_id = ?').run(id);
    }
    if (!u.actif) db.prepare('DELETE FROM sessions WHERE user_id = ?').run(id);
    audit(admin, 'utilisateur_modifie', 'user', id, { email: u.email, role: u.role, actif: u.actif }, ip);
    json(res, 200, publicUser(db.prepare('SELECT * FROM users WHERE id = ?').get(id)));
  });

  route('DELETE', '/api/users/:id', (req, res, { params, ip }) => {
    checkCsrf(req);
    const admin = requireUser(req, 'admin');
    const id = idParam(params.id);
    if (id === admin.id) throw new HttpError(400, 'Vous ne pouvez pas supprimer votre propre compte.');
    const cur = db.prepare('SELECT * FROM users WHERE id = ?').get(id);
    if (!cur) throw new HttpError(404, 'Utilisateur introuvable.');
    db.prepare('DELETE FROM users WHERE id = ?').run(id);
    audit(admin, 'utilisateur_supprime', 'user', id, { email: cur.email }, ip);
    json(res, 200, { ok: true });
  });

  // ---------- Fichiers statiques ----------
  async function serveStatic(req, res, pathname) {
    if (req.method !== 'GET' && req.method !== 'HEAD') return false;
    let p = decodeURIComponent(pathname);
    if (p === '/admin' || p === '/admin/') p = '/admin/index.html';
    if (p.endsWith('/')) p += 'index.html';
    const file = normalize(join(PUBLIC_DIR, p));
    if (!file.startsWith(PUBLIC_DIR) || file.includes(`${sep}.`)) return false;
    let st;
    try { st = await stat(file); } catch { return false; }
    if (!st.isFile()) return false;
    const ext = extname(file);
    const noCache = ext === '.html' || p === '/sw.js' || ext === '.webmanifest';
    res.writeHead(200, {
      'Content-Type': MIME[ext] || 'application/octet-stream',
      'Content-Length': st.size,
      'Cache-Control': noCache ? 'no-cache' : 'public, max-age=3600',
      ...(p === '/sw.js' ? { 'Service-Worker-Allowed': '/' } : {}),
    });
    if (req.method === 'HEAD') return res.end(), true;
    res.end(await readFile(file));
    return true;
  }

  // ---------- Gestionnaire principal ----------
  return async function handler(req, res) {
    securityHeaders(res);
    const url = new URL(req.url, 'http://localhost');
    const ip = clientIp(req);
    if (isSecure(req)) res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
    try {
      if (url.pathname.startsWith('/api/')) {
        const query = Object.fromEntries(url.searchParams);
        let methodMismatch = false;
        for (const r of routes) {
          const m = r.re.exec(url.pathname);
          if (!m) continue;
          if (r.method !== req.method) { methodMismatch = true; continue; }
          const params = Object.fromEntries(r.keys.map((k, i) => [k, m[i + 1]]));
          return await r.handler(req, res, { params, query, ip });
        }
        throw new HttpError(methodMismatch ? 405 : 404, methodMismatch ? 'Méthode non autorisée.' : 'Route inconnue.');
      }
      if (await serveStatic(req, res, url.pathname)) return;
      // Repli SPA
      const fallback = url.pathname.startsWith('/admin') ? '/admin/index.html' : '/index.html';
      if (req.method === 'GET' && (req.headers.accept || '').includes('text/html') && await serveStatic(req, res, fallback)) return;
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Introuvable');
    } catch (e) {
      if (res.headersSent) { res.end(); return; }
      if (e instanceof HttpError) return json(res, e.status, { error: e.message, ...e.extra });
      log.error(e);
      json(res, 500, { error: 'Erreur interne du serveur.' });
    }
  };
}
