// Enregistrement du service worker et invite d'installation.
let deferred = null;

export function registerSW() {
  if ('serviceWorker' in navigator) {
    addEventListener('load', () => navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch(() => {}));
  }
}

export function setupInstall(button) {
  if (!button) return;
  addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferred = e;
    button.hidden = false;
  });
  button.addEventListener('click', async () => {
    if (!deferred) return;
    deferred.prompt();
    await deferred.userChoice;
    deferred = null;
    button.hidden = true;
  });
  addEventListener('appinstalled', () => { button.hidden = true; });
}

export function watchOnline(cb) {
  const fire = () => cb(navigator.onLine);
  addEventListener('online', fire);
  addEventListener('offline', fire);
  fire();
}
