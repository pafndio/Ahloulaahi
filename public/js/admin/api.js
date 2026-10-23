// Client de l'API d'administration.
export class ApiError extends Error {
  constructor(status, body) {
    super(body?.error || `Erreur ${status}`);
    this.status = status;
    this.body = body || {};
  }
}

const listeners = new Set();
export const onAuthLost = (fn) => listeners.add(fn);

export async function api(path, { method = 'GET', body, query } = {}) {
  let url = path;
  if (query) {
    const qs = new URLSearchParams(Object.entries(query).filter(([, v]) => v !== '' && v != null));
    if ([...qs].length) url += `?${qs}`;
  }
  let res;
  try {
    res = await fetch(url, {
      method,
      credentials: 'same-origin',
      headers: {
        'X-Requested-With': 'fetch',
        ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new ApiError(0, { error: 'Connexion au serveur impossible. Vérifiez votre réseau.' });
  }
  const data = res.headers.get('content-type')?.includes('json') ? await res.json().catch(() => ({})) : {};
  if (!res.ok) {
    const err = new ApiError(res.status, data);
    if ((res.status === 401 && !path.startsWith('/api/auth/login')) || data.code === 'PASSWORD_CHANGE_REQUIRED') {
      listeners.forEach((fn) => fn(err));
    }
    throw err;
  }
  return data;
}

export const qs = (o) => new URLSearchParams(Object.entries(o).filter(([, v]) => v !== '' && v != null)).toString();
