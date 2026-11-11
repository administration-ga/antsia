"use client"

/**
 * PersonProtectionMenu — « Signaler » et « Bloquer » une personne depuis iCom
 * (IC-03, plan 01) : l'en-tête d'une conversation à deux, et chaque membre
 * de la fiche d'un groupe.
 *
 * Un bouton « … » ouvre une feuille basse (`@antsia/ui/sheet`, le gabarit de
 * la feuille d'actions d'un message) ; le geste choisi ouvre la boîte de la
 * brique commune : `ReportTargetDialog` (MC-01, cible `person`) ou
 * `BlockPersonDialog` (PF-01, confirmation, appel du moteur, toast). Ce qui
 * est offert et l'enchaînement des boîtes vivent dans `person-protection.ts`
 * (module pur, testé).
 *
 * ⚠️ SIGNALER AVANT DE BLOQUER : la feuille le dit, et la confirmation du
 * blocage propose « Signaler d'abord » — le signalement envoyé (ou abandonné)
 * ramène à la confirmation. Bloquer d'abord rendrait la personne non
 * signalable : le moteur refuse un signalement entre bloqués.
 *
 * ⚠️ Jamais pour soi : la surface ne monte pas ce menu sur sa propre ligne
 * (le moteur refuse de toute façon). Aucune surface flottante ici : feuille
 * et boîtes se portalisent hors de `.rp-scope`.
 */
import type { Id } from "@antsia/api/engine"
import { Sheet, SheetBody, SheetContent, SheetHeader, SheetTitle } from "@antsia/ui/sheet"
import { Ellipsis } from "lucide-react"
import { useRef, useState } from "react"
import { useTranslation } from "react-i18next"

import { BlockPersonDialog } from "../reseau-personnel/BlockPersonDialog"
import { ReportTargetDialog } from "../reseau-personnel/ReportTarget"
import {
	nextPersonProtectionStep,
	PERSON_PROTECTION_IDLE,
	personProtectionEntriesFor,
	personProtectionOrderNote,
	personProtectionTitle,
	personProtectionTriggerLabel,
	type PersonProtectionEvent,
	type PersonProtectionStep,
} from "./person-protection"

export interface PersonProtectionMenuProps {
	personId: Id<"persons">
	/** Le nom que la surface montre déjà ; absent, les textes disent « cette personne ». */
	name: string | null
	/** La personne a un profil publié : la cible `person` du moteur existe. */
	canReport: boolean
	/** Le nom que la rangée affiche (titre du fil, nom du membre, libellé neutre compris) : il nomme le bouton « … ». */
	triggerName: string
	/** Après un blocage confirmé (toast déjà émis) : la suite de la surface (quitter un fil fermé…). */
	onBlocked?: () => void
	/** La taille du pictogramme, celle des boutons voisins de la rangée. */
	iconSize?: number
}

export function PersonProtectionMenu({
	personId,
	name,
	canReport,
	triggerName,
	onBlocked,
	iconSize = 18,
}: PersonProtectionMenuProps) {
	const { t } = useTranslation("messagerie")
	const [menuOpen, setMenuOpen] = useState(false)
	const [step, setStep] = useState<PersonProtectionStep>(PERSON_PROTECTION_IDLE)
	/** Le moteur a accusé réception du signalement en cours : lu à la fermeture de sa boîte. */
	const reported = useRef(false)

	const input = { name, canReport }
	const entries = personProtectionEntriesFor(input, t)
	const orderNote = personProtectionOrderNote(input, t)
	const triggerLabel = personProtectionTriggerLabel({ ...input, triggerName }, t)
	const advance = (event: PersonProtectionEvent) => setStep((current) => nextPersonProtectionStep(current, event, canReport))

	return (
		<>
			<button
				type="button"
				className="msg-icon-btn"
				aria-label={triggerLabel}
				title={triggerLabel}
				aria-haspopup="dialog"
				aria-expanded={menuOpen}
				onClick={() => setMenuOpen(true)}
			>
				<Ellipsis aria-hidden="true" size={iconSize} />
			</button>

			<Sheet open={menuOpen} onOpenChange={setMenuOpen}>
				{/* Mêmes exceptions que la feuille d'actions d'un message : 70 % de la
				    hauteur au plus, croix de 44 px (cible tactile), en-tête élargi. */}
				<SheetContent
					side="bottom"
					closeLabel={t("personProtection.close")}
					className="max-h-[70dvh] rounded-t-2xl border-border/60 bg-secondary [&_[data-slot=sheet-close]]:!size-11"
				>
					<SheetHeader className="pr-16">
						<SheetTitle>{personProtectionTitle(input, t)}</SheetTitle>
					</SheetHeader>
					<SheetBody className="gap-2">
						{orderNote !== null ? <p className="m-0 px-2 text-xs leading-snug text-muted-foreground">{orderNote}</p> : null}
						<ul className="msg-list">
							{entries.map((entry) => (
								<li key={entry.id}>
									<button
										type="button"
										className="msg-row"
										onClick={() => {
											setMenuOpen(false)
											reported.current = false
											advance({ type: "choose", action: entry.id })
										}}
									>
										<span className="msg-row-main">
											{/* Deux gestes graves : le ton de « Signaler » d'un message (feuille d'actions). */}
											<span className="msg-row-name" style={{ color: "var(--danger-700, var(--ink-900))" }}>{entry.label}</span>
											<span className="mt-0.5 block text-xs leading-snug text-muted-foreground">{entry.hint}</span>
										</span>
									</button>
								</li>
							))}
						</ul>
					</SheetBody>
				</SheetContent>
			</Sheet>

			{step.dialog === "report" ? (
				<ReportTargetDialog
					target={{ kind: "person", id: personId }}
					onReported={() => {
						reported.current = true
					}}
					onClose={() => {
						const sent = reported.current
						reported.current = false
						advance({ type: "reportClosed", reported: sent })
					}}
				/>
			) : null}

			{step.dialog === "block" ? (
				<BlockPersonDialog
					mode="block"
					targetPersonId={personId}
					name={name}
					onClose={() => advance({ type: "blockClosed" })}
					onDone={onBlocked}
					onReportFirst={step.reportFirst ? () => advance({ type: "reportFirst" }) : undefined}
				/>
			) : null}
		</>
	)
}
