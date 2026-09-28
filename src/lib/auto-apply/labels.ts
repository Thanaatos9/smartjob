export const SITE_LABELS: Record<string, string> = {
  linkedin: "LinkedIn",
  wttj: "Welcome to the Jungle",
  jobteaser: "JobTeaser",
};

export const APPLICATION_STATUS_LABELS: Record<string, string> = {
  submitted: "Envoyée",
  skipped: "Ignorée",
  failed: "Échec",
  external: "Site externe",
};

// Raisons décidées par le serveur (voir /api/extension/apply/prepare). Les
// autres raisons sont du texte libre écrit par l'extension : on l'affiche tel quel.
export const REASON_LABELS: Record<string, string> = {
  already_applied: "Déjà postulé",
  blacklisted: "Entreprise blacklistée",
  daily_limit: "Plafond des 24 h atteint",
  low_score: "Score trop bas",
  score_unavailable: "Score indisponible",
};

export function reasonLabel(reason: string | null) {
  if (!reason) return null;
  return REASON_LABELS[reason] ?? reason;
}
