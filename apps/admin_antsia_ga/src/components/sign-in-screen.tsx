"use client"

import { api } from "@antsia/api/engine"
import { isSigningOutEverywhere } from "@antsia/api/sign-out-everywhere"
import { CONSOLE_MIN_LOA } from "@antsia/social-domain/badges"
import { identityErrorKey, type IdentityConfiguration } from "@antsia/social-features/identity"
import { Button } from "@antsia/ui"
import { useConvexAuth, useQuery } from "convex/react"
import { ShieldCheck } from "lucide-react"
import Link from "next/link"
import { useEffect, useId, useRef, useState } from "react"
import { useTranslation } from "react-i18next"

import { ConsoleQueryBoundary } from "./console-dashboard"
import { ConsoleSignOut } from "./console-session"
import { CONVEX_URL } from "@/components/providers"
import { authClient } from "@/lib/auth-client"
import { routes } from "@/lib/routes"

/** Porte fermée : ni compte léger, ni OTP de développement dans une console. */
export function IdnConsoleEntry({ configuration }: { configuration: IdentityConfiguration | null | undefined }) {
  const { t } = useTranslation("admin")
  const { t: identityT } = useTranslation("identity")
  const helpId = useId()
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const lock = useRef(false)
  const controller = useRef<AbortController | null>(null)
  const mounted = useRef(false)
  const errorRef = useRef<HTMLParagraphElement>(null)
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; controller.current?.abort() } }, [])
  useEffect(() => { if (error) errorRef.current?.focus() }, [error])
  return <section className="flex flex-col gap-4 rounded-xl border border-border bg-card p-5">
    <p id={helpId} role={configuration === undefined ? "status" : undefined} className="text-sm text-muted-foreground">{configuration === undefined ? t("signIn.loading") : configuration?.idn === true ? t("signIn.help") : t("signIn.unavailable")}</p>
    {error ? <p ref={errorRef} tabIndex={-1} role="alert" className="text-sm text-destructive">{identityT(error)}</p> : null}
    <Button size="lg" disabled={pending || configuration?.idn !== true} aria-busy={pending || undefined} aria-describedby={helpId} style={{ whiteSpace: "normal", minHeight: 44 }} onClick={async () => {
      if (lock.current || configuration?.idn !== true || isSigningOutEverywhere()) return
      lock.current = true
      setPending(true)
      setError(null)
      const request = new AbortController()
      controller.current = request
      let timeout: ReturnType<typeof setTimeout> | undefined
      try {
        const response = await Promise.race([
          authClient.signIn.oauth2({ providerId: "idn", callbackURL: routes.home(), fetchOptions: { throw: false, signal: request.signal } }),
          new Promise<never>((_resolve, reject) => { timeout = setTimeout(() => { request.abort(); reject(new Error("Authentication request timed out")) }, 10_000) }),
        ])
        if (!mounted.current) return
        if (response.error) setError(identityErrorKey(response.error))
        else if (!response.data || typeof response.data.url !== "string" || response.data.redirect !== true) setError("errors.generic")
      } catch (failure: unknown) {
        if (mounted.current) setError(identityErrorKey(failure))
      } finally {
        if (timeout !== undefined) clearTimeout(timeout)
        lock.current = false
        if (mounted.current) setPending(false)
      }
    }}><ShieldCheck className="size-5 shrink-0" aria-hidden="true" />{pending ? t("signIn.connecting") : t("signIn.idn")}</Button>
    <p className="text-xs text-muted-foreground">{t("signIn.minimum", { level: CONSOLE_MIN_LOA })}</p>
  </section>
}

function ConnectedEntry({ signOutIncomplete }: { signOutIncomplete: boolean }) {
  const { t } = useTranslation("admin")
  const { isAuthenticated, isLoading } = useConvexAuth()
  const configuration = useQuery(api.modules.platform.authentication.configuration, {})
  if (isLoading) return <p role="status">{t("session.loading")}</p>
  return <>{isAuthenticated && signOutIncomplete ? <ConsoleSignOut /> : <IdnConsoleEntry configuration={configuration} />}</>
}

export function ConsoleSignInScreen() {
  const { t } = useTranslation("admin")
  const { t: identityT } = useTranslation("identity")
  const [signOutIncomplete, setSignOutIncomplete] = useState(false)
  useEffect(() => { setSignOutIncomplete(new URLSearchParams(window.location.search).get("deconnexion") === "incomplete") }, [])
  return <main id="contenu" className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center gap-6 px-4 py-10">
    <header className="space-y-3"><p className="text-sm font-medium uppercase tracking-wide text-muted-foreground">{t("home.eyebrow")}</p><h1 className="text-3xl">{t("signIn.title")}</h1><p className="text-muted-foreground">{t("home.access")}</p></header>
    {signOutIncomplete ? <p role="alert" className="rounded-lg border border-border bg-muted p-4 text-sm">{identityT("signOutIncomplete")}</p> : null}
    {CONVEX_URL ? <ConsoleQueryBoundary fallback={(_error, retry) => <section className="space-y-3"><p role="alert">{t("signIn.configurationFailed")}</p><Button style={{ minHeight: 44 }} onClick={retry}>{t("session.retry")}</Button></section>}><ConnectedEntry signOutIncomplete={signOutIncomplete} /></ConsoleQueryBoundary> : <p role="alert">{t("session.backendMissing")}</p>}
    <Link className="inline-flex min-h-11 items-center self-start rounded-md text-sm underline focus-visible:outline-2 focus-visible:outline-offset-4" href={routes.home()}>{t("health.backHome")}</Link>
  </main>
}
