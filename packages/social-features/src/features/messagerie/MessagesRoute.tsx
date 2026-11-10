// Dupliqué de socle/packages/agent-features/src/features/messagerie/MessagesRoute.tsx @ ad2e7fdc2 — adaptations : seuil mobile par `@antsia/ui/overlay` (`useIsReseauMobile`) ; annonce de chargement traduite (clé `messagesRoute.loading`) ; doc : routes décrites depuis la base injectée de l'application (aucune adresse de l'espace agent), renvoi au chrome de l'espace agent (`personal-chrome.ts`) retiré ; aiguillage inchangé ; CC-5 : conversations contextuelles injectées (`contextual`) — filtre « Mises en relation » transmis aux deux listes, `mise-en-relation/<fil>` rendu en page dans les deux navigations.
"use client"

/**
 * MessagesRoute — l'AIGUILLAGE des pages de la messagerie, et le seul.
 *
 * Les quatre coquilles de route de l'application (liste, conversation, les
 * deux composeurs — sous la base `useRoutes().messages()`) montent toutes CE
 * composant : il rend la page iCom au téléphone et transmet l'intention au
 * téléphone détaché sur ordinateur. Répartir ce choix dans quatre coquilles le
 * ferait diverger.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * TROIS RÉPONSES
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * `useIsReseauMobile()` rend `null` au rendu serveur ET au premier passage
 * client : la largeur n'est pas connue. On rend alors une OSSATURE — jamais
 * l'un des deux arbres. Choisir au serveur ferait échouer l'hydratation, ou
 * pire, la ferait réussir en gardant l'arbre du serveur : un téléphone
 * garderait une présentation prévue pour une autre largeur.
 *
 * ⚠️ La LISTE porte la barre basse d'iCom (`MessagerieListPage`) ; la
 * conversation et les deux composeurs sont immersifs — aucune barre, l'écran
 * entier. Ce composant n'a rien à retirer ni à réserver : il se contente de
 * remplir ce qu'on lui laisse.
 */

import { useNetwork, useNetworkNavigationLayout } from "@antsia/api/network"
import { useTranslation } from "react-i18next"
import { useEffect, type ReactNode } from "react"
import { MessagerieComposePage } from "./MessagerieComposePage"
import { MessagerieConversationPage } from "./MessagerieConversationPage"
import { MessagerieDesktopPage } from "./MessagerieDesktopPage"
import { MessagerieListPage } from "./MessagerieListPage"
import { MessagerieStyles } from "./messagerie-styles"
import { CONTEXTUAL_ROUTE_KIND, parseConversationRoute } from "./messagerie-routes"
import { IcomMessagesPage, type IcomProInjection } from "./IcomMessagesPage"
import type { ContextualMessagesInjection } from "./contextual-conversation-model"
import { parseContextualConversationKey } from "./messagerie-dock"
import { activateListSession, clearListSession } from "./messagerie-list-state"

/** À monter sous la coque de session, jamais dans une coquille de route. */
export function IcomListSessionBoundary() {
	const { networkId, personId, navigation } = useNetwork()
	const owner = JSON.stringify([networkId, personId])
	useEffect(() => {
		if (navigation !== "destinations") return
		activateListSession(owner)
		return () => clearListSession(owner)
	}, [owner, navigation])
	return null
}

export interface MessagesRouteProps {
	/** Le genre d'URL — `chat`, `groupe` ou `a`. Absent sur la liste. */
	kind?: string
	/** L'identifiant, DÉJÀ décodé par la coquille de route. */
	id?: string
	/** L'un des deux composeurs. */
	compose?: "personne" | "groupe"
	commercial?: { renderList: (query: string) => ReactNode; renderConversation: (threadId: string) => ReactNode }
	/**
	 * CC-5 → CC-6 : les conversations CONTEXTUELLES de l'application (`useContextualMessages()`).
	 * Présentes, le filtre « Mises en relation » est offert dans la liste et
	 * `<base>/mise-en-relation/<fil>` (`CONTEXTUAL_ROUTE_KIND`) ouvre la conversation en page,
	 * dans les deux navigations. Absentes, rien de contextuel n'existe ici.
	 */
	contextual?: ContextualMessagesInjection
	/** ADR-0036 : l'espace iCom Pro de l'application ; sous la navigation par destinations seulement. */
	pro?: IcomProInjection
}

export function MessagesRoute({ kind, id, compose, commercial, contextual, pro }: MessagesRouteProps) {
	const { t } = useTranslation("messagerie")
	const { mobile: isMobile } = useNetworkNavigationLayout()
	const { navigation } = useNetwork()
	const conversationKey =
		kind === undefined || id === undefined
			? null
			: parseConversationRoute(kind, id, commercial !== undefined, contextual !== undefined)

	if (isMobile === null) {
		return (
			<>
				<MessagerieStyles />
				<div className="msg-skeleton" aria-hidden="true">
					<span className="msg-skeleton-row" />
					<span className="msg-skeleton-row" />
					<span className="msg-skeleton-row" />
				</div>
				{/* L'ossature est décorative ; la phrase, elle, s'annonce. */}
				<p className="sr-only">{t("messagesRoute.loading")}</p>
			</>
		)
	}

	if (navigation === "destinations") return <IcomMessagesPage conversationKey={conversationKey} compose={compose} isMobile={isMobile} commercial={commercial} contextual={contextual} pro={pro} />
	if (kind === "commerce") return null
	// CC-5 : une conversation contextuelle se rend EN PAGE, au téléphone comme au bureau — le
	// téléphone iCom détaché (dock personnel) ne porte jamais un fil d'une autre famille.
	if (kind === CONTEXTUAL_ROUTE_KIND) {
		const contextualId = conversationKey === null ? null : parseContextualConversationKey(conversationKey)
		if (contextual === undefined || contextualId === null) return null
		return (
			<>
				<MessagerieStyles />
				<div className="msg-panel" data-variant="page" data-fill="screen" data-open="true">
					{contextual.renderConversation(contextualId)}
				</div>
			</>
		)
	}
	if (isMobile) {
		if (compose !== undefined) return <MessagerieComposePage kind={compose} />
		if (conversationKey !== null) {
			return <MessagerieConversationPage conversationKey={conversationKey} />
		}
		return <MessagerieListPage contextual={contextual} />
	}

	// Au bureau, l'adresse reste compatible mais ne rend aucune grande
	// messagerie. Elle ouvre l'unique téléphone iCom, détaché, sur l'accueil.
	return (
		<MessagerieDesktopPage
			conversationKey={conversationKey}
			compose={compose}
		/>
	)
}
