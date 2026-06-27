-- Profils utilisateurs (CV + infos perso utilisées pour générer les lettres)
create table if not exists public.profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  phone text,
  location text,
  cv_text text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

create policy "profiles_select_own" on public.profiles
  for select using (auth.uid() = user_id);
create policy "profiles_insert_own" on public.profiles
  for insert with check (auth.uid() = user_id);
create policy "profiles_update_own" on public.profiles
  for update using (auth.uid() = user_id);

-- Recherches par mot-clé (phase 2, créée dès maintenant)
create table if not exists public.searches (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  keyword text not null,
  sites text[] not null default '{}',
  status text not null default 'pending', -- pending | running | done | error
  created_at timestamptz not null default now()
);

alter table public.searches enable row level security;

create policy "searches_select_own" on public.searches
  for select using (auth.uid() = user_id);
create policy "searches_insert_own" on public.searches
  for insert with check (auth.uid() = user_id);
create policy "searches_update_own" on public.searches
  for update using (auth.uid() = user_id);

-- Offres d'emploi (extraites manuellement ou via une recherche)
create table if not exists public.offers (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  search_id uuid references public.searches(id) on delete set null,
  title text,
  company text,
  salary text,
  location text,
  contract_type text,
  remote boolean,
  skills text[] default '{}',
  summary text,
  experience_years text,
  sector text,
  url text,
  domain text,
  raw_text text,
  status text not null default 'found', -- found | letter_generated | applied | interview | rejected | accepted
  cover_letter_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.offers enable row level security;

create policy "offers_select_own" on public.offers
  for select using (auth.uid() = user_id);
create policy "offers_insert_own" on public.offers
  for insert with check (auth.uid() = user_id);
create policy "offers_update_own" on public.offers
  for update using (auth.uid() = user_id);
create policy "offers_delete_own" on public.offers
  for delete using (auth.uid() = user_id);

-- Storage bucket pour les lettres de motivation générées (HTML/PDF)
insert into storage.buckets (id, name, public)
values ('cover-letters', 'cover-letters', false)
on conflict (id) do nothing;

create policy "cover_letters_select_own" on storage.objects
  for select using (
    bucket_id = 'cover-letters' and (storage.foldername(name))[1] = auth.uid()::text
  );
create policy "cover_letters_insert_own" on storage.objects
  for insert with check (
    bucket_id = 'cover-letters' and (storage.foldername(name))[1] = auth.uid()::text
  );
