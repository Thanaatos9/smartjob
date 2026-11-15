-- Création automatique du CV et de la lettre adaptés à chaque offre, dans l'app.

-- Profil CV structuré (identité, expériences avec dates et faits, formation,
-- compétences, axes, chemin de la photo). Source unique de la génération :
-- l'IA ne choisit que les formulations, jamais les dates ni l'ordre.
alter table public.profiles add column if not exists cv_profile jsonb;

-- Adéquation offre / profil sur 100 calculée à la génération (seuil 70),
-- et verrou qui évite deux générations simultanées de la même offre.
alter table public.offers add column if not exists fit_score smallint;
alter table public.offers add column if not exists tailoring_started_at timestamptz;
