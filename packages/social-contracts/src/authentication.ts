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

/** L'objet et le texte du code, dans la langue et à la marque données : ni lien ni coordonnée. */
export function otpMessage(locale: OtpLocale, brand: string, code: string) {
  const labels = LABELS[locale]
  const interpolate = (text: string) => text.replaceAll("{{brand}}", brand).replaceAll("{{code}}", code)
  return { subject: interpolate(labels.otpSubject), text: interpolate(labels.otpMessage) }
}
