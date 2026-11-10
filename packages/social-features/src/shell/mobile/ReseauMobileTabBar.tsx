// Dupliqué de socle/packages/agent-features/src/features/reseau-personnel/mobile/ReseauMobileTabBar.tsx @ ad2e7fdc2 — adaptations : sans la coque de l'espace agent (`espace-mobile-volets`, `espace-mobile-volets-row`, `personal-nav` retirés) — le bouton fixe « Menu » OUVRE le menu principal du réseau (`ReseauMobileMenuSheet`, feuille du bas) au lieu de remplacer les sous-menus par les volets de l'espace ; seuil mobile par `MOBILE_ONLY_CLASS` (`@antsia/ui/overlay`) ; adresses des volets composées sur la base injectée (`reseauTabHref(id, useRoutes().home())`) ; volets SERVIS seuls (`isServedReseauTab` : « Conférences » attend le module `live`) ; libellés par l'i18n (`reseau:reseauMobileTabBar.*`, libellé court du volet par sa clé) ; « iRéseau » devient « réseau » ; mêmes props (`active`, `badges`), mêmes repères (`data-mobile-nav`, `data-reseau-mobile-nav`) et mêmes classes de géométrie (`.esp-reseau-tabbar`, `.rm-*`) ; P02 (18/10/2026) : quand l'APPLICATION déclare la navigation par destinations (`useNetwork().navigation`), la barre rend les cinq destinations Fil · Découvrir · Créer · Messages · Profil (même ancrage, même encoche, mêmes repères) — sinon la barre historique, inchangée ; système épuré (ADR-0027) : onglet actif en pastille tonale (`--esp-tab-active-*`), pastille de décompte aux couleurs des réactions (`--role-react-*`), « Créer » en carré arrondi plein de 48 px à l'ombre colorée, simple « + », libellé en `sr-only` (`--esp-fab-*`), valeurs d'origine en repli ; étude du 22/10/2026 : barre des destinations en verre (flou et saturation), 52 px, icônes seules (libellés en `sr-only`), « Créer » de 40 px.
"use client"

/**
 * ReseauMobileTabBar — la barre basse du réseau.
 *
 * Ce composant ne DÉCIDE rien : combien d'onglets, lesquels, où ils mènent,
 * lequel est actif et qui porte une pastille vivent dans `reseau-mobile-tabs.ts`,
 * où c'est vérifiable. Il ne porte que le rendu.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * MENU FIXE · SOUS-MENUS RÉELS
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * « Menu » occupe une largeur fixe et ne participe jamais au défilement : il
 * ouvre le menu principal du réseau (statuts, profil, réglages). Les volets
 * réels de la page défilent à sa droite, avec une séparation visuelle et
 * sémantique entre les deux niveaux de navigation.
 *
 * ⚠️ Même géométrie que la barre d'iCom, au pixel : `fixed`, gouttière de
 * 12 px, encoche ajoutée en bas, masquée à partir de 960 px. Ce n'est pas de
 * la coquetterie : les deux barres ne coexistent JAMAIS, mais elles se
 * remplacent l'une l'autre en changeant de page — une différence de hauteur
 * ou d'ancrage ferait sauter tout le bas de l'écran à chaque navigation.
 *
 * ⚠️ `data-mobile-nav` est un REPÈRE lu par les éléments flottants qui doivent
 * se tenir au-dessus d'elle (`use-surface-insets` la MESURE plutôt que de
 * recopier sa hauteur). L'omettre les ferait retomber dessus.
 * `data-reseau-mobile-nav` distingue laquelle des barres est en place, pour
 * qui a besoin de le savoir.
 *
 * ⚠️ La charte décide de l'habillage, pas ce fichier : `.esp-reseau-tabbar`
 * porte fond, filet, relief et rayon, et ne déclare aucune couleur ici.
 */

import { useNetwork, useRoutes } from "@antsia/api/network"
import { Link, usePathname, useSearchParams } from "@antsia/api/routing"
import { Icon, type IconName } from "@antsia/ui"
import { cn } from "@antsia/ui/lib/cn"
import { MOBILE_ONLY_CLASS } from "@antsia/ui/overlay"
import { Plus } from "lucide-react"
import { type ReactNode, useEffect, useRef, useState } from "react"
import { useTranslation } from "react-i18next"

import type { CreationKind } from "../../features/reseau-personnel/creation-controller"
import { formatUnreadBadge } from "../../features/reseau-personnel/shared"
import { isServedReseauTab } from "../reseau-menu"
import {
  activeReseauDestination,
  ariaCurrentFor,
  reseauCreationChoices,
  reseauDestinations,
  type ReseauDestinationMatch,
  type ReseauDestinationRoutes,
} from "../reseau-menu-destinations"
import { RESEAU_DESTINATION_ICONS, useMessagesUnreadTotal, useReseauDestinationRoutes } from "../reseau-menu-destinations-ui"
import { CreationChoiceCard, useChoiceTrigger } from "./ReseauMobileCreateButton"
import { ReseauMobileMenuSheet } from "./ReseauMobileMenuSheet"
import { RESEAU_MOBILE_TABS, reseauTabHref, tabBadge, type ReseauMobileTabId } from "./reseau-mobile-tabs"

export interface ReseauMobileTabBarProps {
  active: ReseauMobileTabId | null
  badges: { unreadNotifications?: number }
  /**
   * Navigation par destinations seulement : le format à SURFACE choisi dans
   * « Créer » (publication, actu, conférence) — l'hôte l'ouvre en place. Les
   * formats qui naviguent (évènement, album) sont des liens de la carte.
   * Absent, « Créer » n'offre que ces derniers.
   */
  onCreate?: (kind: CreationKind) => void
  /** Navigation par destinations seulement : l'identifiant PUBLIÉ (album, profil courant). */
  handle?: string | null
  /**
   * Navigation par destinations seulement : la destination courante quand
   * l'application la connaît mieux que la coque (une page qu'elle seule sait
   * ranger) — `undefined` la laisse déduire de l'adresse, `null` n'en allume
   * aucune.
   */
  current?: ReseauDestinationMatch | null
}

/**
 * La barre basse : les cinq destinations quand l'application les déclare,
 * la barre historique (« Menu » + volets) sinon. Deux composants frères, et
 * non deux branches d'un même corps : chacun garde ses propres hooks.
 */
export function ReseauMobileTabBar(props: ReseauMobileTabBarProps) {
  const destinations = useReseauDestinationRoutes()
  return destinations !== null ? <DestinationsTabBar {...props} routes={destinations} /> : <VoletsTabBar {...props} />
}

/** La facture d'une destination de la barre — lien ou bouton, même cible. */
const DESTINATION_ITEM_CLASS =
  "flex h-full w-full min-w-0 flex-col items-center justify-center gap-0.5 rounded-xl px-0.5 text-muted-foreground no-underline hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"

/**
 * La barre des CINQ destinations (navigation par destinations, P02).
 *
 * ⚠️ Même ancrage que la barre historique, au pixel — `fixed`, gouttière de
 * 12 px, encoche ajoutée en bas, masquée à partir de 960 px — et mêmes
 * repères (`data-mobile-nav`, mesuré par la pilule d'appel et les cartes
 * flottantes ; `data-reseau-mobile-nav`) : la barre d'iCom la remplace en
 * changeant de page sans faire sauter le bas de l'écran.
 *
 * ⚠️ Cinq places de LARGEUR ÉGALE, jamais un défilement : une destination
 * hors champ n'est pas une destination stable. À 320 px chaque place fait
 * plus de 44 px. Icônes seules depuis l'étude du 22/10/2026 : les libellés
 * restent les noms accessibles, en `sr-only`.
 *
 * Sa géométrie est portée par des classes de rôle (Tailwind), sans la feuille
 * `.rm-*` de la coquille du fil : elle se rend aussi sur les pages de membre
 * qui ne montent pas cette feuille.
 */
function DestinationsTabBar({ routes, onCreate, handle = null, current }: ReseauMobileTabBarProps & { routes: ReseauDestinationRoutes }) {
  const { t } = useTranslation("reseau")
  const { liveAvailable, navigationLayout } = useNetwork()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const { open, setOpen, triggerRef } = useChoiceTrigger<HTMLButtonElement>()
  /* La pastille de Messages : MÊME composition que la barre d'iCom —
     tête-à-tête + groupes, total compté par le SERVEUR (IC-06). */
  const unread = useMessagesUnreadTotal()
  const unreadBadge = formatUnreadBadge(unread)

  /* Une navigation referme le choix : il masquerait la page demandée. */
  useEffect(() => {
    setOpen(false)
  }, [pathname, setOpen])

  const match = current !== undefined ? current : activeReseauDestination({ pathname, search: searchParams }, routes, handle)
  const choices = reseauCreationChoices({ handle, liveAvailable }, routes).filter((choice) => onCreate !== undefined || choice.href !== null)

  return (
    <nav
      aria-label={t("reseauDestinations.navLabel")}
      data-mobile-nav=""
      data-reseau-mobile-nav=""
      data-reseau-destinations=""
      className={`fixed right-3 bottom-[calc(0.75rem+env(safe-area-inset-bottom,0px))] left-3 z-40 print:hidden ${navigationLayout === "adaptive" ? "min-[768px]:hidden" : MOBILE_ONLY_CLASS}`}
    >
      {/* Étude du 22/10/2026 : verre (flou et saturation), large et basse — 52 px,
          des cibles de 44 px, icônes seules ; chaque libellé reste le nom accessible. */}
      <div className="esp-reseau-tabbar border backdrop-blur-xl backdrop-saturate-150">
        <ul className="m-0 flex h-[52px] list-none items-stretch gap-0.5 p-1">
          {reseauDestinations(routes).map((destination) => {
            // « Créer » (sans adresse) est l'action principale de la barre : un carré
            // arrondi plein de 40 px (48 px avant la barre basse de 52 px), à l'ombre de
            // sa couleur, marqué d'un simple « + » ; le libellé reste son nom accessible.
            const isCreate = destination.href === null
            const DestinationIcon = isCreate ? Plus : RESEAU_DESTINATION_ICONS[destination.id]
            const ariaCurrent = ariaCurrentFor(match, destination.id)
            const badge = destination.id === "messages" ? unreadBadge : null
            /* PAS d'`aria-label` sur la cible : il remplacerait le contenu,
               donc la phrase de la pastille. Nom accessible = libellé visible
               + `sr-only`. */
            const inner: ReactNode = (
              <>
                <span
                  data-destination-icon=""
                  className={cn(
                    "relative flex items-center justify-center",
                    isCreate
                      ? "size-10 rounded-[var(--esp-fab-radius,10px)] bg-[var(--primary-fill)] text-[color:var(--primary-fill-on,var(--on-fill))] shadow-[var(--esp-fab-shadow,none)]"
                      : "size-8 rounded-[var(--esp-chip-radius,10px)]",
                    // Onglet actif : pastille tonale du thème (ADR-0027), accent plein en repli.
                    ariaCurrent !== undefined && "bg-[var(--esp-tab-active-bg,var(--accent))] text-[color:var(--esp-tab-active-fg,var(--accent-foreground))]",
                  )}
                >
                  <DestinationIcon aria-hidden="true" className={isCreate ? "size-5" : "size-[22px]"} strokeWidth={isCreate ? 2.4 : undefined} />
                  {badge !== null ? (
                    <span data-destination-badge="" className="absolute -top-1.5 -right-2 flex h-4 min-w-4 items-center justify-center rounded-full bg-[var(--role-react-fill,var(--primary))] px-1 font-mono text-[9px] font-bold tabular-nums text-[color:var(--role-react-on,var(--primary-foreground))]">
                      <span aria-hidden="true">{badge}</span>
                    </span>
                  ) : null}
                </span>
                <span data-destination-label="" className="sr-only">{destination.label ?? t(destination.labelKey)}</span>
                {/* Un espace ENTRE le libellé et la phrase : le nom accessible se
                    lit « Messages 3 conversations non lues », jamais « Messages3… ». */}
                {badge !== null ? (
                  <>
                    {" "}
                    <span className="sr-only">{t("reseauDestinations.messagesUnread", { count: unread })}</span>
                  </>
                ) : null}
              </>
            )
            return (
              <li key={destination.id} className="flex min-w-0 flex-1">
                {destination.href === null ? (
                  <button
                    ref={triggerRef}
                    data-destination-item={destination.id}
                    type="button"
                    onClick={() => setOpen(true)}
                    aria-haspopup="dialog"
                    aria-expanded={open}
                    className={DESTINATION_ITEM_CLASS}
                  >
                    {inner}
                  </button>
                ) : (
                  <Link
                    href={destination.href}
                    data-destination-item={destination.id}
                    aria-current={ariaCurrent}
                    className={cn(DESTINATION_ITEM_CLASS, ariaCurrent !== undefined && "text-primary hover:text-primary")}
                  >
                    {inner}
                  </Link>
                )}
              </li>
            )
          })}
        </ul>
      </div>
      <CreationChoiceCard open={open} onClose={() => setOpen(false)} choices={choices} onPick={(kind) => onCreate?.(kind)} />
    </nav>
  )
}

/** L'icône du bouton fixe : la même que la première place de la barre d'iCom. */
const MENU_ICON: IconName = "grid"

/**
 * Le contenu d'un onglet — icône, pastille, libellé.
 *
 * ⚠️ Le chiffre est `aria-hidden` et doublé d'une phrase en `sr-only` : un
 * « 3 » nu, annoncé après « Relations », ne dit pas 3 quoi. Même règle que
 * les onglets du bureau.
 */
function TabInner({
  icon,
  label,
  badge,
}: {
  icon: IconName
  label: string
  badge: { badge: string; label: string } | null
}) {
  return (
    <>
      <span className="rm-tab-icon">
        <Icon name={icon} size={20} />
        {badge ? (
          <span className="rm-tab-badge">
            <span aria-hidden="true">{badge.badge}</span>
          </span>
        ) : null}
      </span>
      <span className="rm-tab-label">{label}</span>
      {badge ? <span className="sr-only">{badge.label}</span> : null}
    </>
  )
}

/** La barre HISTORIQUE — « Menu » fixe et volets réels, inchangée. */
function VoletsTabBar({ active, badges }: ReseauMobileTabBarProps) {
  const { t } = useTranslation("reseau")
  const home = useRoutes().home()
  const pathname = usePathname()
  const [menuOpen, setMenuOpen] = useState(false)
  const subtabsRef = useRef<HTMLDivElement>(null)

  /* Une navigation rend la page demandée nue : le menu n'est jamais conservé
     depuis l'adresse précédente. */
  useEffect(() => {
    setMenuOpen(false)
  }, [pathname])

  /* Un lien profond vers un volet situé hors champ doit rendre l'actif
     visible dès l'arrivée. Pas d'animation imposée : le repositionnement est
     instantané et respecte donc aussi reduced-motion. */
  useEffect(() => {
    subtabsRef.current?.querySelector<HTMLElement>('[aria-current="page"]')?.scrollIntoView({ block: "nearest", inline: "nearest" })
  }, [active])

  return (
    <nav
      aria-label={t("reseauMobileTabBar.navLabel")}
      data-mobile-nav=""
      data-reseau-mobile-nav=""
      className={`fixed right-3 bottom-[calc(0.75rem+env(safe-area-inset-bottom,0px))] left-3 z-40 print:hidden ${MOBILE_ONLY_CLASS}`}
    >
      <div className="esp-reseau-tabbar border backdrop-blur-md">
        <div className="rm-tabbar-row">
          <button
            type="button"
            onClick={() => setMenuOpen(true)}
            className="rm-menu-tab min-h-11 min-w-11"
            aria-label={t("reseauMobileTabBar.menuLabel")}
            aria-haspopup="dialog"
            aria-expanded={menuOpen}
          >
            <span className="rm-tab-icon">
              <Icon name={MENU_ICON} size={20} />
            </span>
            <span className="rm-tab-label">{t("reseauMobileTabBar.menu")}</span>
          </button>

          <div ref={subtabsRef} className="rm-subtabs" role="group" aria-label={t("reseauMobileTabBar.subtabsLabel")}>
            {RESEAU_MOBILE_TABS.filter((tab) => isServedReseauTab(tab.id)).map((tab) => {
              const href = reseauTabHref(tab.id, home)
              const badge = tabBadge(tab.id, badges)
              const isActive = tab.id === active

              return (
                <Link
                  key={tab.id}
                  href={href}
                  /* PAS d'`aria-label` : il REMPLACERAIT le contenu du lien,
                     donc la phrase de la pastille. Le nom accessible se compose
                     du texte visible + du `sr-only` — exactement ce qu'il faut
                     annoncer. */
                  aria-current={isActive ? "page" : undefined}
                  className="rm-tab min-h-11 min-w-11"
                >
                  <TabInner icon={tab.icon} label={t(tab.shortLabelKey)} badge={badge} />
                </Link>
              )
            })}
          </div>
        </div>
      </div>
      <ReseauMobileMenuSheet open={menuOpen} onOpenChange={setMenuOpen} />
    </nav>
  )
}
