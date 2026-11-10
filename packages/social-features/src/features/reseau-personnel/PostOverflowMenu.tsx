// Dupliqué de socle/packages/agent-features/src/features/reseau-personnel/PostOverflowMenu.tsx @ ad2e7fdc2 — adaptations : marques et sourdine du moteur avec le réseau courant (`marks.marks.*`, `useNetwork().networkId`) ; la sourdine vise une PERSONNE (prop `authorPersonId: Id<"persons">` au lieu de `authorUserId`, argument `targetPersonId`) ; identifiant `Id<"posts">` ; entrées du menu, toasts et noms accessibles par l'i18n (`overflowEntriesFor(…, t)`, `undoLabelFor(…, t)`, clés `reseau:postOverflowMenu.*`) ; refus du moteur dit par son code (`postEngineErrorText`) ; ombre par le jeton `--shadow-xl` au lieu d'une couleur littérale ; position et bascule inchangées ; P18b (A01) : focus porté dans le menu à l'ouverture (première entrée, dernière par Flèche haut sur le bouton), tabindex itinérant (flèches, Début, Fin), Échap et Tab ferment en rendant le focus au bouton, le menu suit son bouton au défilement tant que celui-ci reste visible au lieu de se fermer au moindre défilement. ; ADR-0028 : la présentation « charte » suit aussi son bouton au défilement.
"use client"

/**
 * Le menu « … » d'une publication.
 *
 * ⚠️ **`createPortal(document.body)` est un PRÉREQUIS, pas une préférence.**
 * `.rp-scope` porte `container-type: inline-size`, donc `contain: layout` : un
 * `position: fixed` rendu à l'intérieur serait cadré sur la GRILLE et
 * défilerait avec elle, au lieu de rester ancré au bouton. Même contrainte que
 * `SharePostDialog`. Toute nouvelle surface flottante d'ici devra faire de même.
 *
 * Ce que le menu propose vit dans `post-overflow.ts` — module pur, testé en
 * `node` : ce qui reste dans un composant n'est vérifiable qu'à l'œil.
 */

import { api } from "@antsia/api/engine"
import type { Id } from "@antsia/api/engine"
import { useNetwork } from "@antsia/api/network"
import { useMutation } from "convex/react"
import {
	useCallback,
	useEffect,
	useId,
	useLayoutEffect,
	useRef,
	useState,
	type KeyboardEvent as ReactKeyboardEvent,
} from "react"
import { createPortal } from "react-dom"
import { useTranslation } from "react-i18next"
import { toast } from "sonner"

import type { AuthorKind } from "./author-link"
import {
	overflowEntriesFor,
	postEngineErrorText,
	type PostOverflowAction,
	undoLabelFor,
} from "./post-overflow"

const MENU_WIDTH = 288
/** Marge au bord de la fenêtre — le menu ne se colle jamais au bord. */
const VIEWPORT_MARGIN = 12
/**
 * Hauteur présumée avant le premier rendu, pour décider de la bascule.
 * Le menu n'est pas encore dans le DOM au calcul initial : on prend la borne
 * haute (cinq entrées), quitte à basculer un peu tôt plutôt qu'à ouvrir hors
 * écran. Le rendu suivant corrige avec la hauteur réelle.
 */
const ESTIMATED_MENU_HEIGHT = 300

interface PostOverflowMenuProps {
	postId: Id<"posts">
	/** Personne native ; null pour un reflet institutionnel sans signataire local. */
	authorPersonId: Id<"persons"> | null
	authorName: string
	/**
	 * Le genre de l'auteur — une PAGE ne se met pas en sourdine. Ce que cela
	 * retire du menu se décide dans `post-overflow.ts`. Optionnel : l'absence
	 * vaut « personne » (cf. le commentaire là-bas).
	 */
	authorKind?: AuthorKind
	isOwn: boolean
	/** L'épinglage vaut-il ici ? Faux pour une publication de groupe. */
	canPin: boolean
	bookmarked: boolean
	notifying: boolean
	onRemove: () => void
	onReport: () => void
	/** Ouvre l'édition SUR PLACE — l'état vit dans la carte, pas ici. */
	onEdit: () => void
	onPin: () => void
}

export function PostOverflowMenu({
	postId,
	authorPersonId,
	authorName,
	authorKind,
	isOwn,
	canPin,
	bookmarked,
	notifying,
	onRemove,
	onReport,
	onEdit,
	onPin,
}: PostOverflowMenuProps) {
	const { t } = useTranslation("reseau")
	const { networkId, postPresentation } = useNetwork()
	/**
	 * Suivre le bouton au défilement change ce qui se VOIT pendant un
	 * défilement : réservé aux présentations « media » et « charte » déclarées
	 * par l'application (ANTSIA). Ailleurs (DIASPORALE), le défilement ferme le
	 * menu comme avant — en rendant désormais le focus au bouton.
	 */
	const followOnScroll = postPresentation === "media" || postPresentation === "charte"
	const [open, setOpen] = useState(false)
	/**
	 * ⚠️ Ancré par le HAUT en dessous du bouton, par le BAS au-dessus de lui.
	 * Basculer en calculant `top = rect.top − hauteur` obligerait à connaître la
	 * hauteur du menu AVANT qu'il existe : l'estimation laissait 125 px de vide
	 * entre le menu et son bouton — mesuré —, et l'effet ne re-mesurait jamais.
	 * Ancrer par le bas rend la hauteur inutile, quel que soit le nombre
	 * d'entrées ou le repli des phrases.
	 */
	const [anchor, setAnchor] = useState<
		{ left: number; top: number; bottom?: undefined } | { left: number; top?: undefined; bottom: number } | null
	>(null)
	const buttonRef = useRef<HTMLButtonElement | null>(null)
	const menuRef = useRef<HTMLDivElement | null>(null)
	const menuId = useId()
	/**
	 * Tabindex ITINÉRANT (P18b, A01) : une seule entrée tabulable à la fois, les
	 * flèches déplacent le focus. Le menu est portalisé en fin de `<body>` : sans
	 * focus porté dans le menu à l'ouverture, le clavier devait traverser toute
	 * la page pour l'atteindre — et le défilement que cela provoquait le fermait.
	 */
	const [activeIndex, setActiveIndex] = useState(0)
	const itemRefs = useRef<(HTMLButtonElement | null)[]>([])
	/** L'entrée à focaliser dès que le menu existe dans le DOM. */
	const pendingFocus = useRef<"first" | "last" | null>(null)

	const toggleMark = useMutation(api.modules.marks.marks.toggleMark)
	const hidePost = useMutation(api.modules.marks.marks.hidePost)
	const unhidePost = useMutation(api.modules.marks.marks.unhidePost)
	const muteAuthor = useMutation(api.modules.marks.marks.muteAuthor)
	const unmuteAuthor = useMutation(api.modules.marks.marks.unmuteAuthor)

	/** Le refus du moteur, dit par son code — jamais la trace serveur. */
	const failed = (error: unknown) =>
		toast.error(postEngineErrorText(error, "reseau:postOverflowMenu.toast.failed", t))

	// Position calculée au moment de l'ouverture, sur le rectangle réel du
	// bouton : dans un fil qui défile, une position figée au montage serait
	// fausse dès le premier défilement.
	//
	// ⚠️ Le menu BASCULE au-dessus du bouton quand la place manque en dessous.
	// Une carte en bas de fenêtre est le cas NORMAL dans un fil, pas le cas
	// limite : sans bascule, le menu s'ouvre hors écran et le geste ne rend
	// rien de visible — mesuré ici, bouton à 910 px dans une fenêtre de 837.
	const place = useCallback(() => {
		const rect = buttonRef.current?.getBoundingClientRect()
		if (rect === undefined) return
		const left = Math.max(
			VIEWPORT_MARGIN,
			Math.min(
				rect.right - MENU_WIDTH,
				window.innerWidth - MENU_WIDTH - VIEWPORT_MARGIN
			)
		)
		// La hauteur ne sert qu'à DÉCIDER de la bascule : estimée avant le
		// premier rendu (le menu n'existe pas encore), réelle quand le menu se
		// replace au défilement. Se tromper bascule un peu tôt, ce qui reste
		// correct. Elle n'entre jamais dans la position finale.
		const below = rect.bottom + 6
		const height = menuRef.current?.offsetHeight || ESTIMATED_MENU_HEIGHT
		const flip = below + height > window.innerHeight - VIEWPORT_MARGIN
		setAnchor(
			flip
				? { left, bottom: Math.max(VIEWPORT_MARGIN, window.innerHeight - rect.top + 6) }
				: { left, top: Math.max(VIEWPORT_MARGIN, below) }
		)
	}, [])

	useLayoutEffect(() => {
		if (!open) return
		place()
	}, [open, place])

	/** Focalise l'entrée `index` (bornée) et en fait la seule tabulable. */
	const focusItem = useCallback((index: number) => {
		const items = itemRefs.current.filter((item): item is HTMLButtonElement => item !== null)
		if (items.length === 0) return
		const next = Math.max(0, Math.min(index, items.length - 1))
		setActiveIndex(next)
		items[next]?.focus()
	}, [])

	// Dès que le menu existe dans le DOM, le focus y entre — sur la première
	// entrée, ou la dernière quand on l'a ouvert par Flèche haut. Un focus
	// posé par programme après un clic de souris n'allume pas `:focus-visible`.
	useEffect(() => {
		if (!open || anchor === null) return
		const which = pendingFocus.current
		if (which === null) return
		pendingFocus.current = null
		focusItem(which === "last" ? itemRefs.current.length - 1 : 0)
	}, [open, anchor, focusItem])

	// Échap ferme et REND LE FOCUS au bouton — sans quoi le focus retombe sur
	// le document et la tabulation repart du haut de la page. (Dans le menu,
	// Échap est traité par `onMenuKeyDown`, qui arrête sa propagation pour ne
	// pas fermer aussi une surface modale sous-jacente.)
	useEffect(() => {
		if (!open) return
		const close = () => {
			setOpen(false)
			buttonRef.current?.focus()
		}
		const onKey = (event: KeyboardEvent) => {
			if (event.key === "Escape") close()
		}
		const onPointer = (event: MouseEvent) => {
			const target = event.target as Node
			if (menuRef.current?.contains(target) === true) return
			if (buttonRef.current?.contains(target) === true) return
			setOpen(false)
		}
		// `true` : capture — un clic sur un bouton d'une autre carte doit fermer
		// celui-ci avant d'ouvrir le sien.
		// ⚠️ Le défilement ne ferme PLUS le menu d'office (P18b, A01) : le
		// clavier et le lecteur d'écran font défiler la page. En présentation
		// « media », tant que son bouton reste visible, le menu se REPLACE contre
		// lui ; il ne se ferme que si le bouton quitte la fenêtre. Dans tous les
		// cas, le focus, s'il était dans le menu, revient au bouton sans faire
		// défiler la page à rebours. La capture reste nécessaire : c'est une
		// COLONNE qui défile ici, pas la fenêtre, et un événement de défilement
		// ne remonte pas.
		const onScroll = (event: Event) => {
			const target = event.target
			// Le menu lui-même défile (ancré par le bas, `overflow-y: auto`) —
			// ce que provoque le focus d'une entrée hors de sa zone visible.
			if (target instanceof Node && menuRef.current?.contains(target) === true) return
			const rect = buttonRef.current?.getBoundingClientRect()
			const visible =
				rect !== undefined &&
				rect.width + rect.height > 0 &&
				rect.bottom > 0 &&
				rect.top < window.innerHeight
			if (followOnScroll && visible) {
				place()
				return
			}
			const focusInside = menuRef.current?.contains(document.activeElement) === true
			setOpen(false)
			if (focusInside) buttonRef.current?.focus({ preventScroll: true })
		}
		const onResize = () => place()
		document.addEventListener("keydown", onKey)
		document.addEventListener("mousedown", onPointer, true)
		window.addEventListener("scroll", onScroll, true)
		window.addEventListener("resize", onResize)
		return () => {
			document.removeEventListener("keydown", onKey)
			document.removeEventListener("mousedown", onPointer, true)
			// Sans ce retrait, un `once: true` jamais déclenché reste inscrit :
			// à la deuxième ouverture il y en a deux, et le premier défilement
			// referme un menu que l'on vient d'ouvrir.
			window.removeEventListener("scroll", onScroll, true)
			window.removeEventListener("resize", onResize)
		}
	}, [open, place, followOnScroll])

	/** Ouvre le menu ; le focus entrera sur la première (ou la dernière) entrée. */
	const openMenu = (focus: "first" | "last") => {
		pendingFocus.current = focus
		setOpen(true)
	}

	// Bouton : Flèche bas ouvre sur la première entrée, Flèche haut sur la
	// dernière (Entrée et Espace passent par le clic natif du bouton).
	const onTriggerKeyDown = (event: ReactKeyboardEvent<HTMLButtonElement>) => {
		if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return
		event.preventDefault()
		const which = event.key === "ArrowUp" ? "last" : "first"
		if (open) {
			focusItem(which === "last" ? itemRefs.current.length - 1 : 0)
			return
		}
		openMenu(which)
	}

	const onMenuKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
		const count = itemRefs.current.filter((item) => item !== null).length
		if (count === 0) return
		switch (event.key) {
			case "ArrowDown":
				event.preventDefault()
				focusItem((activeIndex + 1) % count)
				return
			case "ArrowUp":
				event.preventDefault()
				focusItem((activeIndex - 1 + count) % count)
				return
			case "Home":
				event.preventDefault()
				focusItem(0)
				return
			case "End":
				event.preventDefault()
				focusItem(count - 1)
				return
			case "Escape":
				event.preventDefault()
				event.stopPropagation()
				setOpen(false)
				buttonRef.current?.focus()
				return
			case "Tab":
				// Pas de `preventDefault` : le focus est rendu au bouton, puis la
				// tabulation native repart DE LUI (élément suivant ou précédent).
				setOpen(false)
				buttonRef.current?.focus()
				return
			default:
				return
		}
	}

	const run = (action: PostOverflowAction) => {
		setOpen(false)
		buttonRef.current?.focus()

		if (action === "remove") {
			onRemove()
			return
		}
		if (action === "edit") {
			onEdit()
			return
		}
		if (action === "pin") {
			onPin()
			return
		}
		if (action === "report") { onReport(); return }
		if (action === "bookmark" || action === "notify") {
			void toggleMark({ networkId, postId, kind: action })
				.then((result) => {
					toast.success(
						action === "bookmark"
							? result.marked
								? t("postOverflowMenu.toast.bookmarked")
								: t("postOverflowMenu.toast.unbookmarked")
							: result.marked
								? t("postOverflowMenu.toast.notifying")
								: t("postOverflowMenu.toast.notNotifying")
					)
				})
				.catch(failed)
			return
		}
		if (action === "hide") {
			void hidePost({ networkId, postId })
				.then(() => {
					toast.success(undoLabelFor("hide", authorName, t), {
						action: {
							label: t("postOverflowMenu.undo"),
							onClick: () => void unhidePost({ networkId, postId }).catch(failed),
						},
					})
				})
				.catch(failed)
			return
		}
		if (action === "mute_author") {
			if (authorPersonId === null || authorKind === "page") return
			void muteAuthor({ networkId, targetPersonId: authorPersonId })
				.then(() => {
					toast.success(undoLabelFor("mute_author", authorName, t), {
						action: {
							label: t("postOverflowMenu.undo"),
							onClick: () =>
								void unmuteAuthor({ networkId, targetPersonId: authorPersonId }).catch(failed),
						},
					})
				})
				.catch(failed)
		}
	}

	const entries = overflowEntriesFor(
		{
			isOwn,
			canPin,
			bookmarked,
			notifying,
			authorName,
			authorKind,
			canReport: true,
		},
		t
	)

	return (
		<>
			<style href="rp-overflow" precedence="medium">{`
        .rp-of-menu {
          position: fixed;
          z-index: 60;
          width: ${MENU_WIDTH}px;
          max-width: calc(100vw - ${VIEWPORT_MARGIN * 2}px);
          padding: 6px;
          border-radius: 14px;
          border: 1px solid var(--ink-200);
          background: var(--esp-surface-raised, var(--ink-0));
          box-shadow: var(--shadow-xl);
          display: flex;
          flex-direction: column;
          gap: 2px;
        }
        .rp-of-item {
          display: block;
          width: 100%;
          text-align: left;
          padding: 9px 11px;
          border: 0;
          border-radius: 10px;
          background: transparent;
          cursor: pointer;
          font: inherit;
          color: var(--ink-900);
        }
        .rp-of-item:hover, .rp-of-item:focus-visible { background: var(--ink-100); }
        .rp-of-grave { color: var(--danger-600); }
        .rp-of-label { font-size: 14px; font-weight: 500; }
        .rp-of-hint {
          display: block;
          margin-top: 2px;
          font-size: 12px;
          line-height: 1.35;
          color: var(--ink-600);
        }
        .rp-of-trigger {
          flex: none;
          width: 34px;
          height: 34px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          border: 0;
          border-radius: 9px;
          background: transparent;
          cursor: pointer;
          color: var(--ink-500);
          font-size: 17px;
          line-height: 1;
        }
        .rp-of-trigger:hover, .rp-of-trigger[aria-expanded="true"] {
          background: var(--ink-100);
          color: var(--ink-900);
        }
        .rp-of-sep { height: 1px; margin: 4px 6px; background: var(--ink-200); }
      `}</style>

			{/*
			 * Bouton NATIF et non `Button` d'ui-v2 : le composant ne transmet pas
			 * `ref`, et sans référence au déclencheur le menu ne peut ni se
			 * positionner sur son rectangle, ni lui rendre le focus à la fermeture.
			 */}
			<button
				ref={buttonRef}
				type="button"
				className="rp-of-trigger"
				aria-haspopup="menu"
				aria-expanded={open}
				aria-controls={open ? menuId : undefined}
				aria-label={t("postOverflowMenu.trigger")}
				onClick={() => {
					if (open) {
						setOpen(false)
						return
					}
					openMenu("first")
				}}
				onKeyDown={onTriggerKeyDown}
			>
				<span aria-hidden="true">···</span>
			</button>

			{open && anchor !== null
				? createPortal(
						<div
							ref={menuRef}
							id={menuId}
							className="rp-of-menu"
							role="menu"
							aria-label={t("postOverflowMenu.menu")}
							onKeyDown={onMenuKeyDown}
							style={{
								top: anchor.top,
								bottom: anchor.bottom,
								left: anchor.left,
								// Ancré par le bas, le menu ne doit pas dépasser en haut.
								maxHeight:
									anchor.bottom === undefined
										? undefined
										: `calc(100vh - ${anchor.bottom + VIEWPORT_MARGIN}px)`,
								overflowY: anchor.bottom === undefined ? undefined : "auto",
							}}
						>
							{entries.map((entry, index) => (
								<div key={entry.id} role="none">
									{entry.grave && index > 0 ? (
										<div className="rp-of-sep" aria-hidden="true" />
									) : null}
									<button
										ref={(node) => {
											itemRefs.current[index] = node
										}}
										type="button"
										role="menuitem"
										tabIndex={index === activeIndex ? 0 : -1}
										className={`rp-of-item${entry.grave ? " rp-of-grave" : ""}`}
										onFocus={() => setActiveIndex(index)}
										onClick={() => run(entry.id)}
									>
										<span className="rp-of-label">{entry.label}</span>
										<span className="rp-of-hint">{entry.hint}</span>
									</button>
								</div>
							))}
						</div>,
						document.body
					)
				: null}
		</>
	)
}
