import type { SupabaseClient } from "@supabase/supabase-js";

// Retrouve l'offre d'un utilisateur à partir de l'adresse d'une page (offre ou
// formulaire de candidature) : sans paramètres, sans /apply final, sans www.

export function normalizeOfferUrl(raw: string | null | undefined) {
  if (!raw) return null;
  try {
    const u = new URL(raw);
    const path = u.pathname.replace(/\/(apply|application|candidature|candidater|postuler)\/?$/i, "").replace(/\/+$/, "");
    return `${u.hostname.replace(/^www\./, "")}${path}`.toLowerCase();
  } catch {
    return null;
  }
}

export type MatchedOffer = {
  id: string;
  url: string | null;
  tailored_cv_path: string | null;
  tailored_letter_path: string | null;
};

export async function findOfferByPageUrl(
  supabase: SupabaseClient,
  userId: string,
  pageUrl: string
): Promise<MatchedOffer | null> {
  const key = normalizeOfferUrl(pageUrl);
  if (!key) return null;
  const { data } = await supabase
    .from("offers")
    .select("id, url, tailored_cv_path, tailored_letter_path")
    .eq("user_id", userId)
    .order("updated_at", { ascending: false })
    .limit(300);
  return (data ?? []).find((o) => normalizeOfferUrl(o.url) === key) ?? null;
}
