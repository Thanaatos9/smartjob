import { NextResponse } from "next/server";
import { supabaseFromRequest } from "@/lib/supabase/from-request";
import { loadPreferences } from "@/lib/auto-apply/preferences";
import { str } from "@/lib/auto-apply/offers";
import { tailorOffer } from "@/lib/tailor";

// Étape « CV et lettre adaptés » de la candidature automatique, appelée par
// l'extension juste après /prepare quand la décision est « postuler ».
// En mode auto, une offre jugée peu adaptée (< 70/100) est écartée ; en mode
// semi, l'utilisateur valide lui-même, donc on génère quand même.

const UUID_RX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(request: Request) {
  const { supabase, user } = await supabaseFromRequest(request);
  if (!user) {
    return NextResponse.json({ error: "Non connecté. Connecte-toi depuis l'extension." }, { status: 401 });
  }

  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  const offerId = typeof body?.offerId === "string" ? body.offerId : "";
  if (!UUID_RX.test(offerId)) return NextResponse.json({ error: "Offre invalide" }, { status: 400 });

  const preferences = await loadPreferences(supabase, user.id);
  const result = await tailorOffer(supabase, user.id, offerId, { force: preferences.mode !== "auto" });

  if (result.status === "low_fit") {
    const site = str(body?.site, 40);
    const jobKey = str(body?.jobKey, 300);
    if (site && jobKey) {
      await supabase.from("auto_applications").upsert(
        {
          user_id: user.id,
          offer_id: offerId,
          site,
          job_key: jobKey,
          status: "skipped",
          reason: "low_fit",
          updated_at: new Date().toISOString(),
        },
        { onConflict: "user_id,site,job_key" }
      );
    }
    return NextResponse.json({ decision: "skip", skipReason: "low_fit", fitScore: result.fitScore, gaps: result.gaps });
  }

  if (result.status === "ready") {
    return NextResponse.json({ decision: "apply", tailored: true, fitScore: result.fitScore, coverage: result.coverage });
  }

  // Pas de profil CV structuré ou génération en échec : on postule avec le CV
  // du profil, comme avant, sans bloquer la candidature.
  return NextResponse.json({
    decision: "apply",
    tailored: false,
    warning: result.status === "no_profile" ? "Profil CV structuré absent : CV du profil utilisé" : result.error,
  });
}
