import { readFileSync } from 'node:fs';
import {
  SITUATIONS, NIVEAUX, FONCTIONS, GROUPES_SANGUINS, STATUTS,
  PHONE_RE, normalizePhone, normalizeId, ageFrom, fold,
} from '../public/js/schema.js';

const geo = JSON.parse(readFileSync(new URL('../public/data/senegal.json', import.meta.url), 'utf8'));
const GEO = new Map(geo.regions.map((r) => [
  r.nom, new Map(r.departements.map((d) => [d.nom, new Set(d.communes)])),
]));
export const REGIONS = [...GEO.keys()];

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const PHOTO_RE = /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/;
const MAX_PHOTO = 400_000;

const str = (v, max = 120) => {
  if (v == null) return null;
  const s = String(v).replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim();
  return s ? s.slice(0, max) : null;
};

// Valide et normalise une fiche membre. `admin` autorise les champs de gestion.
export function validateMember(input, { admin = false } = {}) {
  const errors = {};
  const b = input && typeof input === 'object' ? input : {};
  const m = {};
  const need = (k, label) => { if (!m[k]) errors[k] = `${label} est obligatoire.`; };
  const oneOf = (k, list) => { if (m[k] && !list.includes(m[k])) errors[k] = 'Valeur non reconnue.'; };

  m.prenom = str(b.prenom, 80); need('prenom', 'Le prénom');
  m.nom = str(b.nom, 60); need('nom', 'Le nom');
  m.sexe = b.sexe === 'M' || b.sexe === 'F' ? b.sexe : null;
  if (!m.sexe) errors.sexe = 'Veuillez indiquer le sexe.';

  m.date_naissance = str(b.date_naissance, 10);
  if (!m.date_naissance) errors.date_naissance = 'La date de naissance est obligatoire.';
  else {
    const age = DATE_RE.test(m.date_naissance) ? ageFrom(m.date_naissance) : null;
    if (age == null || age < 0 || age > 120) errors.date_naissance = 'Date de naissance invalide.';
  }
  m.lieu_naissance = str(b.lieu_naissance, 80);
  m.nationalite = str(b.nationalite, 40) || 'Sénégalaise';

  m.cni = b.cni ? normalizeId(b.cni) : null;
  if (m.cni && !/^\d{10,17}$/.test(m.cni)) errors.cni = 'Numéro de CNI invalide (10 à 17 chiffres).';

  const sansCarte = b.sans_carte === true || b.sans_carte === 'on' || b.sans_carte === 1;
  m.carte_electeur = b.carte_electeur ? normalizeId(b.carte_electeur) : null;
  if (m.carte_electeur && !/^[A-Z0-9]{6,15}$/.test(m.carte_electeur)) {
    errors.carte_electeur = 'Numéro de carte d’électeur invalide (6 à 15 caractères).';
  } else if (!m.carte_electeur && !sansCarte) {
    errors.carte_electeur = 'Saisissez le numéro de carte d’électeur ou cochez « Pas encore de carte ».';
  }
  m.lieu_vote = str(b.lieu_vote, 100);
  m.bureau_vote = str(b.bureau_vote, 40);

  m.telephone = normalizePhone(b.telephone);
  if (!m.telephone) errors.telephone = 'Le numéro de téléphone est obligatoire.';
  else if (!PHONE_RE.test(m.telephone)) errors.telephone = 'Numéro sénégalais invalide (ex. 77 123 45 67).';
  m.telephone2 = normalizePhone(b.telephone2) || null;
  if (m.telephone2 && !PHONE_RE.test(m.telephone2)) errors.telephone2 = 'Numéro invalide.';
  m.whatsapp = b.whatsapp === true || b.whatsapp === 'on' || b.whatsapp === 1 ? 1 : 0;
  m.email = str(b.email, 120)?.toLowerCase() ?? null;
  if (m.email && !EMAIL_RE.test(m.email)) errors.email = 'Adresse e-mail invalide.';

  m.region = str(b.region, 40);
  m.departement = str(b.departement, 60);
  m.commune = str(b.commune, 80);
  const depts = GEO.get(m.region);
  if (!depts) errors.region = 'Veuillez choisir une région.';
  else if (!depts.has(m.departement)) errors.departement = 'Veuillez choisir un département.';
  else if (!depts.get(m.departement).has(m.commune)) errors.commune = 'Veuillez choisir une commune.';
  m.quartier = str(b.quartier, 80);
  m.adresse = str(b.adresse, 160);

  m.situation_matrimoniale = str(b.situation_matrimoniale, 30); oneOf('situation_matrimoniale', SITUATIONS);
  m.nb_enfants = b.nb_enfants === '' || b.nb_enfants == null ? null : Number(b.nb_enfants);
  if (m.nb_enfants != null && (!Number.isInteger(m.nb_enfants) || m.nb_enfants < 0 || m.nb_enfants > 40)) {
    errors.nb_enfants = 'Nombre invalide.';
  }
  m.profession = str(b.profession, 80);
  m.niveau_instruction = str(b.niveau_instruction, 40); oneOf('niveau_instruction', NIVEAUX);

  m.section = str(b.section, 80);
  m.fonction = str(b.fonction, 60) || 'Membre'; oneOf('fonction', FONCTIONS);
  m.date_adhesion = str(b.date_adhesion, 10);
  if (m.date_adhesion && (!DATE_RE.test(m.date_adhesion) || Number.isNaN(Date.parse(m.date_adhesion)))) {
    errors.date_adhesion = 'Date invalide.';
  }
  m.groupe_sanguin = str(b.groupe_sanguin, 3); oneOf('groupe_sanguin', GROUPES_SANGUINS);
  m.urgence_nom = str(b.urgence_nom, 100);
  m.urgence_tel = normalizePhone(b.urgence_tel) || null;
  if (m.urgence_tel && !PHONE_RE.test(m.urgence_tel)) errors.urgence_tel = 'Numéro invalide.';

  m.photo = typeof b.photo === 'string' && b.photo ? b.photo : null;
  if (m.photo && (m.photo.length > MAX_PHOTO || !PHOTO_RE.test(m.photo))) errors.photo = 'Photo invalide ou trop lourde.';

  m.consentement = b.consentement === true || b.consentement === 'on' || b.consentement === 1 ? 1 : 0;

  if (admin) {
    m.notes = str(b.notes, 1000);
    m.statut = STATUTS.some((s) => s.value === b.statut) ? b.statut : 'actif';
  } else {
    if (!m.consentement) errors.consentement = 'Votre consentement est nécessaire pour enregistrer vos données.';
    m.notes = null;
    m.statut = 'en_attente';
  }

  m.search_text = fold([
    m.prenom, m.nom, m.telephone, m.telephone2, m.carte_electeur, m.cni, m.email,
    m.region, m.departement, m.commune, m.quartier, m.section, m.profession, m.fonction,
  ].filter(Boolean).join(' '));

  return { data: m, errors: Object.keys(errors).length ? errors : null };
}
