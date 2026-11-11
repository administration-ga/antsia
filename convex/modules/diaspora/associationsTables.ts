/**
 * Tables des adhésions aux associations DIASPORALE (DG-010) — PROPRIÉTAIRE :
 * chantier « associations » de la session DIASPORALE ; agrégées par `tables.ts`,
 * donc par `convex/schema.ts`.
 *
 * `associationMemberships` : UNE ligne par personne et par page d'association,
 * qui porte le DERNIER état de son adhésion (règles pures dans
 * `@diasporale/domain/associations`). Elle naît TOUJOURS d'une demande de la
 * personne : aucune fonction n'en crée pour autrui, aucun import n'en écrit.
 * Distincte de l'abonnement à la page (`pageFollows`) : suivre l'actualité
 * n'est pas adhérer. Aucune coordonnée, aucun nom n'y est stocké (le nom
 * affiché vient du profil publié, relu à la lecture). Ce n'est pas un registre
 * légal d'adhérents.
 */
import {
  ASSOCIATION_LIST_STATUSES,
  ASSOCIATION_MEMBER_ROLES,
  ASSOCIATION_MEMBERSHIP_STATUSES,
  ASSOCIATION_RESPONSIBLE_ROLES,
} from "@diasporale/domain"
import { defineTable } from "convex/server"
import { v } from "convex/values"

import { literals } from "../../lib/validators"

export const associationMembershipStatusValidator = literals(ASSOCIATION_MEMBERSHIP_STATUSES)
export const associationMemberRoleValidator = literals(ASSOCIATION_MEMBER_ROLES)
export const associationResponsibleRoleValidator = literals(ASSOCIATION_RESPONSIBLE_ROLES)
export const associationListStatusValidator = literals(ASSOCIATION_LIST_STATUSES)

export const associationsTables = {
  associationMemberships: defineTable({
    networkId: v.id("networks"),
    /** La page d'ASSOCIATION (jamais une entreprise ni une institution). */
    pageId: v.id("pages"),
    /** La personne qui a demandé : la seule à pouvoir faire naître, annuler ou quitter cette adhésion. */
    personId: v.id("persons"),
    status: associationMembershipStatusValidator,
    /** Rôle d'adhérent (`member`, `animator`) : aucun droit sur la page ni sur la liste. */
    role: associationMemberRoleValidator,
    /** Le mot facultatif joint à la demande (borné par le domaine). */
    requestMessage: v.optional(v.string()),
    /** Le motif de la dernière décision : facultatif pour un refus, obligatoire pour une exclusion. */
    decisionReason: v.optional(v.string()),
    /** La dernière demande. */
    requestedAt: v.number(),
    /** Le dernier changement d'état (ordre des listes ; un changement de rôle ne le touche pas). */
    statusChangedAt: v.number(),
    /** La dernière décision des responsables (acceptation, refus, exclusion)… */
    decidedAt: v.optional(v.number()),
    /** …et qui l'a prise (journal ; jamais montré à la personne concernée). */
    decidedByPersonId: v.optional(v.id("persons")),
    /** Après une exclusion : la décision des responsables qui autorise une nouvelle demande. */
    readmissionAllowedAt: v.optional(v.number()),
    /** Version de la ligne : tout geste l'incrémente ; un geste de gestion cite la version lue. */
    version: v.number(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    // Les demandes, adhérents et exclusions d'une association, dans l'ordre de leur état.
    .index("by_network_and_page_and_status_and_statusChangedAt", ["networkId", "pageId", "status", "statusChangedAt"])
    // Mes associations, les plus récemment changées d'abord.
    .index("by_network_and_person_and_statusChangedAt", ["networkId", "personId", "statusChangedAt"])
    // Ma ligne pour une association (une au plus).
    .index("by_network_and_page_and_person", ["networkId", "pageId", "personId"])
    // DP-F1 (antsia#166) : l'export et l'effacement d'une personne lisent ces lignes par index, sans balayage.
    .index("by_decidedByPersonId", ["decidedByPersonId"]),
}
