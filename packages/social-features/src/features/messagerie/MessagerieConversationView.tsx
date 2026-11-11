// Dupliqué de socle/packages/agent-features/src/features/messagerie/MessagerieConversationView.tsx @ ad2e7fdc2 — adaptations : iDocument retiré (dialogues « Joindre depuis » et « Enregistrer dans », `idocument.importSettings`, coffre `vaultOrgId`, `canSaveToVault`, pièces du coffre) ; espace de poste retiré (`useOptionalOrg`, `scopeCommunication`, fonction au-dessus du titre `postEyebrow`, `poste.positionTitle`, `orgName`, phrase « échanges de poste… », renvoi au secrétariat) ; fonctions du moteur, réseau courant passé à chacune (`useNetwork().networkId`) : 1:1 sur `messaging.{messages,typing,pins,reactions}.*`, groupe sur `groups.{threads,messages,typing}.*`, brouillon sur `messaging.inbox.startThreadWithHandle`, destinataire sur `people.profile.getPublicProfile`, appel 1:1 par la source (`useStartCall` : la personne ET son identifiant public, refus à code normalisé, sans renvoi de secrétariat), appel de groupe sur `calls.groupCalls.startFromThread` (personnes choisies par `personIds`), transfert par les références typées `messaging.forward.*` ; plafond d'appel CONSTANT (`GROUP_CALL_MAX_PARTICIPANTS`, aucun compte exempté : `threadCallCapacity` retirée) ; membres du groupe lus à la demande (`groups.threads.paginateGroupMembers`, la fiche ne les porte plus) ; « écrit… » interrogé avec un instant arrondi rafraîchi par pas (`listTyping`/`listGroupTyping` prennent `now`) ; DTO du moteur (personnes nommées par `counterpartLabel`, pièces retenues par la garde des fichiers, `isMine`) et MON identifiant lu au réseau (`useNetwork().personId`) ; droit d'épingle de groupe par la règle du domaine (`isGroupThreadManager`) ; libellés traduits (espace de noms `messagerie`, clés `messagerieConversationView.*`), refus par code (`messageErreurLisible(err, t)`), dates par la langue courante ; PA6 : écritures 1:1/groupe, dépôts, épingles et transferts délégués à `source.useMessageWrites()` (arguments sans réseau ; la source injecte le réseau courant), appels et lectures conservés ; correctif (16/10, constat de DIASPORALE) : un brouillon vers une personne avec qui un fil existe déjà ouvre CE fil et son historique (`useOpenExistingThreadForDraft`, `messaging.inbox.findThreadWithHandle`) au lieu d'une conversation vide. ; P18b (A04) : arrivées annoncées par une région polie persistante (`conversation-arrivals.ts`, ni ouverture, ni historique, ni mes messages ; texte seulement quand le fil suit le bas, sinon le décompte de la pastille) et fil exposé en région nommée par le titre de la conversation.
"use client"

import { useViewerTimeZone } from "@antsia/api/viewer-preferences"

/**
 * MessagerieConversationView — UNE conversation, dans la carte OU sur la page.
 *
 * Un seul composant pour les TROIS genres de fil (1:1, brouillon, groupe) et
 * les deux poses. Ce n'est pas une économie de lignes : c'est la seule façon
 * qu'une bulle, une pièce jointe, une réaction ou une citation se rendent
 * IDENTIQUEMENT partout. Deux rendus séparés divergent au premier ajustement,
 * et la divergence ne se voit que sur l'appareil qu'on n'a pas sous la main.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * CE QUI DÉCIDE, ET OÙ
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Rien ici. Le composant tient les requêtes, les mutations et le DOM ; tout ce
 * qui se juge vit dans des modules purs, testés :
 *  · salves, séparateurs de jour, corps d'une bulle → `messagerie-bulles.ts` ;
 *  · suivi du bas, pastille de retard            → `conversation-scroll.ts` ;
 *  · actions d'une bulle                          → `message-actions.ts` ;
 *  · boutons d'appel                              → `call-actions.ts` ;
 *  · admission d'une pièce, mode du composeur     → `messagerie-composer.ts`.
 *
 * ⚠️ Le texte en cours de frappe vit dans le STORE (`drafts`), jamais dans un
 * `useState` local — c'est l'invariant du dock, et il vaut d'autant plus sur
 * la page : quitter la conversation démonte le composant, et un état local
 * emporterait la frappe avec lui.
 *
 * ⚠️ Le PREMIER message d'un brouillon ne vide le composeur qu'APRÈS le retour
 * du serveur. Un refus (profil dépublié, blocage) emporterait sinon le texte
 * sans que rien ne l'ait envoyé. Sur un fil existant, à l'inverse, on vide
	 * le texte reste aussi disponible jusqu'à l'admission : une intention
	 * locale montre l'aller-retour et un refus conserve texte, citation et pièces.
 *
 * ⚠️ Aucune surface flottante en `position: fixed` ici : la carte vit sous
 * `.rp-scope` (`container-type: inline-size`, donc `contain: layout`), où tout
 * élément fixe se fait cadrer par la grille du fil au lieu du viewport. La
 * pastille de retard est `absolute` dans un parent `relative` ; la feuille
 * d'actions passe par le portail de Radix.
 *
 * ⚠️ Chaque fonction du moteur reçoit le RÉSEAU courant (`networkId`) : une
 * conversation n'existe que dans un réseau, et le serveur refuse du même mot
 * un fil d'ailleurs et un fil inventé.
 */

import { api, type Id } from "@antsia/api/engine"
import {
	useAuthenticatedConvexQuery,
	useConvexMutationQuery,
} from "@antsia/api/hooks"
import { useNetwork } from "@antsia/api/network"
import { REPLY_EXCERPT_MAX_LENGTH } from "@antsia/social-contracts/attachments"
import { GROUP_CALL_MAX_PARTICIPANTS } from "@antsia/social-contracts/callGroup"
import type { MessageReactionKind } from "@antsia/social-contracts/messageReactions"
import { isGroupThreadManager } from "@antsia/social-domain/groupThreads"
import { useVisualViewport } from "@antsia/ui/overlay"
import { useConvexAuth, usePaginatedQuery } from "convex/react"
import type { FunctionReturnType } from "convex/server"
import { History } from "lucide-react"
import {
	useCallback,
	useEffect,
	useLayoutEffect,
	useMemo,
	useRef,
	useState,
} from "react"
import { useTranslation } from "react-i18next"
import { toast } from "sonner"
import { useCallStore } from "../../stores/call-store"
import { refusalEndKind } from "../iappel/call-phase"
import type { CallPeerIdentity } from "../iappel/call-types"
import { ConferenceHintCard } from "../iappel/ConferenceHintCard"
import { conferenceHintCopy, planConferenceHint } from "../iappel/conference-hint"
import { effectiveCapacity } from "../iappel/group-call-capacity"
import { PresenceDot, useConnectionsPresence } from "../iappel/presence-dot"
import { useConferenceLaunchAvailable, useLaunchConference } from "../iappel/use-launch-conference"
import { Avatar } from "../reseau-personnel/Avatar"
import { ConversationHeader } from "./ConversationHeader"
import { GroupeAvatar } from "./GroupeAvatar"
import { arrivalAnnouncement } from "./conversation-arrivals"
import {
	croissanceDuFil,
	initialScrollState,
	isNearBottom,
	reduceOnMessages,
	type CroissanceDuFil,
} from "./conversation-scroll"
import { dockStore, useDockState } from "./dock-store"
import { ForwardMessageSheet } from "./ForwardMessageSheet"
import { ReportTargetDialog } from "../reseau-personnel/ReportTarget"
import type { ReportTarget } from "../reseau-personnel/report-target"
import type { ForwardTargetRow } from "./forward-targets"
import type { MessageActionId } from "./message-actions"
import type { MessageAttachmentData } from "./MessageAttachment"
import { MessageBubble, type BubbleMessage } from "./MessageBubble"
import { PinnedMessageBanner } from "./PinnedMessageBanner"
import { forwardTargetArg } from "./transfert-api"
import {
	MessageComposer,
	type ComposerMediaDraft,
	type UploadedAttachment,
} from "./MessageComposer"
import { groupMessages } from "./messagerie-bulles"
import { draftMediaFor, parseKey, type ConversationKey } from "./messagerie-dock"
import { mediaFile } from "./messagerie-media-draft"
import { messageErreurLisible } from "./messagerie-erreur"
import { useOpenExistingThreadForDraft } from "./use-draft-existing-thread"
import { ligneSystemeDeGroupe, membreDuGroupe, nomAffichable } from "./groupe-gestion"
import { GroupCallInviteePicker } from "./GroupCallInviteePicker"
import { needsInviteeSelection } from "./groupe-appel-selection"
import { MessagerieGroupeInfos } from "./MessagerieGroupeInfos"
import { MessagerieStyles } from "./messagerie-styles"
import { shouldPingTyping } from "./messagerie-typing"
import {
	SOURCE_AGENT,
	type MessagerieSource,
	type MessagerieThread,
} from "./messagerie-source"
import {
	isCompactPose,
	type MessagerieNav,
	type MessagerieVariant,
} from "./messagerie-views"
import { NewMessagesPill } from "./NewMessagesPill"
import type { ReplyPreviewData } from "./ReplyPreview"
import { OutboxMessages } from "./OutboxMessages"
import { outboxStore, useOutbox } from "./messagerie-outbox"
import { useConversationSend } from "./use-conversation-send"
import { AbandonedMessageSend } from "./messagerie-send-intent"

/** Une pièce jointe telle que le moteur la sert (`AttachmentDto`). */
type PieceDuMoteur = FunctionReturnType<
	typeof api.modules.messaging.messages.paginateMessages
>["page"][number]["attachmentFiles"][number]

/** Quelqu'un qui écrit, tel que `listTyping` / `listGroupTyping` le rendent. */
type Ecrivant = FunctionReturnType<
	typeof api.modules.messaging.typing.listTyping
>[number]

/**
 * Une page de messages de groupe — le même nombre que rendait la lecture non
 * paginée. Ce n'était pas la borne qui était mauvaise, c'était l'absence de
 * suite.
 */
const GROUP_MESSAGES_PAGE = 50
const DIRECT_MESSAGES_PAGE = 50
/**
 * P18b (A04) : une espace insécable ajoutée à une annonce IDENTIQUE à la
 * précédente — sans elle, la région vivante ne la relirait pas.
 */
const REPEAT_MARK = String.fromCharCode(0xa0)
/** Une page de membres — le plafond de page du serveur (`groups.threads`). */
const GROUP_MEMBERS_PAGE = 50

/**
 * Le pas de l'instant passé à « écrit… » (`listTyping` prend `now` : une query
 * ne lit pas l'horloge). Un signal vit six secondes et se rejoue toutes les
 * deux et demie : arrondi à deux secondes, un signal périmé s'éteint au plus
 * deux secondes après sa fin, et la souscription ne se refait qu'à chaque pas
 * — jamais à chaque rendu.
 */
const TYPING_NOW_STEP_MS = 2_000

function instantArrondi(stepMs: number): number {
	return Math.floor(Date.now() / stepMs) * stepMs
}

/**
 * L'instant arrondi, rafraîchi par pas TANT QUE `actif`. À l'arrêt, il garde
 * sa dernière valeur : un nouveau signal porte une échéance FUTURE, il passe
 * donc le filtre d'un instant ancien et s'affiche aussitôt — la mise à jour
 * réactive suffit ; seule l'EXTINCTION d'un signal a besoin de l'horloge.
 */
function useInstantArrondi(stepMs: number, actif: boolean): number {
	const [now, setNow] = useState(() => instantArrondi(stepMs))
	useEffect(() => {
		if (!actif) return
		setNow(instantArrondi(stepMs))
		const minuterie = window.setInterval(() => setNow(instantArrondi(stepMs)), stepMs)
		return () => window.clearInterval(minuterie)
	}, [stepMs, actif])
	return now
}

/** Une pièce du moteur, telle que la bulle la rend. */
function pieceDeBulle(piece: PieceDuMoteur): MessageAttachmentData {
	return {
		filename: piece.filename,
		mimeType: piece.mimeType,
		sizeBytes: piece.sizeBytes,
		durationMs: piece.durationMs,
		url: piece.url,
		withheld: piece.withheld,
	}
}

export interface MessagerieConversationViewProps {
	conversationKey: ConversationKey
	variant: MessagerieVariant
	nav: MessagerieNav
	/** La carte est-elle dépliée ? Toujours vrai sur la page. */
	open?: boolean
	/** Le texte en cours de frappe, porté par le store. */
	draft: string
	/** Ouvrir le profil du correspondant — la page seule le propose. */
	onOpenProfile?: (handle: string) => void
	/** Replier la carte — le dock, et lui seul (cf. `MessagerieComposeView`). */
	onToggleOpen?: () => void
	/**
	 * Le panneau d'informations du GROUPE est-il ouvert ?
	 *
	 * ⚠️ Injecté, jamais lu ici. Le panneau s'adresse par `?infos=1`, donc par
	 * le ROUTEUR — et `useSearchParams` monté dans cette vue s'appliquerait
	 * AUSSI au dock, qui vit sur des pages quelconques et n'a pas de frontière
	 * Suspense à lui. Même doctrine que `nav` : on injecte le geste.
	 */
	infosOpen?: boolean
	onOpenInfos?: () => void
	onCloseInfos?: () => void
	/** Le groupe n'est plus à nous (départ, suppression) : quitter l'écran. */
	onLeftGroup?: () => void
	/**
	 * D'OÙ viennent les fils de la boîte (liste, accès direct, groupes). Par
	 * défaut, la boîte personnelle du réseau courant.
	 */
	source?: MessagerieSource
}

export function MessagerieConversationView(props: MessagerieConversationViewProps) {
	const { networkId, personId } = useNetwork()
	const { isAuthenticated } = useConvexAuth()
	// Changer de lecteur, de conversation ou perdre la session invalide les
	// promesses du composeur précédent, avant tout effet sur les brouillons.
	return <ConversationContent key={`${networkId}:${personId}:${props.conversationKey}:${isAuthenticated}`} {...props} />
}

function ConversationContent({
	conversationKey,
	variant,
	nav,
	open = true,
	draft,
	onOpenProfile,
	onToggleOpen,
	infosOpen = false,
	onOpenInfos,
	onCloseInfos,
	onLeftGroup,
	source = SOURCE_AGENT,
}: MessagerieConversationViewProps) {
	const { t, i18n } = useTranslation("messagerie")
	const timeZone = useViewerTimeZone()
	/**
	 * Le réseau de TOUTES les fonctions de cette vue, et MOI dans ce réseau :
	 * le serveur marque mes messages, mais savoir qui je suis sans attendre le
	 * premier d'entre eux évite qu'un fil s'affiche une seconde tout à gauche.
	 */
	const { networkId, personId: moi, navigation } = useNetwork()
	const sendOwner = JSON.stringify([networkId, moi, source.espace])
	const latestDraft = useRef(draft)
	latestDraft.current = draft
	// Présence du correspondant 1:1 — même pastille que la liste des relations.
	const { presenceOf: presenceOfConnection } = useConnectionsPresence()
	const parsed = parseKey(conversationKey)
	const kind = parsed?.kind ?? "chat"
	const chatId = parsed?.kind === "chat" ? parsed.chatId : null
	const handle = parsed?.kind === "draft" ? parsed.handle : null
	// Un brouillon vers une personne avec qui un fil existe déjà ouvre CE fil (son historique).
	const [draftSendStarted, setDraftSendStarted] = useState(false)
	// Dès le premier envoi, l'admission prend la main : une query réactive
	// ne doit pas promouvoir le brouillon avant le nettoyage des pièces.
	useOpenExistingThreadForDraft(draftSendStarted ? null : handle, variant)
	const threadId = parsed?.kind === "groupe" ? parsed.threadId : null
	const filId = chatId as Id<"personalThreads"> | null
	const groupeId = threadId as Id<"groupThreads"> | null

	const bodyRef = useRef<HTMLDivElement>(null)
	const lastPingRef = useRef<number | null>(null)
	const previousCountRef = useRef<number>(0)
	/** Le dernier message CONNU — ce qui distingue une arrivée d'un ancien. */
	const dernierIdRef = useRef<string | null>(null)
	/** La distance au bas AVANT insertion — l'ancre d'un chargement d'anciens. */
	const hauteurAvantRef = useRef<number>(0)
	const [erreur, setErreur] = useState<string | null>(null)
	/**
	 * L'écran « qui appeler » est-il ouvert (IC-08) ?
	 *
	 * Il REMPLACE la conversation, comme la fiche du groupe : on ne compose pas
	 * un appel dans une modale posée sur un fil qui continue de défiler.
	 */
	const [choisirQuiAppeler, setChoisirQuiAppeler] = useState(false)
	/**
	 * La carte Conférence T1 est-elle ouverte (ADR-0149, fiche §6.2) ?
	 *
	 * Elle REMPLACE la conversation comme le sélecteur. Fermée, elle ANNULE le
	 * geste — rien n'est retenu : un nouveau clic sur « Appeler » la remontre.
	 * C'est la PORTE d'un fil plus grand qu'un appel, pas un avis qu'on chasse
	 * une fois pour toutes.
	 */
	const [conferenceAvantAppel, setConferenceAvantAppel] = useState(false)
	const [reply, setReply] = useState<ReplyPreviewData | null>(null)
	/**
	 * Le message qu'on MODIFIE (IC-13). Son texte vit dans le composeur, pas
	 * ici : le brouillon en cours de frappe ne doit pas être écrasé par la
	 * correction, ni perdu quand on y renonce.
	 */
	const [editing, setEditing] = useState<{
		messageId: string
		initialText: string
	} | null>(null)
	const [scroll, setScroll] = useState(initialScrollState)

	// La hauteur VISIBLE (clavier compris) n'est publiée par personne sur une
	// page ordinaire — `ImmersiveOverlay` le fait pour les surfaces qu'il porte,
	// et la conversation n'en est pas une. Sans ce hook, `var(--vv-height)` est
	// absente et le composeur repasse derrière le clavier iOS.
	useVisualViewport()

	// ── 1:1 ───────────────────────────────────────────────────────────────
	const threads = source.useThreads()
	const filDeLaListe = (threads.data ?? []).find(
		(fil: MessagerieThread) => String(fil.threadId) === chatId,
	)
	/**
	 * ACCÈS DIRECT AU FIL (IC-06). La liste de la source est une FENÊTRE, pas
	 * la boîte : une conversation plus ancienne que les trente dernières —
	 * ouverte par un lien profond, une notification ou une recherche — n'y
	 * figure pas, et l'écran répondait « n'appartient pas » sur un fil
	 * parfaitement légitime. On demande alors CE fil au serveur, qui seul sait
	 * s'il est de ma boîte, dans ce réseau.
	 *
	 * ⚠️ La query n'est armée que quand la liste est arrivée ET ne le porte
	 * pas : la lire d'office doublerait une lecture déjà faite pour les
	 * conversations récentes, qui sont l'écrasante majorité des ouvertures.
	 */
	const filManquant =
		kind === "chat" && threads.data !== undefined && filDeLaListe === undefined
	const filDirect = source.useThreadById(filManquant ? chatId : null)
	const thread: MessagerieThread | undefined =
		filDeLaListe ?? filDirect.data ?? undefined
	/**
	 * Un fil qui n'est PAS dans ma boîte de ce réseau ne s'ouvre pas ici — un
	 * lien profond vers un fil d'un autre réseau, d'autrui, archivé, ou avec un
	 * correspondant bloqué : c'est le SERVEUR qui le refuse (`getThread` rend
	 * `null`), et les messages ne sont même pas demandés. L'écran ne le DIT
	 * qu'après un court délai : un fil qui vient de naître met un instant à se
	 * propager.
	 */
	const filHorsReseau = filManquant && filDirect.data === null
	const [horsReseauConfirme, setHorsReseauConfirme] = useState(false)
	useEffect(() => {
		if (!filHorsReseau) {
			setHorsReseauConfirme(false)
			return
		}
		const timer = window.setTimeout(() => setHorsReseauConfirme(true), 700)
		return () => window.clearTimeout(timer)
	}, [filHorsReseau])
	/** La personne en face, dans un fil 1:1 — `null` tant que le fil n'est pas là. */
	const correspondantId =
		thread === undefined ? null : String(thread.counterpart.personId)

	const destinataire = useAuthenticatedConvexQuery(
		api.modules.people.profile.getPublicProfile,
		handle === null ? "skip" : { networkId, handle },
	)
	const { isAuthenticated } = useConvexAuth()
	const sending = useConversationSend(sendOwner, conversationKey, isAuthenticated)
	const outbox = useOutbox(sendOwner, conversationKey)
	const directPagination = usePaginatedQuery(
		api.modules.messaging.messages.paginateMessages,
		filId === null || !isAuthenticated || filHorsReseau
			? "skip"
			: { networkId, threadId: filId },
		{ initialNumItems: DIRECT_MESSAGES_PAGE },
	)
	const messagesDirects = useMemo(
		() =>
			[...directPagination.results].sort((a, b) =>
				a.createdAt !== b.createdAt
					? a.createdAt - b.createdAt
					: String(a.messageId) < String(b.messageId)
						? -1
						: 1,
			),
		[directPagination.results],
	)

	// ── Groupe ────────────────────────────────────────────────────────────
	const groupe = useAuthenticatedConvexQuery(
		api.modules.groups.threads.getGroupThread,
		groupeId === null ? "skip" : { networkId, threadId: groupeId },
	)
	/**
	 * Le plafond de CE fil (IC-08) : celui du moteur, le même pour tout le
	 * monde. Aucun compte n'y échappe — le socle exemptait ses comptes
	 * d'administration (`threadCallCapacity`), le réseau n'en a pas. Le serveur
	 * (`startFromThread`) tient la même borne : l'écran n'affirme pas autre
	 * chose que lui.
	 */
	const plafondAppel = GROUP_CALL_MAX_PARTICIPANTS
	/**
	 * ⚠️ Les messages du groupe se PAGINENT, et c'est un correctif, pas un
	 * confort : une lecture bornée sans suite laissait le cinquante-et-unième
	 * message en partant de la fin INATTEIGNABLE.
	 *
	 * ⚠️ `usePaginatedQuery` vient de `convex/react` et ne connaît pas la garde
	 * d'authentification de `useAuthenticatedConvexQuery` : on la refait ici,
	 * sans quoi la requête part avant la session et se fait refuser.
	 *
	 * ⚠️ Le TRI est client. Les pages arrivent du plus récent au plus ancien,
	 * et s'empilent de la plus RÉCENTE à la plus ancienne : la simple
	 * concaténation ne donnerait pas l'ordre du fil. Trier l'accumulation
	 * entière est ce qui le remet dans l'ordre, quel que soit l'ordre
	 * d'arrivée des pages.
	 */
	const groupPagination = usePaginatedQuery(
		api.modules.groups.messages.paginateGroupMessages,
		groupeId === null || !isAuthenticated
			? "skip"
			: { networkId, threadId: groupeId },
		{ initialNumItems: GROUP_MESSAGES_PAGE },
	)
	const messagesDuGroupe = useMemo(
		() =>
			[...groupPagination.results].sort((a, b) =>
				a.createdAt !== b.createdAt
					? a.createdAt - b.createdAt
					: String(a.messageId) < String(b.messageId)
						? -1
						: 1,
			),
		[groupPagination.results],
	)
	/**
	 * Les MEMBRES du groupe — la fiche du fil ne les porte plus (le moteur les
	 * pagine à part). On ne les lit que lorsqu'un écran en a besoin : choisir
	 * qui appeler, ou réunir tout le groupe en conférence. Le fil est borné
	 * (`GROUP_MEMBERS_MAX`) : les pages suivantes se chargent d'elles-mêmes.
	 */
	const besoinDesMembres = choisirQuiAppeler || conferenceAvantAppel
	const membresPagination = usePaginatedQuery(
		api.modules.groups.threads.paginateGroupMembers,
		groupeId === null || !isAuthenticated || !besoinDesMembres
			? "skip"
			: { networkId, threadId: groupeId },
		{ initialNumItems: GROUP_MEMBERS_PAGE },
	)
	const { status: statutMembres, loadMore: chargerMembres } = membresPagination
	useEffect(() => {
		if (statutMembres === "CanLoadMore") chargerMembres(GROUP_MEMBERS_PAGE)
	}, [statutMembres, chargerMembres])
	const membresComplets = statutMembres === "Exhausted"
	const membres = useMemo(
		() => membresPagination.results.map((membre) => membreDuGroupe(membre, t)),
		[membresPagination.results, t],
	)

	// ── « Écrit… » ────────────────────────────────────────────────────────
	/**
	 * Qui écrit, gardé d'une réponse à l'autre. Chaque pas de l'instant change
	 * les arguments de la query : sans cette mémoire, l'indicateur
	 * s'éteindrait le temps de la nouvelle réponse, toutes les deux secondes.
	 * Il est attaché à SA conversation : changer de fil ne montre jamais
	 * « X écrit… » d'un autre fil.
	 */
	const [ecrivent, setEcrivent] = useState<{
		cle: ConversationKey
		liste: readonly Ecrivant[]
	}>({ cle: conversationKey, liste: [] })
	const enTrainDEcrire =
		ecrivent.cle === conversationKey ? ecrivent.liste : []
	const instantEcriture = useInstantArrondi(
		TYPING_NOW_STEP_MS,
		open && enTrainDEcrire.length > 0,
	)
	const typing = useAuthenticatedConvexQuery(
		api.modules.messaging.typing.listTyping,
		filId === null || filHorsReseau
			? "skip"
			: { networkId, threadId: filId, now: instantEcriture },
	)
	const groupTyping = useAuthenticatedConvexQuery(
		api.modules.groups.typing.listGroupTyping,
		groupeId === null
			? "skip"
			: { networkId, threadId: groupeId, now: instantEcriture },
	)
	const ecriventRecus = groupeId !== null ? groupTyping.data : typing.data
	useEffect(() => {
		if (ecriventRecus !== undefined) {
			setEcrivent({ cle: conversationKey, liste: ecriventRecus })
		}
	}, [ecriventRecus, conversationKey])

	// ── Épingle (ADR-0143) ────────────────────────────────────────────────
	/**
	 * 1:1 : query DÉDIÉE, souscrite par la conversation ouverte seulement —
	 * la liste des fils ne paie pas cette lecture par ligne. Groupe : portée
	 * par `getGroupThread`, déjà souscrite pour l'en-tête.
	 */
	const epingle1a1 = useAuthenticatedConvexQuery(
		api.modules.messaging.pins.getPinnedMessage,
		filId === null || !isAuthenticated || filHorsReseau
			? "skip"
			: { networkId, threadId: filId },
	)
	const epingle =
		groupeId !== null
			? (groupe.data?.pinnedMessage ?? null)
			: (epingle1a1.data ?? null)
	/** Un corps masqué (auteur bloqué) ne s'annonce pas, même épinglé. */
	const epingleVisible =
		epingle !== null && !("masked" in epingle && epingle.masked) ? epingle : null
	const epingleId =
		epingleVisible === null ? null : String(epingleVisible.messageId)
	/**
	 * Le droit d'épingler : en 1:1, les deux participants ; en groupe, le
	 * rôle de gestion (la règle du domaine que le serveur applique, et qu'il
	 * re-contrôle de toute façon). Sur un brouillon, rien n'existe encore : pas
	 * d'épingle.
	 */
	const canPin =
		groupeId !== null
			? groupe.data !== undefined && isGroupThreadManager(groupe.data.myRole)
			: filId !== null && !filHorsReseau

	// ── Transfert (ADR-0143) ──────────────────────────────────────────────
	/** Le message en cours de transfert — `null` : la feuille est fermée. */
	const [transfert, setTransfert] = useState<BubbleMessage | null>(null)
	/** MC-01 : le message reçu en cours de signalement — `null` : la boîte est fermée. */
	const [signalement, setSignalement] = useState<Extract<ReportTarget, { kind: "groupMessage" | "personalMessage" }> | null>(null)
	const [transfertErreur, setTransfertErreur] = useState<string | null>(null)
	/** La clé de la ligne choisie pendant l'envoi — les autres se ferment. */
	const [transfertEnCours, setTransfertEnCours] = useState<string | null>(null)
	/** Mes groupes du réseau, pour la liste des cibles. */
	const groupesListe = source.useGroupThreads()

	// ── Écritures de la SOURCE ─────────────────────────────────────────────
	// La boîte choisit aussi ses écritures et injecte son réseau ; la vue garde
	// les gestes, brouillons, clés idempotentes et refus, sans choisir une porte.
	const {
		send,
		startThread,
		setTyping,
		clearTyping,
		uploadUrl1a1,
		deleteForAll,
		editMessage,
		deleteForMe,
		react1a1,
		sendGroup,
		setGroupTyping,
		clearGroupTyping,
		uploadUrlGroupe,
		reactGroupe,
		deleteGroupForMe,
		editGroupMessage,
		deleteGroupForAll,
		setPinned,
		setGroupPinned,
		forwardMessage,
		forwardGroupMessage,
		markRead: { mutateAsync: markRead },
		markGroupRead: { mutateAsync: markGroupRead },
	} = source.useMessageWrites()
	/** L’appel 1:1 reste un geste distinct fourni par la source. */
	const appelDeLaSource = source.useStartCall()

	const startCall = useConvexMutationQuery(
		api.modules.calls.groupCalls.startFromThread,
	)
	/**
	 * ⚠️ UN SEUL canal pour les deux : iAPPEL.
	 *
	 *  · le 1:1 est un APPEL. Il se pose dans le store d'appel, que la surface
	 *    globale rend : tonalité de retour, passage `initiating → ringing`,
	 *    détection du raccrochage distant, vidéo quand la vidéo a été demandée ;
	 *  · le GROUPE est un APPEL LUI AUSSI, à N interlocuteurs. Même store,
	 *    même surface — c'est la SCÈNE qui change (une grille au lieu d'un
	 *    correspondant unique), pas le canal.
	 *
	 * On n'y « rejoint » pas trois personnes comme une réunion qui se planifie :
	 * on les APPELLE.
	 */
	const { openOutgoingCall, openGroupCall, openRefusedCall } = useCallStore()

	const titleId = `msg-conv-${conversationKey.replace(/[^a-z0-9]/gi, "-")}`

	/**
	 * Les messages, NORMALISÉS. Les deux lectures du moteur ne parlent pas tout
	 * à fait la même langue (événements de groupe, accusé de lecture du 1:1) —
	 * la traduction se fait ICI, une fois, pour que la bulle n'en sache rien.
	 */
	const bulles: BubbleMessage[] = useMemo(() => {
		if (groupeId !== null) {
			return messagesDuGroupe.map((m) => {
				const auteur = nomAffichable(m.sender.displayName, t)
				return {
					id: String(m.messageId),
					senderId: String(m.senderPersonId),
					createdAt: m.createdAt,
					text: m.content,
					masked: m.masked,
					senderName: auteur,
					attachments: m.attachmentFiles.map(pieceDeBulle),
					reply:
						m.replyTo === null
							? null
							: {
									messageId: m.replyTo.messageId === null ? null : String(m.replyTo.messageId),
									excerpt: m.replyTo.excerpt,
									deleted: m.replyTo.deleted,
									authorDeleted: m.replyTo.authorDeleted,
								},
					reactions: m.reactions,
					deleted: m.deleted,
					editedAt: m.editedAt,
					forwarded: m.forwarded,
					pinned: epingleId !== null && String(m.messageId) === epingleId,
					systemText:
						m.type === "system"
							? ligneSystemeDeGroupe(
									{
										event: m.event,
										auteur,
										cible:
											m.target === null
												? null
												: nomAffichable(m.target.label.displayName, t),
									},
									t,
								)
							: null,
				}
			})
		}
		return messagesDirects.map((m) => ({
			id: String(m.messageId),
			senderId: String(m.senderPersonId),
			createdAt: m.createdAt,
			deleted: m.deleted,
			text: m.content,
			senderName: nomAffichable(m.sender.displayName, t),
			attachments: m.attachmentFiles.map(pieceDeBulle),
			reply:
				m.replyTo === null
					? null
					: {
							messageId: m.replyTo.messageId === null ? null : String(m.replyTo.messageId),
							excerpt: m.replyTo.excerpt,
							deleted: m.replyTo.deleted,
							authorDeleted: m.replyTo.authorDeleted,
						},
			reactions: m.reactions,
			// L'accusé n'a de sens que pour MES messages : le moteur ne le rend
			// que pour eux (`null` ailleurs).
			readAt: m.readAt,
			editedAt: m.editedAt,
			forwarded: m.forwarded,
			pinned: epingleId !== null && String(m.messageId) === epingleId,
			// Un événement (appel, système) n'est la parole de personne : une
			// ligne, pas une bulle. Le moteur n'y compose aucune phrase — un
			// contenu éventuel est dit tel quel, sinon la nature de l'événement.
			systemText:
				m.type === "system"
					? (m.content ?? t("messagerieConversationView.systemEvent"))
					: m.type === "call_started"
						? (m.content ?? t("messagerieConversationView.callStarted"))
						: m.type === "call_ended"
							? (m.content ?? t("messagerieConversationView.callEnded"))
							: null,
		}))
	}, [groupeId, messagesDuGroupe, messagesDirects, epingleId, t])

	/**
	 * MON identifiant — celui du réseau courant. Il sert de repli quand le
	 * correspondant n'est pas connu (groupe, fil pas encore chargé).
	 */
	const selfId = String(moi)
	const visibleOutbox = outbox.filter((entry) => entry.messageId === null || !bulles.some((message) => message.id === entry.messageId))
	useEffect(() => {
		outboxStore.acknowledge(sendOwner, conversationKey, bulles.map((message) => message.id))
	}, [outbox, bulles, sendOwner, conversationKey])

	const rows = useMemo(
		() =>
			groupMessages(
				bulles,
				{
					selfId,
					counterpartId: correspondantId,
					now: Date.now(),
					locale: i18n.language,
					timeZone,
				},
				t,
			),
		[bulles, selfId, correspondantId, i18n.language, timeZone, t],
	)

	// ── Acquittement de lecture ───────────────────────────────────────────
	const dernierAt = bulles.at(-1)?.createdAt
	const submittedReceiptRef = useRef<string | null>(null)
	useEffect(() => {
		if (!open || dernierAt === undefined) return
		const cle = `${conversationKey}:${String(dernierAt)}`
		if (submittedReceiptRef.current === cle) return
		submittedReceiptRef.current = cle
		const promesse =
			groupeId !== null
				? markGroupRead({ threadId: groupeId })
				: filId !== null
					? markRead({ threadId: filId })
					: null
		void promesse?.catch(() => {
			// Un échec réseau autorise un retry ; un acquittement plus récent ne
			// doit jamais être effacé par le rattrapage d'un plus ancien.
			if (submittedReceiptRef.current === cle) submittedReceiptRef.current = null
		})
	}, [open, dernierAt, conversationKey, filId, groupeId, markRead, markGroupRead])

	// ── Suivi du bas ──────────────────────────────────────────────────────
	const sauterEnBas = useCallback(() => {
		const body = bodyRef.current
		if (body !== null) body.scrollTop = body.scrollHeight
		setScroll((state) => reduceOnMessages(state, { kind: "jump" }))
	}, [])

	/**
	 * ⚠️ La croissance du fil se lit par son DERNIER message, jamais par son
	 * seul décompte. Depuis que les anciens se chargent à la demande, le fil
	 * grandit aussi par le HAUT : compter la différence annoncerait « 50
	 * nouveaux messages » pour du passé qu'on vient soi-même de demander.
	 * La décision vit dans `croissanceDuFil`, avec ses tests.
	 *
	 * Elle se mesure dans l'effet de MISE EN PAGE, jamais pendant le rendu :
	 * les repères (dernier total, dernier message) sont des références, et une
	 * référence ne se lit pas en rendant. L'effet passif qui suit la CONSOMME
	 * (remise à zéro) : un autre motif de relance ne recompte pas les mêmes
	 * arrivées.
	 */
	const croissanceRef = useRef<CroissanceDuFil>({ enBas: 0, enHaut: 0 })

	/**
	 * Charger des anciens PRÉPEND : sans rien, le contenu se décale vers le bas
	 * et l'on perd la ligne qu'on lisait. On rend au fil la même distance au
	 * BAS qu'avant l'insertion — la seule mesure que l'insertion ne change pas.
	 *
	 * `useLayoutEffect` et non `useEffect` : la correction doit précéder la
	 * peinture, sinon le saut est visible.
	 */
	useLayoutEffect(() => {
		const croissance = croissanceDuFil({
			totalAvant: previousCountRef.current,
			totalApres: bulles.length,
			dernierIdAvant: dernierIdRef.current,
			dernierIdApres: bulles.at(-1)?.id ?? null,
		})
		croissanceRef.current = croissance
		const body = bodyRef.current
		if (body === null) return
		if (croissance.enHaut > 0) {
			body.scrollTop = body.scrollHeight - hauteurAvantRef.current
		}
		hauteurAvantRef.current = body.scrollHeight - body.scrollTop
	}, [bulles])

	useEffect(() => {
		previousCountRef.current = bulles.length
		dernierIdRef.current = bulles.at(-1)?.id ?? null
		const added = croissanceRef.current.enBas
		croissanceRef.current = { enBas: 0, enHaut: 0 }
		if (added <= 0) return
		const dernier = bulles.at(-1)
		const deMoi =
			dernier !== undefined &&
			(dernier.senderId === selfId ||
				(correspondantId !== null && dernier.senderId !== correspondantId))
		setScroll((state) => {
			const next = reduceOnMessages(state, { kind: "messages", added, fromMe: deMoi })
			if (next.pinned) {
				// Après le rendu : la hauteur n'est à jour qu'une fois les nouvelles
				// bulles montées.
				requestAnimationFrame(() => {
					const body = bodyRef.current
					if (body !== null) body.scrollTop = body.scrollHeight
				})
			}
			return next
		})
	}, [bulles, selfId, correspondantId])

	// ── Envoi ─────────────────────────────────────────────────────────────
	const promotionAfterSend = useRef<{ handle: string; threadId: string } | null>(null)
	const terminerEnvoi = useCallback(() => {
		const promotion = promotionAfterSend.current
		if (promotion === null || !sending.isCurrent()) return
		promotionAfterSend.current = null
		// Les pièces admises ont quitté le brouillon AVANT sa promotion : les
		// déplacer puis démonter le composeur les aurait laissées prêtes au renvoi.
		outboxStore.moveConversation(sendOwner, conversationKey, `chat:${promotion.threadId}`)
		dockStore.promoteDraft(promotion.handle, promotion.threadId)
		if (variant === "page") nav.openConversation(`chat:${promotion.threadId}`)
	}, [sending.isCurrent, sendOwner, conversationKey, variant, nav])
	const envoyer = useCallback(
		async (payload: { text: string; attachments: UploadedAttachment[] }): Promise<void> => {
			if (!sending.isCurrent()) throw new AbandonedMessageSend()
			promotionAfterSend.current = null
			if (handle !== null) setDraftSendStarted(true)
			setErreur(null)
			const pieces = payload.attachments.length > 0
				? payload.attachments.map((a) => ({
					storageId: a.storageId as Id<"_storage">,
					filename: a.filename,
					mimeType: a.mimeType,
					sizeBytes: a.sizeBytes,
					...(a.durationMs === undefined ? {} : { durationMs: a.durationMs }),
				}))
				: undefined
			const citation = reply?.messageId ?? undefined
			try {
				const admitted = await sending.perform({ text: payload.text, attachments: payload.attachments, replyTo: citation ?? null }, async (key): Promise<{ messageId: string; threadId?: string; conversation?: string }> => {
					if (groupeId !== null) return await sendGroup.mutateAsync({
						threadId: groupeId,
						content: payload.text,
						...(pieces === undefined ? {} : { attachmentFiles: pieces }),
						...(citation === undefined ? {} : { replyToMessageId: citation as Id<"groupMessages"> }),
						idempotencyKey: key,
					})
					if (filId !== null) return await send.mutateAsync({
						threadId: filId,
						content: payload.text,
						...(pieces === undefined ? {} : { attachmentFiles: pieces }),
						...(citation === undefined ? {} : { replyToMessageId: citation as Id<"personalMessages"> }),
						idempotencyKey: key,
					})
					if (handle === null) throw new AbandonedMessageSend()
					const result = await startThread.mutateAsync({
						handle,
						initialMessage: payload.text,
						...(pieces === undefined ? {} : { initialAttachmentFiles: pieces }),
						idempotencyKey: key,
					})
					return { ...result, conversation: `chat:${String(result.threadId)}` }
				})
				// Le texte reste disponible pendant l'aller-retour et après refus.
				// Une frappe plus récente n'est jamais effacée par cette admission.
				if (latestDraft.current.trim() === payload.text) dockStore.setDraftText(conversationKey, "")
				setReply((current) => current?.messageId === citation ? null : current)
				if (groupeId !== null) void clearGroupTyping.mutateAsync({ threadId: groupeId }).catch(() => undefined)
				else if (filId !== null) void clearTyping.mutateAsync({ threadId: filId }).catch(() => undefined)
				else if (handle !== null && admitted.threadId !== undefined) {
					promotionAfterSend.current = { handle, threadId: admitted.threadId }
				}
			} catch (error) {
				if (sending.isCurrent() && !(error instanceof AbandonedMessageSend)) setErreur(messageErreurLisible(error, t))
				throw error
			}
		},
		[groupeId, filId, handle, conversationKey, reply, send, sendGroup, startThread, sending.perform, sending.isCurrent, clearTyping, clearGroupTyping, t],
	)

	const signalerLaFrappe = useCallback(() => {
		const now = Date.now()
		if (!shouldPingTyping(lastPingRef.current, now)) return
		lastPingRef.current = now
		if (groupeId !== null) {
			void setGroupTyping.mutateAsync({ threadId: groupeId })
			return
		}
		if (filId !== null) void setTyping.mutateAsync({ threadId: filId })
	}, [groupeId, filId, setGroupTyping, setTyping])

	// ── Réactions et suppressions ─────────────────────────────────────────
	const reagir = useCallback(
		(message: BubbleMessage, reaction: MessageReactionKind) => {
			setErreur(null)
			const promesse =
				groupeId !== null
					? reactGroupe.mutateAsync({
							messageId: message.id as Id<"groupMessages">,
							kind: reaction,
						})
					: react1a1.mutateAsync({
							messageId: message.id as Id<"personalMessages">,
							kind: reaction,
						})
			void promesse.catch((err: unknown) => setErreur(messageErreurLisible(err, t)))
		},
		[groupeId, reactGroupe, react1a1, t],
	)

	const agir = useCallback(
		(message: BubbleMessage, action: MessageActionId) => {
			setErreur(null)
			switch (action) {
				case "copier":
					void navigator.clipboard?.writeText(message.text ?? "")
					return
				case "supprimerPourMoi": {
					const promesse =
						groupeId !== null
							? deleteGroupForMe.mutateAsync({
									messageId: message.id as Id<"groupMessages">,
								})
							: deleteForMe.mutateAsync({
									messageId: message.id as Id<"personalMessages">,
								})
					void promesse.catch((err: unknown) =>
						setErreur(messageErreurLisible(err, t)),
					)
					return
				}
				case "supprimerPourTous": {
					// `actionsFor` ne l'offre que sur MON message, dans la fenêtre —
					// la garde reste ici parce qu'une action reçue est une donnée, pas
					// une preuve. Le GROUPE a sa propre mutation depuis IC-13 (B).
					const promesse =
						groupeId !== null
							? deleteGroupForAll.mutateAsync({
									messageId: message.id as Id<"groupMessages">,
								})
							: deleteForAll.mutateAsync({
									messageId: message.id as Id<"personalMessages">,
								})
					void promesse.catch((err: unknown) =>
						setErreur(messageErreurLisible(err, t)),
					)
					return
				}
				case "modifier":
					// On ne modifie que du TEXTE : une pierre tombale ou un message de
					// pièces seules n'entre pas ici (`actionsFor` ne l'offre pas).
					if (message.deleted === true) return
					setEditing({
						messageId: message.id,
						initialText: message.text ?? "",
					})
					return
				case "epingler":
				case "desepingler": {
					// `actionsFor` n'offre le geste qu'au droit près — la garde reste
					// ici parce qu'une action reçue est une donnée, pas une preuve.
					if (!canPin) return
					const cible = action === "epingler" ? message.id : null
					const promesse =
						groupeId !== null
							? setGroupPinned.mutateAsync({
									threadId: groupeId,
									messageId: cible as Id<"groupMessages"> | null,
								})
							: filId !== null
								? setPinned.mutateAsync({
										threadId: filId,
										messageId: cible as Id<"personalMessages"> | null,
									})
								: null
					void promesse?.catch((err: unknown) =>
						setErreur(messageErreurLisible(err, t)),
					)
					return
				}
				case "transferer":
					// La cible se choisit dans la feuille — JAMAIS de « dernier fil »
					// implicite (ADR-0143).
					if (message.deleted === true || message.masked === true) return
					setTransfertErreur(null)
					setTransfert(message)
					return
				case "signaler":
					// MC-01 : `actionsFor` ne l'offre que sur le message servi d'un autre ;
					// la garde reste ici, le moteur rejuge (partie au fil, blocage).
					if (message.deleted === true || message.masked === true) return
					if (groupeId !== null) setSignalement({ kind: "groupMessage", id: message.id as Id<"groupMessages"> })
					else if (filId !== null) setSignalement({ kind: "personalMessage", id: message.id as Id<"personalMessages"> })
					return
				default:
					return
			}
		},
		[
			groupeId,
			filId,
			networkId,
			canPin,
			deleteGroupForMe,
			deleteForMe,
			deleteForAll,
			deleteGroupForAll,
			setPinned,
			setGroupPinned,
			t,
		],
	)

	/**
	 * Le brouillon de PIÈCES de CE fil, porté par le store (IC-13 D).
	 *
	 * ⚠️ Lu ICI et non reçu en prop : `draft` (le texte) vient du parent, mais
	 * les surfaces qui montent cette vue n'ont pas toutes de quoi le fournir,
	 * et le magasin est un singleton de module — le lire n'ajoute aucun
	 * provider. Sans lui, changer de conversation perdait un fichier qui venait
	 * de FINIR de monter.
	 */
	const dock = useDockState()
	const mediaItems = draftMediaFor(dock, conversationKey)
	const mediaDraft: ComposerMediaDraft = useMemo(
		() => ({
			items: mediaItems,
			fileOf: mediaFile,
			add: (entrees) => {
				dockStore.addMedia(conversationKey, entrees)
			},
			remove: (localId) => {
				dockStore.removeMedia(conversationKey, localId)
			},
			markUploaded: (localId, storageId) => {
				dockStore.markMediaUploaded(conversationKey, localId, storageId)
			},
			markFailed: (localId) => {
				dockStore.markMediaFailed(conversationKey, localId)
			},
			clear: (localIds) => {
				dockStore.clearMedia(conversationKey, localIds)
			},
		}),
		[mediaItems, conversationKey],
	)

	/**
	 * Enregistre la correction — 1:1 ou groupe, même geste vu de l'écran.
	 *
	 * Le refus du serveur (fenêtre expirée, message d'un autre) se lit par son
	 * CODE (`messageErreurLisible`) : le `message` brut porte la trace du
	 * serveur en développement.
	 */
	const enregistrerModification = useCallback(
		async (texte: string): Promise<void> => {
			if (editing === null) return
			setErreur(null)
			try {
				if (groupeId !== null) {
					await editGroupMessage.mutateAsync({
						messageId: editing.messageId as Id<"groupMessages">,
						content: texte,
					})
					return
				}
				await editMessage.mutateAsync({
					messageId: editing.messageId as Id<"personalMessages">,
					content: texte,
				})
			} catch (err) {
				setErreur(messageErreurLisible(err, t))
				throw err
			}
		},
		[editing, groupeId, editGroupMessage, editMessage, t],
	)

	/**
	 * Ramener à UN message du fil — citation ou épingle, même déplacement.
	 * Le défilement suit la préférence système : c'est un déplacement, pas
	 * une animation d'agrément.
	 */
	const sauterAuMessage = useCallback((messageId: string) => {
		document.getElementById(`msg-${messageId}`)?.scrollIntoView({
			block: "center",
			behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches
				? "auto"
				: "smooth",
		})
	}, [])

	/**
	 * Transférer vers la cible CHOISIE (ADR-0143). Le succès ferme la feuille
	 * et le dit ; le refus reste DANS la feuille — une autre cible reste
	 * choisissable, et la raison du serveur se lit par son code.
	 */
	const transfererVers = useCallback(
		async (row: ForwardTargetRow): Promise<void> => {
			if (transfert === null) return
			setTransfertErreur(null)
			setTransfertEnCours(row.key)
			try {
				// La cible de la feuille porte des chaînes — brandées au dernier
				// moment ; le serveur valide la FORME `v.id(…)` à l'arrivée.
				const to = forwardTargetArg(row.to)
				if (groupeId !== null) {
					await forwardGroupMessage.mutateAsync({
						messageId: transfert.id as Id<"groupMessages">,
						to,
					})
				} else {
					await forwardMessage.mutateAsync({
						messageId: transfert.id as Id<"personalMessages">,
						to,
					})
				}
				setTransfert(null)
				toast.success(t("messagerieConversationView.forwardDone"))
			} catch (err) {
				setTransfertErreur(messageErreurLisible(err, t))
			} finally {
				setTransfertEnCours(null)
			}
		},
		[transfert, groupeId, forwardMessage, forwardGroupMessage, t],
	)

	const desepingler = useCallback(() => {
		const promesse =
			groupeId !== null
				? setGroupPinned.mutateAsync({
						threadId: groupeId,
						messageId: null,
					})
				: filId !== null
					? setPinned.mutateAsync({
							threadId: filId,
							messageId: null,
						})
					: null
		void promesse?.catch((err: unknown) => setErreur(messageErreurLisible(err, t)))
	}, [groupeId, filId, setPinned, setGroupPinned, t])

	// ── Appels ────────────────────────────────────────────────────────────
	/**
	 * Appeler le correspondant d'un fil 1:1 — par la SOURCE, qui reçoit son
	 * identifiant public ET sa personne : l'identifiant de la personne est
	 * connu dès que le fil l'est, le lui faire deviner depuis une adresse
	 * serait une devinette.
	 */
	const appeler = useCallback(
		async (mediaType: "audio" | "video"): Promise<void> => {
			// Les boutons n'existent que sur un fil dont le correspondant a un
			// profil publié (`callActionsFor`) : sans fil ni adresse, rien à joindre.
			if (thread === undefined) return
			const enFace = thread.counterpart
			const adresse = enFace.handle ?? handle
			if (adresse === null) return
			setErreur(null)
			try {
				const appel = await appelDeLaSource.appeler({
					adresse,
					userId: enFace.personId,
					mediaType,
				})
				// L'identité de l'appelé, pour que la fenêtre le NOMME pendant la
				// sonnerie au lieu d'afficher « Appeler ».
				const sonneChez = appel.targetUserId ?? enFace.personId
				const callee: CallPeerIdentity = {
					userId: sonneChez,
					name: enFace.displayName,
					avatarUrl: enFace.avatarUrl,
					handle: adresse,
				}
				// Le correspondant peut avoir écarté l'appel (ne pas déranger, en
				// ligne, hors de ses relations…). Le moteur rend la RAISON, pas une
				// phrase ; ouvrir une fenêtre d'appel qui ne sonnera pas serait
				// pire que de ne rien ouvrir.
				if (!appel.admitted) {
					// L'écran de fin porte la raison ET les actions qu'elle autorise
					// (déposer un message vocal, rappeler quand c'est permis) : un
					// message d'erreur dans le fil n'offrirait ni l'un ni l'autre.
					openRefusedCall({
						meetingId: appel.meetingId,
						mediaType,
						endKind: refusalEndKind(appel.reason),
						message: null,
						voicemailOffered: appel.voicemailOffered === true,
						scope: "personnel",
						callee,
					})
					return
				}
				openOutgoingCall({
					meetingId: appel.meetingId,
					participantUserId: sonneChez,
					// Le média RETENU par le serveur, pas celui demandé : c'est lui
					// qui est écrit sur l'appel et relu par `requestToken`.
					mediaType: appel.mediaType,
					startedAt: Date.now(),
					scope: "personnel",
					callee,
				})
			} catch (err) {
				setErreur(messageErreurLisible(err, t))
			}
		},
		[thread, handle, appelDeLaSource, openOutgoingCall, openRefusedCall, t],
	)

	/**
	 * Changer de conversation referme l'écran de sélection : il vise UN fil.
	 * La clé de conversation est la SEULE raison de refermer — n'importe quelle
	 * autre perdrait une sélection en cours de composition.
	 */
	useEffect(() => {
		setChoisirQuiAppeler(false)
		// La carte T1 vise ce fil-là aussi : elle nomme SON effectif.
		setConferenceAvantAppel(false)
		// Et la CORRECTION en cours : elle désigne un message de CE fil-là.
		// La laisser ouverte ferait enregistrer une modification sur un
		// identifiant que la conversation affichée ne contient pas.
		setEditing(null)
	}, [conversationKey])

	/**
	 * L'ALTERNATIVE explicite à l'appel — LANCER UNE CONFÉRENCE (ADR-0149).
	 * Jamais une conversion silencieuse : c'est un autre geste, sur un autre
	 * canal, et l'appelant le déclenche lui-même, depuis T1, T2 ou le bouton du
	 * sélecteur.
	 *
	 * La conférence du réseau est son DIRECT : `useLaunchConference` pose la
	 * demande, et l'hôte monté auprès de l'hôte d'appel global rend la
	 * création. Un appel en cours est RÉDUIT, jamais raccroché (fiche §6.3).
	 *
	 * Les membres du fil voyagent, et le FIL avec eux (ADR-0150, arbitrage I) :
	 * ils deviennent les invités du direct, et `sourceThreadId` est ce qui
	 * prouve au serveur qu'un membre peut être convié sans être une relation
	 * de l'hôte. T1, T2 et le bouton du sélecteur passent tous par ici — une
	 * seule requête, trois déclencheurs.
	 */
	const launchConference = useLaunchConference()
	const conferenceAvailable = useConferenceLaunchAvailable()
	const lancerConference = useCallback(() => {
		setErreur(null)
		setConferenceAvantAppel(false)
		// Le choix est fait : réunir tout le groupe REMPLACE « choisir dix
		// personnes ». Laisser le sélecteur ouvert derrière la création ferait
		// retrouver, au retour, une composition que plus personne ne mène.
		setChoisirQuiAppeler(false)
		const autres = membres.filter((membre) => !membre.isMe)
		launchConference({
			scope: "personnel",
			userIds: autres.map((membre) => membre.userId),
			// Les noms déjà affichés voyagent : le dialogue nomme chaque invité
			// proposé au lieu de lignes « Personne invitée » indistinctes.
			people: autres.map((membre) => ({
				userId: membre.userId,
				displayName: membre.displayName,
				handle: membre.handle,
				avatarUrl: membre.avatarUrl,
			})),
			title: groupe.data?.title ?? null,
			sourceThreadId: threadId,
		})
	}, [launchConference, membres, groupe.data, threadId])
	/** Le geste n'est proposé que si une conférence peut réellement s'ouvrir (lot `live`). */
	const lancerConferenceSiPossible = conferenceAvailable ? lancerConference : null

	/**
	 * Le focus REVIENT au bouton d'appel quand T1 se ferme sans suite.
	 *
	 * ⚠️ T1 REMPLACE la conversation, en-tête compris : le bouton « Appeler »
	 * qui l'a ouverte est démonté AVANT que `useModalA11y` ne photographie le
	 * déclencheur — il photographie `<body>`, et sa restitution ne rendait rien.
	 * Au clavier, le focus restait hors du téléphone. C'est donc à cet écran,
	 * qui connaît son en-tête reconstruit, de le rendre. Sans en-tête (la fiche
	 * du groupe a repris la place), rien : mieux vaut ne pas deviner.
	 */
	const retourFocusAppel = useRef(false)
	useEffect(() => {
		if (conferenceAvantAppel || !retourFocusAppel.current) return
		retourFocusAppel.current = false
		const bouton = document
			.getElementById(titleId)
			?.closest(".msg-head-row")
			?.querySelector<HTMLButtonElement>(".icom-action-group-btn:not(:disabled)")
		bouton?.focus({ preventScroll: true })
	}, [conferenceAvantAppel, titleId])

	/**
	 * Appeler le GROUPE — canal iAPPEL, comme le tête-à-tête.
	 */
	const appelerLeGroupe = useCallback(
		async (
			mediaType: "audio" | "video" = "audio",
			personIds?: readonly string[],
		): Promise<void> => {
			if (groupeId === null) return
			/**
			 * ⚠️ LE FIL PEUT ÊTRE PLUS GRAND QU'UN APPEL (IC-08). Le serveur
			 * refuse alors (`GROUP_CALL_THREAD_TOO_LARGE`) — et le geste entier
			 * serait perdu. On ouvre l'écran de sélection : l'issue est nommée, et
			 * elle vient AVANT la soumission, pas après le refus.
			 *
			 * `personIds` fourni = on REVIENT de cet écran : ne pas le rouvrir.
			 *
			 * Depuis ADR-0149, la PORTE est la carte T1 : avant de composer, le
			 * téléphone dit le choix — choisir dix correspondants, ou réunir tout
			 * le groupe en conférence. Aucun compte n'en est exempté.
			 */
			if (
				personIds === undefined &&
				needsInviteeSelection({
					memberCount: groupe.data?.memberCount,
					capacity: plafondAppel,
				})
			) {
				setErreur(null)
				const carte = planConferenceHint({
					moment: "before",
					members: groupe.data?.memberCount,
					capacity: effectiveCapacity(plafondAppel),
				})
				if (carte?.kind === "T1") {
					setConferenceAvantAppel(true)
					return
				}
				setChoisirQuiAppeler(true)
				return
			}
			setErreur(null)
			try {
				// ⚠️ `personIds` ABSENT, le serveur appelle TOUT le fil — le
				// comportement d'avant IC-08, celui des petits groupes. Fourni, il
				// ne fait sonner que ces personnes-là, après les avoir re-contrôlées.
				const appel = await startCall.mutateAsync(
					personIds === undefined
						? { networkId, threadId: groupeId, mediaType }
						: {
								networkId,
								threadId: groupeId,
								mediaType,
								personIds: personIds.map((id) => id as Id<"persons">),
							},
				)
				openGroupCall({
					meetingId: appel.callId,
					mediaType: appel.mediaType,
					// Le titre du fil est connu ICI, tout de suite : la fenêtre le
					// NOMME dès l'ouverture, sans attendre le serveur.
					group: {
						title:
							groupe.data?.title ??
							t("messagerieConversationView.groupCallFallbackTitle"),
						// L'EFFECTIF APPELÉ, pas celui du fil. Sur un grand groupe on
						// n'appelle qu'une poignée de personnes : annoncer « 200
						// participants » au-dessus d'une grille de quatre vignettes
						// ferait croire à un appel qui ne sonne pas.
						memberCount:
							personIds === undefined
								? (groupe.data?.memberCount ?? 0)
								: personIds.length + 1,
						threadId: groupeId,
					},
					scope: "personnel",
					alreadyActive: appel.alreadyActive,
				})
				setChoisirQuiAppeler(false)
			} catch (err) {
				setErreur(messageErreurLisible(err, t))
			}
		},
		[groupeId, networkId, startCall, openGroupCall, groupe.data, plafondAppel, t],
	)

	// ── Identité affichée ─────────────────────────────────────────────────
	const estGroupe = groupeId !== null
	const nom = estGroupe
		? (groupe.data?.title ?? t("messagerieConversationView.groupFallbackTitle"))
		: (thread?.counterpart.displayName ??
			destinataire.data?.displayName ??
			(handle !== null
				? `@${handle}`
				: t("messagerieConversationView.conversationFallbackTitle")))
	const handleAffiche = thread?.counterpart.handle ?? handle ?? null
	/**
	 * ⚠️ « Pas encore reçu » et « reçu, et vide » ne sont PAS la même chose, et
	 * les confondre fait AFFIRMER LE FAUX. `isLoading` seul ne suffit pas : une
	 * requête dont la session n'est pas encore établie rend `data === undefined`
	 * avec `isLoading === false`, et un `?? []` la ferait passer pour une
	 * conversation vide — « Aucun message pour l'instant. Écrivez le premier. »
	 * sur un fil qui en porte cinq.
	 *
	 * Le test est donc l'ABSENCE DE DONNÉE, pas le drapeau de chargement.
	 */
	const donneesRecues = estGroupe
		? groupPagination.status !== "LoadingFirstPage"
		: directPagination.status !== "LoadingFirstPage"
	const chargement = (estGroupe || filId !== null) && !donneesRecues

	/**
	 * P18b (A04) — les ARRIVÉES s'annoncent, et elles seules. Une région polie
	 * PERSISTANTE (montée avec le fil) reçoit « Nouveau message de X : … » quand
	 * le fil suit le bas (le message est à l'écran), sinon le décompte de la
	 * pastille. Le premier état reçu pose le repère sans rien annoncer :
	 * ni l'ouverture d'une conversation, ni l'historique chargé, ni mes propres
	 * messages ne parlent. La saisie en cours reste muette (`aria-hidden`).
	 */
	const arrivalBaselineRef = useRef<{ lastId: string | null } | null>(null)
	const [arrivalText, setArrivalText] = useState("")
	useEffect(() => {
		if (chargement) return
		const previous = arrivalBaselineRef.current
		arrivalBaselineRef.current = { lastId: bulles.at(-1)?.id ?? null }
		const annonce = arrivalAnnouncement(
			{ previous, messages: bulles, selfId, pinned: scroll.pinned, unseen: scroll.unseen },
			t,
		)
		if (annonce === null) return
		// Une annonce identique à la précédente ne serait pas relue : une espace
		// insécable (`REPEAT_MARK`) la distingue sans rien changer à ce qui est dit.
		setArrivalText((precedente) => (precedente === annonce ? `${annonce}${REPEAT_MARK}` : annonce))
	}, [chargement, bulles, selfId, scroll.pinned, scroll.unseen, t])

	/**
	 * Le panneau d'informations REMPLACE la conversation, en-tête compris.
	 *
	 * Il porte son propre retour (« Revenir à la conversation ») : garder
	 * l'en-tête du fil au-dessus donnerait deux flèches de retour qui ne font
	 * pas la même chose. Tous les crochets ci-dessus ont déjà tourné — cette
	 * sortie est la dernière instruction avant le rendu, jamais une branche
	 * posée au milieu.
	 */
	const ficheDuGroupe =
		infosOpen && estGroupe && threadId !== null && onCloseInfos !== undefined ? (
			<MessagerieGroupeInfos
				threadId={threadId}
				variant={variant}
				onClose={onCloseInfos}
				onLeft={onLeftGroup ?? onCloseInfos}
				onStartAudio={() => void appelerLeGroupe("audio")}
				onStartVideo={() => void appelerLeGroupe("video")}
				callPending={startCall.isPending}
			/>
		) : null

	/**
	 * LA CARTE CONFÉRENCE T1 (ADR-0149, fiche §6.2) — avant l'appel d'un fil
	 * plus grand que le plafond. Même mécanique que le sélecteur : elle
	 * REMPLACE la conversation, en-tête compris, et passe avant la fiche du
	 * groupe, dont les boutons d'appel la déclenchent aussi.
	 *
	 * ⚠️ Elle reste DANS le téléphone (ADR-0148) : la carte se rend en flux et
	 * remplit son parent, elle ne se portaille nulle part. Échap la ferme avant
	 * la carte iCom — elle prévient la frappe.
	 */
	if (conferenceAvantAppel && estGroupe && groupe.data !== undefined) {
		const plafond = effectiveCapacity(plafondAppel)
		return (
			<>
				<MessagerieStyles />
				<ConferenceHintCard
					kind="T1"
					tone="espace"
					copy={conferenceHintCopy(
						"T1",
						{
							capacity: plafond,
							members: groupe.data.memberCount,
							context: "thread",
						},
						t,
					)}
					onPrimary={() => {
						setConferenceAvantAppel(false)
						setChoisirQuiAppeler(true)
					}}
					onSecondary={lancerConferenceSiPossible}
					onDismiss={() => {
						retourFocusAppel.current = true
						setConferenceAvantAppel(false)
					}}
				/>
			</>
		)
	}

	/**
	 * CHOISIR QUI APPELER (IC-08) — la sortie passe AVANT celle de la fiche :
	 * l'écran s'ouvre depuis les boutons d'appel de la fiche, et laisser la
	 * fiche gagner rendrait le geste sans effet visible.
	 *
	 * Il attend TOUS les membres : composer sur une liste partielle ferait
	 * croire à un groupe plus petit qu'il n'est. `MessagerieStyles` est monté
	 * ici — le sélecteur emprunte le vocabulaire de classes de la fiche du
	 * groupe et ne porte pas sa feuille de style.
	 */
	if (choisirQuiAppeler && estGroupe && groupe.data !== undefined) {
		if (!membresComplets) {
			return (
				<>
					<MessagerieStyles />
					<div className="msg-scroller">
						<div className="msg-body">
							<p className="msg-empty" role="status">
								{t("messagerieConversationView.loading")}
							</p>
						</div>
					</div>
				</>
			)
		}
		return (
			<>
				<MessagerieStyles />
				<GroupCallInviteePicker
					title={groupe.data.title}
					members={membres}
					capacity={plafondAppel}
					pending={startCall.isPending}
					errorMessage={erreur}
					variant={variant}
					onCancel={() => {
						setErreur(null)
						setChoisirQuiAppeler(false)
					}}
					onStart={(mediaType, personIds) => {
						void appelerLeGroupe(mediaType, personIds)
					}}
					onConvokeMeeting={lancerConferenceSiPossible}
				/>
			</>
		)
	}

	/* Dans le téléphone iCom comme sur la page mobile, la fiche remplace le fil. */
	if (ficheDuGroupe !== null) {
		return ficheDuGroupe
	}

	if (filHorsReseau && horsReseauConfirme) {
		return (
			<>
				<MessagerieStyles />
				<div className="msg-scroller">
					<div className="msg-body">
						<p className="msg-empty" role="status">
							{t("messagerieConversationView.notInNetwork")}
						</p>
						<button
							type="button"
							className="msg-filter-btn"
							onClick={nav.back}
						>
							{t("messagerieConversationView.backToConversations")}
						</button>
					</div>
				</div>
			</>
		)
	}

	return (
		<>
			<MessagerieStyles />
			<ConversationHeader
				variant={variant}
				kind={kind}
				title={nom}
				titleId={titleId}
				subtitle={
					estGroupe ? (
						groupe.data === undefined ? null : (
							<>
								<span style={{ fontFamily: "var(--font-mono)" }}>
									{groupe.data.memberCount}
								</span>{" "}
								{t("messagerieConversationView.members", {
									count: groupe.data.memberCount,
								})}
								{groupe.data.activeCall !== null ? (
									<>
										{" · "}
										{t("messagerieConversationView.callOngoing")}
									</>
								) : null}
							</>
						)
					) : handleAffiche !== null && variant === "page" ? (
						<>
							@{handleAffiche}
							<PresenceDot state={presenceOfConnection(correspondantId)} />
						</>
					) : null
				}
				avatar={
					estGroupe ? (
						<GroupeAvatar
							title={nom}
							avatarUrl={groupe.data?.avatarUrl}
							size={variant === "page" ? 34 : 26}
						/>
					) : (
						<Avatar
							displayName={nom}
							avatarUrl={
								thread?.counterpart.avatarUrl ??
								destinataire.data?.avatar.url ??
								null
							}
							hasIdentity={thread?.counterpart.source === "published"}
							size={variant === "page" ? 34 : 26}
						/>
					)
				}
				counterpartHandle={handleAffiche}
				groupCallLive={groupe.data?.activeCall != null}
				onBack={nav.back}
				/* Le bloc titre : le profil en 1:1, les INFORMATIONS en groupe.
				   Il était `disabled` côté groupe — le « N membres » ne menait
				   nulle part, et le groupe restait inadministrable depuis
				   l'écran alors que le serveur savait tout faire. */
				onOpenProfile={
					estGroupe
						? onOpenInfos
						: handleAffiche !== null && onOpenProfile !== undefined
							? () => onOpenProfile(handleAffiche)
							: undefined
				}
				/* Les DEUX genres de fil passent par les mêmes deux boutons : un
				   groupe se demande comme un tête-à-tête — en audio ou en vidéo. */
				onCallAudio={() =>
					void (estGroupe ? appelerLeGroupe("audio") : appeler("audio"))
				}
				onCallVideo={() =>
					void (estGroupe ? appelerLeGroupe("video") : appeler("video"))
				}
				callPending={appelDeLaSource.isPending || startCall.isPending}
				open={open}
				onToggleOpen={onToggleOpen}
			/>

			{open ? (
				<>
					{/* L'épingle du fil, AU-DESSUS du défilement — elle rappelle sans
					    prendre la place d'un message (ADR-0143). */}
					{epingleVisible !== null ? (
						<PinnedMessageBanner
							pinned={{
								messageId: String(epingleVisible.messageId),
								senderName: nomAffichable(epingleVisible.sender.displayName, t),
								excerpt: epingleVisible.excerpt,
								hasAttachments: epingleVisible.hasAttachments,
							}}
							canPin={canPin}
							onJump={sauterAuMessage}
							onUnpin={desepingler}
						/>
					) : null}
					<div className="msg-scroller">
						<div
							className="msg-body"
							ref={bodyRef}
							// P18b (A04) : une région NOMMÉE par le titre de la
							// conversation — `aria-labelledby` sur un div sans rôle
							// n'était pas exposé.
							role="region"
							aria-labelledby={titleId}
							onScroll={(event) => {
								const node = event.currentTarget
								// ⚠️ L'ancre se rafraîchit à CHAQUE défilement, pas
								// seulement au rendu : entre deux rendus, l'usager remonte
								// jusqu'en haut avant de demander les anciens. Une ancre
								// prise au dernier rendu serait périmée d'exactement la
								// distance qu'il vient de parcourir — le saut qu'on évite.
								hauteurAvantRef.current = node.scrollHeight - node.scrollTop
								setScroll((state) =>
									reduceOnMessages(state, {
										kind: "scroll",
										nearBottom: isNearBottom({
											scrollTop: node.scrollTop,
											scrollHeight: node.scrollHeight,
											clientHeight: node.clientHeight,
										}),
									}),
								)
							}}
						>
							{filId === null && groupeId === null ? (
								<p className="msg-empty">
									{t("messagerieConversationView.newConversation")}
								</p>
							) : chargement ? (
								<p className="msg-empty">{t("messagerieConversationView.loading")}</p>
							) : rows.length === 0 ? (
								<p className="msg-empty">
									{t("messagerieConversationView.empty")}
								</p>
							) : (
								<div className="msg-thread">
									{/*
									 * ⚠️ EN TÊTE du fil, et jamais un défilement infini :
									 * charger le passé au scroll déplace le sol sous les
									 * doigts. Ici, c'est l'usager qui demande — et le fil
									 * garde sa place, l'ancre étant posée avant la peinture.
									 */}
									{(estGroupe
										? groupPagination.status === "CanLoadMore"
										: filId !== null && directPagination.status === "CanLoadMore") ? (
										<button
											type="button"
											className="msg-infos-mini"
											style={{ alignSelf: "center" }}
											onClick={() => {
												if (estGroupe) {
													groupPagination.loadMore(GROUP_MESSAGES_PAGE)
													return
												}
												directPagination.loadMore(DIRECT_MESSAGES_PAGE)
											}}
										>
											<History
												aria-hidden="true"
												size={13}
												style={{ marginRight: 6, verticalAlign: "-2px" }}
											/>
											{t("messagerieConversationView.loadOlder")}
										</button>
									) : null}
									{(estGroupe
										? groupPagination.status === "LoadingMore"
										: directPagination.status === "LoadingMore") ? (
										<span className="msg-day">
											{t("messagerieConversationView.loadingOlder")}
										</span>
									) : null}
									{rows.map((row) =>
										row.kind === "date" ? (
											<span key={row.id} className="msg-day">
												{row.label}
											</span>
										) : (
											<span key={row.id} id={`msg-${row.id}`}>
												<MessageBubble
													row={row}
													conversationKind={kind}
													showSender={estGroupe}
													canReply={filId !== null || groupeId !== null}
													onReply={(message) =>
														setReply({
															messageId: message.id,
															authorName: message.senderName ?? nom,
															excerpt: (message.text ?? "").slice(
																0,
																REPLY_EXCERPT_MAX_LENGTH,
															),
															deleted: message.deleted === true,
														})
													}
													onReact={reagir}
													onAction={agir}
													onOpenQuoted={sauterAuMessage}
													canPin={canPin}
												/>
											</span>
										),
									)}
								</div>
							)}
							{navigation === "destinations" ? <OutboxMessages entries={visibleOutbox} /> : null}
						</div>

						<NewMessagesPill count={scroll.unseen} onJump={sauterEnBas} />
						{/* P18b (A04) : la région polie des arrivées, persistante
						    tant que le fil est ouvert, hors de la vue. */}
						<p className="sr-only" role="status">
							{arrivalText}
						</p>
					</div>

					{erreur !== null ? (
						<p className="msg-error" role="status">
							{erreur}
						</p>
					) : null}

					{/* La saisie en cours est `aria-hidden` : elle change toutes les six
					    secondes, et l'annoncer noierait tout le reste. */}
					{enTrainDEcrire.length > 0 ? (
						<p aria-hidden="true" className="msg-typing">
							{enTrainDEcrire.length > 1
								? t("messagerieConversationView.typingMany", {
										name: nomAffichable(enTrainDEcrire[0]?.label.displayName ?? null, t),
									})
								: t("messagerieConversationView.typingOne", {
										name: nomAffichable(enTrainDEcrire[0]?.label.displayName ?? null, t),
									})}
						</p>
					) : null}

					<MessageComposer
						contextKey={`${sendOwner}:${conversationKey}`}
						isContextCurrent={sending.isCurrent}
						value={draft}
						onChange={(text) => dockStore.setDraftText(conversationKey, text)}
						placeholder={
							estGroupe
								? t("messagerieConversationView.placeholderGroup")
								: t("messagerieConversationView.placeholderDirect")
						}
						ariaLabel={
							estGroupe
								? t("messagerieConversationView.composerLabelGroup", { name: nom })
								: t("messagerieConversationView.composerLabelDirect", { name: nom })
						}
						reply={reply}
						onCancelReply={() => setReply(null)}
						editing={editing}
						onCancelEdit={() => setEditing(null)}
						onSubmitEdit={enregistrerModification}
						mediaDraft={mediaDraft}
						onSend={envoyer}
						onSent={terminerEnvoi}
						generateUploadUrl={async () =>
							estGroupe
								? await uploadUrlGroupe.mutateAsync({})
								: await uploadUrl1a1.mutateAsync({})
						}
						// Le micro n'est offert que sur la page : dans une carte de
						// 312 px, il prendrait la place du bouton d'envoi sur un poste
						// qui a un clavier sous les doigts.
						allowVoice={variant === "page"}
						onEscape={nav.back}
						onTyping={signalerLaFrappe}
						onBlurTyping={() => {
							if (groupeId !== null) {
								void clearGroupTyping.mutateAsync({ threadId: groupeId })
								return
							}
							if (filId !== null) {
								void clearTyping.mutateAsync({ threadId: filId })
							}
						}}
						onError={setErreur}
						autoFocus={isCompactPose(variant) && open}
					/>

					{/* Le choix EXPLICITE de la cible d'un transfert (ADR-0143) —
					    la conversation courante en est exclue. */}
					<ForwardMessageSheet
						open={transfert !== null}
						onOpenChange={(ouvert) => {
							if (!ouvert) {
								setTransfert(null)
								setTransfertErreur(null)
							}
						}}
						threads={threads.data}
						groupThreads={groupesListe.data ?? []}
						currentKey={
							threadId !== null
								? `groupe:${threadId}`
								: chatId !== null
									? `chat:${chatId}`
									: null
						}
						showRelations={source.supporteBrouillon}
						isError={threads.isError}
						onRetry={() => threads.refetch()}
						sendingKey={transfertEnCours}
						errorMessage={transfertErreur}
						onSelect={(row) => void transfererVers(row)}
					/>

					{/* MC-01 : la brique commune ; le message signalé disparaît aussitôt de MA vue. */}
					{signalement !== null ? <ReportTargetDialog target={signalement} onClose={() => setSignalement(null)} /> : null}
				</>
			) : null}
		</>
	)
}
