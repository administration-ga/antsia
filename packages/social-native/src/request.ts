/** Une API qui ignore AbortSignal ne peut retenir la coque indéfiniment. */
export async function nativeRequest<T>(request: (signal: AbortSignal) => Promise<T>, timeoutMs = 10_000): Promise<T> {
  const abort = new AbortController()
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    return await Promise.race([
      request(abort.signal),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => { abort.abort(); reject(new Error("nativeRequestTimeout")) }, timeoutMs)
      }),
    ])
  } finally { if (timer) clearTimeout(timer) }
}
