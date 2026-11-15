-- Liaison avec le skill Claude « postuler » : CV et lettre adaptés à chaque offre,
-- données de ciblage ATS et suivi des relances (remplace la base Notion).

alter table public.offers add column if not exists axis text;                       -- axe de repositionnement retenu
alter table public.offers add column if not exists ats_keywords text[] not null default '{}'; -- mots-clés obligatoires de l'offre
alter table public.offers add column if not exists ats_coverage smallint;           -- % d'obligatoires présents dans le CV envoyé
alter table public.offers add column if not exists gaps text;                       -- ce que l'offre demande et que le profil n'a pas
alter table public.offers add column if not exists recruiter text;
alter table public.offers add column if not exists recruiter_contact text;
alter table public.offers add column if not exists tailored_cv_path text;           -- bucket cvs : <user>/offers/<offre>/cv.pdf
alter table public.offers add column if not exists tailored_letter_path text;       -- bucket cvs : <user>/offers/<offre>/letter.pdf
alter table public.offers add column if not exists applied_at timestamptz;
alter table public.offers add column if not exists follow_up_due date;
alter table public.offers add column if not exists follow_up_sent_at timestamptz;

-- Passage à « applied », quel que soit le chemin (bouton du site, extension, skill) :
-- date de candidature et relance à J+10 posées automatiquement si absentes.
create or replace function public.offers_set_applied_dates()
returns trigger
language plpgsql
as $$
begin
  if new.status = 'applied' and (tg_op = 'INSERT' or old.status is distinct from 'applied') then
    new.applied_at := coalesce(new.applied_at, now());
    new.follow_up_due := coalesce(new.follow_up_due, (new.applied_at at time zone 'Europe/Paris')::date + 10);
  end if;
  return new;
end;
$$;

drop trigger if exists offers_set_applied_dates on public.offers;
create trigger offers_set_applied_dates
  before insert or update of status on public.offers
  for each row execute function public.offers_set_applied_dates();

create index if not exists offers_user_follow_up_idx
  on public.offers (user_id, follow_up_due)
  where status = 'applied' and follow_up_sent_at is null;
