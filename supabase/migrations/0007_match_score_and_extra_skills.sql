-- Note de correspondance CV/offre (0-10), calculée automatiquement à la création de l'offre
alter table public.offers add column if not exists match_score smallint;
alter table public.offers add column if not exists match_reason text;

-- Qualités et compétences supplémentaires renseignées par l'utilisateur pour enrichir CV et lettres
alter table public.profiles add column if not exists additional_skills text;
