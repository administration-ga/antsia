// Dupliqué de socle/convex/modules/reseauPersonnel/media.ts (type `PostMediaDto`, l. 35-51) @ ad2e7fdc2 — adaptations : type sorti du backend (le front n'importe que lui) ; URL `null` et retenue nommée quand la garde des fichiers retient le média (fail-closed) au lieu d'omettre le média.
/**
 * Ce que l'écran reçoit d'un média de publication, de story ou d'album.
 * ALLOWLIST STRICTE : ni identifiant de stockage, ni poids (validé à
 * l'écriture, il ne regarde pas les autres lecteurs).
 *
 * `url` est `null` tant que la garde des fichiers retient le média : l'écran
 * dit pourquoi (`withheld` : analyse en cours, analyse impossible, ou bloqué)
 * au lieu d'un lien mort.
 */
export type MediaWithheld = "fileScanPending" | "fileScanUnavailable" | "fileQuarantined"

export type PostMediaDto = {
  url: string | null
  withheld: MediaWithheld | null
  kind: "image" | "video"
  mimeType: string
  width?: number
  height?: number
  durationMs?: number
  altText?: string
}
