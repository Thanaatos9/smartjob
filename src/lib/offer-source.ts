// Dérive la "source" d'une offre (site d'origine) à partir de son URL / domaine.
// Pas de colonne dédiée en base : on reconnaît le site par son hostname.

export type OfferSource = {
  label: string;
  /** Classes Tailwind à passer au Badge (override bg/text/border). */
  className: string;
};

const RULES: { label: string; className: string; match: RegExp }[] = [
  {
    label: "WTTJ",
    className: "border-transparent bg-amber-400/15 text-amber-700 dark:text-amber-300",
    match: /welcometothejungle|wttj/i,
  },
  {
    label: "France Travail",
    className: "border-transparent bg-blue-500/15 text-blue-700 dark:text-blue-300",
    match: /france-?travail|francetravail|pole-?emploi/i,
  },
  {
    label: "VIE/VIA",
    className: "border-transparent bg-violet-500/15 text-violet-700 dark:text-violet-300",
    match: /mon-vie-via|vie-via|civiweb|business-?france|businessfrance/i,
  },
  {
    label: "Indeed",
    className: "border-transparent bg-zinc-500/15 text-zinc-600 dark:text-zinc-300",
    match: /indeed/i,
  },
  {
    label: "LinkedIn",
    className: "border-transparent bg-sky-600/15 text-sky-700 dark:text-sky-300",
    match: /linkedin/i,
  },
];

export function offerSource(input: {
  url?: string | null;
  domain?: string | null;
}): OfferSource | null {
  // Offre importée depuis un PDF : pas d'URL d'origine, le workflow n8n pose
  // le marqueur "pdf" dans domain.
  if ((input.domain ?? "").trim().toLowerCase() === "pdf") {
    return {
      label: "PDF",
      className: "border-transparent bg-rose-500/15 text-rose-700 dark:text-rose-300",
    };
  }

  const haystack = `${input.domain ?? ""} ${input.url ?? ""}`;
  if (!haystack.trim()) return null;

  for (const rule of RULES) {
    if (rule.match.test(haystack)) {
      return { label: rule.label, className: rule.className };
    }
  }
  return null;
}
