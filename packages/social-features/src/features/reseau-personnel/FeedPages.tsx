// Dupliqué de socle/packages/agent-features/src/features/reseau-personnel/FeedPages.tsx @ ad2e7fdc2 — adaptations : fil `posts.posts.myFeed` du moteur avec le réseau courant (`useNetwork().networkId`), portées du domaine (sans « mon_administration ») ; cartes rendues avec la projection du moteur (clé `_id`) ; le rail des pages à suivre est celui que le lot des pages réécrit sur le moteur (`./PagesSuggestionsRail`, mêmes nom et props qu'au socle) ; état vide du kit d'espace de `@antsia/ui/espace-kit` ; commentaires rapportés à la page réseau (« personnes » au lieu d'« agents ») ; P04 (18/10/2026) : sous le lecteur immersif (`ImmersiveFeedReader`), la MÊME page — même requête, même curseur — rend chaque publication dans un créneau, déclare son état au lecteur (chargement, erreur, lacune, préparation, nouvelles publications retenues en tête) et se tait sur l'entrelacement des suggestions ; hors lecteur, quand l'application déclare le fil immersif, chaque carte reçoit une enveloppe d'ancre de retour (`display: contents`) ; sans cette déclaration, rendu historique à l'identique ; ADR-0028 : sous la présentation « charte », la carte de suggestion des chartes (`FeedSuggestionCard`, Suivre et Écrire) ouvre la première page au téléphone, à la place des deux carrousels intercalés ; étude du 22/10/2026 (ADR-0037) : la carte de tête cède la place au carrousel « Personnes à découvrir » (Suivre et Ajouter) — au-dessus de l'état vide d'un fil vide, sinon après la 3ᵉ publication ou la dernière d'un fil plus court.
"use client"

/**
 * FeedPages — UNE page du fil, et l'état vide qui la remplace.
 *
 * Ces deux composants vivaient au bas de `ReseauAgentPage.tsx` jusqu'au
 * 2026-08-18. Ils en sont sortis pour la même raison que `useReseauFeedState` :
 * la coquille mobile monte un AUTRE écran sur la page réseau, qui rend la
 * même chaîne de pages. Les recopier aurait donné deux machines à pagination —
 * celle du bureau et celle du téléphone — qui divergent au premier correctif.
 *
 * Rien d'autre n'a changé : ni les props, ni l'effet de publication du curseur,
 * ni l'entrelacement des suggestions.
 */

import { api } from "@antsia/api/engine"
import { useAuthenticatedConvexQuery, useConvexMutationQuery } from "@antsia/api/hooks"
import { useNetwork } from "@antsia/api/network"
import { isSigningOutEverywhere } from "@antsia/api/sign-out-everywhere"
import { SkeletonCard } from "@antsia/ui"
import { EspaceEmptyState } from "@antsia/ui/espace-kit"
import { Fragment, useEffect, useMemo, useRef, type ReactNode } from "react"
import { useTranslation } from "react-i18next"
import { ReseauQueryError } from "../../shell/ReseauQueryError"
import { FeedPostMemoryScope } from "../feed-immersion/feed-post-memory"
import {
  ImmersiveFeedSlot,
  ImmersiveStatusSlot,
  useImmersiveFeedReader,
  useImmersiveFrozenHead,
  useImmersivePageReport,
  type ImmersivePageReport,
} from "../feed-immersion/ImmersiveFeedReader"
import { FeedClipsRail } from "./FeedClipsRail"
import { PostCard } from "./PostCard"
import { PagesSuggestionsRail } from "./PagesSuggestionsRail"
import { SuggestionsPanel } from "./SuggestionsPanel"
import { feedScopeArg, type FeedScope } from "./feed-scopes"
import { feedCursorKey } from "./reseau-feed-pages"
import type { ReseauFeedCursor } from "./useReseauFeedState"

/**
 * Adaptateur vers l'état vide du kit d'espace (`EspaceEmptyState`) : bordure
 * pointillée et radius 8 disparaissent, remplacés par le filet plein et le
 * radius 18 de `.esk-empty` — la même grammaire que le reste de l'espace.
 * Export et props INCHANGÉS : l'arbre mobile (`mobile/ReseauMobileFeed.tsx`)
 * monte ce composant tel quel.
 */
export function EmptyFeed({ text }: { text: string }) {
  return <EspaceEmptyState text={text} />
}

/**
 * UNE page du fil, avec son curseur et son abonnement.
 *
 * Composant à part entière — et pas une boucle dans le parent — parce qu'un
 * `useQuery` par page est ce qui permet à chacune de rester en temps réel sans
 * jamais appeler un hook dans une condition.
 */
export function FeedPage({
  cursor,
  pageIndex,
  pageKey,
  nextMountedCursor,
  tag,
  scope,
  now,
  isFirst,
  isLast,
  interleaveAfter,
  onTag,
  onMention,
  onTail,
  onBoundaryShift,
  emptyFallback,
}: {
  cursor: ReseauFeedCursor | null
  pageIndex: number
  pageKey: string
  nextMountedCursor: ReseauFeedCursor | null | undefined
  tag?: string
  scope: FeedScope
  now: number
  isFirst: boolean
  isLast: boolean
  interleaveAfter: ((count: number) => number | null) | null
  onTag: (tag: string) => void
  onMention: (handle: string) => void
  onTail: (pageKey: string, cursor: ReseauFeedCursor | null) => void
  onBoundaryShift: (pageIndex: number, cursor: ReseauFeedCursor | null) => void
  emptyFallback: ReactNode
}) {
  const { t, i18n } = useTranslation("reseau")
  const { networkId, feedPresentation, postPresentation } = useNetwork()
  /* L'écran des chartes (ADR-0028) : la suggestion OUVRE le fil du téléphone,
     carte unique, au lieu des carrousels intercalés après la 3ᵉ publication. */
  const charte = postPresentation === "charte"
  const page = useAuthenticatedConvexQuery(
    api.modules.posts.posts.myFeed,
    {
      networkId,
      ...(cursor === null ? {} : { cursor }),
      ...(tag === undefined ? {} : { tag }),
      // `undefined` pour la portée par défaut : la query garde exactement la
      // signature qu'elle avait avant les chips (cf. `feedScopeArg`).
      ...(feedScopeArg(scope) === undefined
        ? {}
        : { scope: feedScopeArg(scope) }),
    }
  )

  const items = page.data?.items ?? []
  const nextCursor = page.data?.nextCursor ?? null

  /*
   * P04 — sous le lecteur immersif, la MÊME page (même requête, même curseur,
   * même temps réel) rend des créneaux et déclare son état au lecteur. La
   * première page retient en tête les publications arrivées pendant la
   * lecture : elles ne s'insèrent pas sous la publication lue, une commande du
   * lecteur les montre. Hors lecteur, rien de tout cela ne s'applique.
   */
  const reader = useImmersiveFeedReader()
  const pageItems = page.data?.items
  const headIds = useMemo(
    () => (reader !== null && isFirst && pageItems !== undefined ? pageItems.map((post): string => post._id) : null),
    [reader, isFirst, pageItems],
  )
  const hiddenHead = useImmersiveFrozenHead(headIds)
  const shownItems = hiddenHead > 0 ? items.slice(hiddenHead) : items
  const lacunarPage = page.data?.lacunar === true
  const preparingPage = isFirst && page.data?.preparing === true
  const materializedSince = isFirst ? (page.data?.materializedSince ?? null) : null
  const pageStatus: ImmersivePageReport["status"] = page.isError ? "error" : page.data === undefined ? "loading" : "ready"
  const shownCount = pageStatus === "ready" ? shownItems.length : 0
  const report = useMemo<ImmersivePageReport | null>(
    () =>
      reader === null
        ? null
        : { pageKey, isFirst, isLast, status: pageStatus, count: shownCount, lacunar: lacunarPage, preparing: preparingPage, materializedSince, newCount: hiddenHead },
    [reader, pageKey, isFirst, isLast, pageStatus, shownCount, lacunarPage, preparingPage, materializedSince, hiddenHead],
  )
  useImmersivePageReport(report)

  const { mutate: prepareMyFeed } = useConvexMutationQuery(api.modules.posts.feedMaterialization.prepareMyFeed)
  const preparedNetwork = useRef<{ networkId: string; key: string } | null>(null)
  const canPrepare = page.data !== undefined && !page.isError
  const preparationKey = page.data?.preparationKey ?? (page.data?.preparing ? "preparing" : "mounted")
  useEffect(() => {
    // Une fois par clé de version/génération manquante ; une erreur d'accès désarme le verrou.
    if (page.isError) { preparedNetwork.current = null; return }
    // La sortie révoque la session avant de quitter le document : ne plus amorcer de travail.
    if (!isFirst || !canPrepare || isSigningOutEverywhere()) return
    const previous = preparedNetwork.current
    if (previous?.networkId === networkId) {
      if (preparationKey === "mounted") { preparedNetwork.current = { networkId, key: preparationKey }; return }
      if (previous.key === preparationKey) return
    }
    preparedNetwork.current = { networkId, key: preparationKey }
    prepareMyFeed({ networkId })
  }, [isFirst, canPrepare, preparationKey, networkId, prepareMyFeed, page.isError])

  /**
   * La DERNIÈRE page publie son curseur au parent — elle seule peut en avoir
   * un. Dans un EFFET, jamais pendant le rendu : remonter un état au parent
   * pendant qu'on rend est un effet de bord que React n'a aucune obligation de
   * respecter (double rendu du mode strict, rendu abandonné, concurrence).
   */
  useEffect(() => {
    if (page.data === undefined || page.isError) return
    if (isLast) {
      onTail(pageKey, nextCursor)
      return
    }
    if (
      feedCursorKey(nextCursor) !== feedCursorKey(nextMountedCursor ?? null)
    ) {
      onBoundaryShift(pageIndex, nextCursor)
    }
  }, [
    isLast,
    nextCursor,
    nextMountedCursor,
    onBoundaryShift,
    onTail,
    page.data,
    page.isError,
    pageIndex,
    pageKey,
  ])

  if (reader !== null) {
    // Le lecteur immersif : un créneau par publication, à la hauteur de la
    // scène ; les états de la page (lacune, préparation, historique) vivent
    // dans la barre et la fin du lecteur, jamais masqués.
    if (page.isError) {
      return (
        <ImmersiveStatusSlot id={`${pageKey}:error`}>
          <ReseauQueryError title={t("feedPages.errorTitle")} message={t("feedPages.errorMessage")} onRetry={() => { void page.refetch() }} />
        </ImmersiveStatusSlot>
      )
    }
    if (page.data === undefined) {
      return (
        <ImmersiveStatusSlot id={`${pageKey}:loading`} busy>
          <SkeletonCard />
          <p className="sr-only">{t("immersiveFeed.loading")}</p>
        </ImmersiveStatusSlot>
      )
    }
    if (shownItems.length === 0) {
      return isFirst && !page.data.lacunar && nextCursor === null ? <ImmersiveStatusSlot id={`${pageKey}:empty`}>{emptyFallback}</ImmersiveStatusSlot> : null
    }
    return (
      <>
        {shownItems.map((post) => (
          <ImmersiveFeedSlot
            key={post._id}
            postId={post._id}
            group={pageKey}
            label={t("immersiveFeed.slotLabel", { name: post.page?.name ?? post.author.displayName ?? t("postCard.unknownAuthor") })}
          >
            <PostCard post={post} now={now} onTag={onTag} onMention={onMention} />
          </ImmersiveFeedSlot>
        ))}
      </>
    )
  }

  /* Les personnes à découvrir des chartes (ADR-0037, d'après la référence des
     captures du 22/10/2026) : au téléphone (`.rp-feed-inline` — le rail droit du
     bureau porte les mêmes données), au-dessus de l'état vide d'un fil vide : un
     nouvel arrivant trouve d'abord qui suivre. */
  const discovery = (
    <div className="rp-feed-inline" style={{ flexDirection: "column", gap: 12 }}>
      <SuggestionsPanel presentation="carousel" />
      <PagesSuggestionsRail presentation="carousel" />
    </div>
  )
  const emptyDiscovery = charte && isFirst && tag === undefined ? discovery : null

  if (page.isLoading) {
    return (
      <>
        <SkeletonCard />
        {isFirst ? <SkeletonCard /> : null}
      </>
    )
  }

  if (page.isError) {
    return <ReseauQueryError title={t("feedPages.errorTitle")} message={t("feedPages.errorMessage")} onRetry={() => { void page.refetch() }} />
  }

  const lacuna = page.data?.lacunar ? <p role="status" className="rounded-xl border border-border bg-muted p-3 text-sm text-muted-foreground">{t("feedPages.incomplete")}</p> : null
  const preparation = isFirst && page.data?.preparing ? <p role="status" className="text-sm text-muted-foreground">{t("feedPages.preparing")}</p> : null
  const history = isFirst && page.data?.materializedSince !== undefined ? <p className="text-sm text-muted-foreground">{t("feedPages.historySince", { date: new Intl.DateTimeFormat(i18n.resolvedLanguage ?? i18n.language, { dateStyle: "medium" }).format(page.data.materializedSince) })}</p> : null
  if (items.length === 0) return <>{preparation}{history}{lacuna}{emptyDiscovery}{isFirst && !page.data?.lacunar && nextCursor === null ? emptyFallback : null}</>

  /* Sous la charte, un fil plus court que l'intercalage montre quand même les
     personnes à découvrir, après sa dernière publication. */
  const interleaveIndex = interleaveAfter ? (interleaveAfter(items.length) ?? (charte && isFirst && tag === undefined ? items.length : null)) : null

  return (
    <>
      {preparation}
      {history}
      {lacuna}
      {items.map((post, index) => (
        <Fragment key={post._id}>
          {/* P04 : l'enveloppe d'ancre (`display: contents`, aucune boîte) permet
              le retour à cette carte et la mémoire de sa galerie — seulement
              quand l'application déclare le fil immersif. */}
          {feedPresentation === "immersive" ? (
            <div className="contents" data-feed-anchor={post._id}>
              <FeedPostMemoryScope postId={post._id}>
                <PostCard post={post} now={now} onTag={onTag} onMention={onMention} />
              </FeedPostMemoryScope>
            </div>
          ) : (
            <PostCard post={post} now={now} onTag={onTag} onMention={onMention} />
          )}
          {/* La découverte se consomme AU FIL du défilement sur mobile : deux
              modules distincts, personnes réciproques puis pages unilatérales.
              Le bureau masque cette pile car son rail droit porte les mêmes
              données en vertical. */}
          {charte && isFirst && tag === undefined && index === Math.min(4, items.length - 1) ? <FeedClipsRail posts={items} /> : null}
          {index + 1 === interleaveIndex ? discovery : null}
        </Fragment>
      ))}
    </>
  )
}
