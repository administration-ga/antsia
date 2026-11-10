# Relations et analyse des médias — 20 octobre 2026

## Publication vérifiée

| Cible | Frontend Vercel | Version | Backend |
| --- | --- | --- | --- |
| antsia.vercel.app | dpl_9ySFdUsUy7855qkAJSMM8xn8oz82 | relations-media-20261020-c8de4d49935c | diligent-avocet-585 |
| antsia-demo.vercel.app | dpl_3bbzzb2u4sWf1AqPysFkRJGv134K | relations-media-20261020-b40c4a9ecc5a | vivid-hedgehog-655 |

Deux builds/typages Vercel complets réussis ; santé publique 200, versions et CSP des deux cibles vérifiées. Les 710 modules de chaque backend correspondent exactement aux empreintes du bundle préparé après publication ; schéma, index et crons inchangés. Les bases publiques distinctes sont conservées (session/reload pour la production, audio pour la démo), ainsi que prompt=login du backend de production. Sources préparées à partir des publications, avec uniquement les correctifs ci-dessous, sans embarquer les WIP voisins. Après autorisation explicite du propriétaire, cinq paramètres antivirus de production ont été configurés et les deux analyses relancées ; voir la recette ci-dessous.

## Demandes de relation

Les requêtes 0ee83c1e0f4f2d88, 7fb0f095aa169d56 et 54e2fb4a4209aa59 sont celles du déploiement de démonstration dpl_BWsD5xMuCHLHNdVwMuXAefvDjLPh. Le journal confirme rateLimited après trois demandes rapprochées admises, avec environ six minutes avant reprise, zéro écriture sociale pour les refus. Le texte « Node cannot be found in the current page » n'existe pas dans la source ; son origine n'est pas établie et aucune correction de ce texte n'est revendiquée.

Le budget anti-abus est conservé. Le frontend partage un verrou synchrone et un délai personnel entre recherche, annuaire, rail et profil ; il empêche les clics concurrents et affiche un compte à rebours. Aucune notification de succès pour un refus. Le nouveau client demande explicitement returnRateLimit=true : ce refus devient alors un résultat typé, sans exception Server Error du SDK. Sans cette option, le contrat historique d'erreur est conservé pour les autres applications du moteur. Le frontend traite aussi les anciennes erreurs pendant la transition.

Validation : 42 tests backend graph, 87 tests des surfaces/hook, codegen et typages stricts réussis. Tests : quota inchangé, effets sociaux absents au refus, acteur indépendant, expiration, compatibilité historique, verrou entre surfaces avant rendu, remontage, reprise et erreurs inattendues. Aucun envoi de demande réelle par cette recette. Les écrans membres production/démo restent accessibles après rechargement ; aucune déconnexion ajoutée.

## Cause des deux vidéos de production retenues

Au diagnostic, les deux vidéos du fil étaient en état error, après trois tentatives, raison AV_ERROR:provider_unconfigured. Aucun verdict infected ou suspicious n'avait été rendu. FILE_SCAN_* était absent de la configuration de production. L'inventaire accessible n'a trouvé aucun service ClamAV existant ; aucune configuration voisine ou donnée externe n'a été réutilisée.

Correction publiée : error donne désormais fileScanUnavailable ; suspicious/infected gardent fileQuarantined. L'URL reste nulle. Profil/photo/couverture ne déclarent pas un succès sur indisponibilité. Les pièces jointes et médias classiques ne réutilisent aucune ancienne URL quand un code de retenue existe. La garde d'analyse complète reste fermée sans preuve AV clean.

Validation du correctif de message : 62 tests backend, contrats, surfaces et cliquets réussis ; codegen/typage Convex et social-features réussis. Le message d'analyse non terminée a été vérifié en production et en démo avant raccordement du moteur réel, sans avertissement/erreur navigateur depuis chaque rechargement de contrôle.

## Antivirus dédié autorisé et publié

Le propriétaire a répondu « Autoriser le projet et l’antivirus ANTSIA » à la demande de création d'un projet Google Cloud dédié, avec facturation à l'usage, raccordement et relance des deux analyses. Le projet okatech-antsia-security a été créé en europe-west1, avec comptes build/runtime distincts, registre dédié et secret dans Secret Manager. Aucune valeur de secret n'est archivée ni transmise par argument de processus ou fichier .env.

La brique ops/clamav/ reprend celle du socle, sans modifier celui-ci. Neuf tests locaux de façade réussis ; syntaxes Node/shell et YAML vérifiées. Le build réel 2b804dad-cdb3-4d19-ab35-af7e377cc78f est SUCCESS, image manual-4cbaad8c7704e42c2b12, digest sha256:2270868a73e647448509beb324365669a2e61dc1d7712bd16f325d4b97429c69. Service antsia-clamav-rest, révision antsia-clamav-rest-00001-ws8 prête, trafic100%, 1CPU/4Gi, concurrence1, minimum0/maximum1, h2c8080 et sondes HTTP/1 sur8081. URL : https://antsia-clamav-rest-4ax5cbw34q-ew.a.run.app. Ces bornes ne constituent pas un plafond monétaire.

Recette du vrai ClamAV : santé200 ; scan sans secret401 ; fichier sain40octets OK ; EICAR68octets FOUND/Eicar-Test-Signature ; fichier sain33MiB OK, ce qui valide aussi le transport Cloud Run au-delà de32MiB. Tests avec octets synthétiques uniquement. La production diligent-avocet-585 utilise clamav-rest, délai60000ms et limite62914560octets. La démo n'a pas été raccordée à ce service dans cette opération.

## Deux vidéos réanalysées et lues en production

La mutation interne requeueUnconfiguredScans refuse tout lot différent de1–2identifiants distincts en erreur exacte provider_unconfigured, tout blob purgé ou fournisseur indisponible. Elle valide le lot entier avant écriture, remet les analyses en attente et programme le vrai moteur. Deux entrées file.requeue de capacité system, sans acteur humain, journalisent le motif provider_configuration_restored. Vingt-deux nouveaux tests, plus28tests de régression fichiers, codegen et typage Convex réussis. Seul modules/files/mutations.js a changé dans cette publication backend ;710empreintes conformes au bundle final, schéma inchangé.

| Analyse | Résultat réel | Durée AV | Tentatives après relance |
|---|---|---|---|
| sx79dbe7ztsxkvsydwr739g9558gm89s | clean / OK / clamav-rest | 5579ms | 1 |
| sx77hp21qk3p4nefkcxgy2zsax8gmmnw | clean / OK / clamav-rest | 6836ms | 1 |

Les deux blobs sont conservés. Aucun verdict forcé, libération manuelle ou mock. Dans Chrome, session membre existante @asted sur antsia.vercel.app/fil, les deux lecteurs décodent1290×2796, durée14,92s, readyState4, erreur nulle. Les deux lectures atteignent14,92s ; la seconde est aussi observée en cours à8,99s. Les messages de blocage/indisponibilité ont disparu. Aucun avertissement/erreur console dans la fenêtre de recette. Preuves medias-production-recovered.json/png et antivirus-scans-after.json. Aucun nouveau contenu ni invitation publié. Cette recette ne prétend pas couvrir un changement entre deux identités réelles.

## Preuves et coordination

Suite autorisée : la démo a ensuite été raccordée au même service, avec deux nouvelles publications vidéo et lectures complètes après rechargement, sans avertissement. Voir [la recette dédiée](31_RECETTE_ANTIVIRUS_DEMO_2026-10-20.md) ; aucun changement de configuration de production lors de cette suite.

Preuves : docs/recette/relations-media-2026-10-20/. Sources/manifeste/bundles et journaux de publication : ~/Library/Caches/antsia-releases/20261020-connection-request/.

Arbre, branche, index et travaux parallèles conservés ; aucun commit applicatif, push ou fichier .env modifié. Nettoyage limité aux deux anciennes copies node_modules et aux dépendances temporaires de cette publication, dans le cache de livraison, après lsof vide et absence de processus dépendant. La dernière copie de dépendances du backend a été retirée après la recette ; sources, manifestes et preuves sont conservés. Aucun projet ni donnée supprimé. Les variations df incluent les écritures des autres sessions ; ne pas attribuer toute variation au nettoyage.
