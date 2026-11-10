import { COMPOSE_GROUPE_LEAF, COMPOSE_LEAF, CONVERSATION_ROUTE_KINDS, CONTEXTUAL_ROUTE_KIND } from "@antsia/social-features/features/messagerie/messagerie-routes"

/** Ce que l'aiguillage de la messagerie (`MessagesRoute`) reçoit d'une adresse. */
export type MessagesRouteTarget = { kind?: string; id?: string; compose?: "personne" | "groupe" }

/**
 * Les segments d'une adresse de messagerie → l'aiguillage de `MessagesRoute`
 * (liste, composeurs, conversation `<genre>/<identifiant>`), `null` pour toute
 * autre forme (la page répond « introuvable »). Module PUR : la page serveur le
 * lit avant de rendre l'écran client.
 */
export function parseMessagesSegments(segments: readonly string[]): MessagesRouteTarget | null {
  if (segments.length === 0) return {}
  const [first, second, ...rest] = segments
  if (rest.length > 0 || first === undefined) return null
  if (second === undefined) {
    if (first === COMPOSE_LEAF) return { compose: "personne" }
    if (first === COMPOSE_GROUPE_LEAF) return { compose: "groupe" }
    return null
  }
  try {
    const kind = decodeURIComponent(first), id = decodeURIComponent(second)
    if (kind === CONTEXTUAL_ROUTE_KIND) return /^[A-Za-z0-9_-]{1,128}$/u.test(id) ? { kind, id } : null
    if (kind !== "commerce" && !(CONVERSATION_ROUTE_KINDS as readonly string[]).includes(kind)) return null
    return { kind, id }
  } catch { return null }
}
