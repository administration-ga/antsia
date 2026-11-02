// Dupliqué de socle/packages/ui/src/components/sheet.tsx @ ad2e7fdc2 — adaptations : `cn`, bouton et portée de charte du paquet ; voile noir à 10 % de la palette Tailwind → jeton `--sheet-scrim` (aucune couleur hors des jetons) ; libellé de la croix « Fermer » en dur → prop `closeLabel` traduite par l'appelant. feuille ancrée aux coins24px et sans contour sous ANTSIA, géométrie historique ailleurs.
"use client"

/**
 * Tiroir — carte flottante ANCRÉE à un bord (Radix Dialog).
 *
 * ⚠️ Exception assumée à la règle « ne pas modifier ui/ directement », pour
 * les mêmes raisons que `dialog.tsx` (défauts de la primitive, API inchangée) :
 *   • calque `z-[100]`, celui des cartes flottantes (il était à `z-50`, sous
 *     les dialogues et les `BottomSheet`) ;
 *   • un tiroir plus haut que la fenêtre DÉFILE au lieu de sortir de l'écran ;
 *     avec `SheetBody`, seul le corps défile, en-tête et pied restent fixes ;
 *   • les tiroirs haut et bas sont bornés à la fenêtre ;
 *   • monté dans l'hôte de portail de l'espace qui l'ouvre, dont il hérite la
 *     charte (`useOverlayContainer`, cf. `overlay-scope.tsx`).
 */
import * as React from "react"
import { Dialog as SheetPrimitive } from "radix-ui"

import { cn } from "../lib/cn"
import { Button } from "./sheet-button"
import { useOverlayContainer } from "./overlay-scope"
import { XIcon } from "lucide-react"

function Sheet({ ...props }: React.ComponentProps<typeof SheetPrimitive.Root>) {
  return <SheetPrimitive.Root data-slot="sheet" {...props} />
}

function SheetTrigger({
  ...props
}: React.ComponentProps<typeof SheetPrimitive.Trigger>) {
  return <SheetPrimitive.Trigger data-slot="sheet-trigger" {...props} />
}

function SheetClose({
  ...props
}: React.ComponentProps<typeof SheetPrimitive.Close>) {
  return <SheetPrimitive.Close data-slot="sheet-close" {...props} />
}

function SheetPortal({
  ...props
}: React.ComponentProps<typeof SheetPrimitive.Portal>) {
  return <SheetPrimitive.Portal data-slot="sheet-portal" {...props} />
}

function SheetOverlay({
  className,
  ...props
}: React.ComponentProps<typeof SheetPrimitive.Overlay>) {
  return (
    <SheetPrimitive.Overlay
      data-slot="sheet-overlay"
      className={cn(
        "fixed inset-0 z-[100] bg-[var(--sheet-scrim)] duration-100 supports-backdrop-filter:backdrop-blur-xs data-open:animate-in data-open:fade-in-0 data-closed:animate-out data-closed:fade-out-0",
        className
      )}
      {...props}
    />
  )
}

function SheetContent({
  className,
  children,
  side = "right",
  showCloseButton = true,
  closeLabel,
  ...props
}: React.ComponentProps<typeof SheetPrimitive.Content> & {
  side?: "top" | "right" | "bottom" | "left"
  showCloseButton?: boolean
  /** Nom accessible de la croix, traduit par l'appelant (un paquet d'interface ne porte aucune chaîne). */
  closeLabel?: string
}) {
  const container = useOverlayContainer()
  return (
    <SheetPortal container={container}>
      <SheetOverlay />
      <SheetPrimitive.Content
        data-slot="sheet-content"
        data-side={side}
        className={cn(
          "fixed z-[100] flex flex-col gap-4 overflow-y-auto overscroll-contain has-data-[slot=sheet-body]:overflow-hidden bg-popover bg-clip-padding text-sm text-popover-foreground shadow-lg transition duration-200 ease-in-out data-[side=bottom]:inset-x-0 data-[side=bottom]:bottom-0 data-[side=bottom]:border-t data-[side=bottom]:pb-[env(safe-area-inset-bottom,0px)] data-[side=left]:inset-y-0 data-[side=left]:left-0 data-[side=left]:border-r data-[side=right]:inset-y-0 data-[side=right]:right-0 data-[side=right]:border-l data-[side=top]:inset-x-0 data-[side=top]:top-0 data-[side=top]:border-b data-open:animate-in data-open:fade-in-0 data-[side=bottom]:data-open:slide-in-from-bottom-10 data-[side=left]:data-open:slide-in-from-left-10 data-[side=right]:data-open:slide-in-from-right-10 data-[side=top]:data-open:slide-in-from-top-10 data-closed:animate-out data-closed:fade-out-0 data-[side=bottom]:data-closed:slide-out-to-bottom-10 data-[side=left]:data-closed:slide-out-to-left-10 data-[side=right]:data-closed:slide-out-to-right-10 data-[side=top]:data-closed:slide-out-to-top-10",
          // Géométrie par côté en utilitaires SIMPLES, choisis ici : une
          // variante `data-[side=…]:w-3/4` ou `data-[side=…]:h-auto` battait
          // par spécificité le `sm:max-w-2xl` ou le `h-dvh` passé par
          // l'appelant (tiroir de dossier resté à 384 px, vidéo d'appel dans
          // une boîte de hauteur nulle). En simples, `cn` les fusionne avec
          // ceux de l'appelant, qui gagnent.
          side === "left" || side === "right"
            ? "h-full w-3/4 sm:max-w-sm"
            : "h-auto max-h-[calc(100dvh-2rem)]",
          side === "left" ? "rounded-r-[var(--esp-primitive-card-radius,0px)]"
            : side === "right" ? "rounded-l-[var(--esp-primitive-card-radius,0px)]"
              : side === "top" ? "rounded-b-[var(--esp-primitive-card-radius,0px)]"
                : "rounded-t-[var(--esp-primitive-card-radius,0px)]",
          "border-[color:var(--esp-raised-border,var(--border))]",
          className
        )}
        {...props}
      >
        {children}
        {showCloseButton && (
          <SheetPrimitive.Close data-slot="sheet-close" asChild>
            <Button
              variant="ghost"
              className="absolute top-4 right-4"
              size="icon-sm"
            >
              <XIcon
              />
              {/* Libellé a11y sr-only lu par les lecteurs d'écran, fourni par l'appelant. */}
              {closeLabel ? <span className="sr-only">{closeLabel}</span> : null}
            </Button>
          </SheetPrimitive.Close>
        )}
      </SheetPrimitive.Content>
    </SheetPortal>
  )
}

function SheetHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="sheet-header"
      // `pr-12` : un titre long ne passe plus sous la croix de fermeture.
      className={cn("flex min-w-0 shrink-0 flex-col gap-1.5 p-4 pr-12", className)}
      {...props}
    />
  )
}

/**
 * Corps d'un tiroir — la seule tranche qui défile : en-tête et pied restent
 * visibles. Sa présence retire le défilement du tiroir entier.
 */
function SheetBody({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="sheet-body"
      className={cn(
        "flex min-h-0 min-w-0 flex-1 flex-col gap-4 overflow-y-auto overscroll-contain px-4 pb-4",
        className
      )}
      {...props}
    />
  )
}

function SheetFooter({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="sheet-footer"
      className={cn("mt-auto flex shrink-0 flex-col gap-2 p-4", className)}
      {...props}
    />
  )
}

function SheetTitle({
  className,
  ...props
}: React.ComponentProps<typeof SheetPrimitive.Title>) {
  return (
    <SheetPrimitive.Title
      data-slot="sheet-title"
      className={cn(
        "font-heading text-base leading-snug font-semibold text-pretty text-foreground",
        className
      )}
      {...props}
    />
  )
}

function SheetDescription({
  className,
  ...props
}: React.ComponentProps<typeof SheetPrimitive.Description>) {
  return (
    <SheetPrimitive.Description
      data-slot="sheet-description"
      className={cn("text-sm text-muted-foreground", className)}
      {...props}
    />
  )
}

export {
  Sheet,
  SheetTrigger,
  SheetClose,
  SheetContent,
  SheetHeader,
  SheetBody,
  SheetFooter,
  SheetTitle,
  SheetDescription,
}
