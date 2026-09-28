import { createClient } from "@/lib/supabase/server";
import { userDisplayName } from "@/lib/user-display";
import { AppShell } from "@/components/app-shell";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { StatCard } from "@/components/stat-card";
import { Badge } from "@/components/ui/badge";
import { countSubmittedLast24h, loadPreferences } from "@/lib/auto-apply/preferences";
import {
  APPLICATION_STATUS_LABELS,
  SITE_LABELS,
  reasonLabel,
} from "@/lib/auto-apply/labels";
import { Send, Timer, Ban, TriangleAlert } from "lucide-react";
import { PreferencesForm } from "./preferences-form";
import { AnswerBank, type BankRow } from "./answer-bank";

const STATUS_VARIANTS: Record<string, "success" | "muted" | "destructive" | "warning"> = {
  submitted: "success",
  skipped: "muted",
  failed: "destructive",
  external: "warning",
};

type ActivityRow = {
  id: string;
  site: string;
  status: string;
  reason: string | null;
  updated_at: string;
  offers: { title: string | null; company: string | null; url: string | null } | null;
};

export default async function AutoApplyPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  const [preferences, used, bank, activity] = await Promise.all([
    loadPreferences(supabase, user!.id),
    countSubmittedLast24h(supabase, user!.id),
    supabase
      .from("answer_bank")
      .select("id, question, type, options, answer, source")
      .eq("user_id", user!.id)
      .order("updated_at", { ascending: false })
      .limit(100),
    supabase
      .from("auto_applications")
      .select("id, site, status, reason, updated_at, offers(title, company, url)")
      .eq("user_id", user!.id)
      .order("updated_at", { ascending: false })
      .limit(30),
  ]);

  // Table absente : la migration 0009 n'a pas encore été appliquée.
  const migrationMissing =
    bank.error?.code === "PGRST205" || bank.error?.code === "42P01";

  const rows = (activity.data ?? []) as unknown as ActivityRow[];
  const count = (s: string) => rows.filter((r) => r.status === s).length;

  return (
    <AppShell
      title="Auto-candidature"
      subtitle="Réglages de l'extension Chrome pour LinkedIn, Welcome to the Jungle et JobTeaser."
      userName={userDisplayName(user)}
    >
      {migrationMissing && (
        <Card className="mb-6 flex items-start gap-3 border-warning/40 bg-warning/10 p-4">
          <TriangleAlert className="mt-0.5 size-5 shrink-0 text-warning" aria-hidden />
          <p className="text-sm">
            La migration <code>supabase/migrations/0009_auto_apply.sql</code> n&apos;est pas
            encore appliquée : les réglages ne pourront pas être enregistrés.
          </p>
        </Card>
      )}

      <section className="mb-8 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="Envoyées (24 h)" value={used} icon={Send} accent="primary" />
        <StatCard
          label="Restantes (24 h)"
          value={Math.max(0, preferences.daily_limit - used)}
          icon={Timer}
          accent="success"
        />
        <StatCard label="Ignorées (30 dernières)" value={count("skipped")} icon={Ban} accent="muted" />
        <StatCard
          label="Échecs (30 dernières)"
          value={count("failed")}
          icon={TriangleAlert}
          accent="warning"
        />
      </section>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <Card className="p-6">
          <PreferencesForm preferences={preferences} />
        </Card>

        <div className="flex flex-col gap-6">
          <Card>
            <CardHeader>
              <CardTitle>Activité récente</CardTitle>
              <CardDescription>
                Les 30 dernières offres traitées par l&apos;extension.
              </CardDescription>
            </CardHeader>
            <div className="px-6 pb-6">
              {rows.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  Rien pour l&apos;instant. Ouvre une recherche d&apos;offres sur un des trois
                  sites : le panneau de l&apos;extension apparaît en bas à droite.
                </p>
              ) : (
                <ul className="divide-y divide-border">
                  {rows.map((row) => (
                    <li key={row.id} className="flex items-start justify-between gap-3 py-3">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">
                          {row.offers?.title ?? "Offre sans titre"}
                        </p>
                        <p className="truncate text-xs text-muted-foreground">
                          {[row.offers?.company, SITE_LABELS[row.site] ?? row.site]
                            .filter(Boolean)
                            .join(" · ")}
                          {reasonLabel(row.reason) ? ` — ${reasonLabel(row.reason)}` : ""}
                        </p>
                      </div>
                      <Badge variant={STATUS_VARIANTS[row.status] ?? "muted"}>
                        {APPLICATION_STATUS_LABELS[row.status] ?? row.status}
                      </Badge>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Banque de réponses</CardTitle>
              <CardDescription>
                Réponses réutilisées automatiquement quand la même question revient.
              </CardDescription>
            </CardHeader>
            <div className="px-6 pb-6">
              <AnswerBank rows={(bank.data ?? []) as BankRow[]} />
            </div>
          </Card>
        </div>
      </div>
    </AppShell>
  );
}
