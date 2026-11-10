"use client"

import { useRouter, useSearchParams } from "next/navigation"
import { Suspense, useEffect, useRef, useState, type ReactNode } from "react"
import { useTranslation } from "react-i18next"
import { Button } from "@/components/shared/controls"
import { catalogFilters, catalogSearch, type CatalogSearch } from "@/lib/catalog-search"
import { routes } from "@/lib/routes"

/** Le catalogue public garde sa projection/session SSR ; aucune lecture privée côté client. */
export function PublicCatalogNavigation({ handle, search, snapshotId, children, provider = false }: { handle: string; search: CatalogSearch; snapshotId: string; children: ReactNode; provider?: boolean }) {
  const { t } = useTranslation("shops")
  return <Suspense fallback={<p role="status">{t("catalog.loading")}</p>}><PublicCatalogTransition handle={handle} search={search} snapshotId={snapshotId} provider={provider}>{children}</PublicCatalogTransition></Suspense>
}

function PublicCatalogTransition({ handle, search, snapshotId, children, provider }: { handle: string; search: CatalogSearch; snapshotId: string; children: ReactNode; provider: boolean }) {
  const params = useSearchParams()
  const router = useRouter()
  const { t } = useTranslation("shops")
  const href = provider ? routes.publicProviderCatalog : routes.publicShopCatalog
  const rendered = href(handle, catalogFilters(search), search.cursor)
  const raw = params ? Object.fromEntries([...new Set(params.keys())].filter(key => key !== "ott").map(key => { const values = params.getAll(key); return [key, values.length === 1 ? values[0]! : values] })) : null
  const parsed = raw ? catalogSearch(raw) : search
  const selection = parsed && (!provider || parsed.kind !== "product") ? { ...parsed, ...(provider ? { kind: "service" as const } : {}) } : null
  const desired = selection ? href(handle, catalogFilters(selection), selection.cursor) : `invalid:${params?.toString() ?? ""}`
  const hasHandoff = params?.has("ott") ?? false
  const [handoffSnapshot, setHandoffSnapshot] = useState<string | null>(null)
  // Le SDK retire le jeton avant son échange. Ce retrait ne réadmet jamais l'ancien SSR.
  if (hasHandoff && handoffSnapshot !== snapshotId) setHandoffSnapshot(snapshotId)
  // Les valeurs restent uniquement en mémoire : deux OTT distincts ne partagent pas une demande.
  const desiredKey = JSON.stringify([desired, params?.getAll("ott") ?? []])
  const mismatch = hasHandoff || handoffSnapshot === snapshotId || desired !== rendered
  const requested = useRef<string | null>(null)
  const [stalled, setStalled] = useState<string | null>(null)
  const [retry, setRetry] = useState(0)
  useEffect(() => {
    if (!mismatch) { requested.current = desiredKey; return }
    if (requested.current === desiredKey) return
    requested.current = desiredKey
    // Une demande par changement d'URL canonique. Le document et sa session restent en place.
    router.refresh()
    const timeout = window.setTimeout(() => setStalled(desiredKey), 15_000)
    return () => window.clearTimeout(timeout)
  }, [desiredKey, mismatch, retry, router])
  if (!mismatch) return children
  if (stalled === desiredKey) return <div role="alert" className="grid gap-3"><p>{t("catalog.unavailable")}</p><Button variant="outline" className="justify-self-start" onClick={() => { requested.current = null; setStalled(null); setRetry(value => value + 1) }}>{t("common.retry")}</Button></div>
  // Les anciennes offres sont masquées dès la navigation, avant la nouvelle lecture serveur.
  return <p role="status" aria-live="polite" aria-busy="true">{t("catalog.loading")}</p>
}
