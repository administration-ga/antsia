// Dupliqué de socle/convex/schemas/chats.ts (avec socle/convex/schemas/chatMessages.ts, chatMessageReactions.ts, chatTyping.ts et la table `reseauPersonnel_unreadTotals` de modules/reseauPersonnel/tables.ts, l. 1101-1134) @ ad2e7fdc2 — adaptations : fils PERSONNELS seulement, PAR RÉSEAU (`networkId`, paire de personnes ordonnée) ; retirés `orgId`, `requestId`, type standard, `claimedBy`, `scope`, `posteA`/`posteB` et leurs index ; messages : `senderPoste`, pièces « documents » et `sourceDocumentId` retirés, `by_chat_read` non recopié, provenance d'un transfert, 1:1 ou de groupe, et copies indexées par leur original, masquage « pour moi » sur une liste bornée par construction (deux participants) ; contenu ABSENT pour des pièces seules ou un message retiré (D37) ; aperçu dénormalisé en NATURE (texte, vocal, pièces) que l'écran traduit ; pastille de non-lus par (réseau, personne), avec la part des groupes réservée.
/**
 * Messagerie PERSONNELLE d'un réseau — fils 1:1 entre deux personnes.
 */
import { MESSAGE_REACTION_KINDS } from "@antsia/social-contracts/messageReactions"
import { defineTable } from "convex/server"
import { v } from "convex/values"

import { literals } from "../../lib/validators"

export const messageReactionKindValidator = literals(MESSAGE_REACTION_KINDS)

/** Décomptes dénormalisés : six genres fermés, un validateur précis. */
export const messageReactionCountsValidator = v.object({ like: v.number(), love: v.number(), laugh: v.number(), wow: v.number(), sad: v.number(), pray: v.number() })

/** Une pièce jointe, telle que la ligne la porte (métadonnées RÉELLES du stockage). */
export const storedAttachmentValidator = v.object({
  storageId: v.id("_storage"),
  filename: v.string(),
  mimeType: v.string(),
  sizeBytes: v.number(),
  /** Durée d'un message VOCAL (mime sonore), déclarée — elle dessine une barre de lecture. */
  durationMs: v.optional(v.number()),
})

/** La provenance d'un message transféré : le fil et le message d'origine, 1:1 ou de groupe (relue à la lecture). */
export const forwardedFromValidator = v.union(
  v.object({ kind: v.literal("personal"), threadId: v.id("personalThreads"), messageId: v.id("personalMessages") }),
  v.object({ kind: v.literal("group"), threadId: v.id("groupThreads"), messageId: v.id("groupMessages") }),
)

/** La nature du dernier message, pour l'aperçu de liste. */
export const lastMessageKindValidator = v.union(v.literal("text"), v.literal("voice"), v.literal("attachments"), v.literal("call"), v.literal("system"))

export const messagingTables = {
  /**
   * Un fil 1:1 entre deux personnes, DANS un réseau. Paire ordonnée
   * (`personLow` < `personHigh`) : un seul fil par paire et par réseau.
   */
  personalThreads: defineTable({
    networkId: v.id("networks"),
    personLow: v.id("persons"),
    personHigh: v.id("persons"),
    initiatedByPersonId: v.id("persons"),
    /** Aperçu dénormalisé : le texte (tronqué) du dernier message, sa nature, son auteur. */
    lastMessageText: v.optional(v.string()),
    lastMessageKind: v.optional(lastMessageKindValidator),
    /** Nombre de pièces, quand l'aperçu est fait de pièces. */
    lastMessageAttachmentCount: v.optional(v.number()),
    lastMessageAt: v.optional(v.number()),
    lastMessageByPersonId: v.optional(v.id("persons")),
    /** LE message épinglé du fil — un seul : épingler remplace. */
    pinnedMessageId: v.optional(v.id("personalMessages")),
    status: v.union(v.literal("active"), v.literal("archived")),
    createdAt: v.number(),
  })
    // « Existe-t-il un fil entre ces deux personnes dans ce réseau ? »
    .index("by_network_pair", ["networkId", "personLow", "personHigh"])
    // Les fils d'une paire, tous réseaux confondus (blocage : la pastille suit).
    .index("by_pair", ["personLow", "personHigh"])
    // « Mes fils, par activité » : l'union de deux plages, fusionnées par curseur.
    .index("by_network_low_lastMessageAt", ["networkId", "personLow", "lastMessageAt"])
    .index("by_network_high_lastMessageAt", ["networkId", "personHigh", "lastMessageAt"])
    .index("by_initiatedByPersonId", ["initiatedByPersonId"])
    .index("by_lastMessageByPersonId", ["lastMessageByPersonId"]),

  personalMessages: defineTable({
    networkId: v.id("networks"),
    threadId: v.id("personalThreads"),
    senderPersonId: v.id("persons"),
    /** Absent : pièces seules, ou message retiré pour tous (D37 : `undefined` partout, jamais `""`). */
    content: v.optional(v.string()),
    attachmentFiles: v.optional(v.array(storedAttachmentValidator)),
    /** Le message CITÉ — référence seule, l'extrait est RELU à la lecture. */
    replyToMessageId: v.optional(v.id("personalMessages")),
    /** R9 : la citation demeure anonyme après purge physique, sans ID de message ni d'auteur. */
    replyToDeletedAccount: v.optional(v.boolean()),
    reactionCounts: v.optional(messageReactionCountsValidator),
    /** Suppression POUR MOI : liste bornée par construction (deux participants). */
    hiddenForPersonIds: v.optional(v.array(v.id("persons"))),
    readAt: v.optional(v.number()),
    type: v.optional(v.union(v.literal("text"), v.literal("system"), v.literal("call_started"), v.literal("call_ended"))),
    idempotencyKey: v.optional(v.string()),
    /** Suppression POUR TOUT LE MONDE, par l'expéditeur, dans la fenêtre. */
    deletedAt: v.optional(v.number()),
    editedAt: v.optional(v.number()),
    forwardedFrom: v.optional(forwardedFromValidator),
    createdAt: v.number(),
  })
    .index("by_thread_createdAt", ["threadId", "createdAt"])
    .index("by_thread_idempotency", ["threadId", "idempotencyKey"])
    // Les NON-LUS d'un fil : les messages de l'autre, sans balayer le fil.
    .index("by_thread_sender_read", ["threadId", "senderPersonId", "readAt"])
    // Les copies d'un message (transferts) : une purge ne détruit pas un blob qu'une copie sert encore.
    .index("by_forwarded_message", ["forwardedFrom.messageId"])
    .index("by_senderPersonId", ["senderPersonId"])
    .index("by_replyToMessageId", ["replyToMessageId"]),

  /** Une réaction par (message, personne) : réagir deux fois bascule, n'empile pas. */
  personalMessageReactions: defineTable({
    threadId: v.id("personalThreads"),
    messageId: v.id("personalMessages"),
    personId: v.id("persons"),
    kind: messageReactionKindValidator,
    createdAt: v.number(),
  })
    .index("by_message_and_person", ["messageId", "personId"])
    // MES réactions sur une conversation entière — lues UNE fois par page.
    .index("by_thread_and_person", ["threadId", "personId"])
    .index("by_personId", ["personId"]),

  /** « En train d'écrire » — une ligne éphémère par (fil, personne). */
  personalTyping: defineTable({
    threadId: v.id("personalThreads"),
    personId: v.id("persons"),
    expiresAt: v.number(),
  })
    .index("by_thread", ["threadId"])
    .index("by_thread_person", ["threadId", "personId"])
    .index("by_expires", ["expiresAt"])
    .index("by_personId", ["personId"]),

  /**
   * La pastille de non-lus d'une personne dans un réseau, tenue par les points
   * d'écriture (envoyer, lire, retirer, masquer, bloquer) : la lire ne balaie
   * rien. `groups` est la part des conversations de groupe (lot 11).
   */
  unreadTotals: defineTable({
    networkId: v.id("networks"),
    personId: v.id("persons"),
    personal: v.number(),
    groups: v.number(),
    updatedAt: v.number(),
  }).index("by_network_person", ["networkId", "personId"]),
}
