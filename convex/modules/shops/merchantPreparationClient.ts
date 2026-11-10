/** MP06c : transport de lecture borné, sans cookie/redirection/origine reçue du navigateur. */
import { COMMERCE_MERCHANT_READ_MAX_BYTES, COMMERCE_MERCHANT_READ_PATH, commerceMerchantReadSigningInput, parseCommerceMerchantReadRequest } from "@antsia/social-domain/commerce-merchant"

import type { CommerceLinkConfig } from "./commerceLinkConfig"
import { base64url, randomLinkToken, readCommerceLinkResponse, sha256Hex } from "./commerceLinkCrypto"

export async function sendMerchantPreparation(config: CommerceLinkConfig, rawBody: string, fetcher: typeof fetch = fetch): Promise<{ rawResponse: string; httpStatus: number } | null> {
  const now = Date.now()
  if (!parseCommerceMerchantReadRequest(rawBody, { source: config.source, environment: config.environment, nowMs: now }).ok) return null
  const nonce = randomLinkToken()
  const input = commerceMerchantReadSigningInput({ bodySha256: await sha256Hex(rawBody), environment: config.environment, issuedAtMs: now, keyId: config.keyId, nonce, operation: "merchant.preparation.read", source: config.source })
  if (!input) return null
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(config.signingKey), { name: "HMAC", hash: "SHA-256" }, false, ["sign"])
  const signature = base64url(new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(input))))
  const controller = new AbortController(), timer = setTimeout(() => controller.abort(), 8_000)
  try {
    const response = await fetcher(new URL(COMMERCE_MERCHANT_READ_PATH, config.proHttpOrigin), { method: "POST", body: rawBody, redirect: "error", signal: controller.signal,
      headers: { "Content-Type": "application/json", Accept: "application/json", "X-Pro-Key-Id": config.keyId, "X-Pro-Timestamp": String(now), "X-Pro-Nonce": nonce, "X-Pro-Signature": signature } })
    const rawResponse = await readCommerceLinkResponse(response, COMMERCE_MERCHANT_READ_MAX_BYTES)
    return rawResponse === null ? null : { rawResponse, httpStatus: response.status }
  } catch { return null }
  finally { clearTimeout(timer) }
}
