"use client"

import { useRouter, useSearchParams } from "next/navigation"
import { Suspense, useEffect, useRef, useState, type ReactNode } from "react"
import { useTranslation } from "react-i18next"
import { Button } from "@/components/shared/controls"
import { editorialReadingSearch, type EditorialReadingSearch } from "@/lib/editorial-reading"
import { routes } from "@/lib/routes"

/** La nouvelle sélection attend sa projection SSR ; aucun accès client alternatif ni repli de session. */
export function PublicEditorialNavigation(props: { handle: string; search: EditorialReadingSearch; snapshotId: string; children: ReactNode }) {
  const { t } = useTranslation("editorialPublic")
  return <Suspense fallback={<p role="status">{t("loading")}</p>}><Transition {...props} /></Suspense>
}
function Transition({ handle, search, snapshotId, children }: { handle: string; search: EditorialReadingSearch; snapshotId: string; children: ReactNode }) {
  const params = useSearchParams(), router = useRouter(), { t } = useTranslation("editorialPublic")
  const raw = Object.fromEntries([...new Set(params.keys())].map(key => { const values = params.getAll(key); return [key, values.length === 1 ? values[0]! : values] }))
  const selected = editorialReadingSearch(raw), rendered = routes.publicMedia(handle, search.section, search.cursor)
  const desired = selected ? routes.publicMedia(handle, selected.section, selected.cursor) : `invalid:${params.toString()}`
  const handoff = params.has("ott"), [handoffSnapshot, setHandoffSnapshot] = useState<string | null>(null)
  if (handoff && handoffSnapshot !== snapshotId) setHandoffSnapshot(snapshotId)
  const mismatch = handoff || handoffSnapshot === snapshotId || rendered !== desired
  const key = JSON.stringify([desired, params.getAll("ott")]), requested = useRef<string | null>(null)
  const [stalled, setStalled] = useState<string | null>(null), [retry, setRetry] = useState(0)
  useEffect(() => {
    if (!mismatch) { requested.current = key; return }
    if (requested.current === key) return
    requested.current = key
    router.refresh()
    const timer = window.setTimeout(() => setStalled(key), 15_000)
    return () => window.clearTimeout(timer)
  }, [key, mismatch, retry, router])
  if (!mismatch) return children
  if (stalled === key) return <div className="grid gap-3" role="alert"><p>{t("unavailable")}</p><Button variant="outline" onClick={() => { requested.current = null; setStalled(null); setRetry(value => value + 1) }}>{t("retry")}</Button></div>
  return <p role="status" aria-live="polite" aria-busy="true">{t("loading")}</p>
}
