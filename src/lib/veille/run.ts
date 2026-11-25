import type { SupabaseClient } from "@supabase/supabase-js";
import { triggerOfferExtraction } from "@/lib/n8n/client";
import { scoreOffer } from "@/lib/scoring";
import { tailorOffer } from "@/lib/tailor";
import { offerDedupKey } from "@/lib/searches";
import { processAlertEmails, imapConfigured } from "./imap";
import { canonicalJob, jobLinksFromEmail, resolveRedirect, type JobLink } from "./links";
import { hasExcludedWord, loadVeillePrefs, normalizeContract, type VeillePrefs } from "./prefs";

// Un passage de veille :
//  1. lecture des alertes non lues → liens d'offres canoniques → file veille_seen
//     (une offre déjà vue, en file ou déjà suivie dans offers n'y entre pas) ;
//  2. traitement de la file : extraction (workflow n8n job-offer-app), filtre du
//     contrat, doublon entreprise + intitulé, pré-score, CV et lettre adaptés.
// Tout est best-effort : une offre en échec n'arrête jamais le passage.

type Counters = {
  emails_read: number;
  links_found: number;
  queued: number;
  processed: number;
  created: number;
  ready: number;
  rejected: number;
  duplicates: number;
};

type Outcome = "created" | "ready" | "low_score" | "low_fit" | "contract" | "excluded" | "duplicate" | "unreadable" | "error";

const CONCURRENCY = 3;

export async function startVeilleRun(supabase: SupabaseClient, userId: string) {
  // Un seul passage à la fois (un passage bloqué depuis plus de 2 h est ignoré).
  const since = new Date(Date.now() - 2 * 3600 * 1000).toISOString();
  const { data: running } = await supabase
    .from("veille_runs")
    .select("id, started_at")
    .eq("user_id", userId)
    .eq("status", "running")
    .gte("started_at", since)
    .limit(1)
    .maybeSingle();
  if (running) return { alreadyRunning: true as const, runId: running.id as string };

  const { data, error } = await supabase.from("veille_runs").insert({ user_id: userId }).select("id").single();
  if (error || !data) throw new Error(error?.message ?? "Impossible de créer le passage de veille");
  return { alreadyRunning: false as const, runId: data.id as string };
}

export async function runVeille(supabase: SupabaseClient, userId: string, runId: string) {
  const counters: Counters = { emails_read: 0, links_found: 0, queued: 0, processed: 0, created: 0, ready: 0, rejected: 0, duplicates: 0 };
  const errors: string[] = [];
  const save = (extra: Record<string, unknown> = {}) =>
    supabase.from("veille_runs").update({ ...counters, errors: errors.slice(0, 50), ...extra }).eq("id", runId);

  try {
    const prefs = await loadVeillePrefs(supabase, userId);
    const known = await knownKeys(supabase, userId);

    // 1. Alertes email → file d'attente.
    if (imapConfigured()) {
      try {
        counters.emails_read = await processAlertEmails(async (mail) => {
          const links = await jobLinksFromEmail(mail.html, mail.text, resolveRedirect);
          counters.links_found += links.length;
          const fresh = links.filter((l) => !known.has(l.key));
          if (fresh.length) {
            const { data } = await supabase
              .from("veille_seen")
              .upsert(
                fresh.map((l) => ({ user_id: userId, url_key: l.key, source: l.source, url: l.url, hint: l.hint, context: l.context, run_id: runId })),
                { onConflict: "user_id,url_key", ignoreDuplicates: true }
              )
              .select("url_key");
            counters.queued += data?.length ?? 0;
            for (const l of fresh) known.add(l.key);
          }
          return links.length > 0;
        });
      } catch (err) {
        errors.push(`IMAP : ${err instanceof Error ? err.message : String(err)}`);
      }
    } else {
      errors.push("IMAP non configuré (VEILLE_IMAP_HOST, VEILLE_IMAP_USER, VEILLE_IMAP_PASSWORD)");
    }
    await save();

    // 2. Traitement de la file, du plus ancien au plus récent.
    const { data: queue } = await supabase
      .from("veille_seen")
      .select("url_key, source, url, hint, context")
      .eq("user_id", userId)
      .eq("status", "queued")
      .order("created_at", { ascending: true })
      .limit(prefs.max_per_run);

    const profile = await loadExtractionProfile(supabase, userId);
    const items: JobLink[] = (queue ?? []).map((q) => ({ key: q.url_key, source: q.source, url: q.url, hint: q.hint, context: q.context }));
    let cursor = 0;
    const worker = async () => {
      while (cursor < items.length) {
        const item = items[cursor++];
        let outcome: Outcome = "error";
        let offerId: string | null = null;
        try {
          ({ outcome, offerId } = await processLink(supabase, userId, runId, item, prefs, profile));
        } catch (err) {
          errors.push(`${item.key} : ${err instanceof Error ? err.message : String(err)}`);
        }
        counters.processed++;
        if (outcome === "ready") counters.ready++;
        if (offerId && outcome !== "duplicate") counters.created++;
        if (["low_score", "low_fit", "contract", "excluded"].includes(outcome)) counters.rejected++;
        if (outcome === "duplicate") counters.duplicates++;
        await supabase
          .from("veille_seen")
          .update({ status: "done", outcome, offer_id: offerId, run_id: runId, processed_at: new Date().toISOString() })
          .eq("user_id", userId)
          .eq("url_key", item.key);
        await save();
      }
    };
    await Promise.all(Array.from({ length: CONCURRENCY }, worker));

    await save({ status: "done", finished_at: new Date().toISOString() });
  } catch (err) {
    errors.push(err instanceof Error ? err.message : String(err));
    await save({ status: "error", finished_at: new Date().toISOString() });
  }
}

/** Clés canoniques déjà connues : file de veille + offres déjà suivies. */
async function knownKeys(supabase: SupabaseClient, userId: string) {
  const keys = new Set<string>();
  const [{ data: seen }, { data: offers }] = await Promise.all([
    supabase.from("veille_seen").select("url_key").eq("user_id", userId),
    supabase.from("offers").select("url").eq("user_id", userId).not("url", "is", null),
  ]);
  for (const s of seen ?? []) keys.add(s.url_key);
  for (const o of offers ?? []) {
    const job = canonicalJob(o.url);
    if (job) keys.add(job.key);
  }
  return keys;
}

type ExtractionProfile = { cvText: string; fullName: string; phone: string; location: string; additionalSkills: string };

async function loadExtractionProfile(supabase: SupabaseClient, userId: string): Promise<ExtractionProfile> {
  const { data } = await supabase
    .from("profiles")
    .select("cv_text, full_name, phone, location, additional_skills")
    .eq("user_id", userId)
    .maybeSingle();
  return {
    cvText: data?.cv_text ?? "",
    fullName: data?.full_name ?? "",
    phone: data?.phone ?? "",
    location: data?.location ?? "",
    additionalSkills: data?.additional_skills ?? "",
  };
}

async function processLink(
  supabase: SupabaseClient,
  userId: string,
  runId: string,
  item: JobLink,
  prefs: VeillePrefs,
  profile: ExtractionProfile
): Promise<{ outcome: Outcome; offerId: string | null }> {
  // a. Intitulé lu dans l'alerte : un mot exclu (stage, alternance…) suffit à écarter.
  if (hasExcludedWord(item.hint, prefs.exclude_keywords)) return { outcome: "excluded", offerId: null };

  // b. Extraction par le workflow n8n habituel (il écrit l'offre dans Supabase).
  //    Indeed bloque la lecture de ses pages depuis un serveur : on lui donne
  //    directement le texte de l'alerte. Ailleurs, la page d'abord, l'alerte ensuite.
  const extract = async (text?: string) => {
    try {
      const result = (await triggerOfferExtraction({ userId, ...profile, url: item.url, text })) as { id?: unknown } | null;
      return result && typeof result.id === "string" ? result.id : null;
    } catch {
      return null;
    }
  };
  const alertText = item.context ? `${item.context}\n\nLien de l'offre : ${item.url}` : undefined;
  let offerId: string | null = null;
  if (item.source !== "indeed" || !alertText) offerId = await extract();
  if (!offerId && alertText) offerId = await extract(alertText);
  if (!offerId) {
    const { data: byUrl } = await supabase
      .from("offers")
      .select("id")
      .eq("user_id", userId)
      .eq("url", item.url)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    offerId = byUrl?.id ?? null;
  }

  // Page illisible depuis le serveur (connexion requise, protection anti-robot) :
  // l'offre est gardée avec son intitulé, le texte sera capturé par l'extension.
  if (!offerId) {
    const { data: stub } = await supabase
      .from("offers")
      .insert({
        user_id: userId,
        title: item.hint ?? "Offre à capturer avec l'extension",
        url: item.url,
        domain: new URL(item.url).hostname.replace(/^www\./, ""),
        status: "found",
        source: item.source,
        veille_run_id: runId,
        notes: "Veille : texte de l'offre illisible depuis le serveur. Ouvre l'offre avec l'extension pour la capturer.",
      })
      .select("id")
      .single();
    return { outcome: "unreadable", offerId: stub?.id ?? null };
  }

  await supabase.from("offers").update({ source: item.source, veille_run_id: runId }).eq("id", offerId).eq("user_id", userId);

  const { data: offer } = await supabase
    .from("offers")
    .select("id, title, company, contract_type")
    .eq("id", offerId)
    .eq("user_id", userId)
    .maybeSingle();
  if (!offer) return { outcome: "error", offerId: null };

  // c. Contrat : seuls les contrats acceptés passent (un contrat inconnu est gardé).
  const contract = normalizeContract(offer.contract_type);
  const excludedWord = hasExcludedWord(offer.title, prefs.exclude_keywords);
  if ((contract && !prefs.contracts.includes(contract)) || excludedWord) {
    await supabase.from("offers").delete().eq("id", offerId).eq("user_id", userId);
    return { outcome: excludedWord ? "excluded" : "contract", offerId: null };
  }

  // d. Même offre déjà suivie sous une autre URL (autre plateforme) : on garde l'ancienne.
  const key = offerDedupKey({ title: offer.title, company: offer.company });
  if (key && offer.company) {
    const { data: twins } = await supabase
      .from("offers")
      .select("id, title, company")
      .eq("user_id", userId)
      .neq("id", offerId)
      .ilike("company", offer.company);
    const twin = (twins ?? []).find((t) => offerDedupKey({ title: t.title, company: t.company }) === key);
    if (twin) {
      await supabase.from("offers").delete().eq("id", offerId).eq("user_id", userId);
      return { outcome: "duplicate", offerId: twin.id };
    }
  }

  // e. Pré-score (0-10), puis CV et lettre adaptés au-dessus du seuil.
  await scoreOffer(userId, offerId);
  const { data: scored } = await supabase.from("offers").select("match_score").eq("id", offerId).maybeSingle();
  const score = scored?.match_score as number | null | undefined;
  if (typeof score === "number" && score < prefs.min_score) {
    await supabase
      .from("offers")
      .update({ status: "abandoned", notes: `Veille : pré-score ${score}/10, sous le seuil de ${prefs.min_score}.` })
      .eq("id", offerId)
      .eq("user_id", userId);
    return { outcome: "low_score", offerId };
  }

  const tailored = await tailorOffer(supabase, userId, offerId);
  if (tailored.status === "ready") return { outcome: "ready", offerId };
  if (tailored.status === "low_fit") {
    await supabase
      .from("offers")
      .update({ status: "abandoned", notes: `Veille : adéquation ${tailored.fitScore}/100, sous le seuil de 70. ${tailored.gaps ?? ""}`.trim() })
      .eq("id", offerId)
      .eq("user_id", userId);
    return { outcome: "low_fit", offerId };
  }
  return { outcome: "created", offerId };
}
