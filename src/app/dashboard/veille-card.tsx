import { Card } from "@/components/ui/card";
import { Radar } from "lucide-react";

// Récap du dernier passage de la veille (lecture seule, données RLS de l'utilisateur).

export type VeilleRunSummary = {
  status: string;
  started_at: string;
  finished_at: string | null;
  emails_read: number;
  processed: number;
  created: number;
  ready: number;
  rejected: number;
  duplicates: number;
};

export function VeilleCard({ run, waiting }: { run: VeilleRunSummary | null; waiting: number }) {
  if (!run) return null;
  const when = new Date(run.started_at).toLocaleString("fr-FR", {
    timeZone: "Europe/Paris",
    weekday: "long",
    day: "numeric",
    month: "long",
    hour: "2-digit",
    minute: "2-digit",
  });
  const items = [
    { label: "alertes lues", value: run.emails_read },
    { label: "offres traitées", value: run.processed },
    { label: "CV et lettre prêts", value: run.ready },
    { label: "écartées", value: run.rejected },
    { label: "doublons", value: run.duplicates },
  ];

  return (
    <Card className="mb-8 p-5">
      <div className="mb-3 flex items-center gap-2">
        <Radar className="size-4 text-muted-foreground" />
        <h2 className="text-sm font-semibold">Veille du {when}</h2>
        <span className="ml-auto text-xs text-muted-foreground">
          {run.status === "running" ? "en cours" : run.status === "error" ? "terminée avec erreurs" : "terminée"}
          {waiting > 0 ? ` · ${waiting} en attente pour le prochain passage` : ""}
        </span>
      </div>
      <div className="flex flex-wrap gap-x-6 gap-y-2 text-sm">
        {items.map((i) => (
          <span key={i.label}>
            <strong className="tabular-nums">{i.value}</strong>{" "}
            <span className="text-muted-foreground">{i.label}</span>
          </span>
        ))}
      </div>
    </Card>
  );
}
