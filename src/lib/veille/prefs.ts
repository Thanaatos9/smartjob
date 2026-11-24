import type { SupabaseClient } from "@supabase/supabase-js";

// Réglages de la veille, rangés dans profiles.veille_prefs.

export type VeillePrefs = {
  /** Postes ciblés : servent à régler les alertes des plateformes (et au skill). */
  roles: string[];
  /** Contrats acceptés. Une offre au contrat inconnu est gardée. */
  contracts: string[];
  /** Mots qui écartent une offre dès son intitulé (avant toute extraction). */
  exclude_keywords: string[];
  /** Pré-score minimal (sur 10) pour générer CV et lettre. */
  min_score: number;
  /** Nombre maximal d'offres traitées par passage (le reste attend le suivant). */
  max_per_run: number;
};

export const DEFAULT_VEILLE_PREFS: VeillePrefs = {
  roles: [
    "Account Manager",
    "Customer Success Manager",
    "Technical Account Manager",
    "Deployment Manager",
    "Implementation Manager",
    "Forward Deployed Engineer",
    "Consultant IA",
    "Data Analyst",
    "Business Analyst",
    "Sales Automation",
  ],
  contracts: ["CDI", "CDD", "VIE"],
  exclude_keywords: [
    "stage",
    "stagiaire",
    "alternance",
    "alternant",
    "apprenti",
    "apprentissage",
    "internship",
    "intern",
    "freelance",
    "intérim",
    "interim",
  ],
  min_score: 7,
  max_per_run: 30,
};

const strList = (v: unknown, fallback: string[]) =>
  Array.isArray(v) ? v.filter((x): x is string => typeof x === "string" && x.trim() !== "").map((x) => x.trim()) : fallback;

const int = (v: unknown, fallback: number, min: number, max: number) => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.min(Math.max(Math.round(n), min), max) : fallback;
};

export function normalizeVeillePrefs(raw: unknown): VeillePrefs {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const d = DEFAULT_VEILLE_PREFS;
  return {
    roles: strList(r.roles, d.roles),
    contracts: strList(r.contracts, d.contracts).map((c) => c.toUpperCase()),
    exclude_keywords: strList(r.exclude_keywords, d.exclude_keywords),
    min_score: int(r.min_score, d.min_score, 0, 10),
    max_per_run: int(r.max_per_run, d.max_per_run, 1, 100),
  };
}

export async function loadVeillePrefs(supabase: SupabaseClient, userId: string) {
  const { data } = await supabase.from("profiles").select("veille_prefs").eq("user_id", userId).maybeSingle();
  return normalizeVeillePrefs(data?.veille_prefs);
}

/** Vrai si le texte contient un mot exclu (mot entier, insensible à la casse et aux accents). */
export function hasExcludedWord(text: string | null | undefined, words: string[]) {
  if (!text) return null;
  const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  const hay = ` ${norm(text).replace(/[^a-z0-9]+/g, " ")} `;
  return words.find((w) => hay.includes(` ${norm(w).replace(/[^a-z0-9]+/g, " ").trim()} `)) ?? null;
}

const CONTRACT_PATTERNS: [string, RegExp][] = [
  ["CDI", /\bcdi\b|permanent|full[- ]?time|temps plein|indetermin/i],
  ["CDD", /\bcdd\b|fixed[- ]term|temporary contract|determin/i],
  ["VIE", /\bv\.?i\.?e\b|volontariat international/i],
  ["STAGE", /\bstage\b|stagiaire|\binternship\b|\bintern\b/i],
  ["ALTERNANCE", /alternance|apprenti|work[- ]study/i],
  ["FREELANCE", /freelance|ind[ée]pendant|contractor|portage/i],
  ["INTERIM", /int[ée]rim/i],
];

/** Contrat normalisé (CDI, CDD, VIE, STAGE…) ou null s'il est inconnu. */
export function normalizeContract(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const text = raw.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  // Les contrats exclus d'abord : « CDD alternance » est une alternance.
  for (const name of ["STAGE", "ALTERNANCE", "FREELANCE", "INTERIM", "VIE", "CDI", "CDD"]) {
    const rx = CONTRACT_PATTERNS.find(([n]) => n === name)![1];
    if (rx.test(text)) return name;
  }
  return null;
}
