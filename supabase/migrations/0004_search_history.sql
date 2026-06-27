-- Historique de recherche : compteurs de résultats et de doublons par recherche
alter table public.searches add column if not exists result_count integer not null default 0;
alter table public.searches add column if not exists duplicate_count integer not null default 0;

-- Index pour filtrer rapidement les offres par recherche (dashboard) et lister l'historique
create index if not exists offers_user_search_idx on public.offers (user_id, search_id);
create index if not exists searches_user_created_idx on public.searches (user_id, created_at desc);

-- Index de déduplication : retrouver vite une offre déjà vue par URL
create index if not exists offers_user_url_idx on public.offers (user_id, url) where url is not null;
