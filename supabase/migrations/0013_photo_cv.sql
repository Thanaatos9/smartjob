-- Photo du CV adapté : incluse ou non, et pourquoi (affiché sur la fiche offre).
alter table public.offers add column if not exists cv_photo boolean;
alter table public.offers add column if not exists cv_photo_reason text;
