// Dupliqué de socle/packages/agent-features/src/features/reseau-personnel/Avatar.tsx @ ad2e7fdc2 — adaptations : primitives de `@antsia/ui` ; contour carré des pages et initiales du nom publié ; angle des pages lu dans `--esp-avatar-page-radius` (ADR-0027), `--radius-lg` en repli ; teinte publique stable et tailles d'initiales opt-in des sept chartes ; échec de photo lié à son adresse.
"use client"

/**
 * La pastille d'identité.
 *
 * Une photo quand le profil en publie une ; sinon les initiales du nom PUBLIÉ ;
 * sinon une silhouette. Jamais d'initiales tirées d'un état civil — le repli
 * porte sur ce que le serveur a bien voulu rendre, et il ne rend que le publié.
 */

import { Icon } from "@antsia/ui"
import { useState } from "react"
import { avatarInitialsFontSize, identityToneStyle } from "./avatar-presentation"

interface AvatarProps {
  displayName: string
  avatarUrl?: string | null
  size?: number
  /** Le profil est-il publié ? Un profil neutre n'a pas d'initiales à montrer. */
  hasIdentity?: boolean
  /**
   * Le CONTOUR. Une PAGE (institution, association, média…) ne se rend pas en
   * médaillon : son logo est une marque, pas un visage — rogné en cercle, il
   * perd son cadre et le plus souvent son sigle. Qui prend quelle forme se
   * décide dans `author-link.ts` (`avatarShapeFor`), pas ici.
   *
   * Défaut `round` : tous les appels existants sont inchangés.
   */
  shape?: "round" | "square"
}

/** Deux lettres au plus — au-delà, c'est illisible dans 32 px. */
export function initialsOf(displayName: string): string {
  return displayName
    .split(/\s+/)
    .filter((part) => part.length > 0)
    .slice(0, 2)
    .map((part) => part[0]!.toUpperCase())
    .join("")
}

export function Avatar({
  displayName,
  avatarUrl,
  size = 40,
  hasIdentity = true,
  shape = "round",
}: AvatarProps) {
  const [failedUrl, setFailedUrl] = useState<string | null>(null)
  const showImage = Boolean(avatarUrl) && failedUrl !== avatarUrl
  const initials = hasIdentity ? initialsOf(displayName) : ""
  const renderedSize = size === 104 ? `var(--esp-profile-avatar-size, ${size}px)` : size
  const tone = identityToneStyle(displayName, hasIdentity)

  return (
    <span
      aria-hidden="true"
      style={{
        width: renderedSize,
        height: renderedSize,
        flexShrink: 0,
        // Le rayon de la tuile est un JETON, jamais une valeur : la charte
        // scopée de l'espace le remappe avec le reste.
        // Les pages en carré arrondi, les personnes en rond (ADR-0027).
        borderRadius: shape === "square"
          ? size === 104
            ? "var(--esp-profile-avatar-page-radius, var(--esp-avatar-page-radius, var(--radius-lg)))"
            : "var(--esp-avatar-page-radius, var(--radius-lg))"
          : size / 2,
        overflow: "hidden",
        background: showImage ? "var(--ink-100)" : tone.background,
        color: tone.color,
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        fontSize: avatarInitialsFontSize(size),
        fontWeight: 700,
        letterSpacing: "0.02em",
      }}
    >
      {showImage ? (
        <img
          src={avatarUrl ?? undefined}
          alt=""
          // Les avatars sont déjà rendus dans des listes bornées et occupent
          // presque toujours la zone visible. Le lazy-loading natif d'Edge les
          // remplaçait par des placeholders et différait leurs évènements de
          // chargement, jusque dans la vue Invitations. Une identité ne doit
          // pas clignoter après le reste de sa ligne : elle charge avec elle.
          loading="eager"
          decoding="async"
          onError={() => setFailedUrl(avatarUrl ?? null)}
          style={{ width: "100%", height: "100%", objectFit: "cover" }}
        />
      ) : initials.length > 0 ? (
        initials
      ) : (
        <Icon name="user" size={Math.round(size * 0.5)} />
      )}
    </span>
  )
}
