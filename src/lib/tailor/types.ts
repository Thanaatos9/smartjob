// Profil CV structuré (profiles.cv_profile) et contenu généré pour une offre.

export type Lang = "fr" | "en";
export type I18n = { fr: string; en?: string };
export type YearMonth = [number, number];

export type CvProfile = {
  identite: {
    nom: string;
    email: string;
    telephone: string;
    telephone_intl?: string;
    ville: string;
    ville_courte?: string;
    portfolio?: string;
    linkedin?: string;
  };
  // Ordre antichronologique : c'est l'ordre d'affichage, imposé.
  experiences: {
    id: string;
    poste: I18n;
    entreprise: string;
    contrat?: I18n | null;
    debut: YearMonth;
    fin: YearMonth | null;
    faits: string[]; // seule matière autorisée pour les puces
  }[];
  formation: {
    id: string;
    titre: I18n;
    ecole?: string;
    dates: I18n;
    detail?: I18n | null;
    toujours?: boolean; // jamais coupée pour tenir sur une page
  }[];
  competences: { label: string; items: string }[];
  extras?: string[]; // soft skills, engagements, international
  axes?: {
    axe: string;
    titre: string;
    developpee: string;
    appui: string;
    ordre_competences?: string[];
    preuves?: string;
  }[];
  photo_path?: string | null; // bucket cvs
  // auto : photo sauf pays et ATS où elle dessert ; toujours ; jamais.
  photo_mode?: "auto" | "toujours" | "jamais";
};

export type TailoredContent = {
  // Lus dans l'offre, pour compléter une offre capturée depuis une page brute.
  entreprise: string;
  intitule: string;
  lieu: string;
  score: number;
  lang: Lang;
  photo: boolean;
  photo_raison: string;
  axe: string;
  titre: string;
  accroche: string;
  developpee: string;
  appui: string;
  puces: Record<string, string[]>;
  competences: { label: string; items: string }[];
  formation: string[];
  autre: string;
  mots_cles: { obligatoires: string[]; souhaites: string[]; absents: string[] };
  ecarts: string;
  recruteur: string | null;
  contact_recruteur: string | null;
  lettre: { appel: string; paragraphes: string[] };
};

export function isCvProfile(v: unknown): v is CvProfile {
  if (!v || typeof v !== "object") return false;
  const p = v as Partial<CvProfile>;
  return (
    !!p.identite &&
    typeof p.identite.nom === "string" &&
    Array.isArray(p.experiences) &&
    p.experiences.length > 0 &&
    p.experiences.every(
      (e) => typeof e?.id === "string" && typeof e?.poste?.fr === "string" && Array.isArray(e?.faits) && Array.isArray(e?.debut)
    ) &&
    Array.isArray(p.formation) &&
    Array.isArray(p.competences)
  );
}
