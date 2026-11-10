/**
 * Exécution d'une étape de publication (EX-01) : une liste d'éléments
 * (commandes externes et actions internes) qui sert À LA FOIS au plan affiché
 * et à l'exécution. Le plan décrit chaque élément avec des marqueurs
 * (`<URL_DEPLOIEMENT>`) pour les valeurs connues seulement en cours de route ;
 * l'exécution remplace les marqueurs par les valeurs réelles et refuse de
 * lancer une commande qui en contiendrait encore un.
 *
 * Élément `command` : `build(state)` → commande ; `accept(result)` (défaut :
 * code 0) ; `retry(result)` (une seule relance) ; `after(result, state)` lit la
 * sortie et applique ses gardes. Élément `action` : `text(state)` pour le plan,
 * `run(state, io)` pour l'exécution (fichiers, requêtes publiques, analyses).
 */
import { formatCommand, outputOf } from "./command.mjs"
import { ReleaseRefusal } from "./targets.mjs"

/** Une étape qui a commencé puis échoué (une commande, un contrôle). */
export class StepFailure extends Error {
  constructor(message, report) {
    super(message)
    this.report = report
  }
}

const PLACEHOLDER = /<[A-Z0-9_]+>/

/** Les lignes du plan d'une liste d'éléments. */
export function describeItems(items, state) {
  return items.map((item) => (item.kind === "command" ? formatCommand(item.build(state)) : `(interne) ${item.text(state)}`))
}

/**
 * Exécute les éléments dans l'ordre. `journal(entry)` reçoit chaque commande
 * lancée (ligne, code, sorties) : le manifeste et le journal hors dépôt la
 * consignent.
 */
export async function runItems(items, state, { run, fetch, journal = () => {} }) {
  for (const item of items) {
    if (item.kind !== "command") {
      await item.run(state, { fetch, run, journal })
      continue
    }
    const spec = item.build(state)
    const line = formatCommand(spec)
    if (PLACEHOLDER.test(line)) throw new StepFailure(`valeur inconnue dans la commande (marqueur restant) : ${line}`)
    let result = run(spec)
    journal({ line, result })
    if (result.status !== 0 && item.retry?.(result)) {
      result = run(spec)
      journal({ line: `${line}   # relance`, result })
    }
    const accepted = item.accept ? item.accept(result) : result.status === 0
    if (!accepted) throw new StepFailure(`${spec.label ?? spec.program} : code ${result.status}${result.error ? ` (${result.error})` : ""} — voir le journal`)
    if (item.after) await item.after(result, state)
  }
}

/** La réponse d'une requête GET publique, bornée, sans suivre les redirections. */
export async function httpGet(fetchImpl, url, { timeoutMs = 20_000 } = {}) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const response = await fetchImpl(url, { redirect: "manual", cache: "no-store", signal: controller.signal })
    const headers = new Map()
    response.headers.forEach((value, name) => headers.set(name.toLowerCase(), value))
    return { status: response.status, headers, body: await response.text() }
  } catch (error) {
    return { status: 0, headers: new Map(), body: "", error: error?.name === "AbortError" ? "délai dépassé" : "injoignable" }
  } finally {
    clearTimeout(timer)
  }
}

export { outputOf, ReleaseRefusal }
