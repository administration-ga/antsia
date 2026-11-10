"use client"

/**
 * CC-5 → CC-6 (contrat CONVERSATION-CONTEXTUELLE-V1 §10.4, §11.3, §13 ; ADR-0025) — le POINT
 * D'INJECTION des conversations contextuelles dans la messagerie d'une application.
 *
 * Même forme que le canal P10 d'ANTSIA (`commercial`) : l'application passe le résultat à
 * `MessagesRoute` (prop `contextual`), qui le transmet à `IcomMessagesPage` (navigation par
 * destinations) ou le sert lui-même (navigation par volets) :
 *
 *     const contextual = useContextualMessages({ describeAppRule, onOpenObject })
 *     <MessagesRoute {...route} contextual={contextual} />
 *
 *  · le filtre « Mises en relation » apparaît dans la vue Conversations et rend
 *    `ContextualConversationList` (mes fils, ou ceux d'une page avec `pageId`) ;
 *  · `<base>/mise-en-relation/<fil>` ouvre `ContextualConversationView` en page (le dock
 *    personnel ne les porte jamais : aucune clé n'est convertie d'une famille à l'autre).
 *
 * Aucune adresse n'est écrite ici : la base vient de l'application (`useRoutes().messages()`),
 * la conversation s'adresse par `conversationHref(contextualConversationKey(id), base)` — la même
 * fabrique qu'une destination de notification `contextualThread` peut employer.
 *
 * ⚠️ Passer des gestes STABLES (`useCallback`) : l'injection se recompose quand ils changent.
 */
import type { Id } from "@antsia/api/engine"
import { useRoutes } from "@antsia/api/network"
import { usePathname, useRouter } from "@antsia/api/routing"
import type { ContextualKind } from "@antsia/social-domain/contextualMessaging"
import { useMemo } from "react"

import type { ContextualAnyObjectRefView, ContextualAppRuleDescriber, ContextualMessagesInjection, ContextualObjectRefView, ContextualThreadView } from "./contextual-conversation-model"
import { ContextualConversationList } from "./ContextualConversationList"
import { ContextualConversationView } from "./ContextualConversationView"
import { contextualConversationKey } from "./messagerie-dock"
import { contextualThreadIdFromPath, conversationHref } from "./messagerie-routes"

export interface ContextualMessagesOptions {
  /** Les fils d'une PAGE dont la personne est signataire vivant, plutôt que les siens. */
  pageId?: Id<"pages"> | null
  /** Une seule nature dans la liste ; absente, toutes. */
  kind?: ContextualKind
  /** Traduire un code fermé de la tranche (`appRule`) depuis l'espace de noms de l'application. */
  describeAppRule?: ContextualAppRuleDescriber
  /** Où en est l'objet, dans les mots de l'application ; `null` quand elle ne le sait pas. */
  describeObject?: (thread: ContextualThreadView) => string | null
  /** Ouvrir l'écran de l'objet depuis la conversation (contrat V1 : trois natures). */
  onOpenObject?: (object: ContextualObjectRefView) => void
  /** Ouvrir un objet de toute nature, collaboration professionnelle comprise ; prioritaire sur `onOpenObject`. */
  onOpenContextualObject?: (object: ContextualAnyObjectRefView) => void
}

export function useContextualMessages(options: ContextualMessagesOptions = {}): ContextualMessagesInjection {
  const router = useRouter()
  const pathname = usePathname()
  const base = useRoutes().messages()
  const activeThreadId = contextualThreadIdFromPath(pathname, base)
  const { pageId = null, kind, describeAppRule, describeObject, onOpenObject, onOpenContextualObject } = options
  return useMemo<ContextualMessagesInjection>(() => ({
    renderList: (query) => (
      <ContextualConversationList
        query={query}
        pageId={pageId}
        kind={kind}
        activeThreadId={activeThreadId}
        onOpen={(threadId) => router.push(conversationHref(contextualConversationKey(threadId), base) ?? base, { scroll: false })}
      />
    ),
    renderConversation: (threadId) => (
      <ContextualConversationView
        threadId={threadId}
        onBack={() => router.push(base, { scroll: false })}
        describeAppRule={describeAppRule}
        describeObject={describeObject}
        onOpenObject={onOpenObject}
        onOpenContextualObject={onOpenContextualObject}
      />
    ),
  }), [router, base, activeThreadId, pageId, kind, describeAppRule, describeObject, onOpenObject, onOpenContextualObject])
}
