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

  const root = Fields.genericRoot();
  if (!root) {
    Panel.status("Aucun formulaire détecté sur cette page.", "warn");
    return;
  }

  // Langue du CV et de la lettre : choix du popup, sinon celle de la page.
  const langPref = await C.getLangPref();
  const language = langPref === "auto" ? C.detectLanguage(document.body.innerText) : langPref;

  try {
    const result = await Filler.fillRoot(root, {
      profile,
      prefs: preferences,
      context: document.title,
      language,
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
        `${result.filled} champ(s) rempli(s) (${language === "en" ? "CV anglais" : "CV français"}). Vérifie puis envoie toi-même.`,
        "ok"
      );
    }
  } catch (err) {
    Panel.status(`Erreur : ${err && err.message ? err.message : err}`, "error");
  }
})();
