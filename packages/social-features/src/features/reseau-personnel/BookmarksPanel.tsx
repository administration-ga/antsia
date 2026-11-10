// Dupliqué de socle/packages/agent-features/src/features/reseau-personnel/BookmarksPanel.tsx @ ad2e7fdc2 — adaptations : mes signets dans le réseau courant (`marks.marks.paginateBookmarks` et `toggleMark` du moteur, `networkId` par `useNetwork()`) ; en-tête d'un aperçu décidé par `bookmarkIdentity` (la PAGE quand la publication parle en son nom, sinon l'auteur, sinon un nom neutre) ; dates relatives dans la langue courante (`formatRelativeDate(…, t)`) ; refus du moteur lus par code (`markActionErrorText`) ; état vide par `reseauEmptyState("signets", home, t)` (lien vers le fil composé sur la base injectée) ; toutes les chaînes par l'i18n (espace `reseau`, clés `bookmarksPanel.*`) ; état vide du kit d'espace (`@antsia/ui/espace-kit`).
"use client"

import { themedActionStyle } from "../themed-action-style"
import { useViewerTimeZone } from "@antsia/api/viewer-preferences"

/**
 * Volet « Enregistrements » — les publications mises de côté.
 *
 * ⚠️ Ce volet NE REND PAS une `PostCard`, et c'est un choix mesuré :
 * `marks.paginateBookmarks` rend une projection RÉDUITE (`postId`, `body`,
 * `publishedAt`, `markedAt`, auteur, page), pas le `FeedItem` complet que
 * `PostCard` attend — ni médias, ni réactions, ni raison d'apparition, ni état
 * de partage. Lui fabriquer les champs manquants afficherait « 0 réaction » sur
 * une publication qui en a douze : l'écran affirmerait le faux. On rend donc un
 * APERÇU qui assume d'en être un, et le clic ouvre la publication entière dans
 * le fil, où elle est relue avec sa garde.
 *
 * Ce qui se décide (textes, décomptes, identité de l'en-tête) vit dans
 * `bookmarks-panel.ts`, testé.
 */

import { api, type Id } from "@antsia/api/engine"
import { useAuthenticatedPaginatedQuery } from "@antsia/api/hooks"
import { useNetwork, useRoutes } from "@antsia/api/network"
import { Link } from "@antsia/api/routing"
import { Button, Card, SkeletonCard } from "@antsia/ui"
import { EspaceEmptyState } from "@antsia/ui/espace-kit"
import { useMutation } from "convex/react"
import { useState } from "react"
import { useTranslation } from "react-i18next"
import { toast } from "sonner"

import { RESEAU_SURFACE_STYLE } from "../../shell/design-styles"
import { ReseauPaginatedErrorBoundary } from "../../shell/ReseauPaginatedErrorBoundary"
import { Avatar } from "./Avatar"
import { bookmarkIdentity, bookmarksCountLabel, markActionErrorText } from "./bookmarks-panel"
import { reseauEmptyState } from "./empty-states"
import { formatRelativeDate } from "./shared"

/** Longueur de l'aperçu — au-delà, on lit la publication, pas un extrait. */
const EXCERPT_MAX = 220
const BOOKMARKS_PAGE_SIZE = 10

export function BookmarksPanel(props: { now: number; onOpenPost: (postId: string) => void }) {
  const { t } = useTranslation("reseau")
  return (
    <ReseauPaginatedErrorBoundary resetKey="bookmarks" title={t("bookmarksPanel.errorTitle")} message={t("bookmarksPanel.errorMessage")}>
      <BookmarksPanelContent {...props} />
    </ReseauPaginatedErrorBoundary>
  )
}

function BookmarksPanelContent({
  now,
  onOpenPost,
}: {
  now: number
  /** Ouvre la publication ENTIÈRE dans le fil — l'aperçu n'en est pas une. */
  onOpenPost: (postId: string) => void
}) {
  const { t } = useTranslation("reseau")
  const timeZone = useViewerTimeZone()
  const { networkId } = useNetwork()
  const home = useRoutes().home()
  const bookmarks = useAuthenticatedPaginatedQuery(api.modules.marks.marks.paginateBookmarks, { networkId }, { initialNumItems: BOOKMARKS_PAGE_SIZE })
  const toggleMark = useMutation(api.modules.marks.marks.toggleMark)
  const [busy, setBusy] = useState<string | null>(null)

  if (bookmarks.isLoading && bookmarks.results.length === 0) {
    return (
      <div style={{ display: "grid", gap: 12 }}>
        <SkeletonCard />
        <SkeletonCard />
      </div>
    )
  }

  const items = bookmarks.results

  const handleRemove = async (postId: Id<"posts">) => {
    setBusy(postId)
    try {
      await toggleMark({ networkId, postId, kind: "bookmark" })
      toast.success(t("bookmarksPanel.toast.removed"))
    } catch (error) {
      toast.error(markActionErrorText(error, "reseau:bookmarksPanel.toast.removeFailed", t))
    } finally {
      setBusy(null)
    }
  }

  if (items.length === 0) {
    /* X-09 — la phrase CONSTATE, l'action MÈNE. Le geste « Enregistrer » se
       fait sur une publication du fil, pas ici : décrire le chemin de souris
       dans une carte vide occupait trois lignes pour ne rien rendre
       cliquable. */
    const empty = reseauEmptyState("signets", home, t)
    return (
      <EspaceEmptyState
        compact
        text={empty.text}
        action={empty.action?.kind === "lien" ? <Link href={empty.action.href}>{empty.action.label}</Link> : null}
      />
    )
  }

  return (
    <div data-collection="bookmarks" style={{ display: "grid", gap: 12 }}>
      <p
        style={{
          margin: 0,
          fontSize: 10.5,
          fontWeight: 700,
          letterSpacing: "0.08em",
          textTransform: "uppercase",
          color: "var(--muted-foreground)",
        }}
      >
        {bookmarksCountLabel(items.length, t)}
      </p>

      {items.map((item) => {
        const excerpt = item.body.length > EXCERPT_MAX ? `${item.body.slice(0, EXCERPT_MAX).trimEnd()}…` : item.body
        const identity = bookmarkIdentity(item, t)
        return (
          <Card key={item.postId} padded style={RESEAU_SURFACE_STYLE}>
            <article style={{ display: "grid", gap: 8 }}>
              <header style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <Avatar displayName={identity.name} avatarUrl={identity.imageUrl} hasIdentity={identity.hasIdentity} shape={identity.shape} size={26} />
                <span style={{ display: "grid", gap: 1, minWidth: 0 }}>
                  <span style={{ fontSize: 13, fontWeight: 600 }}>{identity.name}</span>
                  <span style={{ fontSize: 11.5, color: "var(--muted-foreground)" }}>
                    {t("bookmarksPanel.dates", {
                      published: formatRelativeDate(item.publishedAt, now, t, timeZone),
                      marked: formatRelativeDate(item.markedAt, now, t, timeZone),
                    })}
                  </span>
                </span>
              </header>

              <p
                style={{
                  margin: 0,
                  fontSize: 13.5,
                  lineHeight: 1.55,
                  whiteSpace: "pre-wrap",
                }}
              >
                {excerpt}
              </p>

              <div style={{ display: "flex", gap: 8 }}>
                <Button size="sm" variant="secondary" onClick={() => onOpenPost(item.postId)}>
                  {t("bookmarksPanel.open")}
                </Button>
                <Button style={themedActionStyle("danger", "ghost")} size="sm" variant="danger" disabled={busy === item.postId} onClick={() => void handleRemove(item.postId)}>
                  {t("bookmarksPanel.remove")}
                </Button>
              </div>
            </article>
          </Card>
        )
      })}

      {bookmarks.status === "CanLoadMore" ? (
        <Button variant="secondary" onClick={() => bookmarks.loadMore(BOOKMARKS_PAGE_SIZE)}>
          {t("bookmarksPanel.more")}
        </Button>
      ) : null}
      {bookmarks.status === "LoadingMore" ? <p style={{ margin: 0, fontSize: 13, color: "var(--ink-600)" }}>{t("bookmarksPanel.loadingMore")}</p> : null}
    </div>
  )
}
