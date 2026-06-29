import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { triggerJobSearch } from "@/lib/n8n/client";
import { offerDedupKey, dedupKeyFromResult } from "@/lib/searches";

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Non connecté" }, { status: 401 });
  }

  const { keyword } = await request.json();

  if (!keyword || typeof keyword !== "string" || !keyword.trim()) {
    return NextResponse.json({ error: "Mot-clé requis" }, { status: 400 });
  }

  const trimmed = keyword.trim();
  const now = new Date().toISOString();

  // 1. Enregistre la recherche dans l'historique (source de vérité côté app).
  //    Réutilise une recherche existante au même mot-clé (insensible à la
  //    casse/espaces) pour éviter d'accumuler des doublons en base.
  const { data: existingRows } = await supabase
    .from("searches")
    .select("id, keyword")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });

  const normalized = trimmed.toLowerCase();
  const existing = (existingRows ?? []).find(
    (s) => s.keyword.trim().toLowerCase() === normalized
  );

  let searchId: string;

  if (existing) {
    // Réutilise la ligne : remonte la date pour qu'elle soit "récente".
    const { data: updated, error: updErr } = await supabase
      .from("searches")
      .update({ keyword: trimmed, status: "running", created_at: now })
      .eq("id", existing.id)
      .eq("user_id", user.id)
      .select("id")
      .single();

    if (updErr || !updated) {
      return NextResponse.json(
        { error: "Impossible d'enregistrer la recherche" },
        { status: 500 }
      );
    }
    searchId = updated.id;
  } else {
    const { data: inserted, error: insErr } = await supabase
      .from("searches")
      .insert({ user_id: user.id, keyword: trimmed, status: "running" })
      .select("id")
      .single();

    if (insErr || !inserted) {
      return NextResponse.json(
        { error: "Impossible d'enregistrer la recherche" },
        { status: 500 }
      );
    }
    searchId = inserted.id;
  }

  // 2. Snapshot des offres déjà connues (pour détecter les doublons).
  const { data: known } = await supabase
    .from("offers")
    .select("title, company")
    .eq("user_id", user.id);

  const knownKeys = new Set(
    (known ?? [])
      .map((o) => offerDedupKey(o))
      .filter((k): k is string => k !== null)
  );

  try {
    // 3. Lance la recherche via n8n.
    const result = await triggerJobSearch({ userId: user.id, keyword: trimmed, searchId });
    const offers = result.offers ?? [];

    // 4. Rattache les offres retournées à cette recherche.
    const ids = offers.map((o) => o.id).filter(Boolean);
    if (ids.length > 0) {
      await supabase
        .from("offers")
        .update({ search_id: searchId })
        .eq("user_id", user.id)
        .is("search_id", null)
        .in("id", ids);
    }

    // 5. Marque les doublons (offres déjà vues avant cette recherche).
    const duplicateIds = offers
      .filter((o) => {
        const key = dedupKeyFromResult(o);
        return key !== null && knownKeys.has(key);
      })
      .map((o) => o.id);

    // 6. Met à jour les compteurs de la recherche.
    await supabase
      .from("searches")
      .update({
        status: "done",
        result_count: offers.length,
        duplicate_count: duplicateIds.length,
      })
      .eq("id", searchId);

    return NextResponse.json({ searchId, offers, duplicateIds });
  } catch (err) {
    await supabase
      .from("searches")
      .update({ status: "error" })
      .eq("id", searchId);

    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Erreur inconnue" },
      { status: 502 }
    );
  }
}
