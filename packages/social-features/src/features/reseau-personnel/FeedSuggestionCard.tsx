"use client"

/**
 * FeedSuggestionCard — la carte de suggestion de l'écran des chartes (ADR-0028),
 * posée en tête du fil au téléphone : UNE personne, son nom et sa ligne
 * d'appoint, puis deux gestes de même largeur — « Suivre » à la couleur des
 * relations, « Écrire » en tonal des messages.
 *
 * Écrit pour le moteur (aucun équivalent au socle). La source est la même que
 * le rail des suggestions du bureau (`graph.follows.suggestions`) : l'annuaire
 * du réseau, personnes découvrables seulement, ni soi, ni relations, ni
 * personnes déjà suivies, ni blocages — et aucun score d'affinité. D'où la
 * ligne d'appoint : l'adresse publiée et le titre que la personne s'est donné,
 * jamais un compte de relations en commun que le moteur refuse de calculer.
 *
 * ⚠️ Rien à proposer, une politique du réseau qui sert ses propres
 * suggestions (`policyRefused`) ou une panne : la carte ne s'affiche pas. Une
 * carte de découverte vide en tête du fil passerait pour du contenu cassé ; le
 * rail du bureau et Découvrir gardent leur propre état vide.
 *
 * Suivre est le geste unilatéral du moteur (`graph.follows.follow`, par
 * l'adresse publiée) : une fois suivie, la personne quitte la source et la
 * suivante prend sa place. Écrire ouvre le brouillon de conversation, le même
 * que le profil — la carte iCom au bureau, la messagerie au téléphone.
 */

import { api } from "@antsia/api/engine"
import { useAuthenticatedConvexQuery } from "@antsia/api/hooks"
import { useNetwork, useRoutes } from "@antsia/api/network"
import { Link, useRouter } from "@antsia/api/routing"
import { Button, Card } from "@antsia/ui"
import { useIsReseauMobile } from "@antsia/ui/overlay"
import { useMutation } from "convex/react"
import { MessageCircle, UserPlus } from "lucide-react"
import { useState } from "react"
import { useTranslation } from "react-i18next"
import { toast } from "sonner"

import { COMPACT_SOCIAL_ACTION_STYLE } from "../social-action-style"
import { POST_SURFACE_STYLE } from "../../shell/design-styles"
import { dockStore } from "../messagerie/dock-store"
import { draftKey } from "../messagerie/messagerie-dock"
import { conversationHref } from "../messagerie/messagerie-routes"
import { personHref } from "./author-link"
import { Avatar } from "./Avatar"
import { relationErrorText } from "./people-panel"

/** Assez de candidats pour qu'un abonnement laisse aussitôt place au suivant. */
const SUGGESTIONS_WINDOW = 3

/**
 * La feuille de la carte, hors du JSX : un littéral enfant de `<style>`
 * passerait pour une chaîne d'interface (cliquet `no-hardcoded-strings`).
 * Mêmes mesures que la publication de la charte : 16 px dedans, 12 px entre
 * les blocs, boutons compacts de 44 px.
 */
const FEED_SUGGESTION_CSS = `
  .rp-feed-suggestion {
    display: flex;
    flex-direction: column;
    gap: 12px;
    padding: 16px;
    min-width: 0;
  }
  .rp-feed-suggestion-who {
    display: flex;
    align-items: center;
    gap: 10px;
    min-width: 0;
  }
  .rp-feed-suggestion-text {
    display: grid;
    gap: 1px;
    min-width: 0;
  }
  .rp-feed-suggestion-name {
    overflow: hidden;
    color: var(--foreground);
    font-size: 15px;
    font-weight: 700;
    line-height: 1.3;
    text-decoration: none;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .rp-feed-suggestion-meta {
    margin: 0;
    overflow: hidden;
    color: var(--muted-foreground);
    font-size: 13px;
    line-height: 1.35;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .rp-feed-suggestion-row {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
  }
  .rp-feed-suggestion-row > button { flex: 1 1 0; min-width: max-content; }
`

/** Actions compactes ; la variante conserve sa couleur métier. */
const ACTION_STYLE = {
  ...COMPACT_SOCIAL_ACTION_STYLE,
  padding: "0 18px",
  fontSize: 14,
  fontWeight: 600,
} as const

export function FeedSuggestionCard() {
  const { t } = useTranslation("reseau")
  const { networkId } = useNetwork()
  const routes = useRoutes()
  const router = useRouter()
  const isMobile = useIsReseauMobile()
  const suggestions = useAuthenticatedConvexQuery(api.modules.graph.follows.suggestions, { networkId, limit: SUGGESTIONS_WINDOW })
  const follow = useMutation(api.modules.graph.follows.follow)
  const [busyHandle, setBusyHandle] = useState<string | null>(null)

  const person = suggestions.data?.[0]
  if (person === undefined) return null

  const href = personHref(person.handle, routes.profile)
  const busy = busyHandle === person.handle

  const onFollow = async () => {
    if (busyHandle !== null) return
    setBusyHandle(person.handle)
    try {
      await follow({ networkId, handle: person.handle })
      toast.success(t("feedSuggestion.followed", { name: person.displayName }))
    } catch (error) {
      toast.error(relationErrorText(error, "reseau:feedSuggestion.followFailed", t))
    } finally {
      setBusyHandle(null)
    }
  }

  const onWrite = () => {
    // Le brouillon vit dans le magasin MÊME au téléphone : la frappe survit à
    // un aller-retour (même conduite que le profil).
    dockStore.openDraft(person.handle)
    if (isMobile === true) {
      const conversation = conversationHref(draftKey(person.handle), routes.messages())
      if (conversation !== null) router.push(conversation)
    }
  }

  return (
    <Card padded={false} style={POST_SURFACE_STYLE}>
      <section className="rp-feed-suggestion" aria-label={t("feedSuggestion.label", { name: person.displayName })}>
        <div className="rp-feed-suggestion-who">
          <Link href={href} aria-label={t("feedSuggestion.profileOf", { name: person.displayName })} style={{ display: "inline-flex", flexShrink: 0 }}>
            <Avatar displayName={person.displayName} avatarUrl={person.avatarUrl} size={56} />
          </Link>
          <div className="rp-feed-suggestion-text">
            <Link href={href} className="rp-feed-suggestion-name">
              {person.displayName}
            </Link>
            <p className="rp-feed-suggestion-meta">
              @{person.handle}
              {person.headline ? ` · ${person.headline}` : ""}
            </p>
          </div>
        </div>
        <div className="rp-feed-suggestion-row">
          <Button
            type="button"
            variant="social"
            disabled={busy}
            aria-busy={busy || undefined}
            aria-label={t("feedSuggestion.followLabel", { name: person.displayName })}
            style={ACTION_STYLE}
            onClick={() => void onFollow()}
          >
            <UserPlus aria-hidden="true" size={16} strokeWidth={2} />
            {t("feedSuggestion.follow")}
          </Button>
          <Button
            type="button"
            variant="message"
            aria-label={t("feedSuggestion.writeLabel", { name: person.displayName })}
            style={ACTION_STYLE}
            onClick={onWrite}
          >
            <MessageCircle aria-hidden="true" size={16} strokeWidth={2} />
            {t("feedSuggestion.write")}
          </Button>
        </div>
      </section>
      <style href="rp-feed-suggestion" precedence="default">
        {FEED_SUGGESTION_CSS}
      </style>
    </Card>
  )
}
