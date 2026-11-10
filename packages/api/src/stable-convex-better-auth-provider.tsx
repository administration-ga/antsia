// Dupliqué de socle/packages/api/src/stable-convex-better-auth-provider.tsx @ ad2e7fdc2 — adaptations : textes d'attente et d'échec reçus de l'application (`labels`, déjà traduits) ; classes de la charte ; session absente montée sous un fournisseur anonyme qui ne relit aucun cookie.
"use client"

import { ConvexBetterAuthProvider } from "@convex-dev/better-auth/react"
import { ConvexProviderWithAuth } from "convex/react"
import type { ComponentProps, ReactNode } from "react"
import { useEffect, useState } from "react"

import { refreshCrossDomainSession, type CrossDomainStorage, type RefreshableCrossDomainAuthClient, type SessionBootstrapResult, takeOneTimeToken } from "./cross-domain-session-bootstrap"

type UpstreamProps = ComponentProps<typeof ConvexBetterAuthProvider>

/** Textes affichés pendant l'amorçage de la session, fournis TRADUITS par l'application. */
export type SessionBootstrapLabels = {
  loading: string
  failed: string
  retry: string
}

export type StableConvexBetterAuthProviderProps = Omit<UpstreamProps, "authClient" | "initialToken" | "children"> & {
  authClient: RefreshableCrossDomainAuthClient
  initialToken?: string | null
  storage?: CrossDomainStorage
  labels: SessionBootstrapLabels
  children: ReactNode
}

type BootstrapState = { status: "loading" } | { status: "ready"; token: string | null } | { status: "error"; retry: number }

/**
 * Verrou d'unicité de l'amorçage, par client d'authentification : le
 * one-time-token est à USAGE UNIQUE et StrictMode joue les effets deux fois en
 * développement.
 */
const bootstrapByClient = new WeakMap<object, Map<CrossDomainStorage | undefined, Promise<SessionBootstrapResult>>>()

const anonymousAuth = {
  isLoading: false,
  isAuthenticated: false,
  fetchAccessToken: async () => null,
}

function useAnonymousAuth() {
  return anonymousAuth
}

function bootstrapOnce(authClient: RefreshableCrossDomainAuthClient, storage?: CrossDomainStorage): Promise<SessionBootstrapResult> {
  const promises = bootstrapByClient.get(authClient) ?? new Map<CrossDomainStorage | undefined, Promise<SessionBootstrapResult>>()
  const existing = promises.get(storage)
  if (existing) return existing

  let oneTimeToken: string | null = null
  if (typeof window !== "undefined" && window.location?.href) {
    const taken = takeOneTimeToken(window.location.href)
    oneTimeToken = taken.token
    // Retiré de la barre d'adresse AVANT le montage : l'effet amont ne doit plus rien y trouver.
    if (taken.token) window.history.replaceState({}, "", taken.href)
  }

  const pending = refreshCrossDomainSession(authClient, { oneTimeToken, ...(storage ? { storage } : {}) })
  promises.set(storage, pending)
  bootstrapByClient.set(authClient, promises)
  return pending
}

/**
 * ConvexBetterAuthProvider avec amorçage cross-domain déterministe : un JWT
 * Convex expiré ne laisse pas l'application sur une attente infinie, et le jeton
 * servi à Convex décrit bien la personne qui arrive.
 */
export function StableConvexBetterAuthProvider({ children, client, authClient, initialToken, labels, storage }: StableConvexBetterAuthProviderProps) {
  const [retry, setRetry] = useState(0)
  const [state, setState] = useState<BootstrapState>(() => (initialToken !== undefined ? { status: "ready", token: initialToken } : { status: "loading" }))

  useEffect(() => {
    if (initialToken !== undefined) {
      setState({ status: "ready", token: initialToken })
      return
    }
    // Un simple drapeau, pas un AbortController : abandonner en plein vol
    // consommerait le one-time-token pour rien.
    let cancelled = false
    setState({ status: "loading" })
    bootstrapOnce(authClient, storage)
      .then((result) => {
        if (cancelled) return
        // Le client Convex est un singleton de module : nettoyer l'auth d'un montage précédent.
        if (result.token === null) client.clearAuth()
        setState({ status: "ready", token: result.token })
      })
      .catch((error: unknown) => {
        if (cancelled) return
        console.warn("[auth-bootstrap] renouvellement de session impossible", error)
        setState({ status: "error", retry })
      })
    return () => {
      cancelled = true
    }
  }, [authClient, client, initialToken, retry, storage])

  if (state.status === "loading") {
    return (
      <div role="status" aria-label={labels.loading} className="flex min-h-dvh w-full flex-col items-center justify-center gap-3 p-4 text-center">
        <span aria-hidden="true" className="size-6 animate-spin rounded-full border-2 border-current border-r-transparent" />
        <p>{labels.loading}</p>
      </div>
    )
  }

  if (state.status === "error") {
    return (
      <div role="alert" className="flex min-h-dvh w-full flex-col items-center justify-center gap-3 p-4 text-center">
        <p>{labels.failed}</p>
        <button
          type="button"
          className="rounded-md border border-border px-4 py-2"
          onClick={() => {
            // Sans cet oubli, le verrou resservirait la même promesse échouée.
            bootstrapByClient.get(authClient)?.delete(storage)
            setRetry((value) => value + 1)
          }}
        >
          {labels.retry}
        </button>
      </div>
    )
  }

  if (state.token === null) {
    // initialToken:null ne ferme pas useSession chez Better Auth : un ancien
    // cookie HTTP pourrait réauthentifier l'origine malgré notre conclusion.
    // Une connexion réussie fait une navigation complète et réamorce le client.
    return <ConvexProviderWithAuth client={client} useAuth={useAnonymousAuth}>{children}</ConvexProviderWithAuth>
  }

  return (
    <ConvexBetterAuthProvider client={client} authClient={authClient as unknown as UpstreamProps["authClient"]} initialToken={state.token}>
      {children}
    </ConvexBetterAuthProvider>
  )
}
