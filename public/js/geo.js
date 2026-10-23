// Découpage administratif : régions → départements → communes.
import { esc } from './ui.js';

let cache;
export async function loadGeo() {
  if (!cache) cache = fetch('/data/senegal.json').then((r) => r.json());
  return cache;
}

const options = (list, placeholder, selected) =>
  `<option value="">${esc(placeholder)}</option>` +
  list.map((v) => `<option value="${esc(v)}"${v === selected ? ' selected' : ''}>${esc(v)}</option>`).join('');

// Relie trois <select> en cascade. `labels` personnalise l'option vide (« Toutes » en filtre).
export async function bindCascade(regionEl, deptEl, communeEl, {
  values = {}, labels = {}, onChange,
} = {}) {
  const geo = await loadGeo();
  const L = {
    region: 'Choisir la région', departement: 'Choisir le département', commune: 'Choisir la commune',
    ...labels,
  };
  const findRegion = () => geo.regions.find((r) => r.nom === regionEl.value);
  const findDept = () => findRegion()?.departements.find((d) => d.nom === deptEl.value);

  const fillDepts = (sel) => {
    const r = findRegion();
    deptEl.innerHTML = options(r ? r.departements.map((d) => d.nom) : [], r ? L.departement : '— Région d’abord —', sel);
    deptEl.disabled = !r;
  };
  const fillCommunes = (sel) => {
    const d = findDept();
    communeEl.innerHTML = options(d ? d.communes : [], d ? L.commune : '— Département d’abord —', sel);
    communeEl.disabled = !d;
  };

  regionEl.innerHTML = options(geo.regions.map((r) => r.nom), L.region, values.region);
  fillDepts(values.departement);
  fillCommunes(values.commune);

  regionEl.addEventListener('change', () => { fillDepts(); fillCommunes(); onChange?.('region'); });
  deptEl.addEventListener('change', () => { fillCommunes(); onChange?.('departement'); });
  communeEl.addEventListener('change', () => onChange?.('commune'));

  return {
    set(v = {}) {
      regionEl.value = v.region || '';
      fillDepts(v.departement);
      fillCommunes(v.commune);
    },
  };
}
