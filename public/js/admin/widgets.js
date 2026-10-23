// Composants d'interface de l'administration : modale, tiroir, confirmation, graphiques.
import { esc, icon, avatarHue, initials, isDark } from '../ui.js';

export function avatar(m, size = '') {
  const hue = avatarHue(`${m.prenom}${m.nom}`);
  const inner = m.photo ? `<img src="${esc(m.photo)}" alt="">` : esc(initials(m.prenom, m.nom));
  return `<span class="avatar ${size}" style="--h:${hue}">${inner}</span>`;
}

let openLayers = [];
function trapEsc(e) {
  if (e.key === 'Escape' && openLayers.length) openLayers[openLayers.length - 1].close();
}
document.addEventListener('keydown', trapEsc);

function layer(el, { onClose } = {}) {
  const overlay = document.createElement('div');
  overlay.className = 'overlay';
  const prevFocus = document.activeElement;
  document.body.append(overlay, el);
  document.body.style.overflow = 'hidden';
  const api = {
    el,
    close() {
      overlay.remove(); el.remove();
      openLayers = openLayers.filter((l) => l !== api);
      if (!openLayers.length) document.body.style.overflow = '';
      prevFocus?.focus?.();
      onClose?.();
    },
  };
  overlay.addEventListener('click', () => api.close());
  el.addEventListener('click', (e) => { if (e.target.closest('[data-close]')) api.close(); });
  openLayers.push(api);
  setTimeout(() => el.querySelector('[autofocus], input:not([type=hidden]):not([disabled]), select, button')?.focus(), 30);
  return api;
}

export function modal({ title, body, foot = '', size = '', onClose }) {
  const el = document.createElement('div');
  el.className = 'modal';
  el.setAttribute('role', 'dialog');
  el.setAttribute('aria-modal', 'true');
  el.setAttribute('aria-label', title);
  el.innerHTML = `
    <div class="modal-box ${size}">
      <div class="modal-head"><h2>${esc(title)}</h2>
        <button class="btn btn-ghost btn-icon btn-sm" data-close aria-label="Fermer">${icon('x')}</button></div>
      ${body}
      ${foot ? `<div class="modal-foot">${foot}</div>` : ''}
    </div>`;
  return layer(el, { onClose });
}

export function drawer({ title, body, foot = '', onClose }) {
  const el = document.createElement('aside');
  el.className = 'drawer';
  el.setAttribute('role', 'dialog');
  el.setAttribute('aria-modal', 'true');
  el.setAttribute('aria-label', title);
  el.innerHTML = `
    <div class="drawer-head"><h2>${esc(title)}</h2>
      <button class="btn btn-ghost btn-icon btn-sm" data-close aria-label="Fermer">${icon('x')}</button></div>
    <div class="drawer-body">${body}</div>
    ${foot ? `<div class="drawer-foot">${foot}</div>` : ''}`;
  return layer(el, { onClose });
}

export function confirmDialog({ title, message, confirm = 'Confirmer', danger = false }) {
  return new Promise((resolve) => {
    let answered = false;
    const m = modal({
      title,
      size: 'sm',
      body: `<div class="modal-body"><p>${esc(message)}</p></div>`,
      foot: `<button class="btn" data-close>Annuler</button>
             <button class="btn ${danger ? 'btn-danger' : 'btn-primary'}" data-ok autofocus>${esc(confirm)}</button>`,
      onClose: () => { if (!answered) resolve(false); },
    });
    m.el.querySelector('[data-ok]').addEventListener('click', () => { answered = true; m.close(); resolve(true); });
  });
}

// ----- Graphiques (Chart.js) -----
export const cssVar = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();

const charts = new Map();
export function chart(canvas, config) {
  if (!window.Chart) return null;
  charts.get(canvas)?.destroy();
  const Chart = window.Chart;
  Chart.defaults.font.family = cssVar('--font');
  Chart.defaults.font.size = 12;
  Chart.defaults.color = cssVar('--text-3');
  Chart.defaults.borderColor = cssVar('--viz-grid');
  const c = new Chart(canvas, config);
  charts.set(canvas, c);
  return c;
}
export function destroyCharts() {
  charts.forEach((c) => c.destroy());
  charts.clear();
}

export const tooltipStyle = () => ({
  backgroundColor: isDark() ? '#e8efe9' : '#17231e',
  titleColor: isDark() ? '#0b1310' : '#fff',
  bodyColor: isDark() ? '#0b1310' : '#fff',
  padding: 10,
  cornerRadius: 10,
  boxPadding: 4,
  titleFont: { weight: '700' },
  usePointStyle: true,
});

// Mini-courbe SVG (sans axes) pour les tuiles d'indicateurs.
export function sparkline(values, color = 'var(--primary)') {
  const w = 200, h = 36, max = Math.max(1, ...values);
  const step = values.length > 1 ? w / (values.length - 1) : w;
  const pts = values.map((v, i) => [i * step, h - 3 - (v / max) * (h - 6)]);
  const line = pts.map((p, i) => `${i ? 'L' : 'M'}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join('');
  return `<svg class="spark" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" aria-hidden="true">
    <path d="${line}L${w},${h}L0,${h}Z" fill="${color}" opacity=".12"/>
    <path d="${line}" fill="none" stroke="${color}" stroke-width="2" vector-effect="non-scaling-stroke" stroke-linejoin="round"/>
  </svg>`;
}

// Interpolation de la rampe séquentielle (une teinte, clair → foncé).
export function seqColor(t) {
  const a = hex(cssVar('--seq-0')), b = hex(cssVar('--seq-1'));
  const mix = a.map((x, i) => Math.round(x + (b[i] - x) * Math.max(0, Math.min(1, t))));
  return `rgb(${mix.join(',')})`;
}
function hex(h) {
  const s = h.replace('#', '');
  return [0, 2, 4].map((i) => parseInt(s.slice(i, i + 2), 16));
}

export function hbars(rows, { max, onClick } = {}) {
  if (!rows.length) return '<div class="empty">Aucune donnée</div>';
  const m = max ?? Math.max(...rows.map((r) => r.n));
  return `<div class="hbars">${rows.map((r) => `
    <div class="hbar" ${onClick ? `data-val="${esc(r.label)}" style="cursor:pointer"` : ''} title="${esc(r.label)} : ${r.n}">
      <span class="lbl">${esc(r.label)}</span>
      <span class="track"><span style="width:${(r.n / m) * 100}%"></span></span>
      <span class="v">${r.n}</span>
    </div>`).join('')}</div>`;
}
