"use client"

/**
 * IcomDockTabBar — la barre des briques de la carte iCom du bureau, EN BAS (modèle WhatsApp).
 *
 * Sortie de `MessagerieDock.tsx` (CH-817) pour être rendue et testée seule ; la carte décide
 * QUAND elle se montre (`icomTabsVisible`, vue liste seulement) et ce que fait un choix (ouvrir
 * la brique, déplier la carte). Ici : QUELLES briques se montrent, et comment elles se disent.
 *
 *  - CH-817 : une application qui ne propose pas d'appel (`useCallsAvailable()`) ne montre pas
 *    iAppel — la couche qui REÇOIT un appel reste montée ailleurs, rien ne change pour elle ;
 *  - sous la navigation par destinations (ANTSIA), les Statuts n'y sont pas, et chaque brique
 *    porte le nom de sa vue (`ICOM_VIEWS`) ;
 *  - IC-02 : iAppel porte la pastille des messages vocaux non écoutés, avec sa phrase.
 *
 * Mêmes classes que la carte (`.icom-tabs`, `.icom-tab*`, feuille `messagerie-styles`).
 */
import { useCallsAvailable, useNetwork } from "@antsia/api/network"
import { Camera, MessageCircle, Phone, Users } from "lucide-react"
import { useTranslation } from "react-i18next"

import { visibleIcomDockTabs, type IcomDockTabId } from "./icom-dock"
import type { IcomTabBadge } from "./icom-mobile-tabs"
import { ICOM_VIEWS } from "./icom-views"

/**
 * L'icône de chaque brique — modèle WhatsApp : la barre de navigation est
 * BASSE, à icônes, et le nom du module ne s'écrit nulle part — un module
 * composé ne s'écrit pas, il se compose.
 */
const TAB_ICONS: Record<IcomDockTabId, typeof MessageCircle> = {
	ichat: MessageCircle,
	actus: Camera,
	iappel: Phone,
	icontact: Users,
}

export interface IcomDockTabBarProps {
	/** La brique servie (déjà ramenée sur iChat si elle n'est pas montrée). */
	activeTab: IcomDockTabId
	/** IC-02 : la pastille des messages vocaux non écoutés, portée par iAppel. */
	voicemailBadge: IcomTabBadge | null
	/** Le choix d'une brique — la carte l'ouvre et se déplie. */
	onSelect: (tab: IcomDockTabId) => void
}

export function IcomDockTabBar({ activeTab, voicemailBadge, onSelect }: IcomDockTabBarProps) {
	const { t } = useTranslation("messagerie")
	const { navigation } = useNetwork()
	const destinations = navigation === "destinations"
	const callsAvailable = useCallsAvailable()

	return (
		<div className="icom-tabs" role="tablist" aria-label={t("messagerieDock.title")}>
			{visibleIcomDockTabs({ callsAvailable, destinations }).map((item) => {
				const Icon = TAB_ICONS[item.id]
				const badge = item.id === "iappel" ? voicemailBadge : null
				return (
					<button
						key={item.id}
						type="button"
						role="tab"
						className="icom-tab"
						aria-selected={activeTab === item.id}
						title={t(item.descriptionKey)}
						onClick={() => onSelect(item.id)}
					>
						<span aria-hidden="true" className="icom-tab-icon">
							<Icon size={17} />
							{badge !== null ? <span className="msg-badge icom-tab-badge">{badge.badge}</span> : null}
						</span>
						{t(destinations ? ICOM_VIEWS.find((view) => view.brique === item.id)?.labelKey ?? item.labelKey : item.labelKey)}
						{badge !== null ? <span className="sr-only">{badge.label}</span> : null}
					</button>
				)
			})}
		</div>
	)
}
