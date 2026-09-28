// Utilitaires communs aux content scripts. Tout vit dans l'espace de noms
// globalThis.CAND (les content scripts d'une même extension partagent leur monde).
(() => {
  const C = (globalThis.CAND = globalThis.CAND || {});

  // Drapeaux de contrôle du run en cours : tous les délais et attentes les
  // consultent, ce qui rend Pause et Arrêter réactifs même en plein délai.
  C.flags = C.flags || { stop: false, paused: false };

  class Cancelled extends Error {
    constructor() {
      super("Arrêté par l'utilisateur");
      this.name = "Cancelled";
    }
  }
  C.Cancelled = Cancelled;

  // Point de contrôle : lève si on a arrêté, attend si on est en pause.
  C.tick = async () => {
    while (C.flags.paused && !C.flags.stop) {
      await new Promise((r) => setTimeout(r, 250));
    }
    if (C.flags.stop) throw new Cancelled();
  };

  // sleep interruptible : découpé en tranches pour réagir à Pause / Arrêter.
  C.sleep = async (ms) => {
    const end = Date.now() + ms;
    for (;;) {
      await C.tick();
      const left = end - Date.now();
      if (left <= 0) return;
      await new Promise((r) => setTimeout(r, Math.min(250, left)));
    }
  };

  C.rand = (min, max) => min + Math.random() * (max - min);
  C.pause = (min, max) => C.sleep(C.rand(min, max));

  // Texte normalisé : minuscules, sans accents, espaces compactés.
  C.norm = (s) =>
    String(s ?? "")
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/[’‘]/g, "'")
      .toLowerCase()
      .replace(/\s+/g, " ")
      .trim();

  C.isVisible = (el) => {
    if (!el || !el.isConnected) return false;
    const rect = el.getBoundingClientRect();
    if (rect.width === 0 && rect.height === 0) return false;
    const style = getComputedStyle(el);
    return style.visibility !== "hidden" && style.display !== "none";
  };

  // Attend qu'une condition renvoie une valeur truthy. Renvoie cette valeur,
  // ou null au bout du délai. Interruptible.
  C.waitFor = async (fn, { timeout = 8000, interval = 250 } = {}) => {
    const end = Date.now() + timeout;
    for (;;) {
      await C.tick();
      let value = null;
      try {
        value = fn();
      } catch {
        value = null;
      }
      if (value) return value;
      if (Date.now() >= end) return null;
      await new Promise((r) => setTimeout(r, interval));
    }
  };

  C.click = (el) => {
    el.scrollIntoView({ block: "center", inline: "nearest" });
    el.click();
  };

  // Affecte une valeur à un champ contrôlé par React/Ember : on passe par le
  // setter natif du prototype, sinon le framework ignore le changement.
  C.setNativeValue = (el, value) => {
    const proto =
      el instanceof HTMLTextAreaElement
        ? HTMLTextAreaElement.prototype
        : el instanceof HTMLSelectElement
          ? HTMLSelectElement.prototype
          : HTMLInputElement.prototype;
    const setter = Object.getOwnPropertyDescriptor(proto, "value")?.set;
    if (setter) setter.call(el, value);
    else el.value = value;
  };

  C.fire = (el, ...types) => {
    for (const type of types) {
      el.dispatchEvent(
        type === "input"
          ? new InputEvent("input", { bubbles: true, inputType: "insertText" })
          : new Event(type, { bubbles: true })
      );
    }
  };

  // Message vers le service worker. Ne rejette jamais : renvoie un objet d'erreur.
  C.send = (message) =>
    new Promise((resolve) => {
      try {
        chrome.runtime.sendMessage(message, (response) => {
          if (chrome.runtime.lastError) {
            resolve({ status: 0, error: "Extension rechargée : recharge la page.", data: { error: "Extension rechargée : recharge la page." } });
          } else {
            resolve(response ?? { status: 0, error: "Pas de réponse de l'extension." , data: { error: "Pas de réponse de l'extension." } });
          }
        });
      } catch {
        resolve({ status: 0, error: "Extension rechargée : recharge la page.", data: { error: "Extension rechargée : recharge la page." } });
      }
    });

  C.api = (method, path, body) => C.send({ type: "api", method, path, body });

  C.text = (el, max = 12000) =>
    ((el && (el.innerText || el.textContent)) || "")
      .replace(/[ \t]+/g, " ")
      .replace(/\n{3,}/g, "\n\n")
      .trim()
      .slice(0, max);
})();
