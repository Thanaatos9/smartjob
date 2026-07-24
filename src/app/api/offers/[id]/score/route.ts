import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { scoreOffer } from "@/lib/scoring";

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

  const { data: offer } = await supabase
    .from("offers")
    .select("id")
    .eq("id", id)
    .eq("user_id", user.id)
    .maybeSingle();

  if (!offer) {
    return NextResponse.json({ error: "Offre introuvable" }, { status: 404 });
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("cv_text")
    .eq("user_id", user.id)
    .maybeSingle();

  if (!profile?.cv_text) {
    return NextResponse.json(
      { error: "Renseigne d'abord ton CV dans ton profil" },
      { status: 400 }
    );
  }

  await scoreOffer(user.id, id);

  const { data: scored } = await supabase
    .from("offers")
    .select("match_score, match_reason")
    .eq("id", id)
    .eq("user_id", user.id)
    .maybeSingle();

  if (scored?.match_score === null || scored?.match_score === undefined) {
    return NextResponse.json(
      { error: "Impossible de calculer la note pour cette offre" },
      { status: 502 }
    );
  }

  return NextResponse.json({
    match_score: scored.match_score,
    match_reason: scored.match_reason,
  });
}
