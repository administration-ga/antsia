// Dupliqué de socle/packages/agent-features/src/features/reseau-personnel/ProfilPersonnePage.tsx @ ad2e7fdc2 — adaptations : fiche lue DANS le réseau courant (`people.profile.getPublicProfile({ networkId, handle })`, « c'est moi » rendu par le moteur `isMe`, photo et couverture servies par la garde des fichiers, une image retenue retombe sur le repli) ; mur par `posts.posts.personPosts` (réseau, curseur `Id<"posts">`, clé `_id`) et publication ÉPINGLÉE rendue en tête du mur (le moteur la sort de la liste ; « Désépingler » par `posts.posts.unpinMyWall` sur ma fiche) ; relation par `graph.connections.connectionWith` (personne), demande par `requestConnection` et réponse à une invitation reçue sur la fiche même (`respondToConnection`) ; suivi par `graph.follows.{isFollowing, follow, unfollow}` (personne) ; une relation se joint d'ici — « Écrire » ouvre le brouillon iCom (`dockStore.openDraft`, et l'adresse de la messagerie de l'application au téléphone) et « Appeler » passe par `useRingRelation` de la brique d'appel (`calls.direct.callMember`, puis le magasin d'appel : fenêtre sortante, ou écran de refus) ; section professionnelle RETIRÉE (résumé iProfil, « Mon dossier iProfil », `iProfiles.getMyIProfil`) ; « Modifier mon profil » ouvre la gestion de MON profil sur ma fiche (`ProfilReseauSection`, ouverte d'emblée par `?gerer=1`) au lieu des paramètres de l'espace, et un profil que j'ai retiré m'y ramène au lieu du refus ; adresses composées par `useRoutes()` (profil, page réseau, messagerie) — aucune route en dur ; aperçu « vu par les membres du réseau » avec retour sur ma fiche ; textes par l'i18n (`reseau:profilPersonnePage.*`, modules purs appelés avec `t`) ; kit d'espace (onglets, styles) par `@antsia/ui/espace-kit` ; albums par le barrel de leur tranche (`features/reseau-albums`) ; couleurs par fonction (ADR-0027) : Se connecter et Accepter en `social`, Suivre en `social` (neutre une fois suivi), Écrire en `message` tonal, géométrie `RESEAU_ACTION_SHAPE_STYLE`.
"use client"

/**
 * Le PROFIL d'une personne sur le réseau — `useRoutes().profile(handle)`.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * UN SEUL COMPOSANT POUR SOI ET POUR LES AUTRES
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * C'est la propriété qui compte : « voir mon profil comme les autres le
 * voient » n'est pas une option d'affichage à maintenir, c'est la CONSÉQUENCE
 * d'avoir un seul rendu. Deux composants — l'un « vue », l'autre « édition » —
 * divergeraient au premier champ ajouté, et l'on ne saurait plus lequel dit
 * vrai.
 *
 * L'édition n'est donc PAS mêlée à la fiche : sur MA fiche, « Modifier mon
 * profil » ouvre, sous la carte d'identité, la gestion de mon profil
 * (`ProfilReseauSection` : publication, photo, couverture, mode privé,
 * retrait). La fiche montre ; la gestion, repliée par défaut, modifie.
 *
 * ── Ce que cette page ne montre pas, et pourquoi ──────────────────────────
 * Aucun compteur d'abonnés ni de connexions d'autrui. `follows.myFollowerCount`
 * est délibérément limité à soi (« savoir qui suit qui dessine un réseau
 * d'intérêt »). Afficher « 214 abonnés » sur la fiche d'un tiers
 * reconstituerait, une fiche à la fois, exactement ce que cette limite
 * protège. Ne pas l'ajouter « pour faire comme LinkedIn ».
 *
 * ── La COUVERTURE et le MUR (R-10, R-11) ──────────────────────────────────
 * La couverture publiée s'affiche ; le dégradé reste, comme REPLI (sans
 * couverture, ou image retenue par l'analyse). Les classes et le cadrage sont
 * décidés dans `profil-personne.ts` — aucune couleur dans ce fichier (cliquet
 * de charte).
 *
 * Le mur est une CHAÎNE DE PAGES MONTÉES (`ProfilWallPage`, plus bas) : un
 * historique tronqué se lit exactement comme un historique court.
 * Continuation par geste explicite, jamais par défilement infini — cet écran
 * vit sous une barre basse flottante, qu'un fil qui repousse son pied rend
 * inatteignable. La publication ÉPINGLÉE est rendue en tête de la première
 * page : le moteur la sort de la liste pour la rendre à part.
 *
 * ── TROIS ONGLETS et l'APERÇU (R-09, X-07) ────────────────────────────────
 * Publications · Photos · Albums. Les deux derniers rendent la même donnée
 * (`AlbumsSection`, `variant`) sous deux formes, et REMPLACENT le mur au lieu
 * de s'empiler sous lui : ce qui vit sous un fil n'existe pas.
 *
 * `?apercu=1` — poussé par la gestion de mon profil — force `isSelf` à faux
 * pour le RENDU seul. Le paramètre ne part jamais au serveur : mêmes queries,
 * mêmes arguments, mêmes gardes, donc l'aperçu montre exactement ce qu'un
 * membre du réseau verrait. Masquer les cartes une à une aurait laissé passer
 * la suivante.
 *
 * ── Joindre une relation ──────────────────────────────────────────────────
 * « Écrire » et « Appeler » ne s'offrent qu'à une RELATION : le moteur
 * n'ouvre une conversation neuve qu'entre personnes connectées, et l'iCom ne
 * joint que qui l'on connaît. Écrire ouvre un BROUILLON (le fil naît au
 * premier envoi) ; appeler passe par le MAGASIN d'appel, qui monte la fenêtre
 * sortante — jamais un toast à la place.
 *
 * ── Le refus est indistinct, et il l'est jusqu'à l'écran ──────────────────
 * Identifiant inconnu, profil retiré, non-membre, blocage dans un sens ou
 * dans l'autre : le serveur rend `null` et un mur vide, sans les distinguer.
 * L'écran ne les distingue pas davantage — une phrase unique, qui ne dit pas
 * si la personne existe. Seule exception, sans fuite : MON identifiant, quand
 * j'ai retiré mon profil, me ramène à sa gestion pour le republier.
 */

import { COMPACT_SOCIAL_ACTION_STYLE } from "../social-action-style"
import { peopleViewHref } from "./people-panel"
import { api } from "@antsia/api/engine"
import type { Id } from "@antsia/api/engine"
import { useAuthenticatedConvexQuery } from "@antsia/api/hooks"
import { useNetwork, useRoutes } from "@antsia/api/network"
import { useRouter, useSearchParams } from "@antsia/api/routing"
import {
  Alert,
  Badge,
  Button,
  Card,
  Icon,
  SkeletonCard,
} from "@antsia/ui"
import { EspaceDossierTabs, EspaceKitStyles } from "@antsia/ui/espace-kit"
import { useIsReseauMobile } from "@antsia/ui/overlay"
import { useMutation } from "convex/react"
import type { FunctionReturnType } from "convex/server"
import type { TFunction } from "i18next"
import { Suspense, useCallback, useEffect, useMemo, useState } from "react"
import { useTranslation } from "react-i18next"
import { toast } from "sonner"
import { PresenceDot, useConnectionsPresence } from "../iappel/presence-dot"
import { useRingRelation } from "../iappel/useRingRelation"
import { dockStore } from "../messagerie/dock-store"
import { draftKey } from "../messagerie/messagerie-dock"
import { conversationHref } from "../messagerie/messagerie-routes"
// Les albums (tranche voisine) par leur barrel : un import profond d'un
// composant ne résout pas depuis une application hôte.
import {
  ALBUM_NEW_PARAM,
  ALBUM_TAB_ID,
  ALBUM_TAB_PARAM,
  AlbumComposer,
  AlbumsSection,
} from "../reseau-albums"
import { useConnectionRequest } from "./use-connection-request"
import { Avatar } from "./Avatar"
import {
  RESEAU_CARD_STYLE,
  RESEAU_PRIMARY_ACTION_STYLE,
  RESEAU_SECONDARY_ACTION_STYLE,
} from "../../shell/design-styles"
import { reseauAgentHref, reseauAgentTagHref } from "../../shell/reseau-agent-nav"
import { PostCard } from "./PostCard"
import { ProfilFrame } from "./ProfilFrame"
import { ProfilReseauSection } from "./ProfilReseauSection"
import {
  coverBannerClassName,
  coverBannerStyle,
  PROFILE_APERCU_PARAM,
  PROFILE_MANAGE_PARAM,
  profileErrorText,
  wallEmptyText,
  wallErrorText,
  wallLoadMoreLabel,
} from "./profil-personne"
import {
  appendPage,
  feedCursorKey,
  initialFeedPages,
  loadMoreAnnouncement,
  shouldShowLoadMore,
  type FeedCursor,
} from "./reseau-feed-pages"
import {
  etatDeQuery,
  montreElements,
  montreEtatVide,
  montreSquelette,
} from "../../shell/query-state"
import { ReseauQueryError } from "../../shell/ReseauQueryError"
import { badgeLabelKey, signalBadges } from "../../components/identity"

/** La fiche telle que le moteur la rend à un membre du réseau. */
type PublicProfile = NonNullable<
  FunctionReturnType<typeof api.modules.people.profile.getPublicProfile>
>
/** L'état de MA relation avec la personne, tel que le moteur le rend. */
type ConnectionView = FunctionReturnType<
  typeof api.modules.graph.connections.connectionWith
>
/** Une publication du mur, au DTO du fil du moteur. */
type WallPost = FunctionReturnType<
  typeof api.modules.posts.posts.personPosts
>["items"][number]

/** Le curseur d'une page de mur — celui du fil, au champ près. */
type ProfilWallCursor = FeedCursor<Id<"posts">>

/** Ce qu'une page de mur annonce à voix haute : la taille de page du moteur. */
const WALL_PAGE_SIZE = 20

/**
 * Les trois onglets du profil public (R-09).
 *
 * ⚠️ « Photos » et « Albums » rendent la MÊME donnée sous deux formes —
 * mosaïque de couvertures d'un côté, liste d'albums de l'autre — et non deux
 * collections : un mur de photos détaché de son album perdrait le titre qui
 * les explique (`AlbumsSection`, `variant`).
 */
const PROFIL_TABS = [
  { id: "publications", labelKey: "profilPersonnePage.tabs.publications" },
  { id: "photos", labelKey: "profilPersonnePage.tabs.photos" },
  { id: ALBUM_TAB_ID, labelKey: "profilPersonnePage.tabs.albums" },
] as const
type ProfilTab = (typeof PROFIL_TABS)[number]["id"]
const PROFIL_TAB_IDS: readonly string[] = PROFIL_TABS.map((tab) => tab.id)
const PROFIL_PANEL_ID = "pp-panneau"
const PROFIL_TAB_PREFIX = "pp-onglet-"
/** La gestion de MON profil, sous la carte d'identité. */
const MANAGE_PANEL_ID = "pp-gestion"

/** L'onglet demandé par l'adresse — « Publications » dès que c'est inconnu. */
function tabFromParams(params: URLSearchParams): ProfilTab {
  const asked = params.get(ALBUM_TAB_PARAM)
  return asked !== null && PROFIL_TAB_IDS.includes(asked)
    ? (asked as ProfilTab)
    : "publications"
}

/** La gestion de mon profil est-elle demandée par l'adresse ? */
function manageFromParams(params: URLSearchParams): boolean {
  return params.get(PROFILE_MANAGE_PARAM) === "1"
}

export interface ProfilPersonnePageProps {
  handle: string
}

/**
 * `useSearchParams` impose la frontière Suspense : sans elle, la page entière
 * bascule en rendu dynamique.
 */
export function ProfilPersonnePage(props: ProfilPersonnePageProps) {
  const { networkId, personId } = useNetwork()
  return (
    <Suspense fallback={null}>
      <ProfilPersonnePageInner key={`${networkId}:${personId}:${props.handle}`} {...props} />
    </Suspense>
  )
}

function ProfilPersonnePageInner({ handle }: ProfilPersonnePageProps) {
  const { t } = useTranslation("reseau")
  const router = useRouter()
  const routes = useRoutes()
  const { networkId, navigation, navigationLayout, navigationLabels } = useNetwork()
  const adaptive = navigation === "destinations" && navigationLayout === "adaptive"
  const personalHubHref = adaptive ? routes.me?.() : undefined
  const searchParams = useSearchParams()
  /**
   * ⚠️ L'aperçu ne se DEMANDE pas au serveur : `getPublicProfile` rend
   * exactement la même chose, et c'est bien ce qu'on veut prouver. Un
   * paramètre envoyé au serveur ferait de l'aperçu un second chemin de
   * lecture — donc un chemin qui pourrait diverger de celui des membres.
   */
  const apercu = searchParams.get(PROFILE_APERCU_PARAM) === "1"
  /** Un instant FIGÉ : deux cartes du même mur ne doivent pas afficher deux âges. */
  const now = useMemo(() => Date.now(), [])

  const profile = useAuthenticatedConvexQuery(
    api.modules.people.profile.getPublicProfile,
    { networkId, handle },
  )
  /**
   * MA personne (sur soi, sans réseau) — pour une seule décision : un
   * identifiant qui est le mien, dont j'ai retiré le profil, ne mérite pas le
   * refus indistinct, mais le chemin pour republier.
   */
  const mine = useAuthenticatedConvexQuery(
    api.modules.people.persons.getMyPerson,
    {},
  )
  /**
   * Le mur est une CHAÎNE DE PAGES MONTÉES (R-11), pas une query unique : un
   * historique tronqué se lit comme un historique court. Ces trois états
   * vivent AVANT les retours anticipés — un hook ne se déclare pas sous une
   * condition.
   */
  const [pages, setPages] = useState(() =>
    initialFeedPages<ProfilWallCursor>()
  )
  const [tailCursor, setTailCursor] = useState<ProfilWallCursor | null>(null)
  const [announcement, setAnnouncement] = useState("")
  /**
   * L'onglet ouvert, l'intention de composer un album, et la gestion de mon
   * profil.
   *
   * Les trois naissent de l'ADRESSE (« Créer → Album » ou un rappel de profil
   * arrivent d'une autre page, un état de module ne survivrait pas à cette
   * navigation) puis vivent localement : cliquer d'un onglet à l'autre ne
   * réécrit pas l'URL, et revenir en arrière ne rejoue pas l'ouverture.
   */
  const [tab, setTab] = useState<ProfilTab>(() => tabFromParams(searchParams))
  const [composer, setComposer] = useState(
    () =>
      tabFromParams(searchParams) === ALBUM_TAB_ID &&
      searchParams.get(ALBUM_NEW_PARAM) === "1"
  )
  const [manage, setManage] = useState(() => manageFromParams(searchParams))
  /**
   * Passer d'un profil à l'autre REMET la chaîne à une page.
   *
   * La même route réutilise ce composant d'un identifiant à l'autre : sans
   * cette remise à zéro, les curseurs montés pour la personne précédente
   * seraient redemandés POUR LA NOUVELLE — des pages qui ne se suivent pas, et
   * un « Voir plus » qui promet la suite d'un autre mur. Ajustement PENDANT
   * le rendu (patron React officiel), pas dans un effet : un effet rendrait
   * d'abord l'ancienne chaîne sous le nouveau nom.
   */
  const [wallHandle, setWallHandle] = useState(handle)
  if (wallHandle !== handle) {
    setWallHandle(handle)
    setPages(initialFeedPages<ProfilWallCursor>())
    setTailCursor(null)
    setAnnouncement("")
    // Changer de personne referme le composeur et ramène aux publications :
    // un album en préparation appartient à SON profil, pas au suivant.
    setTab(tabFromParams(searchParams))
    setComposer(false)
    setManage(manageFromParams(searchParams))
  }
  const handleTail = useCallback(
    (cursor: ProfilWallCursor | null) => setTailCursor(cursor),
    []
  )
  const handleTag = useCallback(
    // Le fil filtré vit sur la page réseau, qui lit ce paramètre.
    (tag: string) => router.push(reseauAgentTagHref(tag, routes.home())),
    [router, routes]
  )
  const handleMention = useCallback(
    (mentioned: string) => router.push(routes.profile(mentioned)),
    [router, routes]
  )

  /** Est-ce VRAIMENT ma fiche ? (la vérité du moteur, indépendante de l'aperçu) */
  const isMine = profile.data !== undefined && profile.data !== null && profile.data.isMe

  /**
   * Ce que le RENDU croit. En aperçu, `isSelf` est forcé à faux : c'est la
   * seule façon honnête de montrer la fiche d'un tiers — masquer une carte à
   * la main en laisserait passer une autre au premier ajout.
   */
  const isSelf = isMine && !apercu

  /**
   * ⚠️ Ancré sur `isMine`, PAS sur `isSelf` : en aperçu, demander au serveur
   * « quelle est ma relation avec moi-même ? » serait une question qui n'a pas
   * de réponse. Les boutons rendent alors `null` (leur contrat quand l'état
   * est inconnu), ce que le bandeau d'aperçu annonce.
   */
  const otherPersonId =
    profile.data && !isMine ? profile.data.personId : undefined
  // La présence n'est servie qu'aux RELATIONS (contrat serveur) : sur le
  // profil d'un inconnu, `presenceOf` rend null et rien ne s'affiche.
  const { presenceOf } = useConnectionsPresence()

  /**
   * L'état RÉEL de la relation, pas une déduction depuis la liste des
   * connexions : `connectionWith` distingue « demandé par moi » de « demandé
   * par l'autre » et de « refusé ». Sans lui, le bouton « Se connecter »
   * resterait cliquable après envoi et l'écran redemanderait ce qui est déjà
   * demandé.
   */
  const relation = useAuthenticatedConvexQuery(
    api.modules.graph.connections.connectionWith,
    otherPersonId ? { networkId, otherPersonId } : "skip"
  )
  const following = useAuthenticatedConvexQuery(
    api.modules.graph.follows.isFollowing,
    otherPersonId ? { networkId, targetPersonId: otherPersonId } : "skip"
  )

  const profileEtat = etatDeQuery(profile, profile.data ? 1 : 0)

  // La panne AVANT le squelette : sans rien à montrer, la carte d'erreur —
  // jamais un squelette éternel, jamais la phrase du refus.
  if (profile.isError && profile.data === undefined) {
    return (
      <ProfilFrame>
        <ReseauQueryError
          title={t("profilPersonnePage.profileError.title")}
          message={t("profilPersonnePage.profileError.message")}
          onRetry={() => void profile.refetch()}
        />
      </ProfilFrame>
    )
  }

  // Attente réelle — ou session pas encore établie : rien à affirmer.
  if (montreSquelette(profileEtat) || profile.data === undefined) {
    return (
      <ProfilFrame>
        <SkeletonCard />
        <SkeletonCard />
      </ProfilFrame>
    )
  }

  if (profile.data === null) {
    /*
     * MON identifiant, profil retiré : je sais déjà ce qu'il en est, rien ne
     * fuit — la fiche m'offre de le republier plutôt qu'un refus sans issue.
     */
    const myRetiredProfile =
      mine.data !== undefined &&
      mine.data !== null &&
      !mine.data.published &&
      mine.data.handle !== undefined &&
      mine.data.handle === handle.trim().toLowerCase()
    if (myRetiredProfile) {
      return (
        <ProfilFrame>
          <h1 style={{ margin: 0, fontSize: 18, color: "var(--ink-900)" }}>
            {t("profilPersonnePage.retired.title")}
          </h1>
          <ProfilReseauSection />
        </ProfilFrame>
      )
    }
    return (
      <ProfilFrame>
        <Card style={RESEAU_CARD_STYLE}>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <h1 style={{ margin: 0, fontSize: 18, color: "var(--ink-900)" }}>
              {t("profilPersonnePage.refused.title")}
            </h1>
            {/* Une seule phrase pour tous les cas : dire « ce compte est
                désactivé » plutôt que « cet identifiant n'existe pas »
                apprendrait à un curieux ce qui existe. */}
            <p style={{ margin: 0, fontSize: 14, color: "var(--ink-600)" }}>
              {t("profilPersonnePage.refused.message")}
            </p>
            <div>
              <Button
                variant="secondary"
                icon="arrowLeft"
                style={RESEAU_SECONDARY_ACTION_STYLE}
                onClick={() =>
                  router.push(reseauAgentHref("relations", routes.home()))
                }
              >
                {t("profilPersonnePage.refused.back")}
              </Button>
            </div>
          </div>
        </Card>
      </ProfilFrame>
    )
  }

  const person = profile.data
  const coverUrl = person.cover.url
  const wallError = wallErrorText(t)
  const clipsHref = adaptive && navigationLabels?.clips?.trim() ? routes.clips?.(person.handle) : undefined

  return (
    <ProfilFrame>
      <EspaceKitStyles />
      {/* La fiche tenue reste ; une relecture échouée se dit dessus. */}
      {profile.isError ? (
        <ReseauQueryError
          title={t("profilPersonnePage.profileStale.title")}
          message={t("profilPersonnePage.profileStale.message")}
          onRetry={() => void profile.refetch()}
        />
      ) : null}
      {/* L'APERÇU (X-07) : dire qu'on regarde, et par où l'on repart. Sans
          cette sortie, l'aperçu est une impasse dont on ne se déprend qu'en
          retapant une adresse. */}
      {apercu ? (
        <Alert tone="info" title={t("profilPersonnePage.apercu.title")}>
          {t("profilPersonnePage.apercu.message")}
          <div style={{ marginTop: 10 }}>
            <Button
              variant="secondary"
              icon="arrowLeft"
              style={RESEAU_SECONDARY_ACTION_STYLE}
              onClick={() => router.push(routes.profile(person.handle))}
            >
              {t("profilPersonnePage.apercu.back")}
            </Button>
          </div>
        </Alert>
      ) : null}
      <section className="pp-identity" aria-labelledby="pp-nom">
        {/* La couverture PUBLIÉE (R-10). Classes et style viennent du module
            pur `profil-personne.ts` — aucune couleur dans ce TSX. Une image
            retenue par l'analyse n'a pas d'URL : le repli s'affiche. */}
        <div
          aria-hidden="true"
          className={coverBannerClassName(coverUrl)}
          style={coverBannerStyle(coverUrl)}
        />
        <div className="pp-identity-body">
          <div className="pp-avatar">
            <Avatar
              displayName={person.displayName}
              avatarUrl={person.avatar.url}
              size={104}
            />
          </div>

          <div className="pp-name-row">
            <h1 className="pp-name" id="pp-nom">
              {person.displayName}
              {!isSelf && (
                <PresenceDot
                  state={presenceOf(
                    otherPersonId === undefined ? null : String(otherPersonId),
                  )}
                />
              )}
            </h1>
            {isSelf ? (
              <Badge tone="primary" size="sm">
                {t("profilPersonnePage.identity.you")}
              </Badge>
            ) : null}
          </div>
          <p className="pp-handle">@{person.handle}</p>
          {adaptive ? (
            <div className="pp-trust-badges">
              {signalBadges(person).map((badge) => (
                <Badge key={badge} tone="primary" size="sm">{t(badgeLabelKey(badge))}</Badge>
              ))}
            </div>
          ) : null}
          {person.headline ? (
            <p className="pp-headline">{person.headline}</p>
          ) : null}

          <div className="pp-actions">
            {isSelf ? (
              <>
                <Button
                  icon="edit"
                  aria-expanded={manage}
                  aria-controls={MANAGE_PANEL_ID}
                  onClick={() => setManage((open) => !open)}
                  style={RESEAU_PRIMARY_ACTION_STYLE}
                >
                  {t("profilPersonnePage.actions.editProfile")}
                </Button>
                {personalHubHref ? <Button variant="secondary" icon="user" style={RESEAU_SECONDARY_ACTION_STYLE} onClick={() => router.push(personalHubHref)}>{t("antsia:me.title")}</Button> : null}
              </>
            ) : (
              <>
                <ConnectionButton
                  handle={person.handle}
                  view={relation.data}
                />
                <FollowButton
                  handle={person.handle}
                  targetPersonId={person.personId}
                  isFollowing={following.data}
                />
                {relation.data?.state === "connected" ? (
                  <ContactButtons person={person} />
                ) : null}
              </>
            )}
            {clipsHref ? (
              <Button variant="secondary" icon="video" style={RESEAU_SECONDARY_ACTION_STYLE} onClick={() => router.push(clipsHref)}>{navigationLabels?.clips}</Button>
            ) : null}
          </div>

          {isSelf ? (
            <p className="pp-self-note">
              <Icon name="eye" size={12} /> {t("profilPersonnePage.identity.selfNote")}
            </p>
          ) : null}
        </div>
      </section>

      {/* La gestion de MON profil — repliée par défaut, jamais en aperçu : la
          fiche montre, la gestion modifie. */}
      {isSelf && manage ? (
        <section
          id={MANAGE_PANEL_ID}
          aria-labelledby="pp-gestion-titre"
          style={{ display: "flex", flexDirection: "column", gap: 12 }}
        >
          <h2
            id="pp-gestion-titre"
            style={{ margin: 0, fontSize: 16, color: "var(--ink-900)" }}
          >
            {t("profilPersonnePage.manage.title")}
          </h2>
          <ProfilReseauSection />
        </section>
      ) : null}

      {/* Trois onglets, UN panneau (R-09). Le tablist du kit d'espace porte
          déjà les règles ARIA et le clavier : flèches cycliques, Home/End, et
          le focus qui suit la sélection. */}
      <EspaceDossierTabs
        tabs={PROFIL_TABS.map((entry) => ({ id: entry.id, label: t(entry.labelKey) }))}
        current={tab}
        onChange={(id: string) => {
          setTab(id as ProfilTab)
          // Quitter les albums referme le composeur : un brouillon serveur est
          // conservé, mais la surface ne reste pas montée sous un autre onglet.
          if (id !== ALBUM_TAB_ID) setComposer(false)
        }}
        aria-label={t("profilPersonnePage.tabs.label")}
        panelId={PROFIL_PANEL_ID}
        idPrefix={PROFIL_TAB_PREFIX}
      />

      <div
        id={PROFIL_PANEL_ID}
        role="tabpanel"
        aria-labelledby={PROFIL_TAB_PREFIX + tab}
        tabIndex={-1}
        style={{ display: "flex", flexDirection: "column", gap: 16 }}
      >
        {tab === "photos" ? (
          <AlbumsSection handle={handle} isSelf={isSelf} variant="photos" />
        ) : null}

        {tab === ALBUM_TAB_ID ? (
          composer && isSelf ? (
            <AlbumComposer
              handle={handle}
              onCancel={() => setComposer(false)}
              onPublished={() => setComposer(false)}
            />
          ) : (
            <AlbumsSection
              handle={handle}
              isSelf={isSelf}
              onCreate={isSelf ? () => setComposer(true) : undefined}
            />
          )
        ) : null}

        {tab === "publications" ? (
        <section
          aria-labelledby="profil-publications"
          style={{ display: "flex", flexDirection: "column", gap: 16 }}
        >
          <h2
            id="profil-publications"
            style={{ margin: 0, fontSize: 16, color: "var(--ink-900)" }}
          >
            {t("profilPersonnePage.wall.title")}
          </h2>

          {/* Chaque page porte SON abonnement, SON squelette, SA panne et SON
              état vide (`ProfilWallPage`). Le parent ne tient que la chaîne. */}
          {pages.cursors.map((cursor, index) => (
            <ProfilWallPage
              key={feedCursorKey(cursor)}
              handle={handle}
              cursor={cursor}
              now={now}
              isFirst={index === 0}
              isLast={index === pages.cursors.length - 1}
              isSelf={isSelf}
              errorTitle={wallError.title}
              errorMessage={wallError.message}
              onTag={handleTag}
              onMention={handleMention}
              onTail={handleTail}
            />
          ))}

          {/* Un geste EXPLICITE : jamais de chargement automatique sous un pied
              de page flottant (WCAG 2.4.5 et 3.2.5). */}
          {shouldShowLoadMore(pages, tailCursor) ? (
            <div>
              <Button
                variant="secondary"
                icon="arrowDown"
                style={RESEAU_SECONDARY_ACTION_STYLE}
                onClick={() => {
                  setPages((state) => appendPage(state, tailCursor))
                  setAnnouncement(loadMoreAnnouncement(WALL_PAGE_SIZE, t))
                }}
              >
                {wallLoadMoreLabel(t)}
              </Button>
            </div>
          ) : null}
          {/* Ce qu'un bouton qui ajoute du contenu SOUS lui ne dit pas tout seul. */}
          <p role="status" aria-live="polite" className="sr-only">
            {announcement}
          </p>
        </section>
        ) : null}
      </div>
    </ProfilFrame>
  )
}

/**
 * UNE page du mur, avec SON curseur et SON abonnement (R-11).
 *
 * Colocalisée ici, exactement comme `GroupWallPage` l'est dans `GroupsPanel`
 * — et pour la même raison : c'est le seul consommateur, et la branche de
 * panne du MUR (`wall.isError` / `wall.refetch()`) se lit dans CE fichier, là
 * où l'audit R-08 l'a posée.
 *
 * `personPosts` n'est pas une query `paginationOpts`, donc `usePaginatedQuery`
 * ne s'applique pas : une page = un composant = une query. Les hooks restent
 * hors de toute boucle conditionnelle et chaque page garde le temps réel.
 */
function ProfilWallPage({
  handle,
  cursor,
  now,
  isFirst,
  isLast,
  isSelf,
  errorTitle,
  errorMessage,
  onTag,
  onMention,
  onTail,
}: {
  handle: string
  cursor: ProfilWallCursor | null
  now: number
  isFirst: boolean
  isLast: boolean
  isSelf: boolean
  errorTitle: string
  errorMessage: string
  onTag: (tag: string) => void
  onMention: (handle: string) => void
  /** La DERNIÈRE page publie son curseur au parent — elle seule en a un. */
  onTail: (cursor: ProfilWallCursor | null) => void
}) {
  const { t } = useTranslation("reseau")
  const { networkId } = useNetwork()
  const wall = useAuthenticatedConvexQuery(
    api.modules.posts.posts.personPosts,
    { networkId, handle, ...(cursor === null ? {} : { cursor }) }
  )

  const posts = wall.data?.items ?? []
  // L'épinglée n'existe qu'en tête de la PREMIÈRE page : le moteur la sort de
  // la liste et ne la rend qu'à la lecture sans curseur.
  const pinned = isFirst ? (wall.data?.pinned ?? null) : null
  const count = posts.length + (pinned === null ? 0 : 1)
  const nextCursor = wall.data?.nextCursor ?? null
  const wallEtat = etatDeQuery(wall, count)

  /**
   * Dans un EFFET, jamais pendant le rendu : remonter un état au parent
   * pendant qu'on rend est un effet de bord que React n'a aucune obligation
   * de respecter (double rendu du mode strict, rendu abandonné, concurrence).
   */
  useEffect(() => {
    if (!isLast || wall.data === undefined) return
    onTail(nextCursor)
  }, [isLast, wall.data, nextCursor, onTail])

  if (montreSquelette(wallEtat)) {
    return (
      <>
        <SkeletonCard />
        {isFirst ? <SkeletonCard /> : null}
      </>
    )
  }

  // Rien à montrer ET une lecture échouée : le bandeau tient seul la place —
  // jamais un squelette éternel, jamais « rien publié » (R-08).
  if (wall.isError && count === 0) {
    return (
      <ReseauQueryError
        title={errorTitle}
        message={errorMessage}
        onRetry={() => void wall.refetch()}
      />
    )
  }

  if (montreEtatVide(wallEtat, count)) {
    // Seule la PREMIÈRE page prononce « rien » : une page suivante vide est la
    // fin du mur, pas un mur vide.
    return isFirst ? <EmptyWallNote text={wallEmptyText(isSelf, t)} /> : null
  }

  if (!montreElements(wallEtat, count)) return null

  return (
    <>
      {/* Une panne APRÈS données conserve les publications, sous un bandeau. */}
      {wall.isError ? (
        <ReseauQueryError
          title={errorTitle}
          message={errorMessage}
          onRetry={() => void wall.refetch()}
        />
      ) : null}
      {pinned !== null ? (
        <PinnedWallPost
          post={pinned}
          now={now}
          isSelf={isSelf}
          onTag={onTag}
          onMention={onMention}
        />
      ) : null}
      {posts.map((post) => (
        <PostCard
          key={post._id}
          post={post}
          now={now}
          onTag={onTag}
          onMention={onMention}
        />
      ))}
    </>
  )
}

/**
 * La publication ÉPINGLÉE en tête du mur — re-gardée par le serveur, jamais
 * devinée. Sur MA fiche seulement, le geste de la désépingler.
 */
function PinnedWallPost({
  post,
  now,
  isSelf,
  onTag,
  onMention,
}: {
  post: WallPost
  now: number
  isSelf: boolean
  onTag: (tag: string) => void
  onMention: (handle: string) => void
}) {
  const { t } = useTranslation("reseau")
  const { networkId } = useNetwork()
  const unpin = useMutation(api.modules.posts.posts.unpinMyWall)
  const [pending, setPending] = useState(false)

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 8,
        }}
      >
        <p
          style={{
            display: "flex",
            alignItems: "center",
            gap: 6,
            margin: 0,
            fontSize: 12.5,
            fontWeight: 700,
            color: "var(--ink-600)",
          }}
        >
          <Icon name="flag" size={12} /> {t("profilPersonnePage.wall.pinned")}
        </p>
        {isSelf ? (
          <Button
            variant="ghost"
            size="sm"
            disabled={pending}
            style={RESEAU_SECONDARY_ACTION_STYLE}
            onClick={() => {
              setPending(true)
              void unpin({ networkId })
                .then(() => toast.success(t("profilPersonnePage.toast.unpinned")))
                .catch((err: unknown) =>
                  toast.error(
                    profileErrorText(err, "reseau:profilPersonnePage.toast.unpinFailed", t),
                  ),
                )
                .finally(() => setPending(false))
            }}
          >
            {t("profilPersonnePage.wall.unpin")}
          </Button>
        ) : null}
      </div>
      <PostCard post={post} now={now} onTag={onTag} onMention={onMention} />
    </div>
  )
}

/**
 * L'état vide du mur — mise en forme INCHANGÉE (filet pointillé, jetons
 * d'encre) : ce lot déplace la décision, il ne re-skinne rien.
 */
function EmptyWallNote({ text }: { text: string }) {
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

/** Le texte d'un refus de geste, tel qu'on peut le montrer. */
function gestureErrorText(err: unknown, fallback: string, t: TFunction): string {
  return profileErrorText(err, `reseau:profilPersonnePage.toast.${fallback}`, t)
}

/**
 * Le bouton de connexion, dicté par l'ÉTAT du lien — jamais par une devinette.
 *
 * Une invitation REÇUE se traite ici même : le moteur rend la ligne de la
 * demande avec l'état, et répondre depuis la fiche de celui qui invite évite
 * d'aller la chercher dans une autre liste.
 */
function ConnectionButton({
  handle,
  view,
}: {
  handle: string
  /** `undefined` (ou `null`) tant que l'état n'est pas connu : aucun bouton. */
  view: ConnectionView | null | undefined
}) {
  const { t } = useTranslation("reseau")
  const { networkId } = useNetwork()
  const connectionRequest = useConnectionRequest()
  const routes = useRoutes()
  const router = useRouter()
  const respond = useMutation(api.modules.graph.connections.respondToConnection)
  const [pending, setPending] = useState(false)

  if (view === undefined || view === null) return null

  switch (view.state) {
    case "connected":
      return (
        <Button
          variant="secondary"
          icon="userCheck"
          disabled
          style={{ ...RESEAU_SECONDARY_ACTION_STYLE, ...COMPACT_SOCIAL_ACTION_STYLE }}
        >
          {t("profilPersonnePage.connection.connected")}
        </Button>
      )
    case "requested_by_me":
      return (
        <Button
          variant="secondary"
          icon="clock"
          onClick={() => router.push(peopleViewHref("invitations", routes.home()))}
          style={{ ...RESEAU_SECONDARY_ACTION_STYLE, ...COMPACT_SOCIAL_ACTION_STYLE }}
        >
          {t("profilPersonnePage.connection.requested")}
        </Button>
      )
    case "requested_by_them": {
      const connectionId = view.connectionId
      const answer = (accept: boolean) => {
        setPending(true)
        void respond({ networkId, connectionId, accept })
          .then(() =>
            toast.success(
              accept
                ? t("profilPersonnePage.toast.accepted")
                : t("profilPersonnePage.toast.declined"),
            ),
          )
          .catch((err: unknown) =>
            toast.error(gestureErrorText(err, "respondFailed", t)),
          )
          .finally(() => setPending(false))
      }
      return (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 8, width: "100%", maxWidth: 400 }}>
          <Button
            variant="social"
            icon="userCheck"
            disabled={pending}
            style={COMPACT_SOCIAL_ACTION_STYLE}
            onClick={() => answer(true)}
          >
            {t("peopleActions.confirm")}
          </Button>
          <Button
            variant="outline"
            disabled={pending}
            style={COMPACT_SOCIAL_ACTION_STYLE}
            onClick={() => answer(false)}
          >
            {t("profilPersonnePage.connection.decline")}
          </Button>
        </div>
      )
    }
    case "blocked_by_me":
      return (
        <Button
          variant="ghost"
          icon="shieldAlert"
          disabled
          style={{ ...RESEAU_SECONDARY_ACTION_STYLE, ...COMPACT_SOCIAL_ACTION_STYLE }}
        >
          {t("profilPersonnePage.connection.blocked")}
        </Button>
      )
    case "none":
    case "declined":
      // Refusée : une nouvelle demande est légitime (les gens changent d'avis).
      return (
        <Button
          // Se connecter : couleur des relations (ADR-0027).
          variant="social"
          icon="userPlus"
          disabled={pending || connectionRequest.disabled}
          style={COMPACT_SOCIAL_ACTION_STYLE}
          onClick={() => {
            setPending(true)
            void connectionRequest.send({ handle })
              .then((sent) => { if (sent) toast.success(t("profilPersonnePage.toast.requestSent")) })
              .catch((err: unknown) =>
                toast.error(gestureErrorText(err, "requestFailed", t)),
              )
              .finally(() => setPending(false))
          }}
        >
          {connectionRequest.waitLabel ?? (pending
            ? t("profilPersonnePage.connection.sending")
            : t("peopleActions.add"))}
        </Button>
      )
  }
}

/** Suivre n'ouvre QUE le `public` — ne jamais le confondre avec la connexion. */
function FollowButton({
  handle,
  targetPersonId,
  isFollowing,
}: {
  handle: string
  targetPersonId: Id<"persons">
  isFollowing?: boolean
}) {
  const { t } = useTranslation("reseau")
  const { networkId } = useNetwork()
  const follow = useMutation(api.modules.graph.follows.follow)
  const unfollow = useMutation(api.modules.graph.follows.unfollow)
  const [pending, setPending] = useState(false)

  if (isFollowing === undefined) return null

  return (
    <Button
      // Suivre prend la couleur des relations ; une fois suivi, le bouton redevient neutre (ADR-0027).
      variant={isFollowing ? "outline" : "social"}
      icon={isFollowing ? "check" : "plus"}
      disabled={pending}
      style={COMPACT_SOCIAL_ACTION_STYLE}
      onClick={() => {
        setPending(true)
        const action = isFollowing
          ? unfollow({ networkId, targetPersonId })
          : follow({ networkId, handle })
        void action
          .then(() =>
            toast.success(
              isFollowing
                ? t("profilPersonnePage.toast.unfollowed")
                : t("profilPersonnePage.toast.followed"),
            ),
          )
          .catch((err: unknown) =>
            toast.error(gestureErrorText(err, "followFailed", t)),
          )
          .finally(() => setPending(false))
      }}
    >
      {isFollowing
        ? t("profilPersonnePage.follow.following")
        : t("profilPersonnePage.follow.follow")}
    </Button>
  )
}

/**
 * Les deux gestes iCom envers une RELATION : écrire, appeler.
 *
 * ⚠️ « Appeler » passe par `useRingRelation` (`calls.direct.callMember`) puis le MAGASIN d'appel —
 * jamais par un nouveau canal : c'est la coque qui monte la fenêtre sortante
 * dès que le magasin porte l'appel. Un refus n'est pas une panne : le serveur
 * rend `admitted: false` et sa raison, et l'écran de FIN la dit (et laisse
 * déposer un message vocal) au lieu d'un toast qui disparaît.
 *
 * « Écrire » ouvre un BROUILLON par identifiant : le fil naît au premier
 * envoi. Au bureau, la carte iCom de la coque le montre ; au téléphone, la
 * messagerie de l'application s'ouvre sur lui.
 */
function ContactButtons({ person }: { person: PublicProfile }) {
  const { t } = useTranslation("reseau")
  const router = useRouter()
  const routes = useRoutes()
  const isMobile = useIsReseauMobile()
  const { busyHandle, ring } = useRingRelation()

  const write = () => {
    // Le brouillon vit dans le magasin MÊME au téléphone : la frappe doit
    // survivre à un aller-retour, et c'est lui qui la porte.
    dockStore.openDraft(person.handle)
    if (isMobile === true) {
      const href = conversationHref(draftKey(person.handle), routes.messages())
      if (href !== null) router.push(href)
    }
  }


  return (
    <>
      <Button
        // Écrire : bouton tonal, couleur des messages (ADR-0027).
        variant="message"
        icon="messageCircle"
        style={COMPACT_SOCIAL_ACTION_STYLE}
        onClick={write}
      >
        {t("profilPersonnePage.contact.write")}
      </Button>
      <Button
        variant="secondary"
        icon="phone"
        disabled={busyHandle === person.handle}
        aria-label={t("profilPersonnePage.contact.callLabel", {
          name: person.displayName,
        })}
        style={{ ...RESEAU_SECONDARY_ACTION_STYLE, ...COMPACT_SOCIAL_ACTION_STYLE }}
        onClick={() =>
          void ring({
            personId: person.personId,
            handle: person.handle,
            displayName: person.displayName,
            avatarUrl: person.avatar.url,
          })
        }
      >
        {t("profilPersonnePage.contact.call")}
      </Button>
    </>
  )
}
