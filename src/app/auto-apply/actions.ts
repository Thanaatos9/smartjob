"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { matchOption } from "@/lib/auto-apply/questions";

function text(formData: FormData, name: string, max: number) {
  const value = formData.get(name);
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function boundedInt(formData: FormData, name: string, min: number, max: number, fallback: number) {
  const value = Number.parseInt(String(formData.get(name) ?? ""), 10);
  if (!Number.isFinite(value)) return fallback;
  return Math.max(min, Math.min(max, value));
}

export async function savePreferences(_prevState: unknown, formData: FormData) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return { error: "Non connecté" };
  }

  const blacklist = [
    ...new Set(
      text(formData, "blacklist", 5000)
        .split(/[\n,;]+/)
        .map((entry) => entry.trim())
        .filter(Boolean)
    ),
  ].slice(0, 200);

  const { error } = await supabase.from("apply_preferences").upsert({
    user_id: user.id,
    mode: formData.get("mode") === "auto" ? "auto" : "semi",
    min_score: boundedInt(formData, "minScore", 0, 10, 6),
    daily_limit: boundedInt(formData, "dailyLimit", 1, 100, 25),
    blacklist,
    accept_consents: formData.get("acceptConsents") === "on",
    linkedin_url: text(formData, "linkedinUrl", 300),
    github_url: text(formData, "githubUrl", 300),
    salary_expectation: text(formData, "salaryExpectation", 200),
    notice_period: text(formData, "noticePeriod", 200),
    availability: text(formData, "availability", 200),
    work_authorization: text(formData, "workAuthorization", 300),
    needs_sponsorship: text(formData, "needsSponsorship", 200),
    notes: text(formData, "notes", 2000),
    updated_at: new Date().toISOString(),
  });

  if (error) {
    return { error: error.message };
  }

  revalidatePath("/auto-apply");
  return { success: true };
}

export async function saveAnswer(_prevState: unknown, formData: FormData) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return { error: "Non connecté" };
  }

  const id = text(formData, "id", 64);
  const answer = text(formData, "answer", 2000);
  if (!id || !answer) {
    return { error: "Réponse vide" };
  }

  const { data: row } = await supabase
    .from("answer_bank")
    .select("options")
    .eq("id", id)
    .eq("user_id", user.id)
    .maybeSingle();

  if (!row) {
    return { error: "Réponse introuvable" };
  }

  // Une question à choix doit garder une réponse parmi ses options.
  const options = (row.options ?? []) as string[];
  let value = answer;
  if (options.length > 0) {
    const matched = matchOption(answer, options);
    if (!matched) {
      return { error: `Choisis parmi : ${options.join(" / ")}` };
    }
    value = matched;
  }

  const { error } = await supabase
    .from("answer_bank")
    .update({ answer: value, source: "user", updated_at: new Date().toISOString() })
    .eq("id", id)
    .eq("user_id", user.id);

  if (error) {
    return { error: error.message };
  }

  revalidatePath("/auto-apply");
  return { success: true };
}

export async function deleteAnswer(formData: FormData) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;

  const id = text(formData, "id", 64);
  if (!id) return;

  await supabase.from("answer_bank").delete().eq("id", id).eq("user_id", user.id);
  revalidatePath("/auto-apply");
}
