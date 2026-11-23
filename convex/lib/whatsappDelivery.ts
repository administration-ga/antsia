/**
 * Envoi d'un code par WhatsApp (CH-817, porte des comptes de démonstration) — fonction NEUTRE quant
 * au fournisseur, premier adaptateur : Bird (déjà fournisseur des SMS du programme), par son API
 * « Channels » et un MODÈLE d'authentification approuvé par WhatsApp. Le repli Meta (WhatsApp Cloud
 * API) est un adaptateur à venir : `WHATSAPP_PROVIDER=meta` n'est pas encore une configuration.
 *
 * Variables du déploiement (noms seuls, jamais de valeur dans le dépôt ; aucune adresse absolue dans
 * le code, cliquet `no-hardcoded-urls`) :
 * - `WHATSAPP_PROVIDER` : `bird` ;
 * - `WHATSAPP_ENDPOINT` : l'adresse HTTPS complète d'envoi (Bird : celle des messages du canal
 *   WhatsApp de l'espace de travail), sans identifiants ni fragment ;
 * - `WHATSAPP_API_KEY` : la clé d'accès (Bird : en-tête `Authorization: AccessKey …`) ;
 * - `WHATSAPP_TEMPLATE` : le modèle (Bird : `<identifiant de projet>:<identifiant de version>`),
 *   qui déclare la variable `code` ;
 * - `WHATSAPP_FROM` (facultative) : l'expéditeur, pour un fournisseur qui le nomme dans le corps ;
 *   Bird le porte par le canal de l'adresse d'envoi et ne la lit pas.
 *
 * Garanties : jamais de faux succès (seule une réponse 2xx qui porte l'identifiant du message vaut
 * `accepted`) ; aucune redirection suivie ; huit secondes au plus ; RIEN au journal (ni numéro, ni
 * code, ni réponse du fournisseur, qui peut recopier le message).
 */
import type { OtpLocale } from "@antsia/social-contracts/authentication"

import { isE164Phone } from "../betterAuth/settings"

type Env = Record<string, string | undefined>

export const WHATSAPP_PROVIDERS = ["bird"] as const
export type WhatsAppProvider = (typeof WHATSAPP_PROVIDERS)[number]

export type WhatsAppConfiguration = {
  provider: "bird"
  endpoint: string
  apiKey: string
  template: { projectId: string; version: string }
  from?: string
}

/** Délai maximal d'un envoi, en millisecondes. */
export const WHATSAPP_TIMEOUT_MS = 8_000
/** Une réponse du fournisseur n'est lue que sur cette longueur. */
const RESPONSE_MAX_BYTES = 65_536

/** Une clé d'accès : ASCII imprimable sans espace (aucun saut de ligne ne peut entrer dans l'en-tête). */
const API_KEY = /^[\x21-\x7e]{8,512}$/
const TEMPLATE_PART = /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/
const SENDER = /^[A-Za-z0-9+_.-]{1,64}$/

function secureEndpoint(value: string | undefined): string | null {
  const trimmed = value?.trim()
  if (!trimmed || trimmed.length > 2_048) return null
  try {
    const url = new URL(trimmed)
    return url.protocol === "https:" && !url.username && !url.password && !url.hash ? url.href : null
  } catch { return null }
}

function birdTemplate(value: string | undefined): { projectId: string; version: string } | null {
  const parts = (value?.trim() ?? "").split(":")
  if (parts.length !== 2) return null
  const [projectId = "", version = ""] = parts
  return TEMPLATE_PART.test(projectId) && TEMPLATE_PART.test(version) ? { projectId, version } : null
}

/**
 * La configuration de l'envoi WhatsApp, ou `null` si une seule pièce manque ou est hors forme
 * (fermé par défaut : aucune configuration devinée). La porte est alors `unavailable`.
 */
export function whatsappConfiguration(env: Env = process.env): WhatsAppConfiguration | null {
  if (env.WHATSAPP_PROVIDER?.trim() !== "bird") return null
  const endpoint = secureEndpoint(env.WHATSAPP_ENDPOINT)
  const apiKey = env.WHATSAPP_API_KEY?.trim() ?? ""
  const template = birdTemplate(env.WHATSAPP_TEMPLATE)
  const from = env.WHATSAPP_FROM?.trim()
  if (!endpoint || !API_KEY.test(apiKey) || !template) return null
  if (from !== undefined && from !== "" && !SENDER.test(from)) return null
  return { provider: "bird", endpoint, apiKey, template, ...(from ? { from } : {}) }
}

/** Le message : à qui, quel code, dans quelle langue, valable combien de minutes. */
export type WhatsAppOtpMessage = { to: string; code: string; locale: OtpLocale; ttlMinutes: number }

export type WhatsAppDeliveryResult =
  | { status: "accepted" }
  | { status: "unavailable"; reason: "not_configured" | "refused" | "unreachable" }

/**
 * La langue du modèle chez Bird, par langue de l'interface. À confirmer contre les langues sous
 * lesquelles le modèle est publié dans le compte (premier envoi réel, fiche CH-817 § 6).
 */
const BIRD_TEMPLATE_LOCALES: Record<OtpLocale, string> = { fr: "fr", en: "en" }

/** La variable du modèle d'authentification qui reçoit le code. */
export const WHATSAPP_TEMPLATE_CODE_PARAMETER = "code"

/**
 * Le corps d'un message Bird : un destinataire (numéro E.164) et le modèle, avec le code pour seul
 * paramètre. La durée de validité est fixée par le modèle d'authentification lui-même (expiration
 * déclarée à sa création) : elle n'est pas un paramètre.
 */
export function birdTemplateMessage(message: WhatsAppOtpMessage, config: WhatsAppConfiguration): Record<string, unknown> {
  return {
    receiver: { contacts: [{ identifierKey: "phonenumber", identifierValue: message.to }] },
    template: {
      projectId: config.template.projectId,
      version: config.template.version,
      locale: BIRD_TEMPLATE_LOCALES[message.locale],
      parameters: [{ type: "string", key: WHATSAPP_TEMPLATE_CODE_PARAMETER, value: message.code }],
    },
  }
}

function validMessage(message: WhatsAppOtpMessage): boolean {
  return isE164Phone(message.to) &&
    /^[0-9A-Za-z]{4,16}$/.test(message.code) &&
    Object.prototype.hasOwnProperty.call(BIRD_TEMPLATE_LOCALES, message.locale) &&
    Number.isInteger(message.ttlMinutes) && message.ttlMinutes >= 1 && message.ttlMinutes <= 60
}

/** Le corps d'une réponse lu jusqu'à la borne ; `null` s'il la dépasse ou ne se lit pas. */
async function boundedText(response: Response): Promise<string | null> {
  if (!response.body) return ""
  const reader = response.body.getReader()
  const chunks: Uint8Array[] = []
  let size = 0
  try {
    while (true) {
      const chunk = await reader.read()
      if (chunk.done) break
      size += chunk.value.byteLength
      if (size > RESPONSE_MAX_BYTES) { await reader.cancel(); return null }
      chunks.push(chunk.value)
    }
  } catch { return null } finally { reader.releaseLock() }
  const bytes = new Uint8Array(size)
  let offset = 0
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength }
  try { return new TextDecoder("utf-8", { fatal: true }).decode(bytes) } catch { return null }
}

/** Bird accepte un message en rendant sa ligne : un identifiant, et un statut qui n'est pas un échec. */
function birdAccepted(text: string | null): boolean {
  if (text === null) return false
  let parsed: unknown
  try { parsed = JSON.parse(text) } catch { return false }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return false
  const { id, status } = parsed as { id?: unknown; status?: unknown }
  if (typeof id !== "string" || id.length === 0 || id.length > 256) return false
  return !(typeof status === "string" && ["failed", "rejected", "refused", "cancelled"].includes(status.toLowerCase()))
}

/**
 * Envoie le code par WhatsApp. `accepted` ne veut dire que « admis par le fournisseur » (jamais
 * « reçu sur le téléphone ») ; tout le reste est `unavailable`, avec sa raison : pas de configuration,
 * refus (message hors forme, réponse non 2xx, réponse sans identifiant), ou fournisseur injoignable
 * (réseau, délai, redirection). Rien n'est journalisé ici.
 */
export async function sendWhatsAppOtp(message: WhatsAppOtpMessage, config: WhatsAppConfiguration | null, fetchImpl: typeof fetch = fetch): Promise<WhatsAppDeliveryResult> {
  if (!config) return { status: "unavailable", reason: "not_configured" }
  if (!validMessage(message)) return { status: "unavailable", reason: "refused" }
  let response: Response
  try {
    response = await fetchImpl(config.endpoint, {
      method: "POST",
      redirect: "error",
      headers: { "Content-Type": "application/json", Accept: "application/json", Authorization: `AccessKey ${config.apiKey}` },
      body: JSON.stringify(birdTemplateMessage(message, config)),
      signal: AbortSignal.timeout(WHATSAPP_TIMEOUT_MS),
    })
  } catch {
    return { status: "unavailable", reason: "unreachable" }
  }
  if (!response.ok) {
    try { await response.body?.cancel() } catch { /* corps déjà fermé : rien à libérer */ }
    return { status: "unavailable", reason: "refused" }
  }
  let text: string | null
  try { text = await boundedText(response) } catch { return { status: "unavailable", reason: "unreachable" } }
  return birdAccepted(text) ? { status: "accepted" } : { status: "unavailable", reason: "refused" }
}
