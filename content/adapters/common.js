// Briques communes aux adaptateurs de sites : boutons d'action, lecture JSON-LD,
// détection de vérification humaine et adaptateur « pages » générique.
(() => {
  const C = globalThis.CAND;

  // ---- Boutons ------------------------------------------------------------

  C.buttons = (root) =>
    [...root.querySelectorAll('button, [role="button"], input[type="submit"], a[role="button"]')].filter(
      (b) => C.isVisible(b) && !b.disabled && b.getAttribute("aria-disabled") !== "true"
    );

  const btnText = (b) => C.norm(`${b.innerText || b.value || ""} ${b.getAttribute("aria-label") || ""}`);

  const SUBMIT_RE =
    /^(envoyer|soumettre|submit|send|postuler|apply|valider|confirmer|terminer|finish)\b|(envoyer|soumettre|valider|submit|send) (ma|la|votre|my|your|the)? ?(candidature|application)|postuler maintenant|apply now/;
  const NEXT_RE = /^(suivant|continuer|next|continue|poursuivre)\b|etape suivante|next step|passer a l'etape/;
  const REVIEW_RE = /verifier (ma|votre|la)? ?(candidature|demande)|review (my|your)? ?application|recapitulatif/;
  const AVOID_RE = /\b(retour|precedent|back|previous|annuler|cancel|fermer|close|ignorer|dismiss|enregistrer|save|supprimer|delete)\b/;

  // Repère les boutons Suivant / Vérifier / Envoyer d'un formulaire, d'après
  // leur texte (FR/EN). Utilisé quand un site n'expose pas d'attributs fiables.
  C.classifyActions = (root) => {
    const out = { submit: null, review: null, next: null };
    for (const b of C.buttons(root)) {
      const t = btnText(b);
      if (!t || AVOID_RE.test(t)) continue;
      if (!out.submit && SUBMIT_RE.test(t)) out.submit = b;
      else if (!out.review && REVIEW_RE.test(t)) out.review = b;
      else if (!out.next && NEXT_RE.test(t)) out.next = b;
    }
    if (!out.submit && !out.next && !out.review) {
      const generic = root.querySelector('button[type="submit"], input[type="submit"]');
      if (generic && C.isVisible(generic) && !generic.disabled) out.submit = generic;
    }
    return out;
  };

  C.SUCCESS_RE =
    /candidature (a bien ete |a ete )?envoyee|votre candidature (a bien ete |a ete )?(envoyee|transmise)|merci pour votre candidature|application (was |has been )?(sent|submitted)|thank you for applying|thanks for applying/;

  C.successText = () => {
    const nodes = [
      ...document.querySelectorAll('[role="dialog"], [role="alert"], [role="status"], [aria-live], main, [class*="toast"]'),
    ];
    return nodes.some((n) => C.isVisible(n) && C.SUCCESS_RE.test(C.norm((n.innerText || "").slice(0, 3000))));
  };

  // ---- JSON-LD ------------------------------------------------------------

  C.jsonLdJob = () => {
    for (const script of document.querySelectorAll('script[type="application/ld+json"]')) {
      let data;
      try {
        data = JSON.parse(script.textContent);
      } catch {
        continue;
      }
      const nodes = Array.isArray(data) ? data : data && data["@graph"] ? data["@graph"] : [data];
      const job = nodes.find(
        (n) => n && (n["@type"] === "JobPosting" || (Array.isArray(n["@type"]) && n["@type"].includes("JobPosting")))
      );
      if (job) return job;
    }
    return null;
  };

  C.htmlToText = (html) => {
    const withBreaks = String(html || "").replace(/<(br|\/p|\/li|\/h\d|\/div)[^>]*>/gi, "\n");
    const doc = new DOMParser().parseFromString(withBreaks, "text/html");
    return (doc.body.textContent || "")
      .replace(/[ \t]+/g, " ")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
  };

  // Offre lue depuis le JSON-LD de la page (fiable : c'est destiné aux moteurs
  // de recherche, donc stable d'un redesign à l'autre).
  C.readJobPosting = () => {
    const job = C.jsonLdJob();
    if (!job) return null;

    const place = Array.isArray(job.jobLocation) ? job.jobLocation[0] : job.jobLocation;
    const address = (place && place.address) || {};
    const location = [address.addressLocality, address.addressRegion, address.addressCountry]
      .filter((v) => typeof v === "string" && v)
      .join(", ");

    const company =
      typeof job.hiringOrganization === "string" ? job.hiringOrganization : (job.hiringOrganization || {}).name;

    return {
      title: String(job.title || "").trim(),
      company: String(company || "").trim(),
      location,
      description: C.htmlToText(job.description),
    };
  };

  // ---- Vérification humaine ----------------------------------------------

  const HUMAN_RE =
    /verification de securite|security verification|verify you are (a )?human|verifiez que vous etes un humain|are you a robot|confirm you'?re not a robot|quick security check/;

  // true si le site demande de prouver qu'on est humain (captcha, checkpoint) :
  // on ne tente JAMAIS de le contourner, on laisse l'utilisateur le résoudre.
  C.humanCheck = () => {
    if (location.hostname.includes("linkedin") && /\/(checkpoint|authwall)\b/.test(location.pathname)) {
      return true;
    }
    if (
      [...document.querySelectorAll('iframe[src*="captcha" i], iframe[src*="recaptcha" i], iframe[src*="hcaptcha" i], iframe[title*="captcha" i]')].some(
        C.isVisible
      )
    ) {
      return true;
    }
    return HUMAN_RE.test(C.norm((document.body.innerText || "").slice(0, 1500)));
  };

  // ---- Adaptateur « pages » (WTTJ, JobTeaser) -----------------------------
  //
  // Sur ces sites une candidature se fait en naviguant : liste → page de
  // l'offre → formulaire. Le runner persiste donc la file d'offres et reprend
  // après chaque chargement de page.

  C.makePagesAdapter = (spec) => ({
    flow: "pages",
    listCards: null,
    ...spec,

    // Formulaire de candidature : modale sur la page de l'offre, ou formulaire
    // complet sur une page de candidature dédiée.
    root() {
      return this.pageKind() === "apply" ? C.Fields.genericRoot() : C.Fields.dialogRoot();
    },

    actions(root) {
      return C.classifyActions(root);
    },

    succeeded() {
      return (
        /\/(confirmation|success|thanks|merci)\b/.test(location.pathname) ||
        C.successText()
      );
    },

    resumeSelected() {
      return false;
    },

    async close() {},
  });
})();
