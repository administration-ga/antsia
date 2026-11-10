// Dupliqué de socle/packages/agent-features/src/features/reseau-personnel/mobile/ReseauMobilePage.tsx @ ad2e7fdc2 — adaptations : déplacé dans la coque (`shell/mobile/`) — le pilote de la page réseau du moteur au téléphone (`useRoutes().home()`) ; volets servis par `servedReseauTab`, Conférences par `DirectsPanel` et création confiée à l’hôte persistant du membre (F3c) ; volet Pages par le `PagesPanel` réécrit sur les pages du moteur ; onglet actif jugé sur la base injectée (`activeReseauTab(pathname, tab, home)`) et vues immersives sur la table des routes (`shouldShowTabBar(pathname, routes)`) ; ma fiche lue sur la personne du moteur (identifiant et profil seulement PUBLIÉS, portrait servi par la garde) — mon profil sur `useRoutes().profile(handle)` au lieu du dossier de l'espace ; gestes de création décidés par le catalogue du moteur sur les routes injectées (`creationLaunchFor(kind, { handle }, useRoutes())`) ; le volet Évènements n'est plus monté avec `onCreateEvent` — l'intention de composition d'iAgenda (absent du moteur) n'existe plus et le catalogue mène l'évènement au volet lui-même : un bouton qui y renverrait tournerait en rond ; actu du fil ouverte en place (`onCreateStory`) ; titre et volet nommés par l'i18n (`reseau:reseauMobilePage.title`, clés du volet) ; « iRéseau » devient « réseau » ; même état partagé (`useReseauFeedState`, un seul appel).
"use client"

/**
 * ReseauMobilePage — le pilote de la page réseau au téléphone.
 *
 * Ce composant est le pendant EXACT de `ReseauAgentPageInner` : mêmes volets,
 * même état (`useReseauFeedState`, un seul appel), mêmes panneaux. Ce qui
 * change tient en une phrase — il n'y a pas de rails, donc pas de grille : les
 * volets se succèdent dans une colonne unique, et ce que les rails portaient
 * est au Menu.
 *
 * ⚠️ Le titre `<h1>` reste ici, en `sr-only`, comme sur le bureau : une page
 * sans `<h1>` prive un lecteur d'écran de son point d'entrée. Le mot « Réseau »
 * VISIBLE de l'en-tête est un `<p>` — deux titres de niveau 1 donneraient deux
 * points d'entrée à une page qui n'en a qu'un.
 *
 * ⚠️ Les volets réels ont chacun leur sous-menu et leur état actif. Le
 * bouton fixe « Menu » reste un niveau distinct : il ouvre les destinations
 * complémentaires sans se faire passer pour un volet. « Créer » n'en est pas
 * un non plus : c'est la commande flottante de la coquille
 * (`ReseauMobileCreateButton`, R-02).
 */

import { useRoutes } from "@antsia/api/network"
import { usePathname, useRouter, useSearchParams } from "@antsia/api/routing"
import { useTranslation } from "react-i18next"

import { SOURCE_AGENT } from "../../features/messagerie/messagerie-source"
import { BookmarksPanel } from "../../features/reseau-personnel/BookmarksPanel"
import { creationLaunchFor, type CreationKind } from "../../features/reseau-personnel/creation-controller"
import { EvenementsPanel } from "../../features/reseau-personnel/EvenementsPanel"
import { GroupsPanel } from "../../features/reseau-personnel/GroupsPanel"
import { PagesPanel } from "../../features/reseau-personnel/PagesPanel"
import { PeoplePanel } from "../../features/reseau-personnel/PeoplePanel"
import { DirectsPanel } from "../../features/direct/DirectsPanel"

import { useCreationController } from "../../features/reseau-personnel/use-creation-controller"
import { useReseauFeedState, type ReseauFeedState } from "../../features/reseau-personnel/useReseauFeedState"
import { StoryCreateSheet } from "../../features/stories/StoryCreateSheet"
import { mainPanelFor, RESEAU_AGENT_TAB_PARAM, reseauAgentTabById, type ReseauAgentMainPanel } from "../reseau-agent-nav"
import { servedReseauTab } from "../reseau-menu"
import { activeReseauTab, shouldShowTabBar } from "./reseau-mobile-tabs"
import { ReseauMobileFeed } from "./ReseauMobileFeed"
import { ReseauMobileHeader } from "./ReseauMobileHeader"
import { ReseauMobileShell } from "./ReseauMobileShell"

export function ReseauMobilePage() {
  const { t } = useTranslation("reseau")
  const state = useReseauFeedState()
  const routes = useRoutes()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const router = useRouter()
  /* Le MÊME contrôleur qu'au bureau : ouvrir une surface de création ne
     touche à aucun état de navigation (R-01). */
  const creation = useCreationController()

  const { tab, searchDraft, myProfile, openSearch } = state
  /* Le volet MONTRÉ : un volet que la page ne sert pas (« Conférences », en
     attente du module `live`) aboutit au fil plutôt qu'à un écran vide. */
  const shownTab = servedReseauTab(tab)
  const main = mainPanelFor(shownTab)
  const currentTab = reseauAgentTabById(shownTab)

  const requested = activeReseauTab(pathname, searchParams.get(RESEAU_AGENT_TAB_PARAM), routes.home())
  const active = requested === null ? null : servedReseauTab(requested)

  /* La pastille de la porte d'iCom (en-tête). MÊME composition que la barre
     d'iCom : tête-à-tête + groupes — un chiffre différent d'une surface à
     l'autre se lirait comme deux boîtes. Le total vient du SERVEUR (IC-06),
     jamais d'une somme de la page chargée. */
  const nonLus = SOURCE_AGENT.useUnreadTotals()
  const unreadMessages = nonLus.total.total

  // Ma fiche : un identifiant n'a d'adresse que PUBLIÉ.
  const person = myProfile.data
  const myHandle = person?.published === true ? (person.handle ?? null) : null

  /**
   * Ce que « Créer » ouvre — ou vers où il emmène.
   *
   * La branche est décidée par `creationLaunchFor` (module pur) : les formats
   * à surface ouvrent EN PLACE, les autres naviguent vers l'adresse que le
   * catalogue décide.
   */
  const startCreation = (kind: CreationKind) => {
    // Le handle décide de l'adresse de l'album : le même contexte que celui
    // qui a fait figurer « Album » dans le catalogue.
    const launch = creationLaunchFor(kind, { handle: myHandle }, routes)
    if (launch.action === "navigate") {
      router.push(launch.href)
      return
    }
    creation.openCreation(launch.kind)
  }

  return (
    <ReseauMobileShell
      active={active}
      showTabBar={shouldShowTabBar(pathname, routes)}
      onCreate={startCreation}
      myHandle={myHandle}
      header={
        <ReseauMobileHeader
          /* La loupe cherche des PUBLICATIONS, et ses résultats sont
             ADRESSABLES : depuis un autre volet, `openSearch` bascule sur le
             fil et pousse `?q=…` — le retour du navigateur ramène au volet
             d'origine (R-06). */
          onSearch={openSearch}
          searchQuery={searchDraft}
          profileHref={myHandle !== null ? routes.profile(myHandle) : null}
          avatarUrl={person?.avatar?.url ?? null}
          displayName={person?.displayName ?? myHandle ?? ""}
          unreadMessages={unreadMessages}
        />
      }
    >
      <h1 className="sr-only">{t("reseauMobilePage.title")}</h1>

      {/* Le volet ouvert se NOMME : sans les languettes du bureau, rien à
          l'écran ne dirait qu'on regarde les relations plutôt que le fil.
          Le fil, lui, est l'accueil — il n'a pas à s'annoncer. */}
      {main !== "feed" ? (
        <div>
          <p
            style={{
              margin: 0,
              fontSize: 16,
              fontWeight: 700,
              color: "var(--foreground)",
            }}
          >
            {t(currentTab.labelKey)}
          </p>
          <p
            style={{
              margin: "4px 0 0",
              fontSize: 12.5,
              lineHeight: 1.5,
              color: "var(--muted-foreground)",
            }}
          >
            {t(currentTab.descriptionKey)}
          </p>
        </div>
      ) : null}

      <ReseauMobileMainPanel
        main={main}
        state={state}
        onCompose={() => creation.openCreation("publication")}
        onCreateStory={() => creation.openCreation("actu")}
      />
      {/* Les surfaces de création, montées UNE fois pour toute la coquille —
          donc atteignables depuis n'importe quel volet, ce que l'arbre mobile
          ne permettait pas (R-02). */}
      <StoryCreateSheet open={creation.open === "actu"} onClose={creation.close} onPublished={creation.close} />

    </ReseauMobileShell>
  )
}

/**
 * Le montage RÉEL des volets mobiles.
 *
 * Un `switch` exhaustif remplace la chaîne de ternaires dont la dernière
 * branche rendait Activité pour toute valeur oubliée. Ajouter un panneau dans
 * `ReseauAgentMainPanel` fait échouer le typecheck tant que son rendu mobile
 * n'est pas décidé.
 *
 * ⚠️ Le panneau d'activité a QUITTÉ ce switch le 2026-09-06 (R-03) : le
 * relevé des notifications est le contenu de la cloche de l'en-tête, jamais
 * un volet.
 */
function ReseauMobileMainPanel({
  main,
  state,
  onCompose,
  onCreateStory,
}: {
  main: ReseauAgentMainPanel
  state: ReseauFeedState
  onCompose: () => void
  onCreateStory: () => void
}) {
  const {
    now,
    setView,
    groupSeed,
    goToTab,
    openTagFromGroups,
    openMention,
    /* R-13 : même contrat qu'au bureau — l'adresse ouvre et referme. */
    openGroup,
    closeGroup,
  } = state

  switch (main) {
    case "feed":
      return <ReseauMobileFeed state={state} onCompose={onCompose} onCreateStory={onCreateStory} />
    case "people":
      return <PeoplePanel />
    case "groups":
      return (
        <GroupsPanel
          key={groupSeed ?? "annuaire"}
          groupId={groupSeed}
          now={now}
          onTag={openTagFromGroups}
          onMention={openMention}
          onOpenGroup={openGroup}
          onBack={closeGroup}
        />
      )
    case "pages":
      return <PagesPanel />
    case "conferences":
      // F3a : mêmes conférences dans les deux coquilles.
      return <DirectsPanel />
    case "events":
      // Sans `onCreateEvent` : le catalogue de création mène l'évènement à ce
      // volet même — un bouton qui y renverrait tournerait en rond.
      return <EvenementsPanel now={now} />
    case "bookmarks":
      return (
        <BookmarksPanel
          now={now}
          onOpenPost={(postId) => {
            goToTab("fil")
            setView({ kind: "post", postId })
          }}
        />
      )
    default:
      return assertNeverMobilePanel(main)
  }
}

function assertNeverMobilePanel(value: never): never {
  throw new Error(`Panneau mobile du réseau non pris en charge : ${String(value)}`)
}
