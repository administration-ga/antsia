"use client"

import { api } from "@antsia/api/engine"
import { Button } from "@antsia/ui"
import { engineErrorCode } from "@antsia/social-contracts/errors"
import { CONSOLE_MIN_LOA } from "@antsia/social-domain/badges"
import { useConvexAuth, useMutation, useQuery } from "convex/react"
import Link from "next/link"
import { useEffect, useRef, useState } from "react"
import { useTranslation } from "react-i18next"

import { ConsoleDashboard, ConsoleQueryBoundary, type ConsoleOperator } from "./console-dashboard"
import { CONVEX_URL } from "@/components/providers"
import { routes } from "@/lib/routes"
import { signOutAndRedirect } from "@/lib/sign-out"

/** La sortie reste accessible même lorsqu'une connexion n'est pas habilitée. */
export function ConsoleSignOut() {
  const { t } = useTranslation("admin")
  const [pending, setPending] = useState(false)
  const [failed, setFailed] = useState(false)
  const pendingRef = useRef(false)
  return <div className="flex flex-col gap-2">
    <Button variant="outline" disabled={pending} aria-busy={pending || undefined} style={{ minHeight: 44, whiteSpace: "normal" }} onClick={async () => {
      if (pendingRef.current) return
      pendingRef.current = true
      setPending(true)
      setFailed(false)
      try { await signOutAndRedirect() }
      catch { pendingRef.current = false; setPending(false); setFailed(true) }
    }}>{pending ? t("session.signingOut") : t("session.signOut")}</Button>
    {failed ? <p role="alert" className="text-sm text-destructive">{t("session.localSignOutFailed")}</p> : null}
  </div>
}

function AdmissionMessage({ kind, retry, connected = false }: { kind: "loading" | "signedOut" | "denied" | "failed" | "backendMissing" | "recording"; retry?: () => void; connected?: boolean }) {
  const { t } = useTranslation("admin")
  return <main id="contenu" className="mx-auto flex min-h-dvh w-full max-w-2xl flex-col justify-center gap-6 px-4 py-10 sm:px-6">
    <header className="space-y-3"><p className="text-sm font-medium uppercase tracking-wide text-muted-foreground">{t("home.eyebrow")}</p><h1 className="text-3xl">{t("home.title")}</h1><p className="text-muted-foreground">{t("home.access")}</p></header>
    <section className="space-y-4 rounded-xl border border-border bg-card p-5">
      <p role={kind === "denied" || kind === "failed" || kind === "backendMissing" ? "alert" : "status"}>{t("session." + kind)}</p>
      {kind === "denied" ? <p className="text-sm text-muted-foreground">{t("session.noAuthority", { level: CONSOLE_MIN_LOA })}</p> : null}
      {retry ? <Button style={{ minHeight: 44 }} onClick={retry}>{t("session.retry")}</Button> : null}
      {kind === "signedOut" || kind === "denied" ? <Link className="inline-flex min-h-11 items-center rounded-md underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-4" href={routes.signIn()}>{t("session.signIn")}</Link> : null}
      {connected ? <ConsoleSignOut /> : null}
    </section>
    <Link className="inline-flex min-h-11 items-center self-start rounded-md text-sm underline focus-visible:outline-2 focus-visible:outline-offset-4" href={routes.health()}>{t("home.healthLink")}</Link>
  </main>
}

/** StrictMode réabonne à la même promesse, sans doubler l'enregistrement de l'accès. */
function JournalledConsole({ operator }: { operator: ConsoleOperator }) {
  const record = useMutation(api.modules.platform.operatorAccess.recordAccess)
  const pending = useRef<Promise<null> | null>(null)
  const [attempt, setAttempt] = useState(0)
  const [phase, setPhase] = useState<"recording" | "admitted" | "failed">("recording")
  const [error, setError] = useState<unknown>(null)
  useEffect(() => {
    let active = true
    pending.current ??= record({})
    pending.current.then(() => { if (active) setPhase("admitted") }, (failure: unknown) => { if (active) { setError(failure); setPhase("failed") } })
    return () => { active = false }
  }, [record, attempt])
  if (phase !== "admitted") return <AdmissionMessage kind={phase === "recording" ? "recording" : engineErrorCode(error) === "operatorRequired" ? "denied" : "failed"} connected retry={phase === "failed" ? () => { pending.current = null; setError(null); setPhase("recording"); setAttempt((value) => value + 1) } : undefined} />
  return <ConsoleDashboard operator={operator} sessionExit={<ConsoleSignOut />} />
}

function OperatorAdmission() {
  const operator = useQuery(api.modules.platform.operatorAccess.myOperator, {})
  return operator === undefined ? <AdmissionMessage kind="loading" connected /> : <JournalledConsole key={operator.admissionId ?? operator.personId} operator={operator} />
}

function ConnectedSession() {
  const { isAuthenticated, isLoading } = useConvexAuth()
  if (isLoading) return <AdmissionMessage kind="loading" />
  if (!isAuthenticated) return <AdmissionMessage kind="signedOut" />
  return <ConsoleQueryBoundary fallback={(error, retry) => <AdmissionMessage kind={engineErrorCode(error) === "operatorRequired" || engineErrorCode(error) === "unauthenticated" ? "denied" : "failed"} connected retry={retry} />}><OperatorAdmission /></ConsoleQueryBoundary>
}

export function ConsoleSession() {
  return CONVEX_URL ? <ConnectedSession /> : <AdmissionMessage kind="backendMissing" />
}
