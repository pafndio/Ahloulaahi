import { esc, icon, toast, initTheme, fmtDate } from './ui.js';
import { bindCascade, loadGeo } from './geo.js';
import {
  sectionIdentite, sectionLocalisation, sectionContact, sectionCivique, sectionOrganisation,
  enhance, collect, showErrors, quickCheck,
} from './member-fields.js';
import { formatPhone, ageFrom } from './schema.js';
import * as outbox from './outbox.js';
import { registerSW, setupInstall, watchOnline } from './pwa.js';
import { memberCard } from './card.js';

initTheme();
registerSW();

const STEPS = [
  {
    id: 'identite', title: 'Identité', icon: 'user', desc: 'Qui êtes-vous ?',
    html: () => sectionIdentite(),
    fields: ['prenom', 'nom', 'sexe', 'date_naissance', 'nb_enfants'],
  },
  {
    id: 'lieu', title: 'Localisation & contact', icon: 'pin', desc: 'Où résidez-vous et comment vous joindre ?',
    html: () => `${sectionLocalisation()}<h4 class="subhead">Contact</h4>${sectionContact()}`,
    fields: ['region', 'departement', 'commune', 'telephone', 'telephone2', 'email'],
  },
  {
    id: 'civique', title: 'Électeur & organisation', icon: 'vote', desc: 'Votre situation électorale et votre engagement.',
    html: () => `${sectionCivique()}<h4 class="subhead">Organisation & profil</h4>${sectionOrganisation()}`,
    fields: ['carte_electeur', 'cni', 'urgence_tel'],
  },
  {
    id: 'review', title: 'Vérification', icon: 'check', desc: 'Relisez vos informations avant de valider.',
    html: () => `<div class="review" id="review"></div>
      <div class="consent" data-field="consentement">
        <label class="check"><input type="checkbox" name="consentement">
        <span>J’accepte que mes données soient enregistrées et traitées par l’organisation Ahlou Lahi
        pour la gestion de ses membres. Elles ne seront ni vendues ni cédées à des tiers.</span></label>
      </div>`,
    fields: ['consentement'],
  },
];

const form = document.getElementById('member-form');
const stepsEl = document.getElementById('steps');
const stepper = document.getElementById('stepper');
const prevBtn = document.getElementById('prev-btn');
const nextBtn = document.getElementById('next-btn');
const submitBtn = document.getElementById('submit-btn');
const stepCount = document.getElementById('step-count');
let current = 0;
let cascade;

document.getElementById('year').textContent = new Date().getFullYear();
setupInstall(document.getElementById('install-btn'));

stepper.innerHTML = STEPS.map((s, i) => `
  <li data-i="${i}"><span class="num">${i + 1}</span><span class="lbl">${s.title}</span></li>`).join('');
stepsEl.innerHTML = STEPS.map((s, i) => `
  <section class="step" data-step="${i}" aria-labelledby="st-${s.id}">
    <div class="step-head">
      <span class="ico-wrap">${icon(s.icon)}</span>
      <div><h3 id="st-${s.id}">${s.title}</h3><p>${s.desc}</p></div>
    </div>
    ${s.html()}
  </section>`).join('');

enhance(form);
cascade = await bindCascade(form.querySelector('#f-region'), form.querySelector('#f-departement'), form.querySelector('#f-commune'));

loadGeo().then((g) => {
  const chips = document.querySelectorAll('.hero-chips span');
  const deps = g.regions.flatMap((r) => r.departements);
  const counts = [g.regions.length, deps.length, deps.reduce((n, d) => n + d.communes.length, 0)];
  chips.forEach((c, i) => { c.textContent = counts[i]; });
});

function go(i) {
  current = Math.max(0, Math.min(STEPS.length - 1, i));
  document.querySelectorAll('.step').forEach((s, j) => s.classList.toggle('active', j === current));
  stepper.querySelectorAll('li').forEach((li, j) => {
    li.classList.toggle('active', j === current);
    li.classList.toggle('done', j < current);
    li.querySelector('.num').innerHTML = j < current ? icon('check') : String(j + 1);
  });
  prevBtn.style.visibility = current === 0 ? 'hidden' : 'visible';
  const last = current === STEPS.length - 1;
  nextBtn.hidden = last;
  submitBtn.hidden = !last;
  stepCount.textContent = `Étape ${current + 1} sur ${STEPS.length}`;
  if (last) renderReview();
  const wiz = document.getElementById('wizard');
  if (wiz.getBoundingClientRect().top < 0) wiz.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function validateStep(i) {
  const data = collect(form);
  const errs = quickCheck(data, STEPS[i].fields);
  if (STEPS[i].id === 'identite' && data.date_naissance) {
    const a = ageFrom(data.date_naissance);
    if (a == null || a < 0 || a > 120) errs.date_naissance = 'Date de naissance invalide.';
  }
  if (STEPS[i].id === 'review' && !data.consentement) errs.consentement = 'Votre consentement est nécessaire.';
  const first = showErrors(form, errs);
  if (first) {
    first.scrollIntoView({ behavior: 'smooth', block: 'center' });
    first.querySelector('input, select, textarea')?.focus({ preventScroll: true });
    return false;
  }
  return true;
}

function renderReview() {
  const d = collect(form);
  const row = (k, val) => (val ? `<dt>${k}</dt><dd>${esc(val)}</dd>` : '');
  const block = (title, step, rows) => `
    <div class="review-block"><h4>${title}<button type="button" data-goto="${step}">Modifier</button></h4><dl>${rows}</dl></div>`;
  const age = ageFrom(d.date_naissance);
  document.getElementById('review').innerHTML = [
    block('Identité', 0,
      row('Nom', `${d.prenom} ${d.nom}`) + row('Sexe', d.sexe === 'F' ? 'Femme' : d.sexe === 'M' ? 'Homme' : '') +
      row('Naissance', d.date_naissance ? `${fmtDate(d.date_naissance)} (${age} ans)` : '') +
      row('Lieu', d.lieu_naissance) + row('Situation', d.situation_matrimoniale)),
    block('Localisation & contact', 1,
      row('Région', d.region) + row('Département', d.departement) + row('Commune', d.commune) +
      row('Quartier', d.quartier) + row('Téléphone', `+221 ${formatPhone(d.telephone)}${d.whatsapp ? ' · WhatsApp' : ''}`) +
      row('E-mail', d.email)),
    block('Électeur', 2,
      row('Carte électeur', d.sans_carte ? 'Pas encore de carte' : d.carte_electeur) + row('CNI', d.cni) +
      row('Lieu de vote', [d.lieu_vote, d.bureau_vote && `bureau ${d.bureau_vote}`].filter(Boolean).join(' · '))),
    block('Organisation', 2,
      row('Section', d.section) + row('Fonction', d.fonction) + row('Profession', d.profession) +
      row('Instruction', d.niveau_instruction) + row('Urgence', [d.urgence_nom, d.urgence_tel && formatPhone(d.urgence_tel)].filter(Boolean).join(' · '))),
  ].join('');
}

document.getElementById('review')?.addEventListener('click', (e) => {
  const b = e.target.closest('[data-goto]');
  if (b) go(Number(b.dataset.goto));
});

prevBtn.addEventListener('click', () => go(current - 1));
nextBtn.addEventListener('click', () => { if (validateStep(current)) go(current + 1); });
stepper.addEventListener('click', (e) => {
  const li = e.target.closest('li');
  if (li && Number(li.dataset.i) < current) go(Number(li.dataset.i));
});
form.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && e.target.tagName === 'INPUT' && current < STEPS.length - 1) {
    e.preventDefault();
    nextBtn.click();
  }
});

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  for (let i = 0; i < STEPS.length; i++) {
    if (!validateStep(i)) { if (i !== current) { go(i); validateStep(i); } return; }
  }
  const data = collect(form);
  submitBtn.disabled = true;
  submitBtn.innerHTML = '<span class="spinner"></span> Envoi…';
  try {
    let res;
    try {
      res = await fetch('/api/inscriptions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'fetch' },
        body: JSON.stringify(data),
      });
    } catch {
      await saveOffline(data);
      return;
    }
    const body = await res.json().catch(() => ({}));
    if (res.ok) return showSuccess({ ...data, ...body });
    if (body.fields) {
      const idx = STEPS.findIndex((s) => Object.keys(body.fields).some((f) => s.fields.includes(f) || s.html().includes(`name="${f}"`)));
      if (idx >= 0) go(idx);
      showErrors(form, body.fields);
    }
    toast(body.error || 'L’inscription a échoué.', 'err');
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = 'Valider mon inscription';
  }
});

async function saveOffline(data) {
  await outbox.enqueue(data);
  try {
    const reg = await navigator.serviceWorker?.ready;
    await reg?.sync?.register('ahl-outbox');
  } catch { /* Background Sync non pris en charge : envoi au retour en ligne */ }
  showSuccess(data, true);
  refreshOutbox();
}

function showSuccess(m, offline = false) {
  const el = document.getElementById('success');
  document.getElementById('wizard').hidden = true;
  el.hidden = false;
  el.innerHTML = `
    <div class="success-icon ${offline ? 'pending' : ''}">${icon(offline ? 'wifiOff' : 'check')}</div>
    <h2>${offline ? 'Inscription enregistrée sur l’appareil' : `Bienvenue, ${esc(m.prenom)} !`}</h2>
    <p>${offline
      ? 'Vous êtes hors-ligne. L’inscription sera envoyée automatiquement dès le retour de la connexion.'
      : 'Votre inscription a bien été reçue. Elle sera validée par un responsable de l’organisation. Conservez votre matricule.'}</p>
    ${memberCard(m)}
    <div class="success-actions">
      ${offline ? '' : `<button class="btn" id="print-btn">${icon('printer')} Imprimer</button>`}
      <button class="btn btn-primary" id="again-btn">${icon('plus')} Inscrire une autre personne</button>
    </div>`;
  el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  el.querySelector('#print-btn')?.addEventListener('click', () => print());
  el.querySelector('#again-btn').addEventListener('click', reset);
}

function reset() {
  form.reset();
  form.querySelector('[name="photo"]').value = '';
  form.querySelector('.photo-preview').hidden = true;
  form.querySelector('.photo-empty').hidden = false;
  form.querySelector('.photo-remove').hidden = true;
  form.querySelector('[name="carte_electeur"]').disabled = false;
  cascade.set({});
  showErrors(form, {});
  document.getElementById('success').hidden = true;
  document.getElementById('wizard').hidden = false;
  go(0);
}

// ---- File hors-ligne ----
async function refreshOutbox() {
  const box = document.getElementById('outbox');
  let items = [];
  try { items = await outbox.list(); } catch { /* IndexedDB indisponible */ }
  box.hidden = !items.length;
  if (!items.length) return;
  const waiting = items.filter((i) => !i.error).length;
  box.innerHTML = `
    <div class="outbox-head">${icon('upload')}
      <span class="grow">${waiting ? `${waiting} inscription(s) en attente d’envoi` : 'Inscriptions à corriger'}</span>
      ${waiting ? `<button class="btn btn-sm" id="sync-btn">${icon('refresh')} Envoyer maintenant</button>` : ''}
    </div>
    ${items.filter((i) => i.error).map((i) => `
      <div class="outbox-item" data-id="${i.id}">
        <strong>${esc(i.payload.prenom)} ${esc(i.payload.nom)}</strong>
        <span class="tiny">${fmtDate(i.created_at)}</span>
        <span style="flex:1"></span>
        <button class="btn btn-sm" data-act="edit">${icon('edit')} Corriger</button>
        <button class="btn btn-sm btn-danger-ghost" data-act="del">${icon('trash')}</button>
        <span class="err">${esc(i.error)}</span>
      </div>`).join('')}`;
}

document.getElementById('outbox').addEventListener('click', async (e) => {
  if (e.target.closest('#sync-btn')) return sync(true);
  const b = e.target.closest('[data-act]');
  if (!b) return;
  const id = Number(b.closest('[data-id]').dataset.id);
  const item = (await outbox.list()).find((i) => i.id === id);
  if (!item) return;
  if (b.dataset.act === 'edit') {
    reset();
    fill(item.payload);
    await outbox.remove(id);
    toast('Corrigez les informations puis validez à nouveau.');
  } else {
    await outbox.remove(id);
  }
  refreshOutbox();
});

function fill(p) {
  for (const [k, val] of Object.entries(p)) {
    const el = form.elements.namedItem(k);
    if (!el || ['region', 'departement', 'commune'].includes(k)) continue;
    if (el instanceof RadioNodeList) { for (const r of el) r.checked = r.value === val; }
    else if (el.type === 'checkbox') el.checked = Boolean(val);
    else el.value = val ?? '';
  }
  cascade.set(p);
  if (p.photo) {
    const img = form.querySelector('.photo-preview');
    img.src = p.photo; img.hidden = false;
    form.querySelector('.photo-empty').hidden = true;
    form.querySelector('.photo-remove').hidden = false;
  }
  form.querySelector('[name="carte_electeur"]').disabled = Boolean(p.sans_carte);
}

async function sync(manual = false) {
  if (!navigator.onLine) { if (manual) toast('Toujours hors-ligne.', 'err'); return; }
  try {
    const { sent, failed } = await outbox.flush();
    if (sent) toast(`${sent} inscription(s) hors-ligne envoyée(s).`, 'ok');
    if (failed && manual) toast('Certaines inscriptions doivent être corrigées.', 'err');
  } catch { /* réessai plus tard */ }
  refreshOutbox();
}

navigator.serviceWorker?.addEventListener('message', (e) => {
  if (e.data?.type === 'outbox-synced') { toast(`${e.data.sent} inscription(s) hors-ligne envoyée(s).`, 'ok'); refreshOutbox(); }
});

const pill = document.getElementById('net-pill');
watchOnline((on) => {
  pill.className = `net-pill${on ? '' : ' off'}`;
  pill.innerHTML = `${icon(on ? 'wifi' : 'wifiOff')}${on ? 'En ligne' : 'Hors-ligne'}`;
  if (on) sync();
});

go(0);
refreshOutbox();
