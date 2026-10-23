import { esc, initials } from './ui.js';

// Carte de membre (aperçu après inscription et fiche admin).
export function memberCard(m) {
  return `
  <div class="member-card pattern-dark">
    <div class="mc-top"><strong>Ahlou Lahi</strong><span class="ar" lang="ar">أهل الله</span></div>
    <div class="mc-photo">${m.photo ? `<img src="${esc(m.photo)}" alt="">` : esc(initials(m.prenom, m.nom))}</div>
    <div class="mc-id">
      <div class="mc-name">${esc(m.prenom)} ${esc(m.nom)}</div>
      <div class="mc-place">${esc(m.commune)}${m.region ? ` · ${esc(m.region)}` : ''}</div>
      ${m.fonction ? `<div class="mc-place">${esc(m.fonction)}</div>` : ''}
    </div>
    <div class="mc-foot">
      <div><small>Matricule</small><b>${esc(m.matricule || 'EN ATTENTE')}</b></div>
      <div style="text-align:right"><small>Membre</small><b>${new Date(m.created_at || Date.now()).getFullYear()}</b></div>
    </div>
  </div>`;
}
