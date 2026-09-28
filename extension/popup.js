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
  fill: document.getElementById("fill"),
  prefs: document.getElementById("prefs"),
  status: document.getElementById("status"),
};

let currentTabUrl = null;
let currentTabId = null;

function setStatus(text, kind = "info") {
  els.status.textContent = text;
  els.status.className = `status ${kind}`;
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
  currentTabId = tab?.id ?? null;
  if (currentTabUrl && /^https?:/i.test(currentTabUrl)) {
    els.url.textContent = currentTabUrl;
  } else {
    els.url.textContent = "Onglet sans URL valide.";
    els.send.disabled = true;
    els.fill.disabled = true;
  }
}

// ---- Lecture du contenu de l'onglet --------------------------------------

// Injecté dans la page : doit être autonome (pas de closure sur le popup).
// On privilégie la zone de contenu principale pour éviter menus et barres
// latérales — sur Gmail, [role="main"] contient le fil de discussion ouvert.
function grabPageText() {
  const root =
    document.querySelector('[role="main"]') ||
    document.querySelector("main") ||
    document.querySelector("article") ||
    document.body;
  const text = (root && root.innerText) || document.body.innerText || "";
  return text
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
    .slice(0, 12000);
}

// Beaucoup de pages ne sont pas récupérables côté serveur : webmails (le
// contenu est derrière la session, et l'id du message vit dans le fragment
// "#..." jamais envoyé au serveur), SPA, pages protégées. Lire le DOM de
// l'onglet règle tous ces cas d'un coup. Échec possible sur chrome://, le
// Web Store ou le lecteur PDF : on retombe alors sur l'envoi de l'URL seule.
async function readActiveTabText() {
  if (currentTabId == null) return "";
  try {
    const [res] = await chrome.scripting.executeScript({
      target: { tabId: currentTabId },
      func: grabPageText,
    });
    return typeof res?.result === "string" ? res.result : "";
  } catch {
    return "";
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

  const text = await readActiveTabText();

  const post = (t) =>
    fetch(`${base}/api/extension/offers`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${t}` },
      body: JSON.stringify({ url: currentTabUrl, text }),
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

// Remplissage générique d'un formulaire de candidature de l'onglet courant
// (sites d'entreprise, ATS…). activeTab suffit : aucune permission d'hôte en plus.
const FILL_FILES = [
  "config.js",
  "content/util.js",
  "content/fields.js",
  "content/filler.js",
  "content/panel.js",
  "content/fill-page.js",
];

els.fill.addEventListener("click", async () => {
  if (currentTabId == null) return;
  els.fill.disabled = true;
  try {
    await chrome.scripting.executeScript({ target: { tabId: currentTabId }, files: FILL_FILES });
    window.close();
  } catch {
    setStatus("Impossible de lire cette page (page protégée du navigateur).", "error");
    els.fill.disabled = false;
  }
});

els.prefs.addEventListener("click", () => {
  chrome.tabs.create({ url: `${getPlatformUrl()}/auto-apply` });
});

(async function init() {
  await render();
  await loadActiveTab();
})();
