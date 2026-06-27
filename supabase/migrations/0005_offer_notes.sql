-- Notes libres par offre (suivi de candidature)
alter table public.offers add column if not exists notes text;

-- Index pour lister rapidement les candidatures (offres déjà postulées) par date de suivi
create index if not exists offers_user_status_idx on public.offers (user_id, status, updated_at desc);
