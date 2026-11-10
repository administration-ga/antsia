// Dupliqué de socle/convex/modules/iappel/tables.ts (avec socle/convex/schemas/meetings.ts et socle/convex/schemas/agentPresence.ts) @ ad2e7fdc2 — adaptations : la table `meetings` devient `calls`, pour les APPELS seulement (réunions, file d'appels, priorité, routage, poste, environnement, consentement, iRéunion et EAU retirés : 26 champs), `networkId` ajouté, nature d'appel OBLIGATOIRE, statut réduit à `active`/`ended`, titre non stocké (l'écran le compose), index réduits ; le tableau `participants`, réécrit à chaque entrée (document chaud), devient la table `callParticipants` (D02, D27) ; `iappel_callInvites` → `callInvites` (`meetingId` → `callId`, par réseau) ; `iappel_callPreferences` → `callPreferences` (par personne, silence sans portée) ; `iappel_voicemails` → `voicemails` (par réseau, sans `scope` ni `orgId`) ; `agentPresence` → `personPresence` (par réseau et par personne : ni organisation, ni appels déclarés par l'écran, ni « ne pas déranger » — l'état d'appel se lit sur `calls`, le silence sur `callPreferences`) ; `iappel_posteHours`, `iappel_postePolicy`, `iappel_priorityCallers` exclues ; le fil de groupe d'où part un appel est porté par l'APPEL (`groupThreadId`) au lieu d'un pointeur paresseux sur le fil.
/**
 * APPELS — six tables, et leur découpage n'est pas arbitraire.
 *
 *  · `calls` — l'appel lui-même, dans UN réseau : un tête-à-tête ou un appel de
 *    groupe (≤ 11). La ligne demeure après la fin : c'est le journal.
 *  · `callParticipants` — une ligne par personne d'un appel : qui a composé,
 *    qui a été appelé, qui est entré et quand il est parti. INVARIANT tenu par
 *    toutes les fins d'appel : une ligne SANS `leftAt` appartient toujours à un
 *    appel vivant — « suis-je en appel ? » est une lecture d'index bornée.
 *  · `callInvites` — les TICKETS d'un appel de groupe, un par invité : ils
 *    portent ce que la présence ne sait pas dire (un invité écarté par SES
 *    réglages, un refus, un manqué) — et ce qui sonne chez moi s'y lit par index.
 *  · `callPreferences` — les réglages d'appel d'une PERSONNE, une ligne par
 *    personne, créée au besoin : un « ne pas déranger » se réécrit plusieurs fois
 *    par jour, il ne va pas sur le profil que chaque requête relit.
 *  · `voicemails` — les messages laissés à un correspondant injoignable,
 *    déposés par l'appelant lui-même depuis son navigateur.
 *  · `personPresence` — la présence d'une personne DANS un réseau (un battement
 *    toutes les 30 s par écran ouvert) : un appel du réseau ne sonne que là où
 *    une application de ce réseau est ouverte.
 */
import { defineTable } from "convex/server"
import { v } from "convex/values"

import {
  autoMeetingDndValidator,
  callAdmissionReasonValidator,
  callEndReasonValidator,
  callKindValidator,
  callLifecycleStatusValidator,
  callMediaTypeValidator,
  callParticipantRoleValidator,
  callStatusValidator,
  dndStateValidator,
  groupCallInviteStatusValidator,
  outsideRelationsCallsValidator,
  presenceStatusValidator,
  ringtonePrefsValidator,
} from "./validators"

export const callsTables = {
  calls: defineTable({
    networkId: v.id("networks"),
    /** Tête-à-tête ou groupe — un appel de groupe n'est PAS une réunion : il sonne. */
    kind: callKindValidator,
    /** Le document : vivant, ou terminé (la ligne demeure au journal). */
    status: callLifecycleStatusValidator,
    /** La machine d'états de l'appel (composé, sonne, décroché, parqué, et trois fins). */
    callStatus: callStatusValidator,
    /** La salle du serveur multimédia — un nom reconnaissable, jamais une donnée métier. */
    roomName: v.string(),
    /** Présentation système stable, UUIDv4 réel ; jamais une preuve d'accès. */
    systemCallUuid: v.optional(v.string()),
    createdByPersonId: v.id("persons"),
    /**
     * Le DESTINATAIRE d'un tête-à-tête, dénormalisé : « ce qui sonne chez moi »
     * et « ce qu'on m'a adressé » sont des lectures indexées. Absent pour un
     * appel de groupe : ses destinataires sont des tickets.
     */
    calleePersonId: v.optional(v.id("persons")),
    mediaType: callMediaTypeValidator,
    /** Le plafond PHOTOGRAPHIÉ au lancement (2 en tête-à-tête, au plus 11 en groupe) : changer de règle ne rétrécit pas un appel en cours. */
    maxParticipants: v.number(),
    answeredByPersonId: v.optional(v.id("persons")),
    answeredAt: v.optional(v.number()),
    /** L'appelé tenait DÉJÀ une communication quand l'appel a été admis : l'appelant entend la tonalité « occupé » pendant la sonnerie. */
    calleeEngagedAtCreate: v.optional(v.boolean()),
    /** Comment l'appel a fini — un refus d'admission y porte sa raison (le journal des DEUX côtés la lit). */
    endReason: v.optional(callEndReasonValidator),
    /** Le PREMIER parcage fait foi : deux attentes croisées ne remettent pas le chronomètre à zéro. */
    parkedAt: v.optional(v.number()),
    /** L'appelant a parqué AVANT le décrochage : l'appel atterrit en attente, pas en communication. */
    holdOnAnswer: v.optional(v.boolean()),
    /** QUI tient l'attente — `on_hold` ⇔ non vide ; la ligne ne revient qu'au DERNIER qui reprend. */
    heldBy: v.optional(v.array(v.id("persons"))),
    /** Mot laissé par l'appelé en refusant (« je vous rappelle dans 10 minutes »), lu par l'appelant. */
    declineNote: v.optional(v.string()),
    /** Le fil de groupe d'où part l'appel : un fil n'a qu'un appel vivant, et le droit d'y être se relit sur le fil. */
    groupThreadId: v.optional(v.id("groupThreads")),
    /** P10 : tête-à-tête soumis aux droits et consentements commerciaux vivants. */
    commercialThreadId: v.optional(v.id("commercialThreads")),
    /**
     * CC-4 (CONVERSATION-CONTEXTUELLE-V1 §3.2, §11.3) : tête-à-tête d'une conversation contextuelle,
     * soumis aux accords explicites des deux personnes DANS ce fil. EXCLUSIF de `commercialThreadId` :
     * un appel porte au plus un contexte (sélecteur `calls/conversation.ts`).
     */
    contextualThreadId: v.optional(v.id("contextualThreads")),
    startedAt: v.number(),
    endedAt: v.optional(v.number()),
  })
    // Ce que j'ai lancé dans ce réseau, le plus récent d'abord : le journal, et les appels périmés à clore.
    .index("by_network_creator", ["networkId", "createdByPersonId"])
    // Ce qui m'est adressé : `active` = ce qui sonne maintenant, `ended` = l'historique reçu, chacun dans l'ordre chronologique.
    .index("by_network_callee_status", ["networkId", "calleePersonId", "status"])
    // Le nettoyage périodique, par état.
    .index("by_callStatus", ["callStatus"])
    // L'appel vivant d'un fil de groupe.
    .index("by_groupThread_status", ["groupThreadId", "status"])
    .index("by_commercial_thread_status", ["commercialThreadId", "status"])
    .index("by_status_commercial_thread", ["status", "commercialThreadId"])
    // CC-4 : l'appel vivant d'un fil contextuel (au plus un), et la revalidation paginée des appels contextuels vivants.
    .index("by_contextual_thread_status", ["contextualThreadId", "status"])
    .index("by_status_contextual_thread", ["status", "contextualThreadId"]),

  /** Une personne d'un appel : l'hôte (qui a composé) ou un participant (appelé, invité). */
  callParticipants: defineTable({
    networkId: v.id("networks"),
    callId: v.id("calls"),
    personId: v.id("persons"),
    role: callParticipantRoleValidator,
    /** Premier appareil gagnant ; privés, jamais rendus dans les DTO ni l'export. */
    ownerSessionId: v.optional(v.string()), ownerDeviceId: v.optional(v.string()),
    ownerApplicationId: v.optional(v.string()), ownerBindingId: v.optional(v.string()),
    ownerKind: v.optional(v.union(v.literal("web"), v.literal("native"))),
    /** Entré dans la salle (décroché, ou rejoint). Absent : pas encore, ou jamais. */
    joinedAt: v.optional(v.number()),
    /** Parti — posé aussi sur TOUTES les lignes d'un appel qui finit (invariant de l'en-tête). */
    leftAt: v.optional(v.number()),
  })
    // Ma ligne sur un appel ; et, par préfixe, toutes les lignes d'un appel (bornées par construction).
    .index("by_call_person", ["callId", "personId"])
    // Mes lignes VIVANTES dans un réseau (`leftAt` absent) : suis-je en appel ?
    .index("by_network_person_leftAt", ["networkId", "personId", "leftAt"]),

  /**
   * Un TICKET d'appel de groupe. `status` n'est pas la présence : « joined » dit
   * qu'il a DÉCROCHÉ ; qu'il soit encore dans la salle se lit sur sa ligne de
   * participation. Les deux se fusionnent à la lecture (`callGroup`).
   */
  callInvites: defineTable({
    networkId: v.id("networks"),
    callId: v.id("calls"),
    personId: v.id("persons"),
    status: groupCallInviteStatusValidator,
    /** Refus AUTOMATIQUE (ses réglages) : la raison — l'hôte lit « indisponible » plutôt qu'un silence. */
    reason: v.optional(callAdmissionReasonValidator),
    invitedAt: v.number(),
    respondedAt: v.optional(v.number()),
  })
    // Le ticket d'une personne sur un appel ; et, par préfixe, tous les tickets d'un appel.
    .index("by_call_person", ["callId", "personId"])
    // Les appels de groupe qui SONNENT chez moi dans ce réseau.
    .index("by_network_person_status", ["networkId", "personId", "status"])
    // Les appels de groupe où l'on m'a convié — le journal (un appel de groupe n'a pas de destinataire unique).
    .index("by_network_person_invitedAt", ["networkId", "personId", "invitedAt"]),

  /** Les réglages d'appel d'une personne — absents = défauts (`preferences.getMine`). */
  callPreferences: defineTable({
    personId: v.id("persons"),
    /** Absent = pas de silence. Un `until` dépassé est ignoré, jamais nettoyé. */
    dnd: v.optional(dndStateValidator),
    ringtone: v.optional(ringtonePrefsValidator),
    /** Signaler un second appel pendant une communication. Absent = `true` ; `false` fait répondre « occupé ». */
    callWaiting: v.optional(v.boolean()),
    /** Réponses rapides proposées au refus (bornées) ; absentes = celles, traduites, de l'écran. */
    quickReplies: v.optional(v.array(v.string())),
    /** Accepter qu'un appelant éconduit laisse un message vocal. Absent = `true`. */
    voicemailEnabled: v.optional(v.boolean()),
    autoMeetingDnd: v.optional(autoMeetingDndValidator),
    /** Laisser mes RELATIONS voir ma pastille (disponible, en appel, silence). Absent = `true`. Jamais un annuaire public. */
    sharePresence: v.optional(v.boolean()),
    /** Recevoir une sonnerie poussée hors de l'onglet. Absent = `true`. */
    pushIncoming: v.optional(v.boolean()),
    outsideRelationsCalls: v.optional(outsideRelationsCallsValidator),
    /** Dernière ouverture du journal : borne le compteur d'appels manqués que l'écran affiche. */
    journalSeenAt: v.optional(v.number()),
    updatedAt: v.number(),
  }).index("by_person", ["personId"]),

  /** Un message vocal laissé à un correspondant qui n'a pas pu être joint. */
  voicemails: defineTable({
    networkId: v.id("networks"),
    recipientPersonId: v.id("persons"),
    fromPersonId: v.id("persons"),
    /** L'appel refusé ou manqué qui a donné lieu au message — un appel n'en accepte qu'UN. */
    callId: v.id("calls"),
    /** Un dépôt NEUF de l'appelant, sous la garde des fichiers (usage `voice`). */
    audioStorageId: v.id("_storage"),
    durationMs: v.number(),
    isRead: v.boolean(),
    readAt: v.optional(v.number()),
    createdAt: v.number(),
  })
    // Ma messagerie vocale dans ce réseau, la plus récente d'abord.
    .index("by_network_recipient_createdAt", ["networkId", "recipientPersonId", "createdAt"])
    // Un appel n'accepte qu'UN message : cet index porte l'idempotence.
    .index("by_call", ["callId"]),

  /** La présence d'une personne dans un réseau — ce que voient ses relations, et ce qui prouve qu'elle est hors ligne. */
  personPresence: defineTable({
    networkId: v.id("networks"),
    personId: v.id("persons"),
    status: presenceStatusValidator,
    lastHeartbeat: v.number(),
  })
    .index("by_network_person", ["networkId", "personId"])
    // Le passage périodique : les présences « en ligne » dont le battement s'est tu (D26 : indexé, jamais un balayage de table).
    .index("by_status_lastHeartbeat", ["status", "lastHeartbeat"]),
}
