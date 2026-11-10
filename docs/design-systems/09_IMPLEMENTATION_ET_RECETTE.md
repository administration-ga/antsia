# Implémentation des sept design systems dans ANTSIA

**20 octobre 2026 — sources réelles et recette locale.**

Référence : [ANTSIA, sept thèmes et huit rubriques](https://claude.ai/artifact/AnLxkaqaai725ywzkrVk6b#page-c71058556eba).
[Index](README.md) · [Socle](00_SOCLE_COMMUN.md) · [Constat initial](08_ECARTS_REFERENCE_ET_CODE.md).

## Résultat

Gaboma, Soleil, Forêt, Corail, Lagon, Électrique et Sable habillent les composants
déjà servis par l’application. Le thème choisi reste celui du compte ; apparence
et motif conservent leur portée existante. Les routes, données, habilitations,
consentements, sessions et contrôleurs de communication restent ceux du moteur.

Les couleurs fondamentales sont conservées. Les nouveaux raccords sont opt-in :
jetons à `initial` dans `packages/ui/src/styles/charte.css`, valeurs définies
uniquement par les sept chartes ANTSIA et anciens styles en repli dans le moteur.
Les tests d’isolation de DIASPORALE et de la console passent.

## Couverture des huit rubriques

| Rubrique | Sources raccordées | Présentation appliquée |
|---|---|---|
| Les sept thèmes | Sept CSS `packages/ui/src/themes/antsia*.css`, `theme-picker.tsx`, primitives et kit UI | Nuanciers, clair/sombre, polices, géométrie, contrastes, motifs et profondeur |
| Accueil et accès | `access-home-screen`, `sign-in-screen`, `welcome-screen`, `public/*` | Marque avec point, navigation responsive, porte IDN/OTP, aperçu de profil, aperçu public SSR réel, sommaire mobile/bureau |
| Fil et vie sociale | `shell/ReseauAgentPage`, `shell/mobile`, features réseau, actus et notifications, découverte et préférences du fil | Colonnes, gouttières, cartes, textes riches, composeur, recherche, listes et états existants |
| Messages et directs | Styles et conversation iCom, DirectPage/Studio/Discussion/Antenne, iAppel | Titres, champs, corps, surfaces et rôles ; conférence raccordée via DirectPage |
| Profils et pages | ProfilPersonnePage, ProfilPagePage, Avatar, ProfilFrame, AlbumPage/AlbumsSection, `moi/me-screen` | Avatar de profil 104 px, grande page rayon 24 px, médias, titres et espace personnel |
| Boutiques et achats | Composants réels `shops/`, `cart/`, `checkout/`, `payment/`, `purchases/` | Vitrine, catalogue, offre, contact, panier, préparation, paiement, achat et gestion ; panneaux responsive et étapes distinctes |
| Emplois et services | Composants réels `jobs/` et `services/` | Offre, candidature, pièces, demandes, devis, rendez-vous et prestations ; états et consentements existants |
| Compte et données | Paramètres, PersonalControls, modération, santé et coque membre | Affichage, langue/fuseau, consentements, export/effacement, décisions et état du service |

Les 60 planches sont des références de composition. Leurs personnes, messages,
prix, offres et compteurs ne sont pas injectés dans l’application.

## Mesures et arbitrages

- Corps Inter **15 px / 1,5**, champs **16 px / 1,4**.
- Titres Familjen Grotesk : **26 / 20 / 16 px**, interlignes **1,1 / 1,2 / 1,3**.
- Carte **24 px**, intérieur **16 px**, espacement intérieur **12 px** ;
  champ **14 px**, média **16 px**, badge **6 px**, puce **10 px**.
- Cibles tactiles **44 px** conservées, conformément à la règle écrite de la référence.
- Créer **52 × 52 px**, rayon **18 px**, ombre à **75 %** de l’aplat.
- Dock carte **88 %**, flou **16 px**, rayon **28 px** ; téléphone côtés **12 px**,
  bas **16 px** ; tablette largeur **540 px**, bas **26 px**.
- Bureau : grille **248 px / centre flexible / 312 px**, gap **24 px**,
  maximum **1 400 px**, gouttières **20 px** selon la composition.
  Depuis le 22/10/2026 (demande du propriétaire) : **une seule gouttière**,
  plus de maximum. La marge extérieure vaut l'écart entre les colonnes, et la
  barre du haut comme le bandeau démo s'y alignent : **16 px** de 768 à
  1 199 px, **24 px** au-delà (jeton Tailwind `--spacing-gutter`). La colonne
  centrale prend la largeur restante ; le téléphone ne change pas.
- Tablette du fil : colonne **728 px**, padding **8 / 24 / 140 px** ;
  téléphone **4 / 12 / 120 px**.
- Les exceptions d’ombre de **Soleil** et **Corail** suivent les CSS des maquettes.
  Les autres cartes restent plates ; Électrique garde son anneau.
- Fonds doux message et réaction calculés en sRGB à **15 % / 18 %**, avec
  vérification des contrastes ; grain radial **5 / 7 / 11 px** et projecteur **85 % / 55 %**.
- Messages conserve la barre iCom **Menu / Conversations / Appels / Contacts**,
  comme `Messages.dc.html` ; les pages sociales gardent les cinq destinations.

## Vérifications exécutées

| Vérification | Résultat |
|---|---|
| `bun run codegen`, déploiement anonyme local | Réussi ; typage strict Convex réussi |
| Types application, UI et social-features | Réussis |
| Tests application | **756 / 756**, 102 fichiers |
| Tests UI | **2 263 / 2 263**, 17 fichiers ; nouvelle mesure de référence et isolation incluses |
| Tests social-features | **4 026 / 4 026**, 260 fichiers |
| Cliquets transverses | **140 / 140**, 25 fichiers |
| Compilation Next.js optimisée et typage de build | Réussis |
| Lint application, UI et social-features | **0 erreur**, avertissements du dépôt conservés |
| Espaces finaux et liens Markdown locaux | Contrôlés |

Les assertions CSS de géométrie vérifient aussi les anciens replis et les
scrollers du moteur. Un test de candidature utilisait un mauvais prototype de
Storage dans jsdom : le test vise désormais le stockage réel, sa garde métier
n’a pas changé. La fixture d’état inconnu est explicitement distincte de la
fixture de candidature valide.

## Recette sur l’application servie

Serveur **localhost:3030** existant, moteur anonyme local sur **3210**.
Compte local de démonstration vérifié, sans connexion à une cible de production.

- Paramètres : **sept thèmes × clair/sombre** à 1 440 × 1 024.
  Corps 15 px, titre 26 px, champ 16 px et absence de débordement vérifiés.
- Téléphone **390 × 844** : paramètres, messagerie, profil, candidatures,
  demandes, données personnelles, page publique et état du service.
- Tablette **834 × 1 194** : fil, paramètres et vitrine existante ;
  dock 540 px centré et colonne de fil 728 px mesurés.
- Accueil : passage FR/EN immédiat du titre et de l’aperçu public vérifié, puis français rétabli.
- Le conflit `inline-flex` / `hidden` du menu public a été corrigé puis
  revérifié : marque et Entrer au téléphone ; sommaire ouvrable.
- Le profil réel, la vitrine de démonstration et les états vides de
  conversations, candidatures et demandes sont affichés sans données inventées.
- Préférences du compte de démonstration rétablies : **Lagon, Système, Aucun**.
  Tailles temporaires du navigateur rétablies.

![Sept thèmes dans les paramètres réels](recette/sept-themes-desktop.jpg)

![Paramètres au téléphone](recette/parametres-mobile.jpg)

![Sommaire public mobile](recette/page-publique-mobile.jpg)

### Gouttière unique (22/10/2026)

Candidat tiré de `main`, backend Convex local isolé, sept comptes de
démonstration et contenu fictif semés ; aucune cible de démonstration ni de
production. Mesures prises dans la page (`getBoundingClientRect`), sur `/fil` :

| Largeur | Marge gauche | Écart rail / fil | Écart fil / colonne droite | Marge droite | Barre du haut (gauche / droite) |
|---|---|---|---|---|---|
| 1 024 px | 16 | 16 | — (pas de colonne droite) | 16 | 16 / 16 |
| 1 280 px | 24 | 24 | — (pas de colonne droite) | 24 | 24 / 24 |
| 1 440 px | 24 | 24 | 24 | 24 | 24 / 24 |
| 1 920 px | 24 | 24 | 24 | 24 | 24 / 24 |

- La colonne du fil mesure 880, 960, 784 puis 1 264 px ; les publications
  l'occupent entière, en Liste comme en Immersion.
- Réglages et Messages, à 1 440 px : rail à 24 px du bord, écart de 24 px, contenu
  jusqu'à 24 px du bord droit.
- Téléphone **390 px** : coquille inchangée (cartes à 12 px des bords), sans
  défilement horizontal.
- Le bandeau démo n'existe qu'avec le backend de démonstration : sa classe
  `px-gutter` a été mesurée dans la page, à 16 px puis 24 px dès 1 200 px.

![Fil à 1 440 px : 24 px aux bords comme entre les colonnes](recette/gouttiere-fil-1440.jpg)

![Fil à 1 920 px](recette/gouttiere-fil-1920.jpg)

![Fil à 1 280 px](recette/gouttiere-fil-1280.jpg)

![Fil à 1 024 px, rail compact](recette/gouttiere-fil-1024.jpg)

![Fil au téléphone, 390 px](recette/gouttiere-fil-390.jpg)

### Gouttière des espaces spécialisés (22/10/2026)

Boutique, prestataire, professionnels et média ont leur propre cadre
(`specialized-page.tsx`). Il suit désormais la même règle : dès 768 px, le
jeton `--spacing-gutter` fait la marge extérieure, l'écart entre le rail de
l'espace et son contenu, et le retrait de la barre de l'espace. Le cadre de
1 440 px centré est retiré. Le téléphone ne change pas : barre basse fixe,
retraits de 12 px, puis 24 px de 640 à 767 px.

Même candidat et même méthode que ci-dessus. Mesures prises sur
`/boutique/epicerie-moussavou-demo`, `/prestataire/studio-objectif-demo`,
`/professionnels`, `/media/gabon-actu-demo` et `/presse`. Les quatre espaces
donnent les mêmes valeurs :

| Largeur | Marge gauche | Écart rail / contenu | Marge droite | Barre de l'espace (gauche / droite) | Colonne de contenu |
|---|---|---|---|---|---|
| 1 024 px | 16 | 16 | 16 | 16 / 16 | 880 |
| 1 280 px | 24 | 24 | 24 | 24 / 24 | 1 000 |
| 1 440 px | 24 | 24 | 24 | 24 / 24 | 1 160 |
| 1 920 px | 24 | 24 | 24 | 24 / 24 | 1 640 |

- La marge gauche se mesure aux destinations du rail. Le rail n'a plus de
  retrait intérieur : le fond de la destination active touche la gouttière.
- Téléphone **390 px** : barre basse fixe d'un bord à l'autre, contenu et barre
  de l'espace à 12 px, sans défilement horizontal. À 700 et 767 px : 24 px,
  comme avant. À 768 px : 16 / 16 / 16.
- Piège corrigé : Tailwind 4 émet `sm:` (en rem) après `min-[768px]:` (en px).
  Le `min-[1200px]:px-8` du contenu ne s'appliquait donc jamais. Le `sm:` est
  désormais borné au téléphone (`sm:max-[768px]:`).
- Reste hors de ce lot : plusieurs écrans se centrent eux-mêmes dans la colonne,
  avec leur propre largeur maximale :
  - la vitrine, le catalogue, les offres et les formulaires de boutique ou de
    prestataire (`ShopFrame` de `shop-ui.tsx`, 768 px). À 1 920 px, la vitrine
    laisse 436 px de chaque côté de son bloc ;
  - l'annuaire des professionnels (1 024 px) ;
  - l'annuaire presse (1 152 px).

  La vitrine, le catalogue, les offres et les annuaires occupent désormais toute
  la colonne : voir la section suivante.

![Boutique à 1 440 px : 24 px aux bords comme entre le rail et le contenu](recette/gouttiere-boutique-1440.jpg)

![Boutique à 1 920 px : la vitrine reste centrée dans sa colonne](recette/gouttiere-boutique-1920.jpg)

![Boutique à 1 280 px](recette/gouttiere-boutique-1280.jpg)

![Boutique à 1 024 px, rail compact](recette/gouttiere-boutique-1024.jpg)

![Boutique au téléphone, 390 px](recette/gouttiere-boutique-390.jpg)

### Pleine colonne des écrans des espaces (22/10/2026)

Décision du propriétaire, après la capture de la boutique à 1 920 px : « que la
vitrine, le catalogue, les offres et les annuaires occupent toute la colonne
(formulaires à arbitrer sur capture) ».

- `ShopFrame` (`shop-ui.tsx`) et `ProfessionalFrame` (`profile-fields.tsx`)
  prennent `width="column"`. Dans ce mode, l'écran n'a plus de largeur maximale
  ni de centrage. Il est passé par :
  - la vitrine de la boutique ;
  - le catalogue et les offres, de la boutique comme du prestataire ;
  - la présentation du prestataire ;
  - l'annuaire des professionnels.

  L'annuaire presse perd son propre `max-w-6xl`.
- Par défaut, `width="reading"` : les formulaires et les pages de gestion gardent
  leur largeur de lecture centrée, en attendant l'arbitrage. Cela vaut pour le
  contact, le devis, la préparation, la fiche et l'éditeur du profil pro, et les
  collaborations. L'arbitrage est venu le même jour : tous les écrans passent en
  pleine largeur et `width` disparaît (section suivante).
- Les grilles étaient déjà fluides. À 1 920 px, le catalogue
  (`auto-fill, minmax(18rem, 1fr)`) passe à cinq colonnes. La fiche d'offre se
  met sur deux colonnes, média et en-tête, dès que son conteneur atteint 832 px.
- Deux retouches, visibles seulement en pleine colonne :
  - dès 768 px, le lien de retour s'aligne sur le titre au lieu de flotter au
    centre. Au téléphone, il garde toute la largeur ;
  - en deux colonnes, l'en-tête de l'offre reste groupé en haut
    (`align-content: start`). Avant, il s'étirait sur la hauteur du média
    (779 px à 1 920 px) et ses lignes s'écartaient.

Mesures prises dans la page, sur huit écrans :
- boutique : vitrine, catalogue et offre ;
- prestataire : présentation, prestations et offre ;
- les annuaires des professionnels et de la presse.

Les huit écrans donnent les mêmes valeurs. Le bloc de l'écran va du rail, plus
la gouttière, jusqu'à la gouttière du bord droit :

| Largeur | Écart rail / écran | Bloc de l'écran (gauche / droite) | Largeur de l'écran |
|---|---|---|---|
| 1 024 px | 16 | 128 / 16 | 880 |
| 1 280 px | 24 | 256 / 24 | 1 000 |
| 1 440 px | 24 | 256 / 24 | 1 160 |
| 1 920 px | 24 | 256 / 24 | 1 640 |

Au téléphone (390 px), les huit écrans restent à 12 / 12 px, sans défilement
horizontal. Le lien de retour garde toute la largeur (366 px).

![Vitrine à 1 920 px : toute la colonne, catalogue sur cinq colonnes](recette/colonne-vitrine-1920.jpg)

![Catalogue à 1 920 px](recette/colonne-catalogue-1920.jpg)

![Offre à 1 920 px : média et en-tête sur deux colonnes, en-tête groupé en haut](recette/colonne-offre-1920.jpg)

![Présentation du prestataire à 1 920 px](recette/colonne-prestataire-1920.jpg)

### Pleine largeur de tous les écrans de membre (22/10/2026)

Décision du propriétaire, après les captures d'arbitrage des formulaires :
« le design doit être uniforme, s'adapter à tous les formats (responsive) et
les écarts cohérents. en plein largeur. »

- Plus aucune largeur de lecture centrée dans les trois gabarits : `ShopFrame`,
  `ProfessionalFrame` et `EditorialFrame`. Tous leurs écrans occupent la colonne,
  formulaires compris.
- Les autres écrans de membre centrés font de même :
  - Réglages et Mon espace ;
  - Découvrir, le fil national et les préférences du fil ;
  - Marketplace, Modération et Rencontres ;
  - le site d'un média côté membre.

  Rencontres perd aussi ses retraits latéraux en double dès 768 px.
- Colonnes responsives partagées (`components/shared/screen-layout.ts`) :
  - `SCREEN_SECTIONS` sert aux sections, aux cartes et aux zones de texte.
    Chaque colonne fait 32rem au moins : une colonne jusqu'à 1 280 px de
    fenêtre, deux à 1 440 px, trois à 1 920 px ;
  - `FORM_FIELDS` sert aux champs courts, avec 16rem au moins. Deux champs
    tiennent côte à côte dès 528 px, comme avec `sm:grid-cols-2`.

  Entre deux colonnes, l'écart vaut la gouttière ; l'écart vertical de chaque
  écran est gardé. `SCREEN_SUBMIT` fait que, dès 768 px, le bouton d'envoi
  garde sa largeur au lieu de traverser la colonne.
- Les écrans réorganisés en colonnes :
  - les formulaires :
    - le profil pro (profil d'un côté ; réalisations, activités et visibilité
      de l'autre) ;
    - le devis, le rendez-vous et la prestation ;
    - la préparation de commande (champs et récapitulatif côte à côte) ;
    - la candidature (champs et pièces côte à côte) ;
  - les listes de commandes, d'achats, de paiements, de candidatures, de
    demandes, de boutiques, d'offres d'emploi et de lignes de panier ;
  - les détails d'un achat, d'un paiement, d'une préparation et d'une demande ;
  - la fiche pro, les collaborations et la présentation de l'éditeur de
    boutique ;
  - Réglages, Mon espace, et les contenus de Découvrir.
- Le cliquet `member-screens-full-width` interdit qu'un écran de membre se
  borne puis se centre. Il nomme les exceptions, qui ne sont pas des écrans de
  membre :
  - les pages publiques ;
  - la lecture d'un article (76ch) ;
  - les cartes d'état (session, notification, erreur) et l'accueil d'un nouveau
    compte ;
  - la page autonome des données personnelles ;
  - la coque des réseaux sans destinations.

Mesures prises dans la page, sur dix écrans :
- Réglages, Mon espace, Mes boutiques, Découvrir, Marketplace, Rencontres ;
- Ma rédaction, l'éditeur du profil pro, la vitrine et le fil national.

Le bloc de chaque écran va du rail, plus la gouttière, jusqu'à la gouttière du
bord droit. Le cadre de membre a un rail de 96 puis 248 px, celui des espaces de
96 puis 208 px.

| Largeur | Écart rail / écran | Bloc (membre) | Bloc (espace) | Colonnes de sections |
|---|---|---|---|---|
| 1 024 px | 16 | 128 / 16, 880 px | 128 / 16, 880 px | 1 |
| 1 280 px | 24 | 296 / 24, 960 px | 256 / 24, 1 000 px | 1 |
| 1 440 px | 24 | 296 / 24, 1 120 px | 256 / 24, 1 160 px | 2 |
| 1 920 px | 24 | 296 / 24, 1 600 px | 256 / 24, 1 640 px | 3 (2 pour Mes boutiques et le profil pro) |

- Les paires de champs du profil pro restent côte à côte à toutes ces largeurs.
- Téléphone (390 px) : les dix écrans restent à 12 / 12 px, sans défilement
  horizontal. Les retraits propres de Rencontres (16 px) ne changent pas.
- Laissés tels quels :
  - la liste d'équipe de la Modération, un filtre de tête sur toute la largeur ;
  - les listes de la rédaction (`md:grid-cols-2`) et les trois choix d'activité
    (`sm:grid-cols-3`), déjà en colonnes ;
  - les grilles internes des composants, qui gardent leurs écarts de 8 à 16 px.

![Réglages à 1 920 px : trois colonnes](recette/largeur-reglages-1920.jpg)

![Réglages à 1 440 px : deux colonnes](recette/largeur-reglages-1440.jpg)

![Mon espace à 1 920 px](recette/largeur-mon-espace-1920.jpg)

![Mes boutiques à 1 920 px : la liste et la préparation côte à côte](recette/largeur-mes-boutiques-1920.jpg)

![Profil pro à 1 920 px : deux groupes, champs en paires, bouton à sa largeur](recette/largeur-profil-pro-1920.jpg)

### Marketplace sur le modèle des ventes privées, lot 1 : l'accueil (22/10/2026)

Demande du propriétaire, avec les captures d'une application de ventes privées :
des boutiques en grandes cartes, une par ligne au téléphone et trois ou quatre
par ligne au bureau, et des « moments » qui défilent. Ses décisions du jour :
rien d'inventé (aucun prix barré, remise, sponsor, minuterie ni total
d'articles, absents du moteur) ; la bannière de la page s'ajoute à la carte de
boutique du moteur.

- `/marketplace` sans paramètre devient l'accueil ; toute recherche, vue ou
  rayon garde les résultats d'avant, sous le même en-tête :
  - un salut au nom du membre (`displayName`, jamais découpé) ;
  - ses paniers, avec leur nombre de lignes ;
  - la recherche des produits. Sa suggestion tourne sur de vrais rayons du
    registre et reste fixe si le mouvement est réduit.
- Pastilles qui défilent : Accueil, Produits, les six rayons de premier niveau,
  Services, Boutiques. Une recherche en cours suit le changement de rayon ; une
  seule pastille est active.
- Sections de l'accueil, toutes lues dans le moteur :
  - « Boutiques » : vitrines de produits en grandes cartes. La bannière fait la
    photo, avec le nom en haut, la spécialité ou le modèle en bas à gauche, le
    badge calculé et la zone en bas à droite ;
  - « Prestataires de services » : vitrines sur devis, en carrousel de grandes
    cartes ;
  - « Nouveautés » et « Services » : offres les plus récentes, en carrousel ;
  - la sélection de démonstration, avec sa mention.

  Une section vide ou un index en préparation disparaît.
- Carte d'offre commune, au membre comme au SSR :
  - galerie à points, photo entière sur fond clair ;
  - marque et couleur publiées (facettes), sinon le nombre de variantes ;
  - prix exact et lien vers le vendeur ;
  - indisponibilité récente signalée ;
  - aucune remise.

  Côté membre, l'action « Au panier » ajoute d'un geste une offre au prix exact
  sans variante. « Choisir » ouvre une feuille avec la sélection réelle des
  variantes. La démonstration et les offres à consulter n'ont pas de bouton.
- « Filtrer » ouvre le formulaire de filtres existant dans une feuille (en bas
  au téléphone, à droite dès 768 px). Le bouton flotte au-dessus de la barre
  d'onglets jusqu'à 1 023 px, puis rejoint la barre de l'écran. Une recherche
  appliquée rend le focus au titre. Un bouton ramène en haut de la page.
- Écarts : grilles et carrousels à 12 px au téléphone, puis sur la gouttière
  (`--spacing-gutter`) dès 768 px, comme les marges.

Mesures sur `/marketplace` et `/marketplace?vue=produits` (backend local du
candidat, contenu de démonstration) :

| Largeur | Bloc | Grandes cartes (colonnes) | Grille d'offres (colonnes) | Défilement horizontal |
|---|---|---|---|---|
| 390 px | 12 / 12, 366 px | 1 | 2 (177 px) | aucun |
| 1 024 px | 128 / 16, 880 px | 3 | 4 | aucun |
| 1 280 px | 296 / 24, 960 px | 3 | 4 | aucun |
| 1 440 px | 296 / 24, 1 120 px | 3 | 5 | aucun |
| 1 920 px | 296 / 24, 1 600 px | 4 | 6 | aucun |

Défaut trouvé et corrigé pendant la recette : le lien du vendeur, aligné à
gauche dans la grille, prenait sa largeur de contenu (260 px dans une carte de
177 px) et élargissait la page à 477 px au téléphone. Il est désormais borné à
la carte.

![Accueil à 390 px](recette/marketplace-accueil-390.jpg)

![Résultats à 390 px : deux colonnes et « Filtrer » flottant](recette/marketplace-produits-390.jpg)

![La feuille de filtres au téléphone](recette/marketplace-filtres-390.jpg)

![Accueil à 1 024 px](recette/marketplace-accueil-1024.jpg)

![Accueil à 1 280 px](recette/marketplace-accueil-1280.jpg)

![Accueil à 1 440 px](recette/marketplace-accueil-1440.jpg)

![Accueil à 1 920 px : quatre grandes cartes par ligne](recette/marketplace-accueil-1920.jpg)

Limite : en local, aucune offre réelle (pas de PRO.GA). Les carrousels
« Nouveautés » et « Services » et l'ajout au panier se prouvent par les tests ;
les offres de démonstration refusent le panier par conception.

### Marketplace sur le modèle des ventes privées, lot 2 : la boutique (22/10/2026)

Suite de la même demande : l'expérience à l'intérieur d'une boutique, de la
vitrine à la fiche, toujours sans rien inventer.

- Vitrine (`/boutique/:handle`) :
  - en-tête de la boutique : la bannière de sa page en photo (16:9 au
    téléphone, 3:1 dès 768 px, 22 rem de haut au plus), le logo, le nom (titre
    de l'écran) et l'identifiant posés sur un voile ; sans bannière, une carte
    neutre ;
  - mentions réelles : badge calculé, capacités de l'activité, spécialité,
    zone ; puis « Voir les offres », suivre ou ne plus suivre la page, l'échange
    déjà ouvert, la gestion et la version sans compte ;
  - blocs dans l'ordre configuré. Les offres : une collection qui défile par
    collection non vide (dès deux, quatre au plus), puis la première page en
    grille avec l'ajout rapide. En aperçu, seulement des rangées complètes (à
    cinq colonnes, dix des douze offres). Puis la présentation et les
    publications ;
  - conditions déclarées : cinq cartes à icône quand la boutique en a publié ;
    sinon une seule carte où chaque rubrique dit « Non renseigné ».
- En-tête de l'espace : la marque de la boutique (logo et nom) au centre mène à
  la vitrine ; au téléphone, le retour à ANTSIA se réduit à sa flèche (son nom
  accessible reste). « Panier » porte le nombre de lignes du panier.
- Catalogue (`/boutique/:handle/catalogue`) :
  - barre d'outils : « Filtrer » ouvre les filtres existants dans une feuille
    (en bas au téléphone, à droite dès 768 px). « Voir les résultats » reste
    visible en bas de la feuille pendant que les filtres défilent, ici comme
    sur la marketplace ;
  - grille ou lignes, au choix, retenu par ce navigateur ;
  - collections en pastilles et filtres appliqués en puces qu'on retire ;
  - grille de 2 à 6 colonnes et lignes de 1 à 3 colonnes, selon la place
    réelle ; ajout rapide sur chaque carte.
- Fiche (`/boutique/:handle/offres/:offerRef`) :
  - galerie à points au téléphone, à vignettes dès 768 px ;
  - nom, prix exact, vendeur, puis la sélection réelle ;
  - à partir de 832 px de fiche, deux colonnes, les informations restant en vue
    pendant le défilement ;
  - au téléphone, une barre d'achat fixe au-dessus des onglets de l'espace : la
    quantité en − / + et « Ajouter au panier ». Elle est reliée au formulaire de
    sélection par l'attribut `form`, donc les mêmes contrôles et le même envoi ;
  - suivent les conditions de la boutique et « Dans la même boutique ».

Mesures (backend local du candidat, boutique de démonstration « Épicerie
Moussavou Démo », douze offres) :

| Largeur | Bloc | Vitrine (colonnes, carte) | Catalogue grille / lignes | Fiche | Défilement horizontal |
|---|---|---|---|---|---|
| 390 px | 12 / 12, 366 px | 2 (177 px), écart 12 | 2 / 1 | 1 colonne, photo 334 px | aucun |
| 1 024 px | 128 / 16, 880 px | 4 (208 px), écart 16 | 4 / 2 | 2 colonnes de 404 px | aucun |
| 1 280 px | 256 / 24, 1 000 px | 4 (232 px), écart 24 | 4 / 2 | 2 colonnes de 464 px | aucun |
| 1 440 px | 256 / 24, 1 160 px | 5 (213 px), 2 rangées de 5 | 5 / 2 | 2 colonnes de 544 px | aucun |
| 1 920 px | 256 / 24, 1 640 px | 6 (253 px), 2 rangées de 6 | 6 / 3 | 2 colonnes de 784 px | aucun |

« Dans la même boutique » : cartes de 152 px (écart 12) au téléphone, de 224 px
(écart 16 puis 24) ensuite.

Défauts trouvés et corrigés pendant la recette :

- au téléphone, le libellé du retour serrait la marque de la boutique : réduit
  à sa flèche quand une marque est affichée ;
- sans conditions publiées, cinq cartes « Non renseigné » prenaient un écran :
  une seule carte compacte ;
- « Voir les résultats » attendait au bas d'un formulaire de 2 148 px dans la
  feuille : barre fixée au bas de la feuille (`sticky`, sans marge dessous) ;
- à 1 440 px, l'aperçu de douze offres laissait une rangée de deux : l'aperçu
  ne montre que des rangées complètes ;
- à 1 920 px, la bannière 3:1 montait à 547 px. Bornée à 22 rem, elle a
  d'abord perdu sa largeur (1 056 px au lieu de 1 160 : la hauteur maximale se
  reporte sur la largeur par le rapport). La largeur explicite la garde
  entière ;
- le lien « Ouvrir la page sociale » était centré dans sa carte : aligné à
  gauche.

![Vitrine à 390 px](recette/boutique-vitrine-390.jpg)

![Catalogue à 390 px, en grille](recette/boutique-catalogue-390.jpg)

![Catalogue à 390 px, en lignes](recette/boutique-catalogue-lignes-390.jpg)

![Feuille de filtres : « Voir les résultats » reste en bas](recette/boutique-filtres-390.jpg)

![Fiche à 390 px](recette/boutique-fiche-390.jpg)

![Vitrine à 1 024 px](recette/boutique-vitrine-1024.jpg)

![Fiche à 1 024 px : deux colonnes](recette/boutique-fiche-1024.jpg)

![Vitrine à 1 280 px](recette/boutique-vitrine-1280.jpg)

![Vitrine à 1 440 px : deux rangées complètes de cinq](recette/boutique-vitrine-1440.jpg)

![Vitrine à 1 920 px](recette/boutique-vitrine-1920.jpg)

![Catalogue à 1 920 px : six colonnes](recette/boutique-catalogue-1920.jpg)

![Fiche à 1 920 px](recette/boutique-fiche-1920.jpg)

Limites :

- en local, aucune offre réelle : les offres de démonstration n'ont ni
  sélection ni panier, par conception. La barre d'achat du téléphone, la
  feuille « Choisir » et l'ajout rapide se prouvent par les tests de
  composants (`shop-experience.test.tsx`) ;
- les pages sans compte des boutiques de démonstration (`/boutiques/…`)
  restent indisponibles en local. Leurs médias ont des chemins relatifs
  (`/demo-media/…`), que le schéma SSR des adresses refuse. Constat antérieur à
  ce lot, sans rapport avec lui ; leur grille est couverte par les tests.

### Marketplace sur le modèle des ventes privées, lot 3 : le panier et la remise (22/10/2026)

Même demande, troisième lot : le panier et l'étape de remise dans l'esprit des
ventes privées. Toutes les gardes restent : brouillon local, relecture des
prix, disponibilités et modes de remise, intention conservée et reprise,
accord explicite. « Demander la préparation » ne déclenche toujours aucun
paiement.

- Panier (`/panier`) :
  - une boutique par panier, en pastilles qui défilent ;
  - la boutique (logo et nom de sa vitrine) et le retour vers elle ;
  - chaque ligne : photo et nom vers la fiche, variante, prix exact, et le
    montant de la ligne s'il diffère du prix unitaire. Quantité en − / +
    (ou saisie, validée en quittant le champ), corbeille. Deux lignes par
    rangée quand leur colonne dépasse 56 rem ;
  - récapitulatif : nombre d'articles et montant au prix exact. Les frais et
    le total ne sont annoncés qu'avec le mode de remise ;
  - « Valider mon panier » relit prix, disponibilités et modes de remise
    (l'ancien « Relire les prix et les frais »), puis conduit à l'étape de
    remise, qui reçoit le focus. Ensuite, et en reprise, le bouton reste
    « Relire les prix et les frais » ;
  - les conditions déclarées par la boutique, en une carte compacte ;
  - « Continuez vos achats » : d'autres produits de la même boutique, absents
    du panier, avec l'ajout rapide.
- Au téléphone, une barre « N articles · montant · Valider mon panier » reste
  collée au-dessus des onglets tant que les lignes défilent, puis se pose
  après elles. Dès 1 024 px, le récapitulatif tient la colonne de droite,
  collé sous l'en-tête.
- Étape de remise (formulaire de préparation, aussi pour une offre seule) :
  - les modes de remise sont des cartes choisies d'un geste : le retrait (son
    établissement, ou leur nombre) et la livraison (libellé et frais du
    vendeur). Aucun mode n'est coché d'office ;
  - les établissements de retrait ne s'affichent qu'au retrait, aucun choisi
    d'office ;
  - adresse, accord et montants attendus inchangés ;
  - dans le panier, au téléphone, le total et « Demander la préparation »
    restent collés au bas de l'écran pendant la saisie.

Mesures. Faute d'offre réelle sur le backend local (les offres de
démonstration refusent le panier par conception), la recette visuelle passe
par un banc local du candidat, jamais commité. Il monte la vraie mise en page
(`CartLayout`, `CartLine`, `CartSummary`, `CartBar`) et le vrai formulaire de
préparation, avec trois produits de test aux photos de démonstration. La vraie
page `/panier` a été ouverte aussi (panier vide en local, sans erreur).

| Largeur | Bloc | Colonnes du panier | Lignes | « Continuez vos achats » | Défilement horizontal |
|---|---|---|---|---|---|
| 390 px | 12 / 12, 366 px | 1 (barre collée à 80 px du bas) | 1 colonne | cartes de 152 px, écart 12 | aucun |
| 1 024 px | 128 / 16, 880 px | 512 + 352, écart 16 | 1 colonne | 224 px, écart 16 | aucun |
| 1 280 px | 296 / 24, 960 px | 584 + 352, écart 24 | 1 colonne | 224 px, écart 24 | aucun |
| 1 440 px | 296 / 24, 1 120 px | 744 + 352, écart 24 | 1 colonne | 224 px, écart 24 | aucun |
| 1 920 px | 296 / 24, 1 600 px | 1 224 + 352, écart 24 | 2 colonnes de 600 px | 224 px, écart 24 | aucun |

Au téléphone (390 × 844), la barre se tient à 694–764 px, 14 px au-dessus des
onglets, pendant que les lignes défilent. Elle reprend sa place après elles
(503 px à 400 px de défilement). Dans l'étape de remise, le total et l'envoi se
tiennent au même endroit ; total vérifié : 13 500 + 200 + 1 500 = 15 200 XAF
avec la livraison.

Défauts trouvés et corrigés pendant la recette :

- le nom de l'article avait la couleur des liens : couleur du texte, comme les
  cartes d'offres ;
- « Montant de la ligne » répétait le prix unitaire pour une quantité de 1 :
  il n'est dit qu'au-delà ;
- les conditions de la boutique faisaient 700 px de haut au téléphone en cinq
  cartes : une carte compacte (416 px) ;
- à 1 920 px, une ligne de panier s'étirait sur 1 224 px : deux lignes par
  rangée ;
- le bouton radio choisi était bleu sous une carte cerclée de safran : encre
  du commerce, qui garde le contraste.

![Panier au téléphone : la barre de validation au-dessus des onglets](recette/panier-barre-390.jpg)

![L'étape de remise au téléphone : total et envoi collés](recette/panier-remise-390.jpg)

![Panier à 1 024 px : le récapitulatif à droite](recette/panier-1024.jpg)

![L'étape de remise à 1 024 px](recette/panier-remise-1024.jpg)

![Panier à 1 280 px](recette/panier-1280.jpg)

![Panier à 1 440 px](recette/panier-1440.jpg)

![Panier à 1 920 px : deux lignes par rangée](recette/panier-1920.jpg)

Limites : les captures du panier rempli viennent du banc ; sur le backend local,
le vrai panier reste vide. Les tests de composants prouvent la page réelle
(`cart-screen.test.tsx`) : lignes et liens, montant exact, − / +, corbeille,
« Continuez vos achats » sans les articles déjà au panier, validation qui relit
puis ouvre la remise sans rien envoyer. Ils couvrent aussi les cartes de remise
et la barre collée (`checkout-form.test.tsx`).

### Marketplace sur le modèle des ventes privées, lot 4 : les pages du réseau qui vendent (22/10/2026)

Décisions du propriétaire du jour. Une page sert une activité (communication,
publications), une boutique sert la vente. Une page qui vend se présente
**selon sa nature** :

- une **entreprise** : la page se présente comme sa boutique ;
- une **association**, un **média** ou une **communauté** : sa page devient une
  page-boutique, ses produits en tête ;
- une **page sans boutique** : inchangée.

- Moteur (`ProfilPagePage`, paquet `@antsia/social-features`) : une prop
  facultative `commerce` reçoit la présentation que l'application pose. Le
  moteur ne connaît pas la boutique : aucun import d'un produit, et DIASPORALE
  ne change pas. Les gestes de la page restent tous : gérer, revendiquer,
  accepter une invitation, publier en son nom, lire le mur.
  - `shop` : l'en-tête de l'application (`hero`) remplace l'identité de la
    page ; il porte le `h1` et l'abonnement. Gérer et revendiquer restent
    juste dessous ;
  - `products` : l'identité de la page reste ;
  - `lead` vient avant le mur ; `interleave(rang)` après chaque troisième
    publication, le rang continuant d'une fenêtre du mur à l'autre.
- Application (`PageWithCommerce`) : la fiche lit la page et sa vitrine, et
  attend de savoir si la page vend. Elle ne change pas de visage sous les
  yeux.
  - Entreprise : l'en-tête et le corps de la vitrine du lot 2, sans le bloc
    « Publications » puisque le mur suit.
  - Autre nature : « Nos produits » (« Nos offres » s'il y a des
    prestations). Jusqu'à trois offres en grandes cartes avec l'ajout direct,
    sinon en carrousel. Toujours « Voir la boutique ».
  - Au-delà de trois offres, « Dans la boutique » revient toutes les trois
    publications. Chaque rappel commence plus loin dans le catalogue.

Mesures :

- page d'entreprise `/page/epicerie-moussavou-demo` : l'aperçu de 12 offres
  et ses 3 publications ;
- présentation « produits en tête » sur le banc local du candidat, jamais
  commité, monté sur la vraie fiche du moteur : l'association
  `jeunes-lambarene-demo` (2 offres de test), puis la page de l'épicerie pour
  les rappels (6 offres de test). Aucune page d'association, de média ou de
  communauté ne vend sur le backend local ; celles de démonstration n'ont
  qu'une publication.

| Largeur | Fiche (bloc) | Aperçu du catalogue (entreprise) | Grandes cartes (association) | Défilement horizontal |
|---|---|---|---|---|
| 390 px | 26 / 26, 338 px (cadre des profils) | 2 colonnes, 12 offres | 1 colonne, 338 × 460 px | aucun |
| 1 024 px | 128 / 16, 880 px | 4 colonnes, 12 offres, écart 16 | — | aucun |
| 1 280 px | 296 / 24, 960 px | 4 colonnes, 12 offres, écart 24 | — | aucun |
| 1 440 px | 296 / 24, 1 120 px | 5 colonnes, 10 offres (2 rangées complètes) | 3 colonnes de 357 px | aucun |
| 1 920 px | 1 120 px centrés (cadre des profils) | 5 colonnes, 10 offres | — | aucun |

À 1 920 px, la fiche reste dans le cadre commun des profils du moteur
(1 120 px au plus, centré), comme toute fiche de personne ou de page. C'est un
comportement antérieur, hors du périmètre de ce lot.

![Page d'entreprise au téléphone : présentée comme sa boutique](recette/page-entreprise-390.jpg)

![La même page plus bas : conditions, puis ses publications](recette/page-entreprise-publications-390.jpg)

![Page d'entreprise à 1 440 px](recette/page-entreprise-1440.jpg)

![Association (banc) : ses produits en tête, en grandes cartes](recette/page-association-produits-390.jpg)

![Association (banc) à 1 440 px](recette/page-association-1440.jpg)

![Au-delà de trois offres (banc) : carrousel en tête, rappel après la troisième publication](recette/page-produits-rappels-390.jpg)

Preuves par les tests :

- moteur (`ProfilPagePage.test.tsx`) :
  - présentée comme sa boutique : un seul `h1` (celui de l'en-tête), pas de
    second « Suivre », « Gérer la page » qui s'ouvre, la vitrine avant le mur ;
  - produits en tête : l'identité reste, insertions de rang 1 et 2 après les
    publications 3 et 6 ;
- application (`page-commerce.test.tsx`) :
  - attente sans changement de visage ;
  - page sans boutique inchangée ;
  - entreprise présentée comme sa boutique, sans bloc « Publications » en
    double ;
  - association en grandes cartes avec l'ajout direct, sans rappel ;
  - média au-delà de trois offres : carrousel, rappel de niveau 3 qui commence
    à la quatrième offre.

## Limites de preuve et état Git

Le `verify` global avec l’ensemble des tests backend et des espaces de travail voisins n’a pas été relancé : la validation est ciblée sur les surfaces modifiées et leurs contrats.

Cette recette confirme les vues citées et les raccords des composants réels ;
elle ne constitue pas une comparaison exhaustive de chaque pixel des
60 planches × sept thèmes × deux modes × trois formats.

Les données locales ne fournissent pas tous les états de catalogue, paiement,
candidature ou prestation. Leurs composants et tests ont été vérifiés ; aucune
transaction, candidature, demande commerciale, communication, autorisation de
caméra/microphone, export ou suppression n’a été exécuté pour produire les captures.

Les travaux parallèles du dépôt sont conservés, notamment les changements de
modération/effacement et les traductions de boutiques. Aucun changement de
branche, commit applicatif, push, merge, publication ni fichier d’environnement
modifié par cette livraison. Les anciens rapports de production ne prouvent
pas la publication de ces nouveaux raccords.
