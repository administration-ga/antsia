// Dupliqué de socle/packages/agent-features/src/features/reseau-personnel/ReseauMenuRail.tsx @ ad2e7fdc2 — adaptations : déplacé dans la coque (`shell/`) ; branché sur le moteur — ma fiche par `people.persons.getMyPerson` (sans réseau ; identité montrée seulement si le profil est publié, portrait servi par la garde des fichiers), mes groupes par `thematicGroups.thematicGroups.myGroups`, mes pages suivies par la première page de `pages.pages.paginateMyPageFollows` (pages GÉNÉRIQUES du moteur, au lieu des pages d'organisation), réseau courant par `useNetwork()` ; adresses par la table des routes INJECTÉE (`useRoutes()` : volets sur `home()`, mon profil sur `profile(handle)`, fiche d'une page sur `page(handle)`, réglages sur `settings?.()`) — `personal-nav` et ses URL de l'espace retirés, une destination absente RETIRE son entrée (et « Voir plus » disparaît quand il n'a plus rien à déplier) ; volets SERVIS seuls (`menuItemsFor(counts, home)`) ; libellés par l'i18n (`reseau:reseauMenuRail.*`, libellé du volet par sa clé, pastille par `menuBadgeLabel(item, t)`) ; « iRéseau » devient « réseau » ; liens par `Link` de `@antsia/api/routing`, d'UNE seule pièce (un lien à la facture du bouton fantôme au lieu d'un bouton DANS un lien : deux arrêts de tabulation pour un geste) ; rendu, ordre et styles inchangés ; P02 (18/10/2026) : monté aussi HORS de la page réseau (`activeTab` nul, volets rendus en liens quand aucun `onSelectTab` n'est fourni) et, sous la navigation par destinations déclarée par l'application, coiffé des cinq destinations Fil · Découvrir · Créer · Messages · Profil (« Créer » ouvre la carte de choix partagée) — le volet Fil et « Voir plus » cèdent alors leur place aux destinations Fil et Profil ; les paramètres (`settings?.()`) gardent alors une entrée au pied du rail, courante sur leur page. ; système épuré (ADR-0027) : destination active en pastille tonale sans filet (`--esp-tab-active-*`, `--esp-chip-border`) et angle des puces (`--esp-chip-radius`), facture d'origine en repli. Pastilles de décompte aux couleurs des réactions (`--role-react-*`), ton d'origine en repli. ; sept univers (22/10/2026) : « Ma boutique » suit Boutiques quand l'application en fournit le libellé (`navigationLabels.myShop`) et la route `myActivity`.
"use client"

/**
 * Le RAIL-MENU du réseau — la navigation verticale du bureau.
 *
 * ⚠️ Il ne cohabite JAMAIS avec la barre d'onglets : `ReseauAgentPage` allume
 * ce menu et éteint la tablist dans la MÊME container query. Les mêmes volets
 * deux fois à l'écran donneraient deux marqueurs d'« actif » à tenir d'accord.
 *
 * Ce que le rail décide vit dans `reseau-menu.ts`, testé : la liste des
 * entrées y est DÉRIVÉE de `RESEAU_AGENT_TABS`, jamais recopiée. Il reprend
 * les volets servis parce qu'il REMPLACE la tablist horizontale ; Messages vit
 * séparément dans iCom et son dock.
 *
 * ⚠️ Ce rail a REMPLACÉ la carte « Mon réseau » et ses compteurs le
 * 2026-08-18. Les garder tous les deux aurait donné deux chemins vers les
 * relations dans la même colonne ; les chiffres qu'ils portaient sont devenus
 * les pastilles des entrées.
 */

import { api } from "@antsia/api/engine"
import { useAuthenticatedConvexQuery, useAuthenticatedPaginatedQuery } from "@antsia/api/hooks"
import { useNetwork, useNetworkNavigationLayout, useRoutes } from "@antsia/api/network"
import { Link, usePathname, useSearchParams } from "@antsia/api/routing"
import { Badge, Button, Card, Icon } from "@antsia/ui"
import { BriefcaseBusiness, FilePlus2, PanelsTopLeft, Store } from "lucide-react"
import { type CSSProperties, type ReactNode, useEffect, useState } from "react"
import { useTranslation } from "react-i18next"

import type { CreationKind } from "../features/reseau-personnel/creation-controller"
import { Avatar } from "../features/reseau-personnel/Avatar"
import { formatUnreadBadge } from "../features/reseau-personnel/shared"
import { AppearanceControl } from "./appearance"
import { RESEAU_SURFACE_STYLE } from "./design-styles"
import { CreationChoiceCard, useChoiceTrigger } from "./mobile/ReseauMobileCreateButton"
import { reseauAgentHref, type ReseauAgentTabId } from "./reseau-agent-nav"
import { menuBadgeLabel, menuItemsFor, SHORTCUTS_MAX, shortcutsFor, type ReseauMenuCounts } from "./reseau-menu"
import { RESEAU_MENU_RAIL_ADAPTIVE_CSS } from "./reseau-menu-rail-styles"
import {
	activeReseauDestination,
	ariaCurrentFor,
	reseauCreationChoices,
	reseauDestinations,
	type ReseauDestinationMatch,
	type ReseauDestinationRoutes,
} from "./reseau-menu-destinations"
import {
	isPlainLeftClick,
	RESEAU_DESTINATION_ICONS,
	useMessagesUnreadTotal,
	useReseauDestinationRoutes,
} from "./reseau-menu-destinations-ui"

const ITEM_STYLE = {
	width: "100%",
	justifyContent: "flex-start",
	gap: 12,
	// La charte impose 44 px de cible ; c'est aussi ce qui rend la colonne
	// lisible en diagonale, ce qu'on fait d'un menu qu'on connaît par cœur.
	minHeight: 44,
	paddingInline: 10,
	textAlign: "left" as const,
}

/**
 * Un LIEN à la facture d'un bouton fantôme (`Button variant="ghost"`) : une
 * destination est un lien d'une seule pièce — un bouton posé DANS un lien
 * ferait deux arrêts de tabulation pour un même geste, et un contenu
 * interactif imbriqué qu'aucun lecteur d'écran n'annonce de la même façon.
 */
const LINK_ITEM_STYLE = {
	...ITEM_STYLE,
	display: "flex",
	alignItems: "center",
	boxSizing: "border-box" as const,
	// En longues seulement : `paddingInline` vient d'`ITEM_STYLE`, et un
	// raccourci `padding` sur la même propriété ferait avertir React.
	paddingBlock: 8,
	// Système épuré (ADR-0027) : l'angle des puces ; 6 px ailleurs.
	borderRadius: "var(--esp-chip-radius, 6px)",
	border: "1px solid transparent",
	background: "transparent",
	color: "var(--ink-700)",
	fontWeight: 600,
	fontSize: 14,
	textDecoration: "none",
	whiteSpace: "nowrap" as const,
}

/**
 * Un volet rendu en LIEN, sélectionné : la facture du bouton `secondary` des
 * volets de la page réseau, pour qu'un lien et un bouton actifs se lisent de
 * la même façon.
 */
const SELECTED_LINK_ITEM_STYLE: CSSProperties = {
	...LINK_ITEM_STYLE,
	// Système épuré (ADR-0027) : pastille tonale sans filet dans les thèmes qui la
	// déclarent ; ailleurs, la facture d'origine (fond, encre et filet d'identité).
	background: "var(--esp-tab-active-bg, var(--ink-0))",
	color: "var(--esp-tab-active-fg, var(--primary-500))",
	border: "1px solid var(--esp-chip-border, var(--primary-500))",
}

/**
 * La pastille de décompte d'une entrée : aplat des réactions dans les thèmes qui
 * le déclarent (ADR-0027, comme la barre mobile et la cloche) ; ailleurs, le ton
 * `primary` d'origine du badge.
 */
const COUNT_BADGE_STYLE: CSSProperties = {
	background: "var(--role-react-fill, var(--primary-50))",
	color: "var(--role-react-on, var(--primary-600))",
	borderRadius: 999,
}

/** Le titre d'un groupe d'entrées du rail (« Vos raccourcis », « Dans le réseau »). */
const SECTION_TITLE_STYLE: CSSProperties = {
	margin: "0 0 8px",
	fontSize: 10.5,
	fontWeight: 700,
	letterSpacing: "0.08em",
	textTransform: "uppercase",
	color: "var(--muted-foreground)",
	paddingInline: 10,
}

/** Compare les chemins injectés, sans confondre une piste et un préfixe de nom. */
function railPathMatches(pathname: string | null, href: string | null | undefined): boolean {
	if (pathname === null || !href) return false
	const path = href.split(/[?#]/u)[0]?.replace(/\/+$/u, "") || "/"
	return pathname === path || (path !== "/" && pathname.startsWith(`${path}/`))
}

export function ReseauMenuRail({
	activeTab,
	counts,
	onSelectTab,
	onCreate,
	current,
}: {
	/** Le volet ouvert sur la page réseau ; `null` sur une autre page de membre. */
	activeTab: ReseauAgentTabId | null
	counts?: ReseauMenuCounts
	/**
	 * Ouvre un volet. Le rail ne connaît pas le routeur : il le demande. Absent
	 * (le rail monté HORS de la page réseau), chaque volet est un LIEN vers son
	 * adresse — il s'ouvre dans un onglet, et les gardes de sortie d'une page le
	 * voient comme toute navigation.
	 */
	onSelectTab?: (tab: ReseauAgentTabId) => void
	/**
	 * Navigation par destinations seulement : le format à SURFACE choisi dans
	 * « Créer » (publication, actu, conférence) — l'hôte l'ouvre en place.
	 */
	onCreate?: (kind: CreationKind) => void
	/**
	 * Navigation par destinations seulement : la destination courante quand
	 * l'application la connaît mieux que la coque — `undefined` la laisse
	 * déduire de l'adresse, `null` n'en allume aucune.
	 */
	current?: ReseauDestinationMatch | null
}) {
	const { t } = useTranslation("reseau")
	const { networkId, navigationLabels } = useNetwork()
	const { adaptive } = useNetworkNavigationLayout()
	const routes = useRoutes()
	const home = routes.home()
	const [expanded, setExpanded] = useState(false)
	/* La navigation par destinations, si l'APPLICATION l'a déclarée : le rail
	   se coiffe alors des cinq destinations, et ce qu'elles portent déjà (le
	   volet Fil, les destinations de compte) quitte la liste des volets. */
	const destinationRoutes = useReseauDestinationRoutes()
	// Ma fiche (sur moi-même : sans réseau).
	const myPerson = useAuthenticatedConvexQuery(api.modules.people.persons.getMyPerson, {})
	// Les raccourcis n'en montrent que SHORTCUTS_MAX : une page suffit.
	const pageFollows = useAuthenticatedPaginatedQuery(
		api.modules.pages.pages.paginateMyPageFollows,
		{ networkId },
		{ initialNumItems: SHORTCUTS_MAX },
	)
	const myGroups = useAuthenticatedConvexQuery(api.modules.thematicGroups.thematicGroups.myGroups, { networkId })

	const items = menuItemsFor(counts ?? {}, home).filter((item) => destinationRoutes === null || item.id !== "fil")
	const shortcuts = shortcutsFor(
		pageFollows.results.map((page) => ({
			pageId: page.pageId,
			handle: page.handle,
			name: page.name,
			logoUrl: page.logoUrl,
		})),
		(myGroups.data?.items ?? []).map((group) => ({
			groupId: group.groupId,
			name: group.name,
		})),
		{ home, page: routes.page },
	)

	const person = myPerson.data
	// Une identité ne se MONTRE que publiée : sans identifiant public, il n'y a
	// ni profil où mener, ni nom qu'un autre membre verrait.
	const handle = person?.published === true ? (person.handle ?? null) : null
	const profileHref = handle !== null ? routes.profile(handle) : null
	const displayName = person?.displayName ?? handle ?? ""
	const settingsHref = routes.settings?.() ?? null
	const shopsLabel = navigationLabels?.shops?.trim() ?? ""
	const shopsHref = adaptive && shopsLabel.length > 0 ? routes.shops?.() ?? null : null
	/* « Ma boutique » : l'application n'en donne le libellé qu'à qui gère déjà une boutique. */
	const myShopLabel = navigationLabels?.myShop?.trim() ?? ""
	const myShopHref = adaptive && myShopLabel.length > 0 ? routes.myActivity?.() ?? null : null
	const pathname = usePathname()
	/* U09 — épure (opt-in adaptatif d'ANTSIA) : le rail ne garde que les
	   destinations, Boutiques, Créer et Réglages. « Dans le réseau » vit dans
	   Explorer, l'identité dans la destination Profil (sa photo), l'apparence
	   dans le menu du compte : aucune entrée n'y est répétée. */
	const epure = adaptive && destinationRoutes !== null

	/* L'identité mène au profil — c'est le geste qu'on cherche en premier dans
	   un menu de réseau social. Sous la navigation par destinations, elle coiffe
	   les destinations plutôt que les volets. */
	const identity: ReactNode =
		profileHref !== null ? (
			<Link
				href={profileHref}
				className="rmr-identity"
				title={adaptive ? `${displayName} · @${handle}` : undefined}
				style={{
					display: "flex",
					alignItems: "center",
					gap: 10,
					minHeight: 44,
					padding: "6px 10px",
					borderRadius: 8,
					textDecoration: "none",
					color: "inherit",
				}}
			>
				<Avatar displayName={displayName} avatarUrl={person?.avatar?.url ?? null} size={32} />
				<span className="rmr-identity-label" style={{ display: "grid", gap: 1, minWidth: 0 }}>
					<span style={{ fontSize: 13.5, fontWeight: 700 }}>{displayName}</span>
					<span style={{ fontSize: 11.5, color: "var(--muted-foreground)" }}>@{handle}</span>
				</span>
			</Link>
		) : null

	const rail = (
		<Card padded={false} style={RESEAU_SURFACE_STYLE}>
			{destinationRoutes !== null ? (
				<RailDestinations
					routes={destinationRoutes}
					identity={epure ? null : identity}
					profileAvatar={epure ? { displayName, avatarUrl: person?.avatar?.url ?? null } : null}
					shops={epure && shopsHref !== null ? { href: shopsHref, label: shopsLabel } : null}
					myShop={epure && myShopHref !== null ? { href: myShopHref, label: myShopLabel } : null}
					grouped={epure}
					handle={handle}
					onSelectTab={onSelectTab}
					onCreate={onCreate}
					current={current}
				/>
			) : null}
			<nav aria-label={t("reseauMenuRail.navLabel")} style={epure ? { padding: 12, borderTop: "1px solid var(--esp-surface-border, var(--border))", marginTop: 12 } : { padding: 12 }}>
				{/* Les volets sous les destinations : un titre les sépare, pour
				    qu'une liste continue ne se lise pas comme un seul niveau. */}
				{epure ? null : destinationRoutes === null ? identity : <h2 className="rmr-section-title" style={SECTION_TITLE_STYLE}>{t("reseauDestinations.voletsTitle")}</h2>}

				{epure ? null : <ul
					style={{
						listStyle: "none",
						margin: "8px 0 0",
						padding: 0,
						display: "grid",
						gap: 2,
					}}
				>
					{items.map((item) => {
						const selected = item.id === activeTab
						const badgeLabel = menuBadgeLabel(item, t)
						const content = (
							<>
								<Icon name={item.icon} size={18} aria-hidden />
								<span className="rmr-label" style={{ flex: 1, fontSize: 13.5, fontWeight: 600 }}>{t(item.labelKey)}</span>
								{item.badge !== null ? (
									<span className="rmr-badge"><Badge tone="primary" size="sm" style={COUNT_BADGE_STYLE}>
										{/* Le chiffre est masqué au lecteur d'écran : la phrase
										    qui suit dit 3 QUOI, ce qu'un « 3 » nu ne dit pas. */}
										<span aria-hidden="true">{item.badge > 99 ? "99+" : item.badge}</span>
									</Badge></span>
								) : null}
								{badgeLabel !== null ? <span className="sr-only">{badgeLabel}</span> : null}
							</>
						)
						return (
							<li key={item.id}>
								{onSelectTab !== undefined ? (
									<Button
										className="rmr-item"
										title={adaptive ? t(item.labelKey) : undefined}
										variant={selected ? "secondary" : "ghost"}
										// `aria-current` et non `aria-selected` : ce sont des liens
										// de navigation, pas les onglets d'un `tablist`.
										aria-current={selected ? "page" : undefined}
										onClick={() => onSelectTab(item.id)}
										style={ITEM_STYLE}
									>
										{content}
									</Button>
								) : (
									/* Hors de la page réseau : l'adresse du volet, d'une seule
									   pièce (un lien, pas un bouton qui pousserait l'adresse). */
									<Link
										href={item.href}
										aria-current={selected ? "page" : undefined}
										style={selected ? SELECTED_LINK_ITEM_STYLE : LINK_ITEM_STYLE}
										className="rmr-item focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
										title={adaptive ? t(item.labelKey) : undefined}
									>
										{content}
									</Link>
								)}
							</li>
						)
					})}
				</ul>}

				{!epure && shopsHref !== null ? (
					<Link href={shopsHref} style={{ ...LINK_ITEM_STYLE, marginTop: 14 }} className="rmr-item focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" title={shopsLabel}>
						<Store size={18} aria-hidden="true" />
						<span className="rmr-label" style={{ flex: 1, fontSize: 13.5, fontWeight: 600 }}>{shopsLabel}</span>
					</Link>
				) : null}

				{/* « Voir plus » : les destinations de COMPTE, repliées par défaut.
				    Elles ne sont pas des volets — les mêler à la liste ci-dessus
				    laisserait croire qu'on reste dans le réseau. Une destination
				    que l'application ne sert pas n'a pas d'entrée, et sans entrée
				    il n'y a rien à déplier. Sous la navigation par destinations,
				    c'est la destination Profil qui les porte : pas de doublon. */}
				{destinationRoutes === null && (profileHref !== null || settingsHref !== null) ? (
					<>
						<Button variant="ghost" onClick={() => setExpanded((open) => !open)} aria-expanded={expanded} style={ITEM_STYLE}>
							<Icon name={expanded ? "chevronUp" : "chevronDown"} size={18} aria-hidden />
							<span style={{ fontSize: 13.5, fontWeight: 600 }}>
								{expanded ? t("reseauMenuRail.showLess") : t("reseauMenuRail.showMore")}
							</span>
						</Button>
						{expanded ? (
							<ul style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gap: 2 }}>
								{profileHref !== null ? (
									<li>
										<Link href={profileHref} style={LINK_ITEM_STYLE}>
											<Icon name="userCircle" size={18} aria-hidden />
											<span style={{ fontSize: 13.5, fontWeight: 600 }}>{t("reseauMenuRail.myProfile")}</span>
										</Link>
									</li>
								) : null}
								{settingsHref !== null ? (
									<li>
										<Link href={settingsHref} style={LINK_ITEM_STYLE}>
											<Icon name="settings" size={18} aria-hidden />
											<span style={{ fontSize: 13.5, fontWeight: 600 }}>{t("reseauMenuRail.settings")}</span>
										</Link>
									</li>
								) : null}
							</ul>
						) : null}
					</>
				) : null}

				{!epure && shortcuts.length > 0 ? (
					<section style={{ marginTop: 14 }}>
						<h2
							className="rmr-section-title"
							style={{
								margin: "0 0 8px",
								fontSize: 10.5,
								fontWeight: 700,
								letterSpacing: "0.08em",
								textTransform: "uppercase",
								color: "var(--muted-foreground)",
								paddingInline: 10,
							}}
						>
							{t("reseauMenuRail.shortcuts")}
						</h2>
						<ul style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gap: 2 }}>
							{shortcuts.map((shortcut) => (
								<li key={shortcut.id}>
									<Link href={shortcut.href} style={LINK_ITEM_STYLE} className="rmr-item" title={adaptive ? shortcut.label : undefined}>
										<Avatar
											displayName={shortcut.label}
											avatarUrl={shortcut.imageUrl}
											size={24}
											shape={shortcut.id.startsWith("page:") ? "square" : "round"}
										/>
										<span
											className="rmr-label"
											style={{
												fontSize: 13,
												fontWeight: 600,
												overflow: "hidden",
												textOverflow: "ellipsis",
												whiteSpace: "nowrap",
											}}
										>
											{shortcut.label}
										</span>
									</Link>
								</li>
							))}
						</ul>
					</section>
				) : null}
				{/* Sous la navigation par destinations, « Voir plus » n'est plus là :
				    les paramètres de l'application (affichage, thème, langue) ont leur
				    entrée propre, au pied du rail, courante sur leur page. */}
				{destinationRoutes !== null && settingsHref !== null ? (
					<Link
						href={settingsHref}
						aria-current={pathname === settingsHref ? "page" : undefined}
						style={{ ...(pathname === settingsHref ? SELECTED_LINK_ITEM_STYLE : LINK_ITEM_STYLE), marginTop: epure ? 0 : 14 }}
						className="rmr-item focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
						title={adaptive ? t("reseauMenuRail.settings") : undefined}
					>
						<Icon name="settings" size={18} aria-hidden />
						<span className="rmr-label" style={{ fontSize: 13.5, fontWeight: 600 }}>{t("reseauMenuRail.settings")}</span>
					</Link>
				) : null}
				{/* Un seul contrôle, gardé dans le rail large. En compact, sa porte
				    mène aux vrais réglages sans panneau débordant du scroller. */}
				{epure && settingsHref !== null ? null : adaptive && settingsHref !== null ? (
					<>
						<div className="rmr-appearance-controls"><AppearanceControl /></div>
						<Link href={settingsHref} style={{ ...LINK_ITEM_STYLE, marginTop: 8 }} className="rmr-item rmr-appearance-link focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" title={t("shell:appearance.label")}>
							<Icon name="sun" size={18} aria-hidden />
							<span className="rmr-label" style={{ flex: 1, fontSize: 13.5, fontWeight: 600 }}>{t("shell:appearance.label")}</span>
						</Link>
					</>
				) : <AppearanceControl />}
			</nav>
		</Card>
	)
	return (
		<div data-reseau-menu-layout={adaptive ? "adaptive" : undefined}>
			{adaptive ? <style>{RESEAU_MENU_RAIL_ADAPTIVE_CSS}</style> : null}
			{rail}
		</div>
	)
}

/**
 * Les CINQ destinations au bureau (navigation par destinations, P02) — les
 * mêmes, dans le même ordre, que la barre basse du téléphone : seule la
 * facture change (une liste du rail, jamais une barre de téléphone posée sur
 * un écran large).
 *
 * ⚠️ Un `<nav>` À PART, nommé : les destinations et les volets sont deux
 * niveaux, chacun avec SON élément courant (`aria-current="page"` sur la
 * destination qu'on regarde, `"true"` sur celle dont la page relève).
 *
 * Sur la page réseau (le rail y reçoit `onSelectTab`), Fil garde son adresse
 * mais un clic ORDINAIRE y prend le geste du lieu :
 *  · « Fil » passe par `onSelectTab("fil")` — revenir au fil y lève la
 *    recherche, le mot-clic et la pagination, comme le volet Fil ; un lien nu
 *    rendrait l'adresse `…/fil` sur des résultats restés à l'écran ;
 * Messages reste un lien vers sa page liste/détail (P05), y compris depuis
 * le fil. Le mode compact reste une commande propre à la carte iCom.
 */
function RailDestinations({
	routes,
	identity,
	profileAvatar = null,
	shops = null,
	myShop = null,
	grouped = false,
	handle,
	onSelectTab,
	onCreate,
	current,
}: {
	routes: ReseauDestinationRoutes
	identity: ReactNode
	/** U09 : la photo du membre tient lieu d'icône à Profil (plus de carte d'identité au-dessus). */
	profileAvatar?: { displayName: string; avatarUrl: string | null } | null
	/** U09 : Boutiques suit les destinations, avant Créer. */
	shops?: { href: string; label: string } | null
	/** « Ma boutique » suit Boutiques, pour qui gère déjà une boutique. */
	myShop?: { href: string; label: string } | null
	/** Trois espaces distincts, uniquement pour la navigation adaptative déclarée. */
	grouped?: boolean
	handle: string | null
	onSelectTab?: (tab: ReseauAgentTabId) => void
	onCreate?: (kind: CreationKind) => void
	current?: ReseauDestinationMatch | null
}) {
	const { t } = useTranslation("reseau")
	const { liveAvailable } = useNetwork()
	const engineRoutes = useRoutes()
	const { adaptive } = useNetworkNavigationLayout()
	const pathname = usePathname()
	const searchParams = useSearchParams()
	const { open, setOpen, triggerRef } = useChoiceTrigger<HTMLButtonElement>()
	/* La pastille de Messages : MÊME composition que la barre d'iCom (IC-06). */
	const unread = useMessagesUnreadTotal()
	const unreadBadge = formatUnreadBadge(unread)
	const CreateIcon = RESEAU_DESTINATION_ICONS.creer

	/* Une navigation referme le choix : il masquerait la page demandée. */
	useEffect(() => {
		setOpen(false)
	}, [pathname, setOpen])

	// Ces destinations possèdent désormais leur propre entrée dans le rail :
	// leur ancien rattachement à Explorer/Profil ne doit plus allumer deux lieux.
	const workspaceCurrent = grouped && (
		(pathname === routes.home() && searchParams.get("tab") === "pages") ||
		railPathMatches(pathname, shops?.href) ||
		railPathMatches(pathname, engineRoutes.myActivity?.()) ||
		railPathMatches(pathname, engineRoutes.settings?.())
	)
	const match = workspaceCurrent ? null : current !== undefined ? current : activeReseauDestination({ pathname, search: searchParams }, routes, handle)
	const choices = reseauCreationChoices({ handle, liveAvailable }, routes).filter((choice) => onCreate !== undefined || choice.href !== null)

	return (
		<nav aria-label={t("reseauDestinations.navLabel")} style={{ padding: "12px 12px 0" }}>
			{identity}
			{grouped ? <h2 className="rmr-section-title" style={SECTION_TITLE_STYLE}>{t("reseauMenuRail.socialSection")}</h2> : null}
			<ul style={{ listStyle: "none", margin: "8px 0 0", padding: 0, display: "grid", gap: 2 }}>
				{reseauDestinations(routes).map((destination) => {
					const DestinationIcon = RESEAU_DESTINATION_ICONS[destination.id]
					const ariaCurrent = ariaCurrentFor(match, destination.id)
					const badge = destination.id === "messages" ? unreadBadge : null
					const content = (
						<>
							{destination.id === "profil" && profileAvatar !== null ? (
								<span aria-hidden="true" style={{ display: "inline-flex", flex: "0 0 auto" }}>
									<Avatar displayName={profileAvatar.displayName} avatarUrl={profileAvatar.avatarUrl} size={22} />
								</span>
							) : <DestinationIcon aria-hidden="true" size={18} />}
							<span className="rmr-label" style={{ flex: 1, fontSize: 13.5, fontWeight: 600 }}>{destination.label ?? t(destination.labelKey)}</span>
							{badge !== null ? (
								<span className="rmr-badge"><Badge tone="primary" size="sm" style={COUNT_BADGE_STYLE}>
									<span aria-hidden="true">{badge}</span>
								</Badge></span>
							) : null}
							{/* Un espace ENTRE le libellé et la phrase du nom accessible. */}
							{badge !== null ? (
								<>
									{" "}
									<span className="sr-only">{t("reseauDestinations.messagesUnread", { count: unread })}</span>
								</>
							) : null}
						</>
					)
					return (
						<li key={destination.id}>
							{destination.href === null ? (
								<Button
									className="rmr-item"
									title={adaptive ? destination.label ?? t(destination.labelKey) : undefined}
									ref={triggerRef}
									variant="ghost"
									aria-haspopup="dialog"
									aria-expanded={open}
									onClick={() => setOpen(true)}
									style={ITEM_STYLE}
								>
									{content}
								</Button>
							) : (
								<Link
									href={destination.href}
									aria-current={ariaCurrent}
									style={ariaCurrent !== undefined ? SELECTED_LINK_ITEM_STYLE : LINK_ITEM_STYLE}
									className="rmr-item focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
									title={adaptive ? destination.label ?? t(destination.labelKey) : undefined}
									onClick={
										onSelectTab === undefined || destination.id !== "fil"
											? undefined
											: (event) => {
													if (!isPlainLeftClick(event)) return
													event.preventDefault()
													onSelectTab("fil")
												}
									}
								>
									{content}
								</Link>
							)}
						</li>
					)
				})}
			</ul>
			{!grouped && shops !== null ? (
				<Link href={shops.href} style={{ ...LINK_ITEM_STYLE, marginTop: 2 }} className="rmr-item focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" title={adaptive ? shops.label : undefined}>
					<Store size={18} aria-hidden="true" />
					<span className="rmr-label" style={{ flex: 1, fontSize: 13.5, fontWeight: 600 }}>{shops.label}</span>
				</Link>
			) : null}
			{!grouped && myShop !== null ? (
				<Link href={myShop.href} aria-current={pathname === myShop.href || pathname.startsWith(`${myShop.href}/`) ? "page" : undefined} style={{ ...(pathname === myShop.href || pathname.startsWith(`${myShop.href}/`) ? SELECTED_LINK_ITEM_STYLE : LINK_ITEM_STYLE), marginTop: 2 }} className="rmr-item focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" title={adaptive ? myShop.label : undefined}>
					<BriefcaseBusiness size={18} aria-hidden="true" />
					<span className="rmr-label" style={{ flex: 1, fontSize: 13.5, fontWeight: 600 }}>{myShop.label}</span>
				</Link>
			) : null}
			{routes.clips !== undefined ? <Button ref={triggerRef} className="rmr-item" title={t("reseauDestinations.creer")} variant="ghost" aria-haspopup="dialog" aria-expanded={open} onClick={() => setOpen(true)} style={{ ...ITEM_STYLE, marginTop: 8 }}>
				<CreateIcon aria-hidden="true" size={18} />
				<span className="rmr-label" style={{ flex: 1, fontSize: 13.5, fontWeight: 600 }}>{t("reseauDestinations.creer")}</span>
			</Button> : null}
			{grouped ? <RailWorkspaceSections shops={shops} myShop={myShop} /> : null}
			<CreationChoiceCard open={open} onClose={() => setOpen(false)} choices={choices} onPick={(kind) => onCreate?.(kind)} />
		</nav>
	)
}

/** Les droits viennent des listes du membre ; les destinations gardent leurs gardes métier. */
function RailWorkspaceSections({ shops, myShop }: {
	shops: { href: string; label: string } | null
	myShop: { href: string; label: string } | null
}) {
	const { t } = useTranslation("reseau")
	const { networkId } = useNetwork()
	const routes = useRoutes()
	const pathname = usePathname()
	const search = useSearchParams()
	const mine = useAuthenticatedConvexQuery(api.modules.pages.pages.myPages, { networkId })
	const pages = mine.data ?? []
	const activityHref = routes.myActivity?.() ?? null
	const pagesHref = reseauAgentHref("pages", routes.home())
	const pageSelected = pathname === routes.home() && search.get("tab") === "pages"
	const shopsSelected = railPathMatches(pathname, shops?.href)
	const activityLabel = myShop?.label ?? t("reseauMenuRail.createActivity")
	const pagesLabel = pages.length > 0 ? t("reseauMenuRail.myPages") : t("reseauMenuRail.createPage")
	return <>
		<section className="rmr-workspace-section" aria-label={t("reseauMenuRail.activitySection")}>
			<h2 className="rmr-section-title" style={SECTION_TITLE_STYLE}>{t("reseauMenuRail.activitySection")}</h2>
			{shops ? <Link href={shops.href} aria-current={shopsSelected ? "page" : undefined} style={shopsSelected ? SELECTED_LINK_ITEM_STYLE : LINK_ITEM_STYLE} className="rmr-item focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" title={shops.label}>
				<Store size={18} aria-hidden="true" /><span className="rmr-label" style={{ flex: 1 }}>{shops.label}</span>
			</Link> : null}
			{activityHref ? <Link href={activityHref} aria-current={pathname === activityHref || pathname.startsWith(`${activityHref}/`) ? "page" : undefined} style={pathname === activityHref || pathname.startsWith(`${activityHref}/`) ? SELECTED_LINK_ITEM_STYLE : LINK_ITEM_STYLE} className="rmr-item focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" title={activityLabel}>
				<BriefcaseBusiness size={18} aria-hidden="true" /><span className="rmr-label" style={{ flex: 1 }}>{activityLabel}</span>
			</Link> : null}
		</section>
		<section className="rmr-workspace-section" aria-label={t("reseauMenuRail.pageSection")}>
			<h2 className="rmr-section-title" style={SECTION_TITLE_STYLE}>{t("reseauMenuRail.pageSection")}</h2>
			<Link href={pagesHref} aria-current={pageSelected ? "page" : undefined} style={pageSelected ? SELECTED_LINK_ITEM_STYLE : LINK_ITEM_STYLE} className="rmr-item focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" title={pagesLabel}>
				{pages.length > 0 ? <PanelsTopLeft size={18} aria-hidden="true" /> : <FilePlus2 size={18} aria-hidden="true" />}<span className="rmr-label" style={{ flex: 1 }}>{pagesLabel}</span>
			</Link>
			{pages.map(page => <Link key={page.pageId} href={routes.page(page.handle)} aria-current={pathname === routes.page(page.handle) ? "page" : undefined} style={pathname === routes.page(page.handle) ? SELECTED_LINK_ITEM_STYLE : LINK_ITEM_STYLE} className="rmr-item focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" title={page.name}>
				<span aria-hidden="true"><Avatar displayName={page.name} avatarUrl={page.logoUrl} size={22} shape="square" /></span><span className="rmr-label" style={{ flex: 1 }}>{page.name}</span>
			</Link>)}
		</section>
	</>
}
