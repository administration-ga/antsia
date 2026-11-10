"use client"

import { demoStorageNamespace } from "@/lib/demo-storage"

import { api } from "@antsia/api/engine"
import { useAuthenticatedConvexQuery } from "@antsia/api/hooks"
import { NetworkProvider } from "@antsia/api/network"
import { NextRouterAdapter } from "@antsia/api/routing/next"
import { BRAND_NAME } from "@antsia/social-contracts/brand"
import { CommunicationShell, FeedReturnSessionBoundary, MediaPlaybackProvider } from "@antsia/social-features/shell"
import { IcomListSessionBoundary } from "@antsia/social-features/messagerie"
import { PostHogProvider } from "@antsia/social-features/shell/analytics"
import { useOptionalAppearance } from "@antsia/social-features/shell/appearance"
import { usePathname, useRouter } from "next/navigation"
import { createContext, type ReactNode, useContext, useEffect } from "react"
import { useTranslation } from "react-i18next"

import { CenteredStatus } from "@/components/shared/controls"
import { type SessionState, useSessionState } from "@/components/use-session-state"
import { engineRoutes, routes, shopContactFromLocation, specializedDestinationFromLocation, usageScreenForPath } from "@/lib/routes"
import { NOTIFICATION_REFERENCE_PARAM, parseNotificationReference } from "@/lib/notification-open"
import { usageConfiguration, useUsagePermission } from "./analytics-permission"
import { OfferPostSlot } from "./shops/offer-post-slot"
import { ArticlePostSlot } from "./editorial/article-post-slot"
import { MemberNavigationStyles } from "./member-navigation-styles"
import { SpecializedNavigationBoundary } from "./specialized-navigation"

/**
 * La charte d'origine d'antsia.ga, redéclarée par les surfaces portalisées (dock,
 * appel, stories). Le thème choisi dans Préférences > Thème la remplace (`charte`
 * du fournisseur d'apparence), pour que ces surfaces suivent la page.
 */
const CHARTE = "antsia"

export type MemberSession = Extract<SessionState, { status: "member" }>

const MemberSessionContext = createContext<MemberSession | null>(null)

/** La session de MEMBRE de la page (sous le gabarit des membres) : personne et réseau racine. */
export function useMemberSession(): MemberSession {
  const session = useContext(MemberSessionContext)
  if (!session) throw new Error("useMemberSession : page de membre hors du gabarit `(membre)`.")
  return session
}

/**
 * La COQUE du réseau d'antsia.ga, autour de toute page réservée aux membres :
 * porte d'adhésion (connexion, profil publié, racine rejointe), adaptateur de
 * routage, réseau courant et adresses injectées (`NetworkProvider`), puis la
 * couche de communication montée UNE fois (iCom, appels, présence).
 *
 * `navigation="destinations"` (P02) : antsia.ga choisit les cinq destinations
 * stables (Fil · Découvrir · Créer · Messages · Profil) que la coque du moteur
 * rend au téléphone et au bureau ; `engineRoutes` sert leurs deux adresses
 * propres (`discover`, `me`). Retirer cette prop rend la navigation par volets,
 * à l'identique — c'est le retour arrière. La couche de communication, elle,
 * ne bouge pas : toujours montée ICI, une fois, quelle que soit la navigation.
 * `navigationLayout="adaptive"` (U02) réserve la barre basse aux fenêtres
 * de moins de 768 px, un même rail compact jusqu'à 1199 px puis nommé dès
 * 1200 px. Les autres applications gardent le seuil historique de 960 px.
 *
 * `postPresentation="charte"` (ADR-0028) : antsia.ga reprend à la lettre
 * l'écran des chartes de la série 3 — publication (texte, photo posée dans la
 * carte, rangée d'icônes), carte de suggestion (Suivre, Écrire) en tête du fil
 * au téléphone, évènement annoncé avec Participer et Plus tard, en-tête du
 * téléphone en ronds (recherche, cloche, messages) et fil en liste par défaut,
 * l'Immersion restant offerte. Les médias gardent le ratio réel, la galerie et
 * la visionneuse de la présentation média (P03). `postPresentation="media"`
 * rend la présentation P03 ; retirer la prop rend la carte historique, à
 * l'identique — c'est le retour arrière.
 *
 * `feedPresentation="immersive"` (P04) : antsia.ga propose le fil immersif —
 * une publication par hauteur disponible ; avec la présentation charte,
 * Liste reste le mode initial, le choix étant mémorisé par réseau (sous le
 * préfixe de stockage du réseau, purgé à la déconnexion). Le coordinateur de
 * lecture (`MediaPlaybackProvider`, une vidéo à la fois, suspension pendant un
 * appel ou onglet masqué) et la frontière de la mémoire de retour du fil
 * (`FeedReturnSessionBoundary`) sont montés ICI, une fois, avec la coque.
 * Retirer la prop rend la liste historique ; retirer le fournisseur rend aux
 * vidéos leur comportement P03 — c'est le retour arrière.
 *
 * `storiesPresentation="rings"` et `wordmark` (ADR-0027) : antsia.ga reprend la
 * maquette de la série 3 — la rangée d'actus en médaillons ronds (l'anneau aux
 * trois couleurs du thème, le prénom dessous, « Vous » et son « + » en tête) et
 * sa marque, avec son point, en tête du téléphone. Retirer ces props rend les
 * cartes d'actus et le libellé « Réseau », à l'identique — c'est le retour arrière.
 */
export function NetworkShell({ children }: { children: ReactNode }) {
  const { t, i18n } = useTranslation("antsia")
  const pathname = usePathname()
  const permission = useUsagePermission()
  const router = useRouter()
  const session = useSessionState()
  const appearance = useOptionalAppearance()
  // « Ma boutique » au rail, seulement pour qui gère déjà une boutique : la même liste que /mes-boutiques.
  const myShops = useAuthenticatedConvexQuery(api.modules.shops.shops.myShops, session.status === "member" ? { networkId: session.root._id } : "skip")
  const managesShop = (myShops.data?.items.length ?? 0) > 0

  useEffect(() => {
    // Seule cette porte possède une continuation de push. Elle transporte une
    // référence opaque, jamais l'adresse d'un contenu issue du navigateur.
    const references = pathname === routes.openNotification() ? new URLSearchParams(window.location.search).getAll(NOTIFICATION_REFERENCE_PARAM) : []
    const notification = references.length === 1 ? parseNotificationReference(references[0]) : undefined
    const contact = shopContactFromLocation(pathname, window.location.search)
    const specialized = specializedDestinationFromLocation(pathname, window.location.search)
    if (session.status === "restricted") router.replace(routes.personalControls())
    else if (session.status === "signedOut") router.replace(routes.signIn(undefined, undefined, notification, contact, specialized))
    else if (session.status === "welcome") router.replace(routes.welcome(undefined, notification, contact, specialized))
  }, [session.status, pathname, router])

  if (session.status !== "member") return <CenteredStatus label={t("session.checking")} />

  return (
    <NextRouterAdapter>
      <NetworkProvider networkId={session.root._id} slug={session.root.slug} storageNamespace={demoStorageNamespace()} personId={session.person._id} charte={appearance?.charte ?? CHARTE} routes={engineRoutes} liveAvailable navigation="destinations" navigationLayout="adaptive" icomPro navigationLabels={{ shops: t("marketplace:title"), clips: t("socialExperience:clips"), ...(managesShop ? { myShop: t("shops:nav.myShop") } : {}) }} postPresentation="charte" feedPresentation="immersive" storiesPresentation="rings" wordmark={BRAND_NAME} PostOfferRenderer={OfferPostSlot} PostArticleRenderer={ArticlePostSlot}>
        <MemberSessionContext.Provider value={session}>
          <PostHogProvider configuration={usageConfiguration} consented={!permission.paused && session.person.consentsInForce.includes("usage_analytics")} screen={usageScreenForPath(pathname)} networkSlug={session.root.slug} locale={i18n.resolvedLanguage === "en" ? "en" : "fr"}>
            <MemberNavigationStyles />
            <CommunicationShell />
            <IcomListSessionBoundary />
            <FeedReturnSessionBoundary />
            <MediaPlaybackProvider><SpecializedNavigationBoundary owner={{ networkId: session.root._id, personId: session.person._id }}>{children}</SpecializedNavigationBoundary></MediaPlaybackProvider>
          </PostHogProvider>
        </MemberSessionContext.Provider>
      </NetworkProvider>
    </NextRouterAdapter>
  )
}
