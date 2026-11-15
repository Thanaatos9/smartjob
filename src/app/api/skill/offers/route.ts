import { NextResponse } from "next/server";
import { skillAuth } from "@/lib/skill-auth";
import { triggerOfferExtraction } from "@/lib/n8n/client";
import { scoreOffer } from "@/lib/scoring";

// GET : offres à traiter par le skill, sans leur texte (lecture légère).
//   ?status=found (défaut) · ?min_score=7 · ?limit=20
// POST { url?, text? } : crée l'offre par l'extraction n8n habituelle, la note
// (gpt-4o-mini) et renvoie { id, match_score, match_reason }.

const LIST_FIELDS =
  "id, title, company, location, contract_type, url, status, match_score, match_reason, created_at";

export async function GET(request: Request) {
  const auth = skillAuth(request);
  if ("error" in auth) return auth.error;
  const { supabase, userId } = auth;

  const params = new URL(request.url).searchParams;
  const status = params.get("status") ?? "found";
  const minScore = Number(params.get("min_score") ?? "0");
  const limit = Math.min(Math.max(Number(params.get("limit") ?? "20") || 20, 1), 100);

  let query = supabase
    .from("offers")
    .select(LIST_FIELDS)
    .eq("user_id", userId)
    .eq("status", status)
    .order("match_score", { ascending: false, nullsFirst: false })
    .limit(limit);
  if (Number.isFinite(minScore) && minScore > 0) query = query.gte("match_score", minScore);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ offers: data ?? [] });
}

export async function POST(request: Request) {
  const auth = skillAuth(request);
  if ("error" in auth) return auth.error;
  const { supabase, userId } = auth;

  const body = (await request.json().catch(() => null)) as { url?: unknown; text?: unknown } | null;
  const url = typeof body?.url === "string" ? body.url.trim() : "";
  const text = typeof body?.text === "string" ? body.text.trim() : "";
  if (!url && !text) {
    return NextResponse.json({ error: "url ou text requis" }, { status: 400 });
  }

  // Doublon : même URL déjà enregistrée.
  if (url) {
    const { data: existing } = await supabase
      .from("offers")
      .select("id, status, match_score, match_reason")
      .eq("user_id", userId)
      .eq("url", url)
      .maybeSingle();
    if (existing) return NextResponse.json({ ...existing, duplicate: true });
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("cv_text, full_name, phone, location, additional_skills")
    .eq("user_id", userId)
    .maybeSingle();
  if (!profile?.cv_text) {
    return NextResponse.json({ error: "CV absent du profil smartjob" }, { status: 400 });
  }

  const { data: prev } = await supabase
    .from("offers")
    .select("created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const beforeTs = prev?.created_at ?? null;

  let result: unknown;
  try {
    result = await triggerOfferExtraction({
      userId,
      cvText: profile.cv_text,
      fullName: profile.full_name ?? "",
      phone: profile.phone ?? "",
      location: profile.location ?? "",
      additionalSkills: profile.additional_skills ?? "",
      url: url || undefined,
      text: text || undefined,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Extraction impossible" },
      { status: 502 }
    );
  }

  let offerId: string | null = null;
  if (result && typeof result === "object" && "id" in result) {
    const id = (result as { id?: unknown }).id;
    if (typeof id === "string") offerId = id;
  }
  if (!offerId) {
    const { data: recent } = await supabase
      .from("offers")
      .select("id, url, created_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(10);
    const fresh = recent?.find((o) => !beforeTs || o.created_at > beforeTs);
    offerId = fresh?.id ?? recent?.find((o) => url && o.url === url)?.id ?? null;
  }
  if (!offerId) {
    return NextResponse.json({ error: "Offre extraite mais introuvable" }, { status: 502 });
  }

  await scoreOffer(userId, offerId);
  const { data: scored } = await supabase
    .from("offers")
    .select("id, title, company, match_score, match_reason")
    .eq("id", offerId)
    .maybeSingle();

  return NextResponse.json(scored ?? { id: offerId });
}
