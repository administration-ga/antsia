# U01 — Lexique local ANTSIA

## Préambule

Appliquer le [plan responsive](../04_PLAN_IMPLEMENTATION.md) sur ANTSIA uniquement. Ce prompt décrit une tranche réelle d’interface ; il ne demande aucune recette maintenant. Préserver le travail déjà en cours sur ce lexique, les autres sessions, DIASPORALE, les contrats backend et les fichiers d’authentification/session réservés. Aucun test, codegen, typage, lint, build, navigateur, serveur, Git d’écriture ou environnement.

## Périmètre et résultat

Remplacer les termes visibles qui gênent la compréhension, sans modifier leur fonction métier.
**État au 20 octobre : raccord source terminé ; scénarios écrits, non exécutés ; rendu non constaté.**
Ce prompt conserve le contrat de la tranche et guide les compléments éventuels depuis son diff ;
ne pas recommencer une seconde version ni relancer ses contrôles.

| Surface | Libellé retenu |
|---|---|
| Destination Fil | Accueil |
| Destination Découvrir | Explorer |
| Navigation des relations | Mon réseau |
| Invitation de connexion | Ajouter à mon réseau |
| Fonction Conférence | Direct |
| État de diffusion actif | En live |
| Statuts/actus éphémères | Stories |
| Enregistrements d’un direct disponibles | Replays |
| Signets | Enregistrés |
| Gestion du contenu masqué/sourdine | Mon fil |

Clips est réservé au futur lecteur vidéo U04. Ne pas renommer l’immersion mixte. « Suivre » reste l’action de suivi ; « Ajouter à mon réseau » reste l’invitation de connexion. Direct et appel personnel/groupe restent des objets distincts.

## Fichiers et briques à réutiliser

- Raccord effectif : `apps/antsia_ga/src/i18n/resources.ts`, `compose-engine-overrides.ts`, `overrides/{fr,en}.json` ; ressources propres `locales/{fr,en}/{antsia,memberNetwork,publicNetwork}.json`.
- Les namespaces complets viennent de `engineResources` exporté par `@antsia/social-features/i18n`. `createAppI18n` remplace un namespace entier : composer les feuilles en profondeur, sans mutation du moteur et sans modification des dictionnaires partagés.
- Navigation consommatrice, à lire sans modification pour ce lot : `packages/social-features/src/shell/reseau-menu-destinations.ts`, `ReseauMenuRail.tsx`, `mobile/ReseauMobileTabBar.tsx` ; pages personnelles dans `apps/antsia_ga/src/app/(membre)/moi/`.
- Routes existantes dans `apps/antsia_ga/src/lib/routes.ts`, direct/conference et composants live existants : conserver les valeurs techniques et alias.
- `apps/antsia_ga/src/components/feed/feed-preferences-screen.tsx` pour préserver le rôle particulier de Mon fil.
- `apps/antsia_mobile/src/i18n/{fr,en}.json` : les deux libellés existants du fil deviennent Accueil/Home, sans nouvel onglet.
- Scénarios de composition, immutabilité, clés/interpolations/pluriels et égalité SSR/client dans `apps/antsia_ga/src/i18n/resources.test.ts` : écrits seulement, ne pas les exécuter sous le gel actuel.

## Dépendances et actions

1. Confronter les chaînes restantes au lexique et au travail réservé par le coordinateur. Établir une table clé FR/EN → surface ; aucune substitution globale de « conférence » dans le code métier.
2. Brancher la variante locale par le mécanisme d’i18n/présentation existant. Les consommateurs ne déclarant pas cette variante gardent leur texte actuel ; ne pas tester un nom de marque dans le moteur partagé.
3. Distinguer « Préparer un direct », le geste « Lancer le direct », l’état « En live » et le replay réellement lisible. Une diffusion terminée sans enregistrement n’obtient pas un lien Replay.
4. Garder Mon fil et ses actions de restauration ; conserver signalement, notifications et paramètres dans des emplacements nommés.
5. Aligner libellés visibles, noms accessibles, titres et aides, sans changer le sens du suivi, de la connexion ou de l’audience.

## Contrat d’acceptation

- Chaque terme a un sens unique ; les clés FR/EN ont la même structure.
- ANTSIA affiche les nouvelles appellations ; DIASPORALE conserve ses libellés et son comportement.
- Aucun changement de table, droit, slug, contrat signé ou URL historique n’est nécessaire au renommage.
- « Enregistrés » et « Replays », « Accueil » et « Mon fil », « Suivre » et « Ajouter à mon réseau » ne sont pas fusionnés.
- L’interface ne présente pas Clips comme disponible avant U04.

## Exclusions et preuve attendue

Pas de refonte graphique, de nouveau rôle, d’action d’amitié, de changement de session ou de renommage technique massif. Ne pas copier des libellés privés ou données des vidéos de référence. Rapporter les clés et composants réellement raccordés, les chaînes restant volontairement techniques et les limites. Preuve attendue à ce stade : source relue seulement ; toute observation d’écran ou vérification reste à faire après levée du gel.
