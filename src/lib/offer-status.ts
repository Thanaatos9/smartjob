import type { badgeVariants } from "@/components/ui/badge";
import type { VariantProps } from "class-variance-authority";

type BadgeVariant = VariantProps<typeof badgeVariants>["variant"];

export const STATUS_LABELS: Record<string, string> = {
  found: "Trouvée",
  letter_generated: "Lettre générée",
  applied: "Postulé",
  interview: "Entretien",
  rejected: "Refusé",
  accepted: "Accepté",
};

export const STATUS_VARIANTS: Record<string, BadgeVariant> = {
  found: "muted",
  letter_generated: "secondary",
  applied: "default",
  interview: "warning",
  rejected: "destructive",
  accepted: "success",
};

// Statuts considérés comme une candidature active (offre où l'on a postulé).
export const CANDIDATE_STATUSES = ["applied", "interview", "rejected", "accepted"] as const;

export function isCandidateStatus(status: string) {
  return (CANDIDATE_STATUSES as readonly string[]).includes(status);
}

export function statusLabel(status: string) {
  return STATUS_LABELS[status] ?? status;
}

export function statusVariant(status: string): BadgeVariant {
  return STATUS_VARIANTS[status] ?? "muted";
}
