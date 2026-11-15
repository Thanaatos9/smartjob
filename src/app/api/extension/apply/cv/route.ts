import { NextResponse } from "next/server";
import { supabaseFromRequest } from "@/lib/supabase/from-request";
import { parseLanguage, pickCv } from "@/lib/auto-apply/cv";
import { tailorOffer } from "@/lib/tailor";
import { findOfferByPageUrl } from "@/lib/offer-match";

// Renvoie le PDF à attacher aux champs fichier des formulaires.
//   ?lang=fr|en       langue du CV générique (repli sur l'autre langue)
//   ?offerId=<uuid>   offre en cours : son CV adapté passe avant le CV générique
//                     du profil (généré à la volée s'il n'existe pas encore et
//                     que le profil CV structuré est renseigné)
//   ?pageUrl=<url>    à défaut d'id (bouton « Remplir ce formulaire ») : l'offre
//                     est retrouvée par son adresse, sans /apply ni paramètres
//   ?kind=letter      la lettre adaptée de l'offre (404 s'il n'y en a pas)

const UUID_RX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type TailoredOffer = { id: string; url: string | null; tailored_cv_path: string | null; tailored_letter_path: string | null };

export async function GET(request: Request) {
  const { supabase, user } = await supabaseFromRequest(request);

  if (!user) {
    return NextResponse.json(
      { error: "Non connecté. Connecte-toi depuis l'extension." },
      { status: 401 }
    );
  }

  const params = new URL(request.url).searchParams;
  const language = parseLanguage(params.get("lang"));
  const kind = params.get("kind") === "letter" ? "letter" : "cv";
  const offerId = params.get("offerId");
  const pageUrl = params.get("pageUrl");

  // Offre ciblée, si elle a des documents adaptés.
  let offer: TailoredOffer | null = null;
  if (offerId && UUID_RX.test(offerId)) {
    const { data } = await supabase
      .from("offers")
      .select("id, url, tailored_cv_path, tailored_letter_path")
      .eq("id", offerId)
      .eq("user_id", user.id)
      .maybeSingle();
    offer = data;
  } else if (pageUrl) {
    offer = await findOfferByPageUrl(supabase, user.id, pageUrl);
  }

  // "*" : tolère un déploiement qui précède la migration du CV anglais.
  const { data: profile } = await supabase
    .from("profiles")
    .select("*")
    .eq("user_id", user.id)
    .maybeSingle();

  // Offre reconnue sans documents adaptés : on les génère maintenant. L'utilisateur
  // remplit lui-même ce formulaire, donc pas de seuil d'adéquation ici.
  if (offer && !(kind === "letter" ? offer.tailored_letter_path : offer.tailored_cv_path)) {
    const made = await tailorOffer(supabase, user.id, offer.id, { force: true });
    if (made.status === "ready") {
      offer = { ...offer, tailored_cv_path: made.cvPath, tailored_letter_path: made.letterPath };
    }
  }

  const tailoredPath = kind === "letter" ? offer?.tailored_letter_path : offer?.tailored_cv_path;
  let path: string | null = tailoredPath ?? null;
  let cvLanguage: string = language;

  if (!path) {
    if (kind === "letter") {
      return NextResponse.json({ error: "Pas de lettre adaptée pour cette offre" }, { status: 404 });
    }
    const cv = profile ? pickCv(profile, language, "pdf") : null;
    if (!profile || !cv?.pdfPath) {
      return NextResponse.json({ error: "Aucun CV PDF dans ton profil" }, { status: 404 });
    }
    path = cv.pdfPath;
    cvLanguage = cv.language;
  }

  const { data: blob, error } = await supabase.storage.from("cvs").download(path);

  if (error || !blob) {
    return NextResponse.json(
      { error: "Impossible de récupérer le document" },
      { status: 502 }
    );
  }

  const base = (profile?.full_name ?? "").trim().replace(/[^\p{L}\p{N} _-]/gu, "");
  const prefix = kind === "letter"
    ? (cvLanguage === "en" ? "Cover letter" : "Lettre de motivation")
    : (cvLanguage === "en" ? "Resume" : "CV");
  const filename = `${prefix}${base ? ` - ${base}` : ""}.pdf`;

  return new Response(await blob.arrayBuffer(), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`,
      "X-Cv-Language": cvLanguage,
      "X-Cv-Tailored": tailoredPath ? "1" : "0",
      "Cache-Control": "private, no-store",
    },
  });
}
