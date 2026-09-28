import { NextResponse } from "next/server";
import { supabaseFromRequest } from "@/lib/supabase/from-request";
import { parseLanguage, pickCv } from "@/lib/auto-apply/cv";

// Renvoie le PDF du CV de l'utilisateur pour que l'extension l'attache aux
// champs « CV » des formulaires (upload de fichier). `?lang=fr|en` choisit la
// langue ; sans CV dans cette langue, on renvoie l'autre plutôt que rien.
export async function GET(request: Request) {
  const { supabase, user } = await supabaseFromRequest(request);

  if (!user) {
    return NextResponse.json(
      { error: "Non connecté. Connecte-toi depuis l'extension." },
      { status: 401 }
    );
  }

  const language = parseLanguage(new URL(request.url).searchParams.get("lang"));

  // "*" : tolère un déploiement qui précède la migration du CV anglais.
  const { data: profile } = await supabase
    .from("profiles")
    .select("*")
    .eq("user_id", user.id)
    .maybeSingle();

  const cv = profile ? pickCv(profile, language, "pdf") : null;
  if (!profile || !cv?.pdfPath) {
    return NextResponse.json(
      { error: "Aucun CV PDF dans ton profil" },
      { status: 404 }
    );
  }

  const { data: blob, error } = await supabase.storage
    .from("cvs")
    .download(cv.pdfPath);

  if (error || !blob) {
    return NextResponse.json(
      { error: "Impossible de récupérer le CV" },
      { status: 502 }
    );
  }

  const base = (profile.full_name ?? "").trim().replace(/[^\p{L}\p{N} _-]/gu, "");
  const prefix = cv.language === "en" ? "Resume" : "CV";
  const filename = `${prefix}${base ? ` - ${base}` : ""}.pdf`;

  return new Response(await blob.arrayBuffer(), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`,
      "X-Cv-Language": cv.language,
      "Cache-Control": "private, no-store",
    },
  });
}
