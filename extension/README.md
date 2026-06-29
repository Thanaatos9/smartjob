# Extension Chrome — Envoyer une offre

Envoie l'URL de l'onglet courant vers la plateforme de candidature en un clic,
puis propose un lien direct vers la fiche de l'offre créée.

## Comment ça marche

1. Tu **connectes ton compte** dans l'extension (email + mot de passe de la
   plateforme). L'extension stocke un token et le réutilise ensuite.
2. Sur une page d'offre (LinkedIn, WTTJ, VIE…), tu cliques sur l'icône → **« Envoyer le lien »**.
3. L'extension appelle `POST /api/extension/offers` avec ton token. Le serveur
   lance l'extraction n8n (même flux que « Ajouter une offre » du dashboard).
4. Une fois l'offre créée, **« Voir l'offre → »** ouvre sa fiche `/offers/{id}`.

L'auth est **par token** : tu te connectes une fois dans l'extension, pas besoin
d'être connecté sur le site dans le navigateur. Le token est rafraîchi
automatiquement ; s'il expire définitivement, l'extension redemande la connexion.

## ⚠️ Le serveur doit être déployé

Les routes `/api/extension/login`, `/api/extension/refresh` et
`/api/extension/offers` font partie de la plateforme. Tant que **la prod
(`smartjob.samuelrilos.com`) n'est pas redéployée** avec ces routes, tu auras
une **erreur 404**. Redéploie avant de tester en prod, ou pointe l'extension
sur `http://localhost:3000` pendant le dev.

## Configuration du domaine

À renseigner à **deux endroits** :

1. **`manifest.json`** → `host_permissions` doit couvrir ton domaine
   (`https://smartjob.samuelrilos.com/*` + `http://localhost:3000/*` en dev).
2. **L'URL active** : bouton **⚙️ URL plateforme** dans le popup, ou
   `DEFAULT_PLATFORM_URL` dans `config.js`.
   > N'indique que le **domaine** (`https://smartjob.samuelrilos.com`), **sans**
   > chemin type `/dashboard` — sinon les appels API partent vers
   > `.../dashboard/api/...` et renvoient 404. (Le code ne garde que l'origine,
   > mais autant le saisir correctement.)

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
- **« Impossible de joindre la plateforme »** : vérifie l'URL (⚙️) et que le
  domaine est dans `host_permissions`.
