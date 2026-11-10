// Dupliqué de socle/packages/agent-features/src/features/stories/StoriesViewerPage.tsx @ ad2e7fdc2 — adaptations : adresses par la table des routes de l'application (`useRoutes().home()` pour la sortie, `useRoutes().conference(id)` pour rejoindre un direct) au lieu des routes de l'espace du socle ; plateau de `stories.stories.tray` du moteur (réseau de `useNetwork()`, instant ARRONDI figé au montage — `storyQueryInstant`) ; mon handle tiré de `people.persons.getMyPerson` (seulement si mon profil est publié, comme le profil de réseau du socle) ; directs en cours par `live.sessions.listLive` du moteur, réseau courant, première page bornée à 20 ; scope de surface et origine du composeur (ADR-0079 du socle) retirés avec les surfaces du moteur ; libellés traduits (clés `stories:storiesViewerPage.*`).
"use client"

/**
 * StoriesViewerPage — le plein écran vertical à glissé des actus.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * UNE SEULE PILE : LES CONFÉRENCES EN DIRECT, PUIS LES ACTUS
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Un glissé vers le HAUT passe à l'écran suivant (convention de `swipe.ts`,
 * partagée avec tout ce que le pager sert). La pile est composée par
 * `buildViewerItems` : conférences EN COURS d'abord — elles sont périssables à
 * la minute —, puis les séries des connexions et des abonnements, dans l'ordre du
 * plateau.
 *
 * ⚠️ Les conférences en direct viennent du lot `live` du moteur, pas encore
 * branché : la pile n'en reçoit aucune aujourd'hui (`NO_LIVE_DIRECTS`), mais
 * leur chemin de rendu (`LiveDirectSlide`) est gardé tel quel — brancher la
 * liste suffira.
 *
 * ⚠️ Le pager, les gestes et l'overlay immersif existent DÉJÀ :
 * `VerticalPager`, `gestures/swipe.ts`, `ImmersiveOverlay`. Cet écran ne
 * réécrit rien de tout cela.
 *
 * ── Deux paliers, une seule pile ──────────────────────────────────────────
 * Au TÉLÉPHONE, la page occupe déjà l'écran entier : la coque classe la route
 * des actus en régime immersif, sans barre ni réserve en bas.
 *
 * En navigation ADAPTATIVE, ce même portail reste monté à toutes les tailles :
 * il donne une hauteur visible définie au lecteur, et une bascule de format
 * ne démonte ni le média ni sa pause volontaire. La page en place historique
 * reste réservée au téléphone des applications sans cet opt-in.
 *
 * Sur le BUREAU, ce classement ne suffit pas : le rail latéral reste là. La
 * même pile est donc rendue dans un `ImmersiveOverlay`, qui PORTAILLE vers
 * `<body>` et couvre tout, dans un cadre 9:16 centré — un média vertical
 * étalé sur 1600 px ne se regarde pas.
 *
 * ⚠️ `?auteur=<handle>` positionne l'entrée ET se maintient par
 * `router.replace`, jamais `push` : un glissé n'empile pas d'historique. Avec
 * `push`, quitter une série vue de huit auteurs demanderait huit retours
 * arrière — et le bouton « retour » du téléphone est LE geste de sortie.
 *
 * ⚠️ L'instant passé au plateau est FIGÉ au montage (`storyQueryInstant`) : le
 * faire avancer referait l'abonnement, le corps repasserait par
 * « Chargement… » et le pager perdrait sa position. Le même instant arrondi
 * que la barre du fil, le plus souvent : leur abonnement est alors partagé et
 * le lecteur s'ouvre sans attendre.
 */

import { api } from "@antsia/api/engine"
import { useAuthenticatedConvexQuery } from "@antsia/api/hooks"
import { useNetwork, useRoutes } from "@antsia/api/network"
import { usePathname, useRouter, useSearchParams } from "@antsia/api/routing"
import { Button } from "@antsia/ui"
import { ImmersiveOverlay, useIsReseauMobile } from "@antsia/ui/overlay"
import { Suspense, useCallback, useEffect, useState } from "react"
import { useTranslation } from "react-i18next"
import { VerticalPager } from "../../shell/mobile/VerticalPager"
import { LiveDirectSlide } from "./LiveDirectSlide"
import { StoryCreateSheet } from "./StoryCreateSheet"
import { StoryViewer } from "./StoryViewer"
import { consumeStoriesOpenedFromApp } from "./stories-entry"
import { StoriesStyles } from "./stories-styles"
import { orderTray, storyQueryInstant } from "./stories-tray"
import {
	buildViewerItems,
	storiesCloseAction,
	viewerBodyState,
	viewerItemKey,
	viewerItemLabel,
	type ViewerItem,
} from "./stories-viewer"

/** Le paramètre d'entrée — un handle, jamais un identifiant technique. */
export const STORIES_AUTHOR_PARAM = "auteur"

export interface StoriesViewerPageProps {
	/** Ouvrir le composeur au montage — la route « nouvelle actu ». */
	openCreate?: boolean
	/** Le droit de créer ; ne modifie ni les lectures ni le comptage des vues. */
	canCreate?: boolean
}

/** `useSearchParams` impose la frontière Suspense (même règle que le fil). */
export function StoriesViewerPage({
	openCreate = false,
	canCreate = true,
}: StoriesViewerPageProps = {}) {
	const { networkId, personId } = useNetwork()
	return (
		<Suspense fallback={null}>
			<StoriesViewerInner key={`${networkId}:${personId}`} openCreate={openCreate} canCreate={canCreate} />
		</Suspense>
	)
}

function StoriesViewerInner({ openCreate, canCreate }: { openCreate: boolean; canCreate: boolean }) {
	const { t } = useTranslation("stories")
	const router = useRouter()
	const routes = useRoutes()
	const pathname = usePathname()
	const searchParams = useSearchParams()
	const mobile = useIsReseauMobile()
	const { networkId, liveAvailable, navigation, navigationLayout } = useNetwork()
	const adaptive = navigation === "destinations" && navigationLayout === "adaptive"

	const [now, setNow] = useState(() => Date.now())
	// L'instant des lectures, FIGÉ au montage (cf. l'en-tête).
	const [queryNow] = useState(() => storyQueryInstant(Date.now()))
	const [index, setIndex] = useState<number | null>(null)
	const [createOpen, setCreateOpen] = useState(openCreate && canCreate)
	// La feuille est démontée dès le refus, et une réautorisation ne reprend
	// pas une ancienne intention de création ni les fichiers du composeur.
	useEffect(() => {
		if (!canCreate) setCreateOpen(false)
	}, [canCreate])

	const tray = useAuthenticatedConvexQuery(api.modules.stories.stories.tray, {
		networkId,
		now: queryNow,
	})
	const me = useAuthenticatedConvexQuery(
		api.modules.people.persons.getMyPerson,
		{},
	)
	const live = useAuthenticatedConvexQuery(api.modules.live.sessions.listLive, liveAvailable ? { networkId, limit: 20 } : "skip")
	const liveDirects = live.data?.items ?? []

	// Mon handle de RÉSEAU : celui d'un profil publié. Le plateau ne porte le
	// handle d'un auteur que si son profil l'est — un handle choisi mais non
	// publié ne désigne donc aucune série, pas même la mienne (cf.
	// `storySourceFor`, qui sert alors MES stories par `myActive`).
	const myHandle =
		me.data !== undefined && me.data !== null && me.data.published
			? (me.data.handle ?? null)
			: null
	const startAuthor = searchParams.get(STORIES_AUTHOR_PARAM)

	// L'horloge de l'écran : une actu se mesure en minutes, une minute suffit.
	// La rafraîchir à chaque image de rendu ferait bouger « il y a 3 h » sans
	// que rien n'ait changé.
	useEffect(() => {
		const id = setInterval(() => setNow(Date.now()), 60_000)
		return () => clearInterval(id)
	}, [])

	const plan = buildViewerItems(
		liveDirects,
		orderTray(tray.data?.groups ?? [], myHandle),
		{ startAuthor },
	)

	// L'entrée n'est calculée QU'UNE FOIS, à l'arrivée des données : recalculer
	// à chaque rendu ramènerait le lecteur sur `?auteur=` à chaque fois que le
	// plateau se rafraîchit — on serait renvoyé au début en pleine lecture.
	useEffect(() => {
		if (index !== null) return
		if (tray.data === undefined) return
		setIndex(plan.startIndex)
	}, [index, tray.data, plan.startIndex])

	// Consommé UNE fois, au montage : le drapeau dit si CETTE navigation vient
	// de l'app — auquel cas fermer revient en arrière (position de défilement
	// et pages du fil restaurées) au lieu de repousser le fil à neuf.
	const [openedFromApp] = useState(() => consumeStoriesOpenedFromApp())
	const close = useCallback(() => {
		if (storiesCloseAction(openedFromApp) === "back") router.back()
		else router.push(routes.home())
	}, [router, routes, openedFromApp])

	/**
	 * Suivre l'écran courant dans l'URL — en REMPLAÇANT l'entrée d'historique.
	 * Le paramètre disparaît sur une conférence : `?auteur=` ne désigne qu'une série.
	 */
	const onIndexChange = (next: number) => {
		setIndex(next)
		const item = plan.items[next]
		const handle =
			item !== undefined && item.kind === "stories"
				? item.group.author.handle
				: null
		const params = new URLSearchParams(searchParams.toString())
		if (handle === null) params.delete(STORIES_AUTHOR_PARAM)
		else params.set(STORIES_AUTHOR_PARAM, handle)
		const query = params.toString()
		router.replace(query.length > 0 ? `${pathname}?${query}` : pathname)
	}

	/** La série est épuisée : on passe à l'écran voisin, ou on sort. */
	const onExhausted = (direction: 1 | -1) => {
		const current = index ?? 0
		const next = current + direction
		// Au bout de la pile vers l'avant, on REVIENT AU FIL. C'est la conduite
		// du genre, et elle vaut mieux que de rester figé sur la dernière image
		// d'une série terminée, sans rien pour dire que c'est fini.
		if (next >= plan.items.length) {
			close()
			return
		}
		if (next < 0) return
		onIndexChange(next)
	}

	const renderItem = (item: ViewerItem, state: { active: boolean }) =>
		item.kind === "direct" ? (
			<LiveDirectSlide
				direct={item.direct}
				onJoin={(sessionId) => router.push(routes.conference(sessionId))}
				onClose={close}
			/>
		) : (
			<StoryViewer
				handle={item.group.author.handle}
				displayName={item.group.author.displayName}
				avatarUrl={item.group.author.avatarUrl}
				active={state.active}
				myHandle={myHandle}
				now={now}
				onClose={close}
				onExhausted={onExhausted}
			/>
		)

	// L'état du corps est DÉCIDÉ par le module pur — la priorité `error >
	// loading` est la moitié qui manquait : une requête en échec laissait
	// « Chargement… » à l'écran indéfiniment, sans message ni sortie.
	const bodyState = viewerBodyState({
		fatalError: tray.isError,
		loaded: tray.data !== undefined && index !== null,
		empty: plan.items.length === 0,
	})
	const activeItem = plan.items[Math.min(index ?? 0, plan.items.length - 1)]
	const body =
		bodyState === "error" ? (
			<div className="st-frame">
				<div className="st-empty" style={{ background: "var(--background)" }}>
					<p className="st-empty-title">{t("storiesViewerPage.error.title")}</p>
					<p className="st-empty-text">{t("storiesViewerPage.error.text")}</p>
					<Button
						onClick={() => {
							void tray.refetch()
						}}
					>
						{t("storiesViewerPage.retry")}
					</Button>
					<Button variant="ghost" icon="arrowLeft" onClick={close}>
						{t("storiesViewerPage.backToFeed")}
					</Button>
				</div>
			</div>
		) : bodyState === "loading" ? (
			<div className="st-frame">
				<div className="st-empty" style={{ background: "var(--background)" }}>
					<p className="st-empty-title">{t("storiesViewerPage.loading")}</p>
				</div>
			</div>
		) : bodyState === "empty" ? (
			<div className="st-frame">
				<div className="st-empty" style={{ background: "var(--background)" }}>
					<p className="st-empty-title">{t("storiesViewerPage.empty.title")}</p>
					{canCreate ? (
						<>
							<p className="st-empty-text">{t("storiesViewerPage.empty.text")}</p>
							<Button icon="camera" onClick={() => setCreateOpen(true)}>
								{t("storiesViewerPage.publish")}
							</Button>
						</>
					) : null}
					<Button variant="ghost" icon="arrowLeft" onClick={close}>
						{t("storiesViewerPage.backToFeed")}
					</Button>
				</div>
			</div>
		) : (
			<div className="st-frame">
				{/* `index ?? 0` : l'état `pager` implique `loaded`, donc un index
				    calé — le repli n'existe que pour le typage, jamais au rendu. */}
				<VerticalPager
					items={plan.items}
					index={Math.min(index ?? 0, plan.items.length - 1)}
					onIndexChange={onIndexChange}
					keyExtractor={viewerItemKey}
					renderItem={renderItem}
					ariaLabel={
						activeItem === undefined
							? t("storiesViewerPage.pagerLabel")
							: t("storiesViewerPage.pagerLabelWithItem", {
									item: viewerItemLabel(activeItem, t),
								})
					}
				/>
			</div>
		)

	const composer = canCreate ? (
		<StoryCreateSheet
			open={createOpen}
			onClose={() => setCreateOpen(false)}
			// Après publication, on revient au FIL : l'actu vient d'être créée,
			// et la relire dans la seconde n'apprend rien. Le plateau, lui, la
			// portera déjà.
			onPublished={close}
		/>
	) : null

	// ⚠️ `mobile === null` ne rend NI l'un NI l'autre : rendre l'arbre du bureau
	// « en attendant » ouvrirait un overlay portalé au premier rendu du
	// téléphone, puis le refermerait.
	if (mobile === null) return <StoriesStyles />

	if (mobile && !adaptive) {
		return (
			<div
				className="st-viewer"
				style={{ height: "100%", background: "var(--background)" }}
			>
				<StoriesStyles />
				{body}
				{composer}
			</div>
		)
	}

	return (
		<>
			<StoriesStyles />
			{/* Le voile est demandé : sur le bureau, la surface n'est PAS pleine —
			    c'est un cadre 9:16 centré, et sans voile on verrait la page
			    d'origine autour, éclairée. */}
			<ImmersiveOverlay
				open
				onClose={close}
				label={t("storiesViewerPage.pagerLabel")}
				scrim
			>
				<div className="st-viewer">{body}</div>
			</ImmersiveOverlay>
			{composer}
		</>
	)
}
