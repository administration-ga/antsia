// Dupliqué de socle/packages/agent-features/src/features/reseau-personnel/RichText.tsx @ ad2e7fdc2 — adaptations : découpage lu dans le domaine du moteur (`splitBodyRich` de `@antsia/social-domain/richText`) ; sans gestionnaire, une mention ou un mot-dièse n'est plus un simple mot mais un LIEN vers l'adresse INJECTÉE (`useRoutes()` : le profil par `personHref`, le fil filtré par `reseauAgentTagHref` sur la page réseau) — les gestionnaires `onTag` / `onMention` gardent la priorité ; P03 (étude social-commerce) : segments déjà découpés acceptés (`segments`, aperçu borné d'une légende) et contenu de fin dans le paragraphe (`trailing`, « Lire la suite »), soulignement des liens du texte courant porté par le jeton `--esp-inline-link-decoration` (aucun par défaut, souligné par le thème ANTSIA, WCAG 1.4.1) ; aucune autre différence de rendu.
"use client"

/**
 * Le corps d'une publication, rendu SANS HTML.
 *
 * ⚠️ Le découpage vient du domaine (`splitBodyRich`, module pur importé — pas
 * réécrit ici) et rend des SEGMENTS, jamais du balisage. Chaque segment devient
 * un nœud React : aucun contenu écrit par un usager n'est interprété, ce qui
 * rend hashtags et mentions cliquables sans ouvrir la porte à l'injection.
 *
 * Réécrire ce découpage côté client était l'autre option ; elle aurait fait
 * diverger deux motifs — celui qui NOTIFIE (serveur) et celui qui SOULIGNE
 * (écran) — et une mention soulignée sans cloche est pire qu'une mention non
 * soulignée : elle promet une notification qui n'arrivera pas.
 *
 * Où mène un segment : au gestionnaire de l'appelant quand il en donne un (le
 * fil filtre sur place), sinon à l'adresse que l'application INJECTE
 * (`useRoutes()`) — le profil de la personne citée, ou le fil filtré sur le
 * mot-dièse. Aucune adresse n'est écrite ici.
 */

import { Link } from "@antsia/api/routing"
import { useRoutes } from "@antsia/api/network"
import { splitBodyRich, type PostBodySegment } from "@antsia/social-domain/richText"
import { Fragment, type ReactNode } from "react"

import { personHref } from "./author-link"
import { reseauAgentTagHref } from "../../shell/reseau-agent-nav"

interface RichTextProps {
  body: string
  /**
   * Segments DÉJÀ découpés (aperçu borné d'une légende, `post-card-caption.ts`)
   * — rendus tels quels, jamais redécoupés : un aperçu ne peut pas fabriquer un
   * jeton que le corps complet ne contient pas. Absents : `splitBodyRich(body)`.
   */
  segments?: readonly PostBodySegment[]
  onTag?: (tag: string) => void
  onMention?: (handle: string) => void
  /** Contenu posé à la FIN du paragraphe (l'ellipse et « Lire la suite »). */
  trailing?: ReactNode
}

/**
 * Le soulignement des liens du TEXTE COURANT (mots-dièse, mentions) vient de
 * la charte : `--esp-inline-link-decoration` vaut `none` dans la base (rendu
 * inchangé ailleurs) et `underline` dans le thème ANTSIA — la couleur seule ne
 * distingue pas un lien d'un mot (WCAG 1.4.1). Les liens de NAVIGATION ne
 * lisent pas ce jeton. Le décalage ne s'applique qu'à un trait présent.
 */
const LINK_STYLE = {
  background: "none",
  border: "none",
  padding: 0,
  margin: 0,
  font: "inherit",
  color: "var(--primary-600)",
  fontWeight: 600,
  cursor: "pointer",
  textDecorationLine: "var(--esp-inline-link-decoration, none)",
  textUnderlineOffset: "0.16em",
} as const

export function RichText({ body, segments: given, onTag, onMention, trailing }: RichTextProps) {
  const routes = useRoutes()
  const segments = given ?? splitBodyRich(body)

  return (
    <p
      style={{
        margin: 0,
        whiteSpace: "pre-wrap",
        overflowWrap: "anywhere",
        color: "var(--ink-700)",
        fontSize: "var(--esp-content-font-size, 16px)",
        lineHeight: "var(--esp-content-line-height, 1.6)",
        textWrap: "pretty",
      }}
    >
      {segments.map((segment, index) => {
        const key = `${segment.type}-${index}`
        if (segment.type === "text") {
          return <Fragment key={key}>{segment.value}</Fragment>
        }
        const prefix = segment.type === "tag" ? "#" : "@"
        const handler = segment.type === "tag" ? onTag : onMention
        // Sans gestionnaire, le segment mène à l'adresse INJECTÉE : le profil
        // de la personne citée, ou le fil filtré sur le mot-dièse.
        if (!handler) {
          const href =
            segment.type === "tag"
              ? reseauAgentTagHref(segment.value, routes.home())
              : personHref(segment.value, routes.profile)
          return (
            <Link key={key} href={href} style={LINK_STYLE}>
              {prefix}
              {segment.value}
            </Link>
          )
        }
        return (
          <button
            key={key}
            type="button"
            style={LINK_STYLE}
            onClick={() => handler(segment.value)}
          >
            {prefix}
            {segment.value}
          </button>
        )
      })}
      {trailing}
    </p>
  )
}
