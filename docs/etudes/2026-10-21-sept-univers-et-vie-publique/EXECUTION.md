# Exécution SU00–SU16

> Dépôt public : les identifiants internes d'hébergement (déploiements, projets, équipes, adresses techniques) sont tenus hors du dépôt ; ce document les désigne par leur rôle (EX-20, 10/11/2026).

Autorisation : le propriétaire a validé les décisions D01 à D08 le 21 octobre 2026 et demandé l'ADR (SU00) et l'analyse de conformité (SU01). D09 à D12 restent proposées : aucun lot ne les présume. Chaque lot s'exécute seul, réservé dans la mémoire partagée, branché dans l'application réelle et vérifié selon les instructions du dépôt ; ses preuves sont consignées ici.

## Référence

- Étude : [ETUDE_SEPT_UNIVERS_ANTSIA.md](ETUDE_SEPT_UNIVERS_ANTSIA.md) et son PDF, version 1.1.
- Décision : [ADR-0035](../../adr/0035-sept-univers-et-vie-publique.md).
- Conformité : [SU01_CONFORMITE_ORDONNANCE_0011.md](SU01_CONFORMITE_ORDONNANCE_0011.md).
- Base de code lue : arbre partagé `codex/pa4-identite-session` (HEAD `c4d36f3`) et `origin/main` `7ffab29` (marketplace MP00–MP14 fusionnée le 21/10, backend non déployé).

## Lots

| Lot | État | Preuves et suite |
|---|---|---|
| SU00 | Terminé — documentaire | ADR-0035 (D01–D08 acceptées, D09–D12 proposées) ; index des ADR mis à jour ; étude passée en version 1.1 |
| SU01 | Analyse livrée ; mise en œuvre par sous-lots | exigences article par article, état du code, écarts, arbitrages juridiques, sous-lots SU01a à SU01j et calendrier ; à faire valider par un juriste avant toute mise en œuvre de l'identification et de l'âge |
| SU01d | En ligne, restes compris, depuis le 22/10 (backend de `f574c75`, front `880d1aa`) ; délais légaux de la console en ligne le 22/10 (backend et console `d7f4784`, puis `3253a10`), recette connectée faite le 23/10 ; bureau de DIASPORALE (diasporale#26) en ligne sur la démonstration seulement (projet de démonstration de DIASPORALE chez l'hébergeur, 22/10) | voir [SU01d — signalements réglementés](#su01d--signalements-réglementés) |
| SU02 | En ligne depuis le 23/10 (PR 77, fronts `1956641`) | Découvrir rangé par piliers (Business, Vie publique, Divertissement), tuiles des seuls univers ouverts ; voir [SU02 et SU06](#su02-et-su06--découvrir-par-piliers-et-alimentation-et-restauration) |
| SU06 | En ligne depuis le 23/10 : premier volet (PR 77, `1956641`), second volet (PR 80, `4cea752`) | gabarit `food`, espace `/restauration` ; menu, horaires, plat du jour et « Commander » : voir [SU06, second volet](#su06-second-volet--menu-horaires-plat-du-jour-commander) ; reste l'index des produits par catégorie `food` |
| SU03 | À faire | types d'offre bien immobilier et véhicule ; dépend de MP03 |
| SU04 à SU16 | À faire | voir l'étude, § 15 |

## SU01d — signalements réglementés

Ordonnance n° 0011/PR/2026, art. 24, 32 et 33.

**Livré en source**
- **Six motifs** : contenu préjudiciable impliquant un mineur, hypertrucage qui me représente sans mon accord, contenu d'IA interdit, imitation d'une institution de l'État, usurpation d'identité, atteinte à la vie privée ou à l'honneur. Le harcèlement est renommé « harcèlement, cyberharcèlement ou intimidation ».
- **Délai légal posé à la transmission** (`legalBasis`, `dueAt`) :
  - 72 h pour la décision (art. 24), pour tout harcèlement, mineur ou non, et pour un contenu préjudiciable impliquant un mineur ;
  - 24 h pour l'hypertrucage d'une personne qui le signale (art. 33) ;
  - 24 h, par prudence, pour les contenus d'IA interdits (art. 32).
- **Accusé de réception** (`report_received`) : émis au déclarant dans la transaction de la transmission ; sa date est inscrite au dossier.
- **Avis de décision** (`report_decided`) : envoyé au déclarant dès qu'un dossier est classé ou suivi d'effet. Il ne dit que l'effet sur le contenu ; ni la sanction ni le motif de modération ne sont communiqués. L'avis arrive dans la cloche du réseau où la personne a signalé.
- **File prioritaire dans `/moderation`** : les délais légaux passent avant la file ordinaire, l'échéance la plus proche d'abord, dans la limite des 50 plus proches. Chaque dossier montre :
  - son fondement ;
  - son chronomètre (reste ou retard, rafraîchi toutes les 30 s) ;
  - son échéance ;
  - l'état de son accusé de réception.
- **« Mes signalements »** dans `/mes-donnees` : motif, échéance, accusé de réception, issue et date de décision ; c'est aussi la destination des deux avis. L'export de données du déclarant comprend ces champs.

**Preuves**
- Tests du moteur `convex/modules/moderation/reporterNotices.test.ts` (11), menés sur des comptes fictifs avec l'horloge simulée :
  - transmission, accusé, décision à 71 h et avis au déclarant, de bout en bout ;
  - file prioritaire et compétence des équipes ;
  - cloche, réseau du déclarant et chemin historique des publications.
- Tests du domaine (motifs, fondements, échéances, issue) et de l'interface (chronomètre, file prioritaire, cloche).
- Recette navigateur du 22/10/2026, sur le backend local isolé d'un candidat tiré de `main` (variables posées avec l'accord du propriétaire), avec les comptes de démonstration :
  - Awa MBA signale trois publications fictives de Jean-Rémy NDONG : un hypertrucage, un harcèlement et une information trompeuse ; le dialogue propose les 12 motifs et annonce l'accusé et la décision ;
  - trois accusés de réception arrivent dans sa cloche dès la transmission, chacun menant à « Mes signalements », qui affiche les échéances : 22/10, 23:37 (art. 33) et 24/10, 23:37 (art. 24) ; aucune pour la désinformation ;
  - dans `/moderation`, Nadège KOUMBA voit « Délais légaux » en tête, l'hypertrucage avant le harcèlement, avec l'accusé affiché ; les chronomètres passent de 58 à 57 min sans rechargement ; la désinformation est seule dans « Autres signalements » ;
  - retrait de l'hypertrucage à 23:41, avant l'échéance, et classement de la désinformation : Awa reçoit deux avis « Une décision a été prise sur votre signalement. », et « Mes signalements » dit « Contenu retiré », « En cours d'examen » et « Aucun manquement retenu », sans sanction ni motif de modération ;
  - à 390 px : pas de défilement horizontal, l'ancre `#mes-signalements` reçoit le focus ; aucune erreur dans la console.
  - Limite : le navigateur intégré bloque les dialogues natifs ; la confirmation du retrait a donc été acceptée en remplaçant `window.confirm` dans l'onglet.

**Mise en ligne**
- Backend déployé le 22/10/2026 vers 1 h, démo puis production, avec l'accord écrit du propriétaire : `9927c9c` (3 index sur `reports`, `deadlineQueue` et `myReports`), puis `bca19af`.
- Fronts publiés depuis `main` : `26f3024`, puis `bca19af` (docs/35). La production répond `main-bca19af78116`, qui contient SU01d.
- Restes en ligne le 22/10/2026 vers 10 h 40 :
  - backend de `main` `f574c75`, identique sous `convex/` à `880d1aa`, sur la démo (déploiement Convex de démonstration) puis la production (déploiement Convex de production), avec l'accord écrit du propriétaire ;
  - aperçus `--dry-run` sains : aucun index supprimé, schéma validé. Seule ligne affichée : « version Node des actions », un artefact `null`/`undefined` de la CLI, sans valeur de part et d'autre ;
  - la production portait déjà ce backend (1 034 fonctions, signatures identiques à la démo), déployé en même temps que le front `880d1aa`. Elle n'a pas été poussée une seconde fois ;
  - contrôles en lecture seule sur les deux : `transparencyDeadlines` répond (seuil 5, douze périodes, aucune encore publiée), `transparency` garde sa forme, `/transparence` dit les délais (front `main-880d1aadf525`).

**Restes livrés le 22/10/2026 (en ligne le jour même)**

*Délais tenus sur `/transparence`* (moteur et antsia.ga) :
- Le passage quotidien de transparence compte, pour chaque jour UTC, les échéances légales **tombées** ce jour-là. Il le fait dans un second passage, `aggregateNetworkDeadlines`.
  - Une échéance est **tenue** si le dossier est classé ou suivi d'effet à l'échéance ou avant.
  - Elle est **manquée** sinon : décidée après, ou encore ouverte ou en examen une fois l'échéance passée.
  - Le passage mesure la veille : toutes ses échéances sont passées et chaque issue est définitive.
  - Règle pure `reportDeadlineOutcome` ; nouvel index `reports.by_network_dueAt`, sans statut, pour que la borne des auteurs distincts couvre tous les statuts d'un même lot.
- Règle de publication (`legalDeadlineDisclosure`), celle des petites cohortes de la transparence et de l'ADR-0011 :
  - une période ne publie ses échéances que si elle était close au calcul et compte au moins 5 échéances sur 5 auteurs distincts ;
  - chaque nombre sous 5 se dit « moins de 5 », zéro compris ;
  - la base n'est jamais publiée, ce qui empêche toute inférence par différence.
- Une projection publique **à part**, `transparencyDeadlines`. Les écrans déjà publiés lisent `transparency` en schéma strict : sa forme ne change pas.
  - Sans cette projection (ancien backend), la page garde ses totaux et ne dit rien des délais.
  - L'ordre de déploiement est donc libre.
- La page dit les délais de l'ordonnance, lus depuis la règle (72 h, 24 h, n° 0011/PR/2026), puis, par période publiée, « Échéances légales : N dans le délai · moins de 5 hors délai ». Aucun chiffre n'est écrit en dur dans les textes (cliquet `public-communication`).

*DIASPORALE* :
- Le menu de signalement suit le moteur : `REPORT_REASONS` vaut `CONTENT_REPORT_REASONS`, soit les douze motifs dans son ordre, dans les deux feuilles (publication, et contenus de la vague H).
- Servies par le moteur, les deux feuilles annoncent l'accusé de réception puis la décision. La démonstration ne promet rien.
- La cloche dit les deux avis par des phrases propres au lieu de « nouvelle activité » :
  - « Votre signalement a bien été reçu. La décision vous sera communiquée. » ;
  - « Une décision a été prise sur votre signalement. ».
  Chacun mène à « Mes signalements » ; jamais vers le contenu signalé.
- « Mes signalements » dans `/parametres#mes-signalements` (section « Mes données ») :
  - issue pour le contenu, motif, transmission, accusé de réception, fondement et échéance légale, date de décision ;
  - ni auteur, ni sanction, ni motif de modération ;
  - ouverte depuis la cloche, la rubrique se place et prend le focus une fois lue ;
  - lecture de `cases.myReports` par l'adaptateur du moteur. Le fournisseur de démonstration ne la sert pas : la rubrique n'y apparaît pas.

**Preuves des restes**
- Tests du domaine : issue d'une échéance (tenue, manquée, à venir) ; règle de publication (seuils, auteurs, période close, période antérieure).
- Test du moteur de bout en bout, horloge simulée, dans `reporterNotices.test.ts` :
  - six harcèlements visant six auteurs, cinq tranchés à temps, un laissé ouvert ;
  - un hypertrucage qui échoit un autre jour et une désinformation sans échéance ;
  - le passage mesure 5 tenues, 1 manquée, 5 auteurs ; la projection publie `{ met: 5, missed: null }` pour ce seul jour, sans aucun identifiant ni motif ;
  - six échéances d'un seul auteur, même tenues, ne se publient pas.
- Test de la projection : période antérieure à SU01d, période calculée avant sa fin ; la forme de `transparency` est inchangée.
- Test de la route `/transparence` (rendu serveur) : délais lus depuis la règle, lignes par période, projection indisponible, OTT.
- DIASPORALE :
  - la cloche dit les deux genres et mène à « Mes signalements » ; aucun lien sans route ;
  - l'adaptateur projette `myReports` et ferme une autre personne ou une session absente ;
  - la rubrique : rendu, état vide, refus, ancre et focus ;
  - les feuilles : douze motifs, suite annoncée hors démonstration ;
  - les motifs sont égaux à ceux du moteur.
- `bun run verify` vert sur le candidat composé depuis `main` :
  - 3 224 tests du moteur, 150 de cliquets, 1 767 d'antsia.ga, plus ceux de DIASPORALE ;
  - aucune erreur de lint.
- Recette navigateur du 22/10/2026 :
  - backend local isolé du candidat, avec les trois mêmes variables posées avec l'accord du propriétaire ;
  - comptes de démonstration ;
  - captures dans [`recette/`](recette/), et pour DIASPORALE dans `docs/recette/su01d-avis-et-motifs-2026-10-22/` de son dépôt.
  - `/transparence`, visiteur anonyme :
    - le vrai passage a mesuré deux jours passés, sans aucune échéance réelle ;
    - leurs accumulateurs ont ensuite été posés **à la main**, par un appel direct du second passage : 7 tenues, 0 manquée, 5 auteurs ; puis 3, 6, 5. Sans horloge simulée, aucune échéance réelle ne peut échoir dans la journée ;
    - la projection rend `{ met: 7, missed: null }` et `{ met: null, missed: 6 }` ;
    - la page dit les délais (n° 0011/PR/2026, 72 h, 24 h), puis « Échéances légales : 7 dans le délai · moins de 5 hors délai » et « … moins de 5 dans le délai · 6 hors délai », et rien pour les dix autres jours ;
    - à 390 px : aucun défilement horizontal (`scrollWidth` 390), la ligne passe sur deux lignes dans sa carte.
  - DIASPORALE, servi par le moteur :
    - Patrice MBOUMBA, membre vérifié, publie un texte fictif ;
    - Sandrine ONDO, membre parrainée, ouvre « Signaler » : douze motifs dans l'ordre du moteur, et la suite annoncée ;
    - elle signale un harcèlement. L'accusé arrive aussitôt dans sa cloche (« Votre signalement a bien été reçu. La décision vous sera communiquée. »), avec « Voir mes signalements » ;
    - ce lien ouvre la rubrique. Elle se place et prend le focus, puis dit : « En cours d'examen », l'accusé de 10:15, et « Art. 24 : décision notifiée sous 72 h — échéance : 25 oct. 2026, 09:15 ». L'heure d'hiver du 25/10 est comprise ;
    - Ruth ALLOGHO, modératrice, retire le contenu à 10:17 dans `/moderation`. Dans le moteur, la décision et l'avis au déclarant portent la même seconde ;
    - Sandrine lit « Une décision a été prise sur votre signalement. ». À 390 px, sans défilement horizontal, la rubrique dit « Contenu retiré » et « Décision le 22 oct. 2026, 10:17 » ;
    - en anglais : « My reports », « Content removed » ;
    - console : des 401 pendant les changements de compte, et le rechargement à chaud perdu en passant d'une application à l'autre sur le même port.

**Bureau de modération de DIASPORALE (livré le 22/10/2026 : diasporale#26, `d18dd20` ; en ligne sur la démonstration seulement)**
- `/moderation` d'`apps/diasporale_com` ouvre l'onglet « File » sur une voie « Délais légaux », lue dans `cases.deadlineQueue`. Cette requête est en ligne depuis `9927c9c` et `cases.ts` n'a pas changé depuis.
  - L'échéance la plus proche d'abord, 50 au plus.
  - Pour chaque dossier : fondement (heures lues par `personalReportDelayHours`), chronomètre (reste ou retard, rafraîchi toutes les 30 s sans relire la base), échéance, accusé de réception.
  - Ni le pays ni la nature ne la filtrent ; elle suit l'équipe choisie, dont le sélecteur passe en tête de l'onglet. Comme la file, elle liste sans rien compter.
  - La feuille d'un dossier ouvert depuis la voie rappelle son délai ; le message d'issue revient dans la voie.
- File ordinaire à part : `lane: "ordinary"` dans le port, comme la file du moteur.
  - La tranche `diaspora/moderationDesk` ne range pas ses fenêtres par échéance : l'adaptateur écarte donc les dossiers de la voie, lue avec la même compétence (même abonnement).
  - Il attend la voie et ne cache rien si elle est illisible. Au-delà des 50, un dossier à délai légal reste dans la file ordinaire.
- Démonstration : la règle du moteur (`reportLegalBasis`, `reportDecisionDueAt`) pose les délais des dossiers fictifs ; un hypertrucage fictif (art. 33, 24 h) rejoint le jeu.
- Aucune modification du moteur : aucun backend à publier avant le front.

**Preuves du bureau DIASPORALE**
- Tests de l'adaptateur (projection, refus, file ordinaire qui attend la voie ou la laisse entière), de la démonstration (règle du moteur, ordre, équipe, décision), des règles pures (chronomètre, file ordinaire) et de l'écran (voie en tête, retard, chronomètre qui avance, feuille, voie vide ou illisible).
- `bun run verify` vert sur le candidat composé depuis `main` (`880d1aa`, docs seules depuis) : 3 224 tests du moteur, 150 de cliquets, 885 de `@diasporale/features`, 1 415 de `diasporale-com`, 1 767 d'antsia.ga ; lint sans erreur.
- Recette navigateur du 22/10/2026, backend local isolé du candidat avec les trois mêmes variables (aucune nouvelle), comptes de démonstration :
  - Patrice MBOUMBA publie deux textes fictifs ; Sandrine ONDO signale le premier pour harcèlement, le second pour « Autre motif » ;
  - Ruth ALLOGHO voit le harcèlement dans « Délais légaux » : « Art. 24 : décision notifiée sous 72 h », « Reste 71 h 58 min », échéance le 25/10 à 10:07 (heure d'hiver comprise), accusé de réception ; l'autre dossier est seul dans la file ordinaire ;
  - elle retire le contenu depuis la voie : le message d'issue prend le focus dans la voie, qui se vide ;
  - un contenu d'IA interdit signalé par Hervé MOUBAMBA entre dans la voie avec « retrait sous 24 h » ; le chronomètre passe de 23 h 59 à 23 h 58 sans rechargement ;
  - à 390 px, aucun défilement horizontal ; la démonstration montre l'hypertrucage fictif avant les trois harcèlements fictifs ;
  - captures dans `docs/recette/su01d-bureau-delais-2026-10-22/` du dépôt DIASPORALE.

**Console d'exploitation : les délais légaux (22/10/2026, en ligne le jour même)**

Périmètre tranché par le propriétaire le 22/10/2026 : l'export suit la règle de `/transparence` ; une alerte en direct dans « Santé du réseau », sans cron ni écriture ; une recette par les tests et par un banc visuel.

*Export agrégé* (`platform/console.aggregateExport`, panneau « Export agrégé ») :
- Chaque période ajoute `legalStatus`, `legalMet` et `legalMissed`. Les nombres viennent de `legalDeadlineDisclosure`, la règle publique :
  - période close au calcul, au moins 5 échéances sur 5 auteurs distincts ;
  - chaque nombre sous 5 vaut `null` (« moins de 5 ») ;
  - ni la base ni la borne des auteurs ne sortent.
- L'état (`legalDeadlineStatus`) distingue une période **non mesurée** d'une période **masquée**, sans ajouter de nombre. Non mesurée : avant SU01d, avant le second passage, ou calculée avant sa fin.
- Ces chiffres ne dépendent pas du masque des dossiers de la période : les deux populations diffèrent (dossiers transmis, échéances tombées).
- JSON et CSV : trois colonnes ajoutées **à la fin** (`legalStatus,legalMet,legalMissed`). La construction fermée de l'écran remasque tout nombre sous le seuil et refuse un état inconnu ; la réponse d'un moteur antérieur se lit « non mesurée ».

*Alerte d'exploitation* (`platform/console.legalDeadlineAlert`, bloc « Délais légaux des signalements » en tête de « Santé du réseau ») :
- Lecture opérateur bornée : les 50 échéances les plus proches de chaque statut, ouvert ou en examen (`reports.by_network_status_dueAt`), arrondies à la minute inférieure, avec leur seul fondement légal (la classe du motif, jamais le motif). Ni dossier, ni cible, ni personne.
- C'est une donnée d'exploitation, hors de la règle des petites cohortes, qui vise ce qui se publie ou s'exporte : les opérateurs décident déjà en dernier ressort sur tout dossier (`decideAsOperator`) et lisent le journal des décisions. L'arrondi à la minute ne fait sortir que le nécessaire ; un retard s'annonce au plus tôt, jamais en retard.
- L'écran compte à son heure, rafraîchie chaque minute, car une requête n'est pas relue quand le temps passe :
  - en retard (échéance atteinte, comme `reportDeadlineOutcome`), échéance dans les 24 h, total à délai légal ;
  - retards par fondement (art. 24, 32, 33) et plus ancienne échéance dépassée.
- Au-delà de la borne, `horizon` (la plus proche échéance non lue) dit quels comptes sont des minimums : « au moins N », ou « non déterminé » ; les retards par fondement suivent l'exactitude des retards.
- Une lecture en échec (moteur pas encore publié, panne) ne retire que ce bloc : sa frontière d'erreur laisse « Santé du réseau » lisible et propose « Réessayer ». `ConsoleQueryBoundary` passe dans les contrôles partagés de la console, et son ancien chemin d'import reste valable.
- En retard : bloc bordé de rouge et message `role="alert"` ; sinon, un simple état. Aucune notification externe : la file prioritaire des modérateurs reste le lieu du traitement.
- Ni cron ni écriture : les cliquets `operator-audit` et `crons-contract` n'ont rien de nouveau à garder.

*Preuves*
- Domaine : `legalDeadlineStatus` (publiée, masquée, non mesurée).
- Moteur, `console.test.ts` :
  - la règle de l'export, période par période ;
  - de bout en bout avec les deux passages réels et l'horloge simulée : 5 tenues, 1 manquée, 5 auteurs, donc `legalMet: 5` et `legalMissed: null` ;
  - l'alerte : statuts, file ordinaire, réseau voisin, échéances à la minute, aucun identifiant ni motif ; sa borne ; le refus d'un membre non opérateur et d'un réseau archivé ;
  - l'horizon quand l'un ou l'autre statut est tronqué le premier (`Math.max` ou une simple affectation à la place de `Math.min` font échouer le test).
- Écran :
  - export fermé : remasque, état inconnu, moteur antérieur, colonnes CSV ;
  - comptes de l'alerte : bascule à l'échéance, exactitude selon l'horizon ;
  - rendu des deux panneaux ; un dossier passe en retard une minute plus tard, sans relire la base ;
  - lecture bornée : aucun compte, fondements compris, ne se dit zéro ;
  - lecture en échec : seul le bloc tombe, « Réessayer » le relance.
- `bun run verify` vert sur la branche à jour de `main` `3e6c50d`, DIASPORALE compris : 3 229 tests du moteur, 150 de cliquets, 98 de la console, 1 767 d'antsia.ga, 1 405 de diasporale.com ; aucune erreur de lint.
- Recette : la console n'admet qu'une session IDN de niveau 2, impossible en local sans client IDN, et le rapport PA7 exclut tout contournement. Un banc jetable, jamais commité, a monté les vrais `ExportPanel` et `HealthPanel`, avec `convex/react` simulé par des données fictives et la feuille compilée depuis `globals.css` de la console :
  - à 1 280 px, l'export dit « 7 · moins de 5 », « moins de 5 · 6 », « masquées » et « non mesurées », et masque les compléments des dossiers ; l'alerte dit 3 retards (2 au titre de l'art. 24, 1 de l'art. 33), 2 échéances dans les 24 h et 6 dossiers au total ;
  - lecture bornée : « au moins 50 » en retard et au total, « non déterminé » pour les 24 h à venir ; par fondement, « au moins 40 », « non déterminé », « au moins 10 » ;
  - à 390 px : aucun défilement horizontal (`scrollWidth` 390), aucun élément hors de l'écran ;
  - captures : [`recette/su01d-console-banc-*.jpg`](recette/).
- Recette connectée, le 23/10, sur la console en ligne (`3253a10`), en lecture seule. Le propriétaire est entré par IDN (niveau 1, ADR-0039) :
  - connexion : « Me déconnecter partout », puis IDN, **un seul PIN** (constat du propriétaire). La double saisie venait du portail IDN, qui rejouait `prompt=login` après la saisie. Le correctif, identite.ga#19, est en ligne depuis le 22/10 : Vercel publie le portail depuis le dépôt `ntsagui/idn-gabon`, commit `bd7ed1e` ;
  - export : deux périodes (du 20 au 21/10 et du 21 au 22/10), cohortes « Masqué », échéances légales « Non mesurées pour cette période ». Les deux ont été calculées par le passage de 04 h 10 UTC, avant le second passage (`f574c75`, fusionné le 22/10 à 08 h 22 UTC). La première période mesurée sera celle du 22 au 23/10 ;
  - alerte : « Aucun délai légal dépassé parmi les dossiers ouverts ou en examen. », 0 en retard, 0 dans les 24 h, 0 au total, avec le message de l'horloge ;
  - à 390 px : navigation en liste déroulante, tuiles empilées ; aucun défilement horizontal (`scrollWidth` 390), aucun élément hors de l'écran, dans les deux panneaux ;
  - ni téléchargement JSON ou CSV, ni « Actualiser les compteurs » (un calcul en base). Aucune capture n'est versée : l'écran réel montre l'opérateur.

**Ce qui reste de SU01d**
- Console en ligne le 22/10, avec l'accord écrit du propriétaire ([docs/35](../../35_PUBLICATION_DONNEES_DEMO_2026-10-22.md)) : backend et console `d7f4784`, puis `3253a10` (ADR-0039 : l'IDN de niveau 1 suffit). Le premier opérateur, le propriétaire, est posé, et sa recette connectée est faite le 23/10 (ci-dessus).
- DIASPORALE, bureau compris, est en ligne sur la démonstration seulement, depuis le 22/10 (projet de démonstration de DIASPORALE chez l'hébergeur ; ADR-0038, [docs/35](../../35_PUBLICATION_DONNEES_DEMO_2026-10-22.md)). Sa production attend le propriétaire : décision d'hébergement A10, textes légaux relus, domaine diasporale.com, réseau créé par la console.
- Premiers chiffres : le passage quotidien de 04 h 10 UTC mesure la veille. Une journée ne se publie qu'à partir de 5 échéances sur 5 auteurs.

## SU02 et SU06 — Découvrir par piliers, et Alimentation et restauration

Demande du propriétaire, le 22/10/2026. Il fallait séparer la marketplace des produits de celle des prestataires,
la mode de la restauration et de l'épicerie, et donner une vraie place à « Ma boutique ». Réponse tirée de l'étude :
- une seule marketplace à trois onglets (Produits, Boutiques, Services, ce dernier étant la marketplace des prestataires) ;
- « Alimentation et restauration » est un univers à part (§ 5.4) ;
- la gestion vit dans « Mon activité » (§ 12).

Le propriétaire a validé l'ordre : publier la marketplace déjà faite, puis ces trois volets.

- **Ma boutique.**
  - Le moteur reçoit la route `myActivity`.
  - « Créer » offre « Mon activité ».
  - Le rail montre « Ma boutique » à qui gère une boutique.
  - `/mes-boutiques` présente une carte de tableau de bord par boutique : gérer, vitrine, page, clients dans iCom Pro.
- **SU06, premier volet.**
  - Gabarit d'activité `food`, distinct de la mode.
  - La carte de boutique dit son gabarit (`template`).
  - Espace `/restauration` : les adresses au gabarit `food`, puis ce qu'on y commande, réglé à la remise.
- **SU02.**
  - Business : Boutiques, Services et artisans (avec une offre publiée), Alimentation et restauration (avec une adresse ouverte), réseau pro.
  - Vie publique : presse.
  - Divertissement : Clips, rencontres.
- **Vérification.** `bun run verify` vert (588 s, 15 505 tests), puis recette locale, puis recette en ligne sur la démo :
  - 1 440 px : rail « Ma boutique », Découvrir et ses trois piliers ;
  - `/restauration` : l'épicerie et 13 offres de démonstration ;
  - 390 px : aucun débordement, « Mon activité » dans « Créer ».
  - Captures : [`recette/en-ligne-*.jpg`](recette/).
- **Démo.** L'Épicerie Moussavou Démo est passée au gabarit « Alimentation et restauration » par son éditeur (compte Commerçant).
- **Reste de SU06** : traité par le [second volet](#su06-second-volet--menu-horaires-plat-du-jour-commander), sauf
  l'index des produits par catégorie `food`, qui attend le reflet du catalogue de PRO.GA.

## SU06, second volet — menu, horaires, plat du jour, Commander

Demande du propriétaire, le 23/10/2026 : « continue l'univers Alimentation et restauration — menu, horaires, plat du jour
et « Commander » ». L'étude (§ 5.4) dit : « menu à jour, plat du jour en Story, commande à retirer ou livrée, avis ».

- **Plat du jour.**
  - Une offre du menu, désignée pour un jour civil de Libreville (UTC+1, sans heure d'été). Le lendemain, plus rien ne
    l'annonce tant que l'adresse n'en désigne pas un autre. La règle est pure et partagée
    (`packages/social-domain/src/dailySpecial.ts`) : le serveur date la désignation, l'écran juge si elle vaut aujourd'hui
    (une requête Convex n'est pas relancée au passage de minuit).
  - Mutation `shops.setDailySpecial` : limitation de débit `shop.edit`, gérant d'une boutique au gabarit `food` qui a sa
    page, offre relue comme le gérant la lit et produit seulement. Sinon, le refus indistinct. Une désignation identique
    le même jour n'écrit rien ; `null` la retire. Rien n'est réécrit dans la présentation : ni modération ni admission
    rejouées.
  - Éditeur, étape « Mes offres » : panneau « Plat du jour » (React Hook Form et Zod), produits du menu par fenêtres de
    dix, retrait possible.
  - Vitrine : le plat ouvre le corps, photo sur les deux tiers (2:1 au bureau), prix et « Commander ».
  - Univers `/restauration` : rangée « Plats du jour » en tuiles verticales, façon Story, avant les adresses. Une offre
    devenue illisible ne laisse ni tuile ni titre.
- **Horaires** : dans l'en-tête de la vitrine d'une adresse `food` (plus répétés dans la présentation), et sous chaque
  carte de l'univers. La carte de l'annuaire porte désormais `hours`.
- **Menu** : sur la vitrine d'une adresse `food`, le catalogue s'appelle « Menu » et le bouton « Voir le menu ».
- **« Commander »** : `catalog.postOffer` dit le gabarit de la boutique ; la formule d'un produit d'une adresse `food`
  dit « Commander » et mène à la même fiche, au même panier, réglé à la remise. Un produit sur devis reste une fiche.
- **Preuves** : tests du moteur (`convex/modules/shops/demoCatalog.test.ts`, deux cas : gardes, datation à Libreville,
  vitrine, éditeur et carte), du domaine (`dailySpecial.test.ts`) et de l'interface (`daily-special.test.tsx`,
  `offer-post-formula.test.tsx`, `food-universe-screen.test.tsx`). Recette locale sur le candidat, compte Commerçant :
  désignation par l'éditeur (refus Zod sans choix), vitrine à 1 440 et 390 px, univers, aucun débordement.
- **En ligne** le 23/10/2026 (backend démo puis production, fronts enfant puis principal, `main-4cea752365fe-*` ;
  registre : `docs/35`). Sur la démo, l'Épicerie Moussavou Démo annonce « Poisson fumé au feu de bois — Démo » pour le
  23/10, et ses horaires « Du lundi au samedi, de 7 h à 20 h », posés par son éditeur. Recette en ligne : éditeur, vitrine, publications « Commander » et `/restauration` à
  1 440 px, vitrine et univers à 390 px. Captures : [`recette/en-ligne-su06-*.jpg`](recette/).
- **Non couvert** : la vitrine publique (lecture sans compte) n'annonce pas le plat du jour ; la page du catalogue garde
  son titre « Catalogue » ; le plat du jour n'est pas publié dans les Stories du réseau (la rangée de l'univers en tient
  lieu).

## Conditions externes

- Statut de la suspension des réseaux sociaux par la HAC au 21/10/2026 : non confirmé.
- Inscription au registre de la HAC, représentant légal, identité de l'éditeur, dossier APDPVP : relèvent du propriétaire (SU01, § 5).
- Paiements (MP08), preuve de majorité (MP10), conventions de vérification d'État (D09) : inchangés.
