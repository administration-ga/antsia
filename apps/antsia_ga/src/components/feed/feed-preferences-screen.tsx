"use client"

import { PrivacyLists } from "@antsia/social-features/reseau-personnel"
import { ArrowLeft } from "lucide-react"
import Link from "next/link"
import { useTranslation } from "react-i18next"

import { MemberPage } from "@/components/member-chrome"
import { routes } from "@/lib/routes"

/** Les préférences du fil restent sous la porte de membre et le réseau courant. */
export function FeedPreferencesScreen() {
  const { t } = useTranslation("antsia")

  return (
    <MemberPage>
      <div className="flex w-full min-w-0 flex-col gap-5 pb-24">
        <Link href={routes.feed()} className="inline-flex min-h-11 items-center gap-2 self-start rounded-[var(--ui2-button-radius)] px-3 text-sm font-medium underline underline-offset-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
          <ArrowLeft aria-hidden="true" className="size-4" />
          {t("personal.home")}
        </Link>
        <header className="flex flex-col gap-3">
          <h1 className="antsia-title">{t("feedPreferences.title")}</h1>
          <p className="text-base text-muted-foreground">{t("feedPreferences.lead")}</p>
          <p className="text-sm text-muted-foreground">{t("feedPreferences.scope")}</p>
        </header>
        <PrivacyLists includeBookmarks={false} />
        <p className="text-sm text-muted-foreground">{t("feedPreferences.availability")}</p>
      </div>
    </MemberPage>
  )
}
