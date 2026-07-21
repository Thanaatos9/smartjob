import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { triggerOfferExtraction } from "@/lib/n8n/client";
import { fetchOfferContent } from "@/lib/fetch-offer-text";

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Non connecté" }, { status: 401 });
  }

  const { url, text } = await request.json();

  if (!url && !text) {
    return NextResponse.json(
      { error: "Fournis une URL ou un texte d'offre" },
      { status: 400 }
    );
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("cv_text, full_name, phone, location")
    .eq("user_id", user.id)
    .maybeSingle();

  if (!profile?.cv_text) {
    return NextResponse.json(
      { error: "Renseigne d'abord ton CV dans ton profil" },
      { status: 400 }
    );
  }

  // Si on n'a qu'une URL, on capture le contenu de la page côté serveur et on
  // l'envoie comme `text`. Sinon n8n ne recevrait que la coquille "Loading..."
  // des sites rendus en JavaScript (VIE/VIA…). En cas d'échec de capture, on
  // retombe sur l'envoi de l'URL seule (ancien comportement).
  let offerText: string | undefined = text;
  if (url && !offerText) {
    const content = await fetchOfferContent(url);
    if (content?.text) offerText = content.text;
  }

  try {
    const result = await triggerOfferExtraction({
      userId: user.id,
      cvText: profile.cv_text,
      fullName: profile.full_name ?? "",
      phone: profile.phone ?? "",
      location: profile.location ?? "",
      url,
      text: offerText,
    });
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Erreur inconnue" },
      { status: 502 }
    );
  }
}
