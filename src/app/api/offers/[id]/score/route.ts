import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { triggerOfferScoring } from "@/lib/n8n/client";

export async function POST(
  _request: Request,
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
    supabase
      .from("profiles")
      .select("cv_text, additional_skills, portfolio_text")
      .eq("user_id", user.id)
      .maybeSingle(),
  ]);

  if (!offer) {
    return NextResponse.json({ error: "Offre introuvable" }, { status: 404 });
  }

  if (!profile?.cv_text) {
    return NextResponse.json(
      { error: "Renseigne d'abord ton CV dans ton profil" },
      { status: 400 }
    );
  }

  try {
    const result = await triggerOfferScoring({
      offerId: id,
      userId: user.id,
      cvText: profile.cv_text,
      additionalSkills: profile.additional_skills ?? "",
      portfolioText: profile.portfolio_text ?? "",
    });
    return NextResponse.json({
      match_score: result.match_score,
      match_reason: result.match_reason,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Erreur inconnue" },
      { status: 502 }
    );
  }
}
