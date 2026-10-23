// Carte choroplèthe des régions du Sénégal.
import { esc, fmtNum } from '../ui.js';
import { seqColor } from './widgets.js';

let pathsCache;
const loadPaths = () => (pathsCache ??= fetch('/data/regions-paths.json').then((r) => r.json()));

export async function renderMap(container, rows, { selected, onSelect } = {}) {
  const paths = await loadPaths();
  const counts = Object.fromEntries(rows.map((r) => [r.label, r.n]));
  const total = rows.reduce((s, r) => s + r.n, 0) || 1;
  const max = Math.max(1, ...rows.map((r) => r.n));
  const names = Object.keys(paths);
  const ranked = names.map((n) => ({ label: n, n: counts[n] || 0 })).sort((a, b) => b.n - a.n);

  // Nouveau nœud à chaque rendu : pas d'accumulation d'écouteurs.
  const host = document.createElement('div');
  container.replaceChildren(host);
  host.innerHTML = `
    <div class="map-wrap">
      <div>
        <svg class="map-svg${selected ? ' has-sel' : ''}" role="img" aria-label="Carte des membres par région">
          ${names.map((n) => `<path d="${paths[n]}" data-r="${esc(n)}" class="${n === selected ? 'sel' : ''}"
            fill="${counts[n] ? seqColor(0.12 + 0.88 * Math.sqrt(counts[n] / max)) : seqColor(0)}"
            tabindex="0" aria-label="${esc(n)} : ${counts[n] || 0} membres"></path>`).join('')}
        </svg>
        <div class="map-legend"><span>0</span><span class="grad"></span><span>${fmtNum(max)}</span><span>membres</span></div>
      </div>
      <ol class="rank" aria-label="Classement des régions">
        ${ranked.map((r, i) => `
          <li data-r="${esc(r.label)}" class="${r.label === selected ? 'sel' : ''}">
            <span class="pos">${i + 1}</span><span class="name">${esc(r.label)}</span>
            <span class="val">${fmtNum(r.n)} <span class="tiny">${Math.round((r.n / total) * 100)}%</span></span>
            <span class="bar"><span style="width:${(r.n / max) * 100}%"></span></span>
          </li>`).join('')}
      </ol>
    </div>`;

  const svg = host.querySelector('svg');
  // Cadre ajusté au tracé réel.
  const bb = svg.getBBox();
  if (bb.width) svg.setAttribute('viewBox', `${bb.x - 4} ${bb.y - 4} ${bb.width + 8} ${bb.height + 8}`);

  let tip = document.querySelector('.map-tip');
  if (!tip) {
    tip = document.createElement('div');
    tip.className = 'map-tip';
    tip.hidden = true;
    document.body.append(tip);
  }
  const hl = (name, on) => host.querySelectorAll(`[data-r="${CSS.escape(name)}"]`).forEach((el) => el.classList.toggle('hl', on));
  const show = (name, x, y) => {
    const n = counts[name] || 0;
    tip.innerHTML = `<b>${esc(name)}</b>${fmtNum(n)} membre${n > 1 ? 's' : ''} · ${Math.round((n / total) * 100)} %`;
    tip.style.left = `${x}px`;
    tip.style.top = `${y}px`;
    tip.hidden = false;
  };
  host.addEventListener('pointermove', (e) => {
    const p = e.target.closest('path[data-r]');
    if (!p) { tip.hidden = true; return; }
    show(p.dataset.r, e.clientX, e.clientY);
  });
  host.addEventListener('pointerleave', () => { tip.hidden = true; });
  host.addEventListener('pointerover', (e) => { const t = e.target.closest('[data-r]'); if (t) hl(t.dataset.r, true); });
  host.addEventListener('pointerout', (e) => { const t = e.target.closest('[data-r]'); if (t) hl(t.dataset.r, false); });
  host.addEventListener('click', (e) => {
    const t = e.target.closest('[data-r]');
    if (t) { tip.hidden = true; onSelect?.(t.dataset.r === selected ? '' : t.dataset.r); }
  });
  host.addEventListener('keydown', (e) => {
    const t = e.target.closest('path[data-r]');
    if (t && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); onSelect?.(t.dataset.r === selected ? '' : t.dataset.r); }
  });
}

export function hideMapTip() {
  const t = document.querySelector('.map-tip');
  if (t) t.hidden = true;
}
