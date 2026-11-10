"use client"

import type { RefreshableCrossDomainAuthClient } from "@antsia/api/cross-domain-session-bootstrap"
import { useStableConvexAuth } from "@antsia/api/hooks"
import { EngineConvexProvider } from "@antsia/api/next-provider"
import { ViewerPreferencesProvider } from "@antsia/api/viewer-preferences"
import { AppearanceProvider, useOptionalAppearance } from "@antsia/social-features/shell/appearance"
import { BRAND_NAME } from "@antsia/social-contracts/brand"
import type { Locale } from "@antsia/social-features/i18n"
import { I18nProvider } from "@antsia/social-features/i18n/client"
import { api } from "@convex/_generated/api"
import { useQuery } from "convex/react"
import { createContext, type ReactNode, useCallback, useContext, useEffect } from "react"
import { useTranslation } from "react-i18next"

import { APP_NAMESPACE, appResources } from "@/i18n/resources"
import { APPEARANCE } from "@/lib/appearance"
import { authClient } from "@/lib/auth-client"
import { demoSessionStorage } from "@/lib/demo-storage"
import { UsagePermissionProvider } from "./analytics-permission"
import { DemoAccountBootstrap } from "./demo-account-bootstrap"
import { DemoModeBanner } from "./demo-embed"
import { PersonalTheme } from "./personal-theme"
import { SessionBridge, SessionBridgePreflight } from "./session-bridge"
import { ToastRegion } from "./toast-region"

const CONVEX_URL = process.env.NEXT_PUBLIC_CONVEX_URL ?? ""
const SessionProvidersContext = createContext(false)

/** La préférence personnelle s'applique après preuve de session, sans recopier les claims IDN ; le thème suit le compte. */
function PersonalLocale({ children }: { children: ReactNode }) {
  const { isAuthenticated } = useStableConvexAuth()
  const person = useQuery(api.modules.people.persons.getMyPerson, isAuthenticated ? {} : "skip")
  const { i18n } = useTranslation()
  useEffect(() => {
    if (!person?.locale) return
    document.documentElement.lang = person.locale
    if (i18n.language !== person.locale) void i18n.changeLanguage(person.locale)
  }, [person?.locale, i18n])
  return (
    <ViewerPreferencesProvider timeZone={person?.timeZone}>
      <PersonalTheme signedIn={isAuthenticated && !!person} accountTheme={person?.theme}>{children}</PersonalTheme>
    </ViewerPreferencesProvider>
  )
}

/** P18b (A07) : la région des toasts reste annoncée pendant une modale (hôte exempté de l'inertage). */
function EngineToaster() {
  const appearance = useOptionalAppearance()
  return <ToastRegion theme={appearance?.resolvedAppearance ?? "light"} position="top-center" richColors closeButton />
}

/** Session Better Auth + client Convex ; sans moteur configuré, un avertissement plutôt qu'un écran blanc. */
export function SessionProviders({ children }: { children: ReactNode }) {
  const alreadyProvided = useContext(SessionProvidersContext)
  const { t } = useTranslation(APP_NAMESPACE)
  // /entrer possède une porte de session et réutilise la carte d'accueil :
  // son îlot imbriqué ne redémarre ni le SDK, ni Convex, ni le pont de session.
  if (alreadyProvided) return children
  if (!CONVEX_URL) {
    return (
      <main id="contenu" tabIndex={-1} className="mx-auto flex min-h-dvh max-w-xl flex-col justify-center px-6 focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring">
        <p role="alert" className="rounded-xl border border-border bg-card p-4 text-card-foreground">
          {t("session.backendMissing")}
        </p>
      </main>
    )
  }
  return (
    <SessionProvidersContext.Provider value><SessionBridgePreflight><EngineConvexProvider
      convexUrl={CONVEX_URL}
      authClient={authClient as unknown as RefreshableCrossDomainAuthClient}
      storage={demoSessionStorage()}
      ensurePerson={api.modules.people.persons.ensureMyPerson}
      isSessionActive={api.modules.platform.authentication.mySession}
      labels={{ loading: t("session.loading"), failed: t("session.failed"), retry: t("session.retry") }}
    >
      <SessionBridge><PersonalLocale><DemoAccountBootstrap />{children}</PersonalLocale></SessionBridge>
    </EngineConvexProvider></SessionBridgePreflight></SessionProvidersContext.Provider>
  )
}

/**
 * L'apparence d'antsia.ga : ses thèmes, ses motifs, et le NOM de chaque thème dans la
 * langue de la personne (ADR-0030) — le rail du moteur propose alors le thème à côté
 * de l'apparence, avec les mêmes noms que Préférences > Thème.
 */
function AppAppearance({ children }: { children: ReactNode }) {
  const { t } = useTranslation(APP_NAMESPACE)
  const themeName = useCallback((id: string) => t(`preferences.theme.options.${id}.name`), [t])
  return (
    <AppearanceProvider storagePrefix={APPEARANCE.storagePrefix} themes={APPEARANCE.themes} motifs={APPEARANCE.motifs} themeName={themeName}>
      {children}
    </AppearanceProvider>
  )
}

export function Providers({ locale, children }: { locale: Locale; children: ReactNode }) {
  return (
    <I18nProvider locale={locale} appResources={appResources} defaultNS={APP_NAMESPACE} defaultVariables={{ brand: BRAND_NAME }}>
      <AppAppearance>
        <UsagePermissionProvider><DemoModeBanner />{children}</UsagePermissionProvider>
        <EngineToaster />
      </AppAppearance>
    </I18nProvider>
  )
}
