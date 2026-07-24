import { createClient } from "@/lib/supabase/server";
import { userDisplayName } from "@/lib/user-display";
import { AppShell } from "@/components/app-shell";
import { StatCard } from "@/components/stat-card";
import { OffersExplorer, type ExplorerOffer } from "@/components/offers-explorer";
import { Card } from "@/components/ui/card";
import { Briefcase, Send, CalendarCheck, Trophy } from "lucide-react";
import { AddOfferForm } from "./add-offer-form";

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ search?: string }>;
}) {
  const { search: selectedSearch } = await searchParams;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  const { data: offers } = await supabase
    .from("offers")
    .select("*")
    .eq("user_id", user!.id)
    .order("created_at", { ascending: false });

  const { data: searchRows } = await supabase
    .from("searches")
    .select("id, keyword")
    .eq("user_id", user!.id)
    .order("created_at", { ascending: false })
    .limit(50);

  const allOffers = (offers ?? []) as ExplorerOffer[];

  const count = (s: string) => allOffers.filter((o) => o.status === s).length;
  const stats = [
    { label: "Offres suivies", value: allOffers.length, icon: Briefcase, accent: "primary" as const },
    { label: "Postulé", value: count("applied"), icon: Send, accent: "muted" as const },
    { label: "Entretiens", value: count("interview"), icon: CalendarCheck, accent: "warning" as const },
    { label: "Acceptées", value: count("accepted"), icon: Trophy, accent: "success" as const },
  ];

  // Recherches ayant au moins une offre rattachée (pour le filtre).
  const usedSearchIds = new Set(allOffers.map((o) => o.search_id).filter(Boolean));
  const searchOptions = (searchRows ?? []).filter((s) => usedSearchIds.has(s.id));

  return (
    <AppShell title="Mes offres" subtitle="Suis tes candidatures et génère tes lettres." userName={userDisplayName(user)}>
      <section className="mb-8 grid grid-cols-2 gap-4 lg:grid-cols-4">
        {stats.map((s) => (
          <StatCard key={s.label} {...s} />
        ))}
      </section>

      <Card className="mb-8 p-5">
        <h2 className="mb-4 text-sm font-semibold">Ajouter une offre</h2>
        <AddOfferForm />
      </Card>

      <OffersExplorer
        offers={allOffers}
        searches={searchOptions}
        initialSearchId={selectedSearch ?? ""}
      />
    </AppShell>
  );
}
