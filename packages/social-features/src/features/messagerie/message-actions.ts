// Dupliqué de socle/packages/agent-features/src/features/messagerie/message-actions.ts @ ad2e7fdc2 — adaptations : iDocument retiré (action `enregistrerDansIDocument` et `canSaveToVault`) ; libellés par clés i18n qualifiées (`messagerie:messageActions.*`), `t` en dernier paramètre de `actionsFor` ; mutations nommées comme au moteur (`messaging.messages.*`, `groups.messages.*`).
/**
 * message-actions — ce qu'on a le droit de faire à UNE bulle.
 *
 * Module pur, testé en environnement `node` : une liste d'actions composée
 * dans le corps d'une feuille d'actions ne se vérifie qu'en appuyant
 * longuement sur un téléphone. Elle vit donc ici.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * DEUX SUPPRESSIONS, ET ELLES NE SE VALENT PAS
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * « Supprimer pour moi » agit sur MA vue : la ligne reste, l'autre la voit
 * toujours (`deleteMessageForMe`, `hiddenForPersonIds`). « Supprimer pour
 * tous » retire le corps chez tout le monde (`deleteMessage`, `deletedAt`) — et
 * le serveur ne l'accorde qu'à l'AUTEUR. Proposer la seconde sur le message d'un
 * autre, c'est promettre un geste que le serveur refusera : le refus arrive
 * après l'appui, quand on croit déjà l'avoir fait.
 *
 * ⚠️ **Le GROUPE a reçu les deux gestes de l'auteur** (lot 05, IC-13) :
 * `groups.messages.editGroupMessage` et `groups.messages.deleteGroupMessage`
 * existent, à côté de `deleteGroupMessageForMe` qui n'a pas bougé. `conversationKind` reste en
 * entrée — le BROUILLON, lui, n'a rien envoyé du tout : ni retrait ni
 * modification n'y désignent quoi que ce soit côté serveur.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * LA FENÊTRE DE QUINZE MINUTES SE JUGE ICI, PAS APRÈS L'APPUI
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * `messaging.messages.editMessage`, `messaging.messages.deleteMessage`,
 * `groups.messages.editGroupMessage` et `groups.messages.deleteGroupMessage`
 * refusent tous au-delà de `MESSAGE_EDIT_WINDOW_MS`
 * (`@antsia/social-contracts/messaging`). L'offrir quand même, c'est promettre
 * un geste qui échouera une seconde plus tard.
 *
 * ⚠️ La valeur n'est pas RECOPIÉE ici : elle arrive par le contexte
 * (`editWindowMs`), depuis le contrat que le serveur applique. Ce module
 * reste sans import de valeur — et une fenêtre INCONNUE n'est pas une fenêtre
 * ouverte : « Modifier » n'est alors pas offert (fail-closed). « Supprimer
 * pour tout le monde », lui, garde son contrat historique quand l'horloge
 * n'est pas fournie — il était offert sans elle avant ce lot.
 *
 * ⚠️ Un message DÉJÀ supprimé garde « supprimer pour moi ». Ce n'est pas une
 * redondance : la pierre tombale (« Message supprimé ») reste dans le fil, et
 * la faire disparaître de sa propre vue est le seul geste qui reste. Tout le
 * reste tombe — on ne cite pas, on ne réagit pas et on ne copie pas un message
 * dont le corps n'existe plus.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * SIGNALER (MC-01) : LE MESSAGE D'UN AUTRE, ET LUI SEUL, EN DERNIER
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Un message reçu, servi, d'un fil envoyé (1:1 ou groupe) se signale par la
 * brique commune (`ReportTargetDialog`). Jamais le sien (le moteur refuse
 * l'auto-signalement), jamais une pierre tombale (plus rien à examiner),
 * jamais un corps masqué (auteur bloqué : le moteur refuse), jamais un
 * brouillon (rien n'est parti). Bloquer depuis la conversation relève d'IC-03.
 *
 * Un seul import, de type : la fonction de traduction des libellés, reçue en
 * dernier paramètre (clés QUALIFIÉES, résolues par n'importe quel `t`).
 */

import type { TFunction } from "i18next"

/** Les neuf gestes possibles, nommés une seule fois. */
export type MessageActionId =
	| "repondre"
	| "reagir"
	| "copier"
	| "transferer"
	| "epingler"
	| "desepingler"
	| "modifier"
	| "supprimerPourMoi"
	| "supprimerPourTous"
	| "signaler"

export interface MessageAction {
	id: MessageActionId
	label: string
	/** Rendu en ton d'alerte, et jamais en premier dans la feuille. */
	destructive: boolean
}

/** La clé de libellé de chaque geste — le texte vit dans les locales. */
const LABEL_KEYS: Readonly<Record<MessageActionId, string>> = Object.freeze({
	repondre: "messagerie:messageActions.reply",
	reagir: "messagerie:messageActions.react",
	copier: "messagerie:messageActions.copy",
	transferer: "messagerie:messageActions.forward",
	epingler: "messagerie:messageActions.pin",
	desepingler: "messagerie:messageActions.unpin",
	modifier: "messagerie:messageActions.edit",
	supprimerPourMoi: "messagerie:messageActions.deleteForMe",
	supprimerPourTous: "messagerie:messageActions.deleteForEveryone",
	signaler: "messagerie:messageActions.report",
})

/** L'ordre d'affichage — les destructions en bas, toujours. */
const ORDRE: readonly MessageActionId[] = Object.freeze([
	"repondre",
	"reagir",
	"copier",
	"transferer",
	"epingler",
	"desepingler",
	"modifier",
	"supprimerPourMoi",
	"supprimerPourTous",
	"signaler",
])

export interface MessageActionContext {
	/**
	 * Le genre de fil. `chat` et `groupe` portent les gestes de l'auteur
	 * (« modifier », « supprimer pour tout le monde ») ; le BROUILLON n'a
	 * encore rien envoyé, il n'en porte aucun. Absent, on suppose `chat` :
	 * c'est le seul appelant qui existait avant les groupes.
	 */
	conversationKind?: "chat" | "groupe" | "draft"
	/** Ce message est-il de moi ? Seul l'auteur supprime pour tout le monde. */
	mine: boolean
	/** Déjà retiré pour tout le monde. */
	deleted: boolean
	/** Porte-t-il des pièces jointes ? */
	hasAttachments: boolean
	/**
	 * La citation est-elle possible ici ? `false` sur un brouillon (le fil
	 * n'existe pas encore, `replyToMessageId` n'aurait rien à désigner).
	 */
	canReply: boolean
	/**
	 * Porte-t-il du TEXTE à copier ? Absent, on le DÉDUIT des pièces : un
	 * message qui en porte est présumé être ses pièces (photo sans légende,
	 * vocal), un message sans pièce est présumé être du texte. L'inférence
	 * n'existe que pour éviter d'offrir « Copier » sur un vocal — un appui qui
	 * remplirait le presse-papier de rien.
	 */
	hasText?: boolean
	/** L'instant d'ENVOI du message — début de la fenêtre. */
	createdAt?: number
	/** L'instant COURANT. Fourni par l'appelant : ce module est pur. */
	now?: number
	/**
	 * La durée de la fenêtre — `MESSAGE_EDIT_WINDOW_MS`, jamais un nombre
	 * écrit ici : c'est la valeur que le serveur applique, importée par
	 * l'appelant depuis `@antsia/social-contracts/messaging`.
	 */
	editWindowMs?: number
	/**
	 * Le corps m'est MASQUÉ (auteur bloqué, groupe). Le transfert ne s'offre
	 * pas : le serveur le refuserait — le transfert serait le seul endroit où
	 * ce contenu survivrait (ADR-0143 §5).
	 */
	masked?: boolean
	/**
	 * Ce message est-il l'ÉPINGLE du fil ? Sert à choisir entre « Épingler »
	 * et « Désépingler » — un seul message épinglé par conversation.
	 */
	pinned?: boolean
	/**
	 * Puis-je épingler ICI ? En 1:1, les deux participants ; en groupe, le
	 * rôle de canal (`owner`/`admin`). ⚠️ INCONNU ⇒ non offert (fail-closed) :
	 * un appelant qui ne dit pas le droit n'obtient pas le geste.
	 */
	canPin?: boolean
}

/**
 * La fenêtre de l'auteur, telle qu'on peut en parler.
 *
 * TROIS états, et le troisième compte : « inconnue » n'est ni ouverte ni
 * fermée. Les deux gestes n'en tirent pas la même conclusion — cf. en-tête.
 */
export function editWindowState(
	context: Pick<MessageActionContext, "createdAt" | "now" | "editWindowMs">,
): "open" | "expired" | "unknown" {
	const { createdAt, now, editWindowMs } = context
	if (
		createdAt === undefined ||
		now === undefined ||
		editWindowMs === undefined ||
		!Number.isFinite(createdAt) ||
		!Number.isFinite(now) ||
		!Number.isFinite(editWindowMs)
	) {
		return "unknown"
	}
	return now - createdAt <= editWindowMs ? "open" : "expired"
}

/**
 * Les actions offertes sur une bulle, dans l'ordre d'affichage.
 *
 * Toujours au moins une (`supprimerPourMoi`) : une feuille d'actions vide qui
 * s'ouvre sur un appui long est un défaut qu'on prend pour un plantage.
 */
export function actionsFor(
	context: MessageActionContext,
	t: TFunction,
): readonly MessageAction[] {
	const retenues = new Set<MessageActionId>()

	if (!context.deleted) {
		if (context.canReply) retenues.add("repondre")
		retenues.add("reagir")
		const aDuTexte = context.hasText ?? !context.hasAttachments
		if (aDuTexte) retenues.add("copier")
	}

	// Masquer une pierre tombale reste légitime : d'où l'absence de garde.
	retenues.add("supprimerPourMoi")

	const kind = context.conversationKind ?? "chat"
	// Un BROUILLON n'a rien envoyé : aucun de ces gestes n'y désigne un
	// message du serveur.
	const filEnvoye = kind === "chat" || kind === "groupe"
	const fenetre = editWindowState(context)

	// TRANSFÉRER (ADR-0143 §5) : tout message servi, y compris celui d'un
	// autre — c'est le principe. Jamais un masqué : le serveur refuse, et
	// l'offrir promettrait un geste qui échoue à l'appui.
	if (!context.deleted && context.masked !== true && filEnvoye) {
		retenues.add("transferer")
	}

	// ÉPINGLER / DÉSÉPINGLER : le droit se DIT (`canPin`) — inconnu, le geste
	// n'existe pas. Sur le message épinglé, c'est le retrait qui s'offre.
	if (!context.deleted && filEnvoye && context.canPin === true) {
		retenues.add(context.pinned === true ? "desepingler" : "epingler")
	}

	if (
		context.mine &&
		!context.deleted &&
		filEnvoye &&
		fenetre !== "expired"
	) {
		retenues.add("supprimerPourTous")
	}

	// « Modifier » exige un texte à réécrire ET une fenêtre CONNUE et ouverte.
	if (
		context.mine &&
		!context.deleted &&
		filEnvoye &&
		fenetre === "open" &&
		(context.hasText ?? !context.hasAttachments)
	) {
		retenues.add("modifier")
	}

	// SIGNALER (MC-01) : le message servi d'un AUTRE, dans un fil envoyé.
	if (!context.mine && !context.deleted && filEnvoye && context.masked !== true) {
		retenues.add("signaler")
	}

	return ORDRE.filter((id) => retenues.has(id)).map((id) => ({
		id,
		label: t(LABEL_KEYS[id]),
		destructive: id === "supprimerPourMoi" || id === "supprimerPourTous" || id === "signaler",
	}))
}
