import { esc, icon, toast, fmtDate, fmtDateTime, fmtNum } from '../ui.js';
import { STATUTS, FONCTIONS, NIVEAUX, formatPhone, ageFrom } from '../schema.js';
import { bindCascade } from '../geo.js';
import {
  sectionIdentite, sectionLocalisation, sectionContact, sectionCivique, sectionOrganisation, sectionAdmin,
  enhance, collect, showErrors, quickCheck,
} from '../member-fields.js';
import { memberCard } from '../card.js';
import { api, qs } from './api.js';
import { can, parseHash, setPending } from './app.js';
import { modal, drawer, confirmDialog, avatar } from './widgets.js';

const ST = Object.fromEntries(STATUTS.map((s) => [s.value, s]));
const badge = (s) => `<span class="badge tone-${ST[s]?.tone || 'gray'}">${ST[s]?.label || esc(s)}</span>`;
const FILTER_KEYS = ['q', 'region', 'departement', 'commune', 'sexe', 'statut', 'fonction', 'niveau_instruction', 'carte', 'age_min', 'age_max', 'from', 'to'];
const FILTER_LABEL = {
  q: 'Recherche', region: 'Région', departement: 'Département', commune: 'Commune', sexe: 'Sexe', statut: 'Statut',
  fonction: 'Fonction', niveau_instruction: 'Instruction', carte: 'Carte électeur', age_min: 'Âge min', age_max: 'Âge max',
  from: 'Inscrit depuis', to: 'Inscrit jusqu’au',
};
const showValue = (k, v) => (k === 'sexe' ? (v === 'F' ? 'Femmes' : 'Hommes')
  : k === 'statut' ? ST[v]?.label : k === 'carte' ? (v === 'oui' ? 'Avec carte' : 'Sans carte')
    : k === 'from' || k === 'to' ? fmtDate(v) : v);

let selected = new Set();
let lastQuery = {};

export async function render(view, { id, query }) {
  const f = Object.fromEntries(FILTER_KEYS.map((k) => [k, query[k] || '']));
  const page = Number(query.page) || 1;
  const sort = query.sort || 'created_at';
  const dir = query.dir || 'desc';
  const limit = Number(query.limit) || 25;
  const showFilters = FILTER_KEYS.slice(1).some((k) => f[k]) || query.filtres === '1';
  selected = new Set();

  view.innerHTML = `
    <div class="view-head">
      <div><h1>Membres</h1><p id="count-line">Chargement…</p></div>
      <div class="actions">
        ${can('editeur') ? `<a class="btn" id="export-btn" href="/api/members/export.csv?${qs(f)}" download>${icon('download')} Exporter CSV</a>` : ''}
        ${can('editeur') ? `<button class="btn btn-primary" id="new-btn">${icon('plus')} Nouveau membre</button>` : ''}
      </div>
    </div>
    <div class="toolbar">
      <form class="gsearch" id="m-search" role="search" style="flex:1">
        ${icon('search')}
        <input class="input" type="search" name="q" value="${esc(f.q)}" placeholder="Nom, téléphone, n° électeur, CNI, matricule, quartier…" aria-label="Rechercher des membres" autocomplete="off">
      </form>
      <button class="btn ${showFilters ? 'btn-primary' : ''}" id="toggle-filters" aria-expanded="${showFilters}">${icon('filter')} Filtres avancés</button>
    </div>
    <form class="card filters" id="filters" ${showFilters ? '' : 'hidden'}>
      <div class="field"><label for="ff-region">Région</label><select class="select" id="ff-region" name="region"></select></div>
      <div class="field"><label for="ff-dep">Département</label><select class="select" id="ff-dep" name="departement"></select></div>
      <div class="field"><label for="ff-com">Commune</label><select class="select" id="ff-com" name="commune"></select></div>
      <div class="field"><label for="ff-sexe">Sexe</label><select class="select" id="ff-sexe" name="sexe">
        <option value="">Tous</option><option value="M"${f.sexe === 'M' ? ' selected' : ''}>Hommes</option><option value="F"${f.sexe === 'F' ? ' selected' : ''}>Femmes</option></select></div>
      <div class="field"><label for="ff-statut">Statut</label><select class="select" id="ff-statut" name="statut">
        <option value="">Tous</option>${STATUTS.map((s) => `<option value="${s.value}"${f.statut === s.value ? ' selected' : ''}>${s.label}</option>`).join('')}</select></div>
      <div class="field"><label for="ff-fonction">Fonction</label><select class="select" id="ff-fonction" name="fonction">
        <option value="">Toutes</option>${FONCTIONS.map((x) => `<option${f.fonction === x ? ' selected' : ''}>${esc(x)}</option>`).join('')}</select></div>
      <div class="field"><label for="ff-niv">Instruction</label><select class="select" id="ff-niv" name="niveau_instruction">
        <option value="">Tous</option>${NIVEAUX.map((x) => `<option${f.niveau_instruction === x ? ' selected' : ''}>${esc(x)}</option>`).join('')}</select></div>
      <div class="field"><label for="ff-carte">Carte d’électeur</label><select class="select" id="ff-carte" name="carte">
        <option value="">Indifférent</option><option value="oui"${f.carte === 'oui' ? ' selected' : ''}>Avec carte</option><option value="non"${f.carte === 'non' ? ' selected' : ''}>Sans carte</option></select></div>
      <div class="field"><label for="ff-amin">Âge</label>
        <div style="display:flex;gap:6px"><input class="input" id="ff-amin" name="age_min" type="number" min="0" max="120" placeholder="min" value="${esc(f.age_min)}">
        <input class="input" name="age_max" type="number" min="0" max="120" placeholder="max" value="${esc(f.age_max)}" aria-label="Âge maximum"></div></div>
      <div class="field"><label for="ff-from">Inscrit du</label><input class="input" id="ff-from" name="from" type="date" value="${esc(f.from)}"></div>
      <div class="field"><label for="ff-to">au</label><input class="input" id="ff-to" name="to" type="date" value="${esc(f.to)}"></div>
      <div class="f-actions"><button type="button" class="btn btn-ghost" id="reset-filters">${icon('refresh')} Réinitialiser</button></div>
    </form>
    <div class="chips" id="chips">${FILTER_KEYS.filter((k) => f[k]).map((k) => `
      <span class="chip-f">${FILTER_LABEL[k]} : ${esc(showValue(k, f[k]))}<button data-rm="${k}" aria-label="Retirer le filtre ${FILTER_LABEL[k]}">${icon('x')}</button></span>`).join('')}</div>
    <section class="card table-card">
      <div class="table-wrap"><table class="data">
        <thead><tr>
          <th class="cb"><input type="checkbox" id="cb-all" aria-label="Tout sélectionner"></th>
          ${th('nom', 'Membre', sort, dir)}
          <th>Contact</th>
          <th>Carte électeur</th>
          ${th('region', 'Localisation', sort, dir)}
          ${th('date_naissance', 'Âge', sort, dir)}
          ${th('statut', 'Statut', sort, dir)}
          ${th('created_at', 'Inscription', sort, dir)}
          <th></th>
        </tr></thead>
        <tbody id="tbody"><tr><td colspan="9"><div class="skeleton" style="height:180px"></div></td></tr></tbody>
      </table></div>
      <div class="m-cards" id="mcards"></div>
      <div class="pager" id="pager"></div>
    </section>
    <div id="bulk-host"></div>`;

  const go = (patch) => {
    const next = { ...f, page, sort, dir, limit, ...patch };
    if (showFiltersState()) next.filtres = '1';
    if (next.page === 1) delete next.page;
    if (next.sort === 'created_at') delete next.sort;
    if (next.dir === 'desc') delete next.dir;
    if (next.limit === 25) delete next.limit;
    location.hash = `#/membres?${qs(next)}`;
  };
  const showFiltersState = () => !view.querySelector('#filters').hidden;

  // Recherche instantanée (avec temporisation).
  const search = view.querySelector('#m-search');
  let t;
  search.q.addEventListener('input', () => { clearTimeout(t); t = setTimeout(() => go({ q: search.q.value.trim(), page: 1 }), 350); });
  search.addEventListener('submit', (e) => { e.preventDefault(); clearTimeout(t); go({ q: search.q.value.trim(), page: 1 }); });
  if (f.q) { search.q.focus(); search.q.setSelectionRange(f.q.length, f.q.length); }

  view.querySelector('#toggle-filters').addEventListener('click', (e) => {
    const p = view.querySelector('#filters');
    p.hidden = !p.hidden;
    e.currentTarget.classList.toggle('btn-primary', !p.hidden);
    e.currentTarget.setAttribute('aria-expanded', String(!p.hidden));
  });
  const ff = view.querySelector('#filters');
  await bindCascade(ff.region, ff.departement, ff.commune, {
    values: f,
    labels: { region: 'Toutes', departement: 'Tous', commune: 'Toutes' },
    onChange: (lvl) => go({
      region: ff.region.value,
      departement: lvl === 'region' ? '' : ff.departement.value,
      commune: lvl === 'commune' ? ff.commune.value : '',
      page: 1,
    }),
  });
  ff.addEventListener('change', (e) => {
    if (['region', 'departement', 'commune'].includes(e.target.name)) return;
    go({ [e.target.name]: e.target.value, page: 1 });
  });
  view.querySelector('#reset-filters').addEventListener('click', () => { location.hash = '#/membres?filtres=1'; });
  view.querySelector('#chips').addEventListener('click', (e) => {
    const b = e.target.closest('[data-rm]');
    if (!b) return;
    const k = b.dataset.rm;
    const patch = { [k]: '', page: 1 };
    if (k === 'region') Object.assign(patch, { departement: '', commune: '' });
    if (k === 'departement') patch.commune = '';
    go(patch);
  });
  view.querySelector('thead').addEventListener('click', (e) => {
    const h = e.target.closest('[data-sort]');
    if (!h) return;
    const s = h.dataset.sort;
    go({ sort: s, dir: s === sort && dir === 'asc' ? 'desc' : s === sort ? 'asc' : (s === 'nom' || s === 'region' ? 'asc' : 'desc'), page: 1 });
  });
  view.querySelector('#new-btn')?.addEventListener('click', () => openForm(null, () => load()));

  async function load() {
    lastQuery = { ...f, page, sort, dir, limit };
    let data;
    try { data = await api('/api/members', { query: lastQuery }); }
    catch (err) { toast(err.message, 'err'); return; }
    if (data.page > data.pages && data.total) return go({ page: data.pages });
    view.querySelector('#count-line').textContent = data.total
      ? `${fmtNum(data.total)} membre${data.total > 1 ? 's' : ''}${FILTER_KEYS.some((k) => f[k]) ? ' correspondant aux critères' : ' au total'}`
      : 'Aucun membre trouvé';
    renderRows(view, data.items);
    renderPager(view.querySelector('#pager'), data, (p) => go({ page: p }), (l) => go({ limit: l, page: 1 }));
  }
  view.reload = load;

  view.querySelector('#tbody').addEventListener('click', (e) => rowClick(e, view));
  view.querySelector('#mcards').addEventListener('click', (e) => rowClick(e, view));
  view.querySelector('#cb-all').addEventListener('change', (e) => {
    view.querySelectorAll('[data-cb]').forEach((cb) => { cb.checked = e.target.checked; toggleSel(view, Number(cb.dataset.cb), cb.checked); });
  });

  await load();
  if (id) openDetail(Number(id), view);
}

const th = (key, label, sort, dir) => `<th class="sortable${sort === key ? ' sorted' : ''}" data-sort="${key}" aria-sort="${sort === key ? (dir === 'asc' ? 'ascending' : 'descending') : 'none'}">${label}<span class="arrow">${sort === key && dir === 'asc' ? '▲' : '▼'}</span></th>`;

function renderRows(view, items) {
  const tbody = view.querySelector('#tbody');
  const cards = view.querySelector('#mcards');
  const edit = can('editeur');
  if (!items.length) {
    const empty = `<div class="empty">${icon('search')}<strong>Aucun résultat</strong><span>Modifiez la recherche ou les filtres.</span></div>`;
    tbody.innerHTML = `<tr><td colspan="9">${empty}</td></tr>`;
    cards.innerHTML = empty;
    return;
  }
  tbody.innerHTML = items.map((m) => {
    const age = ageFrom(m.date_naissance);
    return `
    <tr data-id="${m.id}">
      <td class="cb"><input type="checkbox" data-cb="${m.id}" aria-label="Sélectionner ${esc(m.prenom)} ${esc(m.nom)}"></td>
      <td><div class="who-cell">${avatar(m, 'sm')}<div><strong>${esc(m.prenom)} ${esc(m.nom)}</strong><span>${esc(m.matricule)}</span></div></div></td>
      <td class="mono"><span class="nowrap">${esc(formatPhone(m.telephone))}${m.whatsapp ? ' <span class="badge tone-green plain" title="WhatsApp">WA</span>' : ''}</span><span class="cell-sub">${esc(m.fonction || '')}</span></td>
      <td class="mono">${m.carte_electeur ? esc(m.carte_electeur) : '<span class="badge tone-gray plain">Sans carte</span>'}</td>
      <td>${esc(m.commune)}<span class="cell-sub">${esc(m.departement)} · ${esc(m.region)}</span></td>
      <td class="mono">${age ?? '—'} ans<span class="cell-sub">${m.sexe === 'F' ? 'Femme' : 'Homme'}</span></td>
      <td>${badge(m.statut)}</td>
      <td>${fmtDate(m.created_at)}<span class="cell-sub">${esc({ formulaire: 'En ligne', 'hors-ligne': 'Hors-ligne', admin: 'Admin' }[m.source] || m.source)}</span></td>
      <td><div class="row-actions">
        <button class="btn btn-ghost btn-sm btn-icon" data-act="view" title="Voir la fiche">${icon('eye')}</button>
        ${edit ? `<button class="btn btn-ghost btn-sm btn-icon" data-act="edit" title="Modifier">${icon('edit')}</button>
        <button class="btn btn-danger-ghost btn-sm btn-icon" data-act="del" title="Supprimer">${icon('trash')}</button>` : ''}
      </div></td>
    </tr>`;
  }).join('');
  cards.innerHTML = items.map((m) => `
    <div class="m-card" data-id="${m.id}">
      <input type="checkbox" data-cb="${m.id}" aria-label="Sélectionner">
      ${avatar(m, 'sm')}
      <div class="m-main"><strong>${esc(m.prenom)} ${esc(m.nom)}</strong>
        <span>${esc(formatPhone(m.telephone))} · ${esc(m.commune)}</span>
        <span>${esc(m.matricule)}${m.carte_electeur ? ` · Électeur ${esc(m.carte_electeur)}` : ''}</span></div>
      ${badge(m.statut)}
    </div>`).join('');
}

function rowClick(e, view) {
  const row = e.target.closest('[data-id]');
  if (!row) return;
  const id = Number(row.dataset.id);
  const cb = e.target.closest('[data-cb]');
  if (cb) { toggleSel(view, id, cb.checked); return; }
  const act = e.target.closest('[data-act]')?.dataset.act;
  if (act === 'edit') return editById(id, view);
  if (act === 'del') return deleteMember(id, view);
  openDetail(id, view);
}

function toggleSel(view, id, on) {
  if (on) selected.add(id); else selected.delete(id);
  view.querySelectorAll(`[data-id="${id}"]`).forEach((r) => {
    r.classList.toggle('selected', on);
    const c = r.querySelector('[data-cb]');
    if (c) c.checked = on;
  });
  renderBulk(view);
}

function renderBulk(view) {
  const host = view.querySelector('#bulk-host');
  if (!selected.size) { host.innerHTML = ''; return; }
  const edit = can('editeur');
  host.innerHTML = `
    <div class="bulkbar" role="toolbar" aria-label="Actions groupées">
      <strong>${selected.size} sélectionné${selected.size > 1 ? 's' : ''}</strong>
      ${edit ? `<button class="btn btn-sm" data-bulk="actif">${icon('check')} Valider</button>
      <button class="btn btn-sm" data-bulk="suspendu">${icon('lock')} Suspendre</button>
      <button class="btn btn-sm btn-danger" data-bulk="delete">${icon('trash')} Supprimer</button>` : ''}
      <button class="btn btn-sm btn-icon" data-bulk="clear" aria-label="Annuler la sélection">${icon('x')}</button>
    </div>`;
  host.querySelector('.bulkbar').addEventListener('click', async (e) => {
    const b = e.target.closest('[data-bulk]');
    if (!b) return;
    const ids = [...selected];
    if (b.dataset.bulk === 'clear') {
      ids.forEach((id) => toggleSel(view, id, false));
      view.querySelector('#cb-all').checked = false;
      return;
    }
    if (b.dataset.bulk === 'delete') {
      if (!await confirmDialog({ title: 'Supprimer les membres', message: `Supprimer définitivement ${ids.length} fiche(s) ? Cette action est irréversible.`, confirm: 'Supprimer', danger: true })) return;
      await bulk({ action: 'delete', ids }, `${ids.length} fiche(s) supprimée(s).`, view);
    } else {
      await bulk({ action: 'status', statut: b.dataset.bulk, ids }, `${ids.length} fiche(s) : ${ST[b.dataset.bulk].label.toLowerCase()}.`, view);
    }
  });
}

async function bulk(body, msg, view) {
  try {
    await api('/api/members/bulk', { method: 'POST', body });
    toast(msg, 'ok');
    selected = new Set();
    renderBulk(view);
    view.querySelector('#cb-all').checked = false;
    await view.reload();
    refreshPending();
  } catch (err) { toast(err.message, 'err'); }
}

async function refreshPending() {
  try { setPending((await api('/api/members', { query: { statut: 'en_attente', limit: 1 } })).total); } catch { /* ignoré */ }
}

function renderPager(el, d, onPage, onLimit) {
  const from = d.total ? (d.page - 1) * d.limit + 1 : 0;
  const to = Math.min(d.total, d.page * d.limit);
  const pages = [];
  for (let p = Math.max(1, d.page - 2); p <= Math.min(d.pages, d.page + 2); p++) pages.push(p);
  el.innerHTML = `
    <span>${fmtNum(from)}–${fmtNum(to)} sur ${fmtNum(d.total)}</span>
    <div class="pages">
      <button data-p="${d.page - 1}" ${d.page <= 1 ? 'disabled' : ''} aria-label="Page précédente">‹</button>
      ${pages[0] > 1 ? '<button data-p="1">1</button><span>…</span>' : ''}
      ${pages.map((p) => `<button data-p="${p}" class="${p === d.page ? 'on' : ''}">${p}</button>`).join('')}
      ${pages.at(-1) < d.pages ? `<span>…</span><button data-p="${d.pages}">${d.pages}</button>` : ''}
      <button data-p="${d.page + 1}" ${d.page >= d.pages ? 'disabled' : ''} aria-label="Page suivante">›</button>
    </div>
    <label>Par page <select class="select" id="limit-sel">${[10, 25, 50, 100].map((n) => `<option${n === d.limit ? ' selected' : ''}>${n}</option>`).join('')}</select></label>`;
  el.querySelector('.pages').addEventListener('click', (e) => {
    const b = e.target.closest('[data-p]');
    if (b && !b.disabled) onPage(Number(b.dataset.p));
  });
  el.querySelector('#limit-sel').addEventListener('change', (e) => onLimit(Number(e.target.value)));
}

// ---------- Fiche détaillée ----------
async function openDetail(id, view) {
  let m;
  try { m = await api(`/api/members/${id}`); } catch (err) { toast(err.message, 'err'); return; }
  const age = ageFrom(m.date_naissance);
  const row = (k, v) => `<dt>${k}</dt><dd>${v ? esc(v) : '<span class="muted">—</span>'}</dd>`;
  const phone = (p) => (p ? `+221 ${formatPhone(p)}` : '');
  const edit = can('editeur');
  const d = drawer({
    title: `${m.prenom} ${m.nom}`,
    body: `
      ${memberCard(m)}
      <div class="quick">
        <a class="btn btn-sm" href="tel:+221${esc(m.telephone)}">${icon('phone')} Appeler</a>
        ${m.whatsapp ? `<a class="btn btn-sm" href="https://wa.me/221${esc(m.telephone)}" target="_blank" rel="noopener">${icon('phone')} WhatsApp</a>` : ''}
        ${m.email ? `<a class="btn btn-sm" href="mailto:${esc(m.email)}">E-mail</a>` : ''}
        <button class="btn btn-sm" data-print>${icon('printer')} Imprimer</button>
      </div>
      <div class="info-sec"><h3>Statut</h3><dl>
        <dt>Statut</dt><dd>${badge(m.statut)}</dd>
        ${row('Matricule', m.matricule)}${row('Inscrit le', fmtDateTime(m.created_at))}${row('Mis à jour', fmtDateTime(m.updated_at))}
        ${row('Origine', { formulaire: 'Formulaire en ligne', 'hors-ligne': 'Formulaire hors-ligne', admin: 'Saisie administration' }[m.source])}
        ${row('Consentement', m.consentement ? 'Recueilli' : 'Non recueilli')}
      </dl></div>
      <div class="info-sec"><h3>Identité</h3><dl>
        ${row('Sexe', m.sexe === 'F' ? 'Femme' : 'Homme')}${row('Naissance', `${fmtDate(m.date_naissance)} · ${age} ans`)}
        ${row('Lieu de naissance', m.lieu_naissance)}${row('Nationalité', m.nationalite)}
        ${row('Situation', m.situation_matrimoniale)}${row('Enfants', m.nb_enfants != null ? String(m.nb_enfants) : '')}
      </dl></div>
      <div class="info-sec"><h3>Électeur & identité</h3><dl>
        ${row('Carte d’électeur', m.carte_electeur || 'Pas encore de carte')}${row('CNI', m.cni)}
        ${row('Lieu de vote', m.lieu_vote)}${row('Bureau de vote', m.bureau_vote)}
      </dl></div>
      <div class="info-sec"><h3>Localisation & contact</h3><dl>
        ${row('Région', m.region)}${row('Département', m.departement)}${row('Commune', m.commune)}
        ${row('Quartier / Village', m.quartier)}${row('Adresse', m.adresse)}
        ${row('Téléphone', phone(m.telephone) + (m.whatsapp ? ' · WhatsApp' : ''))}${row('Téléphone 2', phone(m.telephone2))}${row('E-mail', m.email)}
      </dl></div>
      <div class="info-sec"><h3>Organisation & profil</h3><dl>
        ${row('Section / Dahira', m.section)}${row('Fonction', m.fonction)}${row('Adhésion', m.date_adhesion ? fmtDate(m.date_adhesion) : '')}
        ${row('Profession', m.profession)}${row('Instruction', m.niveau_instruction)}${row('Groupe sanguin', m.groupe_sanguin)}
        ${row('Contact d’urgence', [m.urgence_nom, phone(m.urgence_tel)].filter(Boolean).join(' · '))}
      </dl></div>
      ${m.notes ? `<div class="info-sec"><h3>Notes internes</h3><p class="card" style="padding:12px 14px;white-space:pre-wrap">${esc(m.notes)}</p></div>` : ''}`,
    foot: edit ? `
      ${m.statut !== 'actif' ? `<button class="btn btn-primary" data-validate>${icon('check')} Valider</button>` : ''}
      <button class="btn" data-edit>${icon('edit')} Modifier</button>
      <span style="flex:1"></span>
      <button class="btn btn-danger-ghost" data-del>${icon('trash')} Supprimer</button>` : '',
    onClose: () => {
      const h = parseHash();
      if (h.name === 'membres' && h.id) history.replaceState(null, '', `#/membres${location.hash.includes('?') ? `?${location.hash.split('?')[1]}` : ''}`);
    },
  });
  if (!parseHash().id) history.replaceState(null, '', `#/membres/${id}${location.hash.includes('?') ? `?${location.hash.split('?')[1]}` : ''}`);
  d.el.querySelector('[data-print]').addEventListener('click', () => {
    document.body.classList.add('print-drawer');
    print();
    document.body.classList.remove('print-drawer');
  });
  d.el.querySelector('[data-edit]')?.addEventListener('click', () => { d.close(); openForm(m, () => view.reload()); });
  d.el.querySelector('[data-del]')?.addEventListener('click', async () => { if (await deleteMember(id, view)) d.close(); });
  d.el.querySelector('[data-validate]')?.addEventListener('click', async () => {
    try {
      await api('/api/members/bulk', { method: 'POST', body: { action: 'status', statut: 'actif', ids: [id] } });
      toast(`${m.prenom} ${m.nom} est désormais membre actif.`, 'ok');
      d.close();
      view.reload();
      refreshPending();
    } catch (err) { toast(err.message, 'err'); }
  });
}

async function editById(id, view) {
  try { openForm(await api(`/api/members/${id}`), () => view.reload()); } catch (err) { toast(err.message, 'err'); }
}

async function deleteMember(id, view) {
  const ok = await confirmDialog({ title: 'Supprimer la fiche', message: 'Cette fiche sera définitivement supprimée. Continuer ?', confirm: 'Supprimer', danger: true });
  if (!ok) return false;
  try {
    await api(`/api/members/${id}`, { method: 'DELETE' });
    toast('Fiche supprimée.', 'ok');
    view.reload();
    refreshPending();
    return true;
  } catch (err) { toast(err.message, 'err'); return false; }
}

// ---------- Création / modification ----------
const TABS = [
  { id: 'identite', label: 'Identité', html: sectionIdentite },
  { id: 'lieu', label: 'Localisation & contact', html: (m) => `${sectionLocalisation(m)}<h4 class="subhead">Contact</h4>${sectionContact(m)}` },
  { id: 'civique', label: 'Électeur', html: sectionCivique },
  { id: 'org', label: 'Organisation', html: sectionOrganisation },
  { id: 'admin', label: 'Gestion', html: sectionAdmin },
];

async function openForm(m, onSaved) {
  const editing = Boolean(m);
  m = m || {};
  const md = modal({
    title: editing ? `Modifier — ${m.prenom} ${m.nom}` : 'Nouveau membre',
    body: `
      <div class="tabs" role="tablist">${TABS.map((t, i) => `<button type="button" role="tab" data-tab="${t.id}" class="${i ? '' : 'on'}">${t.label}</button>`).join('')}</div>
      <form class="modal-body" id="mform" novalidate>
        ${TABS.map((t, i) => `<div class="tab-panel ${i ? '' : 'on'}" data-panel="${t.id}">${t.html(m)}</div>`).join('')}
      </form>`,
    foot: `<button class="btn" data-close>Annuler</button>
      <button class="btn btn-primary" id="msave">${icon('check')} ${editing ? 'Enregistrer' : 'Créer la fiche'}</button>`,
  });
  const form = md.el.querySelector('#mform');
  const tabs = md.el.querySelector('.tabs');
  const show = (id) => {
    tabs.querySelectorAll('[data-tab]').forEach((b) => b.classList.toggle('on', b.dataset.tab === id));
    form.querySelectorAll('[data-panel]').forEach((p) => p.classList.toggle('on', p.dataset.panel === id));
  };
  tabs.addEventListener('click', (e) => { const b = e.target.closest('[data-tab]'); if (b) show(b.dataset.tab); });
  enhance(form);
  await bindCascade(form.querySelector('#f-region'), form.querySelector('#f-departement'), form.querySelector('#f-commune'), { values: m });
  let photoChanged = false;
  form.querySelector('[name="photo"]').addEventListener('change', () => { photoChanged = true; });

  const markTabs = (fields) => {
    tabs.querySelectorAll('.err-dot').forEach((x) => x.remove());
    let first = null;
    for (const name of Object.keys(fields)) {
      const panel = form.querySelector(`[data-field="${name}"]`)?.closest('[data-panel]');
      if (!panel) continue;
      const b = tabs.querySelector(`[data-tab="${panel.dataset.panel}"]`);
      if (!b.querySelector('.err-dot')) b.insertAdjacentHTML('beforeend', '<span class="err-dot"></span>');
      first ??= panel.dataset.panel;
    }
    if (first) show(first);
  };

  md.el.querySelector('#msave').addEventListener('click', async () => {
    const data = collect(form);
    const errs = quickCheck(data, ['prenom', 'nom', 'sexe', 'date_naissance', 'region', 'departement', 'commune', 'telephone', 'telephone2', 'urgence_tel', 'carte_electeur', 'cni', 'email']);
    if (Object.keys(errs).length) { showErrors(form, errs); markTabs(errs); return; }
    if (editing && !photoChanged) delete data.photo;
    const btn = md.el.querySelector('#msave');
    btn.disabled = true;
    try {
      const saved = await api(editing ? `/api/members/${m.id}` : '/api/members', { method: editing ? 'PUT' : 'POST', body: data });
      toast(editing ? 'Fiche mise à jour.' : `Fiche créée : ${saved.matricule}`, 'ok');
      md.close();
      onSaved?.(saved);
      refreshPending();
    } catch (err) {
      if (err.body.fields) { showErrors(form, err.body.fields); markTabs(err.body.fields); }
      toast(err.message, 'err');
    } finally { btn.disabled = false; }
  });
}

