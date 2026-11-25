-- Texte de l'alerte autour du lien (intitulé, entreprise, lieu, contrat) :
-- sert à extraire l'offre quand sa page est illisible depuis le serveur (Indeed).
alter table public.veille_seen add column if not exists context text;

-- Nettoyage du premier passage : fiches vides créées à partir des alertes Indeed
-- (intitulé « Voir l'emploi »). Les liens sont retirés de la mémoire de la veille
-- pour être retraités quand les mails sont remis dans la boîte de réception.
delete from public.offers
where source = 'indeed'
  and notes like 'Veille : texte de l''offre illisible%'
  and (title is null or title ilike '%voir l%emploi%');

delete from public.veille_seen
where source = 'indeed' and outcome = 'unreadable';
