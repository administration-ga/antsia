"use client"

import { BRAND_NAME } from "@antsia/social-contracts/brand"
import { AppearanceToggle } from "@antsia/social-features/shell/appearance"
import Link from "next/link"
import { useEffect } from "react"
import { useTranslation } from "react-i18next"

import { SessionProviders } from "@/components/providers"
import { SignInCard } from "@/components/sign-in-screen"
import { DemoEntryLink } from "@/components/demo-embed"
import type { ShopContactContinuation } from "@/lib/shop-contact-continuation"
import type { SpecializedDestination } from "@/lib/specialized-navigation"
import { routes } from "@/lib/routes"

const FOOTER_LINK = "inline-flex min-h-11 items-center rounded-md px-2 text-xs text-muted-foreground hover:text-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring"

export type AccessHomeScreenProps = {
  intent?: "sign-in" | "sign-up"
  signOutIncomplete?: boolean
  publicPostId?: string
  notificationReference?: string
  shopContact?: ShopContactContinuation
  specializedDestination?: SpecializedDestination
}

/** Une même porte responsive pour l'accueil, la connexion et l'inscription. */
export function AccessHomeScreen({ intent = "sign-in", signOutIncomplete = false, publicPostId, notificationReference, shopContact, specializedDestination }: AccessHomeScreenProps = {}) {
  const { t, i18n } = useTranslation("antsia")
  const locale = i18n.resolvedLanguage?.startsWith("en") ? "en" : "fr"

  useEffect(() => { document.documentElement.lang = locale }, [locale])

  function changeLocale(next: "fr" | "en") {
    void i18n.changeLanguage(next)
  }

  return (
    <div className="esp-page-motif relative flex min-h-dvh flex-col bg-background text-foreground">
      {/* Le mode sombre en un appui, avant même la connexion (ADR-0027). */}
      <div className="absolute top-[max(1rem,env(safe-area-inset-top))] right-[max(1rem,env(safe-area-inset-right))] z-10">
        <AppearanceToggle />
      </div>
      <div className="mx-auto grid w-full max-w-[1080px] flex-1 content-start items-start gap-7 px-4 pb-8 pt-10 sm:px-6 sm:pt-14 min-[960px]:grid-cols-[minmax(0,1fr)_400px] min-[960px]:content-center min-[960px]:items-center min-[960px]:gap-20 min-[960px]:py-20">
        <header className="mx-auto max-w-md text-center min-[960px]:mx-0 min-[960px]:max-w-none min-[960px]:pb-20 min-[960px]:text-left">
          <h1 translate="no" className="font-display text-5xl font-bold leading-none tracking-tight text-primary min-[960px]:text-[4.5rem]">
            <Link href={routes.home()} aria-label={`${BRAND_NAME} — ${t("nav.home")}`} style={{ textDecoration: "none" }} className="rounded-lg focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring focus-visible:outline-offset-4">{BRAND_NAME}</Link>
          </h1>
          <p className="mx-auto mt-4 max-w-xs text-xl font-medium leading-snug tracking-tight sm:max-w-md sm:text-2xl min-[960px]:mx-0 min-[960px]:mt-6 min-[960px]:max-w-lg min-[960px]:text-[2rem]">{t("access.headline")}</p>
          <p className="mt-4 hidden max-w-md text-lg leading-relaxed text-muted-foreground min-[960px]:block">{t("access.lead")}</p>
        </header>
        <div className="mx-auto w-full min-w-0 max-w-[420px]">
          <SessionProviders>
            <main id="contenu" tabIndex={-1} className="focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring">
              <SignInCard compact intent={intent} signOutIncomplete={signOutIncomplete} publicPostId={publicPostId} notificationReference={notificationReference} shopContact={shopContact} specializedDestination={specializedDestination} />
            </main>
          </SessionProviders>
          <div className="mt-3 text-center">
            <DemoEntryLink />
            <Link href={routes.discover()} prefetch={false} className="inline-flex min-h-11 items-center justify-center rounded-lg px-4 text-sm text-muted-foreground underline underline-offset-4 hover:text-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring">{t("access.discover")}</Link>
          </div>
        </div>
      </div>
      <footer className="border-t border-border bg-card px-4 py-4 min-[960px]:py-5">
        <nav aria-label={t("access.footer")} className="mx-auto flex max-w-[1060px] flex-wrap items-center justify-center gap-x-2 min-[960px]:justify-start">
          <Link href={routes.about()} prefetch={false} className={FOOTER_LINK}>{t("access.about")}</Link>
          <Link href={routes.legal()} prefetch={false} className={FOOTER_LINK}>{t("access.legal")}</Link>
          <Link href={routes.privacy()} prefetch={false} className={FOOTER_LINK}>{t("access.privacy")}</Link>
          <span aria-hidden="true" className="mx-1 text-muted-foreground">·</span>
          {(["fr", "en"] as const).map((language) => <button key={language} type="button" lang={language} aria-pressed={locale === language} onClick={() => changeLocale(language)} className={`${FOOTER_LINK} ${locale === language ? "font-semibold text-foreground" : ""}`}>{t(language === "fr" ? "access.french" : "access.english")}</button>)}
        </nav>
        <p className="mx-auto max-w-[1060px] text-center text-xs text-muted-foreground min-[960px]:text-left">{t("access.signature")}</p>
      </footer>
    </div>
  )
}
