// Dupliqué de socle/packages/agent-features/src/features/stories/StoryViewer.tsx @ ad2e7fdc2 — adaptations : branché sur `stories.stories.{myActive,listByAuthor,markSeen,remove}` du moteur (réseau de `useNetwork()`, instant ARRONDI des lectures figé au montage de l'écran — `storyQueryInstant` — pour qu'aucun réabonnement ne coupe la lecture) ; propriété `surface` (ADR-0079 du socle) retirée avec les surfaces du moteur ; nom d'auteur nullable (contrat `counterpartLabel`) dit par le libellé neutre ; média RETENU par la garde des fichiers (URL nulle, vue de son seul auteur) montré comme tel, minuté comme une image et jamais joué ; libellés traduits (clés `stories:storyViewer.*`) ; refus du retrait dits par leur code (`storyEngineErrorText`).
"use client"

/**
 * StoryViewer — la SÉRIE d'un auteur, un écran du pager vertical.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * DEUX AXES, DEUX GESTES, ET ILS NE SE MARCHENT PAS DESSUS
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Le GLISSÉ vertical appartient au `VerticalPager` qui contient cet écran : il
 * change d'AUTEUR. Le TAP appartient à cet écran : il change de STORY. Les
 * deux cohabitent parce que le tap se reconnaît à ce qu'il ne bouge PAS —
 * au-delà de `SWIPE_HYSTERESIS_PX` (le seuil même du pager, importé et non
 * recopié), le geste est un glissé et cet écran s'en désintéresse. Deux
 * seuils indépendants auraient produit une bande de gestes où l'on change à la
 * fois de story et d'auteur.
 *
 * ⚠️ Ce composant ne DÉCIDE rien de ce qui est vérifiable : durée d'un
 * segment, avancement, zone de tap, story d'ouverture et horloge de lecture
 * vivent dans `stories-progress.ts` ; le choix de la requête dans
 * `stories-viewer.ts`. Il ne doit rien rester ici d'autre que du câblage.
 *
 * ── Trois pièges de lecteur de stories, tous traités ci-dessous ──────────
 *  · **La barre suit l'HORLOGE, pas le décodeur.** Un tampon réseau la
 *    désynchroniserait du média ; c'est pourquoi `onWaiting`/`onPlaying`
 *    METTENT EN PAUSE la même horloge que le doigt posé. Sans cela, une vidéo
 *    qui charge trois secondes se voit couper trois secondes trop tôt.
 *  · **Le son est COUPÉ au départ, et ce n'est pas une préférence** : les
 *    navigateurs refusent la lecture automatique avec son, et la promesse
 *    rejetée laisserait un écran noir. Le bouton « son » est le geste qui
 *    l'autorise.
 *  · **`markSeen` part UNE fois par story**, mémorisée dans une ref : le
 *    serveur est idempotent, mais un appel par image de rendu ferait soixante
 *    mutations par seconde.
 *
 * ⚠️ L'instant passé aux lectures est FIGÉ au montage : le changer referait
 * l'abonnement, la série repasserait par « Chargement… » et la vidéo en cours
 * repartirait de zéro. L'expiration déjà reçue ferme toutefois le segment
 * dès que l'horloge de l'écran l'atteint, sans attendre un réabonnement.
 */

import { api } from "@antsia/api/engine"
import { useAuthenticatedConvexQuery } from "@antsia/api/hooks"
import { useNetwork } from "@antsia/api/network"
import { Button } from "@antsia/ui"
import { useMutation } from "convex/react"
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent } from "react"
import { useTranslation } from "react-i18next"
import { toast } from "sonner"
import { SWIPE_HYSTERESIS_PX } from "../../shell/mobile/gestures"
import { StoryOverlay } from "./StoryOverlay"
import { DailySpecialStoryCard } from "./DailySpecialStoryCard"
import { StoryProgressBar } from "./StoryProgressBar"
import { StoryViewersSheet } from "./StoryViewersSheet"
import {
	initialStoryIndex,
	isMediaHalted,
	isPlaybackHalted,
	pressLostToSwipe,
	progressAt,
	segmentDuration,
	STORY_TIMER_ZERO,
	storyMediaErrorPlan,
	tapZone,
	tickTimer,
	type StorySegment,
} from "./stories-progress"
import { storyAgeLabel, storyAuthorName, storyQueryInstant } from "./stories-tray"
import { preloadTarget, storySourceFor } from "./stories-viewer"
import { storyEngineErrorText } from "./story-create"

/** Au-delà, un appui n'est plus un tap mais une pause volontaire. */
const LONG_PRESS_MS = 400

/** La cible reste utilisable même si le lecteur est monté sans sa feuille. */
const PLAYBACK_CONTROL_STYLE = { minWidth: 44, minHeight: 44 } as const

/**
 * Un média RETENU par la garde (analyse en cours, ou bloqué) n'a rien à jouer :
 * son segment tient l'écran le temps d'une image, le temps de lire pourquoi.
 */
const WITHHELD_SEGMENT: StorySegment = { media: { kind: "image" } }

export interface StoryViewerProps {
	handle: string | null
	/** `null` : le moteur n'a rien à nommer — l'écran dit le libellé neutre. */
	displayName: string | null
	avatarUrl: string | null
	/** L'écran est-il celui qu'on regarde ? Un voisin monté ne joue pas. */
	active: boolean
	/** Mon handle de réseau — décide de la requête (cf. `storySourceFor`). */
	myHandle: string | null
	/** L'horloge de l'écran (âges affichés) ; l'instant des lectures en est tiré au montage. */
	now: number
	onClose: () => void
	/**
	 * La série est épuisée : `1` vers l'avant (auteur suivant), `-1` vers
	 * l'arrière. C'est le PAGER qui décide ce qu'il y a au bout — cet écran ne
	 * connaît pas ses voisins.
	 */
	onExhausted: (direction: 1 | -1) => void
}

export function StoryViewer(props: StoryViewerProps) {
	const { networkId, personId } = useNetwork()
	return <StoryViewerContent key={`${networkId}:${personId}:${props.handle ?? "mine"}:${props.myHandle ?? ""}`} {...props} />
}

function StoryViewerContent({
	handle,
	displayName,
	avatarUrl,
	active,
	myHandle,
	now,
	onClose,
	onExhausted,
}: StoryViewerProps) {
	const { t } = useTranslation("stories")
	const { networkId } = useNetwork()
	const source = storySourceFor(handle, myHandle)
	const authorName = storyAuthorName(displayName, t)
	// L'instant des lectures, FIGÉ au montage (cf. l'en-tête).
	const [queryNow] = useState(() => storyQueryInstant(now))

	// Les deux portes du backend. L'une des deux est TOUJOURS en `"skip"` :
	// deux abonnements ouverts pour un seul écran doubleraient le trafic de
	// chaque voisin monté par le pager.
	const mine = useAuthenticatedConvexQuery(
		api.modules.stories.stories.myActive,
		source === "mine" ? { networkId, now: queryNow } : "skip",
	)
	const theirs = useAuthenticatedConvexQuery(
		api.modules.stories.stories.listByAuthor,
		source === "author" && handle !== null
			? { networkId, handle, now: queryNow }
			: "skip",
	)
	const loaded = source === "mine" ? mine.data : theirs.data
	const stories = useMemo(() => loaded ?? [], [loaded])

	const markSeen = useMutation(api.modules.stories.stories.markSeen)
	const removeStory = useMutation(api.modules.stories.stories.remove)

	const [index, setIndex] = useState(0)
	const [timer, setTimer] = useState(STORY_TIMER_ZERO)
	const [paused, setPaused] = useState(false)
	// L'intention explicite ne se relâche ni au pointerup, ni au pointerleave.
	const [userPaused, setUserPaused] = useState(false)
	// Le clavier ne doit pas perdre le bouton de commande au changement automatique de Story.
	const [offerFocused, setOfferFocused] = useState(false)
	const [stalled, setStalled] = useState(false)
	const [muted, setMuted] = useState(true)
	const [viewersOpen, setViewersOpen] = useState(false)
	const [removeArmed, setRemoveArmed] = useState(false)
	/** L'autoplay a été REFUSÉ : la vidéo attend un geste (chip « Lire »). */
	const [needsTap, setNeedsTap] = useState(false)
	/** Le média est MORT (décodage) et la série n'a que lui : l'écran tient. */
	const [failed, setFailed] = useState(false)

	const primed = useRef(false)
	const alive = useRef(true)
	const shownStory = useRef<string | null>(null)
	useEffect(() => {
		alive.current = true
		return () => { alive.current = false }
	}, [])
	/** La sortie de série n'est annoncée QU'UNE fois — cf. l'effet plus bas. */
	const exhausted = useRef(false)
	const seenSent = useRef(new Set<string>())
	const expiredAdvance = useRef<string | null>(null)
	const pressed = useRef<{ x: number; y: number; t: number } | null>(null)
	const videoRef = useRef<HTMLVideoElement>(null)
	const playbackAttempt = useRef(0)

	const selected = stories[index]
	// Le serveur reste l'autorité ; une date d'expiration déjà reçue interdit
	// aussi de laisser l'ancien média ouvert entre deux lectures horodatées.
	const current = selected !== undefined && selected.expiresAt > now ? selected : undefined
	useEffect(() => {
		if (!active || selected === undefined || selected.expiresAt > now) return
		if (expiredAdvance.current === String(selected.storyId)) return
		expiredAdvance.current = String(selected.storyId)
		const next = stories.findIndex((story, position) => position > index && story.expiresAt > now)
		if (next >= 0) setIndex(next)
		else onExhausted(1)
	}, [active, index, now, onExhausted, selected, stories])
	const duration =
		current === undefined
			? 0
			: segmentDuration(current.media.url === null ? WITHHELD_SEGMENT : current)
	const progress = progressAt(timer.elapsed, duration)
	// La story N+1 de la MÊME série — le pager précharge déjà les auteurs
	// voisins en les montant, mais rien ne réchauffait le segment suivant :
	// chaque avancée payait un aller-retour réseau à froid.
	const nextStory = stories[index + 1]
	const upcoming = nextStory !== undefined && nextStory.expiresAt > now ? preloadTarget(stories, index) : null

	// L'horloge est ARRÊTÉE dès qu'une seule de ces raisons tient — la liste
	// complète vit dans `isPlaybackHalted` (module pur) : en oublier une fait
	// défiler une story que personne ne regarde (vécu avec l'autoplay refusé).
	const halted = isPlaybackHalted({
		active,
		paused: paused || userPaused || offerFocused,
		stalled,
		viewersOpen,
		needsTap,
		failed,
	})
	// Le MÉDIA, lui, ignore `stalled` (`isMediaHalted`) : le mettre en pause
	// parce qu'il tamponne l'empêchait à jamais d'en sortir — `playing` ne
	// tire pas sur un élément en pause, donc `stalled` ne redescendait jamais.
	// C'est le gel « écran noir » de toutes les vidéos d'actu (2026-08-20).
	const mediaHalted = isMediaHalted({
		active,
		paused: paused || userPaused || offerFocused,
		stalled,
		viewersOpen,
		needsTap,
		failed,
	})

	/** Où la série s'ouvre — une seule fois, à l'arrivée des données. */
	useEffect(() => {
		if (primed.current || stories.length === 0) return
		primed.current = true
		const initial = initialStoryIndex(stories)
		const live = stories.findIndex((story, position) => position >= initial && story.expiresAt > now)
		setIndex(live >= 0 ? live : initial)
	}, [now, stories])

	/** Chaque story repart de zéro. */
	const currentId = current === undefined ? null : String(current.storyId)
	useLayoutEffect(() => { shownStory.current = currentId }, [currentId])
	// Une promesse play() peut aboutir après une pause ou le réemploi du même
	// élément vidéo pour une autre story. Elle ne décide plus de cette lecture.
	useLayoutEffect(() => {
		playbackAttempt.current += 1
	}, [active, currentId, failed, paused, userPaused, offerFocused, viewersOpen])
	useEffect(() => {
		setTimer(STORY_TIMER_ZERO)
		setRemoveArmed(false)
		setNeedsTap(false)
		setFailed(false)
		setOfferFocused(false)
		exhausted.current = false
	}, [currentId])

	/**
	 * Ceinture : l'écran mis de côté par le pager PENDANT un appui ne reverra
	 * jamais son `pointerup` (la capture est chez le pager) — sans ce reset, il
	 * resterait en pause pour toujours et se rouvrirait figé.
	 */
	useEffect(() => {
		if (active) return
		pressed.current = null
		setPaused(false)
	}, [active])

	/** La boucle de lecture. */
	useEffect(() => {
		if (!active || current === undefined) return
		let frame = 0
		const step = (stamp: number) => {
			setTimer((state) => {
				const next = tickTimer(state, stamp, halted)
				// On ne re-rend que si la barre BOUGE d'un demi-pour-cent : un
				// `setState` par image ferait re-rendre l'écran soixante fois par
				// seconde pour une largeur inchangée. Rendre l'état PRÉCÉDENT
				// conserve l'ancre, donc rien n'est perdu au tour suivant.
				const sameStep =
					Math.round(progressAt(next.elapsed, duration) * 200) ===
					Math.round(progressAt(state.elapsed, duration) * 200)
				if (sameStep && next.pausedAt !== null && state.pausedAt !== null) {
					return state
				}
				return next
			})
			frame = requestAnimationFrame(step)
		}
		frame = requestAnimationFrame(step)
		return () => cancelAnimationFrame(frame)
	}, [active, current, duration, halted])

	/**
	 * La story est finie : on passe à la suivante, ou on quitte la série.
	 *
	 * ⚠️ `exhausted` est une REF, et elle est indispensable. `onExhausted`
	 * change d'identité à chaque rendu du parent, donc cet effet se rejoue à
	 * chaque rendu ; sans garde, la dernière story d'une série appellerait
	 * `router.replace` (ou la fermeture) en boucle — un thrash de navigation
	 * qu'aucun test ne verrait et qui ne se manifeste qu'en fin de série.
	 * Le passage à la story suivante, lui, n'a pas besoin de garde : `setIndex`
	 * de la même valeur est un no-op, et l'horloge repart à zéro.
	 */
	useEffect(() => {
		if (!active || current === undefined || progress < 1) return
		if (index + 1 < stories.length) {
			setIndex(index + 1)
			return
		}
		if (exhausted.current) return
		exhausted.current = true
		onExhausted(1)
	}, [active, current, progress, index, stories.length, onExhausted])

	/** « Vu » — une fois par story, jamais pour l'auteur. */
	useEffect(() => {
		if (!active || current === undefined || current.isOwn) return
		if (currentId === null || seenSent.current.has(currentId)) return
		seenSent.current.add(currentId)
		// Un échec est SANS conséquence à l'écran : la story a pu expirer entre
		// la lecture et la mutation, et rien de ce qui s'affiche n'en dépend.
		void markSeen({ networkId, storyId: current.storyId }).catch(() => {})
	}, [active, current, currentId, markSeen, networkId])

	/**
	 * Le média suit l'INTENTION (doigt posé, feuille ouverte, écran quitté) —
	 * jamais son propre état réseau. `mediaHalted`, PAS `halted` : brancher le
	 * média sur l'horloge le mettait en pause au premier `waiting` (qui tire à
	 * la milliseconde une, tampon vide), et un élément en pause n'émet jamais
	 * le `playing` qui aurait rabaissé `stalled` — pause éternelle, vidéo
	 * chargée à 100 % et muette (chronologie constatée le 2026-08-20).
	 */
	/**
	 * Lance la lecture, et traduit le seul échec qui regarde l'écran : le
	 * refus d'autoplay lève le chip « Lire ». Un AbortError (un `pause()` qui
	 * interrompt un `play()` en vol) est bénin et quotidien — le traiter comme
	 * un refus ferait clignoter le chip à chaque pause au doigt.
	 */
	const startPlayback = useCallback((node: HTMLVideoElement) => {
		const attempt = ++playbackAttempt.current
		const storyId = shownStory.current
		const sourceUrl = node.getAttribute("src")
		const isCurrentAttempt = () => alive.current && videoRef.current === node
			&& shownStory.current === storyId && playbackAttempt.current === attempt
			&& node.getAttribute("src") === sourceUrl
		node
			.play()
			.then(() => {
				if (isCurrentAttempt()) setNeedsTap(false)
			})
			.catch((err: unknown) => {
				if (!isCurrentAttempt()) return
				if (err instanceof DOMException && err.name === "NotAllowedError") {
					setNeedsTap(true)
					setStalled(false)
				}
			})
	}, [setNeedsTap, setStalled])

	useEffect(() => {
		const node = videoRef.current
		if (node === null) return
		// `muted` est posé par la ref et pas seulement par la prop : React ne
		// réapplique pas fiablement cet attribut, et une vidéo qui démarre avec
		// le son est refusée par le navigateur.
		node.muted = muted
		if (mediaHalted) {
			node.pause()
			return
		}
		startPlayback(node)
		// Les raisons sont aussi suivies séparément : pendant un play() manuel,
		// needsTap tient encore mediaHalted à true ; une nouvelle pause doit
		// néanmoins interrompre cette tentative avant sa résolution.
	}, [mediaHalted, muted, currentId, startPlayback, active, paused, userPaused, offerFocused, viewersOpen, failed])

	/**
	 * Rejoue quand la DÉCISION dit « joue » et que l'élément s'est pourtant
	 * retrouvé en pause — la pause SUBIE (déplacement DOM, navigateur), qui ne
	 * passe pas par `.pause()` et que l'effet ne peut pas voir : aucune de ses
	 * dépendances n'a bougé. Nos propres pauses ont `mediaHalted` levé et ne
	 * relancent rien — pas de ping-pong possible.
	 */
	const resyncPlayback = () => {
		const node = videoRef.current
		if (node === null || mediaHalted || !node.paused) return
		startPlayback(node)
	}

	const goPrev = () => {
		if (index > 0) setIndex(index - 1)
		else onExhausted(-1)
	}
	const goNext = () => {
		if (index + 1 < stories.length) setIndex(index + 1)
		else onExhausted(1)
	}
	const onStoryKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
		if (!active || event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return
		const target = event.target
		if (target instanceof HTMLElement && target.closest('input, textarea, select, [contenteditable]:not([contenteditable="false"]), [role="textbox"], [role="combobox"], [role="slider"], [role="spinbutton"]')) return
		if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return
		event.preventDefault()
		event.stopPropagation()
		if (event.key === "ArrowLeft") goPrev()
		else goNext()
	}

	// ─── États où il n'y a rien à lire ──────────────────────────────────────
	if (source === "unavailable") {
		return (
			<StoryEmpty
				title={t("storyViewer.unavailable.title")}
				text={t("storyViewer.unavailable.text")}
				onClose={onClose}
			/>
		)
	}
	// L'ÉCHEC avant le chargement : sans cette branche, une requête en erreur
	// laissait « Chargement… » à l'écran pour toujours (`data` reste
	// `undefined`), sans un mot ni une sortie autre que la croix.
	if (mine.isError || theirs.isError) {
		return (
			<StoryEmpty
				title={t("storyViewer.loadFailed.title")}
				text={t("storyViewer.loadFailed.text")}
				onClose={onClose}
			/>
		)
	}
	// ⚠️ `undefined` (pas encore chargé) et `[]` (plus rien) sont DEUX choses.
	// Les confondre ferait annoncer « ces stories ont expiré » pendant que la
	// réponse est en vol.
	if (loaded === undefined) {
		return (
			<StoryEmpty title={t("storyViewer.loading")} text="" onClose={onClose} />
		)
	}
	if (current === undefined) {
		return (
			<StoryEmpty
				title={t("storyViewer.nothingLeft.title")}
				text={t("storyViewer.nothingLeft.text")}
				onClose={onClose}
			/>
		)
	}

	/** Le média se JOUE-t-il ? Ni retenu par la garde, ni mort au décodage. */
	const playableVideo =
		!failed && current.media.kind === "video" && current.media.url !== null

	return (
		<div
			className="st-stage esp-story-stage"
			role="group"
			aria-label={t("storyViewer.playbackControls")}
			aria-keyshortcuts="ArrowLeft ArrowRight"
			tabIndex={active ? 0 : -1}
			onKeyDown={onStoryKeyDown}
			onPointerDown={(event) => {
				pressed.current = {
					x: event.clientX,
					y: event.clientY,
					t: event.timeStamp,
				}
				setPaused(true)
			}}
			onPointerUp={(event) => {
				setPaused(false)
				const start = pressed.current
				pressed.current = null
				if (start === null) return
				// Un GLISSÉ appartient au pager, un APPUI LONG était une pause
				// volontaire : ni l'un ni l'autre ne change de story.
				const moved = Math.hypot(
					event.clientX - start.x,
					event.clientY - start.y,
				)
				if (moved > SWIPE_HYSTERESIS_PX) return
				if (event.timeStamp - start.t > LONG_PRESS_MS) return
				const box = event.currentTarget.getBoundingClientRect()
				if (tapZone(event.clientX - box.left, box.width) === "prev") goPrev()
				else goNext()
			}}
			onPointerMove={(event) => {
				const start = pressed.current
				if (start === null) return
				// Le pager vient d'engager son glissé : il POSE sa capture et cet
				// écran ne reverra ni `pointermove` ni `pointerup`. On abandonne
				// l'appui MAINTENANT — c'est la dernière occasion de relâcher la
				// pause (décision : `pressLostToSwipe`).
				if (
					pressLostToSwipe(start, event.clientX, event.clientY, SWIPE_HYSTERESIS_PX)
				) {
					pressed.current = null
					setPaused(false)
				}
			}}
			onPointerLeave={() => {
				// Souris sortie du cadre avant engagement, ou capture transférée au
				// pager : dans les deux cas l'appui ne se conclura jamais ici.
				pressed.current = null
				setPaused(false)
			}}
			onPointerCancel={() => {
				pressed.current = null
				setPaused(false)
			}}
		>
			{failed ? (
				/* Le média est MORT et la série n'a que lui : l'écran TIENT et le
				   dit — sauter refermerait le lecteur à l'ouverture (décision :
				   `storyMediaErrorPlan`). Le glissé du pager reste la sortie. Le
				   fond est reposé : `.st-empty` écrit en `--foreground`, illisible
				   sur la scène sombre sans lui (même parade que `StoryEmpty`). */
				<div className="st-empty" style={{ background: "var(--background)" }}>
					<p className="st-empty-title">
						{current.media.kind === "video"
							? t("storyViewer.failed.video")
							: t("storyViewer.failed.media")}
					</p>
					<p className="st-empty-text">{t("storyViewer.failed.text")}</p>
					<Button variant="secondary" icon="arrowLeft" onClick={onClose}>
						{t("storyViewer.backToFeed")}
					</Button>
				</div>
			) : current.media.url === null ? (
				/* Le média est RETENU par la garde des fichiers (seul son auteur
				   voit la story dans cet état) : on dit pourquoi, on ne joue rien. */
				<div className="st-empty" style={{ background: "var(--background)" }}>
					<p className="st-empty-title">
						{current.media.withheld !== null
							? t(`errors:${current.media.withheld}`)
							: t("storyViewer.failed.media")}
					</p>
				</div>
			) : current.media.kind === "video" ? (
				<video
					ref={videoRef}
					className="st-media"
					src={current.media.url}
					playsInline
					muted
					autoPlay
					preload="metadata"
					onWaiting={() => setStalled(true)}
					onPlaying={() => setStalled(false)}
					onStalled={() => setStalled(true)}
					// Les DEUX autres retombées du stall, indispensables :
					// `canplay` — les données sont là ; sans lui, un `waiting` levé
					// pendant une pause au doigt attendrait un `playing` qui ne
					// viendra qu'après la reprise, et l'horloge repartirait en
					// retard sur le média. `timeUpdate` — le temps AVANCE, preuve
					// que rien ne tamponne : Chrome émet des `stalled` de pure
					// inactivité réseau en pleine lecture (tampon plein, il ne
					// télécharge plus), qui sans cela figeraient l'horloge pendant
					// que la vidéo, elle, continue — story jamais terminée.
					onCanPlay={() => {
						setStalled(false)
						resyncPlayback()
					}}
					onTimeUpdate={() => setStalled(false)}
					// Une pause SUBIE n'est pas une décision. Le navigateur pause de
					// lui-même — sans passer par `.pause()` — quand l'élément est
					// DÉPLACÉ dans le DOM (restructuration du rendu à l'arrivée des
					// données, ~240 ms, chronologie du 2026-08-20) : l'effet, dont
					// aucune dépendance n'a bougé, ne rejouait jamais `play()` et la
					// story restait figée sur sa première image. Si la décision dit
					// « joue », on rejoue ; nos propres pauses (doigt, feuille,
					// écran voisin) ont `mediaHalted` levé et ne relancent rien.
					onPause={resyncPlayback}
					onError={() => {
						// Un blob INDÉCODABLE ne déclenchera jamais `onPlaying` :
						// `stalled` resterait levé et le segment gèlerait pour
						// toujours (constaté en MEDIA_ERR_SRC_NOT_SUPPORTED). La
						// décision sauter/tenir vit dans `storyMediaErrorPlan`.
						setStalled(false)
						if (storyMediaErrorPlan(stories.length) === "skip") goNext()
						else setFailed(true)
					}}
				/>
			) : (
				// eslint-disable-next-line @next/next/no-img-element -- lecteur du moteur indépendant de Next : URL servie par la garde et scène déjà dimensionnée.
				<img
					className={current.dailySpecial ? "st-media st-daily-special-media" : "st-media"}
					src={current.media.url}
					alt={current.dailySpecial?.title ?? current.caption ?? t("storyViewer.imageAlt", { name: authorName })}
					// Même règle qu'une vidéo cassée : sauter si la série continue,
					// tenir l'écran (et le dire) si elle n'a que ce média.
					onError={() => {
						if (storyMediaErrorPlan(stories.length) === "skip") goNext()
						else setFailed(true)
					}}
				/>
			)}

			{/* L'autoplay a été refusé : la vidéo attend un GESTE. Le chip stoppe
			    la propagation — un tap « Lire » n'est pas un tap « suivant ». */}
			{needsTap && playableVideo ? (
				<button
					type="button"
					className="st-chip esp-story-chip st-play"
					aria-label={t("storyViewer.play")}
					disabled={!active || paused || userPaused || viewersOpen}
					onPointerDown={(event) => event.stopPropagation()}
					onPointerUp={(event) => event.stopPropagation()}
					onClick={() => {
						if (!active || paused || userPaused || viewersOpen || failed) return
						const node = videoRef.current
						if (node !== null) startPlayback(node)
					}}
				>
					{t("storyViewer.play")}
				</button>
			) : null}

			{/* Préchargeur INVISIBLE du segment suivant : le fetch d'une `<img>`
			    part même en `display: none`, et une `<video preload="metadata">`
			    réchauffe la connexion sans télécharger le flux entier. */}
			{upcoming !== null ? (
				<div aria-hidden="true" style={{ display: "none" }}>
					{upcoming.kind === "video" ? (
						<video src={upcoming.url} preload="metadata" muted />
					) : (
						// eslint-disable-next-line @next/next/no-img-element -- préchargement borné de la seule voisine, URL servie par la garde ; aucune optimisation Next.
						<img src={upcoming.url} alt="" />
					)}
				</div>
			) : null}

			<StoryProgressBar
				count={stories.length}
				index={index}
				progress={progress}
			/>

			<StoryOverlay
				displayName={displayName}
				handle={handle}
				avatarUrl={avatarUrl}
				ageLabel={storyAgeLabel(current.publishedAt, now, t)}
				caption={current.dailySpecial ? null : current.caption}
				content={current.dailySpecial && current.media.url !== null && !failed ? (
					<DailySpecialStoryCard
						key={currentId}
						offer={current.dailySpecial}
						onFocusWithinChange={setOfferFocused}
					/>
				) : undefined}
				onClose={onClose}
				actions={
					<>
						<div role="group" aria-label={t("storyViewer.playbackControls")} style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
							<button type="button" className="st-chip esp-story-chip" style={PLAYBACK_CONTROL_STYLE} disabled={!active} onClick={goPrev}>
								{t("storyViewer.previous")}
							</button>
							<button type="button" className="st-chip esp-story-chip" style={PLAYBACK_CONTROL_STYLE} disabled={!active} onClick={() => setUserPaused(value => !value)}>
								{t(userPaused ? "storyViewer.resume" : "storyViewer.pause")}
							</button>
							<button type="button" className="st-chip esp-story-chip" style={PLAYBACK_CONTROL_STYLE} disabled={!active} onClick={goNext}>
								{t("storyViewer.next")}
							</button>
						</div>
						{playableVideo ? (
							<button
								type="button"
								className="st-chip esp-story-chip"
								aria-pressed={!muted}
								onClick={() => setMuted((value) => !value)}
							>
								{muted ? t("storyViewer.unmute") : t("storyViewer.mute")}
							</button>
						) : null}

						{/* « Vu par » et le retrait n'existent que pour l'AUTEUR : le
						    serveur rend un refus indistinct à quiconque d'autre, et un
						    bouton qui ne peut mener qu'à une erreur n'est pas un
						    bouton. */}
						{current.isOwn ? (
							<>
								<button
									type="button"
									className="st-chip esp-story-chip"
									onClick={() => setViewersOpen(true)}
								>
									{t("storyViewer.seenBy", { count: current.viewCount ?? 0 })}
								</button>
								{/* Retirer en DEUX temps plutôt qu'un dialogue : le geste
								    est irréversible (le retrait ramène l'expiration à
								    maintenant, cf. `stories.remove`), et une confirmation
								    modale par-dessus un lecteur plein écran empilerait deux
								    surfaces immersives. */}
								<button
									type="button"
									className="st-chip esp-story-chip"
									onClick={() => {
										if (!removeArmed) {
											setRemoveArmed(true)
											return
										}
										void removeStory({ networkId, storyId: current.storyId })
											.then(() => {
												if (!alive.current || shownStory.current !== String(current.storyId)) return
												toast.success(t("storyViewer.removed"))
												goNext()
											})
											.catch((error: unknown) => {
												if (!alive.current || shownStory.current !== String(current.storyId)) return
												toast.error(
													storyEngineErrorText(
														error,
														"stories:storyViewer.removeFailed",
														t,
													),
												)
											})
									}}
								>
									{removeArmed
										? t("storyViewer.confirmRemove")
										: t("storyViewer.remove")}
								</button>
							</>
						) : null}
					</>
				}
			/>

			{current.isOwn ? (
				<StoryViewersSheet
					open={viewersOpen}
					onOpenChange={setViewersOpen}
					storyId={current.storyId}
					now={now}
					queryNow={queryNow}
				/>
			) : null}
		</div>
	)
}

/** Le même cadre pour les écrans sans média — et toujours une sortie. */
function StoryEmpty({
	title,
	text,
	onClose,
}: {
	title: string
	text: string
	onClose: () => void
}) {
	const { t } = useTranslation("stories")
	return (
		<div className="st-stage" style={{ background: "var(--background)" }}>
			<div className="st-empty">
				<p className="st-empty-title">{title}</p>
				{text.length > 0 ? <p className="st-empty-text">{text}</p> : null}
				<Button variant="secondary" icon="arrowLeft" onClick={onClose}>
					{t("storyViewer.backToFeed")}
				</Button>
			</div>
		</div>
	)
}
