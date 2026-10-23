// Vérifie la version de Node.js avant de charger SQLite (node:sqlite, sans option depuis 22.13),
// et masque l'avertissement « SQLite is an experimental feature ».
const [major, minor] = process.versions.node.split('.').map(Number);
if (major < 22 || (major === 22 && minor < 13)) {
  console.error(`
  Node.js ${process.versions.node} est trop ancien pour Ahlou Lahi.
  Installez Node.js 22.13 ou plus récent (version « LTS ») depuis https://nodejs.org,
  fermez puis rouvrez le terminal, et vérifiez avec : node --version
`);
  process.exit(1);
}

const emit = process.emitWarning;
process.emitWarning = (warning, ...args) => {
  const type = typeof args[0] === 'string' ? args[0] : args[0]?.type;
  if (type === 'ExperimentalWarning' && String(warning).includes('SQLite')) return;
  return emit.call(process, warning, ...args);
};
