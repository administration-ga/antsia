/**
 * La porte des comptes de démonstration (CH-817) — règles PURES partagées par le moteur
 * (`convex/modules/platform/demoGate*.ts`) et les sites qui l'appellent (DIASPORA.GA).
 *
 * La porte resserre l'accès aux comptes de démonstration du déploiement de démonstration
 * déclaré : une personne dont le numéro est sur la liste reçoit par WhatsApp un code de
 * « 6 chiffres et 1 lettre », l'échange contre une session courte et opaque, puis choisit un
 * acteur. Ce code est celui de la PORTE : le code de connexion (6 chiffres) ne change pas.
 *
 * Rien ici ne lit l'environnement ni la base : formats, constantes, normalisations, tirage.
 */
import { isOtpLocale, type OtpLocale } from "./authentication"

/** Les portées de la porte : une par site servi. La liste des numéros est propre à chacune. */
export const DEMO_GATE_SCOPES = ["diaspora-ga"] as const
export type DemoGateScope = (typeof DEMO_GATE_SCOPES)[number]

export function isDemoGateScope(value: unknown): value is DemoGateScope {
  return typeof value === "string" && (DEMO_GATE_SCOPES as readonly string[]).includes(value)
}

/**
 * Les quatre états de la porte, annoncés par `platform/authentication.configuration` (`demoGate`) :
 * - `closed` : les comptes de démonstration sont fermés ici (production comprise) ;
 * - `open` : comptes ouverts, porte non armée (aucun secret) — le comportement d'avant la porte ;
 * - `unavailable` : porte armée mais incomplète (secret trop court, envoi WhatsApp non configuré) :
 *   personne n'entre ;
 * - `gated` : porte armée et complète — seule une session de porte valide ouvre les comptes.
 */
export const DEMO_GATE_STATES = ["closed", "open", "unavailable", "gated"] as const
export type DemoGateState = (typeof DEMO_GATE_STATES)[number]

/** Les deux routes HTTP de la porte, sur l'origine `.convex.site` du moteur. */
export const DEMO_GATE_PATHS = { request: "/demo-gate/request", verify: "/demo-gate/verify" } as const

/** Les langues du message WhatsApp : celles des interfaces du moteur. */
export type DemoGateLocale = OtpLocale
export const isDemoGateLocale: (value: unknown) => value is DemoGateLocale = isOtpLocale

// ─────────────────────────────────────────────────────────────────────────────
// Code de la porte : 6 chiffres puis 1 lettre
// ─────────────────────────────────────────────────────────────────────────────

/** Les 24 lettres du code : l'alphabet latin sans I ni O (confondus avec 1 et 0). */
export const DEMO_GATE_CODE_LETTERS = "ABCDEFGHJKLMNPQRSTUVWXYZ"
export const DEMO_GATE_CODE_DIGITS = 6
/** Le nombre de codes possibles : 10^6 × 24 = 24 000 000. */
export const DEMO_GATE_CODE_SPACE = 10 ** DEMO_GATE_CODE_DIGITS * DEMO_GATE_CODE_LETTERS.length
/** La forme normalisée d'un code : six chiffres puis une lettre de l'alphabet du code. */
export const DEMO_GATE_CODE_PATTERN = /^\d{6}[A-HJ-NP-Z]$/
/** Essais par défi : au cinquième code erroné, le défi est épuisé. */
export const DEMO_GATE_MAX_ATTEMPTS = 5
/** Durée d'une session de porte : trente minutes, non renouvelable. */
export const DEMO_GATE_SESSION_TTL_SECONDS = 30 * 60
/** Numéros actifs au plus sur la liste d'une portée. */
export const DEMO_GATE_ALLOWLIST_MAX = 20

/** L'identifiant d'un défi : 24 octets aléatoires en base64url (32 caractères). */
export const DEMO_GATE_CHALLENGE_ID_PATTERN = /^[A-Za-z0-9_-]{32}$/
/** Le jeton d'une session : 32 octets aléatoires en base64url (43 caractères). */
export const DEMO_GATE_TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/

/** Une saisie n'est lue que sur cette longueur, avant tout nettoyage. */
const INPUT_MAX_LENGTH = 32
/** Séparateurs admis dans une saisie : blancs (espaces insécables compris), points, tirets (et leurs variantes typographiques). */
const SEPARATORS = /[\s.\-‐‑–]/gu

/**
 * Le code saisi, normalisé (espaces et tirets retirés, majuscules), ou `null` s'il n'a pas la
 * forme « 6 chiffres + 1 lettre ». `482 913 k`, `482-913-K` et `482913K` donnent `482913K`.
 */
export function normalizeDemoGateCode(input: unknown): string | null {
  if (typeof input !== "string" || input.length > INPUT_MAX_LENGTH) return null
  const normalized = input.replace(SEPARATORS, "").toUpperCase()
  return DEMO_GATE_CODE_PATTERN.test(normalized) ? normalized : null
}

/** L'affichage d'un code normalisé : `482 913 K`. Une valeur hors forme est rendue telle quelle. */
export function formatDemoGateCode(code: string): string {
  return DEMO_GATE_CODE_PATTERN.test(code) ? `${code.slice(0, 3)} ${code.slice(3, 6)} ${code.slice(6)}` : code
}

// ─────────────────────────────────────────────────────────────────────────────
// Numéro de téléphone
// ─────────────────────────────────────────────────────────────────────────────

/**
 * La forme E.164 d'un numéro : `+`, un indicatif qui ne commence pas par 0, 8 à 15 chiffres en
 * tout. La MÊME règle que `isE164Phone` du moteur (`convex/betterAuth/settings.ts`) ; un test du
 * moteur vérifie leur accord.
 */
export const DEMO_GATE_PHONE_PATTERN = /^\+[1-9]\d{7,14}$/

/**
 * Le numéro saisi, normalisé en E.164, ou `null`. Séparateurs retirés (blancs, points, tirets),
 * préfixe international `00` changé en `+`. Un numéro national (sans indicatif) est refusé : la
 * porte ne devine aucun pays. Les parenthèses sont refusées (`+33 (0)6…` changerait le numéro).
 */
export function normalizeDemoGatePhone(input: unknown): string | null {
  if (typeof input !== "string" || input.length > INPUT_MAX_LENGTH) return null
  const compact = input.replace(SEPARATORS, "")
  const international = compact.startsWith("00") ? `+${compact.slice(2)}` : compact
  return DEMO_GATE_PHONE_PATTERN.test(international) ? international : null
}

// ─────────────────────────────────────────────────────────────────────────────
// Tirage du code
// ─────────────────────────────────────────────────────────────────────────────

/** Une source d'octets aléatoires (par défaut `crypto.getRandomValues`). */
export type RandomBytes = (length: number) => Uint8Array

const cryptoRandomBytes: RandomBytes = (length) => crypto.getRandomValues(new Uint8Array(length))

/** Au-delà de ce nombre de tirages rejetés de suite, la source est tenue pour défaillante. */
const MAX_REJECTED_DRAWS = 64
const UINT32_RANGE = 0x1_0000_0000

/**
 * Un entier uniforme dans `[0, bound)` par RÉJECTION : on tire 32 bits et on rejette les valeurs
 * au-delà du plus grand multiple de `bound` (`limit`), qui donneraient un biais de modulo. Une
 * source qui ne rend que des valeurs rejetées lève (fermé par défaut, jamais un code biaisé).
 */
export function uniformRandomInt(bound: number, randomBytes: RandomBytes = cryptoRandomBytes): number {
  if (!Number.isInteger(bound) || bound < 1 || bound > UINT32_RANGE) throw new RangeError("demoGateInvalidBound")
  const limit = Math.floor(UINT32_RANGE / bound) * bound
  for (let draw = 0; draw < MAX_REJECTED_DRAWS; draw++) {
    const bytes = randomBytes(4)
    if (bytes.length < 4) break
    const value = (bytes[0]! * 0x100_0000) + (bytes[1]! << 16) + (bytes[2]! << 8) + bytes[3]!
    if (value < limit) return value % bound
  }
  throw new Error("demoGateRandomUnavailable")
}

/**
 * Un code de porte tiré uniformément parmi les 24 000 000 : un seul entier de `[0, 24·10^6)`,
 * dont le reste par 24 choisit la lettre et le quotient les six chiffres. Le moteur le tire dans
 * l'action HTTP (aléa réel), jamais dans une mutation (aléa rejoué).
 */
export function generateDemoGateCode(randomBytes: RandomBytes = cryptoRandomBytes): string {
  const draw = uniformRandomInt(DEMO_GATE_CODE_SPACE, randomBytes)
  const letters = DEMO_GATE_CODE_LETTERS.length
  return `${Math.floor(draw / letters).toString().padStart(DEMO_GATE_CODE_DIGITS, "0")}${DEMO_GATE_CODE_LETTERS[draw % letters]!}`
}

// ─────────────────────────────────────────────────────────────────────────────
// Ce qui passe sur le fil
// ─────────────────────────────────────────────────────────────────────────────

/** `POST /demo-gate/request` : le corps. */
export type DemoGateRequestBody = { scope: DemoGateScope; phone: string; locale: DemoGateLocale }
/** `POST /demo-gate/request` : la réponse 202, IDENTIQUE pour un numéro autorisé, refusé ou limité. */
export type DemoGateRequestAccepted = { ok: true; challengeId: string; expiresInSeconds: number }
/** `POST /demo-gate/verify` : le corps. */
export type DemoGateVerifyBody = { scope: DemoGateScope; challengeId: string; code: string }
/** `POST /demo-gate/verify` : la session ouverte (le jeton se garde dans `sessionStorage`). */
export type DemoGateVerified = { ok: true; token: string; expiresAt: number }

/** Les refus de la porte, sans autre détail. */
export const DEMO_GATE_ERRORS = ["invalid_request", "invalid_or_expired", "rate_limited", "unavailable", "not_found"] as const
export type DemoGateError = (typeof DEMO_GATE_ERRORS)[number]
export type DemoGateRefusal = { ok: false; error: DemoGateError; retryAfterMs?: number }
