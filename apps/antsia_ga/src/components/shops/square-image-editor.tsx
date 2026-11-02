"use client"

import { useEffect, useId, useMemo, useRef, useState } from "react"
import { useTranslation } from "react-i18next"

import { calculateSquareCrop, type SquareImageSelection } from "@/lib/square-image"

export type { SquareImageSelection } from "@/lib/square-image"

const CENTER = { x: 0.5, y: 0.5, zoom: 1 }

/** Aperçu du même rectangle source que celui transmis au réencodeur local. */
export function SquareImageEditor({ file, onChange }: { file: File; onChange: (selection: SquareImageSelection | null) => void }) {
  const { t } = useTranslation("shops")
  const id = useId()
  const notify = useRef(onChange)
  const [source, setSource] = useState<{ file: File; url: string } | null>(null)
  const [dimensions, setDimensions] = useState<{ file: File; width: number; height: number } | null>(null)
  const [position, setPosition] = useState(CENTER)
  const [failedFile, setFailedFile] = useState<File | null>(null)
  useEffect(() => { notify.current = onChange }, [onChange])
  useEffect(() => {
    const url = URL.createObjectURL(file)
    setSource({ file, url })
    setDimensions(null)
    setPosition(CENTER)
    setFailedFile(null)
    notify.current(null)
    return () => { URL.revokeObjectURL(url) }
  }, [file])
  const selection = useMemo<SquareImageSelection | null>(() => dimensions?.file === file && failedFile !== file ? { width: dimensions.width, height: dimensions.height, ...position } : null, [dimensions, file, position, failedFile])
  useEffect(() => { notify.current(selection) }, [selection])
  const crop = selection ? calculateSquareCrop(selection.width, selection.height, selection) : null
  const currentSource = source?.file === file ? source : null
  const invalid = failedFile === file
  return <section className="grid min-w-0 gap-3" aria-labelledby={`${id}-title`}>
    <h4 id={`${id}-title`} className="text-sm font-semibold">{t("images.cropTitle")}</h4>
    <p id={`${id}-hint`} className="text-sm text-muted-foreground">{t("images.cropHint")}</p>
    {currentSource && !invalid ? <div className="relative aspect-square w-full max-w-sm overflow-hidden bg-muted" data-square-image-preview>
      {/* eslint-disable-next-line @next/next/no-img-element -- aperçu d'un fichier local par URL objet, révoquée à la sortie. */}
      <img src={currentSource.url} alt={t("images.previewAlt")} onLoad={event => {
        const { naturalWidth: width, naturalHeight: height } = event.currentTarget
        try {
          calculateSquareCrop(width, height)
          setDimensions({ file, width, height })
          setFailedFile(null)
        } catch { setDimensions(null); setFailedFile(file) }
      }} onError={() => { setDimensions(null); setFailedFile(file) }} className="absolute block max-w-none" style={selection && crop ? { width: `${selection.width / crop.size * 100}%`, height: `${selection.height / crop.size * 100}%`, left: `${-crop.left / crop.size * 100}%`, top: `${-crop.top / crop.size * 100}%` } : { width: "100%", height: "100%", objectFit: "cover", visibility: "hidden" }} />
    </div> : null}
    {invalid ? <p role="alert" className="text-sm text-destructive">{t("images.invalid")}</p> : null}
    <fieldset disabled={selection === null} aria-describedby={`${id}-hint`} className="grid min-w-0 gap-3">
      {(["x", "y", "zoom"] as const).map(axis => {
        const key = axis === "x" ? "horizontal" : axis === "y" ? "vertical" : "zoom"
        const immovable = selection !== null && crop !== null && (axis === "x" ? crop.size === selection.width : axis === "y" ? crop.size === selection.height : false)
        return <label key={axis} htmlFor={`${id}-${axis}`} className="grid gap-1 text-sm"><span>{t(`images.${key}`)}</span><input id={`${id}-${axis}`} type="range" disabled={immovable} min={axis === "zoom" ? 1 : 0} max={axis === "zoom" ? 3 : 100} step={axis === "zoom" ? 0.05 : 1} value={axis === "zoom" ? position[axis] : position[axis] * 100} onChange={event => {
          const value = event.currentTarget.valueAsNumber
          if (Number.isFinite(value)) setPosition(current => ({ ...current, [axis]: axis === "zoom" ? value : value / 100 }))
        }} className="min-h-11 w-full accent-primary" /></label>
      })}
      <button type="button" onClick={() => setPosition(CENTER)} className="min-h-11 justify-self-start rounded-[var(--ui2-button-radius)] px-3 py-2 text-sm font-medium underline underline-offset-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">{t("images.reset")}</button>
    </fieldset>
  </section>
}
