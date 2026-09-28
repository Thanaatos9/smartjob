-- CV en anglais, mémorisé à côté du CV principal (français).
-- profiles.cv_text / cv_pdf_path restent le CV français ; le texte extrait sert au
-- score, aux lettres et aux réponses de l'IA, le PDF est celui que l'extension téléverse.
alter table public.profiles add column if not exists cv_text_en text;
alter table public.profiles add column if not exists cv_pdf_path_en text;
