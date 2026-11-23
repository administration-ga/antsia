import { describe, expect, it } from "vitest"
import { conversationFilterCount, filtrerConversations, ICOM_VIEWS, icomViewFromBrique, icomViewHref, parseConversationFilter, servedConversationFilters, servedIcomView, servedIcomViews } from "./icom-views"

describe("CH-817 — la vue Appels n'est servie que si l'application propose des appels", () => {
	it("appels proposés : trois vues, `?brique=iappel` mène aux Appels (inchangé)", () => {
		expect(servedIcomViews(true).map((view) => view.id)).toEqual(["conversations", "appels", "contacts"])
		expect(icomViewFromBrique("iappel", true)).toBe("appels")
		expect(icomViewFromBrique("iappel")).toBe("appels")
	})
	it("appels fermés : deux vues, et un lien vers les Appels ouvre les Conversations", () => {
		expect(servedIcomViews(false).map((view) => view.id)).toEqual(["conversations", "contacts"])
		expect(icomViewFromBrique("iappel", false)).toBe("conversations")
		expect(servedIcomView("appels", false)).toBe("conversations")
		expect(servedIcomView("contacts", false)).toBe("contacts")
	})
})

describe("vues P05 et filtres réellement servis", () => {
	it("offre trois vues et conserve les adresses historiques des appels et contacts", () => {
		expect(ICOM_VIEWS.map((view) => view.id)).toEqual(["conversations", "appels", "contacts"])
		expect(icomViewHref("conversations", "/messages")).toBe("/messages")
		expect(icomViewHref("appels", "/messages")).toBe("/messages?brique=iappel")
		expect(icomViewHref("contacts", "/messages")).toBe("/messages?brique=icontact")
		expect(icomViewFromBrique("actus")).toBe("conversations")
	})
	it("ne rend ni n’adresse un filtre commercial réservé à P10", () => {
		expect(servedConversationFilters().map((filter) => filter.id)).toEqual(["toutes", "non_lues", "groupes"])
		expect(parseConversationFilter("boutiques")).toBe("toutes")
		expect(parseConversationFilter("inconnu")).toBe("toutes")
	})
	it("filtre les vrais non-lus chargés des deux familles puis trie par activité", () => {
		const read = { id: "read", lastMessageAt: 30, unreadCount: 0 }
		const direct = { id: "direct", lastMessageAt: 10, unreadCount: 2 }
		const group = { id: "group", lastMessageAt: 20, unreadCount: 1 }
		expect(filtrerConversations([read, direct], [group], "non_lues")).toEqual([{ kind: "groupe", groupe: group }, { kind: "chat", chat: direct }])
		expect(filtrerConversations([read, direct], [group], "groupes")).toEqual([{ kind: "groupe", groupe: group }])
	})
	it("emploie les décomptes serveur et ne fabrique aucun nombre de conversations", () => {
		const totals = { total: { total: 99, capped: true }, groupes: { total: 12, capped: false } }
		expect(conversationFilterCount("non_lues", totals)).toBe(totals.total)
		expect(conversationFilterCount("groupes", totals)).toBe(totals.groupes)
		expect(conversationFilterCount("toutes", totals)).toBeNull()
	})
})
