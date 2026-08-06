# Extension Chrome — Envoyer une offre

Envoie l'URL de l'onglet courant vers la plateforme de candidature en un clic,
puis propose un lien direct vers la fiche de l'offre créée.

## Comment ça marche

1. Tu **connectes ton compte** dans l'extension (email + mot de passe de la
   plateforme). L'extension stocke un token et le réutilise ensuite.
2. Sur une page d'offre (LinkedIn, WTTJ, VIE…), tu cliques sur l'icône → **« Envoyer l'offre »**.
3. L'extension lit le texte affiché dans l'onglet (permission `scripting`, zone
   de contenu principale) et appelle `POST /api/extension/offers` avec ton token
   + ce texte. Le serveur lance l'extraction n8n (même flux que « Ajouter une
   offre » du dashboard).
4. Une fois l'offre créée, **« Voir l'offre → »** ouvre sa fiche `/offers/{id}`.

Envoyer le texte de la page, et pas seulement l'URL, est ce qui permet de
traiter les offres que le serveur ne peut pas récupérer lui-même : **offres
reçues par mail** (Gmail exige une session, et l'id du message vit dans le
fragment `#…` qui n'est jamais transmis au serveur), sites en SPA, pages
derrière une connexion. Si la lecture échoue (page `chrome://`, lecteur PDF),
seule l'URL part et n8n tente la récupération de son côté.

L'auth est **par token** : tu te connectes une fois dans l'extension, pas besoin
d'être connecté sur le site dans le navigateur. Le token est rafraîchi
automatiquement ; s'il expire définitivement, l'extension redemande la connexion.

## ⚠️ Le serveur doit être déployé

Les routes `/api/extension/login`, `/api/extension/refresh` et
`/api/extension/offers` font partie de la plateforme. Tant que **la prod
(`smartjob.samuelrilos.com`) n'est pas redéployée** avec ces routes, tu auras
une **erreur 404**. Redéploie avant de tester en prod, ou pointe l'extension
sur `http://localhost:3000` pendant le dev.

## Domaine (codé en dur)

L'URL de la plateforme est **fixée dans le code**, rien à configurer dans le
popup. Si tu changes un jour de domaine, modifie les **deux** endroits :

1. **`config.js`** → la constante `PLATFORM_URL`.
2. **`manifest.json`** → `host_permissions` (doit couvrir le même domaine).

## Installation (mode développeur)

1. Ouvre `chrome://extensions`.
2. Active **Mode développeur** (en haut à droite).
3. **Charger l'extension non empaquetée** → sélectionne ce dossier `extension/`.
4. Épingle l'icône. Après toute modif des fichiers, clique sur **↻** pour recharger.

## Dépannage

- **Erreur 404** : routes pas déployées en prod, ou URL plateforme avec un chemin
  en trop. Voir les sections ci-dessus.
- **Identifiants invalides** : mauvais email/mot de passe de la plateforme.
- **« Renseigne d'abord ton CV »** : l'extraction a besoin du CV de ton profil.
- **« Contenu de l'offre illisible » (422)** : ni le texte lu dans l'onglet ni la
  page récupérée par n8n ne contenaient d'offre exploitable. Ouvre bien l'offre
  (mail déplié, page de l'annonce affichée) avant de cliquer, puis réessaie.
- **« Impossible de joindre la plateforme »** : vérifie l'URL (⚙️) et que le
  domaine est dans `host_permissions`.
