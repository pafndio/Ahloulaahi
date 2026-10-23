// Génère public/data/senegal.json à partir de scripts/communes-source.tsv
// (liste officielle REGION / DEPARTEMENT / COMMUNE fournie par l'organisation).
// Usage : node scripts/build-geo.mjs
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const tsv = readFileSync(join(root, 'scripts/communes-source.tsv'), 'utf8');

const clean = (s) => s.replace(/\s+/g, ' ').trim().toUpperCase();

// Corrections de la source : coquilles et rattachements administratifs.
const DEPT_FIX = { TIVAOUNE: 'TIVAOUANE' };
// Le département de Guinguinéo relève de la région de Kaolack.
const DEPT_REGION = { GUINGUINEO: 'KAOLACK' };

// Libellés accentués des régions (doivent correspondre aux tracés de la carte).
const REGION_LABEL = {
  DAKAR: 'Dakar', DIOURBEL: 'Diourbel', FATICK: 'Fatick', KAFFRINE: 'Kaffrine',
  KAOLACK: 'Kaolack', KEDOUGOU: 'Kédougou', KOLDA: 'Kolda', LOUGA: 'Louga',
  MATAM: 'Matam', 'SAINT LOUIS': 'Saint-Louis', SEDHIOU: 'Sédhiou',
  TAMBACOUNDA: 'Tambacounda', THIES: 'Thiès', ZIGUINCHOR: 'Ziguinchor',
};
const DEPT_LABEL = {
  GUEDIAWAYE: 'Guédiawaye', MBACKE: 'Mbacké', KEDOUGOU: 'Kédougou', SALEMATA: 'Salémata',
  VELINGARA: 'Vélingara', KEBEMER: 'Kébémer', LINGUERE: 'Linguère', 'RANEROU FERLO': 'Ranérou Ferlo',
  'SAINT LOUIS': 'Saint-Louis', SEDHIOU: 'Sédhiou', MBOUR: 'Mbour', THIES: 'Thiès',
  GUINGUINEO: 'Guinguinéo', 'MEDINA YORO FOULAH': 'Médina Yoro Foulah',
};
const COMMUNE_LABEL = {
  'H L M': 'HLM',
  'GUEULE TAPEE FASS CO': 'Gueule Tapée - Fass - Colobane',
  'FANN POINT E AMITIE': 'Fann - Point E - Amitié',
  'PATTE D OIE': "Patte d'Oie",
  'TIVAOUANE PEULH - NIAGA': 'Tivaouane Peulh - Niaga',
};

const SMALL = new Set(['DU', 'DE', 'DES', 'SUR', 'EL']);
function titleCase(s) {
  return s.split(' ').map((w, i) => {
    if (w.includes('.') || /^\(?[0-9]/.test(w)) return w;
    if (i > 0 && SMALL.has(w)) return w.toLowerCase();
    return w.toLowerCase().replace(/(^|[-(])([a-z])/g, (_, p, c) => p + c.toUpperCase());
  }).join(' ');
}

const regions = new Map();
let count = 0;
for (const line of tsv.split('\n').slice(1)) {
  if (!line.trim()) continue;
  let [r, d, c] = line.split('\t').map(clean);
  d = DEPT_FIX[d] ?? d;
  r = DEPT_REGION[d] ?? r;
  const rl = REGION_LABEL[r];
  if (!rl) throw new Error(`Région inconnue : ${r}`);
  const dl = DEPT_LABEL[d] ?? titleCase(d);
  const cl = COMMUNE_LABEL[c] ?? titleCase(c);
  if (!regions.has(rl)) regions.set(rl, new Map());
  const depts = regions.get(rl);
  if (!depts.has(dl)) depts.set(dl, new Set());
  depts.get(dl).add(cl);
  count++;
}

const coll = new Intl.Collator('fr');
const out = {
  source: 'Liste officielle des communes du Sénégal fournie par l’organisation Ahlou Lahi',
  regions: [...regions.keys()].sort(coll.compare).map((nom) => ({
    nom,
    departements: [...regions.get(nom).keys()].sort(coll.compare).map((d) => ({
      nom: d,
      communes: [...regions.get(nom).get(d)].sort(coll.compare),
    })),
  })),
};
writeFileSync(join(root, 'public/data/senegal.json'), JSON.stringify(out));
const nd = out.regions.reduce((n, r) => n + r.departements.length, 0);
console.log(`${out.regions.length} régions, ${nd} départements, ${count} communes`);
