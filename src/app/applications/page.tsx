import { createClient } from "@/lib/supabase/server";
import { userDisplayName } from "@/lib/user-display";
import { AppShell } from "@/components/app-shell";
import { StatCard } from "@/components/stat-card";
import { ApplicationsTable, type ApplicationRow } from "@/components/applications-table";
import { CANDIDATE_STATUSES } from "@/lib/offer-status";
import { Send, CalendarCheck, XCircle, Trophy } from "lucide-react";

export default async function ApplicationsPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  const { data } = await supabase
    .from("offers")
    .select("id, title, company, location, status, notes, updated_at")
    .eq("user_id", user!.id)
    .in("status", CANDIDATE_STATUSES as unknown as string[])
    .order("updated_at", { ascending: false });

  const rows = (data ?? []) as ApplicationRow[];
  const count = (s: string) => rows.filter((r) => r.status === s).length;

  const stats = [
    { label: "Postulé", value: count("applied"), icon: Send, accent: "primary" as const },
    { label: "Entretiens", value: count("interview"), icon: CalendarCheck, accent: "warning" as const },
    { label: "Refusées", value: count("rejected"), icon: XCircle, accent: "muted" as const },
    { label: "Acceptées", value: count("accepted"), icon: Trophy, accent: "success" as const },
  ];

  return (
    <AppShell
      title="Mes candidatures"
      subtitle="Suis le statut de chaque candidature et garde tes notes."
      userName={userDisplayName(user)}
    >
      <section className="mb-8 grid grid-cols-2 gap-4 lg:grid-cols-4">
        {stats.map((s) => (
          <StatCard key={s.label} {...s} />
        ))}
      </section>

      <ApplicationsTable rows={rows} />
    </AppShell>
  );
}
