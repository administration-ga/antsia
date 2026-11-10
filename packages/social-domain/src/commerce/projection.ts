/**
 * PRO-COMMERCE-PUBLIC-V1/V2 — projection publique PRO.GA → ANTSIA.
 *
 * FICHIER JUMEAU (voir `primitives.ts`). PRO.GA est l'autorité ; ANTSIA reçoit
 * par son inbox signée (`POST /federation/inbox`, enveloppe fermée à cinq
 * clés) des faits PUBLICS : boutique, offres, disponibilité indicative,
 * emplois. Aucune donnée privée (contact, acheteur, candidature, stock
 * chiffré, SKU, identifiant de stockage) n'y circule.
 *
 * Ordre d'évaluation, donc raison rendue quand plusieurs règles échouent :
 * octets → enveloppe → parcours borné (clés interdites, complexité) → type →
 * structure fermée → référence de l'objet → révision → horodatage → autres
 * champs par ordre alphabétique de clé (de même dans chaque entrée
 * imbriquée) → règles croisées. Le prix suit son propre ordre : mode, forme,
 * devise, unité, montants, cohérence.
 */
import {
  COMMERCE_BODY_MAX_BYTES,
  COMMERCE_CURRENCY,
  COMMERCE_PUBLIC_CONTRACT,
  COMMERCE_PUBLIC_CONTRACT_V2,
  COMMERCE_TRANSPORT_FORBIDDEN_FIELDS,
  commerceAmount,
  commerceArray,
  commerceBoolean,
  commerceCapture,
  commerceCountry,
  commerceCurrency,
  commerceHas,
  commerceInstant,
  commerceInteger,
  commerceIsOpaqueId,
  commerceIsoDate,
  commerceLiteral,
  commerceParseCanonicalBody,
  commerceRecord,
  commerceRef,
  commerceRefList,
  commerceReject,
  commerceScanJson,
  commerceSha256,
  commerceSortedSet,
  commerceText,
  commerceTextList,
  commerceTimeMs,
  commerceUnique,
  isCommercePublicContract,
  type CommerceEnvironment,
  type CommercePublicContract,
  type CommerceRefKind,
  type CommerceResult,
} from "./primitives";
import { catalogFacetsMatchKind, readCommerceCatalogFacets, type CommerceCatalogFacets } from "./catalogFacets";

import { readCommerceStorefrontTerms, type CommerceStorefrontTerms } from "./storefrontTerms";
import { readCommerceServiceProfile, type CommerceServiceProfile } from "./serviceProfile";

export const COMMERCE_PUBLIC_EVENT_TYPES = [
  "shop.published",
  "shop.updated",
  "shop.withdrawn",
  "offer.published",
  "offer.updated",
  "offer.withdrawn",
  "offer.availabilityChanged",
  "job.published",
  "job.closed",
] as const;
export type CommercePublicEventType = (typeof COMMERCE_PUBLIC_EVENT_TYPES)[number];

export const COMMERCE_PUBLIC_REASONS = [
  "amount_incoherent",
  "body_too_large",
  "capability_incoherent",
  "currency_mismatch",
  "duplicate_entry",
  "forbidden_field",
  "invalid_amount",
  "invalid_body",
  "invalid_envelope",
  "invalid_payload",
  "invalid_reference",
  "invalid_revision",
  "invalid_text",
  "invalid_time",
  "not_canonical",
  "reference_mismatch",
  "too_complex",
  "unknown_event",
] as const;
export type CommercePublicReason = (typeof COMMERCE_PUBLIC_REASONS)[number];

/** Capacités commerciales ADMISES par PRO.GA (indicatives : chaque commande les rejuge). */
export const COMMERCE_SHOP_CAPABILITIES = ["booking", "catalog", "checkout", "jobs", "quote"] as const;
export type CommerceShopCapability = (typeof COMMERCE_SHOP_CAPABILITIES)[number];
/** Vérification commerciale de la structure (`proStructures.verification`) : un fait reflété, jamais un badge ANTSIA. */
export const COMMERCE_SELLER_VERIFICATIONS = ["pending", "unverified", "verified"] as const;
export type CommerceSellerVerification = (typeof COMMERCE_SELLER_VERIFICATIONS)[number];
export const COMMERCE_SHOP_WITHDRAWAL_REASONS = [
  "consent_withdrawn",
  "link_revoked",
  "policy_removed",
  "seller_request",
  "structure_closed",
  "structure_suspended",
] as const;
export const COMMERCE_OFFER_WITHDRAWAL_REASONS = [
  "consent_withdrawn",
  "policy_removed",
  "seller_archived",
  "seller_paused",
  "seller_unpublished",
  "shop_withdrawn",
] as const;
/** `closed` et `filled` sont terminaux (comme dans PRO.GA) ; `withdrawn` ne l'est pas. */
export const COMMERCE_JOB_CLOSURE_REASONS = ["closed", "filled", "withdrawn"] as const;
export const COMMERCE_AVAILABILITY_STATES = ["in_stock", "out_of_stock", "unknown"] as const;
export type CommerceAvailabilityState = (typeof COMMERCE_AVAILABILITY_STATES)[number];
export const COMMERCE_OFFER_KINDS = ["product", "service"] as const;
export const COMMERCE_PRICE_MODES = ["fixed", "quote", "range", "unit"] as const;
export type CommercePriceMode = (typeof COMMERCE_PRICE_MODES)[number];
export const COMMERCE_JOB_CONTRACT_TYPES = ["apprentissage", "cdd", "cdi", "prestation", "stage"] as const;
export const COMMERCE_MEDIA_MIME_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;

/** Bornes du contrat, alignées sur PRO.GA quand il en porte (titres, variantes, photos, catégories). */
export const COMMERCE_PUBLIC_LIMITS = {
  shopNameMin: 2,
  shopNameMax: 120,
  serviceAreaMax: 120,
  shopCollectionsMax: 50,
  collectionLabelMax: 60,
  collectionPositionMax: 10_000,
  offerTitleMin: 2,
  offerTitleMax: 120,
  offerDescriptionMax: 4000,
  tagsMax: 10,
  tagMax: 40,
  zoneMax: 120,
  leadTimeDaysMax: 365,
  offerCollectionsMax: 5,
  mediaMax: 6,
  mediaBytesMax: 10 * 1024 * 1024,
  mediaAltMax: 200,
  mediaDimensionMax: 20_000,
  variantsMax: 150,
  variantAxesMax: 2,
  variantAxisMax: 40,
  variantLabelMax: 80,
  variantOptionMax: 80,
  unitMax: 20,
  jobTitleMin: 3,
  jobTitleMax: 120,
  jobDescriptionMax: 4000,
  jobLocationMax: 120,
  headcountMax: 1000,
} as const;

/** Champs privés jamais admis dans une projection publique, même imbriqués. */
export const COMMERCE_PUBLIC_FORBIDDEN_FIELDS = [
  ...COMMERCE_TRANSPORT_FORBIDDEN_FIELDS,
  "address",
  "buyerRef",
  "contactEmail",
  "contactName",
  "contactPhone",
  "cookie",
  "costXaf",
  "cv",
  "downloadUrl",
  "establishmentId",
  "fullName",
  "idToken",
  "lead",
  "leadRef",
  "logoUrl",
  "marginXaf",
  "mediaUrl",
  "note",
  "onHand",
  "reserved",
  "sku",
  "storageUrl",
  "structureBusinessRef",
  "structureId",
  "subject",
  "tenantBusinessRef",
  "tenantId",
  "token",
  "url",
  "userId",
] as const;
const PUBLIC_FORBIDDEN: ReadonlySet<string> = new Set(COMMERCE_PUBLIC_FORBIDDEN_FIELDS);

export type CommercePrice =
  | { readonly amount: number; readonly currency: "XAF"; readonly mode: "fixed" }
  | { readonly amount: number; readonly currency: "XAF"; readonly mode: "unit"; readonly unit: string }
  | {
      readonly currency: "XAF";
      readonly maxAmount: number;
      readonly minAmount: number;
      readonly mode: "range";
      readonly unit?: string;
    }
  | { readonly currency: "XAF"; readonly mode: "quote" };

/** Variante à référence STABLE ; son montant est exact, dans la devise de l'offre. */
export type CommerceVariant = {
  readonly amount: number;
  readonly effectiveFrom?: number;
  readonly effectiveTo?: number;
  readonly label: string;
  readonly options: readonly string[];
  readonly unit?: string;
  readonly variantRef: string;
};

/** Descripteur de média par empreinte : jamais d'URL ; servi après admission par la garde des fichiers. */
export type CommerceMedia = {
  readonly altText?: string;
  readonly byteSize: number;
  readonly height?: number;
  readonly mimeType: (typeof COMMERCE_MEDIA_MIME_TYPES)[number];
  readonly sha256: string;
  readonly width?: number;
};

export type CommerceShopCollection = {
  readonly collectionRef: string;
  readonly label: string;
  readonly position: number;
};

export type CommerceShopEvent = {
  readonly capabilities: readonly CommerceShopCapability[];
  readonly changedAt: number;
  readonly collections: readonly CommerceShopCollection[];
  readonly commercialName: string;
  readonly country: string;
  readonly currency: "XAF";
  readonly linkRef: string;
  readonly revision: number;
  readonly sellerVerification: CommerceSellerVerification;
  readonly serviceArea?: string;
  readonly shopRef: string;
  readonly type: "shop.published" | "shop.updated";
  readonly storefrontTerms?: CommerceStorefrontTerms;
};

export type CommerceShopWithdrawnEvent = {
  readonly changedAt: number;
  readonly linkRef: string;
  readonly reason: (typeof COMMERCE_SHOP_WITHDRAWAL_REASONS)[number];
  readonly revision: number;
  readonly shopRef: string;
  readonly type: "shop.withdrawn";
};

export type CommerceOfferEvent = {
  readonly changedAt: number;
  readonly collectionRefs: readonly string[];
  readonly description: string;
  readonly facets?: CommerceCatalogFacets;
  readonly serviceProfile?: CommerceServiceProfile;
  readonly kind: (typeof COMMERCE_OFFER_KINDS)[number];
  readonly leadTimeDays?: number;
  readonly media: readonly CommerceMedia[];
  readonly offerRef: string;
  readonly price: CommercePrice;
  readonly revision: number;
  readonly shopRef: string;
  readonly showsAvailability: boolean;
  readonly tags: readonly string[];
  readonly title: string;
  readonly type: "offer.published" | "offer.updated";
  readonly variantAxes: readonly string[];
  readonly variants: readonly CommerceVariant[];
  readonly zone?: string;
};

export type CommerceOfferWithdrawnEvent = {
  readonly changedAt: number;
  readonly offerRef: string;
  readonly reason: (typeof COMMERCE_OFFER_WITHDRAWAL_REASONS)[number];
  readonly revision: number;
  readonly shopRef: string;
  readonly type: "offer.withdrawn";
};

export type CommerceVariantAvailability = {
  readonly availability: CommerceAvailabilityState;
  readonly variantRef: string;
};

/** Séquence PROPRE (`availabilityRevision`) : la disponibilité ne réordonne jamais le contenu. */
export type CommerceAvailabilityEvent = {
  readonly availability: CommerceAvailabilityState;
  readonly availabilityRevision: number;
  readonly changedAt: number;
  readonly offerRef: string;
  readonly shopRef: string;
  readonly type: "offer.availabilityChanged";
  readonly variants: readonly CommerceVariantAvailability[];
};

export type CommerceDeclaredSalary = {
  readonly currency: "XAF";
  readonly maxAmount?: number;
  readonly minAmount?: number;
};

export type CommerceJobEvent = {
  readonly changedAt: number;
  readonly closesOn?: string;
  readonly contractType: (typeof COMMERCE_JOB_CONTRACT_TYPES)[number];
  readonly declaredSalary?: CommerceDeclaredSalary;
  readonly description: string;
  readonly headcount: number;
  readonly jobRef: string;
  readonly location?: string;
  readonly openedOn: string;
  readonly revision: number;
  readonly shopRef: string;
  readonly title: string;
  readonly type: "job.published";
};

export type CommerceJobClosedEvent = {
  readonly changedAt: number;
  readonly jobRef: string;
  readonly reason: (typeof COMMERCE_JOB_CLOSURE_REASONS)[number];
  readonly revision: number;
  readonly shopRef: string;
  readonly type: "job.closed";
};

export type CommercePublicEvent =
  | CommerceShopEvent
  | CommerceShopWithdrawnEvent
  | CommerceOfferEvent
  | CommerceOfferWithdrawnEvent
  | CommerceAvailabilityEvent
  | CommerceJobEvent
  | CommerceJobClosedEvent;

export type CommercePublicEnvelope = {
  readonly contract: CommercePublicContract;
  readonly eventId: string;
  readonly objectRef: string;
  readonly payload: CommercePublicEvent;
  readonly version: 1;
};

const P = "$.payload";
const L = COMMERCE_PUBLIC_LIMITS;

function readRevision(value: unknown, path: string): number {
  return commerceInteger(value, path, 1, Number.MAX_SAFE_INTEGER, "invalid_revision");
}

/** Référence de l'objet : grammaire et type, puis égalité exacte avec `objectRef`. */
function readObjectRef(value: unknown, path: string, kind: CommerceRefKind, objectRef: string): string {
  const ref = commerceRef(value, path, [kind]);
  if (ref !== objectRef) commerceReject("reference_mismatch", path);
  return ref;
}

function optionalText(
  row: Readonly<Record<string, unknown>>,
  key: string,
  min: number,
  max: number,
): string | undefined {
  return commerceHas(row, key) ? commerceText(row[key], `${P}.${key}`, min, max) : undefined;
}

const PRICE_AMOUNT_KEYS = ["amount", "maxAmount", "minAmount", "unit"] as const;
const PRICE_SHAPES: Readonly<Record<CommercePriceMode, { required: readonly string[]; optional: readonly string[] }>> = {
  fixed: { required: ["amount"], optional: [] },
  unit: { required: ["amount", "unit"], optional: [] },
  range: { required: ["maxAmount", "minAmount"], optional: ["unit"] },
  quote: { required: [], optional: [] },
};

/**
 * Prix qualifié. Un montant manquant, superflu (un « sur devis » chiffré) ou
 * une fourchette inversée donne `amount_incoherent` ; une devise autre que XAF
 * `currency_mismatch` ; un montant non entier, négatif ou hors borne
 * `invalid_amount`.
 */
export function readCommercePrice(value: unknown, path: string): CommercePrice {
  if (value === null || typeof value !== "object" || Array.isArray(value)) commerceReject("invalid_payload", path);
  const row = value as Record<string, unknown>;
  const mode = commerceLiteral(row.mode, `${path}.mode`, COMMERCE_PRICE_MODES);
  const shape = PRICE_SHAPES[mode];
  for (const key of Object.keys(row)) {
    if (key === "currency" || key === "mode") continue;
    const priceKey = (PRICE_AMOUNT_KEYS as readonly string[]).includes(key);
    if (!priceKey) commerceReject("invalid_payload", `${path}.${key}`);
    if (!shape.required.includes(key) && !shape.optional.includes(key)) commerceReject("amount_incoherent", `${path}.${key}`);
    if (row[key] === undefined) commerceReject("invalid_payload", `${path}.${key}`);
  }
  for (const key of ["currency", ...shape.required]) {
    if (!commerceHas(row, key)) commerceReject(key === "currency" ? "invalid_payload" : "amount_incoherent", `${path}.${key}`);
  }
  const currency = commerceCurrency(row.currency, `${path}.currency`);
  const unit = commerceHas(row, "unit") ? commerceText(row.unit, `${path}.unit`, 1, L.unitMax) : undefined;
  switch (mode) {
    case "fixed":
      return { amount: commerceAmount(row.amount, `${path}.amount`), currency, mode };
    case "unit":
      return { amount: commerceAmount(row.amount, `${path}.amount`), currency, mode, unit: unit ?? "" };
    case "range": {
      const maxAmount = commerceAmount(row.maxAmount, `${path}.maxAmount`);
      const minAmount = commerceAmount(row.minAmount, `${path}.minAmount`);
      if (minAmount > maxAmount) commerceReject("amount_incoherent", path);
      return { currency, maxAmount, minAmount, mode, ...(unit === undefined ? {} : { unit }) };
    }
    case "quote":
      return { currency, mode };
  }
}

function readCollections(value: unknown, path: string): readonly CommerceShopCollection[] {
  const collections = commerceArray(value, path, 0, L.shopCollectionsMax).map((item, index) => {
    const at = `${path}[${index}]`;
    const row = commerceRecord(item, at, ["collectionRef", "label", "position"]);
    return {
      collectionRef: commerceRef(row.collectionRef, `${at}.collectionRef`, ["offer_collection"]),
      label: commerceText(row.label, `${at}.label`, 1, L.collectionLabelMax),
      position: commerceInteger(row.position, `${at}.position`, 0, L.collectionPositionMax),
    };
  });
  commerceUnique(collections.map((collection) => collection.collectionRef), path);
  return collections;
}

function readShop(payload: unknown, type: CommerceShopEvent["type"], objectRef: string, nowMs: number, contract: CommercePublicContract): CommerceShopEvent {
  const row = commerceRecord(
    payload,
    P,
    ["capabilities", "changedAt", "collections", "commercialName", "country", "currency", "linkRef", "revision", "sellerVerification", "shopRef", "type"],
    contract === COMMERCE_PUBLIC_CONTRACT_V2 ? ["serviceArea", "storefrontTerms"] : ["serviceArea"],
  );
  const shopRef = readObjectRef(row.shopRef, `${P}.shopRef`, "structure", objectRef);
  const revision = readRevision(row.revision, `${P}.revision`);
  const changedAt = commerceTimeMs(row.changedAt, `${P}.changedAt`, nowMs);
  const capabilities = commerceSortedSet(row.capabilities, `${P}.capabilities`, COMMERCE_SHOP_CAPABILITIES);
  const collections = readCollections(row.collections, `${P}.collections`);
  const commercialName = commerceText(row.commercialName, `${P}.commercialName`, L.shopNameMin, L.shopNameMax);
  const country = commerceCountry(row.country, `${P}.country`);
  const currency = commerceCurrency(row.currency, `${P}.currency`);
  const linkRef = commerceRef(row.linkRef, `${P}.linkRef`, ["commerce_link"]);
  const sellerVerification = commerceLiteral(row.sellerVerification, `${P}.sellerVerification`, COMMERCE_SELLER_VERIFICATIONS);
  const serviceArea = optionalText(row, "serviceArea", 1, L.serviceAreaMax);
  const storefrontTerms = commerceHas(row, "storefrontTerms") ? readCommerceStorefrontTerms(row.storefrontTerms, `${P}.storefrontTerms`) : undefined;
  if (storefrontTerms && storefrontTerms.publishedAt > changedAt) commerceReject("invalid_time", `${P}.storefrontTerms.publishedAt`);
  // Règle PRO.GA : le module commerce n'est effectif que pour une structure vérifiée.
  if (capabilities.includes("checkout") && sellerVerification !== "verified") {
    commerceReject("capability_incoherent", `${P}.capabilities`);
  }
  return {
    capabilities,
    changedAt,
    collections,
    commercialName,
    country,
    currency,
    linkRef,
    revision,
    sellerVerification,
    ...(serviceArea === undefined ? {} : { serviceArea }),
    ...(storefrontTerms ? { storefrontTerms } : {}),
    shopRef,
    type,
  };
}

function readShopWithdrawn(payload: unknown, objectRef: string, nowMs: number): CommerceShopWithdrawnEvent {
  const row = commerceRecord(payload, P, ["changedAt", "linkRef", "reason", "revision", "shopRef", "type"]);
  const shopRef = readObjectRef(row.shopRef, `${P}.shopRef`, "structure", objectRef);
  const revision = readRevision(row.revision, `${P}.revision`);
  const changedAt = commerceTimeMs(row.changedAt, `${P}.changedAt`, nowMs);
  const linkRef = commerceRef(row.linkRef, `${P}.linkRef`, ["commerce_link"]);
  const reason = commerceLiteral(row.reason, `${P}.reason`, COMMERCE_SHOP_WITHDRAWAL_REASONS);
  return { changedAt, linkRef, reason, revision, shopRef, type: "shop.withdrawn" };
}

function readMedia(value: unknown, path: string): readonly CommerceMedia[] {
  const media = commerceArray(value, path, 0, L.mediaMax).map((item, index) => {
    const at = `${path}[${index}]`;
    const row = commerceRecord(item, at, ["byteSize", "mimeType", "sha256"], ["altText", "height", "width"]);
    const altText = commerceHas(row, "altText") ? commerceText(row.altText, `${at}.altText`, 1, L.mediaAltMax) : undefined;
    const byteSize = commerceInteger(row.byteSize, `${at}.byteSize`, 1, L.mediaBytesMax);
    const height = commerceHas(row, "height") ? commerceInteger(row.height, `${at}.height`, 1, L.mediaDimensionMax) : undefined;
    const mimeType = commerceLiteral(row.mimeType, `${at}.mimeType`, COMMERCE_MEDIA_MIME_TYPES);
    const sha256 = commerceSha256(row.sha256, `${at}.sha256`);
    const width = commerceHas(row, "width") ? commerceInteger(row.width, `${at}.width`, 1, L.mediaDimensionMax) : undefined;
    return {
      ...(altText === undefined ? {} : { altText }),
      byteSize,
      ...(height === undefined ? {} : { height }),
      mimeType,
      sha256,
      ...(width === undefined ? {} : { width }),
    };
  });
  commerceUnique(media.map((item) => item.sha256), path);
  return media;
}

function readVariants(value: unknown, path: string, axes: readonly string[], price: CommercePrice): readonly CommerceVariant[] {
  const list = commerceArray(value, path, 0, L.variantsMax);
  // Une offre « sur devis » n'a pas de variante chiffrée : elle n'est jamais payable.
  if (price.mode === "quote" && list.length > 0) commerceReject("amount_incoherent", path);
  const variants = list.map((item, index): CommerceVariant => {
    const at = `${path}[${index}]`;
    const row = commerceRecord(item, at, ["amount", "label", "options", "variantRef"], ["effectiveFrom", "effectiveTo", "unit"]);
    const amount = commerceAmount(row.amount, `${at}.amount`);
    const effectiveFrom = commerceHas(row, "effectiveFrom") ? commerceInstant(row.effectiveFrom, `${at}.effectiveFrom`) : undefined;
    const effectiveTo = commerceHas(row, "effectiveTo") ? commerceInstant(row.effectiveTo, `${at}.effectiveTo`) : undefined;
    if (effectiveFrom !== undefined && effectiveTo !== undefined && effectiveTo <= effectiveFrom) {
      commerceReject("invalid_time", `${at}.effectiveTo`);
    }
    const label = commerceText(row.label, `${at}.label`, 1, L.variantLabelMax);
    const options = commerceArray(row.options, `${at}.options`, 0, L.variantAxesMax).map((option, position) =>
      commerceText(option, `${at}.options[${position}]`, 1, L.variantOptionMax),
    );
    // Variante saisie à la main : aucune option ; variante de grille : une valeur par axe déclaré.
    if (options.length !== 0 && options.length !== axes.length) commerceReject("invalid_payload", `${at}.options`);
    const unit = commerceHas(row, "unit") ? commerceText(row.unit, `${at}.unit`, 1, L.unitMax) : undefined;
    const variantRef = commerceRef(row.variantRef, `${at}.variantRef`, ["offer_variant"]);
    return {
      amount,
      ...(effectiveFrom === undefined ? {} : { effectiveFrom }),
      ...(effectiveTo === undefined ? {} : { effectiveTo }),
      label,
      options,
      ...(unit === undefined ? {} : { unit }),
      variantRef,
    };
  });
  commerceUnique(variants.map((variant) => variant.variantRef), path);
  // Même règle d'unicité que PRO.GA : libellé normalisé (espaces de bord, minuscules).
  commerceUnique(variants.map((variant) => variant.label.trim().toLowerCase()), path);
  return variants;
}

function readOffer(payload: unknown, type: CommerceOfferEvent["type"], objectRef: string, nowMs: number, contract: CommercePublicContract): CommerceOfferEvent {
  const row = commerceRecord(
    payload,
    P,
    ["changedAt", "collectionRefs", "description", "kind", "media", "offerRef", "price", "revision", "shopRef", "showsAvailability", "tags", "title", "type", "variantAxes", "variants"],
    contract === COMMERCE_PUBLIC_CONTRACT_V2 ? ["facets", "serviceProfile", "leadTimeDays", "zone"] : ["leadTimeDays", "zone"],
  );
  const offerRef = readObjectRef(row.offerRef, `${P}.offerRef`, "offer", objectRef);
  const revision = readRevision(row.revision, `${P}.revision`);
  const changedAt = commerceTimeMs(row.changedAt, `${P}.changedAt`, nowMs);
  const collectionRefs = commerceRefList(row.collectionRefs, `${P}.collectionRefs`, L.offerCollectionsMax, "offer_collection");
  const description = commerceText(row.description, `${P}.description`, 0, L.offerDescriptionMax, true);
  const facets = commerceHas(row, "facets") ? readCommerceCatalogFacets(row.facets, `${P}.facets`) : undefined;
  const kind = commerceLiteral(row.kind, `${P}.kind`, COMMERCE_OFFER_KINDS);
  const leadTimeDays = commerceHas(row, "leadTimeDays") ? commerceInteger(row.leadTimeDays, `${P}.leadTimeDays`, 0, L.leadTimeDaysMax) : undefined;
  const media = readMedia(row.media, `${P}.media`);
  const serviceProfile = commerceHas(row, "serviceProfile") ? readCommerceServiceProfile(row.serviceProfile, `${P}.serviceProfile`, media.length) : undefined;
  if (serviceProfile !== undefined && kind !== "service") commerceReject("invalid_payload", `${P}.serviceProfile`);
  const price = readCommercePrice(row.price, `${P}.price`);
  const shopRef = commerceRef(row.shopRef, `${P}.shopRef`, ["structure"]);
  const showsAvailability = commerceBoolean(row.showsAvailability, `${P}.showsAvailability`);
  const tags = commerceTextList(row.tags, `${P}.tags`, L.tagsMax, L.tagMax);
  const title = commerceText(row.title, `${P}.title`, L.offerTitleMin, L.offerTitleMax);
  const variantAxes = commerceTextList(row.variantAxes, `${P}.variantAxes`, L.variantAxesMax, L.variantAxisMax);
  const variants = readVariants(row.variants, `${P}.variants`, variantAxes, price);
  const zone = optionalText(row, "zone", 1, L.zoneMax);
  if (facets !== undefined && !catalogFacetsMatchKind(facets, kind)) commerceReject("invalid_payload", `${P}.facets.categoryPath`);
  return {
    changedAt,
    collectionRefs,
    description,
    ...(facets === undefined ? {} : { facets }),
    ...(serviceProfile === undefined ? {} : { serviceProfile }),
    kind,
    ...(leadTimeDays === undefined ? {} : { leadTimeDays }),
    media,
    offerRef,
    price,
    revision,
    shopRef,
    showsAvailability,
    tags,
    title,
    type,
    variantAxes,
    variants,
    ...(zone === undefined ? {} : { zone }),
  };
}

function readOfferWithdrawn(payload: unknown, objectRef: string, nowMs: number): CommerceOfferWithdrawnEvent {
  const row = commerceRecord(payload, P, ["changedAt", "offerRef", "reason", "revision", "shopRef", "type"]);
  const offerRef = readObjectRef(row.offerRef, `${P}.offerRef`, "offer", objectRef);
  const revision = readRevision(row.revision, `${P}.revision`);
  const changedAt = commerceTimeMs(row.changedAt, `${P}.changedAt`, nowMs);
  const reason = commerceLiteral(row.reason, `${P}.reason`, COMMERCE_OFFER_WITHDRAWAL_REASONS);
  const shopRef = commerceRef(row.shopRef, `${P}.shopRef`, ["structure"]);
  return { changedAt, offerRef, reason, revision, shopRef, type: "offer.withdrawn" };
}

function readAvailability(payload: unknown, objectRef: string, nowMs: number): CommerceAvailabilityEvent {
  const row = commerceRecord(payload, P, ["availability", "availabilityRevision", "changedAt", "offerRef", "shopRef", "type", "variants"]);
  const offerRef = readObjectRef(row.offerRef, `${P}.offerRef`, "offer", objectRef);
  const availabilityRevision = readRevision(row.availabilityRevision, `${P}.availabilityRevision`);
  const changedAt = commerceTimeMs(row.changedAt, `${P}.changedAt`, nowMs);
  const availability = commerceLiteral(row.availability, `${P}.availability`, COMMERCE_AVAILABILITY_STATES);
  const shopRef = commerceRef(row.shopRef, `${P}.shopRef`, ["structure"]);
  const variants = commerceArray(row.variants, `${P}.variants`, 0, L.variantsMax).map((item, index) => {
    const at = `${P}.variants[${index}]`;
    const entry = commerceRecord(item, at, ["availability", "variantRef"]);
    return {
      availability: commerceLiteral(entry.availability, `${at}.availability`, COMMERCE_AVAILABILITY_STATES),
      variantRef: commerceRef(entry.variantRef, `${at}.variantRef`, ["offer_variant"]),
    };
  });
  commerceUnique(variants.map((entry) => entry.variantRef), `${P}.variants`);
  return { availability, availabilityRevision, changedAt, offerRef, shopRef, type: "offer.availabilityChanged", variants };
}

function readSalary(value: unknown, path: string): CommerceDeclaredSalary {
  const row = commerceRecord(value, path, ["currency"], ["maxAmount", "minAmount"]);
  const currency = commerceCurrency(row.currency, `${path}.currency`);
  const maxAmount = commerceHas(row, "maxAmount") ? commerceAmount(row.maxAmount, `${path}.maxAmount`) : undefined;
  const minAmount = commerceHas(row, "minAmount") ? commerceAmount(row.minAmount, `${path}.minAmount`) : undefined;
  // Fourchette DÉCLARÉE (PRO.GA ne la déduit jamais) : au moins une borne, ordonnée.
  if (maxAmount === undefined && minAmount === undefined) commerceReject("amount_incoherent", path);
  if (maxAmount !== undefined && minAmount !== undefined && minAmount > maxAmount) commerceReject("amount_incoherent", path);
  return {
    currency,
    ...(maxAmount === undefined ? {} : { maxAmount }),
    ...(minAmount === undefined ? {} : { minAmount }),
  };
}

function readJob(payload: unknown, objectRef: string, nowMs: number): CommerceJobEvent {
  const row = commerceRecord(
    payload,
    P,
    ["changedAt", "contractType", "description", "headcount", "jobRef", "openedOn", "revision", "shopRef", "title", "type"],
    ["closesOn", "declaredSalary", "location"],
  );
  const jobRef = readObjectRef(row.jobRef, `${P}.jobRef`, "job_opening", objectRef);
  const revision = readRevision(row.revision, `${P}.revision`);
  const changedAt = commerceTimeMs(row.changedAt, `${P}.changedAt`, nowMs);
  const closesOn = commerceHas(row, "closesOn") ? commerceIsoDate(row.closesOn, `${P}.closesOn`) : undefined;
  const contractType = commerceLiteral(row.contractType, `${P}.contractType`, COMMERCE_JOB_CONTRACT_TYPES);
  const declaredSalary = commerceHas(row, "declaredSalary") ? readSalary(row.declaredSalary, `${P}.declaredSalary`) : undefined;
  const description = commerceText(row.description, `${P}.description`, 0, L.jobDescriptionMax, true);
  const headcount = commerceInteger(row.headcount, `${P}.headcount`, 1, L.headcountMax);
  const location = optionalText(row, "location", 1, L.jobLocationMax);
  const openedOn = commerceIsoDate(row.openedOn, `${P}.openedOn`);
  const shopRef = commerceRef(row.shopRef, `${P}.shopRef`, ["structure"]);
  const title = commerceText(row.title, `${P}.title`, L.jobTitleMin, L.jobTitleMax);
  if (closesOn !== undefined && closesOn < openedOn) commerceReject("invalid_time", `${P}.closesOn`);
  return {
    changedAt,
    ...(closesOn === undefined ? {} : { closesOn }),
    contractType,
    ...(declaredSalary === undefined ? {} : { declaredSalary }),
    description,
    headcount,
    jobRef,
    ...(location === undefined ? {} : { location }),
    openedOn,
    revision,
    shopRef,
    title,
    type: "job.published",
  };
}

function readJobClosed(payload: unknown, objectRef: string, nowMs: number): CommerceJobClosedEvent {
  const row = commerceRecord(payload, P, ["changedAt", "jobRef", "reason", "revision", "shopRef", "type"]);
  const jobRef = readObjectRef(row.jobRef, `${P}.jobRef`, "job_opening", objectRef);
  const revision = readRevision(row.revision, `${P}.revision`);
  const changedAt = commerceTimeMs(row.changedAt, `${P}.changedAt`, nowMs);
  const reason = commerceLiteral(row.reason, `${P}.reason`, COMMERCE_JOB_CLOSURE_REASONS);
  const shopRef = commerceRef(row.shopRef, `${P}.shopRef`, ["structure"]);
  return { changedAt, jobRef, reason, revision, shopRef, type: "job.closed" };
}

function readPublicPayload(payload: unknown, objectRef: string, nowMs: number, contract: CommercePublicContract): CommercePublicEvent {
  if (payload === null || typeof payload !== "object" || Array.isArray(payload)) commerceReject("invalid_payload", P);
  commerceScanJson(payload, PUBLIC_FORBIDDEN, P);
  const type = (payload as Record<string, unknown>).type;
  if (typeof type !== "string") commerceReject("invalid_payload", `${P}.type`);
  switch (type) {
    case "shop.published":
    case "shop.updated":
      return readShop(payload, type, objectRef, nowMs, contract);
    case "shop.withdrawn":
      return readShopWithdrawn(payload, objectRef, nowMs);
    case "offer.published":
    case "offer.updated":
      return readOffer(payload, type, objectRef, nowMs, contract);
    case "offer.withdrawn":
      return readOfferWithdrawn(payload, objectRef, nowMs);
    case "offer.availabilityChanged":
      return readAvailability(payload, objectRef, nowMs);
    case "job.published":
      return readJob(payload, objectRef, nowMs);
    case "job.closed":
      return readJobClosed(payload, objectRef, nowMs);
    default:
      return commerceReject("unknown_event", `${P}.type`);
  }
}

/**
 * Charge seule, quand l'enveloppe a déjà été lue par l'inbox. Le réseau ne
 * vient JAMAIS de la charge : il est résolu par la configuration de
 * l'émetteur (registre `federationEmitters`).
 */
export function parseCommercePublicPayload(
  payload: unknown,
  objectRef: string,
  nowMs: number,
  contract: CommercePublicContract = COMMERCE_PUBLIC_CONTRACT,
): CommerceResult<CommercePublicEvent, CommercePublicReason> {
  return commerceCapture(() => {
    if (!isCommercePublicContract(contract)) commerceReject("invalid_envelope", "$.contract");
    return readPublicPayload(payload, objectRef, nowMs, contract);
  });
}

const ENVELOPE_KEYS = ["contract", "eventId", "objectRef", "payload", "version"] as const;

/** Corps exact reçu (octets signés) : forme canonique exigée, puis enveloppe et charge. */
export function parseCommercePublicBody(
  rawBody: string,
  nowMs: number,
): CommerceResult<CommercePublicEnvelope, CommercePublicReason> {
  return commerceCapture(() => {
    const parsed = commerceParseCanonicalBody(rawBody, COMMERCE_BODY_MAX_BYTES);
    const row = commerceRecord(parsed, "$", ENVELOPE_KEYS, [], "invalid_envelope");
    if (!isCommercePublicContract(row.contract)) commerceReject("invalid_envelope", "$.contract");
    if (row.version !== 1) commerceReject("invalid_envelope", "$.version");
    const eventId = row.eventId;
    if (!commerceIsOpaqueId(eventId)) commerceReject("invalid_envelope", "$.eventId");
    const objectRef = commerceRef(row.objectRef, "$.objectRef", ["job_opening", "offer", "structure"]);
    const payload = readPublicPayload(row.payload, objectRef, nowMs, row.contract);
    return { contract: row.contract, eventId, objectRef, payload, version: 1 };
  });
}

/** Message signé du profil PUBLIC : celui de FEDERATION-INBOX-V1, inchangé. */
export function commercePublicSigningText(
  environment: CommerceEnvironment,
  timestampSeconds: string,
  rawBody: string,
): string {
  return `${environment}\n${timestampSeconds}\n${rawBody}`;
}

// ─── Révisions, retraits et rejeu ────────────────────────────────────────────

export type CommercePublicSequence = "availability" | "catalog";
export type CommercePublicEffectKind = "close" | "upsert" | "withdraw";
export type CommercePublicEffect = {
  readonly effect: CommercePublicEffectKind;
  readonly objectRef: string;
  readonly revision: number;
  readonly sequence: CommercePublicSequence;
};

/** Effet d'un événement sur le miroir et séquence de révisions qu'il fait avancer. */
export function commercePublicEffect(event: CommercePublicEvent): CommercePublicEffect {
  switch (event.type) {
    case "shop.published":
    case "shop.updated":
      return { effect: "upsert", objectRef: event.shopRef, revision: event.revision, sequence: "catalog" };
    case "shop.withdrawn":
      return { effect: "withdraw", objectRef: event.shopRef, revision: event.revision, sequence: "catalog" };
    case "offer.published":
    case "offer.updated":
      return { effect: "upsert", objectRef: event.offerRef, revision: event.revision, sequence: "catalog" };
    case "offer.withdrawn":
      return { effect: "withdraw", objectRef: event.offerRef, revision: event.revision, sequence: "catalog" };
    case "offer.availabilityChanged":
      return { effect: "upsert", objectRef: event.offerRef, revision: event.availabilityRevision, sequence: "availability" };
    case "job.published":
      return { effect: "upsert", objectRef: event.jobRef, revision: event.revision, sequence: "catalog" };
    case "job.closed":
      return {
        effect: event.reason === "withdrawn" ? "withdraw" : "close",
        objectRef: event.jobRef,
        revision: event.revision,
        sequence: "catalog",
      };
  }
}

export type CommerceMirrorState = "active" | "closed" | "withdrawn";

/** Dernier état admis d'un objet pour UNE séquence ; `digest` = empreinte de sa forme canonique. */
export type CommerceMirrorHead = {
  readonly digest: string;
  readonly revision: number;
  readonly state: CommerceMirrorState;
};

export type CommerceRevisionDecision =
  | { readonly action: "apply"; readonly gap: boolean; readonly state: CommerceMirrorState }
  | { readonly action: "duplicate" }
  | { readonly action: "stale" }
  | { readonly action: "conflict"; readonly reason: "revision_conflict" | "terminal_object" };

/**
 * Ordre métier, indépendant du transport (`eventId`) et de l'ordre d'arrivée :
 * - révision inférieure : `stale` (reconnue, sans réécriture) ;
 * - révision égale : même empreinte `duplicate`, autre empreinte `conflict` ;
 * - révision supérieure : `apply`, sauf objet fermé définitivement ;
 * - un retrait sans objet connu conserve une tombe : l'objet ne ressuscite
 *   jamais par une révision plus ancienne.
 * `gap` signale des révisions manquées : chaque charge est un état complet,
 * elle s'applique, et une relecture bornée peut être planifiée.
 */
export function decideCommercePublicRevision(
  head: CommerceMirrorHead | null,
  incoming: { readonly digest: string; readonly effect: CommercePublicEffectKind; readonly revision: number },
): CommerceRevisionDecision {
  const state: CommerceMirrorState =
    incoming.effect === "upsert" ? "active" : incoming.effect === "close" ? "closed" : "withdrawn";
  if (head === null) return { action: "apply", gap: false, state };
  if (incoming.revision < head.revision) return { action: "stale" };
  if (incoming.revision === head.revision) {
    return incoming.digest === head.digest ? { action: "duplicate" } : { action: "conflict", reason: "revision_conflict" };
  }
  if (head.state === "closed") return { action: "conflict", reason: "terminal_object" };
  return { action: "apply", gap: incoming.revision > head.revision + 1, state };
}

// ─── Achat, affichage et projections anonymes ────────────────────────────────

export type CommercePurchasability =
  | { readonly payable: true; readonly unit?: string; readonly unitAmount: number }
  | {
      readonly payable: false;
      readonly reason: "on_quote" | "price_not_exact" | "variant_inactive" | "variant_required" | "variant_unknown";
    };

function variantActive(variant: CommerceVariant, nowMs: number): boolean {
  return (
    (variant.effectiveFrom === undefined || variant.effectiveFrom <= nowMs) &&
    (variant.effectiveTo === undefined || variant.effectiveTo > nowMs)
  );
}

/**
 * Une ligne n'est payable qu'à un prix EXACT : variante active, ou offre
 * `fixed`/`unit` sans variante. « Sur devis » et fourchette ne le sont jamais.
 * Ce jugement est indicatif : `checkout.prepare` relit prix et stock chez PRO.GA.
 */
export function commerceOfferPurchasability(
  offer: CommerceOfferEvent,
  variantRef: string | undefined,
  nowMs: number,
): CommercePurchasability {
  if (offer.price.mode === "quote") return { payable: false, reason: "on_quote" };
  const priceUnit = offer.price.mode === "unit" ? offer.price.unit : undefined;
  if (offer.variants.length > 0) {
    if (variantRef === undefined) return { payable: false, reason: "variant_required" };
    const variant = offer.variants.find((item) => item.variantRef === variantRef);
    if (variant === undefined) return { payable: false, reason: "variant_unknown" };
    if (!variantActive(variant, nowMs)) return { payable: false, reason: "variant_inactive" };
    const unit = variant.unit ?? priceUnit;
    return { payable: true, ...(unit === undefined ? {} : { unit }), unitAmount: variant.amount };
  }
  if (variantRef !== undefined) return { payable: false, reason: "variant_unknown" };
  if (offer.price.mode === "fixed") return { payable: true, unitAmount: offer.price.amount };
  if (offer.price.mode === "unit") return { payable: true, unit: offer.price.unit, unitAmount: offer.price.amount };
  return { payable: false, reason: "price_not_exact" };
}

export type CommerceOfferPrimaryAction = "buy" | "contact" | "request_quote";

/** « Demander un devis » pour un sur-devis, jamais un faux bouton d'achat. */
export function commerceOfferPrimaryAction(
  offer: CommerceOfferEvent,
  options: { readonly nowMs: number; readonly purchase: boolean; readonly quote: boolean },
): CommerceOfferPrimaryAction {
  const askQuote: CommerceOfferPrimaryAction = options.quote ? "request_quote" : "contact";
  if (offer.price.mode === "quote") return askQuote;
  const purchasable =
    offer.variants.length > 0
      ? offer.variants.some((variant) => variantActive(variant, options.nowMs))
      : offer.price.mode === "fixed" || offer.price.mode === "unit";
  if (purchasable && options.purchase) return "buy";
  return offer.price.mode === "range" && offer.variants.length === 0 ? askQuote : "contact";
}

export type CommerceOfferPublicView = {
  readonly availability: CommerceAvailabilityState | null;
  readonly collectionRefs: readonly string[];
  readonly description: string;
  readonly facets?: CommerceCatalogFacets;
  readonly serviceProfile?: CommerceServiceProfile;
  readonly kind: CommerceOfferEvent["kind"];
  readonly leadTimeDays?: number;
  readonly media: readonly CommerceMedia[];
  readonly offerRef: string;
  readonly price: CommercePrice;
  readonly primaryAction: CommerceOfferPrimaryAction;
  readonly revision: number;
  readonly shopRef: string;
  readonly tags: readonly string[];
  readonly title: string;
  readonly variantAxes: readonly string[];
  readonly variants: readonly {
    readonly amount: number;
    readonly availability: CommerceAvailabilityState | null;
    readonly label: string;
    readonly options: readonly string[];
    readonly unit?: string;
    readonly variantRef: string;
  }[];
  readonly zone?: string;
};

/**
 * Projection ANONYME d'une offre : allowlist explicite, variantes de leur
 * fenêtre d'effet seulement, disponibilité absente si l'offre ne l'expose pas.
 * Les médias restent des descripteurs à admettre par la garde des fichiers.
 */
export function commerceOfferPublicView(
  offer: CommerceOfferEvent,
  availability: CommerceAvailabilityEvent | null,
  options: { readonly nowMs: number; readonly purchase: boolean; readonly quote: boolean },
): CommerceOfferPublicView {
  const shown = offer.showsAvailability;
  const matching = availability !== null && availability.offerRef === offer.offerRef ? availability : null;
  const variantState = (variantRef: string): CommerceAvailabilityState | null => {
    if (!shown) return null;
    return matching?.variants.find((entry) => entry.variantRef === variantRef)?.availability ?? "unknown";
  };
  return {
    availability: shown ? (matching?.availability ?? "unknown") : null,
    collectionRefs: offer.collectionRefs,
    description: offer.description,
    ...(offer.facets === undefined ? {} : { facets: offer.facets }),
    ...(offer.serviceProfile === undefined ? {} : { serviceProfile: offer.serviceProfile }),
    kind: offer.kind,
    ...(offer.leadTimeDays === undefined ? {} : { leadTimeDays: offer.leadTimeDays }),
    media: offer.media,
    offerRef: offer.offerRef,
    price: offer.price,
    primaryAction: commerceOfferPrimaryAction(offer, options),
    revision: offer.revision,
    shopRef: offer.shopRef,
    tags: offer.tags,
    title: offer.title,
    variantAxes: offer.variantAxes,
    variants: offer.variants
      .filter((variant) => variantActive(variant, options.nowMs))
      .map((variant) => ({
        amount: variant.amount,
        availability: variantState(variant.variantRef),
        label: variant.label,
        options: variant.options,
        ...(variant.unit === undefined ? {} : { unit: variant.unit }),
        variantRef: variant.variantRef,
      })),
    ...(offer.zone === undefined ? {} : { zone: offer.zone }),
  };
}

export type CommerceShopPublicView = {
  readonly capabilities: readonly CommerceShopCapability[];
  readonly collections: readonly CommerceShopCollection[];
  readonly commercialName: string;
  readonly country: string;
  readonly currency: typeof COMMERCE_CURRENCY;
  readonly sellerVerification: CommerceSellerVerification;
  readonly serviceArea?: string;
  readonly shopRef: string;
  readonly storefrontTerms?: CommerceStorefrontTerms;
};

/** Projection ANONYME d'une boutique : sans référence de liaison, catégories rangées par position. */
export function commerceShopPublicView(shop: CommerceShopEvent): CommerceShopPublicView {
  return {
    capabilities: shop.capabilities,
    collections: [...shop.collections].sort(
      (left, right) => left.position - right.position || (left.collectionRef < right.collectionRef ? -1 : 1),
    ),
    commercialName: shop.commercialName,
    country: shop.country,
    currency: shop.currency,
    sellerVerification: shop.sellerVerification,
    ...(shop.serviceArea === undefined ? {} : { serviceArea: shop.serviceArea }),
    ...(shop.storefrontTerms === undefined ? {} : { storefrontTerms: shop.storefrontTerms }),
    shopRef: shop.shopRef,
  };
}
