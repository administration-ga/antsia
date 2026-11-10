# Mémoire ANTSIA — persistance de la session IDN

État constaté le 20 octobre 2026 à 22 h 19, heure de Paris.

Cette note reprend uniquement les changements ANTSIA du commit mémoire
`15754dee8634de6643863e84ac8f5d94d5fa0736` : mise à jour du contexte actif,
de l’avancement, du compte rendu de session et de la ligne de journal du
20 octobre à 22 h 22. Elle ne transfère pas l’historique du vault Obsidian.

## Résultat confirmé

Le propriétaire a terminé la connexion IDN officielle en production. Cinq
rechargements complets successifs, entre 20:19:10 et 20:19:30 UTC, conservent
le même profil public `@asted` sur `/fil`, avec le bouton de déconnexion et
sans nouvelle demande IDN. Un nouvel onglet ouvert sur `/fil` restaure
également le compte.

Le déploiement identifié pendant la recette est
`dpl_6coT1M8U4HnyMtqAAS5Kh8nhHr4K`, version
`session-reload-20261020-7512840237b38401`.

La projection administrative, bornée à 25 sessions et sans sélection de
jetons, retrouve deux sessions du même sujet avant et après la recette :
mêmes empreintes, mêmes échéances non expirées. Chaque rechargement ne crée
pas une nouvelle session.

L’attente d’une connexion propriétaire et d’une recette de cinq rechargements
est donc levée dans le contexte actif et l’avancement. Le bilan de la recette
d’aperçus est également actualisé : la vérification de persistance qui lui
succédait est terminée. La révocation explicite parallèle corrélée au symptôme
initial reste consignée ; cette validation ne rétablit aucune session révoquée.

## Périmètre et limites

Le constat couvre Chrome et une persistance immédiate après rechargements et
nouvel onglet. Une attente de sept jours et un redémarrage du système ne sont
pas testés. Le parcours officiel a été terminé par le propriétaire ; l’agent
n’a ni lu ni saisi son PIN.

Aucun contenu social, média, message, réaction ou préférence n’a été modifié
par cette recette. L’onglet supplémentaire a été fermé après vérification.

Les captures et relevés de la recette sont référencés par le commit mémoire
sous `docs/recette/session-rechargement-production-2026-10-20/`, notamment
`rechargements-connectes.json`, `nouvel-onglet-connecte.json` et
`comparaison-session-apres-reloads.json`. Ils ne sont pas inclus dans ce
transfert documentaire. Cette note consigne un résultat historique ; elle
ne constitue pas une nouvelle vérification en ligne.

## Reprise du projet

La version `session-reload-20261020-7512840237b38401` devient la référence
indiquée pour la revue des corrections suivantes. Les modifications locales
des autres sessions sont à préserver. La recette sur appareils physiques
reste ouverte.
