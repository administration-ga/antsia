// Dupliqué de socle/packages/agent-features/src/features/messagerie/MessagerieListView.tsx @ ad2e7fdc2 — adaptations : branche « poste » élaguée (sur-titre de la fonction `poste.positionTitle`, commentaires de l'espace de poste) ; DTO du moteur (`threadId` au lieu de `chatId`, `counterpart.personId`, nom NULLABLE → libellé neutre traduit) ; aperçu composé par `apercuFil` (vocal, pièces, appel, retrait — le moteur ne dénormalise que la nature du dernier message) et pictogramme des pièces sur `attachments` ; dates dans la langue courante (`formatThreadTime(…, i18n.language)`) ; toutes les chaînes d'interface traduites (clés `messagerieListView.*`, pluriels) ; présence lue par personne (`presenceOf(personId)`) ; préférence de fuseau fournie par useViewerTimeZone ; PA6 : dates et jours civils dans le fuseau personnel du lecteur (repli appareil) ; CC-5 : filtre « Mises en relation » servi par la liste contextuelle injectée (`renderContextualList`), dans les deux présentations ; P05 : en destination, une fenêtre vide non terminale n'affirme aucun vide (aveu « parmi celles déjà chargées » et « Charger plus pour chercher »).
// L'import inutilisé ChevronDown reste retiré ; le hook de fuseau est une dépendance exécutable.
"use client"

import { useViewerTimeZone } from "@antsia/api/viewer-preferences"

/**
 * MessagerieListView — la liste des conversations, dans la carte OU sur la page.
 *
 * Extraite de `MessagerieDock` pour que la carte du bureau et la page du
 * téléphone montrent EXACTEMENT la même liste : mêmes règles de fusion, même
 * filtre sans accents, même signal de non-lu, mêmes aperçus. Deux listes
 * séparées auraient divergé au premier ajustement.
 *
 * Ce qui décide vit ailleurs : `messagerie-liste.ts` (filtre, horodatage,
 * aperçu), `groupe-liste.ts` (fusion 1:1 + groupes, tri par dernier message).
 *
 * ⚠️ Le non-lu se dit par la GRAISSE du nom autant que par la pastille : la
 * pastille se perd pour qui ne distingue pas le rouge, et c'est la seule
 * information de cet écran qui compte vraiment.
 */

import {
	MessageCircle,
	MessagesSquare,
	Mic,
	Paperclip,
	PenSquare,
	Phone,
	Search,
} from "lucide-react"
import { useEffect, useId, useRef, useState, type ReactNode } from "react"
import { useTranslation } from "react-i18next"
import { PresenceDot, type PresenceState } from "../iappel/presence-dot"
import { Avatar } from "../reseau-personnel/Avatar"
import { GroupeAvatar } from "./GroupeAvatar"
import { IcomBrickHeader } from "./IcomBrickHeader"
import { conversationFilterCount, filtrerConversations, parseConversationFilter, servedConversationFilters, type ConversationFilterId } from "./icom-views"
import { readListState, writeListState } from "./messagerie-list-state"
import { MessagerieGroupeInvitations } from "./MessagerieGroupeInvitations"
import {
	filtrerConversationsParType,
	filtrerGroupes,
	formaterNonLus,
	type FiltreConversations,
} from "./groupe-liste"
import { chatKey, groupeKey } from "./messagerie-dock"
import {
	apercuFil,
	filtrerThreads,
	formatThreadTime,
	messageListeVide,
} from "./messagerie-liste"
import { MessagerieStyles } from "./messagerie-styles"
import {
	SOURCE_AGENT,
	etatDeSource,
	type MessagerieSource,
} from "./messagerie-source"
import { ReseauQueryError } from "../../shell/ReseauQueryError"
import {
	conserveDonneesEnErreur,
	montreSquelette,
} from "../../shell/query-state"
import {
	isCompactPose,
	isRepliablePose,
	type MessagerieNav,
	type MessagerieVariant,
} from "./messagerie-views"

/**
 * Le pictogramme d'un aperçu, quand le dernier message n'est pas du texte.
 *
 * ⚠️ `lastMessageKind` vient du SERVEUR : le deviner en relisant le texte de
 * l'aperçu ferait afficher un micro sur un message qui dirait « message
 * vocal ». C'est la nature de la LIGNE qu'on montre, pas le contenu de sa
 * phrase.
 */
function pictogrammeApercu(kind: string | null | undefined): ReactNode {
	switch (kind) {
		case "voice":
			return <Mic aria-hidden="true" size={12} />
		case "attachments":
			return <Paperclip aria-hidden="true" size={12} />
		case "call":
			return <Phone aria-hidden="true" size={12} />
		default:
			return null
	}
}

export interface MessagerieListViewProps {
	variant: MessagerieVariant
	nav: MessagerieNav
	/** La carte est-elle dépliée ? Toujours vrai sur la page. */
	open?: boolean
	/** Le total de non-lus, calculé par le parent (il l'affiche aussi ailleurs). */
	unread: number
	/** Conversation à signaler dans les poses qui gardent la liste montée. */
	activeKey?: string | null
	/**
	 * D'OÙ viennent les fils. Par défaut, la source personnelle — la vue se
	 * comportait ainsi avant d'être injectable, et le défaut le dit.
	 */
	source?: MessagerieSource
	/** La barre globale de l'hôte porte-t-elle déjà Rétracter/Détacher ? */
	showDockControls?: boolean
	/**
	 * La PRÉSENCE d'un correspondant, par sa personne, quand la surface sait
	 * la dire.
	 *
	 * Optionnelle, et `null` est une réponse à part entière : « on ne sait
	 * pas » (présence non partagée) n'invente pas de pastille — `PresenceDot`
	 * ne rend alors rien. La liste ne lit JAMAIS la présence elle-même : la
	 * mettre dans un read-set réactif ré-exécuterait la requête au rythme des
	 * battements de présence.
	 */
	presenceOf?: (personId: string) => PresenceState | null
	/** Présentation P05 choisie par l'application, jamais imposée au moteur. */
	destinationMode?: boolean
	/** Réseau + personne + pose ; mémoire volatile, jamais du stockage navigateur. */
	stateScope?: string
	/** Injection facultative de l'application, sans convertir les fils commerciaux en fils personnels. */
	renderCommercialList?: (query: string) => ReactNode
	/**
	 * CC-5 : la liste « Mises en relation » injectée par l'application (conversations contextuelles,
	 * `useContextualMessages().renderList`). Absente, le filtre n'existe pas ; présente, il est
	 * offert dans les deux présentations (destinations et volets), sans jamais convertir un fil
	 * contextuel en fil personnel.
	 */
	renderContextualList?: (query: string) => ReactNode
}

export function MessagerieListView({
	variant,
	nav,
	open = true,
	unread,
	activeKey = null,
	source = SOURCE_AGENT,
	showDockControls = true,
	presenceOf,
	destinationMode = false,
	stateScope,
	renderCommercialList,
	renderContextualList,
}: MessagerieListViewProps) {
	const { t, i18n } = useTranslation("messagerie")
	const timeZone = useViewerTimeZone()
	const [recherche, setRecherche] = useState(() => stateScope ? readListState(stateScope).query : "")
	const [filtre, setFiltre] = useState<FiltreConversations | ConversationFilterId>(() => stateScope ? parseConversationFilter(readListState(stateScope).filter, !!renderCommercialList, !!renderContextualList) : "toutes")
	const commercialActive = destinationMode && filtre === "boutiques" && renderCommercialList !== undefined
	const contextualActive = filtre === "mises_en_relation" && renderContextualList !== undefined
	const bodyRef = useRef<HTMLDivElement>(null)
	const restorePosition = useRef(stateScope ? readListState(stateScope).scrollTop : 0)
	const restoreDepth = useRef(stateScope ? readListState(stateScope).loadedThreadCount : 0)
	const restoring = useRef(stateScope ? readListState(stateScope).scrollTop > 0 || readListState(stateScope).loadedThreadCount > 0 : false)
	const threads = source.useThreadsPage()
	const groupes = source.useGroupThreads()
	const nonLus = source.useUnreadTotals()
	const bodyId = useId()
	const scopeDescriptionId = useId()

	const tous = threads.data ?? []
	const tousGroupes = groupes.data ?? []
	/**
	 * L'état de CHAQUE liste, décidé par le contrat partagé du réseau — jamais
	 * par `isLoading` seul (IC-07). Ce que cela change, à l'écran :
	 *  · une PANNE ne se présente plus comme « Aucune conversation » ;
	 *  · une panne APRÈS des données ne les efface pas — bandeau au-dessus ;
	 *  · une liste DÉSACTIVÉE n'attend plus indéfiniment quelque chose qui ne
	 *    viendra jamais.
	 */
	const etatThreads = etatDeSource(threads)
	const etatGroupes = etatDeSource(groupes)
	const enPanne = etatThreads === "erreur" || etatGroupes === "erreur"
	const totalCharge = tous.length + tousGroupes.length
	const panneSansDonnees = enPanne && totalCharge === 0
	const panneAvecDonnees =
		conserveDonneesEnErreur(etatThreads, totalCharge) ||
		conserveDonneesEnErreur(etatGroupes, totalCharge)
	const reessayer = () => {
		if (threads.isError) threads.refetch()
		if (groupes.isError) groupes.refetch()
	}
	// Filtre PUIS fusion : chaque famille se filtre sur ce qu'elle sait dire
	// (le correspondant pour le 1:1, le titre pour le groupe), la fusion trie.
	const directsFiltres = filtrerThreads(tous, recherche)
	const groupesFiltres = filtrerGroupes(tousGroupes, recherche)
	const visibles = destinationMode
		? filtrerConversations(directsFiltres, groupesFiltres, parseConversationFilter(filtre))
		: filtrerConversationsParType(directsFiltres, groupesFiltres, filtre === "individuelles" ? "individuelles" : filtre === "groupes" ? "groupes" : "toutes")
	const canLoadMore = threads.hasMore && (!destinationMode || filtre !== "groupes")
	useEffect(() => {
		const body = bodyRef.current
		if (!body || !restoring.current || threads.isLoading || groupes.isLoading) return
		const wanted = restorePosition.current
		body.scrollTop = wanted
		const depthRestored = tous.length >= restoreDepth.current
		if ((depthRestored && body.scrollHeight - body.clientHeight >= wanted) || !canLoadMore || threads.isError) {
			restoring.current = false
		} else if (!threads.isLoadingMore) threads.loadMore()
	}, [threads, groupes, canLoadMore, tous.length])
	useEffect(() => {
		if (stateScope && !restoring.current && threads.data !== undefined) writeListState(stateScope, { loadedThreadCount: threads.data.length })
	}, [stateScope, threads.data])
	useEffect(() => {
		if (!stateScope || activeKey !== null || threads.isLoading || groupes.isLoading || restoring.current) return
		const key = readListState(stateScope).returnFocusKey
		if (key === null) return
		const row = Array.from(bodyRef.current?.querySelectorAll<HTMLElement>("[data-conversation-key]") ?? []).find((item) => item.dataset.conversationKey === key)
		if (!row) return
		row.focus({ preventScroll: true })
		writeListState(stateScope, { returnFocusKey: null })
	}, [stateScope, activeKey, threads.data, groupes.data, threads.isLoading, groupes.isLoading])
	/**
	 * ⚠️ Les pastilles viennent du SERVEUR, pas de la page chargée (IC-06).
	 * Additionner les `unreadCount` rendus donnait un chiffre qui variait avec
	 * la fenêtre — et qui retombait à zéro dès qu'on descendait dans la liste.
	 */
	const badgeIndividuels = formaterNonLus(nonLus.directs)
	const badgeGroupes = formaterNonLus(nonLus.groupes)
	const totalConversations = totalCharge
	const totalDansFiltre =
		filtre === "individuelles"
			? tous.length
			: filtre === "groupes"
				? tousGroupes.length
				: totalConversations
	const maintenant = Date.now()
	const langue = i18n.language
	const repliable = isRepliablePose(variant)
	const choisirFiltre = (prochain: FiltreConversations | ConversationFilterId) => {
		setFiltre(prochain)
		if (!destinationMode) setRecherche("")
		if (stateScope && destinationMode) writeListState(stateScope, { filter: parseConversationFilter(prochain, !!renderCommercialList, !!renderContextualList), scrollTop: 0 })
		restoring.current = false
		if (bodyRef.current) bodyRef.current.scrollTop = 0
	}
	const rechercheLabel =
		commercialActive ? t("shops:contact.inbox.search") : contextualActive ? t("contextualConversation.list.search") : filtre === "groupes"
			? t("messagerieListView.searchGroups")
			: filtre === "individuelles"
				? t("messagerieListView.searchDirects")
				: t("messagerieListView.searchAll")

	return (
		<>
			<MessagerieStyles />

			<IcomBrickHeader
				icon={MessageCircle}
				/* Le nom du module ne s'écrit pas : l'en-tête nomme la BRIQUE
				   affichée, comme WhatsApp titre « Discussions ». */
				title={
					destinationMode ? t("icomViews.conversations") : isCompactPose(variant)
						? t("messagerieListView.titleCompact")
						: t("messagerieListView.titlePage")
				}
				repliable={repliable}
				open={open}
				bodyId={bodyId}
				unread={unread}
				iconSize={variant === "page" ? 19 : 17}
				showDockControls={showDockControls}
				actions={
					<>
						{/* ⚠️ Le geste « groupe » suit la SOURCE : une source sans
						    groupes n'offre pas un bouton qui fabriquerait un refus. */}
						<button
							type="button"
							className="msg-icon-btn"
							aria-label={t("messagerieListView.newMessage")}
							title={t("messagerieListView.newMessage")}
							onClick={nav.openCompose}
						>
							<PenSquare aria-hidden="true" size={16} />
						</button>
						{source.supporteGroupes ? (
							<button
								type="button"
								className="msg-group-btn"
								aria-label={t("messagerieListView.newGroup")}
								title={t("messagerieListView.newGroup")}
								onClick={nav.openComposeGroupe}
								style={variant === "dock" ? { marginRight: 6 } : undefined}
							>
								<MessagesSquare aria-hidden="true" size={16} />
								<span>{t("messagerieListView.groupButton")}</span>
							</button>
						) : null}
					</>
				}
			/>

			{open ? (
				<>
					{destinationMode ? (
						<div className="msg-filter-row" role="group" aria-label={t("messagerieListView.filterLabel")}>
							{servedConversationFilters(!!renderCommercialList, !!renderContextualList).filter((filter) => source.supporteGroupes || filter.id !== "groupes").map((filter) => {
								const count = conversationFilterCount(filter.id, nonLus)
								const badge = nonLus.isLoading || nonLus.isError || !count ? null : formaterNonLus(count)
								return <button key={filter.id} type="button" className="msg-filter-btn" aria-pressed={filtre === filter.id} onClick={() => choisirFiltre(filter.id)}>
									{t(filter.labelKey)}{badge !== null ? <span className="msg-filter-count"><span aria-hidden="true">{badge}</span><span className="sr-only">{t("icomViews.unread", { count: count!.total })}</span></span> : null}
								</button>
							})}
						</div>
					) : source.supporteGroupes ? (
						<div
							className="msg-filter-row"
							role="group"
							aria-label={t("messagerieListView.filterLabel")}
						>
							<button
								type="button"
								className="msg-filter-btn"
								aria-pressed={filtre === "toutes"}
								onClick={() => choisirFiltre("toutes")}
							>
								{t("messagerieListView.filterAll")}
							</button>
							<button
								type="button"
								className="msg-filter-btn"
								aria-pressed={filtre === "individuelles"}
								aria-label={
									badgeIndividuels === null
										? t("messagerieListView.filterDirectsLabel")
										: t("messagerieListView.filterDirectsUnread", {
												count: nonLus.directs.total,
											})
								}
								onClick={() => choisirFiltre("individuelles")}
							>
								{t("messagerieListView.filterDirects")}
								{badgeIndividuels !== null ? (
									<span aria-hidden="true" className="msg-filter-count">
										{badgeIndividuels}
									</span>
								) : null}
							</button>
							<button
								type="button"
								className="msg-filter-btn"
								aria-pressed={filtre === "groupes"}
								aria-label={
									badgeGroupes === null
										? t("messagerieListView.filterGroupsLabel")
										: t("messagerieListView.filterGroupsUnread", {
												count: nonLus.groupes.total,
											})
								}
								onClick={() => choisirFiltre("groupes")}
							>
								{t("messagerieListView.filterGroups")}
								{badgeGroupes !== null ? (
									<span aria-hidden="true" className="msg-filter-count">
										{badgeGroupes}
									</span>
								) : null}
							</button>
							{/* CC-5 : offert SEULEMENT quand l'application injecte sa liste contextuelle. */}
							{renderContextualList !== undefined ? (
								<button
									type="button"
									className="msg-filter-btn"
									aria-pressed={filtre === "mises_en_relation"}
									onClick={() => choisirFiltre("mises_en_relation")}
								>
									{t("contextualConversation.filter")}
								</button>
							) : null}
						</div>
					) : null}
					{/* ⚠️ AVANT la recherche et AVANT la liste : une invitation est
					    une conversation qui n'a pas commencé, et c'est le seul
					    endroit d'où l'on puisse l'accepter. Sans ce bloc,
					    `respondGroupInvite` n'a aucun appelant et les groupes
					    créés restent à un membre pour toujours. */}
					{!commercialActive && !contextualActive && source.supporteGroupes && filtre !== "individuelles" ? (
						<MessagerieGroupeInvitations nav={nav} />
					) : null}
					{destinationMode || contextualActive || totalDansFiltre > 0 ? (
						<div className="msg-search-row">
							<Search aria-hidden="true" size={14} />
							<input
								type="search"
								value={recherche}
								maxLength={commercialActive ? 120 : undefined}
								placeholder={rechercheLabel}
								aria-label={rechercheLabel}
								aria-describedby={destinationMode && !commercialActive && !contextualActive ? scopeDescriptionId : undefined}
								onChange={(event) => {
									setRecherche(event.target.value)
									if (stateScope) writeListState(stateScope, { query: event.target.value, scrollTop: 0 })
									restoring.current = false
									if (bodyRef.current) bodyRef.current.scrollTop = 0
								}}
							/>
						</div>
					) : null}

					{destinationMode && !commercialActive && !contextualActive ? <p id={scopeDescriptionId} className="msg-list-scope">{t(threads.hasMore ? "icomViews.loadedWindow" : "icomViews.loadedGroupsWindow")}</p> : null}
					<div className="msg-body" id={bodyId} ref={bodyRef} onScroll={(event) => {
						if (stateScope && !restoring.current) writeListState(stateScope, { scrollTop: event.currentTarget.scrollTop })
					}}>
						{commercialActive ? renderCommercialList(recherche) : contextualActive ? renderContextualList(recherche) : <>
						{/* ⚠️ La PANNE se dit AVANT le vide : « Aucune conversation » sur
						    une boîte pleine est un écran qui affirme le faux, et il
						    n'offre aucun moyen de réessayer. Quand des conversations
						    sont déjà là, elles RESTENT et le bandeau se pose au-dessus. */}
						{panneAvecDonnees ? (
							<div style={{ padding: "8px 10px 0" }}>
								<ReseauQueryError
									title={t("messagerieListView.partialErrorTitle")}
									message={t("messagerieListView.partialErrorMessage")}
									onRetry={reessayer}
								/>
							</div>
						) : null}
						{panneSansDonnees ? (
							<div style={{ padding: "8px 10px" }}>
								<ReseauQueryError
									title={t("messagerieListView.errorTitle")}
									message={t("messagerieListView.errorMessage")}
									onRetry={reessayer}
								/>
							</div>
						) : montreSquelette(etatThreads) || montreSquelette(etatGroupes) ? (
							<p className="msg-empty">{t("messagerieListView.loading")}</p>
						) : totalConversations === 0 && (!destinationMode || !canLoadMore) ? (
							<p className="msg-empty">{messageListeVide(t)}</p>
						) : totalDansFiltre === 0 && (!destinationMode || !canLoadMore) ? (
							// P05 : en destination, tant que des fils 1:1 restent à charger, une fenêtre
							// vide ne dit pas « aucune conversation » — la branche suivante l'avoue et
							// offre « Charger plus pour chercher ».
							<p className="msg-empty">
								{filtre === "groupes"
									? t("messagerieListView.noGroups")
									: t("messagerieListView.noDirects")}
							</p>
						) : visibles.length === 0 ? (
							<div className="msg-empty">
								<p style={{ margin: 0 }}>
									{destinationMode && !recherche.trim() ? t("icomViews.noFilteredConversations") : destinationMode || threads.hasMore
										? t("messagerieListView.noMatchLoaded", { term: recherche.trim() })
										: t("messagerieListView.noMatch", { term: recherche.trim() })}
								</p>
								{/* ⚠️ « Aucun résultat » avant d'avoir tout chargé est un
								    MENSONGE : la recherche est locale aux pages en main.
								    Tant que la boîte n'est pas épuisée, on l'annonce et
								    on donne le geste qui va au bout. */}
								{canLoadMore ? (
									<button
										type="button"
										className="msg-filter-btn"
										style={{ marginTop: 8, minHeight: 44 }}
										disabled={threads.isLoadingMore}
										onClick={threads.loadMore}
									>
										{threads.isLoadingMore
											? t("messagerieListView.loading")
											: t("messagerieListView.loadMoreToSearch")}
									</button>
								) : null}
							</div>
						) : (
							<ul className="msg-list">
								{visibles.map((entree) => {
									if (entree.kind === "chat") {
										const fil = entree.chat
										const cle = chatKey(String(fil.threadId))
										const nom =
											fil.counterpart.displayName ??
											t("messagerieListView.unknownCounterpart")
										return (
											<li key={`c-${String(fil.threadId)}`}>
												<button
													type="button"
													className="msg-row"
													data-unread={fil.unreadCount > 0 ? "true" : "false"}
													aria-current={activeKey === cle ? "true" : undefined}
													data-conversation-key={cle}
													onClick={() => nav.openConversation(cle)}
												>
													<Avatar
														displayName={nom}
														avatarUrl={fil.counterpart.avatarUrl}
														hasIdentity={fil.counterpart.source === "published"}
														size={variant === "page" ? 44 : 32}
													/>
													<span className="msg-row-main">
														{/* La pastille est DANS la ligne du nom : `.msg-row-name`
														    est un bloc à ellipse, et une pastille posée après
														    lui tomberait sur une ligne à elle. Le libellé
														    l'accompagne en `sr-only` (cf. `PresenceDot`). */}
														<span className="msg-row-name">
															{nom}
															{presenceOf ? (
																<PresenceDot
																	state={
																		presenceOf(String(fil.counterpart.personId)) ?? null
																	}
																/>
															) : null}
														</span>
														<span className="msg-row-preview">
															{pictogrammeApercu(fil.lastMessageKind)}{" "}
															{apercuFil(fil, t)}
														</span>
													</span>
													{fil.unreadCount > 0 ? (
														<>
															<span aria-hidden="true" className="msg-badge">
																{fil.unreadCapped ? "99+" : fil.unreadCount}
															</span>
															<span className="sr-only">
																{t("messagerieListView.unread", { count: fil.unreadCount })}
															</span>
														</>
													) : (
														<span className="msg-row-time">
															{formatThreadTime(fil.lastMessageAt, maintenant, langue, timeZone)}
														</span>
													)}
												</button>
											</li>
										)
									}
									const groupe = entree.groupe
									const cle = groupeKey(String(groupe.threadId))
									return (
										<li key={`g-${String(groupe.threadId)}`}>
											<button
												type="button"
												className="msg-row"
												data-unread={groupe.unreadCount > 0 ? "true" : "false"}
												aria-current={activeKey === cle ? "true" : undefined}
													data-conversation-key={cle}
												onClick={() => nav.openConversation(cle)}
											>
												<GroupeAvatar
													title={groupe.title}
													avatarUrl={groupe.avatarUrl}
													size={variant === "page" ? 44 : 32}
												/>
												<span className="msg-row-main">
													<span className="msg-row-name">{groupe.title}</span>
													<span className="msg-row-preview">
														{groupe.activeCall !== null
															? t("messagerieListView.callInProgress")
															: apercuFil(groupe, t)}
													</span>
												</span>
												{groupe.unreadCount > 0 ? (
													<>
														<span aria-hidden="true" className="msg-badge">
															{groupe.unreadCapped ? "99+" : groupe.unreadCount}
														</span>
														<span className="sr-only">
															{t("messagerieListView.unread", { count: groupe.unreadCount })}
														</span>
													</>
												) : (
													<span className="msg-row-time">
														{formatThreadTime(groupe.lastMessageAt, maintenant, langue, timeZone)}
													</span>
												)}
											</button>
										</li>
									)
								})}
								{/* ⚠️ La liste ne s'arrête plus à sa première page (IC-06) : la
								    boîte se paginait à 30 fils sur 200 et se taisait. Rendu DANS la
								    liste, en dernier élément — un bouton posé hors du `<ul>`
								    sortirait de l'ordre de lecture. */}
								{canLoadMore ? (
									<li>
										<button
											type="button"
											className="msg-row"
											style={{
												justifyContent: "center",
												minHeight: 44,
												fontWeight: 600,
											}}
											disabled={threads.isLoadingMore}
											onClick={threads.loadMore}
										>
											{threads.isLoadingMore
												? t("messagerieListView.loading")
												: t("messagerieListView.loadMore")}
										</button>
									</li>
								) : null}
							</ul>
						)}
						</>}
					</div>
				</>
			) : null}
		</>
	)
}
