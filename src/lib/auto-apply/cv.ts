// Le profil peut contenir un CV par langue : `cv_*` (français) et `cv_*_en` (anglais).

export type CvLanguage = "fr" | "en";

export type ProfileCvs = {
  cv_text?: string | null;
  cv_pdf_path?: string | null;
  cv_text_en?: string | null;
  cv_pdf_path_en?: string | null;
};

export const LANGUAGE_NAMES: Record<CvLanguage, string> = {
  fr: "Français",
  en: "English",
};

// Toute valeur inconnue retombe sur le français, langue du CV principal.
export function parseLanguage(value: unknown): CvLanguage {
  return value === "en" ? "en" : "fr";
}

function candidate(profile: ProfileCvs, language: CvLanguage) {
  return language === "en"
    ? { text: profile.cv_text_en, pdfPath: profile.cv_pdf_path_en }
    : { text: profile.cv_text, pdfPath: profile.cv_pdf_path };
}

// CV à utiliser pour `wanted`. S'il n'existe pas dans cette langue, on prend
// l'autre plutôt que de bloquer : un CV dans la mauvaise langue vaut mieux que pas
// de candidature, et l'appelant peut signaler le repli via `language`.
export function pickCv(profile: ProfileCvs, wanted: CvLanguage, need: "text" | "pdf") {
  const order: CvLanguage[] = wanted === "en" ? ["en", "fr"] : ["fr", "en"];
  for (const language of order) {
    const { text, pdfPath } = candidate(profile, language);
    const ok = need === "text" ? Boolean(text?.trim()) : Boolean(pdfPath);
    if (ok) return { language, text: text ?? null, pdfPath: pdfPath ?? null };
  }
  return null;
}

export function availableCvLanguages(profile: ProfileCvs): CvLanguage[] {
  return (["fr", "en"] as const).filter((l) => Boolean(candidate(profile, l).text?.trim()));
}
