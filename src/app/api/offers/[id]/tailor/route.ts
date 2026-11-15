import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { tailorOffer } from "@/lib/tailor";

// Bouton « Générer CV + lettre » de la fiche offre : génère toujours (même sous
// le seuil, puisque l'utilisateur le demande), et régénère si on le lui demande.
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Non connecté" }, { status: 401 });

  const body = (await request.json().catch(() => ({}))) as { regenerate?: unknown };
  const result = await tailorOffer(supabase, user.id, id, { force: true, regenerate: body.regenerate === true });

  if (result.status === "no_profile") {
    return NextResponse.json(
      { error: "Ajoute d'abord ton profil CV structuré sur la page Profil" },
      { status: 400 }
    );
  }
  if (result.status === "error") return NextResponse.json({ error: result.error }, { status: 502 });
  return NextResponse.json(result);
}
