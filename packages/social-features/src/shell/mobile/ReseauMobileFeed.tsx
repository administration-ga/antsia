// Dupliqué de socle/packages/agent-features/src/features/reseau-personnel/mobile/ReseauMobileFeed.tsx @ ad2e7fdc2 — adaptations : déplacé dans la coque (`shell/mobile/`) ; ma fiche lue sur la personne du moteur (`displayName`, portrait servi par la garde `avatar.url`, identifiant seulement PUBLIÉ) ; adresses par la table des routes injectée — lecteur des statuts sur `useRoutes().stories()` (paramètre `auteur`), geste du bandeau de profil vers `useRoutes().settings?.()` (retiré tant que l'application ne sert pas de réglages) — plus aucune route de l'espace en dur ; « Créer une actu » ouvre le composeur EN PLACE par la coquille (`onCreateStory`, la feuille qu'elle monte déjà) au lieu d'une page de composition ; surfaces `reseau` du plateau retirées (le moteur n'en connaît pas) ; chips de portée et leur note par leurs CLÉS i18n ; textes par l'i18n (`reseau:reseauMobileFeed.*`, et `t` passé en dernier aux modules purs : `invitationsBannerLabel`, `viewReturnLabel`, `searchStatusText`, `emptyFeedText`, `loadMoreAnnouncement`) ; résultats de recherche clés sur l'identifiant du moteur (`_id`) ; « agent » devient « personne » ; rendu et ordre inchangés ; P04 (18/10/2026) : quand l'application déclare le fil immersif (`NetworkProvider feedPresentation`), le fil et ses mots-clés s'affichent par défaut dans le lecteur immersif (`ImmersiveFeedReader`, même chaîne de pages, mêmes curseurs) avec la tête du fil en premier créneau et la bascule Liste/Immersion dans sa barre ; en liste, la bascule précède le fil et la position se retrouve au retour (`FeedListReturn`) ; sans déclaration, rendu historique à l'identique ; ADR-0028 : sous la présentation « charte », la tête suit l'écran des chartes — les actus juste sous l'en-tête, puis les bandeaux, les portées et la bascule Liste/Immersion ; le déclencheur du composeur s'efface devant le bouton « + » de la barre (Créer), qui ouvre la même surface.
"use client"

/**
 * ReseauMobileFeed — le FIL au téléphone.
 *
 * Le même fil que sur le bureau, dans le même ordre, avec la même chaîne de
 * pages (`FeedPage`, `useReseauFeedState`) — seule la mise en page change.
 * Trois écarts, tous délibérés :
 *
 *  · le composeur devient un DÉCLENCHEUR (`PostComposerSheet`) : monté en
 *    permanence, il prendrait la moitié de l'écran avant la première
 *    publication ;
 *  · les rails n'existent pas — ce qu'ils portaient est au Menu, et les
 *    suggestions restent INTERCALÉES dans le fil (`.rm-scroll .rp-feed-inline`
 *    rend visible ce que le bureau masque quand son rail droit les porte
 *    déjà) ;
 *  · la recherche vit dans l'en-tête, pas au-dessus du fil.
 *
 * ⚠️ JAMAIS de défilement infini, au téléphone moins qu'ailleurs. La raison est
 * écrite dans `reseau-feed-pages.ts` et elle vaut ici au carré : cet écran
 * porte une barre basse FLOTTANTE, et un fil qui repousse indéfiniment son
 * pied rend ce pied inatteignable (WCAG 2.4.5 et 3.2.5). Le bouton « Voir plus
 * de publications » reste le seul chemin.
 *
 * P04 : en IMMERSION, le lecteur n'a pas de pied à atteindre — sa fin est un
 * créneau qui porte « Charger la suite ». Il charge au plus trois pages de
 * lui-même en approchant de la fin (borné, annoncé, sous la lecture : rien ne
 * se déplace), la commande restant toujours offerte. La liste garde la règle
 * ci-dessus.
 *
 * ⚠️ Les deux bandeaux du haut sont ceux du bureau, repris tels quels : une
 * invitation reçue est une action attendue DE MOI, elle ne dort pas derrière un
 * volet qu'il faut penser à ouvrir ; et sans profil publié on n'est ni
 * trouvable, ni connectable — c'est un prérequis, pas une préférence.
 */

import { useNetwork, useRoutes } from "@antsia/api/network"
import { Alert, Button, SkeletonCard } from "@antsia/ui"
import { useCallback } from "react"
import { useTranslation } from "react-i18next"

import { FeedListReturn } from "../../features/feed-immersion/FeedListReturn"
import { FeedModeToggle } from "../../features/feed-immersion/FeedModeToggle"
import { FeedSurfaceMemoryProvider } from "../../features/feed-immersion/feed-post-memory"
import { ImmersiveFeedReader } from "../../features/feed-immersion/ImmersiveFeedReader"
import { useFeedImmersion } from "../../features/feed-immersion/use-feed-immersion"
import { Avatar } from "../../features/reseau-personnel/Avatar"
import { EmptyFeed, FeedPage } from "../../features/reseau-personnel/FeedPages"
import { FEED_SCOPE_CHIPS, feedScopeById } from "../../features/reseau-personnel/feed-scopes"
import { PostCard } from "../../features/reseau-personnel/PostCard"
import { appendPage, feedCursorKey, loadMoreAnnouncement, shouldShowLoadMore } from "../../features/reseau-personnel/reseau-feed-pages"
import { emptyFeedText, searchStatusText } from "../../features/reseau-personnel/shared"
import type { ReseauFeedState } from "../../features/reseau-personnel/useReseauFeedState"
// Import DIRECT des symboles (et non de l'index de la tranche) : le lecteur
// plein écran, son pager et son composeur n'ont rien à faire dans le bundle
// du fil.
import { StoriesTray } from "../../features/stories/StoriesTray"
import { markStoriesOpenedFromApp } from "../../features/stories/stories-entry"
import { StoriesStyles } from "../../features/stories/stories-styles"
import { invitationsBannerLabel, shouldSurfaceInvitations, suggestionsInterleaveIndex, viewNeedsReturn, viewReturnLabel } from "../reseau-layout"

/** Le paramètre du lecteur plein écran qui positionne l'entrée sur un auteur. */
const STORIES_AUTHOR_PARAM = "auteur"

/** Le prénom seul — « Partager une information, Marie ? » et non le nom complet. */
function firstNameOf(displayName: string | undefined): string | null {
  if (displayName === undefined) return null
  const first = displayName.trim().split(/\s+/)[0]
  return first !== undefined && first.length > 0 ? first : null
}

export function ReseauMobileFeed({
  state,
  onCompose,
  onCreateStory,
}: {
  state: ReseauFeedState
  /**
   * Ouvre le composeur de PUBLICATION — la même surface que la commande
   * « Créer » de la coquille (`useCreationController`, R-01/R-02) et non un
   * second état d'ouverture. Deux booléens pour un composeur, c'était deux
   * cartes montables en même temps.
   */
  onCompose: () => void
  /**
   * Ouvre le composeur d'ACTU — la même feuille que la commande « Créer »,
   * plein écran au téléphone : un formulaire n'a pas besoin d'une page.
   */
  onCreateStory: () => void
}) {
  const { t } = useTranslation("reseau")
  const routes = useRoutes()
  /* L'écran des chartes (ADR-0028) : actus d'abord, Créer par la barre. */
  const charte = useNetwork().postPresentation === "charte"
  const {
    now,
    router,
    view,
    scope,
    pages,
    setPages,
    announcement,
    setAnnouncement,
    search,
    focused,
    connections,
    follows,
    myProfile,
    goToTab,
    goToScope,
    openTag,
    openMention,
    backToFeed,
    tailCursor,
    pendingCount,
    onboardingCopy,
    heading,
    showChips,
  } = state

  const person = myProfile.data
  const firstName = firstNameOf(person?.displayName ?? undefined)
  // Un identifiant ne sert au plateau que PUBLIÉ — sinon `null`.
  const myHandle = person?.published === true ? (person.handle ?? null) : null
  const myAvatarUrl = person?.avatar?.url ?? null
  // Le geste du bandeau de profil : les réglages, s'ils sont servis.
  const settingsHref = routes.settings?.() ?? null

  /*
   * P04 — le fil IMMERSIF, quand l'application le déclare : le fil et ses
   * mots-clés seulement (une recherche ou une publication ouverte restent en
   * liste). L'identifiant du fil (portée, mot-clé) porte la mémoire de retour
   * de l'onglet ; aucune adresse n'y entre. `null` sans déclaration : rien ne
   * change ci-dessous.
   */
  const feedId = view.kind === "feed" ? `fil:${scope}` : view.kind === "tag" ? `fil:${scope}:tag:${view.tag}` : null
  const immersion = useFeedImmersion({ feedId, depth: pages.cursors.length })
  const canLoadMore = shouldShowLoadMore(pages, tailCursor)
  const loadMore = useCallback(() => {
    setPages((current) => appendPage(current, tailCursor))
  }, [setPages, tailCursor])

  const storiesBlock = (
    <>
      {/* ── Les STORIES ───────────────────────────────────────────────────────
          Elles viennent APRÈS le composeur : publier reste le geste principal
          du fil, les actus restent accessibles dans leur rangée et dans le
          menu. La barre s'efface d'elle-même tant que la réponse n'est pas là. */}
      {view.kind === "feed" ? (
        <>
          <StoriesStyles />
          <StoriesTray
            myHandle={myHandle}
            myAvatarUrl={myAvatarUrl}
            now={now}
            onOpen={(handle) => {
              markStoriesOpenedFromApp()
              const base = routes.stories()
              router.push(handle === null ? base : `${base}?${new URLSearchParams({ [STORIES_AUTHOR_PARAM]: handle }).toString()}`)
            }}
            onCreate={onCreateStory}
          />
        </>
      ) : null}
    </>
  )

  /* La bascule Liste/Immersion : toujours visible et nommée, sur le fil et ses
     mots-clés (P04) — absente sans déclaration de l'application. */
  const modeToggle =
    immersion !== null && feedId !== null ? (
      <div className="fil-mode-row">
        <FeedModeToggle state={immersion.mode} onChange={immersion.changeMode} />
      </div>
    ) : null

  /* La TÊTE du fil — bandeaux, composeur, actus, portées, vue en cours. En
     liste, elle précède les pages ; en immersion, elle est le premier créneau
     du lecteur et défile avec lui. Sous la charte (ADR-0028), les actus
     ouvrent la tête, comme sur la maquette. */
  const head = (
    <>
      {charte ? storiesBlock : null}
      {/* Sans profil publié, on n'est ni trouvable ni connectable, et ses
          publications s'affichent sous un nom neutre. Le bureau le dit dans
          `ProfileMiniCard` — cette carte n'est pas montée ici, la phrase
          devait donc trouver sa place, faute de quoi une personne pourrait
          publier des semaines sans jamais l'apprendre. */}
      {onboardingCopy ? (
        <Alert tone="info" title={onboardingCopy.title}>
          <p style={{ margin: settingsHref !== null ? "0 0 10px" : 0 }}>{onboardingCopy.body}</p>
          {settingsHref !== null ? (
            <Button icon="userPlus" size="sm" onClick={() => router.push(settingsHref)}>
              {onboardingCopy.action}
            </Button>
          ) : null}
        </Alert>
      ) : null}

      {/* Une invitation reçue est une action attendue DE MOI : elle ne dort pas
          derrière un volet qu'il faut penser à ouvrir. */}
      {view.kind === "feed" && shouldSurfaceInvitations(pendingCount) ? (
        <Alert tone="info" title={invitationsBannerLabel(pendingCount ?? 0, t)}>
          <Button variant="secondary" size="sm" icon="users" onClick={() => goToTab("relations")}>
            {t("reseauMobileFeed.seeRequests")}
          </Button>
        </Alert>
      ) : null}

      {/* Le déclencheur reste RÉSERVÉ à la vue nue du fil, et c'est désormais
          un choix et non une lacune : la commande « Créer » de la coquille
          couvre tous les autres volets et toutes les vues transitoires (R-02).
          Le poser au-dessus de résultats de recherche n'ajouterait qu'un
          doublon à trente pixels de la commande flottante. */}
      {view.kind === "feed" && !charte ? (
        <button type="button" className="rm-composer-trigger" onClick={onCompose}>
          {/* L'AVATAR à gauche de la phrase — la grammaire du genre : le
              déclencheur parle à la première personne, et c'est le visage qui
              le dit avant le texte. */}
          <Avatar displayName={person?.displayName ?? t("reseauMobileFeed.composerFallbackName")} avatarUrl={myAvatarUrl} size={28} />
          {/* « Partager une information » et non « Quoi de neuf » : le ton
              professionnel de la plateforme (2026-08-20) — même formule que
              le placeholder du composeur bureau. */}
          <span>{firstName === null ? t("reseauMobileFeed.composerPrompt") : t("reseauMobileFeed.composerPromptNamed", { name: firstName })}</span>
        </button>
      ) : null}

      {charte ? null : storiesBlock}

      {/* Les CHIPS de portée. `role="tablist"` serait faux : ce ne sont pas des
          onglets qui montrent des contenus différents, ce sont des FILTRES qui
          recomposent le même fil — d'où `aria-pressed`. La note reste SOUS la
          rangée, jamais dedans : le lecteur d'écran l'entend après les chips,
          pas à leur place. */}
      {showChips ? (
        <div>
          <div className="rm-scopes" role="group" aria-label={t("reseauMobileFeed.scopeLabel")}>
            {FEED_SCOPE_CHIPS.map((chip) => (
              <button key={chip.id} type="button" className="rm-scope-chip" aria-pressed={chip.id === scope} onClick={() => goToScope(chip.id)}>
                {t(chip.labelKey)}
              </button>
            ))}
          </div>
          <p className="rm-scope-note">{t(feedScopeById(scope).descriptionKey)}</p>
        </div>
      ) : null}

      {/* Ce qu'on regarde, quand ce n'est pas le fil entier — et le retour qui
          le lève. L'invariant « toute vue ≠ fil expose un retour » vient de
          `reseau-layout.ts`, où il est testé. */}
      {heading !== null ? (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            flexWrap: "wrap",
          }}
        >
          <span style={{ fontSize: 13, color: "var(--muted-foreground)" }}>
            {view.kind === "search" ? searchStatusText(view.query, search.data?.items.length ?? 0, search.isLoading, t) : heading}
          </span>
          {viewNeedsReturn(view) ? (
            <Button variant="ghost" size="sm" icon="arrowLeft" onClick={backToFeed}>
              {viewReturnLabel(view, t)}
            </Button>
          ) : null}
        </div>
      ) : null}
    </>
  )

  /* La CHAÎNE de pages montées : chacune porte son curseur et son propre
     abonnement, donc les hooks restent hors de toute boucle conditionnelle et
     chaque page garde le temps réel. LA MÊME en liste et en immersion. */
  const feedPages = pages.cursors.map((cursor, index) => (
    <FeedPage
      key={feedCursorKey(cursor)}
      cursor={cursor}
      pageIndex={index}
      pageKey={feedCursorKey(cursor)}
      nextMountedCursor={pages.cursors[index + 1]}
      tag={view.kind === "tag" ? view.tag : undefined}
      scope={scope}
      now={now}
      isFirst={index === 0}
      isLast={index === pages.cursors.length - 1}
      interleaveAfter={index === 0 ? suggestionsInterleaveIndex : null}
      onTag={openTag}
      onMention={openMention}
      onTail={state.reportTail}
      onBoundaryShift={state.rebaseAfterPage}
      emptyFallback={
        <EmptyFeed
          text={emptyFeedText(
            {
              hasConnections: (connections.data ?? []).length > 0,
              hasFollows: (follows.data ?? []).length > 0,
            },
            t,
          )}
        />
      }
    />
  ))

  if (immersion !== null && immersion.immersive) {
    return (
      <FeedSurfaceMemoryProvider value={immersion.surfaceMemory}>
        {/* Une publication par hauteur disponible ; la bascule reste dans la
            barre du lecteur, la tête du fil en est le premier créneau. */}
        <ImmersiveFeedReader
          key={feedId ?? "fil"}
          label={t("immersiveFeed.label")}
          head={head}
          toggle={<FeedModeToggle state={immersion.mode} onChange={immersion.changeMode} />}
          canLoadMore={canLoadMore}
          exhausted={pages.exhausted}
          onLoadMore={loadMore}
          depth={pages.cursors.length}
          restore={immersion.restore}
          onRestored={immersion.onRestored}
          onAnchor={immersion.recordSlotAnchor}
        >
          {feedPages}
        </ImmersiveFeedReader>
        <p role="status" aria-live="polite" className="sr-only">
          {announcement}
        </p>
      </FeedSurfaceMemoryProvider>
    )
  }

  return (
    <FeedSurfaceMemoryProvider value={immersion?.surfaceMemory ?? null}>
      {/* La bascule précède le fil ; sous la charte, elle suit la tête (les
          actus ouvrent l'écran). */}
      {charte ? null : modeToggle}

      {head}

      {charte ? modeToggle : null}

      {view.kind === "post" ? (
        focused.isLoading ? (
          <SkeletonCard />
        ) : focused.data ? (
          <PostCard post={focused.data} now={now} onTag={openTag} onMention={openMention} />
        ) : (
          <p style={{ margin: 0, color: "var(--muted-foreground)" }}>{t("reseauMobileFeed.postUnavailable")}</p>
        )
      ) : view.kind === "search" ? (
        search.isLoading ? (
          <SkeletonCard />
        ) : (search.data?.items ?? []).length === 0 ? (
          <EmptyFeed text={t("reseauMobileFeed.searchEmpty")} />
        ) : (
          (search.data?.items ?? []).map((post) => <PostCard key={post._id} post={post} now={now} onTag={openTag} onMention={openMention} />)
        )
      ) : (
        <>
          {feedPages}

          {shouldShowLoadMore(pages, tailCursor) ? (
            <div>
              <Button
                variant="secondary"
                icon="arrowDown"
                onClick={() => {
                  setPages((current) => appendPage(current, tailCursor))
                  setAnnouncement(loadMoreAnnouncement(20, t))
                }}
              >
                {t("reseauMobileFeed.loadMore")}
              </Button>
            </div>
          ) : null}

          {/* P04 : retrouver la carte lue au retour (profondeur rechargée). */}
          {immersion !== null && feedId !== null ? (
            <FeedListReturn
              restore={immersion.restore}
              onRestored={immersion.onRestored}
              onAnchor={immersion.recordListAnchor}
              canLoadMore={canLoadMore}
              exhausted={pages.exhausted}
              onLoadMore={loadMore}
            />
          ) : null}
        </>
      )}

      {/* Un bouton qui ajoute du contenu SOUS lui ne dit rien à qui ne voit pas
          l'écran. Le focus, lui, reste sur le bouton. */}
      <p role="status" aria-live="polite" className="sr-only">
        {announcement}
      </p>
    </FeedSurfaceMemoryProvider>
  )
}
