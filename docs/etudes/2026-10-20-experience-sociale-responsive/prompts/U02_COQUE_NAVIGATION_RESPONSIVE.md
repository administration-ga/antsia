# U02 — Coque et navigation responsive

## Préambule

Lire le [plan responsive](../04_PLAN_IMPLEMENTATION.md) et le lexique U01. Travailler dans les sources réellement servies, sur des fichiers réservés avant édition. Opt-in ANTSIA, aucun changement global de DIASPORALE. Le gel de vérification reste actif : aucun test, codegen, typage, lint, build, navigateur, serveur, Git d’écriture, installation ou environnement.

## Périmètre

**État au 20 octobre : sources raccordées dans ANTSIA Web ; scénarios écrits, non exécutés ;
rendu non constaté.** Continuer depuis le [bilan U02](../rapports/U02_NAVIGATION_RESPONSIVE_2026-10-20.md),
sans refaire les fichiers ni lever le gel de vérification. Ce prompt conserve les critères du lot.

Poser trois présentations à partir des surfaces existantes : téléphone `<768 px`, tablette `768–1199 px`, ordinateur `≥1200 px`. Ce sont des seuils de la variante ANTSIA ; le contrat partagé actuel `≤959 / ≥960` ne doit pas être remplacé pour tous les réseaux.

| Pose | Cible |
|---|---|
| Téléphone | Une colonne ; cinq destinations finales Accueil/Clips/Messages/Explorer/Profil ; création par « + » nommé dans l’en-tête |
| Tablette | Rail compact, contenu d’une ou deux colonnes selon la largeur utile ; document défilant |
| Ordinateur | Rail nommé, fil centré, panneaux contextuels ; Boutiques visible dans le rail |

**Phase initiale U02 :** garder Créer au centre de la barre actuelle. La bascule finale n’arrive qu’avec U04, quand Clips a sa route, sa vraie lecture vidéo et ses états complets. Explorer propose alors une puce Boutiques au téléphone ; aucune sixième place basse.

## Fichiers et composants réutilisés

- `apps/antsia_ga/src/components/{network-shell,member-chrome}.tsx`, `app/(membre)/layout.tsx`, `src/lib/routes.ts`.
- `packages/api/src/network.tsx` : option de présentation additive seulement si les options actuelles sont insuffisantes ; comportement par défaut conservé.
- `packages/social-features/src/shell/{reseau-layout,reseau-menu-destinations}.ts`, `ReseauAgentPage.tsx`, `ReseauMenuRail.tsx`, `mobile/{ReseauMobilePage,ReseauMobileTabBar}.tsx` et les composants d’en-tête/coque appelés par ces fichiers.
- Hôte existant `shell/communication/global-call-surface-host.tsx` et pool d’appels : préserver leur montage unique ; aucune réimplémentation.
- Natif : `apps/antsia_mobile/src/app.tsx` et `src/lib/routes.ts` sont des points de raccord séparés, actuellement trois onglets. Ne pas annoncer leur refonte à partir des seuls changements Web.

## Dépendances et actions

1. Conserver U01 et le parcours `/moi` hub, distinct de `/profil/[handle]`. Nommer les repères de navigation et la destination active.
2. Définir la variante responsive locale sans remplacer les seuils partagés. Partir des contraintes actuelles de `reseau-layout.ts` et du fil 680–792/volet droit 312 de `ReseauAgentPage.tsx` ; ne pas poser une nouvelle largeur arbitraire uniforme.
3. Redistribuer les mêmes composants selon l’espace disponible. Une seule coque de membre et un seul élément principal ; ne pas cacher un arbre privé actif derrière son doublon.
4. Conserver accès à Mon réseau, Enregistrés, Mon fil, paramètres, notifications, boutiques et retour à l’accueil. Réutiliser les adresses de routes, les compteurs serveur et la porte de sortie.
5. Adapter les marges, zones sûres, claviers ouverts et petits écrans paysage. Les pages ordinaires défilent dans le document ; seuls lecteurs/conversations dédiés ont un défileur identifié.
6. Préparer la bascule U04 sans rendre de bouton Clips mort. Après raccord U04 seulement : installer Clips, déplacer la création vers « + », conserver les mêmes formats autorisés.

## Contrat d’acceptation

- Chaque fonction actuelle reste atteignable sur les trois poses ; aucun lien n’a pour seul effet un placeholder.
- Redimensionnement, changement de thème et navigation ne remontent ni session ni hôte/pool d’appels et ne perdent pas le brouillon existant.
- Tablette n’est ni un téléphone agrandi ni une page bureau tronquée : les colonnes s’ajustent à l’espace utile et au contenu.
- Barre basse sans défilement horizontal, noms accessibles, cible active et « + » explicite pour un lecteur d’écran.
- Hors opt-in ANTSIA, navigation et seuils actuels conservés. Les surfaces natives non portées restent annoncées comme telles, avec leurs renvois Web existants.

## Exclusions et niveau de preuve

Pas de nouvelle authentification, de remplacement du moteur d’appel, de changement global de `959/960`, de modification de primitives UI ou de création d’un deuxième layout de démonstration. Rapporter les routes/options raccordées et l’état exact de la transition Créer→Clips. Aucune mesure de largeur, capture ou recette n’est acquise par ce prompt ; elles seront consignées séparément lors de la recette future.
