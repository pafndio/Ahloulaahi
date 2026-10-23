// Champs de la fiche membre, partagés entre le formulaire public et l'administration.
import {
  SEXES, SITUATIONS, NIVEAUX, FONCTIONS, GROUPES_SANGUINS, STATUTS, PROFESSIONS_SUGGEREES, formatPhone,
} from './schema.js';
import { esc, icon } from './ui.js';

const v = (m, k) => esc(m?.[k] ?? '');
const opts = (list, sel, placeholder = 'Choisir…') =>
  `<option value="">${placeholder}</option>` +
  list.map((o) => {
    const value = typeof o === 'string' ? o : o.value;
    const label = typeof o === 'string' ? o : o.label;
    return `<option value="${esc(value)}"${value === sel ? ' selected' : ''}>${esc(label)}</option>`;
  }).join('');

const field = (name, label, control, { req = false, hint = '', span = 1 } = {}) => `
  <div class="field${span === 2 ? ' span-2' : ''}" data-field="${name}">
    <label for="f-${name}">${label}${req ? '<span class="req" aria-hidden="true">*</span>' : ''}</label>
    ${control}
    ${hint ? `<span class="field-hint">${hint}</span>` : ''}
  </div>`;

const input = (name, m, attrs = '') => `<input class="input" id="f-${name}" name="${name}" value="${v(m, name)}" ${attrs}>`;
const phoneInput = (name, m, attrs = '') => `
  <div class="input-group"><span class="addon">+221</span>
  <input class="input" id="f-${name}" name="${name}" type="tel" inputmode="tel" autocomplete="tel-national"
    placeholder="77 123 45 67" value="${esc(m?.[name] ? formatPhone(m[name]) : '')}" ${attrs}></div>`;

export function sectionIdentite(m = {}) {
  const today = new Date().toISOString().slice(0, 10);
  return `
  <div class="photo-row">
    <label class="photo-pick" for="f-photo-file">
      <img class="photo-preview" alt="" ${m.photo ? `src="${esc(m.photo)}"` : 'hidden'}>
      <span class="photo-empty" ${m.photo ? 'hidden' : ''}>${icon('camera')}<span>Photo</span></span>
    </label>
    <input type="file" id="f-photo-file" accept="image/*" capture="user" class="sr-only">
    <input type="hidden" name="photo" value="${v(m, 'photo')}">
    <div class="photo-text">
      <strong>Photo d’identité</strong>
      <span class="field-hint">Facultative — utilisée pour la carte de membre.</span>
      <button type="button" class="btn btn-sm btn-ghost photo-remove" ${m.photo ? '' : 'hidden'}>${icon('trash')} Retirer</button>
    </div>
  </div>
  <div class="grid-2">
    ${field('prenom', 'Prénom(s)', input('prenom', m, 'autocomplete="given-name" required maxlength="80"'), { req: true })}
    ${field('nom', 'Nom', input('nom', m, 'autocomplete="family-name" required maxlength="60"'), { req: true })}
    <div class="field" data-field="sexe">
      <span class="field-label">Sexe<span class="req">*</span></span>
      <div class="segmented" role="radiogroup" aria-label="Sexe">
        ${SEXES.map((s) => `<label><input type="radio" name="sexe" value="${s.value}"${m.sexe === s.value ? ' checked' : ''}><span>${s.label}</span></label>`).join('')}
      </div>
    </div>
    ${field('date_naissance', 'Date de naissance', input('date_naissance', m, `type="date" max="${today}" min="1900-01-01" required`), { req: true })}
    ${field('lieu_naissance', 'Lieu de naissance', input('lieu_naissance', m, 'maxlength="80"'))}
    ${field('nationalite', 'Nationalité', input('nationalite', { nationalite: m.nationalite || 'Sénégalaise' }, 'maxlength="40"'))}
    ${field('situation_matrimoniale', 'Situation matrimoniale', `<select class="select" id="f-situation_matrimoniale" name="situation_matrimoniale">${opts(SITUATIONS, m.situation_matrimoniale)}</select>`)}
    ${field('nb_enfants', 'Nombre d’enfants', input('nb_enfants', m, 'type="number" min="0" max="40" inputmode="numeric"'))}
  </div>`;
}

export function sectionLocalisation(m = {}) {
  return `
  <div class="grid-3">
    ${field('region', 'Région', '<select class="select" id="f-region" name="region" required></select>', { req: true })}
    ${field('departement', 'Département', '<select class="select" id="f-departement" name="departement" required></select>', { req: true })}
    ${field('commune', 'Commune', '<select class="select" id="f-commune" name="commune" required></select>', { req: true })}
  </div>
  <div class="grid-2">
    ${field('quartier', 'Quartier / Village', input('quartier', m, 'maxlength="80"'))}
    ${field('adresse', 'Adresse', input('adresse', m, 'maxlength="160" autocomplete="street-address"'))}
  </div>`;
}

export function sectionContact(m = {}) {
  return `
  <div class="grid-2">
    ${field('telephone', 'Téléphone principal', phoneInput('telephone', m, 'required'), { req: true })}
    <div class="field field-switch">
      <span class="field-label">&nbsp;</span>
      <label class="switch"><input type="checkbox" name="whatsapp" ${m.whatsapp || m.whatsapp === undefined ? 'checked' : ''}><span class="track"></span> Joignable sur WhatsApp</label>
    </div>
    ${field('telephone2', 'Téléphone secondaire', phoneInput('telephone2', m))}
    ${field('email', 'E-mail', input('email', m, 'type="email" autocomplete="email" maxlength="120" placeholder="facultatif"'))}
  </div>`;
}

export function sectionCivique(m = {}) {
  const sans = m.id && !m.carte_electeur;
  return `
  <div class="grid-2">
    ${field('carte_electeur', 'N° carte d’électeur', input('carte_electeur', m, `inputmode="numeric" maxlength="20" autocomplete="off" placeholder="Ex. 123456789" ${sans ? 'disabled' : ''}`), { req: true })}
    <div class="field field-switch">
      <span class="field-label">&nbsp;</span>
      <label class="check"><input type="checkbox" name="sans_carte" ${sans ? 'checked' : ''}> Pas encore de carte d’électeur</label>
    </div>
    ${field('cni', 'N° carte d’identité (CNI)', input('cni', m, 'inputmode="numeric" maxlength="20" autocomplete="off" placeholder="Facultatif"'))}
    ${field('lieu_vote', 'Lieu de vote', input('lieu_vote', m, 'maxlength="100" placeholder="École, centre…"'))}
    ${field('bureau_vote', 'Bureau de vote', input('bureau_vote', m, 'maxlength="40" placeholder="N° du bureau"'))}
  </div>`;
}

export function sectionOrganisation(m = {}) {
  return `
  <div class="grid-2">
    ${field('section', 'Section / Dahira', input('section', m, 'maxlength="80" placeholder="Nom de votre section locale"'))}
    ${field('fonction', 'Fonction dans l’organisation', `<select class="select" id="f-fonction" name="fonction">${opts(FONCTIONS, m.fonction || 'Membre', 'Choisir…')}</select>`)}
    ${field('date_adhesion', 'Date d’adhésion', input('date_adhesion', m, `type="date" max="${new Date().toISOString().slice(0, 10)}"`))}
    ${field('profession', 'Profession', `${input('profession', m, 'list="dl-professions" maxlength="80"')}<datalist id="dl-professions">${PROFESSIONS_SUGGEREES.map((p) => `<option value="${esc(p)}">`).join('')}</datalist>`)}
    ${field('niveau_instruction', 'Niveau d’instruction', `<select class="select" id="f-niveau_instruction" name="niveau_instruction">${opts(NIVEAUX, m.niveau_instruction)}</select>`)}
    ${field('groupe_sanguin', 'Groupe sanguin', `<select class="select" id="f-groupe_sanguin" name="groupe_sanguin">${opts(GROUPES_SANGUINS, m.groupe_sanguin, 'Inconnu')}</select>`)}
    ${field('urgence_nom', 'Personne à contacter en cas d’urgence', input('urgence_nom', m, 'maxlength="100" placeholder="Nom et lien de parenté"'))}
    ${field('urgence_tel', 'Téléphone d’urgence', phoneInput('urgence_tel', m))}
  </div>`;
}

export function sectionAdmin(m = {}) {
  return `
  <div class="grid-2">
    ${field('statut', 'Statut', `<select class="select" id="f-statut" name="statut">${opts(STATUTS, m.statut || 'actif', 'Choisir…')}</select>`)}
    <div class="field field-switch"><span class="field-label">&nbsp;</span>
      <label class="check"><input type="checkbox" name="consentement" ${m.consentement || !m.id ? 'checked' : ''}> Consentement au traitement des données recueilli</label>
    </div>
    ${field('notes', 'Notes internes', `<textarea class="textarea" id="f-notes" name="notes" maxlength="1000">${v(m, 'notes')}</textarea>`, { span: 2 })}
  </div>`;
}

// Comportements dynamiques (photo, carte d'électeur) d'un formulaire rendu.
export function enhance(form) {
  const file = form.querySelector('#f-photo-file');
  if (file) {
    const hidden = form.querySelector('[name="photo"]');
    const img = form.querySelector('.photo-preview');
    const empty = form.querySelector('.photo-empty');
    const rm = form.querySelector('.photo-remove');
    const show = (src) => {
      hidden.value = src || '';
      img.hidden = !src; empty.hidden = Boolean(src); rm.hidden = !src;
      if (src) img.src = src; else img.removeAttribute('src');
      hidden.dispatchEvent(new Event('change', { bubbles: true }));
    };
    file.addEventListener('change', async () => {
      if (!file.files[0]) return;
      const { resizeImage } = await import('./ui.js');
      try { show(await resizeImage(file.files[0])); } catch { /* image invalide */ }
      file.value = '';
    });
    rm.addEventListener('click', () => show(''));
  }
  const sans = form.querySelector('[name="sans_carte"]');
  const carte = form.querySelector('[name="carte_electeur"]');
  if (sans && carte) {
    sans.addEventListener('change', () => {
      carte.disabled = sans.checked;
      if (sans.checked) { carte.value = ''; clearError(form, 'carte_electeur'); }
    });
  }
  form.addEventListener('input', (e) => { if (e.target.name) clearError(form, e.target.name); });
  form.addEventListener('change', (e) => { if (e.target.name) clearError(form, e.target.name); });
}

export function collect(form) {
  const fd = new FormData(form);
  const out = {};
  for (const [k, val] of fd.entries()) out[k] = typeof val === 'string' ? val.trim() : val;
  for (const k of ['whatsapp', 'sans_carte', 'consentement']) {
    const el = form.querySelector(`[name="${k}"]`);
    if (el) out[k] = el.checked;
  }
  return out;
}

export function clearError(form, name) {
  const f = form.querySelector(`[data-field="${name}"]`);
  if (!f) return;
  f.classList.remove('has-error');
  f.querySelector('.field-error')?.remove();
}

export function showErrors(form, fields = {}) {
  form.querySelectorAll('.field-error').forEach((e) => e.remove());
  form.querySelectorAll('.has-error').forEach((e) => e.classList.remove('has-error'));
  let first = null;
  for (const [name, msg] of Object.entries(fields)) {
    const f = form.querySelector(`[data-field="${name}"]`);
    if (!f) continue;
    f.classList.add('has-error');
    const span = document.createElement('span');
    span.className = 'field-error';
    span.textContent = msg;
    f.append(span);
    first ??= f;
  }
  return first;
}

// Validation côté client (le serveur reste la référence).
export function quickCheck(data, names) {
  const errs = {};
  const need = { prenom: 'Le prénom est obligatoire.', nom: 'Le nom est obligatoire.', sexe: 'Veuillez indiquer le sexe.', date_naissance: 'La date de naissance est obligatoire.', region: 'Veuillez choisir une région.', departement: 'Veuillez choisir un département.', commune: 'Veuillez choisir une commune.', telephone: 'Le numéro de téléphone est obligatoire.' };
  for (const n of names) {
    if (need[n] && !data[n]) errs[n] = need[n];
  }
  const phone = (s) => /^(7[015678]|33)\d{7}$/.test(String(s || '').replace(/[\s.\-()]/g, '').replace(/^(\+221|00221)/, ''));
  for (const n of ['telephone', 'telephone2', 'urgence_tel']) {
    if (names.includes(n) && data[n] && !phone(data[n])) errs[n] = 'Numéro sénégalais invalide (ex. 77 123 45 67).';
  }
  if (names.includes('carte_electeur')) {
    if (!data.carte_electeur && !data.sans_carte) errs.carte_electeur = 'Saisissez le numéro ou cochez « Pas encore de carte ».';
    else if (data.carte_electeur && !/^[A-Z0-9]{6,15}$/i.test(data.carte_electeur.replace(/[\s-]/g, ''))) errs.carte_electeur = 'Numéro invalide (6 à 15 caractères).';
  }
  if (names.includes('cni') && data.cni && !/^\d{10,17}$/.test(data.cni.replace(/[\s-]/g, ''))) errs.cni = 'Numéro de CNI invalide (10 à 17 chiffres).';
  if (names.includes('email') && data.email && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(data.email)) errs.email = 'Adresse e-mail invalide.';
  return errs;
}
