import { NextResponse } from "next/server";
import { skillAuth } from "@/lib/skill-auth";

// Tableau de bord du pipeline, calculé ici plutôt que par Claude : compteurs par
// statut, activité sur 30 jours, taux de réponse, et ce qui distingue les
// candidatures qui obtiennent une réponse (axe, couverture ATS).

const RESPONDED = new Set(["interview", "rejected", "accepted"]);
const SENT = new Set(["applied", ...RESPONDED]);

type Row = { status: string; axis: string | null; ats_coverage: number | null; applied_at: string | null; follow_up_due: string | null; follow_up_sent_at: string | null; updated_at: string };

const avg = (xs: number[]) => (xs.length ? Math.round(xs.reduce((a, b) => a + b, 0) / xs.length) : null);

export async function GET(request: Request) {
  const auth = skillAuth(request);
  if ("error" in auth) return auth.error;

  const { data, error } = await auth.supabase
    .from("offers")
    .select("status, axis, ats_coverage, applied_at, follow_up_due, follow_up_sent_at, updated_at")
    .eq("user_id", auth.userId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const rows = (data ?? []) as Row[];

  const byStatus: Record<string, number> = {};
  for (const r of rows) byStatus[r.status] = (byStatus[r.status] ?? 0) + 1;

  const since = Date.now() - 30 * 86400_000;
  const sent = rows.filter((r) => SENT.has(r.status));
  const responded = sent.filter((r) => RESPONDED.has(r.status));

  const weekEnd = new Date(Date.now() + 7 * 86400_000).toISOString().slice(0, 10);
  const followUpsThisWeek = rows.filter(
    (r) => r.status === "applied" && !r.follow_up_sent_at && r.follow_up_due && r.follow_up_due <= weekEnd
  ).length;

  const byAxis: Record<string, { envoyees: number; reponses: number }> = {};
  for (const r of sent) {
    const k = r.axis ?? "non renseigné";
    byAxis[k] ??= { envoyees: 0, reponses: 0 };
    byAxis[k].envoyees += 1;
    if (RESPONDED.has(r.status)) byAxis[k].reponses += 1;
  }

  const cov = (xs: Row[]) => avg(xs.map((r) => r.ats_coverage).filter((n): n is number => n !== null));

  return NextResponse.json({
    par_statut: byStatus,
    envoyees_30j: sent.filter((r) => r.applied_at && Date.parse(r.applied_at) >= since).length,
    taux_reponse: sent.length ? Math.round((100 * responded.length) / sent.length) : null,
    relances_cette_semaine: followUpsThisWeek,
    par_axe: byAxis,
    couverture_ats_moyenne: {
      avec_reponse: cov(responded),
      sans_reponse: cov(sent.filter((r) => r.status === "applied")),
    },
  });
}
