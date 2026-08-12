import type { createClient } from "@/lib/supabase/server";

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

// Les workflows n8n d'extraction (URL/texte et PDF) créent l'offre eux-mêmes
// dans Supabase, mais ne renvoient pas toujours son id. On repère donc l'offre
// la plus récente AVANT l'extraction pour identifier celle qui vient d'apparaître.

export async function latestOfferTimestamp(
  supabase: SupabaseServerClient,
  userId: string
): Promise<string | null> {
  const { data } = await supabase
    .from("offers")
    .select("id, created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  return data?.created_at ?? null;
}

export async function resolveCreatedOfferId(
  supabase: SupabaseServerClient,
  userId: string,
  result: unknown,
  beforeTs: string | null
): Promise<string | null> {
  if (result && typeof result === "object" && "id" in result) {
    const id = (result as { id?: unknown }).id;
    if (typeof id === "string") return id;
  }

  const { data: recent } = await supabase
    .from("offers")
    .select("id, created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(1);

  const fresh = recent?.[0];
  if (fresh && (!beforeTs || fresh.created_at > beforeTs)) {
    return fresh.id;
  }

  return null;
}
