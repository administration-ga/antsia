"use client"

import { isSigningOutEverywhere } from "@antsia/api/sign-out-everywhere"
import { useOptionalAppearance } from "@antsia/social-features/shell/appearance"
import { api } from "@convex/_generated/api"
import { ConvexHttpClient } from "convex/browser"
import { usePathname } from "next/navigation"
import { useEffect } from "react"

import { authClient } from "@/lib/auth-client"
import { loadPublicAccountTheme } from "@/lib/public-account-theme"
import { sdkSessionCookie } from "@/lib/session-bridge"
import { currentSessionBridgeGeneration } from "@/lib/session-bridge-client"

/**
 * Les pages publiques restent rendues au serveur sans fiche ni préférence du
 * compte. Cet îlot invisible relit seulement le thème avec le SDK déjà présent,
 * sans SessionProviders, provisioning, adoption d'OTT ou nouvelle authentification.
 */
export function PublicAccountTheme({ enabled }: { enabled: boolean }) {
  const setTheme = useOptionalAppearance()?.setTheme
  const pathname = usePathname()
  useEffect(() => {
    const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL ?? ""
    if (!enabled || !setTheme || !convexUrl) return
    const controller = new AbortController()
    void loadPublicAccountTheme({
      sessionKey: () => {
        const cookie = sdkSessionCookie(authClient.getCookie())
        return cookie ? `${cookie.name}=${cookie.value}` : null
      },
      generation: currentSessionBridgeGeneration,
      signingOut: isSigningOutEverywhere,
      token: (signal) => authClient.convex.token({ fetchOptions: { throw: false, signal } }),
      readTheme: async (token, signal) => {
        // Un client éphémère : aucun jeton ou DTO privé dans un cache SSR/public.
        const client = new ConvexHttpClient(convexUrl, {
          fetch: (input, init) => fetch(input, { ...init, cache: "no-store", signal }),
        })
        client.setAuth(token)
        try {
          const person = await client.query(api.modules.people.persons.getMyPerson, {})
          return person?.theme
        } finally { client.clearAuth() }
      },
      apply: setTheme,
      signal: controller.signal,
    })
    return () => controller.abort()
  }, [enabled, pathname, setTheme])
  return null
}
