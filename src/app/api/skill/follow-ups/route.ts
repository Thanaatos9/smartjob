import { NextResponse } from "next/server";
import { skillAuth } from "@/lib/skill-auth";

// Relances dues : candidatures envoyées, date de relance atteinte, pas encore relancées.
export async function GET(request: Request) {
  const auth = skillAuth(request);
  if ("error" in auth) return auth.error;

  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Paris" }).format(new Date());
  const { data, error } = await auth.supabase
    .from("offers")
    .select("id, title, company, url, recruiter, recruiter_contact, axis, applied_at, follow_up_due, summary")
    .eq("user_id", auth.userId)
    .eq("status", "applied")
    .is("follow_up_sent_at", null)
    .lte("follow_up_due", today)
    .order("follow_up_due", { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ today, follow_ups: data ?? [] });
}
