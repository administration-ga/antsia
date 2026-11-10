// Dupliqué de socle/packages/agent-features/src/features/reseau-personnel/profile-visibility-copy.ts @ ad2e7fdc2 — adaptations : RÉÉCRIT sur les règles du moteur (le texte seul ; la forme « trois faits, cinq gestes » est gardée) — les trois faits disent ce que le moteur tient (rien n'est repris du compte de connexion ; un profil n'existe que publié par la personne, visible des membres du réseau ; le reste ne part que par un geste, une image nouvelle pouvant être retenue le temps de son analyse) au lieu du dossier administratif, du profil publié d'office et de la photo de compte ; les cinq gestes décrits sur le moteur (mode privé `people.profile.setMyProfilePrivacy`, retrait `withdrawMyProfile`, sourdine et masquage du fil de ce réseau, blocage `graph.connections.blockPerson` valable dans tous les réseaux), sans poste ni annuaire de poste ; textes par l'i18n (`reseau:profileVisibilityCopy.*`) — les constantes `VISIBILITY_FACTS` et `VISIBILITY_ACTIONS` deviennent `visibilityFacts(t)` et `visibilityActions(t)`, `visibilityAction(id, t)` prend `t` en dernier ; identifiants des faits renommés (`compte_non_repris`, `publication_choisie`, `reste_par_geste`).
/**
 * profile-visibility-copy — ce que le réseau montre de vous, en TROIS faits.
 *
 * Trois écrans qui parlent de visibilité finissent toujours par se contredire
 * quand chacun écrit sa phrase à sa date : ce module porte la copie UNE fois,
 * et les surfaces la lisent (`ProfilReseauSection`, le rattrapage de
 * `profile-onboarding.ts`). Il ne DÉCIDE rien — aucun gating, aucune requête.
 *
 * ── Ce que le moteur tient, et donc ce que la copie peut dire ────────────
 *  · Rien n'est repris du compte de connexion : la personne naît sans
 *    identifiant, sans nom et sans adhésion (`people.persons.ensureMyPerson`),
 *    et rien n'est publié d'office.
 *  · Un profil n'existe que PUBLIÉ par la personne (`publishMyProfile` :
 *    identifiant, nom affiché, accroche), et il ne se lit que depuis un réseau
 *    dont on est membre (`getPublicProfile` est une fonction de réseau).
 *  · Photo et couverture passent par la garde des fichiers : une image neuve
 *    peut être RETENUE (analyse en cours) avant d'être servie.
 *
 * ⚠️ Un écran qui affirme le faux est pire qu'un écran muet : toute évolution
 * ici se vérifie DANS le moteur (`convex/modules/people/profile.ts`,
 * `convex/modules/graph/connections.ts`, `convex/modules/marks/marks.ts`)
 * avant d'être écrite. Aucun superlatif, aucune affirmation d'hébergement
 * (cliquet `public-communication`).
 *
 * Module PUR : `t` en DERNIER paramètre, clés qualifiées
 * (`reseau:profileVisibilityCopy.…`) — n'importe quel `t` les résout.
 */
import type { TFunction } from "i18next"

/** Un fait de visibilité : ce qui est vu, et à quel titre. */
export interface VisibilityFact {
  id: VisibilityFactId
  title: string
  body: string
}

/**
 * Les trois faits, du plus PRIVÉ au plus PUBLIC — l'ordre est la démonstration.
 *
 * On part de ce que personne ne voit (le compte), on nomme ce qui ne part que
 * par la publication, puis ce qui ne part que par un geste. L'inverse ferait
 * lire « publié » en premier et laisserait croire que le compte suit.
 */
export const VISIBILITY_FACT_IDS = [
  "compte_non_repris",
  "publication_choisie",
  "reste_par_geste",
] as const

export type VisibilityFactId = (typeof VISIBILITY_FACT_IDS)[number]

const FACT_KEY: Readonly<Record<VisibilityFactId, string>> = Object.freeze({
  compte_non_repris: "accountNotCopied",
  publication_choisie: "publishedByChoice",
  reste_par_geste: "restByGesture",
})

/** Les trois faits, dans la langue de l'écran. */
export function visibilityFacts(t: TFunction): readonly VisibilityFact[] {
  return VISIBILITY_FACT_IDS.map((id) => ({
    id,
    title: t(`reseau:profileVisibilityCopy.facts.${FACT_KEY[id]}.title`),
    body: t(`reseau:profileVisibilityCopy.facts.${FACT_KEY[id]}.body`),
  }))
}

/** Les cinq gestes de retrait, du plus large au plus ciblé. */
export const VISIBILITY_ACTION_IDS = [
  "hors_connexion",
  "retrait",
  "sourdine",
  "masquer",
  "bloquer",
] as const

export type VisibilityActionId = (typeof VISIBILITY_ACTION_IDS)[number]

/** Un geste : ce qu'il fait, et comment on revient dessus. */
export interface VisibilityAction {
  id: VisibilityActionId
  label: string
  /** Ce que le geste PRODUIT, tout de suite. */
  consequence: string
  /** Ce qu'il laisse intact, et comment on le défait. */
  reversibilite: string
}

const ACTION_KEY: Readonly<Record<VisibilityActionId, string>> = Object.freeze({
  hors_connexion: "offline",
  retrait: "withdraw",
  sourdine: "mute",
  masquer: "hide",
  bloquer: "block",
})

/**
 * Le geste nommé, dans la langue de l'écran — jamais un accès direct qui
 * pourrait rendre `undefined`.
 *
 * ⚠️ « Hors connexion » et « retrait » sont DEUX boutons distincts de
 * `ProfilePublicationCard` (`setMyProfilePrivacy` et `withdrawMyProfile`), et
 * les dire d'une seule voix ferait promettre à l'un ce que seul l'autre fait :
 * le premier vous retire des recherches et des suggestions en laissant le
 * profil en place, le second dépublie le profil lui-même.
 *
 * ⚠️ `bloquer` décrit `graph.connections.blockPerson` du moteur (la paire est
 * fermée dans tous les réseaux, sans annonce, et les abonnements de la paire
 * sont retirés dans les deux sens — D1 du plan 05 ; la lever ne rétablit ni
 * relation ni abonnement). La confirmation du blocage la lit
 * (`person-block.ts`, `BlockPersonDialog`, PF-01) : c'est la phrase que voit
 * la personne AVANT de bloquer, où que le geste lui soit offert.
 */
export function visibilityAction(id: VisibilityActionId, t: TFunction): VisibilityAction {
  const key = ACTION_KEY[id]
  return {
    id,
    label: t(`reseau:profileVisibilityCopy.actions.${key}.label`),
    consequence: t(`reseau:profileVisibilityCopy.actions.${key}.consequence`),
    reversibilite: t(`reseau:profileVisibilityCopy.actions.${key}.reversibility`),
  }
}

/** Les cinq gestes, indexés par leur identifiant. */
export function visibilityActions(t: TFunction): Readonly<Record<VisibilityActionId, VisibilityAction>> {
  return {
    hors_connexion: visibilityAction("hors_connexion", t),
    retrait: visibilityAction("retrait", t),
    sourdine: visibilityAction("sourdine", t),
    masquer: visibilityAction("masquer", t),
    bloquer: visibilityAction("bloquer", t),
  }
}
