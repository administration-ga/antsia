import { CSP_NONCE_HEADER } from "@antsia/api/csp"
import type { Metadata, Viewport } from "next"
import { headers } from "next/headers"
import type { ReactNode } from "react"

import { AppearanceBootScript } from "@/components/appearance-boot-script"
import { Providers } from "@/components/providers"
import { getAppT } from "@/i18n/server"
import { configuredMetadataOrigin, getPublicLocale } from "@/lib/server-session"

// Feuille de LiveKit (salles d'appel) AVANT celle de l'application : la couche
// de communication du moteur (classes `.iappel-*`) la surcharge.
import "@livekit/components-styles"
import "./globals.css"

export async function generateMetadata(): Promise<Metadata> {
  const { t } = getAppT(await getPublicLocale())
  const origin = configuredMetadataOrigin()
  return {
    title: t("meta.title"),
    description: t("meta.description"),
    ...(origin ? { metadataBase: new URL(origin) } : {}),
  }
}

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
}

export default async function RootLayout({ children }: { children: ReactNode }) {
  const { locale, t } = getAppT(await getPublicLocale())
  const nonce = (await headers()).get(CSP_NONCE_HEADER) ?? undefined
  return (
    <html lang={locale} data-charte="antsia" data-scroll-behavior="smooth" suppressHydrationWarning>
      <head>
        {/* Thème et mode sombre de l'appareil posés avant le premier affichage (ADR-0026). */}
        <AppearanceBootScript nonce={nonce} />
      </head>
      <body className="min-h-dvh">
        <a
          href="#contenu"
          className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-md focus:bg-card focus:px-4 focus:py-2"
        >
          {t("skipToContent")}
        </a>
        <Providers locale={locale}>{children}</Providers>
      </body>
    </html>
  )
}
