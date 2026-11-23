# ADR-0042 : Un réseau gouverné s'administre par son administrateur, en session d'identité numérique prouvée, depuis une application dédiée

- **Statut** : Proposé (demande du propriétaire du 2026-11-22 ; plan de l'agent architecte du même jour, fiche
  « application d'administration de DIASPORA.GA », décisions D1 à D6)
- **Date** : 2026-11-23
- **Chantier** : CH-815, lot A1 (moteur)
- **Amende** : ADR-0041, point 4 (la bascule des fonctionnalités quitte le bureau de l'application des membres,
  voir l'amendement en fin d'ADR-0041).
- **Patron** : la console du moteur (ADR-0011, ADR-0039) : connexion par identité numérique seule, preuve de
  session scellée au retour, accès journalisé avant tout affichage, toute décision au journal.

## Contexte

Le propriétaire veut superviser DIASPORA.GA depuis une application d'administration à part,
`admin.diaspora.ga` : donner les modules (ouvrir ou refermer les volets du menu des membres), contrôler le
réseau, vérifier ses fondateurs, ses pages officielles et ses pays.

La console du moteur ne connaît que des opérateurs de plateforme, sans réseau : un « mode réseau » n'y
serait qu'un filtre d'écran. Le rôle `network_admin`, la garde du dernier administrateur et le journal
existent déjà. Jusqu'ici, l'administrateur du réseau réglait les fonctionnalités depuis le bureau de
l'application des membres, avec une session quelconque (un code par courriel suffisait).

Une session d'identité numérique est scellée par le moteur à CHAQUE retour IDN, quelle que soit
l'application de départ, et la preuve ne disait pas pour quelle application elle avait été ouverte. Une
session de diaspora.ga et une session d'administration étaient donc indiscernables.

## Décision

Nous ajoutons au moteur deux constructeurs, `networkAdminQuery` et `networkAdminMutation`
(`convex/lib/functions.ts`, garde dans `convex/lib/networkAdminIdentity.ts`), et nous scellons la preuve de
session avec l'application où le retour IDN livre la session.

1. **La preuve porte son application.** Au retour IDN, le moteur inscrit sur la preuve
   (`operatorSessionProofs.application`) la clé du catalogue de l'application où la session est livrée. Il
   la prend de l'état OAuth qu'il a lui-même enregistré en base au départ (`callbackURL`, contrôlé contre
   les origines de confiance, rendu absolu à l'origine de départ, destinataire du jeton à usage unique de
   la session), jamais de l'origine de la requête de rappel (le rappel central est une navigation sans
   en-tête `Origin`) ni d'un argument du client (`betterAuth/settings.applicationOfOAuthState`). Une
   adresse de nouvel utilisateur vers une autre application, un parcours natif ou une adresse hors des
   origines de confiance ne scellent aucune application.
2. **Le catalogue dit qui administre quoi.** Une application web du catalogue déclare le réseau qu'elle
   administre (`administers_network`, l'identifiant d'adresse du réseau). C'est la seule source : aucune
   ligne en base ne fait d'une application une porte d'administration.
3. **La garde**, après `requireMembership` : rôle `network_admin` relu à chaque appel ; adhésion qui
   permet d'exercer le rôle (« déclarée » au moins, sans suspension) ; preuve de la session appelante
   vivante, avec les mêmes contrôles que la console (garantie `CONSOLE_MIN_LOA`, lien IDN courant, session
   Better Auth vivante, non expirée) ; preuve scellée pour une application qui administre CE réseau ;
   accès d'administration journalisé pour ce couple (session, réseau). Tout refus est le refus du
   non-membre (`notFound`) ; une suspension garde le refus de tout membre suspendu.
4. **Deux portes d'entrée** (`convex/modules/networks/adminAccess.ts`), seules à passer sans accès
   journalisé : `myNetworkAdmin` (qui suis-je, l'accès est-il journalisé ?) et `recordAccess` (une ligne
   `network.admin_access` au journal, une fois par session et par réseau ; rejouée, rien n'est écrit).
5. **Deux journaux d'accès distincts.** L'accès d'administration du réseau est inscrit sur la preuve
   (`networkAdminAccess`), à part de celui de la console (`accessLoggedAt`) ; la console refuse toute
   preuve scellée pour une application qui administre un réseau. Une session d'administration du réseau
   n'ouvre jamais la console, une session de console jamais l'administration d'un réseau.
6. **Écrire est borné et tracé.** `networkAdminMutation` passe la garde d'écriture de la modération, le
   budget commun `social.write` et le budget propre `network_admin.write` ; le cliquet
   `network-admin-audit` exige que toute `networkAdminMutation` appelle `appendAudit` dans sa définition.
7. **Écrivain unique des réglages du réseau.** `features.settings` et `features.setFeature` passent sous
   ces constructeurs, mêmes noms, mêmes arguments. Les jumeaux bornés au réseau pour les pages officielles,
   les fondateurs et les pays ouverts suivront (lots A2 et A3), sous les mêmes constructeurs.

## Conséquences

### Positives

- La supervision d'un réseau a son autorité propre, prouvée et tracée, sans élargir celle de la console.
- Une session ouverte dans l'application des membres ne décide plus rien pour le réseau, même pour son
  administrateur.
- Une nouvelle décision de l'administrateur ne peut pas oublier son journal (cliquet).

### Négatives

- Les preuves d'avant cette décision ne portent pas d'application : l'administrateur doit se reconnecter
  par l'application d'administration (la console garde ses preuves anciennes).
- Le bureau de l'application des membres appelle encore `settings` et `setFeature` jusqu'au lot A5 : il y
  reçoit désormais le refus indistinct (attendu).
- Le catalogue et le dossier de l'application d'administration se fusionnent en couple (cliquet
  `deploy-catalog`), et le moteur doit être republié pour que l'origine de confiance en découle.

### Neutres

- Le premier administrateur est nommé à la console, sur une adhésion existante (`setNetworkRole`) ;
  personne n'est créé d'office.
- L'application d'administration n'a pas de client d'identité propre (le retour IDN est central) et n'est
  jamais inscrite au registre des applications de notification.

## Alternatives considérées

### Opérateur de plateforme « épinglé » sur un réseau à l'écran

Une option d'affichage n'est pas un droit : le serveur ne saurait pas borner l'opérateur au réseau.
Rejeté.

### Capacité d'opérateur par réseau

Deux sources d'autorité sur le même réseau (le rôle de réseau et une habilitation d'opérateur). Rejeté.

### Groupe de routes dans l'application des membres

Le code d'administration serait livré aux membres, et une session de diaspora.ga vaudrait pour
l'administration. Rejeté.

### Application de la session prise de l'origine du rappel

Le rappel IDN est central et sans en-tête `Origin` : l'origine ne dit rien de l'application de départ.
Rejeté au profit de l'état OAuth enregistré par le moteur.

## Références

- Fiche : `ECOSYSTEMES/DOCUMENTATION/DIASPORA_GA/Administration_et_lancement_2026-11-22/Fiche_application_admin_DIASPORA_GA_2026-11-22.md`.
- Code : `convex/lib/functions.ts`, `convex/lib/networkAdminIdentity.ts`, `convex/lib/operatorIdentity.ts`,
  `convex/betterAuth/settings.ts`, `convex/betterAuth/auth.ts`, `convex/modules/platform/operatorAccess.ts`,
  `convex/modules/networks/adminAccess.ts`, `convex/modules/networks/features.ts`.
- Recettes : `convex/modules/networks/adminAccess.test.ts`, `convex/betterAuth/idnApplication.test.ts`,
  `tests/ratchets/network-admin-audit.test.ts`.

## Amendement du 2026-11-23 (CH-815, lot A6) — les décisions quittent le bureau des membres

Statut « Proposé ». Fiche, décision D5 : « le bureau de diaspora.ga traite, l'application
d'administration décide ». Les décisions suivantes de DIASPORA.GA ne se prennent plus que par les
constructeurs de l'administrateur du réseau, en session prouvée et journalisée de
l'application d'administration ; une session de l'application des membres reçoit le refus
indistinct, même celle de l'administrateur.

- **Propres à la tranche, déménagées en place** (mêmes noms, mêmes arguments) :
  `diaspora/moderationDesk.appealQueue`, `teamRoster`, `responsibles`, `teamCandidate` ;
  `diaspora/membership.setResponsibleRole` ; `diaspora/pilotMetrics.pilotMetrics` et
  `pilotMetricsAccess` (toujours gardées par la clé `pilotMetrics` : les constructeurs de
  l'administrateur reçoivent l'option `feature` ; la modération du réseau ne lit plus la mesure).
- **Partagées par le moteur, jumelées** : `moderation/networkAdmin` (`reviewNetworkAppeal`,
  `createTeam`, `setTeamMember`, `policies`, `blockedTermsPage`, `setPolicy`, `setBlockedTerm`),
  même cœur métier que `moderation/cases`, même motif, même ligne de journal à titre de
  `network_admin`, budget `moderation.decide` en plus des deux budgets du constructeur. Les
  originaux de `moderation/cases`, et `moderation/networkAppeals.paginate`, refusent un réseau qui
  a son application d'administration au catalogue (`isAdministeredNetwork`) ; pour la racine et
  tout autre réseau, ils ne changent pas.
- **Journal** : `platform/audit.paginateNetworkAdminAudit`, la lecture du journal du réseau par
  son administration, filtrable par action (même projection que la console, plus le motif) ; et
  `networks/features.lastDecisions`, la dernière décision de chaque module pour ses cartes (lue au
  journal au même instant que la ligne du module, sans nouvel index).
- **Restent au bureau des membres** : le travail quotidien des modérateurs (`myDesk`, `queue`,
  `caseDetail`, `pendingQueue`, `pageClaimQueue`, `cases.deadlineQueue`, `cases.decide`,
  `cases.reviewContent`, l'aperçu borné, les revendications de page).

Recettes : `convex/tests/network-admin-decisions.test.ts` ; cliquets `network-admin-audit` et
`network-feature-gates` (constructeurs de l'administrateur lus dans la tranche).

## Amendement du 2026-11-23 (CH-815, lot A2) — les pages officielles du réseau

Statut « Proposé ». Fiche, § 3 (décision du propriétaire du 22/11 : les pages officielles sont créées par
le super admin) et § 4.2 (« Institutions et pages officielles »).

- **Jumeaux bornés au réseau** (`pages/networkAdmin`, clé `pages`) : `officialPages`, `signatoryCandidate`,
  `createOfficialPage`, `designateSignatory`, `sleepOfficialPage`, `wakeOfficialPage`. Un seul chemin métier
  avec la console et l'équipe de la page : `pages/admin` (`insertInstitutionPage`, `grantInstitutionAdmin`,
  `revokeInstitutionTeamMember`, `institutionSignatoryOf`), `pages/sleep` (`applyPageSleep`, `applyPageWake`),
  `pages/signatories` (`removePageTeamRow`).
- **« Officiel » dans son réseau seulement.** Le badge a trois sources : la console (`createInstitutionPage`,
  qui peut poser la règle `root`, et `setPageTrust`), et la fédération (`federation/reseauPublic`, contrat
  signé). Le jumeau impose la visibilité `network` et refuse toute référence d'import : la page ne se lit
  pas depuis la racine, n'entre dans aucune projection publique ni autorité fédérée (qui exigent
  `visibility: "root"` et `onRoot`). Aucun chemin ne change la visibilité d'une page après sa naissance.
- **Signataire** : membre actif du réseau, identité forte (`PAGE_SIGNATORY_IDENTITY_REQUIRED`, la règle
  de la console) ; le remplacement retire l'ancien dans la même décision, la page peut attendre
  l'acceptation sans administrateur vivant.
- **Sommeil** : aucun état nouveau ; l'administration du réseau est la décision humaine qui lève aussi un
  sommeil échu ; une page retirée par la plateforme ou le juge ne se réveille pas d'ici.
- **Reste à la plateforme** : le retrait du badge (`setPageTrust`), le retrait et l'adresse d'une page.

Recette : `convex/tests/network-admin-official-pages.test.ts`.

## Amendement du 2026-11-23 (CH-815, lot A3) — la cohorte fondatrice et le tableau de bord

Statut « Proposé ». Fiche, § 4.2 (« Fondateurs », « Tableau de bord ») et § 7 (porte du propriétaire :
l'admission des fondateurs depuis l'application d'administration est « à confirmer », l'accord écrit
d'antsia#176 visait la console).

- **Fondateurs** (`diaspora/founders`) : `cohort`, `candidate`, `admit`, `withdraw`, jumeaux de
  `listFoundingAdmissions` et des décisions d'exploitation, même cœur (`admitFounder`, `withdrawFounder`) et
  mêmes refus du domaine ; journal `diaspora.founder_admit` / `diaspora.founder_withdraw` à titre de
  `network_admin`. La cause d'un retrait décidé reste `operator` (liste fermée du domaine de DIASPORA.GA).
- **Tableau de bord** (`diaspora/networkSettings.overview`) : les seuls compteurs tenus par le moteur
  (modules ouverts, cohorte, pays ouverts). Les membres par statut, les admissions en attente, les
  signalements et recours ouverts et les pages à vérifier ne sont tenus par aucun compteur : ils ne sont
  pas rendus.
- **Pays ouverts** : en attente d'une décision — le moteur ne rattache aucune équipe de modération à un
  pays (`moderationTeams.scope` est une nature de contenu), la règle « refusé sans équipe du pays » n'a
  donc pas de donnée où se lire.

Recette : `convex/modules/diaspora/networkAdmin.test.ts`.

## Amendement du 2026-11-23 (CH-815, lot A1b) — durcissement après relecture

Statut « Proposé ». Revue de sécurité du lot A1 ; le code fait foi (`convex/betterAuth/`,
`packages/api/src/auth-proxy.ts`).

- **F1 — le rappel central ne pose aucun cookie.** Le rappel IDN est une navigation vers
  `${SITE_URL}/api/auth/oauth2/callback/idn`, servie par l'application de cette origine. Better Auth y
  posait le jeton de session (sept jours) et le JWT Convex, que `crossDomain` ne convertit que pour une
  requête portant `better-auth-cookie` (jamais une navigation) : avec ce seul cookie,
  `/api/auth/convex/token` rendait un JWT de la session scellée à tout script du site de SITE_URL, pour
  l'administration d'un réseau comme pour la console. Un greffon, toujours le dernier de la chaîne
  (`betterAuth/idnWebCallback.ts`), retire du rappel IDN web tout `Set-Cookie` et le jeton porteur
  (`set-auth-token`), après l'émission du jeton à usage unique. Aucune application n'en dépendait : toutes
  échangent ce jeton sans cookie du navigateur, antsia.ga (servie à SITE_URL) comprise. Parcours natif
  inchangé. Défense en profondeur : le relais partagé ne relaie aucun cookie ni jeton porteur sur
  `/api/auth/oauth2/callback/*`.
- **F2 — l'administration n'est scellée qu'à son entrée exacte.** Champ de catalogue `entry_path`, requis
  pour toute application qui porte `administers_network` et pour elle seule (`/entrer` pour
  `admin_diaspora_ga`, cliquet `deploy-catalog`). `applicationOfOAuthState` ne scelle une telle application
  que si `callbackURL`, `newUserURL` et `errorURL` valent exactement son origine suivie de `entry_path`,
  sans requête ni fragment ; une adresse absente ne vaut pas l'entrée. Les autres applications ne
  changent pas.
- **Relais sans cookie du navigateur, sur option.** `AuthProxyOptions.browserCookies` (`relay` par
  défaut, `drop`) et la fabrique `createAuthProxyHandlers(options)`.
- **F4 — accès non journalisé.** Cliquet `unlogged-access` : `allowUnloggedAccess` n'est admis que dans
  `networks/adminAccess.{myNetworkAdmin, recordAccess}` et `platform/operatorAccess.{myOperator, recordAccess}`.
- **Origines de démonstration.** Variable facultative `APPLICATION_EXTRA_ORIGINS_JSON` (nom seulement,
  `.env.example`) : elle nomme l'application d'origines supplémentaires, lue strictement (une faute et la
  variable entière est ignorée), sans rien rendre de confiance (chaque origine doit aussi être dans
  `TRUSTED_ORIGINS`). Sans elle, une application d'administration servie sur une origine de démonstration
  n'est jamais scellée.
- **Non traité, décision du propriétaire (F3).** La console n'est liée à aucune application : elle n'est
  bornée que par exclusion (une preuve scellée pour une application qui administre un réseau ne l'ouvre
  pas) ; une session IDN de l'application des membres d'un opérateur ouvre donc la console.

Recettes : `convex/betterAuth/idnApplication.test.ts`, `convex/betterAuth/settings.test.ts`,
`convex/modules/networks/adminAccess.test.ts`, `packages/api/src/auth-proxy.test.ts`, cliquets
`deploy-catalog` et `unlogged-access`.

## Amendement du 2026-11-23 (CH-815, lot A3, suite) — les pays ouverts et l'équipe d'un pays

Statut « Proposé ». Remplace le point « Pays ouverts : en attente » de l'amendement A3.
- `moderationTeams` gagne un champ facultatif `country` (ISO alpha-2), sans nouvel index (100 équipes actives au
  plus, lues par `by_network_active`). Posé par `moderation/networkAdmin.createTeam` (`country?`) ou
  `setTeamCountry` (journal `moderation.team_country_set`). La racine, la console et `moderation/cases` ne changent pas.
- `diaspora/networkSettings.setOpenCountry` ouvre un pays s'il a une équipe active de ce pays avec au moins un
  modérateur actif, membre actif du réseau ; fermer est toujours permis. Historique des réglages et journal
  `diaspora.country_set` à titre de `network_admin`. La console reste le repli d'exploitation, sans cette règle.
- Les deux associations relais du cahier ne sont pas modélisées : l'administrateur les atteste à l'ouverture
  (`relayAssociationsAttested`, inscrit au journal). Le moteur ne les vérifie pas.
- Le pays d'une équipe ne délimite encore aucune compétence : le routage des signalements reste par nature de
  contenu. Le routage par pays est un lot à part, requis avant l'ouverture d'un deuxième pays.
- Rejetées : table de tranche équipe–pays (deux sources, routage générique impossible) ; ouverture sans équipe.

## Amendement du 2026-11-23 (CH-815, constat F3) — la console liée à son application

Statut « Proposé ». Remplace le point « Non traité, décision du propriétaire (F3) » de l'amendement A1b : le
propriétaire a demandé de le traiter. Détail et conséquences pour les opérateurs : amendement F3 de
l'[ADR-0039](0039-console-idn-niveau-1.md).

- **De l'exclusion à la liaison.** Le point 5 de la décision (« la console refuse toute preuve scellée pour
  une application qui administre un réseau ») devient une règle positive : la console n'admet QUE les
  preuves scellées pour l'application que le catalogue déclare console (`operator_console: true`,
  `admin_antsia_ga`, `betterAuth/settings.isOperatorConsoleApplication`). Une preuve de l'application des
  membres, du site public, d'une administration de réseau, du natif ou sans application est refusée
  (`operatorRequired`), même si son accès à la console avait été journalisé auparavant. Les deux autorités
  restent disjointes : une console n'administre aucun réseau (vérifié par le code et par le cliquet).
- **Le catalogue, seule source, pour les deux autorités.** `administers_network` dit qui administre un
  réseau, `operator_console` qui est la console. `entry_path` est requis pour ces applications, et pour
  elles seules (cliquet `deploy-catalog` : `admin_antsia_ga` et `admin_diaspora_ga`, `/entrer` chacune ;
  la console n'est déclarée qu'une fois).
- **Le sceau.** `applicationOfOAuthState` épingle la console à son entrée exacte, par le même mécanisme
  que le F2 (`exactEntryMatches`, trois adresses égales à `origin + entry_path`, sans requête ni fragment).
  Une autre origine de confiance qui donne l'entrée relative garde sa session ; l'entrée exacte donnée par
  une autre origine scelle la console, car le jeton à usage unique n'est livré qu'à cette page, où seule
  la console l'échange (même règle que l'administration d'un réseau).
- **Appelants** : `requireOperator` (`operatorQuery`, `operatorMutation`, `myOperator`, `recordAccess`),
  `liveOperatorOrNull` (fichiers retenus : un opérateur n'y est reconnu qu'en session de console ; depuis
  l'application des membres, il garde la seule qualité de modérateur du réseau, s'il l'a), `networks.archive`
  (la preuve du demandeur, relue à l'approbation, doit être de console) et `networks.requestArchive`.
  Aucune application des membres n'appelle une fonction de console, ni ces portes de fichiers.
  L'administration d'un réseau ne change pas.

Recettes : `convex/modules/platform/consoleApplication.test.ts`, `convex/betterAuth/idnApplication.test.ts`
(vrai parcours jusqu'à `myOperator`), `convex/betterAuth/settings.test.ts`,
`convex/modules/networks/adminAccess.test.ts`, cliquet `deploy-catalog`.

## Amendement du 2026-11-23 (CH-815, suite des pays ouverts) — Routage des signalements par pays

Statut « Proposé ». Remplace le point « Le pays d'une équipe ne délimite encore aucune compétence » de l'amendement
A3 (suite), comme le prévoyait la décision de l'architecte (« le futur routage par pays se fera dans `cases.report` »).

- **Décision.** Le pays d'une équipe délimite sa compétence. Le moteur adresse le dossier d'un contenu à l'équipe de
  SON pays, puis de sa nature ; la racine et tout réseau dont aucune équipe ne porte de pays routent comme avant.
- **Règle** (`@antsia/social-domain/moderationRouting`, appelée par `moderation/routing`). Parmi les équipes actives
  du réseau (100 au plus, lues par `by_network_active`, la plus ancienne d'abord) : contenu d'un pays C → l'équipe de
  C de cette nature, puis l'équipe généraliste de C, puis l'équipe sans pays de cette nature, puis l'équipe sans pays
  généraliste, sinon le réseau. Contenu sans pays → les seules équipes sans pays, sinon le réseau : jamais une équipe
  d'un pays. Entre deux équipes de même rang, la plus ancienne. Le pays est celui que PORTE le contenu, par la
  définition du guichet par pays, déménagée telle quelle dans `diaspora/moderationCountry` et partagée : jamais le pays
  du déclarant ni celui de l'auteur. Il n'est lu que si une équipe active du réseau porte un pays.
- **Où.** À la création du dossier (`cases.report`, `moderation.reportPost` et `reportComment`) ; pour la relecture
  préalable (`cases.paginatePending`, `cases.reviewContent`, `reviewProjection.preview`, le guichet `pendingQueue`,
  et la lecture d'un contenu retenu, `policy.canReadModeratedContent`, ouverte à toute équipe éligible : nature
  compatible, pays égal ou absent) ; pour les revendications de page (`pages/claims.pageClaimReviewer`, jugé page par
  page). Aucune table, aucun champ, aucun index nouveau : le dossier garde l'équipe choisie (`reports.teamId`), la
  compétence se relit à l'acte (`cases.teamCapacity`), inchangée.
- **Conséquences.** Le membre d'une équipe d'un pays a la file de son pays et la tranche ; celui d'une équipe d'un
  autre pays reçoit le refus indistinct. L'administration du réseau lit tout, comme avant ; un modérateur du réseau
  garde la file du réseau et les dossiers sans équipe, comme avant. **Un deuxième pays peut s'ouvrir dès que son équipe
  existe** (`setOpenCountry` exige déjà une équipe du pays avec un modérateur actif). Changer le pays d'une équipe ne
  déplace pas les dossiers qui lui sont déjà adressés ; ceux d'une équipe désactivée restent à l'administration du
  réseau, comme avant (aucun réacheminement).
- Recettes : `packages/social-domain/src/moderationRouting.test.ts`, `convex/modules/moderation/countryRouting.test.ts`.

## Amendement du 2026-11-23 (CH-831) — le premier administrateur sur la démonstration

Statut « Proposé ». Précise la conséquence neutre « Le premier administrateur est nommé à la console » : la
démonstration n'a pas de console. Détail : [ADR-0043](0043-administrateur-du-reseau-sur-la-demonstration.md).

- **Sur la démonstration déclarée**, le premier administrateur d'un réseau administré est nommé par l'amorçage
  d'ADR-0043 : la fonction interne `platform/networkAdminBootstrap.nameFirst`, lancée par le propriétaire avec la
  clé du déploiement, journalisée (`membership.role_set`, qualité `system`, `origin: "bootstrap"`), sur une
  adhésion existante ; `withdraw` la défait.
- **En production**, la console reste le seul chemin (`setNetworkRole`) : les deux fonctions y sont refusées.
- La garde de cette décision ne change pas : la personne nommée n'administre qu'en session IDN prouvée de
  l'application d'administration, accès journalisé. Sur la démonstration, cette session vient du client IDN
  dédié de la démonstration (ADR-0043, point 1).
