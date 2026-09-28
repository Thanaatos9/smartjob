import { NextResponse } from "next/server";
import { supabaseFromRequest } from "@/lib/supabase/from-request";

// Renvoie le PDF du CV de l'utilisateur pour que l'extension l'attache aux
// champs « CV » des formulaires (upload de fichier).
export async function GET(request: Request) {
  const { supabase, user } = await supabaseFromRequest(request);

  if (!user) {
    return NextResponse.json(
      { error: "Non connecté. Connecte-toi depuis l'extension." },
      { status: 401 }
    );
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name, cv_pdf_path")
    .eq("user_id", user.id)
    .maybeSingle();

  if (!profile?.cv_pdf_path) {
    return NextResponse.json(
      { error: "Aucun CV PDF dans ton profil" },
      { status: 404 }
    );
  }

  const { data: blob, error } = await supabase.storage
    .from("cvs")
    .download(profile.cv_pdf_path);

  if (error || !blob) {
    return NextResponse.json(
      { error: "Impossible de récupérer le CV" },
      { status: 502 }
    );
  }

  const base = (profile.full_name ?? "").trim().replace(/[^\p{L}\p{N} _-]/gu, "");
  const filename = `CV${base ? ` - ${base}` : ""}.pdf`;

  return new Response(await blob.arrayBuffer(), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`,
      "Cache-Control": "private, no-store",
    },
  });
}
