# Vérification complète ANTSIA — 21 octobre 2026

**Verdict : `bun run verify` terminé avec le code 0.** Passage final du 21/10/2026 de 07:51:03 à 08:03:13 UTC, soit 12 min 10 s. Les cinq fichiers corrigés ont conservé la même empreinte entre le début et la fin de cette exécution.

| Contrôle | Résultat |
|---|---|
| Génération et typages Convex/tests | Réussite |
| Convex | 185 fichiers, 2 853 tests réussis |
| Cliquets de conformité | 25 fichiers, 144 tests réussis |
| Scripts | 69 tests réussis |
| Espaces de travail | 12 typages et 12 suites de tests réussis |
| Lint | 11 espaces, 0 erreur, 291 avertissements |
| Total des tests | **15 191 réussis, 0 échec, 0 ignoré** |

## Pourquoi la suite semblait bloquée

Le premier fichier, `convex/modules/posts/feedMaterialization.test.ts`, contient un scénario de diffusion à 5 000 abonnés. Les lectures indexées du simulateur `convex-test` rescannent les documents en mémoire ; le profil CPU et les piles inspectées montrent ce travail dans `_iterateDocs`, `tableNameFromId` et `_resolveQuerySource`. Le volume de la fixture provoque un coût quadratique et retarde les événements envoyés au processus principal. Le rapporteur Vitest par défaut reste silencieux pendant ce travail hors terminal interactif.

Le fichier a terminé ses 13 tests en 156,30 s lors du diagnostic ciblé, dont environ 152,48 s pour le scénario des 5 000 abonnés. Lors du passage final complet, le même fichier termine en 212,075 s et la suite Convex complète en 370,35 s. Il ne s'agit pas d'une boucle infinie constatée ni d'une mesure des performances du service Convex de production. Le test isolé des 500 sources réussit aussi ; les derniers événements IPC visibles ne désignent donc pas nécessairement le cas réellement en cours.

Le nouveau rapporteur `scripts/convex-test-progress-reporter.mjs`, branché dans `convex/vitest.config.ts`, affiche le fichier, le temps écoulé toutes les 30 secondes, sa fin et le bilan. Le minuteur vit dans le processus principal et n'empêche pas sa sortie. Le rapporteur standard reste présent. Aucun test, assertion, garde, délai maximal ou volume de fixture n'a été réduit.

## Échecs rencontrés et corrections

1. **Un cliquet catalogue natif** : les noms `NATIVE_EXPO_OWNER`, `NATIVE_EXPO_PROJECT_ID` et `NATIVE_RELEASE_BUILD`, déjà utilisés par la configuration native, manquaient dans `config_env`. Ajout de ces trois déclarations dans `deploy/catalog.json`, sans configurer de valeur ni modifier de secret.
2. **Trois tests de scripts** : `NEXT_PUBLIC_DEMO_ENTRY_ENABLED` et `NEXT_PUBLIC_APP_BASE_PATH`, déjà facultatifs dans le catalogue, étaient refusés ou imposés par le script. Leur admission dans la liste fermée des options facultatives et le décompte des onze substitutions rétablissent le contrat. Trois nouveaux tests couvrent absence, valeurs fournies et refus d'une option inconnue ; la connexion Convex reste obligatoire.

La suite de scripts passe maintenant 69 tests. Le rapporteur a également passé une intégration réelle sur les six tests du harnais et des contrôles courts de rappel, silence en terminal interactif et arrêt du minuteur.

## Périmètre et conservation des travaux parallèles

Les seules modifications source de cette intervention concernent :

- `convex/vitest.config.ts` ;
- `scripts/convex-test-progress-reporter.mjs` (nouveau) ;
- `deploy/catalog.json` ;
- `scripts/deploy-app.mjs` ;
- `scripts/deploy-app.test.mjs`.

Les trois derniers fichiers portaient déjà des changements d'autres sessions : seuls les ajouts décrits ci-dessus ont été appliqués, à partir de copies conservées avant modification. Aucun changement de branche, staging, commit applicatif, push ou déploiement de production n'a été effectué. HEAD `c4d36f345707f87f20dbd970b2850c683c8581be`, branche `codex/pa4-identite-session` et empreinte de l'index réel sont identiques au démarrage. Les fichiers `.env*`, les serveurs applicatifs et les zones réservées DIASPORALE sont conservés. Le codegen utilise le backend local anonyme et le lanceur existant sous Node 22.

Cette preuve porte sur l'arbre partagé testé, qui contient des modifications locales préexistantes. Elle ne certifie ni le contenu de `main` distant ni un nouveau déploiement en production. Les avertissements lint existants et les avertissements Node (`TimeoutOverflowWarning` dans les scénarios de dates simulées, `--localstorage-file` dans les workers de tests DOM) restent visibles ; ils n'ont pas fait échouer la commande. Les recettes sur appareils physiques et les essais de charge réels restent hors de cette vérification.

## Preuves

- [Journal final complet, chemins locaux neutralisés](verify.log).
- [Résultat, horaires, empreintes des fichiers et contrôles de conservation](resultat.json).
- [Échec du catalogue avant correction](echec-catalogue.log).
- [Échecs des scripts avant correction](echecs-scripts.log).
- [Intégration du nouveau rapporteur](controle-reporter.log).
