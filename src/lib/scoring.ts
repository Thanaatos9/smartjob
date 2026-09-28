import { createServiceClient } from "@/lib/supabase/service";
import { computeMatchScore } from "@/lib/openai/client";
import { pickCv, type CvLanguage } from "@/lib/auto-apply/cv";

// Calcule et enregistre la note de correspondance CV/offre (0-10) pour une
// offre donnée. Best-effort : n'importe quelle erreur (pas de CV, offre sans
// contenu, OpenAI indisponible) est avalée pour ne jamais bloquer la création
// de l'offre. `language` choisit le CV comparé à l'offre (français par défaut).
export async function scoreOffer(userId: string, offerId: string, language: CvLanguage = "fr") {
  const supabase = createServiceClient();

  const [{ data: offer }, { data: profile }] = await Promise.all([
    supabase
      .from("offers")
      .select("title, company, summary, raw_text, skills")
      .eq("id", offerId)
      .eq("user_id", userId)
      .maybeSingle(),
    // "*" : tolère un déploiement qui précède la migration du CV anglais.
    supabase.from("profiles").select("*").eq("user_id", userId).maybeSingle(),
  ]);

  const cv = profile ? pickCv(profile, language, "text") : null;
  if (!offer || !cv?.text) return;

  const offerText = [
    offer.title ?? "",
    offer.company ?? "",
    offer.skills?.length ? `Compétences requises : ${offer.skills.join(", ")}` : "",
    offer.summary ?? "",
    offer.raw_text ?? "",
  ]
    .filter(Boolean)
    .join("\n");

  if (!offerText.trim()) return;

  try {
    const { score, reason } = await computeMatchScore({
      cvText: cv.text,
      additionalSkills: profile?.additional_skills,
      offerText,
    });

    await supabase
      .from("offers")
      .update({ match_score: score, match_reason: reason })
      .eq("id", offerId)
      .eq("user_id", userId);
  } catch (err) {
    console.error("Échec du calcul du score de correspondance", err);
  }
}
