"use client"

/**
 * Le menu « … » de la fiche d'AUTRUI (PF-01) : mettre en sourdine ou réactiver,
 * bloquer. Ce qu'il propose vit dans `profile-overflow.ts` (module pur).
 *
 * Bloquer passe par la brique commune `BlockPersonDialog` (confirmation, appel
 * du moteur, toast), puis ramène au volet Relations : la fiche d'une personne
 * bloquée est refusée dans les deux sens, y rester n'aurait aucun sens.
 *
 * ⚠️ Même construction que `PostOverflowMenu`, pour la même raison : la page
 * porte `container-type: inline-size` (donc `contain: layout`), un menu en
 * `position: fixed` rendu à l'intérieur serait cadré sur la grille. Il est donc
 * PORTALISÉ dans `document.body`, ancré au rectangle de son bouton, et suit le
 * clavier comme lui : focus porté dans le menu à l'ouverture, flèches, Début,
 * Fin, Échap et Tab qui rendent le focus au bouton.
 */
import { api, type Id } from "@antsia/api/engine"
import { useAuthenticatedConvexQuery } from "@antsia/api/hooks"
import { useNetwork, useRoutes } from "@antsia/api/network"
import { useRouter } from "@antsia/api/routing"
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

import { RESEAU_SECONDARY_ACTION_STYLE } from "../../shell/design-styles"
import { reseauAgentHref } from "../../shell/reseau-agent-nav"
import { COMPACT_SOCIAL_ACTION_STYLE } from "../social-action-style"
import { BlockPersonDialog } from "./BlockPersonDialog"
import { postEngineErrorText } from "./post-overflow"
import { profileOverflowEntriesFor, type ProfileOverflowAction } from "./profile-overflow"

const MENU_WIDTH = 288
const VIEWPORT_MARGIN = 12
/** Hauteur présumée avant le premier rendu, pour décider de la bascule seulement. */
const ESTIMATED_MENU_HEIGHT = 160

type Anchor = { left: number; top: number; bottom?: undefined } | { left: number; top?: undefined; bottom: number }

export interface ProfileOverflowMenuProps {
  targetPersonId: Id<"persons">
  handle: string
  displayName: string
}

export function ProfileOverflowMenu({ targetPersonId, handle, displayName }: ProfileOverflowMenuProps) {
  const { t } = useTranslation("reseau")
  const { networkId } = useNetwork()
  const router = useRouter()
  const routes = useRoutes()
  const muted = useAuthenticatedConvexQuery(api.modules.marks.marks.isAuthorMuted, { networkId, targetPersonId })
  const mute = useMutation(api.modules.marks.marks.muteAuthor)
  const unmute = useMutation(api.modules.marks.marks.unmuteAuthor)
  const [open, setOpen] = useState(false)
  const [anchor, setAnchor] = useState<Anchor | null>(null)
  const [confirmingBlock, setConfirmingBlock] = useState(false)
  const [pending, setPending] = useState(false)
  const [activeIndex, setActiveIndex] = useState(0)
  const buttonRef = useRef<HTMLButtonElement | null>(null)
  const menuRef = useRef<HTMLDivElement | null>(null)
  const itemRefs = useRef<(HTMLButtonElement | null)[]>([])
  const pendingFocus = useRef<"first" | "last" | null>(null)
  const menuId = useId()

  const entries = profileOverflowEntriesFor({ handle, muted: muted.data }, t)

  const place = useCallback(() => {
    const rect = buttonRef.current?.getBoundingClientRect()
    if (rect === undefined) return
    const left = Math.max(VIEWPORT_MARGIN, Math.min(rect.right - MENU_WIDTH, window.innerWidth - MENU_WIDTH - VIEWPORT_MARGIN))
    const below = rect.bottom + 6
    const height = menuRef.current?.offsetHeight || ESTIMATED_MENU_HEIGHT
    const flip = below + height > window.innerHeight - VIEWPORT_MARGIN
    setAnchor(flip ? { left, bottom: Math.max(VIEWPORT_MARGIN, window.innerHeight - rect.top + 6) } : { left, top: Math.max(VIEWPORT_MARGIN, below) })
  }, [])

  useLayoutEffect(() => {
    if (open) place()
  }, [open, place])

  const focusItem = useCallback((index: number) => {
    const items = itemRefs.current.filter((item): item is HTMLButtonElement => item !== null)
    if (items.length === 0) return
    const next = Math.max(0, Math.min(index, items.length - 1))
    setActiveIndex(next)
    items[next]?.focus()
  }, [])

  useEffect(() => {
    if (!open || anchor === null) return
    const which = pendingFocus.current
    if (which === null) return
    pendingFocus.current = null
    focusItem(which === "last" ? itemRefs.current.length - 1 : 0)
  }, [open, anchor, focusItem])

  const closeMenu = useCallback((returnFocus: boolean) => {
    setOpen(false)
    if (returnFocus) buttonRef.current?.focus({ preventScroll: true })
  }, [])

  useEffect(() => {
    if (!open) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") closeMenu(true)
    }
    const onPointer = (event: MouseEvent) => {
      const target = event.target as Node
      if (menuRef.current?.contains(target) === true || buttonRef.current?.contains(target) === true) return
      setOpen(false)
    }
    // Le menu suit son bouton tant qu'il reste visible ; sinon il se ferme, focus rendu.
    const onScroll = (event: Event) => {
      if (event.target instanceof Node && menuRef.current?.contains(event.target) === true) return
      const rect = buttonRef.current?.getBoundingClientRect()
      const visible = rect !== undefined && rect.width + rect.height > 0 && rect.bottom > 0 && rect.top < window.innerHeight
      if (visible) {
        place()
        return
      }
      closeMenu(menuRef.current?.contains(document.activeElement) === true)
    }
    const onResize = () => place()
    document.addEventListener("keydown", onKey)
    document.addEventListener("mousedown", onPointer, true)
    window.addEventListener("scroll", onScroll, true)
    window.addEventListener("resize", onResize)
    return () => {
      document.removeEventListener("keydown", onKey)
      document.removeEventListener("mousedown", onPointer, true)
      window.removeEventListener("scroll", onScroll, true)
      window.removeEventListener("resize", onResize)
    }
  }, [open, place, closeMenu])

  const openMenu = (focus: "first" | "last") => {
    pendingFocus.current = focus
    setOpen(true)
  }

  const onTriggerKeyDown = (event: ReactKeyboardEvent<HTMLButtonElement>) => {
    if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return
    event.preventDefault()
    const which = event.key === "ArrowUp" ? "last" : "first"
    if (open) focusItem(which === "last" ? itemRefs.current.length - 1 : 0)
    else openMenu(which)
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
        // Arrêté ici : Échap ne ferme pas aussi une surface modale sous-jacente.
        event.preventDefault()
        event.stopPropagation()
        closeMenu(true)
        return
      case "Tab":
        closeMenu(true)
        return
      default:
        return
    }
  }

  const run = (action: ProfileOverflowAction) => {
    closeMenu(true)
    if (action === "block") {
      setConfirmingBlock(true)
      return
    }
    if (pending) return
    setPending(true)
    const gesture = action === "mute" ? mute({ networkId, targetPersonId }) : unmute({ networkId, targetPersonId })
    void gesture
      .then(() => toast.success(t(action === "mute" ? "profilPersonnePage.toast.muted" : "profilPersonnePage.toast.unmuted", { name: displayName })))
      .catch((error: unknown) => toast.error(postEngineErrorText(error, "reseau:profilPersonnePage.toast.muteFailed", t)))
      .finally(() => setPending(false))
  }

  return (
    <>
      <style href="pp-overflow" precedence="medium">{`
        .pp-of-menu {
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
        .pp-of-item {
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
        .pp-of-item:hover, .pp-of-item:focus-visible { background: var(--ink-100); }
        .pp-of-grave { color: var(--danger-600); }
        .pp-of-label { font-size: 14px; font-weight: 500; }
        .pp-of-hint { display: block; margin-top: 2px; font-size: 12px; line-height: 1.35; color: var(--ink-600); }
        .pp-of-sep { height: 1px; margin: 4px 6px; background: var(--ink-200); }
      `}</style>

      {/* Bouton NATIF : le `Button` du kit ne transmet pas `ref`, nécessaire pour
          ancrer le menu et lui rendre le focus. Géométrie des actions compactes. */}
      <button
        ref={buttonRef}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        aria-label={t("profilPersonnePage.overflow.trigger", { name: displayName })}
        disabled={pending}
        style={{ ...RESEAU_SECONDARY_ACTION_STYLE, ...COMPACT_SOCIAL_ACTION_STYLE, minWidth: 34, cursor: "pointer" }}
        onClick={() => (open ? setOpen(false) : openMenu("first"))}
        onKeyDown={onTriggerKeyDown}
      >
        <span aria-hidden="true">···</span>
      </button>

      {open && anchor !== null
        ? createPortal(
            <div
              ref={menuRef}
              id={menuId}
              className="pp-of-menu"
              role="menu"
              // Le focus vit sur les entrées (tabindex itinérant) ; le conteneur reste focalisable par programme.
              tabIndex={-1}
              aria-label={t("profilPersonnePage.overflow.menu", { name: displayName })}
              onKeyDown={onMenuKeyDown}
              style={{
                top: anchor.top,
                bottom: anchor.bottom,
                left: anchor.left,
                maxHeight: anchor.bottom === undefined ? undefined : `calc(100vh - ${anchor.bottom + VIEWPORT_MARGIN}px)`,
                overflowY: anchor.bottom === undefined ? undefined : "auto",
              }}
            >
              {entries.map((entry, index) => (
                <div key={entry.id} role="none">
                  {entry.grave && index > 0 && entries[index - 1]?.grave !== true ? <div className="pp-of-sep" aria-hidden="true" /> : null}
                  <button
                    ref={(node) => {
                      itemRefs.current[index] = node
                    }}
                    type="button"
                    role="menuitem"
                    tabIndex={index === activeIndex ? 0 : -1}
                    className={`pp-of-item${entry.grave ? " pp-of-grave" : ""}`}
                    onFocus={() => setActiveIndex(index)}
                    onClick={() => run(entry.id)}
                  >
                    <span className="pp-of-label">{entry.label}</span>
                    <span className="pp-of-hint">{entry.hint}</span>
                  </button>
                </div>
              ))}
            </div>,
            document.body,
          )
        : null}

      {confirmingBlock ? (
        <BlockPersonDialog
          mode="block"
          targetPersonId={targetPersonId}
          name={displayName}
          onClose={() => setConfirmingBlock(false)}
          onDone={() => router.push(reseauAgentHref("relations", routes.home()))}
        />
      ) : null}
    </>
  )
}
