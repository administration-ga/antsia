# Publication des données de démonstration — 22/10/2026

> Sources : PR 40 (données de démo) et administration-ga/diasporale#23 (10 clés de modération).
> Publication autorisée par écrit par le propriétaire, pour `main` 628e8a9 : démo puis principal,
> contrôles à 390/834/1440 px, retour à `antsia-75eknkz96` si un contrôle échoue.

## Backend (session marketplace, accord écrit du propriétaire)

| Étape | Résultat |
|---|---|
| Convex démo `vivid-hedgehog-655`, puis production `diligent-avocet-585` | `main` 628e8a9, puis 9927c9c (PR 41, SU01d) ; aucun index supprimé |
| Comptes (`prepare-demo-content`) | 7 acteurs reconnectés, 10 figurants créés |
| `seeds/demoContent:run` | 31 publications créées, 21 déjà présentes (vague du 20/10) |
| `seeds/demoContent:runFigurants` | 10 figurants, 20 publications, 30 relations, 16 demandes |
| Images | 47 sur 54 ; restent les 7 actus du jour (PNG trop lourds pour `convex run`) |

## Fronts (Vercel, contexte figé)

Contexte : `git archive` de ANTSIA 628e8a9 (arbre 1b2774d9) et de DIASPORALE df2bca3,
3 232 fichiers, empreinte `98ed496b…`. Secrets serveur hérités, jamais lus.

| Projet | Déploiement | Version | État |
|---|---|---|---|
| Enfant démo | `dpl_FCwtTZXT2xt8SNjHJhEruDmfaV4U` (antsia-demo-lxv1xb7du) | `main-628e8a96be67-demo` | READY, promu |
| Principal | `dpl_Fxg6JPahZcCRo1G5TaaaDf9BSdPX` (antsia-dl360lhin) | `main-628e8a96be67-production` | READY, promu |

Retour arrière : promouvoir `antsia-75eknkz96` (main-2b93836a9187).

Ce front 628e8a9 tourne sur le backend 9927c9c, dont les changements sont additifs : motifs de
signalement en plus, deux genres d'avis (`report_received`, `report_decided`), nouvelles
fonctions, rien de retiré. Seule limite : l'avis d'accusé de réception d'un signalement n'a pas
de phrase tant que le front de 9927c9c n'est pas publié.

## Recette en ligne (compte Membre, Awa MBA)

| Contrôle | 1440 | 834 | 390 |
|---|---|---|---|
| Fil : publications des figurants, photos, portraits | ✓ | ✓ | ✓ |
| Bandeau « 3 invitations en attente » | ✓ | ✓ | ✓ |
| Débordement horizontal | aucun | aucun | aucun |

Autres contrôles :
- Mon réseau : 5 connexions ; invitations reçues (Prisca BIYOGHE, Georgette MAKAYA, Mireille
  NZIGOU) et envoyée (Albert MBOUMBA), avec portraits.
- Personnes à découvrir : figurants avec portrait, « Ajouter » ou « Répondre à l'invitation ».
- Épicerie : 12 produits sur la vitrine et « Voir tout le catalogue » (13) ; les 12 photos sont
  servies en 200 et se décodent aux bonnes dimensions.
- Marketplace (onglet Produits) : 13 produits.
- Écran de connexion de la démo : toujours huit comptes, aucun figurant.
- Site principal (hors démo) : 1440/834/390 sans débordement ; aucune ressource en erreur après
  rechargement.
- Santé : `/api/sante-fonctionnelle` et `/demo/api/sante-fonctionnelle` rendent les versions
  ci-dessus.

## Restes

1. Les 7 actus du jour de la démo : `seed-demo-content.mjs` avec la clé de démonstration
   (rejouable, ne pose que ce qui manque), ou le prochain passage des graines.
2. Le front de `main` 9927c9c (PR 41, « Mes signalements ») reste à publier.
3. La fiche boutique laisse beaucoup de vide à 1440 px : catalogue sur deux colonnes étroites
   dans un cadre de 768 px (ShopFrame `max-w-3xl`), déjà relevé le 21/10.

## Mise à jour — publication de `main` 1942aa7 (iCom en colonne droite)

- Entre-temps : backend 9927c9c (PR 41), fronts 3ba59c7 publiés par la session marketplace ; recette
  connectée conforme (cloche : 3 demandes ; marketplace : 13 produits et 20 services).
- Les 7 actus du jour sont posées (images 54/54), sans clé, par la connexion CLI du Mac.
- PR 44 : `MessagerieDock` revient en tête de la colonne droite du fil (décision du propriétaire).
  Front seul, aucun changement sous `convex/`.
- Fronts promus (accord écrit du propriétaire) :
  - enfant démo : `dpl_CXq6fxP6AjzaP4te2C9p2gZFACi5` (antsia-demo-g8bhjmocb), version `main-1942aa7ebfb5-demo` ;
  - principal : `dpl_DR58SLXdJnfHYhgG1xuD8pSgoJAn` (antsia-fl8eoqzvl), version `main-1942aa7ebfb5-production`.
  - Contexte : ANTSIA 1942aa7 et DIASPORALE 214831c, 3 236 fichiers, empreinte `35dac378…`.
  - Retour arrière : antsia-fqt7jo4yd (principal) et antsia-demo-9wd9liokh (enfant).
- Recette :
  - 1440 : iCom (« Messages ») en tête de la colonne droite, puis Personnes à découvrir ;
  - 834 : colonne droite repliée, comme prévu ;
  - 390 : bande des actus avec images ;
  - aucun débordement horizontal, aucune ressource en erreur.
- Reste : la démo n'a encore aucune conversation, donc iCom affiche « Aucune conversation » pour
  les comptes de démonstration.

## Mise à jour — publication de `main` 26f3024 (iCom et iCom Pro, ADR-0036, ICP-1)

- PR 48 : deux espaces de messagerie, iCom (relations, réseau) et iCom Pro (clients des boutiques,
  achats et démarches, mises en relation, partenaires), reliés par une pilule « iCom | iCom Pro ».
  La pilule n'apparaît qu'en présence d'une activité pro (capacité `icomPro`, ANTSIA seul ;
  DIASPORALE inchangé). Front seul : les fonctions lues existaient déjà côté backend.
- Fronts promus (accord écrit du propriétaire) :
  - enfant démo : `dpl_9enxa1jfp5N7kKuhgdYdFL9ph18e` (antsia-demo-7ljagkvjb), version `main-26f30241dcd6-demo` ;
  - principal : `dpl_DZPsAskwLLXSrkZc5B2sQDNpR6eJ` (antsia-jqoi0thyr), version `main-26f30241dcd6-production`.
  - Contexte : ANTSIA 26f3024 et DIASPORALE 214831c, 3 255 fichiers, empreinte `a986a77d…`.
  - Retour arrière : antsia-fl8eoqzvl (principal) et antsia-demo-g8bhjmocb (enfant).
- Recette (compte Membre de la démo, Awa MBA) :

| Contrôle | 1440 | 834 | 390 |
|---|---|---|---|
| Rail : entrée « iCom » | ✓ | ✓ | ✓ |
| `/messages` : pilule, iCom courant, lien vers `?espace=pro` | ✓ | ✓ | ✓ |
| `?espace=pro` : puces Atelier Tech Démo · Mes achats et démarches · Mises en relation | ✓ | ✓ | ✓ |
| Contacts : « Mon réseau » (iCom) ; clients, partenaires, boutiques contactées (iCom Pro) | ✓ | ✓ | ✓ |
| Appels : journal (iCom et iCom Pro à 1440, iCom à 834) | ✓ | ✓ | — |
| Débordement horizontal | aucun | aucun | aucun |

- Autres contrôles : la carte iCom de la colonne droite porte la pilule (1440) ; la boutique sans
  mandat de lecture renvoie vers son équipe (`/demo/mes-boutiques/<id>`) ; aucune ressource en
  erreur sur le fil ni sur iCom Pro ; site principal : `/`, `/entrer`, `/messages`,
  `/messages?espace=pro` en 200 ; santé des deux sites aux versions ci-dessus.
- Restes :
  1. la démo n'a encore aucune conversation (iCom comme iCom Pro) : objet du lot ICP-2 (graine
     `seeds/demoConversations:run`, après déploiement Convex) ;
  2. coquille relevée en ligne : « les messages de Atelier Tech Démo » (élision), corrigée dans
     ICP-2 avec « Voir le profil de {{name}} ».

## Mise à jour — Convex et front `main` bca19af (conversations de démonstration, ICP-2)

- Backend (session des déploiements, accord écrit du propriétaire) : Convex bca19af sur
  vivid-hedgehog-655 puis diligent-avocet-585, aperçu `--dry-run` d'abord, schéma validé, aucun
  index ajouté ni retiré, 1 032 fonctions identiques des deux côtés.
- Graine `seeds/demoConversations:run` sur la démo seule : mandats 3, réglages 3, 11 échanges
  iCom (25 messages), 8 fils boutique (15 messages). Aucune politique du canal boutique n'existait
  sur la racine de la démo : la graine l'a ouvert (`channelOpened: true`). Rien en production.
- Fronts promus (accord écrit du propriétaire) :
  - enfant démo : `dpl_BpRereVWQ8zhgR1y5euHFzWYpaQe` (antsia-demo-8hbfvxcy0), version `main-bca19af78116-demo` ;
  - principal : `dpl_8rCFPmjTZNoy3bZMTyQSQzFRqJMm` (antsia-ojavnpvwd), version `main-bca19af78116-production`.
  - Contexte : ANTSIA bca19af et DIASPORALE 214831c, 3 256 fichiers, empreinte `a3087c28…`.
  - Retour arrière : antsia-jqoi0thyr (principal) et antsia-demo-7ljagkvjb (enfant).
  - Contenu par rapport à 26f3024 : élision des libellés iCom Pro et PR 49 (gouttière unique
    dans les espaces spécialisés). Les PR 51 et 52, fusionnées après bca19af, ne sont pas publiées.
- Recette (compte Membre de la démo, Awa MBA) :

| Contrôle | 1440 | 834 | 390 |
|---|---|---|---|
| Fil : carte iCom avec la pilule (1440), rail « iCom » avec 4 non lus | ✓ | ✓ | ✓ |
| iCom : 4 conversations, 4 non lus | ✓ | — | ✓ |
| iCom Pro : 3 fils clients d'Atelier Tech Démo (close, en attente, acceptée) | ✓ | — | ✓ |
| iCom Pro, contacts : 3 clients, boutique contactée | — | ✓ | — |
| Marketplace | ✓ | ✓ | — |
| Vitrine de l'Épicerie (couverture décodée, 13 images) | — | — | ✓ |
| Débordement horizontal, ressources en erreur | aucun | aucun | aucun |

- Avant la publication, constaté sur 26f3024 avec le nouveau backend : la conversation de boutique
  avec Kévin MOUNGUENGUI s'ouvre (messages, accord d'appel, actions) ; « Mes achats et démarches »
  montre l'échange avec l'Épicerie. Aucune conversation non lue n'a été ouverte (la démo est
  partagée : l'ouvrir la marquerait lue pour les visiteurs suivants).
- Site principal : `/`, `/entrer`, `/fil`, `/messages`, `/messages?espace=pro`, `/marketplace`
  en 200 ; santé des deux sites aux versions ci-dessus.
- Restes : publication des PR 51 et 52 (accord du propriétaire) ; ICP-3 (réglages pro).

## Mise à jour — publication de `main` 94f6506 (écrans de membre en pleine largeur)

- Contenu par rapport à bca19af : PR 51 (vitrine, catalogue, offres et annuaires sur toute la
  colonne), PR 52 (tous les écrans de membre en pleine largeur, sections et champs en colonnes
  responsives), PR 53 (registre). Aucun changement sous `convex/` : backend bca19af inchangé.
- Fronts promus (accord écrit du propriétaire) :
  - enfant démo : `dpl_BWKUKSSy3a6zQBHnw6qgyRtNpWG2` (antsia-demo-h8ppd65uo), version `main-94f6506aa59e-demo` ;
  - principal : `dpl_8Ecd8htmb6iqePmrp8iTRtPSkWEP` (antsia-mrgyt8eyx), version `main-94f6506aa59e-production`.
  - Contexte : ANTSIA 94f6506 et DIASPORALE 214831c, 3 259 fichiers, empreinte `504530ff…`.
  - Retour arrière : antsia-ojavnpvwd (principal) et antsia-demo-8hbfvxcy0 (enfant).
- Recette (compte Membre de la démo, Awa MBA) :

| Contrôle | 1440 | 834 | 390 |
|---|---|---|---|
| Fil (carte iCom avec la pilule à 1440, bandeau des 3 invitations) | ✓ | ✓ | ✓ |
| Mon espace : contenu sur toute la colonne (1 120 / 690 / 366 px) | ✓ | ✓ | ✓ |
| Réglages : sections en deux colonnes au bureau, une au téléphone | ✓ | ✓ | ✓ |
| Vitrine de l'Épicerie : toute la colonne, couverture et images visibles décodées | ✓ | ✓ | ✓ |
| iCom (4 non lus) et iCom Pro (3 fils clients) | — | ✓ | ✓ |
| Débordement horizontal, élément hors de l'écran, ressource en erreur | aucun | aucun | aucun |

- Site principal : `/`, `/entrer`, `/fil`, `/moi`, `/parametres`, `/messages`,
  `/messages?espace=pro`, `/marketplace` en 200 ; santé des deux sites aux versions ci-dessus.
- Non publiés : PR 54 (transparence, restes de SU01d ; touche `convex/modules/moderation` et
  `convex/modules/public`) et diasporale#25, fusionnés après 94f6506 : déploiement Convex puis
  accord du propriétaire.

## Mise à jour — backend `d7f4784` et console (délais légaux de SU01d)

- Contenu : PR 58, la console des délais légaux (export étendu, requête `legalDeadlineAlert`).
  - Le backend de `main` `d7f4784` est identique à celui de 597e1b6 sous `convex/` et dans les paquets
    du moteur ; la PR 59 ne touche que le front d'antsia.ga.
  - Écart avec le backend `f574c75` en ligne : `convex/modules/platform/console.ts` et
    `packages/social-domain/src/moderationPolicy.ts`. `@diasporale/domain` est identique depuis 56098a5.
- Accord écrit du propriétaire, le 22/10, pour : démo, puis production, puis la console.
- Contexte : `git archive` d'ANTSIA `d7f4784` et de DIASPORALE `d18dd20`, sans `.env.local` ;
  connexion CLI du Mac, aucune clé.

| Étape | Résultat |
|---|---|
| Aperçus `--dry-run`, démo et production | aucun index supprimé, schéma validé ; seule ligne : « version Node des actions », artefact connu de la CLI |
| Convex démo `vivid-hedgehog-655` | 1 034 → 1 035 fonctions : `modules/platform/console.js:legalDeadlineAlert` ajoutée, aucune retirée |
| Convex production `diligent-avocet-585` | idem ; signatures identiques à la démo |
| Console `antsia-admin` | `dpl_EKFVB2iJerWY4up3KgLyRbNWUc5U` (antsia-admin-3smpcs4kx), publiée sans bascule, contrôlée (READY, 302 SSO), puis promue |

- Console en ligne :
  - santé `{"status":"ok","version":"d7f4784","backend":"configured"}` ;
  - `/`, `/entrer` et `/sante-fonctionnelle` en 200 ;
  - CSP sur `diligent-avocet-585`, HSTS, `X-Frame-Options: DENY` ;
  - l'entrée IDN s'affiche (bouton actif, « IDN niveau 2 minimum »), sans erreur dans la console du navigateur.
- Variables : aucune modifiée. `NEXT_PUBLIC_BUILD_SHA` n'a été passé qu'au build.
- Retour arrière : `dpl_CiJGfViWVpxnaKHZDEn8R9jdxgHW` (antsia-admin-b0ap9n83e, version 4ab6a4f du 19/10).
- antsia.ga : fronts inchangés (`main-880d1aadf525`). `/` et `/transparence` en 200, comme `/demo`
  et `/demo/transparence`.
- Restes, au propriétaire :
  - recette connectée de la console : un client IDN de niveau 2 qui connaisse l'adresse de retour
    de la console, et un premier opérateur ;
  - fronts d'antsia.ga de `main` `d7f4784` (PR 59) : non publiés par cette session.

## Mise à jour — publication de `main` 6db0a29 (fil sans cadre, Suivre ou Ajouter ; ADR-0037)

- Contenu par rapport aux fronts `880d1aa` en ligne :
  - PR 59 : média bord à bord dans la carte, carte pleine largeur au téléphone ;
  - angles des sept thèmes (16, 12 et 6 px) ;
  - actions compactes de 25 px, barre des destinations en verre ;
  - PR 62 : Suivre, Suivre en retour ou Ajouter sur chaque suggestion, carrousel « Personnes à découvrir » ;
  - PR 62 encore : retour à la colonne unique au bureau, la grille de la PR 59 étant retirée à la demande du propriétaire ;
  - PR 60 et 61 (registre, comptes de démonstration DIASPORALE) entrent aussi.
- Publication demandée par le propriétaire le 22/10 : « commit, pousse et déploie ».
- Contexte : `git archive` d'ANTSIA `6db0a29` et de DIASPORALE `fcde290`, sans `.env.local`, connexion CLI du Mac, aucune clé.
  `@diasporale/domain` est identique à `d18dd20`.

| Étape | Résultat |
|---|---|
| Aperçus `--dry-run`, démo et production | aucun index supprimé, schéma validé ; seule ligne : « version Node des actions », artefact connu |
| Convex démo `vivid-hedgehog-655` | 1 035 fonctions avant et après, signatures identiques (`followsYou` est un champ de réponse de `suggestions.paginate`) ; la logique de la PR 61 part avec, fermée hors de la démonstration déclarée |
| Convex production `diligent-avocet-585` | idem ; relevé des fonctions identique à la démo |
| Front, enfant démo | `dpl_2sneRNRxMoQ5fLQEtC1P2Ww7MouR` (antsia-demo-9o837ytn1), version `main-6db0a2917abd-demo`, READY, 302 SSO, promu |
| Front, principal | `dpl_7pRfdCa6dYVkyQDyQyajdhpt8JK1` (antsia-gxx0we8lv), version `main-6db0a2917abd-production`, READY, 302 SSO, promu |

- Contexte figé : 3 270 fichiers, empreinte `d101b26f…`.
- Retour arrière : antsia-cklu264gn (principal) et antsia-demo-74l9c4xz8 (enfant), versions `880d1aa`.
- Santé : `main-6db0a2917abd-production` et `main-6db0a2917abd-demo`.
- Pages en 200, CSP sur `diligent-avocet-585`, HSTS et `X-Frame-Options: DENY` :
  - `/`, `/entrer`, `/fil`, `/moi`, `/messages`, `/marketplace`, `/transparence` ;
  - `/demo`, `/demo/entrer`, `/demo/fil`, `/demo/transparence`.
- Recette en ligne, en lecture seule (démo partagée, compte Membre Awa MBA) :

| Contrôle | 1440 | 390 |
|---|---|---|
| Fil en colonne unique (aucune grille), carte de 784 px à l'angle de 16 px | ✓ | — |
| Média sur toute la largeur de la carte (784 × 523 px, photo 3:2) | ✓ | ✓ |
| Carte pleine largeur au téléphone (`x = 0`, 390 px, angle 0) | — | ✓ |
| Barre basse en verre, 54 px | — | ✓ |
| Suggestions : Suivre et Ajouter, ou Répondre à l'invitation | ✓ (colonne droite) | ✓ (carrousel) |
| Débordement horizontal | aucun | aucun |

- Variables : aucune modifiée.
- Restes :
  - lot 3 de l'ADR-0037 (formules des boutiques), non commencé dans le code ;
  - publication DIASPORALE sur la démonstration (ADR-0038, PR 61) : à faire, avec l'accord du propriétaire.

## Mise à jour — DIASPORALE sur la démonstration (ADR-0038)

- Demande du propriétaire, le 22/10 : publier DIASPORALE. Choix « Chantier backend démo », puis accord écrit
  « Tout, dans cet ordre » pour cinq étapes : fonctions sur la démo, graine, site, origine de confiance, recette.
- Code : antsia#61 (`4feeea0`, ADR-0038 : comptes de démonstration DIASPORALE sur la démonstration déclarée) ;
  diasporale#27 (`fcde290`, texte du panneau).
- Contexte : `git archive` d'ANTSIA `4feeea0` et de DIASPORALE `fcde290`, sans `.env.local`, connexion CLI du Mac, aucune clé.

| Étape | Résultat |
|---|---|
| Aperçu `--dry-run`, démo | cible `okatech:antsia-demo:demo` ; aucun index supprimé, schéma validé ; seule ligne : « version Node des actions », artefact connu |
| Convex démo `vivid-hedgehog-655` | fonctions de `4feeea0`, 1 035 avant et après ; `modules/diaspora/demoAccounts:catalogue` rend les 20 comptes |
| Production `diligent-avocet-585` | non touchée par cette publication ; catalogue `[]`, réseau `diasporale` absent |
| Graine | `ANTSIA_SEEDS_ALLOWED=true`, `modules/diaspora/seed:run` (réseau `diasporale` créé, hub FR), puis variable retirée |
| Site | projet Vercel `diasporale-demo` (`prj_ZJN43UbhX5PHO64qL80pa2mAmUnq`) ; déploiement `dpl_AHPTXYChXkVMRYwFtFwHhDVQaaTo` (diasporale-demo-ocsgzkrcs), READY en 191 s, version `diasporale-fcde2902a42b-antsia-4feeea0a773f-demo` |
| Origine de confiance | `TRUSTED_ORIGINS=https://diasporale-demo.vercel.app` sur la démo (neuf variables) |

- Réglages du projet : dossier racine `DIASPORALE/apps/diasporale_com`, Node 24, installation
  `cd ../../../ANTSIA && npx --yes bun@1.4.2 install --frozen-lockfile`, construction `npx --yes bun@1.4.2 run build`.
- Variables publiques passées au build et à l'exécution du déploiement seulement :
  - `NEXT_PUBLIC_DIASPORALE_DATA_SOURCE=engine` ;
  - `NEXT_PUBLIC_SITE_URL` ;
  - `NEXT_PUBLIC_CONVEX_URL` et `CONVEX_SITE_URL` (démo) ;
  - `NEXT_PUBLIC_BUILD_SHA`.
  Aucun secret.
- Contexte figé : 3 273 fichiers, empreinte `aafb4565…`.
- Accès : https://diasporale-demo.vercel.app est public (200 sur `/`, `/entrer`, `/sante-fonctionnelle`). La protection
  Vercel standard couvre les autres adresses du projet.
- Recette en ligne, avec les comptes de démonstration :
  - Patrice MBOUMBA publie un texte fictif, que Sandrine ONDO signale pour harcèlement ;
  - dans `/moderation`, Ruth ALLOGHO voit « Délais légaux » : « Art. 24 : décision notifiée sous 72 h »,
    « Reste 71 h 59 min », échéance le 25/10 à 12:17, accusé de réception envoyé le 22/10 à 13:17 ;
  - la file ordinaire dit « Aucun autre dossier ouvert » ;
  - à 390 px, aucun débordement ;
  - console du navigateur : un 401 au changement de compte, déjà connu.
- Le dossier de recette est laissé ouvert : la voie se voit en entrant comme Ruth.
- Une autre session a ensuite publié `main` `6db0a29` sur les deux backends (section précédente). Vérifié après coup :
  le catalogue, le réseau, `TRUSTED_ORIGINS` et la voie de Ruth fonctionnent toujours ; la production reste fermée.
- Retour arrière : retirer `TRUSTED_ORIGINS` de la démo ferme toute connexion depuis le site ; retirer le projet
  Vercel `diasporale-demo` le met hors ligne (au propriétaire).
- Restes, au propriétaire :
  - DIASPORALE en production : décision d'hébergement A10, textes légaux relus par un juriste, domaine
    diasporale.com, réseau créé par la console ;
  - republier le site de démonstration à chaque publication du moteur (`docs/23` § 6).

## Mise à jour — ADR-0039 : console admise au niveau IDN 1 (backend et console `3253a10`)

- Contenu : PR 63 (ADR-0039). Les gardes de la console lisent `CONSOLE_MIN_LOA = 1` ; la console
  affiche « IDN niveau 1 minimum ».
- Décisions du propriétaire, le 22/10 : « Abaisser au niveau 1 », puis le périmètre « Seulement l'ADR-0039 ».
- Backend : `main` `3253a10` = le backend en ligne `6db0a29` plus l'ADR-0039, rien d'autre.
  - La PR 65 (`ffe016a`, marketplace, `bannerUrl` des cartes d'annuaire) est fusionnée après la PR 63
    et volontairement non embarquée.
  - Juste avant chaque envoi : `shops:directory` et `marketplaceShops:search` sans `bannerUrl`, donc la
    PR 65 n'est pas en ligne et rien ne lui est retiré.
  - Sa session est prévenue : publier `ffe016a` après cet envoi, puisqu'il contient déjà l'ADR-0039.
- Contexte : `git archive` d'ANTSIA `3253a10` et de DIASPORALE `fcde290`, sans `.env.local` ;
  connexion CLI du Mac, aucune clé.

| Étape | Résultat |
|---|---|
| Aperçu `--dry-run`, démo | aucun index supprimé, schéma validé |
| Convex démo `vivid-hedgehog-655` | 1 035 → 1 035 fonctions, signatures identiques (seule la logique des gardes change) |
| Convex production `diligent-avocet-585` | idem ; signatures identiques à la démo |
| Console `antsia-admin` | `dpl_3rhQmzyR9KA2w1UguE2n1jkbHfZ8` (antsia-admin-nta6qmgwi), contrôlée (READY, 302 SSO), puis promue |

- Console en ligne : santé `{"status":"ok","version":"3253a10","backend":"configured"}`. `/entrer` dit
  « IDN niveau 1 minimum », sans erreur dans la console du navigateur.
- Retour arrière : `dpl_EKFVB2iJerWY4up3KgLyRbNWUc5U` (antsia-admin-3smpcs4kx, `d7f4784`).
- Premier opérateur : à la demande du propriétaire, une ligne `operators` (`platform_admin`) pour sa
  propre personne, la seule en production.
  - Posée par import en ajout sur `diligent-avocet-585` ; aucune autre donnée touchée.
  - Le code n'en crée toujours aucune (ADR-0011).
- Départ IDN contrôlé depuis la console, sans saisie :
  - redirection vers `identite.ga/sign-in`, client `antsia_prd_dnWDNoy7` ;
  - retour central `https://antsia.vercel.app/api/auth/oauth2/callback/idn`, `prompt=login`, PKCE ;
  - `TRUSTED_ORIGINS` contient `https://antsia-admin.vercel.app`.
- Variables : aucune modifiée.
- Reste : la recette connectée, quand le propriétaire se connecte avec IDN sur https://antsia-admin.vercel.app.

## Mise à jour — formules des boutiques en ligne (ADR-0037, lot 3) : front seul, sur la base en ligne

- Demande du propriétaire, le 22/10, après avoir vu le rendu : « fusionne la PR 67 et publie le lot 3 (fronts enfant
  puis principal) », puis « commit, pousse et déploie en ligne ».
- PR 67 fusionnée dans `main` (`0c7150c`) :
  - `bun run verify` vert sur `main` `ff8954e` + lot 3 : 741 s, 15 483 tests, lint sans erreur ;
  - la PR 70 est entrée entre-temps : typage d'antsia.ga, tests boutique, panier et remise (253) et cliquets (150)
    verts sur `main` `2ae6c6f` + lot 3.
- Ce qui part : le lot 3 SEUL, sur la base en ligne.
  - `main` porte aussi les lots 1 à 3 de la marketplace (PR 65, 69 et 70), non publiés. La PR 65 attend son backend :
    `bannerUrl` des cartes d'annuaire, absent de `shops:directory` et de `marketplaceShops:search` en démo comme en
    production (relevé juste avant l'envoi). Publier `main` les aurait mis en ligne sans ce backend.
  - Commit publié : `998b598`, branche `release/front-lot3-3253a10` (poussée). Il vaut `3253a10` (backend en ligne :
    `6db0a29` + ADR-0039) plus le diff du lot 3 (`daeca1e`), mêmes seize fichiers. `convex/` est identique à
    `3253a10` : aucun backend à envoyer.
  - Versions étiquetées `release-998b59872cd4-*` (et non `main-…`), méta `antsiaReleaseBranch=release/front-lot3-3253a10`.
  - Sessions voisines prévenues avant l'envoi (marketplace ; console, dont le correctif IDN est dans identite.ga).
- Vérification du commit publié : `bun run verify` vert (714 s, 15 469 tests, lint sans erreur) ; rendu contrôlé sur un
  backend local isolé, à 390 et 1 440 px : fiche du riz bord à bord, panneau prix à 1 440 px, « Obtenir un devis »,
  « Acheter », aucun débordement.
- Contexte : `git archive` d'ANTSIA `998b598` et de DIASPORALE `fcde290`, sans `.env.local` ; 3 272 fichiers, empreinte `c13d7193…`.

| Étape | Résultat |
|---|---|
| Front, enfant démo | `dpl_3xpobDuJCG7V92ug8rLj5QQwsQJU` (antsia-demo-bblosaang), version `release-998b59872cd4-demo`, READY en 162 s, 302 SSO, promu |
| Front, principal | `dpl_3bEibVz37nUwCUN417eWLwUUVUKh` (antsia-letiizofb), version `release-998b59872cd4-production`, READY en 191 s, 302 SSO, promu |

- Retour arrière : antsia-gxx0we8lv (principal) et antsia-demo-9o837ytn1 (enfant), versions `6db0a29`.
- Santé : `release-998b59872cd4-production` et `release-998b59872cd4-demo`.
- Pages en 200, CSP sur le backend de chaque site, HSTS et `X-Frame-Options: DENY` :
  - `/`, `/entrer`, `/fil`, `/moi`, `/messages`, `/marketplace`, `/transparence` ;
  - `/demo/entrer`, `/demo/fil`, `/demo/transparence`.
  - `/demo` (accueil de l'enfant) répond 200 sans CSP ni `X-Frame-Options`. Les règles d'en-têtes sont inchangées
    depuis `6db0a29` : ce n'est pas un effet de cet envoi.
- Recette en ligne, en lecture seule (démo partagée, compte Membre Awa MBA) :
  - 390 px : 20 publications, aucun débordement, aucune erreur dans la console ;
  - 1 440 px : colonne unique, cartes de 784 px à l'angle de 16 px, médias bord à bord (784 px), aucun débordement ;
  - le paquet servi contient le code des formules (`data-offer-formula`) et l'enveloppe du moteur (`rp-charte-offer`).
  - Aucune des 76 publications de la démo n'est liée à une offre (`commerceOffer`). La formule ne s'y voit donc pas
    tant qu'une boutique ne publie pas une offre ; elle est vérifiée sur le commit publié (ci-dessus). Trois liaisons
    ont ensuite été posées sur la démo, à la demande du propriétaire (section suivante).
- Variables : aucune modifiée.
- Suite : la prochaine publication de `main` embarque le lot 3, déjà fusionné : d'abord le backend de la PR 65, puis
  les fronts.

### Formules des boutiques visibles sur la démo : trois publications liées à leur offre

- Demande du propriétaire, le 22/10 : « pose sur la démo quelques publications de boutiques liées à leurs offres, pour voir
  les formules en ligne ».
- Posé par l'interface de la démo, avec ses comptes de démonstration (panneau de `/demo/entrer`, un clic, aucun identifiant
  saisi). Chaque changement de compte passe par « Se déconnecter », qui révoque les sessions du compte partagé : parcours
  normal de l'application.
  - Patrick MOUSSAVOU (Commerçant) :
    - nouvelle publication sans photo au nom d'Épicerie Moussavou Démo (« Démo — Le riz parfumé est de retour en rayon… »,
      `k57jyma47gb51331zqtyk77x3n8graf3`), liée à `demo:offer:riz-parfume` ;
    - publication existante du poisson fumé (`k57j90f1dxarrbpryktszhbt598gp48y`), liée à `demo:offer:poisson-fume`.
  - Jean-Rémy NDONG (Membre vérifié, Studio Objectif Démo) : publication existante du mariage
    (`k57psh971fyqyvegrsanqg8gds8gp5c1`), liée à `demo:offer:reportage-mariage`.
- Liaisons faites depuis la gestion de la boutique, étape « 3. Mes offres », bloc « Une offre dans une publication ».
  On les retire au même endroit (« Retirer l'offre associée ») ; la publication du riz se supprime depuis son menu.
- Recette en ligne, vue de Jean-Rémy :

| Contrôle | 390 | 1 440 |
|---|---|---|
| Riz : photo de l'offre bord à bord, `cover`, sans bandes | ✓ (390 × 488 px) | ✓ (353 × 441 px, panneau prix à droite) |
| Riz : titre, description, 6 500 XAF, bandeau « Acheter » | ✓ | ✓ |
| Poisson fumé : bandeau « Acheter » (3 500 XAF) collé sous la photo de la publication | ✓ | — |
| Mariage : bandeau « Obtenir un devis » (sur devis) | ✓ | — |
| Colonne unique, carte de 784 px | — | ✓ |
| Débordement horizontal | aucun | aucun |

- Captures : `docs/etudes/2026-10-22-fil-sans-cadre/recette/lot3-en-ligne-*.jpg`.
- Production : rien de posé.

## Mise à jour — panneau prix en deux tiers, bouton d'achat sur chaque publication des boutiques de la démo

- Demande du propriétaire, le 22/10, devant la fiche produit en ligne : « la place réservée normalement à l'image photo doit
  prendre les 2/3 de l'espace, et le 1/3 l'espace de description ». Il signale aussi des produits sans bouton d'achat.
  Puis : « finaliser ça et puis tu mets en ligne, tu déploies ».
- Code : PR 74 (`676a6cf`), grille du panneau prix `2fr / 1fr` dès 480 px de carte, test de la fiche complété.
  `bun run verify` vert sur `main` `d37f51d` + ce changement : 564 s, 15 496 tests, lint sans erreur.
- Publication, front seul, sur la base en ligne :
  - `a7a5d78`, branche `release/front-lot3-3253a10` en avance rapide : `998b598` + ce changement seul. Les lots de la
    marketplace (PR 65, 69, 70 et 73) restent hors ligne : `bannerUrl` toujours absent du backend.
  - Typage d'antsia.ga et 160 tests boutique verts sur `a7a5d78`.
  - Contexte : 3 272 fichiers, empreinte `009adb81…`, DIASPORALE `fcde290`.

| Étape | Résultat |
|---|---|
| Front, enfant démo | `dpl_4utjMBGK78kxEMheWqNJgnakCGtM` (antsia-demo-psc3q7y5q), version `release-a7a5d78bce90-demo`, READY en 186 s, 302 SSO, promu |
| Front, principal | `dpl_45wDHqELEQuUSBMJRDr89RB2tECq` (antsia-1bj5ooe7n), version `release-a7a5d78bce90-production`, READY en 204 s, 302 SSO, promu |

- Retour arrière : antsia-letiizofb (principal) et antsia-demo-bblosaang (enfant), versions `998b598`.
- Boutons d'achat : les cinq autres publications des boutiques de la démo sont liées à leur offre, par l'interface (comptes de
  démonstration), comme les trois premières. Les huit publications des trois boutiques ont désormais leur bouton :

| Boutique (compte) | Publication | Offre | Bouton |
|---|---|---|---|
| Épicerie Moussavou Démo (Patrick MOUSSAVOU) | Riz, sans photo | `demo:offer:riz-parfume` | fiche, « Acheter » |
| Épicerie Moussavou Démo | Poisson fumé | `demo:offer:poisson-fume` | « Acheter », 3 500 XAF |
| Épicerie Moussavou Démo | Panier en raphia | `demo:offer:panier-raphia` | « Acheter », 8 500 XAF |
| Épicerie Moussavou Démo | Boissons au bissap et au gingembre | `demo:offer:epicerie-produits` (Panier du marché) | « Acheter », 1 500 XAF |
| Studio Objectif Démo (Jean-Rémy NDONG) | Mariage | `demo:offer:reportage-mariage` | « Obtenir un devis » |
| Studio Objectif Démo | Portraits, photos de produits, reportages | `demo:offer:reportage-photo` | « Obtenir un devis » |
| Atelier Tech Démo (Awa MBA) | Formation bureautique | `demo:offer:formation-bureautique` | « Voir l'offre », 20 000 XAF |
| Atelier Tech Démo | Diagnostic, entretien | `demo:offer:diagnostic-informatique` | « Voir l'offre », 5 000 XAF |

- Les deux prestations à prix fixe de l'Atelier n'ont aucun mode de commande déclaré : leur page n'offre ni commande ni
  réservation. Le bouton dit donc honnêtement « Voir l'offre ». Un produit dit « Acheter », une offre sur devis « Obtenir un
  devis ».
- Recette en ligne :
  - 1 440 px, fil : carte de 784 px, photo du riz 523 × 653 px (2/3), description 261 px (1/3), « Acheter » dessous,
    aucun débordement ;
  - pages des trois boutiques : huit formules ;
  - 390 px : fiche en colonne (photo puis description), aucun débordement.
- Capture : `docs/etudes/2026-10-22-fil-sans-cadre/recette/lot3-en-ligne-panneau-deux-tiers-1440.jpg`.
- Production : aucune donnée posée. Variables : aucune modifiée.

## Mise à jour — `main` a0d26d0 en ligne : la marketplace façon ventes privées (lots 1 à 4) publiée

- Décision du propriétaire, le 22/10 : « publie d'abord la marketplace déjà faite (backend de la PR 65 puis fronts) ».
  Entrent en ligne les PR 65, 69, 70 et 73 (accueil en grandes cartes, boutique, panier et remise, pages qui vendent
  selon leur nature), avec tout `main` (lot 3 et panneau prix compris). La session marketplace a été prévenue.
- Backend : export propre (`git archive` d'ANTSIA `a0d26d0` et de DIASPORALE `367c2bd`, sans `.env.local`, connexion CLI
  du Mac, aucune clé). Seul changement depuis `3253a10` : `bannerUrl` des cartes d'annuaire (PR 65).

| Étape | Résultat |
|---|---|
| Aperçus `--dry-run`, démo et production | aucun index supprimé, schéma validé ; seule ligne : « version Node des actions », artefact connu |
| Convex démo `vivid-hedgehog-655` | 1 035 fonctions avant et après ; deux signatures changées, `shops:directory` et `marketplaceShops:search` (`bannerUrl`) |
| Convex production `diligent-avocet-585` | idem ; relevé des fonctions identique à la démo |
| Front, enfant démo | `dpl_5bn2vvuauhDHYLUMoMh6PToig5F9` (antsia-demo-qr9euc0gt), version `main-a0d26d0e657e-demo`, READY en 130 s, 302 SSO, promu |
| Front, principal | `dpl_7LjNpLT4emEjjLREJHjDwn3pDCYU` (antsia-efvqokxab), version `main-a0d26d0e657e-production`, READY en 157 s, 302 SSO, promu |

- Contexte figé : 3 288 fichiers, empreinte `ba571431…`. Le code (hors documentation) est celui de `676a6cf`, vérifié par
  `bun run verify` (15 496 tests).
- Retour arrière des fronts : antsia-1bj5ooe7n (principal) et antsia-demo-psc3q7y5q (enfant), versions `release-a7a5d78bce90`.
  Le backend `a0d26d0` reste compatible avec eux : il n'ajoute qu'un champ de réponse.
- Santé : `main-a0d26d0e657e-production` et `main-a0d26d0e657e-demo`. Pages en 200, CSP sur le backend de chaque site :
  `/`, `/entrer`, `/fil`, `/marketplace`, `/marketplace?view=services`, `/mes-boutiques`, `/transparence`, `/demo/entrer`,
  `/demo/fil`, `/demo/marketplace`, `/demo/boutique/epicerie-moussavou-demo`, `/demo/page/epicerie-moussavou-demo`.
- Recette en ligne (démo, compte Commerçant Patrick MOUSSAVOU) : accueil de la marketplace à 1 440 et 390 px. On y voit les
  grandes cartes des boutiques et des prestataires avec leur bannière, les pastilles Produits, Mode, Alimentation, Services
  et Boutiques. 36 images, aucune cassée, aucun débordement.
- Variables : aucune modifiée.

## Mise à jour — `main` 1956641 en ligne : Ma boutique, Découvrir par univers, Alimentation et restauration (SU02, SU06)

- Décision du propriétaire, le 22/10 : « publie d'abord la marketplace déjà faite, puis Ma boutique, Découvrir par univers et
  l'univers Alimentation et restauration ». La marketplace était en ligne avec `a0d26d0` (PR 76). Cette entrée couvre la
  PR 77 : détail dans l'[exécution des sept univers](etudes/2026-10-21-sept-univers-et-vie-publique/EXECUTION.md).
- Backend : export propre (ANTSIA `1956641`, DIASPORALE `367c2bd`, sans `.env.local`), connexion CLI du Mac, aucune clé.

| Étape | Résultat |
|---|---|
| Aperçus `--dry-run`, démo et production | aucun index supprimé, schéma validé ; seule ligne : « version Node des actions », artefact connu |
| Convex démo `vivid-hedgehog-655` | 1 035 fonctions. Sept signatures changent comme prévu : le gabarit `food` élargit la configuration d'activité (getStorefront, getMyShop, startShop, storefront, updateShop), et les cartes de directory et de search portent `template` |
| Convex production `diligent-avocet-585` | idem ; relevé des fonctions identique à la démo |
| Front, enfant démo | `dpl_4sT3LWvwNv8nx4RdTKR3VwmopwZf` (antsia-demo-rkhg6vy4f), version `main-1956641d5b31-demo`, READY en 196 s, 302 SSO, promu |
| Front, principal | `dpl_Bwn7jYpb1NvoRChFXiYimacTPcEF` (antsia-k46y2qudx), version `main-1956641d5b31-production`, READY en 216 s, 302 SSO, promu |

- Retour arrière des fronts : antsia-efvqokxab (principal) et antsia-demo-qr9euc0gt (enfant), versions `a0d26d0`. Le backend
  `1956641` reste compatible avec eux : il élargit une liste et ajoute un champ de réponse.
- Santé : `main-1956641d5b31-production` et `main-1956641d5b31-demo`. Pages en 200 : `/`, `/fil`, `/marketplace`,
  `/restauration`, `/explorer`, `/mes-boutiques`, `/demo/restauration`, `/demo/explorer`, `/demo/mes-boutiques`.
- Donnée de démonstration : l'Épicerie Moussavou Démo passe au gabarit « Alimentation et restauration », par son éditeur
  (compte Commerçant). Production : rien de posé.
- Recette en ligne (démo, compte Commerçant), captures dans
  `docs/etudes/2026-10-21-sept-univers-et-vie-publique/recette/en-ligne-*.jpg` :
  - 1 440 px : rail « Ma boutique » ; carte de tableau de bord (gérer, vitrine, page, clients) ; Découvrir et ses trois
    piliers, tuile Alimentation comprise ; `/restauration` avec l'épicerie et 13 offres de démonstration. Aucune image
    cassée, aucun débordement ;
  - 390 px : carte de l'adresse à 12 px de marge, aucun débordement, « Mon activité » dans « Créer ».
- Variables : aucune modifiée.

## Mise à jour — `main` 4cea752 en ligne : menu, horaires, plat du jour et « Commander » (SU06, second volet)

- Demande du propriétaire, le 23/10 : « continue l'univers Alimentation et restauration — menu, horaires, plat du jour et
  « Commander » ». Puis son accord détaillé de publication : « publie main 4cea752. Backend prod diligent-avocet-585
  (--dry-run puis déploiement), puis fronts enfant démo puis principal, promus ; retour arrière antsia-k46y2qudx /
  antsia-demo-rkhg6vy4f. Puis pose le plat du jour de l'épicerie démo et fais la recette en ligne. » Cette entrée couvre
  la PR 80 : détail dans l'[exécution des sept univers](etudes/2026-10-21-sept-univers-et-vie-publique/EXECUTION.md).
- Backend : export propre (ANTSIA `4cea752`, DIASPORALE `367c2bd`, sans `.env.local`), connexion CLI du Mac, aucune clé.

| Étape | Résultat |
|---|---|
| Aperçus `--dry-run`, démo et production | aucun index supprimé, schéma validé ; seule ligne : « version Node des actions », artefact connu |
| Convex démo `vivid-hedgehog-655` | 1 035 → 1 036 fonctions. Six signatures changent comme prévu : `catalog:postOffer` (`shopTemplate`), `marketplaceShops:search` et `shops:directory` (cartes : `hours`, `dailySpecial`), `shops:getMyShop` et `shops:storefront` (`dailySpecial`), et la nouvelle `shops:setDailySpecial` |
| Convex production `diligent-avocet-585` | idem ; relevé des fonctions identique à la démo |
| Front, enfant démo | `dpl_2nKjUh85YosaKKe1okboKwL9BcaK` (antsia-demo-nztj6rb03), version `main-4cea752365fe-demo`, READY en 164 s, 302 SSO, promu |
| Front, principal | `dpl_3ZU2j8XX1EotaYB6Piqzdg6iz1Uv` (antsia-j01r1n6se), version `main-4cea752365fe-production`, READY en 114 s, 302 SSO, promu |

- Ordre réel : le backend de la démo est parti juste après la fusion de la PR 80, AVANT l'accord de publication. Il
  n'ajoutait que des champs et une fonction : les fronts `1956641` sont restés sains (santé et pages contrôlées). La
  production a attendu l'accord : le contrôle des permissions l'a refusée sans lui.
- Contexte figé : 3 298 fichiers, empreinte `b4a0fe4c…`. Le code (hors documentation) est celui de la PR 80, vérifié par
  `bun run verify` (15 516 tests).
- Retour arrière des fronts : antsia-k46y2qudx (principal) et antsia-demo-rkhg6vy4f (enfant), versions `1956641`. Le
  backend `4cea752` reste compatible avec eux : il n'ajoute que des champs de réponse et une mutation.
- Santé : `main-4cea752365fe-production` et `main-4cea752365fe-demo`. CSP : chaque site sur son seul backend. Pages en
  200 : `/`, `/fil`, `/marketplace`, `/restauration`, `/explorer`, `/mes-boutiques`, `/demo/restauration`,
  `/demo/explorer`, `/demo/mes-boutiques`, `/demo/boutique/epicerie-moussavou-demo`, `/demo/page/epicerie-moussavou-demo`.
- Donnée de démonstration : le plat du jour de l'Épicerie Moussavou Démo, posé par son éditeur (compte Commerçant) :
  « Poisson fumé au feu de bois — Démo », pour le 23/10. Il ne vaut que ce jour-là (Libreville). Production : rien de
  posé.
- Horaires de l'épicerie : vides à la publication (leur pose n'était pas demandée), puis posés le 23/10 vers 23 h 55
  (heure de Paris) à la demande du propriétaire, par l'éditeur et le compte Commerçant : « Du lundi au samedi, de 7 h à
  20 h ». Retour « Modifications enregistrées », vitrine toujours publiée. Vérifiés en ligne dans l'en-tête de la
  vitrine et sous la carte de `/restauration`, à 1 440 et 390 px, sans débordement ni image cassée. Captures
  `en-ligne-su06-horaires-*.jpg`.
- Recette en ligne (démo, compte Commerçant), captures dans
  `docs/etudes/2026-10-21-sept-univers-et-vie-publique/recette/en-ligne-su06-*.jpg` :
  - éditeur : « Aujourd'hui : Poisson fumé au feu de bois — Démo » et la confirmation « Plat du jour annoncé. » ;
  - 1 440 px : la vitrine (plat du jour en 2:1, « Voir le menu », « Menu ») ; la page de l'épicerie, dont les quatre
    publications liées disent « Commander » et mènent à la fiche du produit ; `/restauration` et sa rangée « Plats du
    jour » ;
  - 390 px : la vitrine (photo de 342 × 257 px) et l'univers (tuile de 240 px), aucun débordement, aucune image cassée.
- Variables : aucune modifiée.
