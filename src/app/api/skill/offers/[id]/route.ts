import { NextResponse } from "next/server";
import { skillAuth, UUID_RX } from "@/lib/skill-auth";

// GET : l'offre complète (texte brut compris), une seule lecture par candidature.
// PATCH : met à jour les champs de ciblage et de suivi écrits par le skill.

const DETAIL_FIELDS =
  "id, title, company, salary, location, contract_type, remote, skills, summary, experience_years, " +
  "sector, url, domain, raw_text, status, notes, match_score, match_reason, axis, ats_keywords, " +
  "ats_coverage, gaps, recruiter, recruiter_contact, tailored_cv_path, tailored_letter_path, " +
  "applied_at, follow_up_due, follow_up_sent_at, created_at";

const STATUSES = new Set(["found", "letter_generated", "applied", "interview", "rejected", "accepted", "abandoned"]);

type Patch = Record<string, string | number | string[] | null>;

function readPatch(body: Record<string, unknown>): Patch | string {
  const patch: Patch = {};
  const text = ["axis", "gaps", "recruiter", "recruiter_contact", "notes", "applied_at", "follow_up_due", "follow_up_sent_at"];
  for (const key of text) {
    if (!(key in body)) continue;
    const v = body[key];
    if (v !== null && typeof v !== "string") return `${key} doit être une chaîne`;
    patch[key] = v as string | null;
  }
  if ("status" in body) {
    if (typeof body.status !== "string" || !STATUSES.has(body.status)) return "statut inconnu";
    patch.status = body.status;
  }
  if ("ats_coverage" in body) {
    const n = Number(body.ats_coverage);
    if (!Number.isInteger(n) || n < 0 || n > 100) return "ats_coverage : entier de 0 à 100";
    patch.ats_coverage = n;
  }
  if ("ats_keywords" in body) {
    const v = body.ats_keywords;
    if (!Array.isArray(v) || !v.every((k) => typeof k === "string")) return "ats_keywords : liste de chaînes";
    patch.ats_keywords = v as string[];
  }
  return patch;
}

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = skillAuth(request);
  if ("error" in auth) return auth.error;
  const { id } = await params;
  if (!UUID_RX.test(id)) return NextResponse.json({ error: "id invalide" }, { status: 400 });

  const { data, error } = await auth.supabase
    .from("offers")
    .select(DETAIL_FIELDS)
    .eq("id", id)
    .eq("user_id", auth.userId)
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: "Offre introuvable" }, { status: 404 });
  return NextResponse.json(data);
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = skillAuth(request);
  if ("error" in auth) return auth.error;
  const { id } = await params;
  if (!UUID_RX.test(id)) return NextResponse.json({ error: "id invalide" }, { status: 400 });

  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Corps JSON attendu" }, { status: 400 });
  }
  const patch = readPatch(body as Record<string, unknown>);
  if (typeof patch === "string") return NextResponse.json({ error: patch }, { status: 400 });
  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: "Aucun champ modifiable fourni" }, { status: 400 });
  }

  const { data, error } = await auth.supabase
    .from("offers")
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq("id", id)
    .eq("user_id", auth.userId)
    .select("id, status, applied_at, follow_up_due")
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: "Offre introuvable" }, { status: 404 });
  return NextResponse.json(data);
}
