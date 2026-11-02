"use client"

import { cn } from "@antsia/ui/lib/cn"
import { LoaderCircle } from "lucide-react"
import { type ButtonHTMLAttributes, forwardRef, type InputHTMLAttributes, type ReactNode, type TextareaHTMLAttributes } from "react"
import { buttonClassName, type ButtonVariant } from "./button-class"

/**
 * Commandes de la tranche verticale, sur les jetons de la charte (aucune
 * couleur littérale). Les surfaces dupliquées du socle (PA6) apporteront leurs
 * propres composants ; ceux-ci restent volontairement sobres.
 */
export { buttonClassName, type ButtonVariant } from "./button-class"

export function Button({
  variant = "primary",
  pending = false,
  className,
  children,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant; pending?: boolean }) {
  return (
    <button
      {...props}
      disabled={props.disabled || pending}
      aria-busy={pending || undefined}
      className={buttonClassName(variant, className)}
    >
      {pending ? <LoaderCircle aria-hidden="true" className="size-4 animate-spin motion-reduce:animate-none" /> : null}
      {children}
    </button>
  )
}

// Les champs gardent leur filet `--input` (WCAG 1.4.11, P18b) ; leur angle est celui des champs.
const fieldClass =
  "w-full rounded-[var(--esp-field-radius,var(--radius-lg))] border border-input bg-muted px-3 py-2 text-base leading-[1.4] text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring aria-[invalid=true]:border-destructive"

export const TextInput = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(function TextInput({ className, ...props }, ref) {
  return <input ref={ref} {...props} className={cn(fieldClass, "min-h-11", className)} />
})

export const TextArea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(function TextArea({ className, ...props }, ref) {
  return <textarea ref={ref} {...props} className={cn(fieldClass, "min-h-[var(--esp-textarea-min-height,112px)] resize-y", className)} />
})

export function Field(props: { id: string; label: string; hint?: string; error?: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={props.id} className="text-sm font-medium text-foreground">
        {props.label}
      </label>
      {props.children}
      {props.hint ? (
        <p id={`${props.id}-hint`} className="text-xs text-muted-foreground">
          {props.hint}
        </p>
      ) : null}
      {props.error ? (
        <p id={`${props.id}-error`} role="alert" className="text-sm text-destructive">
          {props.error}
        </p>
      ) : null}
    </div>
  )
}

export function Card({ className, children }: { className?: string; children: ReactNode }) {
  return <section className={cn("rounded-[var(--ui2-card-radius,1rem)] border border-[color:var(--esp-surface-border,var(--border))] bg-card p-[var(--esp-card-padding,16px)] text-card-foreground shadow-[var(--esp-surface-shadow,none)] ", className)}>{children}</section>
}

export function CenteredStatus({ label }: { label: string }) {
  return (
    <div role="status" className="flex min-h-[50dvh] items-center justify-center gap-3 text-muted-foreground">
      <LoaderCircle aria-hidden="true" className="size-5 animate-spin motion-reduce:animate-none" />
      <span>{label}</span>
    </div>
  )
}
