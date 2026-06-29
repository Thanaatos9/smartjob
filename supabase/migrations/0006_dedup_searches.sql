-- Déduplication de l'historique des recherches.
-- Avant cette migration, chaque lancement créait une ligne dans public.searches,
-- d'où des doublons par mot-clé. On consolide l'existant puis on verrouille au
-- niveau base via un index unique sur (user_id, mot-clé normalisé).
--
-- Normalisation du mot-clé = lower(btrim(keyword)) — identique à la logique
-- applicative (keyword.trim().toLowerCase()).

begin;

-- 1. Repointe les offres des recherches en double vers la recherche conservée
--    (la plus récente de chaque groupe user_id + mot-clé normalisé).
with ranked as (
  select
    id,
    row_number() over (
      partition by user_id, lower(btrim(keyword))
      order by created_at desc, id desc
    ) as rn,
    first_value(id) over (
      partition by user_id, lower(btrim(keyword))
      order by created_at desc, id desc
    ) as keeper_id
  from public.searches
)
update public.offers o
set search_id = r.keeper_id
from ranked r
where o.search_id = r.id
  and r.rn > 1;

-- 2. Supprime les lignes de recherche redondantes (tout sauf la plus récente).
with ranked as (
  select
    id,
    row_number() over (
      partition by user_id, lower(btrim(keyword))
      order by created_at desc, id desc
    ) as rn
  from public.searches
)
delete from public.searches s
using ranked r
where s.id = r.id
  and r.rn > 1;

-- 3. Empêche tout futur doublon directement au niveau base.
create unique index if not exists searches_user_keyword_unique
  on public.searches (user_id, lower(btrim(keyword)));

commit;
