# U02 — navigation téléphone, tablette et ordinateur

20 octobre 2026. **Sources raccordées ; scénarios écrits, non exécutés. Rendu non constaté.**
Demande : poursuivre U02 sans relancer les vérifications et préserver l'autre session.
Le travail est dans le checkout applicatif partagé, sans changement de branche ni worktree.

## Résultat dans les sources

| Largeur de fenêtre CSS | Navigation ANTSIA raccordée |
|---|---|
| Moins de 768 px | Barre basse Accueil / Explorer / Créer / Messages / Profil ; espace réservé sous le contenu, noms accessibles et compteurs existants |
| 768–1199 px | Rail de 96 px, mêmes destinations et volets ; icônes, noms accessibles, titres, badges et raccourcis ; bouton Apparence vers les réglages |
| Dès 1200 px | Même rail avec noms visibles, largeur 224–248 px sur le fil et 248 px sur les pages ; contrôle d'apparence existant conservé |

**Créer reste à sa place dans la barre téléphone.** Aucune entrée Clips n'est affichée : le
vrai parcours vidéo et la bascule finale appartiennent à U04. Les autres volets (Mon réseau,
Groupes, Pages, Direct, Événements, Enregistrés), les réglages et les raccourcis restent servis.
Mon fil reste accessible depuis Profil avec ses actions de masquage/sourdine et d'annulation.

Un raccourci **Boutiques** est ajouté au rail, uniquement si l'application fournit une route
et un libellé traduit non vide. ANTSIA réutilise l'annuaire existant dans Explorer ; cela ne
crée ni catalogue supplémentaire ni autorisation d'achat. Le texte provient de
`memberNetwork:commerce.shops`, sans ajout aux dictionnaires moteur ou DIASPORALE.

## Choix d'intégration

### Une capacité facultative du moteur

`NetworkProvider navigation="destinations" navigationLayout="adaptive"` est activé dans
`apps/antsia_ga/src/components/network-shell.tsx`. Le contexte expose l'option, les libellés
facultatifs et la route `shops`. `resolveEngineNavigationLayout` refuse l'adaptation si les
destinations ne sont pas effectivement servies ; une application sans opt-in reste au seuil
historique de 960 px. Aucun nom de marque n'est testé dans le moteur.

`useNetworkNavigationLayout` centralise la media query. Son instantané serveur et celui
d'hydratation sont inconnus (`null`) ; il suit ensuite les changements de fenêtre et retire
son abonnement. Le seuil 1200 ne change pas l'arbre React : le même rail se compose en CSS.
Les anciennes fixtures de contexte restent compatibles grâce aux propriétés optionnelles.

### Fil et pages ordinaires

Sur le fil, tablette et ordinateur partagent l'arbre existant. La feuille adaptative est
strictement limitée à `data-navigation-layout="adaptive"`. Le document défile pour les pages
ordinaires ; le rail reste accessible avec une hauteur bornée. Le lecteur immersif garde son
défileur et ses contrats existants.

Les bornes structurelles existantes restent distinctes : lecture autour de 792 px, collections
autour de 1120 px, selon l'espace réellement disponible. Une largeur minimale de 620/680 px
n'est pas imposée à la colonne restante sur tablette. Le contexte droit de 312 px attend à la
fois une fenêtre d'au moins 1400 px et un conteneur d'au moins 1280 px ; sinon le raccourci iCom
reste visible. La grille conserve le plafond de la charte. Aucun jeton de thème n'est modifié.

Les autres pages de membre utilisent le même choix téléphone/rail. Les classes de page,
zones sûres, contenu principal et surfaces de création sont raccordés au layout existant.
Les pages de Direct conservent leur exclusion de la navigation globale.

### Messages

`MessagesScreen` réutilise `MemberPage` en espace à hauteur bornée : la navigation globale
entoure les surfaces existantes, sans réécrire leurs droits, leurs requêtes ni leurs listes.
Les conversations et la rédaction restent immersives sur téléphone ; la liste a la barre
globale. La barre locale d'iCom est retirée sous l'opt-in pour éviter deux barres fixes ; les
vues Conversations / Appels / Contacts restent accessibles en tête de la liste.

Le seuil de composition interne liste/détail d'iCom reste celui du module actuel : U06 porte
son adaptation approfondie. Une tablette de 768–959 px peut donc avoir le rail global compact
et une seule vue Messages à la fois. Le cadre permet ce cas sans annoncer deux panneaux déjà
portés. Les scrollers de messagerie restent bornés ; ils ne sont pas transformés en fil ordinaire.

### Continuité et apparence

L'hôte d'appel, le pool, les fournisseurs de session et les frontières de retour restent à
leur emplacement persistant dans NetworkShell. Les composeurs existants et leurs stores sont
réutilisés ; aucune deuxième couche de communication n'est ajoutée dans une page. Le sélecteur
de fichier du fil reste au-dessus de sa bascule téléphone/rail, comme le correctif de l'autre
session l'avait prévu. Ces dispositions source ne valent pas une observation d'appel continu.

Les choix d'apparence restent dans le rail large et dans les réglages ; le rail compact ne
force pas les sélecteurs dans une colonne trop étroite. Le fond blanc, les cartes beige, le
sombre et les thèmes dépendent toujours des jetons existants. Les nouveaux styles ne changent
aucune couleur et ne modifient pas les primitives UI.

## Fichiers de cette tranche

| Rôle | Fichiers |
|---|---|
| Contrat et choix de format | `packages/api/src/network.tsx` |
| Opt-in et route injectée | `apps/antsia_ga/src/components/network-shell.tsx`, `apps/antsia_ga/src/lib/routes.ts` |
| Cadre des pages et de Messages | `apps/antsia_ga/src/components/member-chrome.tsx`, nouveau `member-navigation-styles.tsx`, `components/feed/feed-screen.tsx`, `components/messages/messages-screen.tsx` |
| Fil adaptatif | `packages/social-features/src/shell/ReseauAgentPage.tsx`, nouveau `reseau-adaptive-styles.ts` |
| Rail | `packages/social-features/src/shell/ReseauMenuRail.tsx`, nouveau `reseau-menu-rail-styles.ts` |
| Barres | `packages/social-features/src/shell/mobile/{ReseauMobileTabBar,IcomMobileTabBar}.tsx` |
| Scénarios écrits | Nouveau `packages/api/src/network-navigation-layout.test.tsx`, `apps/antsia_ga/src/components/member-chrome.test.tsx`, `packages/social-features/src/shell/ReseauAgentPage.test.tsx`, nouveau `ReseauMenuRail.adaptive.test.tsx` |

Les diffs de ces fichiers contiennent aussi des travaux antérieurs : leur présence n'est
pas attribuée à U02. Les corrections de session, médias, relations, chartes, commerce et
sélecteur de fichier de l'autre session sont conservées.

## Preuves et limites

- Lecture et édition source seulement ; aucune commande de vérification, génération,
  typage, test, lint, build, audit automatisé ou recette navigateur/appareil exécutée.
- Scénarios écrits : opt-in et repli, SSR inconnu, mises à jour/cleanup de media query,
  unicité du contenu et des composeurs, stabilité des nœuds tablette/ordinateur, accès aux
  destinations/volets/raccourcis, création/focus, gardes Boutiques, exclusion des Directs et
  cadre Messages. **Ils ne sont pas déclarés passants.**
- Aucune mesure de largeur, hauteur, contraste, clavier, focus, fluidité ni continuité
  d'appel constatée. Les infobulles natives des icônes et les faibles hauteurs restent à observer.
- Aucune modification du client natif Expo ; sa parité tablette et ses renvois Web restent
  distincts. Aucune nouvelle capacité commerciale, session, identité, notification ou transaction.
- Aucun serveur, environnement, dépendance, lockfile, backend, donnée, Git d'écriture ou
  publication touché par cette tranche. Les livraisons d'autres sessions ne valident pas U02.

La suite de présentation est **U03**, puis U04 pour Explorer/Clips. La matrice future U08
couvre notamment 767/768, 1199/1200, paysage, zoom, clavier, clair/sombre et retour au contenu.
Le gel des vérifications demeure actif.
