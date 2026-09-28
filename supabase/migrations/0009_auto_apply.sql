-- Candidature automatique (extension Chrome : LinkedIn, Welcome to the Jungle, JobTeaser)

-- Préférences de candidature automatique (une ligne par utilisateur).
create table if not exists public.apply_preferences (
  user_id uuid primary key references auth.users(id) on delete cascade,
  mode text not null default 'semi' check (mode in ('semi', 'auto')), -- semi : l'utilisateur clique sur Envoyer
  min_score smallint not null default 6 check (min_score between 0 and 10),
  daily_limit smallint not null default 25 check (daily_limit between 1 and 100),
  blacklist text[] not null default '{}', -- entreprises à ne jamais postuler
  accept_consents boolean not null default false, -- coche les cases CGU/RGPD à ta place
  linkedin_url text,
  github_url text,
  salary_expectation text,
  notice_period text,
  availability text,
  work_authorization text, -- ex : "Oui, citoyen UE" (donnée sensible : jamais devinée)
  needs_sponsorship text,  -- ex : "Non"
  notes text,              -- infos libres transmises à l'IA pour répondre aux questions
  updated_at timestamptz not null default now()
);

alter table public.apply_preferences enable row level security;

create policy "apply_preferences_select_own" on public.apply_preferences
  for select using (auth.uid() = user_id);
create policy "apply_preferences_insert_own" on public.apply_preferences
  for insert with check (auth.uid() = user_id);
create policy "apply_preferences_update_own" on public.apply_preferences
  for update using (auth.uid() = user_id);

-- Banque de réponses : évite de re-demander à l'IA une question déjà posée, et
-- permet à l'utilisateur de corriger une réponse une fois pour toutes.
create table if not exists public.answer_bank (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  question_key text not null,
  question text not null,
  type text not null,
  options text[] not null default '{}',
  answer text not null,
  source text not null default 'ai' check (source in ('ai', 'user')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, question_key)
);

alter table public.answer_bank enable row level security;

create policy "answer_bank_select_own" on public.answer_bank
  for select using (auth.uid() = user_id);
create policy "answer_bank_insert_own" on public.answer_bank
  for insert with check (auth.uid() = user_id);
create policy "answer_bank_update_own" on public.answer_bank
  for update using (auth.uid() = user_id);
create policy "answer_bank_delete_own" on public.answer_bank
  for delete using (auth.uid() = user_id);

-- Journal des candidatures automatiques : dédoublonnage + plafond glissant sur 24 h.
create table if not exists public.auto_applications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  offer_id uuid references public.offers(id) on delete set null,
  site text not null,      -- linkedin | wttj | jobteaser
  job_key text not null,   -- identifiant stable de l'offre sur le site
  status text not null check (status in ('submitted', 'skipped', 'failed', 'external')),
  reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, site, job_key)
);

create index if not exists auto_applications_user_recent_idx
  on public.auto_applications (user_id, status, created_at desc);

alter table public.auto_applications enable row level security;

create policy "auto_applications_select_own" on public.auto_applications
  for select using (auth.uid() = user_id);
create policy "auto_applications_insert_own" on public.auto_applications
  for insert with check (auth.uid() = user_id);
create policy "auto_applications_update_own" on public.auto_applications
  for update using (auth.uid() = user_id);
