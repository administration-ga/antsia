/** Animation bornée des seuls comptes fictifs, locale ou démo déclarée. */
import { devToolsAllowed } from "../lib/devTools"

export const DEMO_CONTENT_CONFIRMATION = "ANTSIA_DEMO_CONTENT_2026_10_20"
export const DEMO_CONTENT_VERSION = "animation-20261020"
export const DEMO_CONTENT_DEPLOYMENT = "vivid-hedgehog-655"
export const DEMO_CONTENT_ACTORS = ["membre", "verifie", "presse", "commercant", "association", "administration", "moderateur"] as const

/** Une copie des flags en production ne suffit jamais à ouvrir cette graine. */
export function demoContentAllowed(env: Record<string, string | undefined> = process.env): boolean {
  if (devToolsAllowed(env)) return true
  try {
    const url = new URL(env.CONVEX_CLOUD_URL ?? "")
    return url.protocol === "https:" && !url.port && !url.username && !url.password
      && url.hostname === `${DEMO_CONTENT_DEPLOYMENT}.convex.cloud`
      && env.ANTSIA_DEMO_DEPLOYMENT === DEMO_CONTENT_DEPLOYMENT
  } catch { return false }
}

export function assertDemoContentAllowed(confirmation: string): void {
  if (confirmation !== DEMO_CONTENT_CONFIRMATION || !demoContentAllowed()) {
    throw new Error("Animation refusée : confirmation et environnement de démonstration requis.")
  }
}
