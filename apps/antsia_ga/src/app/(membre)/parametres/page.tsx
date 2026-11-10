import type { Metadata } from "next"

import { getAppT } from "@/i18n/server"
import { SettingsScreen } from "./settings-screen"

export function generateMetadata(): Metadata {
  const { t } = getAppT()
  return { title: t("settings.title") }
}

/**
 * « Paramètres » des MEMBRES : affichage (apparence, thème, motif de fond),
 * langue et fuseau horaire, réglages iCom (IC-04). Sous le gabarit `(membre)`,
 * rangée sous Profil.
 */
export default function MemberSettingsPage() {
  return <SettingsScreen />
}
