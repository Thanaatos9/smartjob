// Remplit une étape de formulaire :
//  1. les champs d'identité (nom, e-mail, téléphone, ville…) sont remplis
//     localement depuis le profil, sans appel réseau ;
//  2. le reste part en un seul lot vers la plateforme (banque de réponses puis IA) ;
//  3. tout champ obligatoire qui reste sans réponse fiable est renvoyé à l'appelant :
//     on ne devine jamais.
(() => {
  const C = globalThis.CAND;
  const Fields = C.Fields;
  const Filler = (C.Filler = { config: null });

  // ---- Configuration et CV ------------------------------------------------

  Filler.loadConfig = async () => {
    const { status, data } = await C.api("GET", "/api/extension/apply/config");
    if (status !== 200) {
      return { error: (data && data.error) || `Erreur plateforme (${status})` };
    }
    Filler.config = data;
    return { config: data };
  };

  // Un CV par langue, mis en cache pour la durée du run.
  const cvFiles = {}; // langue → File | null (indisponible) ; absent : pas encore chargé
  Filler.getCv = async (language = "fr") => {
    if (language in cvFiles) return cvFiles[language];
    const res = await C.send({ type: "cv", lang: language });
    if (!res || res.error || !res.base64) {
      cvFiles[language] = null;
      return null;
    }
    const bytes = Uint8Array.from(atob(res.base64), (c) => c.charCodeAt(0));
    cvFiles[language] = new File([bytes], res.filename || "CV.pdf", { type: "application/pdf" });
    return cvFiles[language];
  };

  // ---- Identité -----------------------------------------------------------

  const RX = {
    email: /e-?mail|courriel/,
    ccode: /indicatif|country code|code pays|phone country|prefixe|prefix/,
    phone: /telephone|phone|mobile|portable|\btel\b|\bgsm\b/,
    full: /nom (et|&|,) ?prenom|prenom (et|&|,) ?nom|full name|nom complet|your name|votre nom/,
    first: /prenom|first ?name|given name/,
    last: /nom de famille|last ?name|surname|family name/,
    linkedin: /linkedin/,
    github: /github/,
    website: /portfolio|site web|website|site personnel|personal (web ?)?site/,
    city: /\bville\b|\bcity\b|commune/,
    location: /localisation|location|adresse|address|lieu de residence|pays de residence|where do you live/,
    notPerson: /\b(entreprise|societe|company|employeur|employer|ecole|school|universite|university)\b/,
  };

  // Consentements et attestations : jamais cochés sans l'accord explicite de
  // l'utilisateur (réglage « Cocher les cases de consentement à ma place »).
  const CONSENT =
    /consent|j'?accepte|j'?ai lu|i (agree|accept|have read|consent)|conditions (generales|d'utilisation)|politique de confidentialite|privacy|terms|\bcgu\b|\bcgv\b|rgpd|gdpr|donnees personnelles|personal data|certifie|atteste|certify|exactitude|accurate/;

  const labelKey = (f) => C.norm(f.label || f.name || f.domId);

  function digitsOf(phone) {
    let d = String(phone || "").replace(/[^\d+]/g, "");
    if (d.startsWith("00")) d = `+${d.slice(2)}`;
    if (!d.startsWith("+") && /^0\d{9}$/.test(d)) d = `+33${d.slice(1)}`; // numéro français écrit en local
    return d;
  }

  // Option « indicatif pays » correspondant au téléphone du profil.
  function phoneCountryPick(phone, options) {
    const plus = digitsOf(phone);
    if (!plus.startsWith("+")) return null;
    const candidates = options
      .map((label) => ({ label, code: (label.match(/\+\d{1,4}/) || [])[0] }))
      .filter((c) => c.code)
      .sort((a, b) => b.code.length - a.code.length);
    return candidates.find((c) => plus.startsWith(c.code)) || null;
  }

  function identityValue(f, ctx) {
    const { profile, prefs } = ctx;
    const t = labelKey(f);
    const ac = f.autocomplete;
    if (!t && !ac) return null;
    if (RX.notPerson.test(t) && /nom|name/.test(t)) return null;

    if (f.kind === "select") {
      return RX.ccode.test(t) && ctx.ccPick ? ctx.ccPick.label : null;
    }
    if (f.kind !== "text" && f.kind !== "number") return null;

    if (ac === "email" || RX.email.test(t)) return profile.email || null;
    if (RX.ccode.test(t)) return null;
    if (ac.startsWith("tel") || RX.phone.test(t)) {
      if (!profile.phone) return null;
      if (ctx.ccPick) return digitsOf(profile.phone).slice(ctx.ccPick.code.length);
      return profile.phone;
    }
    if (ac === "given-name" || (!RX.full.test(t) && RX.first.test(t))) return profile.firstName || null;
    if (RX.full.test(t) || ac === "name") return profile.fullName || null;
    if (ac === "family-name" || RX.last.test(t) || (t === "nom" && ctx.hasFirst)) {
      return profile.lastName || null;
    }
    if (t === "nom" || t === "name") return profile.fullName || null;
    if (RX.linkedin.test(t)) return prefs.linkedin_url || null;
    if (RX.github.test(t)) return prefs.github_url || null;
    if (RX.website.test(t)) return profile.portfolioUrl || null;
    if (ac === "address-level2" || RX.city.test(t)) {
      return (profile.location || "").split(",")[0].trim() || null;
    }
    if (RX.location.test(t)) return profile.location || null;
    return null;
  }

  // ---- Fichiers -----------------------------------------------------------

  const CV_LABEL = /\bcv\b|resume|curriculum/;
  const NOT_CV = /lettre|cover|motivation|portfolio|photo|certificat|diplome|releve|attestation/;

  async function fillFile(f, ctx) {
    const t = C.norm(`${f.label} ${f.name} ${f.domId}`);
    const isCv = CV_LABEL.test(t) || (!NOT_CV.test(t) && (f.accept.includes("pdf") || t.trim() === ""));
    if (!isCv) return f.required ? "unresolved" : "skipped";
    if (ctx.resumeSelected && ctx.resumeSelected()) return "skipped"; // le site a déjà un CV sélectionné
    const file = await Filler.getCv(ctx.language);
    if (!file) return f.required ? "unresolved" : "skipped";
    return Fields.setFile(f, file) ? "filled" : "unresolved";
  }

  // ---- Remplissage d'une étape -------------------------------------------

  /**
   * ctx : { profile, prefs, offerId, context, language, resumeSelected?() }
   *   language : 'fr' | 'en', langue du CV téléversé et de la lettre rédigée.
   * Renvoie { filled, asked, unresolved: [champ obligatoire resté sans réponse] }.
   */
  Filler.fillRoot = async (root, ctx) => {
    const fields = Fields.scan(root);
    const result = { filled: 0, asked: 0, unresolved: [] };
    const pending = [];

    const ccField = fields.find((f) => f.kind === "select" && RX.ccode.test(labelKey(f)));
    const work = {
      ...ctx,
      hasFirst: fields.some((f) => f.autocomplete === "given-name" || RX.first.test(labelKey(f))),
      ccPick: ccField ? phoneCountryPick(ctx.profile.phone, ccField.options) : null,
    };

    const giveUp = (f) => {
      if (f.required) {
        Fields.flag(f, true);
        result.unresolved.push(f);
      }
    };

    for (const f of fields) {
      await C.tick();
      Fields.flag(f, false);

      if (f.kind === "checkbox") {
        const t = labelKey(f);
        // On ne suit pas l'entreprise à la place de l'utilisateur.
        if (f.checked && /^(follow|suivre)\b/.test(t)) {
          await Fields.apply(f, "no");
          continue;
        }
        if (f.checked || !f.required) continue;
        if (CONSENT.test(t)) {
          if (ctx.prefs.accept_consents && (await Fields.apply(f, "yes"))) result.filled++;
          else giveUp(f);
        } else {
          pending.push(f);
        }
        continue;
      }

      if (!f.empty) continue; // déjà rempli (par le site ou par l'utilisateur)

      if (f.kind === "file") {
        const outcome = await fillFile(f, work);
        if (outcome === "filled") result.filled++;
        else if (outcome === "unresolved") giveUp(f);
        continue;
      }

      const value = identityValue(f, work);
      if (value) {
        if (await Fields.apply(f, value)) {
          result.filled++;
          continue;
        }
      }
      pending.push(f);
    }

    if (pending.length > 0) {
      const questions = pending.map((f, i) => ({
        id: `q${i}`,
        label: f.label || f.name || "(champ sans libellé)",
        type: f.kind,
        options: f.options,
        required: f.required,
      }));
      result.asked = questions.length;

      const { status, data } = await C.api("POST", "/api/extension/apply/answers", {
        offerId: ctx.offerId || undefined,
        context: ctx.context || undefined,
        language: ctx.language,
        questions,
      });

      const answers = status === 200 && data && Array.isArray(data.answers) ? data.answers : [];
      const byId = new Map(answers.map((a) => [a.id, a.answer]));

      for (let i = 0; i < pending.length; i++) {
        await C.tick();
        const f = pending[i];
        const answer = byId.get(`q${i}`);
        if (answer != null && answer !== "" && (await Fields.apply(f, answer))) {
          result.filled++;
        } else {
          giveUp(f);
        }
      }

      if (status !== 200) {
        result.error = (data && data.error) || `Erreur plateforme (${status})`;
      }
    }

    return result;
  };

  // Champs obligatoires encore vides dans `root`. Sert à savoir quand
  // l'utilisateur a fini de compléter les champs surlignés.
  Filler.stillMissing = (root, ctx) => {
    const resumeSelected = Boolean(ctx && ctx.resumeSelected && ctx.resumeSelected());
    return Fields.scan(root).filter(
      (f) => f.required && f.empty && !(f.kind === "file" && resumeSelected)
    );
  };
})();
