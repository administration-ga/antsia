"use client"

import { Info, X } from "lucide-react"
import { useId, useState } from "react"
import { useTranslation } from "react-i18next"
import { appBasePath } from "@/lib/app-path"
import { demoEntryEnabled } from "@/lib/demo-embed"
import { routes } from "@/lib/routes"
import { signOutAndRedirect } from "@/lib/sign-out"

const actionClassName = "inline-flex min-h-11 items-center justify-center rounded-[var(--ui2-button-radius)] border border-border px-4 py-2 text-sm font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"

/** Changement de zone = nouveau document, aucun singleton de session partagé. */
export function DemoEntryLink() {
  const { t } = useTranslation("antsia")
  if (!demoEntryEnabled() || appBasePath()) return null
  return <a href={routes.demo()} className={actionClassName}>{t("demoIntegration.entry")}</a>
}

export function DemoModeBanner() {
  const { t } = useTranslation("antsia")
  const descriptionId = useId()
  const [dismissed, setDismissed] = useState(false)
  const [signingOut, setSigningOut] = useState(false)
  const [failed, setFailed] = useState(false)

  async function handleSignOut() {
    if (signingOut) return
    setSigningOut(true)
    setFailed(false)
    try {
      await signOutAndRedirect()
    } catch {
      setSigningOut(false)
      setFailed(true)
    }
  }

  if (!appBasePath() || dismissed) return null
  // Information non modale : le document garde toute sa hauteur et son focus.
  return <aside aria-label={t("demoIntegration.title")} aria-describedby={descriptionId} className="fixed bottom-[calc(6.5rem+env(safe-area-inset-bottom,0px))] right-4 z-40 w-[calc(100%-2rem)] max-w-sm rounded-[var(--ui2-card-radius)] border border-border bg-card p-4 text-card-foreground shadow-lg min-[768px]:bottom-6 min-[768px]:right-6">
    <div className="flex items-start gap-2">
      <Info aria-hidden="true" className="mt-1 size-4 shrink-0 text-muted-foreground" />
      <div className="min-w-0 flex-1"><p className="text-sm font-bold">{t("demoIntegration.title")}</p><p id={descriptionId} className="mt-1 text-xs leading-relaxed text-muted-foreground">{t("demoIntegration.lead")}</p></div>
      <button type="button" aria-label={t("demoIntegration.dismiss")} onClick={() => setDismissed(true)} className="-mr-2 -mt-2 inline-flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-[var(--ui2-button-radius)] hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"><X aria-hidden="true" className="size-4" /></button>
    </div>
    <button type="button" disabled={signingOut} aria-busy={signingOut} onClick={() => void handleSignOut()} className={`${actionClassName} mt-3 w-full hover:bg-muted disabled:cursor-wait disabled:opacity-70`}>{t(signingOut ? "demoIntegration.signingOut" : "demoIntegration.signOut")}</button>
    {failed ? <p role="alert" className="mt-2 text-xs text-destructive">{t("demoIntegration.signOutFailed")}</p> : null}
  </aside>
}

/** Repli fermé si le relais privé n'est pas configuré, sans origine secondaire. */
export function DemoEmbedScreen() {
  const { t } = useTranslation("antsia")
  return <main id="contenu" tabIndex={-1} className="flex min-h-dvh min-w-0 flex-col items-center justify-center gap-4 bg-background px-6 text-foreground">
    <h1 className="text-lg font-bold">{t("demoIntegration.title")}</h1>
    <p role="status">{t("demoIntegration.unavailable")}</p>
    <a href={routes.signIn()} className={actionClassName}>{t("demoIntegration.back")}</a>
  </main>
}
