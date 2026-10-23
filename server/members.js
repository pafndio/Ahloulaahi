import { fold, ageFrom } from '../public/js/schema.js';

const COLUMNS = [
  'prenom', 'nom', 'sexe', 'date_naissance', 'lieu_naissance', 'nationalite', 'cni', 'carte_electeur',
  'lieu_vote', 'bureau_vote', 'telephone', 'telephone2', 'whatsapp', 'email', 'region', 'departement',
  'commune', 'quartier', 'adresse', 'situation_matrimoniale', 'nb_enfants', 'profession',
  'niveau_instruction', 'section', 'fonction', 'date_adhesion', 'groupe_sanguin', 'urgence_nom',
  'urgence_tel', 'photo', 'notes', 'statut', 'consentement', 'search_text',
];
const LIST_COLUMNS = `id, matricule, prenom, nom, sexe, date_naissance, carte_electeur, cni, telephone,
  whatsapp, region, departement, commune, quartier, profession, fonction, section, statut, source,
  created_at, updated_at, (photo IS NOT NULL) AS has_photo`;
const SORTS = {
  created_at: 'created_at', nom: 'nom COLLATE NOCASE', prenom: 'prenom COLLATE NOCASE',
  date_naissance: 'date_naissance', region: 'region', commune: 'commune', statut: 'statut',
  matricule: 'matricule',
};

export class DuplicateError extends Error {
  constructor(field) { super(field); this.field = field; }
}

const isoDate = (d) => d.toISOString().slice(0, 10);
function yearsAgo(n) {
  const d = new Date();
  d.setFullYear(d.getFullYear() - n);
  return isoDate(d);
}

export function buildWhere(f = {}) {
  const where = [];
  const params = [];
  const add = (sql, ...p) => { where.push(sql); params.push(...p); };
  const q = fold(f.q).trim();
  if (q) {
    for (const tok of q.split(/\s+/).slice(0, 8)) {
      const t = tok.replace(/^(\+221|00221)/, '').replace(/[%_\\]/g, (c) => '\\' + c);
      add(`search_text LIKE ? ESCAPE '\\'`, `%${t}%`);
    }
  }
  for (const k of ['region', 'departement', 'commune', 'sexe', 'statut', 'fonction', 'niveau_instruction', 'source']) {
    if (f[k]) add(`${k} = ?`, String(f[k]));
  }
  if (f.carte === 'oui') add('carte_electeur IS NOT NULL');
  if (f.carte === 'non') add('carte_electeur IS NULL');
  const amin = Number.parseInt(f.age_min, 10);
  const amax = Number.parseInt(f.age_max, 10);
  if (Number.isInteger(amin)) add('date_naissance <= ?', yearsAgo(amin));
  if (Number.isInteger(amax)) add('date_naissance > ?', yearsAgo(amax + 1));
  if (/^\d{4}-\d{2}-\d{2}$/.test(f.from || '')) add('created_at >= ?', f.from);
  if (/^\d{4}-\d{2}-\d{2}$/.test(f.to || '')) add('created_at < ?', isoDate(new Date(Date.parse(f.to) + 86400000)));
  return { sql: where.length ? `WHERE ${where.join(' AND ')}` : '', params };
}

export function createMembersRepo(db) {
  const findDup = (m, exceptId = 0) => {
    const checks = [['telephone', m.telephone], ['carte_electeur', m.carte_electeur], ['cni', m.cni]];
    for (const [field, val] of checks) {
      if (!val) continue;
      const row = db.prepare(`SELECT id FROM members WHERE ${field} = ? AND id != ?`).get(val, exceptId);
      if (row) return field;
    }
    return null;
  };

  return {
    findDup,

    create(m, { source = 'formulaire', userId = null } = {}) {
      const dup = findDup(m);
      if (dup) throw new DuplicateError(dup);
      const cols = [...COLUMNS, 'source', 'created_by'];
      const vals = [...COLUMNS.map((c) => m[c] ?? null), source, userId];
      const info = db.prepare(
        `INSERT INTO members (${cols.join(',')}) VALUES (${cols.map(() => '?').join(',')})`,
      ).run(...vals);
      const id = Number(info.lastInsertRowid);
      const matricule = `AHL-${new Date().getFullYear()}-${String(id).padStart(6, '0')}`;
      db.prepare(`UPDATE members SET matricule = ?, search_text = search_text || ' ' || ? WHERE id = ?`)
        .run(matricule, matricule.toLowerCase(), id);
      return this.get(id);
    },

    update(id, m) {
      const cur = this.get(id);
      if (!cur) return null;
      const dup = findDup(m, id);
      if (dup) throw new DuplicateError(dup);
      if (m.photo === undefined) m.photo = cur.photo;
      m.search_text = `${m.search_text} ${cur.matricule.toLowerCase()}`;
      db.prepare(
        `UPDATE members SET ${COLUMNS.map((c) => `${c} = ?`).join(', ')},
         updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ?`,
      ).run(...COLUMNS.map((c) => m[c] ?? null), id);
      return this.get(id);
    },

    get(id) {
      const row = db.prepare('SELECT * FROM members WHERE id = ?').get(id);
      if (!row) return null;
      delete row.search_text;
      return { ...row };
    },

    remove(id) {
      return db.prepare('DELETE FROM members WHERE id = ?').run(id).changes > 0;
    },

    setStatus(ids, statut) {
      const stmt = db.prepare(`UPDATE members SET statut = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ?`);
      let n = 0;
      for (const id of ids) n += stmt.run(statut, id).changes;
      return n;
    },

    removeMany(ids) {
      const stmt = db.prepare('DELETE FROM members WHERE id = ?');
      let n = 0;
      for (const id of ids) n += stmt.run(id).changes;
      return n;
    },

    list(f = {}) {
      const { sql, params } = buildWhere(f);
      const limit = Math.min(Math.max(Number.parseInt(f.limit, 10) || 25, 1), 200);
      const page = Math.max(Number.parseInt(f.page, 10) || 1, 1);
      const sort = SORTS[f.sort] || 'created_at';
      const dir = f.dir === 'asc' ? 'ASC' : 'DESC';
      const total = db.prepare(`SELECT COUNT(*) AS n FROM members ${sql}`).get(...params).n;
      const items = db.prepare(
        `SELECT ${LIST_COLUMNS} FROM members ${sql} ORDER BY ${sort} ${dir}, id DESC LIMIT ? OFFSET ?`,
      ).all(...params, limit, (page - 1) * limit).map((r) => ({ ...r, has_photo: Boolean(r.has_photo) }));
      return { items, total, page, limit, pages: Math.max(1, Math.ceil(total / limit)) };
    },

    *iterate(f = {}) {
      const { sql, params } = buildWhere(f);
      yield* db.prepare(`SELECT * FROM members ${sql} ORDER BY created_at DESC`).iterate(...params);
    },

    stats(f = {}) {
      const { sql, params } = buildWhere(f);
      const w = (extra) => (sql ? `${sql} AND ${extra}` : `WHERE ${extra}`);
      const all = (q, ...p) => db.prepare(q).all(...params, ...p).map((r) => ({ ...r }));
      const now = new Date();
      const d30 = new Date(now - 30 * 86400000).toISOString();
      const d60 = new Date(now - 60 * 86400000).toISOString();

      // Les paramètres des agrégats (dans le SELECT) précèdent ceux du filtre.
      const kpi = db.prepare(`SELECT COUNT(*) total,
          SUM(sexe='F') femmes, SUM(sexe='M') hommes,
          SUM(statut='actif') actifs, SUM(statut='en_attente') en_attente,
          SUM(statut='suspendu') suspendus, SUM(statut='inactif') inactifs,
          SUM(carte_electeur IS NOT NULL) avec_carte, SUM(whatsapp=1) whatsapp,
          SUM(created_at >= ?) new30, SUM(created_at >= ? AND created_at < ?) prev30,
          COUNT(DISTINCT commune) communes, COUNT(DISTINCT departement) departements
        FROM members ${sql}`).get(d30, d60, d30, ...params);

      const ages = all(`SELECT sexe, date_naissance FROM members ${sql}`);
      const BUCKETS = ['0-17', '18-25', '26-35', '36-45', '46-55', '56-65', '66+'];
      const bucketOf = (a) => (a < 18 ? 0 : a <= 25 ? 1 : a <= 35 ? 2 : a <= 45 ? 3 : a <= 55 ? 4 : a <= 65 ? 5 : 6);
      const pyramid = BUCKETS.map((label) => ({ label, M: 0, F: 0 }));
      let ageSum = 0, ageN = 0, majeurs = 0;
      for (const r of ages) {
        const a = ageFrom(r.date_naissance, now);
        if (a == null) continue;
        pyramid[bucketOf(a)][r.sexe]++;
        ageSum += a; ageN++;
        if (a >= 18) majeurs++;
      }

      const months = [];
      for (let i = 11; i >= 0; i--) {
        const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1));
        months.push(d.toISOString().slice(0, 7));
      }
      const monthly = Object.fromEntries(months.map((m) => [m, 0]));
      for (const r of all(`SELECT substr(created_at,1,7) m, COUNT(*) n FROM members ${w('created_at >= ?')} GROUP BY m`, `${months[0]}-01`)) {
        if (r.m in monthly) monthly[r.m] = r.n;
      }
      const days = [];
      for (let i = 29; i >= 0; i--) days.push(new Date(now - i * 86400000).toISOString().slice(0, 10));
      const daily = Object.fromEntries(days.map((d) => [d, 0]));
      for (const r of all(`SELECT substr(created_at,1,10) d, COUNT(*) n FROM members ${w('created_at >= ?')} GROUP BY d`, `${days[0]}`)) {
        if (r.d in daily) daily[r.d] = r.n;
      }

      const group = (col, lim = 50) => all(
        `SELECT ${col} AS label, COUNT(*) AS n FROM members ${w(`${col} IS NOT NULL`)} GROUP BY ${col} ORDER BY n DESC LIMIT ${lim}`,
      );

      return {
        kpi: {
          ...Object.fromEntries(Object.entries(kpi).map(([key, v]) => [key, Number(v) || 0])),
          age_moyen: ageN ? Math.round((ageSum / ageN) * 10) / 10 : null,
          majeurs,
        },
        pyramid,
        monthly: months.map((m) => ({ label: m, n: monthly[m] })),
        daily: days.map((d) => ({ label: d, n: daily[d] })),
        regions: group('region'),
        departements: group('departement', 10),
        communes: all(`SELECT commune AS label, departement, COUNT(*) AS n FROM members ${sql} GROUP BY commune, departement ORDER BY n DESC LIMIT 10`),
        fonctions: group('fonction'),
        niveaux: group('niveau_instruction'),
        situations: group('situation_matrimoniale'),
        statuts: group('statut'),
        sources: group('source'),
        recents: all(`SELECT id, matricule, prenom, nom, sexe, commune, region, statut, created_at FROM members ${sql} ORDER BY created_at DESC LIMIT 6`),
      };
    },
  };
}
