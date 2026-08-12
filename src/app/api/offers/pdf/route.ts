import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { triggerOfferPdfExtraction } from "@/lib/n8n/client";
import { latestOfferTimestamp, resolveCreatedOfferId } from "@/lib/offer-creation";
import { scoreOffer } from "@/lib/scoring";

// Le PDF transite en base64 vers n8n : compter ~33% d'inflation par rapport au
// fichier brut, à garder sous la limite de payload du webhook n8n.
const MAX_PDF_BYTES = 10 * 1024 * 1024;

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Non connecté" }, { status: 401 });
  }

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json({ error: "Requête invalide" }, { status: 400 });
  }

  const file = formData.get("pdf");

  if (!(file instanceof File) || file.size === 0) {
    return NextResponse.json(
      { error: "Sélectionne un fichier PDF contenant l'offre" },
      { status: 400 }
    );
  }

  // Certains navigateurs n'envoient pas de type MIME : on retombe sur l'extension.
  const looksPdf =
    file.type === "application/pdf" || /\.pdf$/i.test(file.name ?? "");
  if (!looksPdf) {
    return NextResponse.json(
      { error: "Le fichier doit être un PDF" },
      { status: 400 }
    );
  }

  if (file.size > MAX_PDF_BYTES) {
    return NextResponse.json(
      { error: "Le PDF ne doit pas dépasser 10 Mo" },
      { status: 413 }
    );
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("cv_text, full_name, phone, location, additional_skills")
    .eq("user_id", user.id)
    .maybeSingle();

  if (!profile?.cv_text) {
    return NextResponse.json(
      { error: "Renseigne d'abord ton CV dans ton profil" },
      { status: 400 }
    );
  }

  const pdfBase64 = Buffer.from(await file.arrayBuffer()).toString("base64");
  const beforeTs = await latestOfferTimestamp(supabase, user.id);

  let result: unknown;
  try {
    result = await triggerOfferPdfExtraction({
      userId: user.id,
      cvText: profile.cv_text,
      fullName: profile.full_name ?? "",
      phone: profile.phone ?? "",
      location: profile.location ?? "",
      additionalSkills: profile.additional_skills ?? "",
      pdfBase64,
      filename: file.name || "offre.pdf",
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Erreur inconnue" },
      { status: 502 }
    );
  }

  const offerId = await resolveCreatedOfferId(supabase, user.id, result, beforeTs);

  if (offerId) {
    await scoreOffer(user.id, offerId);
  }

  return NextResponse.json(result);
}
