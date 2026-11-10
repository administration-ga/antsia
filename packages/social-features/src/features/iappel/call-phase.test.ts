// Dupliqué de socle/packages/agent-features/src/features/iappel/call-phase.test.ts @ ad2e7fdc2 — adaptations : phrases lues dans les locales françaises du moteur (`t` réel, clés `iappel:callPhase.…`) ; cas des branches retirées ôtés (poste nommé comme sujet, horaires de poste, secrétariat indisponible, phrase composée par le serveur qui primait) ; listes de raisons ramenées à celles du moteur ; les écrans « Hors ligne » et « Hors de ses relations » gardent leur phrase, désormais composée par l'écran. ; IC-04 : « hors de ses relations » dit à l'appelant comme un appel sans réponse.
import { describe, expect, it } from "vitest"

import { createAppI18n } from "../../i18n"
import {
	callEndKindV2,
	deriveCallPhase,
	describeCallEnd,
	refusalEndKind,
	endLabel,
	isAdmissionRefusal,
	type CallPhaseInput,
} from "./call-phase"

const t = createAppI18n({ locale: "fr", appResources: { fr: {}, en: {} }, defaultNS: "iappel" }).getFixedT("fr")

const ANSWERED = 1_700_000_000_000

function phase(over: Partial<CallPhaseInput> = {}) {
	return deriveCallPhase(
		{
			direction: "outgoing",
			meeting: { status: "active", callStatus: "ringing" },
			connection: "connected",
			hasRemote: false,
			...over,
		},
		t,
	)
}

describe("le chrono ne compte JAMAIS la sonnerie", () => {
	it("pendant la sonnerie, il n'y a rien à compter", () => {
		const p = phase()
		expect(p.phase).toBe("ringing")
		expect(p.timerStart).toBeNull()
	})

	it("il part au décrochage, à l'heure du SERVEUR", () => {
		const p = phase({
			meeting: { status: "active", callStatus: "connected", answeredAt: ANSWERED },
			hasRemote: true,
		})
		expect(p.phase).toBe("active")
		expect(p.timerStart).toBe(ANSWERED)
	})

	it("à défaut, il part du décrochage constaté localement", () => {
		const p = phase({
			meeting: { status: "active", callStatus: "connected" },
			hasRemote: true,
			answeredAtLocal: ANSWERED,
		})
		expect(p.timerStart).toBe(ANSWERED)
	})

	it("une reconnexion NE remet PAS le chrono à zéro", () => {
		// L'appel dure ; c'est le réseau qui hoquette.
		const p = phase({
			meeting: { status: "active", callStatus: "connected", answeredAt: ANSWERED },
			connection: "reconnecting",
		})
		expect(p.phase).toBe("reconnecting")
		expect(p.timerStart).toBe(ANSWERED)
		expect(p.label).toBe("Reconnexion…")
	})
})

describe("les états", () => {
	it("appel sortant inscrit au serveur : sonnerie", () => {
		expect(phase({ meeting: { status: "active", callStatus: "initiating" } }).phase).toBe(
			"ringing",
		)
	})

	it("appel sans statut encore lu : on sonne plutôt que de rester muet", () => {
		expect(phase({ meeting: { status: "active" } }).phase).toBe("ringing")
	})

	it("côté APPELÉ, on n'est jamais en « sonnerie » : on établit la connexion", () => {
		const p = phase({ direction: "incoming", meeting: { status: "active", callStatus: "ringing" } })
		expect(p.phase).toBe("connecting")
		expect(p.label).toBe("Connexion…")
	})

	it("le correspondant est dans la salle : en communication", () => {
		expect(phase({ hasRemote: true }).phase).toBe("active")
	})

	it("mis en attente : état propre, chrono conservé", () => {
		const p = phase({
			meeting: { status: "active", callStatus: "on_hold", answeredAt: ANSWERED },
			isHeld: true,
		})
		expect(p.phase).toBe("held")
		expect(p.timerStart).toBe(ANSWERED)
	})

	it("erreur de salle ou de jeton : échec, pas « appel en cours »", () => {
		expect(phase({ hasError: true }).phase).toBe("failed")
		expect(phase({ connection: "disconnected" }).phase).toBe("failed")
	})

	it("le correspondant m'a mis en attente : état propre, chrono conservé", () => {
		// Celui qui parque RESTE dans la salle : sans cette branche, l'écran
		// affirmait « En communication » alors que plus personne n'entendait.
		const p = phase({
			direction: "incoming",
			meeting: {
				status: "active",
				callStatus: "on_hold",
				callKind: "direct",
				heldBy: ["lui"],
				answeredAt: ANSWERED,
			},
			myUserId: "moi",
			hasRemote: true,
		})
		expect(p.phase).toBe("peer_held")
		expect(p.label).toBe("Mis en attente")
		expect(p.timerStart).toBe(ANSWERED)
		expect(p.endKind).toBeNull()
	})

	it("ma propre attente PRIME — aucun flash au retour", () => {
		// Deux attentes croisées : je suis dans `heldBy`, et lui aussi. Tant
		// que je tiens la ligne, c'est MON attente que l'écran dit. Et à ma
		// reprise, mon slot repasse actif avant que le document ne l'ait dit :
		// l'ordre inverse afficherait « Mis en attente » le temps d'un
		// aller-retour.
		const p = phase({
			meeting: {
				status: "active",
				callStatus: "on_hold",
				callKind: "direct",
				heldBy: ["moi", "lui"],
				answeredAt: ANSWERED,
			},
			myUserId: "moi",
			isHeld: true,
		})
		expect(p.phase).toBe("held")
		expect(p.label).toBe("En attente")
	})

	it("un appel de GROUPE n'a pas d'attente de correspondant", () => {
		// Un appel de groupe ne se met pas en attente, des deux côtés : un
		// `on_hold` hérité ferait basculer toute la grille.
		const p = phase({
			meeting: {
				status: "active",
				callStatus: "on_hold",
				callKind: "group",
				heldBy: ["lui"],
				answeredAt: ANSWERED,
			},
			myUserId: "moi",
			hasRemote: true,
		})
		expect(p.phase).toBe("active")
	})

	it("sans heldBy, on_hold sans isHeld vaut peer_held", () => {
		const tenu = phase({
			meeting: { status: "active", callStatus: "on_hold", answeredAt: ANSWERED },
			myUserId: "moi",
			hasRemote: true,
		})
		expect(tenu.phase).toBe("peer_held")
		// … et l'attente que je pose MOI reste la mienne.
		const mienne = phase({
			meeting: { status: "active", callStatus: "on_hold", answeredAt: ANSWERED },
			myUserId: "moi",
			isHeld: true,
		})
		expect(mienne.phase).toBe("held")
	})

	it("la fin de l'appel prime sur l'attente du correspondant", () => {
		const p = phase({
			meeting: {
				status: "ended",
				callStatus: "on_hold",
				callKind: "direct",
				heldBy: ["lui"],
				endReason: "normal",
			},
			myUserId: "moi",
		})
		expect(p.phase).toBe("ended")
		expect(p.endKind).toBe("ended")
	})

	it("l'attente prime sur la sonnerie, l'échec prime sur tout sauf la fin", () => {
		expect(phase({ isHeld: true, hasError: true }).phase).toBe("failed")
		const fini = phase({
			meeting: { status: "ended", callStatus: "missed" },
			hasError: true,
		})
		expect(fini.phase).toBe("ended")
	})
})

describe("callEndKindV2 — qualifier la fin", () => {
	it("appel encore actif : on n'annonce rien", () => {
		expect(callEndKindV2({ status: "active", callStatus: "ringing" })).toBeNull()
		expect(callEndKindV2(null)).toBeNull()
	})

	it("les refus AUTOMATIQUES du moteur sont distingués", () => {
		for (const reason of ["dnd", "busy", "in_meeting", "outside_relations"] as const) {
			expect(callEndKindV2({ status: "ended", callStatus: "declined", endReason: reason })).toBe(
				reason,
			)
		}
	})

	it("un refus automatique ne se lit PAS « pas de réponse »", () => {
		// Personne n'a laissé sonner : accuser le destinataire serait faux.
		expect(callEndKindV2({ status: "ended", callStatus: "declined", endReason: "dnd" })).not.toBe(
			"missed",
		)
	})

	it("timeout serveur : manqué", () => {
		expect(callEndKindV2({ status: "ended", callStatus: "missed" })).toBe("missed")
		expect(callEndKindV2({ status: "ended", endReason: "timeout" })).toBe("missed")
	})

	it("refus explicite, y compris sous son alias historique", () => {
		expect(callEndKindV2({ status: "ended", callStatus: "declined" })).toBe("declined")
		expect(callEndKindV2({ status: "ended", endReason: "rejected" })).toBe("declined")
	})

	it("annulation et erreur gardent leur nom", () => {
		expect(callEndKindV2({ status: "ended", endReason: "cancelled" })).toBe("cancelled")
		expect(callEndKindV2({ status: "ended", endReason: "error" })).toBe("error")
	})

	it("fin normale", () => {
		expect(callEndKindV2({ status: "ended", callStatus: "ended", endReason: "normal" })).toBe(
			"ended",
		)
	})

	it("un appel annulé avant d'exister compte comme terminé", () => {
		expect(callEndKindV2({ status: "cancelled" })).toBe("ended")
	})
})

describe("ce que l'écran de fin raconte", () => {
	it("pas de réponse : on peut réessayer", () => {
		const copy = describeCallEnd("missed", { peerName: "Marie Ndong" }, t)
		expect(copy.title).toBe("Pas de réponse")
		expect(copy.body).toBe("Marie Ndong n'a pas répondu.")
		expect(copy.canRetry).toBe(true)
	})

	it("refus AVEC note : c'est la note qu'on lit, entre guillemets", () => {
		const copy = describeCallEnd("declined", { note: "Je vous rappelle dans 10 min" }, t)
		expect(copy.body).toBe("« Je vous rappelle dans 10 min »")
	})

	it("ne pas déranger : AUCUN bouton « réessayer » — ce serait insister", () => {
		const copy = describeCallEnd("dnd", { peerName: "Marie Ndong" }, t)
		expect(copy.canRetry).toBe(false)
		expect(copy.canWrite).toBe(true)
		expect(copy.body).not.toMatch(/\d{1,2}:\d{2}/)
	})

	it("en réunion : pas de rappel immédiat non plus", () => {
		expect(describeCallEnd("in_meeting", {}, t).canRetry).toBe(false)
	})

	it("occupé : rappeler a du sens", () => {
		const copy = describeCallEnd("busy", { peerName: "Marie" }, t)
		expect(copy.body).toBe("Marie est déjà en communication.")
		expect(copy.canRetry).toBe(true)
	})

	it("le message vocal n'est offert que si le destinataire l'accepte", () => {
		expect(describeCallEnd("dnd", { voicemailOffered: true }, t).canLeaveVoicemail).toBe(true)
		expect(describeCallEnd("dnd", {}, t).canLeaveVoicemail).toBe(false)
		// Sur une erreur technique, laisser un message ne mène nulle part.
		expect(describeCallEnd("error", { voicemailOffered: true }, t).canLeaveVoicemail).toBe(false)
	})

	it("sans nom connu, on ne rend jamais une phrase à trou", () => {
		expect(describeCallEnd("missed", {}, t).body).toBe("Votre correspondant n'a pas répondu.")
	})

	it("fin normale : la durée, et rien d'autre à proposer", () => {
		const copy = describeCallEnd("ended", { durationLabel: "04:12" }, t)
		expect(copy.body).toBe("Durée : 04:12")
		expect(copy.canRetry).toBe(false)
		expect(copy.canWrite).toBe(false)
	})
})

describe("isAdmissionRefusal", () => {
	it("distingue un refus automatique d'un manqué", () => {
		expect(isAdmissionRefusal("dnd")).toBe(true)
		expect(isAdmissionRefusal("busy")).toBe(true)
		expect(isAdmissionRefusal("missed")).toBe(false)
		expect(isAdmissionRefusal(null)).toBe(false)
	})
})

describe("endLabel", () => {
	it("nomme chaque fin en français", () => {
		expect(endLabel("missed", t)).toBe("Pas de réponse")
		expect(endLabel("dnd", t)).toBe("Ne pas déranger")
		expect(endLabel("ended", t)).toBe("Appel terminé")
	})
})

describe("hors ligne (2026-09-01)", () => {
	it("un appel `offline` ouvre l'écran DÉDIÉ, pas « pas de réponse »", () => {
		expect(
			callEndKindV2({
				status: "ended",
				callStatus: "missed",
				endReason: "offline",
			}),
		).toBe("offline")
		expect(endLabel("offline", t)).toBe("Hors ligne")
	})

	it("l'écran « Hors ligne » : sa phrase, rappel permis, vocal offert", () => {
		const copy = describeCallEnd(
			"offline",
			{
				peerName: "Marie Ndong",
				voicemailOffered: true,
			},
			t,
		)
		expect(copy.title).toBe("Hors ligne")
		expect(copy.body).toBe("Marie Ndong est hors ligne pour le moment.")
		expect(copy.canRetry).toBe(true)
		expect(copy.canLeaveVoicemail).toBe(true)
	})
})

describe("hors de ses relations (lot 5, IC-04)", () => {
	it("IC-04 : l'appelant lit un appel SANS RÉPONSE — même titre, même phrase, même rappel que le manqué ; jamais de message vocal", () => {
		expect(endLabel("outside_relations", t)).toBe(endLabel("missed", t))

		const copy = describeCallEnd(
			"outside_relations",
			{
				peerName: "Marie Ndong",
				// Même offert par les réglages du destinataire, le message vocal
				// serait le même appel sous un autre nom.
				voicemailOffered: true,
			},
			t,
		)
		const missed = describeCallEnd("missed", { peerName: "Marie Ndong" }, t)
		expect(copy).toEqual({ ...missed, canLeaveVoicemail: false })
		expect(copy.title).toBe("Pas de réponse")
		expect(copy.canWrite).toBe(true)
	})

	it("aucune phrase ne dit le réglage de l'appelé", () => {
		const body = describeCallEnd("outside_relations", { peerName: "Paul" }, t).body
		expect(body).toBe("Paul n'a pas répondu.")
		expect(body).not.toContain("relations")
	})

	it("c'est un refus d'ADMISSION, pas un manqué", () => {
		expect(isAdmissionRefusal("outside_relations")).toBe(true)
	})
})

describe("refusalEndKind — la reason du serveur devient un écran", () => {
	it("chaque raison connue ouvre son écran, offline compris", () => {
		expect(refusalEndKind("dnd")).toBe("dnd")
		expect(refusalEndKind("busy")).toBe("busy")
		expect(refusalEndKind("in_meeting")).toBe("in_meeting")
		expect(refusalEndKind("offline")).toBe("offline")
		// Un littéral que le serveur émet et que cette liste ignorerait
		// retomberait sur « Appel refusé » ; IC-04 : son écran le dit comme
		// un appel sans réponse (`describeCallEnd`).
		expect(refusalEndKind("outside_relations")).toBe("outside_relations")
	})

	it("une raison inconnue ou absente retombe sur « refusé » — jamais un écran menteur", () => {
		expect(refusalEndKind(undefined)).toBe("declined")
		expect(refusalEndKind(null)).toBe("declined")
		expect(refusalEndKind("future_reason")).toBe("declined")
		// Les raisons du socle retirées du moteur (horaires et secrétariat de
		// poste) ne sont plus des raisons connues.
		expect(refusalEndKind("outside_hours")).toBe("declined")
		expect(refusalEndKind("secretariat_unavailable")).toBe("declined")
	})
})
