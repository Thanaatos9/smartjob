import type { SupabaseClient } from "@supabase/supabase-js";

export type ApplyMode = "semi" | "auto";

export type ApplyPreferences = {
  mode: ApplyMode;
  min_score: number;
  daily_limit: number;
  blacklist: string[];
  accept_consents: boolean;
  linkedin_url: string;
  github_url: string;
  salary_expectation: string;
  notice_period: string;
  availability: string;
  work_authorization: string;
  needs_sponsorship: string;
  notes: string;
};

export const DEFAULT_PREFERENCES: ApplyPreferences = {
  mode: "semi",
  min_score: 6,
  daily_limit: 25,
  blacklist: [],
  accept_consents: false,
  linkedin_url: "",
  github_url: "",
  salary_expectation: "",
  notice_period: "",
  availability: "",
  work_authorization: "",
  needs_sponsorship: "",
  notes: "",
};

export const PREFERENCE_COLUMNS = Object.keys(DEFAULT_PREFERENCES).join(", ");

export function normalizePreferences(
  row: Partial<Record<keyof ApplyPreferences, unknown>> | null,
): ApplyPreferences {
  if (!row) return { ...DEFAULT_PREFERENCES };
  const text = (v: unknown) => (typeof v === "string" ? v : "");
  return {
    mode: row.mode === "auto" ? "auto" : "semi",
    min_score: typeof row.min_score === "number" ? row.min_score : DEFAULT_PREFERENCES.min_score,
    daily_limit:
      typeof row.daily_limit === "number" ? row.daily_limit : DEFAULT_PREFERENCES.daily_limit,
    blacklist: Array.isArray(row.blacklist)
      ? row.blacklist.filter((b): b is string => typeof b === "string")
      : [],
    accept_consents: row.accept_consents === true,
    linkedin_url: text(row.linkedin_url),
    github_url: text(row.github_url),
    salary_expectation: text(row.salary_expectation),
    notice_period: text(row.notice_period),
    availability: text(row.availability),
    work_authorization: text(row.work_authorization),
    needs_sponsorship: text(row.needs_sponsorship),
    notes: text(row.notes),
  };
}

export async function loadPreferences(supabase: SupabaseClient, userId: string) {
  const { data } = await supabase
    .from("apply_preferences")
    .select(PREFERENCE_COLUMNS)
    .eq("user_id", userId)
    .maybeSingle();
  return normalizePreferences(data as unknown as Record<string, unknown> | null);
}

// Plafond glissant sur 24 h : évite les problèmes de fuseau horaire d'un
// « plafond par jour » et colle mieux à la façon dont les sites limitent.
export async function countSubmittedLast24h(supabase: SupabaseClient, userId: string) {
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { count } = await supabase
    .from("auto_applications")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("status", "submitted")
    .gte("updated_at", since);
  return count ?? 0;
}

export function isBlacklisted(company: string | null | undefined, blacklist: string[]) {
  const name = (company ?? "").toLowerCase().trim();
  if (!name) return false;
  return blacklist.some((entry) => {
    const b = entry.toLowerCase().trim();
    return b !== "" && name.includes(b);
  });
}
