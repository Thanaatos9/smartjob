import { NextResponse } from "next/server";
import { supabaseFromRequest } from "@/lib/supabase/from-request";
import { countSubmittedLast24h, loadPreferences } from "@/lib/auto-apply/preferences";

// Contexte dont l'extension a besoin pour remplir les formulaires : identité,
// préférences et quota restant. Récupéré une fois au démarrage d'un run.

function splitName(fullName: string) {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  if (parts.length <= 1) return { firstName: parts[0] ?? "", lastName: "" };
  return { firstName: parts[0], lastName: parts.slice(1).join(" ") };
}

export async function GET(request: Request) {
  const { supabase, user } = await supabaseFromRequest(request);

  if (!user) {
    return NextResponse.json(
      { error: "Non connecté. Connecte-toi depuis l'extension." },
      { status: 401 }
    );
  }

  const [{ data: profile }, preferences, used] = await Promise.all([
    supabase
      .from("profiles")
      .select("full_name, phone, location, cv_text, cv_pdf_path, portfolio_url")
      .eq("user_id", user.id)
      .maybeSingle(),
    loadPreferences(supabase, user.id),
    countSubmittedLast24h(supabase, user.id),
  ]);

  const fullName = profile?.full_name?.trim() ?? "";

  return NextResponse.json({
    profile: {
      fullName,
      ...splitName(fullName),
      email: user.email ?? "",
      phone: profile?.phone?.trim() ?? "",
      location: profile?.location?.trim() ?? "",
      portfolioUrl: profile?.portfolio_url?.trim() ?? "",
      hasCv: Boolean(profile?.cv_text),
      hasCvPdf: Boolean(profile?.cv_pdf_path),
    },
    preferences,
    usage: {
      used24h: used,
      remaining: Math.max(0, preferences.daily_limit - used),
    },
  });
}
