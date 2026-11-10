// Dupliqué de socle/packages/agent-features/src/features/stories/StoriesTray.tsx @ ad2e7fdc2 — adaptations : branché sur `stories.stories.tray` du moteur (réseau de `useNetwork()`, instant ARRONDI des lectures tiré de l'horloge de l'écran — `storyQueryInstant` — et plateau du pas précédent gardé pendant que le pas suivant s'abonne : la rangée ne clignote pas) ; propriété `surface` (ADR-0079 du socle) retirée avec les surfaces du moteur ; vignette toujours portée (repli du champ `coverUrl` retiré) ; auteur au contrat `counterpartLabel` (`personId`, nom nullable dit par le libellé neutre) ; libellés traduits (clés `stories:storiesTray.*`) ; présentation « rings » déclarée par l'application (`storiesPresentation`, ADR-0027) : médaillons ronds dans leur anneau et prénom dessous, « Vous » et son « + » en tête, ma série en ligne fusionnée dans « Vous » (médaillon dans le dégradé du thème qui l'ouvre, « + » frère qui en crée une, ADR-0028) — les cartes restent le défaut.
"use client"

/**
 * StoriesTray — la barre de stories, en tête du fil.
 *
 * Montée AUX DEUX PALIERS : sur le fil du téléphone et au-dessus du composeur
 * sur le bureau — et dans les Actus d'iCom. C'est le même bandeau, la même
 * requête et le même ordre — une barre qui n'existerait qu'au téléphone ferait
 * disparaître les stories de la moitié des usages, et une seconde
 * implémentation pour le bureau aurait divergé au premier correctif.
 *
 * ⚠️ Ce composant ne DÉCIDE rien : l'ordre des vignettes, l'anneau de chacune,
 * l'existence même de la rangée et le nom accessible viennent tous de
 * `stories-tray.ts`, module pur et testé.
 *
 * ⚠️ La rangée disparaît PENDANT LE PREMIER CHARGEMENT plutôt que de réserver
 * sa place : une ossature en tête du fil déplacerait tout le contenu d'un cran
 * au moment où la réponse arrive, et c'est exactement le saut de mise en page
 * qu'on reproche aux fils sociaux. Une barre absente puis présente pousse une
 * fois ; une ossature pousse deux fois.
 *
 * ⚠️ L'instant passé au serveur avance par PAS (`storyQueryInstant`) : chaque
 * pas refait l'abonnement, et le plateau du pas précédent reste affiché le
 * temps que le suivant réponde — sans quoi la rangée disparaîtrait et
 * reviendrait toutes les cinq minutes, ce même saut de mise en page.
 *
 * ── DES CARTES, PLUS DES PASTILLES (arbitrage du 2026-08-20) ──────────────
 * La rangée montrait des anneaux ronds de 64 px surmontant un prénom : la
 * VIGNETTE de l'actu — ce que la personne vient de publier — y tenait dans un
 * disque de la taille d'un ongle, et rien ne donnait envie de l'ouvrir. Elle
 * montre désormais des cartes verticales où le média occupe TOUT le cadre,
 * l'auteur revenant en médaillon dans le coin. L'anneau n'a pas disparu : il
 * entoure ce médaillon, et continue de dire vu / pas vu / à moi.
 *
 * Le voile de lisibilité est celui du lecteur plein écran (`esp-story-shade`)
 * et non un dégradé de plus : un texte clair sur une photo claire est
 * illisible, et le mesurer ne servirait à rien — le contraste dépend de
 * l'image, pas du thème.
 */

import { api } from "@antsia/api/engine"
import { useAuthenticatedConvexQuery } from "@antsia/api/hooks"
import { useNetwork } from "@antsia/api/network"
import { Icon } from "@antsia/ui"
import type { FunctionReturnType } from "convex/server"
import { useEffect, useState } from "react"
import { useTranslation } from "react-i18next"
import { StoryRing } from "./StoryRing"
import {
	drawnRingState,
	orderTray,
	ringStateFor,
	storyAuthorName,
	storyAuthorShortName,
	storyQueryInstant,
	trayCoverFor,
	trayTileLabel,
	trayVisible,
	type StoryTrayGroup,
} from "./stories-tray"

type TrayResult = FunctionReturnType<typeof api.modules.stories.stories.tray>

export interface StoriesTrayProps {
	/** Mon handle de réseau — `null` tant que le profil n'est pas publié. */
	myHandle: string | null
	/** Ouvrir la série d'un auteur (le lecteur plein écran). */
	onOpen: (handle: string | null) => void
	/** Ouvrir le composeur de story. */
	onCreate: () => void
	/** Le droit de créer, fourni par l'application ; la lecture reste ouverte. */
	canCreate?: boolean
	/** L'horloge de l'écran — passée, jamais lue ici (cf. `storyAgeLabel`). */
	now: number
	/**
	 * MON portrait, pour le fond de la carte de création — le geste se
	 * présente comme la première actu de la rangée, la mienne. Absent, la
	 * carte reste neutre : aucune requête n'est faite pour l'obtenir.
	 */
	myAvatarUrl?: string | null
}

export function StoriesTray({
	myHandle,
	onOpen,
	onCreate,
	canCreate = true,
	now,
	myAvatarUrl = null,
}: StoriesTrayProps) {
	const { t } = useTranslation("stories")
	const { networkId, personId, storiesPresentation } = useNetwork()
	// Médaillons ronds si l'application les déclare (ADR-0027) ; sinon les cartes.
	const rings = storiesPresentation === "rings"
	const tray = useAuthenticatedConvexQuery(api.modules.stories.stories.tray, {
		networkId,
		now: storyQueryInstant(now),
	})

	// Le plateau du pas PRÉCÉDENT, gardé pendant que le nouveau pas s'abonne —
	// et jamais celui d'un AUTRE réseau ou lecteur, même sans démontage.
	const [settled, setSettled] = useState<{
		networkId: string
		personId: string
		data: TrayResult
	} | null>(null)
	useEffect(() => {
		if (tray.data !== undefined) setSettled({ networkId, personId, data: tray.data })
		else setSettled((previous) => previous?.networkId === networkId && previous.personId === personId ? previous : null)
	}, [tray.data, networkId, personId])
	const data =
		tray.data ??
		(settled !== null && settled.networkId === networkId && settled.personId === personId
			? settled.data
			: undefined)

	// ⚠️ `data === undefined` distingue « pas encore chargé » de « rien à
	// montrer ». Les confondre (`?? []` puis `length === 0`) ferait affirmer à
	// l'écran qu'il n'y a aucune story pendant que la réponse est en vol.
	if (data === undefined) return null
	const groups: StoryTrayGroup[] = data.groups
	if (!trayVisible(groups, canCreate)) return null

	const ordered = orderTray(groups, myHandle)
	// Médaillons : MA série rejoint la tuile « Vous » — une seule tuile, comme
	// la maquette des chartes ; le médaillon l'ouvre, le « + » en crée une
	// autre. Les cartes gardent deux tuiles (« Créer » et la mienne).
	const mine = rings ? ordered.find((group) => ringStateFor(group, myHandle) === "self") ?? null : null
	const others = mine === null ? ordered : ordered.filter((group) => group !== mine)

	return (
		<div className="st-tray" data-presentation={storiesPresentation} role="group" aria-label={t("storiesTray.label")}>
			{mine !== null ? (
				/* « Vous » avec une série en ligne : deux gestes, deux boutons
				   frères (un bouton n'en contient jamais un autre). */
				<div className="st-tray-tile st-ring-tile st-ring-own">
					<span className="st-ring-self">
						<button
							type="button"
							className="st-ring-open"
							aria-label={trayTileLabel(mine, myHandle, now, t)}
							onClick={() => onOpen(mine.author.handle)}
						>
							<StoryRing
								presentation="rings"
								state={drawnRingState("self", rings)}
								displayName={mine.author.displayName ?? ""}
								avatarUrl={mine.author.avatarUrl ?? myAvatarUrl}
							/>
						</button>
						{canCreate ? (
							<button
								type="button"
								className="st-ring-plus-button"
								aria-label={t("storiesTray.create")}
								onClick={onCreate}
							>
								<span className="st-ring-plus" aria-hidden="true">
									<Icon name="plus" size={14} />
								</span>
							</button>
						) : null}
					</span>
					<span className="st-ring-name" aria-hidden="true">
						{t("storiesTray.you")}
					</span>
				</div>
			) : canCreate ? (
				<button
					type="button"
					className="st-tray-tile st-tray-create"
					aria-label={t("storiesTray.create")}
					onClick={onCreate}
				>
					{rings ? (
						/* « Vous » : mon portrait (ou la silhouette) sans anneau, et son
						   « + » à l'aplat d'identité — le point de départ de la rangée. */
						<span className="st-ring-tile">
							<span className="st-ring-self">
								<span className="st-tray-disc">
									<OwnStoryPortrait key={myAvatarUrl} url={myAvatarUrl} />
								</span>
								<span className="st-ring-plus" aria-hidden="true">
									<Icon name="plus" size={13} />
								</span>
							</span>
							<span className="st-ring-name" aria-hidden="true">
								{t("storiesTray.you")}
							</span>
						</span>
					) : (
					<span className="st-card">
						{myAvatarUrl !== null ? (
							<img
								className="st-card-media"
								src={myAvatarUrl}
								alt=""
								aria-hidden="true"
							/>
						) : null}
						<span className="st-card-foot">
							<span className="st-card-plus" aria-hidden="true">
								<Icon name="plus" size={17} />
							</span>
							<span className="st-card-foot-label" aria-hidden="true">
								{t("storiesTray.createShort")}
							</span>
						</span>
					</span>
					)}
				</button>
			) : null}

			{others.map((group) => {
				const ring = ringStateFor(group, myHandle)
				const cover = trayCoverFor(group)
				return (
					<button
						key={group.author.personId}
						type="button"
						className="st-tray-tile"
						data-ring={ring}
						aria-label={trayTileLabel(group, myHandle, now, t)}
						onClick={() => onOpen(group.author.handle)}
					>
						{rings ? (
							/* Le médaillon : le portrait de l'auteur dans l'anneau qui dit
							   vu / pas vu / à moi, et son prénom dessous (la phrase entière
							   reste dans `aria-label`). */
							<span className="st-ring-tile">
								<StoryRing
									presentation="rings"
									state={ring}
									displayName={group.author.displayName ?? ""}
									avatarUrl={group.author.avatarUrl}
								/>
								<span className="st-ring-name" aria-hidden="true">
									{ring === "self"
										? t("storiesTray.you")
										: storyAuthorShortName(group.author.displayName, t)}
								</span>
							</span>
						) : (
						<span className="st-card">
							{/* La VIGNETTE remplit la carte — l'élément suit le KIND
							    (`trayCoverFor`) : une vidéo se rend en <video> muet qui
							    PEINT sa première image sans jouer. Le `#t=0.1` force le
							    décodage d'une frame (Safari n'affiche rien sinon) ;
							    `preload="metadata"` borne le coût aux en-têtes plus
							    cette frame. Le DÉFILEMENT dans la rangée a été écarté :
							    trente vignettes qui jouent, c'est un rail qui crie et
							    des mégaoctets consommés pour un aperçu. */}
							{cover.kind === "video" ? (
								<video
									className="st-card-media"
									src={`${cover.url}#t=0.1`}
									muted
									playsInline
									preload="metadata"
									tabIndex={-1}
									aria-hidden="true"
								/>
							) : (
								<img
									className="st-card-media"
									src={cover.url}
									alt=""
									aria-hidden="true"
								/>
							)}
							<span
								className="st-card-shade esp-story-shade"
								aria-hidden="true"
							/>
							{/* L'auteur en médaillon, dans son anneau — c'est lui qui
							    porte l'état vu / pas vu / à moi. Pas de couverture ici :
							    elle est DÉJÀ le fond, et l'y remettre ferait une image
							    dans elle-même. Un auteur sans nom rend la silhouette. */}
							<span className="st-card-avatar">
								<StoryRing
									state={ring}
									displayName={group.author.displayName ?? ""}
									avatarUrl={group.author.avatarUrl}
								/>
							</span>
							{/* Le libellé visible est TRONQUÉ à deux lignes ; la phrase
							    entière vit dans `aria-label` ci-dessus, qui prime pour un
							    lecteur d'écran — d'où l'`aria-hidden` : sans lui, le nom
							    serait annoncé deux fois. */}
							<span className="st-card-name" aria-hidden="true">
								{ring === "self"
									? t("storiesTray.you")
									: storyAuthorName(group.author.displayName, t)}
							</span>
						</span>
						)}
					</button>
				)
			})}
		</div>
	)
}

/** Sans série à ouvrir, « Vous » reste une entrée de création neutre. */
function OwnStoryPortrait({ url }: { url: string | null }) {
	const [failed, setFailed] = useState(false)
	if (url === null || failed) return <Icon name="user" size={24} />
	// eslint-disable-next-line @next/next/no-img-element -- moteur indépendant de Next : portrait déjà délivré par la garde.
	return <img className="st-tray-cover" src={url} alt="" aria-hidden="true" onError={() => setFailed(true)} />
}
