/**
 * Envoi d'un code par WhatsApp (CH-817, porte des comptes de démonstration) — fonction NEUTRE quant
 * au fournisseur, deux adaptateurs Bird (déjà fournisseur des SMS du programme), chacun par un MODÈLE
 * d'authentification approuvé par WhatsApp :
 * - `bird` : la plateforme ACTUELLE de Bird (clés d'espace de travail), API v1 :
 *   `POST <hôte régional>/v1/whatsapp/messages`, `Authorization: Bearer …`, modèle nommé par son slug,
 *   corps `{ to, from?, template: { slug, language?, parameters: { code } } }` ;
 * - `bird-channels` : l'ancienne API « Channels » de Bird (`Authorization: AccessKey …`, modèle
 *   `<projet>:<version>`, corps `receiver.contacts[]`), gardée telle quelle.
 * Le repli Meta (WhatsApp Cloud API) est un adaptateur à venir : `WHATSAPP_PROVIDER=meta` n'est pas
 * encore une configuration.
 *
 * Variables du déploiement (noms seuls, jamais de valeur dans le dépôt ; aucune adresse absolue dans
 * le code, cliquet `no-hardcoded-urls`) :
 * - `WHATSAPP_PROVIDER` : `bird` ou `bird-channels` ; toute autre valeur ne configure rien ;
 * - `WHATSAPP_ENDPOINT` : l'adresse HTTPS complète d'envoi, sans identifiants ni fragment (`bird` :
 *   celle des messages WhatsApp de l'hôte régional de l'espace de travail ; `bird-channels` : celle
 *   des messages du canal WhatsApp de l'espace de travail) ;
 * - `WHATSAPP_API_KEY` : la clé (`bird` : clé d'espace de travail, portée en `Bearer` ;
 *   `bird-channels` : clé d'accès, portée en `AccessKey`) ;
 * - `WHATSAPP_TEMPLATE` : le modèle, qui déclare la variable `code` (`bird` : son slug, d'un seul
 *   tenant, par exemple un modèle géré par Bird `bird_…` ; `bird-channels` :
 *   `<identifiant de projet>:<identifiant de version>`) ;
 * - `WHATSAPP_FROM` (facultative) : `bird` : le numéro expéditeur E.164 de l'espace de travail, exigé
 *   par Bird pour un modèle propre et JAMAIS envoyé pour un modèle géré par Bird (slug `bird_…` :
 *   Bird refuse alors l'expéditeur) ; `bird-channels` : non lue à l'envoi (le canal de l'adresse
 *   d'envoi porte l'expéditeur) ;
 * - `WHATSAPP_TEMPLATE_LANGUAGES` (facultative, `bird` seulement) : les langues sous lesquelles le
 *   modèle est publié, étiquettes BCP-47 séparées par des virgules (seize au plus). La langue de
 *   l'interface n'est demandée que si elle y figure (étiquette exacte, ou dont c'est la langue
 *   principale : `fr-FR` pour `fr`) ; sinon aucune langue n'est demandée et Bird prend celle par
 *   défaut du modèle (une langue demandée qui manque au modèle ferait ÉCHOUER l'envoi).
 *
 * Garanties : jamais de faux succès (seule une réponse 2xx qui porte l'identifiant du message, sans
 * statut d'échec, vaut `accepted`) ; aucune redirection suivie ; trois secondes au plus (en deçà de
 * la durée plancher de la porte, CH-817 E5) ; RIEN au journal (ni numéro, ni code, ni clé, ni réponse
 * du fournisseur, qui peut recopier le message).
 */
import type { OtpLocale } from "@antsia/social-contracts/authentication"

import { isE164Phone } from "../betterAuth/settings"

type Env = Record<string, string | undefined>

export const WHATSAPP_PROVIDERS = ["bird", "bird-channels"] as const
export type WhatsAppProvider = (typeof WHATSAPP_PROVIDERS)[number]

/** `bird` : la plateforme actuelle de Bird (API v1). */
export type BirdWhatsAppConfiguration = {
  provider: "bird"
  endpoint: string
  apiKey: string
  template: { slug: string }
  /** Numéro E.164 de l'espace de travail ; jamais envoyé pour un modèle géré par Bird (`bird_…`). */
  from?: string
  /** Les langues publiées du modèle, telles qu'écrites dans la variable. */
  languages?: readonly string[]
}

/** `bird-channels` : l'ancienne API « Channels » de Bird. */
export type BirdChannelsWhatsAppConfiguration = {
  provider: "bird-channels"
  endpoint: string
  apiKey: string
  template: { projectId: string; version: string }
  from?: string
}

export type WhatsAppConfiguration = BirdWhatsAppConfiguration | BirdChannelsWhatsAppConfiguration

/**
 * Délai maximal d'un envoi, en millisecondes (corps de la réponse compris : le même signal l'interrompt).
 * CH-817 E5 (constat 3) : trois secondes, pour rester sous la durée plancher d'une demande de la porte
 * (`DEMO_GATE_REQUEST_FLOOR_MS`, quatre secondes) : un fournisseur lent ne se voit pas au chronomètre.
 */
export const WHATSAPP_TIMEOUT_MS = 3_000
/** Une réponse du fournisseur n'est lue que sur cette longueur. */
const RESPONSE_MAX_BYTES = 65_536

/** Une clé d'accès : ASCII imprimable sans espace (aucun saut de ligne ne peut entrer dans l'en-tête). */
const API_KEY = /^[\x21-\x7e]{8,512}$/
/** Un identifiant de modèle (slug, projet ou version) : d'un seul tenant, sans `:` ni espace. */
const TEMPLATE_PART = /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/
const SENDER = /^[A-Za-z0-9+_.-]{1,64}$/
/** Une étiquette de langue BCP-47, forme courte : la langue (2 ou 3 lettres), puis deux sous-étiquettes au plus. */
const LANGUAGE_TAG = /^[A-Za-z]{2,3}(?:-[A-Za-z0-9]{2,8}){0,2}$/
const LANGUAGES_MAX = 16
const LANGUAGES_MAX_LENGTH = 512
/** Le préfixe des modèles gérés par Bird, pour lesquels Bird refuse un expéditeur (422). */
const BIRD_MANAGED_TEMPLATE_PREFIX = "bird_"

function secureEndpoint(value: string | undefined): string | null {
  const trimmed = value?.trim()
  if (!trimmed || trimmed.length > 2_048) return null
  try {
    const url = new URL(trimmed)
    return url.protocol === "https:" && !url.username && !url.password && !url.hash ? url.href : null
  } catch { return null }
}

/** Le modèle de l'ancienne API : `<projet>:<version>`. */
function birdChannelsTemplate(value: string | undefined): { projectId: string; version: string } | null {
  const parts = (value?.trim() ?? "").split(":")
  if (parts.length !== 2) return null
  const [projectId = "", version = ""] = parts
  return TEMPLATE_PART.test(projectId) && TEMPLATE_PART.test(version) ? { projectId, version } : null
}

/** Le modèle de la plateforme actuelle : un slug d'un seul tenant (un `<projet>:<version>` n'en est pas un). */
function birdTemplateSlug(value: string | undefined): { slug: string } | null {
  const slug = value?.trim() ?? ""
  return TEMPLATE_PART.test(slug) ? { slug } : null
}

/**
 * Les langues publiées du modèle : `undefined` si la variable est absente ou vide, `null` si une
 * seule étiquette est hors forme ou s'il y en a plus de seize (fermé par défaut).
 */
function templateLanguages(value: string | undefined): string[] | null | undefined {
  const trimmed = value?.trim()
  if (!trimmed) return undefined
  if (trimmed.length > LANGUAGES_MAX_LENGTH) return null
  const tags = trimmed.split(",").map((tag) => tag.trim())
  return tags.length <= LANGUAGES_MAX && tags.every((tag) => LANGUAGE_TAG.test(tag)) ? tags : null
}

function birdConfiguration(env: Env): BirdWhatsAppConfiguration | null {
  const endpoint = secureEndpoint(env.WHATSAPP_ENDPOINT)
  const apiKey = env.WHATSAPP_API_KEY?.trim() ?? ""
  const template = birdTemplateSlug(env.WHATSAPP_TEMPLATE)
  const from = env.WHATSAPP_FROM?.trim()
  const languages = templateLanguages(env.WHATSAPP_TEMPLATE_LANGUAGES)
  if (!endpoint || !API_KEY.test(apiKey) || !template || languages === null) return null
  if (from && !isE164Phone(from)) return null
  return { provider: "bird", endpoint, apiKey, template, ...(from ? { from } : {}), ...(languages ? { languages } : {}) }
}

function birdChannelsConfiguration(env: Env): BirdChannelsWhatsAppConfiguration | null {
  const endpoint = secureEndpoint(env.WHATSAPP_ENDPOINT)
  const apiKey = env.WHATSAPP_API_KEY?.trim() ?? ""
  const template = birdChannelsTemplate(env.WHATSAPP_TEMPLATE)
  const from = env.WHATSAPP_FROM?.trim()
  if (!endpoint || !API_KEY.test(apiKey) || !template) return null
  if (from !== undefined && from !== "" && !SENDER.test(from)) return null
  return { provider: "bird-channels", endpoint, apiKey, template, ...(from ? { from } : {}) }
}

/**
 * La configuration de l'envoi WhatsApp, ou `null` si le fournisseur est inconnu ou si une seule pièce
 * manque ou est hors forme (fermé par défaut : aucune configuration devinée). La porte est alors
 * `unavailable`.
 */
export function whatsappConfiguration(env: Env = process.env): WhatsAppConfiguration | null {
  const provider = env.WHATSAPP_PROVIDER?.trim()
  if (provider === "bird") return birdConfiguration(env)
  if (provider === "bird-channels") return birdChannelsConfiguration(env)
  return null
}

/** Le message : à qui, quel code, dans quelle langue, valable combien de minutes. */
export type WhatsAppOtpMessage = { to: string; code: string; locale: OtpLocale; ttlMinutes: number }

export type WhatsAppDeliveryResult =
  | { status: "accepted" }
  | { status: "unavailable"; reason: "not_configured" | "refused" | "unreachable" }

/**
 * La langue du modèle de l'ancienne API, par langue de l'interface. À confirmer contre les langues
 * sous lesquelles le modèle est publié dans le compte (premier envoi réel, fiche CH-817 § 6).
 */
const BIRD_CHANNELS_TEMPLATE_LOCALES: Record<OtpLocale, string> = { fr: "fr", en: "en" }

/** La variable du modèle d'authentification qui reçoit le code. */
export const WHATSAPP_TEMPLATE_CODE_PARAMETER = "code"

/**
 * La langue demandée au modèle de la plateforme actuelle : l'étiquette configurée qui EST la langue
 * de l'interface, sinon la première dont c'est la langue principale (`fr-FR` pour `fr`), telle
 * qu'écrite ; `undefined` sinon (Bird prend alors la langue par défaut du modèle).
 */
function birdTemplateLanguage(locale: OtpLocale, languages: readonly string[] | undefined): string | undefined {
  if (!languages) return undefined
  const wanted = locale.toLowerCase()
  return languages.find((tag) => tag.toLowerCase() === wanted) ??
    languages.find((tag) => tag.split("-")[0]?.toLowerCase() === wanted)
}

/**
 * Le corps d'un message de la plateforme actuelle (`bird`) : le destinataire (numéro E.164),
 * l'expéditeur pour un modèle propre seulement, le slug du modèle, sa langue si elle est publiée,
 * et le code pour seule variable (il remplit le corps et le bouton de copie). La durée de validité
 * est fixée par le modèle d'authentification lui-même : elle n'est pas un paramètre.
 */
export function birdTemplateMessage(message: WhatsAppOtpMessage, config: BirdWhatsAppConfiguration): Record<string, unknown> {
  const language = birdTemplateLanguage(message.locale, config.languages)
  const managed = config.template.slug.startsWith(BIRD_MANAGED_TEMPLATE_PREFIX)
  return {
    to: message.to,
    ...(config.from && !managed ? { from: config.from } : {}),
    template: {
      slug: config.template.slug,
      ...(language ? { language } : {}),
      parameters: { [WHATSAPP_TEMPLATE_CODE_PARAMETER]: message.code },
    },
  }
}

/**
 * Le corps d'un message de l'ancienne API (`bird-channels`) : un destinataire (numéro E.164) et le
 * modèle, avec le code pour seul paramètre. La durée de validité est fixée par le modèle
 * d'authentification lui-même (expiration déclarée à sa création) : elle n'est pas un paramètre.
 */
export function birdChannelsTemplateMessage(message: WhatsAppOtpMessage, config: BirdChannelsWhatsAppConfiguration): Record<string, unknown> {
  return {
    receiver: { contacts: [{ identifierKey: "phonenumber", identifierValue: message.to }] },
    template: {
      projectId: config.template.projectId,
      version: config.template.version,
      locale: BIRD_CHANNELS_TEMPLATE_LOCALES[message.locale],
      parameters: [{ type: "string", key: WHATSAPP_TEMPLATE_CODE_PARAMETER, value: message.code }],
    },
  }
}

/** Ce que chaque adaptateur envoie : l'en-tête d'autorisation et le corps. */
function providerRequest(message: WhatsAppOtpMessage, config: WhatsAppConfiguration): { authorization: string; body: Record<string, unknown> } {
  if (config.provider === "bird") return { authorization: `Bearer ${config.apiKey}`, body: birdTemplateMessage(message, config) }
  return { authorization: `AccessKey ${config.apiKey}`, body: birdChannelsTemplateMessage(message, config) }
}

function validMessage(message: WhatsAppOtpMessage): boolean {
  return isE164Phone(message.to) &&
    /^[0-9A-Za-z]{4,16}$/.test(message.code) &&
    Object.prototype.hasOwnProperty.call(BIRD_CHANNELS_TEMPLATE_LOCALES, message.locale) &&
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

/** Les statuts qui disent un échec, quelle que soit leur casse : jamais pris pour une admission. */
const FAILURE_STATUSES = new Set(["failed", "rejected", "refused", "cancelled", "canceled", "error", "undelivered"])

/**
 * Bird (les deux API) accepte un message en rendant sa ligne : un identifiant, et un statut qui n'est
 * pas un échec (plateforme actuelle : 202 `{ id: "wam_…", status: "accepted" }`).
 */
function birdAccepted(text: string | null): boolean {
  if (text === null) return false
  let parsed: unknown
  try { parsed = JSON.parse(text) } catch { return false }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return false
  const { id, status } = parsed as { id?: unknown; status?: unknown }
  if (typeof id !== "string" || id.length === 0 || id.length > 256) return false
  return !(typeof status === "string" && FAILURE_STATUSES.has(status.toLowerCase()))
}

/**
 * Envoie le code par WhatsApp. `accepted` ne veut dire que « admis par le fournisseur » (jamais
 * « reçu sur le téléphone ») ; tout le reste est `unavailable`, avec sa raison : pas de configuration,
 * refus (message hors forme, réponse non 2xx, réponse sans identifiant ou d'échec), ou fournisseur
 * injoignable (réseau, délai, redirection). Rien n'est journalisé ici.
 */
export async function sendWhatsAppOtp(message: WhatsAppOtpMessage, config: WhatsAppConfiguration | null, fetchImpl: typeof fetch = fetch): Promise<WhatsAppDeliveryResult> {
  if (!config) return { status: "unavailable", reason: "not_configured" }
  if (!validMessage(message)) return { status: "unavailable", reason: "refused" }
  const { authorization, body } = providerRequest(message, config)
  let response: Response
  try {
    response = await fetchImpl(config.endpoint, {
      method: "POST",
      redirect: "error",
      headers: { "Content-Type": "application/json", Accept: "application/json", Authorization: authorization },
      body: JSON.stringify(body),
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
