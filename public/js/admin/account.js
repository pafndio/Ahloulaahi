import { esc, icon, toast } from '../ui.js';
import { ROLES } from '../schema.js';
import { api } from './api.js';
import { showErrors } from '../member-fields.js';
import { state } from './app.js';

function strength(pw) {
  let s = 0;
  if (pw.length >= 10) s++;
  if (pw.length >= 14) s++;
  s += [/[a-z]/, /[A-Z]/, /\d/, /[^A-Za-z0-9]/].filter((r) => r.test(pw)).length;
  return Math.min(5, s);
}

// Formulaire de changement de mot de passe (réutilisé à la première connexion).
export function passwordForm(host, onDone) {
  host.innerHTML = `
    <form class="pw-form" novalidate style="display:flex;flex-direction:column;gap:14px">
      <div class="field" data-field="current"><label for="p-cur">Mot de passe actuel</label>
        <input class="input" id="p-cur" name="current" type="password" autocomplete="current-password" required></div>
      <div class="field" data-field="next"><label for="p-new">Nouveau mot de passe</label>
        <input class="input" id="p-new" name="next" type="password" autocomplete="new-password" required minlength="10">
        <div class="pw-meter"><span></span></div>
        <span class="field-hint">10 caractères minimum, avec au moins 3 types : minuscules, majuscules, chiffres, symboles.</span></div>
      <div class="field" data-field="confirm"><label for="p-conf">Confirmer le nouveau mot de passe</label>
        <input class="input" id="p-conf" name="confirm" type="password" autocomplete="new-password" required></div>
      <button class="btn btn-primary" type="submit">${icon('check')} Enregistrer le mot de passe</button>
    </form>`;
  const form = host.querySelector('form');
  const bar = form.querySelector('.pw-meter span');
  form.next.addEventListener('input', () => {
    const s = strength(form.next.value);
    bar.style.width = `${(s / 5) * 100}%`;
    bar.style.background = s <= 2 ? 'var(--danger)' : s <= 3 ? 'var(--warning)' : 'var(--success)';
  });
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (form.next.value !== form.confirm.value) {
      showErrors(form, { confirm: 'Les mots de passe ne correspondent pas.' });
      return;
    }
    const btn = form.querySelector('button[type=submit]');
    btn.disabled = true;
    try {
      await api('/api/auth/password', { method: 'POST', body: { current: form.current.value, next: form.next.value } });
      form.reset();
      bar.style.width = '0';
      showErrors(form, {});
      onDone?.();
    } catch (err) {
      showErrors(form, err.body.fields || {});
      if (!err.body.fields) toast(err.message, 'err');
    } finally { btn.disabled = false; }
  });
}

export async function render(view) {
  const u = state.user;
  view.innerHTML = `
    <div class="view-head"><div><h1>Mon compte</h1><p>Informations de connexion et sécurité.</p></div></div>
    <div class="dash-grid">
      <section class="card panel col-5">
        <div class="panel-head"><div><h2>Profil</h2><p>Géré par un administrateur.</p></div></div>
        <div class="info-sec"><dl>
          <dt>Nom</dt><dd>${esc(u.nom)}</dd>
          <dt>E-mail</dt><dd>${esc(u.email)}</dd>
          <dt>Rôle</dt><dd>${esc(ROLES.find((r) => r.value === u.role)?.label)}</dd>
          <dt>Session</dt><dd>Expire après 8 h d’inactivité</dd>
        </dl></div>
      </section>
      <section class="card panel col-7">
        <div class="panel-head"><div><h2>Changer le mot de passe</h2><p>Les autres sessions ouvertes seront déconnectées.</p></div></div>
        <div id="pw-host"></div>
      </section>
    </div>`;
  passwordForm(view.querySelector('#pw-host'), () => toast('Mot de passe mis à jour.', 'ok'));
}
