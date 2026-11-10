import type { ValidatorJSON } from "convex/values"
import schema from "../../schema"
import { DATA_TABLE_POLICIES } from "./dataPolicies"

export type DataRecord = Record<string, unknown> & { _id: string; _creationTime: number }
export const dataTableNames = () => Object.keys(schema.tables).sort()
export const unclassifiedDataTables = () => dataTableNames().filter((name) => !Object.prototype.hasOwnProperty.call(DATA_TABLE_POLICIES, name))

/** Le registre des références est dérivé des validateurs réels, y compris unions/collections. */
export function referencesIn(value: unknown, shape: ValidatorJSON): Array<{ table: string; id: string }> {
  if (value === undefined || value === null) return []
  switch (shape.type) {
    case "id": return typeof value === "string" ? [{ table: shape.tableName, id: value }] : []
    case "array": return Array.isArray(value) ? value.flatMap((item) => referencesIn(item, shape.value)) : []
    case "object": return typeof value === "object" && !Array.isArray(value) ? Object.entries(shape.value).flatMap(([key, field]) => referencesIn((value as Record<string, unknown>)[key], field.fieldType)) : []
    case "union": return shape.value.flatMap((member) => referencesIn(value, member))
    case "record": return typeof value === "object" && !Array.isArray(value) ? Object.values(value).flatMap((item) => referencesIn(item, shape.values.fieldType)) : []
    default: return []
  }
}

export function shapeFor(table: string): ValidatorJSON {
  const tables = schema.tables as unknown as Record<string, { validator: { json: ValidatorJSON } }>
  const definition = tables[table]
  if (!definition || !Object.prototype.hasOwnProperty.call(DATA_TABLE_POLICIES, table)) throw new Error("Unclassified data table")
  return definition.validator.json
}

export function directlyOwned(table: string, row: DataRecord, personId: string): boolean {
  const policy = DATA_TABLE_POLICIES[table]
  if (!policy || policy.shared || ["persons", "idnProofs", "devOtpCodes"].includes(table)) return false
  if (policy.owners) return policy.owners.some((field) => row[field] === personId)
  return referencesIn(row, shapeFor(table)).some((ref) => ref.table === "persons" && ref.id === personId)
}

/** Remplace les références obligatoires par l'identité anonyme commune ; vide les listes. */
export function anonymizeReferences(value: unknown, shape: ValidatorJSON, personId: string, anonymousId: string): unknown {
  if (value === undefined || value === null) return value
  switch (shape.type) {
    case "id": return shape.tableName === "persons" && value === personId ? anonymousId : value
    case "array": return Array.isArray(value) ? value.filter((item) => !(shape.value.type === "id" && shape.value.tableName === "persons" && item === personId)).map((item) => anonymizeReferences(item, shape.value, personId, anonymousId)) : value
    case "object": {
      if (typeof value !== "object" || Array.isArray(value)) return value
      const output = { ...(value as Record<string, unknown>) }
      for (const [key, field] of Object.entries(shape.value)) {
        if (field.optional && field.fieldType.type === "id" && field.fieldType.tableName === "persons" && output[key] === personId) delete output[key]
        else if (Object.prototype.hasOwnProperty.call(output, key)) output[key] = anonymizeReferences(output[key], field.fieldType, personId, anonymousId)
      }
      return output
    }
    case "union": return shape.value.reduce<unknown>((current, member) => anonymizeReferences(current, member, personId, anonymousId), value)
    case "record": return typeof value === "object" && !Array.isArray(value) ? Object.fromEntries(Object.entries(value).map(([key, item]) => [key, anonymizeReferences(item, shape.values.fieldType, personId, anonymousId)])) : value
    default: return value
  }
}

const PRIVATE_EXPORT_FIELDS = new Set(["authuserid", "userid", "endpoint", "token", "auth", "p256dh", "keys", "contacts", "identitysubjects", "secret", "privatekey", "keyenvname", "credential", "sessionid", "password", "clientsecret", "accesstoken", "refreshtoken", "idtoken", "authorization", "bearer", "backupcodes"])
// P17c : corrélations d'appareil/session du contrôle d'appel. Elles ne sont pas
// nécessaires à l'historique personnel et ne constituent jamais une preuve exportable.
const NATIVE_CALL_PRIVATE_EXPORT_FIELDS = new Set(["ownersessionid", "ownerdeviceid", "ownerapplicationid", "ownerbindingid", "ownerkind", "nativebindingid", "sessiongeneration", "nativeexpiresat", "systemcalluuid"])

/** Les secrets sont retirés à toute profondeur, y compris dans les objets imbriqués. */
function redactExportValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(redactExportValue)
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).filter(([key]) => !PRIVATE_EXPORT_FIELDS.has(key.toLowerCase()) && !NATIVE_CALL_PRIVATE_EXPORT_FIELDS.has(key.toLowerCase()) && !/(?:token|secret|password|credential|privatekey)$/i.test(key)).map(([key, item]) => [key, redactExportValue(item)]))
  }
  return value
}

function projectedRecord(row: DataRecord, fields: readonly string[]): Record<string, unknown> {
  return redactExportValue(Object.fromEntries(fields.filter((field) => Object.prototype.hasOwnProperty.call(row, field)).map((field) => [field, row[field]]))) as Record<string, unknown>
}

const RECORD_METADATA = ["_id", "_creationTime", "networkId", "createdAt", "updatedAt"] as const
const THREAD_METADATA = [...RECORD_METADATA, "personLow", "personHigh", "createdByPersonId", "initiatedByPersonId", "status", "archivedAt", "closedAt", "lastMessageAt"] as const
const REPORT_REFERENCE_FIELDS = [...RECORD_METADATA, "target", "targetKind", "targetId", "postId", "commentId", "status"] as const

/** Droits de propriété explicites, distincts de la découverte des dépendances d'effacement. */
const EXPORT_PERSON_FIELDS: Readonly<Record<string, readonly string[]>> = {
  identityLinks: ["personId"], networkMemberships: ["personId"], personFacets: ["personId"], consents: ["personId"], peopleDirectory: ["personId"], handleHistory: ["personId"],
  postReactions: ["personId"], personalMessageReactions: ["personId"], personalTyping: ["personId"], unreadTotals: ["personId"],
  thematicGroupMembers: ["personId"], groupMembers: ["personId"], groupMessageReactions: ["personId"], groupMessageHides: ["personId"], groupTyping: ["personId"],
  storyViews: ["viewerPersonId"], suggestionDismissals: ["personId"], pageFollows: ["personId"],
  callParticipants: ["personId"], callInvites: ["personId"], callPreferences: ["personId"], personPresence: ["personId"],
  liveSpeakers: ["personId"], liveViewerGrants: ["personId"], liveAntennaRequests: ["personId"], liveDelegations: ["personId"], liveInvitees: ["personId"], liveChatMutes: ["personId"], liveReactions: ["personId"], liveHostPresence: ["hostPersonId"],
  postMarks: ["personId"], mutes: ["personId"], consularAttestations: ["personId"], memberPrivacy: ["personId"],
  notificationPreferences: ["personId"], pushSubscriptions: ["personId"], notificationDeliveryJobs: ["recipientPersonId"], notificationWeeklyUsage: ["personId"], notificationDigestReceipts: ["personId"], dataExports: ["personId"],
  // Tranche DIASPORALE (délégué) : le relecteur retrouve ses relectures du kit d'arrivée, sans la ressource.
  kitResourceReviews: ["reviewerPersonId"],
}

/**
 * Une mention, une signature ou un geste d'administration n'ouvrent jamais le
 * document d'autrui. Les relations partagées ont leurs propres projections.
 */
export function exportableRecord(table: string, row: DataRecord, personId: string): Record<string, unknown> | null {
  if (table === "professionalProfiles") return row.personId === personId ? projectedRecord(row, [...RECORD_METADATA, "revision", "state", "visibility", "title", "bio", "skills", "languageCodes", "zone", "availability", "collaborationTypes", "portfolio", "activityPageIds", "publicFields", "consentTextVersion", "consentedAt", "publicConsentTextVersion", "publicConsentAt", "publicConsentRevokedAt", "publishedAt", "pausedAt"]) : null
  if (table === "professionalCollaborations") {
    // L'auteur exporte sa proposition, le destinataire son propre geste ; aucun refus d'autrui.
    if (row.fromPersonId === personId) return projectedRecord(row, [...RECORD_METADATA, "collaborationType", "message", "proposedAt", ...(row.cancelledByPersonId === personId ? ["cancelledAt"] : [])])
    if (row.toPersonId === personId) return { ...projectedRecord(row, [...RECORD_METADATA, "respondedAt", ...(row.cancelledByPersonId === personId ? ["cancelledAt"] : [])]), ...(["accepted", "declined"].includes(String(row.status)) ? { decision: row.status } : {}) }
    return null
  }
  // P13 : le suivi personnel n'exporte ni texte de support, ni octets signés, ni sujet/session.
  if (table === "shopPurchaseRequests") return null
  if (table === "shopPurchaseSnapshots") {
    if (row.personId !== personId) return null
    const order = row.order && typeof row.order === "object" && !Array.isArray(row.order) ? row.order as Record<string, unknown> : null
    return { ...projectedRecord(row, [...RECORD_METADATA, "purchaseId", "checkoutAttemptId", "observedAt"]), ...(order ? { order: Object.fromEntries(["orderRef", "checkoutRef", "paymentRef", "shopRef", "reference", "sellerLabel", "createdAt", "updatedAt", "revision", "paymentRevision", "lines", "fees", "amount", "orderState", "paymentState", "stockState", "refundState", "reviewRequired", "fulfillment", "receipt", "settlementState", "cancellationState", "returnState", "history", "historyTruncated", "consentTextVersion"].filter((key) => Object.prototype.hasOwnProperty.call(order, key)).map((key) => [key, redactExportValue(order[key])])) } : {}) }
  }
  // P12 : ni corps signé, reçu de préparation, URL prestataire, bail ni contexte d'autorité.
  if (table === "shopPaymentRequests" || table === "shopPaymentPolicies") return null
  if (table === "shopPaymentOptions") {
    if (row.personId !== personId) return null
    const options = row.options && typeof row.options === "object" && !Array.isArray(row.options) ? row.options as Record<string, unknown> : null
    return { ...projectedRecord(row, [...RECORD_METADATA, "checkoutAttemptId", "checkoutRef", "observedAt", "validUntil"]), ...(options ? { options: Object.fromEntries(["available", "reason", "amount", "expiresAt", "providerLabel", "beneficiaryLabel", "modes", "consentTextVersion"].filter((key) => Object.prototype.hasOwnProperty.call(options, key)).map((key) => [key, redactExportValue(options[key])])) } : {}) }
  }
  if (table === "shopPaymentAttempts") {
    if (row.personId !== personId) return null
    const snapshot = row.snapshot && typeof row.snapshot === "object" && !Array.isArray(row.snapshot) ? row.snapshot as Record<string, unknown> : null
    return { ...projectedRecord(row, [...RECORD_METADATA, "paymentAttemptId", "checkoutAttemptId", "checkoutRef", "amount", "consentedAt", "consentTextVersion", "state", "paymentRef", "orderRef", "paymentState", "observedAt", "privacyRevokedAt"]), ...(snapshot ? { snapshot: Object.fromEntries(["checkoutRef", "paymentRef", "orderRef", "paymentState", "orderState", "stockState", "refundState", "reviewRequired", "revision", "updatedAt", "amount"].filter((key) => Object.prototype.hasOwnProperty.call(snapshot, key)).map((key) => [key, redactExportValue(snapshot[key])])) } : {}) }
  }
  // P11 : les corps signés, adresses, sujets opaques et preuves de session restent privés.
  if (table === "checkoutRequests" || table === "shopCheckoutPolicies" || table === "checkoutClientIntentFences") return null
  if (table === "checkoutAttempts") return row.personId === personId ? projectedRecord(row, [...RECORD_METADATA, "shopId", "attemptId", "state", "expectedLines", "expectedFees", "expectedPolicyVersion", "result", "consentedAt", "consentTextVersion", "createdAt", "updatedAt"]) : null
  const policy = DATA_TABLE_POLICIES[table]
  if (!policy) return null
  // MP12 : une signature est une trace, jamais un droit d'export sur le brouillon de la rédaction.
  if (table === "editorialMedia") return row.publicConsentByPersonId === personId ? projectedRecord(row, [...RECORD_METADATA, "pageId", "publicConsentTextVersion", "publicConsentedAt", "publicConsentRevokedAt"]) : row.createdByPersonId === personId ? projectedRecord(row, [...RECORD_METADATA, "pageId"]) : null
  if (table === "editorialGrants") return row.personId === personId ? projectedRecord(row, [...RECORD_METADATA, "pageId", "role", "state", "acceptedAt", "revokedAt", "bylineConsentTextVersion", "bylineConsentedAt", "bylineConsentRevokedAt"]) : row.invitedByPersonId === personId ? projectedRecord(row, [...RECORD_METADATA, "pageId", "role", "invitedAt"]) : null
  if (table === "editorialArticles") return row.createdByPersonId === personId ? projectedRecord(row, [...RECORD_METADATA, "pageId", "articleKey"]) : null
  if (table === "editorialVersions") return row.authorPersonId === personId ? projectedRecord(row, [...RECORD_METADATA, "pageId", "articleId", "versionNumber", "digest"]) : null
  if (table === "editorialEvents") return row.actorPersonId === personId ? projectedRecord(row, [...RECORD_METADATA, "pageId", "articleId", "versionId", "action"]) : null
  if (table === "editorialSocialLinks") return row.announcedByPersonId === personId ? projectedRecord(row, [...RECORD_METADATA, "pageId", "articleId", "postId", "announcedAt"]) : null
  if (table === "editorialAssets") return row.uploadedByPersonId === personId ? projectedRecord(row, [...RECORD_METADATA, "pageId", "altText", "credit", "mimeType", "sizeBytes", "rightsConsentTextVersion", "rightsConsentedAt"]) : null
  // PA10 : les files, références de tiers et curseurs techniques ne sont pas
  // des copies exportables du contenu. Le propriétaire reçoit seulement la
  // fenêtre de sa préparation ; ses publications suivent la politique posts.
  if (table === "shopCommerceBuyerSubjects") return null
  if (table === "commercialCrmTransfers") return row.personId === personId ? projectedRecord(row, [...RECORD_METADATA, "threadId", "state", "selectedText", "displayName", "textVersion", "consentedAt", "revokedAt", "submittedAt"]) : null
  if (table === "commercialThreads") return row.requesterPersonId === personId ? projectedRecord(row, [...RECORD_METADATA, "shopId", "offerRef", "state", "revision", "buyerCallsAllowed", "lastMessageAt"]) : null
  // P16 : un blocage s'exporte à la seule personne qui l'a posé (son geste) ; le demandeur ne reçoit
  // ni le blocage posé côté boutique ni l'identité du membre d'équipe qui l'a posé.
  if (table === "commercialBlocks") return row.personId === personId ? projectedRecord(row, [...RECORD_METADATA, "threadId", "shopId", "side"]) : null
  // CC-2b (ADR-0025, PA5) : une référence ne vaut pas propriété. Le fil se projette, sans aperçu ni
  // contenu d'objet, à la personne demandeuse ou répondante (côté propre, nature, référence, statut,
  // dates) — jamais aux signataires d'une page, le fil étant un contenu de la page. Un message en voix
  // de personne s'exporte à son auteur (texte, nom/type/taille des pièces, dates, retrait), sans clé,
  // empreinte ni `storageId` ; en voix de page, le signataire ne reçoit qu'une trace sans contenu (D13,
  // à confirmer juridiquement) ; jamais le message d'autrui. Ses propres états de lecture et d'accord.
  if (table === "contextualPolicies") return null
  if (table === "contextualThreads") {
    const side = row.requesterPersonId === personId ? "requester" : row.responderPersonId === personId ? "responder" : null
    return side === null ? null : { ...projectedRecord(row, [...RECORD_METADATA, "kind", "serviceRequestId", "mentoringRequestId", "jobApplicationId", "professionalCollaborationId", "status", "closedAt", "closedCause", "closedBySide", "lastMessageAt"]), side }
  }
  if (table === "contextualMessages") {
    if (row.voice === "person" && row.authorPersonId === personId) {
      const files: readonly unknown[] = Array.isArray(row.attachmentFiles) ? (row.attachmentFiles as unknown[]) : []
      return {
        ...projectedRecord(row, [...RECORD_METADATA, "threadId", "side", "voice", "content", "deletedAt"]),
        attachmentFiles: files.flatMap((file) => {
          if (!file || typeof file !== "object" || Array.isArray(file)) return []
          const item = file as Record<string, unknown>
          return [{ filename: item.filename ?? null, mimeType: item.mimeType ?? null, sizeBytes: item.sizeBytes ?? null, durationMs: item.durationMs ?? null }]
        }),
      }
    }
    if (row.voice === "page" && row.pageSpeakerPersonId === personId) return projectedRecord(row, [...RECORD_METADATA, "threadId", "side", "voice", "deletedAt"])
    return null
  }
  if (table === "contextualPersonStates") return row.personId === personId ? projectedRecord(row, [...RECORD_METADATA, "threadId", "readAt", "callsAllowed"]) : null
  if (table === "feedEntries" || table === "feedFanoutJobs") return null
  if (table === "fileStagingReservations") return null
  if (table === "feedCursors") return row.personId === personId ? projectedRecord(row, [...RECORD_METADATA, "personId", "scope", "status", "windowStart", "startedAt", "completedAt"]) : null
  // P08 : les preuves de possession restent serveur, même dans l'export personnel.
  // P09 : aucun catalogue collectif, corps signé, jeton de média ni mapping dans l'export du signataire.
  if (table === "shopCatalogPolicies" || table === "commerceCatalogMappings" || table === "commerceCatalogHeads" || table === "commerceCatalogMediaAssets") return null
  // P15 : ni corps signé, session, sujet opaque ni identifiant de stockage ; la candidature et ses pièces au seul candidat.
  if (table === "commerceJobPolicies" || table === "commerceJobHeads" || table === "commerceApplicationSubjects") return null
  if (table === "commerceApplicationIntentFences") return null
  if (table === "commerceApplicationFiles") return row.personId === personId ? projectedRecord(row, [...RECORD_METADATA, "kind", "filename", "sha256", "byteSize", "state", "retiredAt"]) : null
  if (table === "commerceApplications") return row.personId === personId ? projectedRecord(row, [...RECORD_METADATA, "shopId", "jobRef", "jobTitle", "civilName", "motivation", "files", "state", "rejection", "applicationRef", "submittedAt", "remoteState", "remoteUpdatedAt", "consentTextVersion", "consentedAt", "revokedAt", "revokeReason"]) : null
  // P14 : ni corps signé, session, sujet opaque, liaison, empreinte ni bail ; la demande, ses consentements et les états servis au seul acheteur.
  if (table === "commerceServicePolicies") return null
  if (table === "serviceClientIntentFences") return null
  // DP39 : registre technique de déduplication, ni corps de service ni projection personnelle.
  if (table === "commerceServiceFollowupNotices") return null
  if (table === "commerceServiceRequests") return row.personId === personId ? projectedRecord(row, [...RECORD_METADATA, "shopId", "handle", "requestRowId", "mode", "offerRef", "offerTitle", "state", "reason", "threadId", "inquiryRef", "desiredDate", "chosenAttachmentCount", "serviceRef", "serviceLabel", "booking", "pendingReplacement", "order", "acceptedQuote", "rejectedQuote", "purgeAt"]) : null
  if (table === "commerceServiceCommands") return row.personId === personId ? projectedRecord(row, [...RECORD_METADATA, "requestRowId", "kind", "state", "reason", "issuedAt", "expiresAt", "consentTextVersion", "consentedAt", "quoteRef", "quoteVersion", "acceptedTotal", "serviceRef", "slotStartAt", "slotEndAt", "appointmentRef", "expectedRevision", "offerRef", "quantity", "expectedUnitAmount", "expectedCatalogRevision", "currentVersion", "currentTotal", "currentUnitAmount", "currentCatalogRevision", "resultRef"]) : null
  if (table === "shopCommerceLinkCommands" || table === "shopCommerceSubjects" || table === "shopCommerceShopRefs") return null
  if (table === "shopCommerceLinks") return row.personId === personId ? projectedRecord(row, [...RECORD_METADATA, "personId", "shopId", "pageId", "source", "environment", "state", "shopRef", "linkRef", "permissions", "consentTextVersion", "consentedAt", "linkedAt", "revokedAt", "updatedAt"]) : null
  if (table === "shopCommerceLinkChallenges") return row.personId === personId ? projectedRecord(row, [...RECORD_METADATA, "personId", "shopId", "status", "phase", "permissions", "consentTextVersion", "consentedAt", "expiresAt", "updatedAt"]) : null
  if (table === "federationAgentGrants") return row.personId === personId ? projectedRecord(row, [...RECORD_METADATA, "personId", "status", "generation", "grantedAt", "revokedAt", "sourceConsentedAt", "roleLabel"]) : null
  if (table === "persons") return row._id === personId ? redactExportValue(row) as Record<string, unknown> : null
  if (table === "personalThreads") return row.personLow === personId || row.personHigh === personId ? projectedRecord(row, THREAD_METADATA) : null
  if (table === "groupThreads") return row.createdByPersonId === personId ? projectedRecord(row, THREAD_METADATA) : null
  if (table === "connections") {
    // Le blocage reçu n'est ni une donnée divulguée par la relation ni une émission propre.
    if (row.status === "blocked" && row.blockedByPersonId !== personId) return null
    return row.personIdLow === personId || row.personIdHigh === personId ? projectedRecord(row, [...RECORD_METADATA, "personIdLow", "personIdHigh", "requestedByPersonId", "recipientPersonId", "status", "requestedAt", "respondedAt", "cancelledRequestedAt"]) : null
  }
  if (table === "personBlocks") return row.blockerPersonId === personId ? projectedRecord(row, [...RECORD_METADATA, "blockerPersonId", "targetPersonId"]) : null
  if (table === "follows") return row.followerPersonId === personId || row.targetPersonId === personId ? projectedRecord(row, [...RECORD_METADATA, "followerPersonId", "targetPersonId"]) : null
  if (table === "reports" || table === "contentReports") {
    // SU01d : le déclarant exporte aussi le délai légal, ses deux avis et l'effet sur le contenu — jamais la sanction ni le motif de modération.
    if (row.reporterPersonId === personId) return projectedRecord(row, [...REPORT_REFERENCE_FIELDS, "reason", "note", "source", "legalBasis", "dueAt", "acknowledgedAt", "reporterNotifiedAt", "removedTarget"])
    if (table === "reports" && row.ownerPersonId === personId) return projectedRecord(row, [...REPORT_REFERENCE_FIELDS, "source", "decisionReason", "reviewedAt", "removedTarget"])
    return null
  }
  if (table === "engineAudit") return row.actorPersonId === personId ? projectedRecord(row, [...RECORD_METADATA, "action", "capacity", "subjectTable", "subjectId", "at"]) : null
  // Tranche DIASPORALE (délégué par ANTSIA le 18/10/2026) : une demande de mentorat appartient aux
  // deux parties ; le mentoré exporte toute sa demande, le mentor jamais l'objectif, le message ni
  // les clés d'idempotence du mentoré (une référence ne vaut pas propriété du contenu d'autrui).
  // Candidature d'emploi DIASPORALE (DG-025) : au seul candidat, sans clé d'idempotence ni identité du
  // signataire qui a décidé ; le motif de non-sélection, jamais montré sans relecture, reste hors
  // export tant que ce point n'est pas tranché (droit d'accès face à la relecture humaine).
  // Relecture du kit d'arrivée : au seul relecteur, son verdict et son motif, jamais le contenu relu.
  if (table === "kitResourceReviews") {
    return row.reviewerPersonId === personId ? projectedRecord(row, [...RECORD_METADATA, "resourceId", "revision", "reviewerPersonId", "outcome", "reason"]) : null
  }
  if (table === "jobApplications") {
    return row.candidatePersonId === personId
      ? projectedRecord(row, [...RECORD_METADATA, "offerId", "pageId", "candidatePersonId", "offerTitle", "offerVersion", "message", "status", "identityConsentAt", "shareTalentProfile", "talentConsentAt", "seenAt", "decidedAt", "withdrawnAt"])
      : null
  }
  if (table === "mentoringRequests") {
    const shared = [...RECORD_METADATA, "mentorProfileId", "domain", "status", "expiresAt", "slot", "slotVersion", "acceptedAt", "closedBy", "closedAt"]
    if (row.menteePersonId === personId) return projectedRecord(row, [...shared, "mentorPersonId", "menteePersonId", "goal", "message", "wishedSlots", "timeZone", "consentAt", "closedReason"])
    if (row.mentorPersonId === personId) return projectedRecord(row, [...shared, "mentorPersonId"])
    return null
  }
  if (table === "dataErasureJobs") return row.personId === personId ? projectedRecord(row, ["_id", "personId", "phase", "requestedAt", "dueAt", "updatedAt"]) : null
  // Le geste de création appartient à son auteur ; le contenu courant est collectif.
  if (table === "pages" || table === "thematicGroups") return row.createdByPersonId === personId ? projectedRecord(row, ["_id", "_creationTime", "networkId", "createdByPersonId", "createdAt"]) : null
  if (table === "shops") {
    // Un brouillon sans page appartient à son propriétaire. La préparation
    // historique d'une page ne donne aucun droit sur son état commercial actuel.
    if (row.pageId === undefined && row.ownerPersonId === personId) return redactExportValue(row) as Record<string, unknown>
    const fields = ["_id", "_creationTime", "networkId", "createdAt"]
    let personal = false
    if (row.preparedByPersonId === personId) {
      fields.push("preparedByPersonId")
      personal = true
    }
    if (row.publicConsentByPersonId === personId) {
      fields.push("publicConsentByPersonId", "publicConsentAt", "publicConsentTextVersion", "publicConsentRevokedAt")
      personal = true
    }
    return personal ? projectedRecord(row, fields) : null
  }
  if (policy.shared) return null
  const owners = policy.owners ?? EXPORT_PERSON_FIELDS[table]
  if (!owners?.some((field) => row[field] === personId)) return null
  if (table === "fileScans") return projectedRecord(row, [...RECORD_METADATA, "storageId", "uploadedByPersonId", "source", "status", "attempts", "scannedAt", "releasedAt"])
  // Une copie transférée n'ouvre pas l'original retiré/inaccessible par l'export self-scoped.
  if ((table === "personalMessages" || table === "groupMessages") && row.forwardedFrom) {
    const metadata = { ...row }
    delete metadata.content; delete metadata.attachmentFiles; delete metadata.forwardedFrom
    return redactExportValue(metadata) as Record<string, unknown>
  }
  return redactExportValue(row) as Record<string, unknown>
}

/** Compatibilité : une ligne non exportable devient vide, jamais une projection permissive. */
export function exportRecord(table: string, row: DataRecord, personId: string): Record<string, unknown> {
  return exportableRecord(table, row, personId) ?? {}
}
