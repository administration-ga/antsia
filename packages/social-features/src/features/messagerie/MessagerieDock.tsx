// Dupliqué de socle/packages/agent-features/src/features/messagerie/MessagerieDock.tsx @ ad2e7fdc2 — adaptations : portail détaché re-scopé par la charte DU RÉSEAU (`data-charte` = `useNetwork().charte`) ; stockage par réseau — position flottante sous `icomFloatPlacementStorageKey(storagePrefix)` et `configureDockStorage(storagePrefix)` rappelé au montage (idempotent, la coque l'appelle d'abord) ; réconciliation des brouillons sur les fenêtres de la source personnelle (`SOURCE_AGENT.useThreads` / `useGroupThreads` → `messaging.inbox.paginateMyThreads`, `groups.threads.paginateMyGroupThreads`) au lieu de `listMyThreads` / `listMyGroupThreads`, identifiants `threadId` du moteur ; seuil mobile par `@antsia/ui/overlay` ; libellés des briques lus par leurs clés (`ICOM_DOCK_TABS`) ; toutes les chaînes d'interface traduites (clés `messagerieDock.*`, annonce des non-lus pluralisée) ; hôte d'appel `ICOM_AGENT_CALL_HOST_ID` inchangé (nom et valeur) ; doc : adresses de l'espace agent remplacées par la base injectée de l'application.
"use client"

/**
 * IcomDock — iCom du réseau, monté par la coque.
 *
 * ⚠️ Le fichier garde son nom (`MessagerieDock`) : plusieurs écrans
 * l'importent, et le renommer n'apporterait rien qu'un diff. C'est le CONTENU
 * qui a changé au socle — la carte porte quatre onglets (iChat, Statuts,
 * iAppel, Relations) au lieu de la seule messagerie, cf. `icom-dock.ts` pour
 * la règle.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * UN SEUL BLOC, TROIS VUES — QUI NE VIVENT PAS ICI
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Une carte, et à l'intérieur : la LISTE des conversations, UNE conversation,
 * ou le choix d'un DESTINATAIRE. On passe de l'une à l'autre par la flèche de
 * retour, jamais par une seconde surface.
 *
 * Les trois vues vivent dans leurs fichiers : `MessagerieListView`,
 * `MessagerieConversationView`, `MessagerieComposeView`. Elles se rendent dans
 * DEUX poses — cette carte, et les pages plein écran de la messagerie au
 * téléphone (base `useRoutes().messages()`) — et ce fichier n'est que l'une
 * des deux. Ce qui change entre les poses tient en deux champs (`variant`,
 * `nav`, cf. `messagerie-views.ts`) ; tout le reste est commun, et c'est la
 * seule façon que la carte et la page ne divergent pas.
 *
 * ⚠️ Ce qui SURVIT au bloc unique : le texte en cours de frappe. Changer de
 * vue démonte la précédente ; le texte vit dans l'état (`drafts` dans
 * `messagerie-dock.ts`), jamais dans un `useState` de composeur.
 *
 * La pose ancrée reste dans sa cellule. La pose détachée passe
 * obligatoirement par un portail vers `body`, hors du containment de
 * `.rp-scope`, et y redéclare la charte du réseau (`data-charte`).
 *
 * ── Où elle se monte ──────────────────────────────────────────────────────
 * Par la coque, UNE fois, sous `<Suspense>` (elle lit `useSearchParams`) et
 * sous le `NetworkProvider`. Au téléphone, c'est la page de la messagerie qui
 * porte iCom, et ce composant ne rend rien.
 *
 * ── Accessibilité ─────────────────────────────────────────────────────────
 * `<aside>` — **surtout pas** `role="dialog"` ni `aria-modal` : la carte n'est
 * pas modale, la page reste utilisable, et un piège de focus la rendrait
 * inutilisable. UNE SEULE région `aria-live` pour toute la carte.
 */

import { useNetwork, useRoutes } from "@antsia/api/network"
import { usePathname, useRouter, useSearchParams } from "@antsia/api/routing"
import {
	Camera,
	ChevronDown,
	Grip,
	Maximize2,
	MessageCircle,
	Phone,
	Users,
	X,
} from "lucide-react"
import { useEffect, useRef, useState, type RefObject } from "react"
import { createPortal } from "react-dom"
import { icomProHref } from "./icom-space"
import { IcomDockSpaceTitle } from "./IcomSpaceSwitch"
import { useTranslation } from "react-i18next"
import { callStore } from "../../stores/call-store"
import { useSurfaceDrag } from "../../shell/floating-surface/use-surface-drag"
import {
	cardYieldsEscape,
	collapseRequiresMinimize,
	coverStarts,
	type CallHostPose,
} from "../iappel/call-host"
import {
	registerCallHost,
	updateCallHostPose,
	useCallHostMode,
} from "../iappel/call-host-store"
import type { CallScope } from "../iappel/call-types"
import { useIsReseauMobile } from "@antsia/ui/overlay"
import {
	configureDockStorage,
	dockStore,
	ICOM_FLOAT_PLACEMENT_STORAGE,
	icomFloatPlacementStorageKey,
	useDockState,
} from "./dock-store"
import {
	ICOM_DOCK_TABS,
	ICOM_DOCK_TAB_DEFAULT,
	icomDockBody,
	icomTabsVisible,
	type IcomDockTabId,
} from "./icom-dock"
import { IcomActusPanel } from "./IcomActusPanel"
import { IcomAppelJournal } from "./IcomAppelJournal"
import { IcomRelationsPanel } from "./IcomRelationsPanel"
import { ICOM_VIEWS } from "./icom-views"
import { messagerieListScope } from "./messagerie-list-state"
import {
	readIcomDesktopEntry,
	withoutIcomDesktopEntry,
} from "./icom-desktop-entry"
import { MessagerieComposeView } from "./MessagerieComposeView"
import { MessagerieConversationView } from "./MessagerieConversationView"
import { MessagerieGroupeCompose } from "./MessagerieGroupeCompose"
import { MessagerieGroupeInvite } from "./MessagerieGroupeInvite"
import { MessagerieListView } from "./MessagerieListView"
import {
	activeKey,
	draftTextFor,
	parseKey,
	type ConversationKey,
} from "./messagerie-dock"
import { SOURCE_AGENT } from "./messagerie-source"
import { MessagerieStyles } from "./messagerie-styles"
import { TYPING_PING_INTERVAL_MS } from "./messagerie-typing"
import type { MessagerieNav, MessagerieVariant } from "./messagerie-views"

/**
 * L'icône de chaque brique — modèle WhatsApp : la barre de navigation est
 * BASSE, à icônes, et le nom du module ne s'écrit nulle part — un module
 * composé ne s'écrit pas, il se compose.
 */
const TAB_ICONS: Record<IcomDockTabId, typeof MessageCircle> = {
	ichat: MessageCircle,
	actus: Camera,
	iappel: Phone,
	icontact: Users,
}

/**
 * La carte est un TÉLÉPHONE : un appel personnel se dessine DEDANS, quelle
 * que soit sa forme (téléphone détaché, carte moyenne, carte rétractée) —
 * jamais dans une fenêtre à côté (IC-01/IC-02/IC-06 du socle, 2026-09-13).
 * Elle se déclare à la couche d'appel sous cette identité, pour la portée
 * PERSONNELLE.
 *
 * ⚠️ Nom ET valeur stables : la couche d'appel et d'autres surfaces lisent
 * cette identité.
 */
export const ICOM_AGENT_CALL_HOST_ID = "icom-agent"
const ICOM_AGENT_CALL_SCOPES: readonly CallScope[] = Object.freeze(["personnel"])

/**
 * La navigation de la CARTE : des transitions d'état, pas des adresses.
 *
 * Constante de module, et non un objet recréé à chaque rendu : les vues la
 * reçoivent en prop, et une nouvelle référence à chaque passage relancerait
 * inutilement tout ce qui en dépend.
 */
const DOCK_NAV: MessagerieNav = Object.freeze({
	openConversation: (key: ConversationKey) => {
		const at = key.indexOf(":")
		const kind = at > 0 ? key.slice(0, at) : ""
		const id = at > 0 ? key.slice(at + 1) : ""
		if (kind === "chat") dockStore.openChat(id)
		else if (kind === "groupe") dockStore.openGroupe(id)
		else if (kind === "draft") dockStore.openDraft(id)
	},
	openCompose: () => dockStore.openCompose(),
	openComposeGroupe: () => dockStore.openComposeGroupe(),
	back: () => dockStore.back(),
})

export function MessagerieDock() {
	const { t } = useTranslation("messagerie")
	const { charte, storagePrefix, networkId, personId, navigation, icomPro } = useNetwork()
	const messagesBase = useRoutes().messages()
	// ⚠️ `null` au rendu serveur ET au premier passage client : on ne rend RIEN
	// tant que la largeur n'est pas connue. Rendre la carte « par défaut »
	// ferait clignoter un bloc de 420 px de haut sur tous les téléphones.
	const isMobile = useIsReseauMobile()
	const dock = useDockState()
	const router = useRouter()
	const pathname = usePathname()
	const destinations = navigation === "destinations"
	const messagesDestination = destinations && (pathname === messagesBase || pathname.startsWith(`${messagesBase}/`))
	const searchParams = useSearchParams()
	const routeSearch = searchParams.toString()
	const [tab, setTab] = useState<IcomDockTabId>(ICOM_DOCK_TAB_DEFAULT)
	const [groupeInfosId, setGroupeInfosId] = useState<string | null>(null)
	const [invitation, setInvitation] = useState<{ token: string | null } | null>(
		null,
	)

	/**
	 * L'état du dock est rangé SOUS LE RÉSEAU. La coque configure le magasin
	 * dès le `NetworkProvider` ; le rappel ici est idempotent (même préfixe :
	 * sans effet) et garantit qu'aucun état ne persiste hors de son réseau si
	 * la coque ne l'a pas fait. En effet : la carte ne rend rien au premier
	 * passage client, aucune vue n'a encore lu l'état.
	 */
	useEffect(() => {
		configureDockStorage(storagePrefix)
	}, [storagePrefix])

	/**
	 * Les adresses de la messagerie restent des liens valides au bureau. Leur
	 * page transmet ici l'intention (`?icom=`, cf. `icom-desktop-entry.ts`),
	 * puis cette surface la consomme une seule fois : la conversation, le
	 * composeur ou l'invitation s'ouvre dans le téléphone iCom détaché, sans
	 * recréer de grande vue à colonnes.
	 */
	useEffect(() => {
		if (isMobile !== false || destinations) return
		const entry = readIcomDesktopEntry(routeSearch)
		if (entry === null) return

		if (entry.compose === "groupe") dockStore.openComposeGroupe()
		else if (entry.compose === "personne") dockStore.openCompose()
		else if (entry.conversation?.kind === "chat") {
			dockStore.openChat(entry.conversation.chatId)
		} else if (entry.conversation?.kind === "draft") {
			dockStore.openDraft(entry.conversation.handle)
		} else if (entry.conversation?.kind === "groupe") {
			dockStore.openGroupe(entry.conversation.threadId)
		} else {
			dockStore.back()
		}

		setTab(entry.brique)
		setInvitation(entry.invitation)
		setGroupeInfosId(
			entry.infosOpen && entry.conversation?.kind === "groupe"
				? entry.conversation.threadId
				: null,
		)
		dockStore.detach()
		router.replace(withoutIcomDesktopEntry(pathname, routeSearch), {
			scroll: false,
		})
	}, [isMobile, pathname, routeSearch, router, destinations])
	/* Le repli est toujours la porte d'entrée iChat. On efface donc une
	   sélection secondaire dès que la surface se rétracte ; les brouillons,
	   eux, restent dans le store et ne sont jamais perdus. */
	useEffect(() => {
		if (!dock.open) setTab(ICOM_DOCK_TAB_DEFAULT)
	}, [dock.open])
	const conversationActive =
		dock.view.kind === "conversation" ? parseKey(dock.view.key) : null
	const groupeActifId =
		conversationActive?.kind === "groupe" ? conversationActive.threadId : null
	useEffect(() => {
		if (groupeInfosId !== null && groupeInfosId !== groupeActifId) {
			setGroupeInfosId(null)
		}
	}, [groupeActifId, groupeInfosId])
	const activeTab = dock.open ? tab : ICOM_DOCK_TAB_DEFAULT
	const drag = useSurfaceDrag({
		storageKey: icomFloatPlacementStorageKey(storagePrefix),
		storage: ICOM_FLOAT_PLACEMENT_STORAGE,
		placementMode: "free",
		enabled: dock.floating && isMobile === false,
		label: t("messagerieDock.moveWindow"),
	})
	// Les FENÊTRES de la source (la première page des fils, celle des
	// groupes) : elles servent la réconciliation des brouillons, pas le
	// décompte. Mêmes clés que la liste : aucune souscription de plus.
	const threads = SOURCE_AGENT.useThreads()
	const groupes = SOURCE_AGENT.useGroupThreads()
	const nonLus = SOURCE_AGENT.useUnreadTotals()

	/**
	 * Au DÉTACHEMENT, porter le focus dans la fenêtre : le geste vient d'un
	 * bouton de la carte qui disparaît avec la pose — sans ce transfert, le
	 * focus clavier s'évapore. Le ré-ancrage laisse le navigateur replacer le
	 * focus (l'en-tête ancré reprend sa place dans l'ordre du document).
	 */
	useEffect(() => {
		if (dock.floating) drag.ref.current?.focus()
	}, [dock.floating, drag.ref])

	/**
	 * Nettoyer ce qui ne correspond plus à un fil vivant. Les brouillons
	 * survivent : ils ne correspondent à rien côté serveur, par construction.
	 *
	 * ⚠️ La dépendance est `threads.data`/`groupes.data` : passer un tableau
	 * recalculé relancerait l'effet indéfiniment. Et on n'agit que LES DEUX
	 * listes chargées : réconcilier avec une liste de groupes encore absente
	 * ferait passer tous les fils de groupe pour morts (cf. `reconcile`).
	 */
	const filsCharges = threads.data
	const groupesCharges = groupes.data
	useEffect(() => {
		if (filsCharges === undefined || groupesCharges === undefined) return
		dockStore.reconcile({
			chatIds: filsCharges.map((fil) => String(fil.threadId)),
			groupeIds: groupesCharges.map((groupe) => String(groupe.threadId)),
		})
	}, [filsCharges, groupesCharges])

	/**
	 * L'APPEL DANS LA CARTE (IC-01/IC-02/IC-06). La carte déclare son corps à
	 * la couche d'appel dès qu'il existe au bureau, et le retire avec lui ;
	 * l'hôte global y portaille l'appel personnel et PUBLIE ce qu'il occupe
	 * (`callMode` : tout le corps, ou une bande en tête). La carte ne décide
	 * rien, elle se met en forme.
	 *
	 * L'élément change quand la carte passe de la cellule au portail (React
	 * remonte l'arbre) : l'état le suit, et la déclaration est REMPLACÉE à sa
	 * place dans le registre — l'appel suit la carte sans repli intermédiaire.
	 */
	const [callHostElement, setCallHostElement] = useState<HTMLDivElement | null>(
		null,
	)
	const hostPose: CallHostPose = dock.floating
		? "phone"
		: dock.open
			? "medium"
			: "compact"
	const hostPoseRef = useRef(hostPose)
	hostPoseRef.current = hostPose
	const callMode = useCallHostMode(ICOM_AGENT_CALL_HOST_ID)
	useEffect(() => {
		if (callHostElement === null || isMobile !== false || messagesDestination) return
		return registerCallHost({
			id: ICOM_AGENT_CALL_HOST_ID,
			scopes: ICOM_AGENT_CALL_SCOPES,
			pose: hostPoseRef.current,
			element: callHostElement,
		})
	}, [callHostElement, isMobile, messagesDestination])
	useEffect(() => {
		updateCallHostPose(ICOM_AGENT_CALL_HOST_ID, hostPose)
	}, [hostPose])
	/* Une carte rétractée n'a pas de corps : l'appel qui vient la couvrir la
	   déplie — sur la TRANSITION seulement (`coverStarts`) : rétracter la
	   carte pendant l'appel, qui le réduit d'abord, ne doit pas la rouvrir. */
	const previousCallMode = useRef(callMode)
	useEffect(() => {
		const was = previousCallMode.current
		previousCallMode.current = callMode
		if (coverStarts(was, callMode)) dockStore.setOpen(true)
	}, [callMode])

	if (isMobile !== false || messagesDestination) return null

	// ⚠️ Le chiffre de la carte est celui du SERVEUR (IC-06), pas la somme des
	// `unreadCount` rendus : la fenêtre des fils ci-dessus sert la
	// RÉCONCILIATION des brouillons (fils vivants), pas le décompte. Deux
	// barres qui montrent deux nombres pour la même boîte se lisent comme deux
	// boîtes.
	const totalUnread = nonLus.total.total
	const floating = dock.floating
	/* La fenêtre détachée n'est pas une carte de rail agrandie : c'est la même
	   pose que le téléphone, avec les mêmes densités, actions et fiches. Seule
	   la navigation reste locale au dock pour ne pas changer l'adresse de la
	   page sous la fenêtre. */
	const surfaceVariant: MessagerieVariant = floating ? "page" : "dock"

	/**
	 * LE corps — une seule instance, rendue SOIT dans la carte ancrée, SOIT
	 * dans la fenêtre flottante. Les abonnements Convex de ce composant ne se
	 * doublent donc jamais : c'est la pose qui change, pas le locataire.
	 *
	 * Les Statuts ont leur propre brique dans les deux poses : iChat ne mélange
	 * donc jamais conversation privée et contenu de rappel.
	 */
	const corps = (
		<div
			className="msg-panel"
			data-variant={surfaceVariant}
			data-fill={floating ? "screen" : undefined}
			data-open={dock.open ? "true" : "false"}
			data-root={icomTabsVisible(dock.view.kind) ? "true" : undefined}
			data-surface-bar={!floating ? "true" : undefined}
			data-call={callMode === "none" ? undefined : callMode}
		>
			{!floating ? (
				<div className="icom-surface-bar">
					<div className="icom-surface-heading">
						<Grip aria-hidden="true" size={18} />
						{/* ADR-0036 : la carte est iCom ; la pilule mène à iCom Pro quand une activité pro existe. */}
							{icomPro ? <IcomDockSpaceTitle title={t("messagerieDock.title")} proHref={icomProHref(messagesBase)} /> : <span className="icom-surface-title">{t("messagerieDock.title")}</span>}
					</div>
					<div className="icom-surface-actions">
						<button
							type="button"
							className="msg-icon-btn msg-collapse-btn"
							aria-label={
								dock.open ? t("messagerieDock.collapse") : t("messagerieDock.expand")
							}
							title={dock.open ? t("messagerieDock.collapse") : t("messagerieDock.expand")}
							aria-expanded={dock.open}
							onClick={() => {
								// Rétracter pendant que l'appel couvre : il se RÉDUIT
								// d'abord et devient la bande de la carte rétractée —
								// jamais dehors, jamais perdu.
								if (collapseRequiresMinimize(callMode)) callStore.setMinimized(true)
								dockStore.toggleOpen()
							}}
						>
							<ChevronDown
								aria-hidden="true"
								size={17}
								className="msg-collapse-icon"
							/>
						</button>
						<button
							type="button"
							className="msg-icon-btn"
							aria-label={t("messagerieDock.detach")}
							title={t("messagerieDock.detach")}
							onClick={() => dockStore.detach()}
						>
							<Maximize2 aria-hidden="true" size={16} />
						</button>
					</div>
				</div>
			) : null}
			{/* Le corps que la couche d'appel REMPLIT quand un appel personnel
			    est en cours : sous la barre iCom, il couvre tout (appel affiché)
			    ou n'est qu'une bande (appel réduit). Vide, il n'existe pas —
			    cf. `.icom-call-host` dans la feuille de style. */}
			<div
				className="icom-call-host"
				ref={setCallHostElement}
				data-pose={hostPose}
			/>
			{invitation !== null ? (
				<MessagerieGroupeInvite
					token={invitation.token}
					onClose={() => setInvitation(null)}
					onJoined={(threadId) => {
						setInvitation(null)
						dockStore.openGroupe(threadId)
					}}
				/>
			) : icomDockBody(activeTab, dock.view.kind) === "contacts" ? (
				<IcomRelationsPanel
					mode="contact"
					variant={surfaceVariant}
					open={dock.open}
					onOpenDraft={(handle) => dockStore.openDraft(handle)}
					onOpenGroup={(threadId) => dockStore.openGroupe(threadId)}
					onCreateGroup={() => dockStore.openComposeGroupe()}
					showDockControls={false}
				/>
			) : icomDockBody(activeTab, dock.view.kind) === "appel" ? (
				<IcomRelationsPanel
					mode="appel"
					variant={surfaceVariant}
					open={dock.open}
					onOpenDraft={(handle) => dockStore.openDraft(handle)}
					onOpenGroup={(threadId) => dockStore.openGroupe(threadId)}
					onCreateGroup={() => dockStore.openComposeGroupe()}
					showDockControls={false}
					journal={(viewControls) => (
						<IcomAppelJournal leadingControls={viewControls} family={icomPro ? "personnel" : undefined} />
					)}
				/>
			) : icomDockBody(activeTab, dock.view.kind) === "actus" ? (
				<IcomActusPanel
					repliable={!floating}
					open={dock.open}
					showDockControls={false}
				/>
			) : dock.view.kind === "list" ? (
				<MessagerieListView
					variant={surfaceVariant}
					nav={DOCK_NAV}
					open={dock.open}
					unread={totalUnread}
					activeKey={activeKey(dock)}
					showDockControls={false}
					destinationMode={destinations}
					stateScope={destinations ? messagerieListScope(String(networkId), String(personId), "dock") : undefined}
				/>
			) : dock.view.kind === "compose" ? (
				<MessagerieComposeView
					variant={surfaceVariant}
					nav={DOCK_NAV}
					open={dock.open}
				/>
			) : dock.view.kind === "composeGroupe" ? (
				<MessagerieGroupeCompose
					variant={surfaceVariant}
					nav={DOCK_NAV}
					open={dock.open}
				/>
			) : (
				<MessagerieConversationView
					conversationKey={dock.view.key}
					variant={surfaceVariant}
					nav={DOCK_NAV}
					open={dock.open}
					draft={draftTextFor(dock, dock.view.key)}
					onOpenInfos={
						groupeActifId === null
							? undefined
							: () => setGroupeInfosId(groupeActifId)
					}
					infosOpen={groupeInfosId !== null && groupeInfosId === groupeActifId}
					onCloseInfos={() => setGroupeInfosId(null)}
					onLeftGroup={() => {
						setGroupeInfosId(null)
						dockStore.back()
					}}
				/>
			)}

			{/* La barre des briques, EN BAS — le modèle WhatsApp. Les onglets
			    restent une RACINE, pas une échappatoire : ils disparaissent
			    dès qu'on lit ou qu'on écrit, pour ne pas proposer de quitter
			    un brouillon sans le dire. */}
			{icomTabsVisible(dock.view.kind) ? (
				<div
					className="icom-tabs"
					role="tablist"
					aria-label={t("messagerieDock.title")}
				>
					{ICOM_DOCK_TABS.filter((item) => !destinations || item.id !== "actus").map((item) => {
						const Icon = TAB_ICONS[item.id]
						return (
							<button
								key={item.id}
								type="button"
								role="tab"
								className="icom-tab"
								aria-selected={activeTab === item.id}
								title={t(item.descriptionKey)}
								onClick={() => {
									setTab(item.id)
									/* Replié, le dock garde son en-tête ET cette barre.
									   Choisir une brique l'ouvre directement, comme la
									   navigation WhatsApp. */
									dockStore.setOpen(true)
								}}
							>
								<span aria-hidden="true" className="icom-tab-icon">
									<Icon size={17} />
								</span>
								{t(destinations ? ICOM_VIEWS.find((view) => view.brique === item.id)?.labelKey ?? item.labelKey : item.labelKey)}
							</button>
						)
					})}
				</div>
			) : null}
		</div>
	)

	/**
	 * UNE SEULE région d'annonce pour toute la carte, poses confondues. Elle
	 * donne le nombre, pas le contenu : le message se lit en ouvrant la
	 * conversation, et l'annoncer volerait la parole à ce que la personne fait.
	 */
	const annonce = (
		<p aria-live="polite" className="sr-only">
			{totalUnread > 0
				? t("messagerieDock.unreadAnnouncement", { count: totalUnread })
				: ""}
		</p>
	)

	/**
	 * La feuille de la messagerie est portée par la CARTE, pas seulement par
	 * ses vues. Elle ne vivait que dans la liste, la conversation et le
	 * nouveau message : sur « Nouveau groupe », aucune ne restait montée, React
	 * retirait la feuille et la carte perdait tout son habillage — cadre,
	 * en-tête, lignes (recette du socle, 14/09). React 19 dédoublonne par
	 * `href` : la monter ici en plus des vues ne l'insère qu'une fois.
	 */
	const feuille = <MessagerieStyles />

	if (!floating) {
		return (
			<aside aria-label={t("messagerieDock.title")} className="msg-dock">
				{feuille}
				{annonce}
				{corps}
			</aside>
		)
	}

	return createPortal(
		<div
			className="icom-float"
			data-charte={charte}
			data-dragging={drag.dragging ? "true" : undefined}
			role="complementary"
			aria-label={t("messagerieDock.floatingLabel")}
			tabIndex={-1}
			ref={drag.ref as RefObject<HTMLDivElement>}
			style={drag.style}
			onKeyDown={(event) => {
				// Non modal : pas de piège de focus, pas de scrim. Échap ne
				// ré-ancre qu'au REPOS. Pendant un déplacement, le hook a déjà
				// consommé la touche pour revenir à la position de départ.
				// Et tant qu'un appel COUVRE la carte, la frappe appartient à la
				// couche d'appel (panneau interne, puis réduction — IC-07) : elle
				// passe, la carte ne se ré-ancre qu'ensuite.
				if (
					!event.defaultPrevented &&
					event.key === "Escape" &&
					!cardYieldsEscape(callMode)
				) {
					dockStore.reattach()
				}
			}}
		>
			{feuille}
			{annonce}
			<div className="icom-float-bar">
				<div className="icom-float-handle" {...drag.handleProps}>
					<Grip aria-hidden="true" size={18} />
					<span className="icom-float-title">{t("messagerieDock.title")}</span>
					<span className="sr-only">{t("messagerieDock.dragHelp")}</span>
				</div>
				<button
					type="button"
					className="msg-icon-btn"
					aria-label={t("messagerieDock.reattach")}
					title={t("messagerieDock.reattach")}
					onClick={() => dockStore.reattach()}
				>
					<X aria-hidden="true" size={16} />
				</button>
			</div>
			{corps}
		</div>,
		document.body,
	)
}

export { TYPING_PING_INTERVAL_MS }
