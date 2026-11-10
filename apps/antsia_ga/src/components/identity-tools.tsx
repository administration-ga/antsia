"use client"
import { useSsoNavigate } from "@antsia/api/use-sso-navigate"
import { Avatar } from "@antsia/social-features/reseau-personnel"
import { AppearanceToggle } from "@antsia/social-features/shell/appearance"
import { api } from "@convex/_generated/api"
import { useQuery } from "convex/react"
import { LogOut, ShieldCheck, UserRound } from "lucide-react"
import { useEffect, useId, useRef, useState } from "react"
import { useTranslation } from "react-i18next"
import { toast } from "sonner"

import Link from "next/link"

import { useMemberSession } from "./network-shell"
import { Button } from "./shared/controls"
import { authClient } from "@/lib/auth-client"
import { browserAppPath } from "@/lib/app-path"
import { routes } from "@/lib/routes"
import { resumeSessionBridge, rotateSessionBridgeFence, withSessionBridgeLock } from "@/lib/session-bridge-client"
import { signOutAndRedirect } from "@/lib/sign-out"

const MENU_LINK = "flex min-h-11 items-center gap-2 rounded-lg px-2 text-sm font-medium hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"

/**
 * Identité et passage entre applications, ouverts par un contrôle explicite.
 *
 * `account` (U09, épure) : le même panneau devient le menu du compte de la barre
 * du haut — la photo du membre l'ouvre, et il réunit Mon espace, l'identité,
 * l'apparence et la déconnexion, au lieu de quatre icônes côte à côte.
 */
export function IdentityTools({ account = false }: { account?: boolean } = {}) {
  const { t } = useTranslation("antsia")
  const { t: tPublic } = useTranslation("publicNetwork")
  const { person } = useMemberSession()
  const configuration = useQuery(api.modules.platform.authentication.configuration, {})
  const [open, setOpen] = useState(false)
  const [linking, setLinking] = useState(false)
  const container = useRef<HTMLDivElement>(null)
  const panel = useRef<HTMLElement>(null)
  const linkRequest = useRef<AbortController | null>(null)
  const panelId = useId()
  const [signingOut, setSigningOut] = useState(false)

  useEffect(() => () => { linkRequest.current?.abort() }, [])
  useEffect(() => {
    if (!open) return
    panel.current?.querySelector<HTMLElement>("button:not(:disabled), a[href], select:not(:disabled), input:not(:disabled)")?.focus()
    const close = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return
      event.preventDefault()
      setOpen(false)
      container.current?.querySelector<HTMLButtonElement>("button")?.focus()
    }
    const outside = (event: PointerEvent) => {
      if (event.target instanceof Node && !container.current?.contains(event.target)) setOpen(false)
    }
    const leave = (event: FocusEvent) => {
      if (event.target instanceof Node && !container.current?.contains(event.target)) setOpen(false)
    }
    document.addEventListener("keydown", close)
    document.addEventListener("pointerdown", outside)
    document.addEventListener("focusin", leave)
    return () => {
      document.removeEventListener("keydown", close)
      document.removeEventListener("pointerdown", outside)
      document.removeEventListener("focusin", leave)
    }
  }, [open])
  const sso = useSsoNavigate({ authClient, isAuthenticated: true, allowedOrigins: configuration?.trustedOrigins ?? [] })
  const verified = person.badges.includes("verified")

  return (
    <div ref={container} className="relative">
      {/* Une icône de l'en-tête : un rond gris dans les thèmes ANTSIA (ADR-0027), comme la
          cloche et le bouton clair/sombre ; la facture fantôme d'origine en repli. */}
      {account ? (
        <button type="button" className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" aria-label={t("account.menu")} aria-expanded={open} aria-controls={panelId} onClick={() => setOpen((value) => !value)}>
          <Avatar displayName={person.displayName ?? person.handle ?? ""} avatarUrl={person.avatar?.url ?? null} size={36} />
        </button>
      ) : (
        <Button variant="ghost" className="min-w-11 px-0 rounded-[var(--esp-header-icon-radius,var(--ui2-button-radius,var(--radius-lg)))] bg-[var(--esp-header-icon-bg,transparent)]" aria-label={t("identity.title")} aria-expanded={open} aria-controls={panelId} onClick={() => setOpen((value) => !value)}>
          <ShieldCheck aria-hidden="true" className="size-4" />
        </Button>
      )}
      {open ? (
        <section id={panelId} ref={panel} aria-label={account ? t("account.menu") : t("identity.title")} className="absolute right-0 top-full z-40 mt-2 flex w-72 max-w-[calc(100vw-2rem)] flex-col gap-3 rounded-xl border border-border bg-popover p-4 text-popover-foreground shadow-lg">
          {account ? (
            <>
              <Link href={routes.me()} className={MENU_LINK} onClick={() => setOpen(false)}>
                <UserRound aria-hidden="true" className="size-4" />
                <span className="grid min-w-0">
                  <span className="truncate font-semibold">{person.displayName ?? person.handle ?? t("me.title")}</span>
                  <span className="text-xs font-normal text-muted-foreground">{t("me.title")}</span>
                </span>
              </Link>
              <p className="border-t border-border pt-3 text-sm font-semibold">{t("identity.title")}</p>
            </>
          ) : null}
          {!verified ? <>
            <p className="text-sm">{t("identity.lead")}</p>
            <Button pending={linking} disabled={!configuration?.idn || linking} onClick={async () => {
              if (linkRequest.current) return
              const controller = new AbortController()
              linkRequest.current = controller
              setLinking(true)
              let timer: ReturnType<typeof setTimeout> | undefined
              try {
                const result = await withSessionBridgeLock(async () => {
                  controller.signal.throwIfAborted()
                  rotateSessionBridgeFence()
                  return Promise.race([
                    authClient.oauth2.link({ providerId: "idn", callbackURL: browserAppPath(routes.feed()), fetchOptions: { signal: controller.signal } }),
                    new Promise<never>((_resolve, reject) => {
                      timer = setTimeout(() => { controller.abort(); reject(new Error("timeout")) }, 10_000)
                    }),
                  ])
                }, controller.signal)
                if (result.error) toast.error(t("identity.handoffFailed"))
              } catch { toast.error(t("identity.handoffFailed")) }
              finally {
                if (timer) clearTimeout(timer)
                linkRequest.current = null
                setLinking(false)
              }
            }}>{linking ? t("identity.pending") : t("identity.verify")}</Button>
            {!configuration?.idn ? <p className="text-xs text-muted-foreground">{t("identity.unavailable")}</p> : null}
          </> : null}
          <Link href={routes.personalControls()} className="rounded-lg p-2 text-sm font-medium hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring">{t("personal.title")}</Link>
          <p className="text-sm font-medium">{t("identity.applications")}</p>
          {configuration?.applications.filter((app) => app.key !== "antsia_ga").map((app) => (
            <Button key={app.key} variant="ghost" disabled={sso.pending} onClick={async () => {
              try {
                const result = await withSessionBridgeLock(async () => {
                  rotateSessionBridgeFence()
                  return sso.navigateExternal(routes.application(app.origin))
                })
                if (result.kind === "refused") toast.error(t("identity.handoffFailed"))
              } catch { toast.error(t("identity.handoffFailed")) }
            }}>{t(`identity.${app.key}`)}</Button>
          ))}
          <Button variant="outline" onClick={async () => { try { await resumeSessionBridge() } catch { toast.error(t("identity.handoffFailed")) } }}>{tPublic("session.resume")}</Button>
          {account ? (
            <>
              <div className="flex min-h-11 items-center justify-between gap-2 border-t border-border pt-3">
                <span className="text-sm font-medium">{t("account.appearance")}</span>
                <AppearanceToggle />
              </div>
              <Button variant="outline" pending={signingOut} className="justify-start gap-2" onClick={async () => {
                setSigningOut(true)
                await signOutAndRedirect()
              }}>
                <LogOut aria-hidden="true" className="size-4" />
                {t("nav.signOut")}
              </Button>
            </>
          ) : null}
        </section>
      ) : null}
    </div>
  )
}
