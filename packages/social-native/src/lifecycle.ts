/** Barrière d'époque synchrone : une opération lancée sous A ne réadopte jamais B. */
export function createNativeLifecycle() {
  let epoch = 0
  let active = false
  const resources = new Set<() => void | Promise<void>>()
  let stopping: Promise<PromiseSettledResult<void>[]> | null = null
  return {
    get epoch() { return epoch },
    get active() { return active },
    capture() { const at = epoch; return () => active && epoch === at },
    activate() { active = true },
    invalidate() { active = false; epoch += 1 },
    register(cleanup: () => void | Promise<void>) {
      resources.add(cleanup)
      return () => { resources.delete(cleanup) }
    },
    waitForStopped() { return stopping ?? Promise.resolve([] as PromiseSettledResult<void>[]) },
    stopResources() {
      const pending = [...resources]
      resources.clear()
      if (pending.length === 0 && stopping) return stopping
      const batch = Promise.allSettled(pending.map(async (cleanup) => { await cleanup() }))
      const previous = stopping
      const next = previous ? Promise.all([previous, batch]).then(([older, current]) => [...older, ...current]) : batch
      stopping = next
      void next.then(() => { if (stopping === next) stopping = null })
      return next
    },
  }
}
