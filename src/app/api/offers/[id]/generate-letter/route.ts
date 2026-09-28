import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { triggerLetterGeneration } from "@/lib/n8n/client";
import { parseLanguage, pickCv } from "@/lib/auto-apply/cv";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Non connecté" }, { status: 401 });
  }

  const [{ data: offer }, { data: profile }] = await Promise.all([
    supabase.from("offers").select("id").eq("id", id).eq("user_id", user.id).maybeSingle(),
    // "*" : tolère un déploiement qui précède la migration du CV anglais.
    supabase.from("profiles").select("*").eq("user_id", user.id).maybeSingle(),
  ]);

  if (!offer) {
    return NextResponse.json({ error: "Offre introuvable" }, { status: 404 });
  }

  const body = await request.json().catch(() => ({}));
  const language = parseLanguage(body?.language);

  // La lettre anglaise s'appuie sur le CV anglais s'il existe.
  const cv = profile ? pickCv(profile, language, "text") : null;
  if (!profile || !cv?.text) {
    return NextResponse.json(
      { error: "Renseigne d'abord ton CV dans ton profil" },
      { status: 400 }
    );
  }

  try {
    const result = await triggerLetterGeneration({
      language,
      offerId: id,
      userId: user.id,
      cvText: cv.text,
      fullName: profile.full_name ?? "",
      phone: profile.phone ?? "",
      location: profile.location ?? "",
      additionalSkills: profile.additional_skills ?? "",
      portfolioText: profile.portfolio_text ?? "",
    });
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Erreur inconnue" },
      { status: 502 }
    );
  }
}
