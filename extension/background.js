// Service worker : pont entre les content scripts et la plateforme.
// Les content scripts tournent dans la page (LinkedIn, WTTJ…) et sont soumis à
// ses règles CORS ; le service worker, lui, peut appeler la plateforme grâce
// aux host_permissions et détient la session.
importScripts("config.js", "auth.js");

// Chemins autorisés : un content script ne doit pas pouvoir faire appeler
// n'importe quelle route de la plateforme avec le token de l'utilisateur.
const ALLOWED = new Set([
  "GET /api/extension/apply/config",
  "POST /api/extension/apply/prepare",
  "POST /api/extension/apply/answers",
  "POST /api/extension/apply/result",
]);

// Conversion en base64 par morceaux (btoa plante sur de gros tableaux d'un bloc).
function toBase64(bytes) {
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

function filenameFrom(header) {
  const match = /filename\*=UTF-8''([^;]+)/i.exec(header || "");
  if (!match) return "CV.pdf";
  try {
    return decodeURIComponent(match[1]);
  } catch {
    return "CV.pdf";
  }
}

async function handle(message, sender) {
  switch (message?.type) {
    case "api": {
      const method = message.method || "GET";
      if (!ALLOWED.has(`${method} ${message.path}`)) {
        return { status: 400, data: { error: "Appel non autorisé" } };
      }
      return apiJson(message.path, { method, body: message.body });
    }

    case "cv": {
      const { res, status, error } = await apiRequest("/api/extension/apply/cv");
      if (!res) return { status, error };
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        return { status, error: data.error || `Erreur (${status})` };
      }
      const bytes = new Uint8Array(await res.arrayBuffer());
      return {
        status,
        base64: toBase64(bytes),
        filename: filenameFrom(res.headers.get("Content-Disposition")),
      };
    }

    case "whoami":
      return { tabId: sender.tab?.id ?? null };

    default:
      return { status: 400, data: { error: "Message inconnu" } };
  }
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  // Seuls les content scripts de l'extension elle-même sont servis.
  if (sender.id !== chrome.runtime.id) return false;
  handle(message, sender).then(sendResponse, (err) =>
    sendResponse({ status: 0, data: { error: String(err?.message || err) }, error: String(err?.message || err) })
  );
  return true; // réponse asynchrone
});
