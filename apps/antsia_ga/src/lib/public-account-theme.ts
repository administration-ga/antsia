import { memberThemeOf, type MemberThemeId } from "@antsia/social-contracts/appearance"

import { BRIDGE_CLIENT_TIMEOUT_MS } from "./session-bridge"

type PublicAccountThemeOptions = {
  /** Seulement le SID du SDK de cette origine, jamais un cookie HTTP d'un autre port. */
  sessionKey: () => string | null
  generation: () => string | null
  signingOut: () => boolean
  token: (signal: AbortSignal) => Promise<{ data?: { token?: string } | null; error?: unknown }>
  readTheme: (token: string, signal: AbortSignal) => Promise<unknown>
  apply: (theme: MemberThemeId) => void
  signal: AbortSignal
}

/**
 * Îlot de lecture privée du thème : pas de session créée, de préférence écrite,
 * ni de résultat conservé hors de cet appel. Le serveur Convex vérifie le JWT et
 * la session vivante de `getMyPerson`. Une réponse ancienne ne peut pas dépasser
 * une sortie, une nouvelle session, une navigation ou la borne de temps.
 */
export async function loadPublicAccountTheme({ sessionKey, generation, signingOut, token, readTheme, apply, signal }: PublicAccountThemeOptions): Promise<void> {
  // Le démontage immédiat de StrictMode ferme l'appel avant toute requête.
  await Promise.resolve()
  let key: string | null
  let fence: string | null
  try { key = sessionKey(); fence = generation() } catch { return }
  if (!key || signal.aborted || signingOut()) return
  const controller = new AbortController()
  let finish: () => void = () => undefined
  const interrupted = new Promise<void>((resolve) => { finish = resolve })
  const abort = () => { controller.abort(); finish() }
  signal.addEventListener("abort", abort, { once: true })
  const current = () => !controller.signal.aborted && !signingOut() && sessionKey() === key && generation() === fence
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    await Promise.race([
      (async () => {
        const result = await token(controller.signal)
        if (!current() || result.error || typeof result.data?.token !== "string" || !result.data.token) return
        const theme = memberThemeOf(await readTheme(result.data.token, controller.signal))
        if (current() && theme !== undefined) apply(theme)
      })(),
      interrupted,
      new Promise<void>((resolve) => {
        timer = setTimeout(() => { controller.abort(); resolve() }, BRIDGE_CLIENT_TIMEOUT_MS)
      }),
    ])
  } catch {
    // L'absence ou le refus de session laisse le cache d'apparence de l'appareil.
  } finally {
    if (timer !== undefined) clearTimeout(timer)
    signal.removeEventListener("abort", abort)
    controller.abort()
  }
}
