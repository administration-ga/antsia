// Dupliqué de socle/packages/agent-features/src/features/messagerie/message-actions.test.ts @ ad2e7fdc2 — adaptations : fenêtre d'édition lue au contrat du moteur (`@antsia/social-contracts/messaging`) ; `actionsFor` reçoit la traduction française du moteur (`t` en dernier paramètre) — libellés attendus : texte exact du socle ; un cas ajouté : les libellés suivent la langue.
import { MESSAGE_EDIT_WINDOW_MS } from "@antsia/social-contracts/messaging"
import { describe, expect, it } from "vitest"
import { createAppI18n } from "../../i18n"
import {
	actionsFor as actionsForT,
	type MessageActionContext,
	type MessageActionId,
} from "./message-actions"

const fr = createAppI18n({ locale: "fr", appResources: { fr: {}, en: {} }, defaultNS: "messagerie" }).getFixedT("fr")
const en = createAppI18n({ locale: "en", appResources: { fr: {}, en: {} }, defaultNS: "messagerie" }).getFixedT("en")

/** Les actions telles que l'écran français les reçoit. */
function actionsFor(context: MessageActionContext) {
	return actionsForT(context, fr)
}

/**
 * L'envoi vient d'avoir lieu — le contexte minimal pour que la FENÊTRE
 * d'édition soit connue. Sans ces trois champs, `modifier` n'est pas offert :
 * une fenêtre inconnue n'est pas une fenêtre ouverte.
 */
const MAINTENANT = 1_800_000_000_000
const FENETRE = {
	createdAt: MAINTENANT,
	now: MAINTENANT,
	editWindowMs: MESSAGE_EDIT_WINDOW_MS,
}

/** Le socle d'un message reçu, texte seul, dans un fil 1:1 ouvert. */
const RECU = {
	conversationKind: "chat" as const,
	mine: false,
	deleted: false,
	hasAttachments: false,
	canReply: true,
}

function ids(context: Parameters<typeof actionsFor>[0]): MessageActionId[] {
	return actionsFor(context).map((action) => action.id)
}

describe("actionsFor — un message reçu", () => {
	it("offre répondre, réagir, copier, transférer, masquer pour moi, puis signaler en dernier (MC-01)", () => {
		expect(ids(RECU)).toEqual([
			"repondre",
			"reagir",
			"copier",
			"transferer",
			"supprimerPourMoi",
			"signaler",
		])
	})

	it("n'offre JAMAIS « supprimer pour tout le monde » sur le message d'un autre", () => {
		expect(ids(RECU)).not.toContain("supprimerPourTous")
	})
})

describe("actionsFor — mon message", () => {
	it("ajoute « supprimer pour tout le monde » dans un 1:1", () => {
		expect(ids({ ...RECU, mine: true })).toContain("supprimerPourTous")
	})

	it("le place EN DERNIER — les destructions ne s'offrent pas en premier", () => {
		const liste = ids({ ...RECU, mine: true })
		expect(liste[liste.length - 1]).toBe("supprimerPourTous")
	})

	it("marque les deux suppressions comme destructives, les autres non", () => {
		const actions = actionsFor({ ...RECU, mine: true })
		for (const action of actions) {
			expect(action.destructive).toBe(
				action.id === "supprimerPourMoi" || action.id === "supprimerPourTous",
			)
		}
	})
})

describe("actionsFor — le GROUPE a reçu les gestes de l'auteur (IC-13 B)", () => {
	it("offre « supprimer pour tout le monde » sur MON message de groupe", () => {
		// `groupes.deleteGroupMessage` existe depuis le lot 05 : le geste n'est
		// plus une promesse que le serveur refuserait.
		expect(
			ids({ ...RECU, conversationKind: "groupe", mine: true }),
		).toContain("supprimerPourTous")
	})

	it("offre « modifier » sur MON message de groupe, dans la fenêtre", () => {
		expect(
			ids({ ...RECU, ...FENETRE, conversationKind: "groupe", mine: true }),
		).toContain("modifier")
	})

	it("ne l'offre JAMAIS sur le message d'un AUTRE membre", () => {
		const liste = ids({ ...RECU, ...FENETRE, conversationKind: "groupe" })
		expect(liste).not.toContain("supprimerPourTous")
		expect(liste).not.toContain("modifier")
	})

	it("suppose un 1:1 quand le genre n'est pas dit", () => {
		const { conversationKind: _ignore, ...sansGenre } = { ...RECU, mine: true }
		expect(ids(sansGenre)).toContain("supprimerPourTous")
	})

	it("n'offre ni l'un ni l'autre sur un BROUILLON — rien n'est encore parti", () => {
		const liste = ids({
			...RECU,
			...FENETRE,
			conversationKind: "draft",
			mine: true,
			canReply: false,
		})
		expect(liste).not.toContain("supprimerPourTous")
		expect(liste).not.toContain("modifier")
	})
})

describe("actionsFor — « modifier » et sa FENÊTRE", () => {
	it("offre le geste sur MON message texte fraîchement envoyé", () => {
		expect(ids({ ...RECU, ...FENETRE, mine: true })).toContain("modifier")
	})

	it("le place AVANT les suppressions — modifier n'est pas détruire", () => {
		const liste = ids({ ...RECU, ...FENETRE, mine: true })
		expect(liste.indexOf("modifier")).toBeLessThan(
			liste.indexOf("supprimerPourMoi"),
		)
	})

	it("ne le marque pas destructif", () => {
		const action = actionsFor({ ...RECU, ...FENETRE, mine: true }).find(
			(item) => item.id === "modifier",
		)
		expect(action?.destructive).toBe(false)
	})

	it("le retire du message d'un AUTRE — le serveur le refuserait", () => {
		expect(ids({ ...RECU, ...FENETRE })).not.toContain("modifier")
	})

	it("le retire une fois la fenêtre EXPIRÉE", () => {
		expect(
			ids({
				...RECU,
				mine: true,
				createdAt: MAINTENANT - MESSAGE_EDIT_WINDOW_MS - 1,
				now: MAINTENANT,
				editWindowMs: MESSAGE_EDIT_WINDOW_MS,
			}),
		).not.toContain("modifier")
	})

	it("le garde à la SECONDE près de l'échéance", () => {
		expect(
			ids({
				...RECU,
				mine: true,
				createdAt: MAINTENANT - MESSAGE_EDIT_WINDOW_MS,
				now: MAINTENANT,
				editWindowMs: MESSAGE_EDIT_WINDOW_MS,
			}),
		).toContain("modifier")
	})

	it("retire AUSSI « supprimer pour tout le monde » hors fenêtre", () => {
		// Le serveur applique la MÊME fenêtre aux deux gestes : offrir la
		// suppression seule promettrait un refus après l'appui.
		expect(
			ids({
				...RECU,
				mine: true,
				createdAt: MAINTENANT - MESSAGE_EDIT_WINDOW_MS - 1,
				now: MAINTENANT,
				editWindowMs: MESSAGE_EDIT_WINDOW_MS,
			}),
		).not.toContain("supprimerPourTous")
	})

	it("ne l'offre PAS quand la fenêtre est inconnue — jamais par défaut", () => {
		// Fail-closed : un appelant qui ne dit pas l'âge du message n'obtient
		// pas « Modifier ». La suppression pour tous, elle, garde son contrat
		// historique (elle était offerte sans horloge).
		const liste = ids({ ...RECU, mine: true })
		expect(liste).not.toContain("modifier")
		expect(liste).toContain("supprimerPourTous")
	})

	it("le retire d'un message sans TEXTE : il n'y a rien à réécrire", () => {
		expect(
			ids({ ...RECU, ...FENETRE, mine: true, hasAttachments: true }),
		).not.toContain("modifier")
	})

	it("le retire d'une pierre tombale", () => {
		expect(
			ids({ ...RECU, ...FENETRE, mine: true, deleted: true }),
		).not.toContain("modifier")
	})

	it("porte le libellé « Modifier »", () => {
		expect(
			actionsFor({ ...RECU, ...FENETRE, mine: true }).find(
				(item) => item.id === "modifier",
			)?.label,
		).toBe("Modifier")
	})
})

describe("actionsFor — une pierre tombale", () => {
	it("ne garde QUE « supprimer pour moi »", () => {
		expect(ids({ ...RECU, deleted: true })).toEqual(["supprimerPourMoi"])
	})

	it("ne l'offre pas non plus pour tout le monde sur MON message supprimé", () => {
		expect(ids({ ...RECU, mine: true, deleted: true })).toEqual([
			"supprimerPourMoi",
		])
	})

	it("ne propose jamais une liste VIDE", () => {
		expect(actionsFor({ ...RECU, deleted: true }).length).toBeGreaterThan(0)
	})
})

describe("actionsFor — transférer (ADR-0143 §5)", () => {
	it("offre « Transférer » sur un message reçu — c'est le principe du geste", () => {
		expect(ids(RECU)).toContain("transferer")
	})

	it("l'offre sur MON message, sur une pièce sans texte, et en groupe", () => {
		expect(ids({ ...RECU, mine: true })).toContain("transferer")
		expect(ids({ ...RECU, hasAttachments: true, hasText: false })).toContain(
			"transferer",
		)
		expect(ids({ ...RECU, conversationKind: "groupe" })).toContain("transferer")
	})

	it("la place APRÈS « copier » et AVANT les gestes de l'auteur", () => {
		const liste = ids({ ...RECU, ...FENETRE, mine: true, canPin: true })
		expect(liste.indexOf("transferer")).toBeGreaterThan(liste.indexOf("copier"))
		expect(liste.indexOf("transferer")).toBeLessThan(liste.indexOf("epingler"))
	})

	it("la retire d'une pierre tombale, d'un masqué et d'un BROUILLON", () => {
		expect(ids({ ...RECU, deleted: true })).not.toContain("transferer")
		expect(ids({ ...RECU, masked: true })).not.toContain("transferer")
		expect(
			ids({ ...RECU, conversationKind: "draft", canReply: false }),
		).not.toContain("transferer")
	})

	it("ne la marque pas destructive", () => {
		const action = actionsFor(RECU).find((item) => item.id === "transferer")
		expect(action?.destructive).toBe(false)
		expect(action?.label).toBe("Transférer")
	})
})

describe("actionsFor — épingler (ADR-0143 §5)", () => {
	it("offre « Épingler » quand le droit est dit, sur un message servi", () => {
		expect(ids({ ...RECU, canPin: true })).toContain("epingler")
	})

	it("offre « Désépingler » sur LE message épinglé, et lui seul", () => {
		expect(ids({ ...RECU, canPin: true, pinned: true })).toContain("desepingler")
		expect(ids({ ...RECU, canPin: true, pinned: true })).not.toContain("epingler")
	})

	it("n'offre RIEN quand le droit n'est pas dit — fail-closed", () => {
		expect(ids(RECU)).not.toContain("epingler")
		expect(ids(RECU)).not.toContain("desepingler")
		expect(ids({ ...RECU, canPin: false })).not.toContain("epingler")
	})

	it("le retire d'une pierre tombale et d'un brouillon", () => {
		expect(ids({ ...RECU, canPin: true, deleted: true })).not.toContain("epingler")
		expect(
			ids({ ...RECU, canPin: true, conversationKind: "draft", canReply: false }),
		).not.toContain("epingler")
	})

	it("se place avant « modifier », sans être destructif", () => {
		const liste = ids({ ...RECU, ...FENETRE, mine: true, canPin: true })
		expect(liste.indexOf("epingler")).toBeLessThan(liste.indexOf("modifier"))
		const action = actionsFor({ ...RECU, canPin: true }).find(
			(item) => item.id === "epingler",
		)
		expect(action?.destructive).toBe(false)
	})
})

describe("actionsFor — copier et citer", () => {
	it("retire « copier » d'un message qui n'est que des pièces jointes", () => {
		expect(ids({ ...RECU, hasAttachments: true })).not.toContain("copier")
	})

	it("garde « copier » sur une pièce jointe LÉGENDÉE, quand on le dit", () => {
		expect(
			ids({ ...RECU, hasAttachments: true, hasText: true }),
		).toContain("copier")
	})

	it("retire « copier » d'un message sans texte, même sans pièce", () => {
		expect(ids({ ...RECU, hasText: false })).not.toContain("copier")
	})

	it("retire « répondre » quand la citation est impossible (brouillon)", () => {
		expect(ids({ ...RECU, canReply: false })).not.toContain("repondre")
	})

	it("garde « réagir » même sans citation possible", () => {
		expect(ids({ ...RECU, canReply: false })).toContain("reagir")
	})

	it("porte un libellé lisible sur chaque action", () => {
		for (const action of actionsFor({ ...RECU, mine: true })) {
			expect(action.label.length).toBeGreaterThan(0)
		}
	})
})

describe("actionsFor — la langue de l'écran", () => {
	it("nomme chaque geste dans la langue courante", () => {
		const labels = actionsForT({ ...RECU, ...FENETRE, mine: true, canPin: true }, en).map(
			(action) => action.label,
		)
		expect(labels).toEqual([
			"Reply",
			"React",
			"Copy text",
			"Forward",
			"Pin",
			"Edit",
			"Delete for me",
			"Delete for everyone",
		])
	})
})

describe("actionsFor — signaler (MC-01)", () => {
	it("s'offre sur le message servi d'un autre, en 1:1 comme en groupe, en ton d'alerte", () => {
		for (const conversationKind of ["chat", "groupe"] as const) {
			const signaler = actionsFor({ ...RECU, conversationKind }).find((action) => action.id === "signaler")
			expect(signaler).toEqual({ id: "signaler", label: "Signaler", destructive: true })
		}
	})

	it("ne s'offre jamais sur MON message, une pierre tombale, un corps masqué ou un brouillon", () => {
		expect(ids({ ...RECU, mine: true })).not.toContain("signaler")
		expect(ids({ ...RECU, deleted: true })).not.toContain("signaler")
		expect(ids({ ...RECU, conversationKind: "groupe", masked: true })).not.toContain("signaler")
		expect(ids({ ...RECU, conversationKind: "draft", canReply: false })).not.toContain("signaler")
	})

	it("porte son libellé dans la langue de l'écran", () => {
		expect(actionsForT(RECU, en).find((action) => action.id === "signaler")?.label).toBe("Report")
	})
})
