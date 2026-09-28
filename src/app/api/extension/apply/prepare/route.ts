import { NextResponse } from "next/server";
import { supabaseFromRequest } from "@/lib/supabase/from-request";
import { scoreOffer } from "@/lib/scoring";
import {
  countSubmittedLast24h,
  isBlacklisted,
  loadPreferences,
} from "@/lib/auto-apply/preferences";
import { findOrCreateOffer, parseJob, str } from "@/lib/auto-apply/offers";
import { parseLanguage, pickCv } from "@/lib/auto-apply/cv";

// Étape « faut-il postuler à cette offre ? » de la candidature automatique.
// L'extension envoie ce qu'elle lit dans la page ; le serveur enregistre
// l'offre, la note (0-10) avec le CV, et tranche : dédoublonnage, blacklist,
// plafond sur 24 h et score minimum sont appliqués ICI, pas dans l'extension,
// pour qu'un réglage ne puisse pas être contourné en modifiant le client.

const SITES = ["linkedin", "wttj", "jobteaser"] as const;
type Site = (typeof SITES)[number];

type SkipReason =
  | "already_applied"
  | "blacklisted"
  | "daily_limit"
  | "low_score"
  | "score_unavailable";

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

  const site = body.site as Site;
  const jobKey = str(body.jobKey, 300);
  const job = parseJob(body);
  if (!SITES.includes(site) || !jobKey || !job) {
    return NextResponse.json({ error: "Offre invalide" }, { status: 400 });
  }

  // Langue de l'offre, déterminée par l'extension (ou imposée par l'utilisateur) :
  // elle choisit le CV comparé à l'offre pour le score.
  const language = parseLanguage(body.language);

  const [{ data: profile }, preferences, used, { data: previous }] = await Promise.all([
    // "*" : tolère un déploiement qui précède la migration du CV anglais.
    supabase.from("profiles").select("*").eq("user_id", user.id).maybeSingle(),
    loadPreferences(supabase, user.id),
    countSubmittedLast24h(supabase, user.id),
    supabase
      .from("auto_applications")
      .select("status")
      .eq("user_id", user.id)
      .eq("site", site)
      .eq("job_key", jobKey)
      .maybeSingle(),
  ]);

  const cv = profile ? pickCv(profile, language, "text") : null;
  if (!cv) {
    return NextResponse.json(
      { error: "Renseigne d'abord ton CV dans ton profil" },
      { status: 400 }
    );
  }

  const remaining = Math.max(0, preferences.daily_limit - used);

  // Enregistre l'offre (une seule ligne par URL et par utilisateur).
  const offer = await findOrCreateOffer(supabase, user.id, job);
  if (!offer.ok) {
    return NextResponse.json({ error: offer.error }, { status: 500 });
  }
  const offerId = offer.id;
  let score = offer.matchScore;
  let reason = offer.matchReason;

  let skip: SkipReason | null = null;

  if (previous?.status === "submitted") {
    skip = "already_applied";
  } else if (isBlacklisted(job.company, preferences.blacklist)) {
    skip = "blacklisted";
  } else if (remaining <= 0) {
    skip = "daily_limit";
  }

  // Le score coûte un appel OpenAI : on ne le calcule que si l'offre n'a pas
  // déjà été écartée par une règle gratuite.
  if (!skip && score === null) {
    await scoreOffer(user.id, offerId, language);
    const { data: scored } = await supabase
      .from("offers")
      .select("match_score, match_reason")
      .eq("id", offerId)
      .maybeSingle();
    score = scored?.match_score ?? null;
    reason = scored?.match_reason ?? null;
  }

  if (!skip && preferences.min_score > 0) {
    if (score === null) {
      // Sans score, on ne postule pas dans le dos de l'utilisateur en mode
      // auto ; en mode semi c'est lui qui valide de toute façon.
      if (preferences.mode === "auto") skip = "score_unavailable";
    } else if (score < preferences.min_score) {
      skip = "low_score";
    }
  }

  if (skip && skip !== "already_applied") {
    await supabase.from("auto_applications").upsert(
      {
        user_id: user.id,
        offer_id: offerId,
        site,
        job_key: jobKey,
        status: "skipped",
        reason: skip,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id,site,job_key" }
    );
  }

  return NextResponse.json({
    offerId,
    score,
    scoreReason: reason,
    decision: skip ? "skip" : "apply",
    skipReason: skip,
    remaining,
    // CV réellement retenu : peut différer de `language` s'il manque (repli).
    language,
    cvLanguage: cv.language,
  });
}
