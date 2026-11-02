// Dupliqué de socle/packages/agent-features/src/features/reseau-albums/AlbumsSection.tsx @ ad2e7fdc2 — adaptations : liste servie par la fonction TYPÉE du moteur `albums.albums.paginatePersonAlbums` (ex `listForPerson`), avec le réseau courant ; couverture du DTO du moteur (`cover: { url, withheld, altText }` — une couverture retenue par la garde des fichiers, que seul le propriétaire reçoit, se rend comme une couverture absente) ; ouverture d'un album par l'adresse composée sous le profil que sert l'application (`useRoutes().profile`) ; phrases par l'i18n (espace de noms `albums`, clés `albumsSection.*`) ; mention du dossier iProfil retirée (administratif, absent du moteur) ; props inchangées (montée par le profil).
"use client"

/**
 * Les ALBUMS d'une personne, sur son profil public.
 *
 * Les albums sont une vitrine sociale : ce composant ne lit que la liste que
 * le serveur sert, jamais un autre dossier de la personne.
 *
 * Chez soi, l'onglet Albums reprend tous les états du serveur ; les Photos
 * et le profil d'un tiers gardent la vitrine publiée, dont l'audience est
 * rejugée à chaque lecture. Chaque page montée reste abonnée.
 */

import { useAuthenticatedConvexQuery } from "@antsia/api/hooks"
import { useNetwork, useRoutes } from "@antsia/api/network"
import { Link } from "@antsia/api/routing"
import { Badge, Button, Card, Icon, SkeletonCard } from "@antsia/ui"
import { useCallback, useEffect, useRef, useState } from "react"
import { useTranslation } from "react-i18next"
import { ReseauQueryError } from "../../shell/ReseauQueryError"
import { albumsApi } from "./albums-api"
import {
  albumCursorKey,
  appendAlbumPage,
  initialAlbumsPages,
  mergedAlbumRows,
  nextAlbumsCursor,
  recordAlbumPage,
  type AlbumPageSnapshot,
  type AlbumsCursor,
} from "./albums-pagination"
import {
  albumCountLabel,
  albumHref,
  albumStatusLabel,
  albumsEmptyText,
} from "./album-model"

const PAGE_SIZE = 12

/**
 * La feuille de la section, hors du JSX : un littéral enfant de `<style>`
 * passerait pour une chaîne d'interface. Jetons de la charte seulement.
 */
const ALBUMS_SECTION_CSS = `
  .as-grid {
    display: grid; gap: 12px; margin: 0; padding: 0; list-style: none;
    grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));
  }
  .as-grid--long > li { content-visibility: auto; contain-intrinsic-size: auto 240px; }
  .as-card {
    border: 1px solid var(--esp-primitive-surface-border, var(--ink-200)); border-radius: var(--esp-primitive-card-radius, 12px); overflow: hidden;
    background: var(--ink-0); display: flex; flex-direction: column;
    text-align: left; width: 100%; padding: 0; cursor: pointer; text-decoration: none;
    min-height: 44px; min-width: 0;
  }
  .as-cover { width: calc(100% - 2 * var(--esp-card-padding, 0px)); margin: var(--esp-card-padding, 0px) var(--esp-card-padding, 0px) 0; border-radius: var(--esp-primitive-media-radius, 0px); aspect-ratio: 4 / 3; object-fit: cover; display: block; background: var(--ink-150); }
  .as-cover--vide {
    width: calc(100% - 2 * var(--esp-card-padding, 0px)); margin: var(--esp-card-padding, 0px) var(--esp-card-padding, 0px) 0; border-radius: var(--esp-primitive-media-radius, 0px); aspect-ratio: 4 / 3; display: flex;
    align-items: center; justify-content: center; background: var(--ink-150);
    color: var(--ink-500);
  }
  .as-body { padding: var(--esp-card-padding, 10px); display: flex; flex-direction: column; gap: 4px; min-width: 0; overflow-wrap: anywhere; }
`

export interface AlbumsSectionProps {
  handle: string
  /** Est-ce MON profil ? Décide de l'état vide et de l'entrée de création. */
  isSelf: boolean
  /**
   * Ne montrer que les vignettes, sans titre de section — l'onglet « Photos »
   * du profil, qui rend la même donnée sous une autre forme (une mosaïque de
   * couvertures plutôt qu'une liste d'albums).
   */
  variant?: "albums" | "photos"
  /** Ouvre le composeur — porté par le parent, qui tient la surface. */
  onCreate?: () => void
}

export function AlbumsSection(props: AlbumsSectionProps) {
  const { networkId, personId } = useNetwork()
  const variant = props.variant ?? "albums"
  const identity = JSON.stringify([networkId, personId, props.handle, variant, props.isSelf])
  return <AlbumsPages key={identity} {...props} variant={variant} />
}

type RetryAlbumPage = () => Promise<unknown>

/** Un abonnement indépendant par curseur : aucune boucle de hooks variables. */
function AlbumsQueryPage(props: {
  handle: string
  mine: boolean
  cursor: AlbumsCursor
  report: (cursor: AlbumsCursor, page: AlbumPageSnapshot) => void
  registerRetry: (cursor: AlbumsCursor, retry: RetryAlbumPage) => () => void
}) {
  const { networkId } = useNetwork()
  const { cursor, mine, handle, report, registerRetry } = props
  const query = useAuthenticatedConvexQuery(
    mine ? albumsApi.paginateMyAlbums : albumsApi.paginatePersonAlbums,
    { networkId, ...(mine ? {} : { handle }), paginationOpts: { numItems: PAGE_SIZE, cursor } },
  )
  useEffect(() => {
    report(cursor, { data: query.data ?? undefined, isPending: query.isPending, isError: query.isError })
  }, [cursor, query.data, query.isPending, query.isError, report])
  useEffect(() => registerRetry(cursor, query.refetch), [cursor, query.refetch, registerRetry])
  return null
}

function AlbumsPages({ handle, isSelf, variant, onCreate }: AlbumsSectionProps & { variant: "albums" | "photos" }) {
  const routes = useRoutes()
  const { t } = useTranslation("albums")
  const [state, setState] = useState(initialAlbumsPages)
  const retries = useRef(new Map<string, RetryAlbumPage>())
  const report = useCallback((cursor: AlbumsCursor, page: AlbumPageSnapshot) => {
    setState((previous) => recordAlbumPage(previous, cursor, page))
  }, [])
  const registerRetry = useCallback((cursor: AlbumsCursor, retry: RetryAlbumPage) => {
    const key = albumCursorKey(cursor)
    retries.current.set(key, retry)
    return () => {
      if (retries.current.get(key) === retry) retries.current.delete(key)
    }
  }, [])
  const retry = () => {
    for (const refetch of retries.current.values()) {
      // Le hook rend la panne : le rejet de la tentative ne doit pas devenir
      // une exception non traitée en plus du bandeau affiché.
      void (async () => { try { await refetch() } catch { /* L'état du hook porte le refus. */ } })()
    }
  }
  const page = mergedAlbumRows(state)
  const current = state.pages[albumCursorKey(state.cursors[state.cursors.length - 1] ?? null)]
  const hasError = state.cursors.some((cursor) => state.pages[albumCursorKey(cursor)]?.isError)
  const initialLoading = !state.pages[albumCursorKey(null)]?.data && !hasError
  const loadingMore = state.cursors.length > 1 && (!current?.data || current.isPending) && !current?.isError
  const hasMore = nextAlbumsCursor(state) !== null
  const profileHref = routes.profile(handle)

  return (
    <>
      {state.cursors.map((cursor) => (
        <AlbumsQueryPage key={albumCursorKey(cursor)} handle={handle} mine={isSelf && variant === "albums"} cursor={cursor} report={report} registerRetry={registerRetry} />
      ))}
      {initialLoading ? <SkeletonCard /> : (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }} aria-busy={loadingMore}>
          <style href="albums-section" precedence="default">
            {ALBUMS_SECTION_CSS}
          </style>

          {/* Une panne APRÈS données conserve la liste, sous un bandeau. */}
          {hasError ? (
            <ReseauQueryError
              title={t("albumsSection.errorTitle")}
              message={t("albumsSection.errorMessage")}
              onRetry={retry}
            />
          ) : null}

          {isSelf && onCreate ? (
            <div>
              <Button icon="plus" size="sm" onClick={onCreate}>
                {t("albumsSection.create")}
              </Button>
            </div>
          ) : null}

          {page.length > 0 ? <ul className={page.length > 50 ? "as-grid as-grid--long" : "as-grid"}>
            {page.map((album) => (
              <li key={album.albumId}>
                <Link
                  href={albumHref(profileHref, album.albumId)}
                  className="as-card"
                >
                  {/* Une couverture RETENUE par la garde des fichiers (seul le
                      propriétaire la reçoit) se rend comme une couverture
                      absente : jamais une image cassée. */}
                  {album.cover?.withheld === null && album.cover.url ? (
                    <img
                      className="as-cover"
                      src={album.cover.url}
                      loading="lazy"
                      alt={album.cover.altText ?? ""}
                    />
                  ) : (
                    <span className="as-cover--vide" aria-hidden="true">
                      <Icon name="image" size={24} />
                    </span>
                  )}
                  <span className="as-body">
                    <span style={{ fontSize: "var(--esp-content-font-size, 14px)", lineHeight: "var(--esp-content-line-height, inherit)", color: "var(--ink-900)", fontWeight: 600 }}>
                      {album.title}
                    </span>
                    <span style={{ fontSize: 12, color: "var(--ink-600)" }}>
                      {albumCountLabel(album.itemCount, t)}
                    </span>
                    {/* Le statut n'a de sens que pour le propriétaire : les autres
                        ne voient que du publié, l'afficher serait du bruit. */}
                    {album.isOwner && album.status !== "published" ? (
                      <span>
                        <Badge tone="neutral" size="sm">
                          {albumStatusLabel(album.status, t)}
                        </Badge>
                      </span>
                    ) : null}
                  </span>
                </Link>
              </li>
            ))}
          </ul> : !hasError && !hasMore && !loadingMore ? (
            <Card style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <p style={{ margin: 0, fontSize: 14, color: "var(--ink-600)" }}>{albumsEmptyText(isSelf, t)}</p>
            </Card>
          ) : null}

          {hasMore || loadingMore ? (
            <div>
              <Button variant="secondary" disabled={loadingMore || hasError} onClick={() => setState(appendAlbumPage)}>
                {t(loadingMore ? "albumsSection.loadingMore" : "albumsSection.loadMore")}
              </Button>
            </div>
          ) : null}

          {/* L'onglet « Photos » ne montre que les couvertures : la galerie
              complète vit dans l'album, jamais aplatie ici — un mur de photos sans
              leur collection perd le titre qui les explique. */}
          {variant === "photos" && page.length > 0 ? (
            <p style={{ margin: 0, fontSize: 12, color: "var(--ink-600)" }}>
              {t("albumsSection.photosHint")}
            </p>
          ) : null}
        </div>
      )}
    </>
  )
}
