import { esc, icon, fmtNum, timeAgo } from '../ui.js';
import { STATUTS } from '../schema.js';
import { api } from './api.js';
import { state, setPending } from './app.js';
import { chart, cssVar, tooltipStyle, sparkline, hbars, avatar } from './widgets.js';
import { renderMap, hideMapTip } from './map.js';
import { loadGeo } from '../geo.js';

const MOIS = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];
const pct = (a, b) => (b ? Math.round((a / b) * 100) : 0);

function greeting() {
  const h = new Date().getHours();
  return h < 12 ? 'Bonjour' : h < 18 ? 'Bon après-midi' : 'Bonsoir';
}

function hijri() {
  try {
    return new Intl.DateTimeFormat('fr-FR-u-ca-islamic-umalqura', { day: 'numeric', month: 'long', year: 'numeric' }).format(new Date());
  } catch { return ''; }
}

function delta(cur, prev) {
  if (!prev && !cur) return '<span class="delta flat">—</span>';
  if (!prev) return '<span class="delta up">nouveau</span>';
  const d = Math.round(((cur - prev) / prev) * 100);
  return `<span class="delta ${d > 0 ? 'up' : d < 0 ? 'down' : 'flat'}">${d > 0 ? '+' : ''}${d} %</span>`;
}

export async function render(view, { query }) {
  const region = query.region || '';
  const geo = await loadGeo();
  view.innerHTML = `
    <section class="welcome pattern-dark">
      <div>
        <h1>${greeting()}, ${esc(state.user.nom.split(' ')[0])}</h1>
        <p>Voici l’état du registre ${region ? `pour la région de <strong>${esc(region)}</strong>` : 'sur l’ensemble du territoire'}.</p>
        <div class="dates">
          <span class="chip">${icon('calendar')} ${new Date().toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</span>
          ${hijri() ? `<span class="chip">${icon('moon')} ${esc(hijri())}</span>` : ''}
        </div>
      </div>
      <div class="welcome-side">
        <label class="sr-only" for="dash-region">Filtrer par région</label>
        <select class="select" id="dash-region">
          <option value="">Toutes les régions</option>
          ${geo.regions.map((r) => `<option${r.nom === region ? ' selected' : ''}>${esc(r.nom)}</option>`).join('')}
        </select>
        <a class="btn btn-gold btn-sm" href="#/membres${region ? `?region=${encodeURIComponent(region)}` : ''}">${icon('users')} Voir les membres</a>
      </div>
    </section>
    <div class="kpis" id="kpis">${'<div class="card kpi skeleton" style="height:140px"></div>'.repeat(4)}</div>
    <div class="dash-grid" id="grid"></div>`;

  view.querySelector('#dash-region').addEventListener('change', (e) => {
    location.hash = `#/tableau${e.target.value ? `?region=${encodeURIComponent(e.target.value)}` : ''}`;
  });

  const [s, all] = await Promise.all([
    api('/api/stats', { query: { region } }),
    region ? api('/api/stats') : null,
  ]);
  const global = all || s;
  if (!region) setPending(s.kpi.en_attente);
  const k = s.kpi;

  // ----- Indicateurs -----
  view.querySelector('#kpis').innerHTML = `
    <a class="card kpi" href="#/membres${region ? `?region=${encodeURIComponent(region)}` : ''}" style="text-decoration:none;color:inherit">
      <div class="kpi-top"><span class="kpi-label">Membres inscrits</span><span class="kpi-ico tone-brand">${icon('users')}</span></div>
      <div class="kpi-value">${fmtNum(k.total)}</div>
      <div class="kpi-sub">${fmtNum(k.communes)} communes · ${fmtNum(k.departements)} départements</div>
      ${sparkline(s.daily.map((d) => d.n), cssVar('--primary'))}
    </a>
    <div class="card kpi">
      <div class="kpi-top"><span class="kpi-label">Nouveaux (30 jours)</span><span class="kpi-ico tone-blue">${icon('trend')}</span></div>
      <div class="kpi-value">${fmtNum(k.new30)}</div>
      <div class="kpi-sub">${delta(k.new30, k.prev30)} vs 30 jours précédents</div>
    </div>
    <a class="card kpi" href="#/membres?statut=en_attente" style="text-decoration:none;color:inherit">
      <div class="kpi-top"><span class="kpi-label">À valider</span><span class="kpi-ico tone-amber">${icon('clock')}</span></div>
      <div class="kpi-value">${fmtNum(k.en_attente)}</div>
      <div class="kpi-sub">${k.en_attente ? 'Inscriptions en attente de validation →' : 'Tout est à jour'}</div>
    </a>
    <div class="card kpi has-ring">
      <div class="kpi-top"><span class="kpi-label">Carte d’électeur</span><span class="kpi-ico tone-green">${icon('vote')}</span></div>
      <div class="kpi-value">${pct(k.avec_carte, k.total)}<small>%</small></div>
      <div class="kpi-sub">${fmtNum(k.avec_carte)} membres inscrits sur les listes</div>
      <div class="ring" style="--p:${pct(k.avec_carte, k.total)}"><b>${pct(k.avec_carte, k.total)}%</b></div>
    </div>
    <div class="card kpi">
      <div class="kpi-top"><span class="kpi-label">Répartition par sexe</span><span class="kpi-ico tone-gray">${icon('user')}</span></div>
      <div class="kpi-value">${pct(k.femmes, k.total)}<small>% femmes</small></div>
      <div class="split-bar" role="img" aria-label="${k.femmes} femmes, ${k.hommes} hommes">
        <span style="width:${pct(k.femmes, k.total)}%;background:var(--viz-2)"></span>
        <span style="width:${100 - pct(k.femmes, k.total)}%;background:var(--viz-1)"></span>
      </div>
      <div class="legend"><span><i style="background:var(--viz-2)"></i>Femmes ${fmtNum(k.femmes)}</span><span><i style="background:var(--viz-1)"></i>Hommes ${fmtNum(k.hommes)}</span></div>
    </div>
    <div class="card kpi">
      <div class="kpi-top"><span class="kpi-label">Âge moyen</span><span class="kpi-ico tone-brand">${icon('calendar')}</span></div>
      <div class="kpi-value">${k.age_moyen ?? '—'}<small>ans</small></div>
      <div class="kpi-sub">${fmtNum(k.majeurs)} membres majeurs · ${pct(k.whatsapp, k.total)} % sur WhatsApp</div>
    </div>`;

  if (!k.total && !region) {
    view.querySelector('#grid').innerHTML = `
      <section class="card panel col-12"><div class="empty">${icon('users')}
        <strong>Aucun membre pour l’instant</strong>
        <span>Partagez le lien du formulaire public ou ajoutez un membre depuis l’onglet Membres.</span>
        <a class="btn btn-primary" href="/" target="_blank" rel="noopener">${icon('plus')} Ouvrir le formulaire</a></div></section>`;
    return;
  }

  const statutTone = Object.fromEntries(STATUTS.map((x) => [x.value, x]));
  const byStatut = Object.fromEntries(s.statuts.map((x) => [x.label, x.n]));

  view.querySelector('#grid').innerHTML = `
    <section class="card panel col-8">
      <div class="panel-head"><div><h2>Implantation territoriale</h2><p>Cliquez sur une région pour filtrer le tableau de bord.</p></div>
        ${region ? `<a class="btn btn-sm" href="#/tableau">${icon('x')} ${esc(region)}</a>` : ''}</div>
      <div id="map"></div>
    </section>
    <section class="card panel col-4">
      <div class="panel-head"><div><h2>Pyramide des âges</h2><p>Hommes à gauche, femmes à droite.</p></div></div>
      <div class="chart-box tall"><canvas id="c-pyramid" role="img" aria-label="Pyramide des âges par sexe"></canvas></div>
      <div class="legend" style="margin-top:10px"><span><i style="background:var(--viz-1)"></i>Hommes</span><span><i style="background:var(--viz-2)"></i>Femmes</span></div>
    </section>

    <section class="card panel col-8">
      <div class="panel-head"><div><h2>Dynamique des inscriptions</h2><p>Nouveaux membres par mois, sur 12 mois.</p></div>
        <span class="badge tone-brand plain">${fmtNum(s.monthly.reduce((a, m) => a + m.n, 0))} sur la période</span></div>
      <div class="chart-box"><canvas id="c-monthly" role="img" aria-label="Inscriptions mensuelles"></canvas></div>
    </section>
    <section class="card panel col-4">
      <div class="panel-head"><div><h2>Statut des fiches</h2><p>Cliquez pour ouvrir la liste.</p></div></div>
      <div class="status-list">
        ${STATUTS.map((st) => `
          <a class="status-tile tone-${st.tone}" href="#/membres?statut=${st.value}${region ? `&region=${encodeURIComponent(region)}` : ''}" style="text-decoration:none">
            <b>${fmtNum(byStatut[st.value] || 0)}</b><span>${st.label} · ${pct(byStatut[st.value] || 0, k.total)} %</span>
          </a>`).join('')}
      </div>
      <h3 class="tiny" style="margin:18px 0 8px;text-transform:uppercase;letter-spacing:.1em">Origine des inscriptions</h3>
      ${hbars(s.sources.map((x) => ({ ...x, label: { formulaire: 'Formulaire en ligne', 'hors-ligne': 'Formulaire hors-ligne', admin: 'Saisie administration' }[x.label] || x.label })))}
    </section>

    <section class="card panel col-4 half">
      <div class="panel-head"><div><h2>${region ? 'Départements' : 'Top communes'}</h2><p>Les plus représentés.</p></div></div>
      ${hbars((region ? s.departements : s.communes).slice(0, 8), { onClick: true })}
    </section>
    <section class="card panel col-4 half">
      <div class="panel-head"><div><h2>Fonctions</h2><p>Rôles exercés dans l’organisation.</p></div></div>
      ${hbars(s.fonctions.slice(0, 8))}
    </section>
    <section class="card panel col-4">
      <div class="panel-head"><div><h2>Niveau d’instruction</h2><p>Déclaré à l’inscription.</p></div></div>
      ${hbars(s.niveaux.slice(0, 8))}
    </section>

    <section class="card panel col-6 half">
      <div class="panel-head"><div><h2>Derniers inscrits</h2><p>Les 6 inscriptions les plus récentes.</p></div>
        <a class="btn btn-sm btn-ghost" href="#/membres">Tout voir ${icon('chevronRight')}</a></div>
      <ul class="feed">
        ${s.recents.map((m) => `
          <li data-id="${m.id}">${avatar(m, 'sm')}
            <div class="meta"><strong>${esc(m.prenom)} ${esc(m.nom)}</strong><span>${esc(m.commune)} · ${esc(m.region)} · ${timeAgo(m.created_at)}</span></div>
            <span class="badge tone-${statutTone[m.statut]?.tone || 'gray'}">${statutTone[m.statut]?.label || esc(m.statut)}</span>
          </li>`).join('') || '<li class="empty">Aucune inscription</li>'}
      </ul>
    </section>
    <section class="card panel col-6 half">
      <div class="panel-head"><div><h2>Situation matrimoniale</h2><p>Répartition des membres.</p></div></div>
      ${hbars(s.situations)}
    </section>`;

  view.querySelector('.feed').addEventListener('click', (e) => {
    const li = e.target.closest('[data-id]');
    if (li) location.hash = `#/membres/${li.dataset.id}`;
  });
  view.querySelectorAll('.hbar[data-val]').forEach((el) => el.addEventListener('click', () => {
    const key = region ? 'departement' : 'commune';
    location.hash = `#/membres?${key}=${encodeURIComponent(el.dataset.val)}${region ? `&region=${encodeURIComponent(region)}` : ''}`;
  }));

  renderMap(view.querySelector('#map'), global.regions, {
    selected: region,
    onSelect: (r) => { hideMapTip(); location.hash = `#/tableau${r ? `?region=${encodeURIComponent(r)}` : ''}`; },
  });

  // ----- Graphiques -----
  const tip = tooltipStyle();
  const c1 = cssVar('--viz-1'), c2 = cssVar('--viz-2');
  chart(view.querySelector('#c-pyramid'), {
    type: 'bar',
    data: {
      labels: s.pyramid.map((p) => p.label),
      datasets: [
        { label: 'Hommes', data: s.pyramid.map((p) => -p.M), backgroundColor: c1, borderRadius: 4, borderSkipped: false, barPercentage: 0.9, categoryPercentage: 0.9 },
        { label: 'Femmes', data: s.pyramid.map((p) => p.F), backgroundColor: c2, borderRadius: 4, borderSkipped: false, barPercentage: 0.9, categoryPercentage: 0.9 },
      ],
    },
    options: {
      indexAxis: 'y', maintainAspectRatio: false, animation: { duration: 500 },
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: { display: false },
        tooltip: { ...tip, callbacks: { title: (i) => `${i[0].label} ans`, label: (c) => ` ${c.dataset.label} : ${Math.abs(c.raw)}` } },
      },
      scales: {
        x: { stacked: true, ticks: { callback: (v) => Math.abs(v) }, grid: { color: cssVar('--viz-grid') }, border: { display: false } },
        y: { stacked: true, reverse: true, grid: { display: false }, border: { display: false } },
      },
    },
  });

  const ctx = view.querySelector('#c-monthly').getContext('2d');
  const grad = ctx.createLinearGradient(0, 0, 0, 260);
  grad.addColorStop(0, `${c1}55`);
  grad.addColorStop(1, `${c1}00`);
  chart(view.querySelector('#c-monthly'), {
    type: 'line',
    data: {
      labels: s.monthly.map((m) => { const [y, mo] = m.label.split('-'); return `${MOIS[Number(mo) - 1]} ${y.slice(2)}`; }),
      datasets: [{
        label: 'Inscriptions', data: s.monthly.map((m) => m.n), borderColor: c1, backgroundColor: grad, fill: true,
        tension: 0.35, borderWidth: 2, pointRadius: 0, pointHoverRadius: 5, pointHoverBackgroundColor: c1, pointHoverBorderColor: cssVar('--surface'), pointHoverBorderWidth: 2,
      }],
    },
    options: {
      maintainAspectRatio: false, animation: { duration: 600 },
      interaction: { mode: 'index', intersect: false },
      plugins: { legend: { display: false }, tooltip: { ...tip, displayColors: false, callbacks: { label: (c) => `${c.raw} inscription${c.raw > 1 ? 's' : ''}` } } },
      scales: {
        x: { grid: { display: false }, border: { display: false } },
        y: { beginAtZero: true, ticks: { precision: 0 }, grid: { color: cssVar('--viz-grid') }, border: { display: false } },
      },
    },
  });
}
