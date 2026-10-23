import { esc, icon, fmtDateTime, timeAgo } from '../ui.js';
import { api } from './api.js';

const ACTIONS = {
  inscription: ['Nouvelle inscription publique', 'plus', 'brand'],
  creation: ['Fiche créée', 'plus', 'brand'],
  modification: ['Fiche modifiée', 'edit', 'blue'],
  suppression: ['Fiche supprimée', 'trash', 'red'],
  suppression_groupee: ['Suppression groupée', 'trash', 'red'],
  statut_groupe: ['Changement de statut', 'check', 'green'],
  export_csv: ['Export CSV', 'download', 'amber'],
  connexion: ['Connexion', 'lock', 'green'],
  connexion_echouee: ['Échec de connexion', 'alert', 'red'],
  mot_de_passe_modifie: ['Mot de passe modifié', 'key', 'blue'],
  utilisateur_cree: ['Utilisateur créé', 'users', 'brand'],
  utilisateur_modifie: ['Utilisateur modifié', 'users', 'blue'],
  utilisateur_supprime: ['Utilisateur supprimé', 'users', 'red'],
};

function describe(a) {
  const d = a.details || {};
  if (d.matricule) return `${d.matricule}${d.nom ? ` · ${d.nom}` : ''}`;
  if (a.action === 'export_csv') return `${d.lignes} ligne(s) exportée(s)`;
  if (a.action === 'statut_groupe') return `${d.n} fiche(s) → ${d.statut}`;
  if (a.action === 'suppression_groupee') return `${d.n} fiche(s)`;
  if (d.email) return d.email;
  return '';
}

export async function render(view, { query }) {
  const page = Number(query.page) || 1;
  const data = await api('/api/audit', { query: { page, limit: 50 } });
  view.innerHTML = `
    <div class="view-head"><div><h1>Journal d’activité</h1><p>Traçabilité des connexions et des opérations sur les fiches.</p></div></div>
    <section class="card">
      <ul class="timeline">
        ${data.items.map((a) => {
          const [label, ic, tone] = ACTIONS[a.action] || [a.action, 'log', 'gray'];
          return `<li>
            <span class="t-ico tone-${tone}">${icon(ic)}</span>
            <div class="t-main"><strong>${esc(label)}</strong>
              <span>${esc(a.user_nom || '—')}${describe(a) ? ` · ${esc(describe(a))}` : ''}${a.ip ? ` · IP ${esc(a.ip)}` : ''}</span></div>
            <span class="t-time" title="${esc(fmtDateTime(a.created_at))}">${timeAgo(a.created_at)}</span>
          </li>`;
        }).join('') || `<li><div class="empty">${icon('log')} Aucune activité</div></li>`}
      </ul>
      <div class="pager"><span>${data.total} événement(s)</span>
        <div class="pages">
          <button ${page <= 1 ? 'disabled' : ''} data-p="${page - 1}">‹</button>
          <button class="on">${page}</button>
          <button ${page >= data.pages ? 'disabled' : ''} data-p="${page + 1}">›</button>
        </div></div>
    </section>`;
  view.querySelector('.pages').addEventListener('click', (e) => {
    const b = e.target.closest('[data-p]');
    if (b && !b.disabled) location.hash = `#/journal?page=${b.dataset.p}`;
  });
}
