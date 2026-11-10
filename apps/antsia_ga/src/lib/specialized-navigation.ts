import { demoStorageNamespace } from "./demo-storage"
import { parseCommerceRef } from "@antsia/social-domain/commerce/primitives"

/** MP01 : l'origine est une aide de navigation, jamais une autorisation. */
export const SPECIALIZED_RETURN_TTL_MS = 30 * 60 * 1000
const MAX_SERIALIZED_LENGTH = 8192
const MAX_HREF_LENGTH = 4096

export type ReturnOwner = { networkId: string; personId: string }
export type SpecializedReturn = ReturnOwner & { version: 1; href: string; recordedAt: number }
export type SpecializedReturnStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">
export type SpecializedDestination =
  | { kind: "professionals" | "professional_editor" | "professional_collaborations" }
  | { kind: "storefront" | "catalog" | "provider" | "provider_catalog" | "professional" | "media"; handle: string }
  | { kind: "article"; handle: string; articleKey: string }
  | { kind: "service_offer"; handle: string; offerRef: string }
  | { kind: "offer"; handle: string; offerRef: string; variantRef?: string; quantity?: number }

type PathAdmission = (href: string) => boolean

function plainRecord(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false
  const prototype: unknown = Object.getPrototypeOf(value)
  return prototype === Object.prototype || prototype === null
}

function exactKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  const actual = Reflect.ownKeys(value)
  return actual.length === keys.length && actual.every((key) => typeof key === "string" && keys.includes(key))
}

function validOwner(owner: ReturnOwner): boolean {
  return typeof owner.networkId === "string" && owner.networkId.length > 0
    && typeof owner.personId === "string" && owner.personId.length > 0
}

export function specializedReturnKey(owner: ReturnOwner): string {
  return `${demoStorageNamespace()}antsia:specialized-return:${encodeURIComponent(owner.networkId)}:${encodeURIComponent(owner.personId)}`
}

function parseReturn(value: unknown, owner: ReturnOwner, now: number, isAllowedPath: PathAdmission): SpecializedReturn | null {
  if (!validOwner(owner) || !Number.isSafeInteger(now) || now <= 0 || !plainRecord(value)
    || !exactKeys(value, ["version", "networkId", "personId", "href", "recordedAt"])
    || value.version !== 1 || value.networkId !== owner.networkId || value.personId !== owner.personId
    || typeof value.recordedAt !== "number" || !Number.isSafeInteger(value.recordedAt)
    || value.recordedAt <= 0 || value.recordedAt > now || now - value.recordedAt >= SPECIALIZED_RETURN_TTL_MS
    || typeof value.href !== "string" || value.href.length === 0 || value.href.length > MAX_HREF_LENGTH
    || !isAllowedPath(value.href)) return null
  return { version: 1, networkId: owner.networkId, personId: owner.personId, href: value.href, recordedAt: value.recordedAt }
}

/** Le registre des routes fournit l'allowlist ; aucun retour libre n'est admis ici. */
export function readSpecializedReturn(storage: SpecializedReturnStorage, owner: ReturnOwner, now: number, isAllowedPath: PathAdmission): SpecializedReturn | null {
  if (!validOwner(owner)) return null
  let raw: string | null
  try { raw = storage.getItem(specializedReturnKey(owner)) } catch { return null }
  if (raw === null) return null
  try {
    const value = raw.length <= MAX_SERIALIZED_LENGTH ? parseReturn(JSON.parse(raw), owner, now, isAllowedPath) : null
    if (value) return value
  } catch { /* Stockage corrompu ou prédicat fermé : retour au repli du routeur. */ }
  removeSpecializedReturn(storage, owner)
  return null
}

export function writeSpecializedReturn(storage: SpecializedReturnStorage, owner: ReturnOwner, href: string, now: number, isAllowedPath: PathAdmission): boolean {
  if (!validOwner(owner)) return false
  try {
    const value = parseReturn({ version: 1, ...owner, href, recordedAt: now }, owner, now, isAllowedPath)
    if (!value) { removeSpecializedReturn(storage, owner); return false }
    const serialized = JSON.stringify(value)
    if (serialized.length > MAX_SERIALIZED_LENGTH) { removeSpecializedReturn(storage, owner); return false }
    storage.setItem(specializedReturnKey(owner), serialized)
    return true
  } catch { removeSpecializedReturn(storage, owner); return false }
}

export function removeSpecializedReturn(storage: SpecializedReturnStorage, owner: ReturnOwner): boolean {
  if (!validOwner(owner)) return false
  try { storage.removeItem(specializedReturnKey(owner)); return true } catch { return false }
}

/** Destination de connexion fermée : aucun chemin ni paramètre arbitraire. */
export function parseSpecializedDestination(raw: unknown): SpecializedDestination | undefined {
  try {
    if (!plainRecord(raw)) return undefined
    if (raw.kind === "professionals" || raw.kind === "professional_editor" || raw.kind === "professional_collaborations") return exactKeys(raw, ["kind"]) ? { kind: raw.kind } : undefined
    if (typeof raw.handle !== "string" || raw.handle.length === 0 || raw.handle.length > 80
      || !/^[\p{L}\p{N}](?:[\p{L}\p{N}._-]*[\p{L}\p{N}])?$/u.test(raw.handle)) return undefined
    if (raw.kind === "storefront" || raw.kind === "catalog" || raw.kind === "provider" || raw.kind === "provider_catalog" || raw.kind === "professional" || raw.kind === "media") {
      return exactKeys(raw, ["kind", "handle"]) ? { kind: raw.kind, handle: raw.handle } : undefined
    }
    if (raw.kind === "article") return exactKeys(raw, ["kind", "handle", "articleKey"]) && typeof raw.articleKey === "string" && /^[A-Za-z0-9_-]{1,128}$/u.test(raw.articleKey) ? { kind: "article", handle: raw.handle, articleKey: raw.articleKey } : undefined
    const offerKeys = ["kind", "handle", "offerRef", ...(raw.variantRef === undefined ? [] : ["variantRef"]), ...(raw.quantity === undefined ? [] : ["quantity"])]
    if (raw.kind !== "offer" && raw.kind !== "service_offer" || !exactKeys(raw, offerKeys)
      || typeof raw.offerRef !== "string" || raw.offerRef.length > 200
      || !/^(?:pro\.ga:offer|demo:offer):[A-Za-z0-9_-]+$/u.test(raw.offerRef)) return undefined
    if (raw.kind === "service_offer") return exactKeys(raw, ["kind", "handle", "offerRef"]) ? { kind: raw.kind, handle: raw.handle, offerRef: raw.offerRef } : undefined
    if (raw.variantRef !== undefined && (typeof raw.variantRef !== "string" || parseCommerceRef(raw.variantRef)?.kind !== "offer_variant" || !raw.offerRef.startsWith("pro.ga:"))) return undefined
    if (raw.quantity !== undefined && (typeof raw.quantity !== "number" || !Number.isSafeInteger(raw.quantity) || raw.quantity < 1 || raw.quantity > 999)) return undefined
    return { kind: "offer", handle: raw.handle, offerRef: raw.offerRef, ...(raw.variantRef === undefined ? {} : { variantRef: raw.variantRef as string }), ...(raw.quantity === undefined ? {} : { quantity: raw.quantity as number }) }
  } catch { return undefined }
}
