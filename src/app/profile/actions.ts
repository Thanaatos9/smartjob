"use server";

import { revalidatePath } from "next/cache";
// Import direct du lib interne : l'index.js de pdf-parse exécute un bloc debug
// au chargement (lit un PDF de test) qui plante en environnement bundlé (ENOENT).
import pdfParse from "pdf-parse/lib/pdf-parse.js";
import { createClient } from "@/lib/supabase/server";
import { triggerPortfolioFetch } from "@/lib/n8n/client";

const MAX_CV_BYTES = 10 * 1024 * 1024;

// Lit un CV déposé (PDF), en extrait le texte et le range dans le stockage.
async function storeCv(
  supabase: Awaited<ReturnType<typeof createClient>>,
  file: File,
  storagePath: string
): Promise<{ error: string } | { text: string; path: string }> {
  if (file.type !== "application/pdf") {
    return { error: "Le CV doit être un fichier PDF" };
  }
  if (file.size > MAX_CV_BYTES) {
    return { error: "Le CV dépasse 10 Mo" };
  }

  const buffer = Buffer.from(await file.arrayBuffer());

  let text: string;
  try {
    const result = await pdfParse(buffer);
    text = result.text;
  } catch {
    return { error: "Impossible de lire le contenu du PDF" };
  }

  const { error } = await supabase.storage
    .from("cvs")
    .upload(storagePath, buffer, { contentType: "application/pdf", upsert: true });

  if (error) {
    return { error: error.message };
  }
  return { text, path: storagePath };
}

export async function updateProfile(_prevState: unknown, formData: FormData) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return { error: "Non connecté" };
  }

  const profileUpdate: Record<string, unknown> = {
    user_id: user.id,
    full_name: formData.get("fullName") as string,
    phone: formData.get("phone") as string,
    location: formData.get("location") as string,
    additional_skills: formData.get("additionalSkills") as string,
    portfolio_url: formData.get("portfolioUrl") as string,
    updated_at: new Date().toISOString(),
  };

  // Un CV par langue : le principal (français) et l'anglais. Chaque dépôt
  // remplace le précédent de sa langue, sans toucher à l'autre.
  const cvFile = formData.get("cvFile") as File | null;
  if (cvFile && cvFile.size > 0) {
    const stored = await storeCv(supabase, cvFile, `${user.id}/cv.pdf`);
    if ("error" in stored) return { error: `CV français : ${stored.error}` };
    profileUpdate.cv_text = stored.text;
    profileUpdate.cv_pdf_path = stored.path;
  }

  const cvFileEn = formData.get("cvFileEn") as File | null;
  if (cvFileEn && cvFileEn.size > 0) {
    const stored = await storeCv(supabase, cvFileEn, `${user.id}/cv-en.pdf`);
    if ("error" in stored) return { error: `CV anglais : ${stored.error}` };
    profileUpdate.cv_text_en = stored.text;
    profileUpdate.cv_pdf_path_en = stored.path;
  }

  const { error } = await supabase.from("profiles").upsert(profileUpdate);

  if (error) {
    return { error: error.message };
  }

  revalidatePath("/profile");
  return { success: true };
}

export async function fetchPortfolio(_prevState: unknown, formData: FormData) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return { error: "Non connecté" };
  }

  const portfolioUrl = formData.get("portfolioUrl") as string;
  if (!portfolioUrl) {
    return { error: "Renseigne d'abord l'URL de ton portfolio" };
  }

  let text: string;
  try {
    const result = await triggerPortfolioFetch({ userId: user.id, portfolioUrl });
    text = result.text;
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Erreur inconnue" };
  }

  const { error } = await supabase.from("profiles").upsert({
    user_id: user.id,
    portfolio_url: portfolioUrl,
    portfolio_text: text,
    portfolio_fetched_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  });

  if (error) {
    return { error: error.message };
  }

  revalidatePath("/profile");
  return { success: true };
}
