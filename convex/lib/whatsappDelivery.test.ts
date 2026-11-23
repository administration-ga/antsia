/** CH-817 — l'envoi WhatsApp du code de la porte : configuration fermée par défaut, adaptateur Bird, jamais de faux succès. */
import { afterEach, beforeEach, describe, expect, it, type MockInstance, vi } from "vitest"

import { birdTemplateMessage, sendWhatsAppOtp, WHATSAPP_TIMEOUT_MS, type WhatsAppConfiguration, whatsappConfiguration, type WhatsAppOtpMessage } from "./whatsappDelivery"

// Valeurs FICTIVES : domaine réservé `.test`, numéro de la plage réservée à la fiction (Ofcom).
const ENV = {
  WHATSAPP_PROVIDER: "bird",
  WHATSAPP_ENDPOINT: "https://whatsapp.example.test/workspaces/fictif/channels/fictif/messages",
  WHATSAPP_API_KEY: "fictional-access-key-0123456789",
  WHATSAPP_TEMPLATE: "fictional-project:fictional-version",
}
const MESSAGE: WhatsAppOtpMessage = { to: "+447700900123", code: "482913K", locale: "fr", ttlMinutes: 5 }

function configured(): WhatsAppConfiguration {
  const config = whatsappConfiguration(ENV)
  if (!config) throw new Error("configuration de test invalide")
  return config
}

let logs: MockInstance[] = []
beforeEach(() => {
  logs = (["log", "info", "warn", "error", "debug"] as const).map((level) => vi.spyOn(console, level).mockImplementation(() => undefined))
})
afterEach(() => {
  // Rien au journal, dans aucun cas : ni numéro, ni code, ni réponse du fournisseur.
  for (const log of logs) expect(log).not.toHaveBeenCalled()
  vi.restoreAllMocks()
})

describe("whatsappConfiguration — toutes les pièces, ou rien", () => {
  it("une configuration Bird complète", () => {
    expect(whatsappConfiguration(ENV)).toEqual({
      provider: "bird",
      endpoint: ENV.WHATSAPP_ENDPOINT,
      apiKey: ENV.WHATSAPP_API_KEY,
      template: { projectId: "fictional-project", version: "fictional-version" },
    })
    expect(whatsappConfiguration({ ...ENV, WHATSAPP_FROM: "+447700900999" })?.from).toBe("+447700900999")
    expect(whatsappConfiguration({ ...ENV, WHATSAPP_FROM: "" })?.from).toBeUndefined()
  })

  it("une seule pièce absente ou hors forme : aucune configuration", () => {
    const broken: Record<string, string | undefined>[] = [
      {},
      { ...ENV, WHATSAPP_PROVIDER: undefined },
      { ...ENV, WHATSAPP_PROVIDER: "meta" },
      { ...ENV, WHATSAPP_PROVIDER: "twilio" },
      { ...ENV, WHATSAPP_ENDPOINT: undefined },
      { ...ENV, WHATSAPP_ENDPOINT: "http://whatsapp.example.test/messages" },
      { ...ENV, WHATSAPP_ENDPOINT: "https://user:pass@whatsapp.example.test/messages" },
      { ...ENV, WHATSAPP_ENDPOINT: "https://whatsapp.example.test/messages#fragment" },
      { ...ENV, WHATSAPP_ENDPOINT: "pas une adresse" },
      { ...ENV, WHATSAPP_API_KEY: undefined },
      { ...ENV, WHATSAPP_API_KEY: "court" },
      { ...ENV, WHATSAPP_API_KEY: "fictional key with spaces" },
      { ...ENV, WHATSAPP_API_KEY: "fictional-key\r\nX-Injected: oui" },
      { ...ENV, WHATSAPP_TEMPLATE: undefined },
      { ...ENV, WHATSAPP_TEMPLATE: "fictional-project" },
      { ...ENV, WHATSAPP_TEMPLATE: "a:b:c" },
      { ...ENV, WHATSAPP_TEMPLATE: "fictional project:version" },
      { ...ENV, WHATSAPP_TEMPLATE: ":version" },
      { ...ENV, WHATSAPP_FROM: "expéditeur invalide" },
    ]
    for (const env of broken) expect(whatsappConfiguration(env)).toBeNull()
  })
})

describe("birdTemplateMessage — le corps envoyé", () => {
  it("un destinataire E.164 et le modèle, avec le code pour seul paramètre", () => {
    expect(birdTemplateMessage(MESSAGE, configured())).toEqual({
      receiver: { contacts: [{ identifierKey: "phonenumber", identifierValue: "+447700900123" }] },
      template: { projectId: "fictional-project", version: "fictional-version", locale: "fr", parameters: [{ type: "string", key: "code", value: "482913K" }] },
    })
    expect(birdTemplateMessage({ ...MESSAGE, locale: "en" }, configured())).toMatchObject({ template: { locale: "en" } })
  })
})

describe("sendWhatsAppOtp — admis par le fournisseur, ou indisponible", () => {
  it("une réponse 2xx qui porte l'identifiant du message : accepté ; la requête est bornée", async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () => new Response(JSON.stringify({ id: "message-fictif", status: "accepted" }), { status: 202 }))
    await expect(sendWhatsAppOtp(MESSAGE, configured(), fetchImpl)).resolves.toEqual({ status: "accepted" })
    expect(fetchImpl).toHaveBeenCalledTimes(1)
    const [url, init] = fetchImpl.mock.calls[0]!
    expect(url).toBe(ENV.WHATSAPP_ENDPOINT)
    expect(init?.method).toBe("POST")
    expect(init?.redirect).toBe("error")
    expect(init?.signal).toBeInstanceOf(AbortSignal)
    expect(WHATSAPP_TIMEOUT_MS).toBe(3_000)
    expect(init?.headers).toEqual({ "Content-Type": "application/json", Accept: "application/json", Authorization: `AccessKey ${ENV.WHATSAPP_API_KEY}` })
    expect(JSON.parse(String(init?.body))).toEqual(birdTemplateMessage(MESSAGE, configured()))
  })

  it("sans configuration : rien ne part", async () => {
    const fetchImpl = vi.fn<typeof fetch>()
    await expect(sendWhatsAppOtp(MESSAGE, null, fetchImpl)).resolves.toEqual({ status: "unavailable", reason: "not_configured" })
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it("un message hors forme : refusé avant l'envoi", async () => {
    const fetchImpl = vi.fn<typeof fetch>()
    for (const message of [{ ...MESSAGE, to: "07700900123" }, { ...MESSAGE, code: "" }, { ...MESSAGE, code: "482 913 K" }, { ...MESSAGE, ttlMinutes: 0 }, { ...MESSAGE, ttlMinutes: 2.5 }]) {
      await expect(sendWhatsAppOtp(message, configured(), fetchImpl)).resolves.toEqual({ status: "unavailable", reason: "refused" })
    }
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it("jamais de faux succès : statut d'erreur, corps vide, illisible, sans identifiant, échec déclaré ou démesuré", async () => {
    const responses = [
      () => new Response("refus", { status: 401 }),
      () => new Response("erreur", { status: 500 }),
      () => new Response(null, { status: 204 }),
      () => new Response("", { status: 200 }),
      () => new Response("<html>ok</html>", { status: 200 }),
      () => new Response(JSON.stringify({ status: "accepted" }), { status: 202 }),
      () => new Response(JSON.stringify({ id: "" }), { status: 202 }),
      () => new Response(JSON.stringify([{ id: "message-fictif" }]), { status: 202 }),
      () => new Response(JSON.stringify({ id: "message-fictif", status: "failed" }), { status: 202 }),
      () => new Response(JSON.stringify({ id: "message-fictif", padding: "x".repeat(70_000) }), { status: 202 }),
    ]
    for (const response of responses) {
      await expect(sendWhatsAppOtp(MESSAGE, configured(), vi.fn<typeof fetch>(async () => response()))).resolves.toEqual({ status: "unavailable", reason: "refused" })
    }
  })

  it("fournisseur injoignable : réseau coupé, délai dépassé, redirection refusée", async () => {
    const failures = [new TypeError("fetch failed"), new DOMException("délai", "TimeoutError"), new DOMException("abandon", "AbortError")]
    for (const failure of failures) {
      await expect(sendWhatsAppOtp(MESSAGE, configured(), vi.fn<typeof fetch>(async () => { throw failure }))).resolves.toEqual({ status: "unavailable", reason: "unreachable" })
    }
  })
})
