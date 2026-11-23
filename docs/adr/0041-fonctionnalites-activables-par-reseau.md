# ADR-0041 : Les fonctionnalités d'un réseau gouverné sont fermées sans ligne et ouvertes par son administrateur

- **Statut** : Proposé (demande du propriétaire du 2026-11-20 ; plan de l'agent architecte du même jour)
- **Date** : 2026-11-20
- **Patron** : les politiques fermées par défaut des conversations contextuelles (ADR-0025,
  `contextualPolicies`), du commerce et de l'emploi.

## Contexte

Le propriétaire veut d'abord un réseau simple pour DIASPORA.GA : publier, commenter, réagir,
partager, discuter dans iCom, faire vivre le réseau. Les modules déjà écrits (pages d'associations
et d'entreprises, groupes et évènements, services, emploi, entraide, mentorat, kit d'arrivée, mesure
du pilote) doivent rester dans le code et pouvoir être injectés au fur et à mesure par
l'administration du réseau, sans redéploiement.

Masquer ces modules à l'écran ne suffit pas : un module « fermé » qui répondrait encore à un appel
direct ne serait pas fermé. La réponse doit venir du serveur, et elle doit être indistincte.

## Décision

Nous ajoutons au moteur une table `networkFeatures` (une ligne par couple réseau × fonctionnalité,
fermée sans ligne) et une option `feature` aux constructeurs `networkQuery`, `networkMutation` et
`networkAction`.

1. **Huit clés gelées** (`@antsia/social-domain/networkFeatures`) : `pages`, `groupsAndEvents`,
   `services`, `jobs`, `mutualAid`, `mentoring`, `arrivalKit`, `pilotMetrics`. Les groupes et
   évènements, les services et l'emploi exigent les pages.
2. **La garde vit dans le constructeur** (`convex/lib/networkFeatures.ts`) : juste après l'adhésion,
   avant la garde d'écriture et tout budget de débit, une fonctionnalité fermée rend `notFound`, en
   lecture comme en écriture. Publier dans un groupe (`posts.publish` avec `groupId`) relève des
   groupes et évènements.
3. **Elle ne vaut que pour un réseau gouverné** par une tranche qui déclare la fonctionnalité
   (`SLICE_NETWORK_FEATURES`). La racine ANTSIA et tout réseau sans tranche ne lisent pas la table :
   rien ne change pour eux.
4. **Bascule** (`convex/modules/networks/features.ts`) : l'administrateur du réseau (`settings`,
   `setFeature`, onglet « Réglages » du bureau de modération) ; l'administrateur de la plateforme
   en secours (`operatorSettings`, `operatorSetFeature`). Motif d'au moins dix caractères, règle de
   dépendance (ouvrir exige le parent ouvert, fermer les pages exige les enfants fermés), ligne de
   journal `network.feature_set` dans la même transaction. Une bascule déjà en place n'écrit rien.
   Les membres lisent les clés ouvertes de leur réseau (`open`), rien d'autre.
5. **Fermer ne supprime rien** : les données restent, rouvrir les rend. Aucune graine et aucune
   migration n'ouvrent quoi que ce soit.
6. **Classement verrouillé** : le manifeste de la tranche classe chacun de ses fichiers
   (`featureFiles` : une clé ou `core`) ; les modules `pages`, `events` et `thematicGroups` sont
   gouvernés tout entiers. Le cliquet `network-feature-gates` exige que chaque fonction de réseau
   d'un fichier classé porte sa clé, et qu'aucun fichier du socle n'en porte.
7. **L'application n'invente rien** : un module fermé est une capacité absente de son port de
   données ; ses entrées de navigation disparaissent et ses adresses disent « introuvable ».

## Conséquences

### Positives

- Le réseau sert d'emblée son socle ; chaque module s'ouvre sans déploiement, motivé et journalisé.
- La fermeture est une vraie fermeture : le serveur refuse, de façon indistincte.
- Une fonction nouvelle d'un module ne peut pas oublier sa garde (cliquet).

### Négatives

- Une lecture de plus par appel d'une fonction gardée dans un réseau gouverné (deux pour une
  fonctionnalité qui exige les pages).
- Les passages planifiés des modules fermés tournent encore (expirations, rappels, mesures) : ils
  n'ouvrent rien, mais peuvent émettre un avis lié à une donnée d'avant la fermeture.
- Les publications au nom d'une page restent dans le fil quand les pages sont fermées ; le lien vers
  la page mène à « introuvable ».

### Neutres

- Les tests de la tranche ouvrent les fonctionnalités par une aide du harnais
  (`openNetworkFeatures`) ; la fermeture se prouve dans `modules/networks/features.test.ts`.
- L'application et le moteur se publient dans la même séance (fenêtre entre les deux).

## Alternatives considérées

### Drapeaux d'application

Une variable par module dans l'application : redéploiement à chaque bascule et aucun refus du
serveur. Rejeté.

### Champ sur la ligne `networks`

Un tableau de clés dans les réglages du réseau : `update` de la console réécrit tous les réglages
d'un coup, et l'historique des réglages mêlerait les bascules aux autres changements. Rejeté.

### Ouvert par défaut

Contredit la demande du propriétaire (« pour l'instant, je veux juste … poster, chatter »). Rejeté.

## Références

- Plan : `ECOSYSTEMES/DOCUMENTATION/DIASPORA_GA/Fonctionnalites_activables_2026-11-20/Plan_fonctionnalites_activables_2026-11-20.md`.
- Code : `packages/social-domain/src/networkFeatures.ts`, `convex/lib/networkFeatures.ts`,
  `convex/lib/functions.ts`, `convex/modules/networks/features.ts`,
  `convex/modules/diaspora/manifest.ts`, `tests/ratchets/network-feature-gates.test.ts`.

## Amendement du 2026-11-23 (ADR-0042, CH-815) — statut « Proposé »

- **La bascule quitte le bureau de l'application des membres.** `settings` et `setFeature` passent sous les
  constructeurs `networkAdminQuery` et `networkAdminMutation` (ADR-0042) : l'administrateur du réseau, en
  session d'identité numérique prouvée de l'application d'administration du réseau (`admin.diaspora.ga`
  pour DIASPORA.GA), accès journalisé. Mêmes noms, mêmes arguments ; l'onglet « Réglages » du bureau de
  diaspora.ga reçoit le refus indistinct jusqu'à son retrait (lot A5). Le secours de la console
  (`operatorSettings`, `operatorSetFeature`) ne change pas.
- **Le menu reste du code ; les fonctionnalités sont le seul levier.** Aucun menu n'est stocké en données :
  l'application calcule ses entrées des clés ouvertes, et l'aperçu du menu de l'application
  d'administration lit la même fonction que l'application des membres.
- **Les huit clés ne changent pas.** La clé `classifieds` (petites annonces) naîtra avec son module,
  pas avant.
