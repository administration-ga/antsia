# Environnement de démonstration d'ANTSIA

> Décision : ADR-0029. Ce document dit ce que le propriétaire crée et pose (projets, secrets),
> puis comment publier et remettre à zéro. Aucun secret ne s'écrit dans le dépôt ni dans un chat :
> chaque valeur se saisit dans le tableau de bord concerné ou dans le terminal du propriétaire.

## Ce que c'est

Un second déploiement complet du moteur et d'antsia.ga, séparé de la production :

| | Production | Démonstration |
|---|---|---|
| Backend Convex | projet de production actuel | projet **distinct** (ex. `antsia-demo`) |
| Site | `antsia.vercel.app` | projet d'hébergement **distinct** (ex. `antsia-demo`) |
| Comptes | vrais membres | les huit comptes fictifs `<acteur>@demo.antsia.test`, partagés, et dix figurants `figurant-<n>@demo.antsia.test` (absents de l'écran de connexion) |
| Bouton « Comptes de démonstration » | jamais | sur l'écran de connexion et l'accueil |

Le bouton n'apparaît que si le backend annonce `demoAccounts` (configuration de
`modules/platform/authentication`), c'est-à-dire si `ANTSIA_DEMO_DEPLOYMENT` porte le nom même du
déploiement. Sur tout autre déploiement, le catalogue est vide et l'équipement refusé.

## 1. Backend Convex de démonstration (propriétaire)

1. Créer un **nouveau projet** Convex (ex. `antsia-demo`) dans l'équipe, et son déploiement de
   production. Relever son nom dans son adresse : `https://<nom>.convex.cloud`.
2. Générer pour ce projet une **clé de déploiement de production** (tableau de bord Convex ›
   Settings), à garder dans le terminal du propriétaire seulement.
3. Poser les variables du déploiement de démonstration (tableau de bord › Settings ›
   Environment Variables) :

   | Variable | Valeur |
   |---|---|
   | `ANTSIA_DEMO_DEPLOYMENT` | le `<nom>` relevé au point 1, exactement |
   | `SITE_URL` | l'origine du site de démonstration (ex. `https://antsia-demo.vercel.app`) |
   | `BETTER_AUTH_SECRET` | un secret **neuf**, propre à la démonstration (au moins 32 caractères, par ex. `openssl rand -base64 48`) |
   | `ANTSIA_SEEDS_ALLOWED` | `true`, le temps de la graine (point 5), puis la retirer |

   À **ne pas** poser : `ANTSIA_DEV_TOOLS`, `RESEND_*`, `IDN_*`, `SMS_*`. Sans eux, seules les huit
   adresses réservées entrent ; une vraie adresse reçoit « envoi indisponible ».
4. Publier les fonctions depuis `ECOSYSTEMES/ANTSIA`, à jour de `main` :

   ```bash
   git pull && bun install
   CONVEX_DEPLOY_KEY='<clé de production du projet de démonstration>' bunx convex deploy
   ```

5. Poser les fondations (réseau racine), une fois :

   ```bash
   CONVEX_DEPLOY_KEY='<même clé>' bunx convex run seeds/foundations:run '{"confirmNonProduction":"ANTSIA_SEEDS_HORS_PRODUCTION"}'
   ```

   Puis retirer `ANTSIA_SEEDS_ALLOWED` du déploiement.

## 2. Site de démonstration (propriétaire)

1. Créer un **nouveau projet** d'hébergement (ex. `antsia-demo`), avec les mêmes réglages de
   construction que le projet `antsia` de production (dossier racine, commandes d'installation et de
   construction, Node 24).
2. Ses variables (environnement Production) :

   | Variable | Valeur |
   |---|---|
   | `NEXT_PUBLIC_CONVEX_URL` | `https://<nom>.convex.cloud` (démonstration) |
   | `CONVEX_SITE_URL` | `https://<nom>.convex.site` (démonstration) |
   | `NEXT_PUBLIC_SITE_URL` | l'origine du site de démonstration, identique à `SITE_URL` du backend |

   Aucune variable PostHog : la démonstration ne mesure rien.
3. Publier depuis `ECOSYSTEMES`, comme la production, en liant le dossier au projet de
   démonstration (`vercel link --project antsia-demo`, puis `vercel deploy --prod`).
4. Recommandé : protéger l'accès au site (mot de passe ou protection de l'hébergeur) si la
   démonstration ne doit pas être publique.

## 3. Recette

1. Ouvrir le site de démonstration : l'écran de connexion montre « Comptes de démonstration » et la
   phrase « Site de démonstration : comptes et contenus fictifs, partagés par tous les visiteurs. »
2. Un appui sur « Presse » : connexion, accueil rempli seul, page « Gabon Actu Démo » administrée,
   badge Vérifié. Rejouer pour « Administration » (page Officiel) et « Modération ».
3. Sur la production (`antsia.vercel.app`) : aucun panneau de démonstration ;
   `modules/platform/demoAccounts:catalogue` rend `[]`.

## 4. Contenus de démonstration (graines d'animation, propriétaire)

Les comptes fictifs ne suffisent pas à montrer un réseau vivant. Les graines d'animation (21/10)
remplissent la démonstration, et elle seule (garde `assertDemoContentAllowed` : confirmation ET
déploiement de démonstration déclaré) :

| Contenu | Volume |
|---|---|
| Publications | 72 : 42 des acteurs, 10 de leurs pages, 20 des figurants ; 27 avec image (37 %) |
| Images | 8 illustrations générées (`demo-media/animation-20261020`) et 56 photos libres de droits Pexels (`demo-media/photos-20261021`, crédits dans son `manifest.json`) |
| Boutiques | épicerie 13 produits, studio photo 10 prestations, atelier informatique 10 prestations |
| Figurants | 10 personnes fictives (NOM en capitales), portrait, 2 publications chacune |
| Graphe | 37 relations acceptées, 16 demandes en attente (chaque acteur en reçoit au moins une, avec son avis dans la cloche), abonnements aux personnes et aux pages ; les figurants sans lien deviennent des suggestions |
| Engagement | réactions variées et commentaires sur chaque publication nouvelle |

Lancement, après la publication des fonctions (point 1.4), avec la clé de démonstration dans
l'environnement :

```bash
ANTSIA_CONVEX_DEMO_DEPLOY_KEY='…' bash scripts/convex-deploy-demo-production.sh graines
```

Le mode `tout` du même script les enchaîne entre la publication de la démonstration et celle de la
production. Le script `scripts/seed-demo-content.mjs` :

1. inscrit les sept acteurs puis les dix figurants par le **vrai parcours OTP** du site
   (`https://antsia.vercel.app/demo/api/auth`), sans écrire aucun code ni jeton ;
2. appelle `seeds/demoContent:run` puis `:runFigurants` (fonctions internes, clé de démonstration) ;
3. dépose les images une à une : le serveur planifie chaque cible et n'accepte que la taille et
   l'empreinte SHA-256 de son manifeste (`seeds/demoContentMedia:storeAsset`), aucune URL n'est suivie.

Rejouable sans effet de bord : une publication retirée ou modifiée n'est pas reprise, une demande
refusée ou une relation rompue ne revient pas, un portrait choisi par la personne n'est pas remplacé.
Les actus des acteurs se reposent une fois par jour à chaque rejeu.

## 5. Exploitation

- **Chaque mise en production du moteur** se rejoue sur la démonstration (point 1.4 puis 2.3), pour
  que la démonstration montre le même produit.
- **Remise à zéro** : les comptes étant partagés, effacer périodiquement les données du déploiement
  de démonstration (ou en recréer un), puis rejouer la graine (point 1.5) et les graines
  d'animation (point 4). Les huit comptes se recréent au premier appui.
- **Limites connues** : par adresse, trois codes par cinq minutes et cinq connexions par quinze
  minutes (seaux du moteur, non desserrés) — plusieurs visiteurs sur le même compte au même moment
  peuvent attendre quelques minutes. Un domaine personnalisé qui remplacerait l'adresse
  `<nom>.convex.cloud` du backend ferme la démonstration (la garde ne reconnaît plus le nom).
- **Fermer la démonstration** : retirer `ANTSIA_DEMO_DEPLOYMENT` du déploiement — le bouton
  disparaît, le catalogue se vide et l'équipement est refusé aussitôt.

## 6. DIASPORALE sur la démonstration (ADR-0038)

DIASPORALE se publie sur le même backend de démonstration, dans son propre site. Chaque étape se
fait avec l'accord écrit du propriétaire.

1. **Backend de démonstration** :
   - fonctions publiées depuis un `main` qui contient l'ADR-0038 (point 1.4) ;
   - le réseau `diasporale` semé une fois. Poser `ANTSIA_SEEDS_ALLOWED=true`, lancer
     la graine, puis retirer la variable :

     ```bash
     CONVEX_DEPLOY_KEY='<même clé>' bunx convex run modules/diaspora/seed:run '{"confirmNonProduction":"ANTSIA_SEEDS_HORS_PRODUCTION"}'
     ```

   - `TRUSTED_ORIGINS` : l'origine du site DIASPORALE de démonstration. `SITE_URL` reste celle
     d'antsia.ga.
2. **Site de démonstration DIASPORALE** : un projet d'hébergement distinct (ex. `diasporale-demo`).
   - Dossier racine `DIASPORALE/apps/diasporale_com`, Node 24.
   - Installation `cd ../../../ANTSIA && npx --yes bun@1.4.2 install --frozen-lockfile`.
   - Construction `npx --yes bun@1.4.2 run build`.
   - Publication depuis `ECOSYSTEMES`, ANTSIA et DIASPORALE à jour de `main`, avec ces variables
     publiques :

     | Variable | Valeur |
     |---|---|
     | `NEXT_PUBLIC_DIASPORALE_DATA_SOURCE` | `engine` |
     | `NEXT_PUBLIC_CONVEX_URL` | `https://<nom>.convex.cloud` (démonstration) |
     | `CONVEX_SITE_URL` | `https://<nom>.convex.site` (démonstration) |
     | `NEXT_PUBLIC_SITE_URL` | l'origine du site DIASPORALE de démonstration |

     Sans `NEXT_PUBLIC_IDN_PORTAL_URL` ni `NEXT_PUBLIC_CONSULATE_URL`, les liens d'élévation ne
     s'affichent pas.
3. **Recette** : `/entrer` › « Comptes de démonstration » (vingt rôles fictifs). Par exemple,
   Patrice publie, Sandrine signale pour harcèlement, puis Ruth tranche dans `/moderation`, où le
   dossier s'affiche sous « Délais légaux ».
4. **Production** : rien ne change ; `modules/diaspora/demoAccounts:catalogue` y rend `[]`.
