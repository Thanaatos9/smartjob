// Orchestrateur d'un run de candidatures pour le site courant (C.adapter).
//
// Deux modes de navigation, selon l'adaptateur :
//  - "inline" (LinkedIn) : tout se passe dans la même page (liste + volet + modale) ;
//  - "pages"  (WTTJ, JobTeaser) : liste → page de l'offre → formulaire. L'état du
//    run (file d'offres, offre en cours) est persisté dans chrome.storage.local
//    et repris à chaque chargement de page.
//
// Deux modes d'envoi, réglés sur la plateforme :
//  - semi : tout est rempli, l'utilisateur clique lui-même sur Envoyer ;
//  - auto : l'extension envoie, mais abandonne l'offre au moindre doute.
(() => {
  const C = globalThis.CAND;
  const A = C.adapter;
  if (!A || !C.Panel || !C.Filler) return;
  const { Panel, Filler, Fields } = C;

  const RUN_KEY = "run";
  const MAX_ATTEMPTS = 40; // offres traitées par run
  const MAX_STEPS = 15; // étapes d'un même formulaire
  const MAX_FAIL_STREAK = 4; // échecs consécutifs avant arrêt (sélecteurs cassés ?)
  const USER_WAIT_MS = 15 * 60 * 1000;

  const SKIP_TEXT = {
    already_applied: "déjà postulé",
    blacklisted: "entreprise blacklistée",
    daily_limit: "plafond des 24 h atteint",
    low_score: "score trop bas",
    score_unavailable: "score indisponible",
  };

  // Fin normale (plafond, plus d'offres) et arrêt sur erreur bloquante.
  class Finish extends Error {}
  class Fatal extends Error {}

  let run = null; // état persistant du run
  let config = null; // profil, préférences, quota (plateforme)
  let busy = false; // une boucle tourne dans cette page
  let myTabId = null;
  let unloading = false; // la page est en train d'être quittée
  let pendingUser = null; // résout l'attente utilisateur en cours

  window.addEventListener("pagehide", () => {
    unloading = true;
  });

  // ---- Persistance --------------------------------------------------------

  const saveRun = () => {
    try {
      chrome.storage.local.set({ [RUN_KEY]: run });
    } catch {
      // contexte d'extension invalidé (rechargement) : rien à sauvegarder
    }
  };

  const loadRun = async () => {
    try {
      return (await chrome.storage.local.get(RUN_KEY))[RUN_KEY] || null;
    } catch {
      return null;
    }
  };

  const log = (text, kind) => Panel.log(text, kind);

  const isMine = () => Boolean(run && run.site === A.id && run.tabId === myTabId);

  const refreshPanel = () => {
    if (!run) return;
    const s = run.stats;
    const quota = config ? ` · 24 h : ${config.usage.used24h + s.submitted}/${config.preferences.daily_limit}` : "";
    Panel.counters(`Envoyées ${s.submitted} · ignorées ${s.skipped} · externes ${s.external} · échecs ${s.failed}${quota}`);
    Panel.setMode(run.mode);
  };

  // ---- Attentes ----------------------------------------------------------

  // Si le site réclame une preuve d'humanité (captcha, checkpoint), on attend
  // que l'utilisateur la résolve. On ne tente jamais de la contourner.
  async function guardHuman() {
    if (!C.humanCheck()) return;
    Panel.status("Vérification de sécurité détectée : résous-la, je reprends ensuite.", "warn");
    log("Vérification de sécurité détectée — en pause", "warn");
    await C.waitFor(() => !C.humanCheck(), { timeout: USER_WAIT_MS, interval: 1500 });
    Panel.status("Reprise…");
  }

  function guardUnload() {
    if (unloading) throw new C.Cancelled();
  }

  // Attend une action de l'utilisateur. Résout 'auto' (condition remplie),
  // 'continue' / 'skip' (boutons du panneau) ou un état posé par pendingUser().
  function waitForUser({ until, allowContinue = true } = {}) {
    Panel.waiting({ allowContinue });
    return new Promise((resolve, reject) => {
      const deadline = Date.now() + USER_WAIT_MS;
      const finish = (value) => {
        clearInterval(timer);
        pendingUser = null;
        resolve(value);
      };
      pendingUser = finish;
      const timer = setInterval(() => {
        if (C.flags.stop) {
          clearInterval(timer);
          pendingUser = null;
          reject(new C.Cancelled());
          return;
        }
        if (Date.now() > deadline) return finish("skip");
        try {
          if (until && until()) finish("auto");
        } catch {
          // condition instable pendant un re-rendu : on réessaie au prochain tour
        }
      }, 600);
    }).finally(() => {
      if (!C.flags.stop) Panel.setState(C.flags.paused ? "paused" : "running");
    });
  }

  // Condition « le formulaire a disparu » avec un délai de grâce : un re-rendu
  // du site ne doit pas passer pour un envoi réussi.
  function goneOrSucceeded() {
    let goneSince = 0;
    return () => {
      if (A.succeeded()) return true;
      if (A.root()) {
        goneSince = 0;
        return false;
      }
      goneSince ||= Date.now();
      return Date.now() - goneSince > 2000;
    };
  }

  async function betweenJobs() {
    const [lo, hi] = run.mode === "auto" ? [25, 60] : [3, 7];
    const seconds = Math.round(C.rand(lo, hi));
    for (let s = seconds; s > 0; s--) {
      Panel.status(`Prochaine offre dans ${s} s…`);
      await C.sleep(1000);
    }
  }

  const clearFlags = () => {
    for (const el of document.querySelectorAll("[data-cand-flag]")) {
      el.removeAttribute("data-cand-flag");
      el.style.outline = "";
      el.style.outlineOffset = "";
    }
  };

  // ---- Formulaire ---------------------------------------------------------

  function fillContext(job) {
    return {
      profile: config.profile,
      prefs: config.preferences,
      offerId: job.offerId,
      context: job.title,
      language: job.language || "fr",
      resumeSelected: () => A.resumeSelected(A.root()),
    };
  }

  const CV_LABEL = { fr: "CV français", en: "CV anglais" };

  // Après un clic sur Envoyer : 'ok' (confirmation vue), 'gone' (le formulaire a
  // disparu, envoi très probable) ou null (formulaire toujours là : refus).
  async function confirmSubmission() {
    await C.sleep(1500); // laisse le site traiter l'envoi
    return C.waitFor(() => (A.succeeded() ? "ok" : !A.root() ? "gone" : null), { timeout: 15000 });
  }

  async function waitForSubmit() {
    const onClick = (event) => {
      const root = A.root();
      const submit = root && A.actions(root).submit;
      if (submit && event.target instanceof Node && submit.contains(event.target) && pendingUser) {
        pendingUser("clicked");
      }
    };
    document.addEventListener("click", onClick, true);
    try {
      return await waitForUser({ until: goneOrSucceeded(), allowContinue: false });
    } finally {
      document.removeEventListener("click", onClick, true);
    }
  }

  const skipped = () => ({ status: "skipped", reason: "passée par l'utilisateur" });

  async function abandon(reason) {
    clearFlags();
    await A.close();
    return { status: "failed", reason };
  }

  async function submitted(done) {
    await C.pause(800, 1500);
    await A.close(); // ferme la fenêtre de confirmation éventuelle
    return { status: "submitted", reason: done === "gone" ? "confirmation non détectée" : undefined };
  }

  async function stepLoop(job, root) {
    for (let step = 1; step <= MAX_STEPS; step++) {
      await C.tick();
      await guardHuman();
      root = A.root() || root;

      Panel.status(`Étape ${step} : remplissage…`);
      const result = await Filler.fillRoot(root, fillContext(job));
      if (result.error) log(`Réponses IA indisponibles : ${result.error}`, "warn");
      await C.pause(500, 1200);

      // Champs obligatoires sans réponse fiable : jamais devinés.
      if (result.unresolved.length > 0) {
        const names = result.unresolved.map((f) => f.label || f.name || "champ sans libellé");
        if (run.mode === "auto") return abandon(`Réponse manquante : ${names[0]}`);

        Panel.status(`Complète ${names.length} champ(s) surligné(s) en orange, puis je continue.`, "warn");
        log(`À compléter : ${names.join(", ")}`, "warn");
        const ctx = fillContext(job);
        const answer = await waitForUser({
          until: () => {
            const cur = A.root();
            return !cur || Filler.stillMissing(cur, ctx).length === 0;
          },
        });
        clearFlags();
        if (answer === "skip") {
          await A.close();
          return skipped();
        }
      }

      root = A.root() || root;
      const actions = A.actions(root);

      if (actions.submit) {
        if (run.mode === "auto") {
          Panel.status("Envoi de la candidature…");
          await C.pause(600, 1500);
          C.click(actions.submit);
          const done = await confirmSubmission();
          return done ? submitted(done) : abandon("envoi refusé par le site");
        }

        // Semi-auto : l'utilisateur relit et clique lui-même.
        actions.submit.scrollIntoView({ block: "center" });
        actions.submit.style.outline = "3px solid #16a34a";
        actions.submit.style.outlineOffset = "2px";
        Panel.status("Formulaire prêt : vérifie, puis clique sur Envoyer.", "ok");
        for (;;) {
          const answer = await waitForSubmit();
          actions.submit.style.outline = "";
          if (answer === "skip") {
            await A.close();
            return skipped();
          }
          const done = await confirmSubmission();
          if (done) return submitted(done);
          Panel.status("Le site refuse l'envoi : corrige le formulaire puis clique à nouveau sur Envoyer.", "warn");
        }
      }

      const next = actions.review || actions.next;
      if (!next) return abandon("bouton Suivant / Envoyer introuvable");

      const before = Fields.signature(root);
      C.click(next);
      await C.pause(700, 1400);
      const moved = await C.waitFor(
        () => {
          const cur = A.root();
          return A.succeeded() || !cur || Fields.signature(cur) !== before;
        },
        { timeout: 8000 }
      );

      if (!moved) {
        // Toujours la même étape : le site a refusé (champ invalide).
        if (run.mode === "auto") return abandon("validation refusée par le site");
        Panel.status("Le site refuse cette étape : corrige les champs en erreur.", "warn");
        const answer = await waitForUser({
          until: () => {
            const cur = A.root();
            return !cur || Fields.signature(cur) !== before;
          },
          allowContinue: false,
        });
        if (answer === "skip") {
          await A.close();
          return skipped();
        }
      }
    }
    return abandon("trop d'étapes dans le formulaire");
  }

  // Ouvre le formulaire (ou le retrouve après une navigation) puis le remplit.
  async function applyFlow(job, { resumed = false } = {}) {
    run.phase = "applying";
    run.current = job;
    job.clicks = job.clicks || 0;
    saveRun();

    let root = A.root();
    if (!root && resumed) root = await C.waitFor(() => A.root(), { timeout: 15000 });

    if (!root) {
      guardUnload();
      if (resumed && job.clicks >= 1) return { status: "failed", reason: "formulaire introuvable" };
      const button = A.applyButton();
      if (!button.el || button.kind !== "internal") {
        return { status: "failed", reason: "bouton de candidature introuvable" };
      }
      job.clicks += 1;
      run.current = job;
      saveRun();
      Panel.status("Ouverture du formulaire…");
      C.click(button.el);
      root = await C.waitFor(() => A.root(), { timeout: 15000 });
      guardUnload(); // la page a peut-être navigué : le prochain chargement reprend
    }

    if (!root) {
      await A.close();
      return { status: "failed", reason: "formulaire introuvable" };
    }
    return stepLoop(job, root);
  }

  // ---- Une offre ----------------------------------------------------------

  function apiOrThrow(res) {
    if (res.status === 401) throw new Fatal("Session expirée : reconnecte-toi depuis l'icône de l'extension.");
    if (res.status === 0) throw new Fatal((res.data && res.data.error) || "Plateforme injoignable.");
    // 400 « CV manquant » bloque tout le run ; un 400 sur une offre précise
    // (données illisibles) ne fait échouer que cette offre.
    if (res.status === 400 && res.data && /\bCV\b/.test(res.data.error || "")) throw new Fatal(res.data.error);
    if (res.status !== 200) throw new Error((res.data && res.data.error) || `Erreur plateforme (${res.status})`);
    return res.data;
  }

  async function processJob(card) {
    Panel.job(card.title, card.company);
    Panel.status("Lecture de l'offre…");
    if (A.flow === "inline" && card.el) await A.openCard(card);

    const info = await C.waitFor(
      () => {
        const read = A.readJob(card);
        return read && read.hasDescription ? read : null;
      },
      { timeout: 10000 }
    );
    guardUnload();
    if (!info) return { job: card, status: "skipped", reason: "offre illisible" };

    const job = { ...card, ...info, el: undefined };
    Panel.job(job.title, job.company);

    // Langue du CV et de la lettre : imposée par l'utilisateur, ou celle de l'offre.
    const langPref = await C.getLangPref();
    job.language = langPref === "auto" ? C.detectLanguage(info.text) : langPref;

    // Les offres qu'on ne peut pas postuler d'ici ne coûtent ni score ni IA.
    const button = A.applyButton();
    if (button.kind === "applied") return { job, status: "skipped", reason: "déjà postulé sur le site" };
    if (button.kind === "external") return { job, status: "external", reason: "candidature sur le site de l'entreprise" };
    if (button.kind === "login") throw new Fatal(`Connecte-toi à ${A.label} dans ce navigateur, puis relance.`);
    if (button.kind !== "internal") return { job, status: "skipped", reason: "pas de bouton de candidature" };

    Panel.status("Calcul du score de correspondance…");
    const prepared = apiOrThrow(
      await C.api("POST", "/api/extension/apply/prepare", {
        site: A.id,
        jobKey: job.key,
        url: job.url,
        title: job.title,
        company: job.company,
        location: job.location,
        text: job.text,
        language: job.language,
      })
    );
    job.offerId = prepared.offerId;
    job.score = prepared.score;
    // CV réellement retenu : l'autre langue si celle demandée n'est pas enregistrée.
    job.cvLanguage = prepared.cvLanguage || job.language;
    Panel.job(job.title, job.company, prepared.score, CV_LABEL[job.cvLanguage]);
    if (job.cvLanguage !== job.language && !run.warnedCv) {
      run.warnedCv = true;
      log(
        `${CV_LABEL[job.language]} non enregistré : ${CV_LABEL[job.cvLanguage]} utilisé. Ajoute-le sur la page Profil du site.`,
        "warn"
      );
    }
    if (config) config.usage.remaining = prepared.remaining;

    if (prepared.decision === "skip") {
      if (prepared.skipReason === "daily_limit") throw new Finish("Plafond des 24 h atteint : c'est fini pour aujourd'hui.");
      // Le serveur a déjà journalisé cette décision.
      return { job, status: "skipped", reason: SKIP_TEXT[prepared.skipReason] || prepared.skipReason, serverRecorded: true };
    }

    return { job, ...(await applyFlow(job)) };
  }

  // Enregistre l'issue, met à jour les compteurs et l'état persistant.
  async function conclude(job, outcome) {
    const stats = run.stats;
    if (outcome.status === "failed") {
      stats.failed += 1;
      run.failStreak = (run.failStreak || 0) + 1;
    } else {
      stats[outcome.status] += 1;
      run.failStreak = 0;
    }

    const kind = outcome.status === "submitted" ? "ok" : outcome.status === "failed" ? "error" : "info";
    const label = { submitted: "Envoyée", skipped: "Ignorée", external: "Site externe", failed: "Échec" }[outcome.status];
    const name = [job.title, job.company].filter(Boolean).join(" — ") || job.key;
    log(`${label} : ${name}${outcome.reason ? ` (${outcome.reason})` : ""}`, kind);

    if (A.flow === "pages") {
      run.index += 1;
      run.phase = "idle";
      run.current = null;
    }
    saveRun();
    refreshPanel();

    if (!outcome.serverRecorded && !unloading) {
      const res = await C.api("POST", "/api/extension/apply/result", {
        site: A.id,
        jobKey: job.key,
        offerId: job.offerId || undefined,
        status: outcome.status,
        reason: outcome.reason || undefined,
        // Offre externe : la plateforme l'enregistre pour la postuler à la main.
        job:
          outcome.status === "external"
            ? { url: job.url, title: job.title, company: job.company, location: job.location, text: job.text }
            : undefined,
      });
      if (res.status !== 200) log(`Journal non enregistré : ${(res.data && res.data.error) || res.status}`, "warn");
      else if (config && typeof res.data.remaining === "number") config.usage.remaining = res.data.remaining;
    }

    if (run.failStreak >= MAX_FAIL_STREAK) {
      throw new Fatal(
        `${MAX_FAIL_STREAK} échecs de suite : ${A.label} a peut-être changé sa page. Arrêt du run.`
      );
    }
  }

  async function handleJob(card, { resumed = false } = {}) {
    if (!resumed) run.attempts += 1;
    let result;
    try {
      result = resumed ? { job: card, ...(await applyFlow(card, { resumed: true })) } : await processJob(card);
    } catch (err) {
      if (err instanceof C.Cancelled || err instanceof Finish || err instanceof Fatal) throw err;
      result = { job: card, status: "failed", reason: err && err.message ? err.message : "erreur inattendue" };
    }
    await conclude(result.job, result);
  }

  // ---- Boucles ------------------------------------------------------------

  async function runInline() {
    const known = new Set(run.done);
    while (run.status === "running") {
      await C.tick();
      await guardHuman();
      if (run.attempts >= MAX_ATTEMPTS) throw new Finish(`Limite de ${MAX_ATTEMPTS} offres atteinte pour ce run.`);

      let card = A.listCards().find((c) => !known.has(c.key));
      if (!card && A.pageKind() === "job" && known.size === 0) {
        const single = A.readJob(null);
        if (single) card = { key: single.key, title: single.title, company: single.company };
      }
      if (!card) {
        if (!(await A.loadMore(known))) throw new Finish("Plus d'offres à traiter sur cette page.");
        continue;
      }

      known.add(card.key);
      run.done.push(card.key);
      await handleJob(card);
      await betweenJobs();
    }
  }

  async function runPages() {
    while (run.status === "running") {
      await C.tick();
      await guardHuman();
      const job = run.queue[run.index];
      if (!job) throw new Finish("File d'offres terminée.");
      if (run.attempts >= MAX_ATTEMPTS) throw new Finish(`Limite de ${MAX_ATTEMPTS} offres atteinte pour ce run.`);

      const here = A.keyFromLocation() === job.key;

      if (run.phase === "applying" && run.current) {
        if (here) {
          // Reprise après la navigation vers le formulaire.
          await handleJob(run.current, { resumed: true });
        } else {
          await conclude(run.current, { status: "failed", reason: "redirection inattendue" });
        }
        if (run.queue[run.index]) await betweenJobs();
        continue;
      }

      if (!here) {
        Panel.status(`Ouverture : ${job.title || job.url}`);
        await C.pause(800, 1800);
        guardUnload();
        location.href = job.url; // le chargement suivant reprend le run
        return;
      }

      await handleJob(job);
      if (run.queue[run.index]) await betweenJobs();
    }
  }

  async function loop() {
    if (busy) return;
    busy = true;
    try {
      await (A.flow === "inline" ? runInline() : runPages());
    } catch (err) {
      if (unloading) return; // navigation en cours : le prochain chargement reprend
      if (err instanceof C.Cancelled) return; // l'arrêt a déjà mis à jour le panneau
      if (err instanceof Finish) endRun("done", err.message, "ok");
      else if (err instanceof Fatal) endRun("stopped", err.message, "error");
      else endRun("stopped", `Erreur inattendue : ${err && err.message ? err.message : err}`, "error");
    } finally {
      busy = false;
    }
  }

  function endRun(status, message, kind) {
    if (run) {
      run.status = status;
      run.phase = "idle";
      run.current = null;
      saveRun();
    }
    clearFlags();
    Panel.setState("idle");
    Panel.status(message, kind);
    log(message, kind);
    refreshPanel();
  }

  // ---- Démarrage / contrôle ----------------------------------------------

  async function start() {
    if (busy) {
      Panel.status("Arrêt en cours, réessaie dans un instant.", "warn");
      return;
    }
    C.flags.stop = false;
    C.flags.paused = false;

    Panel.status("Chargement du profil…");
    const loaded = await Filler.loadConfig();
    if (loaded.error) {
      Panel.status(loaded.error, "error");
      return;
    }
    config = loaded.config;
    if (!config.profile.hasCv) {
      Panel.status("Renseigne d'abord ton CV dans ton profil.", "error");
      return;
    }
    if (config.usage.remaining <= 0) {
      Panel.status("Plafond des 24 h atteint : réessaie plus tard ou relève-le dans les réglages.", "warn");
      return;
    }

    const kind = A.pageKind();
    const next = {
      site: A.id,
      tabId: myTabId,
      mode: config.preferences.mode,
      status: "running",
      phase: "idle",
      queue: [],
      index: 0,
      current: null,
      done: [],
      attempts: 0,
      failStreak: 0,
      stats: { submitted: 0, skipped: 0, external: 0, failed: 0 },
      startedAt: Date.now(),
    };

    if (A.flow === "pages") {
      if (kind === "list") {
        next.queue = A.collectJobs().slice(0, MAX_ATTEMPTS);
      } else if (kind === "job") {
        const info = A.readJob();
        if (info) next.queue = [{ key: info.key, url: info.url, title: info.title, company: info.company }];
      }
      if (next.queue.length === 0) {
        Panel.status("Aucune offre postulable ici. Ouvre une liste de résultats ou une offre.", "warn");
        return;
      }
    } else if (kind === null) {
      Panel.status("Ouvre une recherche d'offres, puis clique sur Démarrer.", "warn");
      return;
    }

    run = next;
    saveRun();
    Panel.setState("running");
    refreshPanel();
    log(`Démarrage en mode ${run.mode === "auto" ? "automatique" : "semi-automatique"}`);
    loop();
  }

  function stop() {
    C.flags.stop = true;
    C.flags.paused = false;
    if (run) {
      run.status = "stopped";
      saveRun();
    }
    clearFlags();
    Panel.setState("idle");
    Panel.status("Arrêté.");
    log("Arrêté par l'utilisateur");
  }

  Panel.on("start", start);
  Panel.on("stop", stop);
  Panel.on("pause", () => {
    C.flags.paused = true;
    Panel.setState("paused");
    Panel.status("En pause.");
  });
  Panel.on("resume", () => {
    C.flags.paused = false;
    Panel.setState("running");
    Panel.status("Reprise…");
  });
  Panel.on("continue", () => pendingUser && pendingUser("continue"));
  Panel.on("skip", () => pendingUser && pendingUser("skip"));
  Panel.on("language", (value) => C.setLangPref(value)); // lue au début de chaque offre

  // Le popup partage la même préférence : le panneau la suit.
  try {
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area === "local" && changes[C.LANG_KEY]) Panel.setLanguage(changes[C.LANG_KEY].newValue || "auto");
    });
  } catch {
    // contexte d'extension invalidé
  }

  // ---- Panneau et reprise -------------------------------------------------

  function idleMessage() {
    const kind = A.pageKind();
    if (A.flow === "pages" && kind === "list") {
      const n = A.collectJobs().length;
      return n > 0
        ? `${n} offre(s) postulable(s) sur cette page. Clique sur Démarrer.`
        : "Aucune offre postulable sur cette page (les autres se postulent sur le site de l'entreprise).";
    }
    if (kind === "job") return "Offre détectée. Clique sur Démarrer pour postuler à cette offre.";
    if (kind === "list") return "Liste d'offres détectée. Clique sur Démarrer.";
    return "Ouvre une recherche d'offres pour commencer.";
  }

  function mountPanel() {
    Panel.mount();
    C.getLangPref().then((value) => Panel.setLanguage(value));
    const running = Boolean(run && run.status === "running" && isMine());
    Panel.setState(running ? "running" : "idle");
    if (run && isMine()) refreshPanel();
    if (!running) Panel.status(idleMessage());

    if (!config) {
      Filler.loadConfig().then((res) => {
        if (res.config) {
          config = res.config;
          if (!run || !isMine() || run.status !== "running") {
            Panel.setMode(config.preferences.mode);
            Panel.counters(`24 h : ${config.usage.used24h}/${config.preferences.daily_limit}`);
          }
        } else if (!busy) {
          Panel.status(res.error, "warn");
        }
      });
    }
  }

  // Les sites sont des SPA : l'URL change sans rechargement. On synchronise
  // donc la présence du panneau avec la page affichée.
  function syncPanel() {
    const active = run && run.status === "running" && isMine();
    const show = active || A.relevant();
    if (show && !Panel.mounted()) mountPanel();
    else if (!show && Panel.mounted() && !busy) Panel.unmount();
  }

  async function boot() {
    const me = await C.send({ type: "whoami" });
    myTabId = me && me.tabId != null ? me.tabId : null;
    run = await loadRun();

    if (run && run.status === "running" && isMine()) {
      if (A.flow === "pages") {
        mountPanel();
        Panel.status("Reprise du run…");
        const res = await Filler.loadConfig();
        if (!res.config) {
          endRun("stopped", res.error, "error");
        } else {
          config = res.config;
          refreshPanel();
          loop();
        }
      } else {
        // Page rechargée en plein run inline : l'état de la modale est perdu.
        run.status = "stopped";
        saveRun();
      }
    }

    syncPanel();
    setInterval(syncPanel, 1000);
  }

  boot();
})();
