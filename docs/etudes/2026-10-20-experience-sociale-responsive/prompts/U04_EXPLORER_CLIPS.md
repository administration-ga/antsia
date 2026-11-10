# U04 — Explorer et vrai lecteur Clips

## Préambule

Lire le [plan responsive](../04_PLAN_IMPLEMENTATION.md), U02 et U03. ANTSIA seul, pas de modification implicite de DIASPORALE. L’immersion existante est un lecteur de publications mixtes : **ne jamais la renommer Clips**. Toute nouvelle requête backend est une sous-tranche réservée et bornée. Aucun test, codegen, typage, lint, build, navigateur, serveur, appel Convex, Git d’écriture ou environnement.

## Périmètre et briques réutilisées

- Explorer : `apps/antsia_ga/src/components/discovery/{discover-screen.tsx,discover-model.ts,member-feed.tsx}` et `src/app/(membre)/explorer/page.tsx`.
- Lecteur et retour : `packages/social-features/src/features/feed-immersion/{ImmersiveFeedReader,FeedReturnSessionBoundary}.tsx`, `use-feed-mode.ts` et les helpers d’ancrage existants.
- Coordination média : `features/media-playback/MediaPlaybackProvider.tsx`, présentation vidéo de `features/reseau-personnel/PostMediaPresentation.tsx` et pagination existante du fil.
- Routes : `apps/antsia_ga/src/lib/routes.ts` et contrat de navigation injecté. Réserver la vraie route Clips dans cette table ; aucun slug rendu opérationnel par une simple chaîne.
- Backend : s’appuyer sur les lectures/gardes des publications et des fichiers déjà utilisées par le fil. Le nom de la nouvelle query/index éventuel est à figer après lecture ciblée, sans modifier l’API historique ni créer un lecteur sans garde.

## Actions — Explorer

1. Afficher une grille adaptative : **3 colonnes téléphone, 4–5 tablette, 5–6 ordinateur**, selon la largeur utile et les tailles minimales lisibles. Ne pas appliquer ces nombres au fil principal ni aux fiches détaillées.
2. Proposer recherche et puces dont Boutiques est visible au téléphone ; n’afficher que les catégories ayant une route et des résultats réels. La recherche annonce son périmètre et sa pagination.
3. Ouvrir une publication ou un clip en conservant filtre, curseur et position. Retourner sur une ancre encore autorisée ; si elle a disparu, expliquer le repli vers un voisin ou le début.

## Actions — Clips

1. Définir une lecture **vidéo uniquement**, paginée côté serveur, ordonnée de manière stable. Écarter les posts texte/photo au niveau de cette lecture ; filtrer seulement la page mixte chargée côté client ne constitue pas une pagination Clips.
2. Exiger réseau, session/adhésion, audience, modération, blocages, préférences du fil et médias délivrables selon les gardes actuelles. Une page filtrée vide avec un curseur de suite ne devient pas une fin ; pas de scan non borné pour remplir un écran.
3. Réutiliser le moteur d’immersion comme présentation lorsque possible. Un lecteur visuel à la fois ; le média visible est prioritaire, les précédents sont suspendus. Le son démarre coupé et ne s’active que par choix explicite ; appels, sonnerie et autre média prioritaire gardent l’arbitrage existant.
4. Suspendre la lecture au passage en arrière-plan, à la sortie de la surface ou à la fermeture de son autorité. Ne pas rétablir automatiquement un son actif après changement de personne ou un appel.
5. Préserver le retour à la publication, le curseur, la position et l’index de galerie dans leurs bornes actuelles. Ne pas inventer un historique persistant de visionnage ou de nouveaux identifiants de traçage.
6. Geste vertical natif, clavier, focus et réduction de mouvement restent utilisables. Légende longue, contrôles et erreur doivent rester accessibles ; prévoir la liste/représentation de repli sans contenu tronqué.
7. Une fois route, query et états raccordés, terminer la bascule U02 : Accueil/Clips/Messages/Explorer/Profil en bas et « + » dans l’en-tête. Avant cela, conserver Créer au centre et ne montrer aucune destination morte.

## Contrat d’acceptation

- Clips n’affiche que des publications vidéo effectivement autorisées ; l’immersion mixte et le mode Liste gardent leur nom et leur fonction.
- Une vidéo retirée, retenue ou devenue inaccessible ne reste pas lisible via une ancienne position, miniature ou URL.
- Retour Explorer→détail→Explorer et Accueil→Clips→Accueil respecte les positions encore autorisées ; pagination et éventuelle fenêtre lacunaire restent visibles.
- Un seul lecteur joue ; son coupé par défaut, suspension arrière-plan et priorité appel exprimées en source, sans prétendre prouver l’audibilité.
- Chargement, vide réel, page filtrée avec suite, refus, erreur et hors ligne ont des sorties réelles, sans faux contenu.

## Exclusions et preuve attendue

Pas d’algorithme de recommandation simulé, de métriques de viralité, d’autolecture sonore, de chargement illimité ou de copie de la marque Reels. Pas d’élargissement de l’audience publique. Rapport attendu : API/DTO/curseur exacts figés, routes et lecteurs raccordés, limites et scénarios écrits. Aucune mesure de fluidité, consommation ou recette tactile n’est acquise ; elles appartiennent à U08 après levée du gel.
