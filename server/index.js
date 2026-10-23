import { createServer } from 'node:http';
import { randomBytes } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { openDb } from './db.js';
import { createApp } from './app.js';
import { hashPassword } from './security.js';

const PORT = Number(process.env.PORT) || 3000;
const HOST = process.env.HOST || '0.0.0.0';
const DB_FILE = process.env.DB_FILE || fileURLToPath(new URL('../data/ahloulaahi.db', import.meta.url));

const db = openDb(DB_FILE);

// Premier démarrage : création du compte administrateur.
if (!db.prepare('SELECT COUNT(*) n FROM users').get().n) {
  const email = (process.env.ADMIN_EMAIL || 'admin@ahloulaahi.sn').toLowerCase();
  const password = process.env.ADMIN_PASSWORD || `Ahl-${randomBytes(9).toString('base64url')}`;
  db.prepare('INSERT INTO users (nom, email, password_hash, role, must_change_password) VALUES (?,?,?,?,1)')
    .run('Administrateur', email, await hashPassword(password), 'admin');
  console.log('\n  Compte administrateur créé');
  console.log(`  E-mail       : ${email}`);
  if (!process.env.ADMIN_PASSWORD) console.log(`  Mot de passe : ${password}`);
  console.log('  (changement de mot de passe exigé à la première connexion)\n');
}

const handler = createApp({
  db,
  secureCookies: process.env.COOKIE_SECURE === '1',
  trustProxy: process.env.TRUST_PROXY === '1',
});

createServer(handler).listen(PORT, HOST, () => {
  console.log(`Ahlou Lahi — http://localhost:${PORT}  (admin : http://localhost:${PORT}/admin)`);
});
