import type { SupabaseClient } from "@supabase/supabase-js";
import { generateTailoredContent } from "./generate";
import { atsCoverage, renderCv, renderLetter } from "./render";
import { isCvProfile, type CvProfile } from "./types";

// Génère et range le CV et la lettre adaptés d'une offre :
// profil structuré + texte de l'offre → contenu (OpenAI) → PDF une page → bucket
// `cvs` sous <user>/offers/<offre>/cv.pdf | letter.pdf, et ciblage sur l'offre.

export const FIT_THRESHOLD = 70;

export type TailorResult =
  | { status: "ready"; cvPath: string; letterPath: string; fitScore: number | null; coverage: number | null; generated: boolean }
  | { status: "low_fit"; fitScore: number; gaps: string }
  | { status: "no_profile" }
  | { status: "error"; error: string };

const LOCK_MS = 3 * 60 * 1000;

type OfferRow = {
  id: string;
  title: string | null;
  company: string | null;
  location: string | null;
  raw_text: string | null;
  summary: string | null;
  status: string;
  cover_letter_text: string | null;
  recruiter: string | null;
  tailored_cv_path: string | null;
  tailored_letter_path: string | null;
  fit_score: number | null;
  ats_coverage: number | null;
  tailoring_started_at: string | null;
};

const OFFER_FIELDS =
  "id, title, company, location, raw_text, summary, status, cover_letter_text, recruiter, " +
  "tailored_cv_path, tailored_letter_path, fit_score, ats_coverage, tailoring_started_at";

async function loadOffer(supabase: SupabaseClient, userId: string, offerId: string) {
  const { data } = await supabase.from("offers").select(OFFER_FIELDS).eq("id", offerId).eq("user_id", userId).maybeSingle();
  return data as OfferRow | null;
}

export async function loadCvProfile(supabase: SupabaseClient, userId: string): Promise<CvProfile | null> {
  const { data } = await supabase.from("profiles").select("cv_profile").eq("user_id", userId).maybeSingle();
  return isCvProfile(data?.cv_profile) ? data.cv_profile : null;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Un texte de lettre déjà enregistré (généré par n8n ou retouché à la main) est
// réutilisé tel quel : on ne l'écrase jamais.
function splitSavedLetter(text: string) {
  return text.split(/\n\s*\n/).map((p) => p.replace(/\s*\n\s*/g, " ").trim()).filter(Boolean);
}

export async function tailorOffer(
  supabase: SupabaseClient,
  userId: string,
  offerId: string,
  opts: { force?: boolean; regenerate?: boolean } = {}
): Promise<TailorResult> {
  const profile = await loadCvProfile(supabase, userId);
  if (!profile) return { status: "no_profile" };

  let offer = await loadOffer(supabase, userId, offerId);
  if (!offer) return { status: "error", error: "Offre introuvable" };

  if (offer.tailored_cv_path && offer.tailored_letter_path && !opts.regenerate) {
    return {
      status: "ready",
      cvPath: offer.tailored_cv_path,
      letterPath: offer.tailored_letter_path,
      fitScore: offer.fit_score,
      coverage: offer.ats_coverage,
      generated: false,
    };
  }

  // Verrou : si une génération de cette offre est déjà en cours (onglet ou
  // requête concurrente), on attend son résultat au lieu d'en lancer une autre.
  const cutoff = new Date(Date.now() - LOCK_MS).toISOString();
  const { data: locked, error: lockError } = await supabase
    .from("offers")
    .update({ tailoring_started_at: new Date().toISOString() })
    .eq("id", offerId)
    .eq("user_id", userId)
    .or(`tailoring_started_at.is.null,tailoring_started_at.lt."${cutoff}"`)
    .select("id");
  // Verrou illisible (colonne absente, filtre refusé) : on génère quand même.
  if (!lockError && !locked?.length) {
    for (let i = 0; i < 45; i++) {
      await sleep(2000);
      offer = await loadOffer(supabase, userId, offerId);
      if (offer?.tailored_cv_path && offer.tailored_letter_path && !offer.tailoring_started_at) {
        return { status: "ready", cvPath: offer.tailored_cv_path, letterPath: offer.tailored_letter_path, fitScore: offer.fit_score, coverage: offer.ats_coverage, generated: false };
      }
      if (offer && !offer.tailoring_started_at) break;
    }
    return { status: "error", error: "Génération déjà en cours, réessaie dans un instant" };
  }

  const release = (extra: Record<string, unknown> = {}) =>
    supabase
      .from("offers")
      .update({ tailoring_started_at: null, updated_at: new Date().toISOString(), ...extra })
      .eq("id", offerId)
      .eq("user_id", userId);

  try {
    const text = offer.raw_text || offer.summary || "";
    if (text.trim().length < 80) {
      await release();
      return { status: "error", error: "Texte de l'offre trop court pour adapter le CV" };
    }

    const content = await generateTailoredContent({
      profile,
      offer: { title: offer.title, company: offer.company, location: offer.location, text },
    });

    if (content.score < FIT_THRESHOLD && !opts.force) {
      await release({ fit_score: content.score, gaps: content.ecarts || null, axis: content.axe || null });
      return { status: "low_fit", fitScore: content.score, gaps: content.ecarts };
    }

    // Photo du profil (facultative).
    let photo: Uint8Array | null = null;
    if (profile.photo_path) {
      const { data } = await supabase.storage.from("cvs").download(profile.photo_path);
      if (data) photo = new Uint8Array(await data.arrayBuffer());
    }

    // Offre capturée depuis une page brute : entreprise, intitulé et lieu lus par le modèle.
    const filled = {
      company: offer.company || content.entreprise || null,
      title: offer.title && !/\|| - |postuler|apply/i.test(offer.title) ? offer.title : content.intitule || offer.title,
      location: offer.location || content.lieu || null,
    };

    const cv = renderCv(profile, content, photo);
    const saved = offer.cover_letter_text?.trim();
    const letter = renderLetter(profile, {
      lang: content.lang,
      entreprise: filled.company ?? "",
      villeEntreprise: filled.location ?? "",
      poste: filled.title ?? "",
      // Lettre déjà enregistrée : reprise telle quelle (elle contient son appel et sa formule).
      appel: saved ? null : content.lettre.appel,
      paragraphes: saved ? splitSavedLetter(saved) : content.lettre.paragraphes,
    });

    const base = `${userId}/offers/${offerId}`;
    const up = async (name: string, bytes: Uint8Array) => {
      const { error } = await supabase.storage
        .from("cvs")
        .upload(`${base}/${name}`, bytes, { contentType: "application/pdf", upsert: true });
      if (error) throw new Error(`${name} : ${error.message}`);
      return `${base}/${name}`;
    };
    const [cvPath, letterPath] = await Promise.all([up("cv.pdf", cv.pdf), up("letter.pdf", letter.pdf)]);

    const coverage = atsCoverage(cv.content);
    const letterText = [content.lettre.appel, ...content.lettre.paragraphes].join("\n\n");
    await release({
      company: filled.company,
      title: filled.title,
      location: filled.location,
      tailored_cv_path: cvPath,
      tailored_letter_path: letterPath,
      fit_score: content.score,
      axis: content.axe || null,
      ats_keywords: content.mots_cles.obligatoires,
      ats_coverage: coverage,
      gaps: content.ecarts || null,
      ...(offer.recruiter ? {} : { recruiter: content.recruteur, recruiter_contact: content.contact_recruteur }),
      ...(saved ? {} : { cover_letter_text: letterText }),
      ...(offer.status === "found" ? { status: "letter_generated" } : {}),
    });

    return { status: "ready", cvPath, letterPath, fitScore: content.score, coverage, generated: true };
  } catch (err) {
    await release();
    return { status: "error", error: err instanceof Error ? err.message : "Génération impossible" };
  }
}
