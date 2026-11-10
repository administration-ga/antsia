import type { api } from "@convex/_generated/api"
import type { FunctionReturnType } from "convex/server"

import { demoStorageNamespace } from "./demo-storage"

/** Un compte de démonstration, tel que le catalogue de développement le rend. */
export type DemoAccount = FunctionReturnType<typeof api.modules.platform.demoAccounts.catalogue>[number]

/** Le compte choisi à l'écran de connexion, relu par l'automate d'accueil (cet onglet seulement). */
export const DEMO_ACCOUNT_KEY = `${demoStorageNamespace()}antsia:antsia:demo-account`

function isDemoAccount(value: unknown): value is DemoAccount {
  if (typeof value !== "object" || value === null) return false
  const entry = value as Record<string, unknown>
  if (typeof entry.actor !== "string" || typeof entry.email !== "string") return false
  if (entry.profile === null) return true
  if (typeof entry.profile !== "object") return false
  const profile = entry.profile as Record<string, unknown>
  return typeof profile.handle === "string" && typeof profile.displayName === "string" && typeof profile.headline === "string"
}

/** Mémorise le compte choisi avant la connexion ; un stockage refusé n'empêche pas d'entrer. */
export function rememberDemoAccount(account: DemoAccount): void {
  try {
    window.sessionStorage.setItem(DEMO_ACCOUNT_KEY, JSON.stringify(account))
  } catch {
    // Sans stockage, l'accueil reste à remplir à la main.
  }
}

/** Le compte en attente de préparation, ou `null`. */
export function pendingDemoAccount(): DemoAccount | null {
  try {
    const raw = window.sessionStorage.getItem(DEMO_ACCOUNT_KEY)
    if (raw === null) return null
    const parsed: unknown = JSON.parse(raw)
    return isDemoAccount(parsed) ? parsed : null
  } catch {
    return null
  }
}

/** Oublie le compte en attente (préparé, abandonné ou refusé). */
export function forgetDemoAccount(): void {
  try {
    window.sessionStorage.removeItem(DEMO_ACCOUNT_KEY)
  } catch {
    // Rien à oublier.
  }
}
