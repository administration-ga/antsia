"use client"

import { useState } from "react"
import { useTranslation } from "react-i18next"
import { signOutAndRedirect } from "@/lib/sign-out"
import { buttonClassName } from "@/components/shared/button-class"

export function PublicRetryButton() {
  const { t } = useTranslation("publicNetwork")
  return <button className={buttonClassName("outline")} onClick={() => window.location.reload()}>{t("states.retry")}</button>
}

export function PublicSignOutButton() {
  const { t } = useTranslation("publicNetwork")
  const [pending, setPending] = useState(false)
  return <button disabled={pending} aria-busy={pending || undefined} className="min-h-11 rounded-[var(--ui2-button-radius)] px-3 text-sm font-medium hover:bg-muted focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring disabled:opacity-60" onClick={() => { setPending(true); void signOutAndRedirect() }}>{t(pending ? "nav.signingOut" : "nav.signOut")}</button>
}
