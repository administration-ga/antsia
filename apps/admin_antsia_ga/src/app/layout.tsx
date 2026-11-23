import type { Metadata, Viewport } from "next"
import type { ReactNode } from "react"

import { getAppT } from "@/i18n/server"
import { Providers } from "@/components/providers"

import "./globals.css"

export function generateMetadata(): Metadata {
  const { t } = getAppT()
  return {
    title: t("meta.title"),
    description: t("meta.description"),
  }
}

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
}

export default function RootLayout({ children }: { children: ReactNode }) {
  const { locale, t } = getAppT()
  return (
    <html lang={locale} data-charte="admin-antsia" suppressHydrationWarning>
      <head>
        {/* Aucune adresse de page ne part en `Referer` (revue CH-815 F3), comme l'en-tête `Referrer-Policy` de `next.config.ts`. */}
        <meta name="referrer" content="no-referrer" />
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
