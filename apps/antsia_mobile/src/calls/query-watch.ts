import type { Watch } from "convex/react"

/** Observe la valeur courante et les mises à jour, sous la même durée de vie. */
export function watchNativeQuery<T>(watch: Pick<Watch<T>, "onUpdate" | "localQueryResult">, value: (result: T) => void, failed: () => void): () => void {
  let active = true
  const read = () => {
    if (!active) return
    try {
      const result = watch.localQueryResult()
      if (result !== undefined) value(result)
    } catch { failed() }
  }
  const unsubscribe = watch.onUpdate(read)
  // L'appelant possède le désabonnement avant qu'une valeur en cache puisse fermer sa session.
  queueMicrotask(read)
  return () => { if (active) { active = false; unsubscribe() } }
}
