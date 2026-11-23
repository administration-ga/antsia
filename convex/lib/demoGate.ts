/**
 * La porte des comptes de démonstration (CH-817) — état et empreintes, sans base.
 *
 * La porte est un verrou DE PLUS sous `demoAccountsAllowed` : elle resserre, elle n'ouvre rien
 * (ADR-0029, ADR-0038). Elle s'arme par la seule présence de `ANTSIA_DEMO_GATE_SECRET` :
 * - comptes de démonstration fermés ici (production comprise) → `closed` ;
 * - ouverts, variable ABSENTE → `open` (le comportement d'avant la porte) ;
 * - variable posée mais vide, faite d'espaces ou de moins de 32 caractères, ou envoi WhatsApp non
 *   configuré → `unavailable` (personne n'entre : toute pièce manquante ferme ; CH-817 E5, constat 10 :
 *   un secret d'espaces n'est jamais pris pour une porte non armée) ;
 * - sinon → `gated`.
 *
 * CH-817 E5 — la porte ne gouverne QUE la famille d'adresses de sa portée (`demoGateScopeOfEmail` :
 * `…@demo.diaspora-ga.test`) ; les comptes de démonstration de la racine (`…@demo.antsia.test`) ne
 * passent pas par elle. Porte `gated` ou `unavailable`, la connexion d'une adresse de la famille
 * exige une session de porte valide (`demoGateGoverns`, crochet de `betterAuth/auth.ts`).
 *
 * Empreintes : HMAC-SHA256 par Web Crypto (précédent : `modules/diaspora/attestation.ts`), clé =
 * le secret, message = `<usage>\0<valeur>`. Quatre usages, jamais mêlés : numéro, code (lié au défi
 * et à l'empreinte du numéro), session, adresse. Aucun numéro, code ni jeton n'est gardé en clair.
 * Changer le secret invalide la liste des numéros et les sessions : la liste se rejoue.
 */
import type { DemoGateScope, DemoGateState } from "@antsia/social-contracts/demoGate"

import { demoAccountsAllowed, DIASPORA_GA_DEMO_EMAIL_DOMAIN } from "./devTools"
import { whatsappConfiguration } from "./whatsappDelivery"

type Env = Record<string, string | undefined>

export const DEMO_GATE_SECRET_MIN_LENGTH = 32

/** Le secret de la porte s'il est utilisable (32 caractères au moins), `null` sinon. */
export function demoGateSecret(env: Env = process.env): string | null {
  const secret = env.ANTSIA_DEMO_GATE_SECRET?.trim() ?? ""
  return secret.length >= DEMO_GATE_SECRET_MIN_LENGTH ? secret : null
}

/** L'état de la porte sur ce déploiement (voir l'en-tête). */
export function demoGateState(env: Env = process.env): DemoGateState {
  if (!demoAccountsAllowed(env)) return "closed"
  // Constat 10 : seule l'ABSENCE de la variable laisse la porte non armée ; vide ou espaces → indisponible.
  if (env.ANTSIA_DEMO_GATE_SECRET === undefined) return "open"
  if (demoGateSecret(env) === null || whatsappConfiguration(env) === null) return "unavailable"
  return "gated"
}

/**
 * La portée de porte qui gouverne cette adresse, ou `null` : la famille réservée de DIASPORA.GA
 * seulement (déplacée de `modules/platform/devTools.ts`, CH-817 E5). La comparaison se fait sur
 * l'adresse NORMALISÉE (espaces retirés, minuscules), celle sous laquelle Better Auth et le code de
 * développement l'enregistrent : une variante de casse ou d'espaces ne contourne pas la porte.
 */
export function demoGateScopeOfEmail(email: string): DemoGateScope | null {
  return email.trim().toLowerCase().endsWith(`@${DIASPORA_GA_DEMO_EMAIL_DOMAIN}`) ? "diaspora-ga" : null
}

/**
 * La portée dont la porte gouverne la CONNEXION de cette adresse, ou `null`. Porte `gated` ou
 * `unavailable` : la famille de la portée (une session de porte valide est exigée, et `unavailable`
 * refuse tout) ; `closed` (production comprise) et `open` : `null`, la connexion est inchangée.
 */
export function demoGateGoverns(email: string, env: Env = process.env): DemoGateScope | null {
  const state = demoGateState(env)
  if (state !== "gated" && state !== "unavailable") return null
  return demoGateScopeOfEmail(email)
}

export const DEMO_GATE_DIGEST_PURPOSES = ["demo-gate-phone", "demo-gate-code", "demo-gate-session", "demo-gate-ip"] as const
export type DemoGateDigestPurpose = (typeof DEMO_GATE_DIGEST_PURPOSES)[number]

function toHex(buffer: ArrayBuffer): string {
  return Array.from(new Uint8Array(buffer), (byte) => byte.toString(16).padStart(2, "0")).join("")
}

/** L'empreinte HMAC-SHA256 (64 caractères hexadécimaux) d'une valeur, pour un usage. */
export async function demoGateDigest(secret: string, purpose: DemoGateDigestPurpose, value: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"])
  return toHex(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${purpose}\0${value}`)))
}

/** Ce que l'empreinte d'un code lie : le défi, l'empreinte du numéro et le code. */
export function demoGateCodeMaterial(challengeId: string, phoneHash: string, code: string): string {
  return `${challengeId}\0${phoneHash}\0${code}`
}

/** Comparaison à temps constant de deux empreintes de même forme ; `false` si les longueurs diffèrent. */
export function digestsEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let mismatch = 0
  for (let index = 0; index < a.length; index++) mismatch |= a.charCodeAt(index) ^ b.charCodeAt(index)
  return mismatch === 0
}

/** Un identifiant opaque : `byteLength` octets aléatoires (Web Crypto), en base64url sans remplissage. */
export function randomOpaqueId(byteLength: number, randomBytes: (length: number) => Uint8Array = (length) => crypto.getRandomValues(new Uint8Array(length))): string {
  const bytes = randomBytes(byteLength)
  let binary = ""
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/u, "")
}
