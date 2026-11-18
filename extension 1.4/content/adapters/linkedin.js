// Adaptateur LinkedIn (candidature simplifiée / Easy Apply).
//
// ⚠ Non vérifié sur un compte connecté : les sélecteurs viennent de la
// structure connue de LinkedIn, et LinkedIn la modifie régulièrement. On
// combine donc des sélecteurs de classe, des attributs d'accessibilité
// (aria-label, FR/EN) et, en dernier recours, le texte des boutons.
(() => {
  const C = globalThis.CAND;

  const firstText = (root, selectors) => {
    for (const sel of selectors) {
      const el = root.querySelector(sel);
      const text = el && C.text(el, 500);
      if (text) return text.split("\n")[0].trim();
    }
    return "";
  };

  const jobIdFromUrl = () => {
    const url = new URL(location.href);
    return url.searchParams.get("currentJobId") || (location.pathname.match(/\/jobs\/view\/(\d+)/) || [])[1] || null;
  };

  const paneRoot = () =>
    document.querySelector(
      ".jobs-search__job-details--container, .jobs-details, [class*='jobs-search__job-details'], .job-view-layout, main"
    ) || document.body;

  const EASY_RE = /easy apply|candidature simplifiee/;
  const APPLIED_RE = /\b(applied|postule|candidature envoyee)\b/;

  C.adapter = {
    id: "linkedin",
    label: "LinkedIn",
    flow: "inline",

    // Le panneau n'apparaît que sur les pages d'offres (LinkedIn est une SPA :
    // on ne peut pas se fier au chargement initial de la page).
    relevant: () => location.pathname.startsWith("/jobs"),

    pageKind() {
      if (!location.pathname.startsWith("/jobs")) return null;
      if (this.listCards().length > 0) return "list";
      if (/\/jobs\/view\//.test(location.pathname)) return "job";
      return null;
    },

    // Cartes d'offres rendues dans la liste. LinkedIn « virtualise » la liste :
    // les cartes hors écran sont des coquilles vides tant qu'on n'a pas défilé.
    listCards() {
      const cards = [];
      const seen = new Set();
      for (const node of document.querySelectorAll("li[data-occludable-job-id], div[data-job-id]")) {
        const key = node.getAttribute("data-occludable-job-id") || node.getAttribute("data-job-id");
        if (!key || seen.has(key)) continue;
        const link = node.querySelector('a[href*="/jobs/view/"]');
        if (!link) continue; // carte pas encore rendue
        seen.add(key);
        cards.push({
          key,
          el: node,
          title: C.text(link, 200).split("\n")[0],
          company: firstText(node, [
            ".artdeco-entity-lockup__subtitle",
            "[class*='job-card-container__primary-description']",
            "[class*='entity-lockup__subtitle']",
          ]),
        });
      }
      return cards;
    },

    async openCard(card) {
      const link = card.el.querySelector('a[href*="/jobs/view/"]') || card.el;
      C.click(link);
      await C.waitFor(
        () =>
          jobIdFromUrl() === card.key ||
          paneRoot().querySelector(`a[href*="/jobs/view/${card.key}"]`),
        { timeout: 8000 }
      );
      await C.pause(900, 1600); // laisse le volet de détail se charger
    },

    // Fait défiler la liste pour rendre de nouvelles cartes, puis passe à la
    // page suivante si besoin. Renvoie false quand il n'y a plus rien.
    async loadMore(knownKeys) {
      const list = document.querySelector(
        ".jobs-search-results-list, [class*='jobs-search-results-list'], .scaffold-layout__list"
      );
      const fresh = () => this.listCards().some((c) => !knownKeys.has(c.key));

      for (let i = 0; i < 4 && !fresh(); i++) {
        if (list) list.scrollBy({ top: list.clientHeight * 0.9, behavior: "smooth" });
        else window.scrollBy({ top: window.innerHeight * 0.9, behavior: "smooth" });
        await C.pause(1200, 2000);
      }
      if (fresh()) return true;

      const next = [...document.querySelectorAll("button, a")].find(
        (b) =>
          C.isVisible(b) &&
          !b.disabled &&
          /page suivante|view next page|next page/.test(C.norm(b.getAttribute("aria-label") || ""))
      );
      if (!next) return false;
      C.click(next);
      await C.pause(2500, 4000);
      return fresh();
    },

    readJob(card) {
      const id = (card && card.key) || jobIdFromUrl();
      if (!id) return null;
      const pane = paneRoot();
      const title =
        firstText(pane, [
          ".job-details-jobs-unified-top-card__job-title",
          "[class*='unified-top-card__job-title']",
          "h1",
          "h2",
        ]) || (card && card.title) || "";
      const company =
        firstText(pane, [
          ".job-details-jobs-unified-top-card__company-name",
          "[class*='unified-top-card__company-name']",
          'a[href*="/company/"]',
        ]) || (card && card.company) || "";
      const location_ = firstText(pane, [
        ".job-details-jobs-unified-top-card__primary-description-container",
        "[class*='unified-top-card__primary-description']",
      ]);
      const description = C.text(
        pane.querySelector("#job-details, .jobs-description__content, .jobs-box__html-content, [class*='jobs-description']"),
        12000
      );
      return {
        key: id,
        url: `https://www.linkedin.com/jobs/view/${id}/`,
        title,
        company,
        location: location_.split("·")[0].trim(),
        text: [title, company, description].filter(Boolean).join("\n"),
        hasDescription: description.length > 80,
      };
    },

    applyButton() {
      const pane = paneRoot();
      const el = [...pane.querySelectorAll("button, a")].find(
        (b) => C.isVisible(b) && /jobs-apply-button/.test(b.className || "")
      );
      if (el) {
        const label = C.norm(`${el.getAttribute("aria-label") || ""} ${el.innerText || ""}`);
        return { el, kind: EASY_RE.test(label) ? "internal" : "external" };
      }
      const top = C.norm(C.text(pane.querySelector("[class*='unified-top-card']") || pane, 1500));
      return { el: null, kind: APPLIED_RE.test(top) ? "applied" : "none" };
    },

    // Modale de candidature simplifiée (et variantes : tout dialogue visible
    // qui contient un formulaire).
    root() {
      const known = document.querySelector(
        ".jobs-easy-apply-modal, [data-test-modal-id='easy-apply-modal'], [class*='jobs-easy-apply'][role='dialog']"
      );
      if (known && C.isVisible(known)) return known;
      return C.Fields.dialogRoot();
    },

    actions(root) {
      const pick = (selector) => [...root.querySelectorAll(selector)].find((b) => C.isVisible(b) && !b.disabled) || null;
      const out = {
        submit: pick(
          "button[aria-label*='Submit application' i], button[aria-label*='Envoyer la candidature' i], button[data-live-test-easy-apply-submit-button]"
        ),
        review: pick(
          "button[aria-label*='Review your application' i], button[aria-label*='rifier votre candidature' i], button[data-live-test-easy-apply-review-button]"
        ),
        next: pick(
          "button[aria-label*='Continue to next step' i], button[aria-label*='tape suivante' i], button[data-easy-apply-next-button], button[data-live-test-easy-apply-next-button]"
        ),
      };
      if (out.submit || out.review || out.next) return out;
      return C.classifyActions(root);
    },

    // LinkedIn sélectionne parfois déjà un CV enregistré : on ne téléverse pas
    // un doublon dans le compte de l'utilisateur.
    resumeSelected(root) {
      const scope = root || this.root() || document;
      return Boolean(
        scope.querySelector(
          ".jobs-document-upload-redesign-card__container--selected, [class*='document-upload'][class*='selected']"
        )
      );
    },

    succeeded() {
      return Boolean(
        document.querySelector("[data-test-modal-id='post-apply-modal'], .jobs-post-apply-modal, [class*='post-apply']")
      ) || C.successText();
    },

    // Ferme la modale, en abandonnant le brouillon plutôt que de le laisser
    // enregistré dans le compte.
    async close() {
      const dismiss = [...document.querySelectorAll("button")].find(
        (b) =>
          C.isVisible(b) &&
          (/^(dismiss|ignorer|fermer)$/i.test((b.getAttribute("aria-label") || "").trim()) ||
            /artdeco-modal__dismiss/.test(b.className || ""))
      );
      if (!dismiss) return;
      C.click(dismiss);
      await C.pause(700, 1200);
      const discard = [...document.querySelectorAll("button")].find(
        (b) => C.isVisible(b) && /discard|abandon|supprimer/.test(C.norm(b.innerText || ""))
      );
      if (discard) {
        C.click(discard);
        await C.pause(500, 900);
      }
    },
  };
})();
