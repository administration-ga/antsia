/**
 * CC-1 (contrat CONVERSATION-CONTEXTUELLE-V1, ADR-0025) — règles pures des conversations
 * contextuelles. Tests ÉCRITS, NON EXÉCUTÉS (décision du propriétaire du 18/10/2026 : « Continuer
 * sans vérifier »).
 */
import { describe, expect, it } from "vitest"

import { commercialIdempotencyKey, commercialText } from "./commercialContact"
import {
  CONTEXTUAL_ATTACHMENTS_MAX,
  CONTEXTUAL_KINDS,
  CONTEXTUAL_LEGACY_V1_KINDS,
  CONTEXTUAL_SUPPORTED_KINDS,
  CONTEXTUAL_MODERATION_SURFACE,
  CONTEXTUAL_NOTIFICATION_KINDS,
  CONTEXTUAL_NOTIFICATION_SUBJECT,
  CONTEXTUAL_PURGE_SLICE,
  CONTEXTUAL_REFERENCE_FIELD_LIST,
  CONTEXTUAL_REFERENCE_FIELDS,
  CONTEXTUAL_REFERENCE_TABLES,
  CONTEXTUAL_REFUSALS,
  CONTEXTUAL_RESERVED_KINDS,
  CONTEXTUAL_RESPONDER_KINDS,
  CONTEXTUAL_RETENTION,
  CONTEXTUAL_TEAM_NOTICE_MAX,
  CONTEXTUAL_TEXT_MAX,
  type ContextualCapabilityInput,
  contextualCallAllowed,
  contextualCallAuthorityKey,
  contextualCallConsentAllowed,
  contextualCapabilities,
  contextualDigestMaterial,
  contextualIdempotencyKey,
  contextualKey,
  contextualModerationLabel,
  contextualPolicyOpen,
  contextualReferencesConsistent,
  contextualReplay,
  contextualText,
  contextualUnread,
  contextualViewerSide,
  contextualViewState,
  contextualVoiceOf,
  isContextualKind,
  isContextualNotificationKind,
  isContextualPartyLive,
  isReservedContextualKind,
  nextContextualCache,
  orderTeamRecipients,
  otherContextualSide,
  parseContextualKey,
  strictestStatus,
} from "./contextualMessaging"
import { MODERATION_SURFACES } from "./moderationPolicy"
import { notificationCategory } from "./notificationDelivery"
import { NOTIFICATION_KINDS, NOTIFICATION_SUBJECT_KINDS } from "./notifications"
import { DOMAIN_RULES } from "./violation"

const OPEN_SERVICE_SENT: ContextualCapabilityInput = {
  phase: "open",
  closedBySide: false,
  policyOpen: true,
  counterpartAvailable: true,
  side: "requester",
  responderFirst: true,
  firstWordAcquired: false,
  attachments: { requester: true, responder: true },
  writeStatusSatisfied: true,
}

describe("CC-1 — natures fermées et noms réservés", () => {
  it("préserve les trois natures V1 et ajoute la collaboration professionnelle dans chaque registre fermé", () => {
    expect(CONTEXTUAL_LEGACY_V1_KINDS).toEqual(["diasporaServiceRequest", "diasporaMentoring", "diasporaJobApplication"])
    expect(CONTEXTUAL_KINDS).toEqual(CONTEXTUAL_LEGACY_V1_KINDS)
    expect(CONTEXTUAL_SUPPORTED_KINDS).toEqual([...CONTEXTUAL_LEGACY_V1_KINDS, "professionalCollaboration"])
    expect(CONTEXTUAL_REFERENCE_FIELDS).toEqual({ diasporaServiceRequest: "serviceRequestId", diasporaMentoring: "mentoringRequestId", diasporaJobApplication: "jobApplicationId", professionalCollaboration: "professionalCollaborationId" })
    expect(CONTEXTUAL_REFERENCE_TABLES).toEqual({ diasporaServiceRequest: "serviceRequests", diasporaMentoring: "mentoringRequests", diasporaJobApplication: "jobApplications", professionalCollaboration: "professionalCollaborations" })
    expect(CONTEXTUAL_RESPONDER_KINDS).toEqual({ diasporaServiceRequest: "page", diasporaMentoring: "person", diasporaJobApplication: "page", professionalCollaboration: "person" })
    expect(CONTEXTUAL_REFERENCE_FIELD_LIST).toEqual(["serviceRequestId", "mentoringRequestId", "jobApplicationId", "professionalCollaborationId"])
  })

  it("une nature réservée ou inconnue n'est jamais une nature V1 (N03)", () => {
    expect(CONTEXTUAL_RESERVED_KINDS).toEqual(["commerceJobApplication", "shopContact"])
    for (const reserved of CONTEXTUAL_RESERVED_KINDS) {
      expect(isContextualKind(reserved), reserved).toBe(false)
      expect(isReservedContextualKind(reserved), reserved).toBe(true)
      expect(contextualKey(reserved, "abc123"), reserved).toBeNull()
    }
    for (const value of ["", "diaspora", "DiasporaMentoring", "toString", "__proto__", 42, null, undefined]) expect(isContextualKind(value), String(value)).toBe(false)
    for (const kind of CONTEXTUAL_SUPPORTED_KINDS) expect(isContextualKind(kind)).toBe(true)
  })

  it("un fil porte EXACTEMENT la référence de sa nature", () => {
    expect(contextualReferencesConsistent("diasporaServiceRequest", { serviceRequestId: "r1" })).toBe(true)
    expect(contextualReferencesConsistent("diasporaServiceRequest", {})).toBe(false)
    expect(contextualReferencesConsistent("diasporaServiceRequest", { serviceRequestId: "r1", jobApplicationId: "a1" })).toBe(false)
    expect(contextualReferencesConsistent("diasporaMentoring", { serviceRequestId: "r1" })).toBe(false)
    expect(contextualReferencesConsistent("diasporaJobApplication", { jobApplicationId: "" })).toBe(false)
    expect(contextualReferencesConsistent("professionalCollaboration", { professionalCollaborationId: "c1" })).toBe(true)
    expect(contextualReferencesConsistent("professionalCollaboration", { professionalCollaborationId: "c1", mentoringRequestId: "m1" })).toBe(false)
    expect(contextualReferencesConsistent("diasporaMentoring", { mentoringRequestId: "m1", professionalCollaborationId: "c1" })).toBe(false)
  })

  it("la clé de contexte est « nature:identifiant », relue sans ambiguïté", () => {
    expect(contextualKey("diasporaMentoring", "k57abc_9-x")).toBe("diasporaMentoring:k57abc_9-x")
    expect(parseContextualKey("diasporaMentoring:k57abc_9-x")).toEqual({ kind: "diasporaMentoring", objectId: "k57abc_9-x" })
    for (const id of ["", "a b", "a:b", "x".repeat(129), "é"]) expect(contextualKey("diasporaMentoring", id), id).toBeNull()
    for (const key of ["", ":abc", "shopContact:abc", "diasporaMentoring:", "diasporaMentoring:a:b", "inconnue:abc"]) expect(parseContextualKey(key), key).toBeNull()
  })
})

describe("CC-1 — côtés, voix et états", () => {
  it("le demandeur d'abord : un demandeur devenu signataire n'agit jamais en voix de page (N08)", () => {
    expect(contextualViewerSide({ viewerPersonId: "p1", requesterPersonId: "p1", viewerIsLiveResponderSignatory: true })).toBe("requester")
    expect(contextualViewerSide({ viewerPersonId: "p2", requesterPersonId: "p1", viewerIsLiveResponderSignatory: true })).toBe("responder")
    expect(contextualViewerSide({ viewerPersonId: "p2", requesterPersonId: "p1", viewerIsLiveResponderSignatory: false })).toBeNull()
    // Côté PERSONNE : seule la personne de l'objet ; une signature ne compte pas.
    expect(contextualViewerSide({ viewerPersonId: "p2", requesterPersonId: "p1", responderPersonId: "p2", viewerIsLiveResponderSignatory: false })).toBe("responder")
    expect(contextualViewerSide({ viewerPersonId: "p3", requesterPersonId: "p1", responderPersonId: "p2", viewerIsLiveResponderSignatory: true })).toBeNull()
  })

  it("deux voix : le demandeur sous son nom, le répondant sous celui de la page ou le sien", () => {
    expect(contextualVoiceOf("diasporaServiceRequest", "requester")).toBe("person")
    expect(contextualVoiceOf("diasporaServiceRequest", "responder")).toBe("page")
    expect(contextualVoiceOf("diasporaJobApplication", "responder")).toBe("page")
    expect(contextualVoiceOf("diasporaMentoring", "responder")).toBe("person")
    expect(otherContextualSide("requester")).toBe("responder")
    expect(otherContextualSide("responder")).toBe("requester")
  })

  it("fermée l'emporte sur indisponible ; la politique fermée ferme (D10) ; `not_open` est en lecture seule", () => {
    const base = { phase: "open" as const, closedBySide: false, policyOpen: true, counterpartAvailable: true }
    expect(contextualViewState(base)).toBe("open")
    expect(contextualViewState({ ...base, counterpartAvailable: false })).toBe("unavailable")
    expect(contextualViewState({ ...base, phase: "closed", counterpartAvailable: false })).toBe("closed")
    expect(contextualViewState({ ...base, phase: "not_open" })).toBe("closed")
    expect(contextualViewState({ ...base, closedBySide: true })).toBe("closed")
    expect(contextualViewState({ ...base, policyOpen: false })).toBe("closed")
  })

  it("le cache suit l'objet ; la clôture par un côté est irréversible (D12, N18)", () => {
    expect(nextContextualCache({ status: "open" }, "open")).toBe("unchanged")
    expect(nextContextualCache({ status: "open" }, "closed")).toBe("close")
    expect(nextContextualCache({ status: "open" }, "not_open")).toBe("close")
    expect(nextContextualCache({ status: "closed", closedCause: "object" }, "open")).toBe("reopen")
    expect(nextContextualCache({ status: "closed", closedCause: "object" }, "closed")).toBe("unchanged")
    for (const phase of ["open", "closed", "not_open"] as const) expect(nextContextualCache({ status: "closed", closedCause: "side" }, phase), phase).toBe("unchanged")
  })
})

describe("CC-1 — capacités par phase (§6.2)", () => {
  it("service envoyé : le demandeur attend le premier mot du répondant (D4, N23)", () => {
    expect(contextualCapabilities(OPEN_SERVICE_SENT)).toMatchObject({ viewState: "open", canSend: false, canAttach: false, canClose: true, sendRefusal: "CONTEXT_WAITING_RESPONDER" })
    expect(contextualCapabilities({ ...OPEN_SERVICE_SENT, firstWordAcquired: true })).toMatchObject({ canSend: true, canAttach: true, sendRefusal: null })
    expect(contextualCapabilities({ ...OPEN_SERVICE_SENT, side: "responder" })).toMatchObject({ canSend: true, canAttach: true, sendRefusal: null })
    // Proposition (`proposed`) : la tranche rend `responderFirst: false`, l'écriture est libre des deux côtés.
    expect(contextualCapabilities({ ...OPEN_SERVICE_SENT, responderFirst: false })).toMatchObject({ canSend: true, sendRefusal: null })
  })

  it("pièces : selon la phase et le côté, et jamais sans envoi possible", () => {
    const noRequesterFiles = { ...OPEN_SERVICE_SENT, firstWordAcquired: true, attachments: { requester: false, responder: true } }
    expect(contextualCapabilities(noRequesterFiles)).toMatchObject({ canSend: true, canAttach: false, attachRefusal: "CONTEXT_ATTACHMENTS_CLOSED" })
    expect(contextualCapabilities({ ...noRequesterFiles, side: "responder" })).toMatchObject({ canSend: true, canAttach: true, attachRefusal: null })
    expect(contextualCapabilities(OPEN_SERVICE_SENT)).toMatchObject({ canAttach: false, attachRefusal: "CONTEXT_WAITING_RESPONDER" })
  })

  it("chaque état de fermeture refuse l'écriture et garde la lecture (N15, N16, N17)", () => {
    const open = { ...OPEN_SERVICE_SENT, responderFirst: false }
    expect(contextualCapabilities({ ...open, phase: "closed" })).toMatchObject({ viewState: "closed", canSend: false, canAttach: false, canClose: false, sendRefusal: "CONTEXT_CLOSED" })
    expect(contextualCapabilities({ ...open, phase: "not_open" })).toMatchObject({ viewState: "closed", canSend: false, canClose: false, sendRefusal: "CONTEXT_NOT_OPEN" })
    expect(contextualCapabilities({ ...open, closedBySide: true })).toMatchObject({ canSend: false, canClose: false, sendRefusal: "CONTEXT_CLOSED" })
    expect(contextualCapabilities({ ...open, policyOpen: false })).toMatchObject({ viewState: "closed", canSend: false, sendRefusal: "CONTEXT_CLOSED" })
    expect(contextualCapabilities({ ...open, counterpartAvailable: false })).toMatchObject({ viewState: "unavailable", canSend: false, sendRefusal: "CONTEXT_UNAVAILABLE" })
  })

  it("le statut d'écriture manquant ferme l'envoi sans refus contextuel (refus `statusInsufficient` au bord)", () => {
    expect(contextualCapabilities({ ...OPEN_SERVICE_SENT, responderFirst: false, writeStatusSatisfied: false })).toMatchObject({ canSend: false, canAttach: false, sendRefusal: null })
  })

  it("sortir reste possible : clôture tant que l'objet est ouvert et qu'aucun côté n'a clos, même politique fermée", () => {
    expect(contextualCapabilities({ ...OPEN_SERVICE_SENT, policyOpen: false }).canClose).toBe(true)
    expect(contextualCapabilities({ ...OPEN_SERVICE_SENT, counterpartAvailable: false }).canClose).toBe(true)
  })

  it("appels (CC-4) : accord explicite des DEUX côtés, phase engagée, conversation ouverte (N27)", () => {
    expect(contextualCallConsentAllowed({ viewState: "open", callsEngaged: true, writeStatusSatisfied: true, allowed: true })).toBe(true)
    expect(contextualCallConsentAllowed({ viewState: "open", callsEngaged: false, writeStatusSatisfied: true, allowed: true })).toBe(false)
    expect(contextualCallConsentAllowed({ viewState: "closed", callsEngaged: true, writeStatusSatisfied: true, allowed: true })).toBe(false)
    // Retirer un accord est toujours possible.
    expect(contextualCallConsentAllowed({ viewState: "closed", callsEngaged: false, writeStatusSatisfied: false, allowed: false })).toBe(true)
    expect(contextualCallAllowed({ viewState: "open", callsEngaged: true, ownConsent: true, targetConsent: true })).toBeNull()
    expect(contextualCallAllowed({ viewState: "open", callsEngaged: true, ownConsent: true, targetConsent: false })).toBe("CONTEXT_CALL_CONSENT_REQUIRED")
    expect(contextualCallAllowed({ viewState: "open", callsEngaged: false, ownConsent: true, targetConsent: true })).toBe("CONTEXT_CALLS_CLOSED")
    expect(contextualCallAllowed({ viewState: "unavailable", callsEngaged: true, ownConsent: true, targetConsent: true })).toBe("CONTEXT_CLOSED")
  })

  it("une autorité perdue puis retrouvée ne fait pas revivre un ancien accord (N29)", () => {
    const before = contextualCallAuthorityKey({ kind: "page", signatoryRowId: "row1", acceptedAt: 10 })
    const after = contextualCallAuthorityKey({ kind: "page", signatoryRowId: "row1", acceptedAt: 20 })
    expect(before).not.toBe(after)
    expect(contextualCallAuthorityKey({ kind: "person", contextKey: "diasporaMentoring:m1", side: "responder" })).toBe("person:diasporaMentoring:m1:responder")
  })
})

describe("CC-1 — vivacité et statuts", () => {
  it("vivant = profil publié, statut requis, consentement en vigueur (règle de P10)", () => {
    expect(isContextualPartyLive({ profileLive: true, memberAtRequiredStatus: true, socialProfileConsentInForce: true })).toBe(true)
    expect(isContextualPartyLive({ profileLive: false, memberAtRequiredStatus: true, socialProfileConsentInForce: true })).toBe(false)
    expect(isContextualPartyLive({ profileLive: true, memberAtRequiredStatus: false, socialProfileConsentInForce: true })).toBe(false)
    expect(isContextualPartyLive({ profileLive: true, memberAtRequiredStatus: true, socialProfileConsentInForce: false })).toBe(false)
  })

  it("la tranche peut exiger davantage pour écrire, jamais moins que `declaree`", () => {
    expect(strictestStatus("declaree", "en_attente")).toBe("declaree")
    expect(strictestStatus("declaree", "verifiee")).toBe("verifiee")
    expect(strictestStatus("en_attente", "en_attente")).toBe("en_attente")
  })
})

describe("CC-1 — texte, clé et empreinte (règle neutre, parité P10)", () => {
  it("contrôles refusés, NFC, espaces de bord retirés ; vide seulement avec des pièces ; 4 000 au plus (N24)", () => {
    expect(contextualText("  Bonjour Éloïse\nUne question.  ", false)).toEqual({ ok: true, text: "Bonjour Éloïse\nUne question." })
    expect(contextualText("é", false)).toEqual({ ok: true, text: "é" })
    expect(contextualText("bonjour\u0000", false)).toEqual({ ok: false, rule: "CONTEXT_TEXT_CONTROL", params: {} })
    expect(contextualText("a\u0085b", false)).toMatchObject({ ok: false, rule: "CONTEXT_TEXT_CONTROL" })
    expect(contextualText("tab\tet\r\nfin", false)).toMatchObject({ ok: true })
    expect(contextualText("   ", false)).toEqual({ ok: false, rule: "MESSAGE_EMPTY", params: {} })
    expect(contextualText("   ", true)).toEqual({ ok: true, text: "" })
    expect(contextualText("a".repeat(CONTEXTUAL_TEXT_MAX), false)).toMatchObject({ ok: true })
    expect(contextualText("a".repeat(CONTEXTUAL_TEXT_MAX + 1), false)).toEqual({ ok: false, rule: "MESSAGE_TOO_LONG", params: { max: 4000 } })
    expect(CONTEXTUAL_TEXT_MAX).toBe(4000)
  })

  it("parité avec `commercialText` (P10) jusqu'à sa borne : mêmes refus, même texte normalisé", () => {
    const samples = ["Bonjour", "  espaces  ", "", "   ", "ligne\nsuivante", "é", "contrôle\u0007", "nul\u0000", "\u009fbord", "a".repeat(2000), "Tab\tdedans", "😀 emoji"]
    for (const sample of samples) {
      for (const allowEmpty of [false, true]) {
        const neutral = contextualText(sample, allowEmpty)
        const commercial = commercialText(sample, allowEmpty)
        expect(neutral.ok, JSON.stringify(sample)).toBe(commercial !== null)
        if (neutral.ok) expect(neutral.text).toBe(commercial)
      }
    }
  })

  it("clé d'idempotence : 8 à 128 caractères `[A-Za-z0-9_-]`, parité avec P10", () => {
    for (const key of ["message_0001", "AbCdEfGh", "x".repeat(128), "x".repeat(129), "court", "avec espace", "accentué01", "tiret-ok-1", ""]) {
      expect(contextualIdempotencyKey(key), key).toBe(commercialIdempotencyKey(key))
    }
    expect(contextualIdempotencyKey("message_0001")).toBe(true)
    expect(contextualIdempotencyKey("x".repeat(129))).toBe(false)
  })

  it("l'empreinte couvre nature, fil, texte et pièces déclarées, dans leur ordre", () => {
    const file = { storageId: "s1", filename: "a.pdf", mimeType: "application/pdf", sizeBytes: 10 }
    const base = { kind: "diasporaServiceRequest" as const, threadId: "t1", text: "Bonjour", attachments: [file] }
    const reference = contextualDigestMaterial(base)
    expect(contextualDigestMaterial(base)).toBe(reference)
    expect(contextualDigestMaterial({ ...base, kind: "diasporaMentoring" })).not.toBe(reference)
    expect(contextualDigestMaterial({ ...base, threadId: "t2" })).not.toBe(reference)
    expect(contextualDigestMaterial({ ...base, text: "Bonjour !" })).not.toBe(reference)
    expect(contextualDigestMaterial({ ...base, attachments: [{ ...file, sizeBytes: 11 }] })).not.toBe(reference)
    expect(contextualDigestMaterial({ ...base, attachments: [file, { ...file, storageId: "s2" }] })).not.toBe(contextualDigestMaterial({ ...base, attachments: [{ ...file, storageId: "s2" }, file] }))
    expect(contextualDigestMaterial({ ...base, attachments: [{ ...file, durationMs: 1200 }] })).not.toBe(reference)
  })

  it("rejeu : même émetteur et même empreinte → message rendu ; autre empreinte → conflit ; autre personne → jamais un faux succès (N19, N20)", () => {
    const rows = [{ emitterPersonId: "p1", digest: "d1", id: "m1" }, { emitterPersonId: "p2", digest: "d2", id: "m2" }]
    expect(contextualReplay(rows, "p1", "d1")).toEqual({ kind: "replay", row: rows[0] })
    expect(contextualReplay(rows, "p1", "autre")).toEqual({ kind: "conflict" })
    expect(contextualReplay([rows[1]!], "p1", "d2")).toEqual({ kind: "new" })
    expect(contextualReplay([], "p1", "d1")).toEqual({ kind: "new" })
    expect(contextualReplay([{ emitterPersonId: null, digest: "d1" }], "p1", "d1")).toEqual({ kind: "new" })
  })
})

describe("CC-1 — politique, bornes, conservation, avis et modération", () => {
  it("politique fermée par défaut : seule une ligne `enabled: true` ouvre (§5.9)", () => {
    expect(contextualPolicyOpen(null)).toBe(false)
    expect(contextualPolicyOpen(undefined)).toBe(false)
    expect(contextualPolicyOpen({ enabled: false })).toBe(false)
    expect(contextualPolicyOpen({ enabled: true })).toBe(true)
  })

  it("bornes : deux pièces (D9), vingt destinataires d'équipe, vingt messages par tranche de purge ; aucune durée (D7)", () => {
    expect(CONTEXTUAL_ATTACHMENTS_MAX).toBe(2)
    expect(CONTEXTUAL_TEAM_NOTICE_MAX).toBe(20)
    expect(CONTEXTUAL_PURGE_SLICE).toBe(20)
    expect(CONTEXTUAL_RETENTION).toBeNull()
  })

  it("deux genres neutres de catégorie « messages », sujet `contextualThread`", () => {
    expect(CONTEXTUAL_NOTIFICATION_KINDS).toEqual(["contextual_message", "contextual_closed"])
    for (const kind of CONTEXTUAL_NOTIFICATION_KINDS) {
      expect((NOTIFICATION_KINDS as readonly string[]).includes(kind), kind).toBe(true)
      expect(notificationCategory(kind), kind).toBe("messages")
      expect(isContextualNotificationKind(kind)).toBe(true)
    }
    expect(isContextualNotificationKind("commercial_contact")).toBe(false)
    expect((NOTIFICATION_SUBJECT_KINDS as readonly string[]).includes(CONTEXTUAL_NOTIFICATION_SUBJECT)).toBe(true)
  })

  it("surface UNIQUE de modération ; nature dérivée du fil au guichet", () => {
    expect((MODERATION_SURFACES as readonly string[]).includes(CONTEXTUAL_MODERATION_SURFACE)).toBe(true)
    expect(contextualModerationLabel("diasporaServiceRequest")).toBe("contextualMessage · diasporaServiceRequest")
  })

  it("les refus explicites sont des règles du domaine (traduites dans `rules`)", () => {
    for (const refusal of CONTEXTUAL_REFUSALS) expect((DOMAIN_RULES as readonly string[]).includes(refusal), refusal).toBe(true)
  })

  it("avis d'équipe : administrateurs d'abord, vingt au plus", () => {
    const rows = [{ role: "signatory" as const, id: "s1" }, { role: "admin" as const, id: "a1" }, { role: "signatory" as const, id: "s2" }, { role: "admin" as const, id: "a2" }]
    expect(orderTeamRecipients(rows).map((row) => row.id)).toEqual(["a1", "a2", "s1", "s2"])
    expect(orderTeamRecipients(rows, 3).map((row) => row.id)).toEqual(["a1", "a2", "s1"])
    expect(orderTeamRecipients(Array.from({ length: 30 }, (_, index) => ({ role: "signatory" as const, id: `s${index}` })))).toHaveLength(20)
  })

  it("non lu : un message postérieur à la dernière lecture, ou à l'ouverture sans lecture", () => {
    expect(contextualUnread({ lastMessageAt: 10, createdAt: 10 })).toBe(false)
    expect(contextualUnread({ lastMessageAt: 20, createdAt: 10 })).toBe(true)
    expect(contextualUnread({ lastMessageAt: 20, createdAt: 10, readAt: 20 })).toBe(false)
    expect(contextualUnread({ lastMessageAt: 30, createdAt: 10, readAt: 20 })).toBe(true)
  })
})
