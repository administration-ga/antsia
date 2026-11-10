/** Profil public des services MP06 — FICHIER JUMEAU (voir `primitives.ts`). */
import { commerceArray, commerceCanonicalJson, commerceCapture, commerceInteger, commerceLiteral, commerceRecord, commerceReject, commerceText, commerceUnique } from "./primitives";

export const COMMERCE_SERVICE_COMMERCIAL_MODES = ["quote", "booking", "fixed_order"] as const;
export type CommerceServiceCommercialMode = (typeof COMMERCE_SERVICE_COMMERCIAL_MODES)[number];
export const COMMERCE_SERVICE_PROFILE_MAX_BYTES = 16 * 1024;
export type CommerceServiceProfile = {
  readonly version: 1;
  readonly commercialModes: readonly CommerceServiceCommercialMode[];
  readonly languageCodes: readonly string[];
  readonly zones: readonly { readonly countryCode: "GA"; readonly locality: string }[];
  readonly deliverables: readonly string[];
  readonly inclusions: readonly string[];
  readonly exclusions: readonly string[];
  readonly portfolio: readonly { readonly title: string; readonly description: string; readonly mediaIndexes: readonly number[] }[];
};

function object(value: unknown, path: string, required: readonly string[]) {
  if (value !== null && typeof value === "object" && !Array.isArray(value)) {
    const prototype: unknown = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) commerceReject("invalid_payload", path);
    for (const key of Reflect.ownKeys(value)) {
      if (typeof key !== "string" || !required.includes(key)) commerceReject("invalid_payload", path);
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (descriptor?.get !== undefined || descriptor?.set !== undefined) commerceReject("invalid_payload", path);
    }
  }
  return commerceRecord(value, path, required);
}
function array(value: unknown, path: string, min: number, max: number) {
  const result = commerceArray(value, path, min, max);
  if (Object.getPrototypeOf(result) !== Array.prototype) commerceReject("invalid_payload", path);
  for (const key of Reflect.ownKeys(result)) {
    if (key === "length") continue;
    if (typeof key !== "string" || !/^(0|[1-9][0-9]*)$/u.test(key) || Number(key) >= result.length) commerceReject("invalid_payload", path);
    const descriptor = Object.getOwnPropertyDescriptor(result, key);
    if (descriptor?.get !== undefined || descriptor?.set !== undefined) commerceReject("invalid_payload", path);
  }
  for (let index = 0; index < result.length; index += 1) if (!Object.prototype.hasOwnProperty.call(result, index)) commerceReject("invalid_payload", path);
  return result;
}
function text(value: unknown, path: string, min: number, max: number) {
  const result = commerceText(value, path, min, max);
  if (/[\p{Cc}\uD800-\uDFFF<>]/u.test(result) || /(?:\b[a-z][a-z0-9+.-]*:\/\/|www\.|mailto:|tel:)/iu.test(result)) commerceReject("invalid_text", path);
  return result;
}
const normalizedKey = (value: string) => value.normalize("NFC").replace(/\s+/gu, " ").toLowerCase();
/** Saisie/filtre BCP 47 ; le lecteur contractuel exige ensuite cette graphie canonique. */
export function normalizeCommerceServiceLanguageCode(raw: string): string | null {
  const value = raw.trim();
  if (!value || value.length > 35) return null;
  try { const result = Intl.getCanonicalLocales(value); return result.length === 1 && result[0]!.length <= 35 ? result[0]! : null; } catch { return null; }
}
/** Clé de recherche locale commune ; le libellé public NFC est conservé séparément. */
export function commerceServiceZoneKey(raw: string): string | null {
  const result = raw.normalize("NFC").replace(/\s+/gu, " ").trim();
  const checked = commerceCapture(() => text(result, "$", 1, 120));
  return checked.ok ? result.normalize("NFKD").replace(/\p{M}/gu, "").toLowerCase() : null;
}
function texts(value: unknown, path: string) {
  const result = array(value, path, 0, 8).map((entry, index) => text(entry, `${path}[${index}]`, 1, 200));
  commerceUnique(result.map(normalizedKey), path);
  return result;
}

/** Champs publics dédiés uniquement ; le texte libre ne garantit pas l'absence sémantique de PII. */
export function readCommerceServiceProfile(value: unknown, path: string, mediaCount: number): CommerceServiceProfile {
  commerceInteger(mediaCount, `${path}.mediaCount`, 0, 10);
  const row = object(value, path, ["version", "commercialModes", "languageCodes", "zones", "deliverables", "inclusions", "exclusions", "portfolio"]);
  if (row.version !== 1) commerceReject("invalid_payload", `${path}.version`);
  const commercialModes = array(row.commercialModes, `${path}.commercialModes`, 1, 3).map((entry, index) => commerceLiteral(entry, `${path}.commercialModes[${index}]`, COMMERCE_SERVICE_COMMERCIAL_MODES));
  commerceUnique(commercialModes, `${path}.commercialModes`);
  const languageCodes = array(row.languageCodes, `${path}.languageCodes`, 0, 6).map((entry, index) => {
    const at = `${path}.languageCodes[${index}]`, language = text(entry, at, 1, 35);
    if (normalizeCommerceServiceLanguageCode(language) !== language) commerceReject("invalid_payload", at);
    return language;
  });
  commerceUnique(languageCodes, `${path}.languageCodes`);
  const zones = array(row.zones, `${path}.zones`, 0, 8).map((entry, index) => {
    const at = `${path}.zones[${index}]`, zone = object(entry, at, ["countryCode", "locality"]);
    return { countryCode: commerceLiteral(zone.countryCode, `${at}.countryCode`, ["GA"]), locality: text(zone.locality, `${at}.locality`, 1, 120) };
  });
  commerceUnique(zones.map(zone => `${zone.countryCode}:${normalizedKey(zone.locality)}`), `${path}.zones`);
  const deliverables = texts(row.deliverables, `${path}.deliverables`), inclusions = texts(row.inclusions, `${path}.inclusions`), exclusions = texts(row.exclusions, `${path}.exclusions`);
  if (commercialModes.includes("fixed_order") && deliverables.length === 0) commerceReject("invalid_payload", `${path}.deliverables`);
  const portfolio = array(row.portfolio, `${path}.portfolio`, 0, 6).map((entry, index) => {
    const at = `${path}.portfolio[${index}]`, item = object(entry, at, ["title", "description", "mediaIndexes"]);
    const mediaIndexes = array(item.mediaIndexes, `${at}.mediaIndexes`, 0, 3).map((media, position) => commerceInteger(media, `${at}.mediaIndexes[${position}]`, 0, 9));
    commerceUnique(mediaIndexes.map(String), `${at}.mediaIndexes`);
    if (mediaIndexes.some(media => media >= mediaCount)) commerceReject("invalid_payload", `${at}.mediaIndexes`);
    return { title: text(item.title, `${at}.title`, 1, 120), description: text(item.description, `${at}.description`, 0, 500), mediaIndexes };
  });
  const profile: CommerceServiceProfile = { version: 1, commercialModes, languageCodes, zones, deliverables, inclusions, exclusions, portfolio };
  const canonical = commerceCanonicalJson(profile);
  if (!canonical || new TextEncoder().encode(canonical).byteLength > COMMERCE_SERVICE_PROFILE_MAX_BYTES) commerceReject("body_too_large", path);
  return profile;
}

/** Le manifeste de la même offre est obligatoire, jamais remplacé par celui d'un brouillon vivant. */
export function parseCommerceServiceProfile(raw: unknown, mediaCount: number): CommerceServiceProfile | null {
  const result = commerceCapture(() => readCommerceServiceProfile(raw, "$", mediaCount));
  return result.ok ? result.value : null;
}
