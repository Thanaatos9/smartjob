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
  lang: document.getElementById("lang"),
  fill: document.getElementById("fill"),
  prefs: document.getElementById("prefs"),
  status: document.getElementById("status"),
  docs: document.getElementById("docs"),
  docsTitle: document.getElementById("docsTitle"),
  makeDocs: document.getElementById("makeDocs"),
  dlRow: document.getElementById("dlRow"),
  dlCv: document.getElementById("dlCv"),
  dlLm: document.getElementById("dlLm"),
};

let currentTabUrl = null; // URL réelle de l'onglet
let currentTabId = null;
let currentTabTitle = "";
let target = null; // { url, fromApplyPage } : ce qu'on enverra à la plateforme

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
  currentTabTitle = tab?.title ?? "";
  if (currentTabUrl && /^https?:/i.test(currentTabUrl)) {
    target = canonicalOfferUrl(currentTabUrl);
    els.url.textContent = target.url;
    if (isWebmail(currentTabUrl)) {
      setStatus(
        "Tu es sur une boîte mail : ouvre plutôt la page de l'offre. Envoyer le mail ne marche que s'il contient toute l'offre.",
        "info"
      );
    }
  } else {
    els.url.textContent = "Onglet sans URL valide.";
    els.send.disabled = true;
    els.fill.disabled = true;
  }
}

// ---- Lecture du contenu de l'onglet --------------------------------------

// Injecté dans la page : doit être autonome (pas de closure sur le popup).
// On privilégie la zone de contenu principale pour éviter menus et barres
// latérales.
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

// Beaucoup de pages ne sont pas récupérables côté serveur : SPA, pages
// derrière une connexion. Lire le DOM de l'onglet règle ces cas d'un coup.
// Échec possible sur chrome://, le Web Store ou le lecteur PDF : on retombe
// alors sur l'envoi de l'URL seule.
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
  let token = await getValidToken(base);
  if (!token) {
    setStatus("Session expirée, reconnecte-toi.", "error");
    els.send.disabled = false;
    await render();
    return;
  }

  const post = (t, payload) =>
    fetch(`${base}/api/extension/offers`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${t}` },
      body: JSON.stringify(payload),
    });

  // Token rejeté : on tente un refresh + un seul retry avant d'abandonner.
  const send = async (payload) => {
    let res = await post(token, payload);
    if (res.status === 401) {
      const fresh = await refreshToken(base);
      if (fresh) {
        token = fresh;
        res = await post(token, payload);
      }
    }
    return res;
  };

  try {
    let res;
    if (target.fromApplyPage) {
      // Page « /apply » : elle ne contient que le formulaire. On envoie l'URL de
      // l'offre SANS texte, pour que le serveur lise la description complète.
      res = await send({ url: target.url, text: "" });
      // Si le serveur n'arrive pas à la lire (page protégée…), on retente avec
      // ce qu'affiche l'onglet : titre et entreprise au moins.
      if (res.status === 422) {
        res = await send({ url: currentTabUrl, text: await readActiveTabText() });
      }
    } else {
      res = await send({ url: target.url, text: await readActiveTabText() });
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

// ---- CV et lettre adaptés de l'offre de l'onglet -------------------------

let docsOfferId = null;

function showDocs({ title, company, ready }) {
  els.docs.classList.remove("hidden");
  const label = [title, company].filter(Boolean).join(" · ");
  els.docsTitle.textContent = label ? `CV et lettre : ${label}` : "CV et lettre de cette offre";
  els.dlRow.classList.toggle("hidden", !ready);
  els.makeDocs.classList.toggle("hidden", ready);
}

async function loadDocs() {
  if (!currentTabUrl || !/^https?:/i.test(currentTabUrl)) return;
  const { data } = await apiJson(`/api/extension/apply/docs?pageUrl=${encodeURIComponent(currentTabUrl)}`);
  if (!data || data.error) return;
  docsOfferId = data.found ? data.offerId : null;
  showDocs({ title: data.title, company: data.company, ready: !!(data.found && data.hasCv) });
}

// Retrouve ou enregistre l'offre de la page, puis crée son CV et sa lettre.
async function makeDocs() {
  els.makeDocs.disabled = true;
  setStatus("Création du CV et de la lettre adaptés (jusqu'à 30 s)…", "info");
  try {
    const text = await readActiveTabText();
    const { data } = await apiJson("/api/extension/apply/page-offer", {
      method: "POST",
      body: { url: currentTabUrl, title: currentTabTitle, text },
    });
    if (!data || data.error) {
      setStatus(data?.error || "Création impossible.", "error");
      return;
    }
    if (!data.tailored) {
      setStatus(data.warning || "CV adapté indisponible.", "error");
      return;
    }
    docsOfferId = data.offerId;
    await loadDocs();
    setStatus(
      `CV et lettre prêts${data.coverage != null ? ` (couverture ATS ${data.coverage} %)` : ""}.`,
      "ok"
    );
  } finally {
    els.makeDocs.disabled = false;
  }
}

function filenameFromDisposition(header, fallback) {
  const m = /filename\*=UTF-8''([^;]+)/i.exec(header || "") || /filename="?([^";]+)"?/i.exec(header || "");
  try {
    return m ? decodeURIComponent(m[1]) : fallback;
  } catch {
    return fallback;
  }
}

async function download(kind) {
  if (!docsOfferId) return;
  const button = kind === "letter" ? els.dlLm : els.dlCv;
  button.disabled = true;
  setStatus("Téléchargement…", "info");
  try {
    const qs = new URLSearchParams({ offerId: docsOfferId, lang: els.lang.value === "en" ? "en" : "fr" });
    if (kind === "letter") qs.set("kind", "letter");
    const { res, error } = await apiRequest(`/api/extension/apply/cv?${qs}`);
    if (!res || !res.ok) {
      const data = res ? await res.json().catch(() => ({})) : {};
      setStatus(data.error || error || "Téléchargement impossible.", "error");
      return;
    }
    const blob = await res.blob();
    const name = filenameFromDisposition(res.headers.get("Content-Disposition"), kind === "letter" ? "LM.pdf" : "CV.pdf");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 10000);
    setStatus(`${name} téléchargé.`, "ok");
  } finally {
    button.disabled = false;
  }
}

els.makeDocs.addEventListener("click", makeDocs);
els.dlCv.addEventListener("click", () => download("cv"));
els.dlLm.addEventListener("click", () => download("letter"));

// Langue du CV et de la lettre : préférence partagée avec le panneau des sites
// (auto = langue de l'offre).
const LANG_KEY = "cvLang";

async function loadLanguage() {
  const stored = (await chrome.storage.local.get(LANG_KEY))[LANG_KEY];
  els.lang.value = stored === "fr" || stored === "en" ? stored : "auto";
}

els.lang.addEventListener("change", () => {
  chrome.storage.local.set({ [LANG_KEY]: els.lang.value });
});

els.prefs.addEventListener("click", () => {
  chrome.tabs.create({ url: `${getPlatformUrl()}/auto-apply` });
});

(async function init() {
  await render();
  await loadActiveTab();
  await loadLanguage();
  if (!els.mainView.classList.contains("hidden")) await loadDocs();
})();

// Version installée, pour vérifier d'un coup d'œil que l'extension est à jour.
{
  const el = document.getElementById("version");
  if (el) el.textContent = `Version ${chrome.runtime.getManifest().version}`;
}
