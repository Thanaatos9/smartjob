import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { triggerOfferExtraction } from "@/lib/n8n/client";
import { scoreOffer } from "@/lib/scoring";

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
    .select("cv_text, full_name, phone, location, additional_skills")
    .eq("user_id", user.id)
    .maybeSingle();

  if (!profile?.cv_text) {
    return NextResponse.json(
      { error: "Renseigne d'abord ton CV dans ton profil" },
      { status: 400 }
    );
  }

  // Repère l'offre la plus récente avant l'extraction pour détecter la nouvelle
  // (le webhook n8n ne renvoie pas toujours l'id de l'offre créée).
  const { data: prev } = await supabase
    .from("offers")
    .select("id, created_at")
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
      text,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Erreur inconnue" },
      { status: 502 }
    );
  }

  let offerId: string | null = null;
  if (result && typeof result === "object" && "id" in result) {
    const id = (result as { id?: unknown }).id;
    if (typeof id === "string") offerId = id;
  }
  if (!offerId) {
    const { data: recent } = await supabase
      .from("offers")
      .select("id, created_at")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(1);
    const fresh = recent?.[0];
    if (fresh && (!beforeTs || fresh.created_at > beforeTs)) {
      offerId = fresh.id;
    }
  }

  if (offerId) {
    await scoreOffer(user.id, offerId);
  }

  return NextResponse.json(result);
}
