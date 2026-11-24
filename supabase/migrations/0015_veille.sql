-- Veille quotidienne des offres : alertes email (LinkedIn, WTTJ, JobTeaser,
-- Indeed, HelloWork, VIE) lues dans une boîte dédiée, offres extraites, notées,
-- CV et lettre générés automatiquement.

-- Réglages de la veille (contrats acceptés, mots exclus, seuil, volume par passage).
alter table public.profiles add column if not exists veille_prefs jsonb;

-- Origine de l'offre et passage de veille qui l'a créée.
alter table public.offers add column if not exists source text;
alter table public.offers add column if not exists veille_run_id uuid;

-- Un passage de la veille (déclenché par n8n chaque matin ou par le skill).
create table if not exists public.veille_runs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  status text not null default 'running', -- running | done | error
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  emails_read integer not null default 0,
  links_found integer not null default 0,
  queued integer not null default 0,
  processed integer not null default 0,
  created integer not null default 0,
  ready integer not null default 0,
  rejected integer not null default 0,
  duplicates integer not null default 0,
  errors jsonb not null default '[]'::jsonb
);

create index if not exists veille_runs_user_started_idx on public.veille_runs (user_id, started_at desc);

-- Chaque lien d'offre vu une fois : file d'attente et mémoire des doublons.
-- url_key est l'identifiant stable de l'offre sur sa plateforme (ex. linkedin:4012345678).
create table if not exists public.veille_seen (
  user_id uuid not null references auth.users(id) on delete cascade,
  url_key text not null,
  source text not null,
  url text not null,
  hint text,
  status text not null default 'queued', -- queued | done
  outcome text,                            -- created | ready | low_score | low_fit | contract | excluded | duplicate | unreadable | error
  offer_id uuid references public.offers(id) on delete set null,
  run_id uuid references public.veille_runs(id) on delete set null,
  created_at timestamptz not null default now(),
  processed_at timestamptz,
  primary key (user_id, url_key)
);

create index if not exists veille_seen_queue_idx on public.veille_seen (user_id, status, created_at);

alter table public.veille_runs enable row level security;
alter table public.veille_seen enable row level security;

create policy "veille_runs_select_own" on public.veille_runs
  for select using (auth.uid() = user_id);
create policy "veille_seen_select_own" on public.veille_seen
  for select using (auth.uid() = user_id);
