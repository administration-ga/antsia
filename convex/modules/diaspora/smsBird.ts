const E164 = /^\+[1-9]\d{6,14}$/
const encoder = new TextEncoder()

export function smsCredentials(env = process.env) {
  const relay = env.DIASPORA_SMS_RELAY ?? ""
  const key = env.DIASPORA_SMS_BIRD_KEY ?? ""
  const region = /^bk_(eu1|us1)_/.exec(key)?.[1]
  const workspace = env.DIASPORA_SMS_WORKSPACE
  const secret = env.DIASPORA_SMS_WEBHOOK_SECRET ?? ""
  if (!region || !workspace || !E164.test(relay) || !/^whsec_[A-Za-z0-9+/]+={0,2}$/.test(secret)) return null
  return { relay, key, workspace, secret, region }
}

export function smsConfig(env = process.env) {
  const credentials = smsCredentials(env)
  if (env.DIASPORA_SMS_ENABLED !== "true" || !credentials || !env.DIASPORA_SMS_BIRD_ORIGIN) return null
  try {
    const origin = new URL(env.DIASPORA_SMS_BIRD_ORIGIN)
    if (origin.protocol !== "https:" || origin.host !== credentials.region + ".platform.bird.com" ||
        origin.username || origin.password || origin.pathname !== "/" || origin.search || origin.hash) return null
    return { ...credentials, endpoint: new URL("/v1/sms/messages", origin).href }
  } catch {
    return null
  }
}

export async function pairingDigest(code: string) {
  const bytes = new Uint8Array(await crypto.subtle.digest("SHA-256", encoder.encode(code)))
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("")
}

export async function verifiedBirdEvent(headers: Headers, raw: Uint8Array, secret: string, now = Date.now()) {
  const id = headers.get("webhook-id") ?? ""
  const timestamp = headers.get("webhook-timestamp") ?? ""
  const candidates = headers.get("webhook-signature")?.split(" ") ?? []
  if (!/^[\w.-]{1,200}$/.test(id) || !/^\d{1,12}$/.test(timestamp) || Math.abs(now / 1000 - Number(timestamp)) > 300)
    return null
  try {
    const decode = (encoded: string) => Uint8Array.from(atob(encoded), (c) => c.charCodeAt(0))
    const key = await crypto.subtle.importKey(
      "raw",
      decode(secret.slice(6)),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["verify"],
    )
    const prefix = encoder.encode(id + "." + timestamp + ".")
    const signed = new Uint8Array(prefix.length + raw.length)
    signed.set(prefix)
    signed.set(raw, prefix.length)
    for (const signature of candidates) {
      const value = /^v1,([A-Za-z0-9+/]{43}=)$/.exec(signature)?.[1]
      if (value && (await crypto.subtle.verify("HMAC", key, decode(value), signed))) return id
    }
  } catch {
    /* Reject invalid keys and encodings. */
  }
  return null
}

const statuses = {
  "sms.accepted": "accepted",
  "sms.sent": "sent",
  "sms.delivered": "delivered",
  "sms.undelivered": "failed",
  "sms.failed": "failed",
  "sms.rejected": "failed",
  "sms.expired": "failed",
} as const

/** Bird unified SMS v1, including opt-out events not accompanied by an inbound SMS. */
export function decodeSmsEvent(raw: string, config: { workspace: string; relay: string }) {
  const value = JSON.parse(raw)
  const { data, type, timestamp } = value ?? {}
  const at = typeof timestamp === "string" ? Date.parse(timestamp) : NaN
  if (!data || data.workspace_id !== config.workspace || !Number.isFinite(at)) return null
  if (type === "sms_suppression.created") {
    return data.originator === config.relay && typeof data.destination === "string" && E164.test(data.destination)
      ? { kind: "stop" as const, phone: data.destination as string, at }
      : null
  }
  const providerId: unknown = data.sms_id
  if (typeof providerId !== "string" || providerId.length < 1 || providerId.length > 150) return null
  if (type === "sms.received") {
    if (
      data.to !== config.relay ||
      typeof data.from !== "string" ||
      !E164.test(data.from) ||
      typeof data.text !== "string"
    )
      return null
    return { kind: "incoming" as const, phone: data.from as string, body: data.text.slice(0, 1600), providerId, at }
  }
  if (
    typeof type !== "string" ||
    !Object.prototype.hasOwnProperty.call(statuses, type) ||
    data.from !== config.relay ||
    !E164.test(data.to ?? "")
  )
    return null
  return {
    kind: "receipt" as const,
    phone: data.to as string,
    providerId,
    reference: typeof data.metadata?.icom_id === "string" ? (data.metadata.icom_id as string) : "",
    status: statuses[type as keyof typeof statuses],
    at,
  }
}
