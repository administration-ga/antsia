# P14 — Services, devis et rendez-vous

Date : 18 octobre 2026. **Verdict : sources raccordées ; tests écrits, non exécutés ; recette ouverte.**

> Reprise du 20 octobre : voir le [bilan daté](P14_REPRISE_2026-10-20.md) pour les corrections
> des intentions perdues, des sessions de renvoi, de l’expiration des retenues et du suivi des
> engagements. Le présent rapport conserve l’état historique du lot initial ; il ne décrit pas
> une validation des changements ultérieurs.

Décision du propriétaire (18/10/2026, ~22 h) : « Continuer sans vérifier ». Aucun codegen, test,
typage, lint, build, serveur, navigateur, commande Convex ni installation n'a été lancé dans les
deux dépôts. Tous les tests cités sont **écrits, non exécutés** ; aucun résultat n'est annoncé.

## Bilan standard

| Champ | Contenu |
|---|---|
| Résultat | Trois parcours explicites depuis une offre de **service** publiée (P09) : **demande de devis** (`inquiry.submit` P06, kind `quote_request`, depuis la conversation commerciale P10 acceptée : besoin, contraintes, date souhaitée, quantité, nombre de pièces admises choisies), **rendez-vous** (`booking.request` P06 sur un créneau libre servi par l'agenda PRO.GA, instant UTC + `Africa/Libreville`) et **prestation à tarif fixe** sans créneau (extension `service.order.request`, aucune réserve de stock). Acceptation versionnée d'un devis (`quote.accept`), changement et annulation d'un rendez-vous (extensions fermées), consultation après réponse perdue. « Mes demandes » depuis Profil ; rubrique et onglet **Services** de Découvrir servis seulement avec de vraies offres de service publiées ; politique réseau fermée par défaut, ouverte par la console. Aucun paiement ni acompte. |
| Source | ANTSIA `9eaff40` (`codex/pa4-identite-session`), PRO.GA `9497f22` (`feat/antsia-social-commerce`) ; changements P14 non commités dans des arbres partagés. Inventaires ci-dessous. |
| Tests | Écrits, non exécutés : `packages/social-domain/src/{commerce-services,serviceTime}.test.ts`, `convex/modules/shops/services.test.ts`, `apps/antsia_ga/src/components/services/service-model.test.ts`, `apps/antsia_ga/src/lib/service-routes.test.ts`, tests Découvrir et Profil mis à jour ; PRO.GA `packages/pro-domain/tests/commerce-services.test.ts`, `convex/modules/integrations/commerceServices.test.ts`. |
| Recette | Ouverte (étape 6 du prompt) : client ANTSIA et professionnel PRO.GA, devis précis accepté, créneau unique disputé par deux clients, modification puis annulation, réponse perdue ; téléphone et bureau, FR/EN, clavier et lecteur d'écran. Aucune capture. |
| Dépendances | Codegen et `verify` des deux dépôts ; configuration propriétaire (scopes de la source, permissions de liaison, prestations de l'agenda rattachées à l'offre et publiées, politique Services ouverte) ; décision de conservation ; recette sandbox croisée. |
| Retour arrière | Fermer la politique Services du réseau (console) : plus aucun nouveau devis, rendez-vous ni prestation ; les engagements existants restent lisibles et annulables. Côté PRO.GA, retirer les permissions `receive_bookings`/`receive_orders` ou les scopes de la source. Ne supprimer ni rendez-vous, ni commande, ni preuve d'acceptation. |
| Limites | Voir « Limites ». |

## Décisions

1. **Contrat jumeau** `packages/social-domain/src/commerce-services.ts` = `PRO_GA/packages/pro-domain/src/commerce-services.ts`
   (octets identiques, SHA-256 `cb8f418c…38de6c`, testée dans les deux dépôts) : PRO-COMMERCE-SERVICE-CONTROL-V1
   ([contrat](../../../contrats/PRO-COMMERCE-SERVICE-CONTROL-V1.md)). Le manifeste P06 gelé n'est pas touché ; les trois
   extensions **fermées** (`booking.reschedule.request`, `booking.cancel.request`, `service.order.request`) ont été écrites
   dans le contrat avant leur code ; le nom réservé P06 `booking.cancel` reste refusé. Profil de signature propre.
2. **Tarif fixe sans créneau** : le chemin P11 (`checkout.prepare`) réserve un stock physique, inadapté à une prestation ;
   l'extension crée une commande PRO.GA `sourceKind:"commerce_service"` au prix et à la révision attendus
   (`reconfirm_required` sinon), sans stock ni paiement.
3. **Devis** : la demande part d'une conversation P10 **acceptée** par la boutique (aucun contournement de sa garde). P06
   n'ayant pas de champ « pièces » pour une demande, les pièces choisies restent dans la conversation (garde des fichiers,
   modération) et seul leur **nombre** est transmis (trois au plus, mes propres messages admis et servables). Aucun nom n'est
   ajouté : la conversation identifie déjà la personne. L'acceptation porte la version et le total **exacts** affichés ;
   une révision exige un nouvel accord ; PRO.GA conserve la preuve du client à part (un employé qui marque « accepté » ne la
   remplace pas) et crée au plus une commande.
4. **Rendez-vous** : réservation atomique par les fonctions de l'agenda public ; créneau **retenu** (`requested`,
   `holdExpiresAt`) ≠ confirmation du professionnel ≠ paiement (indisponible, `deposit:"unavailable"`). Conséquences
   (changement jusqu'au préavis, annulation jusqu'au début, confirmation exigée) servies par PRO.GA et affichées avant
   chaque accord. Un changement refusé ne modifie rien ; un rendez-vous confirmé reste tenu jusqu'à la confirmation de son
   remplaçant, qui le libère alors ; une annulation retire aussi un remplacement en attente. La révision servie croît
   strictement.
5. **Idempotence et réponse perdue** : octets exacts persistés (30 min au plus), clé d'intention client
   (`clientRequestId` + empreinte de l'intention : même intention = même demande, autre = refus), bail de 30 s ; une seule
   intention en vol par demande, vingt commandes au plus. Après un délai : `request.status` / `action.status` d'abord, puis
   les **mêmes octets** tant que la demande peut s'exécuter, jamais un nouvel identifiant ; inconnue au-delà de
   l'expiration + 5 min → expirée (une demande dont c'était la première commande est close en échec). La consultation exige la même personne vivante, **pas la même
   session** (amélioration par rapport à P11 : une reconnexion ne laisse pas une demande inconnue pour toujours).
6. **Fuseaux** : le contrat ne porte que des instants UTC et le fuseau de l'agenda ; l'affichage nomme toujours le fuseau
   (agenda, et appareil s'il diffère). Le saut à une date précise passe par `serviceTime.wallTimeInstants` : une heure
   inexistante (passage à l'heure d'été) est refusée et nommée, une heure répétée propose ses deux instants départagés par
   leur décalage — jamais deviné.
7. **Noms de personne** : aucun nom libre. Pour un rendez-vous ou une prestation, prénom(s) et NOM **facultatifs et
   structurés**, normalisés côté client et côté serveur par le normaliseur partagé (`normalizeCivilName` : NOM en capitales,
   Prénom capitalisé, accents et tirets conservés) avant d'être transmis « Prénom NOM ». Sans nom, PRO.GA voit seulement
   la source ANTSIA.
8. **Politique** `commerceServicePolicies` fermée par défaut (réseau de lecture ET réseau de la boutique), décision
   opérateur avec motif et audit `service.policy_set` (console `ServicePolicy`). La fermeture n'empêche ni la lecture ni
   l'annulation d'un engagement existant.
9. **Données** : tables privées `commerceService{Policies,Requests,Commands}` (`shops/serviceTables.ts`). Aucun texte privé
   conservé hors des corps transitoires (besoin, note, nom). Export : demande, états servis, consentements et références,
   jamais octets signés, session, sujet opaque, liaison, empreinte ni bail. Effacement : corps et baux expurgés dès la
   demande, intention en vol close (aucune réponse tardive appliquée), lignes supprimées par l'effacement générique
   (propriétaire `personId`). Une demande close est purgée après 90 jours (choix technique, pas une durée légale) ; une
   demande sans effet se ferme après 7 jours ; une demande active sans nouvelle depuis 90 jours se ferme.
10. **Placement** : surfaces dans `apps/antsia_ga/src/components/services/` (précédent P11–P13 ; le prompt proposait
    `packages/social-features/src/features/services/` « à confirmer »). Onglet Services piloté par les données, comme
    l'onglet Emplois de P15 (`DiscoverData.services`). Aucune nouvelle surface publique : la rubrique Services reprend la
    projection P09 déjà modérée (`commerceOffer`) ; aucune cible de modération ajoutée.
11. **Débits** : `shop.service.{configure,read,request,book,order,accept,change,status}` (valeurs de départ) côté ANTSIA ;
    `commerceService{Control,Action}`, `commerceBookingRequest`, `commerceQuoteAccept` côté PRO.GA, plus trois rendez-vous
    actifs au plus par sujet et par structure.

## Inventaire ANTSIA

Créés : `packages/social-domain/src/{commerce-services,commerce-services.test,serviceTime,serviceTime.test}.ts` ;
`convex/modules/shops/{serviceRules,serviceTables,serviceClient,serviceAccess,serviceFlow,serviceActions,services,servicePolicy,serviceLifecycle}.ts`,
`services.test.ts` ;
`apps/antsia_ga/src/components/services/{service-model.ts,service-model.test.ts,service-offer-actions.tsx,service-quote-request-screen.tsx,service-slot-picker.tsx,service-booking-screen.tsx,service-order-screen.tsx,service-requests-screen.tsx,service-request-panels.tsx,member-service-directory.tsx}` ;
`apps/antsia_ga/src/lib/service-routes.test.ts` ;
pages `app/(membre)/mes-demandes/page.tsx`, `app/(membre)/mes-demandes/[requestId]/page.tsx`,
`app/(membre)/boutique/[handle]/{devis,rendez-vous,prestation}/[offerRef]/page.tsx` ;
`apps/antsia_ga/src/i18n/locales/{fr,en}/services.json` ; `apps/admin_antsia_ga/src/components/console-service-policy.tsx` ;
`docs/contrats/PRO-COMMERCE-SERVICE-CONTROL-V1.md`, ce rapport.

Modifiés par ancres ciblées : `packages/social-domain/src/audit.ts` (`service.policy_set`) ;
`convex/modules/shops/tables.ts` (`...serviceTables`) ; `convex/lib/rateLimit.ts` (`shop.service.*`, hors bloc DIASPORALE) ;
`convex/modules/people/{dataPolicies,dataInventory,erasure}.ts` (hors blocs DIASPORALE) ;
`apps/antsia_ga/src/{i18n/resources.ts,lib/routes.ts}` ; `components/shops/catalog-member-screen.tsx` (actions de service
pour une offre `service`, panier et préparation P11 réservés aux produits) ;
`components/discovery/{discover-model.ts,discover-model.test.ts,discover-screen.tsx,discover-screen.test.tsx}` (fusionnés
avec P15) ; `app/(membre)/moi/{me-model.ts,me-model.test.ts}` ;
`apps/admin_antsia_ga/src/{components/console-pages.tsx,i18n/locales/{fr,en}/operations.json}`.

Non touchés : `convex/schema.ts` (les tables passent par `shops/tables.ts`), `convex/crons.ts` (planification par
`scheduler`), `convex/modules/diaspora/**`, manifeste P06 `commerce/**`, `package.json`, `bun.lock`, `_generated`,
primitives UI, pont de session, `.env*`, cibles de modération. Le cliquet `network-scoped-functions` couvre déjà
`convex/modules/shops` (aucun ajout requis).

## Inventaire PRO.GA

Voir `PRO_GA/docs/25_P14_SERVICES_ANTSIA.md`. Créés : `packages/pro-domain/src/commerce-services.ts`,
`packages/pro-domain/tests/commerce-services.test.ts`, `convex/modules/agenda/commerceBookings.ts`,
`convex/modules/integrations/{commerceServiceTables,commerceServiceSeller,commerceServiceBookings,commerceServiceQuotes,commerceServiceOrders,commerceServiceDecisions,commerceServiceControl}.ts`,
`commerceServices.test.ts`, `docs/25_P14_SERVICES_ANTSIA.md`. Modifiés par ancres ciblées :
`packages/pro-domain/src/index.ts`, `convex/modules/agenda/{tables,availability,appointments}.ts`,
`convex/modules/quotes/tables.ts`, `convex/modules/orders/tables.ts`,
`convex/modules/integrations/{tables,commerceInquiry,commerceCommands}.ts`, `convex/lib/pro/rateLimits.ts`,
`convex/http.ts` (neuf routes), `convex/crons.ts` (une tâche), `packages/pro-features/src/features/agenda/shared.ts`.

## Configuration propriétaire requise

- ANTSIA : configuration commerce existante (P08) ; ouvrir la politique Services du réseau dans la console, après recette.
- PRO.GA : scopes de la source `antsia` (`commerce.booking.request`, `commerce.quote.accept`, `commerce.inquiry.submit`,
  `commerce.checkout.prepare`, `commerce.request.status`) ; permissions de liaison accordées par le vendeur ; prestations de
  l'agenda rattachées à l'offre et publiées ; décision d'auto-confirmation par prestation.
- Conservation : durées des décisions durables et des preuves d'acceptation à valider (aucune durée légale inventée).

## Limites

- **Rien n'a été exécuté** : ni codegen (les références `api.modules.shops.service*` de l'interface dépendent du code généré),
  ni typage, ni tests, ni lint, ni build, ni navigateur. Des erreurs de compilation restent possibles.
- Pas de notification (cloche) pour un devis reçu, un rendez-vous confirmé ou un créneau expiré : la personne actualise
  « Mes demandes ». L'expiration d'un créneau retenu n'est apprise qu'à la relecture.
- L'état d'une commande issue d'un devis ou d'une prestation n'est relu que par la consultation de la commande qui l'a
  ouverte (`request.status` / `action.status`) ; ces commandes n'apparaissent pas dans « Mes achats » (P13).
- Un effacement de compte n'annule pas les rendez-vous chez PRO.GA (aucun ordre distant sans geste de la personne pendant
  le délai de grâce) ; le sujet opaque et les corps privés sont révoqués côté ANTSIA.
- Côté PRO.GA, aucun écran nouveau : les rendez-vous ANTSIA apparaissent dans l'agenda (libellé de source) ; la preuve
  d'acceptation du client et le libellé `commerce_service` des commandes ne sont pas encore affichés dans les tableaux.
- Fuseau d'agenda unique `Africa/Libreville` (contrat V1) ; débits et durées de départ, non mesurés.
- Défauts observés hors périmètre (non corrigés) : `CommerceResult<T>` à un seul paramètre dans `commerce-checkout.ts` ;
  imports `./modules/...` de `convex/http.ts` PRO.GA à confronter au test de frontière des domaines.
