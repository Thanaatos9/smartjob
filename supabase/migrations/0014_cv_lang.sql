-- Langue du CV et de la lettre adaptés (fr | en) : choisie sur la fiche offre
-- ou déduite de la langue de l'offre, affichée comme valeur par défaut du sélecteur.
alter table public.offers add column if not exists cv_lang text check (cv_lang in ('fr', 'en'));
