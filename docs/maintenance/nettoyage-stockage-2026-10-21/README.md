# Nettoyage du stockage — deux passes du 21 octobre 2026

Les preuves locales décrivent deux passes ciblées et réversibles par réinstallation des caches/dépendances supprimés. Cette préparation documentaire n’effectue aucun nettoyage supplémentaire. Les résultats proviennent de mesures `df` du volume de données APFS ; les tailles apparentes des dossiers ne sont pas assimilées à l’espace effectivement récupéré.

| Mesure | Première passe | Seconde passe |
|---|---:|---:|
| Disponible avant (Kio) | 1 151 308 | 10 755 572 |
| Disponible après (Kio) | 2 080 008 | 11 832 508 |
| Gain net mesuré | **0,95 Go** | **1,10 Go** |
| Disponible après | **2,13 Go** | **12,12 Go** |

Entre la fin de la première passe et le début de la seconde, l’espace libre augmente déjà de **8 675 564 Kio (environ 8,88 Go)**. Cette hausse externe n’est pas attribuée au nettoyage décrit ici. Les deux gains mesurés ne permettent donc pas de revendiquer toute la différence entre le premier état et les 12,12 Go finaux.

La première passe retire trois ensembles de dépendances recréables de copies de livraison/build inactives, avec package et verrou inchangés. Un cache protégé par macOS n’a pas été supprimé après refus de permission ; aucune élévation n’a été tentée. Les auxiliaires MCP ciblés représentent **18 racines et 45 processus** arrêtés ; les huit racines complémentaires sont consignées sans connexion TCP. Les PID et chemins machine sont exclus des projections publiques.

Après cette passe, le rapport relève un niveau de pression mémoire **1**, une part de mémoire libre de **52 %**, et un swap utilisé de **4 633,69 Mio**, contre **5 393,88 Mio** initialement. La mémoire résidente initiale des cibles était de **1 085,6 Mio** : ce chiffre n’est pas une mesure de RAM nette libérée. Le gain disque, la pression mémoire et le swap restent des indicateurs distincts.

La seconde passe retire deux caches npm inactifs (outils PDF MCP et build local EAS), un installateur téléchargé redondant dont l’application installée signée est préservée, et les dépendances non suivies d’une copie datée inactive. Les empreintes des sources, du package, du verrou et de Git ont été conservées dans les preuves locales. Les projections versionnées ne révèlent aucun chemin ou nom de projet tiers.

Les sources, dépendances actives, sessions, historiques, mémoire, preuves de publication/tests, captures, builds/SDK Xcode et serveurs actifs sont préservés selon les rapports. Les vérifications locales des deux passes donnent HTTP **200 sur 3030 et 3210**, et **404 sur 3211** ; ce 404 est l’observation brute de ce point de contrôle, pas une preuve de panne. Aucun résultat applicatif de production n’est déduit de ces contrôles locaux.

Les horodatages des fichiers de nettoyage sont conservés tels quels : ils ne portent pas de fuseau et ne sont donc pas présentés comme UTC. `provenance.json` associe chacune des neuf projections à son original par SHA-256. Les rapports locaux bruts et les preuves de préservation sont à garder ; seuls des compteurs, types et indicateurs ont été projetés ici. `SHA256SUMS` couvre tous les fichiers du dossier sauf lui-même.
