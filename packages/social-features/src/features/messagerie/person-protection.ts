/**
 * person-protection — se protéger d'une personne depuis iCom (IC-03, plan 01) :
 * la signaler, la bloquer, et l'enchaînement des deux.
 *
 * Module pur, testé en environnement `node`. Le composant
 * (`PersonProtectionMenu`) ne fait que rendre ce qui est décidé ici.
 *
 * Les GESTES sont ceux du moteur, et eux seuls : la brique commune du
 * signalement (MC-01, `moderation.cases.report`, cible `person`) et celle du
 * blocage (PF-01, `graph.connections.blockPerson`). Aucune mutation de plus.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * SIGNALER AVANT DE BLOQUER
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Le moteur refuse un signalement entre deux personnes bloquées (refus
 * indistinct) : une fois bloquée, la personne et ses messages ne se signalent
 * plus. Qui veut faire les deux doit donc signaler D'ABORD — l'écran le dit
 * (`orderNote`), et la confirmation du blocage propose « Signaler d'abord »,
 * qui ouvre le signalement puis revient au blocage.
 *
 * ⚠️ Signaler n'existe que pour une personne au profil PUBLIÉ (la cible
 * `person` du moteur) ; bloquer, pour toute personne. Jamais pour soi : la
 * surface ne monte pas ce menu sur sa propre ligne, et le moteur refuse.
 *
 * Un seul import, de type : la fonction de traduction reçue en dernier
 * paramètre (clés QUALIFIÉES, résolues par n'importe quel `t`).
 */
import type { TFunction } from "i18next"

export type PersonProtectionAction = "report" | "block"

export interface PersonProtectionEntry {
	id: PersonProtectionAction
	label: string
	/** Ce que le geste produit, dit avant de le choisir. */
	hint: string
}

export interface PersonProtectionInput {
	/** Le nom que la surface montre déjà ; vide ou absent : « cette personne ». */
	name: string | null | undefined
	/** La personne a un profil publié : la cible `person` du moteur existe. */
	canReport: boolean
}

/** Un nom affiché vide vaut absence : jamais « Signaler  ». */
function cleanName(name: string | null | undefined): string | null {
	const trimmed = name?.trim() ?? ""
	return trimmed.length > 0 ? trimmed : null
}

/** Les gestes offerts, dans L'ORDRE où les faire : signaler, puis bloquer. */
export function personProtectionEntriesFor(input: PersonProtectionInput, t: TFunction): readonly PersonProtectionEntry[] {
	const named = cleanName(input.name)
	const entries: PersonProtectionEntry[] = []
	if (input.canReport) {
		entries.push({
			id: "report",
			label: named === null ? t("messagerie:personProtection.report.labelUnnamed") : t("messagerie:personProtection.report.label", { name: named }),
			hint: t("messagerie:personProtection.report.hint"),
		})
	}
	entries.push({
		id: "block",
		label: named === null ? t("messagerie:personProtection.block.labelUnnamed") : t("messagerie:personProtection.block.label", { name: named }),
		hint: t("messagerie:personProtection.block.hint"),
	})
	return Object.freeze(entries)
}

/**
 * Le nom accessible du bouton « … » et le titre de la feuille : « Signaler ou
 * bloquer » quand les deux gestes sont offerts, « Bloquer » sinon — jamais la
 * promesse d'un signalement que le moteur refuserait.
 *
 * `triggerName` : le nom que la rangée affiche (titre du fil, nom du membre,
 * libellé neutre compris), pour distinguer les boutons d'une même liste.
 */
export function personProtectionTriggerLabel(input: PersonProtectionInput & { triggerName: string }, t: TFunction): string {
	return input.canReport
		? t("messagerie:personProtection.trigger", { name: input.triggerName })
		: t("messagerie:personProtection.triggerBlockOnly", { name: input.triggerName })
}

export function personProtectionTitle(input: PersonProtectionInput, t: TFunction): string {
	return input.canReport ? t("messagerie:personProtection.title") : t("messagerie:personProtection.titleBlockOnly")
}

/** La phrase qui dit l'ordre — seulement quand les deux gestes sont offerts. */
export function personProtectionOrderNote(input: PersonProtectionInput, t: TFunction): string | null {
	return input.canReport ? t("messagerie:personProtection.reportBeforeBlock") : null
}

// ═══════════════════════════════════════════════════════════════════════════
// L'enchaînement des boîtes
// ═══════════════════════════════════════════════════════════════════════════

/**
 * La boîte ouverte, une seule à la fois :
 *  · `report` — le signalement ; `thenBlock` : ouvert depuis « Signaler
 *    d'abord », il RAMÈNE au blocage à sa fermeture, envoyé ou non ;
 *  · `block` — la confirmation du blocage ; `reportFirst` : elle propose
 *    « Signaler d'abord » (la personne est signalable et rien n'est parti).
 */
export type PersonProtectionStep =
	| { dialog: null }
	| { dialog: "report"; thenBlock: boolean }
	| { dialog: "block"; reportFirst: boolean }

export type PersonProtectionEvent =
	/** Un geste choisi dans le menu. */
	| { type: "choose"; action: PersonProtectionAction }
	/** « Signaler d'abord », depuis la confirmation du blocage. */
	| { type: "reportFirst" }
	/** Le signalement se ferme ; `reported` : le moteur a accusé réception. */
	| { type: "reportClosed"; reported: boolean }
	/** La confirmation du blocage se ferme (annulée ou faite). */
	| { type: "blockClosed" }

export const PERSON_PROTECTION_IDLE: PersonProtectionStep = Object.freeze({ dialog: null })

export function nextPersonProtectionStep(step: PersonProtectionStep, event: PersonProtectionEvent, canReport: boolean): PersonProtectionStep {
	switch (event.type) {
		case "choose":
			if (event.action === "report") return canReport ? { dialog: "report", thenBlock: false } : step
			return { dialog: "block", reportFirst: canReport }
		case "reportFirst":
			return step.dialog === "block" && step.reportFirst ? { dialog: "report", thenBlock: true } : step
		case "reportClosed":
			if (step.dialog !== "report") return step
			// Signalée, la personne n'a plus à l'être : la confirmation revient sans « Signaler d'abord ».
			return step.thenBlock ? { dialog: "block", reportFirst: !event.reported } : PERSON_PROTECTION_IDLE
		case "blockClosed":
			return step.dialog === "block" ? PERSON_PROTECTION_IDLE : step
	}
}
