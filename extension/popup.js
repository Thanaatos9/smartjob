const els = {
  loginView: document.getElementById("loginView"),
  mainView: document.getElementById("mainView"),
  email: document.getElementById("email"),
  password: document.getElementById("password"),
  loginBtn: document.getElementById("loginBtn"),
  accountEmail: document.getElementById("accountEmail"),
  logoutBtn: document.getElementById("logoutBtn"),
  url: document.getElementById("url"),
  send: document.getElementById("send"),
  open: document.getElementById("open"),
  status: document.getElementById("status"),
  toggleSettings: document.getElementById("toggleSettings"),
  settings: document.getElementById("settings"),
  platformUrl: document.getElementById("platformUrl"),
  saveSettings: document.getElementById("saveSettings"),
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

// Renvoie un access_token valide, en rafraîchissant si nécessaire. null si la
// session est définitivement perdue (→ reconnexion requise).
async function getValidToken(base) {
  const auth = await getAuth();
  if (!auth?.access_token) return null;

  const expiresMs = (auth.expires_at ?? 0) * 1000;
  if (Date.now() < expiresMs - 60_000) return auth.access_token;

  // Token expiré ou bientôt : on rafraîchit.
  try {
    const res = await fetch(`${base}/api/extension/refresh`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refresh_token: auth.refresh_token }),
    });
    if (!res.ok) {
      await clearAuth();
      return null;
    }
    const data = await res.json();
    await setAuth({ ...auth, ...data });
    return data.access_token;
  } catch {
    return auth.access_token; // hors-ligne : on tente avec l'ancien
  }
}

// ---- Vues ----------------------------------------------------------------

async function render() {
  const auth = await getAuth();
  if (auth?.access_token) {
    els.loginView.classList.add("hidden");
    els.mainView.classList.remove("hidden");
    els.accountEmail.textContent = auth.email || "Connecté";
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

  try {
    const res = await fetch(`${base}/api/extension/offers`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ url: currentTabUrl }),
    });
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

els.toggleSettings.addEventListener("click", () => els.settings.classList.toggle("hidden"));
els.saveSettings.addEventListener("click", async () => {
  const value = els.platformUrl.value.trim();
  await chrome.storage.sync.set({ platformUrl: value });
  setStatus("URL plateforme enregistrée.", "ok");
  els.settings.classList.add("hidden");
});

(async function init() {
  const { platformUrl } = await chrome.storage.sync.get("platformUrl");
  if (platformUrl) els.platformUrl.value = platformUrl;
  await render();
  await loadActiveTab();
})();
