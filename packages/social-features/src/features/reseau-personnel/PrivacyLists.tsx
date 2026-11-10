// Dupliqué de socle/packages/agent-features/src/features/reseau-personnel/PrivacyLists.tsx @ ad2e7fdc2 — adaptations : mes listes dans le réseau courant (`marks.marks.paginateBookmarks`, `paginateHiddenPosts`, `unhidePost`, `unmuteAuthor` du moteur, `networkId` par `useNetwork()`) ; les sourdines PAGINÉES (`paginateMyMutes` au lieu de `myMutes`, « Voir plus ») — une panne de lecture lève et la frontière d'erreur la dit, la branche d'erreur de la query non paginée disparaît ; personnes désignées par `personId` (`targetPersonId`), nom neutre quand le profil n'est pas publié, publication d'une page nommée par sa page ; refus du moteur lus par code (`markActionErrorText`) ; toutes les chaînes par l'i18n (espace `reseau`, clés `privacyLists.*`).
"use client"

import { api } from "@antsia/api/engine"
import { useAuthenticatedPaginatedQuery } from "@antsia/api/hooks"
import { useNetwork } from "@antsia/api/network"
import { Button, Card } from "@antsia/ui"
import { useMutation } from "convex/react"
import { type ReactNode, useRef, useState } from "react"
import { useTranslation } from "react-i18next"
import { toast } from "sonner"

import { ReseauPaginatedErrorBoundary } from "../../shell/ReseauPaginatedErrorBoundary"
import { bookmarkIdentity, markActionErrorText, type BookmarkedPostSummary } from "./bookmarks-panel"

const PRIVACY_PAGE_SIZE = 20

/** Réversibilité des gestes silencieux : aucun état ne reste sans sortie. */
export function PrivacyLists({ includeBookmarks = true }: { includeBookmarks?: boolean }) {
  const { t } = useTranslation("reseau")
  return (
    <ReseauPaginatedErrorBoundary resetKey="privacy-lists" title={t("privacyLists.errorTitle")} message={t("privacyLists.errorMessage")}>
      <PrivacyListsContent includeBookmarks={includeBookmarks} />
    </ReseauPaginatedErrorBoundary>
  )
}

function PrivacyListsContent({ includeBookmarks }: { includeBookmarks: boolean }) {
  const { t } = useTranslation("reseau")
  const { networkId } = useNetwork()
  const bookmarks = useAuthenticatedPaginatedQuery(api.modules.marks.marks.paginateBookmarks, includeBookmarks ? { networkId } : "skip", { initialNumItems: PRIVACY_PAGE_SIZE })
  const mutes = useAuthenticatedPaginatedQuery(api.modules.marks.marks.paginateMyMutes, { networkId }, { initialNumItems: PRIVACY_PAGE_SIZE })
  const hidden = useAuthenticatedPaginatedQuery(api.modules.marks.marks.paginateHiddenPosts, { networkId }, { initialNumItems: PRIVACY_PAGE_SIZE })
  const unmute = useMutation(api.modules.marks.marks.unmuteAuthor)
  const unhide = useMutation(api.modules.marks.marks.unhidePost)
  const undoInFlight = useRef(false)
  const [busy, setBusy] = useState<string | null>(null)

  const undo = async (key: string, operation: () => Promise<unknown>, successKey: string, failureKey: string) => {
    if (undoInFlight.current) return
    undoInFlight.current = true
    setBusy(key)
    try {
      await operation()
      toast.success(t(successKey))
    } catch (error: unknown) {
      toast.error(markActionErrorText(error, failureKey, t))
    } finally {
      undoInFlight.current = false
      setBusy(null)
    }
  }

  if (
    (includeBookmarks && bookmarks.isLoading && bookmarks.results.length === 0) ||
    (mutes.isLoading && mutes.results.length === 0) ||
    (hidden.isLoading && hidden.results.length === 0)
  ) {
    return (
      <Card>
        <p role="status" style={{ margin: 0, fontSize: "var(--esp-content-font-size, 14px)", lineHeight: "var(--esp-content-line-height, inherit)", color: "var(--ink-600)" }}>{t("privacyLists.loading")}</p>
      </Card>
    )
  }

  /** Une ligne de publication : qui parle (la page, l'auteur, ou un nom neutre), puis le texte. */
  const postLine = (item: BookmarkedPostSummary) => t("privacyLists.itemLine", { author: bookmarkIdentity(item, t).name, body: item.body || t("privacyLists.mediaOnly") })

  return (
    <Card>
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <h2 style={{ margin: 0, fontFamily: "var(--esp-heading-font-family, inherit)", fontSize: "var(--esp-section-title-size, 16px)", fontWeight: "var(--esp-heading-font-weight, inherit)", lineHeight: "var(--esp-section-title-leading, inherit)", letterSpacing: "var(--esp-section-title-tracking, normal)" }}>{t("privacyLists.title")}</h2>
        {includeBookmarks ? <List
          title={t("privacyLists.bookmarks.title")}
          emptyText={t("privacyLists.bookmarks.empty")}
          items={bookmarks.results}
          keyFor={(item) => String(item.postId)}
          render={postLine}
        /> : null}
        {includeBookmarks && bookmarks.status === "CanLoadMore" ? (
          <Button size="sm" variant="secondary" onClick={() => bookmarks.loadMore(PRIVACY_PAGE_SIZE)}>
            {t("privacyLists.bookmarks.more")}
          </Button>
        ) : null}
        <List
          title={t("privacyLists.mutes.title")}
          emptyText={t("privacyLists.mutes.empty")}
          items={mutes.results}
          keyFor={(item) => String(item.personId)}
          render={(item) => item.person.displayName ?? t("privacyLists.unnamedPerson")}
          action={(item) => (
            <Button
              size="sm"
              variant="ghost"
              disabled={busy !== null}
              aria-busy={busy === item.personId || undefined}
              style={{ minHeight: 44, flexShrink: 0 }}
              onClick={() =>
                void undo(item.personId, () => unmute({ networkId, targetPersonId: item.personId }), "privacyLists.toast.unmuted", "reseau:privacyLists.toast.unmuteFailed")
              }
            >
              {t("privacyLists.mutes.unmute")}
            </Button>
          )}
        />
        {mutes.status === "CanLoadMore" ? (
          <Button size="sm" variant="secondary" onClick={() => mutes.loadMore(PRIVACY_PAGE_SIZE)}>
            {t("privacyLists.mutes.more")}
          </Button>
        ) : null}
        <List
          title={t("privacyLists.hidden.title")}
          emptyText={t("privacyLists.hidden.empty")}
          items={hidden.results}
          keyFor={(item) => String(item.postId)}
          render={postLine}
          action={(item) => (
            <Button
              size="sm"
              variant="ghost"
              disabled={busy !== null}
              aria-busy={busy === item.postId || undefined}
              style={{ minHeight: 44, flexShrink: 0 }}
              onClick={() => void undo(item.postId, () => unhide({ networkId, postId: item.postId }), "privacyLists.toast.restored", "reseau:privacyLists.toast.restoreFailed")}
            >
              {t("privacyLists.hidden.restore")}
            </Button>
          )}
        />
        {hidden.status === "CanLoadMore" ? (
          <Button size="sm" variant="secondary" onClick={() => hidden.loadMore(PRIVACY_PAGE_SIZE)}>
            {t("privacyLists.hidden.more")}
          </Button>
        ) : null}
        {(includeBookmarks && bookmarks.status === "LoadingMore") || mutes.status === "LoadingMore" || hidden.status === "LoadingMore" ? (
          <p role="status" style={{ margin: 0, fontSize: "var(--esp-content-font-size, 14px)", lineHeight: "var(--esp-content-line-height, inherit)", color: "var(--ink-600)" }}>{t("privacyLists.loadingMore")}</p>
        ) : null}
      </div>
    </Card>
  )
}

function List<T>({
  title,
  emptyText,
  items,
  keyFor,
  render,
  action,
}: {
  title: string
  emptyText: string
  items: readonly T[]
  keyFor: (item: T) => string
  render: (item: T) => string
  action?: (item: T) => ReactNode
}) {
  return (
    <section>
      <h3 style={{ margin: "0 0 8px", fontSize: "var(--esp-subsection-title-size, 15px)", fontWeight: "var(--esp-heading-font-weight, inherit)", lineHeight: "var(--esp-subsection-title-leading, inherit)" }}>{title}</h3>
      {items.length === 0 ? (
        <p style={{ margin: 0, fontSize: "var(--esp-content-font-size, 14px)", lineHeight: "var(--esp-content-line-height, inherit)", color: "var(--ink-600)" }}>{emptyText}</p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {items.map((item) => (
            <div
              key={keyFor(item)}
              style={{
                display: "flex",
                flexWrap: "wrap",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 8,
                paddingBlock: 8,
                borderBottom: "1px solid var(--border)",
                fontSize: "var(--esp-content-font-size, 14px)", lineHeight: "var(--esp-content-line-height, inherit)",
              }}
            >
              <span style={{ flex: "1 1 200px", minWidth: 0, overflowWrap: "anywhere" }}>{render(item)}</span>
              {action?.(item)}
            </div>
          ))}
        </div>
      )}
    </section>
  )
}
