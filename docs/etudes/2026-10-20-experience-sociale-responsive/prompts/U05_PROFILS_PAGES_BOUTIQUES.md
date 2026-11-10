# U05 — Profil personnel, page et boutique

## Préambule

Appliquer le [plan responsive](../04_PLAN_IMPLEMENTATION.md), U01/U02 et les composants U03/U04 disponibles. ANTSIA uniquement ; préserver P07–P09, contrats PRO.GA, sessions et autres modifications. Aucun test, codegen, typage, lint, build, navigateur, serveur, Git d’écriture, installation ou environnement.

## Périmètre et fichiers réutilisés

- Hub personnel : `apps/antsia_ga/src/app/(membre)/moi/{page,me-screen}.tsx`, `me-model.ts`.
- Mur de personne : `src/app/(membre)/profil/[handle]/page.tsx`, `packages/social-features/src/features/reseau-personnel/{ProfilPersonnePage,ProfilPagePage}.tsx` et leurs modèles `profil-personne.ts` / `profil-page.ts`.
- Vitrine et gestion : `apps/antsia_ga/src/components/shops/{member-storefront-screen,public-storefront-route,public-storefront-card,shop-editor-screen,my-shops-screen,member-shop-directory}.tsx` ; catalogue et fiches réels adjacents.
- Routes et capacités injectées depuis `apps/antsia_ga/src/lib/routes.ts`, lectures existantes de profils/pages/shops/catalogue.

`/moi` est actuellement un hub, pas le mur `/profil/[handle]`. Les onglets Publications/Photos/Albums actuels ne constituent pas une photothèque de tous les posts. Le natif ouvre aujourd’hui le profil Web ; toute surface native nouvelle exige un vrai raccord distinct.

## Actions et contrats

1. Séparer clairement identité, profil visible, activité personnelle et administration de pages/boutiques. Une personne garde une seule identité ; « Gérer ma page/boutique » n’invente pas un second compte ou une seconde session.
2. Structurer l’en-tête selon les données disponibles : avatar, nom normalisé, identifiant, présentation, badges calculés, compteurs autorisés et actions correspondant à la relation réelle. Conserver la différence Suivre / Ajouter à mon réseau / Message.
3. Prévoir les onglets **Posts, Clips, Identifié(e), Boutique** seulement lorsqu’une vraie source et son droit existent. Posts réutilise les publications ; Clips dépend de U04 ; Identifié(e) requiert une projection de mentions/identifications autorisée, pas une liste vide décorative ; Boutique dépend d’une vitrine accessible et de sa capacité.
4. Préserver les albums et leurs routes historiques. Si Photos doit un jour agréger les photos des posts, décrire cette lecture séparément avec gardes/pagination ; ne pas réétiqueter les albums comme s’ils couvraient déjà toutes les photos.
5. Relier la boutique ANTSIA à sa vitrine, son catalogue et ses contacts réels. La gestion de l’entreprise reste dans PRO.GA selon la liaison et les mandats existants ; un lien de gestion n’accorde aucune autorité supplémentaire.
6. Garder une hiérarchie adaptée : en-tête compact et onglets accessibles au téléphone ; contenu central avec contexte utile sur tablette/PC. Éviter les statistiques dominantes sans donnée et les rangées d’actions qui débordent.
7. Maintenir dans le hub Mon fil, Enregistrés, paramètres, données/recours et suivis commerciaux privés. Une URL de profil public n’expose pas ces données personnelles.
8. Appliquer les états masqué/suspendu/inaccessible et les retraits de page, boutique ou auteur ; une miniature ou un onglet mémorisé ne contourne pas la lecture courante.

## Dépendances et critères d’acceptation

- U01 fixe les termes ; U02 conserve les destinations ; U04 apporte les vrais Clips. P07/P08/P09 restent les autorités de vitrine, liaison et catalogue.
- Toute action est conforme au lecteur : personne propriétaire, tiers membre ou visiteur public, signataire courant et mandat révoqué sont distingués côté serveur.
- Aucun bouton de faux multicompte ; aucun badge ou compteur dérivé de l’apparence.
- Les onglets sans capacité ne sont pas rendus comme fonction disponible ; un contenu vide autorisé a un message et une sortie réels.
- Ouvrir le profil, une publication ou la boutique puis revenir garde la bonne position et le bon contexte sans ressortir un contenu retiré.
- Les coordonnées/achats/candidatures/messages d’un tiers ne sont pas exposés par la grille, le hub ou le profil public.

## Exclusions et preuve attendue

Pas de Centre de comptes Meta, nouveau système de rôles, vérification payante, faux abonnés ou gestion PRO.GA réimplémentée dans ANTSIA. Ne pas activer les politiques P16. Rapporter routes et onglets réellement raccordés, permissions réutilisées, renvois Web natifs conservés et capacités manquantes. Source seule tant que le gel demeure ; aucune recette de rôle/profil ou confidentialité n’est revendiquée.
