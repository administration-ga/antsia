// Réécrit d'après socle/packages/agent-features/src/features/messagerie/IcomMobileTabBar.tsx @ ad2e7fdc2 — barre déplacée dans la coque (`shell/mobile/`) ; sans le menu principal de l'espace agent (`EspaceMobileVoletsRow`, volets iProfil · iRéseau · iBoîte · iCom) ni `personal-nav` : le premier emplacement est un LIEN vers l'accueil du réseau (`useRoutes().home()`), là où vivent sa barre et son menu, au lieu de basculer la barre ; seuil mobile `MOBILE_ONLY_CLASS` de `@antsia/ui/overlay` ; adresses des briques composées depuis la base injectée (`useRoutes().messages()`) ; libellés et pastilles traduits (`icomMobileTabText`, `icomMobileBadge`, clés `icomMobileTabBar.*`) ; mêmes props (`active`, `badges`), mêmes repères (`data-mobile-nav`, `data-icom-mobile-nav`) et mêmes classes de géométrie (`.esp-reseau-tabbar`, `.rm-*`).
"use client"

/**
 * IcomMobileTabBar — la barre basse d'iCom au téléphone.
 *
 * Ce composant ne DÉCIDE rien : les cinq emplacements, leurs adresses,
 * l'actif et les pastilles vivent dans `icom-mobile-tabs.ts`, où c'est
 * vérifiable — même partage que la barre du réseau et ses onglets.
 *
 * Sa première place RAMÈNE à l'accueil du réseau : c'est là que vivent la
 * barre du réseau et son menu. Elle ne défile jamais ; les quatre briques
 * défilent à sa droite.
 *
 * ⚠️ MÊME GÉOMÉTRIE que la barre du réseau, au pixel : mêmes classes
 * (`.esp-reseau-tabbar`, `.rm-tab*`), même ancrage `fixed`, même encoche. Les
 * deux barres ne coexistent jamais — elles se REMPLACENT en changeant de page
 * (Fil ⇄ Messages), et une différence de hauteur ou d'ancrage ferait sauter
 * tout le bas de l'écran à chaque bascule.
 *
 * ⚠️ `data-mobile-nav` est le REPÈRE mesuré par les éléments flottants (la
 * pilule d'appel, les fenêtres déplaçables se calent dessus) — l'omettre les
 * ferait retomber sur la barre. `data-icom-mobile-nav` dit LAQUELLE des barres
 * est en place, pour qui a besoin de le savoir.
 *
 * ⚠️ Prérequis de rendu : `ReseauMobileStyles` doit être montée par la page —
 * la géométrie des onglets (`.rm-tab*`) vit dans cette feuille. Sans elle, la
 * barre se rendrait en cinq liens empilés, sans icônes ni pastilles.
 */

import { useNetwork, useRoutes } from "@antsia/api/network"
import { Link } from "@antsia/api/routing"
import { Icon } from "@antsia/ui"
import { MOBILE_ONLY_CLASS } from "@antsia/ui/overlay"
import { useEffect, useRef } from "react"
import { useTranslation } from "react-i18next"
import {
  ICOM_MOBILE_MENU_TAB,
  ICOM_MOBILE_SUBTABS,
  icomMobileBadge,
  icomMobileTabHref,
  icomMobileTabText,
  type IcomMobileBrique,
} from "../../features/messagerie/icom-mobile-tabs"
import { ICOM_VIEWS } from "../../features/messagerie/icom-views"

export interface IcomMobileTabBarProps {
  /** La brique affichée — le retour (`menu_principal`) n'est jamais actif. */
  active: IcomMobileBrique
  badges: { unreadMessages?: number; unseenActus?: number }
}

export function IcomMobileTabBar({ active, badges }: IcomMobileTabBarProps) {
  const { t } = useTranslation("messagerie")
  const routes = useRoutes()
  const { navigation, navigationLayout } = useNetwork()
  const destinations = navigation === "destinations"
  const bases = { home: routes.home(), messages: routes.messages() }
  const subtabsRef = useRef<HTMLDivElement>(null)
  const menu = icomMobileTabText(ICOM_MOBILE_MENU_TAB.id, t)

  /* Un lien profond vers une brique hors champ doit rendre l'actif visible.
     Aucun défilement animé imposé : reduced-motion est respecté par défaut. */
  useEffect(() => {
    subtabsRef.current
      ?.querySelector<HTMLElement>('[aria-current="page"]')
      ?.scrollIntoView({ block: "nearest", inline: "nearest" })
  }, [active])

  // U02 : l'application fournit la navigation globale et les vues iCom
  // restent en tête de liste. Deux barres fixes se recouvriraient.
  if (destinations && navigationLayout === "adaptive") return null

  return (
    <nav
      aria-label={t("icomMobileTabBar.navLabel")}
      data-mobile-nav=""
      data-icom-mobile-nav=""
      className={`fixed right-3 bottom-[calc(0.75rem+env(safe-area-inset-bottom,0px))] left-3 z-40 print:hidden ${MOBILE_ONLY_CLASS}`}
    >
      <div className="esp-reseau-tabbar border backdrop-blur-md">
        <div className="rm-tabbar-row">
          <Link
            href={icomMobileTabHref(ICOM_MOBILE_MENU_TAB.id, bases)}
            className="rm-menu-tab min-h-11 min-w-11"
            aria-label={menu.label}
          >
            <span className="rm-tab-icon">
              <Icon name={ICOM_MOBILE_MENU_TAB.icon} size={20} />
            </span>
            <span className="rm-tab-label">{menu.shortLabel}</span>
          </Link>

          <div
            ref={subtabsRef}
            className="rm-subtabs"
            role="group"
            aria-label={t("icomMobileTabBar.subtabsLabel")}
          >
            {ICOM_MOBILE_SUBTABS.filter((tab) => !destinations || tab.id !== "actus").map((tab) => {
              const badge = icomMobileBadge(tab.id, badges, t)
              const isActive = tab.id === active
              const shortLabel = destinations ? t(ICOM_VIEWS.find((view) => view.brique === tab.id)?.labelKey ?? "icomViews.conversations") : icomMobileTabText(tab.id, t).shortLabel

              return (
                <Link
                  key={tab.id}
                  href={icomMobileTabHref(tab.id, bases)}
                  /* PAS d'`aria-label` : il remplacerait le contenu du lien,
                     donc la phrase de la pastille (même règle que la barre
                     du réseau). Le nom accessible = texte visible + `sr-only`. */
                  aria-current={isActive ? "page" : undefined}
                  className="rm-tab min-h-11 min-w-11"
                >
                  <span className="rm-tab-icon">
                    <Icon name={tab.icon} size={20} />
                    {badge ? (
                      <span className="rm-tab-badge">
                        <span aria-hidden="true">{badge.badge}</span>
                      </span>
                    ) : null}
                  </span>
                  <span className="rm-tab-label">{shortLabel}</span>
                  {badge ? <span className="sr-only">{badge.label}</span> : null}
                </Link>
              )
            })}
          </div>
        </div>
      </div>
    </nav>
  )
}
