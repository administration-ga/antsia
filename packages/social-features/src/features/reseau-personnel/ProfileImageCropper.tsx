"use client"

/**
 * ProfileImageCropper — recadrer la photo (en cercle) ou la couverture (en
 * bandeau) d'un profil AVANT son envoi (lot PF-03, plan 05).
 *
 * Ce qui se DÉCIDE vit dans `profile-image-crop.ts` (module pur, testé) : le
 * cadre, le zoom, le déplacement, le clavier, la position de l'aperçu. Ici, le
 * rendu et les gestes seulement. Aucune dépendance : un `<img>` positionné
 * dans un cadre qui le rogne — la région que montre ce cadre est celle que le
 * module de préparation dessinera sur son canvas (même `cropRectFor`).
 *
 * Gestes : glisser (souris, doigt) pour déplacer, pincer (deux doigts) ou le
 * curseur pour zoomer ; au clavier, sur le cadre : flèches pour déplacer
 * (Maj : plus loin), `+` et `-` pour zoomer, `0` pour recentrer. Les
 * instructions sont annoncées (`aria-describedby`), le zoom aussi (région
 * `aria-live`).
 *
 * États : chargement de l'image ; image illisible (rien n'est envoyé) ; image
 * ANIMÉE (GIF ou WebP animé) — elle ne se recadre pas sans perdre son
 * animation : elle part entière, l'aperçu la montre comme la fiche la
 * montrera (rognée au centre) ; refus de la préparation ou de l'envoi, dit
 * par l'appelant (`error`) — jamais l'original.
 *
 * Le dialogue : modal (focus piégé, Échap, retour du focus au déclencheur,
 * `useModalA11y`), cibles d'au moins 44 px, jetons de couleur seulement.
 */

import { themedActionStyle } from "../themed-action-style"
import { Alert, Button, useModalA11y } from "@antsia/ui"
import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent } from "react"
import { createPortal } from "react-dom"
import { useTranslation } from "react-i18next"

import { isAnimatedImage, type ImageCrop } from "../media-upload"
import { RESEAU_PRIMARY_ACTION_STYLE } from "../../shell/design-styles"
import {
  PROFILE_CROP_MAX_ZOOM,
  PROFILE_IMAGE_FRAMES,
  applyCropKeyAction,
  cropKeyAction,
  cropPreviewStyle,
  cropRectFor,
  cropZoomLabel,
  dragCropView,
  initialCropView,
  isCropSource,
  pinchZoom,
  zoomCropViewTo,
  type CropSource,
  type CropView,
  type ProfileImageKind,
} from "./profile-image-crop"

export interface ProfileImageCropperProps {
  /** L'image choisie — jamais envoyée telle quelle. */
  file: File
  kind: ProfileImageKind
  /** La préparation ou l'envoi court : gestes figés, Échap sans effet. */
  busy: boolean
  /** Le refus de la préparation ou de l'envoi, déjà traduit — `null` sinon. */
  error: string | null
  onCancel: () => void
  /** La région gardée ; `null` pour une image animée, envoyée entière. */
  onConfirm: (crop: ImageCrop | null) => void
}

type LoadState =
  | { status: "loading" }
  | { status: "ready"; source: CropSource }
  | { status: "unreadable" }

/** Les cibles tactiles du dialogue : 44 px au moins (WCAG 2.5.5). */
const TOUCH_TARGET = { minHeight: 44 } as const

export function ProfileImageCropper({ file, kind, busy, error, onCancel, onConfirm }: ProfileImageCropperProps) {
  const { t, i18n } = useTranslation("reseau")
  const frame = PROFILE_IMAGE_FRAMES[kind]
  const titleId = useId()
  const instructionsId = useId()
  const zoomId = useId()
  const dialogRef = useRef<HTMLDivElement>(null)
  const frameRef = useRef<HTMLDivElement>(null)
  const [url, setUrl] = useState<string | null>(null)
  const [load, setLoad] = useState<LoadState>({ status: "loading" })
  const [animated, setAnimated] = useState<boolean | null>(null)
  const [view, setView] = useState<CropView>({ zoom: 1, centerX: 0, centerY: 0 })
  const [announcement, setAnnouncement] = useState("")

  // L'image, par une URL locale révoquée à la sortie : rien ne quitte l'appareil.
  useEffect(() => {
    if (typeof URL.createObjectURL !== "function") {
      // Sans URL locale, aucun aperçu fidèle : l'image n'est pas envoyée.
      setUrl(null)
      setLoad({ status: "unreadable" })
      return
    }
    const objectUrl = URL.createObjectURL(file)
    setUrl(objectUrl)
    setLoad({ status: "loading" })
    return () => URL.revokeObjectURL(objectUrl)
  }, [file])

  // Une image animée se reconnaît à ses octets (WebP) ou à son type (GIF).
  useEffect(() => {
    let current = true
    setAnimated(null)
    void isAnimatedImage(file).then(
      (value) => {
        if (current) setAnimated(value)
      },
      () => {
        if (current) setAnimated(false)
      },
    )
    return () => {
      current = false
    }
  }, [file])

  // Le hook s'installe au montage et lit l'état courant par des références.
  const busyRef = useRef(busy)
  const onCancelRef = useRef(onCancel)
  useEffect(() => {
    busyRef.current = busy
    onCancelRef.current = onCancel
  }, [busy, onCancel])
  useModalA11y({
    containerRef: dialogRef,
    initialFocusRef: frameRef,
    onClose: () => {
      if (!busyRef.current) onCancelRef.current()
    },
  })

  const source = load.status === "ready" ? load.source : null
  const rect = useMemo(() => (source === null ? null : cropRectFor(source, frame.aspect, view)), [source, frame.aspect, view])
  const croppable = source !== null && animated === false
  const ready = source !== null && animated !== null

  const announceZoom = (next: CropView) => {
    setAnnouncement(t("profileImageCropper.zoomStatus", { value: cropZoomLabel(next, i18n.language) }))
  }

  // ─── Glisser et pincer ───────────────────────────────────────────
  const pointers = useRef(new Map<number, { x: number; y: number }>())
  const pinch = useRef<{ distance: number; zoom: number } | null>(null)

  const distanceBetweenPointers = (): number | null => {
    const [first, second] = [...pointers.current.values()]
    if (first === undefined || second === undefined) return null
    return Math.hypot(first.x - second.x, first.y - second.y)
  }

  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (!croppable || busy) return
    event.currentTarget.setPointerCapture?.(event.pointerId)
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY })
    const distance = distanceBetweenPointers()
    pinch.current = distance === null ? null : { distance, zoom: view.zoom }
  }

  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const previous = pointers.current.get(event.pointerId)
    if (previous === undefined || source === null || !croppable || busy) return
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY })
    if (pointers.current.size >= 2 && pinch.current !== null) {
      const distance = distanceBetweenPointers()
      if (distance !== null) setView((current) => zoomCropViewTo(source, frame.aspect, current, pinchZoom(pinch.current?.zoom ?? current.zoom, pinch.current?.distance ?? distance, distance)))
      return
    }
    const width = frameRef.current?.getBoundingClientRect().width ?? 0
    const delta = { dx: event.clientX - previous.x, dy: event.clientY - previous.y }
    setView((current) => dragCropView(source, frame.aspect, current, delta, width))
  }

  const onPointerEnd = (event: PointerEvent<HTMLDivElement>) => {
    pointers.current.delete(event.pointerId)
    if (pointers.current.size < 2) pinch.current = null
  }

  // ─── Clavier ─────────────────────────────────────────────────────
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (!croppable || busy || source === null) return
    const action = cropKeyAction(event.key, event.shiftKey)
    if (action === null) return
    event.preventDefault()
    const next = applyCropKeyAction(source, frame.aspect, view, action)
    setView(next)
    if (action.kind !== "move") announceZoom(next)
  }

  const imageStyle =
    rect !== null && croppable
      ? { position: "absolute" as const, maxWidth: "none", ...cropPreviewStyle(rect) }
      : // L'image animée est montrée comme la fiche la montrera : rognée au centre.
        { position: "absolute" as const, inset: 0, width: "100%", height: "100%", objectFit: "cover" as const, visibility: ready ? ("visible" as const) : ("hidden" as const) }

  return createPortal(
    <div
      ref={dialogRef}
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      aria-describedby={instructionsId}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 100,
        display: "grid",
        placeItems: "center",
        padding: 16,
        background: "var(--ui2-scrim)",
        overflowY: "auto",
      }}
    >
      <div
        style={{
          width: "min(560px, 100%)",
          padding: 20,
          border: "1px solid var(--border)",
          borderRadius: 12,
          background: "var(--esp-surface-raised, var(--card))",
          color: "var(--foreground)",
          boxShadow: "var(--shadow-xl)",
          display: "grid",
          gap: 14,
        }}
      >
        <h2 id={titleId} style={{ margin: 0, fontSize: 18 }}>
          {t(`profileImageCropper.title.${kind}`)}
        </h2>
        <p id={instructionsId} style={{ margin: 0, color: "var(--muted-foreground)", fontSize: 14 }}>
          {animated === true ? t("profileImageCropper.animated") : t("profileImageCropper.instructions")}
        </p>

        {load.status === "unreadable" ? (
          <Alert tone="danger">{t("profileImageCropper.unreadable")}</Alert>
        ) : (
          <div
            ref={frameRef}
            role="application"
            aria-roledescription={t("profileImageCropper.roleDescription")}
            aria-label={t(`profileImageCropper.frameLabel.${kind}`)}
            aria-describedby={instructionsId}
            aria-busy={!ready}
            tabIndex={0}
            data-shape={frame.shape}
            className="focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerEnd}
            onPointerCancel={onPointerEnd}
            onKeyDown={onKeyDown}
            style={{
              position: "relative",
              justifySelf: "center",
              width: frame.shape === "circle" ? "min(320px, 100%)" : "100%",
              aspectRatio: `${String(frame.aspect)} / 1`,
              overflow: "hidden",
              // Une image animée n'a pas de masque : le cadre prend lui-même la forme du médaillon.
              borderRadius: frame.shape === "circle" && animated === true ? "50%" : 8,
              background: "var(--muted)",
              // Le geste appartient au cadre : ni défilement ni zoom de la page pendant qu'on glisse.
              touchAction: "none",
              cursor: croppable && !busy ? "grab" : "default",
              userSelect: "none",
            }}
          >
            {url !== null ? (
              // eslint-disable-next-line @next/next/no-img-element -- aperçu d'un fichier local par URL objet, révoquée à la sortie ; aucune optimisation distante n'a de sens ici.
              <img
                src={url}
                alt=""
                draggable={false}
                onLoad={(event) => {
                  const next = { width: event.currentTarget.naturalWidth, height: event.currentTarget.naturalHeight }
                  if (!isCropSource(next)) {
                    setLoad({ status: "unreadable" })
                    return
                  }
                  setView(initialCropView(next))
                  setLoad({ status: "ready", source: next })
                }}
                onError={() => setLoad({ status: "unreadable" })}
                style={imageStyle}
              />
            ) : null}
            {frame.shape === "circle" && croppable ? (
              // Le médaillon : ce qui reste hors du cercle est assombri — c'est
              // ainsi que la photo sera montrée partout.
              <span
                aria-hidden="true"
                style={{
                  position: "absolute",
                  inset: 0,
                  borderRadius: "50%",
                  boxShadow: "0 0 0 100vmax var(--ui2-scrim)",
                  pointerEvents: "none",
                }}
              />
            ) : null}
            {!ready ? (
              <p role="status" style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center", margin: 0, fontSize: 14, color: "var(--muted-foreground)" }}>
                {t("profileImageCropper.loading")}
              </p>
            ) : null}
          </div>
        )}

        {croppable ? (
          <div style={{ display: "grid", gap: 6 }}>
            <label htmlFor={zoomId} style={{ fontWeight: 600, fontSize: 14 }}>
              {t("profileImageCropper.zoom")}
            </label>
            <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
              <input
                id={zoomId}
                type="range"
                min={1}
                max={PROFILE_CROP_MAX_ZOOM}
                step={0.01}
                value={view.zoom}
                disabled={busy}
                aria-valuetext={cropZoomLabel(view, i18n.language)}
                onChange={(event) => {
                  const value = event.currentTarget.valueAsNumber
                  if (source !== null && Number.isFinite(value)) setView((current) => zoomCropViewTo(source, frame.aspect, current, value))
                }}
                className="accent-primary"
                style={{ flex: "1 1 200px", ...TOUCH_TARGET }}
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={busy}
                onClick={() => {
                  if (source === null) return
                  const next = initialCropView(source)
                  setView(next)
                  announceZoom(next)
                }}
                style={{ ...themedActionStyle("cancel", "ghost"), ...TOUCH_TARGET }}
              >
                {t("profileImageCropper.reset")}
              </Button>
            </div>
          </div>
        ) : null}

        {load.status !== "unreadable" ? (
          <p style={{ margin: 0, fontSize: 12.5, color: "var(--muted-foreground)" }}>{t("profileImageCropper.privacy")}</p>
        ) : null}

        {/* Région PERSISTANTE : le zoom au clavier y est annoncé. */}
        <p aria-live="polite" className="sr-only">
          {announcement}
        </p>
        {/* `Alert` porte `role="alert"` : le refus est annoncé dès qu'il paraît. */}
        {error !== null ? <Alert tone="danger">{error}</Alert> : null}

        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, flexWrap: "wrap" }}>
          <Button type="button" variant="outline" disabled={busy} onClick={onCancel} style={{ ...themedActionStyle("cancel", "ghost"), ...TOUCH_TARGET }}>
            {t("profileImageCropper.cancel")}
          </Button>
          {load.status !== "unreadable" ? (
            <Button
              type="button"
              disabled={busy || !ready || (croppable && rect === null)}
              onClick={() => onConfirm(croppable ? rect : null)}
              style={{ ...RESEAU_PRIMARY_ACTION_STYLE, ...TOUCH_TARGET }}
            >
              {busy ? t("profileImageCropper.sending") : t(`profileImageCropper.confirm.${kind}`)}
            </Button>
          ) : null}
        </div>
      </div>
    </div>,
    document.body,
  )
}
