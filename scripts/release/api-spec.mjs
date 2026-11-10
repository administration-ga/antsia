/**
 * Empreinte de l'API d'un moteur Convex (EX-01), à partir de la sortie de
 * `convex function-spec` : identifiant, type, visibilité, arguments et retour
 * de chaque fonction. L'adresse du déploiement (`url`) n'entre jamais dans
 * l'empreinte : deux moteurs qui servent le même code ont la même empreinte.
 *
 * Deux usages :
 * - avant d'envoyer un commit, refuser qu'il RETIRE des fonctions servies en
 *   ligne (elles viendraient d'une publication plus récente que lui) ;
 * - après coup, prouver que le moteur sert l'API du commit publié.
 */
import { createHash } from "node:crypto"

/**
 * Le document JSON d'une sortie de commande : le lanceur `convex-dev.mjs`
 * écrit d'abord sa ligne « [convex-dev] Node … », puis la CLI le JSON.
 */
export function extractJsonDocument(output) {
  const text = String(output ?? "")
  const start = text.search(/^\{/m)
  const end = text.lastIndexOf("}")
  if (start < 0 || end < start) throw new Error("sortie sans document JSON")
  return JSON.parse(text.slice(start, end + 1))
}

/** JSON aux clés triées : une même valeur donne toujours le même texte. */
export function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(",")}}`
  }
  return JSON.stringify(value ?? null)
}

/** La clé d'une entrée : composant, identifiant, et méthode et chemin d'une action HTTP. */
function entryKey(entry) {
  if (entry.functionType === "HttpAction" || (entry.method && entry.path)) return `HTTP ${entry.method ?? "?"} ${entry.path ?? "?"}`
  return `${entry.componentPath ? `${entry.componentPath}/` : ""}${entry.identifier}`
}

/**
 * Les fonctions d'un relevé `function-spec`, par clé. Refuse un document qui
 * n'en est pas un (rien ne serait comparé).
 * @returns {{ url: string | null, entries: Map<string, unknown> }}
 */
export function readFunctionSpec(document) {
  if (!document || typeof document !== "object" || !Array.isArray(document.functions)) throw new Error("relevé function-spec invalide : liste « functions » absente")
  const entries = new Map()
  for (const entry of document.functions) {
    if (!entry || typeof entry !== "object" || (typeof entry.identifier !== "string" && !(entry.method && entry.path))) throw new Error("relevé function-spec invalide : entrée sans identifiant")
    const key = entryKey(entry)
    if (entries.has(key)) throw new Error(`relevé function-spec invalide : entrée en double ${key}`)
    entries.set(key, entry)
  }
  return { url: typeof document.url === "string" ? document.url : null, entries }
}

/** L'empreinte (SHA-256) d'une API, indépendante de l'ordre et de l'adresse du déploiement. */
export function apiFingerprint(document) {
  const { entries } = readFunctionSpec(document)
  const hash = createHash("sha256")
  for (const key of [...entries.keys()].sort()) hash.update(`${key}\0${canonicalJson(entries.get(key))}\n`)
  return hash.digest("hex")
}

/**
 * Écart entre l'API servie en ligne et celle du candidat :
 * - `missing` : servies en ligne, absentes du candidat (l'envoi les RETIRERAIT) ;
 * - `added` : nouvelles dans le candidat ;
 * - `changed` : même clé, signature différente (à relire : un retour modifié
 *   peut casser un site déjà en ligne, piège des projections publiques).
 */
export function compareApi(online, candidate) {
  const left = readFunctionSpec(online).entries
  const right = readFunctionSpec(candidate).entries
  const missing = [...left.keys()].filter((key) => !right.has(key)).sort()
  const added = [...right.keys()].filter((key) => !left.has(key)).sort()
  const changed = [...left.keys()].filter((key) => right.has(key) && canonicalJson(left.get(key)) !== canonicalJson(right.get(key))).sort()
  return { missing, added, changed }
}

/**
 * Les retraits qui bloquent l'envoi. Un retour arrière vers le commit
 * précédent retire, par construction, ce que la publication annulée avait
 * ajouté : ces clés-là seules sont admises (`allowedRemovals`).
 */
export function blockingRemovals(comparison, allowedRemovals = []) {
  const allowed = new Set(allowedRemovals)
  return comparison.missing.filter((key) => !allowed.has(key))
}

/** Un relevé du candidat doit venir d'un backend LOCAL qui sert ce commit, jamais d'un moteur en ligne. */
export function isLocalSpec(document) {
  const { url } = readFunctionSpec(document)
  if (url === null) return false
  try {
    const host = new URL(url).hostname
    return host === "127.0.0.1" || host === "localhost" || host === "[::1]"
  } catch {
    return false
  }
}
