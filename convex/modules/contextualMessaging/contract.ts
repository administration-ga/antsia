/**
 * CC-2a (contrat CONVERSATION-CONTEXTUELLE-V1 §10.3 accepté, ADR-0025) — le TYPE du
 * résolveur que fournit une tranche, par nature. AUCUNE fonction, AUCUNE valeur d'exécution :
 * ce fichier est le point d'import STABLE de la tranche DIASPORALE
 * (`convex/modules/diaspora/conversationContexts.ts`), qui n'a ainsi besoin d'aucun interne du
 * moteur. Il ne dépend que des types générés et du domaine pur (cliquet `contextual-registry`).
 *
 * Répartition (§10.4) : la tranche fournit un chargeur EN LECTURE SEULE, sa règle pure
 * « état effectif → phase », sa visibilité propre, le pays du guichet et une règle de texte
 * facultative. Elle ne fournit JAMAIS de liste de personnes ni de droit : adhésion, vivacité,
 * signataires vivants, blocages, politique, débits, fichiers, modération, avis, export et
 * effacement restent au moteur.
 *
 * Obligations du résolveur : lecture seule (aucune écriture, aucun planificateur, aucun avis) ;
 * lectures bornées par index, sans `.collect()` non bornée ; déterminisme (même instantané et
 * même instant, même résultat) ; aucune lecture hors du moteur ; `@diasporale/domain` importé
 * dans la tranche seulement ; tout refus prend la forme `null` (ou `false`), jamais une
 * exception porteuse de raison. Les résolveurs V1 ne lisent ni signataires, ni blocages, ni adhésions.
 * MP09 peut relire les prérequis de sa visibilité professionnelle en db-only ; ces refus propres
 * ne remplacent jamais les gardes communes, relues inconditionnellement par le moteur.
 */
import type { ContextualKind, ContextualLegacyV1Kind, ContextualPhase, ContextualReferenceTable, ContextualSide, ContextualVoice } from "@antsia/social-domain/contextualMessaging"
import type { ActiveMembershipStatus } from "@antsia/social-domain/membership"

import type { Id, TableNames } from "../../_generated/dataModel"
import type { QueryCtx } from "../../_generated/server"

/** Le contexte passé au résolveur : la base, en lecture. Ni stockage, ni planificateur, ni écriture. */
export type ContextualReadCtx = Pick<QueryCtx, "db">

/** La table de l'objet ouvrant d'une nature (intersection : la contrainte des identifiants reste prouvée). */
export type ContextualObjectTable<K extends ContextualKind> = ContextualReferenceTable<K> & TableNames

/** L'identifiant TYPÉ de l'objet ouvrant d'une nature. */
export type ContextualObjectId<K extends ContextualKind> = Id<ContextualObjectTable<K>>

/** Un objet ouvrant d'une nature donnée : sa nature et son identifiant typé. */
export type ContextualObjectRefOf<K extends ContextualKind> = { readonly kind: K; readonly id: ContextualObjectId<K> }

/** Un objet ouvrant, toutes natures admises confondues (union discriminée par `kind`). */
export type ContextualObjectRef = { [K in ContextualKind]: ContextualObjectRefOf<K> }[ContextualKind]

/** Le côté répondant de l'objet : une page (ses signataires vivants, relus par le moteur) ou une personne. */
export type ContextualResponderRef = { readonly pageId: Id<"pages"> } | { readonly personId: Id<"persons"> }

/**
 * L'instantané d'un objet, rendu par le chargeur de la tranche. Il ne dit QUE ce que l'objet est ;
 * il ne dit jamais qui a le droit de lire ou d'écrire.
 */
export type ContextualSnapshot = {
  /** Le réseau de l'objet (un fil n'en change jamais). */
  readonly networkId: Id<"networks">
  readonly requester: { readonly personId: Id<"persons"> }
  readonly responder: ContextualResponderRef
  /** Calculée par la règle pure de la tranche à partir de l'état EFFECTIF (échéances constatées). */
  readonly phase: ContextualPhase
  /** La phase admet des appels, sous accord explicite des deux côtés (D5, CC-4). */
  readonly callsEngaged: boolean
  /** Le demandeur attend le premier mot du répondant (D4). */
  readonly responderFirst: boolean
  /** Pièces admises par côté dans cette phase (§6.2). */
  readonly attachments: { readonly requester: boolean; readonly responder: boolean }
  /** Statut minimal d'écriture par côté, dans le vocabulaire du moteur (le moteur exige au moins `declaree`). */
  readonly writeMinStatus: { readonly requester: ActiveMembershipStatus; readonly responder: ActiveMembershipStatus }
  /** Le pays du guichet de modération (ISO 3166-1 alpha-2), ou `null`. */
  readonly moderationCountry: string | null
}

/** Ce que la règle de texte de la tranche reçoit : le texte NORMALISÉ et le contexte de l'émetteur (D8). */
export type ContextualTextRuleInput<K extends ContextualKind = ContextualKind> = {
  readonly text: string
  readonly kind: K
  readonly side: ContextualSide
  readonly voice: ContextualVoice
}

/**
 * Le verdict de la règle de texte. `code` est un code FERMÉ de la tranche, au format `appRule`
 * (`^[a-z][a-z0-9_]{1,63}$`, par exemple `context_address_forbidden`), traduit par l'application
 * pour la seule partie émettrice ; jamais une phrase, jamais une valeur saisie.
 */
export type ContextualTextRuleResult = { readonly ok: true } | { readonly ok: false; readonly code: string }

/** Le résolveur d'UNE nature. */
export type ContextualResolver<K extends ContextualKind> = {
  readonly kind: K
  /** L'instantané de l'objet, ou `null` (absent, hors d'un réseau de la tranche, illisible). */
  load(ctx: ContextualReadCtx, objectId: ContextualObjectId<K>, now: number): Promise<ContextualSnapshot | null>
  /** La visibilité PROPRE de l'objet pour cette personne (modération de la tranche, page lisible). */
  visibleTo(ctx: ContextualReadCtx, objectId: ContextualObjectId<K>, personId: Id<"persons">, now: number): Promise<boolean>
  /** Règle de texte facultative, PURE, appliquée après la règle neutre du moteur (D8). */
  textRule?(input: ContextualTextRuleInput<K>): ContextualTextRuleResult
}

/** Ce que la tranche exporte (`DIASPORA_CONVERSATION_CONTEXTS`) : une entrée par nature V1. */
export type ContextualResolvers<Kinds extends ContextualKind = ContextualLegacyV1Kind> = { readonly [K in Kinds]: ContextualResolver<K> }
/** Ancien contrat exhaustif conservé sans édition de la tranche DIASPORALE. */
export type ContextualLegacyV1Resolvers = ContextualResolvers<ContextualLegacyV1Kind>
