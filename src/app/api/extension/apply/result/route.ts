import { NextResponse } from "next/server";
import { supabaseFromRequest } from "@/lib/supabase/from-request";
import { countSubmittedLast24h, loadPreferences } from "@/lib/auto-apply/preferences";
import { findOrCreateOffer, parseJob } from "@/lib/auto-apply/offers";

// Journalise l'issue d'une candidature automatique. Une candidature « envoyée »
// passe l'offre en statut « Postulé » dans le suivi existant.

const SITES = ["linkedin", "wttj", "jobteaser"];
const STATUSES = ["submitted", "skipped", "failed", "external"] as const;
type Status = (typeof STATUSES)[number];

export async function POST(request: Request) {
  const { supabase, user } = await supabaseFromRequest(request);

  if (!user) {
    return NextResponse.json(
      { error: "Non connecté. Connecte-toi depuis l'extension." },
      { status: 401 }
    );
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Requête invalide" }, { status: 400 });
  }

  const site = typeof body.site === "string" ? body.site : "";
  const jobKey = typeof body.jobKey === "string" ? body.jobKey.trim().slice(0, 300) : "";
  const status = body.status as Status;
  let offerId = typeof body.offerId === "string" ? body.offerId : null;
  const reason = typeof body.reason === "string" ? body.reason.slice(0, 300) : null;

  if (!SITES.includes(site) || !jobKey || !STATUSES.includes(status)) {
    return NextResponse.json({ error: "Résultat invalide" }, { status: 400 });
  }

  // Offre qu'on ne peut pas postuler depuis le site (candidature sur le site de
  // l'entreprise) : on l'enregistre quand même, pour la postuler à la main
  // depuis « Mes offres ».
  if (!offerId && status === "external") {
    const job = parseJob(body.job);
    if (job) {
      const offer = await findOrCreateOffer(supabase, user.id, job);
      if (offer.ok) offerId = offer.id;
    }
  }

  const { data: previous } = await supabase
    .from("auto_applications")
    .select("status")
    .eq("user_id", user.id)
    .eq("site", site)
    .eq("job_key", jobKey)
    .maybeSingle();

  // Une candidature envoyée ne redevient jamais « échouée » ou « ignorée » :
  // elle compte dans le plafond et bloque les doublons.
  if (previous?.status !== "submitted" || status === "submitted") {
    const { error } = await supabase.from("auto_applications").upsert(
      {
        user_id: user.id,
        offer_id: offerId,
        site,
        job_key: jobKey,
        status,
        reason,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id,site,job_key" }
    );

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
  }

  if (status === "submitted" && offerId) {
    await supabase
      .from("offers")
      .update({ status: "applied", updated_at: new Date().toISOString() })
      .eq("id", offerId)
      .eq("user_id", user.id)
      .in("status", ["found", "letter_generated"]);
  }

  const [preferences, used] = await Promise.all([
    loadPreferences(supabase, user.id),
    countSubmittedLast24h(supabase, user.id),
  ]);

  return NextResponse.json({
    ok: true,
    remaining: Math.max(0, preferences.daily_limit - used),
  });
}
