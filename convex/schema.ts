import { paymentTables } from "./modules/shops/paymentTables"
import { purchaseTables } from "./modules/shops/purchaseTables"
import { defineSchema } from "convex/server"

import { albumsTables } from "./modules/albums/tables"
import { commercialMessagingTables } from "./modules/commercialMessaging/tables"
import { commercialCrmTables } from "./modules/commercialMessaging/crmTables"
import { contextualMessagingTables } from "./modules/contextualMessaging/tables"
import { callsTables } from "./modules/calls/tables"
import { diasporaTables } from "./modules/diaspora/tables"
import { engagementTables } from "./modules/engagement/tables"
import { eventsTables } from "./modules/events/tables"
import { federationTables } from "./modules/federation/tables"
import { commerceTransportTables } from "./modules/federation/commerceTransportTables"
import { filesTables } from "./modules/files/tables"
import { graphTables } from "./modules/graph/tables"
import { groupsTables } from "./modules/groups/tables"
import { liveTables } from "./modules/live/tables"
import { marksTables } from "./modules/marks/tables"
import { messagingTables } from "./modules/messaging/tables"
import { moderationTables } from "./modules/moderation/tables"
import { networksTables } from "./modules/networks/tables"
import { notificationsTables } from "./modules/notifications/tables"
import { pagesTables } from "./modules/pages/tables"
import { dataTables } from "./modules/people/dataTables"
import { peopleTables } from "./modules/people/tables"
import { platformTables } from "./modules/platform/tables"
import { consoleTables } from "./modules/platform/consoleTables"
import { operationalTables } from "./modules/platform/operationalTables"
import { postsTables } from "./modules/posts/tables"
import { feedTables } from "./modules/posts/feedTables"
import { publicTables } from "./modules/public/tables"
import { editorialTables } from "./modules/editorial/tables"
import { editorialAssetTables } from "./modules/editorial/assetTables"
import { editorialSocialTables } from "./modules/editorial/socialTables"
import { professionalsTables } from "./modules/professionals/tables"
import { shopsTables } from "./modules/shops/tables"
import { commerceLinkTables } from "./modules/shops/commerceLinkTables"
import { catalogTables } from "./modules/shops/catalogTables"
import { checkoutTables } from "./modules/shops/checkoutTables"
import { storiesTables } from "./modules/stories/tables"
import { suggestionsTables } from "./modules/suggestions/tables"
import { thematicGroupsTables } from "./modules/thematicGroups/tables"

/**
 * Schéma du moteur social national ANTSIA — agrégat des tranches verticales
 * (`convex/modules/<module>/tables.ts`).
 *
 * Fondations multi-réseaux (PA2) d'abord : réseaux, personnes, liens
 * d'identité, adhésions, facettes, consentements, opérateurs. Les modules
 * dupliqués du socle (PA3) s'y ajoutent, chacun avec `networkId`. Les
 * tranches d'application (`NETWORK_SLICES` : `modules/diaspora`, écrite par la
 * session DIASPORALE) aussi.
 *
 * `schemaValidation: true` est NON NÉGOCIABLE (le socle l'a désactivée, ce qui
 * laissait les validateurs de tables sans effet à l'exécution — annexe A §0.4).
 * Fichier partagé avec la session DIASPORALE : modifié par la session ANTSIA
 * seulement, sur demande.
 */
export default defineSchema(
  {
    ...networksTables,
    ...peopleTables,
    ...dataTables,
    ...platformTables,
    ...consoleTables,
    ...operationalTables,
    ...postsTables,
    ...feedTables,
    ...publicTables,
    ...professionalsTables,
    ...editorialTables,
    ...editorialAssetTables,
    ...editorialSocialTables,
    ...engagementTables,
    ...filesTables,
    ...federationTables,
    ...commerceTransportTables,
    ...graphTables,
    ...notificationsTables,
    ...thematicGroupsTables,
    ...messagingTables,
    ...commercialMessagingTables,
    ...commercialCrmTables,
    // Conversations contextuelles (CC-2b, ADR-0025) : tables à préfixe réservé `contextual`.
    ...contextualMessagingTables,
    ...groupsTables,
    ...eventsTables,
    ...storiesTables,
    ...suggestionsTables,
    ...pagesTables,
    ...albumsTables,
    ...callsTables,
    ...liveTables,
    ...marksTables,
    ...moderationTables,
    ...shopsTables,
    ...commerceLinkTables,
    ...catalogTables,
    ...checkoutTables,
    ...paymentTables,
    ...purchaseTables,
    ...diasporaTables,
  },
  { schemaValidation: true },
)
