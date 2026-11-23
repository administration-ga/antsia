/**
 * La porte des comptes de démonstration (CH-817) — état et empreintes, sans base.
 *
 * La porte est un verrou DE PLUS sous `demoAccountsAllowed` : elle resserre, elle n'ouvre rien
 * (ADR-0029, ADR-0038). Elle s'arme par la seule présence de `ANTSIA_DEMO_GATE_SECRET` :
 * - comptes de démonstration fermés ici (production comprise) → `closed` ;
 * - ouverts, secret absent → `open` (le comportement d'avant la porte) ;
 * - secret de moins de 32 caractères, ou envoi WhatsApp non configuré → `unavailable` (personne
 *   n'entre : toute pièce manquante ferme) ;
 * - sinon → `gated`.
 *
 * Empreintes : HMAC-SHA256 par Web Crypto (précédent : `modules/diaspora/attestation.ts`), clé =
 * le secret, message = `<usage>\0<valeur>`. Quatre usages, jamais mêlés : numéro, code (lié au défi
 * et à l'empreinte du numéro), session, adresse. Aucun numéro, code ni jeton n'est gardé en clair.
 * Changer le secret invalide la liste des numéros et les sessions : la liste se rejoue.
 */
import type { DemoGateState } from "@antsia/social-contracts/demoGate"

import { demoAccountsAllowed } from "./devTools"
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
  const raw = env.ANTSIA_DEMO_GATE_SECRET?.trim() ?? ""
  if (raw === "") return "open"
  if (demoGateSecret(env) === null || whatsappConfiguration(env) === null) return "unavailable"
  return "gated"
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
