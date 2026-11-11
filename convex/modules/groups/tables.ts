// Dupliqué de socle/convex/modules/reseauPersonnel/tables.ts (l. 596-899 : `reseauPersonnel_groupThreads`, `…GroupMembers`, `…GroupInvites`, `…GroupInviteLinks`, `…GroupMessages`, `…GroupMessageReactions`, `…GroupTyping`) @ ad2e7fdc2 — adaptations : `networkId` sur le fil, l'appartenance, l'invitation, le lien et le message ; personnes ; `scope` (poste / personnel) et `activeMeetingId` retirés (l'appel porte son fil d'origine, module `calls`), `meetingId` → `callId` (lot 15), `sourceDocumentId` (iDocument) retiré ; `memberCount` retiré du fil (agrégat `engineCounters`, D02) ; masquage « pour moi » dans la table `groupMessageHides` au lieu du tableau `deletedForUserIds` (D22) ; non-lus TENUS sur l'appartenance (`unreadCount`, avec la position jusqu'où les messages ont été comptés) et sommés dans `unreadTotals.groups` (D23, au lieu d'un recalcul de 50 fils × 200 messages) ; ordre d'activité porté par l'appartenance (« mes groupes » paginés sans relire les fils) ; aperçu en NATURE (comme le 1:1) ; provenance d'un transfert commune aux deux messageries ; copies indexées par leur original (la purge ne détruit pas le blob d'une copie vivante).
/**
 * CONVERSATIONS DE GROUPE d'un réseau — distinctes du 1:1 (`messaging`) : la
 * paire ordonnée ne se généralise pas à N personnes.
 *
 * Plafond : `GROUP_MEMBERS_MAX` (`@antsia/social-contracts/groupCapacity`),
 * créateur compris — ne pas recopier le chiffre ici.
 */
import { defineTable } from "convex/server"
import { v } from "convex/values"

import { literals } from "../../lib/validators"
import { forwardedFromValidator, lastMessageKindValidator, messageReactionCountsValidator, messageReactionKindValidator, storedAttachmentValidator } from "../messaging/tables"

export const GROUP_THREAD_ROLES = ["owner", "admin", "member"] as const
export const groupThreadRoleValidator = literals(GROUP_THREAD_ROLES)

export const groupInviteStatusValidator = v.union(v.literal("pending"), v.literal("accepted"), v.literal("declined"))

/** Les événements d'un message système — chacun a son émetteur dans le module. */
export const GROUP_SYSTEM_EVENTS = ["group_created", "member_joined", "member_left", "member_removed", "group_renamed", "call_started"] as const
export const groupSystemEventValidator = literals(GROUP_SYSTEM_EVENTS)
export type GroupSystemEvent = (typeof GROUP_SYSTEM_EVENTS)[number]

export const groupsTables = {
  /**
   * Un fil de groupe DANS un réseau. Le titre est REQUIS : vingt personnes ne
   * se résument pas en un nom de correspondant. L'effectif vit dans l'agrégat
   * `engineCounters` (D02), jamais sur le document que chaque envoi relit.
   */
  groupThreads: defineTable({
    networkId: v.id("networks"),
    title: v.string(),
    description: v.optional(v.string()),
    createdByPersonId: v.id("persons"),
    /** Photo du groupe — un dépôt NEUF, admis sous la politique `avatar`, propre à ce fil. */
    avatarStorageId: v.optional(v.id("_storage")),
    /** Dernier message, dénormalisé pour la liste — MASQUÉ à la lecture pour qui a bloqué son auteur. */
    lastMessageAt: v.optional(v.number()),
    lastMessageId: v.optional(v.id("groupMessages")),
    lastMessageText: v.optional(v.string()),
    lastMessageKind: v.optional(lastMessageKindValidator),
    lastMessageAttachmentCount: v.optional(v.number()),
    lastMessageByPersonId: v.optional(v.id("persons")),
    /** Tirée au montage du composeur : un renvoi ne crée pas deux groupes. */
    idempotencyKey: v.string(),
    /** LE message épinglé — un seul ; le geste appartient au rôle (owner, admin). */
    pinnedMessageId: v.optional(v.id("groupMessages")),
    /** Fermé quand le dernier membre est parti. La ligne demeure. */
    closedAt: v.optional(v.number()),
    /** Suppression demandée : toutes les gardes traitent le fil comme introuvable pendant la cascade. */
    deletingAt: v.optional(v.number()),
    createdAt: v.number(),
  }).index("by_creator_idempotency", ["createdByPersonId", "idempotencyKey"])
    .index("by_lastMessageByPersonId", ["lastMessageByPersonId"]),

  /**
   * L'appartenance d'une personne à un fil. Le DÉPART est une date : un membre
   * parti est un non-membre partout (refus indistinct).
   */
  groupMembers: defineTable({
    networkId: v.id("networks"),
    threadId: v.id("groupThreads"),
    personId: v.id("persons"),
    role: groupThreadRoleValidator,
    /** Curseur de lecture : position (`createdAt`, `_creationTime`) du dernier message LU. */
    lastReadAt: v.number(),
    lastReadCreationTime: v.optional(v.number()),
    lastReadMessageId: v.optional(v.id("groupMessages")),
    /**
     * Non-lus TENUS (D23) : les messages texte d'autrui, après le curseur, que
     * l'écran montrera. `countedThrough*` dit jusqu'où les messages ont été
     * EXAMINÉS — un message déjà examiné ne se recompte jamais, quel que soit
     * l'ordre où passent les diffusions.
     */
    unreadCount: v.number(),
    countedThroughAt: v.optional(v.number()),
    countedThroughCreationTime: v.optional(v.number()),
    /** Effacement local de la conversation : rien d'antérieur ne m'est plus servi. */
    clearedThroughMessageId: v.optional(v.id("groupMessages")),
    clearedThroughCreationTime: v.optional(v.number()),
    /** L'histoire d'un membre commence à SON arrivée (plancher inclusif). */
    joinedAt: v.number(),
    leftAt: v.optional(v.number()),
    /** Sourdine : les messages arrivent, la cloche ne sonne plus. */
    mutedAt: v.optional(v.number()),
    /** Dernière activité du fil vue de ce membre — l'ordre de « mes groupes ». */
    activityAt: v.number(),
  })
    .index("by_thread_person", ["threadId", "personId"])
    .index("by_thread_leftAt", ["threadId", "leftAt"])
    // « Mes groupes de ce réseau, par activité » : paginé, sans relire les fils.
    .index("by_network_person_leftAt_activityAt", ["networkId", "personId", "leftAt", "activityAt"])
    // Les appartenances d'une personne, tous réseaux (blocage : les fils partagés se recomptent).
    .index("by_person_leftAt", ["personId", "leftAt"]),

  /** Une INVITATION — l'invité décide ; une ligne par (fil, invité), ré-inviter la rouvre. */
  groupInvites: defineTable({
    networkId: v.id("networks"),
    threadId: v.id("groupThreads"),
    inviteePersonId: v.id("persons"),
    /** QUI a invité : la relation exigée est entre l'invitant et l'invité. */
    invitedByPersonId: v.id("persons"),
    status: groupInviteStatusValidator,
    createdAt: v.number(),
    respondedAt: v.optional(v.number()),
  })
    .index("by_thread_invitee", ["threadId", "inviteePersonId"])
    .index("by_thread_status_createdAt", ["threadId", "status", "createdAt"])
    .index("by_network_invitee_status_createdAt", ["networkId", "inviteePersonId", "status", "createdAt"])
    .index("by_invitedByPersonId", ["invitedByPersonId"]),

  /** Lien partageable : un jeton opaque, jamais un identifiant ; les révoqués restent invalides. */
  groupInviteLinks: defineTable({
    networkId: v.id("networks"),
    threadId: v.id("groupThreads"),
    token: v.string(),
    createdByPersonId: v.id("persons"),
    createdAt: v.number(),
    revokedAt: v.optional(v.number()),
  })
    .index("by_thread", ["threadId"])
    .index("by_token", ["token"])
    .index("by_createdByPersonId", ["createdByPersonId"]),

  /**
   * Un message de groupe — `text` ou `system`. Le corps d'un expéditeur BLOQUÉ
   * du lecteur est retiré côté serveur à la lecture : la ligne demeure.
   */
  groupMessages: defineTable({
    networkId: v.id("networks"),
    threadId: v.id("groupThreads"),
    senderPersonId: v.id("persons"),
    type: v.union(v.literal("text"), v.literal("system")),
    /** Absent : message système, pièces seules, ou message retiré pour tous (D37). */
    content: v.optional(v.string()),
    event: v.optional(groupSystemEventValidator),
    /** La personne VISÉE par un événement (`member_removed`), quand ce n'est pas l'émetteur. */
    targetPersonId: v.optional(v.id("persons")),
    /** L'appel annoncé par un événement `call_started` — une référence, relue avec sa garde. */
    callId: v.optional(v.id("calls")),
    attachmentFiles: v.optional(v.array(storedAttachmentValidator)),
    replyToMessageId: v.optional(v.id("groupMessages")),
    /** R9 : marque anonyme de citation, aucun extrait ni identifiant de compte effacé. */
    replyToDeletedAccount: v.optional(v.boolean()),
    reactionCounts: v.optional(messageReactionCountsValidator),
    /** Retiré POUR TOUT LE MONDE par l'auteur, dans la fenêtre : pierre tombale, la ligne demeure. */
    deletedAt: v.optional(v.number()),
    editedAt: v.optional(v.number()),
    forwardedFrom: v.optional(forwardedFromValidator),
    idempotencyKey: v.optional(v.string()),
    createdAt: v.number(),
  })
    .index("by_thread_createdAt", ["threadId", "createdAt"])
    .index("by_thread_idempotency", ["threadId", "idempotencyKey"])
    // Les copies d'un message (transferts) : la purge ne détruit pas un blob qu'une copie sert encore.
    .index("by_forwarded_message", ["forwardedFrom.messageId"])
    .index("by_senderPersonId", ["senderPersonId"])
    .index("by_targetPersonId", ["targetPersonId"])
    .index("by_replyToMessageId", ["replyToMessageId"]),

  /** Une réaction par (message, personne). */
  groupMessageReactions: defineTable({
    threadId: v.id("groupThreads"),
    messageId: v.id("groupMessages"),
    personId: v.id("persons"),
    kind: messageReactionKindValidator,
    createdAt: v.number(),
  })
    .index("by_message_person", ["messageId", "personId"])
    .index("by_thread_person", ["threadId", "personId"])
    .index("by_message", ["messageId"])
    .index("by_personId", ["personId"]),

  /**
   * Suppression « pour moi » (D22) : une ligne par (message, personne) au lieu
   * d'un tableau qui enfle avec l'effectif. La position du message y est
   * recopiée : MES masquages d'une page se lisent en une plage.
   */
  groupMessageHides: defineTable({
    threadId: v.id("groupThreads"),
    messageId: v.id("groupMessages"),
    personId: v.id("persons"),
    messageCreatedAt: v.number(),
    createdAt: v.number(),
  })
    .index("by_message_person", ["messageId", "personId"])
    .index("by_thread_person_messageCreatedAt", ["threadId", "personId", "messageCreatedAt"])
    .index("by_message", ["messageId"])
    .index("by_personId", ["personId"]),

  /** « En train d'écrire » — une ligne éphémère par (fil, personne). */
  groupTyping: defineTable({
    threadId: v.id("groupThreads"),
    personId: v.id("persons"),
    expiresAt: v.number(),
  })
    .index("by_thread", ["threadId"])
    .index("by_thread_person", ["threadId", "personId"])
    .index("by_expires", ["expiresAt"]),
}
