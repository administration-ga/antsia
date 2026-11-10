// Dupliqué de socle/packages/agent-features/src/features/messagerie/MessagerieListPage.tsx @ ad2e7fdc2 — adaptations : barre basse réécrite dans la coque (`shell/mobile/IcomMobileTabBar`, mêmes props `active` et `badges`), toujours rendue sur cette page (seule la liste porte la barre : le garde `shouldShowTabBar` du chrome de l'espace agent, toujours vrai ici, est retiré) ; base de la messagerie INJECTÉE (`useRoutes().messages()`) ; pastille des Statuts sur `stories.stories.tray` du moteur (réseau courant, instant arrondi à la minute ; plus de « surface iCom ») ; titre de page traduit ; doc du chrome de l'espace agent retirée ; CC-5 : conversations contextuelles injectables (`contextual`) — liste « Mises en relation » transmise à la vue Conversations, lignes d'appel contextuel rouvertes par leur conversation. ; IC-02 : pastille des messages vocaux non écoutés sur iAppel (même lecture que le journal, `useVoicemailInbox`).
"use client"

/**
 * MessagerieListPage — iCom au téléphone : la vue LISTE des quatre briques.
 *
 * ⚠️ Cette page N'EST PAS immersive, et c'est délibéré : une liste sans barre
 * d'onglets est un cul-de-sac — on y arrive, on n'en sort qu'en revenant en
 * arrière. La conversation, elle, est immersive : c'est là qu'on veut tout
 * l'écran.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * ENTRER DANS MESSAGES = ENTRER DANS « iCOM-LAND »
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * La barre basse n'est plus celle du réseau : c'est la barre iCom —
 * Menu | iChat | Statuts | iAppel | Relations — le modèle WhatsApp
 * « app dans l'app », transposé du dock du bureau (`icom-dock.ts`). Les
 * briques s'adressent par `?brique=` (`icom-mobile-tabs.ts`). Le retour vers
 * l'accueil du réseau est le PREMIER emplacement fixe de la barre — le
 * cul-de-sac reste conjuré, sans confondre un menu avec les sous-menus d'iCom.
 *
 * Comme le dock : la barre ne se montre qu'en vue LISTE (transposition
 * d'`icomTabsVisible`) — en conversation comme en rédaction, la page est
 * immersive et ne la monte pas. Cette page-ci n'est jamais immersive : elle
 * la rend toujours.
 *
 * ⚠️ **La barre est montée ICI, et il le faut.** Sans ce montage, la page
 * gardait une bande morte en bas, sans un seul lien pour en sortir (constaté
 * au socle en livrant le lot M1). `ReseauMobileStyles` reste montée : la
 * géométrie des onglets (`.rm-tab*`) vit dans cette feuille — sans elle, cinq
 * liens empilés.
 *
 * ⚠️ La barre SEULE, pas une coquille complète : la coquille porte son propre
 * défilement et attend un parent en colonne flex bornée ; ici, c'est la
 * colonne de l'application qui défile. La barre est `fixed` et se cadre sur
 * le viewport.
 *
 * D'où `data-fill="auto"` sur le panneau : la carte ne prend PAS la hauteur
 * visible. C'est la colonne de l'application qui défile, et une hauteur de
 * 100dvh imposée ici poserait la dernière conversation sous la barre
 * d'onglets.
 */

import { api } from "@antsia/api/engine"
import { useAuthenticatedConvexQuery } from "@antsia/api/hooks"
import { useNetwork, useRoutes } from "@antsia/api/network"
import { usePathname, useRouter, useSearchParams } from "@antsia/api/routing"
import { Suspense, useEffect, useState } from "react"
import { useTranslation } from "react-i18next"
import { ReseauMobileStyles } from "../../shell/mobile/mobile-styles"
import { IcomMobileTabBar } from "../../shell/mobile/IcomMobileTabBar"
import { useVoicemailInbox } from "../iappel/use-voicemail-inbox"
import { IcomActusPanel } from "./IcomActusPanel"
import { IcomAppelJournal } from "./IcomAppelJournal"
import { IcomRelationsPanel } from "./IcomRelationsPanel"
import {
	hrefSansInvitationGroupe,
	INVITATION_GROUPE_PARAM,
	lireJetonInvitationGroupe,
} from "./groupe-invitation-link"
import { ICOM_BRIQUE_PARAM, parseIcomBrique } from "./icom-mobile-tabs"
import type { ContextualMessagesInjection } from "./contextual-conversation-model"
import { contextualConversationKey, draftKey, groupeKey } from "./messagerie-dock"
import { MessagerieGroupeInvite } from "./MessagerieGroupeInvite"
import { MessagerieListView } from "./MessagerieListView"
import { conversationHref } from "./messagerie-routes"
import { SOURCE_AGENT } from "./messagerie-source"
import { MessagerieStyles } from "./messagerie-styles"
import { useMessagerieRouterNav } from "./use-messagerie-router-nav"

/** Le pas de l'instant passé au plateau des statuts : une minute. */
const MINUTE_MS = 60_000

/**
 * L'instant, ARRONDI à la minute et stable entre deux rendus : une query ne
 * lit pas l'horloge (le serveur reçoit `now`), et un instant qui change à
 * chaque rendu referait la souscription à chaque rendu. Il avance d'une
 * minute, pas plus souvent.
 */
function useMinuteNow(): number {
	const [now, setNow] = useState(() => Math.floor(Date.now() / MINUTE_MS) * MINUTE_MS)
	useEffect(() => {
		const id = window.setInterval(() => {
			setNow(Math.floor(Date.now() / MINUTE_MS) * MINUTE_MS)
		}, MINUTE_MS)
		return () => window.clearInterval(id)
	}, [])
	return now
}

/**
 * `useSearchParams` impose la frontière Suspense (même règle que le fil).
 *
 * CC-5 : `contextual` (facultatif) — les conversations contextuelles injectées par l'application :
 * leur liste sert le filtre « Mises en relation » de la vue Conversations, et une ligne d'appel
 * contextuel du journal se rouvre par sa conversation (jamais par l'appel personnel).
 */
export function MessagerieListPage({ contextual }: { contextual?: ContextualMessagesInjection } = {}) {
	return (
		<Suspense fallback={null}>
			<MessagerieListPageInner contextual={contextual} />
		</Suspense>
	)
}

function MessagerieListPageInner({ contextual }: { contextual?: ContextualMessagesInjection }) {
	const { t } = useTranslation("messagerie")
	const nav = useMessagerieRouterNav()
	const router = useRouter()
	const pathname = usePathname()
	const searchParams = useSearchParams()
	const { networkId } = useNetwork()
	const liste = useRoutes().messages()
	const now = useMinuteNow()
	const brique = parseIcomBrique(searchParams.get(ICOM_BRIQUE_PARAM))
	const invitationBrute = searchParams.get(INVITATION_GROUPE_PARAM)
	const invitationPresente = invitationBrute !== null
	const invitationToken = lireJetonInvitationGroupe(searchParams.toString())

	// Les DEUX décomptes viennent du serveur, et rien n'est additionné ici
	// (IC-06) : la part « groupes » était encore une somme sur la liste rendue,
	// donc plafonnée à sa fenêtre. `useUnreadTotals` porte le plafond « 99+ »
	// pour les deux familles.
	const nonLus = SOURCE_AGENT.useUnreadTotals()
	const unread = nonLus.total.total

	// La pastille des Statuts : les non-vus du plateau du réseau — jamais
	// additionnés aux messages (deux canaux, deux pastilles).
	const actusTray = useAuthenticatedConvexQuery(api.modules.stories.stories.tray, {
		networkId,
		now,
	})
	const unseenActus = (actusTray.data?.groups ?? []).reduce(
		(sum, group) => sum + group.unseenCount,
		0,
	)
	// IC-02 : la pastille d'iAppel — les messages vocaux non écoutés, troisième
	// canal, jamais additionné aux deux autres.
	const unheardVoicemails = useVoicemailInbox().unreadCount

	return (
		<>
			<MessagerieStyles />
			<h1 className="sr-only">{t("messagerieListPage.title")}</h1>
			<div
				className="msg-panel"
				data-variant="page"
				data-fill="auto"
				data-open="true"
			>
				{invitationPresente ? (
					<MessagerieGroupeInvite
						token={invitationToken}
						onClose={() =>
							router.replace(
								hrefSansInvitationGroupe(pathname, searchParams.toString()),
								{ scroll: false },
							)
						}
						onJoined={(threadId) =>
							router.replace(conversationHref(groupeKey(threadId), liste) ?? liste)
						}
					/>
				) : brique === "ichat" ? (
					<MessagerieListView variant="page" nav={nav} unread={unread} renderContextualList={contextual?.renderList} />
				) : brique === "actus" ? (
					<IcomActusPanel />
				) : (
					<IcomRelationsPanel
						mode={brique === "iappel" ? "appel" : "contact"}
						variant="page"
						/* Le journal n'appartient qu'à iAppel : la brique Relations
						   reste une liste de personnes, sans historique d'appels. */
						journal={
							brique === "iappel"
								? (viewControls) => (
									<IcomAppelJournal
										leadingControls={viewControls}
										onOpenContextualThread={contextual ? (threadId) => nav.openConversation(contextualConversationKey(threadId)) : undefined}
									/>
								)
								: undefined
						}
						/* Écrire ouvre le BROUILLON — la conversation est immersive,
						   le fil naît au premier envoi (même chemin que le dock). */
						onOpenDraft={(handle) => nav.openConversation(draftKey(handle))}
						onOpenGroup={(threadId) =>
							nav.openConversation(groupeKey(threadId))
						}
						onCreateGroup={nav.openComposeGroupe}
					/>
				)}
			</div>

			{/* La géométrie des onglets (`.rm-tab*`) vit dans cette feuille.
			    Sans elle, la barre se rendrait en cinq liens empilés, sans
			    icônes ni pastilles. */}
			<ReseauMobileStyles />
			<IcomMobileTabBar
				active={brique}
				badges={{ unreadMessages: unread, unseenActus, unheardVoicemails }}
			/>
		</>
	)
}
