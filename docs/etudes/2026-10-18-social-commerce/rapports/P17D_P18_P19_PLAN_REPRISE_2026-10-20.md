# P17d puis P18/P19 — reprise autorisée du 20 octobre 2026

Demande : continuer P17d, puis les suites sans attendre d’accord supplémentaire, sans relancer
les vérifications et en préservant l’autre session. Cette demande autorise l’enchaînement de
ces trois lots dans cette reprise ; elle ne lève ni la suspension des vérifications ni les
limites de publication. Les règles par défaut « un lot par appel » des prompts restent valables
hors de cette demande explicite. Aucun besoin de modifier ces règles globales.

Base Git relue : `c4d36f3`. Arbre partagé non gelé, comprenant les sources P14–P17c et les travaux
Web/DIASPORALE de l’autre session. Les preuves Web publiées d’une autre session ne prouvent pas
la candidate native de cette reprise ; aucun résultat historique n’est transplanté.

## Tranches et responsabilités

| Tranche | Livrable réalisable sans exécuter de vérification | Sources réservées |
|---|---|---|
| P17d | Protocole physique/parité, registre vide de preuve, évaluateur de complétude déclarée et commande de lecture du dossier | `packages/social-native/src/native-acceptance{,.test}.ts`, `scripts/native-acceptance.mjs`, `docs/recette/antsia-native-p17d/` |
| P18 | Corrections tangibles d’accessibilité et de sobriété du client natif, scénarios écrits seulement | `apps/antsia_mobile/src/components/{ui,entry}.tsx`, `src/lib/accessibility*`, écrans fil/messages/publication, surface/vidéo d’appel ; coordination pour `app.tsx`, `guarded-media.tsx`, conversation et langues |
| P19 | Mise à jour ciblée du dossier pilote existant et de ses limites, décision par capacité fondée sur les preuves disponibles | `docs/etudes/2026-10-18-social-commerce/pilote/`, `rapports/P19_REPRISE_2026-10-20.md` |
| Coordination | Intégration des sources, script déclaré, rapport P17d/P18 et index des lots | Ajouts ciblés au manifeste, README mobile, rapports et journal de l’étude |

Pas de doublon de client, page de démonstration, worktree ou copie HTML. Aucune modification des
sessions Web, des primitives Web, de la charte CSS, du backend partagé, de DIASPORALE ou PRO.GA.
Le module système P17c et les dépendances restent inchangés dans cette reprise.

## Exécutions différées

P17d exige normalement appareils iOS/Android physiques, binaire identifié, permissions,
réseau, mesure du push à l’établissement média et constat de fin des captures. La consigne
« sans relancer les vérifications » interdit de les jouer ici : toutes ces lignes restent
**non exécutées**. Un registre rempli n’atteste pas à lui seul une observation ni un binaire.

Sont également différés : installation, génération API, tests, typage, lint, build, lancement
de serveur, recette navigateur/simulateur/appareil, benchmark, audit automatisé, transaction,
gel coordonné des autres sessions et recrutement utilisateur. Aucun secret, `.env*`, identité
de fournisseur, compte, paramètre de production ou donnée personnelle n’est créé ou modifié.
Ni commit, push, merge, déploiement ni distribution sur store.

Les corrections de P18 n’équivalent pas à une conformité AA ou un budget mesuré. P19 peut
actualiser le dossier de décision ; le pilote réel et l’activation restent conditionnés aux
preuves et paramètres manquants. L’enchaînement s’arrête au dernier lot P19 du plan.
