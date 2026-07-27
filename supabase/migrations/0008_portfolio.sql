-- Portfolio personnel : URL renseignée par l'utilisateur + texte extrait mis en cache
-- pour enrichir scoring/lettre sans re-scraper le site à chaque génération.
alter table public.profiles add column if not exists portfolio_url text;
alter table public.profiles add column if not exists portfolio_text text;
alter table public.profiles add column if not exists portfolio_fetched_at timestamptz;
