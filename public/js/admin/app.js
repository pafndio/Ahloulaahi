import { esc, icon, toast, initTheme, toggleTheme, avatarHue, initials } from '../ui.js';
import { registerSW, watchOnline } from '../pwa.js';
import { ROLES } from '../schema.js';
import { api, onAuthLost } from './api.js';
import { destroyCharts } from './widgets.js';
import { passwordForm } from './account.js';

initTheme();
registerSW();

const root = document.getElementById('root');
export const state = { user: null, pending: 0 };
export const can = (role) => ({ lecteur: 1, editeur: 2, admin: 3 }[state.user?.role] >= { lecteur: 1, editeur: 2, admin: 3 }[role]);

const VIEWS = {
  tableau: { title: 'Tableau de bord', icon: 'grid', load: () => import('./dashboard.js') },
  membres: { title: 'Membres', icon: 'users', load: () => import('./members.js') },
  utilisateurs: { title: 'Utilisateurs', icon: 'shield', load: () => import('./users.js'), role: 'admin' },
  journal: { title: 'Journal d’activité', icon: 'log', load: () => import('./audit.js'), role: 'admin' },
  compte: { title: 'Mon compte', icon: 'key', load: () => import('./account.js') },
};

// ---------- Connexion ----------
function renderLogin(message) {
  destroyCharts();
  root.innerHTML = `
  <div class="login">
    <section class="login-art pattern-dark">
      <div class="brand"><img src="/icons/logo.svg" alt=""> Ahlou Lahi</div>
      <div>
        <div class="ar-big ar" lang="ar">أهل الله</div>
        <h1>Registre des membres</h1>
        <p>Pilotez la communauté sur tout le territoire : inscriptions, validations, cartographie et statistiques en temps réel.</p>
        <ul class="login-feats">
          <li>${icon('map')} 14 régions, 46 départements, 553 communes</li>
          <li>${icon('shield')} Accès protégé, sessions chiffrées et journalisées</li>
          <li>${icon('trend')} Tableau de bord et exports en un clic</li>
        </ul>
      </div>
      <p class="tiny" style="color:rgba(255,255,255,.55)">© ${new Date().getFullYear()} Ahlou Lahi</p>
      <span class="orb" aria-hidden="true"></span>
    </section>
    <section class="login-panel">
      <form class="login-box" id="login-form" novalidate>
        <span class="lock">${icon('lock')}</span>
        <div><h2>Connexion sécurisée</h2><p class="muted">Espace réservé aux responsables autorisés.</p></div>
        <div id="login-alert">${message ? `<div class="alert alert-info">${icon('alert')}<span>${esc(message)}</span></div>` : ''}</div>
        <div class="field"><label for="l-email">Adresse e-mail</label>
          <input class="input" id="l-email" name="email" type="email" autocomplete="username" required autofocus></div>
        <div class="field"><label for="l-pw">Mot de passe</label>
          <div class="pw-wrap"><input class="input" id="l-pw" name="password" type="password" autocomplete="current-password" required>
          <button type="button" id="pw-toggle" aria-label="Afficher le mot de passe">${icon('eye')}</button></div></div>
        <button class="btn btn-primary btn-block" type="submit" id="login-btn">${icon('lock')} Se connecter</button>
        <a class="tiny" href="/">← Retour au formulaire d’inscription</a>
      </form>
    </section>
  </div>`;
  const form = document.getElementById('login-form');
  document.getElementById('pw-toggle').addEventListener('click', () => {
    const pw = document.getElementById('l-pw');
    pw.type = pw.type === 'password' ? 'text' : 'password';
  });
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = document.getElementById('login-btn');
    const alertBox = document.getElementById('login-alert');
    const fd = new FormData(form);
    if (!fd.get('email') || !fd.get('password')) {
      alertBox.innerHTML = `<div class="alert alert-err">${icon('alert')}<span>Saisissez votre e-mail et votre mot de passe.</span></div>`;
      return;
    }
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner"></span> Connexion…';
    try {
      const { user } = await api('/api/auth/login', { method: 'POST', body: { email: fd.get('email'), password: fd.get('password') } });
      state.user = user;
      start();
    } catch (err) {
      alertBox.innerHTML = `<div class="alert alert-err">${icon('alert')}<span>${esc(err.message)}</span></div>`;
      btn.disabled = false;
      btn.innerHTML = `${icon('lock')} Se connecter`;
      document.getElementById('l-pw').select();
    }
  });
}

function renderForcedPassword() {
  root.innerHTML = `
  <div class="login">
    <section class="login-art pattern-dark">
      <div class="brand"><img src="/icons/logo.svg" alt=""> Ahlou Lahi</div>
      <div><div class="ar-big ar" lang="ar">أهل الله</div><h1>Sécurisez votre compte</h1>
      <p>Pour votre première connexion, choisissez un mot de passe personnel. Il ne doit être communiqué à personne.</p></div>
      <span></span>
    </section>
    <section class="login-panel"><div class="login-box">
      <span class="lock">${icon('key')}</span>
      <div><h2>Nouveau mot de passe</h2><p class="muted">Bonjour ${esc(state.user.nom)}, une dernière étape.</p></div>
      <div id="pw-host"></div>
      <button class="btn btn-ghost" id="logout-link">${icon('logout')} Se déconnecter</button>
    </div></section>
  </div>`;
  passwordForm(document.getElementById('pw-host'), () => {
    state.user.must_change_password = false;
    toast('Mot de passe mis à jour.', 'ok');
    start();
  });
  document.getElementById('logout-link').addEventListener('click', logout);
}

async function logout() {
  try { await api('/api/auth/logout', { method: 'POST' }); } catch { /* déjà déconnecté */ }
  state.user = null;
  location.hash = '';
  renderLogin('Vous êtes déconnecté.');
}

onAuthLost((err) => {
  if (err.body?.code === 'PASSWORD_CHANGE_REQUIRED') { renderForcedPassword(); return; }
  state.user = null;
  renderLogin('Votre session a expiré. Veuillez vous reconnecter.');
});

// ---------- Coquille ----------
function renderShell() {
  const u = state.user;
  const role = ROLES.find((r) => r.value === u.role)?.label;
  const navItems = Object.entries(VIEWS).filter(([, v]) => !v.role || can(v.role));
  root.innerHTML = `
  <div class="shell" id="shell">
    <aside class="sidebar pattern-dark" id="sidebar">
      <a class="brand" href="#/tableau"><img src="/icons/logo.svg" alt="">
        <span><strong>Ahlou Lahi</strong><small class="ar" lang="ar">أهل الله</small></span></a>
      <nav class="nav" aria-label="Navigation principale">
        <div class="nav-label">Pilotage</div>
        ${navItems.slice(0, 2).map(([k, v]) => `<a href="#/${k}" data-nav="${k}">${icon(v.icon)} ${v.title}${k === 'membres' ? '<span class="count" id="pending-count" hidden></span>' : ''}</a>`).join('')}
        <div class="nav-label">Administration</div>
        ${navItems.slice(2).map(([k, v]) => `<a href="#/${k}" data-nav="${k}">${icon(v.icon)} ${v.title}</a>`).join('')}
        <a href="/" target="_blank" rel="noopener">${icon('plus')} Formulaire public</a>
      </nav>
      <div class="sidebar-foot">
        <div class="who"><span class="avatar sm" style="--h:${avatarHue(u.nom)}">${esc(initials(...u.nom.split(' ')))}</span>
          <div><strong>${esc(u.nom)}</strong><small>${esc(role)}</small></div></div>
        <div class="actions">
          <button class="btn btn-sm" id="theme-btn" title="Changer de thème">${icon('moon')}</button>
          <button class="btn btn-sm" id="logout-btn">${icon('logout')} Quitter</button>
        </div>
      </div>
    </aside>
    <div class="main-col">
      <header class="topnav">
        <button class="btn btn-ghost btn-icon menu-btn" id="menu-btn" aria-label="Menu">${icon('menu')}</button>
        <form class="gsearch" id="gsearch" role="search">
          ${icon('search')}
          <input class="input" type="search" name="q" placeholder="Rechercher un membre…" title="Nom, téléphone, n° électeur, CNI, matricule…" aria-label="Recherche globale">
          <kbd>Ctrl K</kbd>
        </form>
        <span class="spacer"></span>
        <span class="net-dot" id="net-dot"><span>En ligne</span></span>
      </header>
      <main class="view" id="view" tabindex="-1"></main>
    </div>
  </div>`;

  const shell = document.getElementById('shell');
  document.getElementById('menu-btn').addEventListener('click', () => shell.classList.toggle('nav-open'));
  shell.addEventListener('click', (e) => {
    if (e.target === shell || e.target.closest('.nav a')) shell.classList.remove('nav-open');
  });
  document.getElementById('logout-btn').addEventListener('click', logout);
  document.getElementById('theme-btn').addEventListener('click', () => {
    toggleTheme();
    route();
  });
  const gs = document.getElementById('gsearch');
  gs.addEventListener('submit', (e) => {
    e.preventDefault();
    const q = gs.q.value.trim();
    location.hash = `#/membres${q ? `?q=${encodeURIComponent(q)}` : ''}`;
  });
  watchOnline((on) => {
    const d = document.getElementById('net-dot');
    if (!d) return;
    d.classList.toggle('off', !on);
    d.querySelector('span').textContent = on ? 'En ligne' : 'Hors-ligne';
  });
}

document.addEventListener('keydown', (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
    const i = document.querySelector('#gsearch input');
    if (i) { e.preventDefault(); i.focus(); i.select(); }
  }
});

export function setPending(n) {
  state.pending = n;
  const el = document.getElementById('pending-count');
  if (!el) return;
  el.hidden = !n;
  el.textContent = n > 99 ? '99+' : String(n);
  el.title = `${n} inscription(s) en attente de validation`;
}

export function parseHash() {
  const h = location.hash.replace(/^#\/?/, '');
  const [path, query = ''] = h.split('?');
  const parts = path.split('/').filter(Boolean);
  return { name: parts[0] || 'tableau', id: parts[1], query: Object.fromEntries(new URLSearchParams(query)) };
}

let routeToken = 0;
async function route() {
  if (!state.user || !document.getElementById('view')) return;
  const { name, id, query } = parseHash();
  const v = VIEWS[name] && (!VIEWS[name].role || can(VIEWS[name].role)) ? VIEWS[name] : VIEWS.tableau;
  const key = VIEWS[name] === v ? name : 'tableau';
  document.querySelectorAll('[data-nav]').forEach((a) => a.classList.toggle('active', a.dataset.nav === key));
  document.title = `${v.title} — Ahlou Lahi`;
  const gs = document.querySelector('#gsearch input');
  if (gs && key === 'membres') gs.value = query.q || '';
  const token = ++routeToken;
  const mod = await v.load();
  if (token !== routeToken) return;
  destroyCharts();
  const view = document.getElementById('view');
  await mod.render(view, { id, query, key });
}

addEventListener('hashchange', route);

async function start() {
  if (state.user.must_change_password) return renderForcedPassword();
  renderShell();
  await route();
  try {
    const s = await api('/api/members', { query: { statut: 'en_attente', limit: 1 } });
    setPending(s.total);
  } catch { /* ignoré */ }
}

(async () => {
  try {
    const { user } = await api('/api/auth/me');
    state.user = user;
    start();
  } catch (err) {
    renderLogin(err.status === 0 ? err.message : '');
  }
})();
