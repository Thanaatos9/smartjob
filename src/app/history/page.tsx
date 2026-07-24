import { createClient } from "@/lib/supabase/server";
import { userDisplayName } from "@/lib/user-display";
import { AppShell } from "@/components/app-shell";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import type { SearchHistoryRow } from "@/lib/searches";
import { Search, Layers, CopyX, RotateCw, FolderOpen } from "lucide-react";
import Link from "next/link";

const SEARCH_STATUS: Record<string, { label: string; variant: "success" | "warning" | "destructive" | "muted" }> = {
  done: { label: "Terminée", variant: "success" },
  running: { label: "En cours", variant: "warning" },
  pending: { label: "En attente", variant: "muted" },
  error: { label: "Erreur", variant: "destructive" },
};

function formatDate(iso: string) {
  return new Intl.DateTimeFormat("fr-FR", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso));
}

export default async function HistoryPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  const { data } = await supabase
    .from("searches")
    .select("id, keyword, status, result_count, duplicate_count, created_at")
    .eq("user_id", user!.id)
    .order("created_at", { ascending: false });

  const searches = (data ?? []) as SearchHistoryRow[];

  return (
    <AppShell
      title="Historique des recherches"
      subtitle="Retrouve, filtre et relance toutes tes recherches passées."
      userName={userDisplayName(user)}
    >
      {searches.length === 0 ? (
        <Card className="p-10 text-center">
          <p className="text-sm text-muted-foreground">
            Aucune recherche pour le moment.{" "}
            <Link href="/search" className="font-medium text-primary hover:underline">
              Lance ta première recherche
            </Link>
            .
          </p>
        </Card>
      ) : (
        <ul className="flex flex-col gap-3">
          {searches.map((s) => {
            const status = SEARCH_STATUS[s.status] ?? SEARCH_STATUS.pending;
            return (
              <li key={s.id}>
                <Card className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <Search className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                      <h2 className="truncate font-semibold">{s.keyword}</h2>
                      <Badge variant={status.variant}>{status.label}</Badge>
                    </div>
                    <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                      <span>{formatDate(s.created_at)}</span>
                      <span className="flex items-center gap-1">
                        <Layers className="size-3.5" aria-hidden />
                        {s.result_count} résultat{s.result_count > 1 ? "s" : ""}
                      </span>
                      {s.duplicate_count > 0 && (
                        <span className="flex items-center gap-1">
                          <CopyX className="size-3.5" aria-hidden />
                          {s.duplicate_count} doublon{s.duplicate_count > 1 ? "s" : ""}
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="flex shrink-0 gap-2">
                    {s.result_count > 0 && (
                      <Link
                        href={`/dashboard?search=${s.id}`}
                        className={buttonVariants({ variant: "outline", size: "sm" })}
                      >
                        <FolderOpen aria-hidden />
                        Voir les offres
                      </Link>
                    )}
                    <Link
                      href={`/search?q=${encodeURIComponent(s.keyword)}`}
                      className={buttonVariants({ variant: "default", size: "sm" })}
                    >
                      <RotateCw aria-hidden />
                      Relancer
                    </Link>
                  </div>
                </Card>
              </li>
            );
          })}
        </ul>
      )}
    </AppShell>
  );
}
