"use client"

import { useId } from "react"
import { useTranslation } from "react-i18next"

import { DisplayPreferences } from "@/components/display-preferences"
import { MemberPage } from "@/components/member-chrome"
import { PreferencesControls } from "@/components/preferences-controls"
import { Card } from "@/components/shared/controls"
import { SCREEN_SECTIONS } from "@/components/shared/screen-layout"
import { meEntries } from "../moi/me-model"
import { EntryList } from "../moi/me-screen"

/** Les réglages voisins, rangés aussi sous Profil : mon fil, mes données et mes recours. */
const RELATED_ENTRY_IDS: readonly string[] = ["feedPreferences", "personalData"]

/**
 * PARAMÈTRES (destination Profil) : l'affichage — apparence, thème, motif de
 * fond —, la langue et le fuseau horaire, puis les réglages voisins. Atteints
 * depuis le rail du bureau et depuis Profil au téléphone. Les mêmes contrôles
 * restent sur « Mes données », ouverte à une personne suspendue.
 */
export function SettingsScreen() {
  const { t } = useTranslation("antsia")
  const displayTitle = useId()
  const relatedTitle = useId()
  const related = meEntries(null).filter((entry) => RELATED_ENTRY_IDS.includes(entry.id))

  return (
    <MemberPage>
      <div className={`${SCREEN_SECTIONS} gap-y-8`}>
        <header className="col-span-full flex flex-col gap-2">
          <h1 className="text-2xl font-semibold tracking-tight">{t("settings.title")}</h1>
          <p className="text-base text-muted-foreground">{t("settings.lead")}</p>
        </header>

        <Card className="min-w-0">
          <section aria-labelledby={displayTitle} className="flex min-w-0 flex-col gap-5 [overflow-wrap:anywhere]">
            <div className="flex flex-col gap-2">
              <h2 id={displayTitle} className="text-xl font-semibold">{t("settings.displayTitle")}</h2>
              <p className="text-sm text-muted-foreground">{t("settings.displayLead")}</p>
            </div>
            <DisplayPreferences />
          </section>
        </Card>

        <PreferencesControls variant="language" />

        <section aria-labelledby={relatedTitle} className="flex flex-col gap-4">
          <h2 id={relatedTitle} className="text-lg font-semibold">{t("settings.moreTitle")}</h2>
          <EntryList entries={related} />
        </section>
      </div>
    </MemberPage>
  )
}
