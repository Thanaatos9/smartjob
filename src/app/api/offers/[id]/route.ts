import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { STATUS_LABELS } from "@/lib/offer-status";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Non connecté" }, { status: 401 });
  }

  const body = await request.json();
  const update: Record<string, unknown> = { updated_at: new Date().toISOString() };

  if ("status" in body) {
    if (typeof body.status !== "string" || !(body.status in STATUS_LABELS)) {
      return NextResponse.json({ error: "Statut invalide" }, { status: 400 });
    }
    update.status = body.status;
  }

  if ("notes" in body) {
    if (body.notes !== null && typeof body.notes !== "string") {
      return NextResponse.json({ error: "Notes invalides" }, { status: 400 });
    }
    update.notes = body.notes;
  }

  const { data: offer, error } = await supabase
    .from("offers")
    .update(update)
    .eq("id", id)
    .eq("user_id", user.id)
    .select("id")
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!offer) {
    return NextResponse.json({ error: "Offre introuvable" }, { status: 404 });
  }

  return NextResponse.json({ ok: true });
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Non connecté" }, { status: 401 });
  }

  // Delete + select en une seule requête (au lieu de select puis delete).
  const { data: offer, error } = await supabase
    .from("offers")
    .delete()
    .eq("id", id)
    .eq("user_id", user.id)
    .select("id, cover_letter_url")
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!offer) {
    return NextResponse.json({ error: "Offre introuvable" }, { status: 404 });
  }

  // Nettoyage best-effort du fichier lettre : ne bloque pas la réponse.
  if (offer.cover_letter_url) {
    supabase.storage.from("cover-letters").remove([offer.cover_letter_url]).then(
      () => {},
      () => {}
    );
  }

  return NextResponse.json({ ok: true });
}
