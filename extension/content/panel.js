// Panneau flottant (Shadow DOM, donc isolé des styles du site) : état du run,
// offre en cours, journal et boutons de contrôle.
(() => {
  const C = globalThis.CAND;
  const HOST_ID = "cand-panel-host";

  const STYLE = `
    :host { all: initial; }
    .card {
      position: fixed; right: 16px; bottom: 16px; z-index: 2147483647;
      width: 320px; max-height: 70vh; display: flex; flex-direction: column;
      font: 13px/1.4 system-ui, -apple-system, "Segoe UI", sans-serif; color: #0a0a0a;
      background: #fff; border: 1px solid #e5e5e5; border-radius: 12px;
      box-shadow: 0 8px 30px rgba(0,0,0,.18); overflow: hidden;
    }
    .head { display: flex; align-items: center; gap: 8px; padding: 10px 12px; background: #f0fdf4; border-bottom: 1px solid #e5e5e5; }
    .title { font-weight: 600; flex: 1; }
    .badge { font-size: 11px; font-weight: 600; padding: 2px 8px; border-radius: 999px; background: #dcfce7; color: #15803d; }
    .badge.auto { background: #fef3c7; color: #b45309; }
    .icon { border: 0; background: none; cursor: pointer; font-size: 16px; line-height: 1; color: #525252; padding: 2px 4px; }
    .body { padding: 12px; display: flex; flex-direction: column; gap: 8px; overflow: auto; }
    .card.min .body { display: none; }
    .status { font-weight: 500; }
    .status.ok { color: #15803d; } .status.warn { color: #b45309; } .status.error { color: #dc2626; }
    .job { font-size: 12px; color: #525252; }
    .job b { color: #0a0a0a; }
    .counters { font-size: 12px; color: #525252; }
    .row { display: flex; gap: 6px; flex-wrap: wrap; }
    button.btn { font: inherit; font-weight: 600; font-size: 12px; padding: 7px 12px; border-radius: 8px; cursor: pointer; border: 1px solid #e5e5e5; background: #fff; color: #0a0a0a; }
    button.btn:hover { background: #f5f5f5; }
    button.btn.primary { background: #16a34a; border-color: #16a34a; color: #fff; }
    button.btn.primary:hover { opacity: .9; background: #16a34a; }
    button.btn.danger { color: #dc2626; }
    .hidden { display: none !important; }
    .log { list-style: none; margin: 0; padding: 0; max-height: 120px; overflow: auto; font-size: 11px; color: #525252; border-top: 1px solid #f0f0f0; padding-top: 6px; }
    .log li { padding: 1px 0; } .log li.ok { color: #15803d; } .log li.warn { color: #b45309; } .log li.error { color: #dc2626; }
    a { color: #16a34a; font-size: 12px; }
  `;

  const HTML = `
    <div class="card">
      <div class="head">
        <span class="title">Candidature auto</span>
        <span class="badge" id="mode"></span>
        <button class="icon" id="min" title="Réduire" aria-label="Réduire">–</button>
        <button class="icon hidden" id="close" title="Fermer" aria-label="Fermer">✕</button>
      </div>
      <div class="body">
        <div class="status" id="status" aria-live="polite">Prêt.</div>
        <div class="job hidden" id="job"></div>
        <div class="counters" id="counters"></div>
        <div class="row">
          <button class="btn primary" id="start">Démarrer</button>
          <button class="btn hidden" id="pause">Pause</button>
          <button class="btn hidden" id="resume">Reprendre</button>
          <button class="btn primary hidden" id="continue">Continuer</button>
          <button class="btn hidden" id="skip">Passer cette offre</button>
          <button class="btn danger hidden" id="stop">Arrêter</button>
        </div>
        <ul class="log" id="log"></ul>
        <a id="settings" target="_blank" rel="noopener">Réglages d'auto-candidature</a>
      </div>
    </div>
  `;

  let host = null;
  let root = null;
  const handlers = {};

  const $ = (id) => root.getElementById(id);
  const show = (id, on) => $(id).classList.toggle("hidden", !on);

  const Panel = (C.Panel = {
    mounted: () => Boolean(host && host.isConnected),

    mount({ title = "Candidature auto", controls = true } = {}) {
      if (Panel.mounted()) return;
      host = document.createElement("div");
      host.id = HOST_ID;
      host.setAttribute("data-cand-ignore", "");
      root = host.attachShadow({ mode: "open" });
      root.innerHTML = `<style>${STYLE}</style>${HTML}`;
      document.documentElement.appendChild(host);

      $("settings").href = `${getPlatformUrl()}/auto-apply`;
      root.querySelector(".title").textContent = title;
      $("min").addEventListener("click", () => root.querySelector(".card").classList.toggle("min"));
      $("close").addEventListener("click", () => Panel.unmount());
      for (const name of ["start", "pause", "resume", "stop", "continue", "skip"]) {
        $(name).addEventListener("click", () => handlers[name] && handlers[name]());
      }
      if (!controls) {
        show("start", false);
        show("close", true);
      }
      Panel.setState("idle", controls);
    },

    unmount() {
      if (host) host.remove();
      host = null;
      root = null;
    },

    on(name, fn) {
      handlers[name] = fn;
    },

    setMode(mode) {
      if (!Panel.mounted()) return;
      const el = $("mode");
      el.textContent = mode === "auto" ? "Auto" : "Semi-auto";
      el.classList.toggle("auto", mode === "auto");
    },

    // 'idle' | 'running' | 'paused' | 'waiting'
    setState(state, controls = true) {
      if (!Panel.mounted() || !controls) return;
      show("start", state === "idle");
      show("pause", state === "running");
      show("resume", state === "paused");
      show("stop", state !== "idle");
      if (state !== "waiting") {
        show("continue", false);
        show("skip", false);
      }
    },

    // Boutons contextuels quand on attend l'utilisateur.
    waiting({ allowContinue = true } = {}) {
      if (!Panel.mounted()) return;
      Panel.setState("waiting");
      show("continue", allowContinue);
      show("skip", true);
      show("pause", false);
    },

    status(text, kind = "info") {
      if (!Panel.mounted()) return;
      const el = $("status");
      el.textContent = text;
      el.className = `status ${kind === "info" ? "" : kind}`;
    },

    job(title, company, score) {
      if (!Panel.mounted()) return;
      const el = $("job");
      if (!title) {
        el.classList.add("hidden");
        return;
      }
      el.classList.remove("hidden");
      el.textContent = "";
      const b = document.createElement("b");
      b.textContent = title;
      el.append(b);
      const rest = [company, score != null ? `score ${score}/10` : null].filter(Boolean).join(" · ");
      if (rest) el.append(document.createTextNode(` — ${rest}`));
    },

    counters(text) {
      if (Panel.mounted()) $("counters").textContent = text;
    },

    log(text, kind = "info") {
      if (!Panel.mounted()) return;
      const li = document.createElement("li");
      if (kind !== "info") li.className = kind;
      li.textContent = `${new Date().toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}  ${text}`;
      const log = $("log");
      log.prepend(li);
      while (log.children.length > 40) log.lastChild.remove();
    },
  });
})();
