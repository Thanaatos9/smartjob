import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Supprime toutes les offres rattachées à une recherche (et leurs lettres).
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

  const { data: offers, error: readError } = await supabase
    .from("offers")
    .select("id, cover_letter_url")
    .eq("user_id", user.id)
    .eq("search_id", id);

  if (readError) {
    return NextResponse.json({ error: readError.message }, { status: 500 });
  }

  // Nettoyage best-effort des lettres dans le storage.
  const letters = (offers ?? [])
    .map((o) => o.cover_letter_url)
    .filter((u): u is string => Boolean(u));
  if (letters.length > 0) {
    await supabase.storage.from("cover-letters").remove(letters);
  }

  const { error } = await supabase
    .from("offers")
    .delete()
    .eq("user_id", user.id)
    .eq("search_id", id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, deleted: offers?.length ?? 0 });
}
