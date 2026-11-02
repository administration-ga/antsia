// Dupliqué de socle/packages/agent-features/src/features/reseau-albums/AlbumPage.tsx @ ad2e7fdc2 — adaptations : fonctions TYPÉES du moteur (`albums.albums.getAlbum`, `withdraw`) appelées avec le réseau courant ; DTO du moteur — photo RETENUE par la garde des fichiers (`url` nulle, montrée à son seul propriétaire avec la raison traduite, `errors:<code>`), propriétaire sans nom publié dit par le libellé neutre (« Membre du réseau ») ; retour au profil par l'adresse que sert l'application (`useRoutes().profile`) au lieu d'un chemin de l'espace agent ; phrases par l'i18n (espace de noms `albums`, clés `albumPage.*`) ; refus du moteur traduits par leur règle ou leur code (`albumEngineErrorText`), jamais le texte brut.
"use client"

/**
 * La GALERIE d'un album — page d'album du profil d'une personne (adresse
 * servie par l'application, composée sous `useRoutes().profile(handle)`).
 *
 * Grille au bureau, galerie tactile au téléphone : la même page, une seule
 * feuille de style, des `@container` plutôt que des `@media` (la coque
 * confisque de la largeur — une media query déciderait sur la mauvaise
 * grandeur).
 *
 * ⚠️ **Le refus est INDISTINCT jusqu'à l'écran.** Album inconnu, brouillon
 * d'autrui, album réservé aux connexions de quelqu'un d'autre, blocage, album
 * d'un autre réseau : le serveur rend `null` sans les distinguer, et cette
 * page ne les distingue pas davantage. Une phrase unique, qui ne dit pas si
 * l'album existe.
 *
 * ⚠️ Ce que cette page NE PROMET PAS : le retrait referme, il ne rappelle rien.
 * `albumWithdrawNotice` le dit à son propriétaire avant qu'il ne retire —
 * une interface qui laisse croire à une révocation ment (plan §2.1).
 */

import { themedActionStyle } from "../themed-action-style"
import { useAuthenticatedConvexQuery } from "@antsia/api/hooks"
import { useNetwork, useRoutes } from "@antsia/api/network"
import { useRouter } from "@antsia/api/routing"
import { Alert, Badge, Button, Card, Icon, SkeletonCard } from "@antsia/ui"
import { EspaceDialog, EspaceKitStyles } from "@antsia/ui/espace-kit"
import { useMutation } from "convex/react"
import { useEffect, useRef, useState } from "react"
import { useTranslation } from "react-i18next"
import { toast } from "sonner"
import { ProfilFrame } from "../reseau-personnel/ProfilFrame"
import { ReseauQueryError } from "../../shell/ReseauQueryError"
import { albumsApi, type AlbumId } from "./albums-api"
import {
  albumAudienceLabel,
  albumBackHref,
  albumCountLabel,
  albumEngineErrorText,
  albumStatusLabel,
  albumWithdrawNotice,
} from "./album-model"

export interface AlbumPageProps {
  handle: string
  albumId: string
  canEdit?: boolean
  onEdit?: (albumId: string) => void
}

/**
 * La feuille de la galerie, hors du JSX : un littéral enfant de `<style>`
 * passerait pour une chaîne d'interface. Jetons de la charte seulement.
 */
const ALBUM_PAGE_CSS = `
  .ap-scope { container-type: inline-size; container-name: ap-page; }
  .ap-grid {
    display: grid; gap: var(--esp-card-gap, 8px); margin: 0; padding: 0; list-style: none;
    /* Au TELEPHONE, une seule colonne : la photo occupe la largeur et on
       fait defiler — c'est la galerie tactile. La grille n'apparait
       qu'avec la place de rendre une vignette lisible.
       AUCUN accent grave dans ce bloc : il vit dans un litteral de
       gabarit, ou un backtick termine la chaine. */
    grid-template-columns: 1fr;
  }
  @container ap-page (min-width: 520px) {
    .ap-grid { grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); }
  }
  .ap-figure {
    margin: 0; border-radius: var(--esp-primitive-media-radius, 12px); overflow: hidden;
    border: 1px solid var(--esp-primitive-surface-border, var(--ink-200)); background: var(--ink-0);
  }
  .ap-figure img { width: 100%; display: block; object-fit: cover; }
  @container ap-page (min-width: 520px) { .ap-figure img { aspect-ratio: 1 / 1; } }
  .ap-withheld {
    display: flex; align-items: center; justify-content: center; gap: 8px;
    aspect-ratio: 4 / 3; padding: 12px; text-align: center;
    background: var(--ink-150); color: var(--ink-600); font-size: 12px;
  }
  .ap-caption { padding: var(--esp-card-padding, 8px 10px); font-size: 12px; color: var(--ink-600); }
  .ap-head { display: flex; flex-direction: column; gap: 8px; min-width: 0; overflow-wrap: anywhere; }
  .ap-actions { display: flex; gap: 8px; flex-wrap: wrap; }
  .ap-actions button { min-height: 44px; }
`

export function AlbumPage(props: AlbumPageProps) {
  const { networkId, personId } = useNetwork()
  return <AlbumPageBody key={`${networkId}:${personId}:${props.albumId}`} {...props} />
}

function AlbumPageBody({ handle, albumId, canEdit = true, onEdit }: AlbumPageProps) {
  const router = useRouter()
  const routes = useRoutes()
  const { networkId } = useNetwork()
  const { t } = useTranslation("albums")
  const [busy, setBusy] = useState(false)
  const [confirmWithdraw, setConfirmWithdraw] = useState(false)
  const running = useRef(false)
  // L'identifiant vient de l'adresse : le serveur le valide (`v.id`), et un
  // identifiant mal formé se dit comme une panne de lecture, sans rien révéler.
  const id = albumId as AlbumId
  const detail = useAuthenticatedConvexQuery(albumsApi.getAlbum, { networkId, albumId: id })
  const withdraw = useMutation(albumsApi.withdraw)
  const backHref = albumBackHref(routes.profile(handle))
  useEffect(() => { setConfirmWithdraw(false) }, [detail.data?.album.status])

  const onWithdraw = async () => {
    if (running.current || detail.isError || !detail.data?.album.isOwner || detail.data.album.status !== "published") return
    running.current = true
    setBusy(true)
    try {
      await withdraw({ networkId, albumId: id })
      setConfirmWithdraw(false)
      toast.success(t("albumPage.withdrawn"))
    } catch (error) {
      toast.error(albumEngineErrorText(error, "albums:albumPage.withdrawFailed", t))
    } finally {
      running.current = false
      setBusy(false)
    }
  }

  // La panne AVANT le squelette : sans rien à montrer, la carte d'erreur —
  // jamais un squelette éternel, jamais la phrase du refus (R-08).
  if (detail.isError && detail.data === undefined) {
    return (
      <ProfilFrame>
        <ReseauQueryError
          title={t("albumPage.errorTitle")}
          message={t("albumPage.errorMessage")}
          onRetry={() => void detail.refetch()}
        />
      </ProfilFrame>
    )
  }

  if (detail.data === undefined) {
    return (
      <ProfilFrame>
        <SkeletonCard />
      </ProfilFrame>
    )
  }

  if (detail.data === null) {
    return (
      <ProfilFrame>
        <Card style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <h1 style={{ margin: 0, fontFamily: "var(--esp-heading-font-family, inherit)", fontSize: "var(--esp-page-title-size, 18px)", lineHeight: "var(--esp-page-title-leading, inherit)", letterSpacing: "var(--esp-page-title-tracking, normal)", fontWeight: "var(--esp-heading-font-weight, inherit)", color: "var(--ink-900)" }}>
            {t("albumPage.inaccessibleTitle")}
          </h1>
          <p style={{ margin: 0, fontSize: "var(--esp-content-font-size, 14px)", lineHeight: "var(--esp-content-line-height, inherit)", color: "var(--ink-600)" }}>
            {t("albumPage.inaccessibleText")}
          </p>
          <div>
            <Button
              variant="secondary"
              icon="arrowLeft"
              onClick={() => router.push(backHref)}
            >
              {t("albumPage.backToProfileAction")}
            </Button>
          </div>
        </Card>
      </ProfilFrame>
    )
  }

  const { album, items, owner } = detail.data

  return (
    <ProfilFrame>
      <EspaceKitStyles />
      <style href="album-page" precedence="default">
        {ALBUM_PAGE_CSS}
      </style>

      {/* Une relecture echouee se dit SUR la galerie tenue, sans la vider. */}
      {detail.isError ? (
        <ReseauQueryError
          title={t("albumPage.errorTitle")}
          message={t("albumPage.errorMessage")}
          onRetry={() => void detail.refetch()}
        />
      ) : null}

      <div className="ap-scope">
        <Card style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <div className="ap-head">
            <div>
              <Button
                variant="ghost"
                icon="arrowLeft"
                onClick={() => router.push(backHref)}
              >
                {t("albumPage.backToProfile")}
              </Button>
            </div>
            <h1 style={{ margin: 0, fontFamily: "var(--esp-heading-font-family, inherit)", fontSize: "var(--esp-page-title-size, 20px)", lineHeight: "var(--esp-page-title-leading, inherit)", letterSpacing: "var(--esp-page-title-tracking, normal)", fontWeight: "var(--esp-heading-font-weight, inherit)", color: "var(--ink-900)" }}>
              {album.title}
            </h1>
            <p style={{ margin: 0, fontSize: 13, color: "var(--ink-600)" }}>
              {owner.displayName ?? t("albumPage.unknownOwner")}
              {owner.handle ? ` · @${owner.handle}` : ""} ·{" "}
              {albumCountLabel(album.itemCount, t)}
            </p>
            {album.description ? (
              <p style={{ margin: 0, fontSize: "var(--esp-content-font-size, 14px)", lineHeight: "var(--esp-content-line-height, inherit)", color: "var(--ink-700)" }}>
                {album.description}
              </p>
            ) : null}
            {/* L'audience et le statut ne s'affichent qu'a leur proprietaire :
                dire « reserve a mes connexions » a un lecteur autorise ne lui
                apprend rien, et le dire a un tiers serait une fuite. */}
            {album.isOwner ? (
              <div className="ap-actions">
                <Badge tone="neutral" size="sm">
                  <Icon name="users" size={12} />{" "}
                  {albumAudienceLabel(album.audience, t)}
                </Badge>
                <Badge
                  tone={album.status === "published" ? "success" : "neutral"}
                  size="sm"
                >
                  {albumStatusLabel(album.status, t)}
                </Badge>
              </div>
            ) : null}
          </div>

          {album.isOwner && canEdit && onEdit ? (
            <div className="ap-actions">
              <Button disabled={busy || detail.isError} onClick={() => onEdit(albumId)}>
                {t("albumPage.edit")}
              </Button>
            </div>
          ) : null}

          {album.isOwner && album.status === "published" ? (
            <>
              <Alert tone="info" title={t("albumPage.withdrawTitle")}>
                {albumWithdrawNotice(t)}
              </Alert>
              <div className="ap-actions">
                <Button
                  variant="secondary"
                  icon="eyeOff"
                  disabled={busy || detail.isError}
                  onClick={() => setConfirmWithdraw(true)}
                >
                  {busy ? t("albumPage.withdrawing") : t("albumPage.withdraw")}
                </Button>
              </div>
              {confirmWithdraw ? (
                <EspaceDialog
                  title={t("albumPage.withdrawTitle")}
                  closeLabel={t("albumPage.close")}
                  onClose={() => { if (!running.current) setConfirmWithdraw(false) }}
                  footer={<>
                    <Button style={themedActionStyle("cancel", "secondary")} variant="outline" disabled={busy} onClick={() => setConfirmWithdraw(false)}>{t("albumComposer.cancel")}</Button>
                    <Button style={themedActionStyle("danger", "primary")} variant="danger" disabled={busy || detail.isError} onClick={() => void onWithdraw()}>{busy ? t("albumPage.withdrawing") : t("albumPage.confirmWithdraw")}</Button>
                  </>}
                >
                  <p>{albumWithdrawNotice(t)}</p>
                </EspaceDialog>
              ) : null}
            </>
          ) : null}

          {items.length === 0 ? (
            <p style={{ margin: 0, fontSize: "var(--esp-content-font-size, 14px)", lineHeight: "var(--esp-content-line-height, inherit)", color: "var(--ink-600)" }}>
              {t("albumPage.empty")}
            </p>
          ) : (
            <ul className="ap-grid">
              {items.map((item, index) => (
                <li key={item.itemId}>
                  <figure className="ap-figure">
                    {item.withheld === null && item.url !== null ? (
                      <img
                        src={item.url}
                        /* Le texte alternatif PUBLIÉ, ou rien : une chaîne
                           inventée décrirait une image que personne n'a décrite.
                           Une image sans description se déclare vide, jamais
                           « photo 3 » — ce serait du bruit pour un lecteur
                           d'écran. */
                        alt={item.altText ?? ""}
                        loading={index < 4 ? "eager" : "lazy"}
                      />
                    ) : (
                      /* Photo RETENUE par la garde des fichiers (analyse en
                         cours, ou bloquée) : seul son propriétaire la reçoit
                         ainsi — on dit pourquoi, on ne montre rien. */
                      <div className="ap-withheld" data-withheld={item.withheld ?? "none"}>
                        <Icon name="image" size={16} />
                        <span>
                          {item.withheld !== null ? t(`errors:${item.withheld}`) : t("albumPage.photoUnavailable")}
                        </span>
                      </div>
                    )}
                    {item.caption ? (
                      <figcaption className="ap-caption">
                        {item.caption}
                      </figcaption>
                    ) : null}
                  </figure>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </ProfilFrame>
  )
}
