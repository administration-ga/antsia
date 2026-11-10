/**
 * IC-02 — la boîte vocale telle que l'écran la lit, et la phrase d'un refus.
 */
import { ConvexError } from "convex/values"
import { describe, expect, it } from "vitest"

import { createAppI18n } from "../../i18n"
import { VOICEMAIL_INBOX_LIMIT, voicemailErrorMessage, voicemailInboxOf, type VoicemailListing } from "./voicemail-inbox"

const t = createAppI18n({ locale: "fr", appResources: { fr: {}, en: {} }, defaultNS: "iappel" }).t
const tEn = createAppI18n({ locale: "en", appResources: { fr: {}, en: {} }, defaultNS: "iappel" }).t

function listing(count: number, unreadCount: number): VoicemailListing {
	const items = Array.from({ length: count }, (_, index) => ({
		voicemailId: `voicemails_${index}`,
		from: { personId: `persons_${index}`, label: { displayName: null, handle: null, headline: null, avatarUrl: null, source: "unknown" } },
		durationMs: 1_000,
		isRead: index >= unreadCount,
		readAt: null,
		createdAt: index,
	}))
	return { items, unreadCount } as unknown as VoicemailListing
}

describe("voicemailInboxOf", () => {
	it("désactivée : vide, sans attente ni erreur — aucune pastille", () => {
		expect(voicemailInboxOf({ data: undefined, isError: true, enabled: false })).toEqual({ items: [], unreadCount: 0, truncated: false, isLoading: false, isError: false })
	})

	it("en attente tant que la réponse manque, en erreur quand le serveur échoue", () => {
		expect(voicemailInboxOf({ data: undefined, isError: false, enabled: true })).toMatchObject({ isLoading: true, isError: false, unreadCount: 0 })
		expect(voicemailInboxOf({ data: undefined, isError: true, enabled: true })).toMatchObject({ isLoading: false, isError: true })
	})

	it("rend la page et le décompte du serveur ; une page pleine est dite tronquée", () => {
		expect(voicemailInboxOf({ data: listing(3, 2), isError: false, enabled: true })).toMatchObject({ unreadCount: 2, truncated: false, isLoading: false })
		expect(voicemailInboxOf({ data: listing(VOICEMAIL_INBOX_LIMIT, 0), isError: false, enabled: true }).truncated).toBe(true)
	})
})

describe("voicemailErrorMessage", () => {
	it("le refus indistinct dit seulement que le message n'est plus là", () => {
		expect(voicemailErrorMessage(new ConvexError({ code: "notFound" }), t)).toBe("Ce message vocal n'est plus disponible.")
		expect(voicemailErrorMessage(new ConvexError({ code: "notFound" }), tEn)).toBe("This voicemail is no longer available.")
	})

	it("un autre code du moteur se traduit tel quel ; le reste reçoit la phrase générique", () => {
		expect(voicemailErrorMessage(new ConvexError({ code: "rateLimited" }), t)).toBe("Trop de tentatives. Réessayez dans quelques instants.")
		expect(voicemailErrorMessage(new Error("réseau"), t)).toBe("L'action n'a pas abouti. Réessayez.")
	})
})
