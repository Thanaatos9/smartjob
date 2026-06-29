const els = {
  loginView: document.getElementById("loginView"),
  mainView: document.getElementById("mainView"),
  email: document.getElementById("email"),
  password: document.getElementById("password"),
  loginBtn: document.getElementById("loginBtn"),
  logoutBtn: document.getElementById("logoutBtn"),
  url: document.getElementById("url"),
  send: document.getElementById("send"),
  open: document.getElementById("open"),
  status: document.getElementById("status"),
};

let currentTabUrl = null;

function setStatus(text, kind = "info") {
  els.status.textContent = text;
  els.status.className = `status ${kind}`;
}

// ---- Session (stockée dans chrome.storage.local) -------------------------

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

// ---- Vues ----------------------------------------------------------------

async function render() {
  const auth = await getAuth();
  if (auth?.access_token) {
    els.loginView.classList.add("hidden");
    els.mainView.classList.remove("hidden");
  } else {
    els.mainView.classList.add("hidden");
    els.loginView.classList.remove("hidden");
  }
}

// ---- Onglet actif --------------------------------------------------------

async function loadActiveTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  currentTabUrl = tab?.url ?? null;
  if (currentTabUrl && /^https?:/i.test(currentTabUrl)) {
    els.url.textContent = currentTabUrl;
  } else {
    els.url.textContent = "Onglet sans URL valide.";
    els.send.disabled = true;
  }
}

// ---- Connexion -----------------------------------------------------------

async function login() {
  const email = els.email.value.trim();
  const password = els.password.value;
  if (!email || !password) {
    setStatus("Email et mot de passe requis.", "error");
    return;
  }
  els.loginBtn.disabled = true;
  setStatus("Connexion…", "info");

  const base = await getPlatformUrl();
  try {
    const res = await fetch(`${base}/api/extension/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    const data = await res.json().catch(() => ({}));
    els.loginBtn.disabled = false;

    if (!res.ok) {
      setStatus(data.error || `Échec connexion (${res.status})`, "error");
      return;
    }
    await setAuth(data);
    els.password.value = "";
    setStatus("Compte relié ✓", "ok");
    await render();
  } catch {
    els.loginBtn.disabled = false;
    setStatus("Impossible de joindre la plateforme. Vérifie l'URL (⚙️).", "error");
  }
}

// ---- Envoi de l'offre ----------------------------------------------------

async function sendOffer() {
  if (!currentTabUrl) return;
  els.send.disabled = true;
  els.open.classList.add("hidden");
  setStatus("Envoi et analyse en cours… (quelques secondes)", "info");

  const base = await getPlatformUrl();
  const token = await getValidToken(base);
  if (!token) {
    setStatus("Session expirée, reconnecte-toi.", "error");
    els.send.disabled = false;
    await render();
    return;
  }

  const post = (t) =>
    fetch(`${base}/api/extension/offers`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${t}` },
      body: JSON.stringify({ url: currentTabUrl }),
    });

  try {
    let res = await post(token);

    // Token rejeté : on tente un refresh + un seul retry avant d'abandonner.
    if (res.status === 401) {
      const fresh = await refreshToken(base);
      if (fresh) res = await post(fresh);
    }

    const data = await res.json().catch(() => ({}));
    els.send.disabled = false;

    if (res.status === 401) {
      await clearAuth();
      setStatus("Session expirée, reconnecte-toi.", "error");
      await render();
      return;
    }
    if (!res.ok) {
      setStatus(data.error || `Erreur (${res.status})`, "error");
      return;
    }

    if (data.id) {
      setStatus("Offre envoyée ✓", "ok");
      els.open.classList.remove("hidden");
      els.open.onclick = () => chrome.tabs.create({ url: `${base}/offers/${data.id}` });
    } else {
      setStatus(data.error || "Offre envoyée, mais lien indisponible.", "info");
    }
  } catch {
    setStatus("Impossible de joindre la plateforme. Vérifie l'URL (⚙️).", "error");
    els.send.disabled = false;
  }
}

// ---- Événements ----------------------------------------------------------

els.loginBtn.addEventListener("click", login);
els.password.addEventListener("keydown", (e) => { if (e.key === "Enter") login(); });
els.logoutBtn.addEventListener("click", async () => {
  await clearAuth();
  setStatus("Déconnecté.", "info");
  await render();
});
els.send.addEventListener("click", sendOffer);

(async function init() {
  await render();
  await loadActiveTab();
})();
