/**
 * CH-817 — l'envoi WhatsApp du code de la porte : configuration fermée par défaut, deux adaptateurs
 * Bird (`bird` : plateforme actuelle, API v1 ; `bird-channels` : ancienne API « Channels »), jamais de
 * faux succès, rien au journal.
 */
import { afterEach, beforeEach, describe, expect, it, type MockInstance, vi } from "vitest"

import {
  birdChannelsTemplateMessage,
  type BirdChannelsWhatsAppConfiguration,
  birdTemplateMessage,
  type BirdWhatsAppConfiguration,
  sendWhatsAppOtp,
  WHATSAPP_PROVIDERS,
  WHATSAPP_TIMEOUT_MS,
  type WhatsAppConfiguration,
  whatsappConfiguration,
  type WhatsAppOtpMessage,
} from "./whatsappDelivery"

type Env = Record<string, string | undefined>

// Valeurs FICTIVES : domaine réservé `.test`, numéros de la plage réservée à la fiction (Ofcom, 07700 900xxx).
const BIRD_ENV = {
  WHATSAPP_PROVIDER: "bird",
  WHATSAPP_ENDPOINT: "https://whatsapp.example.test/v1/whatsapp/messages",
  WHATSAPP_API_KEY: "fictional-workspace-key-0123456789",
  WHATSAPP_TEMPLATE: "bird_fictional_otp",
}
const CHANNELS_ENV = {
  WHATSAPP_PROVIDER: "bird-channels",
  WHATSAPP_ENDPOINT: "https://whatsapp.example.test/workspaces/fictif/channels/fictif/messages",
  WHATSAPP_API_KEY: "fictional-access-key-0123456789",
  WHATSAPP_TEMPLATE: "fictional-project:fictional-version",
}
const SENDER = "+447700900999"
/** Un modèle PROPRE (hors du préfixe `bird_`) : Bird exige alors l'expéditeur. */
const OWN_TEMPLATE = "fictional_own_otp"
const MESSAGE: WhatsAppOtpMessage = { to: "+447700900123", code: "482913K", locale: "fr", ttlMinutes: 5 }

function bird(env: Env = {}): BirdWhatsAppConfiguration {
  const config = whatsappConfiguration({ ...BIRD_ENV, ...env })
  if (config?.provider !== "bird") throw new Error("configuration de test invalide")
  return config
}

function channels(env: Env = {}): BirdChannelsWhatsAppConfiguration {
  const config = whatsappConfiguration({ ...CHANNELS_ENV, ...env })
  if (config?.provider !== "bird-channels") throw new Error("configuration de test invalide")
  return config
}

const ADAPTERS: { name: string; config: () => WhatsAppConfiguration }[] = [
  { name: "bird", config: () => bird() },
  { name: "bird-channels", config: () => channels() },
]

let logs: MockInstance[] = []
beforeEach(() => {
  logs = (["log", "info", "warn", "error", "debug"] as const).map((level) => vi.spyOn(console, level).mockImplementation(() => undefined))
})
afterEach(() => {
  // Rien au journal, dans aucun cas : ni numéro, ni code, ni clé, ni réponse du fournisseur.
  for (const log of logs) expect(log).not.toHaveBeenCalled()
  vi.restoreAllMocks()
})

describe("whatsappConfiguration — toutes les pièces, ou rien", () => {
  it("deux fournisseurs, et deux seulement", () => {
    expect(WHATSAPP_PROVIDERS).toEqual(["bird", "bird-channels"])
  })

  it("bird (plateforme actuelle) : une configuration complète, le modèle par son slug", () => {
    expect(whatsappConfiguration(BIRD_ENV)).toEqual({
      provider: "bird",
      endpoint: BIRD_ENV.WHATSAPP_ENDPOINT,
      apiKey: BIRD_ENV.WHATSAPP_API_KEY,
      template: { slug: "bird_fictional_otp" },
    })
    expect(bird({ WHATSAPP_FROM: SENDER }).from).toBe(SENDER)
    expect(bird({ WHATSAPP_FROM: "" }).from).toBeUndefined()
    // Un modèle géré par Bird garde l'expéditeur configuré : c'est le corps qui ne l'envoie jamais.
    expect(bird({ WHATSAPP_TEMPLATE: "bird_otp", WHATSAPP_FROM: SENDER })).toMatchObject({ template: { slug: "bird_otp" }, from: SENDER })
  })

  it("bird : les langues publiées du modèle, facultatives, telles qu'écrites", () => {
    expect(bird()).not.toHaveProperty("languages")
    expect(bird({ WHATSAPP_TEMPLATE_LANGUAGES: "" })).not.toHaveProperty("languages")
    expect(bird({ WHATSAPP_TEMPLATE_LANGUAGES: "   " })).not.toHaveProperty("languages")
    expect(bird({ WHATSAPP_TEMPLATE_LANGUAGES: "fr" }).languages).toEqual(["fr"])
    expect(bird({ WHATSAPP_TEMPLATE_LANGUAGES: " fr-FR, en ,pt-BR,zh-Hans-CN " }).languages).toEqual(["fr-FR", "en", "pt-BR", "zh-Hans-CN"])
    const sixteen = Array.from({ length: 16 }, (_, index) => `en-${String(index).padStart(2, "0")}`)
    expect(bird({ WHATSAPP_TEMPLATE_LANGUAGES: sixteen.join(",") }).languages).toEqual(sixteen)
  })

  it("bird-channels (ancienne API) : la configuration d'avant, sous son nouveau nom", () => {
    expect(whatsappConfiguration(CHANNELS_ENV)).toEqual({
      provider: "bird-channels",
      endpoint: CHANNELS_ENV.WHATSAPP_ENDPOINT,
      apiKey: CHANNELS_ENV.WHATSAPP_API_KEY,
      template: { projectId: "fictional-project", version: "fictional-version" },
    })
    expect(channels({ WHATSAPP_FROM: SENDER }).from).toBe(SENDER)
    expect(channels({ WHATSAPP_FROM: "" }).from).toBeUndefined()
    // La variable des langues ne concerne que `bird` : elle n'est ni lue ni gardée ici.
    expect(channels({ WHATSAPP_TEMPLATE_LANGUAGES: "fr,,hors forme" })).not.toHaveProperty("languages")
  })

  it("bird : un modèle propre sans expéditeur n'est pas une configuration — la porte se dit indisponible, plutôt que des envois refusés un à un", () => {
    expect(whatsappConfiguration({ ...BIRD_ENV, WHATSAPP_TEMPLATE: OWN_TEMPLATE })).toBeNull()
    expect(whatsappConfiguration({ ...BIRD_ENV, WHATSAPP_TEMPLATE: OWN_TEMPLATE, WHATSAPP_FROM: "" })).toBeNull()
    expect(bird({ WHATSAPP_TEMPLATE: OWN_TEMPLATE, WHATSAPP_FROM: SENDER })).toMatchObject({ template: { slug: OWN_TEMPLATE }, from: SENDER })
    // Un modèle géré par Bird n'en a pas besoin (Bird choisit le numéro) : la fixture de base n'en pose pas.
    expect(bird()).not.toHaveProperty("from")
    // Le préfixe se lit tel quel : `Bird_…` n'est pas un modèle géré.
    expect(whatsappConfiguration({ ...BIRD_ENV, WHATSAPP_TEMPLATE: "Bird_fictional_otp" })).toBeNull()
  })

  it("un fournisseur absent ou inconnu : aucune configuration", () => {
    for (const provider of [undefined, "", "  ", "meta", "twilio", "Bird", "BIRD-CHANNELS", "bird-v1", "bird channels", "channels"]) {
      expect(whatsappConfiguration({ ...BIRD_ENV, WHATSAPP_PROVIDER: provider })).toBeNull()
      expect(whatsappConfiguration({ ...CHANNELS_ENV, WHATSAPP_PROVIDER: provider })).toBeNull()
    }
    expect(whatsappConfiguration({})).toBeNull()
  })

  it("bird : une seule pièce absente ou hors forme : aucune configuration", () => {
    const broken: Env[] = [
      { WHATSAPP_ENDPOINT: undefined },
      { WHATSAPP_ENDPOINT: "http://whatsapp.example.test/v1/whatsapp/messages" },
      { WHATSAPP_ENDPOINT: "https://user:pass@whatsapp.example.test/v1/whatsapp/messages" },
      { WHATSAPP_ENDPOINT: "https://whatsapp.example.test/v1/whatsapp/messages#fragment" },
      { WHATSAPP_ENDPOINT: "pas une adresse" },
      { WHATSAPP_API_KEY: undefined },
      { WHATSAPP_API_KEY: "court" },
      { WHATSAPP_API_KEY: "fictional key with spaces" },
      { WHATSAPP_API_KEY: "fictional-key\r\nX-Injected: oui" },
      { WHATSAPP_TEMPLATE: undefined },
      { WHATSAPP_TEMPLATE: "" },
      // Un modèle `<projet>:<version>` est celui de l'ancienne API : ce n'est pas un slug.
      { WHATSAPP_TEMPLATE: "fictional-project:fictional-version" },
      { WHATSAPP_TEMPLATE: "bird_otp:1" },
      { WHATSAPP_TEMPLATE: "fictional otp" },
      { WHATSAPP_TEMPLATE: "-fictional_otp" },
      { WHATSAPP_TEMPLATE: "x".repeat(129) },
      // L'expéditeur, s'il est posé, est un numéro E.164 (même pour un modèle géré par Bird).
      { WHATSAPP_FROM: "07700900999" },
      { WHATSAPP_FROM: "+447700 900999" },
      { WHATSAPP_FROM: "+0447700900999" },
      { WHATSAPP_FROM: "expéditeur" },
      { WHATSAPP_FROM: "fictional-sender" },
      { WHATSAPP_TEMPLATE: "bird_otp", WHATSAPP_FROM: "fictional-sender" },
      // Une seule étiquette de langue hors forme ferme tout ; seize au plus.
      { WHATSAPP_TEMPLATE_LANGUAGES: "fr,,en" },
      { WHATSAPP_TEMPLATE_LANGUAGES: "fr," },
      { WHATSAPP_TEMPLATE_LANGUAGES: ",fr" },
      { WHATSAPP_TEMPLATE_LANGUAGES: "fr_FR" },
      { WHATSAPP_TEMPLATE_LANGUAGES: "fr;en" },
      { WHATSAPP_TEMPLATE_LANGUAGES: "fr en" },
      { WHATSAPP_TEMPLATE_LANGUAGES: "français" },
      { WHATSAPP_TEMPLATE_LANGUAGES: "f" },
      { WHATSAPP_TEMPLATE_LANGUAGES: "fr-" },
      { WHATSAPP_TEMPLATE_LANGUAGES: "fr-FR-x-y-z" },
      { WHATSAPP_TEMPLATE_LANGUAGES: Array.from({ length: 17 }, () => "fr").join(",") },
    ]
    for (const env of broken) expect(whatsappConfiguration({ ...BIRD_ENV, ...env })).toBeNull()
  })

  it("bird-channels : une seule pièce absente ou hors forme : aucune configuration", () => {
    const broken: Env[] = [
      { WHATSAPP_ENDPOINT: undefined },
      { WHATSAPP_ENDPOINT: "http://whatsapp.example.test/messages" },
      { WHATSAPP_ENDPOINT: "https://user:pass@whatsapp.example.test/messages" },
      { WHATSAPP_ENDPOINT: "https://whatsapp.example.test/messages#fragment" },
      { WHATSAPP_ENDPOINT: "pas une adresse" },
      { WHATSAPP_API_KEY: undefined },
      { WHATSAPP_API_KEY: "court" },
      { WHATSAPP_API_KEY: "fictional key with spaces" },
      { WHATSAPP_API_KEY: "fictional-key\r\nX-Injected: oui" },
      { WHATSAPP_TEMPLATE: undefined },
      // Un slug est celui de la plateforme actuelle : ce n'est pas un modèle `<projet>:<version>`.
      { WHATSAPP_TEMPLATE: "bird_fictional_otp" },
      { WHATSAPP_TEMPLATE: "fictional-project" },
      { WHATSAPP_TEMPLATE: "a:b:c" },
      { WHATSAPP_TEMPLATE: "fictional project:version" },
      { WHATSAPP_TEMPLATE: ":version" },
      { WHATSAPP_FROM: "expéditeur invalide" },
    ]
    for (const env of broken) expect(whatsappConfiguration({ ...CHANNELS_ENV, ...env })).toBeNull()
  })
})

describe("birdTemplateMessage — le corps envoyé à la plateforme actuelle (bird)", () => {
  it("un destinataire E.164, le slug du modèle et le code pour seule variable", () => {
    expect(birdTemplateMessage(MESSAGE, bird())).toEqual({
      to: "+447700900123",
      template: { slug: "bird_fictional_otp", parameters: { code: "482913K" } },
    })
  })

  it("l'expéditeur pour un modèle propre ; jamais pour un modèle géré par Bird (`bird_…`)", () => {
    expect(birdTemplateMessage(MESSAGE, bird({ WHATSAPP_TEMPLATE: OWN_TEMPLATE, WHATSAPP_FROM: SENDER }))).toEqual({
      to: "+447700900123",
      from: SENDER,
      template: { slug: OWN_TEMPLATE, parameters: { code: "482913K" } },
    })
    // Le modèle géré de la fixture de base, expéditeur posé ou non : jamais d'expéditeur dans le corps.
    expect(birdTemplateMessage(MESSAGE, bird({ WHATSAPP_FROM: SENDER }))).not.toHaveProperty("from")
    expect(birdTemplateMessage(MESSAGE, bird({ WHATSAPP_TEMPLATE: "bird_otp", WHATSAPP_FROM: SENDER }))).toEqual({
      to: "+447700900123",
      template: { slug: "bird_otp", parameters: { code: "482913K" } },
    })
  })

  it("la langue seulement si le modèle est publié sous elle : étiquette exacte, ou sous-étiquette principale, écrite comme configurée", () => {
    expect(birdTemplateMessage(MESSAGE, bird({ WHATSAPP_TEMPLATE_LANGUAGES: "en,fr" }))).toEqual({
      to: "+447700900123",
      template: { slug: "bird_fictional_otp", language: "fr", parameters: { code: "482913K" } },
    })
    expect(birdTemplateMessage(MESSAGE, bird({ WHATSAPP_TEMPLATE_LANGUAGES: "en-US,fr-FR" }))).toEqual({
      to: "+447700900123",
      template: { slug: "bird_fictional_otp", language: "fr-FR", parameters: { code: "482913K" } },
    })
    expect(birdTemplateMessage({ ...MESSAGE, locale: "en" }, bird({ WHATSAPP_TEMPLATE_LANGUAGES: "fr-FR,en-GB,en-US" }))).toMatchObject({ template: { language: "en-GB" } })
    // L'étiquette exacte passe avant une sous-étiquette principale, quel que soit l'ordre.
    expect(birdTemplateMessage(MESSAGE, bird({ WHATSAPP_TEMPLATE_LANGUAGES: "fr-CA,fr" }))).toMatchObject({ template: { language: "fr" } })
    // La casse de la variable est gardée telle qu'écrite.
    expect(birdTemplateMessage(MESSAGE, bird({ WHATSAPP_TEMPLATE_LANGUAGES: "FR-fr" }))).toMatchObject({ template: { language: "FR-fr" } })
  })

  it("aucune langue quand la liste manque ou ne la porte pas : la langue par défaut du modèle, jamais un envoi manqué", () => {
    const withoutLanguage = { to: "+447700900123", template: { slug: "bird_fictional_otp", parameters: { code: "482913K" } } }
    expect(birdTemplateMessage(MESSAGE, bird())).toEqual(withoutLanguage)
    expect(birdTemplateMessage(MESSAGE, bird({ WHATSAPP_TEMPLATE_LANGUAGES: "en,pt-BR" }))).toEqual(withoutLanguage)
    // Une langue qui commence par les mêmes lettres n'est pas la langue (`frr` n'est pas `fr`).
    expect(birdTemplateMessage(MESSAGE, bird({ WHATSAPP_TEMPLATE_LANGUAGES: "frr,en" }))).toEqual(withoutLanguage)
    expect(birdTemplateMessage({ ...MESSAGE, locale: "en" }, bird({ WHATSAPP_TEMPLATE_LANGUAGES: "fr" }))).toEqual(withoutLanguage)
  })
})

describe("birdChannelsTemplateMessage — le corps envoyé à l'ancienne API (bird-channels)", () => {
  it("un destinataire E.164 et le modèle, avec le code pour seul paramètre", () => {
    expect(birdChannelsTemplateMessage(MESSAGE, channels())).toEqual({
      receiver: { contacts: [{ identifierKey: "phonenumber", identifierValue: "+447700900123" }] },
      template: { projectId: "fictional-project", version: "fictional-version", locale: "fr", parameters: [{ type: "string", key: "code", value: "482913K" }] },
    })
    expect(birdChannelsTemplateMessage({ ...MESSAGE, locale: "en" }, channels())).toMatchObject({ template: { locale: "en" } })
  })
})

describe("sendWhatsAppOtp — admis par le fournisseur, ou indisponible", () => {
  it("bird : 202 avec l'identifiant du message → accepté ; jeton porteur, corps exact, requête bornée", async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () => new Response(JSON.stringify({ id: "wam_fictif", status: "accepted" }), { status: 202 }))
    const config = bird({ WHATSAPP_TEMPLATE: OWN_TEMPLATE, WHATSAPP_FROM: SENDER, WHATSAPP_TEMPLATE_LANGUAGES: "en,fr-FR" })
    await expect(sendWhatsAppOtp(MESSAGE, config, fetchImpl)).resolves.toEqual({ status: "accepted" })
    expect(fetchImpl).toHaveBeenCalledTimes(1)
    const [url, init] = fetchImpl.mock.calls[0]!
    expect(url).toBe(BIRD_ENV.WHATSAPP_ENDPOINT)
    expect(init?.method).toBe("POST")
    expect(init?.redirect).toBe("error")
    expect(init?.signal).toBeInstanceOf(AbortSignal)
    expect(WHATSAPP_TIMEOUT_MS).toBe(3_000)
    expect(init?.headers).toEqual({ "Content-Type": "application/json", Accept: "application/json", Authorization: `Bearer ${BIRD_ENV.WHATSAPP_API_KEY}` })
    expect(JSON.parse(String(init?.body))).toEqual({
      to: "+447700900123",
      from: SENDER,
      template: { slug: OWN_TEMPLATE, language: "fr-FR", parameters: { code: "482913K" } },
    })
  })

  it("bird-channels : réponse 2xx qui porte l'identifiant du message → accepté ; clé d'accès, corps d'avant, requête bornée", async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () => new Response(JSON.stringify({ id: "message-fictif", status: "accepted" }), { status: 202 }))
    await expect(sendWhatsAppOtp(MESSAGE, channels(), fetchImpl)).resolves.toEqual({ status: "accepted" })
    expect(fetchImpl).toHaveBeenCalledTimes(1)
    const [url, init] = fetchImpl.mock.calls[0]!
    expect(url).toBe(CHANNELS_ENV.WHATSAPP_ENDPOINT)
    expect(init?.method).toBe("POST")
    expect(init?.redirect).toBe("error")
    expect(init?.signal).toBeInstanceOf(AbortSignal)
    expect(init?.headers).toEqual({ "Content-Type": "application/json", Accept: "application/json", Authorization: `AccessKey ${CHANNELS_ENV.WHATSAPP_API_KEY}` })
    expect(JSON.parse(String(init?.body))).toEqual(birdChannelsTemplateMessage(MESSAGE, channels()))
  })

  it("sans configuration : rien ne part", async () => {
    const fetchImpl = vi.fn<typeof fetch>()
    await expect(sendWhatsAppOtp(MESSAGE, null, fetchImpl)).resolves.toEqual({ status: "unavailable", reason: "not_configured" })
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it("bird : le délai est réellement borné — un fournisseur muet est abandonné, injoignable", async () => {
    const fetchImpl = vi.fn<typeof fetch>((_url, init) => new Promise<Response>((_resolve, reject) => {
      const signal = init?.signal
      if (!signal) { reject(new Error("aucun signal de délai")); return }
      signal.addEventListener("abort", () => reject(signal.reason))
    }))
    const startedAt = Date.now()
    await expect(sendWhatsAppOtp(MESSAGE, bird(), fetchImpl)).resolves.toEqual({ status: "unavailable", reason: "unreachable" })
    const elapsed = Date.now() - startedAt
    expect(elapsed).toBeGreaterThanOrEqual(WHATSAPP_TIMEOUT_MS - 100)
    expect(elapsed).toBeLessThan(WHATSAPP_TIMEOUT_MS + 1_500)
  }, 10_000)

  describe.each(ADAPTERS)("$name — jamais de faux succès", ({ config }) => {
    it("un message hors forme : refusé avant l'envoi", async () => {
      const fetchImpl = vi.fn<typeof fetch>()
      const messages: WhatsAppOtpMessage[] = [
        { ...MESSAGE, to: "07700900123" },
        { ...MESSAGE, code: "" },
        { ...MESSAGE, code: "482 913 K" },
        { ...MESSAGE, ttlMinutes: 0 },
        { ...MESSAGE, ttlMinutes: 2.5 },
        { ...MESSAGE, locale: "de" as unknown as WhatsAppOtpMessage["locale"] },
      ]
      for (const message of messages) {
        await expect(sendWhatsAppOtp(message, config(), fetchImpl)).resolves.toEqual({ status: "unavailable", reason: "refused" })
      }
      expect(fetchImpl).not.toHaveBeenCalled()
    })

    it("statut d'erreur, redirection rendue, corps vide, illisible, sans identifiant, échec déclaré ou démesuré : refusé", async () => {
      const responses = [
        () => new Response("refus", { status: 401 }),
        () => new Response(JSON.stringify({ id: "wam_fictif", status: "accepted" }), { status: 422 }),
        () => new Response("erreur", { status: 500 }),
        () => new Response(null, { status: 302, headers: { Location: "https://ailleurs.example.test/" } }),
        () => new Response(null, { status: 204 }),
        () => new Response("", { status: 200 }),
        () => new Response("<html>ok</html>", { status: 200 }),
        () => new Response(JSON.stringify({ status: "accepted" }), { status: 202 }),
        () => new Response(JSON.stringify({ id: "" }), { status: 202 }),
        () => new Response(JSON.stringify({ id: 42, status: "accepted" }), { status: 202 }),
        () => new Response(JSON.stringify({ id: "x".repeat(257), status: "accepted" }), { status: 202 }),
        () => new Response(JSON.stringify([{ id: "wam_fictif" }]), { status: 202 }),
        ...["failed", "FAILED", "rejected", "refused", "cancelled", "canceled", "error", "undelivered"].map(
          (status) => () => new Response(JSON.stringify({ id: "wam_fictif", status }), { status: 202 }),
        ),
        () => new Response(JSON.stringify({ id: "wam_fictif", padding: "x".repeat(70_000) }), { status: 202 }),
      ]
      for (const response of responses) {
        await expect(sendWhatsAppOtp(MESSAGE, config(), vi.fn<typeof fetch>(async () => response()))).resolves.toEqual({ status: "unavailable", reason: "refused" })
      }
    })

    it("fournisseur injoignable : réseau coupé, délai dépassé, redirection refusée", async () => {
      const failures = [new TypeError("fetch failed"), new DOMException("délai", "TimeoutError"), new DOMException("abandon", "AbortError"), new TypeError("redirect mode is set to error")]
      for (const failure of failures) {
        await expect(sendWhatsAppOtp(MESSAGE, config(), vi.fn<typeof fetch>(async () => { throw failure }))).resolves.toEqual({ status: "unavailable", reason: "unreachable" })
      }
    })
  })
})
