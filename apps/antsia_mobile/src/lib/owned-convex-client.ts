import { useEffect, useRef, useState } from "react"
import { ConvexReactClient } from "convex/react"

type ReleasableClient = Pick<ConvexReactClient, "clearAuth" | "close">

/**
 * React nettoie un sous-arbre supprimé du parent vers les enfants : ConvexProviderWithAuth appelle
 * encore `clearAuth` APRÈS le nettoyage du transport, et un client déjà fermé lève
 * « ConvexReactClient has already been closed », fatal en natif. Le jeton part tout de suite ;
 * la fermeture attend la fin du démontage et ignore un rejeu d'effet de développement.
 */
export function releaseOwnedClient(client: ReleasableClient, stillOwned: () => boolean): void {
  client.clearAuth()
  queueMicrotask(() => { if (stillOwned()) void client.close() })
}

/** Un client par transport, fermé une seule fois, après tout son sous-arbre. */
export function useOwnedConvexClient(convexUrl: string): ConvexReactClient {
  const [client] = useState(() => new ConvexReactClient(convexUrl, { unsavedChangesWarning: false }))
  const lifetime = useRef(0)
  useEffect(() => {
    const generation = ++lifetime.current
    return () => releaseOwnedClient(client, () => lifetime.current === generation)
  }, [client])
  return client
}
