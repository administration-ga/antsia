/**
 * Registre FERMÉ des RÈGLES DE PLACEMENT d'une publication (HB-03, issue antsia#96, demande de la
 * session DIASPORA.GA) : une entrée par valeur de `NETWORK_SLICES`. Aucune fonction Convex ici.
 *
 * Point d'extension voisin de `sliceRegistry.ts` (la réconciliation des adhésions), MÊME motif :
 *   - c'est le SEUL fichier du moteur qui importe la règle de placement d'une tranche (une ligne par
 *     tranche) ; `posts/`, `pages/` et `events/` ne connaissent que ce registre et son contrat, par la
 *     garde `posts/placement.ts` : ils n'importent jamais la tranche ;
 *   - `null` est le repli sûr : sans règle, aucune garde de plus — le placement reste celui
 *     d'aujourd'hui (portée parmi celles du réseau, pays ISO, pays exigé par la portée locale) ;
 *   - les tests du moteur remplacent ce module (`vi.mock`) : aucune règle de test n'est jamais
 *     enregistrée ici.
 *
 * Qui appelle la règle, et quand : pour un réseau GOUVERNÉ (`networks.managedBy`) dont la tranche a
 * inscrit une règle, CHAQUE publication dont l'auteur choisit le placement — `posts.publish`
 * (personnelle, de groupe, partage), `pages.publishAsPage`, `events.announce` — quelle que soit sa
 * portée (absente comprise) : la règle laisse passer ce qu'elle ne régit pas. Elle est appelée après
 * l'adhésion, le débit, le rejeu et les droits déjà jugés par le moteur (groupe, partage, signataire,
 * organisateur), après la forme du placement (`assertPostReach`), et AVANT toute écriture : aucun
 * fichier admis, aucune ligne, aucun état de modération quand elle refuse.
 *
 * La tranche diaspora vérifie le pays choisi pour la publication. La flèche diffère l'appel
 * pour laisser les modules du moteur et de la tranche terminer leur initialisation.
 */
import type { NetworkSlice } from "@antsia/social-domain/network"
import type { PostPlacementRefusal } from "@antsia/social-domain/content"

import type { Doc, Id } from "../../_generated/dataModel"
import type { QueryCtx } from "../../_generated/server"
import { diasporaPostPlacement } from "../diaspora/facts"

/** Ce que la règle reçoit : où la publication va, et qui parle. */
export type PostPlacement = {
  /** Le réseau GOUVERNÉ où la publication va s'écrire (celui de la fonction appelée). */
  readonly network: Doc<"networks">
  /** La personne qui publie ; pour une publication de page, le SIGNATAIRE vivant qui dépose. */
  readonly authorPersonId: Id<"persons">
  /** La page au nom de laquelle on publie (signataire vivant déjà vérifié), sinon `null`. */
  readonly page: Doc<"pages"> | null
  /** La portée, déjà jugée contre `network.reachValues` ; `null` quand la publication n'en porte pas. */
  readonly reach: string | null
  /** Le pays, déjà normalisé (ISO 3166-1 alpha-2, majuscules) ; `null` quand la publication n'en porte pas. */
  readonly country: string | null
}

/**
 * La règle de placement d'une tranche : `null` admet, un code de `POST_PLACEMENT_REFUSALS` refuse
 * (levé par le moteur en `invalidArgument` portant `{ rule }`, traduit `rules.<code>`). LECTURE SEULE
 * (le contexte n'offre que la lecture de la base), bornée, déterministe pour un même état.
 */
export type PostPlacementRule = (ctx: Pick<QueryCtx, "db">, placement: PostPlacement) => Promise<PostPlacementRefusal | null>

export type PostPlacementRegistry = { readonly [S in NetworkSlice]: PostPlacementRule | null }

export const POST_PLACEMENT_RULES: PostPlacementRegistry = {
  diaspora: async (_ctx, { country }) => diasporaPostPlacement(country),
}
