# Environnement de démonstration d'ANTSIA

> Dépôt public : les identifiants internes d'hébergement (déploiements, projets, équipes, adresses techniques) sont tenus hors du dépôt ; ce document les désigne par leur rôle (EX-20, 10/11/2026).

> Décision : ADR-0029. Ce document dit ce que le propriétaire crée et pose (projets, secrets),
> puis comment publier et remettre à zéro. Aucun secret ne s'écrit dans le dépôt ni dans un chat :
> chaque valeur se saisit dans le tableau de bord concerné ou dans le terminal du propriétaire.

## Ce que c'est

Un second déploiement complet du moteur et d'antsia.ga, séparé de la production :

| | Production | Démonstration |
|---|---|---|
| Backend Convex | projet de production actuel | projet **distinct** |
| Site | projet d'hébergement du site principal | projet d'hébergement **distinct** (l'enfant de démonstration) |
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
   | `SITE_URL` | l'origine du site de démonstration (l'adresse du projet de démonstration chez l'hébergeur), sous la règle ci-dessous |
   | `BETTER_AUTH_SECRET` | un secret **neuf**, propre à la démonstration (au moins 32 caractères, par ex. `openssl rand -base64 48`) |
   | `ANTSIA_SEEDS_ALLOWED` | `true`, le temps de la graine (point 5), puis la retirer |
   | `IDN_CLIENT_ID`, `IDN_CLIENT_SECRET`, `IDN_ISSUER` (ou `IDN_DISCOVERY_URL`) | ceux du client d'identité numérique **DÉDIÉ** à la démonstration, chez identite.ga, en mode bac à sable (niveau 1, limité à ses comptes de test) ; **jamais** le client de production (ADR-0043) |

   À **ne pas** poser : `ANTSIA_DEV_TOOLS`, `RESEND_*`, `SMS_*`. Sans eux, une vraie adresse reçoit
   « envoi indisponible » ; seules les adresses réservées entrent par code. Par IDN, seuls les comptes
   de test du client de démonstration entrent : identite.ga refuse tout autre titulaire.

   **Règle de `SITE_URL`.** Le retour IDN arrive toujours à
   `origine(SITE_URL)/api/auth/oauth2/callback/idn` (`convex/betterAuth/auth.ts`). `SITE_URL` doit donc
   être une origine dont le relais sert `/api/auth/*` **à la racine** vers CE moteur de démonstration.
   Une origine dont la racine relaie vers un autre moteur (par exemple celle du site principal, quand
   la démonstration n'y est servie que sous un préfixe comme `/demo`) enverrait le retour IDN à cet
   autre moteur : la connexion par IDN échouerait sur la démonstration.
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
   démonstration (`vercel link --project <projet de démonstration>`, puis `vercel deploy --prod`).
4. Recommandé : protéger l'accès au site (mot de passe ou protection de l'hébergeur) si la
   démonstration ne doit pas être publique.

## 3. Recette

1. Ouvrir le site de démonstration : l'écran de connexion montre « Comptes de démonstration » et la
   phrase « Site de démonstration : comptes et contenus fictifs, partagés par tous les visiteurs. »
2. Un appui sur « Presse » : connexion, accueil rempli seul, page « Gabon Actu Démo » administrée,
   badge Vérifié. Rejouer pour « Administration » (page Officiel) et « Modération ».
3. Sur la production (adresse du site principal) : aucun panneau de démonstration ;
   `modules/platform/demoAccounts:catalogue` rend `[]`.
4. DIASPORA.GA : l'administrateur du réseau n'existe qu'après l'amorçage (§ 7). Après chaque remise à
   zéro, il a disparu : la personne rentre par IDN sur le site des membres et rejoint le réseau, puis
   l'amorçage se rejoue.

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
   (`<site principal>/demo/api/auth`), sans écrire aucun code ni jeton ;
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
  d'animation (point 4). Les huit comptes se recréent au premier appui. L'administrateur de
  DIASPORA.GA, lui, disparaît avec les données : rejouer son adhésion par IDN, puis l'amorçage (§ 7).
- **Limites connues** : par adresse, trois codes par cinq minutes et cinq connexions par quinze
  minutes (seaux du moteur, non desserrés) — plusieurs visiteurs sur le même compte au même moment
  peuvent attendre quelques minutes. Un domaine personnalisé qui remplacerait l'adresse
  `<nom>.convex.cloud` du backend ferme la démonstration (la garde ne reconnaît plus le nom).
- **Fermer la démonstration** : retirer `ANTSIA_DEMO_DEPLOYMENT` du déploiement — le bouton
  disparaît, le catalogue se vide et l'équipement est refusé aussitôt.

## 6. DIASPORA.GA sur la démonstration (ADR-0038)

DIASPORA.GA se publie sur le même backend de démonstration, dans son propre site. Chaque étape se
fait avec l'accord écrit du propriétaire.

1. **Backend de démonstration** :
   - fonctions publiées depuis un `main` qui contient l'ADR-0038 (point 1.4) ;
   - le réseau `diaspora-ga` semé une fois. Poser `ANTSIA_SEEDS_ALLOWED=true`, lancer
     la graine, puis retirer la variable :

     ```bash
     CONVEX_DEPLOY_KEY='<même clé>' bunx convex run modules/diaspora/seed:run '{"confirmNonProduction":"ANTSIA_SEEDS_HORS_PRODUCTION"}'
     ```

   - `TRUSTED_ORIGINS` : l'origine du site DIASPORA.GA de démonstration. `SITE_URL` reste celle
     d'antsia.ga.
   - `APPLICATION_EXTRA_ORIGINS_JSON` (facultative, revue CH-815 A1b) : nomme l'application de
     chaque origine de démonstration (`{"diaspora_ga": ["<origine>"], "admin_diaspora_ga": ["<origine>"]}`),
     chacune aussi dans `TRUSTED_ORIGINS`. Sans elle, le code part à la marque ANTSIA et une
     session de l'application d'administration servie en démonstration n'est jamais scellée pour
     elle : l'administrateur du réseau n'y entre pas. Forme et refus : `.env.example`.
   - L'application d'administration servie à son adresse du catalogue (`site_url` de
     `admin_diaspora_ga` dans `deploy/catalog.json`) n'a besoin de rien dans `TRUSTED_ORIGINS` : les
     adresses du catalogue sont déjà de confiance et nomment déjà leur application. Ne **jamais**
     écrire une adresse du catalogue dans `APPLICATION_EXTRA_ORIGINS_JSON` : une seule faute, et la
     variable entière est ignorée (aucune origine de démonstration ne garde son application).
2. **Site de démonstration DIASPORA.GA** : un projet d'hébergement distinct (ex. `diaspora-ga-demo`).
   - Dossier racine `DIASPORA_GA/apps/diaspora_ga`, Node 24.
   - Installation `cd ../../../ANTSIA && npx --yes bun@1.4.2 install --frozen-lockfile`.
   - Construction `npx --yes bun@1.4.2 run build`.
   - Publication depuis `ECOSYSTEMES`, ANTSIA et DIASPORA.GA à jour de `main`, avec ces variables
     publiques :

     | Variable | Valeur |
     |---|---|
     | `NEXT_PUBLIC_DIASPORA_GA_DATA_SOURCE` | `engine` |
     | `NEXT_PUBLIC_CONVEX_URL` | `https://<nom>.convex.cloud` (démonstration) |
     | `CONVEX_SITE_URL` | `https://<nom>.convex.site` (démonstration) |
     | `NEXT_PUBLIC_SITE_URL` | l'origine du site DIASPORA.GA de démonstration |

     Sans `NEXT_PUBLIC_IDN_PORTAL_URL` ni `NEXT_PUBLIC_CONSULATE_URL`, les liens d'élévation ne
     s'affichent pas.
3. **Recette** : `/entrer` › « Comptes de démonstration » (vingt rôles fictifs). Par exemple,
   Patrice publie, Sandrine signale pour harcèlement, puis Ruth tranche dans `/moderation`, où le
   dossier s'affiche sous « Délais légaux ».
4. **Production** : rien ne change ; `modules/diaspora/demoAccounts:catalogue` y rend `[]`.
5. **Porte des comptes de démonstration** (CH-817, facultative ; fiche
   `Fiche_porte_compte_demo_DIASPORA_GA_2026-11-23.md`, § 7) :
   - variables du déploiement de démonstration, noms seuls dans `.env.example` :
     `ANTSIA_DEMO_GATE_SECRET`, `WHATSAPP_PROVIDER`, `WHATSAPP_ENDPOINT`, `WHATSAPP_API_KEY`,
     `WHATSAPP_TEMPLATE`, `WHATSAPP_FROM` (facultative), `WHATSAPP_TEMPLATE_LANGUAGES` (facultative) ;
   - deux fournisseurs WhatsApp, au choix de `WHATSAPP_PROVIDER` ; toute autre valeur, ou une seule
     pièce manquante ou hors forme, rend la porte « indisponible » :

     | Variable | `bird` (plateforme actuelle de Bird) | `bird-channels` (ancienne API « Channels ») |
     |---|---|---|
     | `WHATSAPP_ENDPOINT` | `<hôte régional>/v1/whatsapp/messages`, en HTTPS | l'adresse des messages du canal WhatsApp, en HTTPS |
     | `WHATSAPP_API_KEY` | clé d'espace de travail (`Authorization: Bearer`) | clé d'accès (`Authorization: AccessKey`) |
     | `WHATSAPP_TEMPLATE` | slug du modèle d'authentification (variable `code`) | `<projet>:<version>` du modèle (variable `code`) |
     | `WHATSAPP_FROM` | numéro E.164 de l'espace de travail : **obligatoire** pour un modèle propre (sans lui, la porte est « indisponible ») ; facultatif et **jamais envoyé** pour un modèle géré par Bird (slug `bird_…`), que Bird refuserait | non lue à l'envoi |
     | `WHATSAPP_TEMPLATE_LANGUAGES` | langues publiées du modèle (BCP-47, séparées par des virgules, seize au plus) ; la langue de l'interface n'est demandée que si elle y figure (`fr-FR` vaut pour `fr`), sinon la langue par défaut du modèle | non lue |

     Une réponse 202 avec l'identifiant du message veut dire « admis par Bird », jamais « reçu » ;
     tout le reste est un envoi manqué (le défi est invalidé, rien n'est journalisé que la raison) ;
   - armée, la connexion d'une adresse `…@demo.diaspora-ga.test` exige le jeton de session de porte
     (en-tête `X-Demo-Gate-Token`) : n'armer qu'APRÈS la publication du moteur et du site qui le
     posent ; avant d'armer, constater en recette `X-Forwarded-For`, la latence de l'envoi WhatsApp
     et le code avec lettre ;
   - la liste des numéros, par la seule voie documentée (numéros sur l'entrée standard, un par
     ligne, jamais dans un dépôt ni tapés dans une commande ; aucun `convex run` à la main) :

     ```bash
     CONVEX_DEPLOY_KEY='<même clé>' bun scripts/demo-gate-list.mjs reset
     CONVEX_DEPLOY_KEY='<même clé>' bun scripts/demo-gate-list.mjs allow < numeros.txt
     CONVEX_DEPLOY_KEY='<même clé>' bun scripts/demo-gate-list.mjs revoke < numeros-a-retirer.txt
     ```

     `reset` à l'armement et à chaque changement du secret, AVANT `allow` : il retire toute la liste
     et ferme les sessions des comptes de démonstration déclarés ; `revoke` les ferme aussi.
     `--dry-run` compte les numéros sans rien envoyer.

## 7. Amorcer le premier administrateur du réseau (ADR-0043, propriétaire)

La démonstration n'a pas de console : le premier administrateur de DIASPORA.GA y est nommé depuis le
terminal du propriétaire, par une fonction interne journalisée. En production, ces fonctions sont
refusées : la console reste le seul chemin. Le compte `demo.administrateur` ne compte pas : il entre
par code et n'administre jamais le réseau (ADR-0042).

**Avant.**

- Les fonctions du moteur sont publiées sur la démonstration, à jour d'un `main` qui contient
  l'ADR-0043 (point 1.4), avec les variables `IDN_*` du client de démonstration et un `SITE_URL` qui
  suit la règle du § 1.
- La personne s'est connectée **par IDN sur le site des membres**, a choisi son identifiant public,
  et a **rejoint le réseau** `diaspora-ga`. Elle figure parmi les comptes de test du client IDN de
  démonstration (sinon identite.ga la refuse avant même le moteur).

**Nommer**, avec la clé du déploiement de démonstration dans l'environnement (jamais dans un
fichier) ; `<identifiant>` est l'identifiant public de la personne, le même dans la phrase et dans
`handle` :

```bash
CONVEX_DEPLOY_KEY='<clé du déploiement de démonstration>' node scripts/convex-dev.mjs run modules/platform/networkAdminBootstrap:nameFirst '{"confirmation":"NAME_FIRST_NETWORK_ADMIN diaspora-ga <identifiant>","networkSlug":"diaspora-ga","handle":"<identifiant>","reason":"<motif, de 10 à 500 caractères>"}'
```

**Retirer** (le retour en arrière) :

```bash
CONVEX_DEPLOY_KEY='<même clé>' node scripts/convex-dev.mjs run modules/platform/networkAdminBootstrap:withdraw '{"confirmation":"WITHDRAW_NETWORK_ADMIN diaspora-ga <identifiant>","networkSlug":"diaspora-ga","handle":"<identifiant>","reason":"<motif, de 10 à 500 caractères>"}'
```

La phrase de confirmation reprend le réseau et l'identifiant tels qu'ils sont tapés dans la
commande. L'identifiant se lit normalisé (`@` de tête retiré, minuscules).

**Résultat** : `{ changed, from, to, personId, handle }` — la personne visée (son identifiant normalisé)
et son rôle avant et après. `changed: false` : la personne était déjà administratrice, rien n'est
écrit. Chaque geste qui change le rôle écrit une ligne au journal du réseau : `membership.role_set`,
qualité `system`, sans acteur, détail `origin: "bootstrap"` et le motif.

**Refus** (code stable dans `appRule`, avec le code d'erreur du moteur) :

| `appRule` | Code | Sens |
|---|---|---|
| `bootstrap_closed` | `policyRefused` | ce déploiement n'est pas la démonstration déclarée (ni le développement local) |
| `bootstrap_confirmation` | `invalidArgument` | la phrase ne correspond pas exactement au geste, au réseau et à l'identifiant |
| `bootstrap_network_unknown` | `notFound` | aucun réseau ne porte cet identifiant d'adresse |
| `bootstrap_network_inactive` | `policyRefused` | le réseau est archivé |
| `bootstrap_network_not_administered` | `policyRefused` | aucune application d'administration de ce réseau au catalogue |
| `bootstrap_person_unknown` | `notFound` | identifiant inconnu ; pour `nameFirst`, aussi un compte d'authentification illisible |
| `bootstrap_membership_missing` | `notFound` | la personne n'a pas rejoint le réseau (aucune adhésion n'est créée d'office) |
| `bootstrap_person_erasing` | `policyRefused` | `nameFirst` : effacement du compte demandé ou fait |
| `bootstrap_demo_account` | `policyRefused` | compte de démonstration (domaine réservé) : ni nommé, ni retiré ici |
| `bootstrap_idn_link_missing` | `policyRefused` | `nameFirst` : aucun lien IDN vivant |
| `bootstrap_membership_inactive` | `statusInsufficient` | `nameFirst` : adhésion en attente ou suspendue |
| `bootstrap_admin_present` | `conflict` | `nameFirst` : un vrai administrateur actif existe déjà (le retirer d'abord, ou le laisser nommer depuis l'application) |
| `bootstrap_not_admin` | `conflict` | `withdraw` : la personne ne tient pas le rôle |

Un motif trop court ou trop long rend `invalidArgument`, règle `DECISION_REASON_LENGTH`.

`withdraw` peut retirer le dernier administrateur actif : le réseau revient à l'état d'avant
l'amorçage, et `nameFirst` peut nommer quelqu'un d'autre. Il n'exige ni lien IDN ni adhésion active :
retirer un pouvoir n'attend jamais.

**Après**, vérifier :

1. la personne entre par l'application d'administration (connexion IDN, entrée `/entrer`) et voit le
   réseau ;
2. `demo.administrateur`, connecté par code, y reçoit le refus ;
3. un deuxième administrateur se nomme depuis l'application d'administration (section des
   responsables, `diaspora/membership.setResponsibleRole`), plus par l'amorçage.
