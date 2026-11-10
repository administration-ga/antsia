# P16 — Confiance, modération et cycle des données

> État historique du 19 octobre. La [reprise du 20 octobre](P16_REPRISE_2026-10-20.md)
> décrit les nouveaux verrous, les corrections ciblées et les ajouts P14/P15 à l’inventaire.
> Aucun résultat historique ne valide cette reprise ; ses scénarios restent non exécutés.

Date : 19 octobre 2026. Revue transverse P07–P15 demandée par le coordinateur sous la décision du
propriétaire du 18/10/2026 : **« Continuer sans vérifier »**. Références : [prompt P16](../prompts/P16_CONFIANCE.md),
[préambule](../prompts/PROMPT_COMMUN.md), [06](../06_BOUTIQUES_SERVICES_EMPLOI.md), [07](../07_AUDIT_PRO_GA.md),
[08](../08_ARCHITECTURE_INTEGRATION.md), [10](../10_RECETTE_MESURES_ET_RISQUES.md), ADR 0017–0024, contrats
`docs/contrats/PRO-COMMERCE-*.md`, rapports P07–P15.

**Verdict : revue faite par lecture des sources des deux dépôts ; sept corrections branchées ; tests
écrits, non exécutés ; aucune preuve d'exécution.** Aucun codegen, test, typage, lint, build, serveur,
navigateur, commande Convex ni installation n'a été lancé. Toute « preuve » de ce rapport vaut
**« aucune exécutée »**. Les défauts de compilation relevés (§9) ne sont pas corrigés. Ce document ne
vaut ni validation juridique, ni recette, ni publication.

Racines des chemins : **A/** = `ECOSYSTEMES/ANTSIA/`, **P/** = `ECOSYSTEMES/PRO_GA/`.

## 0. Bilan standard

| Champ | Contenu |
|---|---|
| Résultat | Inventaire des 39 tables ANTSIA et 52 tables PRO.GA ajoutées par P07–P15, de leurs blobs, projections, événements, travaux et douze contrats ; matrice de révocation ; décisions de modération formalisées ; sept corrections : cliquet de débit (lecture HTTP du proxy média), protection des blocages commerciaux à l'effacement d'un membre d'équipe, fermeture du premier envoi d'une candidature après suspension ou perte de mandat, relecture périodique du mandat des auteurs de liaison chez PRO.GA (retrait `shop.withdrawn`), avertissement avant effacement pour les rendez-vous à venir, avis et recours de modération pour les contenus portés par une page, garde de conflit d'intérêts au jugement d'un recours. |
| Source | ANTSIA `9eaff40` (`codex/pa4-identite-session`) + arbre de travail partagé non commité (561 entrées `git status` au 19/10) ; PRO.GA `9497f22` (`feat/antsia-social-commerce`) + arbre non commité (187 entrées). Aucune branche changée, aucun commit. |
| Tests | Écrits, non exécutés : `A/convex/modules/people/commerce-trust-data-policy.test.ts` (nouveau), `A/convex/modules/shops/serviceErasureNotice.test.ts` (nouveau), cinq cas ajoutés en fin de `A/convex/modules/shops/jobApplications.test.ts`, un cas « test du test » dans `A/tests/ratchets/rate-limited-writes.test.ts`, trois cas ajoutés en fin de `P/convex/modules/integrations/commerceCatalogue.test.ts`. |
| Recette | Aucune. Parcours à éprouver listés en §8 et §11. |
| Dépendances | Codegen et `verify` des deux dépôts ; décisions du propriétaire §10 ; configuration réelle inchangée. |
| Retour arrière | §11 : chaque correction est additive et se retire sans perte ; aucune donnée n'a été supprimée ni migrée. |
| Limites | §9, §11 : compilation et comportement non prouvés ; PRO.GA sans pipeline général d'export/effacement ; voies des membres suspendus à décider. |

## 1. Version candidate, lots applicables, preuves et exclusions

| Lot | Capacité livrée en sources | Preuves | Applicable à P16 |
|---|---|---|---|
| P07 Boutiques | Brouillon déclaré, politique de vitrine `closed/review/auto_verified` (fermée par défaut), admission/suspension opérateur motivées, projection publique consentie | Tests écrits (`shops.test.ts`), **aucune exécutée** | Oui |
| P08 Liaison/transport | Double preuve LINK/PKCE, `link.confirm`, révocation locale, outbox PRO.GA, réception canonique, recette sandbox | Tests écrits (`commerceLinks.test.ts`, `commerceTransport.test.ts`, P/`commerceLinks.test.ts`, `commerceOutbox.test.ts`, `commercePublicTransport.test.ts`), **aucune exécutée** | Oui |
| P09 Catalogue | PUBLIC appliqué sous mapping, têtes/tombes, médias copiés sous FullAV et proxy fermable, rattrapage manuel | Tests écrits (`catalog.test.ts`, `commerceCatalogClient.test.ts`, P/`commerceCatalogue.test.ts`), **aucune exécutée** | Oui |
| P10 Contact | Canal commercial distinct, mandats, blocages de paire, appels consentis, transfert CRM consenti/retirable | Tests écrits (`commercialMessaging.test.ts`, `crm.test.ts`, P/`commerceInquiry.test.ts`), **aucune exécutée** | Oui |
| P11 Préparation | Préparation privée, hold atomique 15 min, reconfirmation prix/frais, libération à l'effacement | Tests écrits (`checkout.test.ts`, `checkoutClient.test.ts`, P/`commerceCheckout.test.ts`), **aucune exécutée** | Oui |
| P12 Paiement | Intentions, preuves fournisseur, répartition paramétrable ; **aucun adaptateur réel** ; lecture ANTSIA limitée à `sandbox` | Tests écrits (`paymentFlow.test.ts`, `paymentClient.test.ts`, P/`commercePayment.test.ts`, `commercePayments.test.ts`, `commerceMarketplace.test.ts`), **aucune exécutée** | Oui, hors encaissement réel |
| P13 Achats | Panier mono-vendeur, Mes achats, réception explicite, annulation/retour demandés, support privé | Tests écrits (`purchase.test.ts`, P/`commerceOrder.test.ts`), **aucune exécutée** | Oui, hors reversement |
| P14 Services | Devis, rendez-vous, prestation fixe, politique fermée, purge technique 90 j | Tests écrits (`services.test.ts`, P/`commerceServices.test.ts`), **aucune exécutée** | Oui |
| P15 Emploi | JOBS-V1, candidatures privées, pièces PDF sous FullAV jamais servies, retrait, conservation `null` | Tests écrits (`jobs.test.ts`, `jobApplications.test.ts`, P/`commerceJobs.test.ts`), **aucune exécutée** | Oui |

Exclusions justifiées : encaissement et reversement réels (aucun adaptateur enregistré, P12 ; la
lecture des paiements ANTSIA exige `environment === "sandbox"`, `A/convex/modules/shops/paymentAccess.ts:32`) ;
P17–P19 (natif, qualité, pilote : hors commerce de confiance) ; tranche `convex/modules/diaspora/**`
(session DIASPORALE ; seuls ses contenus portés par une page profitent de §3.11) ; pipeline général
d'effacement PRO.GA (inexistant, §5.4) ; manifeste P06 gelé et contrats jumeaux (lus, non modifiés).

## 2. Inventaire des entités

### 2.1 ANTSIA — tables (39), toutes classées dans `people/dataPolicies.ts`

Gardes communes : toute fonction publique est `networkQuery/networkMutation/networkAction`,
`personQuery/personMutation` justifiée `@selfScoped`, ou `operatorQuery/operatorMutation` auditée
(cliquets `network-scoped-functions`, `operator-audit` ; `shops` et `commercialMessaging` y figurent,
`federation` est classé non social et n'expose que des fonctions internes et l'inbox signée).

| Table (lot) | Portée | Disposition d'effacement | Accès (garde) | Bornes | Export | Rétention / retrait |
|---|---|---|---|---|---|---|
| `shops` (P07) | `networkId` | `owners: ownerPersonId` (brouillon sans page) ; références de préparateur/consentant anonymisées | `managedShopOrNull` (`shops/access.ts:33`), `servableStorefrontPage` (`:82`), `publicStorefrontPage` (`:100`) | 3 brouillons/personne, 100 pages gérées | Brouillon entier au propriétaire ; sinon ses seules traces | Jusqu'à retrait/effacement ; logo purgé avec le brouillon |
| `shopNetworkPolicies` (P07) | réseau | `shared` | opérateur audité | 1/réseau | aucun | permanent, fermé par défaut |
| `shopCommerceSubjects`, `shopCommerceShopRefs`, `shopCommerceLinks`, `shopCommerceLinkChallenges`, `shopCommerceLinkCommands` (P08) | `networkId` | `owners: personId` / `parents: shopId, challengeId` | `liveShopCommerceLink` (`commerceLinkLifecycle.ts:10`) relit page, administrateur vivant, configuration, effacement | 26/page de révocation | Lien et défi projetés ; sujets, commandes, références : aucun | Défi 5 min, corps expurgés à la résolution ; révocation locale |
| `federationCommerceProbes` (P08) | émetteur | `shared` | interne, sandbox seule | — | aucun | preuve technique |
| `shopCatalogPolicies`, `commerceCatalogMappings` (P09) | réseau/boutique | `shared` | opérateur audité | 1/réseau, 1/boutique | aucun | permanent |
| `commerceCatalogHeads`, `commerceCatalogMediaAssets` (P09) | `networkId` | `parents: shopId` / `headId` (blobs) | `readableCatalogMapping` (`catalogAccess.ts:34`), `headBelongsToCurrentCatalog` | 50/page, 6 médias, 10 Mio | aucun (contenu collectif) | Tombes durables ; copies purgées au retrait |
| `commercialThreads`, `commercialMessages`, `commercialReadStates` (P10) | `networkId` | `owners: requesterPersonId / senderPersonId / personId` | `commercialThreadAccess` (`commercialMessaging/access.ts:72`), `liveMandate` (`:57`) | 20 messages/purge, 2 pièces avant acceptation | fil projeté au demandeur, ses messages à leur auteur | 90 j après fermeture/refus/blocage (`COMMERCIAL_RETENTION_MS`) |
| `commercialBlocks` (P10) | `networkId` | **P16 : `owners: requesterPersonId`** (était `personId`) | idem | 1/paire/côté | **P16 : au seul auteur du geste, sans identités** | Survit à la purge du fil jusqu'au déblocage |
| `shopContactMandates`, `shopContactSettings`, `commercialNetworkPolicies` (P10) | boutique/réseau | `owners: personId` / `shared` | mandat accepté, page vivante | équipe bornée | mandat à son titulaire | jusqu'à révocation |
| `shopCommerceBuyerSubjects`, `commercialCrmTransfers` (P10) | `networkId` | `owners: personId` | `liveConsent` (`crmTransport.ts:24`) relit session, fil, lien | 8 tentatives | transfert projeté ; sujet jamais | Retrait distant attendu avant effacement |
| `shopCheckoutPolicies`, `checkoutAttempts`, `checkoutRequests`, `checkoutClientIntentFences` (P11) | `networkId` | `shared` / `owners: personId` | `checkoutCatalogAuthority` (`checkoutFlow.ts:42`), `sameAuthority` (`:65`) | 10 lignes, 26/page | résumé et consentement seuls | Corps 30 min ; lignes jusqu'à effacement (aucune durée fixée) |
| `shopPaymentPolicies`, `shopPaymentOptions`, `shopPaymentAttempts`, `shopPaymentRequests` (P12) | `networkId` | `shared` / `owners: personId` | `paymentAuthority` (`paymentAccess.ts:27`) | 25/page | tentative et options projetées | Corps 30 min ; demandes/options supprimées |
| `shopPurchaseSnapshots`, `shopPurchaseRequests` (P13) | `networkId` | `owners: personId` | `purchaseAuthority` (`purchaseAccess.ts`) | 50 lignes lues | instantané projeté ; demandes jamais | Corps et messages masqués à 30 min |
| `commerceServicePolicies`, `commerceServiceRequests`, `commerceServiceCommands` (P14) | `networkId` | `shared` / `owners: personId` | `serviceCatalogAuthority` (`serviceAccess.ts:42`), `ownedServiceRequest` (`:107`) | 20 commandes/demande | demande et états, jamais octets/sujet | Corps 30 min ; close purgée à 90 j ; sans effet fermée à 7 j |
| `commerceJobPolicies`, `commerceJobHeads` (P15) | `networkId` | `shared` / `parents: shopId` | `readableJobMapping`, modération `commerceJob` | — | aucun | Clôture définitive, tombe de retrait |
| `commerceApplicationSubjects`, `commerceApplicationFiles`, `commerceApplications` (P15) | `networkId` | `owners: personId` (blobs compris) | `apply` (`networkMutation`), `deliverable` (`jobApplicationTransport.ts:82`, **P16**) | 3 pièces, 5 Mio, 5/poste | candidature et pièces projetées au candidat | `COMMERCE_JOBS_RETENTION = null` : aucune purge temporelle |

### 2.2 ANTSIA — fichiers et blobs

| Blob | Usage / garde de dépôt | Délivrance | Effacement |
|---|---|---|---|
| `shops.draftLogoStorageId` | `page_logo`, fraîcheur + admission | `servableUrl` | avec le brouillon ; devient le logo de la page à l'admission |
| `commerceCatalogMediaAssets.storageId` | copie des octets signés CATALOG-READ, FullAV | proxy `/catalogue/media/<jeton>` rejouant `publicAsset` (`federation/commerceCatalogMedia.ts:188`) avant et après lecture | purge par tranches au retrait ; orphelins (PA10) protégés par `by_storage` |
| `commercialMessages.attachmentFiles[]` | pièces après acceptation, garde existante | `servableUrl` sous `canReadCommercialMessage` | purge du fil (90 j) et effacement |
| `commerceApplicationFiles.storageId` | `job_application_document`, FullAV, analyse sans réseau ni nom | **jamais d'URL** ; octets exacts signés vers PRO.GA | retrait de pièce, retrait de candidature, effacement |

Limite partagée avec la messagerie personnelle : une URL de stockage déjà délivrée pour une pièce de
message reste valable jusqu'à la purge du blob. Le proxy média du catalogue, lui, ferme une ancienne URL
au retrait (`catalog.test.ts` « retrait %s retire slot et ancienne URL déjà émise »).

### 2.3 ANTSIA — projections

| Projection | Porte | Contenu exclu |
|---|---|---|
| Vitrine publique `public/shops.getStorefront` | `@publicProjection` ; consentement courant, origine, `root` explicite, modération publiée, administrateur vivant | signataires, contacts, identifiants internes, brouillon |
| Catalogue public `public/catalog.{list,offer,postOffer}` | même vitrine + mapping vivant + capacité `catalog` + modération `commerceOffer` | `linkRef`, SKU, stock, stockage |
| Emplois publics `public/jobs.{job,listForShop}` | même vitrine + capacité `jobs` + modération `commerceJob` | candidats, contacts, références internes |
| Projections membres (`shops/*`) | `networkQuery` et mêmes règles ; aucun privilège d'auteur | idem |
| Privées (préparations, paiements, achats, demandes, candidatures, fils) | personne propriétaire, session vivante pour toute action | octets signés, sujets opaques, sessions, baux |

### 2.4 ANTSIA — événements, avis et travaux

Événements entrants (inbox signée, réseau de l'émetteur) : `PRO-COMMERCE-PUBLIC-V1` (`shop.*`, `offer.*`,
`offer.availabilityChanged`, `job.*`), `PRO-COMMERCE-JOBS-V1`, `PRO-COMMERCE-TRANSPORT-TEST-V1` (sandbox).
Avis : `commercial_contact` (P10, sujet = fil, porte `notifyPerson`), `moderation_decision` (§3.11).
Crons commerce (`A/convex/crons.ts`) : `commercial-drain-crm`, `commercial-purge-closed`,
`commercial-revalidate-calls`, `checkout-purge-private-bodies`, `payment-purge-private-bodies`,
`purchase-purge-private-bodies`, `jobs-drain-applications`. Planifications : expiration des corps P14,
fermeture/purge des demandes P14, libération P11 après effacement, médias P09, livraisons P10/P15.

### 2.5 PRO.GA — tables commerce (52) et adaptations

Portée : `tenantId` **et** `structureId` sur toute ligne métier ; sujet opaque `(source, environnement,
subjectRef)` ; toute commande relit source, scope, liaison active, permission et **mandat vivant de son
auteur** (`serviceLinkMandateAllows`, `P/convex/modules/integrations/commerceServiceSeller.ts:47` ;
`catalogLinkAllowed`, `commerceCatalogue.ts:26`).

| Famille | Tables | Rétention constatée |
|---|---|---|
| Liaison/transport (P08) | `proCommerceSources`, `proCommerceTransportDestinations`, `proCommerceLinkChallenges`, `proCommerceLinks`, `proCommerceCommandReceipts`, `proCommerceNonces` | défis/reçus/nonces purgés (`commerceRetention.purgeExpiredArtifacts`) ; liaisons durables |
| Catalogue (P09) | `proCommerceCatalogRecovery`, `proCommerceCatalogHeads`, `proCommerceCatalogConsents`, `proCommerceCatalogSnapshots` (médias), `proCommerceCatalogReadReceipts` | reçus purgés ; snapshots/tombes durables |
| Contact/CRM (P10) | `proCommerceInquiries`, `proCommerceInquiryConsentDecisions`, `proCommerceInquiryConsentReceipts` | prospect minimisé au retrait ; reçus purgés |
| Préparation (P11) | `proCommerceCheckoutDecisions`, `proCommerceCheckoutControlReceipts`, `proCommerceCheckoutPolicies`, `proCommerceCheckouts`, `proCommerceCheckoutLines` | adresse/note expurgées 7 j après échéance (choix technique) ; décisions durables |
| Paiement (P12) | `proCommercePaymentStarts`, `…Decisions`, `…Readiness`, `…StartGrants`, `…ControlReceipts` ; `proCommercePaymentOperations`, `…Evidence`, `…Transactions`, `…Refunds` ; `proCommerceMarketplace{Platforms,Policies,SellerAcceptances,Bindings,Allocations,AllocationEvents}` | reçus/grants courts purgés ; preuves financières et anti-rejeu **sans durée fixée** |
| Achats (P13) | `proCommerceOrder{SellerActions,Actions,Cases,Receipts,Messages,CommandDecisions,ControlReceipts}` | texte de support masqué à 90 j (choix technique) ; décisions durables |
| Services (P14) | `proCommerceServiceDecisions`, `proCommerceQuoteAcceptances`, `proCommerceBookings`, `proCommerceServiceOrders`, `proCommerceServiceControlReceipts` | reçus purgés ; preuves d'acceptation et réservations durables |
| Emploi (P15) | `proCommerceJob{Consents,Heads,Snapshots}`, `proCommerceApplications`, `proCommerceApplicationAttachments` (blobs), `proCommerceApplicationControlReceipts` | copies effacées au retrait ; sinon `null` (aucune purge) |

Adaptations de tables existantes : `proAppointments` (source `antsia`, `replacesAppointmentId`),
`proOrders` (`sourceKind`, `commerce.{checkoutId,subjectRef,…}`), `proQuotes` (destinataire prospect),
`proJobApplications` (source `antsia`), stock (réservations sociales protégées), variantes (`businessRef`).

### 2.6 PRO.GA — blobs, événements, travaux

Blobs : médias d'offres (lus par ANTSIA via CATALOG-READ signé, jamais par URL) ; pièces de candidature
(`proCommerceApplicationAttachments`, lecture recruteur relue à chaque ouverture). Événements : outbox
`proIntegrationOutbox` (octets figés, profil ANTSIA) et événements métier privés. Crons : douze tâches
`pro-commerce-*` dont, **P16**, `pro-commerce-link-mandate-reconciliation` (`P/convex/crons.ts:176`).

### 2.7 Contrats

`PRO-COMMERCE-COMMAND-V1` et `-PUBLIC-V1` (P06, gelés) ; `-LINK-V1` (P08) ; `-TRANSPORT-TEST-V1` (P08) ;
`-CATALOG-READ-V1` (P09) ; `-INQUIRY-CONSENT-V1` (P10, retrait) ; `-CHECKOUT-CONTROL-V1` (P11) ;
`-PAYMENT-CONTROL-V1` (P12) ; `-ORDER-CONTROL-V1` (P13) ; `-SERVICE-CONTROL-V1` (P14) ; `-JOBS-V1`,
`-APPLICATION-CONTROL-V1`, `-APPLICATION-FILES-V1` (P15). Chacun a son profil HMAC, ses bornes et son
idempotence ; aucun n'est modifié par P16.

### 2.8 Couverture des inventaires et cliquets

| Contrôle | Constat | Suite |
|---|---|---|
| `dataPolicies` / `dataInventory` | 39/39 tables classées ; `commercialBlocks` mal classé (§7 C2) | corrigé, test écrit |
| `network-scoped-functions` | `shops` et `commercialMessaging` présents ; aucune fonction brute (`query`/`mutation`) dans ces modules | rien à faire |
| `rate-limited-writes` | `federation/commerceCatalogMediaHttp.ts#media` (`httpAction` de lecture) aurait été refusé | corrigé (§7 C1) |
| `operator-audit` | 10 `operatorMutation` commerce, toutes avec `appendAudit` | rien à faire |
| `file-delivery-gate` | aucun `getUrl` dans les modules commerce | rien à faire |
| `notification-payload-content`, `notifications-writer` | seul `commercial_contact` passe par `notifyPerson` ; avis de page neutres (§3.11) | rien à faire |
| `no-unbounded-collect`, `no-any-validators` | aucun `.collect()` ni validateur permissif dans les modules commerce | rien à faire |
| Journaux | aucun `console.*` dans les modules commerce des deux dépôts ; audits sans contenu privé | rien à faire |

## 3. Modération commerce — décisions formalisées

1. **Admission d'une vitrine déclarée.** Trois autorisations distinctes (préparer, publier, encaisser).
   Politique `closed` par défaut ; `review` : file d'admission opérateur motivée et auditée ; `auto_verified` :
   admission d'office du seul niveau d'adhésion `verifiee` lu au geste, jamais d'un badge. L'admission crée
   une page `company/community`, sans badge, jamais institution ni « Officiel ». Aucun encaissement ni mandat
   n'en découle (`deriveCommerceCapabilities` n'a aucune entrée badge).
2. **Secteurs restreints.** Aucune liste n'est inventée. **Décision proposée** : tant qu'une liste de
   secteurs restreints n'est pas validée (propriétaire/conseil), `auto_verified` ne doit pas être activée ;
   `review` reste la seule ouverture, l'opérateur refusant avec motif toute activité réglementée. Le code
   ne bloque pas `auto_verified` aujourd'hui (§10 D2).
3. **Usurpation.** Une institution ou une page « Officiel » ne porte jamais de boutique
   (`isShopEligiblePage`) ; un reflet fédéré n'est jamais une boutique ; le badge est calculé. Un nom
   trompeur relève du signalement de la page (identité et présentation de la boutique relues par la
   modération de la page) et de la file d'admission.
4. **Signalement.** Cibles commerce : `page` (identité/présentation), `commerceOffer`, `commerceJob`,
   `commercialMessage`. Le signalement exige la lecture réelle de la cible (`resolveVisibleTarget`) ;
   le déclarant n'est jamais révélé.
5. **Décision motivée.** Motif obligatoire (`assertDecisionReason`), audit `moderation.report_decide` ou
   `shop.*` ; un signataire de la page porteuse ne juge ni le dossier ni la relecture
   (`assertNoPageDecisionConflict`), **ni, depuis P16, le recours** (§7 C7).
6. **Recours.** Personnel : `fileAppeal` (réseau puis plateforme). Vitrine refusée : nouvelle demande.
   **Vitrine suspendue : aucune voie structurée** — la décision tient jusqu'au rétablissement opérateur
   (§10 D3). **Contenu porté par une page : recours ouvert depuis P16** (§3.11).
7. **Accès minimal du support.** La file d'admission montre nom, présentation, préparateur (nom, alias,
   adhésion) ; l'extrait de modération ne montre que la cible assignée (`reviewProjection.ts`) ; aucun
   opérateur ne lit conversations, achats, candidatures ou paiements dans ANTSIA. Chez PRO.GA, seul un
   administrateur plateforme autorise un remboursement, sous session vivante et audit.
8. **Badges.** Jamais un mandat vendeur, une capacité d'encaisser ni une fusion de comptes (COMMAND §2).
9. **Lecture anonyme.** Uniquement par les projections allowlistées §2.3 ; la porte des pages officielles
   n'est pas généralisée ; la messagerie personnelle n'est pas ouverte.
10. **Contenus privés.** Brouillons, signataires, clients, achats, CV et conversations restent hors de
    toute projection publique et de tout export d'un tiers (test `commerce-trust-data-policy.test.ts`).
11. **Contenus portés par une page (demande du coordinateur, signalée par DIASPORALE).** Décision : un
    dossier **sans propriétaire personnel** dont le contenu est porté par une page (offre et poste reflétés,
    réponse d'avis, évènement de page, missions/offres/ressources DIASPORALE portées par une page, page sans
    créateur) a pour destinataires et défenseurs les **signataires vivants** de cette page.
    - Avis : `moderation_decision` neutre (aucun acteur, aucun contenu ni motif dans la cloche) à chaque
      signataire vivant, après décision, relecture préalable et jugement de recours ; la porte
      `moderationNoticeRecipient` relit ce droit à l'envoi, à la livraison et à la lecture de la cloche.
    - Lecture : `moderation/cases.pageDecisions` (`networkQuery`, signataire vivant de la page dans son
      réseau) liste les décisions qui ont retiré un contenu de la page, avec l'état des recours.
    - Recours : `fileAppeal` **inchangé en signature** ; son droit interne (`ownsCase`) admet le signataire
      vivant de la page porteuse, comme il admettait déjà celui d'une page sans créateur.
    - Un signataire suspendu ne parle pour aucune page : ni avis, ni lecture, ni recours en son nom.
    - Interface ANTSIA : « Décisions visant mes pages » dans Mes données (pages du réseau racine).
      DIASPORALE peut réutiliser la même requête ; aucune de ses signatures n'est touchée.

## 4. Révocation — effet côté autorité et voie conservée

| Événement | Conversation (P10) | Préparation / paiement (P11–P12) | Service / RDV (P14) | Candidature (P15) | Asynchrone | Voie conservée |
|---|---|---|---|---|---|---|
| Mandat ANTSIA retiré (signataire/administrateur) | `liveMandate` refuse à chaque lecture/écriture ; appels fermés au passage suivant de `commercial-revalidate-calls` (cadence d'une minute, non mesurée) | `liveShopCommerceLink` → plus de catalogue lisible → refus | idem (`serviceCatalogAuthority`) | **P16** : premier envoi fermé (`deliverable`) | réponse tardive non appliquée (`sameAuthority`) | Acheteurs : suivi, annulation, remboursement par leurs propres engagements |
| Mandat PRO.GA perdu (affiliation, rôle, tâche) | — | commande refusée à destination (mandat relu) | refusée (`serviceLinkMandateAllows`) | refusée | **P16** : vitrine reflétée retirée au passage suivant de `reconcileLinkMandates` (cadence de quinze minutes, balayage enchaîné ; délai non mesuré) | engagements antérieurs servis à leur sujet |
| Liaison révoquée (ANTSIA) | CRM fermé | refus | refus | refus | aucune nouvelle commande signée | lecture et annulation des engagements existants |
| Consentement public de vitrine retiré | conversation encore lisible si la vitrine reste servable au réseau | catalogue fermé | fermé | fermé | proxy média fermé | — |
| Consentement CRM retiré | — | — | — | — | retrait signé, tombe PRO.GA ; ouvert même sans adhésion | Mes données |
| Retrait de candidature | — | — | — | contrôle privé, tombe si avant dépôt ; ouvert même sans adhésion | pièces révoquées | Mes candidatures |
| Suspension racine (personne) | refus (`livingMember`) | refus (`requireMembership`) | refus, **annulation impossible** | **P16** : premier envoi fermé ; retrait possible | réponses tardives non appliquées | Retrait CRM/candidature seulement ; **le reste à décider** (§10 D4) |
| Suspension du seul gérant / retrait de vitrine | conversation fermée (vitrine non servable) | nouvelle vente fermée | nouvel engagement fermé ; annulation conservée | fermé | — | P13 support et annulation par la commande |
| Effacement demandé | fils, transferts CRM retirés | libération tentée dans les cinq minutes de la demande, sinon expiration du hold (15 min) ; corps purgés ; **aucun ordre financier** | corps purgés, **rendez-vous non annulés chez PRO.GA** | retrait distant (8 tentatives) | aucune réponse tardive appliquée | annulation de l'effacement pendant 30 j |

**Constat P14 (rendez-vous après effacement) — décision.** Une annulation automatique n'est **pas sûre**
aujourd'hui : SERVICE-CONTROL exige un consentement d'annulation versionné (`commerce_booking_cancel`) et
une session revérifiée dans les cinq minutes ; la confirmation d'effacement n'est pas ce consentement et
l'effacement reste annulable 30 jours. Mesures prises : avertissement avant confirmation (« Rendez-vous à
venir… annulez-les d'abord depuis Mes demandes », §7 C5) ; voie de support : la personne annule
l'effacement, annule ses rendez-vous, puis redemande ; le professionnel garde la main sur son agenda.
Proposition au propriétaire (§10 D1) : activer `subject.erasure.request` (nom réservé COMMAND §6.10) par un
contrat privé jumeau, émis **à l'échéance** de la grâce, qui annule chez PRO.GA les rendez-vous futurs du
sujet (`cancelled_by_client`, motif `erasure`), expurge nom/note/adresse de ses copies non financières et
laisse intacts commandes, factures, preuves d'acceptation et pièces signées.

## 5. Données — retrait public, minimisation sociale, conservation transactionnelle

| Catégorie | Données | Responsable / finalité | Accès | Durée |
|---|---|---|---|---|
| Retrait public | vitrine, catalogue, emplois, médias | ANTSIA (diffusion consentie) | anonyme/membre par projections | immédiat au retrait ; tombes durables |
| Minimisation sociale | fils commerciaux, pièces, blocages, brouillons | ANTSIA (mise en relation) | participants | 90 j après clôture (choix technique P10) ; blocages jusqu'au déblocage |
| Corps techniques | octets signés, baux, options | ANTSIA (rejeu idempotent) | serveur | 30 min |
| Suivi privé ANTSIA | préparations, paiements, achats, demandes, candidatures | ANTSIA (suivi de la personne) | la personne | jusqu'à effacement ; services clos 90 j ; **aucune durée validée** |
| Transactionnel PRO.GA | commandes, preuves financières, acceptations, réservations, factures | PRO.GA / ANTSIA collecteur (obligations) | structure habilitée, sujet, admin plateforme | **non fixée** : à valider (§10 D5) ; jamais détruite ni réécrite par ANTSIA |

5.1 Aucune durée légale n'est inventée : 90 j, 30 min, 7 j sont des choix techniques déjà documentés par
leurs lots ; `COMMERCE_JOBS_RETENTION = null` reste nul. 5.2 Purge bornée partout (pages de 20–26).
5.3 Réconciliation des reflets : rattrapage manuel P09, reprise P15, **relecture des mandats P16** ;
un retrait en lettre morte exige un rejeu opérateur (à surveiller). 5.4 PRO.GA n'a pas de pipeline général
d'export/effacement : un sujet effacé chez ANTSIA devient un pseudonyme orphelin ; nom de candidat, note de
rendez-vous, adresse expirée suivent les seules purges de leurs lots (§10 D1). 5.5 Aucune pièce signée
n'est réécrite ; aucune facture n'est détruite.

## 6. Matrice menace → garde → test → preuve

| Menace | Garde | Test (écrit) | Preuve |
|---|---|---|---|
| Lecture d'une boutique d'un autre réseau | `isStorefrontInReadingContext`, origine `root` explicite | `shops.test.ts` « exige le geste root de l'origine enfant… » | aucune exécutée |
| Lecture anonyme d'un brouillon/signataire | `publicStorefrontPage`, DTO allowlisté | `shops.test.ts` « projette seulement la présentation autorisée… » | aucune exécutée |
| Export/effacement par un tiers d'une ligne commerciale | `exportableRecord`, `directlyOwned` | `commerce-trust-data-policy.test.ts` (39 tables) | aucune exécutée |
| Mandat ANTSIA révoqué pendant une conversation | `liveMandate` | `commercialMessaging.test.ts` « referme lecture et écriture après retrait du mandat… » | aucune exécutée |
| Mandat révoqué pendant une préparation | `sameAuthority` après HTTP | `checkout.test.ts` « révocation de rôle pendant HTTP… » | aucune exécutée |
| Mandat révoqué avant l'envoi d'une candidature | `deliverable` + `liveShopCommerceLink` | `jobApplications.test.ts` P16 « mandat de l'auteur du lien retiré… » | aucune exécutée |
| Mandat PRO.GA perdu sans écrivain | `reconcileLinkMandates` | P/`commerceCatalogue.test.ts` P16 (3 cas) | aucune exécutée |
| Membre suspendu après son clic de candidature | `memberHasStatus` dans `deliverable` | `jobApplications.test.ts` P16 « candidat suspendu… » | aucune exécutée |
| Ancien lien média après retrait | proxy rejouant `publicAsset` | `catalog.test.ts` « retrait %s retire slot et ancienne URL déjà émise » | aucune exécutée |
| Signature ou environnement invalides | inbox HMAC, profils PRO.GA | `commerceTransport.test.ts` « contrat non autorisé et signature incorrecte… » ; P/`commerceLinks.test.ts` « refuse nonce rejoué, mauvaise signature… » | aucune exécutée |
| Rejeu et conflit d'idempotence | octets persistés, clés durables | `services.test.ts` « même clé et même intention… » ; P/`commerceServices.test.ts` « même clé + mêmes octets… » | aucune exécutée |
| Prix modifié avant paiement | `reconfirm_required` | P/`commerceCheckout.test.ts` « prix/révision différents… » | aucune exécutée |
| Dernier stock concurrent | réservation atomique | P/`commerceCheckout.test.ts` « le dernier article n'est réservé qu'une fois… » | aucune exécutée |
| Retrait pendant paiement | `paymentAuthority`, statut privé conservé | `paymentFlow.test.ts` « un retrait pendant le HTTP invalide le retour… » | aucune exécutée |
| Callback tardif après expiration | rapprochement, revue, remboursement demandé | P/`commercePayments.test.ts` « succès après expiration appelle rapprochement… » | aucune exécutée |
| Faux succès par retour navigateur | statut corrélé seul | `paymentFlow.test.ts` « la lecture au retour navigateur ne règle rien… » | aucune exécutée |
| Autre acheteur lit un achat | sujet + personne | `purchase.test.ts` « un autre acheteur ne lit ni ne rafraîchit… » | aucune exécutée |
| Double rendez-vous sur un créneau | réservation atomique PRO.GA | `services.test.ts` « deux clients, même créneau… » | aucune exécutée |
| Fuite dans journaux/push | audits sans contenu, avis neutres | `services.test.ts` « aucun contenu privé dans le journal… » ; cliquet `notification-payload-content` ; P16 « avis neutre… » | aucune exécutée |
| Harceleur débloqué par l'effacement d'un membre d'équipe | `commercialBlocks` suit le demandeur | `commerce-trust-data-policy.test.ts` « l'effacement du membre d'équipe ne lève pas le blocage… » | aucune exécutée |
| Contenu de page retiré sans destinataire ni recours | `notifyPageCase`, `ownsCase`, `pageDecisions` | `jobApplications.test.ts` P16 (3 cas modération) | aucune exécutée |
| Rendez-vous oublié à l'effacement | avertissement Mes données | `serviceErasureNotice.test.ts` | aucune exécutée |
| Écriture HTTP non admise | cliquet `rate-limited-writes` | cas « P16 : une lecture HTTP nominative… » | aucune exécutée |

## 7. Corrections réalisées (fichier par fichier)

- **C1** `A/tests/ratchets/rate-limited-writes.test.ts` : liste nominative `READ_ONLY_HTTP_ACTIONS`
  (proxy média P09), acceptée seulement si le gestionnaire vient de `_generated/server` et ne porte
  aucun effet (écriture, stockage, planification) ; « test du test » associé.
- **C2** `A/convex/modules/people/dataPolicies.ts` : `commercialBlocks` suit `requesterPersonId` (le
  blocage posé par un membre d'équipe survit à son effacement, sa référence est anonymisée) ;
  `A/convex/modules/people/dataInventory.ts` : export d'un blocage au seul auteur du geste, sans
  `personId` ni `requesterPersonId`.
- **C3** `A/convex/modules/shops/jobApplicationTransport.ts` (`deliverable`) : `memberHasStatus(…,
  "declaree")` avant le premier envoi ; une suspension (réseau, racine, sanction globale) ou un départ
  ferment l'envoi sans octets restants.
- **C4** `P/convex/modules/integrations/commerceCatalogueRecovery.ts` (`reconcileLinkMandates`) et
  `P/convex/crons.ts` : balayage borné (20 liaisons, curseur durable, enchaînement puis repos 15 min) ;
  une liaison qui publie encore et dont l'auteur a perdu son mandat planifie `refreshStructure`
  (retrait `shop.withdrawn`, puis offres et emplois) ; configuration absente : rien n'est retiré.
- **C5** `A/convex/modules/shops/serviceLifecycle.ts` (`myUpcomingBookings`, `personQuery @selfScoped`,
  100 lignes lues) ; `A/apps/antsia_ga/src/components/erasure-commerce-notice.tsx` (nouveau) monté dans
  la carte d'effacement de `personal-controls.tsx` ; clés `personal.eraseBookings*` FR/EN.
- **C6** `A/convex/modules/moderation/policy.ts` (`owningPageOfReport`) ;
  `A/convex/modules/notifications/policy.ts` (`moderationNoticeRecipient` admet le signataire vivant de la
  page porteuse) ; `A/convex/modules/moderation/cases.ts` (`notifyPageCase` après décision, relecture et
  recours ; `ownsCase` étendu ; `pageDecisions`) ;
  `A/apps/antsia_ga/src/components/page-moderation-decisions.tsx` (nouveau) monté dans Mes données ;
  clés `personal.pageDecisions*` FR/EN.
- **C7** `A/convex/modules/moderation/cases.ts` (`decideAppeal`) : `assertNoPageDecisionConflict` — un
  signataire de la page porteuse ne juge pas son recours.

Fichiers partagés modifiés par ancres uniques relues juste avant : `dataPolicies.ts` et `dataInventory.ts`
(hors blocs DIASPORALE), `moderation/{policy,cases}.ts`, `notifications/policy.ts`, `personal-controls.tsx`,
`antsia.json` FR/EN, `P/convex/crons.ts`. Aucun fichier `diaspora/**`, `.env*`, `package.json`,
`bun.lock`, `_generated`, primitive UI, pont de session, manifeste P06 ni contrat jumeau modifié.

## 8. Tests négatifs écrits (non exécutés)

- `A/convex/modules/people/commerce-trust-data-policy.test.ts` : 39 tables présentes et classées ; aucune
  table commerciale hors revue ; tiers sans export ni effacement ; réponse de boutique hors du demandeur ;
  blocage anonymisé, suivant le demandeur, exporté au seul auteur.
- `A/convex/modules/shops/jobApplications.test.ts`, bloc P16 : suspension racine et mandat retiré entre
  clic et envoi ; avis neutre au seul signataire vivant, lecture et recours refusés à un tiers ; signataire
  suspendu sans avis ni recours ; modérateur signataire écarté de la décision.
- `A/convex/modules/shops/serviceErasureNotice.test.ts` : seuls SES rendez-vous tenus et à venir ;
  lisible pendant le délai de grâce.
- `A/tests/ratchets/rate-limited-writes.test.ts` : lecture HTTP nominative ; stockage, mutation,
  planification, autre nom ou autre provenance refusés.
- `P/convex/modules/integrations/commerceCatalogue.test.ts`, bloc P16 : mandat vivant sans effet ;
  affiliation suspendue → rafraîchissement puis `shop.withdrawn` ; pas de travail répété ; configuration
  absente sans retrait.

## 9. Défauts de compilation et écarts relevés (non corrigés)

1. `CommerceResult<T>` à **un** paramètre alors que `CommerceResult<T, R extends string>` en exige deux :
   `A/packages/social-domain/src/commerce-checkout.ts:47` et `:98`, et la copie jumelle
   `P/packages/pro-domain/src/commerce-checkout.ts:47` et `:98` (TS2314 probable). Correction jumelle et
   empreinte à arbitrer par le coordinateur.
2. `P/convex/http.ts:7`, `:15`, `:16` importent `./modules/…` : le test `P/convex/tests/domainBoundary.test.ts`
   (« hors modules, seul schema.ts importe les tables des modules ») devrait échouer.
3. `A/convex/modules/federation/agentConsentTransfer.ts#transfer` (PA9C, hors périmètre) est un
   `httpAction` absent de `SYSTEM_HTTP_ADMISSIONS` : le cliquet `rate-limited-writes` devrait encore le
   refuser (admission par `redeem` à déclarer par sa session).
4. Contrat vs pratique : les consultations `request.status` de fond (P10 `crmTransport.ts`, P15
   `statusJob`) déclarent `authVerifiedAt: now` sans relecture de session ; sans effet métier, mais
   l'attribut ne décrit pas ce que COMMAND §5 promet.
5. `A/packages/social-domain/src/commerce/compatibility.test.ts` affirme encore PUBLIC-V1 non implémenté
   côté ANTSIA (relevé P15), test gelé à arbitrer.
6. Les nouvelles références d'API (`pageDecisions`, `myUpcomingBookings`) vivent dans des modules déjà
   présents dans `_generated/api.d.ts` ; elles restent à confirmer par la génération normale.

## 10. Décisions restantes du propriétaire

- **D1** Effacement ↔ PRO.GA : activer `subject.erasure.request` (contrat jumeau, échéance de grâce,
  annulation des rendez-vous futurs, expurgation des copies non financières) ou s'en tenir à
  l'avertissement et à la voie de support.
- **D2** Secteurs restreints : liste et grille d'admission ; d'ici là, ne pas activer `auto_verified`.
- **D3** Recours contre une suspension de vitrine : voie structurée (motif, délai, second regard).
- **D4** Membre suspendu : voie habilitée pour SES engagements (annuler un rendez-vous, demander
  l'annulation ou le remboursement d'un achat), comme le retrait CRM et de candidature, ou support seul.
- **D5** Durées de conservation : preuves financières et anti-rejeu PRO.GA, suivis privés ANTSIA
  (préparations, paiements, achats), candidatures (`null`), avec un conseil compétent.
- **D6** Consentement de diffusion publique d'une vitrine : survit-il à l'effacement ou au départ de son
  signataire (aujourd'hui oui, au nom de la boutique) ?
- **D7** Recours de page déposé par un signataire ensuite effacé : la ligne `appeals` suit sa personne et
  disparaît ; un autre signataire peut le redéposer. Faut-il le rattacher à la page ?
- **D8** Révocation de liaison initiée par ANTSIA : elle reste locale (`link.revoke` réservé, COMMAND
  §6.10). ANTSIA ne signe plus aucune commande et refuse les reflets de cette liaison, mais PRO.GA
  garde la liaison active et peut continuer d'émettre des reflets refusés (bruit de lettres mortes).
  Activer `link.revoke` par contrat privé, ou accepter ce comportement documenté.

## 11. Activation, retour arrière et limites

Activation : aucune. Les politiques commerce restent fermées ; la relecture des mandats ne retire que
des vitrines déjà publiées dont l'auteur a perdu son mandat, et seulement avec un environnement commerce
configuré. Retour arrière : retirer la ligne de cron PRO.GA (C4) ; rétablir `owners: ["personId"]` pour
`commercialBlocks` (C2) ; retirer la ligne de `deliverable` (C3), les deux composants et leurs clés (C5,
C6) ; restaurer `ownsCase` (C6) ; aucune donnée à migrer ni supprimer. Recette à faire : effacement d'un
membre d'équipe ayant bloqué, candidature d'un suspendu, perte d'affiliation PRO.GA visible côté ANTSIA,
avis et recours d'une page sur offre/poste/réponse, avertissement de rendez-vous, puis génération et
`verify` sur sources figées. Limites : aucune exécution ; UI « Décisions visant mes pages » limitée aux
pages du réseau racine ; avertissement borné aux cent demandes les plus récentes ; PRO.GA sans pipeline
général d'effacement ; URL de pièces de messages valables jusqu'à purge.
