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
