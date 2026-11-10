# MP14 — Admission et composition des candidats

État : préparation, 21 octobre 2026. Ce document ne constitue pas une ouverture de production.

## Capacités et preuves externes

| Capacité | Décision actuelle | Condition avant ouverture réelle |
|---|---|---|
| Catalogue, boutiques et services | Sources et contrôles ciblés consignés dans EXECUTION.md | Recette intégrée sur le candidat exact et données marchandes admissibles |
| Préparation commerciale et financière | Technique préparée, sans encaissement | Contrats de transport et admission des vendeurs, consentements et conditions vivants |
| Airtel Money, Moov Money, carte, PayPal | Fermés : aucun contrat fourni par le propriétaire | Prestataire qualifié par rail, entité/pays, encaissement, remboursement et reversement couverts ; preuves de callbacks et bénéficiaires |
| Réseau professionnel | Volontaire, distinct de la relation personnelle | Recette de publication, collaboration refusée/révoquée et exposition consentie |
| Rencontres personnelles | Fermées à la demande du propriétaire | Preuve de majorité vérifiable, admission, protections et recette propres avant tout profil ou intérêt |
| Presse | Rédaction et sites spécialisés raccordés ; validation finale à terminer | Relecture, version publiée, correction, modération, révocation et discussion canonique éprouvées |
| Applications natives | Le travail publié par l'autre session est protégé | Tranche spécialisée, liens profonds et recette iOS/Android distincts ; la recette Web ne les remplace pas |

Le pilote ne peut pas activer implicitement une capacité conditionnelle. Une sélection fictive ne prouve ni stock marchand, ni contrat financier, ni réception de fonds.

## Conservation du travail concurrent

Le checkout partagé reste sur `codex/pa4-identite-session`, base `c4d36f345707f87f20dbd970b2850c683c8581be`. L'index réel n'a reçu aucun staging du chantier marketplace. Une autre session a fait progresser `main` : le relevé local `086cd43` était déjà quarante-deux commits devant cette base. Cette référence n'est pas une preuve de fraîcheur distante.

Les 698 entrées sales initiales ne sont pas 698 changements attribuables à ce chantier. Le cache ne possède que vingt-six sauvegardes ciblées, dont huit empreintes initiales : aucun remplacement global de fichier ou publication intégrale du checkout ancien ne peut être justifié par ces sauvegardes.

Composition nécessaire avant toute publication :

1. Choisir et actualiser explicitement la base de publication.
2. Établir un manifeste fermé : nouveau fichier attribué, delta entre sauvegarde et source, hunk attribué manuellement, ou fichier exclu.
3. Reporter seulement ces changements sur la base choisie, en conservant ses apports. `i18n/server.ts`, identique à sa sauvegarde initiale, est notamment exclu du delta marketplace.
4. Préserver les fichiers et comportements démo, identité IDN, natifs, DIASPORALE et les contrats non concernés. Les fichiers natifs absents de l'ancien checkout ne sont pas des suppressions à publier.
5. Utiliser un index privé pour composer le candidat sans modifier le vrai HEAD, l'index ou l'arbre partagé. Contrôler ses blobs et les chemins protégés.
6. Exécuter les vérifications et la recette sur ce candidat exact. Les résultats du checkout partagé ne valident pas automatiquement cette composition.

PRO.GA exige son propre candidat : branche montée `feat/antsia-social-commerce`, base `fa349ea9326e636d40b29120735d4741d62b0e7e`, arbre partagé et aucune photographie initiale complète. La parité des contrats ne suffit pas à attribuer chaque modification.

## Vérification et retour arrière

Génération, types, tests, cliquets et lint doivent être exécutés en série, puis compilation sans serveur de développement concurrent. Recette Web : 390×844, 834×1112, 1440×1000, complément 320px et paysage, clair/sombre, clavier et session. Les cas de rupture et les données fictives admises sont ceux du document 07.

Conserver pour chaque candidat : commit de base, manifeste des fichiers/hunks, empreintes des blobs, commandes et résultats horodatés, captures, capacités fermées et version de retour arrière. Aucun transfert de message, contrat, consentement public réel ou paiement n'est induit par une matrice de recette.

## Incident de stockage

Le propriétaire a autorisé le nettoyage des caches de compilation et le bref arrêt de l'aperçu local. Next et Convex ont été arrêtés ; le cache Next, le cache Node compilé et les modules Convex sans référence ont été retirés. La preuve des modules a parcouru toutes les révisions SQLite et les métadonnées de persistance ; tous les modules référencés, la base, les fichiers médias et les archives de l'autre session ont été conservés.

L'espace est retombé à environ 200 Mio sans serveur actif. La cause de cette nouvelle consommation n'est pas attribuée. Le propriétaire a annoncé libérer au moins 8 Go ; compilation, génération et recette finales attendent l'espace effectivement disponible. Les écritures source légères reprennent, les contrôles finaux ne sont pas déclarés réussis.

Aucun commit, push, déploiement ni ouverture financière ou personnelle du chantier MP n'est attesté par ce dossier à ce stade.
