/** Porte SDK native unique. Pas de Storage DOM, d'atomes Web ni de verrou attendant un reload. */
export type NativeExitResult = {
  serverRevoked: boolean
  localCleared: boolean
  issues: readonly ("resources" | "revocation" | "signOut" | "credentials" | "reset")[]
}
type RequestOptions = { fetchOptions: { signal: AbortSignal; throw: false } }
type ExitClient = {
  revokeSessions(options: RequestOptions): Promise<unknown>
  signOut(options: RequestOptions): Promise<unknown>
}
function rejected(value: unknown, field: "status" | "success"): boolean {
  if (!value || typeof value !== "object" || ("error" in value && value.error != null)) return true
  const data: unknown = "data" in value ? value.data : value
  return !data || typeof data !== "object" || !(field in data) || (data as Record<string, unknown>)[field] !== true
}
async function bounded<T>(task: (signal: AbortSignal) => Promise<T>, milliseconds: number): Promise<T> {
  const abort = new AbortController()
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    return await Promise.race([
      task(abort.signal),
      new Promise<never>((_, reject) => { timer = setTimeout(() => { abort.abort(); reject(new Error("nativeExitTimeout")) }, milliseconds) }),
    ])
  } finally { if (timer) clearTimeout(timer) }
}

/** Une porte par application ; appels concurrents partagent le même résultat. */
export function createNativeSignOutGate() {
  let pending: Promise<NativeExitResult> | null = null
  return (options: {
    client: ExitClient
    block: () => void
    stopResources: () => Promise<unknown>
    clearCredentials: () => Promise<void>
    reset: () => void
    timeoutMs?: number
    scope?: "all" | "current"
  }): Promise<NativeExitResult> => {
    if (pending) return pending
    const timeout = Math.min(10_000, Math.max(100, options.timeoutMs ?? 4_000))
    const currentOnly = options.scope === "current"
    pending = (async () => {
      const issues: NativeExitResult["issues"][number][] = []
      let serverRevoked = false
      let localCleared = true
      // Fermer les gestes et invalider les retours AVANT le premier await.
      options.block()
      try { await bounded(() => options.stopResources(), timeout) } catch { issues.push("resources"); localCleared = false }
      if (!currentOnly) {
        try {
          serverRevoked = !rejected(await bounded((signal) => options.client.revokeSessions({ fetchOptions: { signal, throw: false } }), timeout), "status")
          if (!serverRevoked) issues.push("revocation")
        } catch { issues.push("revocation") }
      }
      try {
        const signedOut = !rejected(await bounded((signal) => options.client.signOut({ fetchOptions: { signal, throw: false } }), timeout), "success")
        if (currentOnly) serverRevoked = signedOut
        if (!signedOut) issues.push("signOut")
      } catch { issues.push("signOut") }
      try { await bounded(() => options.clearCredentials(), timeout) } catch { issues.push("credentials"); localCleared = false }
      try { options.reset() } catch { issues.push("reset"); localCleared = false }
      return { serverRevoked, localCleared, issues }
    })().finally(() => { pending = null })
    return pending
  }
}
