// Dupliqué de socle/packages/agent-features/src/features/messagerie/icom-mobile-tabs.ts @ ad2e7fdc2 — adaptations : adresses composées depuis les bases INJECTÉES (`icomMobileTabHref(id, bases)`, `bases = { home, messages }` tirées de `useRoutes()`) ; le premier emplacement, faute de menu principal d'espace (volets de l'espace agent non repris), REVIENT à l'accueil du réseau (lien vers `home`) au lieu de basculer la barre ; libellés sortis du module — `IcomMobileTab` ne porte plus que `id` et `icon`, les textes viennent de `icomMobileTabText(id, t)` (dérivés des clés du dock, `t` en dernier paramètre) ; phrases des pastilles traduites et pluralisées (`icomMobileBadge(id, counts, t)`) ; IC-02 : iAppel porte les messages vocaux non écoutés (`voicemailTabBadge`).
/**
 * icom-mobile-tabs — la barre basse d'iCom au téléphone (ADR-0079 du socle).
 *
 * Entrer dans Messages, c'est entrer dans « iCom-land » : la barre basse du
 * réseau cède la place à celle-ci — le modèle WhatsApp « app dans l'app » que
 * le dock du bureau applique déjà (`icom-dock.ts`). Les quatre briques
 * partagent la même structure sur mobile et sur bureau :
 *
 *   Menu | iChat | Statuts | iAppel | Relations
 *
 *   - `menu_principal` — le RETOUR, en premier : une liste sans porte de
 *     retour est un cul-de-sac (règle posée en tête de `MessagerieListPage`).
 *     Il RAMÈNE à l'accueil du réseau, là où vivent sa barre et son menu ;
 *   - `actus`  — les statuts (stories) du réseau, l'équivalent de l'onglet
 *     Actus de WhatsApp, séparé d'iChat partout.
 *
 * La barre ne se montre qu'en vue LISTE — transposition exacte
 * d'`icomTabsVisible` : en conversation comme en rédaction, la page est
 * immersive et aucune barre ne se rend.
 *
 * Les briques s'adressent par `?brique=` et JAMAIS par des routes dédiées :
 * l'application ne sert qu'une page de liste, et c'est le miroir du bureau,
 * où la brique est un état local du dock, pas une adresse.
 *
 * ⚠️ iChat garde l'URL canonique NUE (la base, jamais `?brique=ichat`) :
 * c'est l'adresse que les notifications et les liens connaissent déjà — deux
 * adresses pour la même liste feraient deux entrées d'historique pour un même
 * écran.
 *
 * ⚠️ AUCUNE URL écrite ici : les bases sont celles de l'application.
 *
 * Ce qui se décide ici (emplacements, adresses, actif, pastilles) est testé
 * dans `icom-mobile-tabs.test.ts` ; `IcomMobileTabBar` ne fait que rendre.
 */

import type { IconName } from "@antsia/ui"
import type { TFunction } from "i18next"
import { formatUnreadBadge } from "../reseau-personnel/shared"
import {
  ICOM_DOCK_TABS,
  normalizeIcomDockTab,
  type IcomDockTabId,
} from "./icom-dock"

/** Le paramètre d'URL de la brique — `<messages>?brique=…`. */
export const ICOM_BRIQUE_PARAM = "brique"

/** Les briques adressables au téléphone sont les mêmes que celles du dock. */
export type IcomMobileBrique = IcomDockTabId

/** Un emplacement de la barre : une brique, ou le retour au menu principal. */
export type IcomMobileTabId = "menu_principal" | IcomMobileBrique

/**
 * Ramène n'importe quelle entrée sur une brique connue — `ichat` par défaut,
 * comme le dock (`normalizeIcomDockTab`). Jamais d'écran vide.
 */
export function parseIcomBrique(
  raw: string | null | undefined,
): IcomMobileBrique {
  if (raw === "actus") return "actus"
  return normalizeIcomDockTab(raw)
}

export interface IcomMobileTab {
  id: IcomMobileTabId
  icon: IconName
}

export type IcomMobileSubtab = Omit<IcomMobileTab, "id"> & {
  id: IcomMobileBrique
}

/** Ce que l'écran dit d'un emplacement. */
export interface IcomMobileTabText {
  /** Le nom accessible complet — ce que l'emplacement PERMET de faire. */
  label: string
  /** Le libellé visible sous l'icône. */
  shortLabel: string
}

/** Les clés que le dock connaît déjà d'une brique — dérivées, jamais recopiées. */
function dockTab(id: IcomDockTabId): { labelKey: string; descriptionKey: string } | null {
  const found = ICOM_DOCK_TABS.find((tab) => tab.id === id)
  // Inatteignable tant que `ICOM_DOCK_TAB_IDS` et cette barre restent
  // alignés — le test le verrouille.
  return found === undefined
    ? null
    : { labelKey: found.labelKey, descriptionKey: found.descriptionKey }
}

/** Le menu reste physiquement séparé des briques et ne défile jamais. */
export const ICOM_MOBILE_MENU_TAB: IcomMobileTab = Object.freeze({
  // Même première place, même mot et même icône que dans la barre du
  // réseau : c'est le même geste partout.
  id: "menu_principal",
  icon: "grid",
})

/** Les quatre briques qui défilent à droite du menu fixe. */
export const ICOM_MOBILE_SUBTABS: readonly IcomMobileSubtab[] = Object.freeze([
  { id: "ichat" as const, icon: "messageCircle" as const },
  { id: "actus" as const, icon: "camera" as const },
  { id: "iappel" as const, icon: "phone" as const },
  { id: "icontact" as const, icon: "users" as const },
])

/**
 * Les CINQ emplacements dans leur ordre sémantique. Cette vue agrégée reste
 * utile aux consommateurs de données et aux tests ; le rendu sépare le menu
 * fixe de `ICOM_MOBILE_SUBTABS`.
 */
export const ICOM_MOBILE_TABS: readonly IcomMobileTab[] = Object.freeze([
  ICOM_MOBILE_MENU_TAB,
  ...ICOM_MOBILE_SUBTABS,
])

/**
 * Les textes d'un emplacement. Ceux des briques DÉRIVENT des clés du dock
 * (libellé court = nom de la brique ; nom accessible = « nom — description »)
 * : jamais une seconde liste.
 */
export function icomMobileTabText(
  id: IcomMobileTabId,
  t: TFunction,
): IcomMobileTabText {
  if (id === "menu_principal") {
    return {
      label: t("messagerie:icomMobileTabs.menu.label"),
      shortLabel: t("messagerie:icomMobileTabs.menu.shortLabel"),
    }
  }
  const dock = dockTab(id)
  if (dock === null) return { label: id, shortLabel: id }
  const shortLabel = t(dock.labelKey)
  return {
    shortLabel,
    label: t("messagerie:icomMobileTabs.subtabLabel", {
      label: shortLabel,
      description: t(dock.descriptionKey),
    }),
  }
}

/** Les adresses de l'application que la barre compose (`useRoutes()`). */
export interface IcomMobileBases {
  /** L'accueil du réseau — où ramène le premier emplacement. */
  home: string
  /** La liste de la messagerie — la page d'iCom au téléphone. */
  messages: string
}

/**
 * Où mène un emplacement.
 *
 * Le retour mène à l'ACCUEIL du réseau : c'est là que vivent sa barre et son
 * menu. Les briques restent sur la liste, adressées par la query.
 */
export function icomMobileTabHref(
  id: IcomMobileTabId,
  bases: IcomMobileBases,
): string {
  switch (id) {
    case "menu_principal":
      return bases.home
    case "ichat":
      // L'URL canonique NUE — cf. l'en-tête : jamais `?brique=ichat`.
      return bases.messages
    case "actus":
    case "iappel":
    case "icontact":
      return `${bases.messages}?${ICOM_BRIQUE_PARAM}=${id}`
  }
}

export interface IcomTabBadge {
  /** Le chiffre affiché — déjà borné (« 99+ »). */
  badge: string
  /** La phrase annoncée au lecteur d'écran — jamais un chiffre nu. */
  label: string
}

/**
 * IC-02 : la pastille des messages vocaux non écoutés, portée par l'onglet des
 * appels — barre du téléphone, vues de la page Messages, carte iCom du bureau.
 */
export function voicemailTabBadge(
  unheardVoicemails: number | undefined,
  t: TFunction,
): IcomTabBadge | null {
  const badge = formatUnreadBadge(unheardVoicemails)
  if (badge === null) return null
  return {
    badge,
    label: t("messagerie:icomMobileTabs.unheardVoicemails", {
      count: unheardVoicemails ?? 0,
    }),
  }
}

/**
 * La pastille d'un emplacement. iChat porte les messages non lus, Statuts les
 * statuts non vus, iAppel les messages vocaux non écoutés (IC-02) — JAMAIS
 * additionnés : un total ne répondrait à aucune question.
 */
export function icomMobileBadge(
  id: IcomMobileTabId,
  counts: { unreadMessages?: number; unseenActus?: number; unheardVoicemails?: number },
  t: TFunction,
): IcomTabBadge | null {
  if (id === "iappel") return voicemailTabBadge(counts.unheardVoicemails, t)
  if (id === "ichat") {
    const badge = formatUnreadBadge(counts.unreadMessages)
    if (badge === null) return null
    return {
      badge,
      label: t("messagerie:icomMobileTabs.unreadMessages", {
        count: counts.unreadMessages ?? 0,
      }),
    }
  }
  if (id === "actus") {
    const badge = formatUnreadBadge(counts.unseenActus)
    if (badge === null) return null
    return {
      badge,
      label: t("messagerie:icomMobileTabs.unseenStatuses", {
        count: counts.unseenActus ?? 0,
      }),
    }
  }
  return null
}
