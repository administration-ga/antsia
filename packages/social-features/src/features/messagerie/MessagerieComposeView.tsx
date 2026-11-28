// Dupliqué de socle/packages/agent-features/src/features/messagerie/MessagerieComposeView.tsx @ ad2e7fdc2 — adaptations : toutes les chaînes d'interface traduites (espace `messagerie`, clés `messagerieComposeView.*`) ; nom d'une relation NULLABLE (DTO du moteur) — libellé neutre traduit à l'écran ; « volet Relations d'iRéseau » devient « Relations du réseau » ; état d'erreur par `ReseauQueryError` de la coque ; logique inchangée.
"use client"

import { IcomContactActions, useIcomContactTools } from "./IcomContactActions"

/**
 * MessagerieComposeView — le choix d'un destinataire (« nouveau message »).
 *
 * Extraite de `MessagerieDock` : la carte du bureau et la page du téléphone
 * affichent les mêmes RELATIONS ACCEPTÉES. La recherche ne franchit jamais ce
 * périmètre : découvrir une personne et lui demander une relation appartient
 * au réseau ; iCom ne permet de lui écrire qu'une fois la relation acceptée.
 *
 * ⚠️ Choisir quelqu'un n'ÉCRIT rien : cela ouvre un BROUILLON
 * (`draft:<handle>`), et c'est le premier message qui crée le fil
 * (`startThreadWithHandle`). Créer un fil vide pour avoir quelque chose à
 * afficher serait la mauvaise sémantique — un fil existe parce que quelqu'un
 * a écrit.
 */

import { ArrowLeft, ChevronDown, Search } from "lucide-react"
import { useEffect, useRef, useState } from "react"
import { useTranslation } from "react-i18next"
import { Avatar } from "../reseau-personnel/Avatar"
import { ReseauQueryError } from "../../shell/ReseauQueryError"
import { usePersonalConnections } from "../reseau-personnel/use-dual-connection-pagination"
import { useRelationSearch } from "../reseau-personnel/use-relation-search"
import { dockStore } from "./dock-store"
import { draftKey } from "./messagerie-dock"
import {
	deriveRecipientListState,
	shouldOfferMoreRecipients,
} from "./messagerie-recipients"
import { MessagerieStyles } from "./messagerie-styles"
import {
	isCompactPose,
	isRepliablePose,
	type MessagerieNav,
	type MessagerieVariant,
} from "./messagerie-views"

export interface MessagerieComposeViewProps {
	variant: MessagerieVariant
	nav: MessagerieNav
	open?: boolean
	/**
	 * Replier la carte — le dock, et lui seul.
	 *
	 * ⚠️ Le repli est la GÉOMÉTRIE de la carte, pas un geste de navigation :
	 * il ne rejoint donc pas `MessagerieNav`. Mais il ne peut pas non plus
	 * rester un appel direct au magasin persistant : une vue posée en page qui
	 * l'écrit replie le dock du BUREAU depuis le téléphone. Le geste redescend
	 * chez la POSE, seule à savoir où elle est.
	 */
	onToggleOpen?: () => void
}

export function MessagerieComposeView({
	variant,
	nav,
	onToggleOpen,
	open = true,
}: MessagerieComposeViewProps) {
	const { t } = useTranslation("messagerie")
	const [requete, setRequete] = useState("")
	const inputRef = useRef<HTMLInputElement>(null)
	const terme = requete.trim()
	const repliable = isRepliablePose(variant)
	const relations = usePersonalConnections({ pageSize: 25 })
	/**
	 * Deux sources, une seule liste (IC-05) : les pages déjà chargées,
	 * pré-filtrées à la frappe, et — dès deux caractères — la recherche
	 * SERVEUR parmi TOUTES mes relations. « Aucune relation ne correspond »
	 * n'est dit qu'une fois le serveur posé : la 26e relation n'est plus
	 * déclarée inexistante parce qu'elle manquait à la première page.
	 */
	const recherche = useRelationSearch(terme)
	const etat = deriveRecipientListState({
		terme,
		loaded: relations.items,
		hasMore: relations.hasMore,
		search: recherche,
	})
	const lignes = etat.kind === "vide" ? [] : etat.items
	const listeServeur = etat.kind === "liste" && etat.source === "serveur"

	const tools = useIcomContactTools()
	const canSearch = !tools || relations.items.length > 0
	useEffect(() => {
		if (open && canSearch) inputRef.current?.focus()
	}, [open, canSearch])

	return (
		<>
			<MessagerieStyles />

			<div className="msg-head-row">
				<button
					type="button"
					className="msg-icon-btn"
					aria-label={t("messagerieComposeView.back")}
					onClick={nav.back}
					style={isCompactPose(variant) ? { marginLeft: 6 } : undefined}
				>
					<ArrowLeft aria-hidden="true" size={variant === "page" ? 20 : 16} />
				</button>
				<button
					type="button"
					className="msg-head"
					aria-expanded={repliable ? open : undefined}
					onClick={() => onToggleOpen?.()}
					disabled={!repliable}
					style={!repliable ? { cursor: "default", opacity: 1 } : undefined}
				>
					<span className="msg-head-title">{t("messagerieComposeView.title")}</span>
					{repliable ? (
						<ChevronDown
							aria-hidden="true"
							size={16}
							style={{ transform: open ? "rotate(180deg)" : undefined }}
						/>
					) : null}
				</button>
			</div>

			{open ? (
				<>
					{/* Un <label> : toute la pastille (44 px) donne le focus au champ. */}
					{canSearch && <label className="msg-search-row" style={{ minHeight: 44 }}>
						<Search aria-hidden="true" size={14} />
						<input
							ref={inputRef}
							type="search"
							value={requete}
							placeholder={t("messagerieComposeView.searchPlaceholder")}
							aria-label={t("messagerieComposeView.searchLabel")}
							onChange={(event) => setRequete(event.target.value)}
						/>
					</label>}

					<div className="msg-body">
						{relations.isLoading ? (
							<p className="msg-empty">{t("messagerieComposeView.loading")}</p>
						) : relations.isError ? (
							<ReseauQueryError
								title={t("messagerieComposeView.relationsErrorTitle")}
								message={t("messagerieComposeView.relationsErrorMessage")}
								onRetry={relations.retry}
							/>
						) : relations.items.length === 0 ? (
							<IcomContactActions origin="message" fallback={<p className="msg-empty">{t("messagerieComposeView.noRelations")}</p>} />
						) : (
							<>
								{etat.kind === "erreur" ? (
									<ReseauQueryError
										title={t("messagerieComposeView.searchErrorTitle")}
										message={t("messagerieComposeView.searchErrorMessage")}
										onRetry={recherche.refetch}
									/>
								) : null}
								{etat.kind === "attente" ? (
									<p className="msg-empty" role="status">
										{t("messagerieComposeView.searching")}
									</p>
								) : null}
								{etat.kind === "vide" ? (
									etat.exhaustive ? (
										<p className="msg-empty">
											{t("messagerieComposeView.noMatch", { term: terme })}
										</p>
									) : (
										<p className="msg-empty">
											{t("messagerieComposeView.noLoadedMatch", { term: terme })}
										</p>
									)
								) : null}
								{lignes.length > 0 ? (
									<ul
										className="msg-list"
										aria-label={
											listeServeur
												? t("messagerieComposeView.foundRelations")
												: t("messagerieComposeView.myRelations")
										}
									>
										{lignes.map((personne) => {
											const nom =
												personne.displayName ?? t("messagerieComposeView.unnamedRelation")
											return (
												<li key={String(personne.connectionId)}>
													<button
														type="button"
														className="msg-row"
														disabled={!personne.handle}
														aria-label={
															personne.handle
																? t("messagerieComposeView.writeTo", { name: nom })
																: t("messagerieComposeView.unpublished", { name: nom })
														}
														onClick={() => {
															if (!personne.handle) return
															// Le brouillon vit dans le store MÊME sur la page : la
															// frappe doit survivre à un aller-retour, et c'est lui
															// qui la porte (cf. `messagerie-dock.ts`).
															dockStore.openDraft(personne.handle)
															nav.openConversation(draftKey(personne.handle))
														}}
													>
														<Avatar
															displayName={nom}
															avatarUrl={personne.avatarUrl}
															size={variant === "page" ? 44 : 32}
														/>
														<span className="msg-row-main">
															<span className="msg-row-name">{nom}</span>
															<span className="msg-row-preview">
																{personne.handle
																	? t("messagerieComposeView.handle", { handle: personne.handle })
																	: t("messagerieComposeView.unpublishedProfile")}
															</span>
														</span>
													</button>
												</li>
											)
										})}
									</ul>
								) : null}
								{/* Atteignable MÊME sans résultat local : c'était le défaut IC-05. */}
								{shouldOfferMoreRecipients(etat, relations.hasMore) ? (
									<button
										type="button"
										className="icom-relations-action"
										style={{ margin: 12, minHeight: 44 }}
										onClick={relations.loadMore}
									>
										{t("messagerieComposeView.loadMore")}
									</button>
								) : null}
								{relations.isLoadingMore ? (
									<p className="msg-empty">{t("messagerieComposeView.loadingMore")}</p>
								) : null}
							</>
						)}
					</div>
				</>
			) : null}
		</>
	)
}
