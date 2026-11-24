import { NextResponse, after } from "next/server";
import { skillAuth } from "@/lib/skill-auth";
import { runVeille, startVeilleRun } from "@/lib/veille/run";
import { loadVeillePrefs, normalizeVeillePrefs } from "@/lib/veille/prefs";
import { imapConfigured } from "@/lib/veille/imap";

// Veille quotidienne des offres. Jeton du skill (SKILL_API_TOKEN).
//   POST  : lance un passage (réponse immédiate, travail en arrière-plan).
//           Appelé chaque matin par n8n, ou à la demande par le skill.
//   GET   : récap du dernier passage, offres prêtes à envoyer, réglages.
//           ?run=<id> pour un passage précis.
//   PATCH : met à jour les réglages (roles, contracts, exclude_keywords, min_score, max_per_run).

export const maxDuration = 3600;

export async function POST(request: Request) {
  const auth = skillAuth(request);
  if ("error" in auth) return auth.error;
  const { supabase, userId } = auth;

  const { alreadyRunning, runId } = await startVeilleRun(supabase, userId);
  if (alreadyRunning) return NextResponse.json({ runId, status: "running", alreadyRunning: true }, { status: 409 });

  after(() => runVeille(supabase, userId, runId));
  return NextResponse.json({ runId, status: "running" }, { status: 202 });
}

const RUN_FIELDS =
  "id, status, started_at, finished_at, emails_read, links_found, queued, processed, created, ready, rejected, duplicates, errors";

export async function GET(request: Request) {
  const auth = skillAuth(request);
  if ("error" in auth) return auth.error;
  const { supabase, userId } = auth;

  const runParam = new URL(request.url).searchParams.get("run");
  let runQuery = supabase.from("veille_runs").select(RUN_FIELDS).eq("user_id", userId);
  runQuery = runParam ? runQuery.eq("id", runParam) : runQuery.order("started_at", { ascending: false });
  const { data: run } = await runQuery.limit(1).maybeSingle();

  const [{ data: offers }, { count: queued }, prefs] = await Promise.all([
    run
      ? supabase
          .from("offers")
          .select("id, title, company, location, contract_type, source, url, status, match_score, fit_score, ats_coverage, axis, tailored_cv_path, notes")
          .eq("user_id", userId)
          .eq("veille_run_id", run.id)
          .neq("status", "abandoned")
          .order("fit_score", { ascending: false, nullsFirst: false })
      : Promise.resolve({ data: [] }),
    supabase.from("veille_seen").select("url_key", { count: "exact", head: true }).eq("user_id", userId).eq("status", "queued"),
    loadVeillePrefs(supabase, userId),
  ]);

  return NextResponse.json({
    imap: imapConfigured(),
    run,
    waiting_in_queue: queued ?? 0,
    offers: (offers ?? []).map((o) => ({ ...o, ready: Boolean(o.tailored_cv_path), tailored_cv_path: undefined })),
    prefs,
  });
}

export async function PATCH(request: Request) {
  const auth = skillAuth(request);
  if ("error" in auth) return auth.error;
  const { supabase, userId } = auth;

  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object") return NextResponse.json({ error: "JSON attendu" }, { status: 400 });

  const current = await loadVeillePrefs(supabase, userId);
  const prefs = normalizeVeillePrefs({ ...current, ...body });
  const { error } = await supabase.from("profiles").update({ veille_prefs: prefs }).eq("user_id", userId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ prefs });
}
