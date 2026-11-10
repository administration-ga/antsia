// Dupliqué de socle/packages/agent-features/src/features/reseau-personnel/mobile/VerticalPager.tsx @ ad2e7fdc2 — adaptations : `motion/react` (dépendance du paquet) ; fenêtre des éléments visibles tirée par `slice` (plus d'accès indexé possiblement vide, `noUncheckedIndexedAccess` du moteur), mêmes indices rendus ; nom accessible fourni (et traduit) par l'appelant ; déplacé dans la coque (`shell/mobile/`).
"use client"

/**
 * VerticalPager — pager plein écran façon Reels/TikTok (LOT M2), un item à
 * l'écran à la fois, glissé verticalement.
 *
 * Ce composant reste FIN : tout ce qui se DÉCIDE — quand un axe s'engage,
 * quand un geste commit, la résistance au bord — vit dans
 * `./gestures/swipe.ts` (module pur, testé) ; ce fichier ne fait
 * qu'appliquer ces décisions à une mise en page et à un `MotionValue`.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * LA BASCULE « RÈGLE PUIS ÉCHANGE » — LA PARTIE QUI COMPTE
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * `index` est une prop CONTRÔLÉE : ce composant ne la possède pas, il la
 * PROPOSE via `onIndexChange`. Chaque item visible est positionné par un
 * simple `top: (itemIndex - index) * size` statique ; c'est le SEUL
 * `MotionValue` partagé `y`, appliqué à l'enveloppe qui les contient tous,
 * qui porte le mouvement — un item ne sait rien animer lui-même.
 *
 * D'où la séquence, au commit d'un geste « suivant » (direction 1) :
 *   1. `animate(y, settleTarget(1, size), …)` termine la glissade jusqu'à
 *      `-size` — l'item visé occupe déjà, visuellement, la place de l'actif.
 *   2. SEULEMENT une fois cette animation résolue : `y.jump(0)` (aucune
 *      interpolation) ET `onIndexChange(target)` DANS LE MÊME MOMENT.
 *
 * Le `top` de l'item bascule de `+size` à `0` exactement quand `y` bascule de
 * `-size` à `0` — les deux se compensent, rien ne saute à l'écran. Permuter
 * l'ordre (échanger l'index AVANT la fin de la glissade) ferait apparaître un
 * trou : l'item visé n'a pas encore terminé sa course que son `top` change
 * déjà de repère.
 *
 * `useReducedMotion()` COURT-CIRCUITE cette chorégraphie : pas de ressort,
 * `y.jump(0)` immédiat, et seul un fondu de 120 ms (porté par chaque item,
 * pas par `y`) signale l'entrée d'un nouvel item.
 */

import type { FocusEvent, ReactNode } from "react"
import { useLayoutEffect, useRef, useState } from "react"
import {
	animate,
	motion,
	useMotionValue,
	useReducedMotion,
	type AnimationPlaybackControlsWithThen,
	type Transition,
} from "motion/react"
import { nextIndex, rubberBand, settleTarget, usePointerSwipe } from "./gestures"

export interface VerticalPagerProps<T> {
	items: readonly T[]
	index: number
	onIndexChange: (next: number) => void
	renderItem: (item: T, state: { active: boolean; index: number }) => ReactNode
	keyExtractor: (item: T, index: number) => string
	disabled?: boolean
	ariaLabel: string
}

/** Ressort doux, NON rebondissant : `bounce: 0` (cf. `SpringOptions` de `motion-dom`). */
const SETTLE_SPRING: Transition = { type: "spring", bounce: 0, duration: 0.3 }

/** Durée du fondu d'entrée quand `prefers-reduced-motion` est actif. */
const REDUCED_MOTION_FADE_S = 0.12

export function VerticalPager<T>({
	items,
	index,
	onIndexChange,
	renderItem,
	keyExtractor,
	disabled = false,
	ariaLabel,
}: VerticalPagerProps<T>) {
	const containerRef = useRef<HTMLDivElement>(null)
	const [size, setSize] = useState(0)
	const y = useMotionValue(0)
	const reduceMotion = useReducedMotion() ?? false
	const activeAnimation = useRef<AnimationPlaybackControlsWithThen | null>(null)
	const focusedPanelBeforeChange = useRef<HTMLDivElement | null>(null)

	// Mémoriser le panneau à la prise du focus : inert ou disabled peuvent
	// faire flouter son contrôle avant les effets de layout. Une sortie
	// volontaire du focus efface la mémoire ; une fermeture DOM la conserve.
	const rememberPanelFocus = (event: FocusEvent<HTMLDivElement>) => {
		focusedPanelBeforeChange.current = event.target.closest<HTMLDivElement>("[data-vertical-pager-panel]")
	}
	const forgetPanelFocus = (event: FocusEvent<HTMLDivElement>) => {
		if (event.relatedTarget instanceof Node && event.currentTarget.contains(event.relatedTarget)) return
		if (event.target.closest("[inert], :disabled")) return
		focusedPanelBeforeChange.current = null
	}
	useLayoutEffect(() => {
		const panel = focusedPanelBeforeChange.current
		const container = containerRef.current
		if (panel === null || container === null) return
		if (container.contains(panel) && panel.dataset.verticalPagerPanel === "active") return
		focusedPanelBeforeChange.current = null
		const doc = container.ownerDocument
		const focused = doc.activeElement
		// Un autofocus légitime ailleurs dans le document garde la main.
		if (focused !== null && focused !== doc.body && focused !== doc.documentElement && !panel.contains(focused)) return
		container.focus({ preventScroll: true })
	})

	// Mesure la hauteur RÉELLE du conteneur : `h-full` ne donne aucun nombre de
	// pixels exploitable par `swipe.ts`, qui n'en connaît aucun lui-même.
	useLayoutEffect(() => {
		const node = containerRef.current
		if (!node) return
		setSize(node.clientHeight)
		const observer = new ResizeObserver((entries) => {
			const entry = entries[0]
			if (entry) setSize(entry.contentRect.height)
		})
		observer.observe(node)
		return () => observer.disconnect()
	}, [])

	const settle = (target: number, onDone?: () => void) => {
		activeAnimation.current?.stop()
		const controls = animate(y, target, SETTLE_SPRING)
		activeAnimation.current = controls
		void controls.then(() => {
			if (activeAnimation.current === controls) activeAnimation.current = null
			onDone?.()
		})
	}

	const commit = (direction: -1 | 0 | 1) => {
		const target = nextIndex(index, direction, items.length)
		if (direction === 0 || target === index) {
			// Rien à échanger — bord déjà atteint, ou geste non concluant : on
			// revient simplement au repos.
			settle(0)
			return
		}
		if (reduceMotion) {
			activeAnimation.current?.stop()
			y.jump(0)
			onIndexChange(target)
			return
		}
		settle(settleTarget(direction, size), () => {
			y.jump(0)
			onIndexChange(target)
		})
	}

	const swipe = usePointerSwipe({
		axis: "y",
		size,
		disabled,
		onOffset: (offset) => {
			const atStart = index <= 0
			const atEnd = index >= items.length - 1
			const atEdge = (offset > 0 && atStart) || (offset < 0 && atEnd)
			y.set(rubberBand(offset, atEdge, size))
		},
		onCommit: commit,
	})

	const onPointerDown = (event: React.PointerEvent) => {
		// Un nouveau geste reprend la main IMMÉDIATEMENT sur `y`, même si le
		// ressort d'un commit précédent jouait encore.
		activeAnimation.current?.stop()
		swipe.onPointerDown(event)
	}

	const onKeyDown = (event: React.KeyboardEvent) => {
		if (disabled || event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return
		const target = event.target
		if (target instanceof HTMLElement && target.closest('input, textarea, select, [contenteditable]:not([contenteditable="false"]), [role="textbox"], [role="combobox"], [role="slider"], [role="spinbutton"]')) return
		// Convention CLAVIER standard des listes (ARIA listbox) : bas = suivant,
		// haut = précédent — délibérément DIFFÉRENTE de la convention du GESTE
		// (glisser vers le haut = suivant, cf. `swipe.ts`). Les deux paradigmes
		// ne partagent pas la même métaphore physique.
		if (event.key === "ArrowDown" || event.key === "PageDown") {
			event.preventDefault()
			commit(1)
		} else if (event.key === "ArrowUp" || event.key === "PageUp") {
			event.preventDefault()
			commit(-1)
		}
	}

	// La fenêtre rendue : l'élément actif et ses deux voisins, bornés à la
	// liste. `slice` rend des éléments PRÉSENTS — aucun indice ne peut viser un
	// trou —, et `first` redonne l'indice de chacun dans la liste.
	const first = Math.max(0, index - 1)
	const visible = items
		.slice(first, Math.max(first, Math.min(items.length, index + 2)))
		.map((item, offset) => ({ item, itemIndex: first + offset }))

	return (
		<div
			ref={containerRef}
			className="relative h-full w-full overflow-hidden touch-none overscroll-none"
			tabIndex={disabled ? -1 : 0}
			role="group"
			aria-label={ariaLabel}
			aria-disabled={disabled || undefined}
			onFocusCapture={rememberPanelFocus}
			onBlurCapture={forgetPanelFocus}
			onKeyDown={onKeyDown}
			onPointerDown={onPointerDown}
			onPointerMove={swipe.onPointerMove}
			onPointerUp={swipe.onPointerUp}
			onPointerCancel={swipe.onPointerCancel}
		>
			<motion.div className="absolute inset-0" style={{ y }}>
				{visible.map(({ item, itemIndex }) => {
					return (
							<div
								key={keyExtractor(item, itemIndex)}
								className="absolute inset-x-0 h-full"
								style={{ top: (itemIndex - index) * size }}
								data-vertical-pager-panel={itemIndex === index ? "active" : "inactive"}
								inert={itemIndex !== index}
								aria-hidden={itemIndex !== index ? true : undefined}
						>
								<motion.div className="h-full w-full" initial={reduceMotion ? { opacity: 0 } : false} animate={{ opacity: 1 }} transition={{ duration: reduceMotion ? REDUCED_MOTION_FADE_S : 0 }}>
									{renderItem(item, { active: itemIndex === index, index: itemIndex })}
								</motion.div>
							</div>
					)
				})}
			</motion.div>
		</div>
	)
}
