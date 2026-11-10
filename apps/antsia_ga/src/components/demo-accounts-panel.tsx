"use client"

import type { IdentityAuthClient } from "@antsia/social-features/identity"
import { api } from "@convex/_generated/api"
import { useConvex, useQuery } from "convex/react"
import { useId, useState } from "react"
import { useTranslation } from "react-i18next"

import { type DemoAccount, forgetDemoAccount, rememberDemoAccount } from "@/lib/demo-accounts"
import { routes } from "@/lib/routes"
import { browserAppPath } from "@/lib/app-path"

/** Le code enregistré par l'envoi se relit aussitôt ; quelques essais couvrent le délai du backend local. */
const CODE_READS = 8
const CODE_READ_DELAY_MS = 250

/** Le client d'authentification rend `{ error }` plutôt que de lever. */
function refused(result: unknown): boolean {
  return typeof result === "object" && result !== null && "error" in result && (result as { error: unknown }).error != null
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/**
 * Comptes de DÉMONSTRATION — développement local, ou déploiement de
 * démonstration déclaré (`shared` : comptes partagés par tous les visiteurs) :
 * le catalogue est vide ailleurs, et le panneau ne s'affiche pas. Un appui entre
 * par le VRAI parcours OTP : envoi du code, lecture du code de l'adresse réservée
 * (le serveur ne le rend qu'ici), vérification ; puis l'accueil réel
 * (`/bienvenue`), où l'automate prépare le compte en son acteur.
 */
export function DemoAccountsPanel({ authClient, shared = false }: { authClient: IdentityAuthClient; shared?: boolean }) {
  const { t } = useTranslation("antsia")
  const convex = useConvex()
  const accounts = useQuery(api.modules.platform.demoAccounts.catalogue, {})
  const [pending, setPending] = useState<string | null>(null)
  const [failed, setFailed] = useState(false)
  const titleId = useId()
  if (!accounts || accounts.length === 0) return null

  async function enter(account: DemoAccount) {
    setPending(account.actor)
    setFailed(false)
    try {
      rememberDemoAccount(account)
      if (refused(await authClient.emailOtp.sendVerificationOtp({ email: account.email, type: "sign-in" }))) throw new Error("send")
      let code: string | null = null
      for (let read = 0; read < CODE_READS && code === null; read++) {
        const latest = await convex.query(api.modules.platform.devTools.latestOtp, { email: account.email })
        if (latest) code = latest.code
        else await wait(CODE_READ_DELAY_MS)
      }
      if (code === null) throw new Error("code")
      if (refused(await authClient.signIn.emailOtp({ email: account.email, otp: code }))) throw new Error("verify")
      window.location.assign(browserAppPath(routes.welcome()))
    } catch {
      forgetDemoAccount()
      setPending(null)
      setFailed(true)
    }
  }

  return (
    <section aria-labelledby={titleId} className="mt-5 rounded-[var(--ui2-card-radius,1rem)] border border-dashed border-border p-4 text-left">
      <h3 id={titleId} className="text-sm font-semibold">{t("demo.title")}</h3>
      <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{t(shared ? "demo.leadShared" : "demo.lead")}</p>
      <ul className="mt-3 grid gap-2">
        {accounts.map((account) => (
          <li key={account.actor}>
            <button
              type="button"
              disabled={pending !== null}
              aria-busy={pending === account.actor}
              onClick={() => void enter(account)}
              className="flex min-h-11 w-full flex-col items-start rounded-[var(--esp-chip-radius,0.625rem)] bg-[var(--esp-chip-bg,var(--muted))] px-3 py-2 text-left transition-colors hover:bg-[var(--esp-neutral-hover,var(--muted))] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-wait disabled:opacity-70"
            >
              <span className="text-sm font-semibold text-foreground">
                {pending === account.actor ? t("demo.signingIn") : t(`demo.actors.${account.actor}.title`)}
              </span>
              <span className="text-xs text-muted-foreground">
                {account.profile ? `${account.profile.displayName} · ` : ""}{t(`demo.actors.${account.actor}.description`)}
              </span>
            </button>
          </li>
        ))}
      </ul>
      {failed ? <p role="alert" className="mt-3 text-xs text-destructive">{t("demo.failed")}</p> : null}
    </section>
  )
}
