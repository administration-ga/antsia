// Dupliqué de socle/packages/agent-features/src/features/iappel/CallStage.tsx @ ad2e7fdc2 — adaptations : branches retirées — poste (liseré, emblème, fonction, administration, props `scope` et `orgEmblemUrl`), transmission au secrétariat (prop `routedFor`, `routedFromPositionTitle`) ; libellés, états et noms accessibles traduits (i18n `iappel`, pluriel des participants) ; `deriveCallPhase`, `peerDisplayName`, `groupCallSubtitle` et `speakerButtonLabel` reçoivent `t` en dernier paramètre, `peerSubtitle` lu pour la seule portée personnelle ; deux mémos rendus conformes au compilateur React (identité LiveKit locale lue une fois, liste des conviés mémorisée) ; P05 (18/10/2026) : prop `establishedAt` — « En communication » et le chrono partent de l'établissement réel des médias, pas du décrochage serveur.
"use client"

/**
 * CallStage — l'appel EN COURS.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * LA THÈSE DE CET ÉCRAN : L'ORDRE DE LECTURE DIT QUI APPELLE
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Un appel du réseau est un appel PERSONNEL : l'écran montre la personne, et
 * rien d'autre — son nom, puis son adresse de réseau. Un appel de GROUPE se
 * dit comme tel, et montre ses conviés.
 *
 * ── Ce que ce composant ne fait PAS ───────────────────────────────────────
 * Il ne monte AUCUN `<LiveKitRoom>`. La salle vit dans le pool global
 * (`CallRoomPool`), et la surface la consomme par `RoomContext`. C'est ce qui
 * permet de réduire l'appel, de changer de page et de revenir sans que la
 * conversation ne soit coupée une seule fois.
 *
 * Il ne rend pas non plus l'audio distant : `CallRoomMount` porte le
 * `RoomAudioRenderer` du slot actif, et il le porte AILLEURS QUE DANS LA
 * SURFACE — sans quoi réduire l'appel en pilule couperait le son. En avoir un
 * second ici attachait un deuxième `<audio>` aux mêmes pistes.
 *
 * Il n'EXIGE enfin pas la salle : voir `CallStageRoomState` plus bas.
 */

import {
	useConnectionState,
	useConnectionQualityIndicator,
	useLocalParticipant,
	useMaybeRoomContext,
	useRemoteParticipants,
	useTracks,
	type TrackReference,
} from "@livekit/components-react"
import { ConnectionState, Track } from "livekit-client"
import {
	Camera,
	CameraOff,
	ChevronDown,
	Mic,
	MicOff,
	MessageSquare,
	PauseCircle,
	PhoneOff,
	PlayCircle,
	SwitchCamera,
	UserPlus,
	Users,
	Volume1,
	Volume2,
} from "lucide-react"
import { useEffect, useMemo, useState } from "react"
import { useTranslation } from "react-i18next"

import { Avatar } from "../reseau-personnel/Avatar"
import { CallConnectionQuality } from "./CallConnectionQuality"
import { CallControlButton } from "./CallControlButton"
import { SpeakerPickerPanel } from "./SpeakerPickerPanel"
import { speakerButtonLabel, type SpeakerControlPlan } from "./audio-route"
import { GroupCallGrid, type GroupCallConference } from "./GroupCallGrid"
import { summarizeCallParticipants } from "./call-seats"
import { groupCallSubtitle } from "./group-stage"
import { LocalPip, nextPipCorner, type PipCorner } from "./LocalPip"
import { RemoteVideoStage } from "./RemoteVideoStage"
import {
	availableCallControls,
	type ConnectionQualityLevel,
} from "./call-controls"
import {
	deriveCallPhase,
	type CallConnectionState,
	type CallMeetingSnapshot,
} from "./call-phase"
import { peerDisplayName, peerSubtitle } from "./call-peer"
import { elapsedSince, formatElapsed } from "./call-timer"
import type {
	CallDirection,
	CallGroupIdentity,
	CallParticipantView,
	CallPeerIdentity,
} from "./call-types"
import { participantKey, participantUserId } from "./participant-identity"
import {
	classifyRemoteVideo,
	pickLocalCameraTrack,
	pickRemoteCameraTrack,
	probeOf,
	type RemoteVideoState,
} from "./remote-video"
import { useCameraFlip } from "./use-camera-flip"
import { useSpeakerOutput } from "./use-speaker-output"

export interface CallStageProps {
	peer: CallPeerIdentity | null
	direction: CallDirection
	meeting: CallMeetingSnapshot | null
	/** Le slot est-il parqué ? */
	isHeld?: boolean
	/**
	 * MON identifiant de personne — il distingue « j'ai mis en attente » de
	 * « on m'a mis en attente » dans le `heldBy` de l'appel (`peerHoldsCall`).
	 * Absent : on retombe sur le seul `isHeld` local.
	 */
	myUserId?: string | null
	/** Un échec de jeton ou de salle empêche l'appel de partir. */
	hasError?: boolean
	/**
	 * P05 — l'instant où les médias passent réellement (`call-establishment`),
	 * `null` tant qu'ils ne passent pas. Absent : la règle d'origine (décrochage
	 * serveur) — gardée pour les hôtes qui ne suivent pas l'établissement.
	 */
	establishedAt?: number | null
	/**
	 * POURQUOI il ne part pas, en une phrase (déjà traduite).
	 *
	 * ⚠️ Le store portait déjà `connectError` et `roomError` — lus comme des
	 * BOOLÉENS et jamais affichés. Un micro bloqué par le navigateur donnait
	 * donc « Connexion impossible », un titre qui accuse le réseau, pendant
	 * que la seule action utile (rouvrir la permission) restait tue.
	 */
	errorMessage?: string | null
	micMuted: boolean
	/**
	 * Le micro ne démarre pas (refusé, absent, occupé) : la phrase qui le dit,
	 * ou `null`. L'appel continue en écoute seule ; la commande devient
	 * « Micro bloqué » et son tap réessaie (recette du 22/09).
	 */
	micBlocked?: string | null
	cameraEnabled: boolean
	onToggleMic: () => void
	onToggleCamera: () => void
	onHangUp: () => void
	onMinimize: () => void
	/** Mettre CET appel en attente. */
	onHold?: () => void
	/** Le reprendre. */
	onResume?: () => void
	/** Ouvrir la conversation écrite avec ce correspondant. */
	onWrite?: () => void
	/**
	 * Ouvrir le sélecteur « Ajouter une personne » (escalade 1:1 → groupe,
	 * ADR-0099). La DISPONIBILITÉ est décidée par `availableCallControls`
	 * (appel vivant seulement) ; l'hôte décide du panneau.
	 */
	onAddParticipant?: (() => void) | null
	/**
	 * Renseigné pour un APPEL DE GROUPE — et c'est ce qui bascule l'écran.
	 *
	 * ⚠️ Un appel de groupe n'est pas une réunion : il sonne, il se décroche,
	 * il se raccroche. Ce qui change, à N, c'est ce que la scène MONTRE — une
	 * grille au lieu d'un unique correspondant. C'était l'unique raison pour
	 * laquelle l'appel à plusieurs empruntait la façade iRéunion ; cette prop
	 * la retire.
	 */
	group?: CallGroupIdentity | null
	/**
	 * Les personnes CONVIÉES, avec leur état — pas les participants LiveKit.
	 *
	 * La différence est tout le sujet de la grille : quelqu'un qui n'a pas
	 * encore décroché n'est dans aucune salle, et une grille bâtie sur le SFU
	 * le ferait disparaître. On ne saurait pas s'il sonne, s'il a refusé, ou
	 * s'il n'a jamais été appelé.
	 */
	participants?: readonly CallParticipantView[]
	/**
	 * La conférence, pour un appel de groupe (ADR-0149) : plafond du compte,
	 * places restantes, et de quoi lancer la conférence. À `remaining === 0`,
	 * « Ajouter » disparaît des commandes ET de la grille, et la ligne T3 dit
	 * pourquoi — même pour un compte exempté (borne de structure).
	 */
	conference?: GroupCallConference | null
	/** Le viewport, pour la disposition de la grille. */
	viewport?: "mobile" | "desktop"
	/** Puces d'appels en attente, bandeau d'appel entrant… */
	children?: React.ReactNode
}

/** Le chrono, recalculé chaque seconde — et seulement quand il tourne. */
function useLiveElapsed(startedAt: number | null): string | null {
	const [, tick] = useState(0)
	useEffect(() => {
		if (startedAt === null) return
		const id = setInterval(() => tick((n) => n + 1), 1000)
		return () => clearInterval(id)
	}, [startedAt])
	if (startedAt === null) return null
	return formatElapsed(elapsedSince(startedAt, Date.now()))
}

/**
 * Ce que la SALLE apporte à l'écran — et ce qu'on affiche à sa place tant
 * qu'elle n'est pas là.
 *
 * ⚠️ Ce second cas n'a rien de théorique : c'est la PREMIÈRE SECONDE de tout
 * appel. `useCallSlotConnector` pose le slot dans le store SANS jeton — l'écran
 * doit s'ouvrir au doigt levé, pas au retour du réseau —, puis rejoint le
 * meeting, demande le jeton, et c'est seulement alors que le pool monte le
 * `<LiveKitRoom>` et publie la `Room` dans `callRoomRegistry`. Jusque-là, il
 * n'y a AUCUN `RoomContext` au-dessus de cet écran (`CallSurface` le documente
 * et le veut ainsi), et tout hook LiveKit qui l'exige — `useConnectionState`,
 * `useTracks`, `useLocalParticipant`… — lève « No room provided » EN PLEIN
 * RENDU. L'erreur n'était pas rattrapable : elle emportait l'application à
 * chaque appel lancé, si bien que l'écran « Connexion… » qu'on croyait rendre
 * ne s'est jamais affiché une seule fois.
 */
interface CallStageRoomState {
	connection: CallConnectionState
	/** Le correspondant est-il dans la salle ? */
	hasRemote: boolean
	quality: ConnectionQualityLevel
	remoteTrack: TrackReference | null
	remoteVideoState: RemoteVideoState
	localTrack: TrackReference | null
	/** MA clé dans ces cartes (mon `userId`, cf. `participant-identity.ts`) — où poser `localTrack`. */
	localIdentity: string | null
	/** Caméras détectées — décide de la commande « Retourner ». */
	videoInputs: number
	/**
	 * CE QUE REND LA COMMANDE « Sortie audio » — un plan, pas trois booléens.
	 *
	 * Décidé par `planSpeakerControl` (`audio-route.ts`, module pur) : sélecteur
	 * au bureau, bascule écouteur / haut-parleur sur les Android qui exposent
	 * deux sorties, et partout ailleurs une commande VISIBLE qui dit pourquoi
	 * elle ne route pas. L'écran n'a plus à recomposer cette décision à partir
	 * d'un nombre de périphériques et d'une capacité de navigateur — c'est
	 * ainsi qu'on obtenait un bouton qui ne faisait rien.
	 */
	speaker: SpeakerControlPlan
	flipCamera: () => void
	/** Écouteur ↔ haut-parleur (plan `toggle`). */
	toggleSpeaker: () => void
	/** Une sortie précise (plan `picker`). */
	selectSpeaker: (deviceId: string) => void
	/**
	 * Les pistes caméra INDEXÉES PAR PERSONNE — le `userId` porté par le jeton
	 * (`participant-identity.ts`), jamais l'identité LiveKit brute — ce que
	 * consomme la grille de groupe. `remoteTrack` ne sait désigner qu'UN
	 * correspondant : à cinq, il en montrerait un et tairait les quatre autres.
	 */
	tracksByIdentity: ReadonlyMap<string, TrackReference>
	/** Micros coupés, par identité — la vignette le dit. */
	mutedIdentities: ReadonlySet<string>
	/** Qui parle en ce moment — la vignette s'entoure. */
	speakingIdentities: ReadonlySet<string>
}

/**
 * Pas encore de salle. Aucune commande de média n'est proposée — elles
 * n'auraient rien à piloter, et un bouton mort se lit comme une panne.
 */
const WITHOUT_ROOM: CallStageRoomState = {
	connection: "connecting",
	hasRemote: false,
	quality: "unknown",
	remoteTrack: null,
	remoteVideoState: "none",
	localTrack: null,
	localIdentity: null,
	videoInputs: 0,
	speaker: { kind: "hidden" },
	flipCamera: () => {},
	toggleSpeaker: () => {},
	selectSpeaker: () => {},
	tracksByIdentity: new Map(),
	mutedIdentities: new Set(),
	speakingIdentities: new Set(),
}

/**
 * Le point d'entrée — il ne lit la salle que s'il y en a une.
 *
 * `useMaybeRoomContext` est le seul hook LiveKit appelable ici : il rend
 * `undefined` au lieu de lever. Les hooks qui EXIGENT la salle descendent donc
 * d'un cran, dans `CallStageInRoom`, monté seulement quand elle existe — un
 * simple `if` au milieu d'un composant n'aurait rien réglé, les hooks se
 * déclarant inconditionnellement.
 */
export function CallStage(props: CallStageProps) {
	const room = useMaybeRoomContext()
	if (!room) return <CallStageView {...props} room={WITHOUT_ROOM} />
	return <CallStageInRoom {...props} />
}

/** La salle est là : on en tire l'état vivant de l'appel. */
function CallStageInRoom(props: CallStageProps) {
	const connectionState = useConnectionState()
	const { localParticipant } = useLocalParticipant()
	const remoteParticipants = useRemoteParticipants()
	const quality = useConnectionQualityIndicator({ participant: localParticipant })
	const speaker = useSpeakerOutput()
	const camera = useCameraFlip()

	const cameraTracks = useTracks([Track.Source.Camera], { onlySubscribed: false })
	const { track: remoteTrack, state: remoteVideoState } = useMemo(
		() => pickRemoteCameraTrack(cameraTracks, localParticipant?.identity),
		[cameraTracks, localParticipant?.identity],
	)
	const localTrack = useMemo(
		() => pickLocalCameraTrack(cameraTracks, localParticipant?.identity),
		[cameraTracks, localParticipant?.identity],
	)

	/**
	 * MA clé dans les cartes de la grille.
	 *
	 * ⚠️ L'identité LiveKit n'est PAS mon `userId` : c'est `{subject}::{nonce}`,
	 * unique par CONNEXION (`convex/lib/livekitIdentity.ts`). La grille, elle,
	 * se construit sur les personnes conviées (`listParticipants`), clés
	 * `userId`. Comparer l'une à l'autre ne réussissait JAMAIS : ma vignette
	 * montrait mon avatar pendant que ma caméra tournait, et celles des autres
	 * restaient des initiales (capture du 2026-09-13, appel « Cyber & Digital »).
	 * Le jeton porte désormais le `userId` (`attributes`, repli `metadata`,
	 * cf. `participant-identity.ts`) ; à défaut — serveur LiveKit antérieur —,
	 * `listParticipants` me nomme (`isMe`), et la grille sait s'en servir.
	 */
	const participants = props.participants
	const localKey = useMemo<string | null>(() => {
		if (!localParticipant) return null
		const fromToken = participantUserId(localParticipant)
		if (fromToken !== null) return fromToken
		const mine = participants?.find((participant) => participant.isMe)
		if (mine !== undefined) return String(mine.userId)
		return localParticipant.identity.length > 0 ? localParticipant.identity : null
	}, [localParticipant, participants])

	/**
	 * Les pistes par PERSONNE — pour la grille de groupe.
	 *
	 * ⚠️ On n'y range QUE les pistes réellement exploitables (`classifyRemoteVideo`
	 * ≠ `off`/`none`) : une publication coupée ou non souscrite monterait un
	 * `<video>` sans flux — un cadre noir que l'usager lit comme une panne (cf.
	 * `remote-video.ts`). La clé est le `userId` porté par le jeton
	 * (`participantKey`), l'identité brute à défaut.
	 */
	const localLiveKitIdentity = localParticipant?.identity
	const tracksByIdentity = useMemo(() => {
		const map = new Map<string, TrackReference>()
		for (const candidate of cameraTracks) {
			const identity = candidate.participant.identity
			if (identity === undefined || identity === "") continue
			// ⚠️ MA piste n'entre pas dans cette carte (IC-10) : elle voyage par
			// `localTrack`, et la grille la place une seule fois, dans ma vignette.
			if (localLiveKitIdentity !== undefined && identity === localLiveKitIdentity) {
				continue
			}
			const state = classifyRemoteVideo(probeOf(candidate))
			if (state === "off" || state === "none") continue
			map.set(participantKey(candidate.participant), candidate)
		}
		return map
	}, [cameraTracks, localLiveKitIdentity])

	const mutedIdentities = useMemo(() => {
		const set = new Set<string>()
		for (const participant of remoteParticipants) {
			if (participant.isMicrophoneEnabled === false) set.add(participantKey(participant))
		}
		if (localParticipant?.isMicrophoneEnabled === false && localKey !== null) {
			set.add(localKey)
		}
		return set
	}, [remoteParticipants, localParticipant, localKey])

	const speakingIdentities = useMemo(() => {
		const set = new Set<string>()
		for (const participant of remoteParticipants) {
			if (participant.isSpeaking) set.add(participantKey(participant))
		}
		if (localParticipant?.isSpeaking === true && localKey !== null) {
			set.add(localKey)
		}
		return set
	}, [remoteParticipants, localParticipant, localKey])

	const room: CallStageRoomState = {
		connection:
			connectionState === ConnectionState.Connected
				? "connected"
				: connectionState === ConnectionState.Reconnecting
					? "reconnecting"
					: connectionState === ConnectionState.Disconnected
						? "disconnected"
						: "connecting",
		hasRemote: remoteParticipants.length > 0,
		quality: quality.quality ?? "unknown",
		remoteTrack,
		remoteVideoState,
		localTrack,
		localIdentity: localKey,
		tracksByIdentity,
		mutedIdentities,
		speakingIdentities,
		videoInputs: camera.deviceCount,
		speaker: speaker.plan,
		flipCamera: () => void camera.flip(),
		toggleSpeaker: () => void speaker.toggle(),
		selectSpeaker: (deviceId: string) => void speaker.select(deviceId),
	}

	return <CallStageView {...props} room={room} />
}

/** L'écran lui-même : il ne connaît de la salle que ce qu'on lui en passe. */
function CallStageView({
	peer,
	direction,
	meeting,
	isHeld = false,
	myUserId = null,
	hasError = false,
	establishedAt,
	errorMessage = null,
	micMuted,
	micBlocked = null,
	cameraEnabled,
	onToggleMic,
	onToggleCamera,
	onHangUp,
	onMinimize,
	onHold,
	onResume,
	onWrite,
	onAddParticipant,
	group = null,
	participants,
	conference = null,
	viewport = "desktop",
	children,
	room,
}: CallStageProps & { room: CallStageRoomState }) {
	const { t } = useTranslation("iappel")
	const [pipCorner, setPipCorner] = useState<PipCorner>("bottom-right")
	/**
	 * Le sélecteur de sortie audio est-il ouvert ? État LOCAL : il n'a de sens
	 * que tant que cet écran est monté, et le magasin ne porte que l'INTENTION
	 * (`audioRoute`), jamais la pose d'un panneau.
	 */
	const [speakerPickerOpen, setSpeakerPickerOpen] = useState(false)

	const { phase, timerStart, label } = deriveCallPhase(
		{
			direction,
			meeting,
			connection: room.connection,
			hasRemote: room.hasRemote,
			isHeld,
			hasError,
			myUserId,
			...(establishedAt === undefined ? {} : { establishedAt }),
		},
		t,
	)
	const timer = useLiveElapsed(timerStart)

	/**
	 * APPEL DE GROUPE : la scène devient une grille — et l'appel ne se met pas
	 * en attente (le serveur refuse `hold` sur un groupe).
	 *
	 * ⚠️ Déclaré AVANT les commandes : `availableCallControls` en a besoin
	 * pour retirer « En attente ».
	 */
	const isGroup = group !== null && group !== undefined

	// `isMobile` au sens de cette décision : « la bascule avant/arrière a-t-elle
	// un sens ? ». Deux caméras et plus, c'est un téléphone ou un poste équipé
	// — dans les deux cas, la commande sert.
	const controls = availableCallControls({
		phase,
		isMobile: room.videoInputs > 1,
		videoInputs: room.videoInputs,
		// ⚠️ La sortie audio est décidée par le PLAN, qui connaît la plateforme.
		// On le TRADUIT ici en entrée de la règle pure plutôt que de recompter
		// des périphériques : deux comptes pour une même question finissent par
		// diverger, et c'est précisément ainsi qu'un bouton mort apparaît.
		audioOutputs: room.speaker.kind === "hidden" ? 0 : 2,
		supportsSetSinkId: room.speaker.kind !== "hidden",
		isGroup,
	})

	/**
	 * Un casque débranché pendant que le sélecteur est ouvert fait tomber le
	 * plan à `hidden` : on referme l'état, sans quoi rebrancher le casque
	 * rouvrirait un panneau que personne n'a redemandé.
	 */
	const speakerKind = room.speaker.kind
	useEffect(() => {
		if (speakerKind !== "picker") setSpeakerPickerOpen(false)
	}, [speakerKind])

	const name = peerDisplayName(peer, undefined, t)
	// L'adresse de réseau (`@handle`) sous le nom, quand elle est connue.
	const subtitle = peerSubtitle(peer, "personnel")

	/**
	 * La grille de groupe s'affiche DÈS LE DÉPART, y compris quand personne
	 * n'a encore décroché — et c'est le point. Une grille bâtie sur les
	 * participants présents montrerait un écran vide pendant toute la
	 * sonnerie ; celle-ci montre les personnes CONVIÉES avec leur état
	 * (« Sonne… », « A refusé », « Indisponible »), ce qui est très exactement
	 * ce qu'on veut savoir en appelant cinq personnes d'un coup.
	 *
	 * Elle ne s'efface que sur un échec : la salle n'a alors jamais existé, et
	 * le bloc d'identité reste le seul endroit où la raison est lisible.
	 */
	const groupParticipants = useMemo(() => participants ?? [], [participants])
	const showGroupGrid =
		isGroup && phase !== "failed" && groupParticipants.length > 0

	// La MÊME projection que le panneau d'ajout et que le serveur (IC-03) :
	// l'en-tête, les places et la grille ne peuvent plus diverger.
	const groupSummary = useMemo(
		() => summarizeCallParticipants(groupParticipants),
		[groupParticipants],
	)
	const groupSubtitle = groupCallSubtitle(groupSummary, t)

	/**
	 * L'appel est PLEIN (ADR-0149) : « Ajouter » se retire des commandes et de
	 * la grille, où la ligne T3 prend sa place. Un siège qui se libère le fait
	 * revenir — `remaining` est relu du serveur à chaque départ. Une commande
	 * indisponible se MASQUE ; le serveur refuserait de toute façon le 12ᵉ.
	 */
	const callFull = conference?.remaining === 0
	const addParticipant =
		controls.addParticipant && onAddParticipant && !callFull ? onAddParticipant : null

	// Un appel échoué n'a RIEN à montrer sur une scène vidéo : la salle n'a
	// jamais existé. On garde le bloc d'identité — seul endroit où la raison
	// de l'échec est lisible.
	//
	// ⚠️ Une ATTENTE non plus, dans les deux sens. La vidéo distante montrerait
	// un correspondant qui ne m'entend plus (ou que je n'entends plus) comme
	// s'il était en conversation, et `LocalPip` affirmerait une caméra qui ne
	// publie plus rien. Le bloc d'identité dit ce qui se passe.
	const onHoldEitherWay = phase === "held" || phase === "peer_held"
	const showVideo =
		phase !== "failed" &&
		!onHoldEitherWay &&
		(room.remoteVideoState !== "none" || cameraEnabled)

	return (
		<div
			className={`flex h-full w-full flex-col overflow-hidden select-none ${
				// Une attente — la mienne ou la sienne — réchauffe le héros :
				// c'est le même moment de l'appel, vu des deux bouts.
				isHeld || phase === "peer_held"
					? "call-hero-dark-warm"
					: "call-hero-dark"
			}`}
			data-call-state={phase}
		>
			{/* En-tête : l'état, le chrono, et de quoi se retirer sans raccrocher. */}
			<div className="flex shrink-0 items-start justify-between gap-3 px-5 pt-4 pb-2">
				<span
					className="iappel-eyebrow flex items-center gap-2"
					style={{ color: "var(--esp-immersive-on-ink)", opacity: 0.75 }}
				>
					<span
						aria-hidden="true"
						className="h-1.5 w-1.5 rounded-full"
						style={{
							background:
								phase === "active"
									? "var(--success)"
									: // Une attente est une attente, quel que soit celui qui
										// l'a posée : même point, même lecture d'un coup d'œil.
										phase === "held" ||
											phase === "peer_held" ||
											phase === "reconnecting"
										? "var(--warning)"
										: "var(--primary)",
						}}
					/>
					{label}
					{/* L'appelé est DÉJÀ en communication : l'appelant l'entend (tonalité
					    « occupé ») et le LIT — il sait qu'il patiente, pas que ça sonne
					    dans le vide. Incise, jamais le label : celui-ci voyage aussi vers
					    la pilule et l'écran de refus « Occupé ». */}
					{direction === "outgoing" &&
						phase === "ringing" &&
						meeting?.calleeEngagedAtCreate === true && (
							<span style={{ opacity: 0.85, letterSpacing: "normal", textTransform: "none", fontWeight: 500 }}>
								· {t("callStage.busy")}
							</span>
						)}
					{/* Un appel de groupe DIT qu'il en est un, et à combien. Sans
					    cela, l'écran d'appel à cinq est indiscernable d'un
					    tête-à-tête tant que personne n'a décroché. */}
					{isGroup && groupSubtitle !== null && (
						<span style={{ opacity: 0.85, letterSpacing: "normal", textTransform: "none", fontWeight: 500 }}>
							· {groupSubtitle}
						</span>
					)}
				</span>
				<span className="flex items-center gap-3">
					<CallConnectionQuality level={room.quality} />
					{timer !== null && (
						<span
							className="iappel-count text-sm"
							style={{ color: "var(--esp-immersive-on-ink)", opacity: 0.85 }}
							aria-label={t("callStage.duration")}
						>
							{timer}
						</span>
					)}
					<button
						type="button"
						onClick={onMinimize}
						aria-label={t("callStage.minimize")}
						className="iappel-soft-action"
						style={{ minHeight: 36, paddingInline: 10 }}
					>
						<ChevronDown aria-hidden="true" className="h-4 w-4" />
					</button>
				</span>
			</div>

			{/* Bande des incrustations : appel en attente, puce « Prendre » d'un
			    second appel, appels parqués.

			    ⚠️ Elle est rendue ICI, en flux, AVANT le corps — et une seule
			    fois. Elle était dupliquée : une copie dans le bloc d'identité,
			    une autre DANS la scène vidéo. Or `.iappel-stage` est
			    `position: relative` et `.iappel-video` est `absolute inset: 0` :
			    en ordre de peinture CSS, un descendant positionné passe au-dessus
			    d'un descendant en flux, quel que soit l'ordre du DOM. En appel
			    vidéo, la puce « Prendre » était donc peinte SOUS la vidéo, qui
			    captait le clic — l'unique moyen de décrocher le second appel
			    était inatteignable. */}
			{children !== undefined && children !== null && children !== false && (
				<div className="iappel-stage-band">{children}</div>
			)}

			{/* Corps : la grille de groupe, la scène vidéo, ou l'identité du
			    correspondant. L'ordre des branches compte — un appel de groupe
			    ne retombe JAMAIS sur la scène 1:1, qui ne sait montrer qu'un
			    seul correspondant et tairait tous les autres. */}
			{showGroupGrid ? (
				/* ⚠️ AUCUN `LocalPip` ici (IC-10). Ma vignette porte déjà ma
				   caméra — `listParticipants` me compte parmi les conviés
				   (`isMe`) — et l'incrustation la répétait par-dessus la
				   grille. Le 1:1, lui, la garde : sa scène ne montre QUE le
				   correspondant. */
				<GroupCallGrid
					participants={groupParticipants}
					tracksByIdentity={room.tracksByIdentity}
					localTrack={cameraEnabled ? room.localTrack : null}
					localCameraPending={cameraEnabled && room.localTrack === null}
					localIdentity={room.localIdentity}
					mutedIdentities={room.mutedIdentities}
					speakingIdentities={room.speakingIdentities}
					viewport={viewport}
					onAdd={addParticipant}
					conference={conference}
				/>
			) : showVideo ? (
				<RemoteVideoStage
					trackRef={room.remoteTrack}
					state={room.remoteVideoState}
					peerName={name}
				>
					<div className="pointer-events-none absolute inset-x-3 top-3 flex flex-wrap gap-2">
						<span className="iappel-chip">{name}</span>
					</div>
					{room.localTrack && cameraEnabled && (
						<LocalPip
							trackRef={room.localTrack}
							corner={pipCorner}
							onMove={() => setPipCorner(nextPipCorner(pipCorner))}
						/>
					)}
				</RemoteVideoStage>
			) : isGroup ? (
				/* Appel de groupe dont la grille n'est pas encore chargée (la
				   première seconde, ou un échec de la query). On NE RETOMBE PAS
				   sur le bloc 1:1 : celui-ci nomme un correspondant unique, et
				   il n'y en a pas — l'écran afficherait « Appeler » et une
				   initiale creuse, exactement le défaut constaté en production
				   le 2026-08-22 sur `calleeName`. */
				<div className="flex min-h-0 flex-1 flex-col items-center justify-center-safe gap-4 overflow-y-auto overscroll-contain px-6 py-2">
					<div
						className={phase === "ringing" ? "av-ring" : undefined}
						style={phase === "ringing" ? { color: "var(--primary)" } : undefined}
					>
						<span className="iappel-group-emblem" aria-hidden="true">
							<Users className="h-9 w-9" />
						</span>
					</div>
					<div className="flex flex-col items-center gap-1 text-center">
						<span className="iappel-eyebrow" style={{ color: "var(--esp-immersive-on-ink)", opacity: 0.7 }}>
							{t("callStage.groupCall")}
						</span>
						<h1
							className="text-[20px] leading-tight font-semibold text-pretty"
							style={{ color: "var(--esp-immersive-on-ink)", fontFamily: "var(--esp-heading-font-family, inherit)", fontSize: "var(--esp-page-title-size, 20px)", fontWeight: "var(--esp-heading-font-weight, 600)", lineHeight: "var(--esp-page-title-leading, 1.25)", letterSpacing: "var(--esp-page-title-tracking, normal)" }}
						>
							{group.title}
						</h1>
						<p
							className="iappel-count text-[13px]"
							style={{ color: "var(--esp-immersive-on-ink)", opacity: 0.65 }}
						>
							{t("callStage.participants", { count: group.memberCount })}
						</p>
					</div>
					{phase === "failed" && errorMessage && (
						<p
							role="status"
							className="max-w-[34ch] text-center text-[14px] text-balance"
							style={{ color: "var(--esp-immersive-on-ink)", opacity: 0.8 }}
						>
							{errorMessage}
						</p>
					)}
				</div>
			) : (
				// `justify-center-safe` + défilement : sur un écran bas (téléphone
				// couché, volet réduit), la scène CENTRÉE débordait par le haut sur
				// l'en-tête et par le bas sur les commandes — la ligne d'état
				// recouvrait les boutons (recette du 22/09). Le centrage « sûr »
				// retombe en haut quand ça ne tient pas, et la zone défile.
				<div className="flex min-h-0 flex-1 flex-col items-center justify-center-safe gap-4 overflow-y-auto overscroll-contain px-6 py-2">
					{/* Même encre que l'anneau de la carte d'appel entrant : c'est
					    le même signal, il ne doit pas changer de couleur selon
					    qu'on appelle ou qu'on est appelé. */}
					<div
						className={phase === "ringing" ? "av-ring" : undefined}
						style={phase === "ringing" ? { color: "var(--primary)" } : undefined}
					>
						<Avatar
							displayName={name}
							avatarUrl={peer?.avatarUrl}
							// L'attente du correspondant garde la taille d'une
							// conversation : l'appel n'a pas changé de nature, il
							// s'est suspendu. Le grand format reste celui des
							// moments où l'on attend un décrochage.
							size={phase === "active" || phase === "peer_held" ? 108 : 128}
						/>
					</div>

					<div className="flex flex-col items-center gap-1 text-center">
						<h1
							className="text-[17px] leading-tight font-medium text-pretty"
							style={{ color: "var(--esp-immersive-on-ink)", opacity: 0.85, fontFamily: "var(--esp-heading-font-family, inherit)", fontSize: "var(--esp-page-title-size, 17px)", fontWeight: "var(--esp-heading-font-weight, 500)", lineHeight: "var(--esp-page-title-leading, 1.25)", letterSpacing: "var(--esp-page-title-tracking, normal)" }}
						>
							{name}
						</h1>
						{subtitle && (
							<p
								className="text-[14px]"
								style={{ color: "var(--esp-immersive-on-ink)", opacity: 0.65 }}
							>
								{subtitle}
							</p>
						)}
					</div>

					{/* L'attente, DITE — des deux côtés, et dans les deux sens.

					    « En attente » seul ne dit pas ce qui se passe pour
					    l'autre : celui qui parque croit souvent que son
					    correspondant l'entend encore, et celui qu'on parque
					    lit un silence qu'il prend pour une ligne coupée.
					    `aria-live="polite"` parce que l'état CHANGE sous les
					    yeux d'un lecteur d'écran déjà posé sur la page. */}
					{phase === "held" && (
						<p
							role="status"
							aria-live="polite"
							className="max-w-[34ch] text-center text-[14px] text-balance"
							style={{ color: "var(--esp-immersive-on-ink)", opacity: 0.8 }}
						>
							{t("callStage.heldByMe")}
						</p>
					)}
					{phase === "peer_held" && (
						<p
							role="status"
							aria-live="polite"
							className="max-w-[34ch] text-center text-[14px] text-balance"
							style={{ color: "var(--esp-immersive-on-ink)", opacity: 0.8 }}
						>
							{t("callStage.heldByPeer")}
						</p>
					)}

					{/* ÉCOUTE SEULE, DITE (recette du 22/09) : le micro n'a pas
					    démarré, l'appel continue. Sans cette ligne, on parle
					    dans le vide en se croyant entendu. */}
					{micBlocked !== null &&
						(phase === "active" ||
							phase === "peer_held" ||
							phase === "reconnecting") && (
							<p
								role="status"
								aria-live="polite"
								className="max-w-[34ch] text-center text-[14px] text-balance"
								style={{ color: "var(--esp-immersive-on-ink)", opacity: 0.8 }}
							>
								{t("callStage.micBlocked")}
							</p>
						)}

					{/* La raison de l'échec, DITE. « Connexion impossible » seul
					    accuse le réseau ; quand c'est le navigateur qui a refusé
					    le micro, l'usager cherche la panne là où elle n'est pas et
					    la seule action qui débloque reste tue. */}
					{phase === "failed" && errorMessage && (
						<p
							role="status"
							className="max-w-[34ch] text-center text-[14px] text-balance"
							style={{ color: "var(--esp-immersive-on-ink)", opacity: 0.8 }}
						>
							{errorMessage}
						</p>
					)}
				</div>
			)}

			{/* Commandes. LES DEUX CÔTÉS D'UN APPEL VOIENT LA MÊME RANGÉE
			    (recette du 22/09 : « il y a un côté qui n'a pas tous les
			    boutons »). Une commande qui ne peut pas agir reste à sa place,
			    atténuée, et dit pourquoi — jamais un bouton muet, jamais un
			    trou. Seule se masque une commande sans objet sur l'appareil
			    (« Retourner » sans seconde caméra). */}
			<div className="flex shrink-0 flex-wrap items-start justify-center gap-3 px-4 pt-3 pb-[max(1.5rem,env(safe-area-inset-bottom))]">
				{controls.mic && (
					<CallControlButton
						icon={micMuted ? MicOff : Mic}
						label={
							micBlocked !== null
								? t("callStage.micBlockedLabel")
								: micMuted
									? t("callStage.muted")
									: t("callStage.mic")
						}
						onClick={onToggleMic}
						active={micMuted}
						blockedReason={micBlocked ?? undefined}
					/>
				)}
				{controls.camera && (
					<CallControlButton
						icon={cameraEnabled ? Camera : CameraOff}
						label={cameraEnabled ? t("callStage.camera") : t("callStage.cameraOff")}
						onClick={onToggleCamera}
						active={cameraEnabled}
					/>
				)}
				{controls.flip && cameraEnabled && (
					<CallControlButton
						icon={SwitchCamera}
						label={t("callStage.flip")}
						onClick={room.flipCamera}
					/>
				)}
				{/* SORTIE AUDIO — trois rendus, un seul plan (`audio-route.ts`).
				    Le défaut constaté le 22/09 : un bouton unique qui cyclait des
				    périphériques, absent du téléphone et sans aucun état visuel.
				    Désormais : un vrai sélecteur au bureau, une vraie bascule là
				    où deux sorties existent, et ailleurs une commande qui DIT
				    pourquoi elle ne route pas — jamais un bouton muet. */}
				{controls.speaker && room.speaker.kind === "picker" && (
					<CallControlButton
						icon={Volume2}
						// JAMAIS le nom du périphérique ici : « Par défaut - Haut-parleurs
						// MacBook Air (Built-in) » sous un rond de 56 px élargissait la
						// colonne à 330 px et décalait toute la rangée (vu le 22/09). Le
						// périphérique actif se lit dans le sélecteur, coché.
						label={speakerButtonLabel(room.speaker, t)}
						onClick={() => setSpeakerPickerOpen((open) => !open)}
						active={speakerPickerOpen}
					/>
				)}
				{controls.speaker && room.speaker.kind === "toggle" && (
					<CallControlButton
						icon={room.speaker.onSpeaker ? Volume2 : Volume1}
						label={speakerButtonLabel(room.speaker, t)}
						onClick={room.toggleSpeaker}
						active={room.speaker.onSpeaker}
					/>
				)}
				{controls.speaker && room.speaker.kind === "unavailable" && (
					<CallControlButton
						icon={Volume2}
						label={speakerButtonLabel(room.speaker, t)}
						unavailableReason={room.speaker.reason}
					/>
				)}
				{/* ⚠️ `controls.hold` était calculé depuis toujours et lu NULLE
				    PART, et rien n'existait pour reprendre : un appel mis en
				    attente — même le seul de la ligne — n'avait aucune sortie à
				    l'écran. On pouvait parquer, jamais revenir. */}
				{/* Ajouter une personne (ADR-0099) — l'escalade 1:1 → groupe vit
				    ENFIN sur la surface que tout le monde voit, pas seulement
				    dans la file d'organisation et à la voix. */}
				{addParticipant !== null && (
					<CallControlButton
						icon={UserPlus}
						label={t("callStage.add")}
						onClick={addParticipant}
					/>
				)}
				{controls.hold && onHold && (
					<CallControlButton icon={PauseCircle} label={t("callStage.hold")} onClick={onHold} />
				)}
				{controls.resume && onResume && (
					<CallControlButton
						icon={PlayCircle}
						label={t("callStage.resume")}
						onClick={onResume}
						active
					/>
				)}
				{onWrite && (
					<CallControlButton icon={MessageSquare} label={t("callStage.write")} onClick={onWrite} tone="message" />
				)}
				<CallControlButton
					icon={PhoneOff}
					label={t("callStage.hangUp")}
					onClick={onHangUp}
					tone="hangup"
					size="lg"
				/>
			</div>

			{/* Le sélecteur de sortie, ancré sur la surface d'appel (son plus
			    proche ancêtre positionné : la fenêtre de bureau ou le corps de la
			    carte iCom) — jamais au coin du navigateur, jamais dans un portail
			    vers `<body>` : réduire ou déplacer l'appel emmène le panneau avec
			    lui (ADR-0148). Rendu APRÈS la scène, donc au-dessus d'elle. */}
			{speakerPickerOpen && room.speaker.kind === "picker" && (
				<SpeakerPickerPanel
					options={room.speaker.options}
					onSelect={room.selectSpeaker}
					onClose={() => setSpeakerPickerOpen(false)}
				/>
			)}
		</div>
	)
}
