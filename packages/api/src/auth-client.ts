// Dupliqué de plateforme/espace/espace_administration_ga/src/lib/auth-client.ts @ 25398f565 — adaptations : fabrique partagée par les applications du moteur ; greffons de session Convex, crossDomain, codes e-mail/SMS, IDN et passage entre applications à usage unique (PA4), sans mot de passe.
"use client"

import { convexClient, crossDomainClient } from "@convex-dev/better-auth/client/plugins"
import { emailOTPClient, genericOAuthClient, oneTimeTokenClient, phoneNumberClient } from "better-auth/client/plugins"
import { createAuthClient } from "better-auth/react"

import type { CrossDomainStorage } from "./cross-domain-session-bootstrap"

export type EngineAuthClientOptions = {
  basePath?: string
  storage?: CrossDomainStorage
}

/**
 * Client Better Auth d'une application du moteur. Les requêtes passent par le
 * proxy `/api/auth/*` de l'application elle-même (même origine) → actions HTTP
 * Convex ; le greffon `crossDomain` garde la session par origine.
 */
function buildClient(options: EngineAuthClientOptions = {}) {
  return createAuthClient({
    baseURL: typeof window !== "undefined" ? window.location.origin : undefined,
    ...(options.basePath !== undefined ? { basePath: options.basePath } : {}),
    plugins: [convexClient(), crossDomainClient(options.storage ? { storage: options.storage } : undefined), emailOTPClient(), genericOAuthClient(), phoneNumberClient(), oneTimeTokenClient()],
  })
}

type Client = ReturnType<typeof buildClient>

/**
 * `ConvexBetterAuthProvider` attend le type-mère `AuthClient`, dont
 * `useSession().data` vaut `never` avec better-auth 1.6 ; on garde l'inférence
 * complète des greffons et on n'élargit que les deux membres que le fournisseur
 * vérifie (même contournement que le socle).
 */
export type EngineAuthClient = Omit<Client, "useSession" | "$Infer"> & {
  useSession: Client["useSession"] & ((...args: never[]) => unknown)
  $Infer: unknown
}

export function createEngineAuthClient(options: EngineAuthClientOptions = {}): EngineAuthClient {
  return buildClient(options) as unknown as EngineAuthClient
}
