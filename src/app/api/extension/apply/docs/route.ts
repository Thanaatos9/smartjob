import { NextResponse } from "next/server";
import { supabaseFromRequest } from "@/lib/supabase/from-request";
import { findOfferByPageUrl } from "@/lib/offer-match";

// Fenêtre de l'extension : l'offre de l'onglet est-elle dans smartjob, et a-t-elle
// déjà son CV et sa lettre adaptés ? Lecture seule, sans génération.
export async function GET(request: Request) {
  const { supabase, user } = await supabaseFromRequest(request);
  if (!user) {
    return NextResponse.json({ error: "Non connecté. Connecte-toi depuis l'extension." }, { status: 401 });
  }

  const pageUrl = new URL(request.url).searchParams.get("pageUrl") ?? "";
  if (!/^https?:\/\//i.test(pageUrl)) return NextResponse.json({ found: false });

  const offer = await findOfferByPageUrl(supabase, user.id, pageUrl);
  if (!offer) return NextResponse.json({ found: false });

  return NextResponse.json({
    found: true,
    offerId: offer.id,
    title: offer.title,
    company: offer.company,
    hasCv: !!offer.tailored_cv_path,
    hasLetter: !!offer.tailored_letter_path,
  });
}
