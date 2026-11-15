import type { SupabaseClient } from "@supabase/supabase-js";

// CV et lettre adaptés à une offre (skill « postuler »), rangés dans le bucket
// `cvs` sous <user>/offers/<offre>/cv.pdf | letter.pdf. Partagé entre l'API du
// skill (jeton) et la fiche offre du site (dépôt manuel).

const MAX_BYTES = 3 * 1024 * 1024;
const KINDS = [
  ["cv", "tailored_cv_path"],
  ["letter", "tailored_letter_path"],
] as const;

export async function storeTailoredDocs(
  supabase: SupabaseClient,
  userId: string,
  offerId: string,
  form: FormData
): Promise<{ ok: true; update: Record<string, string> } | { ok: false; status: number; error: string }> {
  const { data: offer } = await supabase
    .from("offers")
    .select("id")
    .eq("id", offerId)
    .eq("user_id", userId)
    .maybeSingle();
  if (!offer) return { ok: false, status: 404, error: "Offre introuvable" };

  const update: Record<string, string> = {};
  for (const [field, column] of KINDS) {
    const file = form.get(field);
    if (!(file instanceof File) || file.size === 0) continue;
    if (file.size > MAX_BYTES) return { ok: false, status: 413, error: `${field} : 3 Mo maximum` };
    const bytes = new Uint8Array(await file.arrayBuffer());
    if (String.fromCharCode(...bytes.subarray(0, 5)) !== "%PDF-") {
      return { ok: false, status: 400, error: `${field} : PDF attendu` };
    }
    const path = `${userId}/offers/${offerId}/${field}.pdf`;
    const { error } = await supabase.storage
      .from("cvs")
      .upload(path, bytes, { contentType: "application/pdf", upsert: true });
    if (error) return { ok: false, status: 502, error: `${field} : ${error.message}` };
    update[column] = path;
  }

  if (Object.keys(update).length === 0) {
    return { ok: false, status: 400, error: "Aucun fichier cv ou letter" };
  }

  await supabase
    .from("offers")
    .update({ ...update, updated_at: new Date().toISOString() })
    .eq("id", offerId)
    .eq("user_id", userId);

  return { ok: true, update };
}
