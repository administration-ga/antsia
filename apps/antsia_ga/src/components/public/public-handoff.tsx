"use client"

import Link from "next/link"
import { useEffect } from "react"
import { useTranslation } from "react-i18next"
import { SessionProviders } from "@/components/providers"
import { useSessionState } from "@/components/use-session-state"
import { routes } from "@/lib/routes"
import { browserAppPath } from "@/lib/app-path"

function HandoffDestination() {
  const session = useSessionState()
  const { t } = useTranslation("publicNetwork")
  useEffect(() => {
    if (session.status === "member") window.location.replace(browserAppPath(routes.feed()))
    else if (session.status === "welcome") window.location.replace(browserAppPath(routes.welcome()))
    else if (session.status === "restricted") window.location.replace(browserAppPath(routes.personalControls()))
  }, [session.status])
  if (session.status === "signedOut" || session.status === "rootMissing") return <div role="alert" className="rounded-xl border border-border bg-card p-6"><p>{t("session.handoffRefused")}</p><Link href={routes.signIn()} prefetch={false} className="mt-4 inline-flex min-h-11 items-center rounded-lg px-4 text-primary underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring">{t("nav.enter")}</Link></div>
  return <p role="status">{t("session.confirming")}</p>
}

/** Le SDK consomme l'OTT sur cette origine ; aucun lien ne le transporte ou ne le perd. */
export function PublicHandoff() {
  return <SessionProviders><HandoffDestination /></SessionProviders>
}
