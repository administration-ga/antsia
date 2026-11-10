/** Conditions déclarées du vendeur MP05 — FICHIER JUMEAU (voir `primitives.ts`). */
import { commerceAmount, commerceArray, commerceCanonicalJson, commerceCapture, commerceCurrency, commerceHas, commerceInteger, commerceLiteral, commerceRecord, commerceRef, commerceReject, commerceText, commerceUnique } from "./primitives";

export const COMMERCE_STOREFRONT_TERMS_MAX_BYTES = 8192;
/** Limite inclusive de Date/Intl ; l'événement impose aussi publishedAt <= changedAt. */
export const COMMERCE_STOREFRONT_TERMS_MAX_TIME = 8_640_000_000_000_000;
export type CommerceStorefrontTerms = {
  readonly version: 1;
  readonly publishedAt: number;
  readonly pickup?: { readonly points: readonly { readonly establishmentRef: string; readonly label: string }[] };
  readonly delivery?: {
    readonly country: "GA"; readonly localities: readonly string[]; readonly label: string;
    readonly fee: { readonly amount: number; readonly currency: "XAF" }; readonly leadTimeDays?: number;
  };
  readonly fees?: readonly { readonly kind: "packaging" | "service"; readonly label: string; readonly amount: { readonly amount: number; readonly currency: "XAF" } }[];
  readonly returns?: { readonly summary: string };
  readonly warranty?: { readonly summary: string };
};

function object(value: unknown, path: string, required: readonly string[], optional: readonly string[] = []) {
  if (value !== null && typeof value === "object" && !Array.isArray(value)) {
    const prototype: unknown = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) commerceReject("invalid_payload", path);
    for (const key of Reflect.ownKeys(value)) {
      if (typeof key !== "string" || ![...required, ...optional].includes(key)) commerceReject("invalid_payload", path);
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (descriptor?.get !== undefined || descriptor?.set !== undefined) commerceReject("invalid_payload", path);
    }
  }
  return commerceRecord(value, path, required, optional);
}
function array(value: unknown, path: string, min: number, max: number) {
  const result = commerceArray(value, path, min, max);
  for (let index = 0; index < result.length; index += 1) if (!Object.prototype.hasOwnProperty.call(result, index)) commerceReject("invalid_payload", path);
  return result;
}
function text(value: unknown, path: string, max: number) {
  const result = commerceText(value, path, 1, max);
  if (/[\p{Cc}\uD800-\uDFFF<>]/u.test(result) || /(?:\b[a-z][a-z0-9+.-]*:\/\/|www\.|mailto:|tel:)/iu.test(result)) commerceReject("invalid_text", path);
  return result;
}
function amount(value: unknown, path: string) {
  const row = object(value, path, ["amount", "currency"]);
  return { amount: commerceAmount(row.amount, `${path}.amount`), currency: commerceCurrency(row.currency, `${path}.currency`) };
}

/** Lecteur fermé ; ni coordonnées, ni texte HTML, ni adresse de paiement. */
export function readCommerceStorefrontTerms(value: unknown, path: string): CommerceStorefrontTerms {
  const row = object(value, path, ["version", "publishedAt"], ["pickup", "delivery", "fees", "returns", "warranty"]);
  if (row.version !== 1) commerceReject("invalid_payload", `${path}.version`);
  const publishedAt = commerceInteger(row.publishedAt, `${path}.publishedAt`, 1, COMMERCE_STOREFRONT_TERMS_MAX_TIME);
  let pickup: CommerceStorefrontTerms["pickup"];
  if (commerceHas(row, "pickup")) {
    const entry = object(row.pickup, `${path}.pickup`, ["points"]);
    const points = array(entry.points, `${path}.pickup.points`, 1, 20).map((value, index) => {
      const at = `${path}.pickup.points[${index}]`, point = object(value, at, ["establishmentRef", "label"]);
      return { establishmentRef: commerceRef(point.establishmentRef, `${at}.establishmentRef`, ["establishment"]), label: text(point.label, `${at}.label`, 80) };
    });
    commerceUnique(points.map(point => point.establishmentRef), `${path}.pickup.points`);
    pickup = { points };
  }
  let delivery: CommerceStorefrontTerms["delivery"];
  if (commerceHas(row, "delivery")) {
    const at = `${path}.delivery`, entry = object(row.delivery, at, ["country", "localities", "label", "fee"], ["leadTimeDays"]);
    const localities = array(entry.localities, `${at}.localities`, 1, 20).map((value, index) => text(value, `${at}.localities[${index}]`, 120));
    commerceUnique(localities, `${at}.localities`);
    delivery = { country: commerceLiteral(entry.country, `${at}.country`, ["GA"]), localities, label: text(entry.label, `${at}.label`, 80), fee: amount(entry.fee, `${at}.fee`),
      ...(commerceHas(entry, "leadTimeDays") ? { leadTimeDays: commerceInteger(entry.leadTimeDays, `${at}.leadTimeDays`, 0, 365) } : {}) };
  }
  const fees = commerceHas(row, "fees") ? array(row.fees, `${path}.fees`, 1, 4).map((value, index) => {
    const at = `${path}.fees[${index}]`, fee = object(value, at, ["kind", "label", "amount"]);
    return { kind: commerceLiteral(fee.kind, `${at}.kind`, ["packaging", "service"]), label: text(fee.label, `${at}.label`, 80), amount: amount(fee.amount, `${at}.amount`) };
  }) : undefined;
  const summary = (key: "returns" | "warranty") => {
    if (!commerceHas(row, key)) return undefined;
    const at = `${path}.${key}`, entry = object(row[key], at, ["summary"]);
    return { summary: text(entry.summary, `${at}.summary`, 1000) };
  };
  const returns = summary("returns"), warranty = summary("warranty");
  if (!pickup && !delivery && !fees && !returns && !warranty) commerceReject("invalid_payload", path);
  const result: CommerceStorefrontTerms = { version: 1, publishedAt, ...(pickup ? { pickup } : {}), ...(delivery ? { delivery } : {}), ...(fees ? { fees } : {}), ...(returns ? { returns } : {}), ...(warranty ? { warranty } : {}) };
  const canonical = commerceCanonicalJson(result);
  if (!canonical || new TextEncoder().encode(canonical).byteLength > COMMERCE_STOREFRONT_TERMS_MAX_BYTES) commerceReject("body_too_large", path);
  return result;
}

export function parseCommerceStorefrontTerms(raw: unknown): CommerceStorefrontTerms | null {
  const result = commerceCapture(() => readCommerceStorefrontTerms(raw, "$"));
  return result.ok ? result.value : null;
}
