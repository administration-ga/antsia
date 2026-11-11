/**
 * Tâches planifiées du moteur.
 *
 * Chaque tâche est un passage BORNÉ qui se poursuit par chaîne paginée
 * (jamais un balayage complet dans une transaction). Les passages des modules
 * dupliqués du socle (saisie, stories, présence, appels, direct, fichiers)
 * s'ajoutent ici avec leur module (owner map `docs/02` §4.2, lot 17).
 */
import { cronJobs } from "convex/server"

import { internal } from "./_generated/api"

const crons = cronJobs()

// Tranche DIASPORALE (session DIASPORALE, PD1) : compteurs matérialisés des hubs
// pays. Sans réseau `diasporale` gouverné par la tranche, le passage ne fait rien.
crons.daily("compteurs des hubs DIASPORALE", { hourUTC: 2, minuteUTC: 30 }, internal.modules.diaspora.hubs.refreshHubCounters, {})
// Tranche DIASPORALE (plan global, lignes déléguées par ANTSIA le 18/10/2026) : demandes de
// service et de mentorat échues passées « expirées », par lots bornés ; la suite au passage suivant.
crons.interval("diaspora-service-requests-expiry", { minutes: 15 }, internal.modules.diaspora.serviceRequests.expireDueServiceRequests, {})
crons.interval("diaspora-mentoring-requests-expiry", { hours: 1 }, internal.modules.diaspora.mentoring.expireDueMentoringRequests, {})
// Mesure du pilote DIASPORALE : agrégats nocturnes, après les compteurs des hubs (chaîne paginée bornée).
crons.daily("diaspora-pilot-metrics", { hourUTC: 2, minuteUTC: 50 }, internal.modules.diaspora.pilotMetrics.refreshPilotMetrics, {})
// Offres d'emploi DIASPORALE dont la date limite est passée : clôture écrite par lots bornés.
crons.interval("diaspora-job-offers-expiry", { hours: 1 }, internal.modules.diaspora.jobs.closeExpiredJobOffers, {})

// Garde des fichiers : relance des analyses perdues (job tombé, redéploiement),
// et purge des fichiers infectés au-delà de la rétention (la ligne reste).
// Identifiants en ASCII : Convex refuse tout autre caractère (`é` compris).
crons.interval("files-retry-stale-scans", { minutes: 5 }, internal.modules.files.mutations.retryStale, {})
crons.daily("files-purge-infected-blobs", { hourUTC: 3, minuteUTC: 15 }, internal.modules.files.mutations.purgeQuarantinedBlobs, {})

// Messagerie : purge des signaux « en train d'écrire » expirés (la lecture les
// écarte déjà ; le passage ne fait que vider la table).
crons.interval("messaging-purge-expired-typing", { minutes: 1 }, internal.modules.messaging.typing.purgeExpiredTyping, {})
crons.interval("groups-purge-expired-typing", { minutes: 1 }, internal.modules.groups.typing.purgeExpiredGroupTyping, {})

// Stories : la ligne, ses vues, son blob ET sa ligne d'analyse disparaissent à l'expiration.
crons.interval("stories-purge-expired", { minutes: 10 }, internal.modules.stories.stories.purgeExpired, {})

// Appels : les appels périmés (composés sans suite, sonneries sans réponse, salles
// vidées par un onglet fermé, fantômes) se closent ; les présences dont le battement
// s'est tu passent hors ligne. Lectures indexées, poursuivies par chaîne.
crons.interval("calls-cleanup-stale", { seconds: 30 }, internal.modules.calls.cleanup.cleanupStaleCalls, {})
crons.interval("calls-presence-cleanup-stale", { seconds: 60 }, internal.modules.calls.presence.cleanupStalePresence, {})

// Direct (`live`, socle `crons.ts` l. 264-296) : la RÉCOLTE ferme les sessions
// programmées jamais démarrées (24 h) et les directs fantômes (4 h, hôte parti
// sans terminer), arrête leur Egress et recompose les compteurs de salle —
// l'écrivain unique (D28), le chemin chaud n'écrit jamais la session.
crons.interval("live-reap-stale", { seconds: 60 }, internal.modules.live.reap.reapStaleDirects, {})
// Filet de la conservation des rediffusions : l'échéance exacte est planifiée à
// la livraison Egress, ce passage horaire récupère les jobs manqués et
// matérialise l'échéance des rediffusions qui n'en ont pas, par lots de 50.
crons.interval("live-purge-expired-replays", { hours: 1 }, internal.modules.live.replay.purgeExpiredReplays, {})
// Le filet des webhooks : une terminaison reçue AVANT la corrélation est
// absorbée et rien ne la rejoue — ce passage reprend les sessions terminées dont
// la rediffusion n'a pas abouti, demande son sort à LiveKit et conclut
// (fichier rapatrié, échec nommé, ou abandon motivé après 24 h).
crons.interval("live-reconcile-replays", { minutes: 15 }, internal.modules.live.replay.reconcileStalePending, {})

// PA5 — bornes, reprises et absence de contenu dans les notifications.
crons.interval("moderation-expire-sanctions", { minutes: 5 }, internal.modules.moderation.maintenance.expireSanctions, {})
crons.daily("moderation-aggregate-transparency", { hourUTC: 4, minuteUTC: 10 }, internal.modules.moderation.maintenance.aggregateTransparency, {})
// SU01h (art. 41 à 44) : levée des mesures sur ordre du juge à leur échéance (72 h au plus pour l'art. 44),
// à la minute près, puis purge des mesures levées au terme de leur conservation ; tranches bornées.
crons.interval("moderation-judicial-measures", { minutes: 1 }, internal.modules.moderation.measures.runDueMeasures, {})
crons.interval("notifications-drain-deliveries", { seconds: 30 }, internal.modules.notifications.deliveries.drain, {})
crons.daily("notifications-reserve-digests", { hourUTC: 7, minuteUTC: 0 }, internal.modules.notifications.deliveries.reserveDigests, {})
crons.daily("notifications-retention-active", { hourUTC: 3, minuteUTC: 45 }, internal.modules.notifications.retention.run, {})
crons.interval("data-resume-erasure", { minutes: 15 }, internal.modules.people.erasure.resumeDueErasures, {})
crons.daily("data-purge-export-receipts", { hourUTC: 4, minuteUTC: 30 }, internal.modules.people.erasure.purgeExpiredExports, {})
// PA7 : la lecture ferme immédiatement les preuves expirées ; rétention par lots de 100.
crons.daily("operators-purge-expired-idn-proofs", { hourUTC: 3, minuteUTC: 55 }, internal.modules.platform.operatorAccess.purgeExpiredProofs, {})
// PG-01 : pièces des revendications de page TRANCHÉES, conservation échue (90 jours, valeur à
// valider) : purge par lots bornés, poursuivie par chaîne ; la revendication et sa décision restent.
crons.daily("pages-purge-decided-claim-evidence", { hourUTC: 4, minuteUTC: 20 }, internal.modules.pages.claims.purgeDecidedClaimEvidence, {})

// PA8 : mesures publiques par générations et tranches bornées, sans identités.
crons.interval("public-refresh-aggregates", { minutes: 15 }, internal.modules.public.aggregate.refresh, {})

// PA10 : distribution/reprise et rétention du fil, dépôts abandonnés non admis,
// observation bornée des tâches planifiées. Aucun contenu dans la télémétrie.
crons.interval("feed-maintain-materialized", { minutes: 15 }, internal.modules.posts.feedMaterialization.maintain, {})
crons.daily("files-purge-unadmitted-orphans", { hourUTC: 3, minuteUTC: 25 }, internal.modules.files.orphans.run, {})
crons.interval("operations-observe-scheduled-jobs", { minutes: 5 }, internal.modules.platform.operationalHealth.observe, {})

// P10 : rétention des conversations et reprise privée sans contenu dans les arguments.
crons.interval("commercial-drain-crm", { minutes: 1 }, internal.modules.commercialMessaging.crmTransport.drain, {})
crons.daily("commercial-purge-closed", { hourUTC: 4, minuteUTC: 45 }, internal.modules.commercialMessaging.retention.purgeExpired, {})
crons.interval("commercial-revalidate-calls", { minutes: 1 }, internal.modules.commercialMessaging.retention.revalidateCalls, {})

// CC-4 (ADR-0025) : revalidation des appels contextuels VIVANTS — une perte de droit née hors du
// module (adhésion, signataire, blocage, consentement, page) arrête aussi la salle établie. Ce n'est
// pas une conservation : D7 reste sans durée, aucune purge temporelle des conversations contextuelles.
crons.interval("contextual-revalidate-calls", { minutes: 1 }, internal.modules.contextualMessaging.retention.revalidateCalls, {})

// P11 : filet de purge des corps prives transitoires, par lots bornes.
crons.interval("checkout-purge-private-bodies", { minutes: 15 }, internal.modules.shops.checkoutLifecycle.purgeExpired, {})

// P12 : conservation courte des octets privés, sans effet financier ni appel fournisseur.
crons.interval("payment-purge-private-bodies", { minutes: 15 }, internal.modules.shops.paymentFlow.purgeExpired, {})
// P13 : support privé court, suivi canonique conservé sans texte de message.
crons.interval("purchase-purge-private-bodies", { minutes: 15 }, internal.modules.shops.purchaseLifecycle.purgeExpired, {})
// P15 : reprise des candidatures (envoi, pièces, suivi, retrait), arguments sans contenu.
crons.interval("jobs-drain-applications", { minutes: 1 }, internal.modules.shops.jobApplicationTransport.drain, {})

export default crons
