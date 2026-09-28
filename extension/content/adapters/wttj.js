// Adaptateur Welcome to the Jungle.
//
// Vérifié sur les pages publiques : liste d'offres (data-testid="job-thumb-…"),
// page d'offre (JSON-LD JobPosting, bouton data-testid="job_header-button-apply").
// Le formulaire de candidature lui-même est derrière la connexion et n'a pas pu
// être inspecté : il est traité par le moteur générique (libellés, boutons par texte).
(() => {
  const C = globalThis.CAND;

  const JOB_PATH = /\/companies\/([^/]+)\/jobs\/([^/]+)/;

  // Clé stable d'une offre : entreprise + slug, quel que soit le préfixe de langue.
  const keyFromPath = (path) => {
    const m = JOB_PATH.exec(path);
    return m ? `${m[1]}/${m[2]}` : null;
  };

  const APPLIED_RE = /candidature envoyee|deja postule|already applied/;

  C.adapter = C.makePagesAdapter({
    id: "wttj",
    label: "Welcome to the Jungle",

    relevant() {
      return this.pageKind() !== null;
    },

    pageKind() {
      const path = location.pathname;
      if (JOB_PATH.test(path)) return /\/apply(\/|$)/.test(path) ? "apply" : "job";
      if (document.querySelector('[data-testid^="job-thumb-"]')) return "list";
      return null;
    },

    keyFromLocation: () => keyFromPath(location.pathname),

    collectJobs() {
      const jobs = [];
      const seen = new Set();
      for (const card of document.querySelectorAll('[data-testid^="job-thumb-"]')) {
        // Exclut job-thumb-cover-… et job-thumb-logo-… (sous-éléments).
        if (!/^job-thumb-[0-9a-f]{8}-/.test(card.getAttribute("data-testid"))) continue;
        const link = card.querySelector('a[href*="/companies/"][href*="/jobs/"]');
        if (!link) continue;
        const url = new URL(link.getAttribute("href"), location.origin);
        url.search = "";
        url.hash = "";
        const key = keyFromPath(url.pathname);
        if (!key || seen.has(key)) continue;
        seen.add(key);
        jobs.push({
          key,
          url: url.toString(),
          title: C.text(card.querySelector("h2, h3, h4, [role='heading']") || link, 200).split("\n")[0],
        });
      }
      return jobs;
    },

    readJob() {
      const key = keyFromPath(location.pathname);
      if (!key) return null;
      const posting = C.readJobPosting();
      const title = (posting && posting.title) || C.text(document.querySelector("h1"), 300);
      const description =
        (posting && posting.description) ||
        C.text(document.querySelector('[data-testid="job-section-description"]'), 12000);
      const company = (posting && posting.company) || "";
      return {
        key,
        url: `${location.origin}${location.pathname.replace(/\/apply\/?$/, "")}`,
        title,
        company,
        location: (posting && posting.location) || "",
        text: [title, company, description].filter(Boolean).join("\n").slice(0, 12000),
        hasDescription: description.length > 80,
      };
    },

    applyButton() {
      const el = document.querySelector(
        '[data-testid="job_header-button-apply"], [data-testid="job_bottom-button-apply"]'
      );
      if (!el) {
        const header = C.norm(C.text(document.querySelector('[data-testid="job-top-sticky-bar"]') || document.body, 1500));
        return { el: null, kind: APPLIED_RE.test(header) ? "applied" : "none" };
      }
      const href = el.getAttribute("href") || "";
      if (/\/authenticate\//.test(href)) return { el, kind: "login" }; // pas connecté à WTTJ
      if (/^https?:\/\//i.test(href) && new URL(href).hostname !== location.hostname) {
        return { el, kind: "external" }; // « Postuler sur le site de l'entreprise »
      }
      return { el, kind: "internal" };
    },
  });
})();
