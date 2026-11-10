// Dupliqué de socle/packages/agent-features/src/features/messagerie/MessageComposer.tsx @ ad2e7fdc2 — adaptations : iDocument retiré (« Joindre depuis iDocument », pièces du coffre, `sourceDocumentId`, politique d'import `localUploadAllowed`) et commentaires des surfaces de poste retirés (`IcomPosteDraftView`, `IcomChannelsTab`) ; `PendingAttachment` du hook recopié du paquet (`lib/chat/use-chat-attachments`) ; libellés et refus traduits (espace de noms `messagerie`, clés `messageComposer.*`, `attachmentRejection`/`formatBytes` reçoivent la langue et `t`) ; un refus du moteur se dit par son code (`engineErrorRule`/`engineErrorCode` traduits par `rules:`/`errors:`), jamais par le texte brut d'une erreur serveur — accents rétablis dans les textes du socle qui en manquaient.
"use client"

/**
 * MessageComposer — le champ de saisie, ses pieces jointes et son micro.
 *
 * Ce qui se DECIDE vit dans `messagerie-composer.ts` (module pur, teste) :
 * quels fichiers le selecteur propose, quel rendu une piece recoit, quand le
 * bouton d'envoi s'allume, quel bouton occupe le coin, et POURQUOI un fichier
 * est refuse. Ici, le rendu et le televersement seuls.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * TROIS PIEGES, TOUS DEJA PAYES AILLEURS
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * ⚠️ **16 px minimum sur la page.** iOS ZOOME sur tout champ dont la police
 * descend sous 16 px, et ne dezoome jamais : le composeur sort de l'ecran et
 * le fil devient illisible. La regle est dans la feuille partagee
 * (`[data-variant="page"] .msg-composer textarea`), pas ici — mais elle se
 * perd au premier `style` en ligne qui la recouvre.
 *
 * ⚠️ **Le hook `useChatAttachments` n'est PAS utilise pour ADMETTRE un
 * fichier.** Sa liste est une RECOPIE (`ALLOWED_ATTACHMENT_MIME_TYPES`), et
 * une recopie dérive : le jour où elle oublie `image/heic` ou `audio/*`, la
 * photo que tout iPhone produit, ou le message vocal tout entier, est refusé.
 * On garde son vocabulaire (`PendingAttachment`) et on admet nous-memes, contre
 * les bornes du SERVEUR (25 Mo, 5 pieces), qui sont les seules qui decident
 * vraiment.
 *
 * ⚠️ **Le refus se dit AVANT le televersement.** Accepter puis monter 30 Mo
 * pour se faire refuser a l'envoi, c'est mentir deux fois et gaspiller le
 * forfait de la personne.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * DEUX AJOUTS DU LOT 05, TOUS DEUX OPTIONNELS
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * ⚠️ Toute prop nouvelle reste OPTIONNELLE : le chemin sans elle reste mot
 * pour mot celui d'avant (c'est ce que les tests du composeur vérifient).
 *
 *  · `editing` — MODIFIER un message déjà parti. Le texte de l'édition vit
 *    dans un état LOCAL, jamais dans `value` : le brouillon en cours de frappe
 *    ne doit pas être écrasé par le message qu'on corrige, ni perdu quand on
 *    renonce. `Échap` annule l'édition et NE quitte pas le fil.
 *  · `mediaDraft` — les pièces portées par le STORE au lieu d'un `useState`
 *    (`messagerie-media-draft.ts`). Sans cette prop, l'état local d'origine
 *    demeure ; avec elle, changer de conversation ne perd plus un fichier de
 *    20 Mo qui venait de finir de monter.
 *
 * ⚠️ **Un refus du serveur se dit par son CODE.** L'erreur que rend `onSend`
 * peut venir du moteur : son `message` porte la trace du serveur en
 * développement. On ne montre que la règle ou le code traduits
 * (`rules:` / `errors:`), sinon une phrase générique — et nos propres refus
 * locaux (téléversement, pièce à resélectionner), déjà traduits.
 */

import { engineErrorCode, engineErrorRule } from "@antsia/social-contracts/errors"
import type { TFunction } from "i18next"
import type { PendingAttachment } from "../../lib/chat/use-chat-attachments"
import { Check, Paperclip, Send, X } from "lucide-react"
import {
	useCallback,
	useEffect,
	useMemo,
	useRef,
	useState,
	type KeyboardEvent,
} from "react"
import { useTranslation } from "react-i18next"
import {
	uploadedStorageId,
	type MediaDraftItem,
} from "./messagerie-media-draft"
import {
	attachmentRejection,
	canSend,
	composerMode,
	formatBytes,
	MESSAGE_ATTACHMENT_ACCEPT,
	voiceDurationFor,
} from "./messagerie-composer"
import { ReplyPreview, type ReplyPreviewData } from "./ReplyPreview"
import { VoiceRecorderButton } from "./VoiceRecorderButton"
import { AbandonedMessageSend, MessageSendInProgress } from "./messagerie-send-intent"

/** Ce qu'une piece devient une fois montee — la forme attendue du serveur. */
export interface UploadedAttachment {
	storageId: string
	filename: string
	mimeType: string
	sizeBytes: number
	durationMs?: number
}

/**
 * Un refus prononcé PAR LE COMPOSEUR (téléversement, pièce à resélectionner) :
 * son message est déjà traduit, et c'est le seul `message` d'erreur qu'on
 * montre tel quel.
 */
class ComposerError extends Error {}

/**
 * Le texte d'un échec, tel qu'on peut le MONTRER : règle du domaine ou code
 * du moteur traduits, sinon notre propre refus, sinon la phrase de repli.
 */
function texteDEchec(err: unknown, repli: string, t: TFunction): string {
	const regle = engineErrorRule(err)
	if (regle !== null) return t(`rules:${regle.rule}`, regle.params)
	const code = engineErrorCode(err)
	if (code !== null) return t(`errors:${code}`)
	if (err instanceof ComposerError && err.message.length > 0) return err.message
	return repli
}

/**
 * Une pièce locale garde le résultat de son téléversement tant que le message
 * n'est pas confirmé par le serveur.
 *
 * Sans ce cache, un refus de mutation laisse un blob orphelin puis retéléverse
 * le même fichier au clic suivant. Ici le retry réutilise exactement le
 * `storageId` déjà obtenu, et la pièce ne disparaît qu'après `onSend` réussi.
 */
interface PendingMessageAttachment extends PendingAttachment {
	durationMs?: number
	uploaded?: UploadedAttachment
}

/**
 * Le brouillon de PIÈCES d'une conversation, vu du composeur.
 *
 * UN objet plutôt que six callbacks : la surface qui le fournit
 * (`MessagerieConversationView`) l'assemble une fois depuis `dockStore` ; une
 * surface sans brouillon n'a rien à passer.
 */
export interface ComposerMediaDraft {
	/** Les pièces du fil courant, telles que le store les porte. */
	items: readonly MediaDraftItem[]
	/** Le fichier encore en mémoire — `null` après un rechargement. */
	fileOf: (localId: string) => File | null
	add: (
		entrees: readonly {
			file: File
			durationMs?: number
			uploaded?: { storageId: string }
		}[],
	) => void
	remove: (localId: string) => void
	markUploaded: (localId: string, storageId: string) => void
	markFailed: (localId: string) => void
	/** Envoi ABOUTI : ces pièces quittent le brouillon. */
	clear: (localIds: readonly string[]) => void
}

/**
 * Une pièce du message en cours, quelle que soit sa provenance (état local ou
 * brouillon du store). `file: null` + `storageId: null` = à RESÉLECTIONNER.
 */
interface ComposerPiece {
	localId: string
	name: string
	size: number
	mimeType: string
	durationMs?: number
	file: File | null
	storageId: string | null
}

export interface MessageComposerProps {
	/** Délimite les opérations asynchrones ; absent sur les anciens appelants. */
	contextKey?: string
	/** La session et la conversation sont encore celles du geste initial. */
	isContextCurrent?: () => boolean
	/** Le texte en cours — porte par le store, jamais par un `useState` local. */
	value: string
	onChange: (value: string) => void
	placeholder: string
	ariaLabel: string
	/** Le message CITE, s'il y en a un. */
	reply?: ReplyPreviewData | null
	onCancelReply?: () => void
	/**
	 * Le message qu'on MODIFIE, s'il y en a un. Le composeur passe alors en
	 * mode édition : bandeau, texte local semé de `initialText`, envoi par
	 * `onSubmitEdit`, pièces jointes hors sujet (le serveur ne modifie que le
	 * texte).
	 */
	editing?: { messageId: string; initialText: string } | null
	onCancelEdit?: () => void
	/** Enregistre la modification. Requis dès que `editing` est fourni. */
	onSubmitEdit?: (text: string) => Promise<void> | void
	/**
	 * Les pièces portées par le STORE. Absent, le composeur garde son état
	 * local — c'est le chemin des surfaces qui n'ont pas de brouillon.
	 */
	mediaDraft?: ComposerMediaDraft
	/** L'envoi. Le composeur a deja monte les pieces quand il appelle. */
	onSend: (payload: {
		text: string
		attachments: UploadedAttachment[]
	}) => Promise<void> | void
	/** Admission et nettoyage terminés : l'appelant peut alors changer de route. */
	onSent?: () => void
	/** L'URL de televersement — la mutation du fil courant (1:1 ou groupe). */
	generateUploadUrl: () => Promise<string>
	/** Le micro est-il offert ? Faux dans la carte du bureau. */
	allowVoice: boolean
	/** Droit de dépôt courant ; faux ferme aussi l'admission par collage/glisser. */
	allowAttachments?: boolean
	/** Borne plus stricte d'un canal spécialisé ; admission avant téléversement. */
	maxAttachments?: number
	/** `Echap` : revenir en arriere sans rien perdre. */
	onEscape?: () => void
	/** La frappe, pour le signal « ecrit... ». */
	onTyping?: () => void
	onBlurTyping?: () => void
	/** Un refus, déjà traduit dans la langue de l'écran. */
	onError?: (message: string) => void
	autoFocus?: boolean
	disabled?: boolean
	/** Types proposés par le sélecteur de fichiers — défaut : liste blanche du serveur. */
	accept?: string
}

export function MessageComposer(props: MessageComposerProps) {
	return <MessageComposerContent key={props.contextKey ?? "local"} {...props} />
}

function MessageComposerContent({
	contextKey,
	isContextCurrent,
	value,
	onChange,
	placeholder,
	ariaLabel,
	reply,
	onCancelReply,
	editing,
	onCancelEdit,
	onSubmitEdit,
	mediaDraft,
	onSend,
	onSent,
	generateUploadUrl,
	allowVoice,
	allowAttachments = true,
	maxAttachments,
	onEscape,
	onTyping,
	onBlurTyping,
	onError,
	autoFocus = false,
	disabled = false,
	accept = MESSAGE_ATTACHMENT_ACCEPT,
}: MessageComposerProps) {
	const { t, i18n } = useTranslation("messagerie")
	const [pending, setPending] = useState<PendingMessageAttachment[]>([])
	const [uploading, setUploading] = useState(false)
	const inputRef = useRef<HTMLTextAreaElement>(null)
	const fileRef = useRef<HTMLInputElement>(null)
	const compteurRef = useRef(0)
	const operationLock = useRef(false)
	const mounted = useRef(true)
	const currentContext = useRef(contextKey)
	currentContext.current = contextKey
	useEffect(() => {
		mounted.current = true
		return () => { mounted.current = false }
	}, [])
	const operationIsCurrent = useCallback((scope: string | undefined) => mounted.current && currentContext.current === scope && (isContextCurrent?.() ?? true), [isContextCurrent])

	const enEdition = editing !== null && editing !== undefined
	/**
	 * Le texte de l'ÉDITION — local, jamais `value`.
	 *
	 * ⚠️ Semé à chaque changement de message édité, et à ce moment-là
	 * seulement : le semer à chaque rendu écraserait la frappe en cours.
	 */
	const [editText, setEditText] = useState("")
	const editIdRef = useRef<string | null>(null)
	useEffect(() => {
		const id = editing?.messageId ?? null
		if (id === editIdRef.current) return
		editIdRef.current = id
		if (id !== null) {
			setEditText(editing?.initialText ?? "")
			inputRef.current?.focus()
		}
	}, [editing?.messageId, editing?.initialText])

	/** Ce que le champ affiche : la correction, ou le brouillon. */
	const texteAffiche = enEdition ? editText : value

	/**
	 * Les pièces du message en cours, quelle que soit leur provenance. Le reste
	 * du composeur ne connaît que cette forme-là.
	 */
	const pieces: readonly ComposerPiece[] = useMemo(() => {
		if (mediaDraft !== undefined) {
			return mediaDraft.items.map((item) => ({
				localId: item.localId,
				name: item.fileName,
				size: item.sizeBytes,
				mimeType: item.mimeType,
				...(item.durationMs === undefined
					? {}
					: { durationMs: item.durationMs }),
				file: mediaDraft.fileOf(item.localId),
				storageId: uploadedStorageId(item),
			}))
		}
		return pending.map((item) => ({
			localId: item.localId,
			name: item.file.name,
			size: item.file.size,
			mimeType: item.file.type,
			...(item.durationMs === undefined ? {} : { durationMs: item.durationMs }),
			file: item.file,
			storageId: item.uploaded?.storageId ?? null,
		}))
	}, [mediaDraft, pending])

	/**
	 * Les pièces dont les OCTETS ont disparu (rechargement) sans être montées.
	 * On les nomme au lieu de les envoyer : prétendre le contraire ferait
	 * échouer l'envoi sans que rien ne l'ait annoncé.
	 */
	const aReselectionner = useMemo(
		() => pieces.filter((item) => item.file === null && item.storageId === null),
		[pieces],
	)

	useEffect(() => {
		if (autoFocus) inputRef.current?.focus()
	}, [autoFocus])

	/**
	 * La hauteur suit le contenu, plafonnee par la feuille (`max-height`).
	 *
	 * ⚠️ Deux details, et chacun se voit a l'ecran quand il manque :
	 *
	 *  · on remet `auto` D'ABORD — sans cela `scrollHeight` ne redescend jamais
	 *    quand on efface, et le champ reste haut apres l'envoi ;
	 *  · on AJOUTE les bordures. Le champ est en `box-sizing: border-box`
	 *    (defaut Tailwind) : `height` y comprend les bordures, alors que
	 *    `scrollHeight` ne les compte pas. Poser `height = scrollHeight` sous-
	 *    dimensionne donc de l'epaisseur des deux bordures, le contenu deborde
	 *    en permanence de deux pixels, et le champ affiche une BARRE DE
	 *    DEFILEMENT en etant vide. Constate a l'ecran le 2026-08-18
	 *    (scrollHeight 44 pour clientHeight 42).
	 */
	useEffect(() => {
		const node = inputRef.current
		if (node === null) return
		node.style.height = "auto"
		const styles = window.getComputedStyle(node)
		const bordures =
			(Number.parseFloat(styles.borderTopWidth) || 0) +
			(Number.parseFloat(styles.borderBottomWidth) || 0)
		node.style.height = `${node.scrollHeight + bordures}px`
	}, [texteAffiche])

	const admettre = useCallback(
		(files: FileList | File[]) => {
			if (!allowAttachments || disabled) return
			const acceptes: File[] = []
			let dejaLa = pieces.length
			for (const file of Array.from(files)) {
				if (maxAttachments !== undefined && dejaLa >= maxAttachments) {
					onError?.(t("messagerie:messagerieComposer.tooMany", { max: maxAttachments }))
					continue
				}
				const refus = attachmentRejection(
					{ file, alreadyPending: dejaLa },
					i18n.language,
					t,
				)
				if (refus !== null) {
					onError?.(refus)
					continue
				}
				acceptes.push(file)
				dejaLa += 1
			}
			if (acceptes.length === 0) return
			if (mediaDraft !== undefined) {
				mediaDraft.add(acceptes.map((file) => ({ file })))
				return
			}
			setPending((prev) => [
				...prev,
				...acceptes.map((file) => {
					compteurRef.current += 1
					return {
						file,
						localId: `pending-${String(Date.now())}-${String(compteurRef.current)}`,
					}
				}),
			])
		},
		[allowAttachments, maxAttachments, disabled, pieces.length, mediaDraft, onError, i18n.language, t],
	)

	/** Retirer une pièce, des deux côtés du même geste. */
	const retirer = useCallback(
		(localId: string) => {
			if (mediaDraft !== undefined) {
				mediaDraft.remove(localId)
				return
			}
			setPending((prev) => prev.filter((other) => other.localId !== localId))
		},
		[mediaDraft],
	)

	/** Monte un fichier et rend la forme que le serveur attend. */
	const televerser = useCallback(
		async (file: File, durationMs?: number): Promise<UploadedAttachment> => {
			const scope = contextKey
			const url = await generateUploadUrl()
			if (!operationIsCurrent(scope)) throw new AbandonedMessageSend()
			const response = await fetch(url, {
				method: "POST",
				headers: { "Content-Type": file.type },
				body: file,
			})
			if (!response.ok) {
				throw new ComposerError(t("messageComposer.uploadFailed"))
			}
			const { storageId } = (await response.json()) as { storageId: string }
			if (!operationIsCurrent(scope)) throw new AbandonedMessageSend()
			const duree =
				durationMs === undefined
					? undefined
					: voiceDurationFor(file.type, durationMs)
			return {
				storageId,
				filename: file.name,
				mimeType: file.type,
				sizeBytes: file.size,
				...(duree === undefined ? {} : { durationMs: duree }),
			}
		},
		[generateUploadUrl, contextKey, operationIsCurrent, t],
	)

	/** Enregistrer la MODIFICATION — aucun téléversement n'entre ici. */
	const enregistrerEdition = useCallback(async (): Promise<void> => {
		const texte = editText.trim()
		if (texte.length === 0 || uploading || disabled || operationLock.current) return
		const scope = contextKey
		const editedId = editing?.messageId
		operationLock.current = true
		setUploading(true)
		try {
			await onSubmitEdit?.(texte)
			if (operationIsCurrent(scope) && editIdRef.current === editedId) onCancelEdit?.()
		} catch (err) {
			if (operationIsCurrent(scope)) onError?.(texteDEchec(err, t("messageComposer.editFailed"), t))
		} finally {
			operationLock.current = false
			if (operationIsCurrent(scope)) setUploading(false)
		}
	}, [editText, uploading, disabled, contextKey, editing?.messageId, operationIsCurrent, onSubmitEdit, onCancelEdit, onError, t])

	const envoyer = useCallback(async (): Promise<void> => {
		if (disabled || operationLock.current || !operationIsCurrent(contextKey)) return
		if (enEdition) {
			await enregistrerEdition()
			return
		}
		const texte = value.trim()
		if (!canSend({ text: value, attachmentCount: pieces.length, uploading })) {
			return
		}
		// Une pièce dont les octets ont disparu ne part pas en silence : on le
		// dit, et l'envoi attend qu'elle soit retirée ou rechoisie.
		if (aReselectionner.length > 0) {
			onError?.(
				aReselectionner.length === 1
					? t("messageComposer.reselectOne", { name: aReselectionner[0]?.name ?? "" })
					: t("messageComposer.reselectMany", { n: aReselectionner.length }),
			)
			return
		}
		const aMonter = pieces
		const localIds = aMonter.map((item) => item.localId)
		const scope = contextKey
		operationLock.current = true
		setUploading(true)
		try {
			const montees = await Promise.all(
				aMonter.map(async (item) => {
					// ⚠️ Déjà montée : on réutilise le `storageId`. Retéléverser au
					// renvoi laisserait un blob orphelin que rien ne purge.
					if (item.storageId !== null) {
						const duree =
							item.durationMs === undefined
								? undefined
								: voiceDurationFor(item.mimeType, item.durationMs)
						return {
							storageId: item.storageId,
							filename: item.name,
							mimeType: item.mimeType,
							sizeBytes: item.size,
							...(duree === undefined ? {} : { durationMs: duree }),
						}
					}
					if (item.file === null) {
						throw new ComposerError(t("messageComposer.reselectPiece"))
					}
					const uploaded = await televerser(item.file, item.durationMs)
					if (!operationIsCurrent(scope)) throw new AbandonedMessageSend()
					if (mediaDraft !== undefined) {
						mediaDraft.markUploaded(item.localId, uploaded.storageId)
					} else {
						setPending((current) =>
							current.map((candidate) =>
								candidate.localId === item.localId
									? { ...candidate, uploaded }
									: candidate,
							),
						)
					}
					return uploaded
				}),
			)
			if (!operationIsCurrent(scope)) throw new AbandonedMessageSend()
			await onSend({ text: texte, attachments: montees })
			if (!operationIsCurrent(scope)) throw new AbandonedMessageSend()
			// La mutation — et pas le seul téléversement — est le point de succès.
			// Une pièce ajoutée pendant l'envoi n'appartient pas à cette intention et
			// reste donc dans la liste.
			if (mediaDraft !== undefined) mediaDraft.clear(localIds)
			else {
				const partis = new Set(localIds)
				setPending((current) =>
					current.filter((item) => !partis.has(item.localId)),
				)
			}
			onSent?.()
		} catch (err) {
			if (!operationIsCurrent(scope) || err instanceof AbandonedMessageSend) return
			// Marquer l'échec ne DÉGRADE jamais une pièce déjà montée : la règle
			// est dans `markMediaFailed`, le magasin la fait respecter.
			if (mediaDraft !== undefined) {
				for (const item of aMonter) {
					if (item.storageId === null) mediaDraft.markFailed(item.localId)
				}
			}
			onError?.(err instanceof MessageSendInProgress ? t("messageComposer.sendAlreadyPending") : texteDEchec(err, t("messageComposer.sendFailed"), t))
		} finally {
			operationLock.current = false
			if (operationIsCurrent(scope)) setUploading(false)
		}
	}, [
		enEdition,
		enregistrerEdition,
		value,
		pieces,
		aReselectionner,
		mediaDraft,
		uploading,
		televerser,
		onSend,
		onSent,
		onError,
		t,
		disabled,
		contextKey,
		operationIsCurrent,
	])

	/** Le vocal part SEUL et tout de suite : c'est le geste, il ne se compose pas. */
	const envoyerVocal = useCallback(
		async (note: {
			file: File
			durationMs: number
			mimeType: string
		}): Promise<void> => {
			if (disabled || operationLock.current || !operationIsCurrent(contextKey)) return
			const scope = contextKey
			operationLock.current = true
			setUploading(true)
			const localId = `pending-voice-${String(Date.now())}-${String(
				compteurRef.current + 1,
			)}`
			compteurRef.current += 1
			let montee: UploadedAttachment | undefined
			try {
				montee = await televerser(note.file, note.durationMs)
				if (!operationIsCurrent(scope)) throw new AbandonedMessageSend()
				await onSend({ text: "", attachments: [montee] })
				if (operationIsCurrent(scope)) onSent?.()
			} catch (error) {
				if (!operationIsCurrent(scope) || error instanceof AbandonedMessageSend) return
				// Un vocal refusé redevient une pièce prête à être renvoyée. Sa durée
				// voyage avec le fichier afin que le retry ne dégrade pas le lecteur.
				if (mediaDraft !== undefined) {
					mediaDraft.add([
						{
							file: note.file,
							durationMs: note.durationMs,
							...(montee === undefined
								? {}
								: { uploaded: { storageId: montee.storageId } }),
						},
					])
				} else {
					setPending((current) => [
						...current,
						{
							file: note.file,
							localId,
							durationMs: note.durationMs,
							...(montee === undefined ? {} : { uploaded: montee }),
						},
					])
				}
				onError?.(t("messageComposer.voiceFailed"))
			} finally {
				operationLock.current = false
				if (operationIsCurrent(scope)) setUploading(false)
			}
		},
		[televerser, onSend, onSent, onError, mediaDraft, t, disabled, contextKey, operationIsCurrent],
	)

	const onKeyDown = useCallback(
		(event: KeyboardEvent<HTMLTextAreaElement>) => {
			if (event.key === "Escape") {
				event.preventDefault()
				// ⚠️ En édition, `Échap` annule la CORRECTION et rien d'autre :
				// quitter le fil au même geste ferait perdre la conversation à qui
				// voulait seulement renoncer à une retouche (priorité IC-12 — un
				// `Échap` ne ferme que la surface supérieure).
				if (enEdition) {
					onCancelEdit?.()
					return
				}
				onEscape?.()
				return
			}
			// `Entree` envoie AU CLAVIER seulement. Sur un telephone, la touche
			// entree du clavier virtuel doit passer a la ligne : l'envoi s'y fait
			// par le bouton, et un `Entree` qui envoie y coupe les messages longs
			// en autant de messages que de retours a la ligne.
			if (event.key === "Enter" && !event.shiftKey && !isTactile()) {
				event.preventDefault()
				void envoyer()
			}
		},
		[onEscape, envoyer, enEdition, onCancelEdit],
	)

	const mode = composerMode({ text: value, attachmentCount: pieces.length })
	const peutEnvoyer = enEdition
		? editText.trim().length > 0 && !uploading
		: canSend({
				text: value,
				attachmentCount: pieces.length,
				uploading,
			}) && aReselectionner.length === 0
	// Le micro n'a pas de sens pendant une correction : on modifie du texte.
	const montreLeMicro = allowVoice && mode === "voice" && !enEdition

	return (
		<>
			{enEdition ? (
				/* Le bandeau de MODIFICATION prend la place de la citation : on ne
				   corrige pas et ne cite pas dans le même geste. Mêmes classes que
				   `ReplyPreview` en pose « composer » — une seule grammaire
				   visuelle au-dessus du champ, et aucune couleur nouvelle. */
				<div className="msg-reply-preview">
					<span style={{ flex: 1, minWidth: 0 }}>
						<span className="msg-quote-author">{t("messageComposer.editBanner")}</span>
						<span className="msg-quote-text">
							{editing?.initialText ?? ""}
						</span>
					</span>
					<button
						type="button"
						className="msg-icon-btn"
						aria-label={t("messageComposer.cancelEdit")}
						onClick={() => onCancelEdit?.()}
					>
						<X aria-hidden="true" size={15} />
					</button>
				</div>
			) : reply !== null && reply !== undefined ? (
				<ReplyPreview
					reply={reply}
					place="composer"
					onCancel={onCancelReply}
				/>
			) : null}

			{!enEdition && pieces.length > 0 ? (
				<div className="msg-pending">
					{pieces.map((item) => {
						// « À resélectionner » : les octets ont quitté la mémoire et la
						// pièce n'a jamais été montée. On le DIT — le nom conservé sert
						// à la retrouver, pas à l'envoyer.
						const perdue = item.file === null && item.storageId === null
						return (
							<span
								key={item.localId}
								className="msg-pending-chip"
								data-lost={perdue ? "true" : "false"}
								data-uploaded={item.storageId !== null ? "true" : "false"}
							>
								<span className="msg-pending-name">{item.name}</span>
								<span className="msg-file-meta">
									{perdue
										? t("messageComposer.toReselect")
										: formatBytes(item.size, i18n.language, t)}
								</span>
								{item.storageId !== null ? (
									<>
										{/* Pièce déjà au stockage : le renvoi ne la remonte pas.
										    La coche seule ne dit rien à un lecteur d'écran. */}
										<Check aria-hidden="true" size={13} />
										<span className="sr-only">{t("messageComposer.alreadyUploaded")}</span>
									</>
								) : null}
								<button
									type="button"
									className="msg-icon-btn"
									style={{ width: "var(--esp-control-min-size, 22px)", height: "var(--esp-control-min-size, 22px)" }}
									aria-label={t("messageComposer.remove", { name: item.name })}
									onClick={() => retirer(item.localId)}
								>
									<X aria-hidden="true" size={13} />
								</button>
							</span>
						)
					})}
				</div>
			) : null}

			<div className="msg-composer">
				<input
					ref={fileRef}
					type="file"
					multiple
					accept={accept}
					className="sr-only"
					disabled={disabled || !allowAttachments}
					tabIndex={-1}
					onChange={(event) => {
						if (event.target.files !== null) admettre(event.target.files)
						// Remettre a zero : sans cela, re-choisir LE MEME fichier
						// n'emet aucun `change`, et rien ne se passe.
						event.target.value = ""
					}}
				/>
				{allowAttachments ? <button
					type="button"
					className="msg-icon-btn"
					aria-label={t("messageComposer.attachFile")}
					title={t("messageComposer.attachFile")}
					// Modifier un message n'en change pas les pièces : le serveur
					// ne réécrit que le texte.
					disabled={disabled || uploading || enEdition}
					onClick={() => fileRef.current?.click()}
				>
					<Paperclip aria-hidden="true" size={17} />
				</button> : null}

				<textarea
					ref={inputRef}
					rows={1}
					value={texteAffiche}
					placeholder={enEdition ? t("messageComposer.editPlaceholder") : placeholder}
					aria-label={enEdition ? t("messageComposer.editLabel") : ariaLabel}
					disabled={disabled}
					onChange={(event) => {
						if (enEdition) {
							setEditText(event.target.value)
							return
						}
						onChange(event.target.value)
						onTyping?.()
					}}
					onKeyDown={onKeyDown}
					onBlur={() => {
						if (!enEdition) onBlurTyping?.()
					}}
				/>

				{montreLeMicro ? (
					<VoiceRecorderButton
						disabled={disabled || uploading}
						onRecorded={(note) => void envoyerVocal(note)}
						onError={onError}
					/>
				) : (
					<button
						type="button"
						className="msg-send-btn"
						data-role={enEdition ? "success" : undefined}
						aria-label={
							enEdition
								? uploading
									? t("messageComposer.saving")
									: t("messageComposer.saveEdit")
								: uploading
									? t("messageComposer.sending")
									: t("messageComposer.send")
						}
						disabled={!peutEnvoyer || disabled}
						onClick={() => void envoyer()}
					>
						{enEdition ? (
							<Check aria-hidden="true" size={16} />
						) : (
							<Send aria-hidden="true" size={16} />
						)}
					</button>
				)}
			</div>
		</>
	)
}

/**
 * L'appareil est-il tactile ? Sert UNIQUEMENT a decider si `Entree` envoie.
 *
 * `matchMedia("(pointer: coarse)")` plutot que la detection d'un agent
 * utilisateur : c'est la nature du POINTEUR qui compte, et une tablette avec
 * un clavier branche repond correctement aux deux.
 */
function isTactile(): boolean {
	if (typeof window === "undefined") return false
	if (typeof window.matchMedia !== "function") return false
	return window.matchMedia("(pointer: coarse)").matches
}
