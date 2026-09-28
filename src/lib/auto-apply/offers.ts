import type { SupabaseClient } from "@supabase/supabase-js";

export type JobInput = {
  url: string;
  title: string;
  company: string;
  location: string;
  text: string;
};

export function str(value: unknown, max: number) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

// Lit une offre envoyée par l'extension. null si l'URL n'est pas exploitable.
export function parseJob(raw: unknown): JobInput | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const url = str(o.url, 2000);
  if (!/^https?:\/\//i.test(url)) return null;
  return {
    url,
    title: str(o.title, 300),
    company: str(o.company, 200),
    location: str(o.location, 200),
    text: str(o.text, 20000),
  };
}

function hostname(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
}

// Une seule ligne `offers` par URL et par utilisateur : on réutilise l'offre
// déjà enregistrée (et sa note) plutôt que de la dupliquer à chaque passage.
export async function findOrCreateOffer(
  supabase: SupabaseClient,
  userId: string,
  job: JobInput
): Promise<
  | { ok: true; id: string; matchScore: number | null; matchReason: string | null }
  | { ok: false; error: string }
> {
  const { data: existing } = await supabase
    .from("offers")
    .select("id, match_score, match_reason, raw_text")
    .eq("user_id", userId)
    .eq("url", job.url)
    .limit(1)
    .maybeSingle();

  if (existing) {
    if (!existing.raw_text && job.text) {
      await supabase.from("offers").update({ raw_text: job.text }).eq("id", existing.id);
    }
    return {
      ok: true,
      id: existing.id,
      matchScore: existing.match_score,
      matchReason: existing.match_reason,
    };
  }

  const { data: created, error } = await supabase
    .from("offers")
    .insert({
      user_id: userId,
      title: job.title || null,
      company: job.company || null,
      location: job.location || null,
      url: job.url,
      domain: hostname(job.url),
      raw_text: job.text || null,
      status: "found",
    })
    .select("id")
    .single();

  if (error || !created) {
    return { ok: false, error: error?.message ?? "Impossible d'enregistrer l'offre" };
  }
  return { ok: true, id: created.id, matchScore: null, matchReason: null };
}
