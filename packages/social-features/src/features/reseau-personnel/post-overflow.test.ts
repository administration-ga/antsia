// Dupliqué de socle/packages/agent-features/src/features/reseau-personnel/post-overflow.test.ts @ ad2e7fdc2 — adaptations : libellés lus par un `t` français (`overflowEntriesFor(input, t)`, `undoLabelFor(action, name, t)`) ; la page est celle du moteur (plus d'administration), la sourdine vise une personne (`targetPersonId`) ; tous les cas du socle portés ; cas ajoutés pour le texte d'un refus du moteur (`postEngineErrorText` : règle, code, repli, jamais le message brut).
import { describe, expect, it } from "vitest"

import { createAppI18n } from "../../i18n"
import { overflowEntriesFor, postEngineErrorText, undoLabelFor, type PostOverflowInput } from "./post-overflow"

const t = createAppI18n({ locale: "fr", appResources: { fr: {}, en: {} }, defaultNS: "reseau" }).getFixedT("fr")

/** Le menu, lu dans la langue de l'écran. */
const entries = (input: PostOverflowInput) => overflowEntriesFor(input, t)

const BASE = {
	// `canPin` vrai par défaut : le cas courant du fil (hors groupe).
	canPin: true,
	bookmarked: false,
	notifying: false,
	authorName: "Awa NDONG",
	canReport: true,
}

describe("overflowEntriesFor", () => {
	it("sur SA PROPRE publication : modifier, épingler, enregistrer, retirer", () => {
		// Se masquer, se mettre en sourdine ou se signaler n'a aucun sens.
		// Modifier et Épingler vivent ICI depuis le 2026-08-21 : ils occupaient
		// une rangée de boutons texte sous l'en-tête de chaque carte de l'auteur.
		const ids = entries({ ...BASE, isOwn: true }).map((e) => e.id)
		expect(ids).toEqual(["edit", "pin", "bookmark", "remove"])
	})

	it("retire « épingler » d'une publication de groupe — jamais grisé", () => {
		// Elle s'épingle dans son groupe, par ses modérateurs (T5).
		const ids = entries({ ...BASE, isOwn: true, canPin: false }).map(
			(e) => e.id,
		)
		expect(ids).toEqual(["edit", "bookmark", "remove"])
	})

	it("ne propose ni « modifier » ni « épingler » sur la publication d'un autre", () => {
		const ids = entries({ ...BASE, isOwn: false }).map((e) => e.id)
		expect(ids).not.toContain("edit")
		expect(ids).not.toContain("pin")
	})

	it("sur celle d'un autre : jamais « retirer », mais masquer, sourdine et signalement", () => {
		const ids = entries({ ...BASE, isOwn: false }).map((e) => e.id)
		expect(ids).toEqual(["bookmark", "notify", "hide", "mute_author", "report"])
		expect(ids).not.toContain("remove")
	})

	it("bascule les libellés selon l'état — un menu ne se répète pas", () => {
		// Proposer « Enregistrer » sur une publication déjà enregistrée ferait
		// douter de ce que le menu a compris.
		const off = entries({ ...BASE, isOwn: false })
		const on = entries({
			...BASE,
			isOwn: false,
			bookmarked: true,
			notifying: true,
		})
		expect(off[0]!.label).toBe("Enregistrer")
		expect(on[0]!.label).toBe("Retirer des enregistrements")
		expect(off[1]!.label).toBe("Être averti des commentaires")
		expect(on[1]!.label).toBe("Ne plus être averti")
	})

	it("NOMME la personne dans la mise en sourdine", () => {
		// « Ne plus voir cette personne » oblige à se souvenir de qui l'on
		// parlait ; dans un fil, la carte a déjà défilé.
		const entry = entries({ ...BASE, isOwn: false }).find(
			(e) => e.id === "mute_author",
		)
		expect(entry!.label).toContain("Awa NDONG")
	})

	it("décrit chaque entrée, et ne marque GRAVE que ce qui l'est", () => {
		for (const isOwn of [false, true]) {
			for (const entry of entries({ ...BASE, isOwn })) {
				expect(entry.label.trim().length).toBeGreaterThan(0)
				expect(entry.hint.trim().length).toBeGreaterThan(0)
			}
		}
		const autres = entries({ ...BASE, isOwn: false })
		expect(autres.filter((e) => e.grave).map((e) => e.id)).toEqual(["report"])
		expect(
			entries({ ...BASE, isOwn: true })
				.filter((e) => e.grave)
				.map((e) => e.id),
		).toEqual(["remove"])
	})

	it("ne rend jamais deux fois la même action", () => {
		for (const isOwn of [false, true]) {
			const ids = entries({ ...BASE, isOwn }).map((e) => e.id)
			expect(new Set(ids).size).toBe(ids.length)
		}
	})
})

describe("publication d'une PAGE", () => {
	it("retire la mise en sourdine — on ne fait pas taire une page", () => {
		// `muteAuthor` vise une personne (`targetPersonId`) : ici il ferait taire
		// le SIGNATAIRE, ses publications personnelles comprises, sans rien
		// changer à la page que le lecteur croyait viser.
		const ids = entries({
			...BASE,
			isOwn: false,
			authorKind: "page",
		}).map((e) => e.id)
		expect(ids).not.toContain("mute_author")
	})

	it("garde les gestes qui portent sur la PUBLICATION", () => {
		// Enregistrer, être averti des commentaires, masquer, signaler : aucun ne
		// vise une personne. L'avis reste offert — une page publie, et on peut
		// vouloir la suite de la conversation.
		const ids = entries({
			...BASE,
			isOwn: false,
			authorKind: "page",
		}).map((e) => e.id)
		expect(ids).toEqual(["bookmark", "notify", "hide", "report"])
	})

	it("laisse les gestes d'auteur au signataire, et rien de plus", () => {
		// Une page dont on est le signataire : le menu de sa propre publication
		// ne change pas de nature.
		const ids = entries({
			...BASE,
			isOwn: true,
			authorKind: "page",
		}).map((e) => e.id)
		expect(ids).toEqual(["edit", "pin", "bookmark", "remove"])
	})

	it("garde la sourdine sur une PERSONNE, genre déclaré ou non", () => {
		// ⚠️ Le genre est optionnel : un backend encore ancien ne le rend pas, et
		// l'absence doit valoir « personne » — le menu d'avant les pages.
		for (const input of [
			{ ...BASE, isOwn: false, authorKind: "person" as const },
			{ ...BASE, isOwn: false },
		]) {
			expect(entries(input).map((e) => e.id)).toEqual([
				"bookmark",
				"notify",
				"hide",
				"mute_author",
				"report",
			])
		}
	})

	it("ne rend jamais deux fois la même action, page comprise", () => {
		for (const isOwn of [false, true]) {
			const ids = entries({
				...BASE,
				isOwn,
				authorKind: "page",
			}).map((e) => e.id)
			expect(new Set(ids).size).toBe(ids.length)
		}
	})
})

describe("signalement", () => {
	it("n'apparaît PAS tant qu'aucune file ne l'instruit", () => {
		// Un « Signaler » qui n'aboutit nulle part fait croire qu'un humain va
		// lire — c'est pire que pas de bouton du tout.
		const ids = entries({
			...BASE,
			isOwn: false,
			canReport: false,
		}).map((e) => e.id)
		expect(ids).not.toContain("report")
		expect(ids).toEqual(["bookmark", "notify", "hide", "mute_author"])
	})
})

describe("bloquer l'auteur (PF-01)", () => {
	it("s'offre pour une PERSONNE, grave, avant « Signaler » qui reste la dernière entrée", () => {
		const list = entries({ ...BASE, isOwn: false, authorKind: "person", canBlockAuthor: true })
		expect(list.map((e) => e.id)).toEqual(["bookmark", "notify", "hide", "mute_author", "block_author", "report"])
		const block = list.find((e) => e.id === "block_author")!
		expect(block.grave).toBe(true)
		expect(block.label).toBe("Bloquer Awa NDONG")
		expect(block.hint).toBe(t("reseau:postOverflow.blockAuthor.hint"))
	})

	it("ne s'offre ni sur une page, ni sur sa propre publication, ni sans y être autorisé", () => {
		for (const input of [
			{ ...BASE, isOwn: false, authorKind: "page" as const, canBlockAuthor: true },
			{ ...BASE, isOwn: true, authorKind: "person" as const, canBlockAuthor: true },
			{ ...BASE, isOwn: false, authorKind: "person" as const },
			{ ...BASE, isOwn: false, authorKind: "person" as const, canBlockAuthor: false },
		]) {
			expect(entries(input).map((e) => e.id)).not.toContain("block_author")
		}
	})
})

describe("undoLabelFor", () => {
	it("dit ce qui vient d'arriver, au passé", () => {
		expect(undoLabelFor("hide", "Awa NDONG", t)).toBe("Publication masquée.")
		expect(undoLabelFor("mute_author", "Awa NDONG", t)).toContain("Awa NDONG")
	})
})

describe("postEngineErrorText — le refus du moteur, jamais la trace", () => {
	it("dit la règle du domaine enfreinte, avec ses bornes", () => {
		const error = { data: { code: "invalidArgument", rule: "POST_TOO_LONG", params: { max: 2000 } } }
		expect(postEngineErrorText(error, "reseau:postCard.toast.editFailed", t)).toBe("Une publication est limitée à 2000 caractères.")
	})

	it("dit le code du moteur à défaut de règle", () => {
		const error = { data: { code: "rateLimited", retryAfterMs: 1000 } }
		expect(postEngineErrorText(error, "reseau:postCard.toast.editFailed", t)).toBe("Trop de tentatives. Réessayez dans quelques instants.")
	})

	it("retombe sur la phrase de l'écran — jamais sur le message brut", () => {
		const error = new Error("[CONVEX M(modules/posts/posts:edit)] Server Error")
		const text = postEngineErrorText(error, "reseau:postCard.toast.editFailed", t)
		expect(text).toBe(t("reseau:postCard.toast.editFailed"))
		expect(text).not.toContain("CONVEX")
	})
})
