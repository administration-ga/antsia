/**
 * PRO-COMMERCE-PUBLIC-V1/V2 · PRO-COMMERCE-COMMAND-V1 — primitives communes.
 *
 * FICHIER JUMEAU, octet pour octet : ANTSIA `packages/social-domain/src/commerce/`
 * et PRO.GA `packages/pro-domain/src/commerce/`. Son empreinte figure dans
 * `fixtures/MANIFEST.json` ; les tests des deux dépôts la vérifient. Toute
 * modification se fait dans les deux dépôts, manifeste compris.
 *
 * TypeScript pur : aucune dépendance, aucune I/O, aucune horloge implicite
 * (l'instant est toujours un argument), aucun aléa, aucun secret.
 */

export const COMMERCE_PUBLIC_CONTRACT = "PRO-COMMERCE-PUBLIC-V1";
export const COMMERCE_PUBLIC_CONTRACT_V2 = "PRO-COMMERCE-PUBLIC-V2";
export const COMMERCE_PUBLIC_CONTRACTS = [COMMERCE_PUBLIC_CONTRACT, COMMERCE_PUBLIC_CONTRACT_V2] as const;
export type CommercePublicContract = (typeof COMMERCE_PUBLIC_CONTRACTS)[number];
export function isCommercePublicContract(value: unknown): value is CommercePublicContract {
  return typeof value === "string" && (COMMERCE_PUBLIC_CONTRACTS as readonly string[]).includes(value);
}
export const COMMERCE_COMMAND_CONTRACT = "PRO-COMMERCE-COMMAND-V1";
/** Version de TRANSPORT (enveloppe) : jamais une révision métier. */
export const COMMERCE_TRANSPORT_VERSION = 1;
/** V1 : une seule devise, sans conversion implicite. */
export const COMMERCE_CURRENCY = "XAF";
export const COMMERCE_ENVIRONMENTS = ["sandbox", "production"] as const;
export type CommerceEnvironment = (typeof COMMERCE_ENVIRONMENTS)[number];

/** Tolérance d'horloge commune aux deux profils de signature existants. */
export const COMMERCE_MAX_SKEW_MS = 5 * 60 * 1000;
/** Borne contractuelle d'un montant (unité minimale XAF), pas une règle métier. */
export const COMMERCE_MAX_AMOUNT_XAF = 10_000_000_000;
/** Bornes JSON identiques à celles de l'inbox ANTSIA (FEDERATION-INBOX-V1). */
export const COMMERCE_BODY_MAX_BYTES = 128 * 1024;
export const COMMERCE_JSON_MAX_DEPTH = 8;
export const COMMERCE_JSON_MAX_NODES = 2000;
export const COMMERCE_JSON_MAX_ITEMS = 256;
export const COMMERCE_JSON_MAX_FIELDS = 64;
export const COMMERCE_JSON_MAX_KEY_LENGTH = 100;
export const COMMERCE_STRING_MAX_LENGTH = 8192;

export type CommerceJson =
  | null
  | boolean
  | number
  | string
  | readonly CommerceJson[]
  | { readonly [key: string]: CommerceJson };

export type CommerceOk<T> = { readonly ok: true; readonly value: T };
export type CommerceKo<R extends string> = {
  readonly ok: false;
  readonly reason: R;
  readonly path: string;
};
export type CommerceResult<T, R extends string> = CommerceOk<T> | CommerceKo<R>;

/**
 * Refus interne d'un validateur. Il ne sort jamais des fonctions publiques :
 * `commerceCapture` le convertit en résultat `{ ok: false, reason, path }`.
 */
export class CommerceContractRejection extends Error {
  readonly reason: string;
  readonly path: string;

  constructor(reason: string, path: string) {
    super(`${reason} @ ${path}`);
    this.name = "CommerceContractRejection";
    this.reason = reason;
    this.path = path;
  }
}

export function commerceReject(reason: string, path: string): never {
  throw new CommerceContractRejection(reason, path);
}

/** Exécute un validateur ; toute autre exception (défaut de code) remonte. */
export function commerceCapture<T, R extends string>(
  run: () => T,
): CommerceResult<T, R> {
  try {
    return { ok: true, value: run() };
  } catch (error) {
    if (error instanceof CommerceContractRejection) {
      return { ok: false, reason: error.reason as R, path: error.path };
    }
    throw error;
  }
}

export type CommerceRecord = Readonly<Record<string, unknown>>;

export function commerceHas(record: CommerceRecord, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(record, key);
}

/** Objet fermé : clés requises présentes, aucune clé hors liste, aucun `undefined`. */
export function commerceRecord(
  value: unknown,
  path: string,
  required: readonly string[],
  optional: readonly string[] = [],
  reason = "invalid_payload",
): CommerceRecord {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    commerceReject(reason, path);
  }
  const record = value as Record<string, unknown>;
  const allowed = new Set<string>([...required, ...optional]);
  for (const key of Object.keys(record)) {
    if (!allowed.has(key) || record[key] === undefined) {
      commerceReject(reason, `${path}.${key}`);
    }
  }
  for (const key of required) {
    if (!commerceHas(record, key)) commerceReject(reason, `${path}.${key}`);
  }
  return record;
}

export function commerceArray(
  value: unknown,
  path: string,
  min: number,
  max: number,
): readonly unknown[] {
  if (!Array.isArray(value) || value.length < min || value.length > max) {
    commerceReject("invalid_payload", path);
  }
  return value;
}

export function commerceLiteral<T extends string>(
  value: unknown,
  path: string,
  allowed: readonly T[],
  reason = "invalid_payload",
): T {
  if (typeof value !== "string" || !(allowed as readonly string[]).includes(value)) {
    commerceReject(reason, path);
  }
  return value as T;
}

export function commerceBoolean(value: unknown, path: string): boolean {
  if (typeof value !== "boolean") commerceReject("invalid_payload", path);
  return value;
}

export function commerceUnique(values: readonly string[], path: string): void {
  if (new Set(values).size !== values.length) commerceReject("duplicate_entry", path);
}

/**
 * Texte d'un contrat : chaîne déjà normalisée par l'émetteur (NFC, sans espace
 * de bord), sans caractère de contrôle (LF/CR admis seulement en multiligne).
 * Le producteur normalise ; il ne tronque jamais.
 */
export function commerceText(
  value: unknown,
  path: string,
  min: number,
  max: number,
  multiline = false,
): string {
  if (typeof value !== "string") commerceReject("invalid_payload", path);
  if (value.length < min || value.length > max) commerceReject("invalid_text", path);
  if (value !== value.trim() || value !== value.normalize("NFC")) {
    commerceReject("invalid_text", path);
  }
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    const paragraph = multiline && (code === 10 || code === 13);
    if ((code < 32 && !paragraph) || code === 127) commerceReject("invalid_text", path);
  }
  return value;
}

export function commerceInteger(
  value: unknown,
  path: string,
  min: number,
  max: number,
  reason = "invalid_payload",
): number {
  if (
    typeof value !== "number" ||
    !Number.isSafeInteger(value) ||
    value < min ||
    value > max
  ) {
    commerceReject(reason, path);
  }
  return value;
}

/** Montant entier en unité minimale XAF (le franc CFA n'a pas de subdivision). */
export function commerceAmount(value: unknown, path: string, minimum = 0): number {
  return commerceInteger(value, path, minimum, COMMERCE_MAX_AMOUNT_XAF, "invalid_amount");
}

export function commerceCurrency(value: unknown, path: string): typeof COMMERCE_CURRENCY {
  if (value !== COMMERCE_CURRENCY) {
    commerceReject(typeof value === "string" ? "currency_mismatch" : "invalid_payload", path);
  }
  return COMMERCE_CURRENCY;
}

export type CommerceMoney = {
  readonly amount: number;
  readonly currency: typeof COMMERCE_CURRENCY;
};

/** `{ amount, currency }` : la devise est jugée avant le montant. */
export function commerceMoney(value: unknown, path: string, minimum = 0): CommerceMoney {
  const record = commerceRecord(value, path, ["amount", "currency"]);
  const currency = commerceCurrency(record.currency, `${path}.currency`);
  return { amount: commerceAmount(record.amount, `${path}.amount`, minimum), currency };
}

/** Somme sûre de montants entiers ; `null` si la précision entière est dépassée. */
export function commerceSumAmounts(amounts: readonly number[]): number | null {
  let total = 0;
  for (const amount of amounts) {
    if (!Number.isSafeInteger(amount) || amount < 0) return null;
    total += amount;
    if (!Number.isSafeInteger(total)) return null;
  }
  return total;
}

/** Instant Unix en millisecondes, entier sûr strictement positif. */
export function commerceInstant(value: unknown, path: string): number {
  return commerceInteger(value, path, 1, Number.MAX_SAFE_INTEGER, "invalid_time");
}

/** Instant passé ou présent, tolérance d'horloge comprise. */
export function commerceTimeMs(value: unknown, path: string, nowMs: number): number {
  if (!Number.isSafeInteger(nowMs)) commerceReject("invalid_time", path);
  const at = commerceInstant(value, path);
  if (at > nowMs + COMMERCE_MAX_SKEW_MS) commerceReject("invalid_time", path);
  return at;
}

/** Date civile `AAAA-MM-JJ` existante (calendrier grégorien, années 1970-9999). */
export function commerceIsoDate(value: unknown, path: string): string {
  if (typeof value !== "string" || !/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(value)) {
    commerceReject("invalid_time", path);
  }
  const year = Number(value.slice(0, 4));
  const month = Number(value.slice(5, 7));
  const day = Number(value.slice(8, 10));
  const leap = (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
  const lengths = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  const length = lengths[month - 1];
  if (year < 1970 || length === undefined || day < 1 || day > length) {
    commerceReject("invalid_time", path);
  }
  return value;
}

export function commerceCountry(value: unknown, path: string): string {
  if (typeof value !== "string" || !/^[A-Z]{2}$/.test(value)) commerceReject("invalid_payload", path);
  return value;
}

const SHA256_HEX = /^[a-f0-9]{64}$/;

export function commerceIsSha256(value: unknown): value is string {
  return typeof value === "string" && SHA256_HEX.test(value);
}

export function commerceSha256(value: unknown, path: string): string {
  if (!commerceIsSha256(value)) commerceReject("invalid_payload", path);
  return value;
}

// ─── Références ──────────────────────────────────────────────────────────────

/**
 * Types d'objets PRO.GA qui traversent les contrats. Ceux de
 * `COMMERCE_REF_KINDS_PENDING_REGISTRATION` n'existent pas encore dans
 * `PRO_RESOURCE_TYPES` (18/10/2026) : PRO.GA doit les y ajouter avant de les
 * frapper (P08/P09).
 */
export const COMMERCE_REF_KINDS = [
  "agenda_resource",
  "agenda_service",
  "appointment",
  "checkout",
  "commerce_link",
  "establishment",
  "inquiry",
  "job_application",
  "job_opening",
  "offer",
  "offer_collection",
  "offer_variant",
  "order",
  "payment_intent",
  "quote",
  "refund",
  "structure",
] as const;
export type CommerceRefKind = (typeof COMMERCE_REF_KINDS)[number];

export const COMMERCE_REF_KINDS_PENDING_REGISTRATION: readonly CommerceRefKind[] = [
  "checkout",
  "commerce_link",
  "inquiry",
  "offer_variant",
  "refund",
];

/**
 * Référence de TRANSPORT : `pro.ga:<type>:<id>`, bijection exacte avec la
 * référence métier PRO.GA `pro.ga/<type>/<id>` (identifiant Crockford, jamais
 * un identifiant de stockage). Elle respecte la grammaire `objectRef` de
 * l'inbox ANTSIA, qui refuse `/`. Le récepteur la traite comme opaque et la
 * résout par sa table de correspondance serveur.
 */
const COMMERCE_TRANSPORT_REF = /^pro\.ga:([a-z][a-z_]{1,39}):([0-9A-HJKMNP-TV-Z]{10,32})$/;
const PRO_BUSINESS_REF = /^pro\.ga\/([a-z][a-z_]{1,39})\/([0-9A-HJKMNP-TV-Z]{10,32})$/;
const COMMERCE_REF_KIND_SET: ReadonlySet<string> = new Set(COMMERCE_REF_KINDS);

export type CommerceParsedRef = { readonly kind: CommerceRefKind; readonly id: string };

export function parseCommerceRef(value: unknown): CommerceParsedRef | null {
  if (typeof value !== "string") return null;
  const match = COMMERCE_TRANSPORT_REF.exec(value);
  const kind = match?.[1];
  const id = match?.[2];
  if (kind === undefined || id === undefined || !COMMERCE_REF_KIND_SET.has(kind)) return null;
  return { kind: kind as CommerceRefKind, id };
}

/** `pro.ga/<type>/<id>` → `pro.ga:<type>:<id>`, ou `null` hors contrat. */
export function commerceRefFromBusinessRef(businessRef: string): string | null {
  const match = PRO_BUSINESS_REF.exec(businessRef);
  const kind = match?.[1];
  const id = match?.[2];
  if (kind === undefined || id === undefined || !COMMERCE_REF_KIND_SET.has(kind)) return null;
  return `pro.ga:${kind}:${id}`;
}

/** `pro.ga:<type>:<id>` → `pro.ga/<type>/<id>`, ou `null` hors contrat. */
export function commerceBusinessRefFromRef(ref: string): string | null {
  const parsed = parseCommerceRef(ref);
  return parsed === null ? null : `pro.ga/${parsed.kind}/${parsed.id}`;
}

export function commerceRef(
  value: unknown,
  path: string,
  kinds: readonly CommerceRefKind[],
): string {
  const parsed = parseCommerceRef(value);
  if (parsed === null || !kinds.includes(parsed.kind)) commerceReject("invalid_reference", path);
  return value as string;
}

export function commerceOptionalRef(
  record: CommerceRecord,
  key: string,
  path: string,
  kinds: readonly CommerceRefKind[],
): string | undefined {
  return commerceHas(record, key) ? commerceRef(record[key], `${path}.${key}`, kinds) : undefined;
}

/** Liste de références d'un même type, sans doublon. */
export function commerceRefList(
  value: unknown,
  path: string,
  maxItems: number,
  kind: CommerceRefKind,
): readonly string[] {
  const list = commerceArray(value, path, 0, maxItems).map((item, index) =>
    commerceRef(item, `${path}[${index}]`, [kind]),
  );
  commerceUnique(list, path);
  return list;
}

/** Liste de textes courts sans doublon (étiquettes, axes de variantes). */
export function commerceTextList(
  value: unknown,
  path: string,
  maxItems: number,
  maxLength: number,
): readonly string[] {
  const list = commerceArray(value, path, 0, maxItems).map((item, index) =>
    commerceText(item, `${path}[${index}]`, 1, maxLength),
  );
  commerceUnique(list, path);
  return list;
}

/** Ensemble fermé, trié et sans doublon : son ordre ne peut pas faire varier une empreinte. */
export function commerceSortedSet<T extends string>(
  value: unknown,
  path: string,
  allowed: readonly T[],
  min = 0,
): readonly T[] {
  const list = commerceArray(value, path, min, allowed.length).map((item, index) =>
    commerceLiteral(item, `${path}[${index}]`, allowed),
  );
  commerceUnique(list, path);
  for (let index = 1; index < list.length; index += 1) {
    if ((list[index - 1] ?? "") >= (list[index] ?? "")) commerceReject("invalid_payload", path);
  }
  return list;
}

/**
 * Références opaques frappées par ANTSIA : sujet (`sub`), boutique (`shop`),
 * conversation (`conv`), fichier (`file`). Jamais un identifiant Convex, un
 * handle, un e-mail ou un téléphone ; pas de dérivation réversible.
 */
export const COMMERCE_ANTSIA_REF_KINDS = ["conv", "file", "shop", "sub"] as const;
export type CommerceAntsiaRefKind = (typeof COMMERCE_ANTSIA_REF_KINDS)[number];
const COMMERCE_ANTSIA_REF = /^antsia:(conv|file|shop|sub):[0-9a-z]{26,64}$/;

export function commerceAntsiaRef(
  value: unknown,
  path: string,
  kind: CommerceAntsiaRefKind,
): string {
  if (typeof value !== "string" || !COMMERCE_ANTSIA_REF.test(value) || !value.startsWith(`antsia:${kind}:`)) {
    commerceReject("invalid_reference", path);
  }
  return value;
}

/** Identifiant de livraison ou de demande : grammaire de l'inbox ANTSIA, 8 à 200 caractères. */
const COMMERCE_OPAQUE_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{7,199}$/;

export function commerceIsOpaqueId(value: unknown): value is string {
  return typeof value === "string" && COMMERCE_OPAQUE_ID.test(value);
}

/** Identité machine (émetteur ANTSIA, source PRO.GA) : grammaire des slugs d'émetteur ANTSIA. */
const COMMERCE_MACHINE_IDENTITY = /^[a-z][a-z0-9-]{1,63}$/;

export function commerceIsMachineIdentity(value: unknown): value is string {
  return typeof value === "string" && COMMERCE_MACHINE_IDENTITY.test(value);
}

// ─── JSON canonique et octets ────────────────────────────────────────────────

/** Longueur UTF-8 exacte d'une chaîne JavaScript (substitut isolé = U+FFFD, 3 octets). */
export function commerceUtf8ByteLength(value: string): number {
  let bytes = 0;
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code < 0x80) {
      bytes += 1;
    } else if (code < 0x800) {
      bytes += 2;
    } else if (code >= 0xd800 && code <= 0xdbff && index + 1 < value.length) {
      const next = value.charCodeAt(index + 1);
      if (next >= 0xdc00 && next <= 0xdfff) {
        bytes += 4;
        index += 1;
      } else {
        bytes += 3;
      }
    } else {
      bytes += 3;
    }
  }
  return bytes;
}

function canonical(value: unknown, ancestors: Set<object>): string | null {
  if (value === null || typeof value === "boolean" || typeof value === "string") {
    return JSON.stringify(value);
  }
  if (typeof value === "number") return Number.isFinite(value) ? JSON.stringify(value) : null;
  if (typeof value !== "object" || ancestors.has(value)) return null;
  ancestors.add(value);
  try {
    const parts: string[] = [];
    if (Array.isArray(value)) {
      for (const item of value) {
        const part = canonical(item, ancestors);
        if (part === null) return null;
        parts.push(part);
      }
      return `[${parts.join(",")}]`;
    }
    const record = value as Record<string, unknown>;
    for (const key of Object.keys(record).sort()) {
      const part = canonical(record[key], ancestors);
      if (part === null) return null;
      parts.push(`${JSON.stringify(key)}:${part}`);
    }
    return `{${parts.join(",")}}`;
  } finally {
    ancestors.delete(value);
  }
}

/**
 * Forme canonique des deux contrats : clés triées (unités UTF-16), aucun
 * espace, nombres et chaînes sérialisés par `JSON.stringify`. `null` pour une
 * valeur non représentable (`undefined`, nombre non fini, cycle, fonction).
 * Les octets persistés et signés sont exactement l'UTF-8 de cette chaîne.
 */
export function commerceCanonicalJson(value: unknown): string | null {
  return canonical(value, new Set<object>());
}

/** Corps brut : borne d'octets, JSON valide, forme canonique exacte. */
export function commerceParseCanonicalBody(rawBody: string, maxBytes: number): unknown {
  if (typeof rawBody !== "string") commerceReject("invalid_body", "$");
  if (commerceUtf8ByteLength(rawBody) > maxBytes) commerceReject("body_too_large", "$");
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawBody) as unknown;
  } catch {
    commerceReject("invalid_body", "$");
  }
  if (commerceCanonicalJson(parsed) !== rawBody) commerceReject("not_canonical", "$");
  return parsed;
}

/** Clés refusées par la frontière de l'inbox ANTSIA, recopiées pour ne jamais en dépendre. */
export const COMMERCE_TRANSPORT_FORBIDDEN_FIELDS = [
  "_creationTime",
  "_id",
  "__proto__",
  "accessToken",
  "apiKey",
  "authUserId",
  "authorization",
  "constructor",
  "convexId",
  "email",
  "localId",
  "localTable",
  "networkId",
  "password",
  "personId",
  "phone",
  "phoneNumber",
  "privateKey",
  "prototype",
  "refreshToken",
  "secret",
  "sessionId",
  "storageId",
] as const;

/**
 * Parcours borné d'une charge (mêmes bornes que l'inbox ANTSIA) et refus des
 * clés interdites à TOUTE profondeur — « payload imbriqué » compris.
 */
export function commerceScanJson(
  value: unknown,
  forbidden: ReadonlySet<string>,
  path: string,
): void {
  let nodes = 0;
  const visit = (item: unknown, depth: number, at: string): void => {
    nodes += 1;
    if (nodes > COMMERCE_JSON_MAX_NODES || depth > COMMERCE_JSON_MAX_DEPTH) {
      commerceReject("too_complex", at);
    }
    if (item === null || typeof item === "boolean") return;
    if (typeof item === "number") {
      if (!Number.isFinite(item)) commerceReject("invalid_payload", at);
      return;
    }
    if (typeof item === "string") {
      if (item.length > COMMERCE_STRING_MAX_LENGTH) commerceReject("too_complex", at);
      return;
    }
    if (Array.isArray(item)) {
      if (item.length > COMMERCE_JSON_MAX_ITEMS) commerceReject("too_complex", at);
      item.forEach((child, index) => visit(child, depth + 1, `${at}[${index}]`));
      return;
    }
    if (typeof item !== "object") commerceReject("invalid_payload", at);
    const entries = Object.entries(item as Record<string, unknown>);
    if (entries.length > COMMERCE_JSON_MAX_FIELDS) commerceReject("too_complex", at);
    for (const [key, child] of entries) {
      if (forbidden.has(key)) commerceReject("forbidden_field", `${at}.${key}`);
      if (key.length === 0 || key.length > COMMERCE_JSON_MAX_KEY_LENGTH) {
        commerceReject("invalid_payload", `${at}.${key}`);
      }
      visit(child, depth + 1, `${at}.${key}`);
    }
  };
  visit(value, 0, path);
}

// ─── Personnes ───────────────────────────────────────────────────────────────

/*
 * Forme normale des noms civils : COPIE du normaliseur partagé ANTSIA
 * (`packages/social-domain/src/civilName.ts`), dont l'équivalence est testée
 * côté ANTSIA. NOM(S) en capitales, chaque Prénom avec une initiale
 * majuscule, accents, apostrophes et tirets conservés. Jamais appliquée aux
 * organisations, titres, fichiers ni pièces signées.
 */
const GIVEN_NAME_SEPARATORS = /([ \p{Pd}'‘’ʻʼ]+)/u;

function canonicalSpaces(raw: string): string {
  return raw.normalize("NFC").trim().replace(/\s+/gu, " ");
}

function capitalizeSegment(segment: string): string {
  const [initial, ...rest] = Array.from(segment);
  if (initial === undefined) return "";
  const [capital, ...expansion] = Array.from(initial.toLocaleUpperCase("fr"));
  return `${capital ?? ""}${expansion.join("").toLocaleLowerCase("fr")}${rest.join("")}`;
}

export function commerceNormalizeGivenNames(raw: string): string {
  return canonicalSpaces(raw)
    .toLocaleLowerCase("fr")
    .split(GIVEN_NAME_SEPARATORS)
    .map((part, index) => (index % 2 === 0 ? capitalizeSegment(part) : part))
    .join("")
    .normalize("NFC");
}

export function commerceNormalizeFamilyName(raw: string): string {
  return canonicalSpaces(raw).toLocaleUpperCase("fr").normalize("NFC");
}

export type CommerceCivilName = { readonly firstName: string; readonly lastName: string };

/** Nom civil structuré, déjà en forme normale : sinon `invalid_name`, jamais de correction. */
export function commerceCivilName(value: unknown, path: string): CommerceCivilName {
  const record = commerceRecord(value, path, ["firstName", "lastName"]);
  const firstName = commerceText(record.firstName, `${path}.firstName`, 1, 80);
  const lastName = commerceText(record.lastName, `${path}.lastName`, 1, 80);
  if (
    commerceNormalizeGivenNames(firstName) !== firstName ||
    commerceNormalizeFamilyName(lastName) !== lastName
  ) {
    commerceReject("invalid_name", path);
  }
  return { firstName, lastName };
}

// ─── Consentement ────────────────────────────────────────────────────────────

export type CommerceConsent = {
  readonly givenAt: number;
  readonly purpose: string;
  readonly textVersion: string;
};

/** Consentement d'un geste : finalité attendue, version du texte, instant au plus `notAfterMs`. */
export function commerceConsent(
  value: unknown,
  path: string,
  purpose: string,
  notAfterMs: number,
): CommerceConsent {
  const record = commerceRecord(value, path, ["givenAt", "purpose", "textVersion"]);
  const givenAt = commerceInteger(record.givenAt, `${path}.givenAt`, 1, notAfterMs, "invalid_time");
  if (record.purpose !== purpose) commerceReject("invalid_payload", `${path}.purpose`);
  const textVersion = record.textVersion;
  if (typeof textVersion !== "string" || !/^[A-Za-z0-9][A-Za-z0-9._-]{0,39}$/.test(textVersion)) {
    commerceReject("invalid_payload", `${path}.textVersion`);
  }
  return { givenAt, purpose, textVersion };
}
