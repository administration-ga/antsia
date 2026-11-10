// Dupliqué de socle/packages/agent-features/src/features/iappel/IappelJournal.tsx @ ad2e7fdc2 — adaptations : journal du moteur (`calls.history.listCallHistory` du réseau courant, `{ calls, truncated }`) passé tel quel à `groupCallJournal` — le serveur a classé, l'identité du lecteur n'est plus lue (`users.getMe` retiré) ; acquittement par `calls.preferences.markJournalSeen` (sur soi) ; branche poste élaguée (prop `scope`, fonction, renvoi au secrétariat, appel prioritaire, raisons « hors horaires » et « secrétariat indisponible ») ; correspondant nommé par son libellé (`counterpartLabel`, nom neutre traduit) ; libellés traduits (i18n `iappel`), dates dans la langue courante. ; PA6 : préférence de fuseau injectée, calendrier grégorien et caches langue/fuseau. ; CC-5 : une ligne d'appel contextuel se rappelle et s'écrit par sa conversation (`onContextualOpen`), jamais par l'appel personnel. ; couleurs par fonction (ADR-0027) : « Écrire à » en tonal des messages (`data-role="message"`, feuille de la messagerie), facture d'origine en repli.
"use client"

/**
 * IappelJournal — le journal des appels : tous les appels, et ceux qu'on a
 * manqués.
 *
 * Toute la logique de CLASSEMENT (entrant / sortant / manqué / refusé / refusé
 * automatique, durée, correspondant) vit dans `call-journal.ts`, module PUR
 * déjà testé : ce composant ne fait QUE la mise en forme — lire l'historique
 * serveur, le passer à `groupCallJournal`, rendre le résultat.
 *
 * ⚠️ Ouvrir ce journal EST l'acquittement des appels manqués côté serveur
 * (`journalSeenAt`) : la mutation part UNE SEULE fois au montage, jamais à
 * chaque rendu — ce composant reste monté tant que l'écran est affiché, et
 * React le re-rend pour des raisons qui n'ont rien à voir avec la lecture du
 * journal (une frappe au clavier ailleurs dans la page, par exemple).
 */

import { api } from "@antsia/api/engine"
import { civilDayKey, formatViewerDate, isPreviousCivilDay, sameCivilDay } from "@antsia/api/civil-date"
import { useViewerTimeZone } from "@antsia/api/viewer-preferences"
import { useAuthenticatedConvexQuery } from "@antsia/api/hooks"
import { useNetwork } from "@antsia/api/network"
import { useMutation } from "convex/react"
import type { TFunction } from "i18next"
import type { LucideIcon } from "lucide-react"
import {
	BellOff,
	CalendarClock,
	MessageSquare,
	Phone,
	PhoneIncoming,
	PhoneMissed,
	PhoneOff,
	PhoneOutgoing,
	UserX,
} from "lucide-react"
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react"
import { useTranslation } from "react-i18next"

import { groupCallJournal, journalOfFamily, type CallJournalFamily, type JournalEntry } from "./call-journal"
import { scopeBadgeLabel } from "./call-peer"
import { formatClockTime, formatElapsed } from "./call-timer"

export interface IappelJournalProps {
	/** Contrôles de niveau posés avant Tous / Manqués, dans la même rangée. */
	leadingControls?: ReactNode
	/**
	 * Rappeler quelqu'un : la brique parente sait passer l'appel. `userId` est
	 * la personne (`Id<"persons">`, en chaîne) — le nom du champ est celui du socle.
	 */
	onCallBack: (input: { userId: string; name: string; mediaType: "audio" | "video" }) => void
	/** Ouvrir la conversation écrite avec cette personne. */
	onWrite?: (userId: string) => void
	/** P10 : absents hors injection ANTSIA, ces gestes restent fermés. */
	onCommercialCallBack?: (input: { threadId: NonNullable<JournalEntry["commercialThreadId"]>; counterpartPersonId: string; name: string; mediaType: "audio" | "video" }) => void
	onCommercialWrite?: (threadId: NonNullable<JournalEntry["commercialThreadId"]>) => void
	/**
	 * CC-5 : une ligne d'appel CONTEXTUEL (`contextualThreadId`) se rappelle et s'écrit PAR sa
	 * conversation — accord et cible y sont relus — jamais par `onCallBack` (appel personnel) ni
	 * `onWrite`. Absent (application sans conversations contextuelles), ces gestes restent fermés.
	 */
	onContextualOpen?: (threadId: NonNullable<JournalEntry["contextualThreadId"]>) => void
	callPending?: boolean
	/** ADR-0036 : iCom ne montre que les appels personnels, iCom Pro ceux des boutiques et mises en relation. */
	family?: CallJournalFamily
}

type JournalFilter = "all" | "missed"

/**
 * L'intitulé du jour d'une ligne : « Aujourd'hui », « Hier », sinon la date en
 * toutes lettres — jamais une heure seule, ce serait ambigu une fois les
 * entrées regroupées sur plusieurs jours.
 */
function dayLabelOf(at: number, now: number, t: TFunction, locale: string, timeZone: string): string {
	if (sameCivilDay(at, now, timeZone)) return t("iappel:iappelJournal.today")
	if (isPreviousCivilDay(at, now, timeZone)) return t("iappel:iappelJournal.yesterday")
	return formatViewerDate(at, locale, {
		weekday: "long",
		day: "numeric",
		month: "long",
	}, timeZone)
}

interface JournalDayGroup {
	day: string
	label: string
	entries: JournalEntry[]
}

/**
 * Regroupe des entrées déjà triées par instant décroissant (contrat de
 * `groupCallJournal`) : deux entrées du même jour civil sont forcément
 * consécutives, un simple passage suffit — pas besoin de re-trier ni de
 * construire une table intermédiaire par clé de date.
 */
function groupByDay(entries: readonly JournalEntry[], now: number, t: TFunction, locale: string, timeZone: string): JournalDayGroup[] {
	const groups: JournalDayGroup[] = []
	for (const entry of entries) {
		const day = civilDayKey(entry.at, timeZone)
		const label = dayLabelOf(entry.at, now, t, locale, timeZone)
		const current = groups[groups.length - 1]
		if (current !== undefined && current.day === day) {
			current.entries.push(entry)
		} else {
			groups.push({ day, label, entries: [entry] })
		}
	}
	return groups
}

interface CategoryPresentation {
	Icon: LucideIcon
	label: string
}

/**
 * Icône + libellé d'une entrée. Le refus AUTOMATIQUE se détaille par raison
 * (ne pas déranger / occupé / en réunion / hors relations) : un refus muet ne
 * dirait pas à l'appelant pourquoi son correspondant est injoignable, ni quand
 * il vaut la peine de rappeler.
 */
function categoryPresentationOf(entry: JournalEntry, t: TFunction): CategoryPresentation {
	switch (entry.category) {
		case "incoming":
			return { Icon: PhoneIncoming, label: t("iappel:iappelJournal.category.incoming") }
		case "outgoing":
			return { Icon: PhoneOutgoing, label: t("iappel:iappelJournal.category.outgoing") }
		case "missed":
			return { Icon: PhoneMissed, label: t("iappel:iappelJournal.category.missed") }
		case "declined":
			return {
				Icon: PhoneOff,
				label: entry.note
					? t("iappel:iappelJournal.category.declinedWithNote")
					: t("iappel:iappelJournal.category.declined"),
			}
		case "auto_declined":
			switch (entry.reason) {
				case "dnd":
					return { Icon: BellOff, label: t("iappel:iappelJournal.category.autoDeclinedDnd") }
				case "busy":
					return { Icon: PhoneOff, label: t("iappel:iappelJournal.category.autoDeclinedBusy") }
				case "in_meeting":
					return { Icon: CalendarClock, label: t("iappel:iappelJournal.category.autoDeclinedInMeeting") }
				case "outside_relations":
					return { Icon: UserX, label: t("iappel:iappelJournal.category.autoDeclinedOutsideRelations") }
				default:
					return { Icon: PhoneOff, label: t("iappel:iappelJournal.category.autoDeclined") }
			}
	}
}

/**
 * Le sous-titre AU TITRE DE QUOI l'appel a eu lieu — dans le moteur, toujours
 * de personne à personne.
 */
function scopeLineOf(entry: JournalEntry, t: TFunction): string {
	return scopeBadgeLabel(entry.scope, t)
}

export function IappelJournal({
	leadingControls,
	onCallBack,
	onWrite,
	onCommercialCallBack,
	onCommercialWrite,
	onContextualOpen,
	callPending = false,
	family,
}: IappelJournalProps) {
	const { t, i18n } = useTranslation("iappel")
	const timeZone = useViewerTimeZone()
	const { networkId } = useNetwork()
	const [filter, setFilter] = useState<JournalFilter>("all")

	const history = useAuthenticatedConvexQuery(api.modules.calls.history.listCallHistory, { networkId })
	const markJournalSeen = useMutation(api.modules.calls.preferences.markJournalSeen)

	// Ouvrir le journal EST l'acquittement des appels manqués : une seule
	// écriture au montage, sous garde de ref — sans elle, chaque rendu de ce
	// composant (qui reste monté tant que l'écran est affiché) réémettrait la
	// mutation, pour une raison aussi anodine qu'une frappe au clavier ailleurs
	// dans la page.
	const acknowledgedRef = useRef(false)
	useEffect(() => {
		if (acknowledgedRef.current) return
		acknowledgedRef.current = true
		void markJournalSeen({})
	}, [markJournalSeen])

	// Le serveur a CLASSÉ chaque appel pour moi (qui a composé, refus
	// automatique, mon ticket d'un appel de groupe) avec la règle pure du
	// domaine : ses lignes vont telles quelles à `groupCallJournal`, qui trie et
	// sépare les manqués à traiter. Aucune identité à attendre pour classer.
	const isLoading = history.isLoading

	const journal = useMemo(() => groupCallJournal(history.data?.calls ?? []), [history.data])

	const entries = journalOfFamily(filter === "missed" ? journal.missed : journal.all, family)
	const locale = i18n.language
	const now = Date.now()
	const dayGroups = useMemo(() => groupByDay(entries, now, t, locale, timeZone), [entries, now, t, locale, timeZone])

	return (
		<div role="region" aria-label={t("iappelJournal.label")}>
			<div
				className="msg-filter-row"
				role="group"
				aria-label={t("iappelJournal.filterLabel")}
			>
				{leadingControls}
				<button
					type="button"
					className="msg-filter-btn"
					aria-pressed={filter === "all"}
					onClick={() => setFilter("all")}
				>
					{t("iappelJournal.all")}
				</button>
				<button
					type="button"
					className="msg-filter-btn"
					aria-pressed={filter === "missed"}
					onClick={() => setFilter("missed")}
				>
					{t("iappelJournal.missed")}
					{journal.missed.length > 0 ? (
						<span className="iappel-count" style={{ marginLeft: 6 }}>
							{journal.missed.length}
						</span>
					) : null}
				</button>
			</div>

			{isLoading ? (
				<p className="icom-relations-empty">{t("iappelJournal.loading")}</p>
			) : entries.length === 0 ? (
				<p className="icom-relations-empty">
					{filter === "missed" ? t("iappelJournal.emptyMissed") : t("iappelJournal.empty")}
				</p>
			) : (
				dayGroups.map((group, index) => (
					<div key={`${index}-${group.day}`}>
						<p
							style={{
								margin: 0,
								padding: "10px 12px 4px",
								fontSize: 12,
								fontWeight: 700,
								color: "var(--ink-500)",
							}}
						>
							{group.label}
						</p>
						<ul className="icom-relations-list">
							{group.entries.map((entry) => {
								const presentation = categoryPresentationOf(entry, t)
								const Icon = presentation.Icon
								// Le nom choisi ou publié (`counterpartLabel`) ; sans nom, le
								// libellé neutre — jamais un identifiant.
								const name = entry.counterpartLabel?.displayName ?? t("iappelJournal.peer")
								const commercialThreadId = entry.commercialThreadId
								// CC-5 : une ligne contextuelle ne connaît qu'un geste, ouvrir SA conversation.
								const contextualThreadId = entry.contextualThreadId
								const canReach = contextualThreadId !== undefined
									? onContextualOpen !== undefined
									: entry.counterpartUserId !== null && (commercialThreadId === undefined || onCommercialCallBack !== undefined)
								const canWrite = contextualThreadId !== undefined
									? onContextualOpen !== undefined
									: commercialThreadId === undefined ? onWrite !== undefined : onCommercialWrite !== undefined

								return (
									<li key={entry.meetingId} className="icom-relations-row">
										<Icon
											aria-hidden="true"
											size={18}
											style={{ color: "var(--ink-600)", flex: "0 0 auto" }}
										/>
										<span className="icom-relations-ident">
											<span
												className="icom-relations-name"
												style={
													entry.category === "missed"
														? { color: "var(--destructive)" }
														: undefined
												}
											>
												{name}
											</span>
											<span className="icom-relations-handle">
												{presentation.label} · {contextualThreadId !== undefined ? t("messagerie:contextualConversation.calls.origin") : commercialThreadId !== undefined && onCommercialCallBack ? t("shops:contact.calls.origin") : scopeLineOf(entry, t)}
											</span>
											{entry.note ? (
												<span style={{ fontSize: 11.5, color: "var(--ink-600)" }}>
													« {entry.note} »
												</span>
											) : null}
										</span>
										<span
											style={{
												display: "flex",
												flexDirection: "column",
												alignItems: "flex-end",
												gap: 2,
												flex: "0 0 auto",
											}}
										>
											<span style={{ fontSize: 11.5, color: "var(--ink-500)" }}>
												{formatClockTime(entry.at, now, locale, t, timeZone)}
											</span>
											{entry.durationMs !== null ? (
												<span
													className="iappel-count"
													style={{ fontSize: 11.5, color: "var(--ink-500)" }}
												>
													{formatElapsed(entry.durationMs)}
												</span>
											) : null}
										</span>
										<span className="icom-relations-actions">
											{canWrite ? (
												<button
													type="button"
													className="icom-relations-action"
													data-icon="true"
													data-role="message"
													style={{ minHeight: 44 }}
													disabled={contextualThreadId === undefined && commercialThreadId === undefined && entry.counterpartUserId === null}
													aria-label={contextualThreadId !== undefined ? t("messagerie:contextualConversation.calls.writeFromJournal", { name }) : t("iappelJournal.write", { name })}
													onClick={() => {
														if (contextualThreadId !== undefined) onContextualOpen?.(contextualThreadId)
														else if (commercialThreadId !== undefined) onCommercialWrite?.(commercialThreadId)
														else if (entry.counterpartUserId) onWrite?.(entry.counterpartUserId)
													}}
												>
													<MessageSquare aria-hidden="true" size={16} />
												</button>
											) : null}
											<button
												type="button"
												className="icom-relations-action"
												data-icon="true"
												style={{ minHeight: 44 }}
												disabled={!canReach || callPending}
												aria-label={contextualThreadId !== undefined ? t("messagerie:contextualConversation.calls.callBackFromJournal", { name }) : t("iappelJournal.callBack", { name })}
												onClick={() => {
													// CC-5 : rappeler PAR la conversation (accord et cible relus), jamais `callMember`.
													if (contextualThreadId !== undefined) {
														onContextualOpen?.(contextualThreadId)
														return
													}
													if (!entry.counterpartUserId) return
													if (commercialThreadId !== undefined) {
														onCommercialCallBack?.({ threadId: commercialThreadId, counterpartPersonId: entry.counterpartUserId, name, mediaType: entry.mediaType })
														return
													}
													onCallBack({
														userId: entry.counterpartUserId,
														name,
														mediaType: entry.mediaType,
													})
												}}
											>
												<Phone aria-hidden="true" size={16} />
											</button>
										</span>
									</li>
								)
							})}
						</ul>
					</div>
				))
			)}
		</div>
	)
}
