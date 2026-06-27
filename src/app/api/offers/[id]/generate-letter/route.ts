import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { triggerLetterGeneration } from "@/lib/n8n/client";

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
    .select("cv_text, full_name, phone, location")
    .eq("user_id", user.id)
    .maybeSingle();

  if (!profile?.cv_text) {
    return NextResponse.json(
      { error: "Renseigne d'abord ton CV dans ton profil" },
      { status: 400 }
    );
  }

  try {
    const result = await triggerLetterGeneration({
      offerId: id,
      userId: user.id,
      cvText: profile.cv_text,
      fullName: profile.full_name ?? "",
      phone: profile.phone ?? "",
      location: profile.location ?? "",
    });
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Erreur inconnue" },
      { status: 502 }
    );
  }
}
