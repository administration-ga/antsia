// Dupliqué de socle/packages/agent-features/src/features/stories/stories-tray.ts @ ad2e7fdc2 — adaptations : auteur du plateau du moteur (`personId` au lieu de `userId`, nom nullable du contrat `counterpartLabel`, dit par un libellé neutre traduit — `storyAuthorName`) ; vignette `cover` toujours portée par le moteur (champ de compatibilité `coverUrl` et son repli retirés) ; âge et nom accessible traduits (`t` en dernier paramètre, clés `stories:storiesTray.*`) ; instant arrondi des lectures du serveur (`storyQueryInstant` : le moteur ne lit pas l'horloge dans une requête) ; libellé court d'un médaillon (`storyAuthorShortName`, le prénom) pour la présentation « rings » (ADR-0027).
/**
 * stories-tray — ce que la BARRE de stories montre, et dans quel ordre.
 *
 * Le socle testait ses surfaces en environnement `node`, SANS
 * testing-library : ce qui reste dans le corps d'un composant n'y était
 * vérifiable qu'à l'œil. L'ordre des vignettes, l'anneau que chacune porte,
 * l'existence même de la barre et l'âge affiché vivent donc ici, où c'est
 * vérifiable. `StoriesTray.tsx` ne fait qu'appliquer ces décisions.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * POURQUOI RETRIER CE QUE LE SERVEUR A DÉJÀ TRIÉ
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * `stories.tray` rend ses groupes dans l'ordre — moi, non-vus, vus. Ce module
 * le REFAIT, et ce n'est pas un doublon inutile : l'écran compose sa barre à
 * partir d'une réponse qui peut être servie depuis un cache, fusionnée avec
 * une story publiée à l'instant, ou rendue partiellement pendant un
 * rechargement. Un ordre qui ne tient qu'au serveur se défait au premier de
 * ces cas, et une vignette « moi » qui glisse au milieu de la rangée est
 * exactement le défaut qu'on ne voit pas en relisant le code.
 *
 * ⚠️ L'identité de « moi » passe par le HANDLE, comme au socle : l'écran qui
 * monte cette barre connaît son propre profil de réseau — donc son handle. Un
 * handle absent (`null`, profil non publié) ne désigne alors PERSONNE : c'est
 * un cas normal, pas un défaut à rattraper.
 *
 * Aucun import d'exécution : ce module ne connaît que des données de plateau
 * (et la fonction de traduction qu'on lui passe).
 */

import type { TFunction } from "i18next"

/**
 * L'auteur d'un groupe du plateau — sous-ensemble LU du DTO du moteur
 * (`TrayGroup.author` : `counterpartLabel` plus `personId`).
 */
export interface StoryTrayAuthor {
	personId: string
	/** `null` quand la personne n'a pas publié de profil de réseau. */
	handle: string | null
	/**
	 * `null` : rien à nommer (contrat `counterpartLabel` du moteur) — l'écran
	 * dit alors le libellé neutre traduit (`storyAuthorName`).
	 */
	displayName: string | null
	avatarUrl: string | null
}

/** La vignette d'un groupe, avec le KIND qui décide de son élément. */
export interface StoryTrayCover {
	url: string
	kind: "image" | "video"
}

/**
 * Un groupe du plateau : tout ce qu'une vignette a besoin d'afficher.
 *
 * Type STRUCTUREL, volontairement : le DTO de
 * `api.modules.stories.stories.tray` le satisfait tel quel (un
 * `Id<"persons">` est une chaîne), et ce module reste lisible sans le backend.
 */
export interface StoryTrayGroup {
	author: StoryTrayAuthor
	storyCount: number
	unseenCount: number
	latestPublishedAt: number
	/**
	 * Le média le plus récent dont la garde des fichiers sert l'URL. Toujours
	 * porté : le moteur écarte du plateau un groupe qui n'en a aucun.
	 */
	cover: StoryTrayCover
}

/**
 * La vignette à rendre — et dans QUEL élément.
 *
 * Une vidéo se rend en <video> muet (première image) : son URL dans une
 * <img> n'affiche RIEN, et c'est exactement le dégradé gris que montrait
 * tout auteur dont la story la plus récente était une vidéo (constaté au
 * socle le 2026-08-20).
 */
export function trayCoverFor(group: StoryTrayGroup): StoryTrayCover {
	return group.cover
}

/**
 * Le nom à dire d'un auteur : le sien, ou le libellé NEUTRE quand le moteur
 * n'a rien à nommer (profil retiré et aucun nom choisi). Jamais une chaîne
 * vide à l'écran ni dans un nom accessible.
 */
export function storyAuthorName(
	displayName: string | null,
	t: TFunction,
): string {
	return displayName ?? t("stories:storiesTray.unknownAuthor")
}

/**
 * Le libellé COURT d'un médaillon (présentation « rings ») : le prénom. Les noms
 * de personnes écrivent le NOM en majuscules (« Awa NDONG », « NDONG MBA Awa ») :
 * c'est le premier mot qui n'est pas en majuscules ; à défaut, le premier mot.
 * Un auteur sans nom garde le libellé neutre. La phrase complète reste dans le
 * nom accessible de la tuile (`trayTileLabel`).
 */
export function storyAuthorShortName(
	displayName: string | null,
	t: TFunction,
): string {
	const words = (displayName ?? "").trim().split(/\s+/).filter((word) => word.length > 0)
	const first = words[0]
	if (first === undefined) return t("stories:storiesTray.unknownAuthor")
	const isSurname = (word: string) => word === word.toLocaleUpperCase("fr") && word !== word.toLocaleLowerCase("fr")
	return words.find((word) => !isSurname(word)) ?? first
}

/**
 * Le PAS de l'instant passé aux lectures du serveur (`tray`, `listByAuthor`,
 * `myActive`) — cinq minutes, rien n'expire plus finement dans un contenu de
 * vingt-quatre heures.
 */
export const STORY_QUERY_STEP_MS = 5 * 60_000

/**
 * L'instant des LECTURES du serveur. Le moteur ne lit pas l'horloge dans une
 * requête : l'écran la lui passe (`now`). Arrondi au pas INFÉRIEUR, il est
 * STABLE entre deux rendus — un instant qui bougerait à chaque rendu referait
 * l'abonnement à chaque rendu — et le MÊME pour tous les écrans ouverts dans
 * le même pas : la barre du fil et le lecteur partagent alors leur
 * abonnement, et le lecteur s'ouvre sans attendre.
 */
export function storyQueryInstant(
	now: number,
	stepMs: number = STORY_QUERY_STEP_MS,
): number {
	if (!Number.isFinite(stepMs) || stepMs <= 0) return now
	return Math.floor(now / stepMs) * stepMs
}

/** L'anneau d'une vignette — trois états, jamais deux. */
export type StoryRingState = "self" | "unseen" | "seen"

/**
 * Ce groupe est-il le MIEN ?
 *
 * Un handle nul des deux côtés ne fait pas une égalité : deux personnes sans
 * profil publié ne sont pas la même personne, et l'écrire naïvement
 * (`a === b`) rendrait `true` — la première vignette venue passerait pour la
 * sienne, anneau « self » compris.
 */
function isSelf(group: StoryTrayGroup, selfHandle: string | null): boolean {
	if (selfHandle === null || selfHandle.length === 0) return false
	return group.author.handle === selfHandle
}

/**
 * L'ordre de la rangée : MOI d'abord, puis ce que je n'ai pas vu du plus
 * récent au plus ancien, puis le reste, du plus récent au plus ancien.
 *
 * C'est le seul tri qui fait qu'une barre SE VIDE en la regardant : les
 * vignettes déjà consommées reculent d'elles-mêmes, sans qu'on ait à les
 * masquer — les masquer priverait de la possibilité de revoir une story.
 *
 * Fonction PURE : le tableau reçu n'est jamais muté (`sort` opère sur une
 * copie), parce qu'il vient d'un cache de requête partagé par d'autres écrans.
 */
export function orderTray(
	groups: readonly StoryTrayGroup[],
	selfHandle: string | null,
): StoryTrayGroup[] {
	return [...groups].sort((left, right) => {
		const leftMine = isSelf(left, selfHandle)
		const rightMine = isSelf(right, selfHandle)
		if (leftMine !== rightMine) return leftMine ? -1 : 1

		const leftUnseen = left.unseenCount > 0
		const rightUnseen = right.unseenCount > 0
		if (leftUnseen !== rightUnseen) return leftUnseen ? -1 : 1

		return right.latestPublishedAt - left.latestPublishedAt
	})
}

/**
 * L'anneau d'une vignette.
 *
 * ⚠️ « moi » l'emporte sur « non vu », et cet ordre n'est pas négociable :
 * `markSeen` refuse d'écrire une vue pour l'auteur d'une story (cf.
 * `stories.ts`), si bien qu'une pastille « non vue » posée sur sa propre
 * vignette ne s'éteindrait JAMAIS. Une pastille qui ne s'éteint pas est pire
 * qu'une pastille absente.
 */
export function ringStateFor(
	group: StoryTrayGroup,
	selfHandle: string | null,
): StoryRingState {
	if (isSelf(group, selfHandle)) return "self"
	return group.unseenCount > 0 ? "unseen" : "seen"
}

/**
 * L'anneau DESSINÉ d'un médaillon. En présentation « rings » (maquette des
 * chartes, ADR-0027), ma série porte le dégradé du thème, comme une série à
 * voir : la maquette n'a pas d'anneau pâle, et un filet discret autour de
 * « Vous » se lisait comme une série déjà vue. Les cartes gardent les trois
 * états tels quels.
 */
export function drawnRingState(
	state: StoryRingState,
	rings: boolean,
): StoryRingState {
	return rings && state === "self" ? "unseen" : state
}

/**
 * La barre est-elle rendue ?
 *
 * Elle l'est dès qu'il y a QUELQUE CHOSE à faire : au moins une story à
 * regarder, ou le droit d'en publier une (la tuile « Créer »). Une rangée
 * réduite à une tuile de création est une invitation ; une rangée vide est une
 * bande morte de 96 px en tête du fil.
 */
export function trayVisible(
	groups: readonly StoryTrayGroup[],
	canCreate: boolean,
): boolean {
	return groups.length > 0 || canCreate
}

/**
 * L'âge d'une story, dit court.
 *
 * Une story vit vingt-quatre heures : les jours, les mois et les dates n'ont
 * donc aucun sens ici, et c'est ce qui distingue cette fonction de
 * `formatRelativeDate` (`reseau-personnel/shared.ts`), qui, elle, sert des
 * publications permanentes. Au-delà de la fenêtre, on ne fabrique pas un
 * « il y a 31 h » qui contredirait la promesse d'éphémérité : on dit
 * « expirée ».
 *
 * `now` est un PARAMÈTRE et non `Date.now()` : c'est ce qui rend la fonction
 * testable sans geler l'horloge.
 */
export function storyAgeLabel(at: number, now: number, t: TFunction): string {
	const elapsed = now - at
	// Une horloge client en avance sur le serveur rend un écart NÉGATIF. Dire
	// « dans 2 min » d'une story déjà publiée serait absurde ; « à l'instant »
	// est vrai à la seconde près, ce qui suffit ici.
	if (elapsed < 60_000) return t("stories:storiesTray.age.justNow")
	if (elapsed >= 24 * 60 * 60 * 1000) return t("stories:storiesTray.age.expired")

	const minutes = Math.floor(elapsed / 60_000)
	if (minutes < 60) return t("stories:storiesTray.age.minutes", { minutes })
	return t("stories:storiesTray.age.hours", { hours: Math.floor(minutes / 60) })
}

/**
 * Le nom ACCESSIBLE d'une vignette.
 *
 * Une vignette n'est qu'une photo ronde et un prénom : sans cette phrase, un
 * lecteur d'écran annonce « bouton, Marie » sans dire ni ce qu'il y a derrière,
 * ni combien, ni si c'est nouveau. Le décompte des non-vues n'est énoncé que
 * s'il y en a — « 0 non vue » n'apprend rien.
 *
 * L'ÂGE n'est ajouté que si `now` est fourni. C'est l'information qui manque
 * le plus à qui ne voit pas l'écran : une story est éphémère, et savoir qu'il
 * en reste deux heures change la décision de l'ouvrir maintenant. La rangée
 * visible, elle, ne l'écrit pas — soixante-seize pixels de large n'en portent
 * pas la place.
 */
export function trayTileLabel(
	group: StoryTrayGroup,
	selfHandle: string | null,
	now: number | undefined,
	t: TFunction,
): string {
	const owner = isSelf(group, selfHandle)
		? t("stories:storiesTray.tile.own")
		: t("stories:storiesTray.tile.author", {
				name: storyAuthorName(group.author.displayName, t),
			})
	const count = t("stories:storiesTray.tile.storyCount", {
		count: group.storyCount,
	})

	const parts = [owner, count]
	if (group.unseenCount > 0) {
		parts.push(
			t("stories:storiesTray.tile.unseenCount", { count: group.unseenCount }),
		)
	}
	if (now !== undefined) {
		parts.push(storyAgeLabel(group.latestPublishedAt, now, t))
	}
	return parts.join(", ")
}
