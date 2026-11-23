"use client"

import { api } from "@antsia/api/engine"
import { isSigningOutEverywhere } from "@antsia/api/sign-out-everywhere"
import { engineErrorCode } from "@antsia/social-contracts/errors"
import { CONSOLE_MIN_LOA } from "@antsia/social-domain/badges"
import { identityErrorKey, idnReturnMessageKey, idnReturnRefusal, type IdentityConfiguration, type IdnReturnRefusal, withoutIdnReturnParams } from "@antsia/social-features/identity"
import { Button } from "@antsia/ui"
import { useConvexAuth, useQuery } from "convex/react"
import { ShieldCheck } from "lucide-react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useEffect, useId, useRef, useState } from "react"
import { useTranslation } from "react-i18next"

import { ConsoleQueryBoundary } from "./console-dashboard"
import { ConsoleSignOut } from "./console-session"
import { CONVEX_URL } from "@/components/providers"
import { authClient } from "@/lib/auth-client"
import { routes } from "@/lib/routes"

/**
 * Revue CH-815, constat F3 — les trois adresses de retour d'IDN (succès, compte neuf, échec) : l'entrée
 * de la console (`/entrer`), ABSOLUE à CETTE origine (le moteur en lit l'application qui reçoit la
 * session), SANS requête ni fragment. Le moteur ne scelle une session de console qu'à cette adresse
 * exacte, déclarée au catalogue (`entry_path`), et y ajoute le jeton à usage unique de la session :
 * aucune continuation ne voyage avec lui. L'entrée mène ensuite à l'accueil, si le serveur reconnaît
 * la session à la console.
 */
export function idnReturnURLs(origin: string): { callbackURL: string; newUserCallbackURL: string; errorCallbackURL: string } {
  const entry = new URL(routes.signIn(), origin)
  const href = `${entry.origin}${entry.pathname}`
  return { callbackURL: href, newUserCallbackURL: href, errorCallbackURL: href }
}

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
          authClient.signIn.oauth2({ providerId: "idn", ...idnReturnURLs(window.location.origin), fetchOptions: { throw: false, signal: request.signal } }),
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

/**
 * Une session que le SERVEUR reconnaît à la console (`myOperator` : opérateur vivant, preuve scellée
 * pour la console) passe l'entrée vers l'accueil, qui journalise l'accès avant toute donnée. Ce
 * composant ne se monte qu'une fois l'amorçage de la session terminé (`EngineConvexProvider`) : le
 * jeton à usage unique du retour d'IDN est alors déjà échangé et retiré de l'adresse.
 */
function OperatorContinuation() {
  const { t } = useTranslation("admin")
  const router = useRouter()
  const operator = useQuery(api.modules.platform.operatorAccess.myOperator, {})
  const navigated = useRef(false)
  useEffect(() => {
    if (operator === undefined || navigated.current) return
    // Une seule navigation : le double effet de StrictMode ne la rejoue pas.
    navigated.current = true
    router.replace(routes.home())
  }, [operator, router])
  return <p role="status">{t("session.loading")}</p>
}

/**
 * Une session ouverte que la console ne reconnaît pas (code, IDN d'une autre application, ou d'avant
 * la revue CH-815 F3) : dit sans détour, et la connexion IDN reste offerte pour la relancer.
 */
function UnrecognisedSession({ error, retry, configuration }: { error: unknown; retry: () => void; configuration: IdentityConfiguration | null | undefined }) {
  const { t } = useTranslation("admin")
  const denied = engineErrorCode(error) === "operatorRequired" || engineErrorCode(error) === "unauthenticated"
  return <>
    <section className="space-y-3 rounded-xl border border-border bg-card p-5">
      <p role="alert">{t(denied ? "session.denied" : "session.failed")}</p>
      {denied ? <p className="text-sm text-muted-foreground">{t("session.noAuthority", { level: CONSOLE_MIN_LOA })}</p> : <Button style={{ minHeight: 44 }} onClick={retry}>{t("session.retry")}</Button>}
    </section>
    <IdnConsoleEntry configuration={configuration} />
  </>
}

function ConnectedEntry({ signOutIncomplete }: { signOutIncomplete: boolean }) {
  const { t } = useTranslation("admin")
  const { isAuthenticated, isLoading } = useConvexAuth()
  const configuration = useQuery(api.modules.platform.authentication.configuration, {})
  if (isLoading) return <p role="status">{t("session.loading")}</p>
  // Une sortie incomplète avec une session encore vivante : la refaire d'abord.
  if (isAuthenticated && signOutIncomplete) return <ConsoleSignOut />
  if (isAuthenticated) return <ConsoleQueryBoundary fallback={(error, retry) => <UnrecognisedSession error={error} retry={retry} configuration={configuration} />}><OperatorContinuation /></ConsoleQueryBoundary>
  return <IdnConsoleEntry configuration={configuration} />
}

export function ConsoleSignInScreen() {
  const { t } = useTranslation("admin")
  const { t: identityT } = useTranslation("identity")
  const [signOutIncomplete, setSignOutIncomplete] = useState(false)
  const [idnReturn, setIdnReturn] = useState<IdnReturnRefusal | null>(null)
  // L'adresse lue d'abord : l'effet d'un enfant passe avant celui-ci, et une session ouverte ne doit
  // pas quitter l'entrée avant qu'une sortie incomplète n'y ait été lue.
  const [addressRead, setAddressRead] = useState(false)
  useEffect(() => {
    const search = new URLSearchParams(window.location.search)
    setSignOutIncomplete(search.get("deconnexion") === "incomplete")
    // Un refus ou un abandon chez IDN ramené ici par le moteur : dit une fois, en phrase connue.
    setIdnReturn(idnReturnRefusal(search.get("error")))
    const cleaned = withoutIdnReturnParams(window.location.href)
    if (cleaned !== null) window.history.replaceState(window.history.state, "", cleaned)
    setAddressRead(true)
  }, [])
  return <main id="contenu" className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center gap-6 px-4 py-10">
    <header className="space-y-3"><p className="text-sm font-medium uppercase tracking-wide text-muted-foreground">{t("home.eyebrow")}</p><h1 className="text-3xl">{t("signIn.title")}</h1><p className="text-muted-foreground">{t("home.access")}</p></header>
    {signOutIncomplete ? <p role="alert" className="rounded-lg border border-border bg-muted p-4 text-sm">{identityT("signOutIncomplete")}</p> : null}
    {idnReturn ? <p role="alert" className="rounded-lg border border-border bg-muted p-4 text-sm">{identityT(idnReturnMessageKey(idnReturn))}</p> : null}
    {CONVEX_URL ? <ConsoleQueryBoundary fallback={(_error, retry) => <section className="space-y-3"><p role="alert">{t("signIn.configurationFailed")}</p><Button style={{ minHeight: 44 }} onClick={retry}>{t("session.retry")}</Button></section>}>{addressRead ? <ConnectedEntry signOutIncomplete={signOutIncomplete} /> : <p role="status">{t("session.loading")}</p>}</ConsoleQueryBoundary> : <p role="alert">{t("session.backendMissing")}</p>}
    <Link className="inline-flex min-h-11 items-center self-start rounded-md text-sm underline focus-visible:outline-2 focus-visible:outline-offset-4" href={routes.home()}>{t("health.backHome")}</Link>
  </main>
}
