/**
 * CC-2b (contrat CONVERSATION-CONTEXTUELLE-V1 §10.4, §10.5) — le registre FERMÉ des résolveurs,
 * une entrée par nature admise. C'est le SEUL fichier du moteur autorisé à importer une tranche
 * (cliquet `contextual-registry`).
 *
 * Les trois natures V1 sont branchées sur les résolveurs livrés par la tranche DIASPORALE
 * (CC-3a, `convex/modules/diaspora/conversationContexts.ts`, `DIASPORA_CONVERSATION_CONTEXTS`).
 * MP09 ajoute la collaboration professionnelle via son résolveur propre, sous la même politique fermée.
 * Une entrée enregistrée rend OBLIGATOIRES les crochets de sa nature dans les transitions de la
 * tranche (cliquet `contextual-hooks`).
 *
 * Repli sûr : le type admet `null` pour toute nature dont le résolveur n'est pas encore livré
 * (une nature FUTURE, ajoutée par la procédure fermée du §10.5) ; elle est alors INDISPONIBLE —
 * aucune ouverture, aucune conversation lisible, refus indistinct pour tous — et doit figurer dans
 * `CONTEXTUAL_PENDING_KINDS` (le cliquet le vérifie).
 *
 * Les tests du moteur injectent leur propre registre (module simulé) : aucun résolveur de test
 * n'est jamais enregistré ici.
 */
import type { ContextualKind } from "@antsia/social-domain/contextualMessaging"

import { PROFESSIONAL_CONVERSATION_CONTEXTS } from "../professionals/conversationContexts"
import { DIASPORA_CONVERSATION_CONTEXTS } from "../diaspora/conversationContexts"
import type { ContextualResolver } from "./contract"

export type ContextualRegistry = { readonly [K in ContextualKind]: ContextualResolver<K> | null }

/** Les natures dont le résolveur n'est pas encore livré (repli « nature indisponible ») : aucune en V1. */
export const CONTEXTUAL_PENDING_KINDS: readonly ContextualKind[] = []

export const CONTEXTUAL_REGISTRY: ContextualRegistry = {
  diasporaServiceRequest: DIASPORA_CONVERSATION_CONTEXTS.diasporaServiceRequest,
  diasporaMentoring: DIASPORA_CONVERSATION_CONTEXTS.diasporaMentoring,
  diasporaJobApplication: DIASPORA_CONVERSATION_CONTEXTS.diasporaJobApplication,
  professionalCollaboration: PROFESSIONAL_CONVERSATION_CONTEXTS.professionalCollaboration,
}
