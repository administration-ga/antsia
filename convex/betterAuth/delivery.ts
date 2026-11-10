/** PA4 — courriels via Resend et SMS via relais HTTP authentifié configuré par le propriétaire. */
import { otpLocale, type OtpLocale, otpMessage } from "@antsia/social-contracts/authentication"
import { BRAND_NAME } from "@antsia/social-contracts/brand"
import { Resend } from "@convex-dev/resend"
import { APIError } from "better-auth/api"
import type { GenericCtx } from "@convex-dev/better-auth"

import { components, internal } from "../_generated/api"
import type { DataModel } from "../_generated/dataModel"
import { demoCodeReadable } from "../lib/devTools"
import { DIASPORA_SLICE_MANIFEST } from "../modules/diaspora/manifest"
import { type ApplicationKey, applicationOfOrigin, smsConfiguration } from "./settings"

/**
 * Ce que la requête qui demande un code dit du message : d'où elle vient
 * (`Origin`) et dans quelle langue la personne lit (`Accept-Language`). Le relais
 * `/api/auth/*` des applications transmet ces deux en-têtes tels quels.
 */
export type OtpRequest = { origin: string | null | undefined; acceptLanguage: string | null | undefined }

/** La marque propre des applications qu'une tranche sert ; toute autre application porte celle du réseau racine. */
const APPLICATION_BRANDS: Partial<Record<ApplicationKey, string>> = {
  [DIASPORA_SLICE_MANIFEST.application]: DIASPORA_SLICE_MANIFEST.brand,
}

/**
 * La langue et la marque du code. La langue : celle que demande la requête, sinon
 * celle du déploiement. La marque : celle du réseau d'où la personne demande, tirée
 * de l'origine (déjà vérifiée contre les origines de confiance), ANTSIA sinon.
 */
export function otpPresentation(request: OtpRequest, env: Record<string, string | undefined> = process.env): { locale: OtpLocale; brand: string } {
  const application = applicationOfOrigin(request.origin, env)
  return {
    locale: otpLocale(request.acceptLanguage, env.AUTH_DEFAULT_LOCALE),
    brand: (application ? APPLICATION_BRANDS[application] : undefined) ?? BRAND_NAME,
  }
}

function unavailable(): never {
  throw new APIError("SERVICE_UNAVAILABLE", { message: "otpDeliveryUnavailable", code: "otpDeliveryUnavailable" })
}

export async function deliverOtp(ctx: GenericCtx<DataModel>, channel: "email" | "phone", identifier: string, code: string, request: OtpRequest): Promise<void> {
  if (!("runMutation" in ctx)) return unavailable()
  // Développement local : tout code s'affiche à l'écran. Démonstration déclarée :
  // seuls ceux des adresses réservées (jamais routables), les autres partent normalement.
  if (demoCodeReadable(identifier)) {
    await ctx.runMutation(internal.modules.platform.devTools.recordOtp, { email: identifier, code, expiresAt: Date.now() + 300_000 })
    return
  }
  const { locale, brand } = otpPresentation(request)
  const message = otpMessage(locale, brand, code)
  if (channel === "email") {
    if (!process.env.RESEND_API_KEY?.trim() || !process.env.RESEND_FROM_ADDRESS?.trim()) return unavailable()
    try {
      // Le composant Resend expose encore la signature Convex sans l'option
      // transactionLimits ajoutée au contexte 1.45 ; même méthode à l'exécution.
      await new Resend(components.resend, { testMode: false }).sendEmail(ctx as unknown as Parameters<Resend["sendEmail"]>[0], { from: process.env.RESEND_FROM_ADDRESS, to: identifier, ...message })
      return
    } catch { return unavailable() }
  }
  const sms = smsConfiguration()
  if (!sms) return unavailable()
  try {
    const result = await fetch(sms.endpoint, {
      method: "POST",
      redirect: "error",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${sms.apiKey}` },
      body: JSON.stringify({ to: identifier, text: message.text, type: "otp", ttlSeconds: 300 }),
      signal: AbortSignal.timeout(8000),
    })
    if (!result.ok) return unavailable()
  } catch { return unavailable() }
}
