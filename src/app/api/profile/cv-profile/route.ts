import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isCvProfile } from "@/lib/tailor/types";

// Profil CV structuré (JSON) et photo du CV, depuis la page Profil.
// multipart : cvProfile (texte JSON, facultatif), photo (JPEG ou PNG, facultatif),
// photoMode (auto | toujours | jamais, facultatif).

const MAX_PHOTO = 2 * 1024 * 1024;

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Non connecté" }, { status: 401 });

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ error: "Requête invalide" }, { status: 400 });
  }

  const { data: current } = await supabase.from("profiles").select("cv_profile").eq("user_id", user.id).maybeSingle();
  let profile: Record<string, unknown> | null = isCvProfile(current?.cv_profile) ? current.cv_profile : null;

  const rawJson = form.get("cvProfile");
  if (typeof rawJson === "string" && rawJson.trim()) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(rawJson);
    } catch {
      return NextResponse.json({ error: "JSON invalide" }, { status: 400 });
    }
    if (!isCvProfile(parsed)) {
      return NextResponse.json(
        { error: "Il manque identite, experiences (avec id, poste, debut, faits), formation ou competences" },
        { status: 400 }
      );
    }
    // La photo déjà déposée est conservée si le JSON collé n'en parle pas.
    const p = parsed as { photo_path?: string; photo_mode?: string };
    profile = {
      ...parsed,
      photo_path: p.photo_path ?? profile?.photo_path ?? null,
      photo_mode: p.photo_mode ?? profile?.photo_mode ?? "auto",
    };
  }

  const photo = form.get("photo");
  if (photo instanceof File && photo.size > 0) {
    if (!profile) return NextResponse.json({ error: "Enregistre d'abord le profil CV structuré" }, { status: 400 });
    if (photo.size > MAX_PHOTO) return NextResponse.json({ error: "Photo : 2 Mo maximum" }, { status: 413 });
    const bytes = new Uint8Array(await photo.arrayBuffer());
    const isJpeg = bytes[0] === 0xff && bytes[1] === 0xd8;
    const isPng = bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47;
    if (!isJpeg && !isPng) return NextResponse.json({ error: "Photo : JPEG ou PNG attendu" }, { status: 400 });
    const path = `${user.id}/photo.${isPng ? "png" : "jpg"}`;
    const { error } = await supabase.storage
      .from("cvs")
      .upload(path, bytes, { contentType: isPng ? "image/png" : "image/jpeg", upsert: true });
    if (error) return NextResponse.json({ error: error.message }, { status: 502 });
    profile = { ...profile, photo_path: path };
  }

  const mode = form.get("photoMode");
  if (profile && (mode === "auto" || mode === "toujours" || mode === "jamais")) {
    profile = { ...profile, photo_mode: mode };
  }

  if (!profile) return NextResponse.json({ error: "Rien à enregistrer" }, { status: 400 });

  const { error } = await supabase
    .from("profiles")
    .upsert({ user_id: user.id, cv_profile: profile, updated_at: new Date().toISOString() }, { onConflict: "user_id" });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true, photo: !!profile.photo_path });
}
