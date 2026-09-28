// Session et appels API partagés par le popup et le service worker.
// Chargé via <script> dans popup.html et via importScripts() dans background.js.

async function getAuth() {
  const { auth } = await chrome.storage.local.get("auth");
  return auth || null;
}

async function setAuth(auth) {
  await chrome.storage.local.set({ auth });
}

async function clearAuth() {
  await chrome.storage.local.remove("auth");
}

// Rafraîchit la session. Renvoie le nouvel access_token, ou null.
// IMPORTANT : on n'efface la session QUE sur un vrai rejet d'auth (401, refresh
// token invalide). Un 404/500/erreur réseau (ex. backend pas déployé) NE doit
// PAS déconnecter — sinon la session saute à chaque appel raté.
async function refreshToken(base) {
  const auth = await getAuth();
  if (!auth?.refresh_token) return null;
  try {
    const res = await fetch(`${base}/api/extension/refresh`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refresh_token: auth.refresh_token }),
    });
    if (res.status === 401) {
      await clearAuth(); // le refresh token est réellement invalide
      return null;
    }
    if (!res.ok) return null; // endpoint absent / erreur serveur : on garde la session
    const data = await res.json();
    await setAuth({ ...auth, ...data });
    return data.access_token;
  } catch {
    return null; // hors-ligne : on garde la session
  }
}

// Renvoie un access_token utilisable. Rafraîchit si expiré, mais conserve
// l'ancien token si le refresh échoue pour une raison non-auth.
async function getValidToken(base) {
  const auth = await getAuth();
  if (!auth?.access_token) return null;

  const expiresMs = (auth.expires_at ?? 0) * 1000;
  if (expiresMs && Date.now() < expiresMs - 60_000) return auth.access_token;

  const refreshed = await refreshToken(base);
  if (refreshed) return refreshed;

  // Refresh raté : si la session a été effacée (401) → null, sinon on retente
  // avec l'ancien token (le vrai appel donnera une erreur claire si besoin).
  const still = await getAuth();
  return still?.access_token ?? null;
}

// Appel authentifié à la plateforme : ajoute le Bearer, tente un refresh + un
// seul retry sur 401. Renvoie la Response brute, ou null si la plateforme est
// injoignable ou si l'utilisateur n'est pas connecté (status 401 simulé).
async function apiRequest(path, { method = "GET", body } = {}) {
  const base = getPlatformUrl();
  const token = await getValidToken(base);
  if (!token) return { res: null, status: 401, error: "Non connecté. Connecte-toi depuis l'icône de l'extension." };

  const send = (t) =>
    fetch(`${base}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${t}`,
        ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });

  try {
    let res = await send(token);
    if (res.status === 401) {
      const fresh = await refreshToken(base);
      if (fresh) res = await send(fresh);
    }
    return { res, status: res.status };
  } catch {
    return { res: null, status: 0, error: "Impossible de joindre la plateforme." };
  }
}

// Variante JSON : { status, data }.
async function apiJson(path, options) {
  const { res, status, error } = await apiRequest(path, options);
  if (!res) return { status, data: { error } };
  const data = await res.json().catch(() => ({}));
  return { status, data };
}
