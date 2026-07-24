import { NextResponse } from "next/server";
import { supabaseFromRequest } from "@/lib/supabase/from-request";
import { triggerOfferExtraction } from "@/lib/n8n/client";
import { scoreOffer } from "@/lib/scoring";

// Endpoint dédié à l'extension Chrome : reçoit l'URL de l'offre depuis l'onglet
// actif, lance la même extraction n8n que le dashboard, puis renvoie l'id de
// l'offre créée pour que l'extension propose un lien direct vers sa fiche.

export async function POST(request: Request) {
  const { supabase, user } = await supabaseFromRequest(request);

  if (!user) {
    return NextResponse.json(
      { error: "Non connecté. Connecte-toi depuis l'extension." },
      { status: 401 }
    );
  }

  let body: { url?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Requête invalide" }, { status: 400 });
  }

  const url = body.url?.trim();
  if (!url) {
    return NextResponse.json({ error: "URL de l'offre manquante" }, { status: 400 });
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("cv_text, full_name, phone, location, additional_skills")
    .eq("user_id", user.id)
    .maybeSingle();

  if (!profile?.cv_text) {
    return NextResponse.json(
      { error: "Renseigne d'abord ton CV dans ton profil" },
      { status: 400 }
    );
  }

  // Repère l'offre la plus récente avant l'extraction pour détecter la nouvelle.
  const { data: prev } = await supabase
    .from("offers")
    .select("created_at")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const beforeTs = prev?.created_at ?? null;

  let result: unknown;
  try {
    result = await triggerOfferExtraction({
      userId: user.id,
      cvText: profile.cv_text,
      fullName: profile.full_name ?? "",
      phone: profile.phone ?? "",
      location: profile.location ?? "",
      additionalSkills: profile.additional_skills ?? "",
      url,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Erreur inconnue" },
      { status: 502 }
    );
  }

  // Résout l'id de l'offre : priorité à l'id éventuellement renvoyé par n8n,
  // sinon l'offre fraîchement créée (créée après le snapshot), sinon un match
  // sur l'URL, sinon la plus récente.
  let offerId: string | null = null;
  if (result && typeof result === "object" && "id" in result) {
    const id = (result as { id?: unknown }).id;
    if (typeof id === "string") offerId = id;
  }

  if (!offerId) {
    const { data: recent } = await supabase
      .from("offers")
      .select("id, url, created_at")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(10);

    if (recent && recent.length > 0) {
      const fresh = beforeTs
        ? recent.find((o) => o.created_at > beforeTs)
        : recent[0];
      offerId =
        fresh?.id ??
        recent.find((o) => o.url === url)?.id ??
        recent[0].id;
    }
  }

  if (!offerId) {
    return NextResponse.json(
      { error: "Offre envoyée mais introuvable. Vérifie le dashboard." },
      { status: 200 }
    );
  }

  await scoreOffer(user.id, offerId);

  return NextResponse.json({ id: offerId });
}
