// Dupliqué de socle/packages/agent-features/src/features/reseau-personnel/PostReactionControl.tsx @ ad2e7fdc2 — adaptations : réactions au format du moteur (`counts` : un décompte par genre, au lieu de la liste `byKind`) ; libellés par l'i18n (nom des réactions par leur clé de `shared.ts`, textes `reseau:postReactionControl.*`, « réaction » accordé au nombre) ; ombre de la palette par le jeton `--shadow-lg` au lieu d'une couleur littérale ; gestes (appui long, clavier, palette) inchangés ; feuille de style sortie du JSX dans une constante de module (`REACTION_CONTROL_CSS`) — un littéral enfant de `<style>` passerait pour une chaîne d'interface — règles inchangées ; P03 (étude social-commerce) : bouton explicite facultatif `choiceButton` qui ouvre la palette d'un simple toucher (aucun appui long obligatoire), focus rendu à son déclencheur ; P18b (A10, A11) : avec le bouton explicite (présentation « media »), la palette ne s'ouvre plus au survol ni au focus mais par un geste explicite (bouton, Entrée, Espace, flèches du bouton, appui long), le déclencheur redevient une simple bascule (`aria-pressed`, sans `aria-haspopup`, libellé `postReactionControl.toggle*`) et l'état « réagi » se dit aussi par l'icône PLEINE ; partout : Échap ferme la palette où que soit le focus, et ses quatre choix ne font qu'un arrêt de tabulation (tabindex itinérant) ; couleur des réactions (ADR-0027) : fond teinté, libellé et icône de l'action réagie lus dans `--role-react-*`, rayon `--ui2-button-radius`, valeurs d'origine en repli ; ADR-0028 : apparence « charte » de la rangée d'icônes (`appearance`) — cœur pour J'aime, aucun libellé visible (le nom reste accessible), décompte en encre atténuée, réaction posée dite par l'icône PLEINE à l'encre des réactions sans fond teinté ; le bouton explicite des quatre réactions reste au clavier, aux lecteurs d'écran et aux pointeurs fins, l'appui long suffit au doigt.
"use client"

import {
  ChevronUp,
  Handshake,
  Heart,
  Lightbulb,
  PartyPopper,
  ThumbsUp,
  type LucideIcon,
} from "lucide-react"
import {
  useEffect,
  useId,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
} from "react"
import { useOptionalNetwork } from "@antsia/api/network"
import { useTranslation } from "react-i18next"
import { REACTION_OPTIONS, formatCount, type ReactionKind } from "./shared"

const LONG_PRESS_MS = 500
const POINTER_MOVE_TOLERANCE = 12

const REACTION_ICONS: Record<ReactionKind, LucideIcon> = {
  like: ThumbsUp,
  bravo: PartyPopper,
  soutien: Handshake,
  instructif: Lightbulb,
}

/** Les chartes (ADR-0028) disent J'aime par un cœur ; les trois nuances gardent leur signe. */
const CHARTE_REACTION_ICONS: Record<ReactionKind, LucideIcon> = {
  ...REACTION_ICONS,
  like: Heart,
}

/** L'habit du contrôle : historique, ou rangée d'icônes de la présentation « charte ». */
export type ReactionControlAppearance = "default" | "charte"

interface PostReactionControlProps {
  /** Les réactions TELLES QUE le moteur les rend (`FeedItem.reactions`). */
  reactions: {
    total: number
    /** Un décompte par genre — le domaine les connaît tous, aucun ne manque. */
    counts: Readonly<Record<ReactionKind, number>>
    mine: ReactionKind | null
  }
  pending: boolean
  onReact: (kind: ReactionKind) => void | Promise<void>
  /**
   * Un second bouton, explicite, qui ouvre la palette d'un simple toucher ou
   * clic (présentation « media », lot P03) : au téléphone, l'appui long n'est
   * alors plus le SEUL chemin vers les quatre réactions. Absent : contrôle
   * historique, inchangé.
   */
  choiceButton?: boolean
  /** `charte` : la rangée d'icônes de l'écran des chartes (ADR-0028). Absent : inchangé. */
  appearance?: ReactionControlAppearance
}

/**
 * La feuille du contrôle, hors du JSX : un littéral enfant de `<style>`
 * passerait pour une chaîne d'interface (cliquet `no-hardcoded-strings`).
 */
const REACTION_CONTROL_CSS = `
        .rp-reaction-control button {
          transition: background-color 140ms ease, color 140ms ease, transform 140ms ease;
        }
        .rp-reaction-control button:hover:not(:disabled) {
          background: var(--ink-100) !important;
        }
        .rp-reaction-control button:focus-visible {
          outline: 3px solid var(--primary-300, var(--primary-500));
          outline-offset: 2px;
        }
        .rp-reaction-palette {
          animation: rp-reaction-palette-in 140ms ease-out both;
        }
        @keyframes rp-reaction-palette-in {
          from { opacity: 0; transform: translateY(4px) scale(.98); }
          to { opacity: 1; transform: translateY(0) scale(1); }
        }
        @media (prefers-reduced-motion: reduce) {
          .rp-reaction-control button { transition: none; }
          .rp-reaction-palette { animation: none; }
        }
        /* Charte (ADR-0028) : des icônes posées sur la carte, sans pastille au survol. */
        .rp-reaction-control[data-appearance="charte"] > button:hover:not(:disabled) {
          background: transparent !important;
          color: var(--foreground) !important;
        }
        /* Au doigt, l'appui long ouvre les quatre réactions : le bouton explicite
           quitte l'écran mais reste aux lecteurs d'écran, et reparaît au clavier. */
        @media (pointer: coarse) {
          .rp-reaction-control[data-appearance="charte"] .rp-reaction-choice:not(:focus-visible):not([aria-expanded="true"]) {
            position: absolute !important;
            width: 1px !important;
            min-width: 0 !important;
            height: 1px !important;
            min-height: 0 !important;
            margin: -1px !important;
            padding: 0 !important;
            overflow: hidden !important;
            clip-path: inset(50%) !important;
            white-space: nowrap !important;
          }
        }
      `

/**
 * Un geste principal, quatre nuances à la demande.
 *
 * Le clic reste volontairement toujours « J'aime » : la palette est un
 * complément progressif, pas un changement de la cible du geste familier.
 * Le serveur garde seul la sémantique de bascule (ajout, changement ou retrait).
 */
export function PostReactionControl({
  reactions,
  pending,
  onReact,
  choiceButton = false,
  appearance = "default",
}: PostReactionControlProps) {
  const { t } = useTranslation("reseau")
  /**
   * P18b (A11) : le bouton explicite (présentation « media ») rend la palette
   * EXPLICITE — plus d'ouverture au survol ni au focus, qui masquait du
   * contenu sans geste (WCAG 1.4.13) ; le déclencheur reste une bascule.
   * Sans lui (présentation historique), rien ne change à l'écran.
   */
  const explicitPalette = choiceButton
  const charte = appearance === "charte"
  const icons = charte ? CHARTE_REACTION_ICONS : REACTION_ICONS
  /** P18b (A10) : l'état « réagi » se dit aussi par l'icône pleine, pas par la seule teinte. */
  const presentation = useOptionalNetwork()?.postPresentation
  const filledWhenReacted = charte || presentation === "media" || presentation === "charte"
  const [paletteOpen, setPaletteOpen] = useState(false)
  /** L'unique choix tabulable de la palette (tabindex itinérant) ; `null` : le choix courant. */
  const [focusedOption, setFocusedOption] = useState<number | null>(null)
  const paletteId = useId()
  const wrapperRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const choiceRef = useRef<HTMLButtonElement>(null)
  /** Le bouton qui a ouvert la palette : celui qui retrouve le focus à la fermeture. */
  const openerRef = useRef<"trigger" | "choice">("trigger")
  const optionRefs = useRef<Array<HTMLButtonElement | null>>([])
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const longPressFired = useRef(false)
  const suppressClick = useRef(false)
  const focusCameFromPointer = useRef(false)
  const suppressFocusOpen = useRef(false)
  const pointerOrigin = useRef<{ x: number; y: number } | null>(null)
  const pendingFocusIndex = useRef<number | null>(null)

  const selectedKind = reactions.mine ?? "like"
  const SelectedIcon = icons[selectedKind]
  const likeOption = REACTION_OPTIONS.find((option) => option.kind === "like")
  const likeLabel = likeOption ? t(likeOption.labelKey) : selectedKind
  const selectedOption = REACTION_OPTIONS.find((option) => option.kind === selectedKind)
  const selectedLabel = selectedOption ? t(selectedOption.labelKey) : likeLabel

  const clearLongPress = () => {
    if (longPressTimer.current !== null) {
      clearTimeout(longPressTimer.current)
      longPressTimer.current = null
    }
  }

  useEffect(() => clearLongPress, [])

  useEffect(() => {
    const index = pendingFocusIndex.current
    if (!paletteOpen || index === null) return
    pendingFocusIndex.current = null
    optionRefs.current[index]?.focus()
  }, [paletteOpen])

  const returnFocusToTrigger = () => {
    suppressFocusOpen.current = true
    const target = openerRef.current === "choice" ? (choiceRef.current ?? triggerRef.current) : triggerRef.current
    target?.focus()
    openerRef.current = "trigger"
    window.setTimeout(() => {
      suppressFocusOpen.current = false
    }, 0)
  }

  const closePalette = (returnFocus = false) => {
    setPaletteOpen(false)
    setFocusedOption(null)
    pendingFocusIndex.current = null
    if (returnFocus) returnFocusToTrigger()
    else openerRef.current = "trigger"
  }

  const openAndFocus = (index: number) => {
    setFocusedOption(index)
    if (paletteOpen) {
      optionRefs.current[index]?.focus()
      return
    }
    pendingFocusIndex.current = index
    setPaletteOpen(true)
  }

  /**
   * `allowArrows` : les flèches ouvrent la palette depuis CE bouton. Faux pour
   * le déclencheur quand la palette est explicite (P18b, A11) — il n'est plus
   * qu'une bascule ; le bouton explicite garde Entrée, Espace et les flèches.
   */
  const handleTriggerKeyDown = (
    event: ReactKeyboardEvent<HTMLButtonElement>,
    allowArrows = true
  ) => {
    if (event.key === "ArrowDown" && allowArrows) {
      event.preventDefault()
      openAndFocus(0)
    } else if (event.key === "ArrowUp" && allowArrows) {
      event.preventDefault()
      openAndFocus(REACTION_OPTIONS.length - 1)
    } else if (event.key === "Escape" && paletteOpen) {
      event.preventDefault()
      closePalette(true)
    }
  }

  const handleOptionKeyDown = (
    event: ReactKeyboardEvent<HTMLButtonElement>,
    index: number
  ) => {
    let nextIndex: number | null = null
    if (event.key === "ArrowRight" || event.key === "ArrowDown") {
      nextIndex = (index + 1) % REACTION_OPTIONS.length
    } else if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
      nextIndex =
        (index - 1 + REACTION_OPTIONS.length) % REACTION_OPTIONS.length
    } else if (event.key === "Home") {
      nextIndex = 0
    } else if (event.key === "End") {
      nextIndex = REACTION_OPTIONS.length - 1
    } else if (event.key === "Escape") {
      event.preventDefault()
      closePalette(true)
      return
    }

    if (nextIndex !== null) {
      event.preventDefault()
      optionRefs.current[nextIndex]?.focus()
    }
  }

  const handlePointerDown = (event: ReactPointerEvent<HTMLButtonElement>) => {
    if (pending) return
    focusCameFromPointer.current = true
    window.setTimeout(() => {
      focusCameFromPointer.current = false
    }, 0)

    if (event.pointerType !== "touch" && event.pointerType !== "pen") return
    clearLongPress()
    longPressFired.current = false
    pointerOrigin.current = { x: event.clientX, y: event.clientY }
    longPressTimer.current = setTimeout(() => {
      longPressTimer.current = null
      longPressFired.current = true
      suppressClick.current = true
      setPaletteOpen(true)
    }, LONG_PRESS_MS)
  }

  const handlePointerMove = (event: ReactPointerEvent<HTMLButtonElement>) => {
    const origin = pointerOrigin.current
    if (!origin || longPressTimer.current === null) return
    if (
      Math.abs(event.clientX - origin.x) > POINTER_MOVE_TOLERANCE ||
      Math.abs(event.clientY - origin.y) > POINTER_MOVE_TOLERANCE
    ) {
      clearLongPress()
      pointerOrigin.current = null
    }
  }

  const endPointerGesture = () => {
    clearLongPress()
    pointerOrigin.current = null
    if (longPressFired.current) {
      // Le `click` synthétique suit `pointerup` sur les écrans tactiles.
      // Le consommer empêche l'appui long de déclencher aussi « J'aime ».
      suppressClick.current = true
    }
    longPressFired.current = false
  }

  useEffect(() => {
    if (!paletteOpen) return
    const closeOutside = (event: PointerEvent) => {
      if (event.target instanceof Node && wrapperRef.current?.contains(event.target)) return
      setPaletteOpen(false)
      setFocusedOption(null)
      pendingFocusIndex.current = null
      openerRef.current = "trigger"
    }
    // P18b (A11, WCAG 1.4.13) : Échap ferme la palette OÙ QUE SOIT le focus,
    // et seulement elle — capturé avant les surfaces sous-jacentes (modale,
    // pile Échap), qui ne se ferment qu'à la frappe suivante. Le focus revient
    // à son déclencheur s'il était dans le contrôle.
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return
      event.preventDefault()
      event.stopPropagation()
      const focusInside = wrapperRef.current?.contains(document.activeElement) === true
      setPaletteOpen(false)
      setFocusedOption(null)
      pendingFocusIndex.current = null
      if (focusInside) returnFocusToTrigger()
      else openerRef.current = "trigger"
    }
    document.addEventListener("pointerdown", closeOutside)
    window.addEventListener("keydown", closeOnEscape, true)
    return () => {
      document.removeEventListener("pointerdown", closeOutside)
      window.removeEventListener("keydown", closeOnEscape, true)
    }
  }, [paletteOpen])

  return (
    <div
      ref={wrapperRef}
      className="rp-reaction-control"
      data-appearance={charte ? "charte" : undefined}
      style={{ position: "relative", display: "inline-flex", minWidth: 0 }}
      onPointerEnter={(event) => {
        // Palette explicite (A11) : le survol n'ouvre plus rien.
        if (!explicitPalette && !pending && event.pointerType === "mouse") setPaletteOpen(true)
      }}
      onPointerLeave={() => {
        if (!wrapperRef.current?.contains(document.activeElement)) {
          closePalette()
        }
      }}
      onBlurCapture={(event) => {
        const next = event.relatedTarget
        if (!(next instanceof Node) || !wrapperRef.current?.contains(next)) {
          closePalette()
        }
      }}
    >
      <button
        ref={triggerRef}
        type="button"
        disabled={pending}
        aria-pressed={reactions.mine !== null}
        // Palette explicite (A11) : le déclencheur n'est plus qu'une bascule ;
        // le menu appartient au bouton explicite qui le suit.
        aria-haspopup={explicitPalette ? undefined : "menu"}
        aria-expanded={explicitPalette ? undefined : paletteOpen}
        aria-controls={!explicitPalette && paletteOpen ? paletteId : undefined}
        aria-label={
          explicitPalette
            ? reactions.total > 0
              ? t("postReactionControl.toggleWithCount", {
                  label: selectedLabel,
                  formatted: formatCount(reactions.total),
                  count: reactions.total,
                })
              : t("postReactionControl.toggle", { label: selectedLabel })
            : reactions.total > 0
              ? t("postReactionControl.triggerWithCount", {
                  label: selectedLabel,
                  formatted: formatCount(reactions.total),
                  count: reactions.total,
                })
              : t("postReactionControl.trigger", { label: selectedLabel })
        }
        title={t("postReactionControl.title")}
        onFocus={() => {
          // Palette explicite (A11) : le focus n'ouvre plus rien.
          if (!explicitPalette && !focusCameFromPointer.current && !suppressFocusOpen.current) {
            setPaletteOpen(true)
          }
        }}
        onKeyDown={(event) => handleTriggerKeyDown(event, !explicitPalette)}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={endPointerGesture}
        onPointerCancel={endPointerGesture}
        onClick={() => {
          if (suppressClick.current) {
            suppressClick.current = false
            return
          }
          void onReact("like")
        }}
        style={
          charte
            ? {
                // Charte (ADR-0028) : l'icône et son décompte, rien d'autre ;
                // la cible garde 44 px, l'écart visuel naît du rembourrage.
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 6,
                minWidth: 44,
                minHeight: 44,
                padding: "0 7px",
                border: "none",
                borderRadius: "var(--ui2-button-radius, 10px)",
                background: "transparent",
                color: "var(--muted-foreground)",
                fontFamily: "inherit",
                fontSize: 14,
                fontWeight: 600,
                cursor: pending ? "progress" : "pointer",
                touchAction: "manipulation",
                userSelect: "none",
                WebkitUserSelect: "none",
              }
            : {
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 7,
                minWidth: 44,
                minHeight: 44,
                padding: "8px 11px",
                border: "none",
                borderRadius: "var(--ui2-button-radius, 10px)",
                // Couleur des réactions (ADR-0027) : fond teinté et libellé lisible ; l'icône prend l'encre.
                background:
                  reactions.mine !== null ? "var(--role-react-soft, var(--primary-50))" : "transparent",
                color:
                  reactions.mine !== null ? "var(--role-react-label, var(--primary-600))" : "var(--ink-600)",
                fontFamily: "inherit",
                fontSize: 13,
                fontWeight: 700,
                cursor: pending ? "progress" : "pointer",
                touchAction: "manipulation",
                userSelect: "none",
                WebkitUserSelect: "none",
              }
        }
      >
        <SelectedIcon
          aria-hidden="true"
          size={charte ? 20 : 18}
          strokeWidth={2.2}
          // A10 : réagi = icône PLEINE (la teinte seule ne suffit pas, WCAG 1.4.1).
          fill={filledWhenReacted && reactions.mine !== null ? "currentColor" : "none"}
          data-reacted={reactions.mine !== null ? "true" : "false"}
          style={reactions.mine !== null ? { color: "var(--role-react-ink, currentColor)" } : undefined}
        />
        {charte ? null : <span>{reactions.mine ? selectedLabel : likeLabel}</span>}
        {reactions.total > 0 ? (
          <span
            aria-hidden="true"
            style={{
              color: charte ? "inherit" : "var(--ink-500)",
              fontWeight: 600,
              fontVariantNumeric: "tabular-nums",
            }}
          >
            {formatCount(reactions.total)}
          </span>
        ) : null}
      </button>

      {choiceButton ? (
        <button
          ref={choiceRef}
          type="button"
          className="rp-reaction-choice"
          disabled={pending}
          aria-haspopup="menu"
          aria-expanded={paletteOpen}
          aria-controls={paletteOpen ? paletteId : undefined}
          aria-label={t("postReactionControl.more")}
          title={t("postReactionControl.more")}
          onKeyDown={(event) => {
            openerRef.current = "choice"
            handleTriggerKeyDown(event)
          }}
          onClick={() => {
            // Le survol peut déjà avoir ouvert la palette : ce premier clic
            // explicite y entre, au lieu de la refermer immédiatement.
            if (paletteOpen && openerRef.current === "choice") {
              closePalette(true)
              return
            }
            openerRef.current = "choice"
            const current = REACTION_OPTIONS.findIndex((option) => option.kind === reactions.mine)
            openAndFocus(current >= 0 ? current : 0)
          }}
          style={{
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            minWidth: 44,
            minHeight: 44,
            padding: "8px 4px",
            border: "none",
            borderRadius: 10,
            background: "transparent",
            color: "var(--ink-600)",
            cursor: pending ? "progress" : "pointer",
            touchAction: "manipulation",
          }}
        >
          <ChevronUp aria-hidden="true" size={16} strokeWidth={2.4} />
        </button>
      ) : null}

      {paletteOpen ? (
        <div
          id={paletteId}
          role="menu"
          aria-label={t("postReactionControl.palette")}
          className="rp-reaction-palette"
          style={{
            position: "absolute",
            zIndex: 30,
            left: 0,
            bottom: "calc(100% + 8px)",
            display: "flex",
            gap: 4,
            padding: 6,
            border: "1px solid var(--ink-150)",
            borderRadius: 14,
            background: "var(--ink-0)",
            boxShadow: "var(--shadow-lg)",
          }}
        >
          {REACTION_OPTIONS.map((option, index) => {
            const ReactionIcon = icons[option.kind]
            const count = reactions.counts[option.kind]
            const label = t(option.labelKey)
            // Tabindex itinérant (A11) : un seul arrêt de tabulation pour les
            // quatre choix — celui qui a le focus, sinon le choix courant.
            const chosenIndex = Math.max(0, REACTION_OPTIONS.findIndex((candidate) => candidate.kind === reactions.mine))
            const tabbable = index === (focusedOption ?? chosenIndex)
            return (
              <button
                key={option.kind}
                ref={(node) => {
                  optionRefs.current[index] = node
                }}
                type="button"
                role="menuitemradio"
                tabIndex={tabbable ? 0 : -1}
                onFocus={() => setFocusedOption(index)}
                aria-checked={reactions.mine === option.kind}
                aria-label={
                  count > 0
                    ? t("postReactionControl.optionWithCount", { label, formatted: formatCount(count) })
                    : label
                }
                title={label}
                disabled={pending}
                onKeyDown={(event) => handleOptionKeyDown(event, index)}
                onClick={() => {
                  void onReact(option.kind)
                  closePalette(true)
                }}
                style={{
                  width: 48,
                  minWidth: 48,
                  minHeight: 48,
                  padding: 4,
                  border: "none",
                  borderRadius: 10,
                  display: "inline-flex",
                  flexDirection: "column",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 2,
                  background:
                    reactions.mine === option.kind
                      ? "var(--role-react-soft, var(--primary-50))"
                      : "transparent",
                  color:
                    reactions.mine === option.kind
                      ? "var(--role-react-label, var(--primary-600))"
                      : "var(--ink-700)",
                  cursor: pending ? "progress" : "pointer",
                  fontFamily: "inherit",
                  fontSize: 10,
                  fontWeight: 700,
                }}
              >
                <ReactionIcon
                  aria-hidden="true"
                  size={19}
                  strokeWidth={2.2}
                  style={reactions.mine === option.kind ? { color: "var(--role-react-ink, currentColor)" } : undefined}
                />
                <span aria-hidden="true">{label}</span>
              </button>
            )
          })}
        </div>
      ) : null}

      <style>{REACTION_CONTROL_CSS}</style>
    </div>
  )
}
