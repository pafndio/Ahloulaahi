// Remplit la base avec des membres FICTIFS pour la démonstration du tableau de bord.
// Usage : npm run seed -- 400
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';
import { openDb } from '../server/db.js';
import { createMembersRepo, DuplicateError } from '../server/members.js';
import { validateMember } from '../server/validation.js';
import { SITUATIONS, NIVEAUX, FONCTIONS, PROFESSIONS_SUGGEREES, GROUPES_SANGUINS } from '../public/js/schema.js';

const N = Number(process.argv[2]) || 300;
const DB_FILE = process.env.DB_FILE || fileURLToPath(new URL('../data/ahloulaahi.db', import.meta.url));
const db = openDb(DB_FILE);
const repo = createMembersRepo(db);
const geo = JSON.parse(readFileSync(new URL('../public/data/senegal.json', import.meta.url), 'utf8'));

const PRENOMS_H = ['Mamadou', 'Moussa', 'Ibrahima', 'Cheikh', 'Abdoulaye', 'Ousmane', 'Modou', 'Serigne', 'Babacar', 'Alioune', 'Pape', 'Mouhamed', 'Saliou', 'Lamine', 'Assane', 'Elhadji', 'Khadim', 'Malick', 'Omar', 'Seydina'];
const PRENOMS_F = ['Aminata', 'Fatou', 'Awa', 'Mariama', 'Khady', 'Ndeye', 'Aïssatou', 'Coumba', 'Astou', 'Bineta', 'Rokhaya', 'Seynabou', 'Mame Diarra', 'Yacine', 'Adama', 'Dieynaba', 'Sokhna', 'Ramatoulaye', 'Maïmouna', 'Penda'];
const NOMS = ['Diop', 'Ndiaye', 'Fall', 'Sow', 'Gueye', 'Sarr', 'Faye', 'Ba', 'Diallo', 'Mbaye', 'Thiam', 'Seck', 'Cissé', 'Diouf', 'Kane', 'Sy', 'Niang', 'Lô', 'Samb', 'Mbengue', 'Ndoye', 'Dieng', 'Touré', 'Camara', 'Wade'];
// Pondération : la présence est plus forte dans certaines régions (purement illustratif).
const WEIGHT = { Dakar: 10, Thiès: 7, Diourbel: 5, 'Saint-Louis': 4, Kaolack: 4, Louga: 3, Ziguinchor: 2, Fatick: 2 };

const pick = (a) => a[Math.floor(Math.random() * a.length)];
const weighted = () => {
  const pool = geo.regions.flatMap((r) => Array(WEIGHT[r.nom] || 1).fill(r));
  return pick(pool);
};
const digits = (n) => Array.from({ length: n }, () => Math.floor(Math.random() * 10)).join('');
const dateBetween = (from, to) => new Date(from.getTime() + Math.random() * (to - from)).toISOString().slice(0, 10);

let ok = 0;
for (let i = 0; i < N * 2 && ok < N; i++) {
  const sexe = Math.random() < 0.47 ? 'F' : 'M';
  const r = weighted();
  const d = pick(r.departements);
  const age = Math.max(14, Math.min(85, Math.round(18 + Math.abs((Math.random() + Math.random() + Math.random() - 1.5) * 30))));
  const birth = new Date();
  birth.setFullYear(birth.getFullYear() - age, Math.floor(Math.random() * 12), 1 + Math.floor(Math.random() * 28));
  const input = {
    prenom: pick(sexe === 'F' ? PRENOMS_F : PRENOMS_H),
    nom: pick(NOMS),
    sexe,
    date_naissance: birth.toISOString().slice(0, 10),
    lieu_naissance: pick(d.communes),
    telephone: `${pick(['77', '78', '76', '70', '75'])}${digits(7)}`,
    whatsapp: Math.random() < 0.8,
    region: r.nom, departement: d.nom, commune: pick(d.communes),
    quartier: `Quartier ${pick(['Escale', 'Médina', 'HLM', 'Darou Salam', 'Santhiaba', 'Keur Mbaye', 'Thiokho'])}`,
    carte_electeur: age >= 18 && Math.random() < 0.82 ? digits(9) : '',
    sans_carte: true,
    cni: Math.random() < 0.6 ? `1${digits(12)}` : '',
    situation_matrimoniale: age < 22 ? 'Célibataire' : pick(SITUATIONS),
    nb_enfants: age < 22 ? 0 : Math.floor(Math.random() * 6),
    profession: age < 20 ? 'Élève' : pick(PROFESSIONS_SUGGEREES),
    niveau_instruction: pick(NIVEAUX),
    fonction: Math.random() < 0.8 ? 'Membre' : pick(FONCTIONS),
    section: `Section ${d.nom}`,
    groupe_sanguin: Math.random() < 0.4 ? pick(GROUPES_SANGUINS) : '',
    consentement: true,
    statut: pick(['actif', 'actif', 'actif', 'actif', 'en_attente', 'en_attente', 'suspendu', 'inactif']),
  };
  const { data, errors } = validateMember(input, { admin: true });
  if (errors) continue;
  try {
    const m = repo.create(data, { source: pick(['formulaire', 'formulaire', 'hors-ligne', 'admin']) });
    // Étale les dates d'inscription sur 14 mois, avec une croissance récente.
    const daysAgo = Math.floor(Math.pow(Math.random(), 1.6) * 420);
    const created = new Date(Date.now() - daysAgo * 86400000 - Math.random() * 86400000).toISOString();
    db.prepare('UPDATE members SET created_at = ?, updated_at = ? WHERE id = ?').run(created, created, m.id);
    ok++;
  } catch (e) {
    if (!(e instanceof DuplicateError)) throw e;
  }
}
console.log(`${ok} membres fictifs ajoutés dans ${DB_FILE}`);
