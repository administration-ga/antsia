/** MP07b : transport de lecture borné, sans cookie/redirection/origine reçue du navigateur. */
import { COMMERCE_PAYMENT_PREPARATION_MAX_BYTES, COMMERCE_PAYMENT_PREPARATION_PATH, commercePaymentPreparationSigningInput, parseCommercePaymentPreparationRequest } from "@antsia/social-domain/commerce-payment-preparation"

import type { CommerceLinkConfig } from "./commerceLinkConfig"
import { base64url, randomLinkToken, readCommerceLinkResponse, sha256Hex } from "./commerceLinkCrypto"

export async function sendPaymentPreparation(config: CommerceLinkConfig, rawBody: string, fetcher: typeof fetch = fetch): Promise<{ rawResponse: string; httpStatus: number } | null> {
  const now = Date.now()
  if (!parseCommercePaymentPreparationRequest(rawBody, { source: config.source, environment: config.environment, nowMs: now }).ok) return null
  const nonce = randomLinkToken()
  const input = commercePaymentPreparationSigningInput({ bodySha256: await sha256Hex(rawBody), environment: config.environment, issuedAtMs: now, keyId: config.keyId, nonce, operation: "payment.preparation.read", source: config.source })
  if (!input) return null
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(config.signingKey), { name: "HMAC", hash: "SHA-256" }, false, ["sign"])
  const signature = base64url(new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(input))))
  const controller = new AbortController(), timer = setTimeout(() => controller.abort(), 8_000)
  try {
    const response = await fetcher(new URL(COMMERCE_PAYMENT_PREPARATION_PATH, config.proHttpOrigin), { method: "POST", body: rawBody, redirect: "error", signal: controller.signal,
      headers: { "Content-Type": "application/json", Accept: "application/json", "X-Pro-Key-Id": config.keyId, "X-Pro-Timestamp": String(now), "X-Pro-Nonce": nonce, "X-Pro-Signature": signature } })
    const rawResponse = await readCommerceLinkResponse(response, COMMERCE_PAYMENT_PREPARATION_MAX_BYTES)
    return rawResponse === null ? null : { rawResponse, httpStatus: response.status }
  } catch { return null }
  finally { clearTimeout(timer) }
}
