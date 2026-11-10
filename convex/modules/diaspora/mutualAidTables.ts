/**
 * Tables du chantier « entraide » (DG-024 a) de la session DIASPORALE —
 * PROPRIÉTAIRE : ce chantier ; agrégées par `tables.ts`, donc par `convex/schema.ts`.
 * Noms imposés par le coordinateur (globaux au schéma) : `aidQuestions`,
 * `aidAnswers`, `aidMissions`, `aidMissionSignups`.
 *
 * - `aidQuestions` : une question d'entraide d'une PERSONNE, dans un pays de
 *   résidence (jamais le Gabon) et une ville SAISIE facultative (repliée dans
 *   `cityKey`, aucun GPS). Sa réponse retenue, choisie par son auteur, est une
 *   référence (une seule, révocable). `answerCount` compte les réponses
 *   PUBLIÉES (lecture des listes sans balayage) ; `version` ne suit que les
 *   gestes de l'auteur (une réponse nouvelle ne périme pas sa lecture).
 *   `searchText` (ET-04) : le titre et le détail en mots repliés, écrit à chaque
 *   question posée ou modifiée ; facultatif pour les lignes d'avant le champ (elles
 *   restent listées, seule la recherche par mots ne les trouve pas).
 * - `aidAnswers` : une réponse d'une personne à une question ; retirée, elle
 *   reste au journal sans être servie.
 * - `aidMissions` : une mission bénévole d'une PAGE d'association ; aucune
 *   référence personnelle (le signataire qui la saisit parle pour la page).
 *   `signupCount` compte les inscriptions confirmées, relu et écrit dans la
 *   transaction de chaque inscription : aucune place n'est donnée deux fois.
 * - `aidMissionSignups` : UNE ligne par personne et par mission (dernier état),
 *   née du seul geste de la personne, avec son consentement HORODATÉ à montrer
 *   son nom publié à l'équipe de la page.
 *
 * Aucune coordonnée, aucun nom stocké : le nom affiché vient du profil publié,
 * relu à la lecture. Toutes portent `networkId`.
 */
import {
  AID_ANSWER_STATUSES,
  AID_MISSION_STATUSES,
  AID_QUESTION_LIST_STATUSES,
  AID_QUESTION_STATUSES,
  AID_SIGNUP_STATUSES,
  AID_THEMES,
} from "@diasporale/domain"
import { defineTable } from "convex/server"
import { v } from "convex/values"

import { literals } from "../../lib/validators"

export const aidThemeValidator = literals(AID_THEMES)
export const aidQuestionStatusValidator = literals(AID_QUESTION_STATUSES)
export const aidQuestionListStatusValidator = literals(AID_QUESTION_LIST_STATUSES)
export const aidAnswerStatusValidator = literals(AID_ANSWER_STATUSES)
export const aidMissionStatusValidator = literals(AID_MISSION_STATUSES)
export const aidSignupStatusValidator = literals(AID_SIGNUP_STATUSES)

export const mutualAidTables = {
  aidQuestions: defineTable({
    networkId: v.id("networks"),
    /** La personne qui demande : la seule à modifier, retenir une réponse, clore ou retirer. */
    authorPersonId: v.id("persons"),
    title: v.string(),
    /** Le détail, éventuellement vide (la question tient alors dans son titre). */
    detail: v.string(),
    theme: aidThemeValidator,
    /** Pays de résidence ISO 3166-1 alpha-2, jamais le Gabon. */
    country: v.string(),
    /** Ville saisie, sans GPS ; absente : tout le pays. */
    city: v.optional(v.string()),
    /** La ville repliée : clé d'index des filtres par ville. */
    cityKey: v.optional(v.string()),
    status: aidQuestionStatusValidator,
    /** La réponse retenue par l'auteur : une seule, révocable ; relue publiée à chaque lecture. */
    acceptedAnswerId: v.optional(v.id("aidAnswers")),
    /** Les réponses PUBLIÉES (plafond du domaine). */
    answerCount: v.number(),
    /** Version de la ligne : chaque geste de l'auteur l'incrémente et cite la version lue. */
    version: v.number(),
    editedAt: v.optional(v.number()),
    resolvedAt: v.optional(v.number()),
    closedAt: v.optional(v.number()),
    withdrawnAt: v.optional(v.number()),
    /** ET-04 — le texte cherché (titre et détail repliés, `aidQuestionSearchText`) ; jamais une coordonnée ni l'auteur. */
    searchText: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    // Les questions d'un pays, par état, les plus récentes d'abord.
    .index("by_network_country_status_createdAt", ["networkId", "country", "status", "createdAt"])
    // …et d'une ville saisie de ce pays.
    .index("by_network_country_city_status_createdAt", ["networkId", "country", "cityKey", "status", "createdAt"])
    // ET-04 — …d'un thème de ce pays ; et celles qui n'ont encore aucune réponse publiée.
    .index("by_network_country_status_theme_createdAt", ["networkId", "country", "status", "theme", "createdAt"])
    .index("by_network_country_status_answerCount_createdAt", ["networkId", "country", "status", "answerCount", "createdAt"])
    // Mes questions (et l'export ou l'effacement de la personne).
    .index("by_network_author_createdAt", ["networkId", "authorPersonId", "createdAt"])
    // ET-04 — chercher par mots dans un pays, un état et un thème (la ville et « sans réponse » se rejugent).
    .searchIndex("search_by_text", { searchField: "searchText", filterFields: ["networkId", "country", "status", "theme"] }),

  aidAnswers: defineTable({
    networkId: v.id("networks"),
    questionId: v.id("aidQuestions"),
    authorPersonId: v.id("persons"),
    body: v.string(),
    status: aidAnswerStatusValidator,
    /** Version de la réponse : son auteur la cite pour la modifier ou la retirer. */
    version: v.number(),
    editedAt: v.optional(v.number()),
    withdrawnAt: v.optional(v.number()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    // Les réponses publiées d'une question, dans l'ordre où elles sont arrivées.
    .index("by_network_question_status_createdAt", ["networkId", "questionId", "status", "createdAt"])
    // Mes réponses (et l'export ou l'effacement de la personne).
    .index("by_network_author_createdAt", ["networkId", "authorPersonId", "createdAt"]),

  aidMissions: defineTable({
    networkId: v.id("networks"),
    /** La page d'ASSOCIATION qui porte la mission ; ses signataires vivants la gèrent. */
    pageId: v.id("pages"),
    title: v.string(),
    description: v.string(),
    country: v.string(),
    city: v.string(),
    cityKey: v.string(),
    /** Lieu APPROXIMATIF facultatif (quartier, repère), jamais une adresse exacte. */
    area: v.optional(v.string()),
    /** Début et fin facultative, en millisecondes UTC… */
    startsAt: v.number(),
    endsAt: v.optional(v.number()),
    /** …et le fuseau IANA dans lequel l'équipe les a pensés (affichage). */
    timeZone: v.string(),
    /** Places de 1 à 500. */
    places: v.number(),
    /** Inscriptions confirmées, écrites dans la transaction de chaque inscription ou retrait. */
    signupCount: v.number(),
    status: aidMissionStatusValidator,
    /** Le motif facultatif d'une annulation, lu par les inscrits. */
    cancelReason: v.optional(v.string()),
    /** Version de la mission : chaque geste de l'équipe l'incrémente ; une inscription ne la change pas. */
    version: v.number(),
    closedAt: v.optional(v.number()),
    cancelledAt: v.optional(v.number()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    // Les missions d'un pays, par état, des plus proches aux plus lointaines.
    .index("by_network_country_status_startsAt", ["networkId", "country", "status", "startsAt"])
    // …et d'une ville saisie de ce pays.
    .index("by_network_country_city_status_startsAt", ["networkId", "country", "cityKey", "status", "startsAt"])
    // Les missions d'une page (son équipe).
    .index("by_network_page_startsAt", ["networkId", "pageId", "startsAt"]),

  aidMissionSignups: defineTable({
    networkId: v.id("networks"),
    missionId: v.id("aidMissions"),
    /** La personne qui s'inscrit : la seule à faire naître ou retirer cette ligne. */
    personId: v.id("persons"),
    status: aidSignupStatusValidator,
    /** Le consentement explicite à montrer son nom publié à l'équipe de la page, horodaté. */
    nameConsentAt: v.number(),
    /** La dernière inscription (ordre des listes de l'équipe et de « Mes inscriptions »). */
    signedUpAt: v.number(),
    withdrawnAt: v.optional(v.number()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    // Les inscrits d'une mission, dans l'ordre d'arrivée (son équipe seulement).
    .index("by_network_mission_status_signedUpAt", ["networkId", "missionId", "status", "signedUpAt"])
    // Ma ligne pour une mission (une au plus).
    .index("by_network_mission_person", ["networkId", "missionId", "personId"])
    // Mes inscriptions, les plus récentes d'abord.
    .index("by_network_person_status_signedUpAt", ["networkId", "personId", "status", "signedUpAt"]),
}
