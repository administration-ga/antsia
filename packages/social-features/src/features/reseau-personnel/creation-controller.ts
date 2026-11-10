// Dupliqué de socle/packages/agent-features/src/features/reseau-personnel/creation-controller.ts @ ad2e7fdc2 — adaptations : routes injectées, formats traduits ; évènement dans son volet, album sur le profil ; conférence rétablie en F3a avec son dialogue branché au moteur. ; sept univers (22/10/2026) : « Mon activité » (`activite`) ferme la liste quand l'application sert `myActivity`, et y mène.
/**
 * creation-controller — CE QU'ON PEUT CRÉER dans le réseau, et par quelle surface.
 *
 * Ce qui reste dans le corps d'un composant n'est vérifiable qu'à l'œil : les
 * formats offerts, leurs libellés et la surface que chacun ouvre vivent donc
 * ici, où c'est testé en environnement `node` — le hook voisin
 * (`use-creation-controller.ts`) ne porte plus qu'un booléen. Aucune phrase
 * n'y est écrite : chaque format porte les CLÉS de son libellé et de sa
 * description, que la coque traduit.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * POURQUOI CE MODULE EXISTE (R-01/R-02, audit du 2026-09-06)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * « Publier » ne s'affichait que sur le fil, et seulement sur sa vue nue :
 * `main === "feed" && view.kind === "feed"`. Une recherche, un mot-clic ou une
 * publication ouverte le faisaient DISPARAÎTRE, comme les autres volets.
 * Créer est pourtant un geste du LIEU, pas de la vue : il ne doit donc
 * dépendre ni du volet ouvert, ni de l'état transitoire du fil.
 *
 * ⚠️ **L'entrée « Album » est CONDITIONNELLE, et ce n'est pas un demi-geste.**
 * Un album vit sur le PROFIL PUBLIC de son auteur : sans handle publié, il n'y
 * a pas de profil public, donc pas d'adresse où l'album pourrait aller. On
 * n'offre donc le format qu'à qui peut l'atteindre, et un test le prouve dans
 * les deux sens.
 *
 * ⚠️ **Aucune adresse n'est écrite ici** : l'application les injecte
 * (`useRoutes()`), et seule elle sait ses URL. `creationLaunchFor` reçoit donc
 * la table des routes en dernier paramètre.
 */

import type { IconName } from "@antsia/ui"

import { albumsTabHref } from "../reseau-albums/album-model"
import { buildAgendaCreateHref } from "./agenda-create-intent"
import { personHref } from "./author-link"

/**
 * Les cinq formats que le réseau sert depuis F3a.
 *
 * La conférence ouvre un dialogue en place, comme au socle.
 */
export type CreationKind =
  | "publication"
  | "actu"
  | "evenement"
  | "album"
  | "conference"
  /** « Mon activité » : la gestion de ses boutiques et prestations, quand l'application la sert (`myActivity`). */
  | "activite"

/**
 * Ce que l'appelant sait de la personne — aujourd'hui, son handle de réseau.
 *
 * Le catalogue est PUR : il ne lit aucune query. C'est la coquille qui tient
 * déjà le profil et qui passe ici ce qu'elle en sait.
 */
export interface CreationContext {
  /** Le handle publié de la personne, ou `null` s'il n'a pas de profil public. */
  handle?: string | null
}

/**
 * Les adresses dont un geste de création a besoin — celles de la table des
 * routes de l'application (`useRoutes()`), jamais écrites ici.
 */
export interface CreationRoutes {
  /** La page réseau (le fil et ses volets) : `EngineRoutes.home`. */
  home: () => string
  /** Le profil d'une personne, par son identifiant public : `EngineRoutes.profile`. */
  profile: (handle: string) => string
  /** La gestion de ses activités (« Ma boutique ») : `EngineRoutes.myActivity`, absente sans espace de gestion. */
  myActivity?: () => string
}

/** Un handle utilisable — ni absent, ni vide, ni fait d'espaces. */
function usableHandle(context: CreationContext): string | null {
  const handle = context.handle?.trim()
  return handle !== undefined && handle.length > 0 ? handle : null
}

/**
 * La SURFACE qu'un format ouvre.
 *
 * `events_route` n'est pas une surface en place : l'évènement se compose et
 * se gère depuis le volet Évènements de la page réseau. Le dire ici, plutôt
 * que de le cacher dans un `onClick`, est ce qui le rend testable.
 */
export type CreationSurface =
  | "post_composer"
  | "story_composer"
  | "events_route"
  | "profil_albums_route"
  | "direct_dialog"
  | "activity_route"

/**
 * L'adresse du volet Évènements de la page réseau, carte de création OUVERTE
 * (intention `agenda-create-intent`, consommée une fois par le volet) : « Créer
 * → Évènement » mène à la composition, pas au volet seul où il faudrait cliquer
 * une fois de plus.
 *
 * `home` est la base de la page réseau (`useRoutes().home()`).
 */
export function creationEventHref(home: string): string {
  return buildAgendaCreateHref(null, home)
}

export interface CreationEntry {
  kind: CreationKind
  /** Clé i18n qualifiée du libellé du choix — c'est aussi son nom accessible. */
  labelKey: string
  /** Clé i18n qualifiée de ce que le format produit, en une ligne : un choix ne se devine pas. */
  descriptionKey: string
  /** Nom d'icône `@antsia/ui` — une seule famille dans la carte. */
  icon: IconName
}

/** Les deux clés d'un format, sous `reseau:creationController.entries.<kind>`. */
function entryKeys(kind: CreationKind, icon: IconName): CreationEntry {
  const base = `reseau:creationController.entries.${kind}`
  return { kind, labelKey: `${base}.label`, descriptionKey: `${base}.description`, icon }
}

const ENTRIES: Readonly<Record<CreationKind, CreationEntry>> = Object.freeze({
  publication: entryKeys("publication", "edit"),
  actu: entryKeys("actu", "camera"),
  evenement: entryKeys("evenement", "calendar"),
  album: entryKeys("album", "image"),
  conference: entryKeys("conference", "video"),
  activite: entryKeys("activite", "briefcase"),
})

/**
 * Les formats offerts par la commande « Créer », selon la coquille.
 *
 * ⚠️ Les deux listes DIFFÈRENT, et ce n'est pas un oubli.
 *
 * Au BUREAU, la barre d'identité épinglée porte déjà le geste permanent
 * « Publier », et les deux autres formats ont leur propre porte à l'endroit où
 * ils ont du sens : la vignette « Créer » de la rangée des actus, et le volet
 * Évènements. Deux portes pour une seule carte, à trente pixels d'écart, se
 * lisent comme deux objets différents.
 *
 * Au TÉLÉPHONE il n'y a NI barre d'identité, NI rangée d'actus hors du fil :
 * la commande flottante est la seule porte, elle porte donc les trois.
 *
 * L'ALBUM s'ajoute aux DEUX listes — et seulement quand un handle est connu.
 * Contrairement à l'actu et à l'évènement, il n'a aucune autre porte : ni
 * vignette dans une rangée, ni volet à lui. Sans cette entrée, le format ne
 * serait atteignable que par qui pense à ouvrir son propre profil.
 */
export function creationEntries(
  options: { mobile?: boolean; activity?: boolean } & CreationContext = {}
): CreationEntry[] {
  const kinds: CreationKind[] = options.mobile
    ? ["publication", "actu", "evenement", "conference"]
    : ["publication", "conference"]
  if (usableHandle(options) !== null) kinds.push("album")
  // « Mon activité » ferme la liste, aux deux formats, quand l'application sert la gestion des activités (étude des sept univers, § 12).
  if (options.activity === true) kinds.push("activite")
  return kinds.map((kind) => ENTRIES[kind])
}

/** La fiche d'un format — utile pour nommer un geste hors de la carte. */
export function creationEntry(kind: CreationKind): CreationEntry {
  return ENTRIES[kind]
}

export function creationSurfaceFor(kind: CreationKind): CreationSurface {
  switch (kind) {
    case "publication":
      return "post_composer"
    case "actu":
      return "story_composer"
    case "evenement":
      return "events_route"
    case "album":
      return "profil_albums_route"
    case "conference":
      return "direct_dialog"
    case "activite":
      return "activity_route"
  }
}

/**
 * Ce que fait un choix : ouvrir une surface EN PLACE, ou naviguer.
 *
 * Décidé ici plutôt que dans le `onClick` de la carte : c'est la seule
 * branche du geste, et la laisser dans un composant la rendrait invérifiable.
 */
export type CreationLaunch =
  | { action: "surface"; kind: CreationKind }
  | { action: "navigate"; href: string }

/**
 * ⚠️ L'union reste à DEUX branches, volontairement : les deux coquilles
 * (`ReseauAgentPage`, `mobile/ReseauMobilePage`) déduisent `launch.kind` de
 * `action !== "navigate"`. Une troisième variante « indisponible » les
 * casserait au typage — et un format indisponible n'a de toute façon pas à
 * figurer dans le catalogue.
 *
 * Sans handle, « Album » n'est pas offert (`creationEntries`) ; si un appelant
 * le demande quand même, il est renvoyé vers la page réseau, où l'invitation à
 * publier son profil s'affiche — jamais vers une adresse d'album qui n'existe
 * pas.
 */
export function creationLaunchFor(
  kind: CreationKind,
  context: CreationContext,
  routes: CreationRoutes
): CreationLaunch {
  if (kind === "activite") return { action: "navigate", href: routes.myActivity?.() ?? routes.home() }
  if (kind === "album") {
    const handle = usableHandle(context)
    return {
      action: "navigate",
      href:
        handle === null
          ? routes.home()
          : albumsTabHref(personHref(handle, routes.profile), { create: true }),
    }
  }
  return creationSurfaceFor(kind) === "events_route"
    ? { action: "navigate", href: creationEventHref(routes.home()) }
    : { action: "surface", kind }
}
