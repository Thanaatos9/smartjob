import { NextResponse } from "next/server";
import { supabaseFromRequest } from "@/lib/supabase/from-request";
import { findOrCreateOffer, str } from "@/lib/auto-apply/offers";
import { findOfferByPageUrl } from "@/lib/offer-match";
import { tailorOffer } from "@/lib/tailor";

// Bouton « Remplir ce formulaire » : retrouve l'offre de la page (ou l'enregistre
// à partir du texte de la page si elle n'est pas encore dans smartjob), puis
// prépare son CV et sa lettre adaptés. L'extension remplit ensuite le formulaire
// avec l'offre identifiée.

// Une page de formulaire seule (ATS d'entreprise) ne décrit pas le poste : en
// dessous de ce volume de texte, on n'enregistre pas d'offre à partir d'elle.
const MIN_OFFER_TEXT = 800;

export async function POST(request: Request) {
  const { supabase, user } = await supabaseFromRequest(request);
  if (!user) {
    return NextResponse.json({ error: "Non connecté. Connecte-toi depuis l'extension." }, { status: 401 });
  }

  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  const url = str(body?.url, 2000);
  if (!/^https?:\/\//i.test(url)) return NextResponse.json({ error: "Adresse de page invalide" }, { status: 400 });
  const text = str(body?.text, 20000);
  const title = str(body?.title, 300);

  let offerId: string | null = null;
  let created = false;

  const existing = await findOfferByPageUrl(supabase, user.id, url);
  if (existing) {
    offerId = existing.id;
  } else if (text.length >= MIN_OFFER_TEXT) {
    const made = await findOrCreateOffer(supabase, user.id, { url, title, company: "", location: "", text });
    if (!made.ok) return NextResponse.json({ error: made.error }, { status: 500 });
    offerId = made.id;
    created = true;
  } else {
    return NextResponse.json({
      offerId: null,
      tailored: false,
      warning:
        "Offre introuvable dans smartjob et page trop courte pour la lire : ouvre la page de l'offre, clique sur « Envoyer l'offre », puis reviens remplir ce formulaire. CV du profil utilisé en attendant.",
    });
  }

  // L'utilisateur remplit lui-même : on génère même sous le seuil d'adéquation.
  const result = await tailorOffer(supabase, user.id, offerId, { force: true });

  if (result.status === "ready") {
    return NextResponse.json({
      offerId,
      created,
      tailored: true,
      generated: result.generated,
      fitScore: result.fitScore,
      coverage: result.coverage,
    });
  }
  return NextResponse.json({
    offerId,
    created,
    tailored: false,
    warning:
      result.status === "no_profile"
        ? "Profil CV structuré absent (page Profil) : CV du profil utilisé"
        : result.status === "error"
          ? `CV adapté indisponible (${result.error}) : CV du profil utilisé`
          : "CV du profil utilisé",
  });
}
