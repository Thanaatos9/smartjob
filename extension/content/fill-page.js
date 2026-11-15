// Point d'entrée du bouton « Remplir ce formulaire » du popup : injecté à la
// demande dans l'onglet courant (activeTab), sur n'importe quel site.
// Remplit ce qu'il peut, surligne le reste, et ne clique JAMAIS sur Envoyer.
(async () => {
  const C = globalThis.CAND;
  const { Panel, Filler, Fields } = C;

  Panel.unmount();
  Panel.mount({ title: "Remplir ce formulaire", controls: false });
  Panel.hideLanguage(); // la langue se règle dans le popup
  Panel.status("Lecture du formulaire…");

  const loaded = await Filler.loadConfig();
  if (loaded.error) {
    Panel.status(loaded.error, "error");
    return;
  }
  const { profile, preferences } = loaded.config;
  Panel.setMode(preferences.mode);

  if (!profile.hasCv) {
    Panel.status("Renseigne d'abord ton CV dans ton profil.", "error");
    return;
  }

  if (!Fields.genericRoot()) {
    // Formulaire chargé dans un cadre d'un autre site (ATS) : inaccessible d'ici.
    const frame = [...document.querySelectorAll("iframe")].find(
      (f) => C.isVisible(f) && f.src && !f.src.startsWith(location.origin) && f.offsetHeight > 200
    );
    Panel.status(
      frame
        ? "Le formulaire est dans un cadre d'un autre site : ouvre-le dans son propre onglet (lien ci-dessous), puis relance « Remplir ce formulaire »."
        : "Aucun formulaire détecté. Clique d'abord sur « Postuler » pour ouvrir le formulaire, puis relance.",
      "warn"
    );
    if (frame) Panel.log(frame.src, "warn");
    return;
  }

  // Langue du CV et de la lettre : choix du popup, sinon celle de la page.
  const langPref = await C.getLangPref();
  const pageText = document.body.innerText || "";
  const language = langPref === "auto" ? C.detectLanguage(pageText) : langPref;

  // Offre de la page (enregistrée au besoin) et CV + lettre adaptés.
  Panel.status("Préparation du CV et de la lettre adaptés (jusqu'à 30 s)…");
  const prepared = await C.api("POST", "/api/extension/apply/page-offer", {
    url: location.href,
    title: document.title,
    text: pageText.slice(0, 20000),
    language,
  });
  const offerId = prepared && !prepared.error ? prepared.offerId : null;
  if (!prepared || prepared.error) {
    Panel.log(`CV adapté indisponible (${(prepared && prepared.error) || "pas de réponse"}) : CV du profil utilisé.`, "warn");
  } else if (prepared.tailored) {
    Panel.log(
      `${prepared.created ? "Offre enregistrée dans smartjob. " : ""}CV et lettre adaptés ${prepared.generated ? "créés" : "retrouvés"}` +
        `${prepared.coverage != null ? ` (couverture ATS ${prepared.coverage} %)` : ""}.`,
      "ok"
    );
  } else if (prepared.warning) {
    Panel.log(prepared.warning, "warn");
  }

  // Le formulaire a pu être redessiné pendant la préparation : on le relit.
  Panel.status("Remplissage du formulaire…");
  const root = Fields.genericRoot();
  if (!root) {
    Panel.status("Le formulaire a disparu de la page : rouvre-le puis relance.", "warn");
    return;
  }

  try {
    const result = await Filler.fillRoot(root, {
      profile,
      prefs: preferences,
      offerId: offerId || undefined, // CV, lettre et réponses de cette offre
      context: document.title,
      language,
      pageUrl: location.href,
    });

    if (result.error) {
      Panel.log(result.error, "error");
    }
    if (result.unresolved.length > 0) {
      Panel.status(
        `${result.filled} champ(s) rempli(s). ${result.unresolved.length} à compléter (surlignés en orange).`,
        "warn"
      );
      for (const f of result.unresolved) Panel.log(`À compléter : ${f.label || f.name || "champ sans libellé"}`, "warn");
    } else {
      Panel.status(
        `${result.filled} champ(s) rempli(s)${prepared && prepared.tailored ? " avec le CV adapté" : ` (${language === "en" ? "CV anglais" : "CV français"} du profil)`}. Vérifie puis envoie toi-même.`,
        "ok"
      );
    }
  } catch (err) {
    Panel.status(`Erreur : ${err && err.message ? err.message : err}`, "error");
  }
})();
