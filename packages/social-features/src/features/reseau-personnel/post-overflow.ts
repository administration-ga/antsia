// Dupliqué de socle/packages/agent-features/src/features/reseau-personnel/post-overflow.ts @ ad2e7fdc2 — adaptations : libellés et indications par l'i18n — `overflowEntriesFor` et `undoLabelFor` reçoivent `t` en DERNIER paramètre (clés qualifiées `reseau:postOverflow.*`) et rendent toujours des textes (forme de `PostOverflowEntry` inchangée) ; ajout de `postEngineErrorText(error, fallbackKey, t)`, le texte d'un refus du moteur pour tous les gestes sur une publication (règle du domaine, sinon code, sinon la phrase de l'écran) ; la PAGE est celle du moteur (institution, association, entreprise, média, communauté) au lieu d'une administration, la sourdine vise une personne (`targetPersonId`) ; « Bloquer l'auteur » (PF-01), pour une personne seulement (`canBlockAuthor`), avant « Signaler ».
/**
 * post-overflow — ce que le menu « … » d'une publication propose, et à qui.
 *
 * La composition du menu vit ici, où elle est vérifiable en environnement
 * `node`, et non dans une suite de ternaires au milieu d'un composant. Aucune
 * phrase n'y est écrite : les fonctions reçoivent `t` en dernier paramètre et
 * n'emploient que des clés qualifiées.
 *
 * ⚠️ **Sur SA PROPRE publication, le menu change de nature.** Masquer,
 * mettre en sourdine et signaler n'ont aucun sens sur soi-même : se masquer,
 * c'est se retirer de son propre fil sans qu'aucun écran ne dise pourquoi ; se
 * signaler, c'est occuper une file de modération pour rien. L'auteur a
 * quatre gestes : enregistrer, modifier, épingler, retirer.
 *
 * ⚠️ **Modifier et Épingler vivent ICI depuis le 2026-08-21** (décision
 * utilisateur : cartes compactes, icônes d'abord). Ils occupaient une rangée
 * de boutons TEXTE sous l'en-tête de chaque publication de l'auteur — une
 * ligne entière de chrome sur chacune de ses cartes, pour deux gestes rares.
 * C'est aussi là que tout réseau social les range, et l'habitude compte.
 * L'épinglage reste PERSONNEL : une publication de groupe s'épingle dans son
 * groupe, par ses modérateurs (T5) — d'où `canPin`.
 *
 * ⚠️ **Sur la publication d'une PAGE, les gestes qui visent une personne
 * tombent.** Une page ne se met pas en sourdine : `muteAuthor` porte sur une
 * personne (`targetPersonId`) et ferait taire le SIGNATAIRE — ses publications
 * personnelles comprises — sans rien changer à la page que le lecteur croyait
 * viser. D'une page on se désabonne, depuis sa page.
 * Restent les gestes qui portent sur la PUBLICATION : l'enregistrer, être
 * averti de ses commentaires, la masquer, la signaler.
 */

import { engineErrorCode, engineErrorRule } from "@antsia/social-contracts/errors"
import type { TFunction } from "i18next"

import { authorIsMutable, type AuthorKind } from "./author-link"

export type PostOverflowAction =
	| "bookmark"
	| "edit"
	| "pin"
	| "notify"
	| "hide"
	| "mute_author"
	| "block_author"
	| "report"
	| "remove"

export interface PostOverflowEntry {
	id: PostOverflowAction
	label: string
	/** Ce que l'action fait — le menu ne laisse pas deviner. */
	hint: string
	/** Action DESTRUCTRICE ou signalante : rendue à part, en fin de menu. */
	grave: boolean
}

export interface PostOverflowInput {
	isOwn: boolean
	/**
	 * L'épinglage personnel vaut-il pour CETTE publication ? Faux pour une
	 * publication de groupe (elle s'épingle dans son groupe, par ses
	 * modérateurs) — l'entrée DISPARAÎT alors, elle ne se grise pas : un geste
	 * qui n'existe pas n'est pas un geste fermé. Ignoré quand `isOwn` est faux.
	 */
	canPin: boolean
	bookmarked: boolean
	notifying: boolean
	/** Nom de l'auteur, pour nommer la mise en sourdine. Jamais « cette personne ». */
	authorName: string
	/**
	 * Le genre de l'auteur — une PAGE n'expose pas les mêmes gestes qu'une
	 * personne.
	 *
	 * ⚠️ Optionnel bien que le serveur le rende toujours : un navigateur qui
	 * porte le JS neuf face à un backend encore ancien ne le reçoit pas, et
	 * l'absence doit valoir « personne » — le menu d'avant les pages — plutôt
	 * que de faire tomber la carte. Même tolérance que `viewer` dans `PostCard`.
	 */
	authorKind?: AuthorKind
	/**
	 * Le signalement est-il servi par une file de modération ?
	 *
	 * ⚠️ Un « Signaler » qui n'aboutit nulle part est pire que pas de bouton :
	 * il fait croire qu'un humain va lire. L'entrée n'apparaît donc que
	 * lorsqu'il existe une file pour l'instruire.
	 */
	canReport: boolean
	/**
	 * Bloquer l'auteur (PF-01) se propose-t-il ? Seulement pour une PERSONNE
	 * native identifiée : une page ne se bloque pas (on s'en désabonne), et un
	 * reflet sans signataire local n'a personne à bloquer. Absent : non.
	 */
	canBlockAuthor?: boolean
}

/**
 * Les entrées du menu, dans l'ordre du rendu.
 *
 * Les libellés BASCULENT selon l'état : « Enregistrer » devient « Retirer des
 * enregistrements ». Un menu qui proposerait toujours « Enregistrer » sur une
 * publication déjà enregistrée ferait douter de ce qu'il a compris.
 */
export function overflowEntriesFor(
	input: PostOverflowInput,
	t: TFunction,
): readonly PostOverflowEntry[] {
	const bookmark: PostOverflowEntry = {
		id: "bookmark",
		label: input.bookmarked
			? t("reseau:postOverflow.bookmark.removeLabel")
			: t("reseau:postOverflow.bookmark.addLabel"),
		hint: input.bookmarked
			? t("reseau:postOverflow.bookmark.removeHint")
			: t("reseau:postOverflow.bookmark.addHint"),
		grave: false,
	}

	if (input.isOwn) {
		const own: PostOverflowEntry[] = [
			{
				id: "edit",
				label: t("reseau:postOverflow.edit.label"),
				hint: t("reseau:postOverflow.edit.hint"),
				grave: false,
			},
		]
		if (input.canPin) {
			own.push({
				id: "pin",
				label: t("reseau:postOverflow.pin.label"),
				hint: t("reseau:postOverflow.pin.hint"),
				grave: false,
			})
		}
		own.push(bookmark, {
			id: "remove",
			label: t("reseau:postOverflow.remove.label"),
			hint: t("reseau:postOverflow.remove.hint"),
			grave: true,
		})
		return Object.freeze(own)
	}

	// Décision UNIQUE, partagée avec l'en-tête de la carte (`author-link.ts`) :
	// le menu et le lien ne peuvent pas diverger sur ce qu'est l'auteur.
	// L'adresse n'entre pas dans cette décision — le menu n'en a pas besoin.
	const canMuteAuthor = authorIsMutable({
		authorKind: input.authorKind,
		handle: null,
	})

	const others: PostOverflowEntry[] = [
		bookmark,
		{
			id: "notify",
			label: input.notifying
				? t("reseau:postOverflow.notify.offLabel")
				: t("reseau:postOverflow.notify.onLabel"),
			hint: input.notifying
				? t("reseau:postOverflow.notify.offHint")
				: t("reseau:postOverflow.notify.onHint"),
			grave: false,
		},
		{
			id: "hide",
			label: t("reseau:postOverflow.hide.label"),
			hint: t("reseau:postOverflow.hide.hint"),
			grave: false,
		},
	]
	if (canMuteAuthor) {
		others.push({
			id: "mute_author",
			label: t("reseau:postOverflow.muteAuthor.label", { name: input.authorName }),
			hint: t("reseau:postOverflow.muteAuthor.hint"),
			grave: false,
		})
	}
	// Bloquer est un geste GRAVE (confirmé ensuite), rangé avec le signalement en
	// fin de menu ; « Signaler » reste la dernière entrée, atteinte par Flèche haut.
	if (canMuteAuthor && input.canBlockAuthor === true) {
		others.push({
			id: "block_author",
			label: t("reseau:postOverflow.blockAuthor.label", { name: input.authorName }),
			hint: t("reseau:postOverflow.blockAuthor.hint"),
			grave: true,
		})
	}
	if (input.canReport) {
		others.push({
			id: "report",
			label: t("reseau:postOverflow.report.label"),
			hint: t("reseau:postOverflow.report.hint"),
			grave: true,
		})
	}
	return Object.freeze(others)
}

/** Le libellé du toast d'annulation, et l'action qui le défait. */
export function undoLabelFor(
	action: Extract<PostOverflowAction, "hide" | "mute_author">,
	authorName: string,
	t: TFunction,
): string {
	return action === "hide"
		? t("reseau:postOverflow.undo.hidden")
		: t("reseau:postOverflow.undo.muted", { name: authorName })
}

/**
 * Le texte d'un REFUS du moteur sur un geste de publication — publier, réagir,
 * commenter, relayer, signaler, et les gestes du menu « … » : la règle du
 * domaine enfreinte (espace `rules`, ses bornes en paramètres), sinon le code
 * du moteur (espace `errors`), sinon la phrase de l'écran (`fallbackKey`, clé
 * qualifiée).
 *
 * ⚠️ Jamais `error.message` : Convex y verse la trace serveur en
 * développement, et « Server Error » en production — qui ne dit rien.
 */
export function postEngineErrorText(error: unknown, fallbackKey: string, t: TFunction): string {
	const rule = engineErrorRule(error)
	if (rule !== null) return t(`rules:${rule.rule}`, rule.params)
	const code = engineErrorCode(error)
	if (code !== null) return t(`errors:${code}`)
	return t(fallbackKey)
}
