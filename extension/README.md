# Extension Chrome — Candidature

Deux fonctions :

1. **Envoyer une offre** : envoie l'onglet courant vers la plateforme en un clic.
2. **Candidature automatique** sur **LinkedIn**, **Welcome to the Jungle** et
   **JobTeaser**, plus un bouton **Remplir ce formulaire** pour n'importe quel
   autre site (sites d'entreprise, ATS).

## 1. Envoyer une offre

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

## 2. Candidature automatique

### Utilisation

1. Règle tes préférences sur la plateforme : **Auto-candidature** (menu de gauche).
2. Connecte-toi dans l'extension, et **connecte-toi au site visé** (LinkedIn,
   WTTJ, JobTeaser) dans le même navigateur : l'extension agit dans ta session.
3. Ouvre une recherche d'offres. Un panneau **« Candidature auto »** apparaît en
   bas à droite → **Démarrer**.

### Ce que fait le panneau, offre par offre

1. Lit l'offre dans la page (JSON-LD sur WTTJ/JobTeaser, DOM sur LinkedIn).
2. Ignore celles qu'on ne peut pas postuler d'ici (candidature sur le site de
   l'entreprise → **enregistrée dans « Mes offres »** pour la postuler à la main).
3. Envoie l'offre à la plateforme, qui applique les règles **côté serveur** :
   déjà postulé, entreprise blacklistée, plafond sur 24 h, **score minimum**
   (note CV/offre de 0 à 10).
4. Ouvre le formulaire et le remplit :
   - identité (nom, e-mail, téléphone + indicatif, ville…) depuis ton profil ;
   - CV en PDF sur les champs « CV » (sauf si le site en a déjà un sélectionné) ;
   - le reste : banque de réponses, sinon IA à partir de ton CV et de tes réglages.
5. **Semi-auto (défaut)** : s'arrête sur le bouton Envoyer, surligné en vert. Tu
   relis et tu cliques. **Auto** : l'extension envoie elle-même.

### Garde-fous

- **Rien n'est inventé.** Si un champ obligatoire n'a pas de réponse fiable (absent
  du CV et des réglages), il est surligné en orange. En semi-auto tu le complètes,
  en auto l'offre est **abandonnée**. Autorisation de travail, salaire, préavis :
  uniquement ce que tu as renseigné.
- **Consentements** (CGU, RGPD, « je certifie… ») jamais cochés, sauf réglage explicite.
- **Vérification de sécurité** (captcha, checkpoint) : l'extension attend que tu la
  résolves, elle ne tente jamais de la contourner.
- Délais aléatoires entre les offres, plafond sur 24 h (25 par défaut), arrêt après
  4 échecs de suite (le site a probablement changé sa page).
- **Arrêter** interrompt immédiatement, sans rien envoyer.

⚠ LinkedIn interdit l'automatisation dans ses conditions d'utilisation : le compte
peut être restreint. Le mode semi-auto et un plafond bas réduisent le risque, ils ne
le suppriment pas.

### Ce qui est vérifié, et ce qui ne l'est pas

| | WTTJ | JobTeaser | LinkedIn |
|---|---|---|---|
| Liste d'offres, page d'offre, bouton Postuler | ✅ testé sur les vraies pages publiques | ✅ idem | ⚠ non testé (compte requis) |
| Formulaire de candidature | ⚠ non testé (connexion requise) | ⚠ non testé (connexion requise) | ⚠ non testé |
| Remplissage, étapes, semi-auto/auto | ✅ testé sur formulaires de test | ✅ idem | ✅ idem |

Les sélecteurs de formulaire viennent du moteur générique (libellés, boutons par
texte FR/EN), pas de classes CSS : ils supportent mieux les changements de design.
Si un site ne se comporte pas comme prévu, le panneau l'indique dans son journal
(« formulaire introuvable », « bouton Suivant / Envoyer introuvable »…).

Sur JobTeaser, seules les offres marquées **« Candidature simplifiée »** se postulent
depuis le site (environ 1 sur 5 dans une recherche) ; les autres renvoient vers le
site de l'entreprise.

### Bouton « Remplir ce formulaire »

Dans le popup, sur n'importe quelle page : remplit le formulaire visible avec ton
profil et l'IA, surligne ce qui manque, et **ne clique jamais sur Envoyer**.
Utile pour les candidatures sur le site de l'entreprise.

## ⚠️ Le serveur doit être déployé

Les routes `/api/extension/login`, `/api/extension/refresh`,
`/api/extension/offers` et `/api/extension/apply/*` font partie de la plateforme, et
la migration `supabase/migrations/0009_auto_apply.sql` doit être appliquée. Tant que
**la prod (`smartjob.samuelrilos.com`) n'est pas redéployée** avec ces routes, tu
auras une **erreur 404**. Redéploie avant de tester en prod, ou pointe l'extension
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
4. Épingle l'icône. Après toute modif des fichiers, clique sur **↻** pour recharger
   (et recharge les onglets LinkedIn / WTTJ / JobTeaser déjà ouverts).

## Dépannage

- **Erreur 404** : routes pas déployées en prod, ou URL plateforme avec un chemin
  en trop. Voir les sections ci-dessus.
- **Identifiants invalides** : mauvais email/mot de passe de la plateforme.
- **« Renseigne d'abord ton CV »** : l'extraction et l'auto-candidature ont besoin
  du CV de ton profil.
- **« Contenu de l'offre illisible » (422)** : ni le texte lu dans l'onglet ni la
  page récupérée par n8n ne contenaient d'offre exploitable. Ouvre bien l'offre
  (mail déplié, page de l'annonce affichée) avant de cliquer, puis réessaie.
- **« Impossible de joindre la plateforme »** : vérifie que le domaine est dans
  `host_permissions`.
- **Le panneau n'apparaît pas** : recharge l'onglet après avoir rechargé
  l'extension ; sur LinkedIn, ouvre une page `/jobs/…`.
- **« Connecte-toi à … dans ce navigateur »** : tu n'es pas connecté au site visé.
