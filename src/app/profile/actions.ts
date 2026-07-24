"use server";

import { revalidatePath } from "next/cache";
// Import direct du lib interne : l'index.js de pdf-parse exécute un bloc debug
// au chargement (lit un PDF de test) qui plante en environnement bundlé (ENOENT).
import pdfParse from "pdf-parse/lib/pdf-parse.js";
import { createClient } from "@/lib/supabase/server";

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
    updated_at: new Date().toISOString(),
  };

  const cvFile = formData.get("cvFile") as File | null;
  if (cvFile && cvFile.size > 0) {
    if (cvFile.type !== "application/pdf") {
      return { error: "Le CV doit être un fichier PDF" };
    }

    const buffer = Buffer.from(await cvFile.arrayBuffer());

    let cvText: string;
    try {
      const result = await pdfParse(buffer);
      cvText = result.text;
    } catch {
      return { error: "Impossible de lire le contenu du PDF" };
    }

    const cvPath = `${user.id}/cv.pdf`;
    const { error: uploadError } = await supabase.storage
      .from("cvs")
      .upload(cvPath, buffer, { contentType: "application/pdf", upsert: true });

    if (uploadError) {
      return { error: uploadError.message };
    }

    profileUpdate.cv_text = cvText;
    profileUpdate.cv_pdf_path = cvPath;
  }

  const { error } = await supabase.from("profiles").upsert(profileUpdate);

  if (error) {
    return { error: error.message };
  }

  revalidatePath("/profile");
  return { success: true };
}
