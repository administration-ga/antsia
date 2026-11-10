/**
 * CC-5 → CC-6 (contrat CONVERSATION-CONTEXTUELLE-V1 §13 ; ADR-0025) — le point d'entrée ÉTROIT
 * des conversations contextuelles, pour une application qui ne veut pas tirer tout le barillet de
 * la messagerie (relais `.ts`, servi par `"./*": "./src/*.ts"` :
 * `@antsia/social-features/features/messagerie/contextual-entry`).
 *
 * Ce qu'une application monte :
 *  · `useContextualMessages(options)` → `MessagesRoute` (prop `contextual`) : filtre « Mises en
 *    relation » et conversation en page, dans les deux navigations ;
 *  · ou directement `ContextualConversationList` / `ContextualConversationView` sur ses propres
 *    écrans (« Mes demandes », « Demandes reçues » avec `pageId`, « Mes mentorats »…) ;
 *  · `conversationHref(contextualConversationKey(fil), base)` pour composer une adresse — y
 *    compris depuis la destination d'une notification `contextualThread` ;
 *  · `CONTEXTUAL_ROUTE_KIND` pour que sa coquille de route accepte `mise-en-relation/<fil>`.
 */
export { ContextualConversationView, type ContextualConversationViewProps } from "./ContextualConversationView"
export { ContextualConversationList, type ContextualConversationListProps } from "./ContextualConversationList"
export { useContextualMessages, type ContextualMessagesOptions } from "./use-contextual-messages"
export {
  CONTEXTUAL_MESSAGING_SOURCE,
  type ContextualMessage,
  type ContextualMessagingSource,
  type ContextualObjectRef,
  type ContextualThread,
  type ContextualThreadId,
} from "./contextual-messaging-source"
export type {
  ContextualAnyObjectRefView,
  ContextualAppRuleDescriber,
  ContextualMessagesInjection,
  ContextualObjectRefView,
  ContextualThreadView,
} from "./contextual-conversation-model"
export { legacyContextualObjectRef } from "./contextual-conversation-model"
export { contextualConversationKey, parseContextualConversationKey } from "./messagerie-dock"
export { CONTEXTUAL_ROUTE_KIND, contextualThreadIdFromPath, conversationHref } from "./messagerie-routes"
export { CONTEXTUAL_CONVERSATION_FILTER } from "./icom-views"
