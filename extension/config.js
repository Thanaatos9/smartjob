// URL de base de la plateforme (sans slash final).
// En dev : http://localhost:3000  —  En prod : https://votre-domaine.com
//
// IMPORTANT : si tu changes ce domaine, mets aussi à jour "host_permissions"
// dans manifest.json (sinon l'extension n'a pas le droit d'appeler l'API).
const DEFAULT_PLATFORM_URL = "http://localhost:3000";

// Récupère l'URL configurée (modifiable via le champ ⚙️ du popup), sinon la valeur
// par défaut. On ne garde que l'origine (scheme + domaine) : un éventuel chemin
// comme "/dashboard" collé par erreur est ignoré, sinon les appels API partiraient
// vers ".../dashboard/api/..." → 404.
async function getPlatformUrl() {
  const raw = (await chrome.storage.sync.get("platformUrl")).platformUrl || DEFAULT_PLATFORM_URL;
  try {
    return new URL(raw).origin;
  } catch {
    return raw.replace(/\/+$/, "");
  }
}
