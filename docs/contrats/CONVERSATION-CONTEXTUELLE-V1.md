# CONVERSATION-CONTEXTUELLE-V1

Lot « Contrat CC » (table de réservation : `docs/etudes/2026-10-18-social-commerce/EXECUTION.md`),
19 octobre 2026. **Conception écrite avant le code.** Décision du propriétaire du 18/10/2026 :
« Continuer sans vérifier ». Aucune commande de vérification, de génération, de test ni de build
n'a été lancée pour ce document. Aucun code, aucun ADR, aucun schéma n'est écrit ici.
Statut : **Accepté** — validation du propriétaire du 19/10/2026, relayée par la session
DIASPORA.GA : « Je valide les décisions D1 à D16 du contrat CONVERSATION-CONTEXTUELLE-V1, avec les
amendements D5 et D8 ; transmets-le à ANTSIA. » D7 et D13 restent à confirmer juridiquement
(ADR-0025).

**Révision du 19/10 (retours de la session DIASPORA.GA, transmis par le coordinateur), puis
validation.** D2, D3, D4 et D6 ont été acceptés tels quels par DIASPORA.GA ; D5 retient l'option
(a) ; D8 devient une règle de texte qui reçoit le contexte de l'émetteur ; le crochet de
`closeExpiredJobOffers` est retiré du §6.3. Le propriétaire a ensuite validé D1 à D16, avec les
amendements D5 et D8 et la correction du §6.3 (marqués « validé » aux §5.5, §5.8, §6.3, §10.3,
§12 et §14). Les sous-lots CC-1, CC-2a et CC-2b sont écrits sur cette base, sans exécution.

**Objet.** Contrat générique d'une **conversation contextuelle** du moteur ANTSIA. Une telle
conversation est ouverte PAR un objet métier déjà accepté par son propre parcours : demande de
service, mentorat accepté ou candidature présélectionnée. Elle n'est jamais ouverte par une
relation sociale. Elle n'ouvre pas la messagerie personnelle aux inconnus (ADR-0019, option B
rejetée) et ne duplique pas le canal commercial P10 (ADR-0021).

**Sources relues le 19/10.** Elles proviennent de l'arbre partagé non commité. P10, P14, P15 et
les tranches DIASPORA.GA y sont « raccordés, jamais exécutés ».
- ANTSIA : `CLAUDE.md` ; études `05`, `06` et `EXECUTION.md` ; rapports P05, P10, P14 et P15 ;
  `docs/21` ; ADR-0009, 0019, 0021 et 0024.
- Code moteur : `convex/modules/commercialMessaging/**` ;
  `convex/modules/messaging/{inbox,participation,attachmentStorage}.ts` ;
  `packages/social-contracts/src/messaging.ts`. Les points d'appui cités dans `calls`,
  `notifications`, `moderation`, `people` et `pages` ont aussi été relus.
- Tranche DIASPORA.GA dans le moteur :
  `convex/modules/diaspora/{serviceRequests*,mentoring*,jobs*,serviceNotifications,moderationContent,facts}.ts`.
- Dépôt DIASPORA.GA : `docs/{14,17,18,21,32}` et
  `packages/diaspora-ga-domain/src/{service-requests,mentoring,jobs}.ts`.

Les références de code décrivent ces sources telles qu'elles ont été lues. Elles doivent être
relues avant CC-2, parce que P16 révise en ce moment les modules commerce.

## 1. Choix structurants

1. **Une troisième famille de conversations, bornée explicitement.** Un module moteur neuf,
   `convex/modules/contextualMessaging/`, s'ajoute à côté des fils personnels, qui restent
   inchangés, et du canal commercial P10, inchangé en V1 (§11). Ce module n'écrit jamais dans
   `personalThreads`, `personalMessages`, `connections`, `follows` ni `unreadTotals`.
2. **L'objet ouvre la conversation et la ferme.** La conversation n'a ni demande ni acceptation
   propres. Elle naît une seule fois, de l'objet qui a déjà franchi son propre parcours d'accord.
   Son cycle de vie se lit sur cet objet. Elle ne porte que deux gestes à elle : la clôture
   explicite par un côté (D12) et l'accord d'appel.
3. **Contexte typé fermé.** La V1 compte trois natures : `diasporaServiceRequest`,
   `diasporaMentoring` et `diasporaJobApplication`. Chaque nature a sa colonne de référence
   typée, et un registre fermé les liste. Ajouter une nature est un changement du moteur
   (validateur, registre, cliquet), jamais une chaîne libre.
4. **Les participants sont calculés.** Le fil ne garde que des clés d'index immuables, recopiées
   de l'objet. À chaque lecture et à chaque écriture, le moteur relit l'objet par le résolveur de
   la tranche. Il relit ensuite l'adhésion, le profil vivant, la qualité de signataire vivant, le
   blocage personnel et la politique. Aucune liste de participants n'est stockée comme vérité.
5. **Répartition du travail.** Pour chaque nature, la tranche fournit un chargeur en lecture
   seule et une règle pure « état effectif → phase ». Le moteur garde tout le reste : les tables,
   toutes les fonctions publiques, l'autorité, les débits, les fichiers, les appels, la cloche, la
   modération, l'export et l'effacement.
6. **Deux voix.** Une personne parle sous son nom publié. Une page parle d'une seule voix : le
   signataire qui écrit n'est pas montré à l'autre côté. C'est déjà la règle pour l'auteur d'une
   proposition (DG-014) et pour celui d'une décision (DG-025).
7. **Aucun appel automatique.** Un appel exige l'accord explicite des deux personnes dans ce fil
   et une phase « engagée ». Toutes les gardes d'appel existantes s'appliquent ensuite. Le jeton
   est court, et chaque perte de droit déclenche une revalidation.
8. **Aucune durée de conservation inventée.** Aucune purge temporelle n'est active tant que le
   propriétaire n'a pas fixé de durée (§6.6, D7).

## 2. Frontières

| Le contrat garantit | Le contrat ne fait pas |
|---|---|
| La garde personnelle reste intacte. `assertCanOpenPersonalThread` (`messaging/inbox.ts`) ne voit jamais un fil contextuel. Un échange contextuel ne crée ni relation, ni suivi, ni « fil existant » personnel | Ouvrir un fil personnel, proposer une relation, s'abonner |
| Une seule conversation par objet, dans le réseau de cet objet | Conversation de groupe, diffusion, participant ajouté par un client |
| Texte, pièces admises, messages vocaux (pièces sonores) | En V1 : transfert entrant ou sortant, réaction, épingle, modification, indicateur de frappe, accusé de lecture montré à l'autre côté |
| Contrôle d'accès serveur et transport chiffré du moteur | Chiffrement de bout en bout (DG-022a, D-G06). Le moteur lit les contenus pour la modération, l'export et l'effacement ; aucun libellé « chiffré » n'est affiché |
| Aucune donnée envoyée à PRO.GA ni à un tiers | Transfert CRM, prospect, paiement |
| Une projection privée, visible des seules parties | Toute surface publique, toute audience `root` |

## 3. Modèle

### 3.1 Natures V1

| Nature | Objet ouvrant | Côté demandeur | Côté répondant | Voix du répondant | Ouverture | Fermeture (état effectif de l'objet) |
|---|---|---|---|---|---|---|
| `diasporaServiceRequest` (DG-013) | `serviceRequests` (DG-014) | `requesterPersonId` | page `pageId`, c'est-à-dire ses signataires vivants | page | à l'envoi de la demande (`sent`), sans boutique | `completed`, `no_show`, `refused`, `cancelled`, `expired` |
| `diasporaMentoring` (DG-024c) | `mentoringRequests` | `menteePersonId` | `mentorPersonId` | personne | à l'acceptation (`accepted`) | `closed`, y compris une clôture système (profil retiré, retrait par la modération) |
| `diasporaJobApplication` (DG-025) | `jobApplications` | `candidatePersonId` | page `pageId`, c'est-à-dire ses signataires vivants | page | à la présélection (`shortlisted`) | `not_selected`, `withdrawn` ; cas de l'offre close : voir D6 |

Deux natures sont réservées et **refusées par le validateur V1** :
- `commerceJobApplication` : P15, ANTSIA × PRO.GA (D11) ;
- `shopContact` : P10, voie de convergence décrite au §11.4.

Les trois objets portent déjà un consentement explicite d'identité (`identityConsentAt` ou
`consentAt`). Ce consentement couvre l'affichage du libellé publié du demandeur au côté
répondant, et rien d'autre : ni facette, ni ville, ni profil de talent, ni coordonnée.

### 3.2 Ce qui est stocké

**`contextualThreads`** — une ligne par objet :
- `networkId` : le réseau de l'objet, figé à l'ouverture. Partager l'adresse de la
  conversation ne la déplace pas.
- `kind`, accompagné d'**exactement une** référence typée : `serviceRequestId`,
  `mentoringRequestId` ou `jobApplicationId`. La cohérence avec `kind` est contrôlée à
  l'insertion. `contextKey` (« nature:identifiant ») sert à l'ouverture idempotente.
- Des clés d'index recopiées de l'objet, **immuables et sans autorité** : `requesterPersonId`,
  puis `responderPageId` ou `responderPersonId`. Elles servent aux listes. Si elles divergent de
  l'objet relu, l'accès est refusé.
- Un cache d'état : `status` (`open` ou `closed`), `closedAt`, `closedCause` (`object` ou
  `side`) et `closedBySide` (`requester` ou `responder`, jamais une personne). L'accès ne traite
  jamais ce cache comme une vérité (§6.3).
- `responderSpokeAt` (règle du premier mot), `revision`, `lastMessageAt`, `createdAt` et
  `updatedAt`. `purgeAt` reste absent tant que D7 n'est pas tranchée.
- Index : `contextKey` ; réseau + `requesterPersonId` + activité ; réseau +
  `responderPersonId` + activité ; réseau + `responderPageId` + activité ; `purgeAt`.
- Jamais stockés : liste de participants, nom, rôle vivant, copie du contenu de l'objet
  (besoin, objectif, message, titre), aperçu de message.

**`contextualMessages`** :
- `networkId`, `threadId`, `side` et `voice`.
- `authorPersonId`, présent seulement en voix de personne : c'est le propriétaire du message.
- `pageSpeakerPersonId`, présent seulement en voix de page : c'est une référence d'audit,
  effacée quand la personne est effacée.
- `content`, `attachmentFiles` (forme `storedAttachmentValidator` de `messaging/tables.ts`),
  `idempotencyKey`, `digest`, `createdAt` et `deletedAt`.
- Index : fil + date ; fil + clé.

**`contextualPersonStates`** — une ligne par personne et par fil, créée au premier geste :
`readAt`, `callsAllowed`, `callAuthorityKey` (§5.8) et `updatedAt`. Cette ligne ne confère aucun
droit.

**`contextualPolicies`** — une ligne par couple (réseau, nature) : `enabled`, l'auteur et la
date. L'absence de ligne vaut « fermé » (§5.9).

**`calls`** — un champ facultatif `contextualThreadId` et ses deux index. Il est exclusif de
`commercialThreadId` (§11.3).

### 3.3 Côtés, voix et rôles

- Il y a deux côtés : le **demandeur** et le **répondant**. Les libellés de rôle sont traduits,
  par nature : client et prestataire ; mentoré et mentor ; candidat et employeur.
- Côté personne, la partie est la personne de l'objet, et elle seule. Côté page, ce sont **tous
  les signataires vivants** de la page de l'objet au moment de l'accès (D2), y compris ceux
  arrivés après l'ouverture. Un signataire retiré n'a plus rien.
- En voix de page, l'autre côté voit la page : son nom et son logo servi par la garde. Les
  membres de l'équipe voient entre eux le libellé publié du coéquipier qui a écrit, pour se
  coordonner. Ce libellé n'est jamais transmis au demandeur.
- Personne ne parle des deux côtés. La tranche refuse déjà une demande sur sa propre page, mais
  un rôle peut être acquis plus tard. Une personne à la fois demandeur et signataire de la page
  répondante n'agit alors que comme demandeur.

### 3.4 États calculés pour un lecteur

| État vu | Condition | Lire | Écrire, joindre | Appeler |
|---|---|---|---|---|
| **ouverte** | la phase est `open`, la politique est ouverte, aucun côté n'a clos, et l'autre côté a au moins une personne vivante habilitée | oui | selon les capacités de la nature et de la phase (§6.2) | selon les accords (§5.8) |
| **fermée** | la phase est `closed`, un côté a clos, ou la politique est fermée (D10) | oui (lecture seule) | non | non ; les appels en cours sont arrêtés |
| **indisponible** | l'autre côté n'a plus de personne vivante habilitée (page inactive ou fédérée, personne sortie, suspendue ou effacée) | oui (lecture seule) | non | non |
| **bloquée** | un blocage personnel existe entre le lecteur et la personne d'en face | refus indistinct pour cette paire | refus | refus |
| **absente** | le lecteur n'est pas partie ; autre réseau ; objet introuvable ou non visible de ce lecteur (modération) ; lecteur non vivant | refus indistinct | refus indistinct | refus indistinct |

Le blocage suit la messagerie personnelle (`requireThread` dans `messaging/participation.ts`) :
il ferme la conversation dans les deux sens pour la paire concernée.
- Face à un côté page, seul le signataire bloqué ou bloquant perd l'accès ; ses coéquipiers
  gardent le leur.
- Entre deux personnes (mentorat), la conversation reste absente pour les deux tant que le
  blocage dure. L'objet continue d'être géré par ses propres écrans : le mentoré peut toujours
  clore le mentorat.
- L'écran de l'objet affiche seulement « conversation indisponible », sans en donner la cause.

## 4. Autorité

### 4.1 Qui ouvre

Seul l'objet ouvre une conversation, par l'un des deux chemins suivants.
1. **Par la tranche.** Le geste qui fait entrer l'objet en phase `open` appelle l'aide interne
   `openContextualConversation` (§10.2) dans sa propre transaction. Ces gestes sont la création
   d'une demande de service, l'acceptation d'un mentorat et la présélection d'une candidature.
2. **À la demande d'une partie.** La fonction `openForObject`, idempotente, sert pour un objet
   déjà en phase `open` : objet antérieur au module, politique ouverte après coup, ou crochet
   manqué. Elle ne crée la conversation que si trois conditions sont réunies : le résolveur rend
   `open`, la politique est ouverte, et l'appelant est une partie actuelle.

Aucun client ne choisit la nature d'un objet, le réseau, les participants, la voix ou le côté.
Tout se déduit de l'objet relu.

### 4.2 Relecture à chaque lecture et à chaque écriture

Les contrôles s'enchaînent dans cet ordre, sans cache d'une requête à l'autre. Un cache limité à
une requête paginée reste admis, comme `withCommercialEligibility` dans P10.
1. Le constructeur `networkQuery` ou `networkMutation` vérifie la session et le réseau, puis
   appelle `requireMembership` au statut minimal de la fonction (§5.1).
2. Le fil doit appartenir au réseau courant.
3. Le résolveur de la nature relit l'objet : il doit exister, appartenir au même réseau, être
   dans une phase connue et être visible de ce lecteur (§10.3). Les clés du fil doivent égaler
   celles de l'objet.
4. Qualité de partie. Côté personne : égalité avec la personne de l'objet. Côté page :
   `liveSignatoryRole` non nul sur la page de l'objet, ce qui exige une page active et native, une
   signature acceptée, un membre actif, et une identité forte pour une page officielle.
5. Vivacité du lecteur et de l'autre côté : profil publié et non effacé, adhésion au statut
   requis, consentement `social_profile` en vigueur. C'est la règle de `livingMember` dans P10.
   Côté page, il faut au moins une personne vivante habilitée.
6. Aucun blocage personnel (`isBlockedBetween`) entre le lecteur et chaque personne d'en face
   concernée.
7. Pour une écriture : la politique de la nature dans ce réseau, la phase, les capacités de la
   nature et le statut minimal d'écriture fourni par la tranche, puis les règles du message (§5).

### 4.3 Révocation immédiate ; un ancien participant ne garde rien

Les changements suivants prennent effet **à la requête suivante** : rôle retiré, page désactivée,
sortie du réseau, suspension racine, blocage, objet clos ou retiré.
- La liste, le détail, les messages, l'envoi, le dépôt, l'accord et l'appel relisent tout.
- La liste des conversations relit chaque ligne.
- La cloche masque les avis à la lecture, et la file de livraison les annule au prochain
  contrôle.
- Un appel en cours est arrêté par revalidation (§5.8).

Limite assumée, comme pour P10 : un jeton média déjà émis (60 secondes) n'est pas révoqué
cryptographiquement à l'instant du retrait. La salle est fermée par la porte existante.

Un ancien participant ne garde **rien** dans l'application : ni lecture de l'historique, ni avis,
ni appel, ni pastille. Sont visés le signataire retiré et la personne sortie du réseau ou
suspendue. Ses lignes personnelles (lecture, accord) ne confèrent rien et disparaissent avec le
fil ou avec son effacement. Seul subsiste son droit PA5 d'exporter ses propres données depuis
« Mes données » (portes self-scoped), dans les limites du §9.

## 5. Gardes

### 5.1 Réseau et adhésion

Toute fonction publique passe par les constructeurs du moteur, et le module est ajouté à
`SOCIAL_MODULE_DIRECTORIES` du cliquet `network-scoped-functions`.

| Statut minimal | Gestes |
|---|---|
| `en_attente` | Lectures et gestes de sortie : `markRead`, `close`, retrait d'un accord d'appel, retrait de son propre message. On peut toujours sortir, comme dans la tranche |
| `declaree` | Ouverture, envoi, dépôt, activation d'un accord d'appel, appel. S'y ajoute le statut d'écriture que la tranche exige pour son côté |

### 5.2 Ordre des gardes d'écriture

Adhésion (constructeur) → éligibilité (statut d'écriture de la nature) → débit (§5.4) → droit
(§4.2) → règles du message. Un refus de droit consomme le budget, mais ne révèle rien.

### 5.3 Refus indistinct et refus explicite

À toute personne qui n'est pas partie actuelle, le moteur répond `notFound` en écriture et `null`
en lecture. Ces réponses sont identiques à celles d'un identifiant inventé, d'une autre nature ou
d'un autre réseau.

Une partie voit déjà l'état de la conversation. Elle reçoit donc des refus traduits, issus d'une
liste fermée, qui ne disent jamais qui a retiré quoi :
- `CONTEXT_NOT_OPEN` : l'objet n'est pas en phase d'ouverture ;
- `CONTEXT_CLOSED` ;
- `CONTEXT_WAITING_RESPONDER` : premier mot attendu du répondant ;
- `CONTEXT_ATTACHMENTS_CLOSED` ;
- `CONTEXT_CALLS_CLOSED` ;
- `CONTEXT_CALL_CONSENT_REQUIRED` ;
- `CONTEXT_IDEMPOTENCY_CONFLICT` (catégorie `conflict`) ;
- les codes de texte de la tranche (§5.5).

Ajouts de CC-1 (précision d'implémentation, dans le cadre des décisions validées) : `CONTEXT_UNAVAILABLE` (l'autre côté n'a plus de personne
vivante habilitée, état déjà affiché « indisponible ») et `CONTEXT_TEXT_CONTROL` (caractère de
contrôle refusé par la règle neutre). Les codes `CONTEXT_*` sont des règles du domaine
(`DOMAIN_RULES`, espace de noms i18n `rules`), levées en `invalidArgument` sauf le conflit
d'idempotence (`conflict`) ; un code de la tranche est un refus d'application (`appRule`), traduit
par l'application qui l'a défini.

### 5.4 Débits, par participant et par contexte

| Seau | Clé | Gestes |
|---|---|---|
| `contextual.open` | personne | `openForObject` ; le chemin de la tranche consomme déjà le seau de son propre geste |
| `contextual.message`, et `.reinforced` pour un compte léger | personne | envoi |
| `contextual.thread` | fil | envoi, quel que soit le côté, pour qu'une équipe de vingt signataires ne submerge pas un demandeur |
| `contextual.manage` | personne | lecture marquée, clôture, accords, retrait de message, démarrage d'appel |
| `upload.url` (existant) | personne | URL de dépôt |
| `call.place` (existant) | personne | dans la porte d'appel partagée |

Les valeurs de départ sont proposées en D14 et seront mesurées au pilote. L'effacement remet à
zéro les clés personnelles, comme pour `commercial.request.pair`.

### 5.5 Texte

- La règle de base est celle du contrat partagé `packages/social-contracts/src/messaging.ts`
  (`assertMessageContent`) : texte vide seulement avec des pièces, 4 000 caractères au plus.
- S'y ajoutent la normalisation NFC et le refus des caractères de contrôle (règle de
  `commercialText` dans P10), extraits dans une règle neutre (§11.2).
- La tranche peut fournir une règle pure supplémentaire par nature. **D8 amendé, validé le
  19/10/2026** : la règle reçoit le CONTEXTE de l'émetteur, pas le texte
  seul — `textRule({ text, kind, side, voice })` rend `{ ok: true }` ou
  `{ ok: false, code }`, où `code` est un code fermé de la tranche (par exemple
  `context_address_forbidden`). DIASPORA.GA refuse l'adresse exacte en voix de **personne**
  (plan G5 point 6 : « une adresse de domicile n'entre ni dans le fil ni dans les notifications
  externes ») et l'admet en voix de **page** : une page n'a aucune adresse dans le moteur, et
  l'adresse est alors le lieu même de la prestation. Le moteur applique la règle APRÈS la règle
  neutre, au texte normalisé ; il traduit le code fermé en refus explicite pour la seule partie
  émettrice (`appRule`), sans jamais écrire le contenu dans un journal.
- L'empreinte d'un message est un SHA-256 du JSON canonique (marque de nature, fil, texte, pièces
  déclarées), sur le modèle de `commercialDigest`.

### 5.6 Idempotence

La clé compte 8 à 128 caractères `[A-Za-z0-9_-]`. Elle est liée au fil et à la personne
émettrice.

| Cas | Résultat |
|---|---|
| Même clé, même empreinte | Le message déjà admis est rendu, marqué `deduplicated` |
| Même clé, autre empreinte | `CONTEXT_IDEMPOTENCY_CONFLICT` |
| Clé d'une autre personne | Jamais un faux succès (règle P05) |
| Rejeu après fermeture | Le message admis avant la fermeture est rendu ; aucun nouveau message n'est créé |

L'ouverture est idempotente par `contextKey`, dans la transaction. Deux ouvertures concurrentes
lisent le même index ; la seconde est rejouée et trouve la première.

### 5.7 Pièces : uniquement par la garde des fichiers

- **URL de dépôt** : `generateUploadUrl` vérifie l'accès et la capacité de joindre, puis appelle
  `guardUploadUrl(ctx, "chat_attachment")` (cliquet `upload-policy`).
- **Rattachement** : mêmes primitives que `verifyDeclaredAttachments` (`messaging/attachmentStorage.ts`).
  Le dépôt doit être frais et au nom de l'émetteur (`assertFreshUpload`), puis admis sous la
  politique `chat_attachment` (`admitStoredUpload`). Le poids et le type sont relus au stockage,
  et le lot est jugé dans son ensemble (`assertAttachmentBatch` ; cliquets `fresh-upload` et
  `storage-arg-freshness`). Précision CC-2b (proposée) : le module compose ces primitives dans son
  propre fichier `contextualMessaging/attachments.ts`, parce que le cliquet `upload-policy` (temps 2)
  exige que le module qui délivre une URL de dépôt appelle lui-même `admitStoredUpload` ; la règle
  reste celle du contrat partagé, bornée à deux pièces (D9).
- **Délivrance** : `deliverAttachments`, puis `resolveFileDelivery`, rendent une URL servie ou une
  retenue nommée. L'écran ne fabrique jamais d'URL (cliquet `file-delivery-gate`). Une pièce en
  quarantaine reste retenue pour tous.
- **Nombre par message** : voir D9 (deux comme P10, ou cinq comme le contrat partagé).
- Aucune pièce n'est recopiée d'un autre fil. Les blobs d'un message retiré ou purgé sont purgés
  avec lui (`purgeStoredFile`).

### 5.8 Appels : consentement explicite et gardes existantes

Un appel contextuel est un **tête-à-tête** entre la personne du côté demandeur et une personne
vivante du côté répondant. Les quatre conditions suivantes sont vérifiées à la sonnerie, à
l'acceptation et à chaque émission de jeton :
1. La conversation est **ouverte**, et la phase de l'objet est « engagée » pour les appels (§6.2,
   D5).
2. Le lecteur **et** la cible ont chacun donné, dans ce fil, un accord explicite, jamais
   prérempli et révocable à tout moment. Cet accord est lié à l'autorité qui l'a permis
   (`callAuthorityKey`) :
   - côté page, la ligne de signataire et sa date d'acceptation ;
   - côté personne, la qualité de partie de l'objet.

   Une autorité perdue puis retrouvée ne fait pas revivre un ancien accord.
3. En voix de page, le signataire qui donne son accord accepte d'être **nommé** dans l'appel ;
   un texte d'accord distinct le lui dit. Le demandeur ne peut choisir que parmi les signataires
   qui ont consenti. Un signataire n'appelle qu'en son propre nom.
4. La porte partagée `placeDirectCall` applique ensuite toutes ses gardes : blocage, personne
   joignable, admission (ne pas déranger, occupation, absence connue) et budget `call.place`.
   **D5 amendé (option (a)), validé le 19/10/2026** : l'accord
   explicite donné DANS le fil vaut admission pour ce seul fil, au-dessus du réglage général
   « hors de mes relations : silencieux » ; « ne pas déranger », l'occupation et l'absence connue
   restent appliqués. La projection du fil indique au lecteur l'effet de ses propres réglages
   (par exemple : « vos réglages d'appel en silence ne s'appliquent pas à cet accord » ou « ne
   pas déranger est actif »), sans rien révéler des réglages de l'autre côté. Réalisation : CC-4.

Règles complémentaires :
- au plus un appel vivant par fil ;
- aucune messagerie vocale ni aucun appel de groupe, refusés comme pour un fil commercial ;
- jeton valable 60 secondes, avec relecture du fil à l'émission, comme `livekitActions` le fait
  pour P10 ;
- le journal rappelle par la conversation, jamais par l'appel personnel.

Un retrait d'accord, une perte de qualité, un blocage, ou la fermeture de l'objet ou du fil
arrêtent l'appel (`finishCall`). Une revalidation paginée des appels contextuels actifs suit.

**Aucun appel automatique** : l'ouverture, l'acceptation, la présélection et l'accord ne font
jamais sonner. Le contrat ne modifie pas l'appel personnel existant (`calls.direct.callMember`).
Celui-ci reste régi par ses propres réglages et ne tire aucun droit d'une conversation
contextuelle.

### 5.9 Politique par réseau et par nature

`contextualPolicies` est fermée par défaut. Un opérateur plateforme la règle depuis la console
(section Pages), avec un motif d'au moins 10 caractères et un audit `contextual.policy_set`
(cliquet `operator-audit`). Une politique fermée bloque toute ouverture, tout message et tout
appel ; l'historique reste lisible des parties (D10). Fermer la politique est aussi le retour
arrière.

## 6. Cycle de vie

### 6.1 Ouverture idempotente

L'ouverture suit ces étapes :
1. Elle part d'un objet relu en phase `open` (§4.1).
2. Elle échoue sans erreur quand la politique est fermée ou qu'un côté manque : l'aide interne
   rend « non ouvert » et ne fait **jamais** échouer le geste de la tranche.
3. Elle insère une seule ligne par `contextKey`.
4. Elle ne crée aucun message, aucun avis et aucun appel.
5. Le premier avis naît du premier message.

### 6.2 Correspondance entre état de l'objet et phase

| Nature | État effectif de l'objet | Phase | Le demandeur écrit | Le répondant écrit | Pièces | Appels, avec accords |
|---|---|---|---|---|---|---|
| Service | `sent` | `open` | après le premier mot du répondant (D4) | oui | le répondant ; le demandeur après le premier mot | non |
| Service | `proposed`, `confirmed` | `open` | oui | oui | oui | oui (D5) |
| Service | `completed`, `no_show`, `refused`, `cancelled`, `expired` | `closed` | non | non | non | non |
| Mentorat | `sent` | `not_open` | — | — | — | — |
| Mentorat | `accepted` | `open` | oui | oui | oui | oui (D5) |
| Mentorat | `closed` | `closed` | non | non | non | non |
| Mentorat | `declined`, `cancelled`, `expired` | `not_open` (jamais ouvert) | — | — | — | — |
| Candidature | `sent`, `seen` | `not_open` | — | — | — | — |
| Candidature | `shortlisted` | `open` | oui | oui | oui | oui (D5) |
| Candidature | `not_selected`, `withdrawn` | `closed` | non | non | non | non |

Règles transverses :
- L'état effectif est celui que la tranche calcule, avec l'échéance constatée
  (`effectiveServiceRequestStatus`, `effectiveMentoringStatus`). Une échéance passée ferme donc la
  conversation sans attendre le passage planifié.
- Le premier mot du répondant est acquis par un message du répondant, ou par un geste de l'objet
  qui vaut réponse (proposition, donc phase `proposed`).
- Un objet retiré par la modération rend la phase `closed`. Un objet en relecture est absent pour
  le côté qui n'en est pas propriétaire.
- Si la page de l'objet est inactive ou fédérée, le répondant est indisponible et le demandeur
  passe en lecture seule.
- Un fil qui existe pour un objet en `not_open` est une incohérence : il reste en lecture seule
  et n'est jamais rouvert.

### 6.3 Fermeture et cache

| Cause | Effet |
|---|---|
| Objet clos, refusé, expiré ou retiré (états du §6.2), y compris par un passage système | fermée, lecture seule |
| Objet retiré par la modération | fermée, lecture seule |
| Objet supprimé (effacement ou suppression par la tranche) | conversation purgée (§6.5) |
| Clôture par un côté (D12) | fermée, irréversible pour cet objet ; avis `contextual_closed` envoyé à l'autre côté ; l'objet reste inchangé |
| Politique fermée | lecture seule tant que la politique reste fermée ; la rouvrir rend l'écriture aux seuls fils que rien d'autre ne ferme |
| Plus aucune personne habilitée en face | indisponible, réversible |

La tranche appelle `syncContextualConversation` après chaque transition. Cela inclut ses passages
internes :
- `expireDueServiceRequests` et `expireDueMentoringRequests` ;
- `closeEverythingOnRetire` ;
- les clôtures décidées par la modération.

**Correction du §6.3 (D6), validée le 19/10/2026** : `closeExpiredJobOffers` ne porte
AUCUN crochet. Clore une offre ne touche aucune candidature ; il n'existe pas d'état « recrutement
terminé » en V1, et la clôture par un côté (D12) termine le fil. Exception, gérée par la tranche
(CC-3a, CC-3b) : une offre RETIRÉE par la modération donne `closed` à ses candidatures par le
chargeur, et `removeDiasporaTarget` / `restoreDiasporaTarget` synchronisent les candidatures
présélectionnées de cette offre par lots bornés.

L'aide recalcule la phase, écrit le cache, arrête les appels et planifie la revalidation. Elle
n'échoue jamais pour un refus.

L'accès ne dépend pas du cache. Un crochet manqué retarde seulement trois choses : le cache, la
coupure d'un appel déjà établi, et la planification de la purge. C'est pourquoi un cliquet rend
les crochets obligatoires (§12, N21).

### 6.4 Lecture seule de l'historique

Seules les parties actuelles lisent l'historique, sous les mêmes gardes : la personne de chaque
côté personne, tant qu'elle reste membre vivant ; les signataires vivants du moment côté page.
Un signataire arrivé après la fermeture peut lire l'historique, comme il lit déjà les demandes de
sa page. Un signataire retiré ne lit plus rien.

### 6.5 Suppression de l'objet

- **Par l'effacement d'une personne** : la cascade suit les parents déclarés (§9). Elle emporte le
  fil, les messages des deux côtés, les états personnels, les blobs et les états de modération
  des messages, comme dans la purge P10. Les appels sont arrêtés avant.
- **Par une autre suppression** : la tranche appelle `purgeContextualConversation` avant de
  supprimer l'objet. La purge procède par tranches bornées : vingt messages et leurs blobs par
  transaction, puis les états personnels, puis le fil. C'est le modèle de
  `purgeCommercialThreadSlice`.
- Un avis qui désigne un fil disparu est masqué à la lecture, puis purgé par la rétention de la
  cloche.

### 6.6 Conservation : aucune durée inventée

`CONTEXTUAL_RETENTION` vaut `null` dans le domaine pur. Aucune purge temporelle ne s'exécute et
aucune tâche planifiée n'est ajoutée. Une conversation fermée reste lisible des parties jusqu'à
l'un de ces trois événements : l'effacement de l'objet, la suppression de l'objet, ou une décision
D7.

Les 90 jours de P10 sont un choix technique propre à P10 ; ils ne sont pas hérités. Les objets
DIASPORA.GA n'ont pas non plus de purge temporelle. Une fois une durée décidée avec un conseil
compétent, il faudra :
- poser `purgeAt` à la fermeture ;
- ajouter une tâche planifiée à identifiant ASCII ;
- mettre à jour le cliquet `crons-contract`.

## 7. Notifications

- **Rédacteur unique** : `notifyPerson` (cliquet `notifications-writer`).
- **Deux genres neutres**, de catégorie `messages` :
  - `contextual_message` pour un nouveau message ;
  - `contextual_closed` pour une clôture par un côté.

  Les transitions de l'objet gardent leurs avis DIASPORA.GA existants (les 13 genres de la
  tranche) ; aucun avis n'est doublé.
- **Sujet** : `{ contextualThread }`. Cela demande une colonne `subjectContextualThreadId` et
  l'ajout de `contextualThread` à `NOTIFICATION_SUBJECT_KINDS`.
- **Destinataires** : l'autre côté seulement.
  - Côté personne : la personne.
  - Côté page : au plus vingt signataires vivants, administrateurs d'abord. C'est la borne de
    `SERVICE_TEAM_NOTICE_MAX` et de `COMMERCIAL_TEAM_MAX`.
  - `canReadContextualThread` revalide chaque destinataire à quatre moments : à l'émission (dans
    la transaction, après l'écriture du message), à la lecture de la cloche, avant tout transport
    (`notificationStillVisible`, `pushAllowed`) et à l'ouverture.
- **Acteur** :
  - En voix de personne, l'acteur est l'émetteur ; la cloche peut montrer son nom publié.
  - En voix de page, l'avis n'a pas d'acteur : c'est un avis système. Le signataire ne sert
    qu'aux refus « soi-même » et « blocage », comme le `sourcePersonId` de la tranche. Le
    demandeur n'apprend donc jamais qui a écrit.
- **Dédoublonnage** : la clé est « genre | fil | acteur ». Une ligne existante est rafraîchie,
  jamais empilée ; il y a une seule ligne par fil en voix de page.
- **Aucun contenu** : ni texte, ni extrait, ni nom de fichier, ni champ de l'objet, ni nom dans la
  charge sortante. La charge se limite à version, réseau, référence, compteur, langue et URL
  d'entrée (PA5, cliquet `notification-payload-content`). Un message en relecture de modération
  n'émet aucun avis (`moderateContentWrite` rend `false`).
- **Ouverture** : `notifications.open.resolveOpenTarget` rend le genre et
  `{ kind: "contextualThread", id }` seulement si le sujet est encore visible. L'écran compose
  l'adresse à partir des routes de l'application (`apps/*/src/lib/routes.ts` dans ANTSIA,
  `apps/diaspora_ga/src/lib/routes.ts` dans DIASPORA.GA) ; sinon il affiche un repli neutre.
  L'ouverture ne marque rien comme lu, et une adresse fournie par la charge n'est jamais suivie.
- **Appels** : ils passent par le canal d'appel existant. `ringsFor` et `incomingCallAllowed`
  appliquent le contexte d'appel (§11.3).
- **Hors périmètre** : la suite (2) d'`EXECUTION.md`, c'est-à-dire la destination ciblée des 13
  genres DIASPORA.GA, emprunte la même mécanique sans être traitée ici.

## 8. Modération

- **Surface unique** : `contextualMessage`, ajoutée à `MODERATION_SURFACES` et au validateur des
  cibles. La nature affichée au guichet est dérivée du fil côté serveur : par exemple
  « `contextualMessage` · `diasporaServiceRequest` ». Elle ne vient jamais de la personne qui
  signale. Le pays du guichet est celui de l'objet, fourni par la tranche (§10.3). Cela suit la
  règle DIASPORA.GA : pays de l'offre pour une candidature, zone du contenu sinon.
- **Écriture** : le message passe par la modération, avec un propriétaire.
  - En voix de personne, le propriétaire est `authorPersonId`.
  - En voix de page, c'est `ownerPageId`. Le champ existe déjà dans `moderationContentStates` :
    la tranche DIASPORA.GA l'utilise et P16 le lit. Il faut toutefois une variante de
    `moderateContentWrite` qui accepte un propriétaire de type page, car la version actuelle
    n'accepte qu'une personne.
  - La prélecture suit la politique du réseau pour cette surface (D15).
- **Lecture d'un message en relecture** : visible seulement de son auteur (voix de personne) ou
  de l'équipe de la page (voix de page), jamais de l'autre côté. Un message retiré apparaît comme
  `withheld` pour tous : contenu `null`, aucune pièce.
- **Signalement** : seule une partie qui lit actuellement le message peut le signaler, jamais
  sur son propre message. Un signataire ne signale pas un message en voix de sa propre page ; il
  peut signaler un message du demandeur.
- **Aperçu du dossier** : le seul message signalé (extrait borné, comme P10), sans pièce, ni
  participant, ni message voisin, ni contenu de l'objet. L'auteur réel d'un message en voix de
  page est visible des seuls outils de décision des modérateurs.
- **Décision** : par les équipes habilitées. Une partie au fil, ou un signataire de la page
  concernée, ne tranche jamais un dossier de ce fil. C'est la règle DIASPORA.GA, étendue ici.
- Les états de modération sont supprimés avec leur message.

## 9. Export et effacement

| Table | Disposition (`people/dataPolicies.ts`) | Export (`exportableRecord`) |
|---|---|---|
| `contextualThreads` | `owners: []`, `parents: ["serviceRequestId", "mentoringRequestId", "jobApplicationId"]` | Pour `requesterPersonId` et `responderPersonId` : projection du fil sans aperçu (nature, référence de l'objet, côté propre, statut, dates). Rien pour les signataires d'une page, puisque le fil est un contenu de la page |
| `contextualMessages` | `owners: ["authorPersonId"]`, `parents: ["threadId"]` | Pour son auteur : ses messages en voix de personne (texte, nom, type et taille des pièces, dates, retrait), sans clé, empreinte ni `storageId`. Pour le signataire, un message en voix de page n'est exporté que comme trace sans contenu (D13). Jamais le message d'autrui |
| `contextualPersonStates` | `owners: ["personId"]`, `parents: ["threadId"]` | Ses propres états de lecture et d'accord |
| `contextualPolicies` | `shared: true` | aucun |

Une référence ne vaut pas propriété (règle PA5 et ADR-0009, point 6). Être partie, signataire,
cité ou mentionné ne donne aucun export du contenu d'autrui. Le fil ne livre aucun aperçu. Chaque
partie exporte ses propres messages et la projection PA5 du fil, qui ne contient aucun corps ni
aucune pièce d'autrui.

Effacement, selon la personne effacée :
- **Personne côté demandeur** : l'objet appartient à cette personne dans la classification de la
  tranche (`serviceRequests`, `jobApplications`, ainsi que `mentoringRequests`, qui appartient
  aux deux parties). Il est effacé, et la cascade par les parents emporte fil, messages des deux
  côtés, états personnels et blobs.
- **Mentor** : `mentoringRequests` lui appartient aussi. Tout le fil disparaît pour les deux
  parties.
- **Signataire** : ses messages en voix de page restent, mais `pageSpeakerPersonId` est retiré
  (référence facultative effacée par `anonymizeReferences`). Ses états personnels sont supprimés.
  Les clés de débit personnelles sont remises à zéro.

L'inventaire d'effacement dérivé du schéma (`people/erasure.test.ts`) impose de classer ces tables
avant toute génération.

## 10. API minimale

### 10.1 Fonctions publiques du moteur (`api.modules.contextualMessaging.*`)

| Fonction | Type et statut minimal | Seau | Entrées → sortie | Gardes propres |
|---|---|---|---|---|
| `threads.openForObject` | mutation, `declaree` | `contextual.open` | `context` (nature + identifiant typé) → `{ threadId, created }` | partie actuelle ; phase `open` ; politique ouverte ; idempotente |
| `threads.getThread` | requête, `en_attente` | — | `threadId` → fil projeté ou `null` | relecture complète (§4.2) |
| `threads.findForObject` | requête, `en_attente` | — | `context` → fil projeté ou `null` ; ne crée rien | idem ; sert aux écrans de l'objet |
| `threads.paginateMine` | requête, `en_attente` | — | pagination (≤ 30), filtre de nature facultatif → page | fusion des index demandeur et répondant-personne, avec un curseur par côté (technique de `messaging/inbox.paginateMyThreads`) ; chaque ligne est relue ; une ligne écartée fait quand même avancer le curseur |
| `threads.paginateForPage` | requête, `en_attente` | — | `pageId`, pagination (≤ 30) → page | le lecteur est signataire vivant de la page ; chaque ligne est relue |
| `threads.markRead` | mutation, `en_attente` | `contextual.manage` | `threadId` → `null` | lecture admise |
| `threads.close` | mutation, `en_attente` | `contextual.manage` | `threadId`, `expectedRevision` → `null` | partie, fil ouvert ; irréversible ; arrête les appels ; avis neutre |
| `messages.paginateMessages` | requête, `en_attente` | — | `threadId`, pagination (≤ 40 messages, 80 lignes lues, 512 Kio) → page | accès ; filtre de modération ; pièces servies par la garde |
| `messages.generateUploadUrl` | mutation, `declaree` | `upload.url` | `threadId` → URL de dépôt | capacité de joindre |
| `messages.send` | mutation, `declaree` | `contextual.message`, `contextual.thread` | `threadId`, `text`, `attachments?`, `idempotencyKey` → `{ messageId, deduplicated }` | capacités, premier mot, texte, pièces, modération, avis |
| `messages.remove` | mutation, `en_attente` | `contextual.manage` | `threadId`, `messageId` → `null` | émetteur seul (auteur, ou voix de page qu'il a portée), tant qu'il lit ; pièces purgées |
| `calls.setCallConsent` | mutation, `en_attente` (activer exige `declaree`) | `contextual.manage` | `threadId`, `allowed` → `null` | activer : fil ouvert et phase engagée ; retirer : toujours possible, et arrête l'appel |
| `calls.start` | mutation, `declaree` | `contextual.manage` (puis `call.place`) | `threadId`, `targetPersonId?`, `mediaType` → résultat d'appel direct | §5.8 |
| `operator.policy`, `operator.setPolicy` | requête et mutation opérateur, administrateur plateforme | seau opérateur existant | `networkId`, `kind`, `enabled`, `reason` → `null` | motif ; `appendAudit` |

Le fil projeté contient :
- `threadId`, `networkId` et `kind` ;
- `object` : nature et identifiant, ou `null` si l'objet n'est plus visible du lecteur ;
- `viewer` : côté et voix du lecteur ;
- `counterpart` : libellé publié d'une personne, ou carte d'une page avec son logo servi ;
- `state` : `open` ou `read_only`, avec un motif réduit à « fermée » ou « indisponible » ;
- `capabilities` : `canSend`, `canAttach`, `canClose`, `canSetCallConsent`, `canCall` ;
- `callConsent` : son propre accord ;
- `callTargets` : signataires consentants, servis seulement au côté personne quand l'appel est
  possible ;
- `unread`, `lastMessageAt` et `createdAt`.

Le message projeté reprend la forme P10 : `side`, `voice`, émetteur (libellé publié, ou page,
avec le coéquipier visible de l'équipe seulement), `isMine`, contenu ou `null`, `deleted`,
`withheld`, pièces délivrées et date.

### 10.2 Aides internes offertes aux tranches et aux modules du moteur

| Aide | Appelant | Effet |
|---|---|---|
| `openContextualConversation(ctx, context)` | tranche, après une transition d'ouverture | rend le fil ou « non ouvert » ; idempotente ; n'échoue jamais pour un refus |
| `syncContextualConversation(ctx, context)` | tranche, après toute autre transition, y compris ses passages internes | recalcule la phase ; écrit le cache ; arrête les appels ; planifie la revalidation |
| `purgeContextualConversation(ctx, context)` | tranche, avant de supprimer un objet hors effacement | planifie la purge par tranches |
| `canReadContextualThread`, `canReadContextualMessage` | cloche, modération | relecture complète, en booléen |
| `canParticipateContextualCall(ctx, call, personId)` | `calls`, `notifications` | règles du §5.8 |
| `retention.revalidateCalls`, `retention.purgeSlice` (fonctions internes) | planificateur | pages de vingt ; purge bornée |

### 10.3 Contrat du résolveur fourni par la tranche, par nature

Le type du résolveur vit dans `convex/modules/contextualMessaging/contract.ts`, côté moteur, sans
fonction. Son implémentation vit dans la tranche, dans `convex/modules/diaspora/conversationContexts.ts`.
Chaque nature fournit les éléments suivants.

- **Chargeur** `load(ctx en lecture seule, objectId, now)`. Il rend `null` si l'objet est absent
  ou hors d'un réseau DIASPORA.GA (`isDiasporaNetwork`). Sinon, il rend un instantané qui contient :
  - `networkId` ;
  - `requester` : `{ personId }` ;
  - `responder` : `{ pageId }` ou `{ personId }` ;
  - `phase` : `not_open`, `open` ou `closed`, calculée par la règle pure de
    `@diaspora-ga/domain` à partir de l'état **effectif** de l'objet ;
  - `callsEngaged`, `responderFirst` et les pièces admises par côté ;
  - `writeMinStatus` par côté, dans le vocabulaire des statuts du moteur ;
  - `moderationCountry`, le pays du guichet.
- **Visibilité propre** `visibleTo(ctx, objectId, personId, now)`. Elle rend un booléen qui applique
  les règles de la tranche : modération (`isServedTo`) et page lisible. Elle ne rend jamais une
  liste de personnes ni un droit.
- **Règle de texte facultative**, pure (D8 amendé, validé le 19/10/2026) :
  `textRule({ text, kind, side, voice })` rend `{ ok: true }` ou `{ ok: false, code }`, `code`
  étant un code fermé de la tranche au format `appRule` (`^[a-z][a-z0-9_]{1,63}$`).

**Type écrit (CC-2a, 19/10, contrat accepté).** Point d'import stable, sans fonction ni
dépendance aux internes du moteur : `convex/modules/contextualMessaging/contract.ts`. La tranche
l'importe depuis `convex/modules/diaspora/conversationContexts.ts` par
`import type { ContextualResolvers, ContextualSnapshot, ContextualTextRuleInput, ContextualTextRuleResult } from "../contextualMessaging/contract"`,
et les natures, phases, côtés et voix par `@antsia/social-domain/contextualMessaging`. Elle exporte
`DIASPORA_CONVERSATION_CONTEXTS`, un objet littéral `satisfies ContextualResolvers` (une entrée par
nature V1) ; `convex/modules/contextualMessaging/registry.ts` l'importe seul (cliquet
`contextual-registry`). Tant que ce fichier n'existe pas, le registre porte `null` pour chaque
nature : la nature est **indisponible** (aucune ouverture, conversation absente pour tous).

```ts
type ContextualReadCtx = Pick<QueryCtx, "db">
type ContextualSnapshot = {
  networkId: Id<"networks">
  requester: { personId: Id<"persons"> }
  responder: { pageId: Id<"pages"> } | { personId: Id<"persons"> }
  phase: "not_open" | "open" | "closed"
  callsEngaged: boolean
  responderFirst: boolean
  attachments: { requester: boolean; responder: boolean }
  writeMinStatus: { requester: ActiveMembershipStatus; responder: ActiveMembershipStatus }
  moderationCountry: string | null
}
type ContextualResolver<K extends ContextualKind> = {
  kind: K
  load(ctx: ContextualReadCtx, objectId: Id<ContextualReferenceTable<K>>, now: number): Promise<ContextualSnapshot | null>
  visibleTo(ctx: ContextualReadCtx, objectId: Id<ContextualReferenceTable<K>>, personId: Id<"persons">, now: number): Promise<boolean>
  textRule?(input: { text: string; kind: K; side: "requester" | "responder"; voice: "person" | "page" }): { ok: true } | { ok: false; code: string }
}
type ContextualResolvers = { [K in ContextualKind]: ContextualResolver<K> }
```

Obligations du résolveur :
- lecture seule : aucune écriture, aucun planificateur, aucun avis ;
- lectures bornées, par index, sans `.collect()` non bornée ;
- déterminisme : même instantané et même instant donnent le même résultat ;
- aucune lecture hors du moteur ;
- `@diaspora-ga/domain` importé dans la tranche seulement (cliquet `no-cross-product-imports`) ;
- tout refus prend la forme `null`, jamais une exception porteuse de raison ;
- aucune lecture des signataires, des blocages ni des adhésions, qui restent au moteur ;
- tests purs de toutes les correspondances du §6.2.

### 10.4 Répartition entre la tranche et le moteur

| Sujet | La tranche DIASPORA.GA fournit | Le moteur ANTSIA garde |
|---|---|---|
| Objet | chargeur, règle pure état → phase, visibilité, pays du guichet | registre fermé, validateur des natures, colonnes typées |
| Cycle | appels de `openContextualConversation`, `syncContextualConversation` et `purgeContextualConversation` dans ses transitions et passages | cache, fermeture, purge, revalidation des appels |
| Autorité | rien (aucune liste de personnes) | adhésion, vivacité, signataires vivants, blocages, politique |
| Contenu | règle de texte facultative (D8), libellés de rôle et de nature FR/EN | tables, envoi, idempotence, débits, garde des fichiers, modération, avis, export, effacement |
| Écrans | port, adaptateur moteur, démonstration et entrées depuis ses écrans | source contextuelle et vue de conversation partagées (composeur, bulles, pièces) |

### 10.5 Ajouter une nature (procédure fermée)

1. Décision du propriétaire et ADR.
2. Ajout de la nature à la liste du domaine pur, avec sa colonne typée, son index et sa
   classification de données (parents).
3. Chargeur, règle pure et tests de la tranche propriétaire.
4. Entrée du registre (`registry.ts`, seul fichier du moteur qui importe la tranche).
5. Politique fermée par défaut.
6. Libellés FR/EN de la nature et des rôles.
7. Nature affichée au guichet.
8. Projection d'export.
9. Crochets dans les transitions.
10. Cliquet `contextual-registry` vert.

## 11. P10 : décision et compatibilité

### 11.1 Décision : P10 reste distinct en V1, comme une famille voisine et non comme un cas particulier

1. **Sémantique différente.** Le fil P10 est lui-même l'objet : demande, puis acceptation ou
   refus par la boutique, avec une première demande bornée. Une conversation contextuelle n'a pas
   d'acceptation propre. Pour faire de P10 un cas particulier, il faudrait d'abord extraire du fil
   un objet « demande de contact » : c'est une migration, pas une reformulation.
2. **Autorité différente.** P10 repose sur des mandats de répondant acceptés et révisés (lire,
   répondre, décider, appeler), une politique réseau et un réglage de boutique. Les natures V1
   reposent sur la qualité de partie de l'objet (DG-004).
3. **Engagements externes.** `conversationRef` est transmis à PRO.GA par `inquiry.submit`, avec
   le transfert CRM, le retrait privé et la tombe préventive. P14 s'appuie sur une conversation
   P10 acceptée (`commerceServiceRequests.threadId`). Déplacer ces fils toucherait un contrat
   inter-produits.
4. **Produit.** L'accord D-G01 du 18/10 interdit à la mise en relation DIASPORA.GA tout lien
   PRO.GA et tout vocabulaire « commerce ». DG-013 ne peut donc pas emprunter un canal attaché à
   une boutique.
5. **Risque.** P10 est « raccordé, jamais exécuté » et en revue P16. Le modifier maintenant
   doublerait le risque et créerait une collision d'écriture.
6. **Protections propres.** P10 a des intentions de blocage de paire qui survivent à la purge, et
   une rétention de 90 jours qui attend le reçu de retrait CRM.

Conséquence assumée : il y a trois familles de conversations. C'est une extension de la
conséquence négative déjà acceptée par ADR-0019. Elle est atténuée par l'extraction des règles
communes (§11.2), par la généralisation des points de contact (§11.3) et par une voie de
convergence écrite (§11.4).

### 11.2 Ce qui est partagé sans copie

- **Règles de texte, de clé et d'empreinte** : déplacées dans une règle neutre du domaine (CC-1).
  `commercialContact.ts` les ré-exporte sous leurs noms actuels, sans effet sur P10, avec
  l'accord des propriétaires de P10 et P16. Sans cet accord, la règle neutre est écrite seule, et
  un test de parité la confronte à `commercialText` jusqu'à ce que P10 l'adopte : aucune dérive
  silencieuse n'est possible.
- **Vivacité d'une personne** (`livingMember`) : passe dans une aide neutre du moteur. P10
  l'importe, sous le même accord. Sans cet accord, l'aide neutre compose les mêmes primitives
  (`livePersonProfile`, `memberHasStatus`, `isConsentInForce`) au lieu de recopier P10. Le module
  contextuel n'importe jamais `commercialMessaging/**`.
- **Pièces** : `messaging/attachmentStorage.ts` et `files/*`, déjà partagés.
- **Appels** : un sélecteur unique de contexte d'appel (commercial, contextuel ou aucun) remplace
  toute seconde chaîne de conditions (§11.3).
- **Écrans** : composeur, bulles, pièces et journal sont partagés.
  `CommercialConversationView` et la future `ContextualConversationView` composent les mêmes
  sous-composants, sans fork.

### 11.3 Points de contact généralisés

| Point | Règle |
|---|---|
| `calls` | Un appel porte au plus un contexte : `commercialThreadId` **ou** `contextualThreadId`, jamais les deux. Tous les embranchements existants passent par le sélecteur : accès, sonnerie, ouverture d'avis, jeton à 60 secondes, fermeture de salle, journal, refus de la messagerie vocale et de l'appel de groupe. Ces embranchements sont dans `calls/{access,direct,livekitActions,token,state,ringing,history,lifecycle,voicemail,groupCalls}.ts` et `notifications/{open,policy}.ts` |
| Cloche | Genres et sujets distincts : `commercial_contact` et `commercialThread` d'un côté ; `contextual_message`, `contextual_closed` et `contextualThread` de l'autre |
| Modération | Surfaces distinctes : `commercialMessage` et `contextualMessage` ; mêmes règles d'aperçu |
| Messages | Sources distinctes, injectées par l'application. Le filtre « Boutiques » reste à P10 ; un filtre « Mises en relation » est ajouté côté DIASPORA.GA. Aucun identifiant n'est converti d'une famille à l'autre |
| Données | Aucune table partagée ; aucune lecture croisée entre les deux modules |

### 11.4 Voie de convergence (CC-8, facultative, hors V1)

Conditions préalables :
- P10 vérifié et recetté ;
- décision prise sur le contrat `conversationRef` avec PRO.GA ;
- décision du propriétaire (D1).

Étapes :
1. Créer un objet `commercialContactRequests` (état, offre, accord d'appel de l'acheteur, lien
   CRM) et une nature `shopContact`, dont le côté page devient le « sous-ensemble mandaté » de D2.
2. Copier les messages par lots idempotents, avec une table de correspondance.
3. Remapper cibles de modération, sujets d'avis, journal d'appels et références P14.
4. Ouvrir une période de double lecture.
5. Retirer seulement après cette période.

Aucune de ces étapes n'est engagée par ce contrat.

### 11.5 P14 et P15

- **P14** (services ANTSIA × PRO.GA) continue de partir d'une conversation P10 acceptée. Les
  services DIASPORA.GA (DG-014) passent par la nature `diasporaServiceRequest`. Les deux chemins
  coexistent parce que les produits diffèrent (D-G01).
- **P15** : la nature `commerceJobApplication` est réservée, et non implémentée (D11), pour trois
  raisons :
  - l'autorité des recruteurs vit dans PRO.GA, qu'ANTSIA ne lit pas (étanchéité) ;
  - `remoteState` est relu à la demande du candidat, il n'est donc pas une preuve d'ouverture ;
  - ADR-0024 interdit d'utiliser les messages sociaux dans la décision.

  Pour l'activer, il faudrait réunir quatre éléments :
  - une attestation de présélection signée par PRO.GA, dans un contrat privé jumeau écrit avant
    le code ;
  - des mandats de recrutement ANTSIA sur la page de la boutique, sur le modèle de
    `shopContactMandates` ;
  - un accord versionné du candidat ;
  - la garantie qu'aucun contenu n'est jamais transmis à PRO.GA.

## 12. Tests négatifs à écrire

Fichiers cibles :
- moteur : `convex/modules/contextualMessaging/contextualMessaging.test.ts`, et
  `contextualCalls.test.ts` pour les appels ;
- domaine pur : `packages/social-domain/src/contextualMessaging.test.ts` (nom livré par CC-1, aligné
  sur le module `@antsia/social-domain/contextualMessaging` du §10.3) ;
- tranche : `convex/modules/diaspora/conversationContexts.test.ts` ;
- domaine DIASPORA.GA : `packages/diaspora-ga-domain/src/conversation-contexts.test.ts` ;
- non-régression personnelle : `convex/modules/messaging/messaging.test.ts` ;
- cliquets : nouveaux `tests/ratchets/contextual-registry.test.ts` et
  `tests/ratchets/contextual-hooks.test.ts`, et ajout du module à `network-scoped-functions`.

À la réouverture des contrôles, les tests du moteur se lancent avec
`--config convex/vitest.config.ts`.

**Accès et réseau**
- N01 : un non-partie lit un fil par identifiant, par objet ou par liste et reçoit `null`, comme
  pour un identifiant inventé. S'il écrit, il reçoit `notFound`, sans aucun effet.
- N02 : une même personne, membre des deux réseaux, lit un fil du réseau A depuis le réseau B et
  reçoit `null`.
- N03 : l'identifiant d'un objet d'une autre nature reçoit un refus indistinct. Une nature
  inconnue ou réservée est refusée par le validateur.
- N04 : des clés de fil divergentes de l'objet rendent la conversation absente pour tous, sans
  aucune écriture.
- N05 : un signataire retiré entre deux requêtes voit échouer sa lecture, son envoi, son dépôt,
  son accord et son appel suivants. Ses coéquipiers continuent. Un avis ancien ouvre le repli
  neutre.
- N06 : une page désactivée ou devenue fédérée met le demandeur en lecture seule ; les
  signataires n'ont plus d'accès.
- N07 : une personne sortie du réseau ou suspendue à la racine est refusée par le constructeur.
  L'autre côté passe en lecture seule. « Mes données » reste disponible.
- N08 : un demandeur devenu signataire de la page répondante n'agit que comme demandeur, jamais
  en voix de page.
- N09 : un objet en relecture est absent pour le côté qui n'en est pas propriétaire. Un objet
  retiré par la modération met la conversation en lecture seule.

**Blocages**
- N10 : un blocage entre le demandeur et le signataire S rend la conversation absente pour S ;
  les autres signataires gardent l'accès et aucun avis n'est écrit pour S. Un déblocage rend
  l'accès, si l'objet le permet encore.
- N11 : un blocage entre mentoré et mentor rend la conversation absente pour les deux ; l'objet
  reste gérable.
- N12 : un blocage posé pendant un appel arrête cet appel.

**Cycle et idempotence**
- N13 : le crochet d'ouverture appelé deux fois, ou une ouverture concurrente par les deux
  parties, produit un seul fil.
- N14 : `openForObject` sur un objet `not_open` (mentorat envoyé, candidature vue) rend
  `CONTEXT_NOT_OPEN` à une partie et `notFound` à un tiers.
- N15 : avec une politique fermée, aucune ouverture ni écriture n'est possible ; l'historique
  reste lisible. Rouvrir la politique ne fait pas revivre un fil fermé.
- N16 : pour chaque état de fermeture des trois natures, envoi, dépôt, accord et appel sont
  refusés ; la lecture reste admise.
- N17 : une échéance passée mais pas encore écrite par le passage planifié ferme déjà la
  conversation (état effectif).
- N18 : la clôture par un côté est irréversible, envoie un avis neutre à l'autre côté et laisse
  l'objet inchangé. Un nouvel objet ouvre un nouveau fil.
- N19 : le rejeu d'un envoi avec la même clé après fermeture rend le message existant, sans en
  créer de nouveau.
- N20 : même clé avec un autre contenu donne un conflit ; la clé d'une autre personne ne donne
  jamais un faux succès.
- N21 : un crochet manqué laisse l'accès correct, parce que le cache est ignoré. Le cliquet
  `contextual-hooks` signale toute écriture d'état d'objet sans appel de synchronisation dans la
  même fonction.

**Débits et texte**
- N22 : une rafale d'un membre au-delà de `contextual.message`, ou d'une équipe au-delà de
  `contextual.thread`, est refusée. Un compte léger relève du seau renforcé.
- N23 : sur une demande de service `sent`, le demandeur ne peut pas écrire avant le premier mot
  du répondant. Il le peut après une proposition ou un message de la page.
- N24 : sont refusés, avec un code fermé, un texte vide sans pièce, un texte trop long, des
  caractères de contrôle, et (D8 amendé, validé) une adresse exacte en voix de personne ;
  la même adresse est admise en voix de page. Le refus de la tranche n'atteint que l'émetteur et
  aucun contenu n'est journalisé.

**Pièces**
- N25 : une URL de dépôt demandée par un tiers, ou sans capacité de joindre, est refusée. Un
  `storageId` d'un tiers ou non frais est refusé. Un poids ou un type mensonger donne
  `UPLOAD_MISMATCH`. Un lot trop nombreux est refusé avant toute lecture du stockage.
- N26 : une pièce en quarantaine reste une retenue nommée, sans URL. Les blobs d'un message
  retiré sont purgés.

**Appels**
- N27 : un appel est refusé sans accord, avec l'accord d'un seul côté, hors phase engagée (service
  `sent`) ou sur un fil fermé. Rien ne sonne à l'ouverture, à l'acceptation ni à la
  présélection.
- N28 : un retrait d'accord, une fermeture d'objet, ou un signataire retiré pendant la sonnerie ou
  l'appel terminent l'appel ; le jeton suivant est refusé.
- N29 : un accord donné, suivi d'un rôle retiré puis rendu, ne vaut plus.
- N30 : la messagerie vocale n'est jamais proposée et l'appel de groupe est refusé. « Ne pas
  déranger », l'occupation et l'absence connue restent appliqués ; le réglage « hors de mes
  relations : silencieux » ne s'applique pas à un accord donné dans ce fil, et à ce seul fil
  (D5 amendé, option (a), validé).
- N31 : en voix de page, le demandeur ne peut cibler qu'un signataire consentant. Un signataire
  ne peut pas appeler au nom d'un autre.

**Notifications**
- N32 : aucune ligne de cloche, aucun job et aucun transport ne porte texte, extrait, nom de
  fichier, contenu d'objet ou nom.
- N33 : un message en voix de page produit un avis sans acteur. Le demandeur n'apprend jamais
  quel signataire a écrit, ni par la cloche, ni à l'ouverture, ni par le transport.
- N34 : le destinataire est relu à l'émission, à la lecture, avant transport et à l'ouverture. Un
  signataire retiré entre-temps obtient le repli neutre. Ouvrir un avis ne marque rien comme lu.
- N35 : un message en relecture n'émet aucun avis.

**Modération**
- N36 : un signalement par un tiers, ou sur un message illisible, reçoit un refus indistinct. Un
  signalement de son propre message, ou d'un message en voix de sa propre page, est refusé.
- N37 : l'aperçu du dossier ne montre que le message, sans pièce, participant, message voisin ni
  contenu d'objet. La nature est dérivée du fil.
- N38 : un message retiré apparaît `withheld` pour tous. Une partie au fil ou un signataire de la
  page ne décide jamais du dossier.

**Export et effacement**
- N39 : l'export d'une partie contient ses messages en voix de personne et la projection du fil.
  Il ne contient jamais le contenu d'autrui, ni clé, empreinte, `storageId` ou identité d'un
  signataire. En voix de page, il contient une trace sans contenu (D13).
- N40 : l'effacement du demandeur supprime l'objet, le fil, les messages des deux côtés, les états
  personnels, les blobs et les états de modération. L'autre côté ne voit plus rien et les avis
  anciens sont masqués.
- N41 : après l'effacement d'un signataire, ses messages en voix de page restent, sans la
  référence d'audit. Ses états personnels sont supprimés.
- N42 : l'effacement du mentor fait disparaître tout le fil.

**Non-régression et étanchéité**
- N43 : après une conversation contextuelle, `startThreadWithHandle` vers la même personne, sans
  relation, reste refusé (`THREAD_RELATION_REQUIRED`). Aucune ligne n'apparaît dans
  `personalThreads`, `connections`, `follows` ou `unreadTotals`.
- N44 : toute fonction commerciale refuse un identifiant contextuel, et inversement. Un appel ne
  porte jamais les deux contextes.
- N45 : chaque nature a son résolveur, sa règle pure testée, sa politique, ses libellés FR/EN et
  sa classification. Le moteur n'importe la tranche que par `registry.ts`. Aucune `.collect()`
  n'est non bornée.

**Recette avant ouverture** (deux comptes réels, téléphone et bureau) :
- par nature : ouverture, échange, pièce retenue, refus du premier mot, fermeture par l'objet ;
- révocation d'un signataire pendant la lecture puis pendant un appel ;
- blocage, avis ouvert après perte de droit ;
- export, effacement.

Une admission technique de notification ne prouve pas la réception sur l'appareil.

## 13. Sous-lots, fichiers et propriétaires

Règles de l'arbre partagé, inchangées :
- les fichiers partagés (`convex/schema.ts`, `convex/lib/rateLimit.ts`,
  `people/{dataPolicies,dataInventory,erasure}.ts`, `notifications/*`, `moderation/*`, `calls/*`)
  sont modifiés par la session ANTSIA seule, par une modification à ancre unique relue juste
  avant ;
- jamais `git add -A` ;
- aucun changement de branche tant que deux sessions écrivent.

| Ordre | Sous-lot | Propriétaire | Contenu | Fichiers (créés ou modifiés par ancre) |
|---|---|---|---|---|
| 0 | CC-0 | propriétaire et coordinateur | décisions D1 à D16 ; ADR, numéro à réserver ; réservation | `docs/adr/00xx-conversations-contextuelles.md` ; `EXECUTION.md` (coordinateur) |
| 1 | CC-1 | ANTSIA, moteur | domaine pur : natures, phases, côtés, voix, capacités, politiques statiques, règle neutre de texte, de clé et d'empreinte, `CONTEXTUAL_RETENTION = null` ; genres, sujet, catégorie et surface de modération | créés `packages/social-domain/src/contextualMessaging.ts` et son test (nom livré) ; modifiés `notifications.ts`, `notificationDelivery.ts`, `moderationPolicy.ts` ; `commercialContact.ts` en option (ré-export, accord P10 et P16) |
| 2 | CC-2a | ANTSIA, moteur | type du résolveur, sans fonction, pour débloquer la tranche | créé `convex/modules/contextualMessaging/contract.ts` |
| 3 | CC-3a | DIASPORA.GA, tranche | règles pures et chargeurs des trois natures, visibilité, pays du guichet, règle de texte | DIASPORA.GA : créés `packages/diaspora-ga-domain/src/conversation-contexts.ts` et son test. Tranche : créés `convex/modules/diaspora/conversationContexts.ts` et son test |
| 3 (en parallèle) | CC-2b | ANTSIA, moteur | tables, registre, accès (résolveur injecté dans les tests, jamais enregistré), fils, messages, états, politique et console, aides, rétention inactive ; avis, modération, données, débits, cliquets | créés `contextualMessaging/{tables,registry,access,threads,messages,personStates,operator,hooks,retention}.ts` et le test ; `apps/admin_antsia_ga/src/components/console-contextual-policy.tsx`. Modifiés `convex/schema.ts`, `convex/lib/rateLimit.ts`, `people/{dataPolicies,dataInventory,erasure}.ts`, `notifications/{tables,notify,policy,open,bell}.ts`, `moderation/{tables,targets,reviewProjection,policy}.ts`, `tests/ratchets/network-scoped-functions.test.ts`, `console-pages.tsx`, `operations.json` FR/EN. Créés les cliquets `contextual-registry` et `contextual-hooks` |
| 4 | CC-3b | DIASPORA.GA, tranche | crochets dans les transitions et les passages ; fermetures système ; manifeste | modifiés `convex/modules/diaspora/{serviceRequests,mentoring,jobs,moderationTargets,manifest}.ts` ; libellés dans le fragment DIASPORA.GA |
| 5 | CC-4 | ANTSIA, moteur | appels : sélecteur de contexte, accords, revalidation, jeton court, journal | créé `contextualMessaging/calls.ts` et `contextualCalls.test.ts` ; modifiés `calls/{tables,direct,access,evaluate,livekitActions,token,state,ringing,history,lifecycle,voicemail,groupCalls}.ts` et `notifications/{open,policy}.ts` |
| 6 | CC-5 | ANTSIA, interface partagée | source contextuelle et vue réutilisant composeur et bulles ; textes FR/EN | créés `packages/social-features/src/features/messagerie/{contextual-messaging-source.ts,ContextualConversationView.tsx}` et leurs tests, plus le fragment `messagerie.contexte.json` FR/EN ; modifiés `MessagesRoute.tsx` et `IcomMessagesPage.tsx` (source injectable), `notifications.json`. Aucune nature V1 dans le réseau racine : `apps/antsia_ga` n'est pas touché |
| 7 | CC-6 | DIASPORA.GA, interface | port, adaptateur moteur, démonstration, entrées depuis « Mes demandes », « Demandes reçues », « Mes mentorats » et les candidatures ; liens profonds | DIASPORA.GA : créés `packages/diaspora-ga-features/src/data/conversations-port.ts`, `src/demo/conversations.ts`, les composants, `src/i18n/locales/{fr,en}/conversations.json`, `apps/diaspora_ga/src/data/engine-conversations.ts` ; modifié `apps/diaspora_ga/src/lib/routes.ts` |
| — | CC-V | coordinateur | génération, vérification commune, recettes à deux comptes | sur instruction du propriétaire uniquement |
| plus tard | CC-7 | ANTSIA × PRO.GA | nature `commerceJobApplication` (D11) | contrat privé jumeau d'abord, puis code |
| plus tard | CC-8 | ANTSIA (P10) | convergence facultative de P10 (§11.4) | après vérification de P10 et D1 |

## 14. Décisions du propriétaire — validées le 19/10/2026

Validation du propriétaire, relayée par la session DIASPORA.GA, citée mot pour mot : « Je valide
les décisions D1 à D16 du contrat CONVERSATION-CONTEXTUELLE-V1, avec les amendements D5 et D8 ;
transmets-le à ANTSIA. » Elle couvre D1 à D16 tels que ci-dessous, D5 et D8 amendés, et la
correction du §6.3. D7 et D13 restent à confirmer juridiquement.

| N° | Question | Décision | Statut |
|---|---|---|---|
| D1 | P10 : distinct ou migré | Distinct en V1 (§11.1) ; convergence CC-8 facultative, seulement après vérification et recette de P10 | **validée** |
| D2 | Composition du côté page | Tous les signataires vivants, ce qui s'aligne sur DG-004 et sur les droits actuels des demandes. Variante écartée : sous-ensemble mandaté (modèle P10) | **validée** (acceptée telle quelle par DIASPORA.GA) |
| D3 | Voix des côtés page (services, candidatures) | Voix de page. Le coéquipier est visible de l'équipe seulement ; le signataire est nommé seulement s'il consent à un appel | **validée** (acceptée telle quelle par DIASPORA.GA) |
| D4 | Premier mot pour une demande de service | Au répondant, parce que la demande structurée tient lieu de premier message. Variante écartée : écriture libre dès l'envoi | **validée** (acceptée telle quelle par DIASPORA.GA) |
| D5 | Appels par nature | Accords des deux côtés, à partir de `proposed` pour un service, d'`accepted` pour un mentorat, de `shortlisted` pour une candidature. **Amendement (option (a))** : l'accord explicite donné dans le fil vaut admission pour ce seul fil, au-dessus du réglage « hors de mes relations : silencieux » ; « ne pas déranger », occupation et absence restent appliqués ; la projection indique au lecteur l'effet de ses propres réglages (CC-4). Ancienne recommandation (réglage maintenu, comme P10) écartée | **validée, amendée** |
| D6 | Candidature présélectionnée dont l'offre est close | Fil maintenu jusqu'à la décision de l'équipe, qui peut ne pas retenir ou clore le fil (D12). Précision : aucun état « recrutement terminé » en V1, aucun crochet dans `closeExpiredJobOffers` ; seule une offre retirée par la modération ferme ses candidatures (chargeur), avec synchronisation bornée par `removeDiasporaTarget` / `restoreDiasporaTarget` (correction du §6.3) | **validée** (acceptée par DIASPORA.GA, §6.3 corrigé) |
| D7 | Conservation après fermeture | Aucune durée (`null`) tant qu'elle n'est pas décidée avec un conseil compétent. P10 garde ses 90 jours | **validée** ; **à confirmer juridiquement** |
| D8 | Règle de texte DIASPORA.GA | Refus d'une adresse exacte (G5 point 6). Coordonnées permises, puisque la messagerie est le canal de contact du réseau. **Amendement** : la règle reçoit le contexte de l'émetteur (`{ text, kind, side, voice }`) ; adresse exacte refusée en voix de personne, admise en voix de page (lieu de la prestation) ; code fermé de la tranche traduit pour la seule partie émettrice (§5.5, §10.3) | **validée, amendée** |
| D9 | Pièces par message | `chat_attachment`, au plus deux par message comme P10, ouvertes selon le §6.2 | **validée** |
| D10 | Effet d'une politique fermée sur l'existant | Lecture seule de l'historique. Variante écartée : masquage, qui est le comportement de P10 | **validée** |
| D11 | Nature P15 `commerceJobApplication` | Différée jusqu'aux quatre conditions du §11.5. Variante écartée : aucune conversation ANTSIA pour P15 | **validée** |
| D12 | Gestes propres à la conversation | Clôture par un côté, irréversible, ouverte à tout signataire vivant côté page. Pas d'intention de blocage de paire page ↔ demandeur en V1 | **validée** |
| D13 | Export d'un message en voix de page pour son signataire | Trace sans contenu, puisque le contenu appartient à la conversation de la page | **validée** ; **à confirmer juridiquement** |
| D14 | Débits de départ | `contextual.message` aligné sur `commercial.message` (30 par minute, capacité 10) avec son renforcé ; `contextual.thread` 120 par heure, capacité 30 ; `contextual.manage` 120 par heure, capacité 30 ; `contextual.open` 20 par heure, capacité 5. À mesurer au pilote | **validée** |
| D15 | Prélecture des messages privés | Mêmes règles que P10 (`moderateContentWrite`), sans prélecture par défaut, et politique de réseau admise | **validée** |
| D16 | Désignation | ADR-0025 ; module `contextualMessaging`, tables `contextual*` | **validée** |

## 15. Limites de ce document

- **Aucune exécution.** Aucun test, aucune génération, aucun typage, aucun lint, aucun build,
  aucun navigateur et aucune commande Convex n'ont été lancés. Les références décrivent des
  sources partagées non commitées et non vérifiées (P10, P14, P15, vagues G et H de DIASPORA.GA),
  susceptibles de changer, notamment sous P16.
- Les noms de fonctions, de tables et de seaux sont **normatifs** depuis la validation du
  19/10/2026 (ADR-0025 accepté). D7 et D13 restent à confirmer juridiquement.
- Le contrat ne traite pas la destination ciblée des 13 genres d'avis DIASPORA.GA (suite (2)
  d'`EXECUTION.md`), ni la messagerie personnelle, ni le chiffrement de bout en bout, ni les
  appels natifs (P17).
