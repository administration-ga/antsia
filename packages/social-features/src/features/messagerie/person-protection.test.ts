/**
 * IC-03 — ce que « Signaler ou bloquer » propose, dans quel ordre, et
 * l'enchaînement des boîtes quand la personne veut faire les deux.
 */
import { describe, expect, it } from "vitest"

import { createAppI18n } from "../../i18n"
import {
	nextPersonProtectionStep,
	PERSON_PROTECTION_IDLE,
	personProtectionEntriesFor,
	personProtectionOrderNote,
	personProtectionTitle,
	personProtectionTriggerLabel,
	type PersonProtectionStep,
} from "./person-protection"

const fr = createAppI18n({ locale: "fr", appResources: { fr: {}, en: {} }, defaultNS: "messagerie" }).getFixedT("fr")
const en = createAppI18n({ locale: "en", appResources: { fr: {}, en: {} }, defaultNS: "messagerie" }).getFixedT("en")
/** Un nom de personne : une donnée du test, pas un texte d'interface. */
const NAME = "Awa NDONG"

describe("personProtectionEntriesFor — les gestes offerts", () => {
	it("une personne au profil publié : signaler PUIS bloquer, nommée, avec ce que chaque geste produit", () => {
		const entries = personProtectionEntriesFor({ name: NAME, canReport: true }, fr)
		expect(entries.map((entry) => entry.id)).toEqual(["report", "block"])
		expect(entries.map((entry) => entry.label)).toEqual([`Signaler ${NAME}`, `Bloquer ${NAME}`])
		for (const entry of entries) expect(entry.hint.length).toBeGreaterThan(0)
	})

	it("sans profil publié, la personne ne se signale pas (aucune cible du moteur) : bloquer seul", () => {
		expect(personProtectionEntriesFor({ name: NAME, canReport: false }, fr).map((entry) => entry.id)).toEqual(["block"])
	})

	it("un nom vide ou absent devient « cette personne », jamais un blanc", () => {
		for (const name of [null, undefined, "   "]) {
			expect(personProtectionEntriesFor({ name, canReport: true }, fr).map((entry) => entry.label)).toEqual(["Signaler cette personne", "Bloquer cette personne"])
		}
	})

	it("suit la langue de l'écran", () => {
		expect(personProtectionEntriesFor({ name: NAME, canReport: true }, en).map((entry) => entry.label)).toEqual([`Report ${NAME}`, `Block ${NAME}`])
	})
})

describe("personProtectionTriggerLabel et personProtectionTitle — rien de promis que le moteur refuserait", () => {
	it("« Signaler ou bloquer » quand les deux gestes sont offerts, « Bloquer » sinon ; le bouton porte le nom de la rangée", () => {
		expect(personProtectionTriggerLabel({ name: NAME, canReport: true, triggerName: NAME }, fr)).toBe(`Signaler ou bloquer ${NAME}`)
		expect(personProtectionTriggerLabel({ name: null, canReport: false, triggerName: "Membre" }, fr)).toBe("Bloquer Membre")
		expect(personProtectionTitle({ name: NAME, canReport: true }, fr)).toBe("Signaler ou bloquer")
		expect(personProtectionTitle({ name: NAME, canReport: false }, fr)).toBe("Bloquer")
		expect(personProtectionTriggerLabel({ name: NAME, canReport: true, triggerName: NAME }, en)).toBe(`Report or block ${NAME}`)
	})
})

describe("personProtectionOrderNote — signaler avant de bloquer, dit à l'écran", () => {
	it("dite quand les deux gestes sont offerts, absente sinon", () => {
		expect(personProtectionOrderNote({ name: NAME, canReport: true }, fr)).toBe(
			"Pour faire les deux, signalez d'abord : une fois bloquée, la personne ne peut plus être signalée.",
		)
		expect(personProtectionOrderNote({ name: NAME, canReport: false }, fr)).toBeNull()
	})
})

describe("nextPersonProtectionStep — l'enchaînement des boîtes", () => {
	const step = (from: PersonProtectionStep, ...events: Parameters<typeof nextPersonProtectionStep>[1][]) =>
		events.reduce((current, event) => nextPersonProtectionStep(current, event, true), from)

	it("choisir un geste ouvre SA boîte ; la confirmation du blocage propose « Signaler d'abord »", () => {
		expect(step(PERSON_PROTECTION_IDLE, { type: "choose", action: "report" })).toEqual({ dialog: "report", thenBlock: false })
		expect(step(PERSON_PROTECTION_IDLE, { type: "choose", action: "block" })).toEqual({ dialog: "block", reportFirst: true })
	})

	it("« Signaler d'abord » ouvre le signalement, qui RAMÈNE au blocage — sans le proposer de nouveau une fois envoyé", () => {
		const reporting = step(PERSON_PROTECTION_IDLE, { type: "choose", action: "block" }, { type: "reportFirst" })
		expect(reporting).toEqual({ dialog: "report", thenBlock: true })
		expect(step(reporting, { type: "reportClosed", reported: true })).toEqual({ dialog: "block", reportFirst: false })
		// Abandonné, le signalement ramène aussi au blocage, qui le propose encore.
		expect(step(reporting, { type: "reportClosed", reported: false })).toEqual({ dialog: "block", reportFirst: true })
	})

	it("un signalement seul se referme sans ouvrir le blocage ; la confirmation fermée, plus rien n'est ouvert", () => {
		expect(step(PERSON_PROTECTION_IDLE, { type: "choose", action: "report" }, { type: "reportClosed", reported: true })).toEqual(PERSON_PROTECTION_IDLE)
		expect(step(PERSON_PROTECTION_IDLE, { type: "choose", action: "block" }, { type: "blockClosed" })).toEqual(PERSON_PROTECTION_IDLE)
	})

	it("une personne non signalable : ni signalement, ni « Signaler d'abord »", () => {
		expect(nextPersonProtectionStep(PERSON_PROTECTION_IDLE, { type: "choose", action: "report" }, false)).toEqual(PERSON_PROTECTION_IDLE)
		const blocking = nextPersonProtectionStep(PERSON_PROTECTION_IDLE, { type: "choose", action: "block" }, false)
		expect(blocking).toEqual({ dialog: "block", reportFirst: false })
		expect(nextPersonProtectionStep(blocking, { type: "reportFirst" }, false)).toEqual(blocking)
	})

	it("un évènement hors de sa boîte ne change rien", () => {
		const blocking: PersonProtectionStep = { dialog: "block", reportFirst: true }
		expect(nextPersonProtectionStep(blocking, { type: "reportClosed", reported: true }, true)).toBe(blocking)
		const reporting: PersonProtectionStep = { dialog: "report", thenBlock: false }
		expect(nextPersonProtectionStep(reporting, { type: "blockClosed" }, true)).toBe(reporting)
		expect(nextPersonProtectionStep(reporting, { type: "reportFirst" }, true)).toBe(reporting)
	})
})
