// Réécrit d'après socle/packages/agent-features/src/features/reseau-personnel/ProfilPagePage.tsx @ ad2e7fdc2 — ce qui change : la fiche d'une page à IDENTITÉ PROPRE du moteur (nom, sigle, logo, bannière, description, nature, pays) lue par `pages.pages.getPage` dans le réseau courant, au lieu d'une page d'administration dérivée de son organisation ; badge CALCULÉ par le serveur (Officiel, Vérifié, Communauté) ; suivi par `follow`/`unfollow` du moteur, refus lu dans son CODE ; publier au nom de la page réservé au RÔLE VIVANT du lecteur (`viewer.role`) — le composeur partagé reçoit `asPage` ; mur par `pagePosts` (fenêtres chaînées, curseur composite du moteur, éléments rendus par `PostCard`) ; adresses par la table des routes injectée (retour au volet par `reseauAgentHref("pages", routes.home())`, mots-clés par `reseauAgentTagHref`, mentions vers le PROFIL d'une personne, jamais vers une page) ; panne de la fiche et du mur dite avec Réessayer ; textes traduits (clés `profilPagePage.…`, décisions dans `profil-page.ts`) ; ajouts : invitation à signer (accepter, décliner), revendication ou demande de vérification pièces à l'appui (`pages.claims.*`), gestion pour un administrateur vivant — identité (`pages.identity.updatePageIdentity`), logo et bannière par la garde des fichiers (`generatePageImageUploadUrl`, `setPageImage`), signataires (`pages.signatories.*`) ; props inchangés (`handle`). ; PA6 : dates et jours civils dans le fuseau personnel du lecteur (repli appareil). ; couleurs par fonction (ADR-0027) : « Suivre » et l'acceptation d'une invitation en variante `social`, Suivre neutre une fois la page suivie. ; prop facultative `commerce` (décision du propriétaire du 22/10/2026) : la présentation marchande que l'application pose sur la page qui vend — en-tête de boutique à la place de l'identité, offres en tête, rappels toutes les trois publications —, gestes de la page inchangés.
"use client"

/**
 * La FICHE d'une page du réseau — montée par l'application sur
 * `useRoutes().page(handle)`.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * LA PAGE A SON IDENTITÉ, ELLE PARLE PAR SES SIGNATAIRES VIVANTS
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Une page du moteur (institution, association, entreprise, média, collectif)
 * porte une identité PROPRE, tenue par ses administrateurs ; sa confiance
 * (Officiel, Vérifié, Communauté) est CALCULÉE par le serveur, jamais
 * déclarée. Ce que cet écran fait : LIRE la fiche, s'y ABONNER, et — pour qui
 * y tient un rôle VIVANT — PUBLIER en son nom par le composeur partagé
 * (`PostComposer`, prop `asPage`) ; un administrateur la GÈRE (identité,
 * images, signataires) ; un lecteur peut la REVENDIQUER, pièces à l'appui.
 *
 * ── Le refus est indistinct ───────────────────────────────────────────────
 * `getPage` rend `null` pour une page inconnue, retirée ou d'un autre réseau,
 * SANS distinguer les cas (anti-énumération). L'écran ne les distingue pas
 * davantage : une phrase unique, décidée dans `profil-page.ts`, où c'est
 * vérifiable.
 *
 * ── Le mur se PAGINE par un geste, jamais par le défilement ──────────────
 * `pagePosts` rend `{ items, nextCursor }`. Une CHAÎNE de fenêtres montées,
 * chacune avec son curseur et son abonnement (`reseau-feed-pages.ts`, réutilisé
 * tel quel) — jamais de `limit` gonflé, jamais de défilement infini.
 *
 * ── Le cadre visuel est PARTAGÉ avec le profil d'une personne ────────────
 * `ProfilFrame` porte la bannière, la carte d'identité à cheval et la colonne
 * qui défile ; la variante carrée de la pastille est celle d'une page.
 */

import { useViewerTimeZone } from "@antsia/api/viewer-preferences"
import { api, type Id } from "@antsia/api/engine"
import { useAuthenticatedConvexQuery } from "@antsia/api/hooks"
import { useNetwork, useRoutes } from "@antsia/api/network"
import { useRouter } from "@antsia/api/routing"
import {
  PAGE_CLAIM_EVIDENCE_MAX,
  PAGE_CLAIM_NOTE_MAX_LENGTH,
  PAGE_DESCRIPTION_MAX_LENGTH,
  PAGE_NAME_MAX_LENGTH,
  PAGE_ROLES,
  PAGE_SHORT_NAME_MAX_LENGTH,
  type PageRole,
} from "@antsia/social-domain/pages"
import { Alert, Badge, Button, Card, Field, Select, SkeletonCard, TextArea, TextInput } from "@antsia/ui"
import { useMutation } from "convex/react"
import type { FunctionReturnType } from "convex/server"
import { Fragment, useCallback, useEffect, useId, useState, type ChangeEvent, type CSSProperties, type FormEvent, type ReactNode } from "react"
import { useTranslation } from "react-i18next"
import { toast } from "sonner"

import { RESEAU_ACTION_SHAPE_STYLE, RESEAU_CARD_STYLE, RESEAU_SECONDARY_ACTION_STYLE } from "../../shell/design-styles"
import { reseauAgentHref, reseauAgentTagHref } from "../../shell/reseau-agent-nav"
import { ReseauQueryError } from "../../shell/ReseauQueryError"
import { personHref } from "./author-link"
import { Avatar } from "./Avatar"
import { countryName, countryOptions, followActionErrorMessage, ownerKindLabel, pageActionErrorMessage, pageBadgeView, pageInvitationText, pageRoleLabel } from "./pages-panel"
import { PostCard } from "./PostCard"
import { PostComposer } from "./PostComposer"
import { CreateDirectDialog } from "../direct/CreateDirectDialog"
import { ProfilFrame } from "./ProfilFrame"
import {
  canManagePageAs,
  canPublishAsPage,
  checkPageIdentity,
  claimEvidenceRefusal,
  claimIsPending,
  claimNoteRefusal,
  claimStatusText,
  claimSubmittedText,
  identityDraftOf,
  isEmptyIdentityPatch,
  latestClaimFor,
  PAGE_WALL_PAGE_SIZE,
  pageClaimAction,
  pageClaimIntro,
  pageClaimTitle,
  pageFileRefusal,
  pageFollowButtonLabel,
  pageFollowerCountLabel,
  pagePostCountLabel,
  pageRefusalTexts,
  pageRoleNote,
  pageUploadAccept,
  pageWallEmptyText,
  signatoryDisplayName,
  signatoryHandleOf,
  type PageClaimAction,
  type PageIdentityDraft,
  type PageIdentityField,
} from "./profil-page"
import {
  appendPage,
  feedCursorKey,
  initialFeedPages,
  loadMoreAnnouncement,
  rebasePagesAfter,
  recordTail,
  shouldShowLoadMore,
  type FeedCursor,
} from "./reseau-feed-pages"

/** La fiche d'une page telle que le moteur la rend à CE lecteur. */
type PageDto = NonNullable<FunctionReturnType<typeof api.modules.pages.pages.getPage>>
/** Le curseur du mur garde le type exact de l'identifiant de publication. */
type PageWallCursor = FeedCursor<Id<"posts">>
type Signatory = FunctionReturnType<typeof api.modules.pages.signatories.listPageSignatories>[number]

/** Combien de mes revendications la fiche relit pour trouver celle de CETTE page (une personne en dépose peu). */
const MY_CLAIMS_SCAN = 50

const SECTION_TITLE_STYLE = { margin: 0, fontSize: 16, color: "var(--ink-900)" } as const
const SUBSECTION_TITLE_STYLE = { margin: 0, fontSize: 14, fontWeight: 700, color: "var(--ink-900)" } as const
const MUTED_TEXT_STYLE = { margin: 0, color: "var(--ink-600)", fontSize: 13, lineHeight: 1.55 } as const
const STACK_STYLE = { display: "flex", flexDirection: "column", gap: 12 } as const
const ACTIONS_STYLE = { display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" } as const

/**
 * Ce qu'une application ajoute à la fiche d'une page qui VEND (ANTSIA : sa boutique, décision du propriétaire du
 * 22/10/2026). Le moteur ne connaît pas la boutique : il pose ce que l'application lui donne, sans rien retirer
 * des gestes de la page (gérer, revendiquer, accepter une invitation, publier en son nom, lire son mur).
 *  - `shop` : la page se PRÉSENTE comme sa boutique. L'en-tête de l'application (`hero`) remplace l'identité ; il
 *    porte le `h1` et l'abonnement. Les outils de la page (gérer, revendiquer) restent juste dessous ;
 *  - `products` : l'identité de la page reste, ses produits viennent en tête.
 * `lead` vient avant le mur ; `interleave(rang)` après chaque troisième publication du mur (rang 1, 2…).
 */
export interface PageCommerce {
  presentation: "shop" | "products"
  hero?: ReactNode
  lead?: ReactNode
  interleave?: (rank: number) => ReactNode
}

/** Publications du mur entre deux insertions de l'application (`PageCommerce.interleave`). */
const WALL_INTERLEAVE_EVERY = 3

export interface ProfilPagePageProps {
  handle: string
  /** Facultatif : la présentation marchande d'une page qui vend ; sans elle, la fiche est celle d'une page. */
  commerce?: PageCommerce
}

export function ProfilPagePage({ handle, commerce }: ProfilPagePageProps) {
  const { t } = useTranslation("reseau")
  const { networkId, personId } = useNetwork()
  const routes = useRoutes()
  const router = useRouter()
  const page = useAuthenticatedConvexQuery(api.modules.pages.pages.getPage, { networkId, handle })

  if (page.data === undefined) {
    // Une panne n'est ni une attente éternelle ni un refus : elle se DIT.
    if (page.isError) {
      return (
        <ProfilFrame>
          <ReseauQueryError
            title={t("profilPagePage.unavailable.title")}
            message={t("profilPagePage.unavailable.message")}
            onRetry={() => void page.refetch()}
          />
        </ProfilFrame>
      )
    }
    return (
      <ProfilFrame>
        <SkeletonCard />
        <SkeletonCard />
      </ProfilFrame>
    )
  }

  if (page.data === null) {
    const refusal = pageRefusalTexts(t)
    return (
      <ProfilFrame>
        <Card style={RESEAU_CARD_STYLE}>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <h1 style={{ margin: 0, fontSize: 18, color: "var(--ink-900)" }}>{refusal.title}</h1>
            {/* Une seule phrase, choisie pour ne trancher entre AUCUNE des
                causes possibles : `getPage` ne distingue pas non plus. */}
            <p style={{ margin: 0, fontSize: 14, color: "var(--ink-600)" }}>{refusal.body}</p>
            <div>
              <Button
                variant="secondary"
                icon="arrowLeft"
                style={RESEAU_SECONDARY_ACTION_STYLE}
                onClick={() => router.push(reseauAgentHref("pages", routes.home()))}
              >
                {t("profilPagePage.backToPages")}
              </Button>
            </div>
          </div>
        </Card>
      </ProfilFrame>
    )
  }

  // Une autre page ⇒ un autre mur, un autre formulaire : tout l'état repart de zéro.
  return <PageProfile key={`${networkId}:${personId}:${page.data.pageId}`} page={page.data} commerce={commerce} />
}

/** La fiche chargée : identité (ou l'en-tête de boutique de l'application), gestes, gestion, revendication, mur. */
function PageProfile({ page, commerce }: { page: PageDto; commerce?: PageCommerce }) {
  const { t, i18n } = useTranslation("reseau")
  const { networkId, liveAvailable } = useNetwork()
  const [conference, setConference] = useState(false)
  const follow = useMutation(api.modules.pages.pages.follow)
  const unfollow = useMutation(api.modules.pages.pages.unfollow)
  const [followPending, setFollowPending] = useState(false)
  const [managing, setManaging] = useState(false)
  const [claiming, setClaiming] = useState(false)
  const nameId = useId()
  const manageId = useId()
  const claimId = useId()

  const role = page.viewer.role
  const following = page.viewer.following
  const canPublish = canPublishAsPage(role)
  const canManage = canManagePageAs(role)
  const claimAction = pageClaimAction(page.badge, role)
  const roleNote = pageRoleNote(role, t)
  const badge = pageBadgeView(page.badge)
  const meta = [ownerKindLabel(page.ownerKind, t), ...(page.country === null ? [] : [countryName(page.country, i18n.language)])].join(" · ")

  const shopHero = commerce?.presentation === "shop" && commerce.hero ? commerce.hero : null
  // Gérer et revendiquer : sous l'identité de la page, ou sous l'en-tête de sa boutique.
  const pageTools = (
    <>
      {canManage ? (
        <Button
          variant="secondary"
          icon="settings"
          aria-expanded={managing}
          aria-controls={manageId}
          style={RESEAU_SECONDARY_ACTION_STYLE}
          onClick={() => setManaging((open) => !open)}
        >
          {t(managing ? "profilPagePage.manage.close" : "profilPagePage.manage.open")}
        </Button>
      ) : null}
      {claimAction === "claim" ? (
        <Button variant="ghost" icon="flag" aria-expanded={claiming} aria-controls={claimId} onClick={() => setClaiming((open) => !open)}>
          {pageClaimTitle("claim", t)}
        </Button>
      ) : null}
    </>
  )

  const handleFollowToggle = async () => {
    setFollowPending(true)
    try {
      if (following) {
        await unfollow({ networkId, pageId: page.pageId })
        toast.success(t("profilPagePage.unfollowed"))
      } else {
        await follow({ networkId, handle: page.handle })
        toast.success(t("profilPagePage.followed"))
      }
    } catch (err) {
      toast.error(followActionErrorMessage(err, t))
    } finally {
      setFollowPending(false)
    }
  }

  return (
    <ProfilFrame>
      {shopHero ? (
        <>
          {shopHero}
          {canManage || claimAction === "claim" || roleNote !== null ? (
            <div style={STACK_STYLE}>
              <div style={ACTIONS_STYLE}>{pageTools}</div>
              {roleNote === null ? null : <p className="pp-self-note">{roleNote}</p>}
            </div>
          ) : null}
        </>
      ) : (
      <section className="pp-identity" aria-labelledby={nameId}>
        <div aria-hidden="true" className="pp-banner" style={bannerStyle(page.bannerUrl)} />
        <div className="pp-identity-body">
          <div className="pp-avatar pp-avatar--square">
            <Avatar displayName={page.name} avatarUrl={page.logoUrl} size={104} shape="square" />
          </div>

          <div className="pp-name-row">
            <h1 className="pp-name" id={nameId}>
              {page.name}
            </h1>
            {/* La confiance de la page — se voit AVANT d'avoir lu le corps de
                la moindre publication. */}
            <Badge tone={badge.tone} size="sm" icon={badge.icon}>
              {t(badge.labelKey)}
            </Badge>
          </div>
          <p className="pp-handle">
            @{page.handle}
            {page.shortName === null ? null : ` · ${page.shortName}`}
          </p>
          <p style={{ ...MUTED_TEXT_STYLE, marginTop: 6 }}>{meta}</p>
          {page.description ? <p className="pp-headline">{page.description}</p> : null}

          <p
            style={{
              margin: "10px 0 0",
              display: "flex",
              gap: 6,
              alignItems: "center",
              fontSize: 13,
              color: "var(--ink-700)",
            }}
          >
            <span>{pageFollowerCountLabel(page.followerCount, t)}</span>
            <span aria-hidden="true">·</span>
            <span>{pagePostCountLabel(page.postCount, t)}</span>
          </p>

          <div className="pp-actions">
            <Button
              // Suivre : couleur des relations ; une fois suivie, le bouton redevient neutre (ADR-0027).
              variant={following ? "secondary" : "social"}
              icon={following ? "check" : "plus"}
              disabled={followPending}
              aria-pressed={following}
              style={following ? RESEAU_SECONDARY_ACTION_STYLE : RESEAU_ACTION_SHAPE_STYLE}
              onClick={() => void handleFollowToggle()}
            >
              {pageFollowButtonLabel(following, t)}
            </Button>
            {pageTools}
          </div>
          {roleNote === null ? null : <p className="pp-self-note">{roleNote}</p>}
        </div>
      </section>
      )}

      {/* Une invitation à signer ne concerne que qui n'a pas encore de rôle vivant ici. */}
      {role === null ? <PageInvitationBanner pageId={page.pageId} /> : null}

      {claiming && claimAction === "claim" ? <PageClaimSection id={claimId} page={page} action="claim" onClose={() => setClaiming(false)} /> : null}

      {managing && canManage ? (
        <PageManagement id={manageId} page={page} verify={claimAction === "verify"} />
      ) : null}

      {/* Un simple signataire voit qui signe avec lui, et peut se retirer. */}
      {role === "signatory" ? (
        <Card style={RESEAU_CARD_STYLE}>
          <PageSignatories page={page} canManage={false} />
        </Card>
      ) : null}

      {/* La présentation marchande de l'application (vitrine, ou « nos produits »), avant le mur. */}
      {commerce?.lead ?? null}

      {/* En tête du mur, réservé à qui tient un rôle VIVANT sur la page — la
          QUESTION est relue ici pour l'affichage, la GARDE est refaite à
          l'écriture par `publishAsPage`. */}
      {canPublish && liveAvailable && page.networkId === networkId ? <Button icon="video" onClick={() => setConference(true)}>{t("direct:create.title")}</Button> : null}
      {conference && canPublish && liveAvailable && page.networkId === networkId ? <CreateDirectDialog key={`${networkId}:${page.pageId}`} asPage={{ pageId: page.pageId, name: page.name }} onClose={() => setConference(false)} /> : null}
      {canPublish ? <PostComposer asPage={{ pageId: page.pageId, displayName: page.name, avatarUrl: page.logoUrl }} /> : null}

      <PageWall page={page} canPublish={canPublish} interleave={commerce?.interleave} />
    </ProfilFrame>
  )
}

/** La bannière publiée, ou le fond neutre de la charte. */
function bannerStyle(url: string | null): CSSProperties {
  if (url === null) return { background: "var(--muted)" }
  return { backgroundImage: `url(${JSON.stringify(url)})`, backgroundSize: "cover", backgroundPosition: "center" }
}

// ═══════════════════════════════════════════════════════════════
// Le mur
// ═══════════════════════════════════════════════════════════════

/**
 * Le mur d'une page : une CHAÎNE de fenêtres montées, chacune avec son curseur
 * et son propre abonnement — les hooks restent hors de toute boucle
 * conditionnelle et chaque fenêtre garde le temps réel. Voir
 * `reseau-feed-pages.ts` pour ce qu'on a écarté (limite gonflée, défilement
 * infini) et pourquoi.
 */
function PageWall({ page, canPublish, interleave }: { page: PageDto; canPublish: boolean; interleave?: (rank: number) => ReactNode }) {
  const { t } = useTranslation("reseau")
  const routes = useRoutes()
  const router = useRouter()
  /** Un instant FIGÉ : deux cartes du même mur ne doivent pas afficher deux âges. */
  const [now] = useState(() => Date.now())
  const [pages, setPages] = useState(() => initialFeedPages<PageWallCursor>())
  const [tail, setTail] = useState<{ pageKey: string; cursor: PageWallCursor | null } | null>(null)
  const [announcement, setAnnouncement] = useState("")
  const titleId = useId()

  const reportTail = useCallback((pageKey: string, cursor: PageWallCursor | null) => {
    setTail((current) => (current?.pageKey === pageKey && feedCursorKey(current.cursor) === feedCursorKey(cursor) ? current : { pageKey, cursor }))
    setPages((state) => {
      const currentLast = state.cursors[state.cursors.length - 1] ?? null
      // Une ancienne dernière fenêtre peut publier son effet pendant qu'un
      // rebase la démonte : son curseur n'a plus autorité sur la chaîne.
      if (feedCursorKey(currentLast) !== pageKey) return state
      return recordTail(state, cursor)
    })
  }, [])

  const rebaseAfterPage = useCallback((pageIndex: number, cursor: PageWallCursor | null) => {
    setPages((state) => rebasePagesAfter(state, pageIndex, cursor))
  }, [])

  const onTag = useCallback((tag: string) => router.push(reseauAgentTagHref(tag, routes.home())), [router, routes])
  // Une mention désigne une PERSONNE : elle mène à son profil, jamais à une page.
  const onMention = useCallback((mentioned: string) => router.push(personHref(mentioned, routes.profile)), [router, routes])

  /** Seule la réponse de la DERNIÈRE fenêtre actuellement montée fait foi. */
  const lastPageCursor = pages.cursors[pages.cursors.length - 1] ?? null
  const lastPageKey = feedCursorKey(lastPageCursor)
  const tailCursor = tail?.pageKey === lastPageKey ? tail.cursor : null

  return (
    <section aria-labelledby={titleId} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <h2 id={titleId} style={SECTION_TITLE_STYLE}>
        {t("profilPagePage.publications")}
      </h2>

      {pages.cursors.map((cursor, index) => (
        <PageWallWindow
          key={feedCursorKey(cursor)}
          handle={page.handle}
          cursor={cursor}
          pageIndex={index}
          isFirst={index === 0}
          isLast={index === pages.cursors.length - 1}
          now={now}
          onTag={onTag}
          onMention={onMention}
          onTail={reportTail}
          onBoundaryShift={rebaseAfterPage}
          emptyFallback={<EmptyPageWall text={pageWallEmptyText(canPublish, t)} />}
          interleave={interleave}
        />
      ))}

      {shouldShowLoadMore(pages, tailCursor) ? (
        <div>
          <Button
            variant="secondary"
            icon="arrowDown"
            onClick={() => {
              setPages((state) => appendPage(state, tailCursor))
              setAnnouncement(loadMoreAnnouncement(PAGE_WALL_PAGE_SIZE, t))
            }}
          >
            {t("profilPagePage.loadMore")}
          </Button>
        </div>
      ) : null}

      {/* Un bouton qui ajoute du contenu SOUS lui ne dit rien à qui ne voit
          pas l'écran. Le focus, lui, reste sur le bouton. */}
      <p role="status" aria-live="polite" className="sr-only">
        {announcement}
      </p>
    </section>
  )
}

function EmptyPageWall({ text }: { text: string }) {
  return (
    <p
      style={{
        margin: 0,
        padding: 24,
        border: "1px dashed var(--ink-200)",
        borderRadius: 8,
        color: "var(--ink-600)",
        fontSize: 14,
      }}
    >
      {text}
    </p>
  )
}

/**
 * UNE fenêtre du mur, avec son curseur et son propre abonnement.
 *
 * Composant à part entière — et pas une boucle dans le parent — parce qu'un
 * abonnement par fenêtre est ce qui permet à chacune de rester en temps réel
 * sans jamais appeler un hook dans une boucle conditionnelle.
 */
function PageWallWindow({
  handle,
  cursor,
  pageIndex,
  isFirst,
  isLast,
  now,
  onTag,
  onMention,
  onTail,
  onBoundaryShift,
  emptyFallback,
  interleave,
}: {
  handle: string
  cursor: PageWallCursor | null
  pageIndex: number
  isFirst: boolean
  isLast: boolean
  now: number
  onTag: (tag: string) => void
  onMention: (handle: string) => void
  onTail: (pageKey: string, cursor: PageWallCursor | null) => void
  onBoundaryShift: (pageIndex: number, cursor: PageWallCursor | null) => void
  emptyFallback: ReactNode
  /** Après chaque troisième publication de la fenêtre ; le rang continue d'une fenêtre à l'autre. */
  interleave?: (rank: number) => ReactNode
}) {
  const { t } = useTranslation("reseau")
  const { networkId } = useNetwork()
  const wall = useAuthenticatedConvexQuery(api.modules.pages.pages.pagePosts, {
    networkId,
    handle,
    ...(cursor === null ? {} : { cursor }),
  })

  const items = wall.data?.items ?? []
  const nextCursor = wall.data?.nextCursor ?? null
  const pageKey = feedCursorKey(cursor)

  /**
   * La DERNIÈRE fenêtre publie son curseur au parent — elle seule peut en
   * avoir un. Dans un EFFET, jamais pendant le rendu.
   */
  useEffect(() => {
    if (wall.data === undefined) return
    if (isLast) {
      onTail(pageKey, nextCursor)
      return
    }
    onBoundaryShift(pageIndex, nextCursor)
  }, [isLast, nextCursor, onBoundaryShift, onTail, pageIndex, pageKey, wall.data])

  // Une panne du mur se dit — jamais « cette page n'a rien publié ».
  if (wall.isError && wall.data === undefined) {
    return (
      <ReseauQueryError
        title={t("profilPagePage.wall.errorTitle")}
        message={t("profilPagePage.wall.errorMessage")}
        onRetry={() => void wall.refetch()}
      />
    )
  }
  if (wall.data === undefined) return <SkeletonCard />
  if (items.length === 0) return isFirst ? <>{emptyFallback}</> : null

  const ranksBefore = pageIndex * Math.floor(PAGE_WALL_PAGE_SIZE / WALL_INTERLEAVE_EVERY)
  return (
    <>
      {items.map((post, index) => (
        <Fragment key={post._id}>
          <PostCard post={post} now={now} onTag={onTag} onMention={onMention} />
          {interleave && (index + 1) % WALL_INTERLEAVE_EVERY === 0 ? interleave(ranksBefore + (index + 1) / WALL_INTERLEAVE_EVERY) : null}
        </Fragment>
      ))}
    </>
  )
}

// ═══════════════════════════════════════════════════════════════
// Invitation à signer
// ═══════════════════════════════════════════════════════════════

/**
 * Une invitation en attente pour CETTE page : l'accepter fait du lecteur un
 * signataire vivant (la fiche se relit et montre le composeur), la décliner
 * l'efface. Une panne de cette lecture ne masque rien d'autre : le volet Pages
 * liste les invitations et y dit sa panne.
 */
function PageInvitationBanner({ pageId }: { pageId: Id<"pages"> }) {
  const { t } = useTranslation("reseau")
  const { networkId } = useNetwork()
  const invitations = useAuthenticatedConvexQuery(api.modules.pages.signatories.myPageInvitations, { networkId })
  const respond = useMutation(api.modules.pages.signatories.respondToPageInvitation)
  const [busy, setBusy] = useState(false)
  const titleId = useId()
  const invitation = invitations.data?.find((candidate) => candidate.page.pageId === pageId) ?? null
  if (invitation === null) return null

  const answer = async (accept: boolean) => {
    setBusy(true)
    try {
      await respond({ networkId, pageId, accept })
      toast.success(t(accept ? "pagesPanel.invitation.accepted" : "pagesPanel.invitation.declined"))
    } catch (err) {
      toast.error(pageActionErrorMessage(err, t))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card style={RESEAU_CARD_STYLE}>
      <section aria-labelledby={titleId} style={STACK_STYLE}>
        <h2 id={titleId} style={SUBSECTION_TITLE_STYLE}>
          {t("profilPagePage.invitation.title")}
        </h2>
        <p style={MUTED_TEXT_STYLE}>{pageInvitationText(invitation.role, t)}</p>
        <div style={ACTIONS_STYLE}>
          <Button size="sm" variant="social" disabled={busy} onClick={() => void answer(true)}>
            {t("pagesPanel.invitation.accept")}
          </Button>
          <Button size="sm" variant="secondary" disabled={busy} onClick={() => void answer(false)}>
            {t("pagesPanel.invitation.decline")}
          </Button>
        </div>
      </section>
    </Card>
  )
}

// ═══════════════════════════════════════════════════════════════
// Revendiquer, faire vérifier
// ═══════════════════════════════════════════════════════════════

/**
 * Dépose un fichier à l'URL de dépôt du moteur ; rend son identifiant de
 * stockage, ou `null` si le dépôt a échoué. Le serveur rejuge tout à la pose
 * (dépôt NEUF de la même personne, type, taille, analyse).
 */
async function uploadToEngine(uploadUrl: string, file: File): Promise<Id<"_storage"> | null> {
  const response = await fetch(uploadUrl, { method: "POST", headers: { "Content-Type": file.type }, body: file })
  if (!response.ok) return null
  const body: unknown = await response.json()
  if (typeof body !== "object" || body === null) return null
  const storageId = (body as { storageId?: unknown }).storageId
  // L'identifiant rendu par le stockage est une chaîne opaque : il ne se type qu'ici, au bord.
  return typeof storageId === "string" ? (storageId as Id<"_storage">) : null
}

/**
 * Revendiquer une page de la communauté, ou — son administrateur — en demander
 * la vérification : une à cinq pièces, une note facultative. Une demande EN
 * ATTENTE ferme le formulaire (une seule à la fois) et se retire ; une demande
 * refusée se dit, avec son motif, et une nouvelle peut partir.
 */
function PageClaimSection({
  id,
  page,
  action,
  onClose,
  embedded = false,
}: {
  /** La zone que le bouton qui l'ouvre commande (`aria-controls`). */
  id?: string
  page: PageDto
  action: PageClaimAction
  onClose?: () => void
  /** Rendue dans la gestion de la page : sans carte propre. */
  embedded?: boolean
}) {
  const { t, i18n } = useTranslation("reseau")
  const timeZone = useViewerTimeZone()
  const { networkId } = useNetwork()
  const claims = useAuthenticatedConvexQuery(api.modules.pages.claims.paginateMyPageClaims, {
    networkId,
    paginationOpts: { numItems: MY_CLAIMS_SCAN, cursor: null },
  })
  const generateUploadUrl = useMutation(api.modules.pages.claims.generateClaimEvidenceUploadUrl)
  const requestClaim = useMutation(api.modules.pages.claims.requestPageClaim)
  const withdrawClaim = useMutation(api.modules.pages.claims.withdrawPageClaim)
  const [note, setNote] = useState("")
  const [files, setFiles] = useState<readonly File[]>([])
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)
  const titleId = useId()
  const latest = latestClaimFor(claims.data?.page ?? [], page.pageId)

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const refusal =
      claimEvidenceRefusal(files.length, t) ??
      claimNoteRefusal(note, t) ??
      files.map((file) => pageFileRefusal("page_claim_evidence", file, t)).find((text) => text !== null) ??
      null
    if (refusal !== null) {
      setError(refusal)
      return
    }
    setError(null)
    setPending(true)
    try {
      const evidence: { storageId: Id<"_storage">; mimeType?: string }[] = []
      for (const file of files) {
        const uploadUrl = await generateUploadUrl({ networkId })
        const storageId = await uploadToEngine(uploadUrl, file)
        if (storageId === null) {
          setError(t("profilPagePage.claim.uploadFailed"))
          return
        }
        evidence.push({ storageId, ...(file.type ? { mimeType: file.type } : {}) })
      }
      await requestClaim({ networkId, pageId: page.pageId, ...(note.trim().length > 0 ? { note } : {}), evidence })
      toast.success(t("profilPagePage.claim.sent"))
      setNote("")
      setFiles([])
    } catch (err) {
      setError(pageActionErrorMessage(err, t))
    } finally {
      setPending(false)
    }
  }

  const withdraw = async (claimId: Id<"pageClaims">) => {
    setPending(true)
    try {
      await withdrawClaim({ networkId, claimId })
      toast.success(t("profilPagePage.claim.withdrawn"))
    } catch (err) {
      toast.error(pageActionErrorMessage(err, t))
    } finally {
      setPending(false)
    }
  }

  let body: ReactNode
  if (claims.data === undefined && claims.isError) {
    body = (
      <ReseauQueryError
        title={t("profilPagePage.claim.errorTitle")}
        message={t("profilPagePage.claim.errorMessage")}
        onRetry={() => void claims.refetch()}
      />
    )
  } else if (claims.data === undefined) {
    body = <SkeletonCard />
  } else if (latest !== null && claimIsPending(latest)) {
    body = (
      <>
        <p style={{ ...MUTED_TEXT_STYLE, color: "var(--ink-800)" }}>{claimStatusText("pending", t)}</p>
        <p style={MUTED_TEXT_STYLE}>{claimSubmittedText(latest.createdAt, i18n.language, t, timeZone)}</p>
        <div style={ACTIONS_STYLE}>
          <Button variant="secondary" disabled={pending} style={RESEAU_SECONDARY_ACTION_STYLE} onClick={() => void withdraw(latest.claimId)}>
            {t("profilPagePage.claim.withdraw")}
          </Button>
        </div>
      </>
    )
  } else {
    body = (
      <form noValidate onSubmit={(event) => void submit(event)} style={STACK_STYLE}>
        {latest !== null && latest.status !== "pending" ? (
          <p style={MUTED_TEXT_STYLE}>
            {claimStatusText(latest.status, t)}
            {latest.decisionReason === null ? null : ` ${t("profilPagePage.claim.reason", { reason: latest.decisionReason })}`}
          </p>
        ) : null}
        <p style={MUTED_TEXT_STYLE}>{pageClaimIntro(action, t)}</p>
        {error === null ? null : <Alert tone="danger">{error}</Alert>}
        <Field label={t("profilPagePage.claim.files")} hint={t("profilPagePage.claim.filesHint", { max: PAGE_CLAIM_EVIDENCE_MAX })}>
          <input
            type="file"
            multiple
            accept={pageUploadAccept("page_claim_evidence")}
            onChange={(event: ChangeEvent<HTMLInputElement>) => setFiles(Array.from(event.target.files ?? []))}
          />
        </Field>
        {files.length > 0 ? <p style={MUTED_TEXT_STYLE}>{t("profilPagePage.claim.filesSelected", { count: files.length })}</p> : null}
        <Field label={t("profilPagePage.claim.note")}>
          <TextArea value={note} maxLength={PAGE_CLAIM_NOTE_MAX_LENGTH} rows={3} onChange={(event) => setNote(event.target.value)} />
        </Field>
        <div style={ACTIONS_STYLE}>
          <Button type="submit" variant="primary" disabled={pending}>
            {t(pending ? "profilPagePage.claim.submitting" : "profilPagePage.claim.submit")}
          </Button>
          {onClose === undefined ? null : (
            <Button type="button" variant="secondary" disabled={pending} style={RESEAU_SECONDARY_ACTION_STYLE} onClick={onClose}>
              {t("profilPagePage.claim.cancel")}
            </Button>
          )}
        </div>
      </form>
    )
  }

  const content = (
    <section id={id} aria-labelledby={titleId} style={STACK_STYLE}>
      <h2 id={titleId} style={SUBSECTION_TITLE_STYLE}>
        {pageClaimTitle(action, t)}
      </h2>
      {body}
    </section>
  )
  return embedded ? content : <Card style={RESEAU_CARD_STYLE}>{content}</Card>
}

// ═══════════════════════════════════════════════════════════════
// Gestion de la page (administrateur vivant)
// ═══════════════════════════════════════════════════════════════

function PageManagement({ id, page, verify }: { id: string; page: PageDto; verify: boolean }) {
  const { t } = useTranslation("reseau")
  const titleId = useId()
  return (
    <Card style={RESEAU_CARD_STYLE}>
      <section id={id} aria-labelledby={titleId} style={{ display: "flex", flexDirection: "column", gap: 24 }}>
        <h2 id={titleId} style={SECTION_TITLE_STYLE}>
          {t("profilPagePage.manage.title")}
        </h2>
        <PageIdentityForm page={page} />
        <PageImagesForm page={page} />
        <PageSignatories page={page} canManage />
        {verify ? <PageClaimSection page={page} action="verify" embedded /> : null}
      </section>
    </Card>
  )
}

/**
 * L'identité de la page — nom, sigle, description, pays. Seuls les champs qui
 * changent partent (`checkPageIdentity`) ; le serveur garde les valeurs
 * d'avant dans l'historique de la page. L'ADRESSE ne change pas ici : un lien
 * partagé cesserait d'aboutir.
 */
function PageIdentityForm({ page }: { page: PageDto }) {
  const { t, i18n } = useTranslation("reseau")
  const { networkId } = useNetwork()
  const updateIdentity = useMutation(api.modules.pages.identity.updatePageIdentity)
  const current = { name: page.name, shortName: page.shortName, description: page.description, country: page.country }
  const [draft, setDraft] = useState<PageIdentityDraft>(() => identityDraftOf(current))
  const [errors, setErrors] = useState<Partial<Record<PageIdentityField, string>>>({})
  const [pending, setPending] = useState(false)
  const titleId = useId()

  const update = <K extends keyof PageIdentityDraft>(key: K, value: PageIdentityDraft[K]) => setDraft((state) => ({ ...state, [key]: value }))

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const check = checkPageIdentity(current, draft, t)
    if (!check.ok) {
      setErrors(check.errors)
      return
    }
    setErrors({})
    if (isEmptyIdentityPatch(check.patch)) {
      toast(t("profilPagePage.identity.unchanged"))
      return
    }
    setPending(true)
    try {
      const result = await updateIdentity({ networkId, pageId: page.pageId, ...check.patch })
      if (result.changed) toast.success(t("profilPagePage.identity.saved"))
      else toast(t("profilPagePage.identity.unchanged"))
    } catch (err) {
      toast.error(pageActionErrorMessage(err, t))
    } finally {
      setPending(false)
    }
  }

  return (
    <form aria-labelledby={titleId} noValidate onSubmit={(event) => void submit(event)} style={STACK_STYLE}>
      <h3 id={titleId} style={SUBSECTION_TITLE_STYLE}>
        {t("profilPagePage.identity.title")}
      </h3>
      <Field label={t("profilPagePage.identity.name")} required error={errors.name}>
        <TextInput value={draft.name} maxLength={PAGE_NAME_MAX_LENGTH} onChange={(event) => update("name", event.target.value)} />
      </Field>
      <Field label={t("profilPagePage.identity.shortName")} error={errors.shortName}>
        <TextInput value={draft.shortName} maxLength={PAGE_SHORT_NAME_MAX_LENGTH} onChange={(event) => update("shortName", event.target.value)} />
      </Field>
      <Field label={t("profilPagePage.identity.description")} error={errors.description}>
        <TextArea value={draft.description} maxLength={PAGE_DESCRIPTION_MAX_LENGTH} rows={3} onChange={(event) => update("description", event.target.value)} />
      </Field>
      <Field label={t("profilPagePage.identity.country")}>
        <Select value={draft.country ?? ""} onChange={(event) => update("country", event.target.value === "" ? null : event.target.value)}>
          <option value="">{t("profilPagePage.identity.countryNone")}</option>
          {countryOptions(i18n.language).map((option) => (
            <option key={option.code} value={option.code}>
              {option.label}
            </option>
          ))}
        </Select>
      </Field>
      <p style={MUTED_TEXT_STYLE}>{t("profilPagePage.identity.handleNote", { handle: page.handle })}</p>
      <div style={ACTIONS_STYLE}>
        <Button type="submit" variant="primary" disabled={pending}>
          {t(pending ? "profilPagePage.identity.saving" : "profilPagePage.identity.save")}
        </Button>
      </div>
    </form>
  )
}

type ImageSlot = "logo" | "banner"

/**
 * Le logo et la bannière, déposés par la garde des fichiers : URL d'un usage
 * nommé, dépôt, pose. Tant que l'analyse n'a pas parlé, l'image est RETENUE
 * (la fiche montre l'ancienne, ou rien) et l'écran le dit.
 */
function PageImagesForm({ page }: { page: PageDto }) {
  const { t } = useTranslation("reseau")
  const { networkId } = useNetwork()
  const generateUploadUrl = useMutation(api.modules.pages.identity.generatePageImageUploadUrl)
  const setPageImage = useMutation(api.modules.pages.identity.setPageImage)
  const [busySlot, setBusySlot] = useState<ImageSlot | null>(null)
  const [error, setError] = useState<string | null>(null)
  const titleId = useId()

  const upload = async (slot: ImageSlot, file: File) => {
    const refusal = pageFileRefusal(slot === "logo" ? "page_logo" : "page_banner", file, t)
    if (refusal !== null) {
      setError(refusal)
      return
    }
    setError(null)
    setBusySlot(slot)
    try {
      const uploadUrl = await generateUploadUrl({ networkId, slot })
      const storageId = await uploadToEngine(uploadUrl, file)
      if (storageId === null) {
        setError(t("profilPagePage.images.uploadFailed"))
        return
      }
      const result = await setPageImage({ networkId, pageId: page.pageId, slot, storageId, ...(file.type ? { mimeType: file.type } : {}) })
      if (result.withheld === null) toast.success(t("profilPagePage.images.updated"))
      else toast(t(`errors:${result.withheld}`))
    } catch (err) {
      setError(pageActionErrorMessage(err, t))
    } finally {
      setBusySlot(null)
    }
  }

  const remove = async (slot: ImageSlot) => {
    setError(null)
    setBusySlot(slot)
    try {
      await setPageImage({ networkId, pageId: page.pageId, slot, storageId: null })
      toast.success(t("profilPagePage.images.removed"))
    } catch (err) {
      setError(pageActionErrorMessage(err, t))
    } finally {
      setBusySlot(null)
    }
  }

  const onPick = (slot: ImageSlot) => (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    // Vidé aussitôt : choisir à nouveau le même fichier doit relancer le dépôt.
    event.target.value = ""
    if (file !== undefined) void upload(slot, file)
  }

  return (
    <section aria-labelledby={titleId} style={STACK_STYLE}>
      <h3 id={titleId} style={SUBSECTION_TITLE_STYLE}>
        {t("profilPagePage.images.title")}
      </h3>
      {error === null ? null : <Alert tone="danger">{error}</Alert>}
      <div style={{ ...ACTIONS_STYLE, gap: 12 }}>
        <Avatar displayName={page.name} avatarUrl={page.logoUrl} size={56} shape="square" />
        <div style={{ ...STACK_STYLE, gap: 8, flex: "1 1 220px" }}>
          <Field label={t("profilPagePage.images.chooseLogo")}>
            <input type="file" accept={pageUploadAccept("page_logo")} disabled={busySlot !== null} onChange={onPick("logo")} />
          </Field>
          {page.logoUrl === null ? null : (
            <div>
              <Button size="sm" variant="ghost" icon="trash" disabled={busySlot !== null} onClick={() => void remove("logo")}>
                {t("profilPagePage.images.removeLogo")}
              </Button>
            </div>
          )}
        </div>
      </div>
      <div style={{ ...STACK_STYLE, gap: 8 }}>
        <div aria-hidden="true" style={{ ...bannerStyle(page.bannerUrl), height: 64, borderRadius: 12 }} />
        <Field label={t("profilPagePage.images.chooseBanner")}>
          <input type="file" accept={pageUploadAccept("page_banner")} disabled={busySlot !== null} onChange={onPick("banner")} />
        </Field>
        {page.bannerUrl === null ? null : (
          <div>
            <Button size="sm" variant="ghost" icon="trash" disabled={busySlot !== null} onClick={() => void remove("banner")}>
              {t("profilPagePage.images.removeBanner")}
            </Button>
          </div>
        )}
      </div>
      {busySlot === null ? null : (
        <p role="status" aria-live="polite" style={MUTED_TEXT_STYLE}>
          {t("profilPagePage.images.uploading")}
        </p>
      )}
    </section>
  )
}

/**
 * Les signataires de la page — ses signataires vivants seuls les voient.
 * L'administrateur invite (une invitation ne vaut qu'acceptée), change un
 * rôle, retire ; chacun peut se retirer lui-même. Le dernier administrateur
 * ne part pas : le serveur le refuse (`PAGE_LAST_ADMIN`), l'écran le dit.
 */
function PageSignatories({ page, canManage }: { page: PageDto; canManage: boolean }) {
  const { t } = useTranslation("reseau")
  const { networkId, personId } = useNetwork()
  const signatories = useAuthenticatedConvexQuery(api.modules.pages.signatories.listPageSignatories, { networkId, pageId: page.pageId })
  const grant = useMutation(api.modules.pages.signatories.grantPageRole)
  const revoke = useMutation(api.modules.pages.signatories.revokePageRole)
  const [busy, setBusy] = useState(false)
  const [inviteHandle, setInviteHandle] = useState("")
  const [inviteRole, setInviteRole] = useState<PageRole>("signatory")
  const [inviteError, setInviteError] = useState<string | null>(null)
  const titleId = useId()
  const rows = signatories.data ?? []

  const run = async (work: () => Promise<void>) => {
    setBusy(true)
    try {
      await work()
    } catch (err) {
      toast.error(pageActionErrorMessage(err, t))
    } finally {
      setBusy(false)
    }
  }

  const changeRole = (row: Signatory, role: PageRole) => {
    if (row.handle === null || role === row.role) return
    const handle = row.handle
    void run(async () => {
      await grant({ networkId, pageId: page.pageId, handle, role })
      toast.success(t("profilPagePage.signatories.roleChanged"))
    })
  }

  const removeRow = (row: Signatory) => {
    const isMe = row.personId === personId
    void run(async () => {
      await revoke({ networkId, pageId: page.pageId, personId: row.personId })
      toast.success(t(isMe ? "profilPagePage.signatories.left" : "profilPagePage.signatories.removed"))
    })
  }

  const invite = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const handle = signatoryHandleOf(inviteHandle)
    if (handle === null) {
      setInviteError(t("profilPagePage.signatories.invite.handleRequired"))
      return
    }
    setInviteError(null)
    void run(async () => {
      const result = await grant({ networkId, pageId: page.pageId, handle, role: inviteRole })
      toast.success(t(result.invited ? "profilPagePage.signatories.invite.sent" : "profilPagePage.signatories.roleChanged"))
      setInviteHandle("")
    })
  }

  return (
    <section aria-labelledby={titleId} style={STACK_STYLE}>
      <h3 id={titleId} style={SUBSECTION_TITLE_STYLE}>
        {t("profilPagePage.signatories.title")}
      </h3>
      {signatories.isError ? (
        <ReseauQueryError
          title={t("profilPagePage.signatories.errorTitle")}
          message={t("profilPagePage.signatories.errorMessage")}
          onRetry={() => void signatories.refetch()}
        />
      ) : null}
      {signatories.data === undefined && !signatories.isError ? <SkeletonCard /> : null}
      {rows.length > 0 ? (
        <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 10 }}>
          {rows.map((row) => {
            const isMe = row.personId === personId
            const name = signatoryDisplayName(row, t)
            const canChangeRole = canManage && !isMe && row.accepted && row.handle !== null
            return (
              <li key={row.personId} style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                <Avatar displayName={name} avatarUrl={row.avatarUrl} size={36} hasIdentity={row.displayName !== null} />
                <div style={{ minWidth: 0, flex: "1 1 160px" }}>
                  <p style={{ margin: 0, fontSize: 14, fontWeight: 700, color: "var(--ink-900)" }}>
                    {name}
                    {isMe ? ` (${t("profilPagePage.signatories.you")})` : null}
                  </p>
                  {row.handle === null ? null : <p style={{ ...MUTED_TEXT_STYLE, fontSize: 12.5 }}>@{row.handle}</p>}
                </div>
                {canChangeRole ? (
                  <div style={{ minWidth: 150 }}>
                    <Select
                      aria-label={t("profilPagePage.signatories.roleLabel", { name })}
                      value={row.role}
                      disabled={busy}
                      onChange={(event) => {
                        const next = PAGE_ROLES.find((candidate) => candidate === event.target.value)
                        if (next !== undefined) changeRole(row, next)
                      }}
                    >
                      {PAGE_ROLES.map((candidate) => (
                        <option key={candidate} value={candidate}>
                          {pageRoleLabel(candidate, t)}
                        </option>
                      ))}
                    </Select>
                  </div>
                ) : (
                  <Badge tone="info" size="sm">
                    {pageRoleLabel(row.role, t)}
                  </Badge>
                )}
                {row.accepted ? null : (
                  <Badge tone="warning" size="sm">
                    {t("profilPagePage.signatories.pending")}
                  </Badge>
                )}
                {isMe ? (
                  <Button size="sm" variant="secondary" icon="logOut" disabled={busy} onClick={() => removeRow(row)}>
                    {t("profilPagePage.signatories.leave")}
                  </Button>
                ) : canManage ? (
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={busy}
                    aria-label={t("profilPagePage.signatories.removeLabel", { name })}
                    onClick={() => removeRow(row)}
                  >
                    {t("profilPagePage.signatories.remove")}
                  </Button>
                ) : null}
              </li>
            )
          })}
        </ul>
      ) : null}
      {canManage ? (
        <form noValidate onSubmit={invite} aria-label={t("profilPagePage.signatories.invite.title")} style={{ ...STACK_STYLE, gap: 10 }}>
          <p style={{ ...SUBSECTION_TITLE_STYLE, fontSize: 13 }}>{t("profilPagePage.signatories.invite.title")}</p>
          <div style={{ ...ACTIONS_STYLE, alignItems: "flex-end" }}>
            <div style={{ flex: "1 1 200px" }}>
              <Field label={t("profilPagePage.signatories.invite.handle")} error={inviteError ?? undefined}>
                <TextInput
                  value={inviteHandle}
                  placeholder={t("profilPagePage.signatories.invite.placeholder")}
                  autoCapitalize="none"
                  spellCheck={false}
                  onChange={(event) => setInviteHandle(event.target.value)}
                />
              </Field>
            </div>
            <div style={{ flex: "0 1 180px" }}>
              <Field label={t("profilPagePage.signatories.invite.role")}>
                <Select
                  value={inviteRole}
                  onChange={(event) => {
                    const next = PAGE_ROLES.find((candidate) => candidate === event.target.value)
                    if (next !== undefined) setInviteRole(next)
                  }}
                >
                  {PAGE_ROLES.map((candidate) => (
                    <option key={candidate} value={candidate}>
                      {pageRoleLabel(candidate, t)}
                    </option>
                  ))}
                </Select>
              </Field>
            </div>
            <Button type="submit" variant="primary" icon="userPlus" disabled={busy}>
              {t("profilPagePage.signatories.invite.submit")}
            </Button>
          </div>
        </form>
      ) : null}
    </section>
  )
}
