import { esc, icon, toast, fmtDateTime, avatarHue, initials } from '../ui.js';
import { ROLES } from '../schema.js';
import { api } from './api.js';
import { state } from './app.js';
import { modal, confirmDialog } from './widgets.js';
import { showErrors } from '../member-fields.js';

const ROLE_INFO = {
  admin: { tone: 'brand', desc: 'Accès complet, gestion des comptes et du journal.' },
  editeur: { tone: 'blue', desc: 'Consulte, crée, modifie, valide et exporte les fiches.' },
  lecteur: { tone: 'gray', desc: 'Consultation du tableau de bord et des fiches.' },
};

export async function render(view) {
  view.innerHTML = `
    <div class="view-head">
      <div><h1>Utilisateurs</h1><p>Comptes autorisés à accéder à l’administration.</p></div>
      <div class="actions"><button class="btn btn-primary" id="new-user">${icon('plus')} Nouvel utilisateur</button></div>
    </div>
    <div class="kpis">${ROLES.map((r) => `
      <div class="card kpi"><div class="kpi-top"><span class="kpi-label">${r.label}</span>
        <span class="kpi-ico tone-${ROLE_INFO[r.value].tone}">${icon(r.value === 'admin' ? 'shield' : r.value === 'editeur' ? 'edit' : 'eye')}</span></div>
        <div class="kpi-value" data-role-count="${r.value}">—</div><div class="kpi-sub">${ROLE_INFO[r.value].desc}</div></div>`).join('')}</div>
    <section class="card table-card"><div class="table-wrap" style="display:block"><table class="data">
      <thead><tr><th>Utilisateur</th><th>Rôle</th><th>État</th><th>Dernière connexion</th><th></th></tr></thead>
      <tbody id="u-body"></tbody></table></div></section>`;

  const load = async () => {
    const users = await api('/api/users');
    for (const r of ROLES) view.querySelector(`[data-role-count="${r.value}"]`).textContent = users.filter((u) => u.role === r.value).length;
    view.querySelector('#u-body').innerHTML = users.map((u) => `
      <tr data-id="${u.id}">
        <td><div class="who-cell"><span class="avatar sm" style="--h:${avatarHue(u.nom)}">${esc(initials(...u.nom.split(' ')))}</span>
          <div><strong>${esc(u.nom)}${u.id === state.user.id ? ' <span class="badge tone-brand plain">vous</span>' : ''}</strong><span>${esc(u.email)}</span></div></div></td>
        <td><span class="badge tone-${ROLE_INFO[u.role].tone} plain">${esc(ROLES.find((r) => r.value === u.role).label)}</span></td>
        <td>${u.actif ? '<span class="badge tone-green">Actif</span>' : '<span class="badge tone-red">Désactivé</span>'}
          ${u.must_change_password ? '<span class="cell-sub">Mot de passe à changer</span>' : ''}</td>
        <td>${u.last_login ? fmtDateTime(u.last_login) : '<span class="muted">Jamais</span>'}</td>
        <td><div class="row-actions">
          <button class="btn btn-ghost btn-sm btn-icon" data-act="edit" title="Modifier">${icon('edit')}</button>
          ${u.id !== state.user.id ? `<button class="btn btn-danger-ghost btn-sm btn-icon" data-act="del" title="Supprimer">${icon('trash')}</button>` : ''}
        </div></td>
      </tr>`).join('');
    return users;
  };
  let users = await load();

  view.querySelector('#new-user').addEventListener('click', () => openUser(null, async () => { users = await load(); }));
  view.querySelector('#u-body').addEventListener('click', async (e) => {
    const tr = e.target.closest('[data-id]');
    if (!tr) return;
    const u = users.find((x) => x.id === Number(tr.dataset.id));
    const act = e.target.closest('[data-act]')?.dataset.act || 'edit';
    if (act === 'edit') return openUser(u, async () => { users = await load(); });
    if (await confirmDialog({ title: 'Supprimer le compte', message: `Supprimer le compte de ${u.nom} ? Ses sessions seront fermées.`, confirm: 'Supprimer', danger: true })) {
      try { await api(`/api/users/${u.id}`, { method: 'DELETE' }); toast('Compte supprimé.', 'ok'); users = await load(); }
      catch (err) { toast(err.message, 'err'); }
    }
  });
}

function openUser(u, onSaved) {
  const editing = Boolean(u);
  const md = modal({
    title: editing ? `Modifier — ${u.nom}` : 'Nouvel utilisateur',
    size: 'sm',
    body: `<form class="modal-body" novalidate style="display:flex;flex-direction:column;gap:14px">
      <div class="field" data-field="nom"><label for="u-nom">Nom complet</label><input class="input" id="u-nom" name="nom" value="${esc(u?.nom)}" required></div>
      <div class="field" data-field="email"><label for="u-email">E-mail</label><input class="input" id="u-email" name="email" type="email" value="${esc(u?.email)}" required autocomplete="off"></div>
      <div class="field" data-field="role"><label for="u-role">Rôle</label><select class="select" id="u-role" name="role">
        ${ROLES.map((r) => `<option value="${r.value}"${(u?.role || 'editeur') === r.value ? ' selected' : ''}>${r.label} — ${ROLE_INFO[r.value].desc}</option>`).join('')}</select></div>
      <div class="field" data-field="password"><label for="u-pw">${editing ? 'Nouveau mot de passe (facultatif)' : 'Mot de passe provisoire'}</label>
        <input class="input" id="u-pw" name="password" type="text" autocomplete="new-password" ${editing ? '' : 'required'}>
        <span class="field-hint">L’utilisateur devra le changer à sa prochaine connexion.</span>
        <button type="button" class="btn btn-sm btn-ghost" id="gen-pw" style="align-self:flex-start">${icon('sparkles')} Générer</button></div>
      ${editing ? `<label class="switch"><input type="checkbox" name="actif" ${u.actif ? 'checked' : ''} ${u.id === state.user.id ? 'disabled' : ''}><span class="track"></span> Compte actif</label>` : ''}
    </form>`,
    foot: `<button class="btn" data-close>Annuler</button><button class="btn btn-primary" id="u-save">${icon('check')} Enregistrer</button>`,
  });
  const form = md.el.querySelector('form');
  md.el.querySelector('#gen-pw').addEventListener('click', () => {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
    const rnd = crypto.getRandomValues(new Uint32Array(12));
    form.password.value = `${[...rnd].map((n) => chars[n % chars.length]).join('')}-${(rnd[0] % 90) + 10}`;
  });
  md.el.querySelector('#u-save').addEventListener('click', async () => {
    const body = { nom: form.nom.value.trim(), email: form.email.value.trim(), role: form.role.value, password: form.password.value || undefined };
    body.actif = form.actif ? form.actif.checked || form.actif.disabled : true;
    try {
      await api(editing ? `/api/users/${u.id}` : '/api/users', { method: editing ? 'PUT' : 'POST', body });
      toast(editing ? 'Compte mis à jour.' : 'Compte créé. Communiquez le mot de passe provisoire de façon sécurisée.', 'ok');
      md.close();
      onSaved();
    } catch (err) {
      showErrors(form, err.body.fields || {});
      toast(err.message, 'err');
    }
  });
}
