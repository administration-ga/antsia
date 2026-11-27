import { exactHttpsOrigin } from "../betterAuth/settings"

/** Configuration privée de l’échange. La projection publique ne renvoie que l’origine de l’application. */
export function consulatePassConfiguration(env: Readonly<Record<string, string | undefined>> = process.env) {
  const secret = env.DIASPORA_PASS_SECRET
  const issuer = exactHttpsOrigin(env.CONSULAT_PASS_ISSUER)
  const origin = exactHttpsOrigin(env.DIASPORA_PASS_APP_ORIGIN)
  if (!secret || secret.trim().length < 32 || !issuer || !origin) return null
  return { secret, issuer, origin }
}
