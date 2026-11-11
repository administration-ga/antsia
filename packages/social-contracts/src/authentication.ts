import en from "./i18n/locales/en/auth.json"
import fr from "./i18n/locales/fr/auth.json"

/** Les langues du code de connexion : celles des interfaces du moteur. */
export const OTP_LOCALES = ["fr", "en"] as const
export type OtpLocale = (typeof OTP_LOCALES)[number]

const LABELS: Record<OtpLocale, typeof fr> = { fr, en }

/** Un en-tête venu du réseau n'est lu que sur cette longueur. */
const ACCEPT_LANGUAGE_MAX_LENGTH = 256

export function isOtpLocale(value: unknown): value is OtpLocale {
  return typeof value === "string" && (OTP_LOCALES as readonly string[]).includes(value)
}

/**
 * La première langue prise en charge d'un en-tête `Accept-Language`, dans l'ordre
 * des préférences (`q`), sous-étiquette régionale ignorée (`en-GB` → `en`). Un
 * poids nul ou illisible écarte la langue. `null` si rien ne correspond.
 */
export function localeFromAcceptLanguage(header: string | null | undefined): OtpLocale | null {
  if (!header) return null
  const ranked = header
    .slice(0, ACCEPT_LANGUAGE_MAX_LENGTH)
    .split(",")
    .map((part, index) => {
      const [tag = "", ...params] = part.trim().split(";")
      const q = params.map((param) => param.trim()).find((param) => param.startsWith("q="))
      const weight = q === undefined ? 1 : Number(q.slice(2))
      return { language: tag.trim().toLowerCase().split("-")[0] ?? "", weight: Number.isFinite(weight) ? weight : 0, index }
    })
    .filter((entry) => entry.weight > 0)
    .sort((a, b) => b.weight - a.weight || a.index - b.index)
  for (const entry of ranked) if (isOtpLocale(entry.language)) return entry.language
  return null
}

/**
 * La langue du code : celle que demande la requête (`Accept-Language`, que les
 * applications posent sur la langue affichée, à défaut celle du navigateur), sinon
 * celle du déploiement (`AUTH_DEFAULT_LOCALE`), sinon le français.
 */
export function otpLocale(acceptLanguage: string | null | undefined, deploymentLocale: string | undefined): OtpLocale {
  const fallback = deploymentLocale?.trim().toLowerCase()
  return localeFromAcceptLanguage(acceptLanguage) ?? (isOtpLocale(fallback) ? fallback : "fr")
}

/**
 * EA-08 (issue 151 d'antsia) — la durée de validité d'un code chez un moteur qui ne la publie pas encore
 * (`platform/authentication.configuration` sans `otpTtlSeconds`) : les cinq minutes que ces moteurs
 * appliquaient. Un écran ne s'en sert qu'à défaut de la durée publiée ; la durée en vigueur reste
 * celle du moteur (`OTP_TTL_SECONDS`), jamais recopiée ici.
 */
export const UNPUBLISHED_OTP_TTL_SECONDS = 300

/**
 * La durée de validité d'un code à dire à l'écran, en minutes entières : celle que publie le moteur,
 * sinon celle des moteurs d'avant sa publication. Arrondie au-dessous — l'écran n'annonce jamais plus
 * que ce que le moteur accorde —, une minute au moins.
 */
export function otpTtlMinutes(otpTtlSeconds: number | undefined): number {
  const seconds = typeof otpTtlSeconds === "number" && Number.isFinite(otpTtlSeconds) && otpTtlSeconds > 0 ? otpTtlSeconds : UNPUBLISHED_OTP_TTL_SECONDS
  return Math.max(1, Math.floor(seconds / 60))
}

/**
 * EA-08 — le délai restant d'un refus de débit des routes d'authentification : le champ
 * `retryAfterMs` du corps d'un refus `rateLimited` (le client Better Auth recopie le corps dans
 * son erreur). `null` pour tout autre refus, ou un délai absent ou illisible.
 */
export function authRetryAfterMs(error: unknown): number | null {
  if (typeof error !== "object" || error === null) return null
  const data = error as Record<string, unknown>
  const code = typeof data.code === "string" ? data.code : typeof data.message === "string" ? data.message : null
  const delay = data.retryAfterMs
  if (code !== "rateLimited" || typeof delay !== "number" || !Number.isFinite(delay) || delay <= 0) return null
  return delay
}

export type AuthRetryDelay = { unit: "seconds" | "minutes"; count: number }

/**
 * Le délai à dire : en secondes sous la minute, en minutes entières au-delà. Toujours arrondi
 * au-dessus — l'écran ne fait jamais réessayer avant que le seau l'admette.
 */
export function authRetryDelay(retryAfterMs: number): AuthRetryDelay {
  const seconds = Math.max(1, Math.ceil(retryAfterMs / 1_000))
  return seconds < 60 ? { unit: "seconds", count: seconds } : { unit: "minutes", count: Math.ceil(seconds / 60) }
}

/** L'objet et le texte du code, dans la langue et à la marque données : ni lien ni coordonnée. */
export function otpMessage(locale: OtpLocale, brand: string, code: string) {
  const labels = LABELS[locale]
  const interpolate = (text: string) => text.replaceAll("{{brand}}", brand).replaceAll("{{code}}", code)
  return { subject: interpolate(labels.otpSubject), text: interpolate(labels.otpMessage) }
}
