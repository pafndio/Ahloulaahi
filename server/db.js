import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

export function openDb(file) {
  if (file !== ':memory:') mkdirSync(dirname(file), { recursive: true });
  const db = new DatabaseSync(file);
  db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;
    PRAGMA busy_timeout = 5000;

    CREATE TABLE IF NOT EXISTS members (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      matricule TEXT UNIQUE,
      prenom TEXT NOT NULL,
      nom TEXT NOT NULL,
      sexe TEXT NOT NULL CHECK (sexe IN ('M','F')),
      date_naissance TEXT NOT NULL,
      lieu_naissance TEXT,
      nationalite TEXT,
      cni TEXT,
      carte_electeur TEXT,
      lieu_vote TEXT,
      bureau_vote TEXT,
      telephone TEXT NOT NULL,
      telephone2 TEXT,
      whatsapp INTEGER NOT NULL DEFAULT 0,
      email TEXT,
      region TEXT NOT NULL,
      departement TEXT NOT NULL,
      commune TEXT NOT NULL,
      quartier TEXT,
      adresse TEXT,
      situation_matrimoniale TEXT,
      nb_enfants INTEGER,
      profession TEXT,
      niveau_instruction TEXT,
      section TEXT,
      fonction TEXT,
      date_adhesion TEXT,
      groupe_sanguin TEXT,
      urgence_nom TEXT,
      urgence_tel TEXT,
      photo TEXT,
      notes TEXT,
      statut TEXT NOT NULL DEFAULT 'en_attente',
      source TEXT NOT NULL DEFAULT 'formulaire',
      consentement INTEGER NOT NULL DEFAULT 0,
      search_text TEXT NOT NULL DEFAULT '',
      created_by INTEGER,
      created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
      updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
    );
    CREATE UNIQUE INDEX IF NOT EXISTS ux_members_tel ON members(telephone);
    CREATE UNIQUE INDEX IF NOT EXISTS ux_members_carte ON members(carte_electeur) WHERE carte_electeur IS NOT NULL;
    CREATE UNIQUE INDEX IF NOT EXISTS ux_members_cni ON members(cni) WHERE cni IS NOT NULL;
    CREATE INDEX IF NOT EXISTS ix_members_geo ON members(region, departement, commune);
    CREATE INDEX IF NOT EXISTS ix_members_created ON members(created_at);
    CREATE INDEX IF NOT EXISTS ix_members_statut ON members(statut);

    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nom TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE COLLATE NOCASE,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL CHECK (role IN ('admin','editeur','lecteur')),
      actif INTEGER NOT NULL DEFAULT 1,
      must_change_password INTEGER NOT NULL DEFAULT 0,
      last_login TEXT,
      created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
    );

    CREATE TABLE IF NOT EXISTS sessions (
      token_hash TEXT PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      created_at INTEGER NOT NULL,
      expires_at INTEGER NOT NULL,
      ip TEXT,
      user_agent TEXT
    );

    CREATE TABLE IF NOT EXISTS audit (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER,
      user_nom TEXT,
      action TEXT NOT NULL,
      entity TEXT,
      entity_id INTEGER,
      details TEXT,
      ip TEXT,
      created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
    );
    CREATE INDEX IF NOT EXISTS ix_audit_created ON audit(created_at);
  `);
  return db;
}

// Exécute fn dans une transaction.
export function tx(db, fn) {
  db.exec('BEGIN');
  try {
    const r = fn();
    db.exec('COMMIT');
    return r;
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
}
