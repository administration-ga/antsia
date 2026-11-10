/** Exception de garantie réservée au seul raccord commerce local explicitement activé. */
import { devToolsAllowed } from "./devTools"

type Env = Record<string, string | undefined>

function isExactHttpLoopbackOrigin(value: string | undefined): boolean {
  if (!value) return false
  try {
    const url = new URL(value)
    return url.origin === value && url.protocol === "http:" &&
      (url.hostname === "localhost" || url.hostname === "127.0.0.1") &&
      !url.username && !url.password
  } catch { return false }
}

/** Aucun nuage, environnement de production ou destination distante n'admet cette exception. */
export function localCommerceLoa1Allowed(env: Env = process.env): boolean {
  return env.ANTSIA_LOCAL_COMMERCE_LOA1 === "true" && devToolsAllowed(env) &&
    env.FEDERATION_ENVIRONMENT === "sandbox" && env.ANTSIA_COMMERCE_ENVIRONMENT === "sandbox" &&
    env.ANTSIA_COMMERCE_SOURCE === "antsia-local" && Boolean(env.IDN_CLIENT_ID?.includes("_sbx_")) &&
    isExactHttpLoopbackOrigin(env.CONVEX_SITE_URL) &&
    isExactHttpLoopbackOrigin(env.ANTSIA_COMMERCE_ORIGIN) &&
    isExactHttpLoopbackOrigin(env.ANTSIA_COMMERCE_PRO_HTTP_ORIGIN) &&
    isExactHttpLoopbackOrigin(env.ANTSIA_COMMERCE_PRO_APP_ORIGIN)
}
