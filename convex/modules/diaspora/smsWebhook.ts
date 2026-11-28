import { engineErrorCode } from "@antsia/social-contracts/errors"
import { httpAction } from "../../_generated/server"
import { internal } from "../../_generated/api"
import { smsCredentials, verifiedBirdEvent } from "./smsBird"

const BODY_LIMIT = 32_768

/** @selfScoped Bird signe chaque remise ; le relais, l’espace opérateur et le réseau sont vérifiés côté serveur. */
export const smsWebhook = httpAction(async (ctx, request) => {
  const config = smsCredentials()
  if (!config) return new Response(null, { status: 404 })
  if (!request.body) return new Response(null, { status: 400 })
  if (Number(request.headers.get("content-length")) > BODY_LIMIT) return new Response(null, { status: 413 })
  const reader = request.body.getReader()
  const bytes = new Uint8Array(BODY_LIMIT)
  let length = 0
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    if (length + value.length > BODY_LIMIT) {
      await reader.cancel()
      return new Response(null, { status: 413 })
    }
    bytes.set(value, length)
    length += value.length
  }
  const body = bytes.subarray(0, length)
  const deliveryId = await verifiedBirdEvent(request.headers, body, config.secret)
  if (!deliveryId) return new Response(null, { status: 401 })
  let raw: string
  try {
    raw = new TextDecoder("utf-8", { fatal: true }).decode(body)
    JSON.parse(raw)
  } catch {
    return new Response(null, { status: 400 })
  }
  try {
    await ctx.runMutation(internal.modules.diaspora.sms.applyEvent, { deliveryId, raw })
  } catch (error) {
    if (engineErrorCode(error) === "rateLimited") return new Response(null, { status: 429 })
    return new Response(null, { status: 503 })
  }
  return new Response(null, { status: 204 })
})
