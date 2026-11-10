import { cn } from "@antsia/ui/lib/cn"

/**
 * La facture des boutons de l'application, hors du module client `controls.tsx` :
 * une page SERVEUR (catalogue public) peut ainsi habiller un lien en bouton.
 * `controls.tsx` la réexporte ; aucune couleur littérale, seulement des jetons.
 */
export type ButtonVariant = "primary" | "commerce" | "message" | "send" | "success" | "danger" | "ghost" | "outline"

/** La facture d'un bouton, aussi pour un LIEN qui mène à une page (une destination reste un lien). */
export function buttonClassName(variant: ButtonVariant = "primary", className?: string): string {
  return cn(
    // Système épuré (ADR-0027) : pilule, et contour seulement à couleur égale.
    "inline-flex min-h-11 items-center justify-center gap-2 rounded-[var(--ui2-button-radius,var(--radius-lg))] px-4 text-sm font-medium transition-colors",
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
    "disabled:cursor-not-allowed disabled:opacity-60",
    variant === "primary" && "bg-[var(--primary-fill)] text-[color:var(--primary-fill-on,var(--primary-foreground))] hover:bg-[var(--primary-fill-hover)]",
    // Acheter, commander, payer, participer : couleur du commerce (ADR-0027), l'aplat d'identité en repli.
    variant === "commerce" && "bg-[var(--role-commerce-fill,var(--primary-fill))] text-[color:var(--role-commerce-on,var(--primary-fill-on,var(--primary-foreground)))] hover:brightness-[0.95]",
    // Écrire, poser une question : tonal des messages (ADR-0027), comme la variante `message`
    // de @antsia/ui ; le filet prend le fond, donc s'efface. Repli : carte, filet et encre d'identité.
    variant === "message" && "border border-[color:var(--role-message-soft,var(--border))] bg-[var(--role-message-soft,var(--card))] text-[color:var(--role-message-ink,var(--primary))] hover:brightness-[0.97]",
    // Envoyer un message ou une demande : aplat des messages, comme le bouton d'envoi d'iCom ;
    // l'aplat d'identité en repli.
    variant === "send" && "bg-[var(--role-message-fill,var(--primary-fill))] text-[color:var(--role-message-on,var(--primary-fill-on,var(--primary-foreground)))] hover:brightness-[0.95]",
    variant === "success" && "bg-[var(--role-success-fill,var(--success-fill))] text-[color:var(--role-success-on,var(--on-fill))] hover:brightness-[0.95]",
    variant === "danger" && "bg-[var(--role-danger-fill,var(--danger-fill))] text-[color:var(--role-danger-on,var(--on-fill))] hover:brightness-[0.95]",
    // Le neutre (Annuler, Plus tard) : gris, sans filet dans les thèmes ANTSIA.
    variant === "outline" && "border border-[color:var(--ui2-button-outline-border,var(--border))] bg-[var(--ui2-button-outline-bg,var(--card))] text-foreground hover:brightness-[0.97]",
    variant === "ghost" && "text-foreground hover:bg-muted",
    className,
  )
}
