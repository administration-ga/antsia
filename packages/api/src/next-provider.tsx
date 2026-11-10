// Dupliqué de plateforme/espace/espace_administration_ga/src/lib/convex-provider.tsx @ ad2e7fdc2 — adaptations : fournisseur partagé par les applications du moteur (URL Convex, client d'authentification, mutation « ma personne » et textes reçus en props) ; client Convex mémorisé par URL ; garde réactive de session avant le montage des surfaces personnelles.
"use client"

import { ConvexQueryClient } from "@convex-dev/react-query"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { useConvexAuth, useMutation, useQuery } from "convex/react"
import type { FunctionReference } from "convex/server"
import { type ReactNode, useEffect, useMemo, useRef, useState } from "react"

import type { CrossDomainStorage, RefreshableCrossDomainAuthClient } from "./cross-domain-session-bootstrap"
import { isSigningOutEverywhere } from "./sign-out-everywhere"
import { type SessionBootstrapLabels, StableConvexBetterAuthProvider } from "./stable-convex-better-auth-provider"

/** Le couple reste indivisible : Convex doit notifier le cache réellement monté. */
type EngineClients = { convex: ConvexQueryClient; query: QueryClient; connected: boolean }
const clients = new Map<string, EngineClients>()

function engineClientsFor(convexUrl: string): EngineClients {
  // Aucun cache partagé entre requêtes serveur ; un couple par URL dans le document client.
  const known = typeof window === "undefined" ? undefined : clients.get(convexUrl)
  if (known) return known
  const convex = new ConvexQueryClient(convexUrl)
  const query = new QueryClient({
    defaultOptions: {
      queries: {
        queryKeyHashFn: convex.hashFn(),
        queryFn: convex.queryFn(),
        refetchOnWindowFocus: false,
        refetchOnReconnect: false,
        staleTime: 5 * 60 * 1000,
      },
    },
  })
  const pair: EngineClients = { convex, query, connected: false }
  if (typeof window !== "undefined") clients.set(convexUrl, pair)
  return pair
}

function connectOnce(pair: EngineClients): void {
  if (pair.connected) return
  pair.convex.connect(pair.query)
  pair.connected = true
}

/** Crée la personne du moteur à la première session authentifiée (rien n'est recopié ni publié). */
function PersonSync({ ensurePerson, children }: { ensurePerson: FunctionReference<"mutation", "public">; children: ReactNode }) {
  const { isAuthenticated } = useConvexAuth()
  const ensure = useMutation(ensurePerson)
  const synced = useRef(false)

  useEffect(() => {
    if (isAuthenticated && !synced.current && !isSigningOutEverywhere()) {
      synced.current = true
      ensure({}).catch((error: unknown) => {
        if (!isSigningOutEverywhere()) console.warn("[auth] création de la personne impossible", error)
      })
    }
    if (!isAuthenticated) synced.current = false
  }, [isAuthenticated, ensure])

  return <>{children}</>
}

/**
 * Une révocation distante invalide immédiatement les surfaces montées, même
 * lorsque le JWT Convex de cet onglet n'a pas encore expiré. Le rechargement
 * reprend l'amorçage avec la session réelle de l'origine, sans révoquer une
 * éventuelle autre session qui aurait entre-temps remplacé son cookie.
 */
function LiveSessionGate({ query, loadingLabel, children }: {
  query: FunctionReference<"query", "public", Record<string, never>, boolean>
  loadingLabel: string
  children: ReactNode
}) {
  const { isAuthenticated, isLoading } = useConvexAuth()
  const isActive = useQuery(query, isAuthenticated ? {} : "skip")
  type SessionPhase = "anonymous" | "authenticated" | "verified" | "revoked"
  const [phase, setPhase] = useState<SessionPhase>("anonymous")
  let observedPhase = phase
  if (isAuthenticated && phase !== "revoked") {
    if (isActive === false) observedPhase = "revoked"
    else if (isActive === true) observedPhase = "verified"
    else if (phase === "anonymous") observedPhase = "authenticated"
  }
  // État dérivé conditionnel : React rejoue immédiatement ce rendu. Une
  // révocation reste acquise même lorsque la requête est ensuite « skip » ;
  // aucun ref n'est lu ni modifié pendant le rendu.
  if (observedPhase !== phase) setPhase(observedPhase)
  const hasSessionExperience = observedPhase !== "anonymous"
  const mustReload = observedPhase === "revoked"
  const reloadStarted = useRef(false)

  useEffect(() => {
    if (!hasSessionExperience || isAuthenticated || isLoading || mustReload) return
    // Convex peut brièvement publier false/false lors du cleanup de setAuth
    // avant de valider le JWT renouvelé. Préserver les salles déjà validées
    // pendant cette grâce ; un refus explicite de mySession reste immédiat.
    const timer = setTimeout(() => setPhase("revoked"), 1_500)
    return () => clearTimeout(timer)
  }, [hasSessionExperience, isAuthenticated, isLoading, mustReload])

  useEffect(() => {
    if (!mustReload || reloadStarted.current) return
    let cancelled = false
    let timer: ReturnType<typeof setTimeout> | undefined
    const reloadWhenReady = () => {
      if (cancelled || reloadStarted.current) return
      // Notre propre révocation précède la purge locale ; attendre cette purge
      // laisse aussi l'appelant afficher les éventuels échecs de déconnexion.
      if (isSigningOutEverywhere()) {
        timer = setTimeout(reloadWhenReady, 200)
        return
      }
      reloadStarted.current = true
      window.location.reload()
    }
    // La sortie locale garde son verrou jusqu'au remplacement du document.
    // Différer aussi le premier contrôle pour laisser les effets se stabiliser.
    timer = setTimeout(reloadWhenReady, 0)
    return () => {
      cancelled = true
      if (timer !== undefined) clearTimeout(timer)
    }
  }, [mustReload])

  const canRender = !mustReload && (observedPhase === "verified" || (!hasSessionExperience && !isAuthenticated && !isLoading))
  if (!canRender) {
    return (
      <div role="status" aria-label={loadingLabel} className="flex min-h-dvh w-full flex-col items-center justify-center gap-3 p-4 text-center">
        <span aria-hidden="true" className="size-6 animate-spin rounded-full border-2 border-current border-r-transparent" />
        <p>{loadingLabel}</p>
      </div>
    )
  }

  return <>{children}</>
}

export function EngineConvexProvider(props: {
  convexUrl: string
  authClient: RefreshableCrossDomainAuthClient
  storage?: CrossDomainStorage
  ensurePerson: FunctionReference<"mutation", "public">
  isSessionActive?: FunctionReference<"query", "public", Record<string, never>, boolean>
  labels: SessionBootstrapLabels
  children: ReactNode
}) {
  const pair = useMemo(() => engineClientsFor(props.convexUrl), [props.convexUrl])

  useEffect(() => {
    connectOnce(pair)
  }, [pair])

  const content = <PersonSync ensurePerson={props.ensurePerson}>{props.children}</PersonSync>

  return (
    <QueryClientProvider client={pair.query}>
      <StableConvexBetterAuthProvider client={pair.convex.convexClient} authClient={props.authClient} labels={props.labels} storage={props.storage}>
        {props.isSessionActive ? (
          <LiveSessionGate query={props.isSessionActive} loadingLabel={props.labels.loading}>{content}</LiveSessionGate>
        ) : content}
      </StableConvexBetterAuthProvider>
    </QueryClientProvider>
  )
}
