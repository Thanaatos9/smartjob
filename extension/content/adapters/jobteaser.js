// Adaptateur JobTeaser.
//
// Vérifié sur les pages publiques : liste (data-testid="jobad-card", avec
// "jobad-card-internal" = « Candidature simplifiée »), page d'offre (JSON-LD
// JobPosting, boutons "…apply_internal_candidacy" / "…apply_external_candidacy").
// Le formulaire de candidature est derrière la connexion (compte JobTeaser /
// école) et n'a pas pu être inspecté : moteur générique.
(() => {
  const C = globalThis.CAND;

  const UUID = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";
  const JOB_PATH = new RegExp(`/job-offers/(${UUID})`);

  const keyFromPath = (path) => {
    const m = JOB_PATH.exec(path);
    return m ? m[1] : null;
  };

  const APPLIED_RE = /candidature envoyee|deja postule|vous avez postule|already applied/;

  C.adapter = C.makePagesAdapter({
    id: "jobteaser",
    label: "JobTeaser",

    relevant() {
      return this.pageKind() !== null;
    },

    pageKind() {
      const path = location.pathname;
      if (JOB_PATH.test(path)) return /\/(apply|application)(\/|$)/.test(path) ? "apply" : "job";
      if (document.querySelector('[data-testid="jobad-card"]')) return "list";
      return null;
    },

    keyFromLocation: () => keyFromPath(location.pathname),

    // Seules les offres « Candidature simplifiée » se postulent depuis
    // JobTeaser ; les autres renvoient vers le site de l'entreprise.
    collectJobs() {
      const jobs = [];
      const seen = new Set();
      for (const card of document.querySelectorAll('[data-testid="jobad-card"]')) {
        if (!card.querySelector('[data-testid="jobad-card-internal"]')) continue;
        const link = card.querySelector('a[href*="/job-offers/"]');
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
          title: C.text(link, 200).split("\n")[0],
          company: C.text(card.querySelector('[data-testid="jobad-card-company-name"]'), 200),
        });
      }
      return jobs;
    },

    readJob() {
      const key = keyFromPath(location.pathname);
      if (!key) return null;
      const posting = C.readJobPosting();
      const title =
        (posting && posting.title) ||
        C.text(document.querySelector('[data-testid="jobad-DetailView__Heading__title"], h1'), 300);
      const company =
        (posting && posting.company) ||
        C.text(document.querySelector('[data-testid="jobad-DetailView__Heading__company_name"]'), 200);
      const description =
        (posting && posting.description) ||
        C.text(document.querySelector('[data-testid="jobad-DetailView__Description"]'), 12000);
      return {
        key,
        url: `${location.origin}${location.pathname.replace(/\/(apply|application)\/?$/, "")}`,
        title,
        company,
        location: (posting && posting.location) || "",
        text: [title, company, description].filter(Boolean).join("\n").slice(0, 12000),
        hasDescription: description.length > 80,
      };
    },

    applyButton() {
      const find = (suffix) =>
        [...document.querySelectorAll(`[data-testid$="${suffix}"]`)].find(C.isVisible) || null;
      const internal = find("apply_internal_candidacy");
      if (internal) return { el: internal, kind: "internal" };
      const external = find("apply_external_candidacy");
      if (external) return { el: external, kind: "external" };
      const top = C.norm(C.text(document.querySelector("main") || document.body, 2500));
      return { el: null, kind: APPLIED_RE.test(top) ? "applied" : "none" };
    },
  });
})();
