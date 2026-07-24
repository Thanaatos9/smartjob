// Traduit la note de correspondance CV/offre (0-10) en badge coloré :
// 0-4 rouge, 5-7 orange, 8-10 vert.

export function matchScoreBadge(
  score: number | null | undefined
): { label: string; variant: "success" | "warning" | "destructive" | "muted" } {
  if (score === null || score === undefined) {
    return { label: "Non noté", variant: "muted" };
  }
  if (score <= 4) return { label: `${score}/10`, variant: "destructive" };
  if (score <= 7) return { label: `${score}/10`, variant: "warning" };
  return { label: `${score}/10`, variant: "success" };
}
