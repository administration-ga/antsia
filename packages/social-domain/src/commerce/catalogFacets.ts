/**
 * Facettes catalogue MP03 — FICHIER JUMEAU (voir `primitives.ts`).
 * Registre fermé v1 : ni prix, ni stock, ni SKU, ni référence privée.
 */
import { commerceArray, commerceBoolean, commerceCapture, commerceInteger, commerceLiteral, commerceRecord, commerceReject, commerceText, commerceUnique } from "./primitives";

export const COMMERCE_CATALOG_CATEGORIES = [
  { key: "fashion", parent: null, kind: "product" },
  { key: "fashion.women", parent: "fashion", kind: "product" },
  { key: "fashion.women.clothing", parent: "fashion.women", kind: "product" },
  { key: "fashion.women.shoes", parent: "fashion.women", kind: "product" },
  { key: "fashion.women.bags", parent: "fashion.women", kind: "product" },
  { key: "fashion.men", parent: "fashion", kind: "product" },
  { key: "fashion.men.clothing", parent: "fashion.men", kind: "product" },
  { key: "fashion.men.shoes", parent: "fashion.men", kind: "product" },
  { key: "fashion.men.bags", parent: "fashion.men", kind: "product" },
  { key: "fashion.kids", parent: "fashion", kind: "product" },
  { key: "fashion.kids.clothing", parent: "fashion.kids", kind: "product" },
  { key: "fashion.kids.shoes", parent: "fashion.kids", kind: "product" },
  { key: "fashion.kids.bags", parent: "fashion.kids", kind: "product" },
  { key: "fashion.accessories", parent: "fashion", kind: "product" },
  { key: "fashion.accessories.bags", parent: "fashion.accessories", kind: "product" },
  { key: "fashion.accessories.jewelry", parent: "fashion.accessories", kind: "product" },
  { key: "food", parent: null, kind: "product" },
  { key: "food.groceries", parent: "food", kind: "product" },
  { key: "food.beverages", parent: "food", kind: "product" },
  { key: "food.prepared", parent: "food", kind: "product" },
  { key: "craft", parent: null, kind: "product" },
  { key: "craft.home", parent: "craft", kind: "product" },
  { key: "craft.bags", parent: "craft", kind: "product" },
  { key: "craft.accessories", parent: "craft", kind: "product" },
  { key: "electronics", parent: null, kind: "product" },
  { key: "electronics.computers", parent: "electronics", kind: "product" },
  { key: "electronics.phones", parent: "electronics", kind: "product" },
  { key: "electronics.accessories", parent: "electronics", kind: "product" },
  { key: "beauty", parent: null, kind: "product" },
  { key: "beauty.care", parent: "beauty", kind: "product" },
  { key: "beauty.fragrance", parent: "beauty", kind: "product" },
  { key: "home", parent: null, kind: "product" },
  { key: "home.decor", parent: "home", kind: "product" },
  { key: "home.equipment", parent: "home", kind: "product" },
  { key: "services", parent: null, kind: "service" },
  { key: "services.digital", parent: "services", kind: "service" },
  { key: "services.creative", parent: "services", kind: "service" },
  { key: "services.home", parent: "services", kind: "service" },
  { key: "services.wellness", parent: "services", kind: "service" },
  { key: "services.events", parent: "services", kind: "service" },
  { key: "services.consulting", parent: "services", kind: "service" },
] as const;

export type CommerceCatalogCategoryKey = (typeof COMMERCE_CATALOG_CATEGORIES)[number]["key"];
export const COMMERCE_CATALOG_ATTRIBUTE_KEYS = ["brand", "material", "color", "audience", "serviceMode", "durationMinutes", "ecoLabel"] as const;
export type CommerceCatalogAttribute =
  | { readonly key: "brand" | "material" | "color"; readonly type: "text"; readonly value: string }
  | { readonly key: "audience"; readonly type: "choice"; readonly value: "women" | "men" | "kids" | "unisex" }
  | { readonly key: "serviceMode"; readonly type: "choice"; readonly value: "onsite" | "remote" | "hybrid" }
  | { readonly key: "durationMinutes"; readonly type: "number"; readonly value: number }
  | { readonly key: "ecoLabel"; readonly type: "boolean"; readonly value: boolean };

export type CommerceCatalogFacets = {
  readonly taxonomyVersion: 1;
  readonly categoryPath: readonly CommerceCatalogCategoryKey[];
  readonly attributes: readonly CommerceCatalogAttribute[];
};

function closedObject(value: unknown, path: string, keys: readonly string[]): Readonly<Record<string, unknown>> {
  if (value !== null && typeof value === "object" && !Array.isArray(value)) {
    const prototype: unknown = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) commerceReject("invalid_payload", path);
    for (const key of Reflect.ownKeys(value)) {
      if (typeof key !== "string") commerceReject("invalid_payload", path);
      if (!keys.includes(key)) commerceReject("invalid_payload", `${path}.${key}`);
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (descriptor?.get !== undefined || descriptor?.set !== undefined) commerceReject("invalid_payload", `${path}.${key}`);
    }
  }
  return commerceRecord(value, path, keys);
}

function denseArray(value: unknown, path: string, min: number, max: number): readonly unknown[] {
  const list = commerceArray(value, path, min, max);
  for (let index = 0; index < list.length; index += 1) {
    if (!Object.prototype.hasOwnProperty.call(list, index)) commerceReject("invalid_payload", `${path}[${index}]`);
  }
  return list;
}

function readAttribute(value: unknown, path: string): CommerceCatalogAttribute {
  const row = closedObject(value, path, ["key", "type", "value"]);
  const key = commerceLiteral(row.key, `${path}.key`, COMMERCE_CATALOG_ATTRIBUTE_KEYS);
  if (key === "brand" || key === "material" || key === "color") {
    if (row.type !== "text") commerceReject("invalid_payload", `${path}.type`);
    const text = commerceText(row.value, `${path}.value`, 1, 80);
    // NFC et espaces déjà normalisés par le producteur ; aucune normalisation silencieuse des octets reçus.
    if (text.replace(/\s+/gu, " ") !== text || /[\p{Cc}\uD800-\uDFFF]/u.test(text)) commerceReject("invalid_text", `${path}.value`);
    return { key, type: "text", value: text };
  }
  if (key === "audience") {
    if (row.type !== "choice") commerceReject("invalid_payload", `${path}.type`);
    return { key, type: "choice", value: commerceLiteral(row.value, `${path}.value`, ["women", "men", "kids", "unisex"]) };
  }
  if (key === "serviceMode") {
    if (row.type !== "choice") commerceReject("invalid_payload", `${path}.type`);
    return { key, type: "choice", value: commerceLiteral(row.value, `${path}.value`, ["onsite", "remote", "hybrid"]) };
  }
  if (key === "durationMinutes") {
    if (row.type !== "number") commerceReject("invalid_payload", `${path}.type`);
    return { key, type: "number", value: commerceInteger(row.value, `${path}.value`, 1, 43_200) };
  }
  if (row.type !== "boolean") commerceReject("invalid_payload", `${path}.type`);
  return { key, type: "boolean", value: commerceBoolean(row.value, `${path}.value`) };
}

/** Lecteur détaillé utilisé après le scan JSON commun de l'enveloppe. */
export function readCommerceCatalogFacets(value: unknown, path: string): CommerceCatalogFacets {
  const row = closedObject(value, path, ["attributes", "categoryPath", "taxonomyVersion"]);
  if (row.taxonomyVersion !== 1) commerceReject("invalid_payload", `${path}.taxonomyVersion`);
  const attributes = denseArray(row.attributes, `${path}.attributes`, 0, 8).map((item, index) => readAttribute(item, `${path}.attributes[${index}]`));
  commerceUnique(attributes.map((item) => item.key), `${path}.attributes`);
  const keys = COMMERCE_CATALOG_CATEGORIES.map((category) => category.key);
  const categoryPath = denseArray(row.categoryPath, `${path}.categoryPath`, 1, 3).map((item, index) => commerceLiteral(item, `${path}.categoryPath[${index}]`, keys));
  for (let index = 0; index < categoryPath.length; index += 1) {
    const category = COMMERCE_CATALOG_CATEGORIES.find((item) => item.key === categoryPath[index]);
    if (category?.parent !== (index === 0 ? null : categoryPath[index - 1])) commerceReject("invalid_payload", `${path}.categoryPath[${index}]`);
  }
  return { taxonomyVersion: 1, categoryPath, attributes };
}

/** Validation pure de configuration : résultat fermé, aucune donnée privée copiée. */
export function parseCommerceCatalogFacets(raw: unknown): CommerceCatalogFacets | null {
  const result = commerceCapture(() => readCommerceCatalogFacets(raw, "$"));
  return result.ok ? result.value : null;
}

export function catalogFacetsMatchKind(facets: CommerceCatalogFacets, kind: "product" | "service"): boolean {
  return COMMERCE_CATALOG_CATEGORIES.find((category) => category.key === facets.categoryPath[0])?.kind === kind;
}
