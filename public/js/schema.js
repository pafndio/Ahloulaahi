// Référentiels partagés entre le formulaire, l'administration et le serveur.

export const SEXES = [
  { value: 'M', label: 'Homme' },
  { value: 'F', label: 'Femme' },
];

export const SITUATIONS = ['Célibataire', 'Marié(e)', 'Divorcé(e)', 'Veuf / Veuve'];

export const NIVEAUX = [
  'Aucun', 'Coranique / Daara', 'Alphabétisé(e)', 'Primaire', 'Moyen',
  'Secondaire', 'Universitaire', 'Formation professionnelle',
];

export const FONCTIONS = [
  'Membre', 'Responsable de section', 'Secrétaire', 'Trésorier(ère)',
  'Chargé(e) de communication', 'Responsable des jeunes', 'Responsable des femmes',
  'Imam / Guide religieux', 'Conseiller(ère)', 'Autre',
];

export const GROUPES_SANGUINS = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'];

export const STATUTS = [
  { value: 'en_attente', label: 'En attente', tone: 'amber' },
  { value: 'actif', label: 'Actif', tone: 'green' },
  { value: 'suspendu', label: 'Suspendu', tone: 'red' },
  { value: 'inactif', label: 'Inactif', tone: 'gray' },
];

export const ROLES = [
  { value: 'admin', label: 'Administrateur' },
  { value: 'editeur', label: 'Éditeur' },
  { value: 'lecteur', label: 'Lecteur' },
];

export const PROFESSIONS_SUGGEREES = [
  'Agriculteur(trice)', 'Artisan(e)', 'Commerçant(e)', 'Couturier(ère)', 'Chauffeur',
  'Élève', 'Enseignant(e)', 'Étudiant(e)', 'Éleveur(se)', 'Fonctionnaire', 'Infirmier(ère)',
  'Maçon', 'Mécanicien', 'Ménagère', 'Menuisier', 'Pêcheur', 'Retraité(e)', 'Sans emploi',
  'Informaticien(ne)', 'Entrepreneur(e)',
];

// Mobile (70, 71, 75, 76, 77, 78) ou fixe (33) — 9 chiffres sans l'indicatif.
export const PHONE_RE = /^(7[015678]|33)\d{7}$/;

export function normalizePhone(v) {
  if (v == null) return '';
  let s = String(v).replace(/[\s.\-()]/g, '');
  if (s.startsWith('+221')) s = s.slice(4);
  else if (s.startsWith('00221')) s = s.slice(5);
  return s;
}

export function formatPhone(v) {
  const s = normalizePhone(v);
  if (!/^\d{9}$/.test(s)) return v || '';
  return `${s.slice(0, 2)} ${s.slice(2, 5)} ${s.slice(5, 7)} ${s.slice(7)}`;
}

export const normalizeId = (v) => String(v ?? '').replace(/[\s\-]/g, '').toUpperCase();

export function ageFrom(dateStr, now = new Date()) {
  if (!dateStr) return null;
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return null;
  let a = now.getFullYear() - d.getFullYear();
  const m = now.getMonth() - d.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < d.getDate())) a--;
  return a;
}

// Recherche insensible aux accents et à la casse.
export const fold = (s) => String(s ?? '')
  .normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
